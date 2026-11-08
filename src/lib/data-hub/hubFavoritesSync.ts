import { AUTH_BASE_URL } from "../auth/config";
import { parseFavoritesDocument, type FavoritesDocument, type FavoriteBatch } from "../../../auth-api/src/lib/favoritesState";
import { hubFavoritesStore, HubFavoritesPersistence } from "./hubFavoritesStore";
import { portableFavorite, portableKey, localPortableFavorite, type FavoritesSyncJournal } from "./hubFavoritesPortable";
import { loadIdentityResolutionSnapshot, revalidateIdentityResolutionSnapshot } from "../identities/identityResolution";
import { resolveFavorite } from "./hubFavoritesProjection";
import type { HubFavorite } from "./hubFavoritesContract";

const endpoint = `${AUTH_BASE_URL || ""}/auth/me/favorites/state`;
export type FavoritesTransport = (accountId: string, batch: FavoriteBatch | null, signal: AbortSignal) => Promise<FavoritesDocument>;
export const favoritesTransport: FavoritesTransport = async (accountId, batch, signal) => {
  const response = await fetch(endpoint, { method: batch ? "PATCH" : "GET", credentials: "include", signal,
    headers: { "Accept": "application/json", "X-SFDataHub-Account": accountId, ...(batch ? { "Content-Type": "application/json" } : {}) },
    ...(batch ? { body: JSON.stringify(batch) } : {}) });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Favorites synchronization failed");
  if (body.accountId !== accountId) throw Error("Favorites account changed");
  return parseFavoritesDocument(body.state);
};
type SyncState = { accountId: string | null; error: string | null; busy: boolean };
const hasPending = (j: FavoritesSyncJournal) => j.pending.changes.length > 0 || j.pending.order !== undefined;

