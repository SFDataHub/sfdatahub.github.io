import { serverComparisonKey, observationReferenceKey } from "../servers/serverResolver";
import type { DBSchema, IDBPDatabase } from "idb";

export const LOCAL_CHANGES_STORE = "localChanges";
export type LocalDataOwner = "sources" | "analytics" | "toplists" | "player-identities" | "guild-identities" | "archive-index" | "hub-search";
export type LocalDataChangeKind = "content" | "normalization" | "release" | "binding" | "identity" | "exclusion" | "derived" | "reset" | "maintenance" | "provenance" | "readiness";
export type LocalIdentityChangeGroup = { identityId: string; aliases: string[] };
export type LocalDataChange = {
  sequence?: number;
  owner: LocalDataOwner;
  kinds: LocalDataChangeKind[];
  sourceIds: string[];
  removedSourceIds: string[];
  servers: string[];
  unknownImpact: boolean;
  identityBefore?: LocalIdentityChangeGroup[];
  identityAfter?: LocalIdentityChangeGroup[];
  originalAliases?: string[];
  committedAt: string;
};
export interface LocalChangesSchema extends DBSchema {
  localChanges: { key: number; value: LocalDataChange; indexes: { by_kind: LocalDataChangeKind } };
}
export type LocalDataChangeInput = Omit<LocalDataChange, "sequence" | "committedAt">;

export function createLocalChangesStore<DB>(typedDb: IDBPDatabase<DB>) {
  const db = typedDb as unknown as IDBPDatabase;
  if (db.objectStoreNames.contains(LOCAL_CHANGES_STORE)) return;
  const store = db.createObjectStore(LOCAL_CHANGES_STORE, { keyPath: "sequence", autoIncrement: true });
  store.createIndex("by_kind", "kinds", { multiEntry: true });
}

export async function readLocalDataChanges(db: IDBPDatabase<LocalChangesSchema>, after = 0, latestOnly = false) {
  if (latestOnly) {
    const cursor = await db.transaction(LOCAL_CHANGES_STORE).store.openCursor(undefined, "prev");
    return cursor ? [cursor.value] : [];
  }
  return db.getAll(LOCAL_CHANGES_STORE, IDBKeyRange.lowerBound(after, true));
}

/** Derived owner reset receipts are durable tombstones. Equality only; neither
 * source generations nor these serialized certificates imply temporal order. */
export async function readLocalResetGeneration(db: IDBPDatabase<LocalChangesSchema>, owner: LocalDataOwner, sourceId: string) {
  const resets = await db.getAllFromIndex(LOCAL_CHANGES_STORE, "by_kind", "reset");
  const relevant = resets.filter(change => change.owner === owner && (!change.sourceIds.length || change.sourceIds.includes(sourceId)));
  return JSON.stringify(relevant.map(change => change.sequence));
}

const originId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
const listeners = new Set<(change: LocalDataChange) => void>();
let channel: BroadcastChannel | null = null;
function getChannel() {
  // Node's BroadcastChannel is not a browser realm and would keep tests alive.
  if (!channel && typeof navigator !== "undefined" && typeof BroadcastChannel !== "undefined" &&
      (typeof window !== "undefined" || typeof self !== "undefined")) {
    try {
      channel = new BroadcastChannel("sfdatahub:local-data:changes:v1");
      channel.onmessage = ({ data }) => {
      if (data?.origin === originId || !data?.change || typeof data.change.owner !== "string") return;
        deliver(data.change);
      };
    } catch { channel?.close(); channel = null; }
  }
  return channel;
}
function deliver(change: LocalDataChange) {
  listeners.forEach(listener => { try { listener(change); } catch (error) { console.error("Local data change listener failed", error); } });
}
export function publishLocalDataChange(change: LocalDataChange) {
  // Called strictly after tx.done. Transport failure cannot turn a committed
  // mutation into a failed write, and listeners must not undo committed Raw.
  deliver(change);
  try { getChannel()?.postMessage({ origin: originId, change }); } catch { /* Durable catch-up remains authoritative. */ }
}
export function subscribeToLocalDataChanges(listener: (change: LocalDataChange) => void) {
  getChannel();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export type LocalDataDependencies = {
  hubSearchResets?: boolean;
  hubSearch?: boolean;
  toplistResets?: boolean;
  sourceIds?: readonly string[];
  sourceScope?: { players?: readonly string[]; guilds?: readonly string[]; servers?: readonly string[] };
  // Server scopes cover latest/history selections, including newly imported IDs.
  servers?: readonly string[];
  allSources?: boolean;
  scanInventory?: boolean;
  playerAliases?: readonly string[];
  guildAliases?: readonly string[];
  playerIdentityIds?: readonly string[];
  guildIdentityIds?: readonly string[];
  allIdentities?: boolean;
};
const intersects = (left: readonly string[], right: readonly string[] = []) => {
  const keys = new Set(right.map(value => value.trim().toLowerCase()));
  return left.some(value => keys.has(value.trim().toLowerCase()));
};
const identityReferencesIntersect = (left: readonly string[], right: readonly string[] = []) => {
  const keys = new Set(right.map(observationReferenceKey));
  return left.some(value => keys.has(observationReferenceKey(value)));
};
export function isLocalDataChangeRelevant(change: LocalDataChange, need: LocalDataDependencies) {
  if (need.hubSearchResets && (change.owner === "hub-search" || change.owner === "archive-index") && change.kinds.includes("reset")) return true;
  if (need.hubSearch && (change.owner === "hub-search" || change.owner === "archive-index")) return true;
  if (change.owner === "toplists" && need.toplistResets && change.kinds.includes("reset")) {
    return change.unknownImpact || !change.sourceIds.length || intersects(change.sourceIds, need.sourceIds);
  }
  if (change.owner === "sources") {
    const metadataOnly = change.kinds.every(kind => kind === "provenance" || kind === "readiness");
    if (metadataOnly) return Boolean(need.scanInventory && change.kinds.includes("provenance"));
    if (need.scanInventory) return change.kinds.some(kind => ["content", "normalization", "binding", "release", "exclusion", "maintenance"].includes(kind));
    if (!(need.allSources || need.sourceScope || need.sourceIds?.length || need.servers?.length)) return false;
    return Boolean(need.allSources || need.sourceScope || change.unknownImpact || intersects([...change.sourceIds, ...change.removedSourceIds], need.sourceIds) || intersects(change.servers.map(server => serverComparisonKey(server) ?? server), need.servers?.map(server => serverComparisonKey(server) ?? server)));
  }
  if (change.owner === "player-identities" || change.owner === "guild-identities") {
    const aliases = change.owner === "player-identities" ? need.playerAliases : need.guildAliases;
    const ids = change.owner === "player-identities" ? need.playerIdentityIds : need.guildIdentityIds;
    if (!(need.allIdentities || aliases?.length || ids?.length)) return false;
    const groups = [...(change.identityBefore ?? []), ...(change.identityAfter ?? [])];
    return Boolean(need.allIdentities || change.unknownImpact || identityReferencesIntersect(change.originalAliases ?? [], aliases) ||
      identityReferencesIntersect(groups.flatMap(group => group.aliases), aliases) || intersects(groups.map(group => group.identityId), ids));
  }
  return false; // Derived writes never masquerade as Raw/Identity changes.
}

// Schema owners include localChanges in the very same readwrite transaction as
// their domain stores. An aborted transaction therefore publishes no receipt.
export function localChangesDb<DB>(db: IDBPDatabase<DB>) {
  return db as unknown as IDBPDatabase<LocalChangesSchema>;
}
