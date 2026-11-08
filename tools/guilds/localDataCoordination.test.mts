import { startPlayerPerformanceWorkerRun, type PlayerPerformanceWorkerLike, type PlayerPerformanceWorkerResponse } from "../../src/pages/Playground/playerPerformanceWorkerClient.ts";
import "fake-indexeddb/auto";
import "./fixtures/localDataCoordination/nodeLocks.mjs";
import assert from "node:assert/strict";
import { openDB, type IDBPDatabase } from "idb";
import {
  importGuildHubLocalScan, updateGuildHubLocalScan, getGuildHubLocalScan, deleteGuildHubLocalScans,
  readSfDataHubLocalChanges, readLocalToplistResetGeneration, createGuildHubLocalScanImportPreview,
  commitGuildHubLocalScanPreview, listGuildHubScanSummaries, type GuildHubLocalScan,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  materializeGuildAnalyticsSource, resetGuildAnalyticsDerivedData, readGuildAnalyticsDerivedSource,
  ensureGuildAnalyticsSourceDataFromSummaries, reconcileGuildAnalyticsSources,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import { withLocalDataWrite } from "../../src/lib/local-data/localDataCoordination.ts";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../../src/lib/local-data/localDataDependencies.ts";
import { subscribeToLocalDataChanges, isLocalDataChangeRelevant, type LocalDataChange, type LocalChangesSchema } from "../../src/lib/local-data/localDataChanges.ts";
import { commitLocalDataMutation } from "../../src/lib/local-data/localDataTransaction.ts";
import { createPlayerIdentityStore, linkPlayerIdentifiers, readPlayerIdentityChanges } from "../../src/lib/identities/playerIdentityStore.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { loadIdentityResolutionSnapshot, revalidateIdentityResolutionSnapshot, resolvePlayerIdentity } from "../../src/lib/identities/identityResolution.ts";
import { putLocalToplistSnapshot, deleteLocalToplistSnapshot, localToplistSnapshotCacheKey } from "../../src/lib/toplists/localToplistStore.ts";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import type { LocalToplistDerivedSnapshotPayload } from "../../src/lib/toplists/localToplistWorkerTypes.ts";

interface TestMutationDb extends LocalChangesSchema { scans: { key: string; value: GuildHubLocalScan } }

const content = (name: string, server = "f8_net", level = 100) => JSON.stringify({
  players: [{ identifier: `${server}_p1`, prefix: server, timestamp: 1791194400000, name, level, class: 1, guildIdentifier: `${server}_g1`, guildName: name }],
  groups: [{ identifier: `${server}_g1`, prefix: server, timestamp: 1791194400000, name }],
});
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; }
const imported = await importGuildHubLocalScan("a.json", content("A"));
const id = imported.scan.id;
const raw = await openDB("sfdatahub-local-data");
const analytics = await openDB("sfdatahub-guild-analytics");
const stores = ["sources", "snapshots", "members", "guilds"];
const physical = () => Promise.all(stores.map(store => analytics.getAll(store)));
const checkpoint = await captureLocalDataDependencies({ sourceIds: [id], servers: ["f8_net"] });
const foreign = await captureLocalDataDependencies({ servers: ["s30_eu"] });
const events: LocalDataChange[] = [];
const unsubscribe = subscribeToLocalDataChanges(change => events.push(change));

// Pause a job immediately before lock acquisition, after it captured its reset
// certificate and performed the CPU build. A same-realm stand-in complements
// (never replaces) the actual realm/browser tests.
const locks = navigator.locks;
const originalRequest = locks.request.bind(locks);
async function pausedBuild(scan = imported.scan) {
  const entered = deferred(), resume = deferred();
  let intercepted = false;
  Object.defineProperty(locks, "request", { configurable: true, value: async (...args: any[]) => {
    if (!intercepted) { intercepted = true; entered.resolve(); await resume.promise; }
    return (originalRequest as any)(...args);
  } });
  const job = materializeGuildAnalyticsSource(scan).then(() => null, error => String(error));
  await entered.promise;
  Object.defineProperty(locks, "request", { configurable: true, value: originalRequest });
  return { resume, job };
}
const oldUpdate = await pausedBuild();
const updated = await updateGuildHubLocalScan(id, "new.json", content("New", "f8_net", 200));
const newerPhysical = await physical();
oldUpdate.resume.resolve();
assert.match(String(await oldUpdate.job), /changed before Analytics commit/);
assert.deepEqual(await physical(), newerPhysical);
assert.equal((await revalidateLocalDataDependencies(checkpoint)).current, false);
assert.equal((await revalidateLocalDataDependencies(foreign)).current, true);
assert.equal(events.filter(event => event.owner === "sources").length, 1);
console.log("PASS old build vs update, physical four-store preservation, scoped foreign-server validity, one committed Source notification");

