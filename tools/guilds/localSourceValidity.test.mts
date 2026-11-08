import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import {
  getGuildHubLocalScan, listGuildHubScanSummaries, importGuildHubLocalScan,
  createGuildHubLocalScanImportPreview, commitGuildHubLocalScanPreview, importGuildHubLocalScanRecords,
  deleteGuildHubLocalScans, mergeGuildHubScanSources, dissolveGuildHubScanSlot, recoverGuildHubScanSlotMerge,
  readGuildHubLocalScanSourceValidity, updateGuildHubLocalScan,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  DERIVED_ANALYTICS_VERSION, ensureGuildAnalyticsSourceDataFromSummaries,
  materializeGuildAnalyticsSource, readGuildAnalyticsDerivedSource,
  readGuildAnalyticsScopedData,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import { GUILD_SCAN_NORMALIZER_VERSION } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { acquireExplicitLocalFirstArchiveScans } from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import { loadOrBuildLocalToplistSnapshots, type LocalToplistServiceDependencies } from "../../src/lib/toplists/localToplistService.ts";
import { getLocalToplistSnapshot, localToplistSnapshotCacheKey, putLocalToplistSnapshot, LOCAL_TOPLIST_DERIVATION_VERSION } from "../../src/lib/toplists/localToplistStore.ts";
import type { LocalToplistDerivationWorkerSource, LocalToplistDerivedSnapshotPayload, LocalToplistDerivationWorkerRequest, LocalToplistDerivationWorkerResponse } from "../../src/lib/toplists/localToplistWorkerTypes.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";

const timestamp = Date.UTC(2026, 9, 5, 12);
const entry = (id: string, server: string, char: string): ScanArchiveEntry => ({
  id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(),
  path: `${server}/${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip",
  sha256: char.repeat(64), compressedBytes: 1, uncompressedBytes: 1,
  playerCount: 1, groupCount: 1, archiveYear: 2026, manifestRevision: 1,
  manifestUrl: "https://example.test/manifest.json", fileUrl: `https://example.test/${id}.json.gz`,
});
const a = entry("validity-A", "f8_net", "a");
const b = entry("validity-B", "s30_eu", "b");
const content = (archive: ScanArchiveEntry) => JSON.stringify({
  players: [{ identifier: `${archive.server}_p1`, prefix: archive.server, timestamp,
    name: archive.id, class: 1, level: 100, guildIdentifier: `${archive.server}_g1`, guildName: archive.id }],
  groups: [{ identifier: `${archive.server}_g1`, prefix: archive.server, timestamp, name: archive.id }],
});
let downloads = 0;
let workerRuns = 0;
const derive = async (sources: LocalToplistDerivationWorkerSource[]): Promise<LocalToplistDerivedSnapshotPayload[]> => {
  workerRuns++;
  return Promise.all(sources.map(async (source) => {
    const scan = await getGuildHubLocalScan(source.localScanId);
    assert.ok(scan);
    const result = deriveLocalToplistsFromConfirmedScans([{
      ...source, rawScan: scan.rawData,
    }]);
    assert.ok(result.snapshots[0]);
    return { ...source, server: result.snapshots[0].server, playerRows: result.players,
      guildRows: result.guilds, snapshotMeta: result.snapshots[0], issues: result.issues };
  }));
};
const dependencies: Partial<LocalToplistServiceDependencies> = {
  acquireEntries: (entries, options) => acquireExplicitLocalFirstArchiveScans(entries, {
    ...options, dependencies: { downloadArchiveEntry: async (archive) => {
      downloads++; return { content: content(archive) };
    } },
  }),
  deriveInWorker: derive,
};
const initialA = await loadOrBuildLocalToplistSnapshots([a], { dependencies });
const initialB = await loadOrBuildLocalToplistSnapshots([b], { dependencies });
assert.equal(initialA.status, "complete");
assert.equal(initialB.status, "complete");
const aId = initialA.readySelections[0].localScanId;
const bId = initialB.readySelections[0].localScanId;
const rawDb = await openDB("sfdatahub-local-data");
const analyticsDb = await openDB("sfdatahub-guild-analytics");
const stores = ["sources", "snapshots", "members", "guilds"];
const analyticsRows = async (id: string) => Promise.all(stores.map(async (store) =>
  (await analyticsDb.getAll(store)).filter((row) => row.sourceScanId === id)));
const bBefore = await analyticsRows(bId);
const bCacheKey = localToplistSnapshotCacheKey({ archiveScanId: b.id, archiveSha256: b.sha256 });
const bCacheBefore = await rawDb.get("localToplistSnapshots", bCacheKey);
const aBefore = await getGuildHubLocalScan(aId);
assert.ok(aBefore);
const oldSummary = await rawDb.get("scanSummaries", aId);
const staleTx = rawDb.transaction(["scans", "scanSummaries"], "readwrite");
await Promise.all([
  staleTx.objectStore("scans").put({ ...aBefore, normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 }),
  staleTx.objectStore("scanSummaries").put({ ...oldSummary, normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 }),
]);
await staleTx.done;
assert.equal((await readGuildAnalyticsDerivedSource(aId)).members.length, 0);
assert.equal((await readGuildAnalyticsScopedData({ guild: { guildId: "f8_g1", name: a.id, server: "f8" } })).members.length, 0);
// Reading summaries alone must not normalize every stale source in the pool.
await listGuildHubScanSummaries();
assert.equal((await rawDb.get("scans", aId)).normalizerVersion, GUILD_SCAN_NORMALIZER_VERSION - 1);
const loads: string[] = [];
const ensure = async (summary = oldSummary) => ensureGuildAnalyticsSourceDataFromSummaries([summary], {
  loadSourceById: async (id) => { loads.push(id); return getGuildHubLocalScan(id); },
});
const repaired = await ensure();
assert.ok(repaired.members.some((row) => row.sourceScanId === aId));
const aRepaired = await getGuildHubLocalScan(aId);
assert.ok(aRepaired);
assert.equal(aRepaired.contentHash, aBefore.contentHash);
assert.equal(aRepaired.updatedAt, aBefore.updatedAt);
assert.notEqual(aRepaired.sourceGeneration, aBefore.sourceGeneration);
assert.deepEqual(loads, [aId]);
assert.deepEqual(await analyticsRows(bId), bBefore);
assert.deepEqual(await rawDb.get("localToplistSnapshots", bCacheKey), bCacheBefore);
// Warm ensure uses the durable Summary over an older caller snapshot: zero Raw reads.
loads.length = 0;
const originalGet = IDBObjectStore.prototype.get;
let rawReads = 0;
IDBObjectStore.prototype.get = function (...args) {
  if (this.name === "scans") rawReads++;
  return originalGet.apply(this, args);
};
try { await ensure(); } finally { IDBObjectStore.prototype.get = originalGet; }
assert.deepEqual(loads, []);
assert.equal(rawReads, 0);
console.log("PASS same-hash Normalizer repair, atomic Raw/Summary generation, warm zero-Raw ensure and foreign-source preservation");

// Independently stale marker versions and legacy missing validity never count as hits.
for (const change of [
  { normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 },
  { coreNormalizerVersion: 0 },
  { sourceGeneration: undefined },
  { derivedVersion: DERIVED_ANALYTICS_VERSION - 1 },
]) {
  const marker = await analyticsDb.get("sources", aId);
  await analyticsDb.put("sources", { ...marker, ...change });
  assert.equal((await readGuildAnalyticsDerivedSource(aId)).members.length, 0);
  loads.length = 0;
  await ensure();
  assert.deepEqual(loads, [aId]);
  assert.deepEqual(await analyticsRows(bId), bBefore);
}
const aToplistAfterRepair = await loadOrBuildLocalToplistSnapshots([a], { dependencies });
assert.equal(aToplistAfterRepair.workerRan, true);
const warmToplist = await loadOrBuildLocalToplistSnapshots([a], { dependencies });
assert.equal(warmToplist.workerRan, false);
assert.equal(downloads, 2);
console.log("PASS Legacy/Normalizer/Core/Derivation misses; Toplist renews only A without downloading again");

// Identical builds join within this realm; the source fingerprint includes versions.
let materializations = 0;
await Promise.all([
  materializeGuildAnalyticsSource(aRepaired, { onSourceDiagnostic: () => materializations++ }),
  materializeGuildAnalyticsSource(aRepaired, { onSourceDiagnostic: () => materializations++ }),
]);
assert.equal(materializations, 1);
// A current source marker cannot relabel an old-generation/old-derivation row.
const firstMember = (await analyticsDb.getAll("members")).find((row) => row.sourceScanId === aId);
assert.ok(firstMember);
await analyticsDb.put("members", { ...firstMember, derivedVersion: DERIVED_ANALYTICS_VERSION - 1 });
assert.equal((await readGuildAnalyticsDerivedSource(aId)).members.length, 0);
await analyticsDb.put("members", firstMember);
console.log("PASS identical Analytics builds join; per-row derivation prevents mixed-version publication");

// A failed source replacement must roll back its deletes and all four stores.
const aRowsBeforeFailure = await analyticsRows(aId);
await assert.rejects(materializeGuildAnalyticsSource(aRepaired, {
  onDiagnostic: (entry) => { if (entry.phase === "derived-members-write") throw new Error("Injected commit failure"); },
}), /Injected commit failure/);
assert.deepEqual(await analyticsRows(aId), aRowsBeforeFailure);
assert.deepEqual(await analyticsRows(bId), bBefore);
console.log("PASS failed Analytics replacement rolls back marker, deletes and rows together");

// Hold an actual materialization at its first derivation yield. Only scheduling
// is controlled: all Library writes, validity reads and Analytics commits are real.
const pauseMaterialization = async (scan: NonNullable<Awaited<ReturnType<typeof getGuildHubLocalScan>>>) => {
  const originalTimeout = globalThis.setTimeout;
  let armed = false;
  let release!: () => void;
  let reached!: () => void;
  const paused = new Promise<void>((resolve) => { reached = resolve; });
  let successfulCommits = 0;
  let replacementTransactions = 0;
  const originalTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    if (this.name === "sfdatahub-guild-analytics" && args[1] === "readwrite") replacementTransactions++;
    return originalTransaction.apply(this, args);
  };
  globalThis.setTimeout = ((callback: () => void, delay?: number, ...args: unknown[]) => {
    if (armed && delay === 0) {
      armed = false;
      globalThis.setTimeout = originalTimeout;
      release = callback;
      reached();
      return originalTimeout(() => {}, 0);
    }
    return originalTimeout(callback, delay, ...args);
  }) as typeof setTimeout;
  const job = materializeGuildAnalyticsSource(scan, {
    onPhase: (phase) => { if (phase.phase === "normalizing-historical-data") armed = true; },
    onSourceDiagnostic: () => successfulCommits++,
  }).then(() => null, (error: unknown) => error);
  try { await paused; } finally {
    globalThis.setTimeout = originalTimeout;
    IDBDatabase.prototype.transaction = originalTransaction;
  }
  return {
    resume: async () => {
      replacementTransactions = 0;
      IDBDatabase.prototype.transaction = function (...args) {
        if (this.name === "sfdatahub-guild-analytics" && args[1] === "readwrite") replacementTransactions++;
        return originalTransaction.apply(this, args);
      };
      try { release(); return await job; } finally {
        IDBDatabase.prototype.transaction = originalTransaction;
      }
    },
    assertNoReplacement: () => {
      assert.equal(successfulCommits, 0);
      assert.equal(replacementTransactions, 0);
    },
    assertDiscarded: (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /changed before Analytics commit/);
      assert.equal(successfulCommits, 0);
      assert.equal(replacementTransactions, 0);
    },
  };
};

