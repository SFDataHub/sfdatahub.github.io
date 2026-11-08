import "fake-indexeddb/auto";
import "../guilds/fixtures/localDataCoordination/nodeLocks.mjs";
import assert from "node:assert/strict";
import { openDB } from "idb";
import {
  buildScanArchiveInventoryBasis, loadDataHubArchiveBasis, projectLocalArchiveInventory,
  projectPersonalScanInventory, DataHubScanInventoryController, type DataHubScanInventory,
} from "../../src/lib/data-hub/dataHubScanInventory.ts";
import {
  createGuildHubLocalScanImportPreview, commitGuildHubLocalScanPreview, importGuildHubLocalScan,
  bindGuildHubLocalScanToArchiveEntry, confirmGuildHubArchiveReadiness, readDataHubLocalScanMetadata,
  deleteGuildHubArchiveScanBinding, updateGuildHubLocalScan, deleteGuildHubLocalScans, importGuildHubLocalScanRecords,
} from "../../src/lib/guilds/localScanLibrary.ts";
import { archiveExpectation, isArchiveReadinessCurrent } from "../../src/lib/data-hub/archiveReadiness.ts";
import { findArchiveOverviewReady } from "../../src/components/ScanManagement/scanArchiveOverview.ts";
import { isLocalDataChangeRelevant, type LocalDataChange } from "../../src/lib/local-data/localDataChanges.ts";
import { entry, content, catalog, manifest, deferred } from "./fixtures/dataHubScanInventory/data.ts";

const a = entry("one"), old = entry("old", 2025, "b");
const context = { activeYears: [2025, 2026], loadedYears: [2025, 2026], failedYears: [], checkedAt: "2026-10-06T12:00:00Z", manifestUpdatedAt: [] };
const basis = buildScanArchiveInventoryBasis([a, a, { ...a, sha256: a.sha256.toUpperCase() }, old], context);
assert.equal(basis.entries.length, 2);
const versions = buildScanArchiveInventoryBasis([a, { ...a, sha256: "b".repeat(64) }, old], context);
assert.equal(versions.conflicts, 1); assert.deepEqual(versions.entries.map(e => e.id), [old.id]);
assert.equal(buildScanArchiveInventoryBasis([a, { ...a, fileUrl: "https://other.test/one.gz" }], context).entries.length, 0);
let networkRequests = 0;
const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
  networkRequests++; const url = String(input);
  if (url.endsWith("catalog.json")) return Response.json(catalog);
  if (url.includes("2025")) return Response.json(manifest(2025, [old]));
  return new Response("offline", { status: 503 });
};
const partial = await loadDataHubArchiveBasis({ fetcher, catalogUrl: "https://inventory.test/catalog.json" });
assert.deepEqual(partial.activeYears, [2025, 2026]); assert.deepEqual(partial.failedYears, [2026]); assert.equal(partial.entries.length, 1);
assert.equal(networkRequests, 3);
const invalid = await loadDataHubArchiveBasis({ catalogUrl: "https://inventory.test/catalog.json", fetcher: async input => {
  if (String(input).endsWith("catalog.json")) return Response.json(catalog);
  return Response.json(String(input).includes("2025") ? manifest(2025, [old]) : { ...manifest(2026, [a]), scanCount: 10 });
} });
assert.deepEqual(invalid.failedYears, [2026]);
await assert.rejects(loadDataHubArchiveBasis({ catalogUrl: "https://inventory.test/catalog.json", fetcher: async () => { throw Error("offline"); } }));
const noActive = await loadDataHubArchiveBasis({ catalogUrl: "https://inventory.test/catalog.json", fetcher: async () => Response.json({ schemaVersion: 1, archives: [] }) });
assert.equal(noActive.entries.length, 0);
console.log("PASS physical dedupe/uppercase SHA/current-monthly references, conflicting versions/URLs, all active years, offline/invalid partial basis and real empty basis");

