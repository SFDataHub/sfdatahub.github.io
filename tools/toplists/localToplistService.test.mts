import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import {
  __localFirstScanAcquisitionTestUtils,
  acquireExplicitLocalFirstArchiveScans,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import {
  commitSfDataHubLocalScanPreview,
  createSfDataHubLocalScanImportPreview,
  getSfDataHubLocalScan,
} from "../../src/lib/guilds/localScanLibrary.ts";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import {
  __localToplistServiceTestUtils,
  loadOrBuildLocalToplistSnapshots,
  type LocalToplistServiceDependencies,
} from "../../src/lib/toplists/localToplistService.ts";
import { LOCAL_TOPLIST_DERIVATION_VERSION, listLocalToplistSnapshots } from "../../src/lib/toplists/localToplistStore.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";
import type { LocalToplistDerivationWorkerSource, LocalToplistDerivedSnapshotPayload } from "../../src/lib/toplists/localToplistWorkerTypes.ts";

await deleteDB("sfdatahub-local-data");
await deleteDB("sfdatahub-guild-analytics");
__localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();
__localToplistServiceTestUtils.clearInFlightDerivedSnapshots();

const manifestUrl = "https://example.test/scan-archive-2026/manifest.json";
const baseTimestamp = Date.UTC(2026, 8, 19, 21, 0, 0);

const entry = (id: string, server: string, timestamp: number, shaChar: string): ScanArchiveEntry => ({
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
  playerCount: 2,
  groupCount: 1,
  archiveYear: 2026,
  manifestRevision: 2,
  manifestUrl,
  fileUrl: `https://example.test/${id}.json.gz`,
});

const makeRaw = (archive: ScanArchiveEntry, suffix = archive.id) => ({
  players: [
    {
      prefix: archive.server,
      timestamp: archive.timestamp,
      identifier: `${archive.server}_p1_${suffix}`,
      playerId: 1,
      name: `Player ${suffix} A`,
      class: 1,
      level: 100,
      guildIdentifier: `${archive.server}_g1_${suffix}`,
      guildName: `Guild ${suffix}`,
      values: {
        Base: 1000,
        "Base Strength": 1000,
        "Base Constitution": 500,
        Attribute: 1200,
        Constitution: 650,
        "Gem Mine": 0,
        Treasury: 10,
      },
    },
    {
      prefix: archive.server,
      timestamp: archive.timestamp,
      identifier: `${archive.server}_p2_${suffix}`,
      playerId: 2,
      name: `Player ${suffix} B`,
      class: 1,
      level: 200,
      guildIdentifier: `${archive.server}_g1_${suffix}`,
      guildName: `Guild ${suffix}`,
      values: {
        Base: 2000,
        "Base Strength": 2000,
        "Base Constitution": 700,
        Attribute: 2300,
        Constitution: 900,
        "Gem Mine": 4,
        Treasury: 20,
      },
    },
  ],
  groups: [
    {
      prefix: archive.server,
      timestamp: archive.timestamp,
      identifier: `${archive.server}_g1_${suffix}`,
      name: `Guild ${suffix}`,
      rank: 1,
      save: (() => {
        const save: unknown[] = [];
        save[0] = 1;
        save[8] = 50;
        save[13] = 1000;
        save[14] = 1;
        save[15] = 2;
        save[64] = 100;
        save[65] = 200;
        save[314] = 1;
        save[315] = 3;
        save[378] = 10;
        save[379] = 0;
        return save;
      })(),
    },
  ],
});

const contentFor = (archive: ScanArchiveEntry, suffix = archive.id) => JSON.stringify(makeRaw(archive, suffix));

const createHarness = (harnessOptions: { rawSuffixById?: Record<string, string> } = {}) => {
  const calls = {
    downloads: [] as string[],
    workerRuns: 0,
    workerSources: [] as string[],
  };
  const dependencies: Partial<LocalToplistServiceDependencies> = {
    acquireEntries: (entries, options) =>
      acquireExplicitLocalFirstArchiveScans(entries, {
        ...options,
        dependencies: {
          downloadArchiveEntry: async (archive) => {
            calls.downloads.push(archive.id);
            if (archive.id.includes("fail")) throw new Error("Download fehlgeschlagen (500).");
            return { content: contentFor(archive, harnessOptions.rawSuffixById?.[archive.id]) };
          },
        },
      }),
    deriveInWorker: async (sources: LocalToplistDerivationWorkerSource[]): Promise<LocalToplistDerivedSnapshotPayload[]> => {
      calls.workerRuns += 1;
      calls.workerSources.push(...sources.map((source) => source.archiveScanId));
      return Promise.all(sources.map(async (source) => {
        const scan = await getSfDataHubLocalScan(source.localScanId);
        assert.ok(scan, `missing local scan ${source.localScanId}`);
        assert.equal(scan.contentHash, source.localContentHash);
        const derived = deriveLocalToplistsFromConfirmedScans([{
          manifestYear: source.manifestYear,
          archiveScanId: source.archiveScanId,
          archiveSha256: source.archiveSha256,
          server: source.server,
          scanTimestamp: source.scanTimestamp,
          localScanId: source.localScanId,
          rawScan: scan.rawData,
          confirmation: source.confirmation,
        }]);
        assert.equal(derived.status, "complete");
        const snapshotMeta = derived.snapshots[0];
        assert.ok(snapshotMeta);
        const payload: LocalToplistDerivedSnapshotPayload = {
          manifestYear: source.manifestYear,
          archiveScanId: source.archiveScanId,
          archiveSha256: source.archiveSha256,
          server: snapshotMeta.server,
          scanTimestamp: source.scanTimestamp,
          localScanId: source.localScanId,
          localContentHash: source.localContentHash,
          playerRows: derived.players,
          guildRows: derived.guilds,
          snapshotMeta,
          issues: derived.issues,
        };
        structuredClone(payload);
        return payload;
      }));
    },
  };
  return { calls, dependencies };
};

const a = entry("a", "f8_net", baseTimestamp, "a");
const b = entry("b", "s30_eu", baseTimestamp + 1_000, "b");
const c = entry("c", "stumblesteppe_net", baseTimestamp + 2_000, "c");

const withToplistSet = (entries: readonly ScanArchiveEntry[]) => {
  const toplistSetKey = entries.map((item) => `${item.id}:${item.sha256.toLowerCase()}`).join("|");
  const toplistSetScanIds = entries.map((item) => item.id);
  return entries.map((item) => ({ ...item, toplistSetKey, toplistSetScanIds }));
};

{
  const result = await loadOrBuildLocalToplistSnapshots([], {
    dependencies: {
      acquireEntries: async () => {
        throw new Error("empty selection must not start acquisition");
      },
      getLocalScan: getSfDataHubLocalScan,
      deriveInWorker: async () => {
        throw new Error("empty selection must not start worker");
      },
    },
  });
  assert.equal(result.status, "empty");
  assert.equal(result.networkAccessed, false);
  assert.equal(result.workerRan, false);
  assert.equal(result.readySelections.length, 0);
  assert.equal(result.failedSelections.length, 0);
}

{
  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([a], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.networkAccessed, true);
  assert.equal(result.workerRan, true);
  assert.deepEqual(h.calls.downloads, [a.id]);
  assert.deepEqual(h.calls.workerSources, [a.id]);
  assert.equal(result.cacheHits.length, 0);
  assert.equal(result.cacheMisses.length, 1);
  assert.equal(result.derivedSelections.length, 1);
  assert.equal(result.playerRows.length, 2);
  assert.equal(result.guildRows.length, 1);
  assert.equal(result.readySelections[0].source, "derived");
  assert.deepEqual(deriveLocalToplistsFromConfirmedScans([{
    manifestYear: a.archiveYear,
    archiveScanId: a.id,
    archiveSha256: a.sha256,
    server: a.server,
    scanTimestamp: a.timestamp,
    localScanId: result.readySelections[0].localScanId,
    rawScan: makeRaw(a),
    confirmation: { kind: "archiveSource", archiveScanId: a.id, archiveSha256: a.sha256 },
  }]).players, result.playerRows);
}

{
  const h = createHarness();
  const second = await loadOrBuildLocalToplistSnapshots([a], { dependencies: h.dependencies });
  assert.equal(second.status, "complete");
  assert.equal(second.networkAccessed, false);
  assert.equal(second.workerRan, false);
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.workerRuns, 0);
  assert.equal(second.cacheHits.length, 1);
  assert.equal(second.readySelections[0].source, "cache");
}