for (const sameHash of [false, true]) {
  const oldScan = await getGuildHubLocalScan(aId);
  assert.ok(oldScan);
  const pending = await pauseMaterialization(oldScan);
  const nextContent = sameHash ? JSON.stringify(oldScan.rawData) : content({ ...a, id: "new-A-content" });
  let newScan = await updateGuildHubLocalScan(aId, "updated-a.json", nextContent);
  if (sameHash) {
    // Keep every compared field except generation unchanged to prove that the
    // generation itself (an opaque token) is checked, independently of time/hash.
    newScan = { ...newScan, updatedAt: oldScan.updatedAt };
    const tx = rawDb.transaction(["scans", "scanSummaries"], "readwrite");
    const summary = await tx.objectStore("scanSummaries").get(aId);
    await Promise.all([
      tx.objectStore("scans").put(newScan),
      tx.objectStore("scanSummaries").put({ ...summary, updatedAtIso: oldScan.updatedAt }),
    ]);
    await tx.done;
    assert.equal(newScan.updatedAt, oldScan.updatedAt);
    assert.equal(newScan.importedAt, oldScan.importedAt);
    assert.equal(newScan.normalizerVersion, oldScan.normalizerVersion);
    assert.equal(newScan.coreNormalizerVersion, oldScan.coreNormalizerVersion);
  }
  assert.notEqual(newScan.sourceGeneration, oldScan.sourceGeneration);
  assert.equal(newScan.contentHash === oldScan.contentHash, sameHash);
  await materializeGuildAnalyticsSource(newScan);
  const newRows = await analyticsRows(aId);
  assert.ok(newRows.every((rows) => rows.length > 0));
  assert.equal(newRows[0][0].sourceGeneration, newScan.sourceGeneration);
  const foreignRows = await analyticsRows(bId);
  const error = await pending.resume();
  // Inspect physical storage BEFORE any read filter or recovery Ensure.
  assert.deepEqual(await analyticsRows(aId), newRows);
  assert.deepEqual(await analyticsRows(bId), foreignRows);
  pending.assertDiscarded(error);
  const readable = await readGuildAnalyticsDerivedSource(aId);
  assert.ok(readable.members.every((row) => row.sourceGeneration === newScan.sourceGeneration));
  assert.equal(readable.snapshots.length, newRows[1].length);
  assert.equal(readable.members.length, newRows[2].length);
  assert.equal(readable.guilds.length, newRows[3].length);
}
await updateGuildHubLocalScan(aId, "a.json", content(a));
assert.deepEqual(await analyticsRows(bId), bBefore);
console.log("PASS delayed old Analytics job preserves new physical four-store state, including same-hash generation change, without recovery Ensure");

