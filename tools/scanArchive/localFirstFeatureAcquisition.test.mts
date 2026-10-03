import assert from "node:assert/strict";

import {
  __localFirstFeatureAcquisitionTestUtils,
  acquireLocalFirstFeatureScans,
  createLocalFirstFeatureAcquisitionCoordinator,
  prepareLocalFirstFeatureAcquisition,
  type LocalFirstFeatureAcquisitionDependencies,
  type LocalFirstFeatureRequest,
} from "../../src/lib/scanArchive/localFirstFeatureAcquisition.ts";
import {
  acquireLocalFirstScans,
  type LocalFirstScanAcquisitionDependencies,
} from "../../src/lib/scanArchive/localFirstScanAcquisition.ts";
import type { LocalFirstScanRequest } from "../../src/lib/guilds/localFirstScanResolver.ts";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveCatalog, ScanArchiveEntry, ScanArchiveSourceMetadata } from "../../src/lib/scanArchive/types.ts";

const DAY_MS = 86_400_000;
const tLocalOld = Date.UTC(2026, 8, 1, 12, 0, 0);
const tLocalMid = Date.UTC(2026, 8, 13, 21, 0, 0);
const tArchiveNew = Date.UTC(2026, 8, 19, 21, 26, 0);
const tArchiveOutside = Date.UTC(2026, 7, 1, 12, 0, 0);
const t2025 = Date.UTC(2025, 11, 31, 23, 0, 0);

const catalog = (...years: number[]): ScanArchiveCatalog => ({
  schemaVersion: 1,
  archives: years.map((year) => ({
    year,
    active: true,
    manifestUrl: `https://example.test/${year}/manifest.json`,
  })),
});

const entry = (id: string, server: string, timestamp: number): ScanArchiveEntry => {
  const archiveYear = new Date(timestamp).getUTCFullYear();
  return {
    id,
    server,
    timestamp,
    timestampUtc: new Date(timestamp).toISOString(),
    path: `${archiveYear}/${server}/${id}.json.gz`,
    format: "sftools.raw.v1",
    compression: "gzip",
    sha256: id.replace(/[^a-f0-9]/gi, "").padEnd(64, "a").slice(0, 64),
    compressedBytes: 10,
    uncompressedBytes: 20,
    playerCount: 10,
    groupCount: 2,
    archiveYear,
    manifestRevision: 1,
    manifestUrl: `https://example.test/${archiveYear}/manifest.json`,
    fileUrl: `https://example.test/${archiveYear}/${server}/${id}.json.gz`,
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
  archiveSource?: ScanArchiveSourceMetadata,
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
    servers: [server],
    playerCount: 10,
    groupCount: 2,
    guildCount: 2,
    guilds: [],
    guildCoverage: {},
    fusionInventorySlices: [
      {
        id: `${id}:${server}`,
        snapshotId: `${id}:${timestamp}`,
        sourceScanId: id,
        sourceScanFilename: `${id}.json`,
        sourceImportedAt: new Date(timestamp).toISOString(),
        timestamp: new Date(timestamp).toISOString(),
        timestampMs: timestamp,
        server,
        playerCount: 10,
        guildCount: 2,
        playerIdentifiers: [`${server}_p1`],
        guildIdentifiers: [`${server}_g1`],
      },
    ],
    ...(archiveSource ? { archiveSource } : {}),
    contentHash: id,
    summaryVersion: 5,
  }) as GuildHubScanSummary;