/** One read per actual account transition. No focus, menu, route, token or tab read triggers. */
export class HubFavoritesSync {
  private state: SyncState = { accountId: null, error: null, busy: false };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private controller = new AbortController();
  private job?: Promise<void>;
  private loaded = false;
  private readJob?: Promise<FavoritesDocument>;
  private loadJob?: Promise<void>;
  private applying = false;
  private timer?: ReturnType<typeof setTimeout>;
  private transition = Promise.resolve();
  private watching = false;
  constructor(private transport: FavoritesTransport = favoritesTransport, private store = hubFavoritesStore) {
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: Partial<SyncState>) { this.state = { ...this.state, ...value }; for (const listener of this.listeners) listener(); }
  setAccount = (accountId: string | null): Promise<void> => {
    if (!this.watching) { this.watching = true; this.store.subscribe(() => { if (!this.applying && this.loaded && this.state.accountId && !this.state.error) this.schedule(); }); }
    if (this.state.accountId === accountId) return this.job ?? this.transition;
    const epoch = ++this.epoch;
    this.controller.abort(); this.controller = new AbortController();
    clearTimeout(this.timer); this.loaded = false; this.job = undefined; this.readJob = undefined; this.loadJob = undefined;
    this.publish({ accountId, error: null, busy: !!accountId });
    this.transition = this.transition.catch(() => {}).then(async () => {
      if (epoch !== this.epoch) return;
      await this.store.setScope(accountId ?? "guest");
      if (epoch !== this.epoch || !accountId) return;
      await this.load(epoch, accountId);
    });
    return this.transition;
  };
  private async hydrate(doc: FavoritesDocument, epoch: number, options: {
    ack?: FavoriteBatch; additions?: FavoriteBatch["changes"]; guestImports?: Record<string, string>; retained?: readonly HubFavorite[];
  } = {}) {
    if (epoch !== this.epoch || !this.state.accountId) return;
    const scope = this.state.accountId;
    this.applying = true;
    try { await this.store.synchronize({ type: "cloud", document: doc, ...options }, scope); }
    finally { this.applying = false; }
  }
  private load(epoch: number, accountId: string): Promise<void> {
    if (this.loadJob) return this.loadJob;
    const job = this.performLoad(epoch, accountId).finally(() => { if (this.loadJob === job) this.loadJob = undefined; });
    return this.loadJob = job;
  }
  private async performLoad(epoch: number, accountId: string) {
    try {
      const doc = await (this.readJob ??= this.transport(accountId, null, this.controller.signal).catch(error => {
        if (epoch === this.epoch) this.readJob = undefined;
        throw error;
      }));
      if (epoch !== this.epoch) return;
      const journal = await this.store.syncJournal();
      const originalChanges = new Map(journal.pending.changes.map(c => [c.key, JSON.stringify(c)]));
      const guest = await new HubFavoritesPersistence().restore();
      const identities = await loadIdentityResolutionSnapshot();
      if (epoch !== this.epoch) return;
      // Dedupe aliases only when the current device independently confirms them.
      const identity = (f: HubFavorite) => { const r = resolveFavorite(f, identities); return r.identity === "resolved" ? `${f.kind}:${r.identityId}` : null; };
      const cloud = doc.order.map(key => localPortableFavorite(doc.entries.find(e => e.key === key)!.value!, 0));
      const confirmed = new Map<string, HubFavorite>();
      for (const favorite of cloud) {
        const id = identity(favorite);
        if (!id) continue;
        const primary = confirmed.get(id);
        if (!primary) { confirmed.set(id, favorite); continue; }
        const key = portableKey(favorite), primaryKey = portableKey(primary);
        const entry = doc.entries.find(e => e.key === key)!;
        if (!journal.pending.changes.some(c => c.key === key)) journal.pending.changes.push({ key, value: null, intent: "remove", baseRevision: entry.revision });
        if ((favorite.display.observedAtMs ?? 0) > (primary.display.observedAtMs ?? 0) && !journal.pending.changes.some(c => c.key === primaryKey)) {
          const value = portableFavorite(primary);
          journal.pending.changes.push({ key: primaryKey, value: { ...value, display: portableFavorite(favorite).display }, intent: "display", baseRevision: doc.entries.find(e => e.key === primaryKey)!.revision });
        }
      }
      for (const favorite of guest.record.favorites) {
        const value = portableFavorite(favorite), fingerprint = JSON.stringify(value), id = identity(favorite);
        if (journal.guestImports[value.key] === fingerprint) continue;
        journal.guestImports[value.key] = fingerprint;
        const matching = cloud.find(f => portableKey(f) === value.key || id && identity(f) === id);
        const key = matching ? portableKey(matching) : value.key;
        const existing = doc.entries.find(e => e.key === key);
        if (existing && !existing.value || journal.pending.changes.some(c => c.key === key && c.intent === "remove")) continue;
        if (existing?.value && (existing.value.display.observedAtMs ?? 0) >= (value.display.observedAtMs ?? 0)) continue;
        if (!journal.pending.changes.some(c => c.key === key)) journal.pending.changes.push({ key, baseRevision: existing?.revision ?? 0, value: { ...value, key }, intent: existing?.value ? "display" : "add" });
      }
      if (epoch !== this.epoch) return;
      if (await revalidateIdentityResolutionSnapshot(identities) !== identities) throw Error("Favorite identity evidence changed; retry synchronization");
      await this.hydrate(doc, epoch, { additions: journal.pending.changes.filter(c => originalChanges.get(c.key) !== JSON.stringify(c)),
        guestImports: journal.guestImports, retained: guest.record.favorites });
      if (epoch !== this.epoch) return;
      this.loaded = true; this.publish({ busy: false, error: null });
      this.schedule();
    } catch (error) { if (epoch === this.epoch) this.publish({ busy: false, error: String(error) }); }
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 350); }
  flush = (retry = false): Promise<void> => {
    if (this.job) return this.job;
    const accountId = this.state.accountId, epoch = this.epoch;
    if (!accountId || !this.loaded || this.state.error && !retry) return Promise.resolve();
    this.job = (async () => {
      try {
        const journal = await this.store.syncJournal();
        if (epoch !== this.epoch) return;
        if (!hasPending(journal)) {
          if (retry) this.publish({ busy: false, ...(!journal.orderConflict ? { error: null } : {}) });
          return;
        }
        const batch = structuredClone(journal.pending);
        this.publish({ busy: true });
        const doc = await this.transport(accountId, batch, this.controller.signal);
        if (epoch !== this.epoch) return;
        await this.hydrate(doc, epoch, { ack: batch });
        if (epoch !== this.epoch) return;
        const latest = await this.store.syncJournal();
        if (epoch !== this.epoch) return;
        this.publish({ error: latest.orderConflict ? "Favorite order changed in another session; retry to save your order" : null, busy: false });
        // Only new changes accepted while this request was running get a subsequent batch.
        if (!latest.orderConflict && hasPending(latest)) this.schedule();
      } catch (error) { if (epoch === this.epoch) this.publish({ busy: false, error: String(error) }); }
    })().finally(() => { if (epoch === this.epoch) this.job = undefined; });
    return this.job;
  };
  retry = async () => {
    const accountId = this.state.accountId;
    if (!accountId) return;
    this.publish({ busy: true });
    // Explicit retry is the only extra read path after a failed initial read.
    if (!this.loaded) await this.load(this.epoch, accountId); else await this.flush(true);
  };
}
export const hubFavoritesSync = new HubFavoritesSync();
