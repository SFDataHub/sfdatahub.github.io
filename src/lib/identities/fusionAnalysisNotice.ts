import type { FusionIdentityAnalysisCacheLookup } from "./fusionAnalysisCache";
import type { FusionIdentityScopeInventory } from "./fusionDashboardInventory";

/** Presentation only. Never infer historical coverage from today's scan pool. */
export function fusionAnalysisRefreshReason(
  cache: FusionIdentityAnalysisCacheLookup,
  inventory: Pick<FusionIdentityScopeInventory, "relevantSnapshotIds" | "coverage">,
): "newScans" | "scanBasis" | "identities" | "logic" | null {
  if (cache.state !== "stale") return null;
  if (cache.staleReason === "identity-revision") return "identities";
  if (cache.staleReason === "resolver-version" || cache.staleReason === "schema-version") return "logic";
  if (cache.staleReason !== "scan-fingerprint") return null;
  const analyzedAt = Date.parse(cache.previousEntry?.analyzedAt ?? "");
  const relevant = new Set(inventory.relevantSnapshotIds);
  // Fingerprint inequality proves change only. A currently relevant source
  // imported AFTER the saved analysis additionally proves an added scan.
  const added = Number.isFinite(analyzedAt) && inventory.coverage.some(server =>
    server.observations.some(observation => relevant.has(observation.id) && Date.parse(observation.sourceImportedAt) > analyzedAt),
  );
  return added ? "newScans" : "scanBasis";
}
