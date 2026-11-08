import "fake-indexeddb/auto";
import "./fixtures/localDataCoordination/nodeLocks.mjs";
import assert from "node:assert/strict";
import { openDB } from "idb";
import {
  importGuildHubLocalScan, createGuildHubLocalScanImportPreview, commitGuildHubLocalScanPreview,
  bindGuildHubLocalScanToArchiveEntry, getGuildHubLocalScan, readDataHubLocalScanMetadata,
  updateGuildHubLocalScan, importGuildHubLocalScanRecords, readSfDataHubLocalChanges,
  mergeGuildHubScanSources, dissolveGuildHubScanSlot, recoverGuildHubScanSlotMerge, deleteGuildHubLocalScans,
} from "../../src/lib/guilds/localScanLibrary.ts";
import { projectPersonalScanInventory } from "../../src/lib/data-hub/dataHubScanInventory.ts";
import { readCompatibleScanProvenance } from "../../src/lib/guilds/localScanProvenance.ts";
import { createSfDataHubTransferEnvelope, stringifySfDataHubTransfer, parseSfDataHubTransferEnvelope } from "../../src/lib/transfer/sfDataHubTransfer.ts";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../../src/lib/local-data/localDataDependencies.ts";
import { isLocalDataChangeRelevant } from "../../src/lib/local-data/localDataChanges.ts";
import { withLocalDataWrite } from "../../src/lib/local-data/localDataCoordination.ts";
import { entry, content, deferred } from "../scanArchive/fixtures/dataHubScanInventory/data.ts";

const count = async () => projectPersonalScanInventory(await readDataHubLocalScanMetadata());
const userEntry = entry("userfirst"), archiveEntry = entry("archivefirst", 2026, "b");
const first = await importGuildHubLocalScan("my-file.json", content(userEntry));
await bindGuildHubLocalScanToArchiveEntry(userEntry, first.scan.id);
const archive = await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("archive.json", content(archiveEntry)));
await bindGuildHubLocalScanToArchiveEntry(archiveEntry, archive.scan.id);
assert.equal((await count()).personal.value, 1);
const analyticsReceipt = await captureLocalDataDependencies({ allSources: true });
const inventoryReceipt = await captureLocalDataDependencies({ scanInventory: true });
for (let i = 0; i < 3; i++) {
  const duplicate = await importGuildHubLocalScan("new-name.json", content(archiveEntry));
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.scan.id, archive.scan.id);
  assert.equal(duplicate.scan.filename, archive.scan.filename);
  assert.equal(duplicate.scan.importedAt, archive.scan.importedAt);
  assert.equal(duplicate.scan.sourceGeneration, archive.scan.sourceGeneration);
}
assert.equal((await count()).personal.value, 2);
assert.equal((await revalidateLocalDataDependencies(analyticsReceipt)).current, true);
assert.equal((await revalidateLocalDataDependencies(inventoryReceipt)).current, false);
assert.equal((await readDataHubLocalScanMetadata()).bindings.length, 2);
console.log("PASS userfirst/archivefirst, repeated duplicate, overlapping binding, unchanged identity/time/generation and Analytics receipt");

const db = await openDB("sfdatahub-local-data");
// Persisted legacy source and summary, with misleading own/name/archive signals.
for (const label of ["legacy-own", "legacy-archive"]) {
  const e = entry(label, 2026, "c");
  const source = (await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("own-sftools.json", content(e)))).scan;
  const binding = label === "legacy-archive" ? await bindGuildHubLocalScanToArchiveEntry(e, source.id) : undefined;
  const tx = db.transaction(["scans", "scanSummaries"], "readwrite");
  const raw = await tx.objectStore("scans").get(source.id), summary = await tx.objectStore("scanSummaries").get(source.id);
  delete raw.provenance; delete summary.provenance;
  if (binding) { raw.archiveSource = binding; summary.archiveSource = binding; }
  await tx.objectStore("scans").put(raw); await tx.objectStore("scanSummaries").put(summary); await tx.done;
}
assert.equal((await count()).unknownOrigins, 2);
const legacy = (await readDataHubLocalScanMetadata()).summaries.find(s => s.provenance === undefined && s.archiveSource)!;
const legacyRaw = (await getGuildHubLocalScan(legacy.sourceScanId))!;
const oldTime = legacyRaw.importedAt;
await importGuildHubLocalScan("different.json", content(entry("legacy-archive", 2026, "c")));
const positive = (await getGuildHubLocalScan(legacy.sourceScanId))!;
assert.equal(positive.importedAt, oldTime);
assert.equal(positive.provenance?.history, "unknown");
assert.ok(positive.provenance?.personalImport);
assert.equal((await count()).unknownOrigins, 1);
console.log("PASS legacy unknown, old archive unknown, own/name/absence are not proof, explicit legacy duplicate positive");