const held = deferred(), release = deferred();
const critical = withLocalDataWrite(async () => { held.resolve(); await release.promise; });
await held.promise;
let rawUpdated = false;
const concurrent = updateGuildHubLocalScan(id, "queued.json", content("Queued", "f8_net", 300)).then(() => { rawUpdated = true; });
await new Promise(resolve => setTimeout(resolve, 25));
assert.equal(rawUpdated, false);
assert.equal((await raw.get("scans", id)).filename, "new.json");
release.resolve();
await Promise.all([critical, concurrent]);
console.log("PASS mutation waits for coordinated critical section and then commits");

const scan = (await getGuildHubLocalScan(id))!;
const resetJob = await pausedBuild(scan);
await resetGuildAnalyticsDerivedData();
assert.deepEqual(await physical(), [[], [], [], []]);
resetJob.resume.resolve();
assert.match(String(await resetJob.job), /Reset changed/);
assert.deepEqual(await physical(), [[], [], [], []]);
await materializeGuildAnalyticsSource(scan);
assert.equal((await readGuildAnalyticsDerivedSource(id)).members[0].level, 300);
// Ensure must capture its certificate before a slow caller-owned source loader.
const summaries = await listGuildHubScanSummaries();
await resetGuildAnalyticsDerivedData();
const loading = deferred(), finishLoad = deferred();
const ensure = ensureGuildAnalyticsSourceDataFromSummaries(summaries, { loadSourceById: async () => { loading.resolve(); await finishLoad.promise; return scan; } }).then(() => null, error => String(error));
await loading.promise;
await resetGuildAnalyticsDerivedData();
finishLoad.resolve();
assert.match(String(await ensure), /Reset changed/);
assert.deepEqual(await physical(), [[], [], [], []]);
await materializeGuildAnalyticsSource(scan);
console.log("PASS reset invalidates direct build and pre-load Ensure; new demand repairs");

const deleteJob = await pausedBuild(scan);
await deleteGuildHubLocalScans([id]);
deleteJob.resume.resolve();
assert.match(String(await deleteJob.job), /changed before Analytics commit/);
assert.equal(await getGuildHubLocalScan(id), null);
assert.deepEqual(await physical(), [[], [], [], []]);
assert((await readSfDataHubLocalChanges()).some(change => change.removedSourceIds.includes(id)));
console.log("PASS Rawdelete vs delayed Writer: no Raw, rows or marker resurrection; durable deletion");

// A successful Raw commit remains observable if downstream Analytics fails.
const preview = await createGuildHubLocalScanImportPreview("error.json", content("Error"));
const before = (await readSfDataHubLocalChanges()).filter(change => change.owner === "sources").length;
await assert.rejects(commitGuildHubLocalScanPreview(preview, { analytics: { onPhase: phase => { if (phase.phase === "saving-derived-analytics") throw Error("injected Analytics failure"); } } }), /injected/);
assert.equal((await getGuildHubLocalScan(preview.id))?.filename, "error.json");
assert.equal((await readSfDataHubLocalChanges()).filter(change => change.owner === "sources").length, before + 1);
await materializeGuildAnalyticsSource((await getGuildHubLocalScan(preview.id))!);
assert.equal((await readGuildAnalyticsDerivedSource(preview.id)).members.length, 1);
console.log("PASS Raw + receipt persist despite propagated Analytics failure; later demand succeeds");

const source = (await getGuildHubLocalScan(preview.id))!;
const topOptions = { resetGeneration: await readLocalToplistResetGeneration(source.id), dependencies: await captureLocalDataDependencies({ sourceIds: [source.id] }) };
const derived = deriveLocalToplistsFromConfirmedScans([{ manifestYear: 2026, archiveScanId: "top", archiveSha256: "a".repeat(64), server: "f8_net", scanTimestamp: 1791194400000,
  localScanId: source.id, rawScan: source.rawData, confirmation: {kind: "archiveSource", archiveScanId: "top", archiveSha256: "a".repeat(64)} }]);
