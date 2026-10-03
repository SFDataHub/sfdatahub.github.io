import assert from "node:assert/strict";

import {
  __localFirstScanAcquisitionTestUtils,
  acquireLocalFirstScans,
  type LocalFirstScanAcquisitionDependencies,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import type { LocalFirstScanRequest } from "../../src/lib/guilds/localFirstScanResolver.ts";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveEntry, ScanArchiveSourceMetadata } from "../../src/lib/scanArchive/types.ts";

const manifestUrl = "https://example.test/manifest.json";
const t1 = Date.UTC(2026, 8, 19, 20, 0, 0);
const t2 = Date.UTC(2026, 8, 20, 20, 0, 0);
const t3 = Date.UTC(2026, 8, 21, 20, 0, 0);
const t2027 = Date.UTC(2027, 0, 1, 1, 0, 0);

const entry = (id: string, server: string, timestamp: number, counts: { players?: number; guilds?: number } = {}): ScanArchiveEntry => {
  const archiveYear = new Date(timestamp).getUTCFullYear();
  return {
    id,
    server,
    timestamp,
    timestampUtc: new Date(timestamp).toISOString(),
    path: `${archiveYear}/${id}.json.gz`,
    format: "sftools.raw.v1",
    compression: "gzip",
    sha256: id.replace(/[^a-f0-9]/gi, "").padEnd(64, "a").slice(0, 64),
    compressedBytes: 10,
    uncompressedBytes: 20,
    playerCount: counts.players ?? 10,
    groupCount: counts.guilds ?? 3,
    archiveYear,
    manifestRevision: 1,
    manifestUrl,
    fileUrl: `https://example.test/${id}.json.gz`,
  };
};

const source = (archive: ScanArchiveEntry): ScanArchiveSourceMetadata => ({
  provider: "scan-archive",
  archiveScanId: archive.id,
  archiveYear: archive.archiveYear,
  manifestRevision: archive.manifestRevision,
  manifestUrl: archive.manifestUrl,
  path: archive.path,
  sha256: archive.sha256,
  server: archive.server,
  timestamp: archive.timestamp,
});

const summary = (
  id: string,
  server: string,
  timestamp: number,
  counts: { players?: number; guilds?: number } = {},
  archiveSource?: ScanArchiveSourceMetadata,
): GuildHubScanSummary =>
  ({
    sourceScanId: id,
    filename: `${id}.json`,
    importedAt: 1,
    updatedAt: 1,
    importedAtIso: "2026-01-01T00:00:00.000Z",
    scannedAt: new Date(timestamp).toISOString(),
    logicalScanCount: 1,
    firstSnapshotTimestamp: timestamp,
    lastSnapshotTimestamp: timestamp,
    snapshotTimestamps: [timestamp],
    servers: [server],
    playerCount: counts.players ?? 10,
    groupCount: counts.guilds ?? 3,
    guildCount: counts.guilds ?? 3,
    guilds: [],
    guildCoverage: {} as GuildHubScanSummary["guildCoverage"],
    fusionInventorySlices: [
      {
        id: `${id}:${server}`,
        snapshotId: `${id}:${timestamp}`,
        sourceScanId: id,
        sourceScanFilename: `${id}.json`,
        sourceImportedAt: "2026-01-01T00:00:00.000Z",
        timestamp: new Date(timestamp).toISOString(),
        timestampMs: timestamp,
        server,
        playerCount: counts.players ?? 10,
        guildCount: counts.guilds ?? 3,
        playerIdentifiers: Array.from({ length: counts.players ?? 10 }, (_, index) => `${server}_p${index + 1}`),
        guildIdentifiers: Array.from({ length: counts.guilds ?? 3 }, (_, index) => `${server}_g${index + 1}`),
      },
    ],
    ...(archiveSource ? { archiveSource } : {}),
    contentHash: id,
    summaryVersion: 5,
  }) as GuildHubScanSummary;

const exactRequest = (
  server: string,
  timestamp = t1,
  dataKind: LocalFirstScanRequest["dataKind"] = "both",
): LocalFirstScanRequest => ({
  target: { kind: "server", server },
  time: { kind: "exact", timestamp },
  dataKind,
  completeness: "confirmed-archive",
});

const intervalRequest = (server: string, from = t1, to = t3): LocalFirstScanRequest => ({
  target: { kind: "server", server },
  time: { kind: "interval", from, to },
  dataKind: "both",
  completeness: "confirmed-archive",
});

