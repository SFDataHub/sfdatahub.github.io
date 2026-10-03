import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import {
  commitSfDataHubLocalScanPreview,
  createSfDataHubLocalScanImportPreview,
  deleteSfDataHubLocalScans,
  findSfDataHubLocalScanByArchiveBinding,
  getSfDataHubLocalScan,
  listSfDataHubArchiveScanBindings,
  listSfDataHubScanSummaries,
} from "../../src/lib/guilds/localScanLibrary.ts";
import { resolveLocalFirstScanPlan } from "../../src/lib/guilds/localFirstScanResolver.ts";
import {
  __localFirstScanAcquisitionTestUtils,
  acquireExplicitLocalFirstArchiveScans,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-analytics");
__localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();

const manifestUrl = "https://example.test/scan-archive-2026/manifest.json";
const baseTimestamp = Date.UTC(2026, 8, 19, 21, 0, 0);

const archiveEntry = (id: string, server: string, timestamp: number, shaChar: string): ScanArchiveEntry => ({
  id,
  server,
  timestamp,
  timestampUtc: new Date(timestamp).toISOString(),
  path: `2026-09/${server}/${id}.json.gz`,
  format: "sftools.raw.v1",
  compression: "gzip",
  sha256: shaChar.repeat(64),
  compressedBytes: 10,
  uncompressedBytes: 20,
  playerCount: 1,
  groupCount: 1,
  archiveYear: 2026,
  manifestRevision: 2,
  manifestUrl,
  fileUrl: `https://example.test/${id}.json.gz`,
});

const payloadFor = (entry: ScanArchiveEntry) => ({
  players: [
    {
      prefix: entry.server,
      timestamp: entry.timestamp,
      identifier: `${entry.server}_${entry.id}_p1`,
      name: `Player ${entry.id}`,
      class: 1,
      group: `${entry.server}_${entry.id}_g1`,
      groupname: `Guild ${entry.id}`,
    },
  ],
  groups: [
    {
      prefix: entry.server,
      timestamp: entry.timestamp,
      identifier: `${entry.server}_${entry.id}_g1`,
      name: `Guild ${entry.id}`,
    },
  ],
});

const contentFor = (entry: ScanArchiveEntry) => JSON.stringify(payloadFor(entry));

const a = archiveEntry("a", "f8_net", baseTimestamp, "a");
const b = archiveEntry("b", "s30_eu", baseTimestamp + 1_000, "b");
const c = archiveEntry("c", "stumblesteppe_net", baseTimestamp + 2_000, "c");
const unselected = archiveEntry("unselected", "f8_net", baseTimestamp + 3_000, "d");

{
  const downloads: string[] = [];
  const result = await acquireExplicitLocalFirstArchiveScans([a, b, c], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        downloads.push(entry.id);
        if (entry.id === unselected.id) throw new Error("unselected entry must not be downloaded");
        return { content: contentFor(entry) };
      },
    },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(downloads.sort(), [a.id, b.id, c.id]);
  assert.equal(result.localScanIds.length, 3);
  assert.deepEqual(result.selectedArchives.map((item) => item.status).sort(), ["imported", "imported", "imported"]);
}

{
  const summaries = await listSfDataHubScanSummaries();
  const plan = resolveLocalFirstScanPlan({
    request: {
      target: { kind: "server", server: "F8" },
      time: { kind: "exact", timestamp: a.timestamp },
      dataKind: "both",
      completeness: "confirmed-archive",
    },
    localScanSummaries: summaries,
    archiveEntries: [a],
    availableManifestYears: [2026],
  });
  assert.equal(plan.status, "complete");
  assert.equal(plan.localSnapshots.some((snapshot) => snapshot.coverage === "exact-archive-copy"), true);
}

