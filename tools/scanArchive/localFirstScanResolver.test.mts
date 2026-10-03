import assert from "node:assert/strict";

import {
  buildLocalFirstFusionScopeSegments,
  resolveLocalFirstScanPlan,
  resolveLocalFirstScanSegments,
  type LocalFirstScanPlan,
  type LocalFirstScanRequest,
} from "../../src/lib/guilds/localFirstScanResolver.ts";
import type { FusionIdentityAnalysisScope } from "../../src/lib/identities/fusionIdentityScopes.ts";
import type { GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
import type { ScanArchiveEntry, ScanArchiveSourceMetadata } from "../../src/lib/scanArchive/types.ts";

const manifestUrl = "https://example.test/scan-archive/manifest.json";
const t2026a = Date.UTC(2026, 8, 19, 20, 0, 0, 0);
const t2026b = Date.UTC(2026, 8, 20, 20, 0, 0, 0);
const t2026c = Date.UTC(2026, 11, 31, 23, 0, 0, 0);
const t2027a = Date.UTC(2027, 0, 1, 1, 0, 0, 0);

const archiveEntry = (
  id: string,
  server: string,
  timestamp: number,
  counts: { players?: number; guilds?: number } = {},
): ScanArchiveEntry => {
  const archiveYear = new Date(timestamp).getUTCFullYear();
  return {
    id,
    server,
    timestamp,
    timestampUtc: new Date(timestamp).toISOString(),
    path: `${archiveYear}/scan.json.gz`,
    format: "sftools.raw.v1",
    compression: "gzip",
    sha256: `${id.replace(/[^a-f0-9]/gi, "").padEnd(64, "a").slice(0, 64)}`,
    compressedBytes: 10,
    uncompressedBytes: 20,
    playerCount: counts.players ?? 10,
    groupCount: counts.guilds ?? 3,
    archiveYear,
    manifestRevision: 1,
    manifestUrl,
    fileUrl: `${manifestUrl}/${id}.json.gz`,
  };
};

const archiveSource = (entry: ScanArchiveEntry): ScanArchiveSourceMetadata => ({
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
  slices: Array<{ server: string; timestamp: number; players?: number; guilds?: number }>,
  options: { archiveSource?: ScanArchiveSourceMetadata } = {},
): GuildHubScanSummary =>
  ({
    sourceScanId: id,
    filename: `${id}.json`,
    importedAt: 1,
    updatedAt: 1,
    importedAtIso: "2026-01-01T00:00:00.000Z",
    scannedAt: slices.length === 1 ? new Date(slices[0].timestamp).toISOString() : null,
    logicalScanCount: new Set(slices.map((slice) => slice.timestamp)).size,
    firstSnapshotTimestamp: Math.min(...slices.map((slice) => slice.timestamp)),
    lastSnapshotTimestamp: Math.max(...slices.map((slice) => slice.timestamp)),
    snapshotTimestamps: [...new Set(slices.map((slice) => slice.timestamp))].sort((left, right) => left - right),
    servers: [...new Set(slices.map((slice) => slice.server))].sort(),
    playerCount: slices.reduce((sum, slice) => sum + (slice.players ?? 0), 0),
    groupCount: slices.reduce((sum, slice) => sum + (slice.guilds ?? 0), 0),
    guildCount: slices.reduce((sum, slice) => sum + (slice.guilds ?? 0), 0),
    guilds: [],
    guildCoverage: {} as GuildHubScanSummary["guildCoverage"],
    fusionInventorySlices: slices.map((slice, index) => ({
      id: `${id}:${index}`,
      snapshotId: `${id}:${slice.timestamp}`,
      sourceScanId: id,
      sourceScanFilename: `${id}.json`,
      sourceImportedAt: "2026-01-01T00:00:00.000Z",
      timestamp: new Date(slice.timestamp).toISOString(),
      timestampMs: slice.timestamp,
      server: slice.server,
      playerCount: slice.players ?? 0,
      guildCount: slice.guilds ?? 0,
      playerIdentifiers: Array.from({ length: slice.players ?? 0 }, (_, item) => `${slice.server}_p${item + 1}`),
      guildIdentifiers: Array.from({ length: slice.guilds ?? 0 }, (_, item) => `${slice.server}_g${item + 1}`),
    })),
    ...(options.archiveSource ? { archiveSource: options.archiveSource } : {}),
    contentHash: id,
    summaryVersion: 5,
  }) as GuildHubScanSummary;

const request = (
  server: string,
  time: LocalFirstScanRequest["time"],
  completeness: LocalFirstScanRequest["completeness"] = "usable-snapshot",
  dataKind: LocalFirstScanRequest["dataKind"] = "both",
): LocalFirstScanRequest => ({
  target: { kind: "server", server },
  time,
  dataKind,
  completeness,
});

const stablePlan = (plan: LocalFirstScanPlan) => ({
  status: plan.status,
  requiredManifestYears: plan.requiredManifestYears,
  missingManifestYears: plan.missingManifestYears,
  localScanIds: plan.localScanIds,
  localSnapshots: plan.localSnapshots.map((snapshot) => ({
    id: snapshot.id,
    serverCode: snapshot.serverCode,
    timestamp: snapshot.timestamp,
    coverage: snapshot.coverage,
    satisfiesRequirement: snapshot.satisfiesRequirement,
    reasonCodes: snapshot.reasonCodes,
  })),
  fulfilledSegments: plan.fulfilledSegments,
  missingSegments: plan.missingSegments,
  archiveCandidates: plan.archiveCandidates.map((candidate) => candidate.id),
  reasonCodes: plan.reasonCodes,
});

const f8a = archiveEntry("f8-a", "f8_net", t2026a);
const f8b = archiveEntry("f8-b", "f8_net", t2026b);
const stumble = archiveEntry("stumble-a", "stumblesteppe_net", t2026a);

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }, "confirmed-archive"),
    localScanSummaries: [summary("local-archive", [{ server: "f8_net", timestamp: t2026a, players: 10, guilds: 3 }], { archiveSource: archiveSource(f8a) })],
    archiveEntries: [f8a],
  });
  assert.equal(plan.status, "complete");
  assert.deepEqual(plan.archiveCandidates, []);
  assert.equal(plan.localSnapshots[0].coverage, "exact-archive-copy");
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }, "confirmed-archive"),
    localScanSummaries: [summary("local-archive", [{ server: "f8_net", timestamp: t2026a, players: 10, guilds: 3 }], { archiveSource: archiveSource(f8a) })],
    archiveEntries: [f8a],
  });
  assert.equal(plan.archiveCandidates.some((candidate) => candidate.id === f8a.id), false);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }),
    localScanSummaries: [summary("own", [{ server: "f8_net", timestamp: t2026a, players: 8, guilds: 2 }])],
    archiveEntries: [],
  });
  assert.equal(plan.status, "complete");
  assert.equal(plan.localSnapshots[0].coverage, "usable-local-snapshot");
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }, "confirmed-archive"),
    localScanSummaries: [summary("own", [{ server: "f8_net", timestamp: t2026a, players: 8, guilds: 2 }])],
    archiveEntries: [f8a],
  });
  assert.equal(plan.status, "partial");
  assert.equal(plan.localSnapshots[0].coverage, "unverified-local-coverage");
  assert.equal(plan.archiveCandidates[0].id, f8a.id);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }, "usable-snapshot", "both"),
    localScanSummaries: [summary("partial", [{ server: "f8_net", timestamp: t2026a, players: 8, guilds: 0 }])],
    archiveEntries: [f8a],
  });
  assert.equal(plan.status, "partial");
  assert.equal(plan.fulfilledSegments.length, 0);
  assert.equal(plan.missingSegments[0].status, "partial");
}

