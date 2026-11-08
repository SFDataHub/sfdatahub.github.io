import { assertFavoritesBudget } from "../../../auth-api/src/lib/favoritesState";
import { emptySyncJournal, journalFavoriteChange, portableFavorite, reconcileCloudFavorites, type CloudFavoriteOperation, type FavoritesSyncJournal } from "./hubFavoritesPortable";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditEvent, auditCount, auditAssociate, auditCurrent, auditEnabled, auditDetailsStatus, type AuditRun } from "./runtimeAudit";
import { HubFavoritesProjectionState } from "./hubFavoritesProjectionState";
import { listPlayerEntities } from "../identities/playerIdentityStore";
import { listGuildEntities } from "../identities/guildIdentityStore";
import { buildPlayerIdentityResolutionIndex, buildGuildIdentityResolutionIndex, resolvePlayerIdentity, resolveGuildIdentity } from "../identities/identityResolution";
import { getHubStateDb } from "./hubStateDb";
import { favoriteReference, guildFavorite, guildSelection, migrateGuildFavorites, object, referenceKey,
  type HubFavorite, type HubFavoritesRecord, type HubFavoritesSnapshot, type HubGuildCompatibility } from "./hubFavoritesContract";
import { withLocalDataWrite, type LocalDataWriteLease } from "../local-data/localDataCoordination";
import { W158_FIXTURE_FAVORITES } from "../guilds/w158FixtureEvidence";
import type { GuildHubSelectionState } from "../guilds/localScanLibrary";

export const FAVORITES_KEY = "hub-favorites";
export const FAVORITES_MIGRATION_KEY = "migration.hubFavorites.v1";
export const GUILD_COMPATIBILITY_KEY = "guild-selection-compatibility";

/** Internal, closed W158 migration step. Source proof and the common writer
 * lease are supplied by the source owner; normal favorite validation is reused. */
export async function removeW158FixtureFavorites(lease: LocalDataWriteLease) {
  return withLocalDataWrite(async () => {
    const db = await getHubStateDb();
    const original = await db.get("state", FAVORITES_KEY);
    if (!original) return { removed: [] as string[], conflicts: [] as string[] };
    const record = original.value as HubFavoritesRecord;
    const removed: string[] = [], conflicts: string[] = [];
    for (const evidence of W158_FIXTURE_FAVORITES) {
      const favorite = record.favorites.find(f => f.id === evidence.id);
      if (!favorite) continue;
      const bytes = new TextEncoder().encode(JSON.stringify({ ...favorite, order: 0, recordRevision: 0 }));
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(n => n.toString(16).padStart(2, "0")).join("");
      (hash === evidence.hash ? removed : conflicts).push(evidence.id);
    }
    if (!removed.length) return { removed, conflicts };
    const tx = db.transaction("state", "readwrite");
    try {
      const [latest, compatibility] = await Promise.all([tx.store.get(FAVORITES_KEY), tx.store.get(GUILD_COMPATIBILITY_KEY)]);
      if (JSON.stringify(latest) !== JSON.stringify(original)) throw Error("W158 favorite changed before cleanup");
      let snapshot = validate(latest?.value, compatibility?.value);
      for (const id of removed) snapshot = applyFavoriteOperation(snapshot, { type: "remove", id }, snapshot.record.recordRevision);
      await tx.store.put({ key: FAVORITES_KEY, value: snapshot.record, updatedAt: new Date().toISOString() });
      await tx.done;
    } catch (error) { try { tx.abort(); } catch { /* inactive */ } await tx.done.catch(() => {}); throw error; }
    // Refresh mounted consumers after the migration's coordinated commit.
    void hubFavoritesStore.refresh("w158-cleanup");
    if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(CHANNEL); channel.postMessage({ reason: "w158-cleanup" }); channel.close(); }
    return { removed, conflicts };
  }, { lease });
}
/** Read-only integrity receipt; contains no favorite records or decisions. */
export async function hashHubFavoriteRecords() {
  const db = await getHubStateDb();
  const tx = db.transaction("state");
  const records = await Promise.all([tx.store.get(FAVORITES_KEY), tx.store.get(GUILD_COMPATIBILITY_KEY)]);
  await tx.done;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(records))))).map(n => n.toString(16).padStart(2, "0")).join("");
}
const CHANNEL = "sfdatahub:hub-favorites:v1";

