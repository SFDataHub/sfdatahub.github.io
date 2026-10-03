import assert from "node:assert/strict";

import {
  loadGuildAnalyticsLocalFirstData,
  type GuildAnalyticsLocalFirstAcquisitionOutcome,
  type GuildAnalyticsLocalFirstLoadDependencies,
} from "../../src/pages/GuildHub/guildAnalyticsLocalFirst.ts";
import {
  acquireLocalFirstScans,
  type LocalFirstScanAcquisitionDependencies,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import type { LocalFirstFeatureAcquisitionDependencies } from "../../src/lib/scanArchive/localFirstFeatureAcquisition.ts";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { GuildAnalyticsDerivedData } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import type { ScanArchiveCatalog, ScanArchiveEntry, ScanArchiveSourceMetadata } from "../../src/lib/scanArchive/types.ts";

const tLocal = Date.UTC(2026, 8, 13, 21, 0, 0);
const tArchive = Date.UTC(2026, 8, 19, 21, 26, 0);
const tCustomFrom = Date.parse("2026-09-01T00:00:00");
const tCustomTo = Date.parse("2026-09-10T23:59:59.999");

const emptyAnalyticsData: GuildAnalyticsDerivedData = {
  snapshots: [],
  members: [],
  guilds: [],
};

const catalog = (year = 2026): ScanArchiveCatalog => ({
  schemaVersion: 1,
  archives: [{ year, active: true, manifestUrl: `https://example.test/${year}/manifest.json` }],
});

const archiveEntry = (id: string, server: string, timestamp: number): ScanArchiveEntry => ({
  id,
  server,
  timestamp,
  timestampUtc: new Date(timestamp).toISOString(),
  path: `2026-09/${server}/${id}.json.gz`,
  format: "sftools.raw.v1",
  compression: "gzip",
  sha256: id.replace(/[^a-f0-9]/gi, "").padEnd(64, "a").slice(0, 64),
  compressedBytes: 10,
  uncompressedBytes: 20,
  playerCount: 10,
  groupCount: 2,
  archiveYear: 2026,
  manifestRevision: 1,
  manifestUrl: "https://example.test/2026/manifest.json",
  fileUrl: `https://example.test/${id}.json.gz`,
});

const source = (entry: ScanArchiveEntry): ScanArchiveSourceMetadata => ({
  provider: "scan-archive",
  archiveScanId: entry.id,
  archiveYear: entry.archiveYear,
  manifestRevision: entry.manifestRevision,
  manifestUrl: entry.manifestUrl,
  path: entry.path,
  sha256: entry.sha256,
  server: entry.server,
  timestamp: entry.timestamp,
});

const summary = (
  id: string,
  timestamp = tLocal,
  options: { server?: string; archiveSource?: ScanArchiveSourceMetadata } = {},
): GuildHubScanSummary =>
  ({
    sourceScanId: id,
    filename: `${id}.json`,
    importedAt: 1,
    updatedAt: 1,
    importedAtIso: new Date(timestamp).toISOString(),
    updatedAtIso: new Date(timestamp).toISOString(),
    scannedAt: new Date(timestamp).toISOString(),
    logicalScanCount: 1,
    firstSnapshotTimestamp: timestamp,
    lastSnapshotTimestamp: timestamp,
    snapshotTimestamps: [timestamp],
    servers: [options.server ?? "f8_net"],
    playerCount: 10,
    groupCount: 2,
    guildCount: 2,
    guilds: [],
    guildCoverage: {},
    fusionInventorySlices: [
      {
        id: `${id}:slice`,
        snapshotId: `${id}:${timestamp}`,
        sourceScanId: id,
        sourceScanFilename: `${id}.json`,
        sourceImportedAt: new Date(timestamp).toISOString(),
        timestamp: new Date(timestamp).toISOString(),
        timestampMs: timestamp,
        server: options.server ?? "f8_net",
        playerCount: 10,
        guildCount: 2,
        playerIdentifiers: ["p1"],
        guildIdentifiers: ["g1"],
      },
    ],
    ...(options.archiveSource ? { archiveSource: options.archiveSource } : {}),
    contentHash: id,
    summaryVersion: 5,
  }) as GuildHubScanSummary;

const createDependencies = (config: {
  summaries?: GuildHubScanSummary[];
  entries?: ScanArchiveEntry[];
  failCatalog?: boolean;
} = {}) => {
  const summaries = [...(config.summaries ?? [summary("local-before")])];
  const localByArchiveId = new Map<string, GuildHubLocalScan>();
  summaries.forEach((item) => {
    if (!item.archiveSource) return;
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
  });
  const calls = {
    ensure: [] as GuildHubScanSummary[][],
    downloads: [] as string[],
    previews: 0,
    commits: 0,
    lowLevelArchiveIds: [] as string[][],
    lowLevelTimes: [] as unknown[],
  };

  const acquisitionDeps: Partial<LocalFirstScanAcquisitionDependencies> = {
    listLocalScanSummaries: async () => [...summaries],
    findLocalScanByArchiveBinding: async () => null,
    findLocalScanByArchiveScanId: async (archiveScanId) => localByArchiveId.get(archiveScanId) ?? null,
    bindLocalScanToArchiveEntry: async () => undefined,
    loadManifestEntriesForYears: async () => ({ entries: [], loadedYears: [], failures: [] }),
    loadCandidateManifestEntries: async () => ({ entries: [], loadedYears: [], failures: [] }),
    downloadArchiveEntry: async (entry) => {
      calls.downloads.push(entry.id);
      return { content: JSON.stringify({ players: [], groups: [] }) };
    },
    createLocalScanImportPreview: async (_filename, _content, options) => {
      calls.previews += 1;
      const archiveSource = options.archiveSource!;
      return {
        id: `local-${archiveSource.archiveScanId}`,
        filename: `${archiveSource.archiveScanId}.json`,
        contentHash: `hash-${archiveSource.archiveScanId}`,
        importedAt: "2026-09-28T00:00:00.000Z",
        scannedAt: new Date(archiveSource.timestamp).toISOString(),
        servers: [archiveSource.server],
        playerCount: 10,
        groupCount: 2,
        rawData: {},
        archiveSource,
      } as GuildHubLocalScan;
    },
    commitLocalScanPreview: async (scan) => {
      calls.commits += 1;
      localByArchiveId.set(scan.archiveSource!.archiveScanId, scan);
      summaries.push(summary(scan.id, scan.archiveSource!.timestamp, { server: scan.archiveSource!.server, archiveSource: scan.archiveSource! }));
      return { status: "imported" as const, scan };
    },
  };

  const featureDeps: Partial<LocalFirstFeatureAcquisitionDependencies> = {
    loadScanArchiveCatalog: async () => {
      if (config.failCatalog) throw new Error("catalog offline");
      return catalog();
    },
    loadManifestEntriesForArchives: async (archives) => ({
      entries: archives.flatMap((archive) => (archive.year === 2026 ? config.entries ?? [] : [])),
      loadedYears: archives.map((archive) => archive.year),
      failures: [],
    }),
  };

  const deps: GuildAnalyticsLocalFirstLoadDependencies = {
    listScanSummaries: async () => [...summaries],
    getLocalScan: async () => null,
    loadIdentityResolutionSnapshot: async () => null,
    ensureScopedDataFromSummaries: async (nextSummaries) => {
      calls.ensure.push([...nextSummaries]);
      return { data: emptyAnalyticsData, mode: "scoped", fallbackReason: null };
    },
    acquireLocalFirstScans: async (request, options) => {
      calls.lowLevelTimes.push(request.time);
      calls.lowLevelArchiveIds.push((options.archiveEntries ?? []).map((entry) => entry.id));
      return acquireLocalFirstScans(request, { ...options, dependencies: acquisitionDeps });
    },
    featureAcquisitionDependencies: featureDeps,
  };
  return { calls, deps, summaries };
};

const guild = {
  id: "f8_net_g1",
  name: "ENDGEGNER",
  server: "F8",
  guildId: "g1",
  logoIdentifier: "f8_net_g1",
};

{
  const f8Archive = archiveEntry("f8-archive", "f8_net", tArchive);
  const s30Archive = archiveEntry("s30-archive", "s30_eu", tArchive);
  const { calls, deps, summaries } = createDependencies({ entries: [f8Archive, s30Archive] });
  const outcomes: GuildAnalyticsLocalFirstAcquisitionOutcome[] = [];

  const result = await loadGuildAnalyticsLocalFirstData({
    guild,
    range: { key: "all" },
    selectedPlayerIds: [],
    cachedIdentityResolutionSnapshot: null,
    dependencies: deps,
    onAcquisitionOutcome: (outcome) => outcomes.push(outcome),
  });

  assert.equal(result.acquisitionOutcome.status, "completed");
  assert.equal(result.acquisitionNeed?.segments[0]?.serverCode, "F8");
  assert.deepEqual(calls.lowLevelArchiveIds[0], [f8Archive.id]);
  assert.deepEqual(calls.downloads, [f8Archive.id]);
  assert.equal(calls.previews, 1);
  assert.equal(calls.commits, 1);
  assert.equal(summaries.some((item) => item.archiveSource?.archiveScanId === f8Archive.id), true);
  assert.equal(outcomes[0]?.status, "completed");

  await loadGuildAnalyticsLocalFirstData({
    guild,
    range: { key: "all" },
    selectedPlayerIds: [],
    cachedIdentityResolutionSnapshot: null,
    dependencies: deps,
  });
  assert.deepEqual(calls.downloads, [f8Archive.id]);
  assert.equal(calls.previews, 1);
  assert.equal(calls.commits, 1);
}

{
  const outside = archiveEntry("f8-outside-custom", "f8_net", tArchive);
  const { calls, deps } = createDependencies({ summaries: [], entries: [outside] });
  await loadGuildAnalyticsLocalFirstData({
    guild,
    range: { key: "custom", from: "2026-09-01", to: "2026-09-10" },
    selectedPlayerIds: [],
    cachedIdentityResolutionSnapshot: null,
    dependencies: deps,
  });
  assert.deepEqual(calls.lowLevelTimes[0], { kind: "interval", from: tCustomFrom, to: tCustomTo });
  assert.deepEqual(calls.lowLevelArchiveIds[0], []);
  assert.deepEqual(calls.downloads, []);
}

{
  const { calls, deps } = createDependencies({ failCatalog: true, summaries: [summary("local-only")] });
  const result = await loadGuildAnalyticsLocalFirstData({
    guild,
    range: { key: "all" },
    selectedPlayerIds: [],
    cachedIdentityResolutionSnapshot: null,
    dependencies: deps,
  });
  assert.equal(result.acquisitionOutcome.status, "completed");
  assert.equal(result.acquisitionOutcome.status === "completed" && result.acquisitionOutcome.result.manifestStatus, "offline");
  assert.deepEqual(calls.downloads, []);
  assert.deepEqual(calls.ensure[0]?.map((item) => item.sourceScanId), ["local-only"]);
}

{
  const localArchive = archiveEntry("already-local", "f8_net", tArchive);
  const { calls, deps } = createDependencies({
    summaries: [summary("archive-copy", tArchive, { archiveSource: source(localArchive) })],
    entries: [localArchive],
  });
  await loadGuildAnalyticsLocalFirstData({
    guild,
    range: { key: "all" },
    selectedPlayerIds: [],
    cachedIdentityResolutionSnapshot: null,
    dependencies: deps,
  });
  assert.deepEqual(calls.downloads, []);
  assert.equal(calls.commits, 0);
}

console.log("guildAnalyticsLocalFirst.test: ok");
