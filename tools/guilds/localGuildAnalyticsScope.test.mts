import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
// Each process uses fake-indexeddb only; no browser databases are accessed.
import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import type { LocalPlayerIndexWorkerRequest, LocalPlayerIndexWorkerResponse } from "../../src/lib/player-search/localPlayerIndexClient.ts";
import {
  DERIVED_ANALYTICS_VERSION,
  ensureGuildAnalyticsDerivedData,
  ensureGuildAnalyticsSourceDataFromSummaries,
  readGuildAnalyticsDerivedSource,
  readGuildAnalyticsScopedData,
  reconcileGuildAnalyticsSources,
  ensureGuildAnalyticsDerivedDataFromSummaries,
  ensureGuildAnalyticsScopedDataFromSummaries,
  materializeGuildAnalyticsSource,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import {
  listGuildHubLocalScansReadOnly,
  getGuildHubLocalScan,
  readGuildHubLocalScanSourceInventory,
  type GuildHubLocalScan,
  type GuildHubScanSummary,
} from "../../src/lib/guilds/localScanLibrary.ts";

const packLowerShort = (low: number, high = 0) => low + (high << 16);

const buildCurrentSave = (
  id: number,
  level: number,
  classId: number,
  bases: readonly number[],
  bonuses: readonly number[],
) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = id;
  save[3] = packLowerShort(level);
  save[20] = packLowerShort(classId);
  bases.forEach((value, index) => {
    save[30 + index] = value;
  });
  bonuses.forEach((value, index) => {
    save[35 + index] = value;
  });
  return save;
};

const sourceScanId = "scan-v2-rematerialize";
const sourceUpdatedAt = "2026-09-27T08:00:00.000Z";
const sourceContentHash = "content-hash-v2";
const snapshotTimestamp = Date.UTC(2026, 8, 27, 8);
const snapshotIso = new Date(snapshotTimestamp).toISOString();

const summary: GuildHubScanSummary = {
  sourceScanId,
  filename: "scan.json",
  importedAt: Date.parse(sourceUpdatedAt),
  updatedAt: Date.parse(sourceUpdatedAt),
  importedAtIso: sourceUpdatedAt,
  updatedAtIso: sourceUpdatedAt,
  scannedAt: snapshotIso,
  logicalScanCount: 1,
  firstSnapshotTimestamp: snapshotTimestamp,
  lastSnapshotTimestamp: snapshotTimestamp,
  snapshotTimestamps: [snapshotTimestamp],
  servers: ["s3"],
  playerCount: 1,
  groupCount: 1,
  guildCount: 1,
  guilds: [],
  guildCoverage: {
    uniqueGuildCount: 1,
    completeUniqueGuildCount: 0,
    guildSnapshotCount: 1,
    byServer: [],
    completeGuildSnapshotCount: 0,
    incompleteGuildSnapshotCount: 0,
    overcountGuildSnapshotCount: 0,
    unknownGuildSnapshotCount: 0,
  },
  contentHash: sourceContentHash,
  summaryVersion: 5,
};

let scan: GuildHubLocalScan = {
  id: sourceScanId,
  contentHash: sourceContentHash,
  filename: "scan.json",
  importedAt: sourceUpdatedAt,
  updatedAt: sourceUpdatedAt,
  scannedAt: snapshotIso,
  servers: ["s3"],
  playerCount: 1,
  groupCount: 1,
  guildCount: 1,
  analyticsEnabled: true,
  rawData: {
    players: [
      {
        identifier: "s3_p101",
        name: "Stats Holder",
        prefix: "s3",
        guildIdentifier: "s3_g7",
        guildName: "Guild A",
        timestamp: snapshotTimestamp,
        own: 1,
        saveVersion: 2,
        save: buildCurrentSave(101, 500, 1, [100, 110, 120, 130, 140], [10, 11, 12, 13, 14]),
      },
    ],
    groups: [],
  },
};


({ scan } = await seedLocalSourceValidityFixture(scan));
Object.assign(summary, (await seedLocalSourceValidityFixture(scan)).summary);
const { scan: scanB, summary: summaryB } = await seedLocalSourceValidityFixture({ ...scan, id: "foreign-B", contentHash: "hash-B", sourceGeneration: "B-generation" });
const stores = ["sources", "snapshots", "members", "guilds"] as const;
const stored = async (sourceScanId: string) => {
  const db = await openDB("sfdatahub-guild-analytics");
  const tx = db.transaction([...stores]);
  const result = await Promise.all(stores.map(async (name) =>
    (await tx.objectStore(name).getAll()).filter((row) =>
      row.sourceScanId === sourceScanId)));
  await tx.done;
  db.close();
  return result;
};
const loadCalls: string[] = [];
const sourceDiagnostics: string[] = [];
const options = {
  loadSourceById: async (id: string) => {
    loadCalls.push(id);
    return getGuildHubLocalScan(id);
  },
  onSourceDiagnostic: (entry: { sourceId: string }) => sourceDiagnostics.push(entry.sourceId),
};
const missingSummary = { ...summary, sourceScanId: "missing-request" };
const emptyData = { snapshots: [], members: [], guilds: [] };
const assertB = async (before: unknown, message: string) => assert.deepEqual(await stored(scanB.id), before, message);
const check = (message: string) => console.log(`PASS ${message}`);

