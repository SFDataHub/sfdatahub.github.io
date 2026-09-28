import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { gzipSync, gunzipSync } from "node:zlib";
import { deleteDB } from "idb";

import {
  commitGuildHubLocalScanPreview,
  createGuildHubLocalScanImportPreview,
  deleteGuildHubLocalScans,
  deriveGuildHubLogicalScanSnapshots,
  findGuildHubLocalScanByArchiveScanId,
  listGuildHubScanSummaries,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  toScanArchiveEntries,
  validateScanArchiveCatalog,
  validateScanArchiveManifest,
  validateScanArchivePayload,
} from "../../src/lib/scanArchive/validation.ts";
import { createScanArchiveSourceMetadata } from "../../src/lib/scanArchive/client.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

const manifestUrl = "https://raw.githubusercontent.com/SFDataHub/scan-archive-2026/main/manifest.json";
const timestampA = Date.UTC(2026, 8, 19, 21, 24, 56, 141);
const timestampB = Date.UTC(2026, 8, 19, 22, 24, 56, 141);

const makePayload = (timestamp = timestampA) => ({
  players: [
    {
      prefix: "stumblesteppe_net",
      timestamp,
      identifier: "stumblesteppe_net_p1",
      name: "Archive Player",
      class: 1,
      level: 100,
      group: "stumblesteppe_net_g1",
      groupname: "Archive Guild",
    },
  ],
  groups: [
    {
      prefix: "stumblesteppe_net",
      timestamp,
      identifier: "stumblesteppe_net_g1",
      name: "Archive Guild",
      rank: 1,
    },
  ],
});

const makeManifest = (year: number, timestamp = timestampA): ScanArchiveManifest => ({
  schemaVersion: 1,
  archiveYear: year,
  revision: 1,
  updatedAt: new Date(timestamp).toISOString(),
  scanCount: 1,
  serverCount: 1,
  scans: [
    {
      id: `stumblesteppe_net:${timestamp}`,
      server: "stumblesteppe_net",
      timestamp,
      timestampUtc: new Date(timestamp).toISOString(),
      path: `${year}-09/stumblesteppe_net/${year}-09-19_212456141Z.json.gz`,
      format: "sftools.raw.v1",
      compression: "gzip",
      sha256: "a".repeat(64),
      compressedBytes: 12,
      uncompressedBytes: 24,
      playerCount: 1,
      groupCount: 1,
    },
  ],
});

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-hub");
await deleteDB("sfdatahub-guild-analytics");

const catalog = validateScanArchiveCatalog({
  schemaVersion: 1,
  archives: [
    { year: 2026, active: true, manifestUrl },
    { year: 2027, active: false, manifestUrl: "https://example.test/2027/manifest.json" },
  ],
});
assert.equal(catalog.archives.length, 2);
assert.throws(() => validateScanArchiveCatalog({ schemaVersion: 2, archives: [] }), /Version/);

const manifest = validateScanArchiveManifest(makeManifest(2026), 2026);
const [entry] = toScanArchiveEntries(manifest, manifestUrl);
assert.equal(entry.fileUrl, `${manifestUrl.replace("manifest.json", "")}${entry.path}`);
assert.throws(() => validateScanArchiveManifest({ ...makeManifest(2026), scans: [{ ...makeManifest(2026).scans[0], path: "../x.gz" }] }, 2026), /Unsicherer/);

const merged = [
  ...toScanArchiveEntries(validateScanArchiveManifest(makeManifest(2026), 2026), manifestUrl),
  ...toScanArchiveEntries(validateScanArchiveManifest(makeManifest(2027, Date.UTC(2027, 0, 1)), 2027), "https://example.test/2027/manifest.json"),
];
assert.deepEqual(merged.map((scan) => scan.archiveYear), [2026, 2027]);

const payload = makePayload();
const raw = JSON.stringify(payload);
const compressed = gzipSync(raw);
assert.equal(gunzipSync(compressed).toString("utf8"), raw);
assert.equal(validateScanArchivePayload(payload, entry).players.length, 1);
assert.throws(() => validateScanArchivePayload(makePayload(timestampB), entry), /Timestamp/);
assert.throws(
  () =>
    validateScanArchivePayload(
      { players: [{ ...payload.players[0], prefix: "f8_net" }], groups: payload.groups },
      entry,
    ),
  /gehoert nicht/,
);

const contentA = JSON.stringify(payload);
const contentB = JSON.stringify({
  players: [...payload.players, { ...payload.players[0], timestamp: timestampB, identifier: "stumblesteppe_net_p2" }],
  groups: payload.groups,
});
const preview = await createGuildHubLocalScanImportPreview("archive-a.json", contentA, {
  archiveSource: createScanArchiveSourceMetadata(entry),
});
const first = await commitGuildHubLocalScanPreview(preview);
assert.equal(first.status, "imported");
const second = await commitGuildHubLocalScanPreview(preview);
assert.equal(second.status, "duplicate");

const found = await findGuildHubLocalScanByArchiveScanId(entry.id);
assert.equal(found?.archiveSource?.sha256, entry.sha256);
assert.equal((found?.rawData as { players: Array<{ prefix: string }> }).players[0].prefix, "stumblesteppe_net");

const historical = await createGuildHubLocalScanImportPreview("archive-b.json", contentB);
const historicalImport = await commitGuildHubLocalScanPreview(historical);
assert.equal(historicalImport.status, "imported");
assert.equal(deriveGuildHubLogicalScanSnapshots(historicalImport.scan).length, 2);

const summariesBeforeDelete = await listGuildHubScanSummaries();
assert.equal(summariesBeforeDelete.some((summary) => summary.archiveSource?.archiveScanId === entry.id), true);
await deleteGuildHubLocalScans([found!.id]);
const summariesAfterDelete = await listGuildHubScanSummaries();
assert.equal(summariesAfterDelete.some((summary) => summary.archiveSource?.archiveScanId === entry.id), false);

console.log("scanArchive.test: ok");
