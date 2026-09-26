import assert from "node:assert/strict";

import type { LocalServerFusionEvent } from "../../src/data/serverFusions.ts";
import type { LocalServerDefinition } from "../../src/data/serverRegistry.ts";
import {
  getFusionIdentityScopeServerRole,
  isFusionIdentityScopeLocallyRelevant,
  listFusionIdentityAnalysisScopes,
} from "../../src/lib/identities/fusionIdentityScopes.ts";

const server = (
  code: string,
  type: LocalServerDefinition["type"] = "origin",
): LocalServerDefinition => ({
  code,
  displayName: code,
  host: `${code.toLowerCase()}.example.test`,
  hosts: [`${code.toLowerCase()}.example.test`],
  region: "Test",
  type,
  active: true,
  aliases: [],
});

{
  const f28 = listFusionIdentityAnalysisScopes({ atDate: "2026-09-24" }).find(
    (scope) => scope.targetServerCode === "F28",
  );
  assert.ok(f28);
  assert.equal(f28.id, "F28");
  assert.equal(f28.eventId, "fusion-f28");
  assert.deepEqual(f28.directOriginServerCodes, ["EU1", "EU2", "EU3", "EU4"]);
  assert.deepEqual(f28.transitiveOriginServerCodes, ["EU1", "EU2", "EU3", "EU4"]);
  assert.equal(f28.temporalStatus, "effective");
  assert.equal(f28.isCurrentTerminalTarget, true);
  assert.equal(f28.analysisSupported, true);
}

{
  const before = listFusionIdentityAnalysisScopes({ atDate: "2026-09-24" }).find(
    (scope) => scope.targetServerCode === "F29",
  );
  const after = listFusionIdentityAnalysisScopes({ atDate: "2026-10-17" }).find(
    (scope) => scope.targetServerCode === "F29",
  );
  assert.ok(before);
  assert.ok(after);
  assert.equal(before.temporalStatus, "future");
  assert.equal(before.isCurrentTerminalTarget, false);
  assert.equal(before.analysisSupported, false);
  assert.equal(after.temporalStatus, "effective");
  assert.equal(after.isCurrentTerminalTarget, true);
  assert.equal(after.analysisSupported, true);
}

{
  const registry = ["A", "B", "C", "D", "E", "F1", "NAMED", "UNKNOWN"].map((code) =>
    server(code, code.startsWith("F") || code === "NAMED" || code === "UNKNOWN" ? "fusion" : "origin"),
  );
  const events: LocalServerFusionEvent[] = [
    {
      id: "fusion-f1",
      origins: ["A", "B"],
      target: "F1",
      effectiveDate: "2025-01-01",
      compensationPolicy: "none",
    },
    {
      id: "fusion-named",
      origins: ["F1", "C"],
      target: "NAMED",
      effectiveDate: "2026-01-01",
      compensationPolicy: "none",
    },
    {
      id: "fusion-unknown",
      origins: ["D", "E"],
      target: "UNKNOWN",
      compensationPolicy: "unknown",
    },
  ];

  const before = listFusionIdentityAnalysisScopes({
    atDate: "2025-06-01",
    registry,
    events,
  });
  const f1Before = before.find((scope) => scope.targetServerCode === "F1");
  const namedBefore = before.find((scope) => scope.targetServerCode === "NAMED");
  assert.ok(f1Before);
  assert.ok(namedBefore);
  assert.equal(f1Before.isCurrentTerminalTarget, true);
  assert.equal(namedBefore.temporalStatus, "future");
  assert.equal(namedBefore.isCurrentTerminalTarget, false);

  const after = listFusionIdentityAnalysisScopes({
    atDate: "2026-06-01",
    registry,
    events,
  });
  const f1After = after.find((scope) => scope.targetServerCode === "F1");
  const namedAfter = after.find((scope) => scope.targetServerCode === "NAMED");
  const unknown = after.find((scope) => scope.targetServerCode === "UNKNOWN");
  assert.ok(f1After);
  assert.ok(namedAfter);
  assert.ok(unknown);
  assert.equal(f1After.isCurrentTerminalTarget, false);
  assert.equal(namedAfter.isCurrentTerminalTarget, true);
  assert.deepEqual(namedAfter.directOriginServerCodes, ["C", "F1"]);
  assert.deepEqual(namedAfter.transitiveOriginServerCodes, ["A", "B", "C"]);
  assert.deepEqual(namedAfter.intermediateServerCodes, ["F1"]);
  assert.deepEqual(namedAfter.lineageServerCodes, ["A", "B", "C", "F1", "NAMED"]);
  assert.equal(getFusionIdentityScopeServerRole(namedAfter, "F1"), "intermediate-fusion-target");
  assert.equal(getFusionIdentityScopeServerRole(namedAfter, "A"), "transitive-historical-origin");
  assert.equal(getFusionIdentityScopeServerRole(namedAfter, "C"), "historical-origin");
  assert.equal(getFusionIdentityScopeServerRole(namedAfter, "Z"), "outside-scope");
  assert.equal(isFusionIdentityScopeLocallyRelevant(namedAfter, ["A"]), true);
  assert.equal(isFusionIdentityScopeLocallyRelevant(namedAfter, ["NAMED"]), true);
  assert.equal(isFusionIdentityScopeLocallyRelevant(namedAfter, ["Z"]), false);
  assert.equal(unknown.temporalStatus, "unknown-date");
  assert.equal(unknown.isCurrentTerminalTarget, false);
  assert.equal(unknown.analysisSupported, true);
}
