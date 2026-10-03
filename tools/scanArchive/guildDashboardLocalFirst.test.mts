import assert from "node:assert/strict";

import {
  acquireDashboardLocalFirstFeatureScans,
  buildDashboardLocalFirstFeatureRequest,
} from "../../src/pages/GuildHub/dashboardLocalFirst.ts";
import { loadGuildAnalyticsLocalFirstData } from "../../src/pages/GuildHub/guildAnalyticsLocalFirst.ts";
import {
  acquireLocalFirstScans,
  type LocalFirstScanAcquisitionDependencies,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import {
  createLocalFirstFeatureAcquisitionCoordinator,
  type LocalFirstFeatureAcquisitionDependencies,
} from "../../src/lib/scanArchive/localFirstFeatureAcquisition.ts";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { GuildAnalyticsDerivedData } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import type { ScanArchiveCatalog, ScanArchiveEntry, ScanArchiveSourceMetadata } from "../../src/lib/scanArchive/types.ts";

const tLocal = Date.UTC(2026, 8, 13, 21, 0, 0);
const tArchive = Date.UTC(2026, 8, 19, 21, 26, 0);

const emptyAnalyticsData: GuildAnalyticsDerivedData = {
  snapshots: [],
  members: [],
  guilds: [],
};

const guild = {
  id: "f8_net_g1",
  name: "ENDGEGNER",
  server: "F8",
  guildId: "g1",
  logoIdentifier: "f8_net_g1",
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
  playerCount: 50,
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
    playerCount: 50,
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
        playerCount: 50,
        guildCount: 2,
        playerIdentifiers: ["p1"],
        guildIdentifiers: ["g1"],
      },
    ],
    ...(options.archiveSource ? { archiveSource: options.archiveSource } : {}),
    contentHash: id,
    summaryVersion: 5,
  }) as GuildHubScanSummary;

const createHarness = (config: {
  summaries?: GuildHubScanSummary[];
  entries?: ScanArchiveEntry[];
  failCatalog?: boolean;
  downloadDelayMs?: number;
} = {}) => {
  const summaries = [...(config.summaries ?? [summary("f8-local-before")])];
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
    ensureAnalytics: 0,
    downloads: [] as string[],
    previews: 0,
    commits: 0,
    lowLevelArchiveIds: [] as string[][],
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
      if (config.downloadDelayMs) await new Promise((resolve) => setTimeout(resolve, config.downloadDelayMs));
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
        playerCount: 50,
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
    listLocalScanSummaries: async () => [...summaries],
    loadScanArchiveCatalog: async () => {
      if (config.failCatalog) throw new Error("catalog offline");
      return catalog();
    },
    loadManifestEntriesForArchives: async (archives) => ({
      entries: archives.flatMap((archive) => (archive.year === 2026 ? config.entries ?? [] : [])),
      loadedYears: archives.map((archive) => archive.year),
      failures: [],
    }),
    acquireLocalFirstScans: async (request, options) => {
      calls.lowLevelArchiveIds.push((options.archiveEntries ?? []).map((entry) => entry.id));
      return acquireLocalFirstScans(request, { ...options, dependencies: acquisitionDeps });
    },
  };

  return { calls, featureDeps, summaries };
};

const f8Archive = archiveEntry("f8-2026-09-19", "f8_net", tArchive);
const s30Archive = archiveEntry("s30-2026-09-19", "s30_eu", tArchive);

{
  const request = buildDashboardLocalFirstFeatureRequest(guild);
  assert.equal(request?.time.kind, "all");
  assert.equal(request?.dataKind, "both");
  assert.equal(request?.completeness, "usable-snapshot");
  assert.equal(request?.target.kind, "fusion-scope");
  assert.equal(request?.target.kind === "fusion-scope" && request.target.scope.targetServerCode, "F8");
  assert.equal(request?.segments?.some((segment) => segment.server === "F8" && segment.from === Date.UTC(2024, 0, 12)), true);
}

