import assert from "node:assert/strict";

import {
  CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION,
  CURRENT_FUSION_RESOLVER_VERSION,
  classifyFusionIdentityAnalysisCache,
  classifyFusionIdentityAnalysisCacheSnapshot,
  createFusionIdentityAnalysisCacheKey,
  createFusionIdentityAnalysisCacheSnapshot,
  isFusionResolverVersionCompatible,
  type FusionIdentityAnalysisCacheEntry,
} from "../../src/lib/identities/fusionAnalysisCache.ts";
import type { FusionIdentityManagementReport } from "../../src/lib/identities/fusionIdentityManagement.ts";
import { listFusionIdentityAnalysisScopes } from "../../src/lib/identities/fusionIdentityScopes.ts";

const scope = listFusionIdentityAnalysisScopes({ atDate: "2026-09-24" }).find(
  (entry) => entry.targetServerCode === "F28",
);
assert.ok(scope);
assert.equal(CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION, 2);

const report = {
  scope: {
    label: scope.label,
    originServerCodes: scope.originServerCodes,
    targetServerCode: scope.targetServerCode,
    allSnapshotCount: 0,
    historicalSnapshotCount: 0,
    postFusionSnapshotCount: 0,
    firstHistoricalTimestamp: null,
    lastHistoricalTimestamp: null,
    firstPostFusionTimestamp: null,
    lastPostFusionTimestamp: null,
    playerObservationCount: 0,
    guildObservationCount: 0,
  },
  summary: {
    total: 0,
    ready: 0,
    review: 0,
    unresolved: 0,
    noHistoricalObservation: 0,
    noHistory: 0,
    completed: 0,
    players: 0,
    guilds: 0,
  },
  items: [],
  currentAliases: [],
  historicalAliases: [],
};

const reportWithReadyMemberRefs = {
  ...report,
  items: [
    {
      id: "guild-current",
      entityType: "guild" as const,
      status: "ready" as const,
      currentIdentifier: "f28_g1",
      currentName: "Current Guild",
      currentServer: "F28",
      observations: [],
      firstSeen: 0,
      lastSeen: 0,
      historicalIdentifiers: [],
      candidates: [],
      memberMigrationEdges: [],
      memberStatusSummary: {
        totalMembers: 1,
        resolvedMembers: 1,
        readyMembers: 1,
        completedMembers: 0,
        reviewMembers: 0,
        unresolvedMembers: 0,
        noHistoricalObservationMembers: 0,
        noHistoricalDataMembers: 0,
        missingManagementEntries: 0,
        memberRefsByStatus: {
          ready: [{ identifier: "f28_net_p1", name: "Player One" }],
          review: [],
          unresolved: [],
          noHistoricalObservation: [],
          noHistory: [],
        },
      },
      reasons: [],
      reasonCodes: [],
      diagnostics: null,
      readyCandidateIdentifier: "eu1_g1",
      completedEntityId: null,
      completedAliases: [],
    },
  ],
};

const legacyReportMissingReadyMemberRefs = {
  ...reportWithReadyMemberRefs,
  items: reportWithReadyMemberRefs.items.map((item) => ({
    ...item,
    memberStatusSummary: item.memberStatusSummary
      ? {
          ...item.memberStatusSummary,
          memberRefsByStatus: {
            review: [],
            unresolved: [],
            noHistoricalObservation: [],
            noHistory: [],
          },
        }
      : item.memberStatusSummary,
  })),
};

const entry = (input: {
  scanFingerprint: string;
  identityRevision: string;
  key?: string;
  resolverVersion?: unknown;
  schemaVersion?: unknown;
  analyzedAt?: string;
  reportOverride?: FusionIdentityManagementReport;
}): FusionIdentityAnalysisCacheEntry =>
  ({
    key:
      input.key ??
      createFusionIdentityAnalysisCacheKey({
        scope,
        scanFingerprint: input.scanFingerprint,
        identityRevision: input.identityRevision,
      }),
    scopeId: scope.id,
    targetServerCode: scope.targetServerCode,
    originServerCodes: scope.originServerCodes,
    scanFingerprint: input.scanFingerprint,
    identityRevision: input.identityRevision,
    resolverVersion: input.resolverVersion ?? CURRENT_FUSION_RESOLVER_VERSION,
    schemaVersion: input.schemaVersion ?? CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION,
    analyzedAt: input.analyzedAt ?? "2026-09-22T10:00:00.000Z",
    summary: (input.reportOverride ?? report).summary,
    report: input.reportOverride ?? report,
    timings: [],
  }) as FusionIdentityAnalysisCacheEntry;

{
  const firstKey = createFusionIdentityAnalysisCacheKey({
    scope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  const secondKey = createFusionIdentityAnalysisCacheKey({
    scope,
    scanFingerprint: "scan-b",
    identityRevision: "identity-b",
  });
  assert.equal(firstKey, secondKey);
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [entry({ scanFingerprint: "scan-a", identityRevision: "identity-a" })],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "fresh");
  assert.equal(cache.staleReason, null);
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [entry({ scanFingerprint: "scan-a", identityRevision: "identity-a" })],
    { scope, scanFingerprint: "scan-b", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "scan-fingerprint");
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [entry({ scanFingerprint: "scan-a", identityRevision: "identity-a" })],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-b" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "identity-revision");
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        resolverVersion: CURRENT_FUSION_RESOLVER_VERSION - 1,
      }),
    ],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "resolver-version");
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        schemaVersion: CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION - 1,
      }),
    ],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "schema-version");
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        schemaVersion: CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION - 1,
        reportOverride: legacyReportMissingReadyMemberRefs,
      }),
    ],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "schema-version");
  assert.equal(cache.previousEntry?.report.items[0]?.memberStatusSummary?.readyMembers, 1);
  assert.equal(
    "ready" in
      (cache.previousEntry?.report.items[0]?.memberStatusSummary
        ?.memberRefsByStatus ?? {}),
    false,
  );
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        reportOverride: reportWithReadyMemberRefs,
      }),
    ],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "fresh");
  assert.equal(cache.staleReason, null);
  assert.deepEqual(
    cache.freshEntry?.report.items[0]?.memberStatusSummary?.memberRefsByStatus.ready.map(
      (member) => member.identifier,
    ),
    ["f28_net_p1"],
  );
}