// Only compact evidence attached weakly to the actual accepted record. A restore
// check is historical context, not a notification or a new consumer trigger.
type FavoritesRecordAudit = { originId?: string; restoreId?: string; notificationId?: string;
  recordReferenceChanged?: boolean; recordRevisionChanged?: boolean; recordValueChanged?: boolean;
  sameRevisionValueChanged?: boolean };
const recordAudit = new WeakMap<HubFavoritesRecord, FavoritesRecordAudit>();
export function hubFavoritesRecordAudit(record: HubFavoritesRecord) {
  const evidence = auditEnabled() ? recordAudit.get(record) : undefined;
  return { ...evidence, originDetails: auditDetailsStatus(evidence?.originId),
    restoreDetails: auditDetailsStatus(evidence?.restoreId), notificationDetails: auditDetailsStatus(evidence?.notificationId) };
}

export type FavoriteOperation =
  | CloudFavoriteOperation
  | { type: "sync"; favorites: HubFavorite[]; journal: FavoritesSyncJournal }
  | { type: "save"; favorite: HubFavorite; activateGuild?: boolean }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; direction: -1 | 1; withinKind?: HubFavorite["kind"] }
  | { type: "selectGuild"; id: string }
  | { type: "removeGuild"; id: string }
  | { type: "reorderGuild"; id: string; targetIndex: number }
  | { type: "replaceGuilds"; state: GuildHubSelectionState };

function validate(record: unknown, compatibility: unknown): HubFavoritesSnapshot {
  if (!object(record) || record.schemaVersion !== 1 || !Number.isSafeInteger(record.recordRevision) || Number(record.recordRevision) < 1 || !Array.isArray(record.favorites) ||
    !object(compatibility) || compatibility.schemaVersion !== 1 || !Number.isSafeInteger(compatibility.recordRevision) || Number(compatibility.recordRevision) < 1 ||
    !(compatibility.activeGuildId === null || typeof compatibility.activeGuildId === "string")) throw Error("Invalid local favorites schema; restore stopped.");
  const ids = new Set<string>();
  for (const [index, f] of record.favorites.entries()) {
    const guild = object(f) ? f.guild : null;
    const refValid = (ref: unknown) => {
      if (!object(ref) || typeof ref.identifier !== "string" || typeof ref.serverNamespace !== "string" || typeof ref.entityId !== "string") return false;
      const parsed = favoriteReference(f.kind, ref.identifier);
      return !!parsed && parsed.serverNamespace === ref.serverNamespace && parsed.entityId === ref.entityId;
    };
    if (!object(f) || typeof f.id !== "string" || !f.id || ids.has(f.id) || !["guild", "player"].includes(String(f.kind)) ||
      f.order !== index || !Number.isSafeInteger(f.recordRevision) || Number(f.recordRevision) < 1 || !object(f.display) ||
      !(f.display.name === null || typeof f.display.name === "string") || !(f.display.server === null || typeof f.display.server === "string") ||
      !(f.display.observedAtMs === null || typeof f.display.observedAtMs === "number") ||
      !(f.reference === null || refValid(f.reference)) || !Array.isArray(f.originalReferences) || !f.originalReferences.every(refValid) ||
      !(f.referenceIssue === null || f.referenceIssue === "incomplete" || f.referenceIssue === "conflict") ||
      !(f.identityHint === null || typeof f.identityHint === "string") || (f.kind === "guild" && (!object(guild) || ["id", "guildId", "name", "server", "logoIdentifier"].some(key => typeof guild[key] !== "string")))) throw Error("Damaged local favorite; restore stopped.");
    ids.add(f.id);
  }
  return { record: record as HubFavoritesRecord, compatibility: compatibility as HubGuildCompatibility };
}

function validateMigrationMarker(value: unknown) {
  if (!object(value) || value.schemaVersion !== 1 || value.sourceKey !== "guild-selection" || value.recordRevision !== 1) throw Error("Damaged migration marker.");
}