const updated = await updateGuildHubLocalScan(first.scan.id, "update.json", content(userEntry, "changed-text"));
assert.equal(updated.id, first.scan.id); assert.notEqual(updated.contentHash, first.scan.contentHash);
assert.equal(updated.provenance?.contentHash, updated.contentHash);
assert.ok(updated.provenance?.personalImport);
const envelope = parseSfDataHubTransferEnvelope(stringifySfDataHubTransfer(createSfDataHubTransferEnvelope("scan", updated)));
assert.equal(envelope.type, "scan");
await deleteGuildHubLocalScans([updated.id]);
await importGuildHubLocalScanRecords([updated]);
assert.ok((await getGuildHubLocalScan(updated.id))?.provenance?.personalImport);
const without = { ...(await createGuildHubLocalScanImportPreview("transferred.json", content(entry("no-proof")))), provenance: undefined };
await importGuildHubLocalScanRecords([without]);
assert.equal((await getGuildHubLocalScan(without.id))?.provenance, undefined);
const bad = { ...(await createGuildHubLocalScanImportPreview("bad-transfer.json", content(entry("bad-proof")))), provenance: { ...updated.provenance!, version: 99 as 1 } };
await importGuildHubLocalScanRecords([bad]);
assert.equal((await getGuildHubLocalScan(bad.id))?.provenance, undefined);
// Duplicate transport preserves a positive compatible proof without inventing an observation.
const transported = { ...without, provenance: { ...updated.provenance!, sourceId: without.id, contentHash: without.contentHash } };
await importGuildHubLocalScanRecords([transported]);
assert.deepEqual((await getGuildHubLocalScan(without.id))?.provenance?.personalImport, updated.provenance?.personalImport);
assert.equal(readCompatibleScanProvenance({ ...transported, contentHash: "changed" }), undefined);
console.log("PASS personal update, transfer roundtrip, unknown/incompatible transfer, duplicate transport and content-bound invalidation");

const beforeSlot = (await count()).personal.value;
const slot = await mergeGuildHubScanSources([archive.scan.id, positive.id], "slot.json", { mode: "scan-slot", displayName: "Slot" });
assert.equal((await count()).personal.value, beforeSlot);
assert.equal(slot.provenance?.role, "synthetic");
assert.equal((await getGuildHubLocalScan(archive.scan.id))?.analyticsEnabled, false);
await recoverGuildHubScanSlotMerge(slot.id);
assert.equal((await count()).personal.value, beforeSlot);
await dissolveGuildHubScanSlot(slot.id);
assert.equal((await count()).personal.value, beforeSlot);
const merge = await mergeGuildHubScanSources([archive.scan.id, positive.id], "bundle.json");
assert.equal((await count()).personal.value, beforeSlot);
const syntheticDuplicate = await importGuildHubLocalScan("my-bundle.json", `${JSON.stringify(merge.rawData, null, 2)}\n`);
assert.equal(syntheticDuplicate.status, "duplicate"); assert.equal(syntheticDuplicate.scan.id, merge.id);
assert.equal(syntheticDuplicate.scan.provenance?.role, "synthetic"); assert.equal(syntheticDuplicate.scan.provenance?.personalImport, undefined);
assert.equal((await count()).personal.value, beforeSlot);
await deleteGuildHubLocalScans([positive.id]);
assert.equal((await count()).personal.value, beforeSlot! - 1);
assert.ok((await getGuildHubLocalScan(merge.id))?.mergedSourceIds?.includes(positive.id));
console.log("PASS contained/deactivated originals, synthetic slot/merge, recovery/dissolution and deleted original references");

