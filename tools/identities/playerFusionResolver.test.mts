import assert from "node:assert/strict";

import {
  resolvePlayerFusions,
  type PlayerFusionObservation,
} from "../../src/lib/identities/playerFusionResolver.ts";

const historical = (
  identifier: string,
  overrides: Partial<PlayerFusionObservation> = {},
): PlayerFusionObservation => ({
  identifier,
  server: "EU3",
  timestamp: Date.parse("2026-01-31T10:00:00Z"),
  name: "smonk",
  classId: "7",
  level: 500,
  guildIdentifier: "eu3_g1",
  guildName: "Old Guild",
  ...overrides,
});

const post = (overrides: Partial<PlayerFusionObservation> = {}): PlayerFusionObservation => ({
  identifier: "f28_net_p1",
  server: "F28",
  timestamp: Date.parse("2026-04-03T10:00:00Z"),
  name: "smonk",
  classId: "7",
  level: 510,
  guildIdentifier: "f28_g9",
  guildName: "New Guild",
  originNumericId: 462,
  ...overrides,
});

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10")],
    newObservations: [post()],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.originSource, "numeric");
  assert.deepEqual(result.resolvedOriginServers, ["EU3"]);
  assert.equal(result.candidatesAfterHardFilters, 1);
  assert.equal(result.candidates[0]?.evidence.exactName, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s2_eu_p10", { server: "EU2", name: "smonk" })],
    newObservations: [
      post({
        name: "smonk (s2eu)",
        originNumericId: null,
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.originSource, "fusionSuffix");
  assert.deepEqual(result.resolvedOriginServers, ["EU2"]);
  assert.equal(result.candidates[0]?.evidence.fusionBaseName, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { classId: "2" })],
    newObservations: [post()],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates[0]?.rejected, true);
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["different-class"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 520 })],
    newObservations: [post({ level: 510 })],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates[0]?.rejected, true);
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["level-drop"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { name: "smonk" })],
    newObservations: [post({ name: "Darth Monk" })],
  }).results[0];

  assert.equal(result.status, "candidate");
  assert.equal(result.candidates[0]?.evidence.exactName, false);
  assert.equal(result.candidates[0]?.evidence.fusionBaseName, false);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { guildIdentifier: "eu3_g1" })],
    newObservations: [post({ guildIdentifier: "f28_g999" })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.sameGuild, false);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10"), historical("s3_eu_p11")],
    newObservations: [post()],
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(
    result.candidates.filter((candidate) => !candidate.rejected && candidate.evidence.exactName).length,
    2,
  );
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10")],
    newObservations: [post({ identifier: "f28_net_p1" }), post({ identifier: "f28_net_p2" })],
  });

  assert.deepEqual(
    result.results.map((entry) => entry.status),
    ["conflict", "conflict"],
  );
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10")],
    newObservations: [
      post({
        identifier: "f28_net_p549",
        originNumericId: 549,
      }),
    ],
  }).results[0];

  assert.equal(result.status, "no-predecessor");
  assert.equal(result.originSource, "currentServerNoPredecessor");
  assert.equal(result.candidatesBeforeHardFilters, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { timestamp: Date.parse("2026-01-01T10:00:00Z"), level: 490 })],
    newObservations: [post({ originNumericId: null })],
  }).results[0];

  assert.equal(result.originSource, "fusionLineage");
  assert.equal(result.status, "high-confidence");
}

console.log("playerFusionResolver test passed");