const imported = await importGuildHubLocalScan("own.json", content(a));
const second = { ...a, id: "second-physical", path: "second.json.gz", fileUrl: "https://inventory.test/2026/second.json.gz", sha256: "c".repeat(64) };
await bindGuildHubLocalScanToArchiveEntry(a, imported.scan.id);
await bindGuildHubLocalScanToArchiveEntry(second, imported.scan.id);
const both = buildScanArchiveInventoryBasis([a, second], { ...context, activeYears: [2026], loadedYears: [2026] });
let local = await readDataHubLocalScanMetadata();
assert.equal(projectPersonalScanInventory(local).personal.value, 1);
assert.equal(projectLocalArchiveInventory(local, both).value, 2);
assert.equal(projectLocalArchiveInventory(local, basis).value, 1);
assert.equal(projectLocalArchiveInventory(local, versions).value, 0);
assert.ok(isArchiveReadinessCurrent(local.bindings[0], local.summaries[0], a, true) || isArchiveReadinessCurrent(local.bindings[1], local.summaries[0], a, true));
assert.equal(projectLocalArchiveInventory(local, buildScanArchiveInventoryBasis([{ ...a, sha256: "d".repeat(64) }], context)).value, 0);
for (const variation of [{ ...a, fileUrl: "https://changed.test/one.gz" }, { ...a, manifestRevision: 2 }, { ...a, playerCount: 2 }]) {
  assert.equal(projectLocalArchiveInventory(local, buildScanArchiveInventoryBasis([variation], context)).value, 0);
}
const db = await openDB("sfdatahub-local-data");
const stripProofs = async () => {
  const tx = db.transaction("archiveScanBindings", "readwrite");
  for (const binding of await tx.store.getAll()) { delete binding.readiness; await tx.store.put(binding); }
  await tx.done;
};
await stripProofs();
// Unrelated personal/legacy sources must never enter the cold candidate pool.
await importGuildHubLocalScan("unrelated.json", content(entry("unrelated")));
const legacy = (await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("legacy.json", content(entry("legacy"))))).scan;
const cold = await confirmGuildHubArchiveReadiness([a, second]);
assert.deepEqual({ rawReads: cold.rawReads, validations: cold.payloadValidations, normalizationWrites: cold.normalizationWrites }, { rawReads: 1, validations: 2, normalizationWrites: 0 });
assert.equal(cold.failed.length, 0);
await stripProofs();
let joinedRawReads = 0;
const joinGet = IDBObjectStore.prototype.get;
IDBObjectStore.prototype.get = function(query) { if (this.name === "scans") joinedRawReads++; return joinGet.call(this, query); };
try {
  const joined = await Promise.all([confirmGuildHubArchiveReadiness([a, second]), confirmGuildHubArchiveReadiness([a, second])]);
  assert.equal(joinedRawReads, 1); assert.equal(joined[0].payloadValidations, 2); assert.equal(joined[1].payloadValidations, 2);
} finally { IDBObjectStore.prototype.get = joinGet; }
local = await readDataHubLocalScanMetadata();
assert.equal(projectLocalArchiveInventory(local, both).value, 2);
// Warm inventory is keys + metadata. Fail loudly on ANY payload get/getAll.
const get = IDBObjectStore.prototype.get, getAll = IDBObjectStore.prototype.getAll;
let metadataReads = 0;
IDBObjectStore.prototype.get = function(query) { if (this.name === "scans") throw Error("warm Raw get"); metadataReads++; return get.call(this, query); };
IDBObjectStore.prototype.getAll = function(...args) { if (this.name === "scans") throw Error("warm Raw getAll"); metadataReads++; return getAll.apply(this, args); };
try { assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), both).value, 2); }
finally { IDBObjectStore.prototype.get = get; IDBObjectStore.prototype.getAll = getAll; }
assert.ok(metadataReads > 0);
const summary = local.summaries.find(s => s.sourceScanId === imported.scan.id)!;
const managementSummary = { ...summary, archiveBindings: local.bindings };
assert.equal(findArchiveOverviewReady(a, [managementSummary]), managementSummary);
console.log("PASS multiple physical bindings per Raw, active-basis restriction, strong bind proofs, targeted cold 1 Raw/2 validations/0 normalization and warm 0 payload reads");