const raceEntry = entry("race"), racePreview = await createGuildHubLocalScanImportPreview("system.json", content(raceEntry));
const both = await Promise.all([commitGuildHubLocalScanPreview(racePreview), importGuildHubLocalScan("user.json", content(raceEntry))]);
assert.equal(new Set(both.map(r => r.scan.id)).size, 1);
await Promise.all([bindGuildHubLocalScanToArchiveEntry(raceEntry, both[0].scan.id), importGuildHubLocalScan("again.json", content(raceEntry))]);
assert.ok((await getGuildHubLocalScan(both[0].scan.id))?.provenance?.personalImport);
assert.ok((await readDataHubLocalScanMetadata()).bindings.some(b => b.localScanId === both[0].scan.id));
// Source is removed after duplicate preflight while its writer is queued.
const held = deferred<void>(), release = deferred<void>();
const critical = withLocalDataWrite(async () => { held.resolve(); await release.promise; }); await held.promise;
const deletedId = both[0].scan.id;
const deletionQueued = deferred<void>(), duplicateQueued = deferred<void>();
const lockRequest = navigator.locks.request.bind(navigator.locks);
let queuePosition = 0;
Object.defineProperty(navigator.locks, "request", { configurable: true, value: (...args: any[]) => {
  (++queuePosition === 1 ? deletionQueued : duplicateQueued).resolve();
  return (lockRequest as any)(...args);
} });
const deleting = deleteGuildHubLocalScans([deletedId]);
await deletionQueued.promise;
const duplicateRace = importGuildHubLocalScan("after-delete.json", content(raceEntry));
await duplicateQueued.promise;
Object.defineProperty(navigator.locks, "request", { configurable: true, value: lockRequest });
release.resolve(); await critical; await deleting;
const replacement = await duplicateRace;
assert.notEqual(replacement.scan.id, deletedId);
assert.equal(await db.get("scans", deletedId), undefined);
console.log("PASS serialized archive/user races and duplicate preflight cannot annotate deleted source");

const sameObservation = await importGuildHubLocalScan("different-text.json", content(userEntry, "other content at same server/time"));
assert.notEqual(sameObservation.scan.id, first.scan.id);
assert.notEqual(sameObservation.scan.contentHash, first.scan.contentHash);
assert.equal(sameObservation.scan.scannedAt, first.scan.scannedAt);
console.log("PASS same server/time with different JSON text remains another original source");

const rollbackSource = await commitGuildHubLocalScanPreview(await createGuildHubLocalScanImportPreview("rollback.json", content(entry("rollback"))));
const prototype = IDBObjectStore.prototype;
const originalPut = prototype.put;
prototype.put = function(value: any, key?: IDBValidKey) {
  if (this.name === "scanSummaries" && value.sourceScanId === rollbackSource.scan.id && value.provenance?.personalImport) throw new Error("injected provenance transaction failure");
  return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
};
const journalBefore = (await readSfDataHubLocalChanges()).length;
try { await assert.rejects(importGuildHubLocalScan("rollback-user.json", content(entry("rollback"))), /injected provenance/); }
finally { prototype.put = originalPut; }
assert.equal((await db.get("scans", rollbackSource.scan.id)).provenance.personalImport, undefined);
assert.equal((await db.get("scanSummaries", rollbackSource.scan.id)).provenance.personalImport, undefined);
assert.equal((await readSfDataHubLocalChanges()).length, journalBefore);
const failurePreview = await createGuildHubLocalScanImportPreview("analytics-error.json", content(entry("analytics-error")));
await assert.rejects(commitGuildHubLocalScanPreview(failurePreview, { personalSFToolsImport: true, analytics: {
  onPhase: phase => { if (phase.phase === "saving-derived-analytics") throw new Error("injected Analytics failure"); },
} }), /injected Analytics/);
assert.ok((await db.get("scans", failurePreview.id)).provenance.personalImport);
assert.ok((await db.get("scanSummaries", failurePreview.id)).provenance.personalImport);
const provenanceChange = (await readSfDataHubLocalChanges()).find(change => change.kinds.every(k => k === "provenance"))!;
assert.equal(isLocalDataChangeRelevant(provenanceChange, { allSources: true }), false);
assert.equal(isLocalDataChangeRelevant(provenanceChange, { scanInventory: true }), true);
db.close();
console.log("PASS aborted provenance commit has no half-proof/journal and committed Raw survives later Analytics error");