{
  const h = createHarness({ entries: [f8Archive, s30Archive] });
  const result = await acquireDashboardLocalFirstFeatureScans(guild, {
    coordinator: createLocalFirstFeatureAcquisitionCoordinator(),
    localScanSummaries: h.summaries,
    dependencies: h.featureDeps,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.result.acquiredArchives[0]?.archiveScanId, f8Archive.id);
  assert.deepEqual(h.calls.lowLevelArchiveIds[0], [f8Archive.id]);
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
  assert.equal(h.calls.previews, 1);
  assert.equal(h.calls.commits, 1);
  assert.equal(h.calls.ensureAnalytics, 0);

  await acquireDashboardLocalFirstFeatureScans(guild, {
    coordinator: createLocalFirstFeatureAcquisitionCoordinator(),
    localScanSummaries: h.summaries,
    dependencies: h.featureDeps,
  });
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
  assert.equal(h.calls.commits, 1);
}

{
  const localArchive = archiveEntry("already-local", "f8_net", tArchive);
  const h = createHarness({
    summaries: [summary("analytics-saved", tArchive, { archiveSource: source(localArchive) })],
    entries: [localArchive],
  });
  await acquireDashboardLocalFirstFeatureScans(guild, {
    coordinator: createLocalFirstFeatureAcquisitionCoordinator(),
    localScanSummaries: h.summaries,
    dependencies: h.featureDeps,
  });
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.commits, 0);
}

{
  const h = createHarness({ entries: [f8Archive, s30Archive], downloadDelayMs: 20 });
  await Promise.all([
    acquireDashboardLocalFirstFeatureScans(guild, {
      coordinator: createLocalFirstFeatureAcquisitionCoordinator(),
      localScanSummaries: h.summaries,
      dependencies: h.featureDeps,
    }),
    loadGuildAnalyticsLocalFirstData({
      guild,
      range: { key: "all" },
      selectedPlayerIds: [],
      cachedIdentityResolutionSnapshot: null,
      dependencies: {
        listScanSummaries: async () => [...h.summaries],
        getLocalScan: async () => null,
        loadIdentityResolutionSnapshot: async () => null,
        ensureScopedDataFromSummaries: async () => {
          h.calls.ensureAnalytics += 1;
          return { data: emptyAnalyticsData, mode: "scoped", fallbackReason: null };
        },
        acquireLocalFirstScans: async (request, options) =>
          acquireLocalFirstScans(request, {
            ...options,
            dependencies: {
              listLocalScanSummaries: async () => [...h.summaries],
              findLocalScanByArchiveScanId: async () => null,
              loadManifestEntriesForYears: async () => ({ entries: [], loadedYears: [], failures: [] }),
              loadCandidateManifestEntries: async () => ({ entries: [], loadedYears: [], failures: [] }),
              downloadArchiveEntry: async (entry) => {
                h.calls.downloads.push(entry.id);
                await new Promise((resolve) => setTimeout(resolve, 20));
                return { content: JSON.stringify({ players: [], groups: [] }) };
              },
              createLocalScanImportPreview: async (_filename, _content, previewOptions) => {
                h.calls.previews += 1;
                return {
                  id: `local-${previewOptions.archiveSource!.archiveScanId}`,
                  filename: `${previewOptions.archiveSource!.archiveScanId}.json`,
                  contentHash: `hash-${previewOptions.archiveSource!.archiveScanId}`,
                  importedAt: "2026-09-28T00:00:00.000Z",
                  scannedAt: new Date(previewOptions.archiveSource!.timestamp).toISOString(),
                  servers: [previewOptions.archiveSource!.server],
                  playerCount: 50,
                  groupCount: 2,
                  rawData: {},
                  archiveSource: previewOptions.archiveSource,
                } as GuildHubLocalScan;
              },
              commitLocalScanPreview: async (scan) => {
                h.calls.commits += 1;
                h.summaries.push(summary(scan.id, scan.archiveSource!.timestamp, { server: scan.archiveSource!.server, archiveSource: scan.archiveSource! }));
                return { status: "imported" as const, scan };
              },
            },
          }),
        featureAcquisitionDependencies: h.featureDeps,
      },
    }),
  ]);
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
  assert.equal(h.calls.previews, 1);
  assert.equal(h.calls.commits, 1);
}

{
  const h = createHarness({ failCatalog: true, summaries: [summary("local-only")] });
  const result = await acquireDashboardLocalFirstFeatureScans(guild, {
    coordinator: createLocalFirstFeatureAcquisitionCoordinator(),
    localScanSummaries: h.summaries,
    dependencies: h.featureDeps,
  });
  assert.equal(result.status, "completed");
  assert.equal(result.result.manifestStatus, "offline");
  assert.deepEqual(h.calls.downloads, []);
}

{
  const result = await acquireDashboardLocalFirstFeatureScans(null);
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no-active-guild");
}

console.log("guildDashboardLocalFirst.test: ok");