// A captured candidate cannot recreate an unbound certificate. A changed URL
// requires a new successful payload proof, and counts-only mismatch stays failed.
const captured = (await readDataHubLocalScanMetadata()).bindings;
await deleteGuildHubArchiveScanBinding(a.id, a.sha256);
const removed = await confirmGuildHubArchiveReadiness([a], { expectedBindings: captured });
assert.deepEqual(removed.confirmed, []);
assert.equal((await readDataHubLocalScanMetadata()).bindings.some(binding => binding.archiveScanId === a.id), false);
await bindGuildHubLocalScanToArchiveEntry(a, imported.scan.id);
const changedUrl = { ...a, fileUrl: "https://changed.test/one.json.gz" };
assert.equal((await confirmGuildHubArchiveReadiness([changedUrl])).confirmed.length, 1);
assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), buildScanArchiveInventoryBasis([changedUrl], context)).value, 1);
assert.equal((await confirmGuildHubArchiveReadiness([{ ...a, playerCount: 2 }])).failed.length, 1);
await bindGuildHubLocalScanToArchiveEntry(a, imported.scan.id);
console.log("PASS concurrent proofs join, captured unbind veto, URL revalidation and failed payload expectation");

// Same hash with a new generation invalidates both certificates.
let tx = db.transaction(["scans", "scanSummaries"], "readwrite");
const raw = await tx.objectStore("scans").get(imported.scan.id), projection = await tx.objectStore("scanSummaries").get(imported.scan.id);
raw.sourceGeneration = projection.sourceGeneration = "changed-generation";
await tx.objectStore("scans").put(raw); await tx.objectStore("scanSummaries").put(projection); await tx.done;
local = await readDataHubLocalScanMetadata(); assert.equal(projectLocalArchiveInventory(local, both).value, 0);
const revalidated = await confirmGuildHubArchiveReadiness([a, second]); assert.equal(revalidated.rawReads, 1);
assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), both).value, 2);
await deleteGuildHubArchiveScanBinding(a.id, a.sha256);
assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), both).value, 1);
await updateGuildHubLocalScan(imported.scan.id, "updated.json", content(a, "new-content"));
local = await readDataHubLocalScanMetadata();
assert.equal(projectLocalArchiveInventory(local, both).value, 0); assert.equal(projectLocalArchiveInventory(local, both).candidates.length, 0);
await deleteGuildHubLocalScans([imported.scan.id]);
await importGuildHubLocalScanRecords([raw]);
assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), both).value, 0);
const orphanBinding = { ...local.bindings.find(b => b.archiveScanId === second.id)!, localScanId: "missing-raw" };
await db.put("archiveScanBindings", orphanBinding);
assert.equal(projectLocalArchiveInventory(await readDataHubLocalScanMetadata(), both).value, 0);
// Missing summaries are incomplete inventory, never a complete zero.
await db.delete("scanSummaries", legacy.id);
local = await readDataHubLocalScanMetadata(); assert.equal(local.metadataComplete, false);
assert.ok(projectPersonalScanInventory(local).missingSummaries > 0);
assert.equal(projectPersonalScanInventory(local).personal.status, "partial");
assert.notEqual(archiveExpectation(a), archiveExpectation({ ...a, uncompressedBytes: a.uncompressedBytes + 1 }));
console.log("PASS generation ABA, changed expectation, unbind/update/delete, transferred annotation without binding, missing Raw and missing Summary completeness");