// Missing/invalid durable evidence never permits replacement or cleanup.
// Each case imports a separate source through the regular Library commit path.
const invalidEvidence: Array<[string, Record<string, unknown> | "missing-summary" | "missing-raw" | "deleted" | "read-error"]> = [
  ["missing-summary", "missing-summary"],
  ["missing-raw", "missing-raw"],
  ["deleted", "deleted"],
  ["missing-generation", { sourceGeneration: undefined }],
  ["old-normalizer", { normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION - 1 }],
  ["old-core", { coreNormalizerVersion: 0 }],
  ["invalid-summary-schema", { summaryVersion: 0 }],
  ["missing-time", { importedAtIso: undefined, updatedAtIso: undefined }],
  ["missing-hash", { contentHash: undefined }],
  ["different-hash", { contentHash: "changed-hash" }],
  ["different-time", { updatedAtIso: "2026-10-05T00:00:00.000Z" }],
  ["disabled", { analyticsEnabled: false }],
  ["read-error", "read-error"],
];
for (const [name, change] of invalidEvidence) {
  const result = await importGuildHubLocalScan(`${name}.json`, content({ ...a, id: name }));
  const scan = result.scan;
  const pending = await pauseMaterialization(scan);
  if (change === "missing-summary") await rawDb.delete("scanSummaries", scan.id);
  else if (change === "missing-raw") await rawDb.delete("scans", scan.id);
  else if (change === "deleted") await deleteGuildHubLocalScans([scan.id]);
  else if (typeof change !== "string") {
    const summary = await rawDb.get("scanSummaries", scan.id);
    await rawDb.put("scanSummaries", { ...summary, ...change });
  }
  const before = await analyticsRows(scan.id);
  const foreignBefore = await analyticsRows(bId);
  const rawBefore = await rawDb.get("scans", scan.id);
  const summaryBefore = await rawDb.get("scanSummaries", scan.id);
  const originalRead = IDBObjectStore.prototype.get;
  if (change === "read-error") IDBObjectStore.prototype.get = function (...args) {
    if (this.name === "scanSummaries") throw new Error("Injected validity read failure");
    return originalRead.apply(this, args);
  };
  let error: unknown;
  try { error = await pending.resume(); } finally { IDBObjectStore.prototype.get = originalRead; }
  assert.deepEqual(await analyticsRows(scan.id), before, name);
  assert.deepEqual(await analyticsRows(bId), foreignBefore, name);
  assert.deepEqual(await rawDb.get("scans", scan.id), rawBefore, name);
  assert.deepEqual(await rawDb.get("scanSummaries", scan.id), summaryBefore, name);
  if (change === "read-error") {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Injected validity read failure/);
    pending.assertNoReplacement();
  } else pending.assertDiscarded(error);
  if (change === "deleted") assert.ok(before.every((rows) => rows.length === 0));
}
console.log("PASS missing/deleted Raw, missing/invalid Summary, versions, hash, time, policy and read failure reject before any replacement; foreign source preserved");