const createHarness = (config: {
  summaries?: GuildHubScanSummary[];
  entriesByYear?: Record<number, ScanArchiveEntry[]>;
  catalog?: ScanArchiveCatalog;
  manifestDelayMs?: number;
  failCatalog?: boolean;
} = {}) => {
  const summaries = [...(config.summaries ?? [])];
  const localByArchiveId = new Map<string, GuildHubLocalScan>();
  const localByBinding = new Map<string, GuildHubLocalScan>();
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
    catalog: 0,
    manifestYears: [] as number[],
    lowLevelRequests: [] as LocalFirstScanRequest[],
    lowLevelArchiveIds: [] as string[][],
    downloads: [] as string[],
    previews: 0,
    commits: 0,
  };

  const acquisitionDeps: Partial<LocalFirstScanAcquisitionDependencies> = {
    listLocalScanSummaries: async () => [...summaries],
    findLocalScanByArchiveBinding: async (archive) => localByBinding.get(`${archive.id}:${archive.sha256}`) ?? null,
    findLocalScanByArchiveScanId: async (archiveScanId) => localByArchiveId.get(archiveScanId) ?? null,
    bindLocalScanToArchiveEntry: async (archive, localScanId) => {
      const scan = [...localByArchiveId.values()].find((item) => item.id === localScanId);
      if (scan) localByBinding.set(`${archive.id}:${archive.sha256}`, scan);
    },
    loadManifestEntriesForYears: async () => ({ entries: [], loadedYears: [], failures: [] }),
    loadCandidateManifestEntries: async () => ({ entries: [], loadedYears: [], failures: [] }),
    downloadArchiveEntry: async (archive) => {
      calls.downloads.push(archive.id);
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
      summaries.push(summary(scan.id, scan.archiveSource!.server, scan.archiveSource!.timestamp, scan.archiveSource!));
      return { status: "imported" as const, scan };
    },
  };

  const deps: Partial<LocalFirstFeatureAcquisitionDependencies> = {
    listLocalScanSummaries: async () => [...summaries],
    loadScanArchiveCatalog: async () => {
      calls.catalog += 1;
      if (config.failCatalog) throw new Error("catalog offline");
      return config.catalog ?? catalog(2026);
    },
    loadManifestEntriesForArchives: async (archives) => {
      calls.manifestYears.push(...archives.map((archive) => archive.year));
      if (config.manifestDelayMs) await new Promise((resolve) => setTimeout(resolve, config.manifestDelayMs));
      return {
        entries: archives.flatMap((archive) => config.entriesByYear?.[archive.year] ?? []),
        loadedYears: archives.map((archive) => archive.year).filter((year) => config.entriesByYear?.[year]),
        failures: [],
      };
    },
    acquireLocalFirstScans: async (request, options) => {
      calls.lowLevelRequests.push(request);
      calls.lowLevelArchiveIds.push((options.archiveEntries ?? []).map((archive) => archive.id));
      return acquireLocalFirstScans(request, { ...options, dependencies: acquisitionDeps });
    },
  };

  return { calls, deps, summaries };
};

const f8Archive = entry("f8-2026-09-19", "f8_net", tArchiveNew);
const f8Outside = entry("f8-2026-08-01", "f8_net", tArchiveOutside);
const s30Archive = entry("s30-2026-09-19", "s30_eu", tArchiveNew);

__localFirstFeatureAcquisitionTestUtils.clearManifestInflight();

{
  const h = createHarness({
    summaries: [
      summary("f8-local-1", "f8_net", Date.UTC(2026, 8, 5, 10, 0, 0)),
      summary("f8-local-2", "f8_net", Date.UTC(2026, 8, 9, 10, 0, 0)),
      summary("f8-local-3", "f8_net", tLocalMid),
    ],
    entriesByYear: { 2026: [f8Archive, s30Archive] },
  });
  const request: LocalFirstFeatureRequest = {
    target: { kind: "server", server: "F8" },
    time: { kind: "all" },
    dataKind: "both",
    completeness: "usable-snapshot",
  };

  const first = await acquireLocalFirstFeatureScans(request, { dependencies: h.deps });
  assert.equal(first.status, "complete");
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
  assert.equal(h.calls.previews, 1);
  assert.equal(h.calls.commits, 1);
  assert.deepEqual(h.calls.lowLevelArchiveIds[0], [f8Archive.id]);
  assert.deepEqual(first.preparedRequest.request.time, { kind: "interval", from: Date.UTC(2026, 8, 5, 10, 0, 0), to: tArchiveNew });

  await acquireLocalFirstFeatureScans(request, { dependencies: h.deps });
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
  assert.equal(h.calls.previews, 1);
  assert.equal(h.calls.commits, 1);
}

