import assert from "node:assert/strict";
import { fusionAnalysisRefreshReason } from "../../../src/lib/identities/fusionAnalysisNotice.ts";
import type { FusionIdentityAnalysisCacheLookup } from "../../../src/lib/identities/fusionAnalysisCache.ts";
import type { FusionIdentityScopeInventory } from "../../../src/lib/identities/fusionDashboardInventory.ts";

const previousEntry = { analyzedAt: "2026-11-07T09:00:00Z", report: {} } as FusionIdentityAnalysisCacheLookup["previousEntry"];
const cache: FusionIdentityAnalysisCacheLookup = { state: "stale", staleReason: "scan-fingerprint", previousEntry, freshEntry: null };
const inventory = (importedAt: string, relevant = true) => ({
  relevantSnapshotIds: relevant ? ["one"] : [],
  coverage: [{ observations: [{ id: "one", sourceImportedAt: importedAt }] }],
}) as FusionIdentityScopeInventory;
assert.equal(fusionAnalysisRefreshReason(cache, inventory("2026-11-07T08:00:00Z")), "scanBasis");
assert.equal(fusionAnalysisRefreshReason(cache, inventory("2026-11-07T10:00:00Z")), "newScans");
assert.equal(fusionAnalysisRefreshReason(cache, inventory("2026-11-07T10:00:00Z", false)), "scanBasis");
assert.equal(fusionAnalysisRefreshReason(cache, inventory("unknown")), "scanBasis");
assert.equal(fusionAnalysisRefreshReason({ ...cache, previousEntry: { ...previousEntry!, analyzedAt: "unknown" } }, inventory("2026-11-07T10:00:00Z")), "scanBasis");
for (const staleReason of ["identity-revision", "resolver-version", "schema-version"] as const) {
  assert.equal(fusionAnalysisRefreshReason({ ...cache, staleReason }, inventory("2026-11-07T10:00:00Z")), staleReason === "identity-revision" ? "identities" : "logic");
}
assert.equal(fusionAnalysisRefreshReason({ ...cache, state: "fresh", staleReason: null }, inventory("2026-11-07T10:00:00Z")), null);
assert.equal(previousEntry!.report.predecessorCoverage, undefined);
console.log("Analysis notice contracts passed: fingerprint-only change, evidenced addition, irrelevant/unknown dates, identity and logic revisions, missing coverage is independent.");