const createHarness = (config: {
  summaries?: GuildHubScanSummary[];
  manifestEntriesByYear?: Record<number, ScanArchiveEntry[]>;
  downloadFailures?: Set<string>;
  raceArchiveIds?: Set<string>;
  downloadDelayMs?: number;
} = {}) => {
  const summaries = [...(config.summaries ?? [])];
  const localByArchiveId = new Map<string, GuildHubLocalScan>();
  const localByBinding = new Map<string, GuildHubLocalScan>();
  summaries.forEach((item) => {
    if (item.archiveSource) {
      localByArchiveId.set(item.archiveSource.archiveScanId, {
        id: item.sourceScanId,
        filename: item.filename,
        contentHash: item.contentHash ?? item.sourceScanId,
        importedAt: item.importedAtIso,
        scannedAt: item.scannedAt,
        servers: item.servers,
        playerCount: item.playerCount,
        groupCount: item.groupCount,
        rawData: {},
        archiveSource: item.archiveSource,
      } as GuildHubLocalScan);
    }
  });

  const calls = {
    list: 0,
    manifests: [] as number[],
    candidateManifests: 0,
    downloads: [] as string[],
    createPreview: 0,
    commit: 0,
    maxActiveDownloads: 0,
  };
  let activeDownloads = 0;
  let raceInjected = false;

  const deps: Partial<LocalFirstScanAcquisitionDependencies> = {
    listLocalScanSummaries: async () => {
      calls.list += 1;
      return [...summaries];
    },
    findLocalScanByArchiveBinding: async (archive) => localByBinding.get(`${archive.id}:${archive.sha256}`) ?? null,
    findLocalScanByArchiveScanId: async (archiveScanId) => localByArchiveId.get(archiveScanId) ?? null,
    bindLocalScanToArchiveEntry: async (archive, localScanId) => {
      const scan = [...localByArchiveId.values()].find((item) => item.id === localScanId);
      if (scan) localByBinding.set(`${archive.id}:${archive.sha256}`, scan);
    },
    loadManifestEntriesForYears: async (years) => {
      calls.manifests.push(...years);
      return {
        entries: years.flatMap((year) => config.manifestEntriesByYear?.[year] ?? []),
        loadedYears: years.filter((year) => config.manifestEntriesByYear?.[year]),
        failures: years
          .filter((year) => !config.manifestEntriesByYear?.[year])
          .map((year) => ({ year, errorCode: "manifest-error" as const, message: "missing" })),
      };
    },
    loadCandidateManifestEntries: async () => {
      calls.candidateManifests += 1;
      const years = Object.keys(config.manifestEntriesByYear ?? {}).map(Number);
      return {
        entries: years.flatMap((year) => config.manifestEntriesByYear?.[year] ?? []),
        loadedYears: years,
        failures: [],
      };
    },
    downloadArchiveEntry: async (archive) => {
      calls.downloads.push(archive.id);
      activeDownloads += 1;
      calls.maxActiveDownloads = Math.max(calls.maxActiveDownloads, activeDownloads);
      if (config.downloadDelayMs) await new Promise((resolve) => setTimeout(resolve, config.downloadDelayMs));
      activeDownloads -= 1;
      if (config.downloadFailures?.has(archive.id)) throw new Error("Download fehlgeschlagen (500).");
      if (config.raceArchiveIds?.has(archive.id) && !raceInjected) {
        raceInjected = true;
        const scan = {
          id: `race-${archive.id}`,
          filename: `${archive.id}.json`,
          contentHash: `race-${archive.id}`,
          importedAt: "2026-01-01T00:00:00.000Z",
          scannedAt: new Date(archive.timestamp).toISOString(),
          servers: [archive.server],
          playerCount: archive.playerCount,
          groupCount: archive.groupCount,
          rawData: {},
          archiveSource: source(archive),
        } as GuildHubLocalScan;
        localByArchiveId.set(archive.id, scan);
        summaries.push(summary(scan.id, archive.server, archive.timestamp, { players: archive.playerCount, guilds: archive.groupCount }, scan.archiveSource));
      }
      return { content: JSON.stringify({ players: [], groups: [] }) };
    },
    createLocalScanImportPreview: async (_filename, _content, options) => {
      calls.createPreview += 1;
      const archiveSource = options.archiveSource!;
      return {
        id: `scan-${archiveSource.archiveScanId}`,
        filename: `${archiveSource.archiveScanId}.json`,
        contentHash: `hash-${archiveSource.archiveScanId}`,
        importedAt: "2026-01-01T00:00:00.000Z",
        scannedAt: new Date(archiveSource.timestamp).toISOString(),
        servers: [archiveSource.server],
        playerCount: 10,
        groupCount: 3,
        rawData: {},
        archiveSource,
      } as GuildHubLocalScan;
    },
    commitLocalScanPreview: async (scan) => {
      calls.commit += 1;
      localByArchiveId.set(scan.archiveSource!.archiveScanId, scan);
      summaries.push(summary(scan.id, scan.archiveSource!.server, scan.archiveSource!.timestamp, { players: scan.playerCount, guilds: scan.groupCount }, scan.archiveSource));
      return { status: "imported" as const, scan };
    },
  };

  return { deps, calls, summaries };
};

const a = entry("a", "f8_net", t1);
const b = entry("b", "f8_net", t2);
const c = entry("c", "f8_net", t3);

__localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();