{
  const localArchive = entry("f8-exact", "f8_net", tArchiveNew);
  const h = createHarness({
    summaries: [summary("already-local", "f8_net", tArchiveNew, source(localArchive))],
    entriesByYear: { 2026: [localArchive] },
  });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "exact", timestamp: tArchiveNew },
      dataKind: "both",
      completeness: "confirmed-archive",
    },
    { dependencies: h.deps },
  );
  assert.equal(result.status, "complete");
  assert.deepEqual(h.calls.downloads, []);
  assert.equal(h.calls.commits, 0);
}

{
  const h = createHarness({
    summaries: [summary("f8-local-old", "f8_net", tLocalOld)],
    entriesByYear: { 2026: [f8Archive, f8Outside, s30Archive] },
  });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "relative", durationMs: 30 * DAY_MS },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(result.preparedRequest.request.time, { kind: "interval", from: tArchiveNew - 30 * DAY_MS, to: tArchiveNew });
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
}

{
  const h = createHarness({
    entriesByYear: { 2026: [f8Archive] },
  });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "interval", from: tLocalOld, to: tLocalMid },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(result.preparedRequest.request.time, { kind: "interval", from: tLocalOld, to: tLocalMid });
  assert.deepEqual(result.preparedRequest.archiveEntries.map((archive) => archive.id), []);
  assert.deepEqual(h.calls.downloads, []);
}

{
  const oldArchive = entry("f8-2025-12-31", "f8_net", t2025);
  const h = createHarness({
    catalog: catalog(2025, 2026),
    summaries: [summary("f8-local", "f8_net", tLocalOld)],
    entriesByYear: { 2025: [oldArchive], 2026: [f8Archive] },
  });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "all" },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(result.preparedRequest.request.time, { kind: "interval", from: t2025, to: tArchiveNew });
  assert.deepEqual([...new Set(h.calls.manifestYears)].sort(), [2025, 2026]);
}

{
  const stumble = entry("stumble", "stumblesteppe_net", tArchiveNew);
  const h = createHarness({ entriesByYear: { 2026: [f8Archive, stumble, s30Archive] } });
  await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "STUMPLESTEPPE" },
      time: { kind: "all" },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(h.calls.downloads, [stumble.id]);
}

{
  const inside = entry("fusion-f8-inside", "f8_net", tLocalMid);
  const outside = entry("fusion-s30-outside", "s30_eu", tArchiveNew);
  const insideOrigin = entry("fusion-s30-inside", "s30_eu", tLocalOld);
  const h = createHarness({ entriesByYear: { 2026: [inside, outside, insideOrigin] } });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: {
        kind: "fusion-scope",
        scope: {
          id: "feature-test-fusion",
          eventId: "feature-test-fusion",
          targetServerCode: "F8",
          lineageServerCodes: ["F8", "EU30"],
          originServerCodes: ["EU30"],
          directOriginServerCodes: ["EU30"],
        },
      },
      segments: [
        { id: "f8-window", server: "F8", from: tLocalMid, to: tArchiveNew },
        { id: "s30-window", server: "EU30", from: tLocalOld, to: tLocalMid },
      ],
      time: { kind: "all" },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(result.preparedRequest.archiveEntries.map((archive) => archive.id), [insideOrigin.id, inside.id]);
}

{
  const h = createHarness({
    failCatalog: true,
    summaries: [summary("f8-local", "f8_net", tLocalMid)],
  });
  const result = await acquireLocalFirstFeatureScans(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "all" },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.equal(result.manifestStatus, "offline");
  assert.equal(result.status, "partial");
  assert.deepEqual(h.calls.downloads, []);
}