{
  const multi = summary("multi", [
    { server: "f8_net", timestamp: t2026a, players: 1, guilds: 1 },
    { server: "STUMBLESTEPPE", timestamp: t2026b, players: 2, guilds: 1 },
  ]);
  const f8Plan = resolveLocalFirstScanPlan({ request: request("F8", { kind: "exact", timestamp: t2026a }), localScanSummaries: [multi], archiveEntries: [] });
  const stumblePlan = resolveLocalFirstScanPlan({ request: request("STUMBLESTEPPE", { kind: "exact", timestamp: t2026b }), localScanSummaries: [multi], archiveEntries: [] });
  assert.equal(f8Plan.status, "complete");
  assert.equal(stumblePlan.status, "complete");
  assert.equal(f8Plan.localSnapshots[0].serverCode, "F8");
  assert.equal(stumblePlan.localSnapshots[0].serverCode, "STUMBLESTEPPE");
}

{
  const playerOnly = summary("player-only", [{ server: "f8_net", timestamp: t2026a, players: 1, guilds: 0 }]);
  assert.equal(resolveLocalFirstScanPlan({ request: request("F8", { kind: "exact", timestamp: t2026a }, "usable-snapshot", "players"), localScanSummaries: [playerOnly], archiveEntries: [] }).status, "complete");
  assert.equal(resolveLocalFirstScanPlan({ request: request("F8", { kind: "exact", timestamp: t2026a }, "usable-snapshot", "guilds"), localScanSummaries: [playerOnly], archiveEntries: [] }).status, "empty");
}

{
  const twoTimes = summary("two-times", [
    { server: "f8_net", timestamp: t2026a, players: 1, guilds: 1 },
    { server: "f8_net", timestamp: t2026b, players: 1, guilds: 1 },
  ]);
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "interval", from: t2026a, to: t2026b }),
    localScanSummaries: [twoTimes],
    archiveEntries: [],
  });
  assert.deepEqual(plan.localSnapshots.map((snapshot) => snapshot.timestamp), [t2026a, t2026b]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("stumblesteppe_net", { kind: "exact", timestamp: t2026a }),
    localScanSummaries: [summary("stumble", [{ server: "STUMBLESTEPPE", timestamp: t2026a, players: 1, guilds: 1 }])],
    archiveEntries: [stumble],
  });
  assert.equal(plan.status, "complete");
  assert.equal(plan.localSnapshots[0].serverCode, "STUMBLESTEPPE");
}

