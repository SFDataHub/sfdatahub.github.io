import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { readFile } from "node:fs/promises";
import { HubFavoritesPersistence, HubFavoritesStore, FAVORITES_KEY, FAVORITES_MIGRATION_KEY, GUILD_COMPATIBILITY_KEY,
  readGuildFavoritesAdapter, writeGuildFavoritesAdapter, hubFavoritesStore } from "../../src/lib/data-hub/hubFavoritesStore.ts";
import { favoriteReference, guildFavorite, guildSelection, migrateGuildFavorites, referenceKey, type HubFavoritesSnapshot } from "../../src/lib/data-hub/hubFavoritesContract.ts";
import { localPlayerFavorite, projectHubFavorites, resolveFavorite } from "../../src/lib/data-hub/hubFavoritesProjection.ts";
import { getHubStateDb } from "../../src/lib/data-hub/hubStateDb.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkPlayerIdentifiers, unlinkPlayerIdentifier } from "../../src/lib/identities/playerIdentityStore.ts";
import { importGuildHubLocalScan, deleteGuildHubLocalScans, readGuildHubSelectionState, writeGuildHubSelectionState, readDataHubLocalScanMetadata,
  GUILD_HUB_SCAN_SUMMARY_VERSION, type GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import { GUILD_SCAN_NORMALIZER_VERSION } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { LOCAL_SCAN_CORE_NORMALIZER_VERSION } from "../../src/lib/guilds/localSourceValidity.ts";
import type { LocalPlayerProfileModel } from "../../src/components/local-player-profile/types.ts";
import { captureLocalDataDependencies } from "../../src/lib/local-data/localDataDependencies.ts";

const guild = (id: number, server = "f8_net") => ({ id: `${server}_g${id}`, guildId: `g${id}`, name: `Guild ${id}`, server,
  logo: `${server}_g${id}`, logoIdentifier: `${server}_g${id}`, coaString: "fixture-coa", hofRank: id, memberCount: id + 10 });
const profile = (id: number, server = "f8_net"): LocalPlayerProfileModel => ({ sourceScanId: "observation", sourcePlayerKey: `${server}_p${id}`,
  analytics: { playerName: `Player ${id}`, server, memberRef: `${server}_p${id}`, guildIdentifier: `${server}_g1`, guildName: "Guild", scannedAtMs: 1791194400000 },
  hero: { playerName: `Player ${id}`, server, className: "Mage", levelLabel: "100", metrics: [], badges: [], actions: [] } });
let serial = 0;
async function database(legacy?: unknown) {
  const db = await openDB(`w10:${serial++}`, 2, { upgrade(db) { db.createObjectStore("state", { keyPath: "key" }); } });
  if (legacy !== undefined) await db.put("state", { key: "guild-selection", value: legacy, updatedAt: "legacy-time" });
  return db as Awaited<ReturnType<typeof getHubStateDb>>;
}
const savePlayer = (id: number, server = "f8_net") => ({ type: "save" as const, favorite: localPlayerFavorite(profile(id, server))! });
const saveGuild = (id: number) => ({ type: "save" as const, favorite: guildFavorite(guild(id), 0, null, false) });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

// Legacy Raw must not be migrated by availability or its durable subscription.
const legacyScanDb = await openDB("sfdatahub-guild-hub", 1, { upgrade(db) {
  db.createObjectStore("state", { keyPath: "key" }); db.createObjectStore("scans", { keyPath: "id" });
} });
await legacyScanDb.put("scans", { id: "legacy-unmigrated", contentHash: "legacy-hash", filename: "old.json",
  importedAt: "2026-10-01T00:00:00Z", scannedAt: null, servers: ["f8_net"], playerCount: 1, groupCount: 0,
  rawData: { players: [], groups: [] } });
legacyScanDb.close();
let legacyRawReads = 0;
const beforeLegacyGet = IDBObjectStore.prototype.get, beforeLegacyGetAll = IDBObjectStore.prototype.getAll;
IDBObjectStore.prototype.get = function(query) { if (this.name === "scans") legacyRawReads++; return beforeLegacyGet.call(this, query); };
IDBObjectStore.prototype.getAll = function(...args) { if (this.name === "scans") legacyRawReads++; return beforeLegacyGetAll.apply(this, args); };
await captureLocalDataDependencies({ scanInventory: true });
assert.equal((await projectHubFavorites([localPlayerFavorite(profile(999))!]))[0].availability, "unknown");
assert.equal(legacyRawReads, 0);
const untouchedLocal = await openDB("sfdatahub-local-data");
assert.deepEqual(await untouchedLocal.getAllKeys("scans"), []);
assert.equal(await untouchedLocal.get("metadata", "migration.guildHubScans"), undefined);
untouchedLocal.close();
IDBObjectStore.prototype.get = beforeLegacyGet; IDBObjectStore.prototype.getAll = beforeLegacyGetAll;
const cleanupLegacy = await openDB("sfdatahub-guild-hub"); await cleanupLegacy.delete("scans", "legacy-unmigrated"); cleanupLegacy.close();
console.log("PASS missing legacy metadata and subscription journal reads remain unknown without Raw migration");

const emptyDb = await database(), emptyStore = new HubFavoritesPersistence(async () => emptyDb);
const empty = await emptyStore.restore(); assert.deepEqual(empty.record.favorites, []);
assert.equal((await emptyDb.get("state", FAVORITES_MIGRATION_KEY))?.key, FAVORITES_MIGRATION_KEY);
console.log("PASS absent legacy is a valid empty migration");

const legacy = { selectedGuilds: [guild(2), guild(1), guild(1), { id: "partial", name: "Incomplete", server: "F8" },
  { ...guild(3), logoIdentifier: "f9_net_g3" }, null], activeGuildId: guild(1).id };
const db = await database(legacy), persistence = new HubFavoritesPersistence(async () => db);
const snapshot = await persistence.restore();
assert.equal(snapshot.record.favorites.length, 6);
assert.deepEqual(snapshot.record.favorites.map(f => f.legacy!.value), legacy.selectedGuilds);
assert.deepEqual(snapshot.record.favorites.map(f => f.order), [0, 1, 2, 3, 4, 5]);
assert.equal(snapshot.record.favorites[3].referenceIssue, "incomplete");
assert.equal(snapshot.record.favorites[4].referenceIssue, "conflict");
assert.equal(new Set(guildSelection(snapshot).selectedGuilds.map(g => g.id)).size, 6);
assert.equal(guildSelection(snapshot).activeGuildId, guild(1).id);
assert.deepEqual((await db.get("state", "guild-selection"))?.value, legacy);
assert.deepEqual(await persistence.restore(), snapshot);
const reserved = migrateGuildFavorites({ selectedGuilds: [{ ...guild(1), id: "a::legacy-guild:2" }, { ...guild(2), id: "a" }, { ...guild(3), id: "a" }], activeGuildId: "a" }, null);
assert.equal(new Set(guildSelection(reserved).selectedGuilds.map(g => g.id)).size, 3);
const fallback = migrateGuildFavorites({ selectedGuilds: [{ ...guild(1), name: undefined }, { ...guild(2), id: undefined }], activeGuildId: "missing" }, null);
assert.equal(guildSelection(fallback).activeGuildId, null);
assert.equal(migrateGuildFavorites({ selectedGuilds: [{ ...guild(1), id: undefined }], activeGuildId: null }, null).compatibility.activeGuildId, null);
console.log("PASS ordered metadata, duplicate IDs, incomplete/conflicting/primitives and stable retry mapping preserved");

const failDb = await database(legacy);
let abort = true;
const failing = new HubFavoritesPersistence(async () => failDb, (tx, reason) => { if (abort && reason === "migration") tx.abort(); });
await assert.rejects(failing.restore());
assert.equal(await failDb.get("state", FAVORITES_KEY), undefined);
assert.equal(await failDb.get("state", FAVORITES_MIGRATION_KEY), undefined);
assert.equal(await failDb.get("state", GUILD_COMPATIBILITY_KEY), undefined);
assert.deepEqual((await failDb.get("state", "guild-selection"))?.value, legacy);
abort = false; assert.deepEqual(await failing.restore(), snapshot);
console.log("PASS migration abort rolls back payload, marker and compatibility; atomic deterministic retry");

for (const value of [null, { selectedGuilds: "bad" }, { selectedGuilds: [], activeGuildId: {} }]) {
  const damagedDb = await database(value), damaged = new HubFavoritesPersistence(async () => damagedDb);
  await assert.rejects(damaged.restore()); assert.equal(await damagedDb.get("state", FAVORITES_MIGRATION_KEY), undefined);
  assert.deepEqual((await damagedDb.get("state", "guild-selection"))?.value, value);
}
let readsFail = true;
const reading = new HubFavoritesStore(new HubFavoritesPersistence(async () => { if (readsFail) throw Error("disk read failed"); return emptyDb; }));
await reading.refresh(); assert.equal(reading.getSnapshot().status, "error"); assert.equal(reading.getSnapshot().snapshot, null);
assert.equal(await reading.mutate(savePlayer(9)), false); readsFail = false; assert.equal(await reading.retry(), true);
const corruptDb = await database(), corruptPersistence = new HubFavoritesPersistence(async () => corruptDb), corruptController = new HubFavoritesStore(corruptPersistence);
await corruptController.refresh(); const lastGood = structuredClone(corruptController.getSnapshot().snapshot!);
await corruptDb.put("state", { key: FAVORITES_KEY, value: { ...lastGood.record, schemaVersion: 99 }, updatedAt: "corrupt" });
await corruptController.refresh(); assert.equal(corruptController.getSnapshot().status, "error"); assert.deepEqual(corruptController.getSnapshot().snapshot, lastGood);
assert.equal(await corruptController.mutate(savePlayer(10)), false);
assert.equal((await corruptDb.get("state", FAVORITES_KEY))!.updatedAt, "corrupt");
await corruptDb.put("state", { key: FAVORITES_KEY, value: lastGood.record, updatedAt: "repaired-fixture" });
await corruptController.refresh();
await corruptDb.put("state", { key: FAVORITES_MIGRATION_KEY, value: { schemaVersion: 99 }, updatedAt: "bad-marker" });
assert.equal(await corruptController.mutate(savePlayer(10)), false);
assert.equal((await corruptDb.get("state", FAVORITES_KEY))!.updatedAt, "repaired-fixture");
console.log("PASS corrupt legacy and actual read errors stay distinct from empty; actionable restore retry");

let current = await emptyStore.mutate(saveGuild(1), 1);
current = await emptyStore.mutate(savePlayer(1), current.record.recordRevision);
current = await emptyStore.mutate(saveGuild(2), current.record.recordRevision);
current = await emptyStore.mutate(savePlayer(2), current.record.recordRevision);
const saved = structuredClone(current);
const duplicate = await emptyStore.mutate(savePlayer(1), 1);
assert.deepEqual(duplicate, saved);
const otherServer = await emptyStore.mutate(savePlayer(1, "f9_net"), 1);
assert.equal(otherServer.record.favorites.length, 5);
assert.notEqual(referenceKey(favoriteReference("player", "f8_net_p1")!), referenceKey(favoriteReference("player", "f9_net_p1")!));
const reordered = await emptyStore.mutate({ type: "reorderGuild", id: guild(2).id, targetIndex: 0 }, 1);
assert.deepEqual(reordered.record.favorites.filter(f => f.kind === "player"), otherServer.record.favorites.filter(f => f.kind === "player"));
assert.deepEqual(reordered.record.favorites.map(f => f.kind), otherServer.record.favorites.map(f => f.kind));
assert.deepEqual(guildSelection(reordered).selectedGuilds.map(g => g.id), [guild(2).id, guild(1).id]);
await assert.rejects(emptyStore.mutate({ type: "selectGuild", id: guild(1).id }, 1), /read-only/);
await assert.rejects(emptyStore.mutate({ ...saveGuild(3), activateGuild: true }, 1), /read-only/);
assert.deepEqual((await emptyStore.restore()).compatibility, reordered.compatibility);
const removed = await emptyStore.mutate({ type: "removeGuild", id: guild(1).id }, 1);
assert.deepEqual(removed.record.favorites.filter(f => f.kind === "player").map(f => f.id), otherServer.record.favorites.filter(f => f.kind === "player").map(f => f.id));
assert.deepEqual(removed.compatibility, reordered.compatibility);
await assert.rejects(emptyStore.mutate({ type: "replaceGuilds", state: guildSelection(saved) }, saved.record.recordRevision), /another tab/);
console.log("PASS explicit player save dedupe/server separation; guild reorder fixes player slots; global selection refused and compatibility retained after removal; stale fullwrite refused");

const concurrentDb = await database(), first = new HubFavoritesPersistence(async () => concurrentDb), second = new HubFavoritesPersistence(async () => concurrentDb);
await first.restore();
await Promise.all([first.mutate(savePlayer(101), 1), second.mutate(savePlayer(102), 1)]);
let together = await first.restore(); assert.equal(together.record.favorites.length, 2);
await Promise.all([first.mutate({ type: "remove", id: savePlayer(101).favorite.id }, 1), second.mutate(savePlayer(103), 1)]);
together = await second.restore(); assert.deepEqual(together.record.favorites.map(f => f.display.name), ["Player 102", "Player 103"]);
console.log("PASS concurrent stale operations rebase on committed revision without overwriting other saves/removes");

const pendingDb = await database(), readyGate = deferred<void>();
const delayed = new HubFavoritesStore(new HubFavoritesPersistence(async () => { await readyGate.promise; return pendingDb; }));
const restore = delayed.refresh(); assert.equal(await delayed.mutate(savePlayer(201)), false);
readyGate.resolve(); await restore; assert.equal(await delayed.mutate(savePlayer(201)), true);
console.log("PASS delayed restore gates early user actions");

let failWrite = false;
const errorsDb = await database();
const errorsStore = new HubFavoritesStore(new HubFavoritesPersistence(async () => errorsDb, (tx, reason) => { if (failWrite && reason === "mutation") tx.abort(); }));
await errorsStore.refresh(); await errorsStore.mutate(savePlayer(301)); await errorsStore.mutate(savePlayer(302));
for (const operation of [savePlayer(303), { type: "remove" as const, id: savePlayer(301).favorite.id }, { type: "move" as const, id: savePlayer(301).favorite.id, direction: 1 as const }]) {
  const committed = errorsStore.getSnapshot().snapshot!; failWrite = true;
  assert.equal(await errorsStore.mutate(operation), false); assert.equal(errorsStore.getSnapshot().status, "error");
  assert.deepEqual(errorsStore.getSnapshot().snapshot, committed);
  assert.deepEqual(await new HubFavoritesPersistence(async () => errorsDb).restore(), committed);
  failWrite = false; assert.equal(await errorsStore.retry(), true);
}
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldChannel = Object.getOwnPropertyDescriptor(globalThis, "BroadcastChannel");
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: class { constructor() { throw Error("Notification transport unavailable"); } } });
try { assert.equal(await errorsStore.mutate(savePlayer(304)), true); assert.equal(errorsStore.getSnapshot().status, "ready"); }
finally { if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window"); if (oldChannel) Object.defineProperty(globalThis, "BroadcastChannel", oldChannel); else Reflect.deleteProperty(globalThis, "BroadcastChannel"); }
console.log("PASS save/remove/reorder abort preserves committed memory/disk; retry executes the failed concrete operation");

const oldGate = deferred<HubFavoritesSnapshot>();
class LatePersistence extends HubFavoritesPersistence {
  held = false;
  override async restore() { return this.held ? oldGate.promise : super.restore(); }
}
const latePersistence = new LatePersistence(async () => pendingDb), late = new HubFavoritesStore(latePersistence);
await late.refresh(); const oldSnapshot = structuredClone(late.getSnapshot().snapshot!);
latePersistence.held = true; const oldRead = late.refresh();
assert.equal(await late.mutate(savePlayer(202)), true);
oldGate.resolve(oldSnapshot); await oldRead;
assert.equal(late.getSnapshot().snapshot!.record.favorites.length, 2);
await new HubFavoritesPersistence(async () => pendingDb).mutate(savePlayer(203), 1);
latePersistence.held = false; await late.refresh(); assert.equal(late.getSnapshot().snapshot!.record.favorites.length, 3);
console.log("PASS old restore return cannot overwrite a newer commit; durable revision catches a missed notification");

await linkPlayerIdentifiers("f8_net_p402", "f9_net_p402", { source: "manual" });
await new Promise(resolve => setTimeout(resolve, 5));
await linkPlayerIdentifiers("f8_net_p401", "f9_net_p401", { source: "manual" });
const identityDb = await database(), identityStore = new HubFavoritesPersistence(async () => identityDb);
await identityStore.restore();
const identitySaved = await identityStore.mutate(savePlayer(401), 1);
const favorite = identitySaved.record.favorites[0]; assert.equal(favorite.originalReferences.length, 2);
assert.ok(favorite.identityHint);
await linkPlayerIdentifiers("f8_net_p402", "f8_net_p401", { source: "manual" });
let identities = await loadIdentityResolutionSnapshot();
assert.equal(resolveFavorite(favorite, identities).identity, "resolved");
assert.equal(identities.players.byIdentityId.has(favorite.identityHint!), false, "saved hint UUID was genuinely absorbed by the real merge");
assert.notEqual(resolveFavorite(favorite, identities).identityId, favorite.identityHint);
await unlinkPlayerIdentifier("f9_net_p401"); identities = await loadIdentityResolutionSnapshot();
assert.equal(resolveFavorite(favorite, identities).identity, "conflict");
assert.deepEqual((await identityStore.restore()).record, identitySaved.record);
console.log("PASS confirmed originals and optional UUID captured; merge/absorbed UUID resolve; unlink conflict visible without rewriting favorites");

const raw = await importGuildHubLocalScan("favorite.json", JSON.stringify({ players: [{ identifier: "f8_net_p501", prefix: "f8_net", name: "Player 501", timestamp: 1791194400000, level: 100, class: 1 }], groups: [] }));
const rawDb = await database(), rawStore = new HubFavoritesPersistence(async () => rawDb); await rawStore.restore();
const rawSaved = await rawStore.mutate(savePlayer(501), 1);
assert.equal((await projectHubFavorites(rawSaved.record.favorites))[0].availability, "available");
await deleteGuildHubLocalScans([raw.scan.id]);
assert.deepEqual((await rawStore.restore()).record, rawSaved.record);
assert.equal((await projectHubFavorites(rawSaved.record.favorites))[0].availability, "missing");
console.log("PASS raw deletion changes availability while entity favorite and observation hint survive");

// Real Raw index keys provide independent content evidence. Tampering with a
// Summary must not let it certify its own contentHash/source validity.
const metadataSource = await importGuildHubLocalScan("metadata-proof.json", JSON.stringify({
  players: [{ identifier: "f8_net_p510", prefix: "f8_net", name: "Player 510", timestamp: 1791194400000, level: 100, class: 1 }],
  groups: [{ identifier: "f8_net_g510", prefix: "f8_net", name: "Guild 510", timestamp: 1791194400000 }],
}));
const localDb = await openDB("sfdatahub-local-data"), sourceId = metadataSource.scan.id;
const validSummary = await localDb.get("scanSummaries", sourceId) as GuildHubScanSummary;
const metadataFavorites = [localPlayerFavorite(profile(510))!, localPlayerFavorite(profile(599))!,
  guildFavorite(guild(510), 0, null, false), guildFavorite(guild(599), 0, null, false)];
const originalFavorites = structuredClone(metadataFavorites);
let measuring = false;
const projectionCosts = { rawReads: 0, rawPoolReads: 0, rawValueCursors: 0, summaryWrites: 0, favoriteWrites: 0 };
const nativeGet = IDBObjectStore.prototype.get, nativeGetAll = IDBObjectStore.prototype.getAll,
  nativeCursor = IDBObjectStore.prototype.openCursor, nativePut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.get = function(query) { if (measuring && this.name === "scans") projectionCosts.rawReads++; return nativeGet.call(this, query); };
IDBObjectStore.prototype.getAll = function(...args) { if (measuring && this.name === "scans") projectionCosts.rawPoolReads++; return nativeGetAll.apply(this, args); };
IDBObjectStore.prototype.openCursor = function(...args) { if (measuring && this.name === "scans") projectionCosts.rawValueCursors++; return nativeCursor.apply(this, args); };
IDBObjectStore.prototype.put = function(value, ...args) {
  if (measuring && this.name === "scanSummaries") projectionCosts.summaryWrites++;
  if (measuring && this.name === "state") projectionCosts.favoriteWrites++;
  return nativePut.call(this, value, ...args);
};
async function expectAvailability(expected: Array<"available" | "missing" | "unknown">, favorites = metadataFavorites) {
  measuring = true;
  try {
    const rows = await projectHubFavorites(favorites);
    assert.deepEqual(rows.map(row => row.availability), expected);
    assert.deepEqual(rows.map(row => row.favorite), favorites);
  } finally { measuring = false; }
  assert.ok(Object.values(projectionCosts).every(value => value === 0), JSON.stringify(projectionCosts));
  assert.deepEqual(metadataFavorites, originalFavorites, "projection preserves ID/order/display and all favorite fields");
}
await expectAvailability(["available", "missing", "available", "missing"]);
console.log("PASS current Summary plus independently indexed Raw hash proves positive and complete negative local availability");

await localDb.delete("scanSummaries", sourceId);
assert.equal(await localDb.getKey("scans", sourceId), sourceId);
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
console.log("PASS Raw present with missing Summary stays unknown; projection never repairs or reads Raw");

for (const patch of [{ summaryVersion: GUILD_HUB_SCAN_SUMMARY_VERSION - 1 },
  { normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 }, { coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION - 1 },
  { sourceGeneration: undefined }, { guildCoverage: null }, { fusionInventorySlices: [null] }]) {
  await localDb.put("scanSummaries", { ...validSummary, ...patch });
  await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
}
console.log("PASS stale schema/guild/core normalizers and damaged validity/structure cannot prove either available or missing");

await localDb.put("scanSummaries", { ...validSummary, contentHash: "self-asserted-but-not-Raw-hash" });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
await localDb.put("scanSummaries", { ...validSummary, contentHash: undefined });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
await localDb.put("scanSummaries", validSummary);
const independentlyStoredRaw = await localDb.get("scans", sourceId);
await localDb.put("scans", { ...independentlyStoredRaw, contentHash: "actual-Raw-index-changed" });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
await localDb.put("scans", { ...independentlyStoredRaw, contentHash: undefined });
assert.equal(await localDb.getKey("scans", sourceId), sourceId);
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
await localDb.put("scans", independentlyStoredRaw);
console.log("PASS independent existing Raw index contradicts or cannot confirm Summary hash; no self-certification");

await localDb.put("scanSummaries", { ...validSummary, guilds: validSummary.guilds.map(guild => ({ ...guild, server: "F9" })) });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
console.log("PASS contradicted identifier/server metadata cannot prove positive or negative availability");

await localDb.put("scanSummaries", { ...validSummary, fusionInventorySlices: [] });
await expectAvailability(["unknown", "unknown", "available", "missing"]);
await localDb.put("scanSummaries", { ...validSummary, fusionInventorySlices: validSummary.fusionInventorySlices!.map(slice =>
  ({ ...slice, playerIdentifiers: undefined })) });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
console.log("PASS absent/incomplete Player inventory gives unknown without valid positive evidence");

await localDb.put("scanSummaries", validSummary);
const foreign = await importGuildHubLocalScan("foreign-proof.json", JSON.stringify({
  players: [{ identifier: "eu1_p600", prefix: "eu1", name: "Foreign", timestamp: 1791194400000, level: 100, class: 1 }], groups: [],
}));
await expectAvailability(["available", "missing", "available", "missing"]);
await expectAvailability(["unknown"], [localPlayerFavorite(profile(601, "eu1"))!]);
console.log("PASS valid foreign server with unpersisted Player identifiers does not invalidate complete relevant inventory");

const metadataUnchecked = await importGuildHubLocalScan("unchecked-proof.json", JSON.stringify({
  players: [{ identifier: "f8_net_p511", prefix: "f8_net", name: "Unchecked", timestamp: 1791194400000, level: 100, class: 1 }], groups: [],
}));
await localDb.delete("scanSummaries", metadataUnchecked.scan.id);
await expectAvailability(["available", "unknown", "available", "unknown"]);
await localDb.put("scanSummaries", { ...validSummary, summaryVersion: GUILD_HUB_SCAN_SUMMARY_VERSION - 1 });
await expectAvailability(["unknown", "unknown", "unknown", "unknown"]);
await localDb.put("scanSummaries", validSummary);
await expectAvailability(["available", "unknown", "available", "unknown"]);
console.log("PASS valid hit survives an unchecked source; subsequent metadata updates replace stale availability");

await deleteGuildHubLocalScans([metadataSource.scan.id, foreign.scan.id, metadataUnchecked.scan.id]);
await expectAvailability(["missing", "missing", "missing", "missing"]);
IDBObjectStore.prototype.get = nativeGet; IDBObjectStore.prototype.getAll = nativeGetAll;
IDBObjectStore.prototype.openCursor = nativeCursor; IDBObjectStore.prototype.put = nativePut;
localDb.close();
console.log("MEASURED N02 pure projection operations", JSON.stringify(projectionCosts));

const mainDb = await getHubStateDb(); await mainDb.put("state", { key: "guild-selection", value: { selectedGuilds: [guild(8)], activeGuildId: guild(8).id }, updatedAt: "original" });
const legacyRecord = await mainDb.get("state", "guild-selection");
await hubFavoritesStore.refresh(); await hubFavoritesStore.mutate(savePlayer(801));
const adapter = await readGuildHubSelectionState();
assert.deepEqual(adapter, await readGuildFavoritesAdapter());
await writeGuildHubSelectionState({ ...adapter, selectedGuilds: [...adapter.selectedGuilds, guild(9)] });
assert.equal(hubFavoritesStore.getSnapshot().snapshot!.record.favorites.filter(f => f.kind === "player").length, 1);
assert.deepEqual(await mainDb.get("state", "guild-selection"), legacyRecord);
await assert.rejects(writeGuildFavoritesAdapter(adapter), /changed/);
console.log("PASS actual read/write guild APIs controlled by one owner, player preservation, unchanged legacy recovery, stale compatibility revision refused");

const player = localPlayerFavorite(profile(901))!;
assert.equal(player.display.observedAtMs, 1791194400000); assert.ok(player.observationHint);
assert.equal("analytics" in player, false); assert.equal("currentSeed" in player, false);
assert.equal(localPlayerFavorite({ ...profile(901), analytics: { ...profile(901).analytics, memberRef: "same-name" } }), null);
assert.equal("activePlayer" in snapshot.record, false); assert.equal("activeFavorite" in snapshot.record, false);
const actionSource = await readFile("src/components/local-player-profile/LocalPlayerFavoriteAction.tsx", "utf8");
assert.doesNotMatch(actionSource, /toggleFavoritePlayer|AuthContext|firestore|getGuildHubLocalScan|normalizeSf/);
const filterSource = await readFile("src/pages/DataHub/Toplist.tsx", "utf8"); assert.doesNotMatch(filterSource, /hubFavoritesStore|useHubFavorites/);
console.log("PASS local profile factory persists entity/light metadata only; public favorites and favoritesOnly stay separate");

assert.deepEqual(migrateGuildFavorites(undefined, null).record.favorites, []);
console.log("All targeted W-10 regression groups passed");