{
  const h = createHarness({
    entriesByYear: { 2026: [f8Archive] },
    manifestDelayMs: 20,
  });
  await Promise.all([
    acquireLocalFirstFeatureScans(
      { target: { kind: "server", server: "F8" }, time: { kind: "all" }, dataKind: "both", completeness: "usable-snapshot" },
      { dependencies: h.deps },
    ),
    acquireLocalFirstFeatureScans(
      { target: { kind: "server", server: "F8" }, time: { kind: "all" }, dataKind: "both", completeness: "usable-snapshot" },
      { dependencies: h.deps },
    ),
  ]);
  assert.deepEqual(h.calls.downloads, [f8Archive.id]);
}

{
  __localFirstFeatureAcquisitionTestUtils.clearManifestInflight();
  let manifestFetches = 0;
  const manifest = {
    schemaVersion: 1,
    archiveYear: 2026,
    revision: 1,
    updatedAt: "2026-09-28T00:00:00.000Z",
    scanCount: 1,
    serverCount: 1,
    scans: [
      {
        id: "default-loader-f8",
        server: "f8_net",
        timestamp: tArchiveNew,
        path: "2026/f8_net/default-loader-f8.json.gz",
        format: "sftools.raw.v1",
        compression: "gzip",
        sha256: "a".repeat(64),
        compressedBytes: 10,
        uncompressedBytes: 20,
        playerCount: 10,
        groupCount: 2,
      },
    ],
  };
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/catalog.json")) {
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          archives: [{ year: 2026, active: true, manifestUrl: "https://example.test/manifest-2026.json" }],
        }),
        { status: 200 },
      );
    }
    if (url === "https://example.test/manifest-2026.json") {
      manifestFetches += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const request: LocalFirstFeatureRequest = {
    target: { kind: "server", server: "F8" },
    time: { kind: "all" },
    dataKind: "both",
    completeness: "usable-snapshot",
  };
  const [left, right] = await Promise.all([
    prepareLocalFirstFeatureAcquisition(request, {
      localScanSummaries: [],
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    }),
    prepareLocalFirstFeatureAcquisition(request, {
      localScanSummaries: [],
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    }),
  ]);
  assert.deepEqual(left.archiveEntries.map((archive) => archive.id), ["default-loader-f8"]);
  assert.deepEqual(right.archiveEntries.map((archive) => archive.id), ["default-loader-f8"]);
  assert.equal(manifestFetches, 1);
}

{
  const h = createHarness({ entriesByYear: { 2026: [f8Archive] } });
  const coordinator = createLocalFirstFeatureAcquisitionCoordinator();
  const request: LocalFirstFeatureRequest = {
    target: { kind: "server", server: "F8" },
    time: { kind: "all" },
    dataKind: "both",
    completeness: "usable-snapshot",
  };
  const [left, right] = await Promise.all([
    coordinator.run(request, { dependencies: h.deps }),
    coordinator.run(request, { dependencies: h.deps }),
  ]);
  assert.equal(left, right);
  assert.equal(coordinator.getState().status, "success");

  const next = coordinator.run(
    { ...request, time: { kind: "interval", from: tLocalOld, to: tLocalMid } },
    { dependencies: h.deps },
  );
  assert.equal(coordinator.getState().status, "running");
  await next;
  assert.equal(coordinator.getState().status, "success");
}

{
  const h = createHarness({ entriesByYear: { 2026: [f8Archive] } });
  const prepared = await prepareLocalFirstFeatureAcquisition(
    {
      target: { kind: "server", server: "F8" },
      time: { kind: "all" },
      dataKind: "both",
      completeness: "usable-snapshot",
    },
    { dependencies: h.deps },
  );
  assert.deepEqual(prepared.archiveEntries.map((archive) => archive.id), [f8Archive.id]);
}

console.log("localFirstFeatureAcquisition.test: ok");