await materializeGuildAnalyticsSource(scanB);
const beforeB = await stored(scanB.id);
assert.ok(beforeB.every((rows) => rows.length > 0), "B has real rows in all four stores");
await ensureGuildAnalyticsDerivedDataFromSummaries([summary], options);
await assertB(beforeB, "Cold A must preserve every stored row of warm B");
assert.deepEqual(loadCalls, [scan.id]);
assert.deepEqual(sourceDiagnostics, [scan.id], "B must not be rematerialized");
const beforeA = await stored(scan.id);
assert.ok(beforeA.every((rows) => rows.length > 0));
check("cold A materializes all stores; warm B remains byte-for-byte identical");

loadCalls.length = 0;
sourceDiagnostics.length = 0;
await ensureGuildAnalyticsSourceDataFromSummaries([summary], options);
await ensureGuildAnalyticsScopedDataFromSummaries([summary], options);
await assertB(beforeB, "Both warm subset APIs preserve B");
assert.deepEqual(await stored(scan.id), beforeA);
await ensureGuildAnalyticsSourceDataFromSummaries([], options);
await ensureGuildAnalyticsDerivedDataFromSummaries([], options);
await ensureGuildAnalyticsScopedDataFromSummaries([], options);
await ensureGuildAnalyticsDerivedData([]);
await ensureGuildAnalyticsDerivedData([scan]);
await assertB(beforeB, "Empty and scan-based adapters preserve B");
assert.deepEqual(loadCalls, []);
assert.deepEqual(sourceDiagnostics, []);
await ensureGuildAnalyticsSourceDataFromSummaries([missingSummary], options);
await assertB(beforeB, "Missing requested raw source never deletes B");
assert.deepEqual(await stored(scan.id), beforeA);
await assert.rejects(ensureGuildAnalyticsSourceDataFromSummaries([missingSummary], {
  loadSourceById: async () => scanB,
}), /unexpected source/);
await assertB(beforeB, "Incorrect source loader cannot write outside requested scope");
check("warm, empty, missing, scoped-read and scan adapters preserve foreign persistence");

const analyticsDb = await openDB("sfdatahub-guild-analytics");
const setVersion = async (id: string, version: number) => {
  const row = await analyticsDb.get("sources", id);
  await analyticsDb.put("sources", { ...row, derivedVersion: version });
};
await setVersion(scanB.id, 1);
const oldB = await stored(scanB.id);
let result = await ensureGuildAnalyticsSourceDataFromSummaries([summary], options);
await assertB(oldB, "Foreign old-version rows persist unchanged");
for (const rows of [result.snapshots, result.members, result.guilds]) {
  assert.equal(rows.some((row) => row.sourceScanId === scanB.id), false);
}
assert.deepEqual(await readGuildAnalyticsDerivedSource(scanB.id), emptyData);
assert.deepEqual(await readGuildAnalyticsScopedData({
  guild: { guildId: "eu3_g7", name: "Guild A", server: "eu3" },
}), { snapshots: result.snapshots, members: result.members, guilds: result.guilds });
await setVersion(scan.id, 1);
const versionPhases: string[] = [];
result = await ensureGuildAnalyticsScopedDataFromSummaries([summary], {
  ...options, onDiagnostic: (entry) => versionPhases.push(entry.phase),
}).then((read) => read.data);
assert.equal(versionPhases.includes("derived-reset"), false);
assert.equal((await analyticsDb.get("sources", scan.id)).derivedVersion, DERIVED_ANALYTICS_VERSION);
for (const rows of [result.snapshots, result.members, result.guilds]) {
  assert.equal(rows.some((row) => row.sourceScanId === scanB.id), false);
}
await assertB(oldB, "Requested version repair cannot reset old B");
await ensureGuildAnalyticsSourceDataFromSummaries([summaryB], options);
assert.equal((await analyticsDb.get("sources", scanB.id)).derivedVersion, DERIVED_ANALYTICS_VERSION);
let repairedB = await stored(scanB.id);
check("version mismatch repaired per requested source; all reads exclude invalid versions");

