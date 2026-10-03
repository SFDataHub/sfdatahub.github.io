import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  applyScanArchiveBuildPlan,
  buildScanArchiveBatches,
  createScanArchiveBuildPlan,
  formatArchiveTimestamp,
} from "./archiveBuilder.mts";
import {
  validateScanArchiveManifest,
  validateScanArchiveSearchIndexPayload,
} from "../../src/lib/scanArchive/validation.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

const YEAR = 2026;
const UPDATED_AT = "2026-09-20T00:00:00.000Z";
const tsA = Date.UTC(2026, 8, 19, 21, 26, 23, 115);
const tsB = Date.UTC(2026, 8, 19, 21, 44, 9, 60);
const tsC = Date.UTC(2026, 8, 20, 6, 1, 2, 3);

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

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

const makeArchiveRoot = async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "scan archive builder "));
  const root = path.join(base, `scan-archive-${YEAR}`);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(minimalManifest(), null, 2)}\n`);
  return { base, root };
};

const writeManifest = async (root: string, manifest: ScanArchiveManifest) => {
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
};

const player = (server: string, timestamp: number, id: string, name = `Player ${id}`) => ({
  prefix: server,
  timestamp,
  identifier: `${server}_${id}`,
  name,
  class: 1,
  level: 100,
  group: `${server}_g1`,
  groupname: `Guild ${server}`,
});

const group = (server: string, timestamp: number, id = "g1") => ({
  prefix: server,
  timestamp,
  identifier: `${server}_${id}`,
  name: `Guild ${server}`,
  rank: 1,
});

const combined = () =>
  JSON.stringify({
    players: [
      player("f8_net", tsA, "p1"),
      player("s30_eu", tsB, "p1"),
      player("f8_net", tsC, "p2"),
    ],
    groups: [group("f8_net", tsA), group("s30_eu", tsB), group("f8_net", tsC)],
    ignoredTopLevel: { mustNotLeak: true },
  });

const singleCombined = (timestamp = tsA) =>
  JSON.stringify({
    players: [player("f8_net", timestamp, "p1")],
    groups: [group("f8_net", timestamp)],
  });

{
  const batches = buildScanArchiveBatches(combined(), YEAR);
  assert.deepEqual(
    batches.map((batch) => [batch.server, batch.timestamp, batch.players.length, batch.groups.length]),
    [
      ["f8_net", tsA, 1, 1],
      ["s30_eu", tsB, 1, 1],
      ["f8_net", tsC, 1, 1],
    ],
  );
  assert.equal(formatArchiveTimestamp(tsA), "2026-09-19_212623115Z");
  assert.throws(() => buildScanArchiveBatches(singleCombined(Date.UTC(2027, 0, 1)), YEAR), /Archivjahr 2026/);
}

{
  const { root } = await makeArchiveRoot();
  const plan = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: combined(), updatedAt: UPDATED_AT });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.batches.length, 3);
  assert.equal(plan.files.length, 6);
  assert.equal(plan.summary.filesToWrite, 6);
  assert.equal(plan.manifestAfter.revision, 1);
  assert.equal(plan.manifestAfter.scans[0].path, "2026-09/f8_net/2026-09-19_212623115Z.json.gz");

  const rawFile = plan.files.find((file) => file.kind === "raw" && file.scanId === `f8_net:${tsA}`);
  assert(rawFile?.bytes);
  const rawPayload = JSON.parse(gunzipSync(rawFile.bytes).toString("utf8"));
  assert.deepEqual(rawPayload.players, [player("f8_net", tsA, "p1")]);
  assert.deepEqual(rawPayload.groups, [group("f8_net", tsA)]);
  assert.equal(Object.prototype.hasOwnProperty.call(rawPayload, "ignoredTopLevel"), false);

  const searchFile = plan.files.find((file) => file.kind === "searchIndex" && file.scanId === `f8_net:${tsA}`);
  assert(searchFile?.bytes);
  const entry = plan.manifestAfter.scans.find((scan) => scan.id === `f8_net:${tsA}`)!;
  const searchPayload = JSON.parse(gunzipSync(searchFile.bytes).toString("utf8"));
  validateScanArchiveSearchIndexPayload(searchPayload, entry);
  assert.deepEqual(Object.keys(searchPayload.players[0]).sort(), ["classId", "guildIdentifier", "guildName", "identifier", "name"]);
  assert.deepEqual(searchPayload.guilds, [{ identifier: "f8_net_g1", name: "Guild f8_net" }]);

  const planAgain = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: combined(), updatedAt: UPDATED_AT });
  assert.equal(hash(rawFile.bytes), hash(planAgain.files.find((file) => file.kind === "raw" && file.scanId === `f8_net:${tsA}`)!.bytes!));
  await assert.rejects(() => fs.access(path.join(root, entry.path)));
}

{
  const { root } = await makeArchiveRoot();
  const plan = await createScanArchiveBuildPlan({
    archiveRoot: root,
    year: YEAR,
    inputContent: singleCombined(),
    setImportedAsCurrent: true,
    setImportedAsMonthly: "2026-09",
    updatedAt: UPDATED_AT,
  });
  assert.equal(plan.conflicts.length, 0);
  await applyScanArchiveBuildPlan(plan);

  const manifestText = await fs.readFile(path.join(root, "manifest.json"), "utf8");
  const manifest = validateScanArchiveManifest(JSON.parse(manifestText), YEAR);
  const entry = manifest.scans[0];
  assert.equal(manifest.toplists?.current?.f8_net, entry.id);
  assert.equal(manifest.toplists?.monthly?.["2026-09"]?.f8_net, entry.id);
  assert.equal(await fs.readFile(path.join(root, entry.path)).then((bytes) => hash(bytes)), entry.sha256);
  assert(entry.searchIndex);

  const idempotent = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: singleCombined(), updatedAt: "2099-01-01T00:00:00.000Z" });
  assert.equal(idempotent.summary.filesToWrite, 0);
  assert.equal(idempotent.summary.skippedIdenticalFiles, 2);
  assert.equal(idempotent.manifestAfter.revision, manifest.revision);
  assert.equal(idempotent.manifestAfter.updatedAt, manifest.updatedAt);
  await applyScanArchiveBuildPlan(idempotent);
  assert.equal(await fs.readFile(path.join(root, "manifest.json"), "utf8"), manifestText);
}

{
  const { root } = await makeArchiveRoot();
  const ambiguous = await createScanArchiveBuildPlan({
    archiveRoot: root,
    year: YEAR,
    inputContent: JSON.stringify({
      players: [player("f8_net", tsA, "p1"), player("f8_net", tsC, "p2")],
      groups: [group("f8_net", tsA), group("f8_net", tsC)],
    }),
    setImportedAsCurrent: true,
    updatedAt: UPDATED_AT,
  });
  assert(ambiguous.conflicts.some((conflict) => conflict.code === "toplist_ambiguous_current"));
}

{
  const { root } = await makeArchiveRoot();
  await applyScanArchiveBuildPlan(
    await createScanArchiveBuildPlan({
      archiveRoot: root,
      year: YEAR,
      inputContent: singleCombined(tsA),
      setImportedAsMonthly: "2026-09",
      setImportedAsCurrent: true,
      updatedAt: UPDATED_AT,
    }),
  );
  await applyScanArchiveBuildPlan(
    await createScanArchiveBuildPlan({
      archiveRoot: root,
      year: YEAR,
      inputContent: singleCombined(tsC),
      setImportedAsCurrent: true,
      updatedAt: "2026-09-21T00:00:00.000Z",
    }),
  );

  const monthlyConflict = await createScanArchiveBuildPlan({
    archiveRoot: root,
    year: YEAR,
    selection: { monthly: { "2026-09": { f8_net: `f8_net:${tsC}` } } },
  });
  assert(monthlyConflict.conflicts.some((conflict) => conflict.code === "toplist_monthly_replace_required"));

  const rollbackConflict = await createScanArchiveBuildPlan({
    archiveRoot: root,
    year: YEAR,
    selection: { current: { f8_net: `f8_net:${tsA}` } },
  });
  assert(rollbackConflict.conflicts.some((conflict) => conflict.code === "toplist_current_rollback"));
}

{
  const { root } = await makeArchiveRoot();
  const prepared = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: singleCombined(), updatedAt: UPDATED_AT });
  const scan = { ...prepared.manifestAfter.scans[0] };
  const raw = prepared.files.find((file) => file.kind === "raw")!;
  assert(raw.bytes);
  await fs.mkdir(path.dirname(path.join(root, scan.path)), { recursive: true });
  await fs.writeFile(path.join(root, scan.path), raw.bytes);
  delete scan.searchIndex;
  await writeManifest(root, minimalManifest({ revision: 1, updatedAt: UPDATED_AT, scanCount: 1, serverCount: 1, scans: [scan] }));

  const rawBefore = await fs.readFile(path.join(root, scan.path));
  const backfill = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, backfillSearchIndexes: true, updatedAt: "2026-09-21T00:00:00.000Z" });
  assert.equal(backfill.conflicts.length, 0);
  assert.equal(backfill.summary.backfilledSearchIndexes, 1);
  await applyScanArchiveBuildPlan(backfill);
  assert.equal(hash(await fs.readFile(path.join(root, scan.path))), hash(rawBefore));

  const after = validateScanArchiveManifest(JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8")), YEAR);
  assert(after.scans[0].searchIndex);
  const existingIndex = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, backfillSearchIndexes: true });
  assert.equal(existingIndex.summary.backfilledSearchIndexes, 0);
}

{
  const { root } = await makeArchiveRoot();
  const planned = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: singleCombined() });
  const raw = planned.files.find((file) => file.kind === "raw")!;
  await fs.mkdir(path.dirname(path.join(root, raw.relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, raw.relativePath), Buffer.from("different"));
  const conflict = await createScanArchiveBuildPlan({ archiveRoot: root, year: YEAR, inputContent: singleCombined() });
  assert(conflict.conflicts.some((item) => item.code === "target_path_conflict"));
  await assert.rejects(() => applyScanArchiveBuildPlan(conflict), /Konflikt/);
}

{
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "scan archive unsafe "));
  const unsafeRoot = path.join(base, "scan archiv");
  await fs.mkdir(unsafeRoot, { recursive: true });
  await fs.writeFile(path.join(unsafeRoot, "manifest.json"), `${JSON.stringify(minimalManifest(), null, 2)}\n`);
  await assert.rejects(() => createScanArchiveBuildPlan({ archiveRoot: unsafeRoot, year: YEAR, inputContent: singleCombined() }), /Jahresrepo/);
}

console.log("archiveBuilder.test: ok");
