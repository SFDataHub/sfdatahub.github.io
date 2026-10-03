import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { deleteDB, openDB } from "idb";

import {
  getSfDataHubArchiveSearchIndexCache,
  getSfDataHubLocalScan,
  listSfDataHubArchiveScanBindings,
  listSfDataHubArchiveSearchIndexCacheRecords,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  __localFirstScanAcquisitionTestUtils,
  acquireExplicitLocalFirstArchiveScans,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import {
  __scanArchiveSearchIndexServiceTestUtils,
  collectArchiveEntriesForSearchResults,
  collectScanArchiveEntriesFromToplistSelections,
  loadScanArchiveSearchIndexSet,
} from "../../src/lib/scanArchive/searchIndexService.ts";
import type {
  ScanArchiveEntry,
  ScanArchiveManifest,
  ScanArchiveSearchIndexPayload,
} from "../../src/lib/scanArchive/types.ts";
import { validateDownloadedScanArchiveSearchIndex } from "../../src/lib/scanArchive/compressedJson.ts";
import type { ScanArchiveToplistSelectionResult } from "../../src/lib/scanArchive/toplistSelection.ts";

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-analytics");
__scanArchiveSearchIndexServiceTestUtils.clearInFlightSearchIndexes();
__localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();

const now = new Date(Date.UTC(2026, 8, 20, 12, 0, 0)).toISOString();
const legacyDb = await openDB("sfdatahub-local-data", 3, {
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
  },
});
await legacyDb.put("scans", {
  id: "legacy-local-scan",
  contentHash: "legacy-content-hash",
  filename: "legacy.json",
  importedAt: now,
  scannedAt: null,
  servers: [],
  playerCount: 0,
  groupCount: 0,
  rawData: { players: [], groups: [] },
});
await legacyDb.put("archiveScanBindings", {
  key: `legacy-archive:${"a".repeat(64)}`,
  provider: "scan-archive",
  archiveScanId: "legacy-archive",
  archiveYear: 2026,
  manifestRevision: 1,
  manifestUrl: "https://example.test/2026/manifest.json",
  path: "2026-09/f8_net/legacy.json.gz",
  sha256: "a".repeat(64),
  server: "f8_net",
  timestamp: Date.UTC(2026, 8, 1),
  localScanId: "legacy-local-scan",
  localContentHash: "legacy-content-hash",
  createdAt: now,
  updatedAt: now,
});
legacyDb.close();

assert.equal((await getSfDataHubLocalScan("legacy-local-scan"))?.id, "legacy-local-scan");
assert.equal((await listSfDataHubArchiveScanBindings()).some((binding) => binding.archiveScanId === "legacy-archive"), true);

const manifestUrl = "https://archive.example.test/2026/manifest.json";
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const rawSourceHash = (char: string) => char.repeat(64);
const toArrayBuffer = (buffer: Buffer) =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

type SearchFixture = {
  entry: ScanArchiveEntry;
  bytes: Buffer;
  payload: ScanArchiveSearchIndexPayload;
};

const makeFixture = (
  id: string,
  server: string,
  timestamp: number,
  sourceHashChar: string,
  players: ScanArchiveSearchIndexPayload["players"],
  guilds: ScanArchiveSearchIndexPayload["guilds"],
): SearchFixture => {
  const sourceSha256 = rawSourceHash(sourceHashChar);
  const payload: ScanArchiveSearchIndexPayload = {
    schemaVersion: 1,
    archiveScanId: id,
    sourceSha256,
    server,
    timestamp,
    players,
    guilds,
  };
  const json = JSON.stringify(payload);
  const bytes = gzipSync(Buffer.from(json, "utf8"), { level: 9, mtime: 0 });
  const date = new Date(timestamp);
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const entry: ScanArchiveEntry = {
    id,
    server,
    timestamp,
    timestampUtc: date.toISOString(),
    path: `${month}/${server}/${id}.json.gz`,
    format: "sftools.raw.v1",
    compression: "gzip",
    sha256: sourceSha256,
    compressedBytes: 100,
    uncompressedBytes: 200,
    playerCount: players.length,
    groupCount: guilds.length,
    archiveYear: date.getUTCFullYear(),
    manifestRevision: 7,
    manifestUrl,
    fileUrl: new URL(`${month}/${server}/${id}.json.gz`, manifestUrl).toString(),
    searchIndex: {
      schemaVersion: 1,
      path: `${month}/${server}/${id}.search.json.gz`,
      sha256: hash(bytes),
      compressedBytes: bytes.byteLength,
      uncompressedBytes: Buffer.byteLength(json, "utf8"),
      playerCount: players.length,
      groupCount: guilds.length,
    },
  };
  return { entry, bytes, payload };
};