// Initialize schema without migration; all following raw changes affect fake-indexeddb only.
await listGuildHubLocalScansReadOnly();
const rawDb = await openDB("sfdatahub-local-data");
const marker = { key: "migration.guildHubScans", value: { status: "completed" } };
// A missing Raw source can no longer be materialized. Build a valid persisted
// fixture first, then remove only its Raw/Summary to model an existing orphan.
const { scan: orphan } = await seedLocalSourceValidityFixture({ ...scan, id: "true-orphan", contentHash: "hash-orphan" });
await materializeGuildAnalyticsSource(orphan);
await rawDb.delete("scans", orphan.id);
await rawDb.delete("scanSummaries", orphan.id);
const beforeOrphan = await stored(orphan.id);
await rawDb.put("scans", scan);
await rawDb.put("scans", scanB);
// A summary only: B really exists but has no summary at all.
await rawDb.put("scanSummaries", summary);
await rawDb.delete("scanSummaries", scanB.id);
await rawDb.delete("metadata", marker.key);
let reconciliation = await reconcileGuildAnalyticsSources();
assert.equal(reconciliation.status, "incomplete", "Pending legacy migration is incomplete inventory");
assert.deepEqual(reconciliation.removedSourceIds, []);
assert.deepEqual(await stored(orphan.id), beforeOrphan);
await assertB(repairedB, "Incomplete inventory preserves B");
await rawDb.put("metadata", marker);

const originalKeys = IDBObjectStore.prototype.getAllKeys;
IDBObjectStore.prototype.getAllKeys = function (...args) {
  if (this.name === "scans") throw new DOMException("Injected inventory enumeration failure", "UnknownError");
  return originalKeys.apply(this, args);
};
try {
  reconciliation = await reconcileGuildAnalyticsSources();
  assert.equal(reconciliation.status, "incomplete");
  assert.match(reconciliation.reason ?? "", /enumeration failure/);
  assert.deepEqual(reconciliation.removedSourceIds, []);
} finally {
  IDBObjectStore.prototype.getAllKeys = originalKeys;
}
assert.deepEqual(await stored(orphan.id), beforeOrphan);
await assertB(repairedB, "Enumeration failure cannot delete any absent source");
IDBObjectStore.prototype.getAllKeys = function (...args) {
  const request = originalKeys.apply(this, args);
  if (this.name === "scans") this.transaction.abort();
  return request;
};
try {
  reconciliation = await reconcileGuildAnalyticsSources();
  assert.equal(reconciliation.status, "incomplete", "Aborted enumeration transaction is incomplete");
  assert.ok(reconciliation.reason);
  assert.deepEqual(reconciliation.removedSourceIds, []);
} finally {
  IDBObjectStore.prototype.getAllKeys = originalKeys;
}
assert.deepEqual(await stored(orphan.id), beforeOrphan);
await assertB(repairedB, "Transaction abort cannot delete any absent source");
check("incomplete legacy inventory and failed/aborted raw enumeration cause no absence deletion");

// Observe actual raw reads: full existence enumeration must use keys, not payloads.
const originalGet = IDBObjectStore.prototype.get;
const originalGetAll = IDBObjectStore.prototype.getAll;
let rawPayloadReads = 0;
IDBObjectStore.prototype.get = function (...args) {
  if (this.name === "scans") rawPayloadReads += 1;
  return originalGet.apply(this, args);
};
IDBObjectStore.prototype.getAll = function (...args) {
  if (this.name === "scans") rawPayloadReads += 1;
  return originalGetAll.apply(this, args);
};
try {
  assert.deepEqual((await readGuildHubLocalScanSourceInventory()).sourceIds.sort(), [scan.id, scanB.id].sort());
  reconciliation = await reconcileGuildAnalyticsSources();
  assert.equal(rawPayloadReads, 0, "Existence reconciliation does not read raw payloads");
} finally {
  IDBObjectStore.prototype.get = originalGet;
  IDBObjectStore.prototype.getAll = originalGetAll;
}
assert.equal(reconciliation.status, "complete");
assert.deepEqual(reconciliation.removedSourceIds, [orphan.id]);
assert.deepEqual(await stored(orphan.id), [[], [], [], []]);
await assertB(repairedB, "Raw B without summary is not an orphan");
assert.deepEqual(await rawDb.get("scans", scanB.id), scanB);
await ensureGuildAnalyticsSourceDataFromSummaries([summary, summaryB], options);
// U02: a requested source with missing Summary validity is repaired lazily.
repairedB = await stored(scanB.id);
await ensureGuildAnalyticsSourceDataFromSummaries([summary], options);
await assertB(repairedB, "Full preparation/reconciliation followed by subset preserves B");
check("authoritative full inventory deletes only true orphan across all four stores; raw-only B preserved");