const states: DataHubScanInventory[] = [], heldManifest = deferred<typeof basis>();
const controller = new DataHubScanInventoryController({ loadBasis: () => heldManifest.promise, subscribe: () => () => {} });
controller.subscribe(state => states.push(state)); controller.start();
for (let i = 0; i < 100 && controller.getSnapshot().personal.loading; i++) await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(controller.getSnapshot().personal.loading, false); assert.equal(controller.getSnapshot().available.value, null);
heldManifest.resolve(partial);
for (let i = 0; i < 100 && controller.getSnapshot().available.loading; i++) await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(controller.getSnapshot().available.status, "partial"); assert.equal(controller.getSnapshot().available.value, 1);
controller.dispose(); const afterDispose = states.length; await controller.refreshLocal(); assert.equal(states.length, afterDispose);
const late = deferred<typeof basis>(), fast = deferred<typeof basis>(); let requests = 0;
const raceController = new DataHubScanInventoryController({ loadBasis: () => ++requests === 1 ? late.promise : fast.promise, subscribe: () => () => {} });
raceController.start(); const refreshing = raceController.refreshArchive(); fast.resolve(noActive); await refreshing;
late.resolve(basis); await new Promise(resolve => setTimeout(resolve, 15));
assert.equal(raceController.getSnapshot().available.value, 0); assert.equal(raceController.getSnapshot().available.status, "complete");
raceController.dispose();
let offline = false;
const retryController = new DataHubScanInventoryController({ loadBasis: async () => { if (offline) throw Error("offline"); return basis; }, subscribe: () => () => {} });
await retryController.refreshArchive(); offline = true; await retryController.refreshArchive();
assert.equal(retryController.getSnapshot().lastKnown, true); assert.equal(retryController.getSnapshot().available.status, "partial");
offline = false; await retryController.refreshArchive(); assert.equal(retryController.getSnapshot().lastKnown, false); retryController.dispose();
const identity = { owner: "player-identities", kinds: ["identity"], sourceIds: [], removedSourceIds: [], servers: [], unknownImpact: true, committedAt: "" } as LocalDataChange;
assert.equal(isLocalDataChangeRelevant(identity, { scanInventory: true }), false);
const ownReadiness = { ...identity, owner: "sources", kinds: ["readiness"] } as LocalDataChange;
assert.equal(isLocalDataChangeRelevant(ownReadiness, { scanInventory: true }), false);
assert.equal(isLocalDataChangeRelevant(ownReadiness, { allSources: true }), false);
assert.equal(isLocalDataChangeRelevant({ ...ownReadiness, kinds: ["release"] }, { scanInventory: true }), true);
// Proof failure does not erase the independently completed personal inventory.
const readySource = await importGuildHubLocalScan("proof-fault.json", content(entry("proof-fault")));
const faultEntry = entry("proof-fault"); await bindGuildHubLocalScanToArchiveEntry(faultEntry, readySource.scan.id);
await stripProofs();
const faultBasis = buildScanArchiveInventoryBasis([faultEntry], { ...context, activeYears: [2026], loadedYears: [2026] });
const proofFault = new DataHubScanInventoryController({ loadBasis: async () => faultBasis, confirm: async () => { throw Error("proof failure"); }, subscribe: () => () => {} });
await proofFault.refreshArchive(); assert.equal(proofFault.getSnapshot().personal.loading, false);
assert.notEqual(proofFault.getSnapshot().personal.status, "error"); assert.equal(proofFault.getSnapshot().ready.status, "partial"); proofFault.dispose();
// Held readiness response after disposal cannot publish; caller releases payload
// work independently, and the production controller vetoes the stale result.
const heldProof = deferred<Awaited<ReturnType<typeof confirmGuildHubArchiveReadiness>>>();
let proofStarted = false, published = 0;
const disposedProof = new DataHubScanInventoryController({ loadBasis: async () => faultBasis, confirm: () => { proofStarted = true; return heldProof.promise; }, subscribe: () => () => {} });
disposedProof.subscribe(() => published++); const pendingProof = disposedProof.refreshArchive();
for (let i = 0; i < 100 && !proofStarted; i++) await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(proofStarted, true); disposedProof.dispose(); const beforeLateProof = published;
heldProof.resolve({ confirmed: [], failed: [], rawReads: 0, payloadValidations: 0, normalizationWrites: 0 }); await pendingProof;
assert.equal(published, beforeLateProof);
db.close();
console.log("PASS independent personal state, held manifest, stale answer veto, dispose, last-known offline/retry and irrelevant Identity/own-readiness events");
