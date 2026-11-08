import { projectHubFavorites, type FavoriteProjection } from "./hubFavoritesProjection";
import type { HubFavoritesRecord } from "./hubFavoritesContract";
import { revalidateLocalDataDependencies, subscribeToLocalDataDependencies, type LocalDependencyReceipt } from "../local-data/localDataDependencies";
import { auditRecordedEvent, auditResultId, type AuditFields } from "./runtimeAudit";

type ProjectionState = {
  record?: HubFavoritesRecord;
  rows: FavoriteProjection[];
  loadingIds: ReadonlySet<string>;
  readyIds: ReadonlySet<string>;
  error: string | null;
  acceptedRunId?: string;
};
const emptyIds: ReadonlySet<string> = new Set();
const need = { allIdentities: true, scanInventory: true };
const sameFavorite = (a: FavoriteProjection["favorite"], b: FavoriteProjection["favorite"]) => a === b || JSON.stringify(a) === JSON.stringify(b);
export const pendingFavoriteProjection = (favorite: FavoriteProjection["favorite"]): FavoriteProjection => ({ favorite,
  identity: favorite.referenceIssue === "conflict" ? "conflict" : "unresolved", identityId: null, availability: "unknown" });

/** One volatile current basis per favorites store. The durable subscription stays
 * with the owner across view lifetimes; journals also check reuse and actions.
 * No revision history, persistence, TTL, or identity decisions live here. */
export class HubFavoritesProjectionState {
  private state: ProjectionState = { rows: [], loadingIds: emptyIds, readyIds: emptyIds, error: null };
  private listeners = new Set<() => void>();
  private receipt: LocalDependencyReceipt | undefined;
  private unsubscribe: (() => void) | undefined;
  private generation = 0;
  private pending = false;
  private job: Promise<void> | undefined;
  private context: AuditFields | undefined;
  constructor(private readonly dependencies = {
    project: projectHubFavorites, validate: revalidateLocalDataDependencies, subscribe: subscribeToLocalDataDependencies,
  }) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(state: ProjectionState) { this.state = state; this.listeners.forEach(listener => listener()); }
  private watch() {
    if (this.unsubscribe) return;
    this.unsubscribe = this.dependencies.subscribe(need, cause => {
      if (!this.state.record) return;
      // The single subscription has already proved an actual durable change.
      this.context = { ...this.context, ...cause, trigger: cause?.trigger ?? "dependency-change" };
      this.invalidate();
    }, error => {
      this.generation++;
      this.pending = false;
      this.receipt = undefined;
      this.unsubscribe?.(); this.unsubscribe = undefined;
      this.publish({ ...this.state, error: String(error), readyIds: emptyIds, loadingIds: emptyIds });
    }, { consumer: "shared-favorites-projection" });
  }
  ensure = (record: HubFavoritesRecord, context?: AuditFields) => {
    this.context = context;
    this.watch();
    if (record !== this.state.record) {
      this.generation++;
      const previous = new Map(this.state.rows.map(row => [row.favorite.id, row]));
      const readyIds = new Set<string>();
      const rows = record.favorites.map(favorite => {
        const old = previous.get(favorite.id);
        if (old && sameFavorite(old.favorite, favorite) && this.state.readyIds.has(favorite.id)) {
          readyIds.add(favorite.id);
          return old.favorite === favorite ? old : { ...old, favorite };
        }
        // Preserve the last accepted display, but never its actionable target.
        return old ? { ...old, favorite } : pendingFavoriteProjection(favorite);
      });
      this.publish({ record, rows, readyIds, loadingIds: emptyIds, error: null });
      this.pending = true;
    }
    // Same-basis consumers share both the validity check and the running build.
    if (this.job) return this.job;
    this.pending = true;
    return this.run();
  };
  private invalidate() {
    this.generation++;
    this.pending = true;
    // Accepted cards stay usable while their own evidence is checked. Actions
    // still validate each row's receipt before resolving a target.
    this.publish({ ...this.state, error: null });
    void this.run();
  }
  retry = () => this.state.record ? this.ensure(this.state.record, { trigger: "favorites-projection-retry" }) : Promise.resolve();
  private run(): Promise<void> {
    if (this.job) return this.job;
    this.job = Promise.resolve().then(async () => {
      while (this.pending) {
        this.pending = false;
        const record = this.state.record, generation = this.generation, context = this.context;
        if (!record) continue;
        try {
          const checked = this.receipt ? await this.dependencies.validate(this.receipt) : undefined;
          if (generation !== this.generation) { this.pending = true; continue; }
          const acceptedRows = this.state.rows.filter(row => this.state.readyIds.has(row.favorite.id));
          const validity = checked?.current ? acceptedRows.map(() => true) : await Promise.all(acceptedRows.map(async row =>
            row.dependencies ? (await this.dependencies.validate(row.dependencies)).current : false));
          if (generation !== this.generation) { this.pending = true; continue; }
          const keep = acceptedRows.filter((_, index) => validity[index]);
          const kept = new Map(keep.map(row => [row.favorite.id, row]));
          const missing = record.favorites.filter(favorite => !kept.has(favorite.id));
          if (!missing.length) {
            this.receipt = checked?.receipt;
            // A stable check does not replace the accepted rows or flash busy.
            if (this.state.loadingIds.size || this.state.error) this.publish({ ...this.state, loadingIds: emptyIds, error: null });
            continue;
          }
          this.publish({ ...this.state, loadingIds: new Set(missing.filter(favorite => !this.state.readyIds.has(favorite.id)).map(favorite => favorite.id)), error: null });
          const built = await this.dependencies.project(missing, { ...context, consumer: "shared-favorites-projection", awaitConsumerDecision: true }, record);
          const accepted = generation === this.generation;
          auditRecordedEvent(auditResultId(built), accepted ? "projection-accepted" : "projection-superseded", { ...context, recordRevision: record.recordRevision });
          if (!accepted) { this.pending = true; continue; }
          const projected = new Map(built.map(row => [row.favorite.id, row]));
          const rows = kept.size ? record.favorites.map(favorite => projected.get(favorite.id) ?? kept.get(favorite.id)!) : built;
          const rowReceipt = built[0]?.dependencies;
          // The owner watches the whole collection; each row scopes its own
          // reuse/actions. A foreign first card cannot certify every other card.
          this.receipt = rowReceipt ? { ...rowReceipt, need } : undefined;
          if (!this.receipt) throw Error("Favorite dependency receipt missing");
          this.publish({ record, rows, readyIds: new Set(rows.map(row => row.favorite.id)), loadingIds: emptyIds, error: null, acceptedRunId: auditResultId(built) });
        } catch (error) {
          if (generation !== this.generation) { this.pending = true; continue; }
          if (error instanceof Error && error.message === "Favorite evidence changed") {
            // A concurrent committed source supersedes preparation, not the
            // accepted collection. Recheck row receipts against that new basis.
            this.pending = true;
            continue;
          }
          this.receipt = undefined;
          this.publish({ ...this.state, error: String(error), loadingIds: emptyIds });
        }
      }
    }).finally(() => { this.job = undefined; if (this.pending) void this.run(); });
    return this.job;
  }
  /** Owner/test disposal only; unmounting a consumer does not discard evidence. */
  dispose() { this.generation++; this.pending = false; this.unsubscribe?.(); this.unsubscribe = undefined;
    this.publish({ rows: [], loadingIds: emptyIds, readyIds: emptyIds, error: null });
  }
}
