import type { FusionIdentityAnalysisScope } from "./fusionIdentityScopes";
import { getFusionIdentityScopeServerRole } from "./fusionIdentityScopes";
import type { FusionIdentityScopeInventory } from "./fusionDashboardInventory";
import { getFusionIdentityScopeLocalMatchability } from "./fusionScopeMatchability";

export type FusionPredecessorCoverage = {
  requiredServerCodes: string[];
  coveredServerCodes: string[];
  missingServerCodes: string[];
};

/** Only the immediate pre-fusion servers form this comparison frontier.
 * Earlier ancestors cannot stand in for a missing intermediate server. */
export function getFusionPredecessorCoverage(
  scope: FusionIdentityAnalysisScope,
  coverage: FusionIdentityScopeInventory["coverage"],
): FusionPredecessorCoverage {
  const requiredServerCodes = [...scope.directOriginServerCodes];
  const observations = coverage.flatMap(server => server.observations.map(row => ({
    ...row, serverCode: server.serverCode,
  }))).filter(row => Number.isFinite(row.timestampMs));
  const coveredServerCodes = requiredServerCodes.filter(code => {
    // An intermediate server only exists after its own fusion event.
    const birth = scope.ancestorEvents.find(event => event.targetServerCode === code)?.effectiveDate;
    const from = birth ? Date.parse(`${birth}T00:00:00Z`) : -Infinity;
    const rows = observations.filter(row => row.serverCode === scope.targetServerCode ||
      (row.serverCode === code && row.timestampMs >= from));
    return getFusionIdentityScopeLocalMatchability({
      ...scope, lineageServerCodes: [code, scope.targetServerCode],
    }, rows).hasHistoricalObservations;
  });
  return {
    requiredServerCodes,
    coveredServerCodes,
    missingServerCodes: requiredServerCodes.filter(code => !coveredServerCodes.includes(code)),
  };
}

/** Missing rows carry no observations, dates, or invented population. */
export function getFusionPredecessorCoverageRows(inventory: FusionIdentityScopeInventory) {
  const rows = [...inventory.coverage];
  for (const code of [...inventory.scope.directOriginServerCodes, inventory.scope.targetServerCode]) {
    if (rows.some(row => row.serverCode === code)) continue;
    rows.push({ serverCode: code, role: getFusionIdentityScopeServerRole(inventory.scope, code),
      includedInScope: true, count: 0, firstSeen: null, lastSeen: null,
      playerObservationCount: 0, guildObservationCount: 0, observations: [] });
  }
  return rows;
}
