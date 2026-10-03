import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB, openDB } from "idb";

import {
  commitSfDataHubLocalScanPreview,
  createSfDataHubLocalScanImportPreview,
  deleteSfDataHubLocalScans,
  getSfDataHubLocalScan,
  listSfDataHubArchiveScanBindings,
  listSfDataHubArchiveSearchIndexCacheRecords,
  putSfDataHubLocalToplistSnapshotRecord,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  LOCAL_TOPLIST_DERIVATION_VERSION,
  deleteLocalToplistSnapshot,
  getLocalToplistSnapshot,
  listLocalToplistSnapshots,
  localToplistDatasetId,
  localToplistSnapshotCacheKey,
  putLocalToplistSnapshot,
} from "../../src/lib/toplists/localToplistStore.ts";
import type { LocalToplistDerivedSnapshotPayload } from "../../src/lib/toplists/localToplistWorkerTypes.ts";

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-analytics");

const sha = "a".repeat(64);
const timestamp = Date.UTC(2026, 8, 19, 21, 0, 0);
const now = new Date(timestamp).toISOString();

const legacyDb = await openDB("sfdatahub-local-data", 4, {
  upgrade(db) {
    const scanStore = db.createObjectStore("scans", { keyPath: "id" });
    scanStore.createIndex("by_contentHash", "contentHash", { unique: true });
    scanStore.createIndex("by_importedAt", "importedAt");
    const summaryStore = db.createObjectStore("scanSummaries", { keyPath: "sourceScanId" });
    summaryStore.createIndex("by_importedAt", "importedAt");
    summaryStore.createIndex("by_updatedAt", "updatedAt");
    db.createObjectStore("metadata", { keyPath: "key" });
    const bindingStore = db.createObjectStore("archiveScanBindings", { keyPath: "key" });
    bindingStore.createIndex("by_localScanId", "localScanId");
    const searchStore = db.createObjectStore("archiveSearchIndexes", { keyPath: "key" });
    searchStore.createIndex("by_archiveScanId", "archiveScanId");
  },
});
await legacyDb.put("scans", {
  id: "legacy-scan",
  contentHash: "legacy-content",
  filename: "legacy.json",
  importedAt: now,
  scannedAt: now,
  servers: ["f8_net"],
  playerCount: 0,
  groupCount: 0,
  rawData: { players: [], groups: [] },
});
await legacyDb.put("archiveScanBindings", {
  key: `legacy:${sha}`,
  provider: "scan-archive",
  archiveScanId: "legacy",
  archiveYear: 2026,
  manifestRevision: 1,
  manifestUrl: "https://example.test/manifest.json",
  path: "2026-09/f8_net/legacy.json.gz",
  sha256: sha,
  server: "f8_net",
  timestamp,
  localScanId: "legacy-scan",
  localContentHash: "legacy-content",
  createdAt: now,
  updatedAt: now,
});
await legacyDb.put("archiveSearchIndexes", {
  key: `legacy:${"b".repeat(64)}`,
  archiveScanId: "legacy",
  archiveYear: 2026,
  manifestRevision: 1,
  manifestUrl: "https://example.test/manifest.json",
  server: "f8_net",
  timestamp,
  sourceSha256: sha,
  searchIndexPath: "2026-09/f8_net/legacy.search.json.gz",
  searchIndexSha256: "b".repeat(64),
  compressedBytes: 1,
  uncompressedBytes: 1,
  playerCount: 0,
  groupCount: 0,
  payload: { schemaVersion: 1, archiveScanId: "legacy", sourceSha256: sha, server: "f8_net", timestamp, players: [], guilds: [] },
  createdAt: now,
  updatedAt: now,
});
legacyDb.close();

assert.equal((await getSfDataHubLocalScan("legacy-scan"))?.id, "legacy-scan");
assert.equal((await listSfDataHubArchiveScanBindings()).some((binding) => binding.archiveScanId === "legacy"), true);
assert.equal((await listSfDataHubArchiveSearchIndexCacheRecords()).some((record) => record.archiveScanId === "legacy"), true);

const payload: LocalToplistDerivedSnapshotPayload = {
  manifestYear: 2026,
  archiveScanId: "legacy",
  archiveSha256: sha,
  server: "F8",
  scanTimestamp: timestamp,
  localScanId: "legacy-scan",
  localContentHash: "legacy-content",
  playerRows: [],
  guildRows: [],
  snapshotMeta: {
    server: "F8",
    sourceServer: "f8_net",
    archiveScanId: "legacy",
    archiveSha256: sha,
    scanTimestamp: timestamp,
    manifestYear: 2026,
    localScanId: "legacy-scan",
    playerCount: 0,
    guildCount: 0,
    issues: [],
  },
  issues: [],
};

