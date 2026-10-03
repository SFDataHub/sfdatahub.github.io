import assert from "node:assert/strict";

import {
  resolveScanArchiveCurrentToplistScan,
  resolveScanArchiveCurrentToplistScans,
  resolveScanArchiveMonthlyToplistScan,
  resolveScanArchiveMonthlyToplistScans,
} from "../../src/lib/scanArchive/toplistSelection.ts";
import {
  ScanArchiveValidationError,
  validateScanArchiveManifest,
  validateScanArchiveSearchIndexPayload,
} from "../../src/lib/scanArchive/validation.ts";
import type {
  ScanArchiveManifest,
  ScanArchiveManifestScan,
  ScanArchiveToplistsManifest,
} from "../../src/lib/scanArchive/types.ts";

const septemberTs = Date.UTC(2026, 8, 19, 21, 24, 56, 141);
const octoberTs = Date.UTC(2026, 9, 2, 12, 0, 0, 0);
const newerTs = Date.UTC(2027, 0, 10, 12, 0, 0, 0);

const hash = (char: string) => char.repeat(64);

const searchIndexFor = (scan: Pick<ScanArchiveManifestScan, "server" | "timestamp" | "playerCount" | "groupCount">, char = "b") => {
  const date = new Date(scan.timestamp);
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    schemaVersion: 1 as const,
    path: `${month}/${scan.server}/search-${scan.timestamp}.json.gz`,
    sha256: hash(char),
    compressedBytes: 11,
    uncompressedBytes: 22,
    playerCount: scan.playerCount,
    groupCount: scan.groupCount,
  };
};