export function applyFavoriteOperation(before: HubFavoritesSnapshot, operation: FavoriteOperation, expectedRevision: number): HubFavoritesSnapshot {
  const next = structuredClone(before);
  let favorites = next.record.favorites;
  const findGuild = (id: string) => favorites.find(f => f.kind === "guild" && f.guild?.id === id);
  const guildSlots = () => favorites.flatMap((f, i) => f.kind === "guild" ? [i] : []);
  // Guild reorder fills the existing guild positions. Player positions and their
  // relative order stay fixed. General dashboard moves swap adjacent entities.
  const fillGuildSlots = (guilds: HubFavorite[]) => {
    const slots = guildSlots(); slots.forEach((slot, index) => { favorites[slot] = guilds[index]; });
  };
  if (operation.type === "cloud") throw Error("Cloud reconciliation requires the local writer transaction");
  if (operation.type === "sync") {
    if (expectedRevision !== before.record.recordRevision) throw Error("Favorites changed while synchronizing; retry required.");
    favorites = structuredClone(operation.favorites);
  } else if (operation.type === "replaceGuilds") {
    if (expectedRevision !== before.record.recordRevision || operation.state.compatibilityRevision !== before.compatibility.recordRevision) {
      throw Error("Guild selection changed in another tab. Reload before replacing it.");
    }
    const guilds = operation.state.selectedGuilds.map((guild, i) => {
      const existing = findGuild(guild.id);
      return existing ?? guildFavorite(guild, i, null, false);
    });
    if (new Set(guilds.map(f => f.id)).size !== guilds.length) throw Error("Duplicate guild replacement IDs.");
    // Replace only guild positions, preserving every player and player order.
    let index = 0;
    favorites = favorites.flatMap(f => f.kind === "player" ? [f] : index < guilds.length ? [guilds[index++]] : []);
    favorites.push(...guilds.slice(index));
    if (operation.state.activeGuildId !== before.compatibility.activeGuildId) throw Error("Global active guild selection is read-only.");
  } else if (operation.type === "save") {
    const candidate = structuredClone(operation.favorite);
    const ref = candidate.reference;
    if (!ref || candidate.referenceIssue || !favoriteReference(candidate.kind, ref.identifier) ||
      referenceKey(favoriteReference(candidate.kind, ref.identifier)!) !== referenceKey(ref)) throw Error("An unambiguous original reference is required.");
    // Explicit saves dedupe by entity kind + original namespace/ID only. Legacy
    // duplicates remain separate records and retain their original metadata.
    const existing = favorites.find(f => f.kind === candidate.kind && !f.referenceIssue && f.originalReferences.some(original => candidate.originalReferences.some(candidateRef => referenceKey(original) === referenceKey(candidateRef))));
    if (!existing) {
      if (favorites.some(f => f.id === candidate.id)) throw Error("Favorite ID collision.");
      favorites.push(candidate);
    }
    if (operation.activateGuild) throw Error("Global active guild selection is read-only; use a page context.");
  } else if (operation.type === "selectGuild") {
    throw Error("Global active guild selection is read-only; use a page context.");
  } else if (operation.type === "remove" || operation.type === "removeGuild") {
    const id = operation.type === "remove" ? operation.id : findGuild(operation.id)?.id;
    favorites = favorites.filter(f => f.id !== id);
  } else if (operation.type === "move") {
    const index = favorites.findIndex(f => f.id === operation.id);
    let target = index + operation.direction;
    // A filtered overview moves between its own slots in one existing mutation.
    if (operation.withinKind) {
      while (target >= 0 && target < favorites.length && favorites[target].kind !== operation.withinKind) target += operation.direction;
    }
    if (index >= 0 && target >= 0 && target < favorites.length) [favorites[index], favorites[target]] = [favorites[target], favorites[index]];
  } else if (operation.type === "reorderGuild") {
    const guilds = favorites.filter(f => f.kind === "guild"), index = guilds.findIndex(f => f.guild?.id === operation.id);
    if (index < 0) throw Error("Guild is no longer saved.");
    const target = Math.max(0, Math.min(operation.targetIndex, guilds.length));
    const [moved] = guilds.splice(index, 1); guilds.splice(index < target ? target - 1 : target, 0, moved);
    fillGuildSlots(guilds);
  }
  next.record.favorites = favorites;
  favorites.forEach((f, order) => { if (f.order !== order && before.record.favorites.some(old => old.id === f.id)) f.recordRevision++; f.order = order; });
  if (JSON.stringify(next.record.favorites) !== JSON.stringify(before.record.favorites)) next.record.recordRevision++;
  const portable = favorites.map(portableFavorite);
  assertFavoritesBudget({ schemaVersion: 1, revision: 0, orderRevision: 0, order: portable.map(f => f.key), entries: portable.map(value => ({ key: value.key, revision: 0, value })) });
  return validate(next.record, next.compatibility);
}