const baseTs = Date.UTC(2026, 8, 19, 21, 0, 0);
const f8 = makeFixture(
  "f8-current",
  "f8_net",
  baseTs,
  "1",
  [
    { identifier: "f8-alpha", name: "Alpha", guildIdentifier: "f8-knights", guildName: "Knights", classId: 1 },
    { identifier: "f8-uber", name: "ÜberHeld", guildIdentifier: "f8-raeuber", guildName: "Räuber" },
    { identifier: "f8-same", name: "SameName" },
    { identifier: "f8-dupe", name: "Dupe" },
    { identifier: "f8-dupe", name: "Dupe" },
  ],
  [
    { identifier: "f8-knights", name: "Knights" },
    { identifier: "f8-raeuber", name: "Räuber" },
  ],
);
const s30 = makeFixture(
  "s30-current",
  "s30_eu",
  baseTs + 1_000,
  "2",
  [
    { identifier: "s30-beta", name: "Beta", guildIdentifier: "s30-knights", guildName: "Knights EU30" },
    { identifier: "s30-same", name: "SameName" },
  ],
  [{ identifier: "s30-knights", name: "Knights EU30" }],
);
const stumble = makeFixture(
  "stumble-current",
  "stumblesteppe_net",
  baseTs + 2_000,
  "3",
  [{ identifier: "stumble-gamma", name: "Gamma" }],
  [{ identifier: "stumble-guild", name: "Stumble Guild" }],
);
const unselected = makeFixture(
  "unselected",
  "f8_net",
  baseTs + 3_000,
  "4",
  [{ identifier: "unselected-player", name: "Unselected" }],
  [{ identifier: "unselected-guild", name: "Unselected Guild" }],
);
const sharedOlder = makeFixture(
  "shared-older",
  "f8_net",
  baseTs + 4_000,
  "9",
  [{ identifier: "shared-player", name: "Shared Hero Old", guildIdentifier: "shared-guild", guildName: "Shared Guild Old" }],
  [{ identifier: "shared-guild", name: "Shared Guild Old" }],
);
const sharedNewer = makeFixture(
  "shared-newer",
  "f8_net",
  baseTs + 5_000,
  "a",
  [{ identifier: "shared-player", name: "Shared Hero New", guildIdentifier: "shared-guild", guildName: "Shared Guild New" }],
  [{ identifier: "shared-guild", name: "Shared Guild New" }],
);

const allBytes = new Map<string, Buffer>([
  [f8.entry.id, f8.bytes],
  [s30.entry.id, s30.bytes],
  [stumble.entry.id, stumble.bytes],
  [unselected.entry.id, unselected.bytes],
  [sharedOlder.entry.id, sharedOlder.bytes],
  [sharedNewer.entry.id, sharedNewer.bytes],
]);

const downloader = (downloads: string[], bytesById = allBytes) => async (entry: ScanArchiveEntry) => {
  downloads.push(entry.id);
  const bytes = bytesById.get(entry.id);
  if (!bytes) throw new Error(`unexpected download:${entry.id}`);
  return validateDownloadedScanArchiveSearchIndex(entry, toArrayBuffer(bytes));
};

{
  const downloads: string[] = [];
  const result = await loadScanArchiveSearchIndexSet([f8.entry, s30.entry, stumble.entry], {
    dependencies: { downloadSearchIndex: downloader(downloads) },
  });
  assert.equal(result.status, "complete");
  assert.equal(result.networkAccessed, true);
  assert.deepEqual(downloads.sort(), [f8.entry.id, s30.entry.id, stumble.entry.id].sort());
  assert.equal(downloads.includes(unselected.entry.id), false);
  assert.equal(result.loadedIndexes.every((item) => item.source === "download"), true);
  assert.equal(result.searchSet.searchPlayers("Unselected").length, 0);
}

{
  const downloads: string[] = [];
  const second = await loadScanArchiveSearchIndexSet([f8.entry, s30.entry, stumble.entry], {
    dependencies: { downloadSearchIndex: downloader(downloads) },
  });
  assert.equal(second.status, "complete");
  assert.equal(second.networkAccessed, false);
  assert.deepEqual(downloads, []);
  assert.equal(second.loadedIndexes.every((item) => item.source === "cache"), true);
}

