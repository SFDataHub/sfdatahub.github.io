import type { FusionIdentityAnalysisCacheState } from "./fusionAnalysisCache";
import type { FusionIdentityProgress } from "./fusionIdentityWorkerTypes";

export const FUSION_IDENTITY_REVISION_REFRESH_PROGRESS = {
  phase: "identity-refresh",
  message: "Applying identity changes",
} satisfies FusionIdentityProgress;

export type FusionIdentityRevisionRefreshScopeStatusInput = {
  cacheState: FusionIdentityAnalysisCacheState;
  cache?: {
    staleReason: "scan-fingerprint" | "identity-revision" | "resolver-version" | "schema-version" | null;
  };
  identityState?: {
    identityRevision: string;
  };
  inventory: {
    scope: {
      id?: string;
      targetServerCode?: string;
      analysisSupported: boolean;
    };
    isLocallyMatchable: boolean;
    scanFingerprint?: string;
    currentPlayerIdentifiers: readonly unknown[];
    currentGuildIdentifiers: readonly unknown[];
  };
};

const AUTO_REFRESH_STALE_REASONS = new Set([
  "identity-revision",
  "schema-version",
]);

export const usesFusionIdentityRevisionRefreshLoader = (
  scope: FusionIdentityRevisionRefreshScopeStatusInput,
) =>
  scope.inventory.scope.analysisSupported &&
  scope.inventory.isLocallyMatchable &&
  (scope.cacheState === "fresh" || scope.cacheState === "stale") &&
  Boolean(
    scope.inventory.currentPlayerIdentifiers.length ||
      scope.inventory.currentGuildIdentifiers.length,
  );

export const canAutoRefreshFusionIdentityRevisionScope = (
  scope: FusionIdentityRevisionRefreshScopeStatusInput,
) =>
  scope.cacheState === "stale" &&
  typeof scope.cache?.staleReason === "string" &&
  AUTO_REFRESH_STALE_REASONS.has(scope.cache.staleReason) &&
  scope.inventory.scope.analysisSupported &&
  scope.inventory.isLocallyMatchable &&
  Boolean(
    scope.inventory.currentPlayerIdentifiers.length ||
      scope.inventory.currentGuildIdentifiers.length,
  );

export const createFusionIdentityAutoRefreshAttemptKey = (
  scope: FusionIdentityRevisionRefreshScopeStatusInput,
) =>
  [
    scope.inventory.scope.id ?? scope.inventory.scope.targetServerCode ?? "unknown-scope",
    scope.inventory.scanFingerprint ?? "unknown-scan",
    scope.identityState?.identityRevision ?? "unknown-revision",
  ].join(":");