// Counterchecks for the authorized Library order change: transfer, slot activation,
// dissolution and staging recovery all commit durable evidence before Analytics.
const rawFailurePreview = await createGuildHubLocalScanImportPreview("raw-failure.json", content({ ...a, id: "raw-failure" }));
await assert.rejects(commitGuildHubLocalScanPreview(rawFailurePreview, {
  onBeforeRawCommit: () => { throw new Error("Injected Raw commit failure"); },
}), /Injected Raw commit failure/);
assert.equal(await rawDb.get("scans", rawFailurePreview.id), undefined);
assert.equal(await rawDb.get("scanSummaries", rawFailurePreview.id), undefined);
assert.ok((await analyticsRows(rawFailurePreview.id)).every((items) => items.length === 0));
const analyticsFailurePreview = await createGuildHubLocalScanImportPreview("analytics-failure.json", content({ ...a, id: "analytics-failure" }));
await assert.rejects(commitGuildHubLocalScanPreview(analyticsFailurePreview, {
  analytics: { onDiagnostic: (entry) => {
    if (entry.phase === "derived-members-write") throw new Error("Injected post-Raw Analytics failure");
  } },
}), /Injected post-Raw Analytics failure/);
const persistedAfterFailure = await getGuildHubLocalScan(analyticsFailurePreview.id);
assert.ok(persistedAfterFailure);
assert.ok((await analyticsRows(persistedAfterFailure.id)).every((items) => items.length === 0));
await materializeGuildAnalyticsSource(persistedAfterFailure);
const disabledPreview = await createGuildHubLocalScanImportPreview("disabled-transfer.json", content({ ...a, id: "disabled-transfer" }));
const disabledTransfer = await importGuildHubLocalScanRecords([{ ...disabledPreview, analyticsEnabled: false }]);
assert.equal(disabledTransfer.imported.length, 1);
const disabledScan = disabledTransfer.imported[0];
assert.equal((await rawDb.get("scans", disabledScan.id)).analyticsEnabled, false);
assert.ok((await analyticsRows(disabledScan.id)).every((items) => items.length === 0));
await assert.rejects(materializeGuildAnalyticsSource(disabledScan), /changed before Analytics commit/);
const transferPreview = await createGuildHubLocalScanImportPreview("transfer.json", content({ ...a, id: "transfer" }));
const transferred = await importGuildHubLocalScanRecords([transferPreview]);
assert.equal(transferred.imported.length, 1);
const transferId = transferred.imported[0].id;
const slotSource = (await importGuildHubLocalScan("slot-source.json", content({ ...b, id: "slot-source" }))).scan;
const assertCurrentStored = async (id: string) => {
  const live = (await readGuildHubLocalScanSourceValidity([id])).get(id);
  assert.ok(live);
  const rows = await analyticsRows(id);
  assert.ok(rows.every((items) => items.length > 0));
  assert.equal(rows[0][0].sourceGeneration, live.sourceGeneration);
  assert.equal((await readGuildAnalyticsDerivedSource(id)).members.length, rows[2].length);
};
await assertCurrentStored(transferId);
await assertCurrentStored(persistedAfterFailure.id);
const slot = await mergeGuildHubScanSources([transferId, slotSource.id], "slot.json", { mode: "scan-slot", displayName: "Validity slot" });
await assertCurrentStored(slot.id);
// Model an interrupted persisted staging slot, then use the actual recovery path.
const stagingTx = rawDb.transaction(["scans", "scanSummaries"], "readwrite");
const stagingSummary = await stagingTx.objectStore("scanSummaries").get(slot.id);
await Promise.all([
  stagingTx.objectStore("scans").put({ ...slot, scanSlotStatus: "staging", analyticsEnabled: false }),
  stagingTx.objectStore("scanSummaries").put({ ...stagingSummary, scanSlotStatus: "staging", analyticsEnabled: false }),
]);
await stagingTx.done;
assert.equal((await recoverGuildHubScanSlotMerge(slot.id)).status, "completed");
await assertCurrentStored(slot.id);
await dissolveGuildHubScanSlot(slot.id);
assert.ok((await analyticsRows(slot.id)).every((items) => items.length === 0));
assert.equal(await rawDb.get("scans", slot.id), undefined);
await assertCurrentStored(transferId);
await assertCurrentStored(slotSource.id);
assert.deepEqual(await analyticsRows(bId), bBefore);
console.log("PASS regular import/update, transfer (including disabled), slot activation/recovery/dissolution and Raw/Analytics failure boundaries preserve current materialization and foreign source");