const scan = (
  server: string,
  timestamp: number,
  options: {
    id?: string;
    sourceHash?: string;
    indexHash?: string;
    playerCount?: number;
    groupCount?: number;
    searchIndex?: boolean | Partial<ReturnType<typeof searchIndexFor>>;
  } = {},
): ScanArchiveManifestScan => {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = `${year}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const base = {
    id: options.id ?? `${server}:${timestamp}`,
    server,
    timestamp,
    timestampUtc: date.toISOString(),
    path: `${month}/${server}/${timestamp}.json.gz`,
    format: "sftools.raw.v1",
    compression: "gzip" as const,
    sha256: options.sourceHash ?? hash("a"),
    compressedBytes: 101,
    uncompressedBytes: 202,
    playerCount: options.playerCount ?? 2,
    groupCount: options.groupCount ?? 1,
  };
  if (options.searchIndex === false) return base;
  return {
    ...base,
    searchIndex: {
      ...searchIndexFor(base, options.indexHash ?? "b"),
      ...(typeof options.searchIndex === "object" ? options.searchIndex : {}),
    },
  };
};

const manifest = (
  year: number,
  scans: ScanArchiveManifestScan[],
  toplists?: ScanArchiveToplistsManifest,
): ScanArchiveManifest => ({
  schemaVersion: 1,
  archiveYear: year,
  revision: 1,
  updatedAt: new Date(Date.UTC(year, 0, 1)).toISOString(),
  scanCount: scans.length,
  serverCount: new Set(scans.map((item) => item.server)).size,
  scans,
  ...(toplists ? { toplists } : {}),
});

const assertValidationCode = (run: () => unknown, code: string) => {
  assert.throws(
    run,
    (error) => error instanceof ScanArchiveValidationError && error.code === code,
  );
};

const stumblesteppe = scan("stumblesteppe_net", septemberTs, { sourceHash: hash("1"), indexHash: "2" });
const f8 = scan("f8_net", septemberTs + 86_974, { sourceHash: hash("3"), indexHash: "4" });
const s30 = scan("s30_eu", septemberTs + 1_152_919, { sourceHash: hash("5"), indexHash: "6" });
const f8October = scan("f8_net", octoberTs, { sourceHash: hash("7"), indexHash: "8" });

const legacyManifest = validateScanArchiveManifest(
  manifest(2026, [scan("f8_net", septemberTs, { searchIndex: false })]),
  2026,
);
assert.equal(legacyManifest.toplists, undefined);
assert.equal(legacyManifest.scans[0].searchIndex, undefined);

const valid2026 = validateScanArchiveManifest(
  manifest(2026, [stumblesteppe, f8, s30, f8October], {
    schemaVersion: 1,
    current: {
      stumblesteppe_net: stumblesteppe.id,
      f8_net: f8.id,
      s30_eu: s30.id,
    },
    monthly: {
      "2026-09": {
        stumblesteppe_net: stumblesteppe.id,
        f8_net: f8.id,
        s30_eu: s30.id,
      },
      "2026-10": {
        f8_net: f8October.id,
      },
    },
  }),
  2026,
);

const currentF8 = resolveScanArchiveCurrentToplistScan([valid2026], "f8_net");
assert.equal(currentF8.status, "selected");
assert.deepEqual(currentF8.status === "selected" ? currentF8.scans.map((item) => item.id) : [], [f8.id]);
assert.equal(resolveScanArchiveMonthlyToplistScan([valid2026], "f8_net", "2026-09").status, "selected");
assert.equal(resolveScanArchiveMonthlyToplistScan([valid2026], "f8_net", "2026-10").status, "selected");
assert.equal(resolveScanArchiveMonthlyToplistScan([valid2026], "f8_net", "2025-09").status, "manifest-year-missing");
assert.deepEqual(
  Object.values(resolveScanArchiveMonthlyToplistScans([valid2026], ["stumblesteppe_net", "f8_net", "s30_eu"], "2026-09"))
    .map((result) => result.status),
  ["selected", "selected", "selected"],
);

const olderCurrent = validateScanArchiveManifest(
  manifest(2026, [f8], { schemaVersion: 1, current: { f8_net: f8.id } }),
  2026,
);
const newerF8 = scan("f8_net", newerTs, { sourceHash: hash("9"), indexHash: "a" });
const newerCurrent = validateScanArchiveManifest(
  manifest(2027, [newerF8], { schemaVersion: 1, current: { f8_net: newerF8.id } }),
  2027,
);
const newest = resolveScanArchiveCurrentToplistScan([newerCurrent, olderCurrent], "f8_net");
assert.deepEqual(newest.status === "selected" ? newest.scans.map((item) => item.id) : [], [newerF8.id]);
assert.equal(resolveScanArchiveCurrentToplistScan([olderCurrent, validateScanArchiveManifest(manifest(2027, [scan("s30_eu", newerTs, { sourceHash: hash("b"), indexHash: "c" })]), 2027)], "f8_net").status === "selected", true);
assert.equal(resolveScanArchiveCurrentToplistScans([valid2026], ["missing_net"]).missing_net.status, "not-defined");

const f8PlayersOnly = scan("f8_net", septemberTs + 1_000, {
  id: "f8_net:players",
  sourceHash: hash("d"),
  indexHash: "e",
  playerCount: 2,
  groupCount: 0,
});
const f8GuildsOnly = scan("f8_net", septemberTs + 2_000, {
  id: "f8_net:guilds",
  sourceHash: hash("f"),
  indexHash: "1",
  playerCount: 0,
  groupCount: 1,
});
const setManifest = validateScanArchiveManifest(
  manifest(2026, [f8GuildsOnly, f8PlayersOnly], {
    schemaVersion: 1,
    current: { f8_net: { scanIds: [f8GuildsOnly.id, f8PlayersOnly.id] } },
    monthly: { "2026-09": { f8_net: { scanIds: [f8GuildsOnly.id, f8PlayersOnly.id] } } },
  }),
  2026,
);
assert.deepEqual(setManifest.toplists?.current?.f8_net, { scanIds: [f8PlayersOnly.id, f8GuildsOnly.id] });
const setCurrent = resolveScanArchiveCurrentToplistScan([setManifest], "f8_net");
assert.deepEqual(setCurrent.status === "selected" ? setCurrent.scans.map((item) => item.id) : [], [f8PlayersOnly.id, f8GuildsOnly.id]);
const setMonthly = resolveScanArchiveMonthlyToplistScan([setManifest], "f8_net", "2026-09");
assert.deepEqual(setMonthly.status === "selected" ? setMonthly.scans.map((item) => item.id) : [], [f8PlayersOnly.id, f8GuildsOnly.id]);

const conflictA = validateScanArchiveManifest(
  manifest(2026, [scan("f8_net", septemberTs, { id: "f8_net:a", sourceHash: hash("a"), indexHash: "b" })], {
    schemaVersion: 1,
    current: { f8_net: "f8_net:a" },
  }),
  2026,
);
const conflictB = validateScanArchiveManifest(
  manifest(2026, [scan("f8_net", septemberTs, { id: "f8_net:b", sourceHash: hash("c"), indexHash: "d" })], {
    schemaVersion: 1,
    current: { f8_net: "f8_net:b" },
  }),
  2026,
);
assert.equal(resolveScanArchiveCurrentToplistScan([conflictB, conflictA], "f8_net").status, "conflict");

assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8], { schemaVersion: 1, current: { f8_net: "missing" } }), 2026),
  "toplists_unknown_scan",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8, s30], { schemaVersion: 1, current: { f8_net: s30.id } }), 2026),
  "toplists_wrong_server",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [s30], { schemaVersion: 1, current: { EU30: s30.id } }), 2026),
  "toplists_unknown_server",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8], { schemaVersion: 1, monthly: { "2026-10": { f8_net: f8.id } } }), 2026),
  "toplists_wrong_month",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [scan("f8_net", septemberTs, { searchIndex: false })], { schemaVersion: 1, current: { f8_net: `f8_net:${septemberTs}` } }), 2026),
  "toplists_missing_search_index",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8], { schemaVersion: 1, current: { f8_net: { scanIds: [] } } }), 2026),
  "toplists_empty_set",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8], { schemaVersion: 1, current: { f8_net: { scanIds: [f8.id, f8.id] } } }), 2026),
  "toplists_duplicate_scan",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8PlayersOnly], { schemaVersion: 1, current: { f8_net: { scanIds: [f8PlayersOnly.id] } } }), 2026),
  "toplists_missing_data",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [f8PlayersOnly, f8October], { schemaVersion: 1, current: { f8_net: { scanIds: [f8PlayersOnly.id, f8October.id] } } }), 2026),
  "toplists_wrong_month",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [scan("f8_net", septemberTs, { searchIndex: { path: "../bad.json.gz" } })]), 2026),
  "search_index_path",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [scan("f8_net", septemberTs, { searchIndex: { sha256: "nope" } })]), 2026),
  "search_index_sha256",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [scan("f8_net", septemberTs, { searchIndex: { compressedBytes: 0 } })]), 2026),
  "search_index_size",
);
assertValidationCode(
  () => validateScanArchiveManifest(manifest(2026, [scan("f8_net", septemberTs, { searchIndex: { playerCount: 99 } })]), 2026),
  "search_index_count_mismatch",
);

const selectedEntry = valid2026.scans.find((item) => item.id === f8.id)!;
const validPayload = {
  schemaVersion: 1,
  archiveScanId: selectedEntry.id,
  sourceSha256: selectedEntry.sha256,
  server: selectedEntry.server,
  timestamp: selectedEntry.timestamp,
  players: [
    {
      identifier: "f8_net_p1",
      name: "Player One",
      guildIdentifier: "f8_net_g1",
      guildName: "Guild One",
      classId: 1,
    },
    {
      identifier: "f8_net_p2",
      name: "Player Two",
    },
  ],
  guilds: [
    {
      identifier: "f8_net_g1",
      name: "Guild One",
    },
  ],
};
const validatedPayload = validateScanArchiveSearchIndexPayload(validPayload, selectedEntry);
assert.equal(validatedPayload.players[0].identifier, "f8_net_p1");
assert.equal(validatedPayload.players[0].name, "Player One");
assertValidationCode(() => validateScanArchiveSearchIndexPayload({ ...validPayload, archiveScanId: "other" }, selectedEntry), "search_payload_source");
assertValidationCode(() => validateScanArchiveSearchIndexPayload({ ...validPayload, sourceSha256: hash("f") }, selectedEntry), "search_payload_source");
assertValidationCode(() => validateScanArchiveSearchIndexPayload({ ...validPayload, server: "s30_eu" }, selectedEntry), "search_payload_source");
assertValidationCode(() => validateScanArchiveSearchIndexPayload({ ...validPayload, timestamp: selectedEntry.timestamp + 1 }, selectedEntry), "search_payload_source");
assertValidationCode(() => validateScanArchiveSearchIndexPayload({ ...validPayload, players: validPayload.players.slice(0, 1) }, selectedEntry), "search_payload_count_mismatch");
assertValidationCode(
  () => validateScanArchiveSearchIndexPayload({ ...validPayload, players: [{ ...validPayload.players[0], identifier: " changed" }, validPayload.players[1]] }, selectedEntry),
  "search_payload_entry",
);

console.log("toplistSelection.test: ok");
