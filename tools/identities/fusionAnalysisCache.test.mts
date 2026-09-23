import assert from "node:assert/strict";

import {
  CURRENT_FUSION_ANALYSIS_SCHEMA_VERSION,
  CURRENT_FUSION_RESOLVER_VERSION,
  classifyFusionIdentityAnalysisCache,
  createFusionIdentityAnalysisCacheKey,
  isFusionResolverVersionCompatible,
  type FusionIdentityAnalysisCacheEntry,
} from "../../src/lib/identities/fusionAnalysisCache.ts";
import type { FusionIdentityAnalysisScope } from "../../src/lib/identities/fusionIdentityScopes.ts";

const scope: FusionIdentityAnalysisScope = {
  id: "F28",
  label: "EU1-EU4 -> F28",
  targetServerCode: "F28",
  targetServerName: "Fusion 28",
  originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
  originServerNames: ["EU 1", "EU 2", "EU 3", "EU 4"],
};

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

const entry = (input: {
  scanFingerprint: string;
  identityRevision: string;
  key?: string;
  resolverVersion?: unknown;
  schemaVersion?: unknown;
  analyzedAt?: string;
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
    summary: report.summary,
    report,
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