const changeGeneration = async (generation: string) => {
  const tx = rawDb.transaction(["scans", "scanSummaries"], "readwrite");
  const [scan, summary] = await Promise.all([tx.objectStore("scans").get(aId), tx.objectStore("scanSummaries").get(aId)]);
  await Promise.all([tx.objectStore("scans").put({ ...scan, sourceGeneration: generation }),
    tx.objectStore("scanSummaries").put({ ...summary, sourceGeneration: generation })]);
  await tx.done;
};
const validity = (await readGuildHubLocalScanSourceValidity([aId])).get(aId);
assert.ok(validity);
const staleCachePayload = await rawDb.get("localToplistSnapshots", localToplistSnapshotCacheKey({ archiveScanId: a.id, archiveSha256: a.sha256 }));
const expectation = { ...staleCachePayload, ...validity, archiveScanId: a.id, archiveSha256: a.sha256, localScanId: aId,
  localContentHash: aRepaired.contentHash, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION };
assert.equal((await getLocalToplistSnapshot(expectation)).status, "miss");
await assert.rejects(putLocalToplistSnapshot(staleCachePayload), /changed before cache commit/);
console.log("PASS stale Toplist generation rejects cache commit");

// Source changes during worker execution: no old result is returned as ready.
const workerRunsBefore = workerRuns;
const staleServiceResult = await loadOrBuildLocalToplistSnapshots([a], {
  dependencies: { ...dependencies, deriveInWorker: async (sources) => {
    const payloads = await derive(sources);
    await changeGeneration("changed-during-worker");
    return payloads;
  } },
});
assert.equal(staleServiceResult.readySelections.length, 0);
assert.equal(staleServiceResult.failedSelections.length, 1);
assert.equal(workerRuns, workerRunsBefore + 1);
assert.equal((await loadOrBuildLocalToplistSnapshots([a], { dependencies })).status, "complete");
assert.deepEqual(await rawDb.get("localToplistSnapshots", bCacheKey), bCacheBefore);