export class HubFavoritesPersistence {
  constructor(private readonly database = getHubStateDb,
    private readonly beforeCommit?: (transaction: { abort(): void }, reason: "migration" | "mutation") => void,
    readonly scope = "guest") {}
  private key(key: string) { return this.scope === "guest" ? key : `${key}:account:${this.scope}`; }
  async syncJournal(): Promise<FavoritesSyncJournal> { return (await (await this.database()).get("state", this.key("hub-favorites-sync")))?.value as FavoritesSyncJournal ?? emptySyncJournal(); }
  async restore(): Promise<HubFavoritesSnapshot> {
    const __audit1 = auditPhaseBegin("restore", undefined, "async-container");
    try {
    const db = await (auditValue(__audit1, auditEnter(__audit1, "this.database"), (this.database())));
    return auditReturn(__audit1, withLocalDataWrite(async () => {
      const tx = db.transaction("state", "readwrite");
      try {
        auditCount(__audit1, "persistenceStateReads");
        const marker = await tx.store.get(this.key(FAVORITES_MIGRATION_KEY));
        if (marker) {
          validateMigrationMarker(marker.value);
          auditCount(__audit1, "persistenceStateReads", 2);
          const [record, compatibility] = await Promise.all([tx.store.get(this.key(FAVORITES_KEY)), tx.store.get(this.key(GUILD_COMPATIBILITY_KEY))]);
          const snapshot = validate(record?.value, compatibility?.value); await tx.done; return snapshot;
        }
        auditCount(__audit1, "persistenceStateReads");
        if (await tx.store.get(this.key(FAVORITES_KEY))) throw Error("Favorites without a migration marker; restore stopped.");
        auditCount(__audit1, "persistenceStateReads");
        const legacy = this.scope === "guest" ? await tx.store.get("guild-selection") : undefined;
        if (legacy && !object(legacy.value)) throw Error("Damaged guild-selection record.");
        const snapshot = migrateGuildFavorites(legacy?.value, legacy?.updatedAt ?? null);
        const updatedAt = new Date().toISOString();
        auditCount(__audit1, "migrationWrites", 3);
        await tx.store.put({ key: this.key(FAVORITES_KEY), value: snapshot.record, updatedAt });
        await tx.store.put({ key: this.key(GUILD_COMPATIBILITY_KEY), value: snapshot.compatibility, updatedAt });
        await tx.store.put({ key: this.key(FAVORITES_MIGRATION_KEY), value: { schemaVersion: 1, sourceKey: "guild-selection", recordRevision: 1 }, updatedAt });
        this.beforeCommit?.(tx, "migration");
        await tx.done; return snapshot;
      } catch (error) { try { tx.abort(); } catch { /* already completed */ } await tx.done.catch(() => {}); throw error; }
    }));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
  async mutate(operation: FavoriteOperation, expectedRevision: number): Promise<HubFavoritesSnapshot> {
    const __audit2 = auditPhaseBegin("mutate", undefined, "async-container");
    try {
    const db = await (auditValue(__audit2, auditEnter(__audit2, "this.database"), (this.database())));
    return auditReturn(__audit2, withLocalDataWrite(async () => {
      // Identity stores are separate databases. The W-04 lease serializes their
      // commits with this read; only the hubstate records share a transaction.
      if (operation.type === "save" && operation.favorite.reference) {
        const favorite = structuredClone(operation.favorite);
        const resolution = favorite.kind === "player"
          ? resolvePlayerIdentity(buildPlayerIdentityResolutionIndex(await listPlayerEntities()), favorite.reference!.identifier)
          : resolveGuildIdentity(buildGuildIdentityResolutionIndex(await listGuildEntities()), favorite.reference!.identifier);
        if (resolution.resolved) {
          favorite.identityHint = resolution.identityId;
          favorite.originalReferences = [...new Map([...favorite.originalReferences, ...resolution.aliasIdentifiers.map(id => favoriteReference(favorite.kind, id)).filter(ref => !!ref)].map(ref => [ref.identifier.toLowerCase(), ref])).values()];
          if (!favorite.originalReferences.some(ref => ref.identifier === favorite.reference!.identifier)) favorite.originalReferences.unshift(favorite.reference!);
        }
        operation = { ...operation, favorite };
      }
      const tx = db.transaction("state", "readwrite");
      try {
        const [record, compatibility, marker] = await Promise.all([tx.store.get(this.key(FAVORITES_KEY)), tx.store.get(this.key(GUILD_COMPATIBILITY_KEY)), tx.store.get(this.key(FAVORITES_MIGRATION_KEY))]);
        if (!marker) throw Error("Restore must finish before managing favorites.");
        validateMigrationMarker(marker.value);
        const before = validate(record?.value, compatibility?.value);
        // Rebase concrete operations on the just-read committed revision inside
        // W-04's origin-wide lease. Full replacement requires exact revisions.
        let revision = expectedRevision;
        if (operation.type === "cloud") {
          const journal = (await tx.store.get(this.key("hub-favorites-sync")))?.value as FavoritesSyncJournal ?? emptySyncJournal();
          const reconciled = reconcileCloudFavorites(before.record.favorites, journal, operation);
          operation = { type: "sync", ...reconciled };
          revision = before.record.recordRevision;
        }
        const next = applyFavoriteOperation(before, operation, revision);
        if (this.scope !== "guest" && (operation.type === "sync" || next.record.recordRevision !== before.record.recordRevision)) {
          const syncKey = this.key("hub-favorites-sync");
          const journal = (await tx.store.get(syncKey))?.value as FavoritesSyncJournal ?? emptySyncJournal();
          const value = operation.type === "sync" ? operation.journal : journalFavoriteChange(journal, before.record.favorites, next.record.favorites);
          await tx.store.put({ key: syncKey, value, updatedAt: new Date().toISOString() });
        }
        const updatedAt = new Date().toISOString();
        if (next.record.recordRevision !== before.record.recordRevision) await tx.store.put({ key: this.key(FAVORITES_KEY), value: next.record, updatedAt });
        this.beforeCommit?.(tx, "mutation"); await tx.done; return next;
      } catch (error) { try { tx.abort(); } catch { /* already completed */ } await tx.done.catch(() => {}); throw error; }
    }));

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}
}

export type FavoritesState = { snapshot: HubFavoritesSnapshot | null; status: "restoring" | "ready" | "saving" | "error"; error: string | null; operation?: FavoriteOperation };

// Compare the complete persisted value, including optional display/observation
// metadata. Revisions alone cannot prove equality for repaired legacy records.
// Non-plain legacy values are conservatively treated as changed.
function samePersistedValue(left: unknown, right: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  if (!Array.isArray(left) && (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype)) return false;
  if (seen.has(left)) return seen.get(left) === right;
  seen.set(left, right);
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) &&
    samePersistedValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], seen));
}
export class HubFavoritesStore {
  readonly projection = new HubFavoritesProjectionState();
  private state: FavoritesState = { snapshot: null, status: "restoring", error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private pending = 0;
  private retryOperation: FavoriteOperation | undefined;
  private channel: BroadcastChannel | undefined;
  private refreshJob: Promise<void> | undefined;
  private refreshAgain = false;
  private refreshAudit: AuditRun | null = null;
  private refreshTrigger = "explicit-refresh";
  constructor(private persistence = new HubFavoritesPersistence()) {}
  scope = "guest";
  setScope = async (scope: string) => {
    if (scope === this.scope) { if (!this.state.snapshot) await (this.refreshJob ?? this.refresh("scope-ready")); return; }
    this.scope = scope; this.generation++; this.pending = 0; this.retryOperation = undefined;
    this.persistence = new HubFavoritesPersistence(undefined, undefined, scope);
    this.projection.dispose();
    this.publish({ snapshot: null, status: "restoring", error: null });
    await this.refresh("account-scope");
  };
  syncJournal = () => this.persistence.syncJournal();
  synchronize = async (operation: CloudFavoriteOperation, scope: string) => {
    if (this.scope !== scope) throw Error("Favorites account changed");
    if (this.state.status !== "ready") await new Promise<void>((resolve, reject) => {
      let stop: (() => void) | undefined;
      const finish = (error?: Error) => { clearTimeout(timer); stop?.(); error ? reject(error) : resolve(); };
      const check = () => {
        if (this.scope !== scope) finish(Error("Favorites account changed"));
        else if (this.state.status === "error") finish(Error(this.state.error ?? "Local favorites failed"));
        else if (this.state.status === "ready") finish();
      };
      const timer = setTimeout(() => finish(Error("Local favorites are busy; retry synchronization")), 15000);
      stop = this.subscribe(check); check();
    });
    if (this.scope !== scope || !await this.mutate(operation)) throw Error("Local synchronization commit failed");
  };
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      if (typeof window !== "undefined") {
        if (typeof BroadcastChannel !== "undefined") { try { this.channel = new BroadcastChannel(CHANNEL); this.channel.onmessage = () => { void this.refresh("favorites-broadcast"); }; } catch { this.channel = undefined; } }
      }
      if (!this.state.snapshot && !this.refreshJob) void this.refresh("first-subscriber");
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.channel?.close(); this.channel = undefined;
      }
    };
  };
  private publish(state: FavoritesState, audit = this.refreshAudit ?? auditCurrent()) { if (state.snapshot === this.state.snapshot && state.status === this.state.status && state.error === this.state.error && state.operation === this.state.operation) return;
    const record = state.snapshot?.record, recordChanged = record !== this.state.snapshot?.record;
    auditAssociate(audit, state); auditCount(audit, "storeNotifications"); auditEvent(audit, "store-notification", { subscribers: this.listeners.size, status: state.status,
      notificationKind: recordChanged ? "record-change" : "state-only", recordReferenceChanged: recordChanged, delivered: this.listeners.size > 0 });
    if (audit?.record && record && recordChanged && this.listeners.size > 0) recordAudit.set(record, { ...recordAudit.get(record), notificationId: audit.id });
    this.state = state; this.listeners.forEach(listener => listener()); }
  private accept(snapshot: HubFavoritesSnapshot, state: Partial<FavoritesState> = {}, audit = this.refreshAudit ?? auditCurrent()) {
    const old = this.state.snapshot;
    if (old && (snapshot.record.recordRevision < old.record.recordRevision || snapshot.compatibility.recordRevision < old.compatibility.recordRevision)) {
      this.publish({ ...this.state, ...state }, audit); return;
    }
    const record = old && samePersistedValue(old.record, snapshot.record) ? old.record : structuredClone(snapshot.record);
    const compatibility = old && samePersistedValue(old.compatibility, snapshot.compatibility) ? old.compatibility : structuredClone(snapshot.compatibility);
    const accepted = old?.record === record && old.compatibility === compatibility ? old : { record, compatibility };
    if (audit?.record && record !== old?.record) recordAudit.set(record, { originId: audit.id,
      recordReferenceChanged: !!old, recordRevisionChanged: !!old && old.record.recordRevision !== record.recordRevision,
      recordValueChanged: !!old, sameRevisionValueChanged: !!old && old.record.recordRevision === record.recordRevision });
    this.publish({ ...this.state, ...state, snapshot: accepted }, audit);
  }
  refresh = (trigger = "explicit-refresh"): Promise<void> => {
    this.refreshTrigger = trigger;
    this.refreshAgain = true;
    if (this.refreshJob) {
      auditEvent(this.refreshAudit, "refresh-request", { trigger, consumer: "hub-favorites-store", queued: true, physicalJobShared: true });
      return this.refreshJob;
    }
    this.refreshJob = (async () => {
    const __audit3 = auditBegin("F01", this.state.snapshot ? "refresh" : "@callback");
    this.refreshAudit = __audit3;
    auditFields(__audit3, { trigger, consumer: "hub-favorites-store", startBoundary: "refresh-call", subscribers: this.listeners.size });
    auditEvent(__audit3, "refresh-request", { trigger, queued: false, physicalJobShared: false });
    try {
      while (this.refreshAgain) {
        const iterationTrigger = this.refreshTrigger;
        this.refreshAgain = false;
        auditCount(__audit3, "persistenceRestoreCalls");
        auditEvent(__audit3, "persistence-restore-request", { trigger: iterationTrigger, consumer: "hub-favorites-store", previousRecordRevision: this.state.snapshot?.record.recordRevision, previousCompatibilityRevision: this.state.snapshot?.compatibility.recordRevision });
        const generation = this.generation;
        try {
          const snapshot = await (auditValue(__audit3, auditEnter(__audit3, "this.persistence.restore"), (this.persistence.restore())));
          if (generation !== this.generation) continue;
          const previous = this.state.snapshot;
          this.accept(snapshot, !this.pending && !this.retryOperation ? { status: "ready", error: null, operation: undefined } : {}, __audit3);
          const record = this.state.snapshot?.record;
          if (__audit3?.record && record) recordAudit.set(record, { ...recordAudit.get(record), restoreId: __audit3.id });
          auditFields(__audit3, { recordReferenceChanged: previous?.record !== record,
            recordRevisionChanged: previous?.record.recordRevision !== record?.recordRevision,
            recordValueChanged: previous?.record !== record });
          auditEvent(__audit3, "favorites-snapshot-accepted", { trigger: iterationTrigger, recordRevision: snapshot.record.recordRevision,
            compatibilityRevision: snapshot.compatibility.recordRevision, favorites: snapshot.record.favorites.length,
            recordRevisionChanged: previous?.record.recordRevision !== snapshot.record.recordRevision,
            recordObjectReplaced: previous?.record !== this.state.snapshot?.record });
        } catch (error) { auditError(__audit3, error);
          if (generation === this.generation && !this.pending) (auditValue(__audit3, auditEnter(__audit3, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ ...this.state, status: "error", error: String(error) }))));
        }
      }

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
})().finally(() => { this.refreshJob = undefined; this.refreshAudit = null; });
    return this.refreshJob;
  };
  mutate = async (operation: FavoriteOperation): Promise<boolean> => {
    const __audit4 = auditBegin("F01", "mutate");
    try {
    if (!this.state.snapshot || this.state.status !== "ready") return auditReturn(__audit4, false);
    const expectedRevision = this.state.snapshot.record.recordRevision;
    const generation = ++this.generation; this.pending++; this.retryOperation = undefined;
    (auditValue(__audit4, auditEnter(__audit4, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ ...this.state, status: "saving", operation }))));
    try {
      const snapshot = await (auditValue(__audit4, auditEnter(__audit4, "this.persistence.mutate"), (this.persistence.mutate(operation, expectedRevision))));
      if (generation !== this.generation) return false;
      this.accept(snapshot, { status: "ready", error: null, operation: undefined }, __audit4);
      // Same realm subscribers receive the committed snapshot immediately;
      // other realms use this as a hint and reread durable revisions.
      try {
        if (this.channel) this.channel.postMessage("committed");
        else if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(CHANNEL); channel.postMessage("committed"); channel.close(); }
      } catch { /* A missed notification never turns a durable commit into a failed write. Actions rebase on durable revisions. */ }
      return auditReturn(__audit4, true);
    } catch (error) { auditError(__audit4, error);
      if (generation !== this.generation) return false;
      this.retryOperation = structuredClone(operation);
      (auditValue(__audit4, auditEnter(__audit4, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ ...this.state, status: "error", error: String(error) })))); return auditReturn(__audit4, false);
    } finally { if (generation === this.generation) this.pending--; }

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
};
  retry = async () => {
    const operation = this.retryOperation;
    if (operation) { this.publish({ ...this.state, status: "ready" }); return this.mutate(operation); }
    await this.refresh("retry"); return this.state.status === "ready";
  };
}

export const hubFavoritesStore = new HubFavoritesStore();
export async function readGuildFavoritesAdapter(): Promise<GuildHubSelectionState> {
  await hubFavoritesStore.refresh("guild-selection-adapter");
  const state = hubFavoritesStore.getSnapshot();
  if (!state.snapshot || state.status === "error") throw Error(state.error ?? "Favorites restore failed.");
  return guildSelection(state.snapshot);
}
export async function writeGuildFavoritesAdapter(state: GuildHubSelectionState) {
  if (state.recordRevision === undefined || state.compatibilityRevision === undefined) throw Error("A restored revision is required for guild replacement.");
  const current = hubFavoritesStore.getSnapshot();
  if (!current.snapshot || current.snapshot.record.recordRevision !== state.recordRevision || current.snapshot.compatibility.recordRevision !== state.compatibilityRevision) throw Error("Guild selection changed; reload before writing.");
  if (!await hubFavoritesStore.mutate({ type: "replaceGuilds", state })) throw Error(hubFavoritesStore.getSnapshot().error ?? "Guild selection is not ready.");
}
