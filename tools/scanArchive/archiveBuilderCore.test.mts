import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, unzipSync, zipSync } from "fflate";

import {
  buildScanArchiveBatches,
  createScanArchiveBuildPlanCore,
  monthKeyForScanArchiveTimestamp,
} from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

const YEAR = 2026;
const tsA = Date.UTC(2026, 8, 19, 21, 26, 23, 115);
const tsB = Date.UTC(2026, 8, 19, 22, 11, 7, 8);

const encoder = new TextEncoder();

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const deps = {
  gzip: (content: string) => gzipSync(encoder.encode(content), { level: 9, mtime: 0 }),
  sha256: sha256Hex,
  byteLength: (bytes: Uint8Array) => bytes.byteLength,
  utf8ByteLength: (content: string) => encoder.encode(content).byteLength,
};

const minimalManifest = (overrides: Partial<ScanArchiveManifest> = {}): ScanArchiveManifest => ({
  schemaVersion: 1,
  archiveYear: YEAR,
  revision: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  scanCount: 0,
  serverCount: 0,
  scans: [],
  ...overrides,
});

const player = (server: string, timestamp: number, identifier: string) => ({
  prefix: server,
  timestamp,
  identifier,
  name: `Player ${identifier}`,
  guildIdentifier: `${server}_g1`,
  guildName: `Guild ${server}`,
  class: 1,
});

const group = (server: string, timestamp: number) => ({
  server,
  timestamp,
  identifier: `${server}_g1`,
  name: `Guild ${server}`,
});

{
  const content = JSON.stringify({
    players: [player("f8_net", tsA, "f8_p1"), player("stumblesteppe_net", tsB, "ss_p1")],
    groups: [group("f8_net", tsA), group("stumblesteppe_net", tsB)],
    ignoredTopLevel: true,
  });
  const batches = buildScanArchiveBatches(content, YEAR);
  assert.deepEqual(
    batches.map((batch) => [batch.server, monthKeyForScanArchiveTimestamp(batch.timestamp), batch.path]),
    [
      ["f8_net", "2026-09", "2026-09/f8_net/2026-09-19_212623115Z.json.gz"],
      ["stumblesteppe_net", "2026-09", "2026-09/stumblesteppe_net/2026-09-19_221107008Z.json.gz"],
    ],
  );
}

{
  assert.throws(
    () => buildScanArchiveBatches(JSON.stringify({ players: [player("unknown_net", tsA, "x")], groups: [] }), YEAR),
    /Server unknown_net/,
  );
  assert.throws(
    () => buildScanArchiveBatches(JSON.stringify({ players: [{ ...player("f8_net", tsA, "x"), timestamp: `${tsA}` }], groups: [] }), YEAR),
    /timestamp/,
  );
  assert.throws(
    () => buildScanArchiveBatches(JSON.stringify({ players: [player("f8_net", Date.UTC(2027, 0, 1), "x")], groups: [] }), YEAR),
    /Archivjahr 2026/,
  );
}

{
  const content = JSON.stringify({
    players: [player("s30_eu", tsA, "s30_p1")],
    groups: [group("s30_eu", tsA)],
  });
  const inspectedBatches = buildScanArchiveBatches(content, YEAR);
  const plan = await createScanArchiveBuildPlanCore(
    {
      year: YEAR,
      manifest: minimalManifest(),
      inputBatches: inspectedBatches,
      setImportedAsCurrent: true,
      setImportedAsMonthly: "2026-09",
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
    deps,
  );
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.summary.newScans, 1);
  assert.equal(plan.summary.filesToWrite, 2);
  assert.equal(plan.manifestAfter.toplists?.current?.s30_eu, `s30_eu:${tsA}`);
  assert.equal(plan.manifestAfter.toplists?.monthly?.["2026-09"]?.s30_eu, `s30_eu:${tsA}`);
  const rawFile = plan.files.find((file) => file.kind === "raw");
  const searchFile = plan.files.find((file) => file.kind === "searchIndex");
  assert(rawFile?.bytes);
  assert(searchFile?.bytes);
  const archive = unzipSync(zipSync({
    "manifest.json": encoder.encode(`${JSON.stringify(plan.manifestAfter, null, 2)}\n`),
    [rawFile.relativePath]: rawFile.bytes,
    [searchFile.relativePath]: searchFile.bytes,
  }));
  assert.deepEqual(Object.keys(archive).sort(), ["2026-09/s30_eu/2026-09-19_212623115Z.json.gz", "2026-09/s30_eu/2026-09-19_212623115Z.search.json.gz", "manifest.json"]);

  const idempotent = await createScanArchiveBuildPlanCore(
    {
      year: YEAR,
      manifest: plan.manifestAfter,
      inputBatches: inspectedBatches,
      existingFiles: new Map(plan.files.map((file) => [file.relativePath, { sha256: file.sha256, compressedBytes: file.compressedBytes }])),
    },
    deps,
  );
  assert.equal(idempotent.summary.filesToWrite, 0);
  assert.equal(idempotent.summary.skippedIdenticalFiles, 2);
  assert(idempotent.files.every((file) => file.action === "skip-identical" && !file.bytes));
}

{
  const content = JSON.stringify({
    players: [player("s31_eu", tsA, "s31_p1")],
    groups: [group("s31_eu", tsA)],
  });
  const plan = await createScanArchiveBuildPlanCore(
    {
      year: YEAR,
      manifest: minimalManifest(),
      inputBatches: buildScanArchiveBatches(content, YEAR),
      usageMode: "monthly",
      updatedAt: "2026-09-20T00:00:00.000Z",
    },
    deps,
  );
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.manifestAfter.toplists?.current?.s31_eu, `s31_eu:${tsA}`);
  assert.equal(plan.manifestAfter.toplists?.monthly?.["2026-09"]?.s31_eu, `s31_eu:${tsA}`);
  assert.equal(plan.toplistChanges.current.length, 1);
  assert.equal(plan.toplistChanges.monthly.length, 1);
}

{
  const base = await createScanArchiveBuildPlanCore(
    {
      year: YEAR,
      manifest: minimalManifest(),
      inputBatches: buildScanArchiveBatches(JSON.stringify({
        players: [player("f8_net", tsA, "f8_p1")],
        groups: [group("f8_net", tsA)],
      }), YEAR),
      usageMode: "monthly",
    },
    deps,
  );
  const originalToplists = JSON.parse(JSON.stringify(base.manifestAfter.toplists));
  const plan = await createScanArchiveBuildPlanCore(
    {
      year: YEAR,
      manifest: base.manifestAfter,
      inputBatches: buildScanArchiveBatches(JSON.stringify({
        players: [player("s30_eu", tsB, "s30_p1")],
        groups: [group("s30_eu", tsB)],
      }), YEAR),
      usageMode: "archive-only",
      updatedAt: "2026-09-21T00:00:00.000Z",
    },
    deps,
  );
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.summary.newScans, 1);
  assert(plan.manifestAfter.scans.some((scan) => scan.id === `s30_eu:${tsB}`));
  assert(plan.files.some((file) => file.kind === "searchIndex" && file.action === "write"));
  assert.deepEqual(plan.manifestAfter.toplists, originalToplists);
  assert.deepEqual(plan.toplistChanges, { current: [], monthly: [] });
}