const payload: LocalToplistDerivedSnapshotPayload = { ...source, manifestYear: 2026, archiveScanId: "top", archiveSha256: "a".repeat(64), server: derived.snapshots[0].server,
  scanTimestamp: 1791194400000, localScanId: source.id, localContentHash: source.contentHash,
  playerRows: derived.players, guildRows: derived.guilds, snapshotMeta: derived.snapshots[0], issues: derived.issues };
await putLocalToplistSnapshot(payload, topOptions);
assert.equal(events.filter(change => change.owner === "sources" && change.sourceIds.includes(source.id)).length, 1);
await deleteLocalToplistSnapshot(payload);
await assert.rejects(putLocalToplistSnapshot(payload, topOptions), /reset changed/);
assert.equal(await raw.get("localToplistSnapshots", localToplistSnapshotCacheKey(payload)), undefined);
console.log("PASS Toplist reset rejects old payload; Derived commits do not impersonate Raw changes");

const selectionReceipt = await captureLocalDataDependencies({ servers: ["F8"] });
const sourceOnlyReceipt = await captureLocalDataDependencies({ sourceIds: [source.id] });
await importGuildHubLocalScan("new-relevant.json", content("NewRelevant"));
assert.equal((await revalidateLocalDataDependencies(selectionReceipt)).current, false);
assert.equal((await revalidateLocalDataDependencies(sourceOnlyReceipt)).current, true);
console.log("PASS canonical server selection detects previously unknown Source without invalidating unchanged source-only need");

const lateReceipt = await captureLocalDataDependencies({ allSources: true, allIdentities: true });
const messageListeners = new Set<(event: MessageEvent<PlayerPerformanceWorkerResponse>) => void>();
const fakePerformanceWorker: PlayerPerformanceWorkerLike = {
  postMessage() {}, terminate() {},
  addEventListener(type: string, listener: any) { if (type === "message") messageListeners.add(listener); },
  removeEventListener(type: string, listener: any) { if (type === "message") messageListeners.delete(listener); },
};
const lateRun = startPlayerPerformanceWorkerRun({ summaries: [], guildTarget: null, workerFactory: () => fakePerformanceWorker });
await importGuildHubLocalScan("late-delivery.json", content("LateDelivery", "s30_eu"));
const rejectedLateResult = assert.rejects(lateRun.promise, /changed before delivery/);
messageListeners.forEach(listener => listener({ data: { type: "complete", requestId: lateRun.requestId, dependencies: lateReceipt, result: {} } } as MessageEvent<PlayerPerformanceWorkerResponse>));
await rejectedLateResult;
console.log("PASS a completed Worker result is rejected after an intervening durable mutation before delivery");

