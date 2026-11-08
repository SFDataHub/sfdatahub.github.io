import assert from "node:assert/strict";
import { listFusionIdentityAnalysisScopes } from "../../../src/lib/identities/fusionIdentityScopes.ts";
import { getFusionPredecessorCoverage, getFusionPredecessorCoverageRows } from "../../../src/lib/identities/fusionPredecessorCoverage.ts";
import type { FusionIdentityScopeInventory } from "../../../src/lib/identities/fusionDashboardInventory.ts";

const scopes = listFusionIdentityAnalysisScopes({ atDate: "2026-11-07" });
const row = (serverCode: string, date: string, players = 1): FusionIdentityScopeInventory["coverage"][number] => {
  const timestampMs = Date.parse(date);
  return { serverCode, count: 1, firstSeen: timestampMs, lastSeen: timestampMs,
    playerObservationCount: players, guildObservationCount: 0,
    role: "historical-origin", includedInScope: true,
    observations: [{ id: serverCode, sourceScanId: serverCode, sourceScanFilename: serverCode,
      sourceImportedAt: date, timestamp: date, timestampMs, playerCount: players, guildCount: 0 }] };
};
const f29 = scopes.find(scope => scope.targetServerCode === "F29")!;
const target = row("F29", "2026-10-17");
const eu5 = row("EU5", "2026-08-02");
assert.deepEqual(getFusionPredecessorCoverage(f29, [target, eu5]), {
  requiredServerCodes: ["EU5", "EU6", "EU7", "EU8"], coveredServerCodes: ["EU5"], missingServerCodes: ["EU6", "EU7", "EU8"],
});
assert.equal(getFusionPredecessorCoverage(f29, [target, row("EU6", "2026-10-16")]).coveredServerCodes.length, 0);
assert.equal(getFusionPredecessorCoverage(f29, [target, row("EU6", "2026-08-02", 0)]).coveredServerCodes.length, 0);
assert.equal(getFusionPredecessorCoverage(f29, [target, ...f29.directOriginServerCodes.map(code => row(code, "2026-08-02"))]).missingServerCodes.length, 0);
const original = [target, eu5];
const rows = getFusionPredecessorCoverageRows({ scope: f29, coverage: original } as FusionIdentityScopeInventory);
assert.equal(original.length, 2);
assert.equal(rows.length, 5);
for (const missing of rows.filter(value => value.count === 0)) {
  assert.deepEqual(missing.observations, []);
  assert.equal(missing.firstSeen, null);
  assert.equal(missing.lastSeen, null);
}
// Registered ES -> F5 -> MAERWYNN lineage: neither ES nor an F5 observation
// before F5 existed, or after its next fusion, can replace F5's own window.
const named = scopes.find(scope => scope.targetServerCode === "MAERWYNN")!;
const ancestors = named.transitiveOriginServerCodes.filter(code => !named.directOriginServerCodes.includes(code));
assert.deepEqual(getFusionPredecessorCoverage(named, ancestors.map(code => row(code, "2023-01-01"))).coveredServerCodes, []);
assert(!getFusionPredecessorCoverage(named, [row("F5", "2023-10-26")]).coveredServerCodes.includes("F5"));
assert(!getFusionPredecessorCoverage(named, [row("F5", "2025-04-25")]).coveredServerCodes.includes("F5"));
assert(getFusionPredecessorCoverage(named, [row("F5", "2024-01-01")]).coveredServerCodes.includes("F5"));
const unknown = { ...f29, effectiveDate: undefined, ancestorEvents: [], temporalStatus: "unknown-date" as const };
assert(getFusionPredecessorCoverage(unknown, [eu5, target]).coveredServerCodes.includes("EU5"));
assert(!getFusionPredecessorCoverage(unknown, [eu5, row("F29", "2026-01-01")]).coveredServerCodes.includes("EU5"));
console.log("Predecessor coverage contracts passed (registered multistage lineage, temporal boundaries, empty data, absent rows).");