{
  __scanArchiveSearchIndexServiceTestUtils.clearInFlightSearchIndexes();
  const downloads: string[] = [];
  const afterRestart = await loadScanArchiveSearchIndexSet([f8.entry, s30.entry, stumble.entry], {
    dependencies: { downloadSearchIndex: downloader(downloads) },
  });
  assert.equal(afterRestart.status, "complete");
  assert.deepEqual(downloads, []);
}

{
  const changed = makeFixture(
    f8.entry.id,
    f8.entry.server,
    f8.entry.timestamp,
    "1",
    [{ identifier: "f8-new", name: "New Alpha" }],
    [{ identifier: "f8-new-guild", name: "New Guild" }],
  );
  const downloads: string[] = [];
  const result = await loadScanArchiveSearchIndexSet([changed.entry], {
    dependencies: { downloadSearchIndex: downloader(downloads, new Map([[changed.entry.id, changed.bytes]])) },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(downloads, [f8.entry.id]);
  assert.equal(result.searchSet.searchPlayers("New Alpha").length, 1);
}

const expectFailedAndUncached = async (entry: ScanArchiveEntry, bytes: Buffer, expectedCode: string) => {
  const result = await loadScanArchiveSearchIndexSet([entry], {
    dependencies: {
      downloadSearchIndex: async (downloadEntry) => validateDownloadedScanArchiveSearchIndex(downloadEntry, toArrayBuffer(bytes)),
    },
  });
  assert.equal(result.status, "empty");
  assert.equal(result.failedIndexes[0].errorCode, expectedCode);
  assert.equal(await getSfDataHubArchiveSearchIndexCache(entry), null);
};

{
  const badSize = { ...unselected.entry, id: "bad-size", searchIndex: { ...unselected.entry.searchIndex!, compressedBytes: unselected.bytes.byteLength + 1 } };
  await expectFailedAndUncached(badSize, unselected.bytes, "hash-or-size-error");

  const badSha = { ...unselected.entry, id: "bad-sha", searchIndex: { ...unselected.entry.searchIndex!, sha256: "f".repeat(64) } };
  await expectFailedAndUncached(badSha, unselected.bytes, "hash-or-size-error");

  const invalidGzip = Buffer.from("not gzip", "utf8");
  const badGzip = {
    ...unselected.entry,
    id: "bad-gzip",
    searchIndex: { ...unselected.entry.searchIndex!, sha256: hash(invalidGzip), compressedBytes: invalidGzip.byteLength },
  };
  await expectFailedAndUncached(badGzip, invalidGzip, "gzip-json-or-structure-error");

  const invalidJsonBytes = gzipSync(Buffer.from("{", "utf8"), { level: 9, mtime: 0 });
  const badJson = {
    ...unselected.entry,
    id: "bad-json",
    searchIndex: {
      ...unselected.entry.searchIndex!,
      sha256: hash(invalidJsonBytes),
      compressedBytes: invalidJsonBytes.byteLength,
      uncompressedBytes: 1,
    },
  };
  await expectFailedAndUncached(badJson, invalidJsonBytes, "gzip-json-or-structure-error");

  const wrongPayloadJson = JSON.stringify({ ...unselected.payload, archiveScanId: "other" });
  const wrongPayloadBytes = gzipSync(Buffer.from(wrongPayloadJson, "utf8"), { level: 9, mtime: 0 });
  const wrongPayload = {
    ...unselected.entry,
    id: "bad-payload",
    searchIndex: {
      ...unselected.entry.searchIndex!,
      sha256: hash(wrongPayloadBytes),
      compressedBytes: wrongPayloadBytes.byteLength,
      uncompressedBytes: Buffer.byteLength(wrongPayloadJson, "utf8"),
    },
  };
  await expectFailedAndUncached(wrongPayload, wrongPayloadBytes, "server-or-timestamp-mismatch");
}

{
  const ok = makeFixture(
    "partial-ok",
    "f8_net",
    baseTs + 10_000,
    "5",
    [{ identifier: "partial-player", name: "Partial Hero" }],
    [{ identifier: "partial-guild", name: "Partial Guild" }],
  );
  const fail = makeFixture(
    "partial-fail",
    "s30_eu",
    baseTs + 11_000,
    "6",
    [{ identifier: "partial-fail-player", name: "Fail Hero" }],
    [{ identifier: "partial-fail-guild", name: "Fail Guild" }],
  );
  const result = await loadScanArchiveSearchIndexSet([ok.entry, fail.entry], {
    dependencies: {
      downloadSearchIndex: async (entry) => {
        if (entry.id === fail.entry.id) throw new Error("Suchindex-Download fehlgeschlagen (500).");
        return validateDownloadedScanArchiveSearchIndex(entry, toArrayBuffer(ok.bytes));
      },
    },
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.loadedIndexes.map((item) => item.archiveScanId), [ok.entry.id]);
  assert.deepEqual(result.failedIndexes.map((item) => item.archiveScanId), [fail.entry.id]);
  assert.equal(result.searchSet.searchPlayers("Partial").length, 1);
}

const cached = await loadScanArchiveSearchIndexSet([f8.entry, s30.entry, stumble.entry], {
  dependencies: { downloadSearchIndex: downloader([]) },
});
assert.equal(cached.searchSet.searchPlayers(" alpha ")[0].identifier, "f8-alpha");
assert.equal(cached.searchSet.searchPlayers("F8-ALPHA")[0].name, "Alpha");
assert.equal(cached.searchSet.searchPlayers("held")[0].name, "ÜberHeld");
assert.equal(cached.searchSet.searchPlayers("überheld")[0].identifier, "f8-uber");
assert.equal(cached.searchSet.searchPlayers("Knights").some((hit) => hit.identifier === "f8-alpha"), true);
assert.equal(cached.searchSet.searchGuilds("räuber")[0].identifier, "f8-raeuber");
assert.equal(cached.searchSet.searchGuilds("f8-knights")[0].name, "Knights");
assert.equal(cached.searchSet.search("sameName").length, 2);
assert.deepEqual(cached.searchSet.searchPlayers("sameName").map((hit) => hit.server).sort(), ["f8_net", "s30_eu"]);
assert.equal(cached.searchSet.searchPlayers("dupe").length, 1);
assert.deepEqual(cached.searchSet.search("a", { servers: ["F8", "s30_eu"] }).map((hit) => hit.server).filter((server, index, list) => list.indexOf(server) === index).sort(), ["f8_net", "s30_eu"]);
assert.equal(cached.searchSet.search("Gamma", { servers: ["F8", "s30_eu"] }).length, 0);
assert.equal(cached.searchSet.search("Gamma").length, 1);

{
  const result = await loadScanArchiveSearchIndexSet([sharedOlder.entry, sharedNewer.entry], {
    dependencies: { downloadSearchIndex: downloader([]) },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.searchSet.getUniqueEntityCounts(), { players: 1, guilds: 1 });
  assert.deepEqual(result.searchSet.searchPlayers("Shared Hero").map((hit) => hit.archiveScanId), [sharedNewer.entry.id]);
  assert.deepEqual(result.searchSet.searchGuilds("Shared Guild").map((hit) => hit.archiveScanId), [sharedNewer.entry.id]);
}

{
  const key = "explicit-shared-set";
  const entries = [sharedOlder.entry, sharedNewer.entry].map(entry => ({ ...entry, toplistSetKey: key, toplistSetScanIds: [sharedOlder.entry.id, sharedNewer.entry.id] }));
  const result = await loadScanArchiveSearchIndexSet(entries, { dependencies: { downloadSearchIndex: downloader([]) } });
  const hits = result.searchSet.searchGuilds("Shared Guild");
  assert.equal(hits.length, 1);
  // The hit is an index source. Acquisition expands its explicit set so the
  // derivation can choose the authoritative complete guild/member basis.
  assert.deepEqual(result.searchSet.collectArchiveEntriesForResults(hits).map(entry => entry.id), entries.map(entry => entry.id));
}

const alphaHit = cached.searchSet.searchPlayers("Alpha")[0];
assert.equal(alphaHit.kind, "player");
assert.equal(alphaHit.archiveScanId, f8.entry.id);
assert.equal(alphaHit.archiveSha256, f8.entry.sha256);
assert.equal(alphaHit.scanTimestamp, f8.entry.timestamp);
assert.equal(alphaHit.manifestYear, f8.entry.archiveYear);
assert.equal(cached.searchSet.getArchiveEntryForResult(alphaHit)?.id, f8.entry.id);
assert.deepEqual(cached.searchSet.collectArchiveEntriesForResults([alphaHit]).map((entry) => entry.id), [f8.entry.id]);
assert.deepEqual(collectArchiveEntriesForSearchResults([alphaHit], [f8.entry, s30.entry]).map((entry) => entry.id), [f8.entry.id]);

{
  const currentManifest: ScanArchiveManifest = {
    schemaVersion: 1,
    archiveYear: 2026,
    revision: 7,
    updatedAt: now,
    scanCount: 2,
    serverCount: 1,
    scans: [f8.entry, s30.entry],
    toplists: {
      schemaVersion: 1,
      current: { f8_net: f8.entry.id },
      monthly: { "2026-09": { s30_eu: s30.entry.id } },
    },
  };
  const currentSelection: ScanArchiveToplistSelectionResult = {
    status: "selected",
    role: "current",
    server: "f8_net",
    manifest: currentManifest,
    scans: [f8.entry],
    searchIndexes: [f8.entry.searchIndex!],
  };
  const monthlySelection: ScanArchiveToplistSelectionResult = {
    status: "selected",
    role: "monthly",
    server: "s30_eu",
    month: "2026-09",
    manifest: currentManifest,
    scans: [s30.entry],
    searchIndexes: [s30.entry.searchIndex!],
  };
  const entries = collectScanArchiveEntriesFromToplistSelections([currentSelection, monthlySelection], { 2026: manifestUrl });
  assert.deepEqual(entries.map((entry) => entry.id), [f8.entry.id, s30.entry.id]);
  const result = await loadScanArchiveSearchIndexSet(entries, { dependencies: { downloadSearchIndex: downloader([]) } });
  assert.equal(result.status, "complete");
}

{
  const currentManifest: ScanArchiveManifest = {
    schemaVersion: 1,
    archiveYear: 2026,
    revision: 7,
    updatedAt: now,
    scanCount: 2,
    serverCount: 1,
    scans: [sharedOlder.entry, sharedNewer.entry],
    toplists: {
      schemaVersion: 1,
      current: { f8_net: { scanIds: [sharedOlder.entry.id, sharedNewer.entry.id] } },
    },
  };
  const selection: ScanArchiveToplistSelectionResult = {
    status: "selected",
    role: "current",
    server: "f8_net",
    manifest: currentManifest,
    scans: [sharedOlder.entry, sharedNewer.entry],
    searchIndexes: [sharedOlder.entry.searchIndex!, sharedNewer.entry.searchIndex!],
  };
  const entries = collectScanArchiveEntriesFromToplistSelections([selection], { 2026: manifestUrl });
  assert.deepEqual(entries.map((entry) => entry.id), [sharedOlder.entry.id, sharedNewer.entry.id]);
  assert.equal(new Set(entries.map((entry) => entry.toplistSetKey)).size, 1);
  assert.deepEqual(entries[0].toplistSetScanIds, [sharedOlder.entry.id, sharedNewer.entry.id]);
}

{
  __scanArchiveSearchIndexServiceTestUtils.clearInFlightSearchIndexes();
  const parallel = makeFixture(
    "parallel-index",
    "f8_net",
    baseTs + 20_000,
    "7",
    [{ identifier: "parallel-player", name: "Parallel Hero" }],
    [{ identifier: "parallel-guild", name: "Parallel Guild" }],
  );
  const downloads: string[] = [];
  const options = {
    dependencies: {
      downloadSearchIndex: async (entry: ScanArchiveEntry) => {
        downloads.push(entry.id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return validateDownloadedScanArchiveSearchIndex(entry, toArrayBuffer(parallel.bytes));
      },
    },
  };
  const [left, right] = await Promise.all([
    loadScanArchiveSearchIndexSet([parallel.entry], options),
    loadScanArchiveSearchIndexSet([parallel.entry], options),
  ]);
  assert.equal(left.status, "complete");
  assert.equal(right.status, "complete");
  assert.deepEqual(downloads, [parallel.entry.id]);
}

{
  const rawEntry = {
    ...makeFixture(
      "raw-regression",
      "f8_net",
      baseTs + 30_000,
      "8",
      [{ identifier: "raw-player", name: "Raw Player" }],
      [{ identifier: "raw-guild", name: "Raw Guild" }],
    ).entry,
    playerCount: 1,
    groupCount: 1,
  };
  const rawContent = JSON.stringify({
    players: [{ prefix: rawEntry.server, timestamp: rawEntry.timestamp, identifier: "raw-player", name: "Raw Player" }],
    groups: [{ prefix: rawEntry.server, timestamp: rawEntry.timestamp, identifier: "raw-guild", name: "Raw Guild" }],
  });
  const result = await acquireExplicitLocalFirstArchiveScans([rawEntry], {
    dependencies: {
      downloadArchiveEntry: async () => ({ content: rawContent }),
    },
  });
  assert.equal(result.status, "complete");
  assert.equal(result.selectedArchives[0].archiveScanId, rawEntry.id);
}

assert.equal((await listSfDataHubArchiveSearchIndexCacheRecords()).some((record) => record.archiveScanId === f8.entry.id), true);
assert.equal((await listSfDataHubArchiveScanBindings()).some((binding) => binding.archiveScanId === "legacy-archive"), true);

console.log("searchIndexService.test: ok");