{
  const downloads: string[] = [];
  const second = await acquireExplicitLocalFirstArchiveScans([a, b, c], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        downloads.push(entry.id);
        return { content: contentFor(entry) };
      },
    },
  });
  assert.equal(second.status, "complete");
  assert.deepEqual(downloads, []);
  assert.deepEqual(second.selectedArchives.map((item) => item.status).sort(), ["sidecar-local", "sidecar-local", "sidecar-local"]);
}

const duplicateEntry = archiveEntry("duplicate-user", "f8_net", baseTimestamp + 10_000, "e");
const duplicatePreview = await createSfDataHubLocalScanImportPreview("manual-user-scan.json", contentFor(duplicateEntry));
const duplicateCommit = await commitSfDataHubLocalScanPreview(duplicatePreview);
assert.equal(duplicateCommit.status, "imported");
assert.equal(duplicateCommit.scan.archiveSource, undefined);

{
  const downloads: string[] = [];
  const result = await acquireExplicitLocalFirstArchiveScans([duplicateEntry], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        downloads.push(entry.id);
        return { content: contentFor(entry) };
      },
    },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(downloads, [duplicateEntry.id]);
  assert.equal(result.selectedArchives[0].status, "bound-duplicate");
  assert.equal(result.localScanIds[0], duplicateCommit.scan.id);
  assert.equal((await getSfDataHubLocalScan(duplicateCommit.scan.id))?.archiveSource, undefined);
  assert.equal((await listSfDataHubArchiveScanBindings()).some((binding) => binding.archiveScanId === duplicateEntry.id), true);
}

{
  const downloads: string[] = [];
  const result = await acquireExplicitLocalFirstArchiveScans([duplicateEntry], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        downloads.push(entry.id);
        return { content: contentFor(entry) };
      },
    },
  });
  assert.equal(result.selectedArchives[0].status, "sidecar-local");
  assert.deepEqual(downloads, []);
}

{
  await deleteSfDataHubLocalScans([duplicateCommit.scan.id]);
  assert.equal(await findSfDataHubLocalScanByArchiveBinding(duplicateEntry), null);
  assert.equal((await listSfDataHubArchiveScanBindings()).some((binding) => binding.archiveScanId === duplicateEntry.id), false);
}

{
  const changedSha = { ...a, sha256: "f".repeat(64) };
  const downloads: string[] = [];
  const result = await acquireExplicitLocalFirstArchiveScans([changedSha], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        downloads.push(entry.id);
        return { content: contentFor(entry) };
      },
    },
  });
  assert.deepEqual(downloads, [a.id]);
  assert.equal(result.selectedArchives[0].status, "bound-duplicate");
}

{
  __localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();
  const parallel = archiveEntry("parallel", "f8_net", baseTimestamp + 20_000, "1");
  const downloads: string[] = [];
  const options = {
    dependencies: {
      downloadArchiveEntry: async (entry: ScanArchiveEntry) => {
        downloads.push(entry.id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { content: contentFor(entry) };
      },
    },
  };
  const [left, right] = await Promise.all([
    acquireExplicitLocalFirstArchiveScans([parallel], options),
    acquireExplicitLocalFirstArchiveScans([parallel], options),
  ]);
  assert.equal(left.status, "complete");
  assert.equal(right.status, "complete");
  assert.deepEqual(downloads, [parallel.id]);
}

{
  const ok = archiveEntry("partial-ok", "f8_net", baseTimestamp + 30_000, "2");
  const fail = archiveEntry("partial-fail", "s30_eu", baseTimestamp + 31_000, "3");
  const result = await acquireExplicitLocalFirstArchiveScans([ok, fail], {
    dependencies: {
      downloadArchiveEntry: async (entry) => {
        if (entry.id === fail.id) throw new Error("Download fehlgeschlagen (500).");
        return { content: contentFor(entry) };
      },
    },
  });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.selectedArchives.map((item) => item.archiveScanId), [ok.id]);
  assert.deepEqual(result.failedArchives.map((item) => item.archiveScanId), [fail.id]);
}

console.log("archiveScanBindings.test: ok");