// Run the actual worker handler with fake transport and isolated IndexedDB.
let handler: ((event: MessageEvent<LocalToplistDerivationWorkerRequest>) => void) | undefined;
let finish!: (message: LocalToplistDerivationWorkerResponse) => void;
const previousListener = globalThis.addEventListener;
const previousPost = globalThis.postMessage;
Object.defineProperty(globalThis, "addEventListener", { configurable: true, writable: true,
  value: (_type: string, callback: typeof handler) => { handler = callback; } });
Object.defineProperty(globalThis, "postMessage", { configurable: true, writable: true,
  value: (message: LocalToplistDerivationWorkerResponse) => {
    if (message.type !== "progress") finish(message);
  } });
try {
  await import("../../src/workers/localToplistDerivation.worker.ts");
  assert.ok(handler);
  const acquired = await acquireExplicitLocalFirstArchiveScans([a]);
  const scan = await getGuildHubLocalScan(aId);
  assert.ok(scan);
  assert.ok(acquired);
  const source: LocalToplistDerivationWorkerSource = {
    manifestYear: a.archiveYear, archiveScanId: a.id, archiveSha256: a.sha256,
    server: a.server, scanTimestamp: timestamp, localScanId: aId, localContentHash: scan.contentHash,
    sourceGeneration: scan.sourceGeneration, normalizerVersion: scan.normalizerVersion,
    coreNormalizerVersion: scan.coreNormalizerVersion,
    confirmation: { kind: "archiveSource", archiveScanId: a.id, archiveSha256: a.sha256 },
  };
  const dispatch = async (requestId: string, value: LocalToplistDerivationWorkerSource) => {
    const response = new Promise<LocalToplistDerivationWorkerResponse>((resolve) => { finish = resolve; });
    handler!({ data: { type: "derive-toplists", requestId, sources: [value] } } as MessageEvent<LocalToplistDerivationWorkerRequest>);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([response, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Worker harness timeout")), 10000);
    })]); } finally { clearTimeout(timeout); }
  };
  const valid = await dispatch("valid-source", source);
  assert.equal(valid.type, "complete", JSON.stringify(valid));
  if (valid.type === "complete") assert.equal(valid.snapshots[0].sourceGeneration, scan.sourceGeneration);
  assert.equal((await dispatch("stale-source", { ...source, sourceGeneration: "old-generation" })).type, "error");
} finally {
  globalThis.addEventListener = previousListener;
  globalThis.postMessage = previousPost;
}
const beforeUpdate = await getGuildHubLocalScan(aId);
const updated = await updateGuildHubLocalScan(aId, "a.json", content(a));
assert.equal(updated.contentHash, beforeUpdate?.contentHash);
assert.notEqual(updated.sourceGeneration, beforeUpdate?.sourceGeneration);
assert.equal(downloads, 2);
rawDb.close(); analyticsDb.close();
console.log("PASS service rejects source change during worker; real worker preserves validity and rejects old token; same-hash update gets fresh generation");
console.log("localSourceValidity regression passed");