{
  const stale = entry("stale-derived", "f8_net", baseTimestamp + 5_000, "5");
  __localToplistServiceTestUtils.clearInFlightDerivedSnapshots();
  const oldBuild = await loadOrBuildLocalToplistSnapshots([stale], {
    dependencies: createHarness().dependencies,
    derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION - 1,
  });
  assert.equal(oldBuild.status, "complete");
  assert.equal(oldBuild.workerRan, true);
  assert.equal(oldBuild.readySelections[0].source, "derived");
  const localScanId = oldBuild.readySelections[0].localScanId;
  const rawBefore = await getSfDataHubLocalScan(localScanId);
  assert.ok(rawBefore);

  const h = createHarness();
  const rebuilt = await loadOrBuildLocalToplistSnapshots([stale], { dependencies: h.dependencies });
  assert.equal(rebuilt.status, "complete");
  assert.equal(rebuilt.networkAccessed, false);
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.workerRuns, 1);
  assert.deepEqual(h.calls.workerSources, [stale.id]);
  assert.equal(rebuilt.cacheMisses.length, 1);
  assert.equal(rebuilt.derivedSelections.length, 1);
  assert.equal(rebuilt.readySelections[0].source, "derived");
  assert.equal(rebuilt.readySelections[0].localScanId, localScanId);
  const rawAfter = await getSfDataHubLocalScan(localScanId);
  assert.equal(rawAfter?.id, rawBefore.id);
  assert.equal(rawAfter?.contentHash, rawBefore.contentHash);

  const afterRebuild = await loadOrBuildLocalToplistSnapshots([stale], { dependencies: createHarness().dependencies });
  assert.equal(afterRebuild.status, "complete");
  assert.equal(afterRebuild.workerRan, false);
  assert.equal(afterRebuild.cacheHits.length, 1);
  assert.equal(afterRebuild.cacheMisses.length, 0);
  assert.equal(afterRebuild.readySelections[0].source, "cache");
}