// Stale summary exclusion is not raw exclusion. Explicit raw policy is separate from existence.
await rawDb.put("scanSummaries", { ...summaryB, analyticsEnabled: false });
reconciliation = await reconcileGuildAnalyticsSources();
assert.deepEqual(reconciliation.removedSourceIds, []);
await assertB(repairedB, "Stale disabled summary cannot remove enabled raw B");
await rawDb.put("scans", { ...scanB, analyticsEnabled: false });
const policyInventory = await readGuildHubLocalScanSourceInventory();
assert.ok(policyInventory.sourceIds.includes(scanB.id));
assert.deepEqual(policyInventory.analyticsDisabledSourceIds, [scanB.id]);
reconciliation = await reconcileGuildAnalyticsSources();
assert.deepEqual(reconciliation.removedSourceIds, [scanB.id]);
assert.deepEqual(await stored(scanB.id), [[], [], [], []]);
assert.equal((await rawDb.get("scans", scanB.id)).analyticsEnabled, false);
assert.ok((await stored(scan.id)).every((rows) => rows.length > 0), "Policy cleanup preserves A");
await rawDb.put("scans", scanB);
await rawDb.put("scanSummaries", summaryB);
await materializeGuildAnalyticsSource(scanB);
// Remove the Summary after a valid build: missing evidence cannot permit a write,
// while maintenance must still preserve the Raw-only source in the overlap below.
await rawDb.delete("scanSummaries", scanB.id);
const overlapB = await stored(scanB.id);
check("raw-confirmed usage policy removes derived only; stale summary policy cannot delete");

// Deterministic overlap: scoped A waits for raw while full maintenance runs.
await setVersion(scan.id, 1);
let releaseLoad!: () => void;
let reachedLoad!: () => void;
const loaded = new Promise<void>((resolve) => { reachedLoad = resolve; });
const release = new Promise<void>((resolve) => { releaseLoad = resolve; });
const scopedRun = ensureGuildAnalyticsSourceDataFromSummaries([summary], {
  loadSourceById: async (id) => {
    assert.equal(id, scan.id);
    reachedLoad();
    await release;
    return scan;
  },
});
await loaded;
reconciliation = await reconcileGuildAnalyticsSources();
assert.deepEqual(reconciliation.removedSourceIds, []);
await assertB(overlapB, "Overlapping full reconciliation preserves B");
releaseLoad();
await scopedRun;
await assertB(overlapB, "Scoped commit after full reconciliation preserves B");
assert.equal((await analyticsDb.get("sources", scan.id)).derivedVersion, DERIVED_ANALYTICS_VERSION);
check("controlled full/scoped overlap with unchanged raw inventory preserves B");

// Execute the real worker handler in this process, with fake transport and real stores/builders.
let workerHandler: ((event: MessageEvent<LocalPlayerIndexWorkerRequest>) => void) | undefined;
const previousListener = globalThis.addEventListener;
const previousPost = globalThis.postMessage;
const messages: LocalPlayerIndexWorkerResponse[] = [];
let finishWorker!: (response: LocalPlayerIndexWorkerResponse) => void;
const workerFinished = new Promise<LocalPlayerIndexWorkerResponse>((resolve) => { finishWorker = resolve; });
Object.defineProperty(globalThis, "addEventListener", { configurable: true, writable: true,
  value: (name: string, handler: typeof workerHandler) => { if (name === "message") workerHandler = handler; },
});
Object.defineProperty(globalThis, "postMessage", { configurable: true, writable: true,
  value: (response: LocalPlayerIndexWorkerResponse) => {
    messages.push(response);
    if (response.type === "complete" || response.type === "error") finishWorker(response);
  },
});
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  await import("../../src/workers/localPlayerIndex.worker.ts");
  assert.ok(workerHandler);
  workerHandler({ data: {
    type: "build-index", requestId: "w01-real-worker", summaries: [summary],
    serverFilter: null, includeCards: false,
  } } as MessageEvent<LocalPlayerIndexWorkerRequest>);
  const response = await Promise.race([workerFinished, new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Worker harness timeout")), 10000);
  })]);
  assert.equal(response.type, "complete", JSON.stringify(response));
  assert.ok(messages.some((message) => message.type === "progress"));
  if (response.type === "complete") assert.ok(response.index.players.length > 0);
  await assertB(overlapB, "Actual worker subset request preserves foreign persisted rows");
} finally {
  clearTimeout(timeout);
  globalThis.addEventListener = previousListener;
  globalThis.postMessage = previousPost;
}
check("actual player-index worker completes subset request using real store and index builder; B preserved");

analyticsDb.close();
rawDb.close();
console.log("localGuildAnalyticsScope regression passed");