const stored = await putLocalToplistSnapshot(payload);
assert.equal(stored.key, localToplistSnapshotCacheKey({ archiveScanId: "legacy", archiveSha256: sha }));
assert.equal(stored.derivationVersion, LOCAL_TOPLIST_DERIVATION_VERSION);
assert.equal(stored.derivationVersion >= 2, true);

const expectation = {
  manifestYear: 2026,
  archiveScanId: "legacy",
  archiveSha256: sha,
  server: "F8",
  scanTimestamp: timestamp,
  localScanId: "legacy-scan",
  localContentHash: "legacy-content",
};

const hit = await getLocalToplistSnapshot(expectation);
assert.equal(hit.status, "hit");
assert.equal(hit.status === "hit" ? hit.record.localContentHash : "", "legacy-content");

const oldVersionKey = localToplistSnapshotCacheKey({
  archiveScanId: "legacy",
  archiveSha256: sha,
  derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1,
});
await putSfDataHubLocalToplistSnapshotRecord({
  ...stored,
  key: oldVersionKey,
  derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1,
});
assert.equal((await getLocalToplistSnapshot(expectation)).status, "hit");
assert.equal((await getLocalToplistSnapshot({ ...expectation, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1 })).status, "hit");

await putSfDataHubLocalToplistSnapshotRecord({
  ...stored,
  key: localToplistSnapshotCacheKey({ archiveScanId: "missing-version", archiveSha256: sha }),
  archiveScanId: "missing-version",
  // Legacy records without an explicit derivationVersion must be rejected.
  derivationVersion: undefined,
} as Parameters<typeof putSfDataHubLocalToplistSnapshotRecord>[0]);
const missingVersion = await getLocalToplistSnapshot({ ...expectation, archiveScanId: "missing-version" });
assert.equal(missingVersion.status, "miss");
assert.equal(missingVersion.status === "miss" ? missingVersion.reason : "", "invalid-structure");

assert.equal((await getLocalToplistSnapshot({ ...expectation, archiveSha256: "c".repeat(64) })).status, "miss");
assert.equal((await getLocalToplistSnapshot({ ...expectation, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION + 1 })).status, "miss");
assert.equal((await getLocalToplistSnapshot({ ...expectation, localContentHash: "changed" })).status, "miss");
assert.notEqual(
  localToplistSnapshotCacheKey({ archiveScanId: "legacy", archiveSha256: sha, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1 }),
  localToplistSnapshotCacheKey({ archiveScanId: "legacy", archiveSha256: sha }),
);
assert.notEqual(
  localToplistDatasetId([{ id: "legacy", sha256: sha }], LOCAL_TOPLIST_DERIVATION_VERSION - 1),
  localToplistDatasetId([{ id: "legacy", sha256: sha }]),
);
assert.match(localToplistDatasetId([{ id: "legacy", sha256: sha }]), new RegExp(`^derivation:${LOCAL_TOPLIST_DERIVATION_VERSION}\\|`));

await deleteLocalToplistSnapshot({ archiveScanId: "legacy", archiveSha256: sha });
await deleteLocalToplistSnapshot({ archiveScanId: "legacy", archiveSha256: sha, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1 });
await deleteLocalToplistSnapshot({ archiveScanId: "missing-version", archiveSha256: sha });
assert.equal((await listLocalToplistSnapshots()).length, 0);
assert.equal((await getSfDataHubLocalScan("legacy-scan"))?.id, "legacy-scan");

await putLocalToplistSnapshot(payload);
assert.equal((await listLocalToplistSnapshots()).length, 1);
await deleteSfDataHubLocalScans(["legacy-scan"]);
assert.equal(await getSfDataHubLocalScan("legacy-scan"), null);
assert.equal((await listLocalToplistSnapshots()).length, 0);

const userContent = JSON.stringify({
  players: [{ prefix: "f8_net", timestamp, identifier: "f8_net_p1", name: "User", class: 1, level: 1 }],
  groups: [],
});
const preview = await createSfDataHubLocalScanImportPreview("user.json", userContent);
const committed = await commitSfDataHubLocalScanPreview(preview);
await putLocalToplistSnapshot({ ...payload, archiveScanId: "user-bound", localScanId: committed.scan.id, localContentHash: committed.scan.contentHash });
await deleteLocalToplistSnapshot({ archiveScanId: "user-bound", archiveSha256: sha });
assert.equal((await getSfDataHubLocalScan(committed.scan.id))?.archiveSource, undefined);

console.log("localToplistStore.test: ok");