{
  const h = createHarness({ summaries: [summary("local", "f8_net", t1, {}, source(a))] });
  const result = await acquireLocalFirstScans(exactRequest("F8"), { archiveEntries: [a], dependencies: h.deps });
  assert.equal(result.status, "complete");
  assert.equal(result.networkAccessed, false);
  assert.deepEqual(h.calls.manifests, []);
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.commit, 0);
}

{
  const h = createHarness({ manifestEntriesByYear: { 2026: [a] } });
  const result = await acquireLocalFirstScans(exactRequest("F8"), { availableManifestYears: [], dependencies: h.deps });
  assert.deepEqual(h.calls.manifests, [2026]);
  assert.equal(result.loadedManifestYears[0], 2026);
  assert.equal(result.status, "complete");
}

{
  const h = createHarness();
  const result = await acquireLocalFirstScans(exactRequest("F8"), { archiveEntries: [a], availableManifestYears: [2026], dependencies: h.deps });
  assert.deepEqual(h.calls.downloads, [a.id]);
  assert.equal(h.calls.createPreview, 1);
  assert.equal(h.calls.commit, 1);
  assert.equal(result.status, "complete");
  assert.deepEqual(result.acquiredArchives.map((item) => item.archiveScanId), [a.id]);
}

{
  const h = createHarness({ summaries: [summary("local", "f8_net", t1, {}, source(a))] });
  const result = await acquireLocalFirstScans(exactRequest("F8"), { archiveEntries: [a], dependencies: h.deps });
  assert.equal(result.status, "complete");
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.commit, 0);
}

{
  const h = createHarness({ raceArchiveIds: new Set([a.id]) });
  const result = await acquireLocalFirstScans(exactRequest("F8"), { archiveEntries: [a], availableManifestYears: [2026], dependencies: h.deps });
  assert.deepEqual(h.calls.downloads, [a.id]);
  assert.equal(h.calls.commit, 0);
  assert.deepEqual(result.skippedArchives.map((item) => item.reason), ["race-already-local"]);
}

{
  __localFirstScanAcquisitionTestUtils.clearInFlightArchiveImports();
  const h = createHarness({ downloadDelayMs: 20 });
  const options = { archiveEntries: [a], availableManifestYears: [2026], dependencies: h.deps };
  const [left, right] = await Promise.all([
    acquireLocalFirstScans(exactRequest("F8"), options),
    acquireLocalFirstScans(exactRequest("F8"), options),
  ]);
  assert.equal(left.status, "complete");
  assert.equal(right.status, "complete");
  assert.deepEqual(h.calls.downloads, [a.id]);
  assert.equal(h.calls.commit, 1);
}

{
  const h = createHarness({ downloadDelayMs: 20 });
  const result = await acquireLocalFirstScans(intervalRequest("F8"), { archiveEntries: [a, b, c], availableManifestYears: [2026], dependencies: h.deps });
  assert.equal(result.status, "complete");
  assert.equal(h.calls.downloads.length, 3);
  assert.equal(h.calls.maxActiveDownloads <= 2, true);
}

{
  const h = createHarness({ downloadFailures: new Set([b.id]) });
  const result = await acquireLocalFirstScans(intervalRequest("F8", t1, t2), { archiveEntries: [a, b], availableManifestYears: [2026], dependencies: h.deps });
  assert.equal(result.status, "partial");
  assert.deepEqual(result.acquiredArchives.map((item) => item.archiveScanId), [a.id]);
  assert.deepEqual(result.failedArchives.map((item) => item.archiveScanId), [b.id]);
}

{
  const players = entry("players", "f8_net", t1, { players: 10, guilds: 0 });
  const guilds = entry("guilds", "f8_net", t2, { players: 0, guilds: 3 });
  const h = createHarness({ summaries: [summary("player-local", "f8_net", t1, { players: 10, guilds: 0 }, source(players))] });
  assert.equal((await acquireLocalFirstScans(exactRequest("F8", t1, "players"), { archiveEntries: [players], dependencies: h.deps })).status, "complete");
  assert.equal((await acquireLocalFirstScans(exactRequest("F8", t1, "guilds"), { archiveEntries: [players, guilds], dependencies: h.deps })).status, "empty");
}

{
  const h = createHarness();
  const result = await acquireLocalFirstScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "exact", timestamp: t1 },
      dataKind: "both",
      completeness: "confirmed-archive",
      segments: [{ id: "resolved-f8", server: "f8_net", from: t1, to: t1 }],
    },
    { archiveEntries: [a, entry("stumble", "stumblesteppe_net", t1)], availableManifestYears: [2026], dependencies: h.deps },
  );
  assert.equal(result.status, "complete");
  assert.deepEqual(h.calls.downloads, [a.id]);
}

{
  const h = createHarness({ manifestEntriesByYear: { 2027: [entry("future", "f8_net", t2027)] } });
  const result = await acquireLocalFirstScans(exactRequest("F8", t2027), { availableManifestYears: [2026], dependencies: h.deps });
  assert.deepEqual(h.calls.manifests, [2027]);
  assert.equal(result.status, "complete");
}

console.log("localFirstScanAcquisition.test: ok");