{
  __localToplistServiceTestUtils.clearInFlightDerivedSnapshots();
  const h = createHarness();
  const afterRestart = await loadOrBuildLocalToplistSnapshots([a], { dependencies: h.dependencies });
  assert.equal(afterRestart.status, "complete");
  assert.equal(afterRestart.workerRan, false);
  assert.deepEqual(h.calls.downloads, []);
}

{
  const duplicate = entry("manual-duplicate", "f8_net", baseTimestamp + 10_000, "d");
  const preview = await createSfDataHubLocalScanImportPreview("manual.json", contentFor(duplicate));
  const committed = await commitSfDataHubLocalScanPreview(preview);
  assert.equal(committed.scan.archiveSource, undefined);

  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([duplicate], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.workerRan, true);
  assert.deepEqual(h.calls.downloads, [duplicate.id]);
  assert.equal((await getSfDataHubLocalScan(committed.scan.id))?.archiveSource, undefined);

  const second = await loadOrBuildLocalToplistSnapshots([duplicate], { dependencies: createHarness().dependencies });
  assert.equal(second.status, "complete");
  assert.equal(second.cacheHits.length, 1);
}

{
  const manual = entry("unconfirmed", "f8_net", baseTimestamp + 20_000, "e");
  const preview = await createSfDataHubLocalScanImportPreview("unconfirmed.json", contentFor(manual));
  const committed = await commitSfDataHubLocalScanPreview(preview);
  const result = await loadOrBuildLocalToplistSnapshots([manual], {
    dependencies: {
      acquireEntries: async () => ({
        status: "complete",
        localScanIds: [committed.scan.id],
        selectedArchives: [{ archiveScanId: manual.id, archiveSha256: manual.sha256, localScanId: committed.scan.id, status: "already-local" }],
        failedArchives: [],
        networkAccessed: false,
      }),
      getLocalScan: getSfDataHubLocalScan,
      deriveInWorker: async () => {
        throw new Error("unconfirmed scan must not reach worker");
      },
    },
  });
  assert.equal(result.status, "empty");
  assert.equal(result.failedSelections[0].errorCode, "worker-error");
  assert.match(result.failedSelections[0].message, /nicht als Archivquelle/);
}

{
  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([a, b, c], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.readySelections.length, 3);
  assert.equal(result.readySelections.some((selection) => selection.source === "derived"), true);
  assert.equal(new Set(result.snapshots.map((snapshot) => snapshot.archiveScanId)).size, 3);
  assert.equal(result.playerRows.some((row) => row.identifier.startsWith("f8_net")), true);
  assert.equal(result.playerRows.some((row) => row.identifier.startsWith("s30_eu")), true);
}