{
  const segments = resolveLocalFirstScanSegments(request("f8_net", { kind: "latest" }));
  assert.equal(segments[0].serverCode, "F8");
  assert.notEqual(segments[0].serverCode, "F28");
}

{
  const segments = resolveLocalFirstScanSegments(request("F28", { kind: "latest" }));
  assert.equal(segments[0].reasonCodes.includes("fusion-lineage-delegated"), true);
  assert.equal(segments[0].lineageServerCodes.includes("EU1"), true);
}

{
  const scope: FusionIdentityAnalysisScope = {
    id: "F8",
    eventId: "fusion-f8",
    label: "DE5-DE12 -> F8",
    targetServerCode: "F8",
    targetServerName: "F8",
    originServerCodes: ["DE5", "DE6"],
    originServerNames: ["DE5", "DE6"],
    directOriginServerCodes: ["DE5", "DE6"],
    directOriginServerNames: ["DE5", "DE6"],
    transitiveOriginServerCodes: ["DE5", "DE6"],
    lineageServerCodes: ["DE5", "DE6", "F8"],
    intermediateServerCodes: [],
    ancestorEvents: [
      {
        eventId: "fusion-f8",
        targetServerCode: "F8",
        originServerCodes: ["DE5", "DE6"],
        effectiveDate: "2024-01-12",
        temporalStatus: "effective",
      },
    ],
    effectiveDate: "2024-01-12",
    temporalStatus: "effective",
    isCurrentTerminalTarget: true,
    analysisSupported: true,
  };
  assert.deepEqual(buildLocalFirstFusionScopeSegments(scope), [
    { id: "fusion-scope:F8:DE5", server: "DE5", from: null, to: Date.UTC(2024, 0, 12) - 1 },
    { id: "fusion-scope:F8:DE6", server: "DE6", from: null, to: Date.UTC(2024, 0, 12) - 1 },
    { id: "fusion-scope:F8:F8", server: "F8", from: Date.UTC(2024, 0, 12), to: null },
  ]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "latest" }),
    localScanSummaries: [],
    archiveEntries: [f8a, f8b],
  });
  assert.equal(plan.status, "empty");
  assert.deepEqual(plan.archiveCandidates.map((candidate) => candidate.id), [f8b.id]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }),
    localScanSummaries: [],
    archiveEntries: [f8b, f8a],
  });
  assert.deepEqual(plan.archiveCandidates.map((candidate) => candidate.id), [f8a.id]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "interval", from: t2026c, to: t2027a }),
    localScanSummaries: [],
    archiveEntries: [archiveEntry("f8-2026", "f8_net", t2026c)],
    availableManifestYears: [2026],
  });
  assert.deepEqual(plan.requiredManifestYears, [2026, 2027]);
  assert.deepEqual(plan.missingManifestYears, [2027]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "interval", from: t2026a, to: t2026b }),
    localScanSummaries: [summary("one-of-two", [{ server: "f8_net", timestamp: t2026a, players: 1, guilds: 1 }])],
    archiveEntries: [f8a, f8b],
  });
  assert.equal(plan.status, "partial");
  assert.deepEqual(plan.archiveCandidates.map((candidate) => candidate.id), [f8b.id]);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2026a }),
    localScanSummaries: [],
    archiveEntries: [f8a],
  });
  assert.equal(plan.status, "empty");
  assert.equal(plan.archiveCandidates[0].id, f8a.id);
}

{
  const plan = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "exact", timestamp: t2027a }),
    localScanSummaries: [],
    archiveEntries: [],
    availableManifestYears: [2026],
  });
  assert.equal(plan.status, "empty");
  assert.deepEqual(plan.missingManifestYears, [2027]);
  assert.equal(plan.reasonCodes.includes("manifest-year-missing"), true);
  assert.equal(plan.reasonCodes.includes("no-matching-archive-scan"), true);
}

{
  const summaries = [
    summary("b", [{ server: "f8_net", timestamp: t2026b, players: 1, guilds: 1 }]),
    summary("a", [{ server: "f8_net", timestamp: t2026a, players: 1, guilds: 1 }]),
  ];
  const entries = [f8b, f8a];
  const forward = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "interval", from: t2026a, to: t2026b }),
    localScanSummaries: summaries,
    archiveEntries: entries,
  });
  const reverse = resolveLocalFirstScanPlan({
    request: request("F8", { kind: "interval", from: t2026a, to: t2026b }),
    localScanSummaries: [...summaries].reverse(),
    archiveEntries: [...entries].reverse(),
  });
  assert.deepEqual(stablePlan(forward), stablePlan(reverse));
}

console.log("localFirstScanResolver.test: ok");