{
  const legacyResolverEntry = entry({
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
    resolverVersion:
      "fusion-identity-management:scoped-dashboard:portrait-v2:player-single-weak-v1:base-boundary-v1",
  });
  const cache = classifyFusionIdentityAnalysisCache([legacyResolverEntry], {
    scope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "resolver-version");
}

{
  const missingResolverEntry = entry({
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  }) as Partial<FusionIdentityAnalysisCacheEntry> as
    FusionIdentityAnalysisCacheEntry;
  delete (missingResolverEntry as Partial<FusionIdentityAnalysisCacheEntry>).resolverVersion;
  const cache = classifyFusionIdentityAnalysisCache([missingResolverEntry], {
    scope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "resolver-version");
}

{
  const missingSchemaEntry = entry({
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  }) as Partial<FusionIdentityAnalysisCacheEntry> as
    FusionIdentityAnalysisCacheEntry;
  delete (missingSchemaEntry as Partial<FusionIdentityAnalysisCacheEntry>).schemaVersion;
  const cache = classifyFusionIdentityAnalysisCache([missingSchemaEntry], {
    scope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(cache.state, "stale");
  assert.equal(cache.staleReason, "schema-version");
}

{
  assert.equal(
    isFusionResolverVersionCompatible(CURRENT_FUSION_RESOLVER_VERSION - 1),
    false,
  );
  assert.equal(
    isFusionResolverVersionCompatible(
      CURRENT_FUSION_RESOLVER_VERSION - 1,
      new Set([CURRENT_FUSION_RESOLVER_VERSION - 1, CURRENT_FUSION_RESOLVER_VERSION]),
    ),
    true,
  );
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        key: "fusion-analysis:1:legacy:scan-a:identity-a",
      }),
    ],
    { scope, scanFingerprint: "scan-a", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "fresh");
  assert.equal(cache.freshEntry?.key, "fusion-analysis:1:legacy:scan-a:identity-a");
}

{
  const cache = classifyFusionIdentityAnalysisCache(
    [
      entry({
        scanFingerprint: "scan-a",
        identityRevision: "identity-a",
        analyzedAt: "2026-09-22T09:00:00.000Z",
      }),
      entry({
        scanFingerprint: "scan-b",
        identityRevision: "identity-a",
        analyzedAt: "2026-09-22T10:00:00.000Z",
      }),
    ],
    { scope, scanFingerprint: "scan-c", identityRevision: "identity-a" },
  );
  assert.equal(cache.state, "stale");
  assert.equal(cache.previousEntry?.scanFingerprint, "scan-b");
  assert.equal(cache.staleReason, "scan-fingerprint");
}

{
  const cache = classifyFusionIdentityAnalysisCache([], {
    scope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(cache.state, "never-analyzed");
}

{
  const firstScope = scope;
  const secondScope = listFusionIdentityAnalysisScopes({ atDate: "2026-09-24" })
    .find((entry) => entry.id !== firstScope.id);
  assert.ok(secondScope);
  const firstEntry = entry({
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
    analyzedAt: "2026-09-22T10:00:00.000Z",
  });
  const secondEntry = {
    ...entry({
      scanFingerprint: "scan-b",
      identityRevision: "identity-a",
      analyzedAt: "2026-09-22T11:00:00.000Z",
    }),
    key: createFusionIdentityAnalysisCacheKey({
      scope: secondScope,
      scanFingerprint: "scan-b",
      identityRevision: "identity-a",
    }),
    scopeId: secondScope.id,
    targetServerCode: secondScope.targetServerCode,
    originServerCodes: secondScope.originServerCodes,
  };
  const snapshot = createFusionIdentityAnalysisCacheSnapshot([
    firstEntry,
    secondEntry,
  ]);

  const firstCache = classifyFusionIdentityAnalysisCacheSnapshot(snapshot, {
    scope: firstScope,
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(firstCache.state, "fresh");
  assert.equal(firstCache.freshEntry, firstEntry);

  const staleSecondCache = classifyFusionIdentityAnalysisCacheSnapshot(snapshot, {
    scope: secondScope,
    scanFingerprint: "scan-c",
    identityRevision: "identity-a",
  });
  assert.equal(staleSecondCache.state, "stale");
  assert.equal(staleSecondCache.previousEntry, secondEntry);
  assert.equal(staleSecondCache.staleReason, "scan-fingerprint");

  const missingCache = classifyFusionIdentityAnalysisCacheSnapshot(snapshot, {
    scope: {
      ...firstScope,
      id: "missing-scope",
      targetServerCode: "MISSING",
    },
    scanFingerprint: "scan-a",
    identityRevision: "identity-a",
  });
  assert.equal(missingCache.state, "never-analyzed");
}