const identityReceipt = await captureLocalDataDependencies({ playerAliases: ["f8_net_p1"] });
const snapshot = await loadIdentityResolutionSnapshot();
const rawBeforeIdentity = await raw.getAll("scans");
await linkPlayerIdentifiers("f8_net_p1", "s30_eu_p7", { source: "manual" });
assert.equal((await revalidateLocalDataDependencies(identityReceipt)).current, false);
const refreshed = await revalidateIdentityResolutionSnapshot(snapshot);
assert.equal(resolvePlayerIdentity(refreshed, "f8_net_p1").resolved, true);
assert.deepEqual(await raw.getAll("scans"), rawBeforeIdentity);
const identityChanges = await readPlayerIdentityChanges();
assert.deepEqual(identityChanges[0].identityBefore, []);
assert(identityChanges[0].identityAfter![0].aliases.includes("s30_eu_p7"));
assert(isLocalDataChangeRelevant(identityChanges[0], { playerAliases: ["s30_eu_p7"] }));
// Both owners: link, merge, unlink and persistent exclusion transitions.
for (const kind of ["player", "guild"] as const) {
  const dbName = `w04-${kind}-upgrade`;
  const legacy = await openDB(dbName, 1, { upgrade(db) {
    const entities = db.createObjectStore(`${kind}Entities`, {keyPath:"entityId"}); entities.createIndex("by_createdAt", "createdAt"); entities.createIndex("by_updatedAt", "updatedAt");
    const aliases = db.createObjectStore(`${kind}Aliases`, {keyPath:"identifierKey"}); aliases.createIndex("by_entityId", "entityId"); aliases.createIndex("by_source", "source");
    const exclusions = db.createObjectStore(`${kind}Exclusions`, {keyPath:"pairKey"}); exclusions.createIndex("by_identifierAKey", "identifierAKey"); exclusions.createIndex("by_identifierBKey", "identifierBKey"); exclusions.createIndex("by_source", "source");
  } });
  const saved = {pairKey:"a::b", identifierA:"a", identifierB:"b", identifierAKey:"a", identifierBKey:"b", source:"manual", createdAt:"2026-01-01"};
  const savedEntity = { entityId:"retained", createdAt:"2026-01-01", updatedAt:"2026-01-01" };
  const savedAliases = ["retained-a", "retained-b"].map(identifier => ({identifier, identifierKey:identifier, entityId:"retained", addedAt:"2026-01-01", source:"manual"}));
  await legacy.put(`${kind}Exclusions`, saved);
  await legacy.put(`${kind}Entities`, savedEntity);
  for (const alias of savedAliases) await legacy.put(`${kind}Aliases`, alias);
  legacy.close();
  const owner = kind === "player" ? createPlayerIdentityStore({dbName}) : createGuildIdentityStore({dbName});
  const link = "linkPlayerIdentifiers" in owner ? owner.linkPlayerIdentifiers : owner.linkGuildAliases;
  const unlink = "unlinkPlayerIdentifier" in owner ? owner.unlinkPlayerIdentifier : owner.unlinkGuildAlias;
  const reject = "rejectPlayerMatch" in owner ? owner.rejectPlayerMatch : owner.rejectGuildLink;
  const remove = "removePlayerMatchRejection" in owner ? owner.removePlayerMatchRejection : owner.removeGuildLinkRejection;
  await link("one", "two", {source:"manual"}); await link("three", "four", {source:"imported"});
  await link("one", "three", {source:"manual"}); await unlink("one");
  await reject("one", "two"); await remove("one", "two");
  const receipts = await owner.readChanges(); assert.equal(receipts.length, 6);
  assert.equal(receipts[2].identityBefore?.length, 2); assert.equal(receipts[2].identityAfter?.length, 1);
  assert(receipts[3].originalAliases?.includes("one"));
  await owner.close();
  const reopened = await openDB(dbName); assert.deepEqual(await reopened.get(`${kind}Exclusions`, "a::b"), saved); assert.deepEqual(await reopened.get(`${kind}Entities`, "retained"), savedEntity); assert.deepEqual(await reopened.getAllFromIndex(`${kind}Aliases`, "by_entityId", "retained"), savedAliases); assert.equal(reopened.version, 2); reopened.close();
}
console.log("PASS both Identity owners: atomic before/after aliases, merge/unlink/exclusions, snapshot refresh, upgrade + reopen, unchanged Raw");

// Receipt failure aborts the domain write as well; no notification or partial Tx.
const journalBeforeFailure = await raw.getAll("localChanges");
const rawBeforeFailure = await raw.getAll("scans");
await assert.rejects(commitLocalDataMutation(raw as unknown as IDBPDatabase<TestMutationDb>, ["scans"], {
  owner:"sources", kinds:["content"], sourceIds:[source.id], removedSourceIds:[], servers:[], unknownImpact:true,
}, async tx => { await tx.objectStore("scans").delete(source.id); throw Error("injected Tx failure"); }), /injected/);
assert.deepEqual(await raw.getAll("scans"), rawBeforeFailure);
assert.deepEqual(await raw.getAll("localChanges"), journalBeforeFailure);
await withLocalDataWrite(async () => {});
const platformLocks = navigator.locks;
Object.defineProperty(navigator, "locks", {configurable:true, value:undefined});
await assert.rejects(withLocalDataWrite(async () => {}), /Web Locks API/);
Object.defineProperty(navigator, "locks", {configurable:true, value:platformLocks});
await reconcileGuildAnalyticsSources();
unsubscribe(); raw.close(); analytics.close();
console.log("PASS failed Tx has no domain/receipt partial commit; missing Locks fail explicitly; subsequent writes succeed");