{
  const [oldMember, newMember] = withToplistSet([
    entry("set-old", "f8_net", baseTimestamp + 12_000, "6"),
    entry("set-new", "f8_net", baseTimestamp + 13_000, "7"),
  ]);
  const h = createHarness({ rawSuffixById: { [oldMember.id]: "shared-set", [newMember.id]: "shared-set" } });
  const result = await loadOrBuildLocalToplistSnapshots([oldMember, newMember], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.readySelections.length, 1);
  assert.equal(result.readySelections[0].archiveScanId, `${oldMember.id}+${newMember.id}`);
  assert.equal(result.readySelections[0].scanTimestamp, newMember.timestamp);
  assert.deepEqual(h.calls.workerSources.sort(), [oldMember.id, newMember.id].sort());
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.snapshots[0].playerCount, 2);
  assert.equal(result.snapshots[0].guildCount, 1);
  assert.equal(result.playerRows.length, 2);
  assert.equal(result.guildRows.length, 1);
  // These suffixed fixture identifiers do not match the numeric roster IDs.
  // With no complete candidate the earliest source remains the basis.
  assert.equal(result.guildRows[0].memberBasisStatus, "incomplete");
  assert.equal(result.guildRows[0].avgLevel, null);
  assert.equal(result.playerRows.every((row) => row.archiveScanId === oldMember.id), true);
  assert.equal(result.guildRows[0].archiveScanId, oldMember.id);
}

{
  const [okMember, failMember] = withToplistSet([
    entry("set-partial-ok", "f8_net", baseTimestamp + 14_000, "8"),
    entry("set-partial-fail", "f8_net", baseTimestamp + 15_000, "9"),
  ]);
  const h = createHarness({ rawSuffixById: { [okMember.id]: "partial-set", [failMember.id]: "partial-set" } });
  const result = await loadOrBuildLocalToplistSnapshots([okMember, failMember], { dependencies: h.dependencies });
  assert.equal(result.status, "empty");
  assert.equal(result.readySelections.length, 0);
  assert.equal(result.playerRows.length, 0);
  assert.equal(result.guildRows.length, 0);
  assert.deepEqual(result.failedSelections.map((failure) => failure.archiveScanId), [failMember.id]);
}

{
  const h = createHarness();
  const changedSha = { ...a, sha256: "f".repeat(64) };
  const changedVersion = await loadOrBuildLocalToplistSnapshots([a], { dependencies: h.dependencies, derivationVersion: LOCAL_TOPLIST_DERIVATION_VERSION + 1 });
  assert.equal(changedVersion.cacheMisses.length, 1);
  assert.equal(changedVersion.workerRan, true);

  const changedShaResult = await loadOrBuildLocalToplistSnapshots([changedSha], { dependencies: createHarness().dependencies });
  assert.equal(changedShaResult.cacheMisses.length, 1);
  assert.equal(changedShaResult.workerRan, true);

  const sorted = await loadOrBuildLocalToplistSnapshots([a], { dependencies: createHarness().dependencies, sortKey: "sum", page: 2, query: "ignored" });
  assert.equal(sorted.cacheHits.length, 1);
  assert.equal(sorted.workerRan, false);
}

{
  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([a, a], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.readySelections.length, 1);
  assert.equal(h.calls.workerRuns, 0);
}

{
  const oneChanged = { ...b, sha256: "9".repeat(64) };
  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([a, oneChanged, c], { dependencies: h.dependencies });
  assert.equal(result.status, "complete");
  assert.equal(result.cacheHits.length, 2);
  assert.equal(result.derivedSelections.length, 1);
  assert.deepEqual(h.calls.workerSources, [oneChanged.id]);
}

{
  const fail = entry("will-fail", "eu31", baseTimestamp + 30_000, "1");
  const h = createHarness();
  const result = await loadOrBuildLocalToplistSnapshots([a, fail, c], { dependencies: h.dependencies });
  assert.equal(result.status, "partial");
  assert.equal(result.readySelections.length, 2);
  assert.equal(result.failedSelections.length, 1);
  assert.equal(result.failedSelections[0].archiveScanId, fail.id);
  assert.equal(result.failedSelections[0].errorCode, "acquisition-error");
  assert.equal(result.playerRows.length > 0, true);
}

{
  __localToplistServiceTestUtils.clearInFlightDerivedSnapshots();
  const parallel = entry("parallel", "f8_net", baseTimestamp + 40_000, "2");
  const h = createHarness();
  const [left, right] = await Promise.all([
    loadOrBuildLocalToplistSnapshots([parallel], { dependencies: h.dependencies }),
    loadOrBuildLocalToplistSnapshots([parallel], { dependencies: h.dependencies }),
  ]);
  assert.equal(left.status, "complete");
  assert.equal(right.status, "complete");
  assert.deepEqual(h.calls.downloads, [parallel.id]);
  assert.deepEqual(h.calls.workerSources, [parallel.id]);
}

assert.equal((await listLocalToplistSnapshots()).length >= 1, true);
console.log("localToplistService.test: ok");
