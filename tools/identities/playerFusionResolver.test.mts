import assert from "node:assert/strict";

import {
  isPlayerFusionReadyCandidate,
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionCandidateClassification,
  type PlayerFusionEvidenceEntryType,
  type PlayerFusionEvidenceStrength,
  type PlayerFusionSemanticSummary,
  type PlayerFusionObservation,
} from "../../src/lib/identities/playerFusionResolver.ts";

const semantic = (
  baseAttributes: number[] | null,
  overrides: Partial<PlayerFusionSemanticSummary> = {},
): PlayerFusionSemanticSummary => ({
  baseAttributes: {
    availability: baseAttributes ? "available" : "missing",
    values: baseAttributes,
  },
  ...overrides,
});

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

const EXPECTED_EVIDENCE_STRENGTHS = new Set<PlayerFusionEvidenceStrength>([
  "hardContradiction",
  "strongContradiction",
  "neutral",
  "weakSupport",
  "support",
  "strongSupport",
  "identityAnchor",
]);

const EXPECTED_CANDIDATE_CLASSIFICATIONS = new Set<PlayerFusionCandidateClassification>([
  "rejected",
  "weak",
  "plausible",
  "strong",
  "anchored",
]);

const EXPECTED_EVIDENCE_TYPES = new Set<PlayerFusionEvidenceEntryType>([
  "origin-compatibility",
  "class-compatibility",
  "level-monotonicity",
  "level-progression",
  "base-monotonicity",
  "base-unchanged-stats",
  "base-secondary-stability",
  "base-ordering",
  "fortress-continuity",
  "pet-continuity",
  "guild-continuity",
  "exact-name",
  "fusion-base-name",
  "assignment",
]);

const assertCandidateEvidenceSchema = (candidates: PlayerFusionCandidate[]) => {
  candidates.forEach((candidate) => {
    assert.ok(EXPECTED_CANDIDATE_CLASSIFICATIONS.has(candidate.classification), `${candidate.oldIdentifier} has known classification`);
    assert.ok(Array.isArray(candidate.evidence.entries), `${candidate.oldIdentifier} has evidence entries`);
    candidate.evidence.entries.forEach((entry, index) => {
      assert.ok(EXPECTED_EVIDENCE_TYPES.has(entry.type), `${candidate.oldIdentifier} entry ${index} has known type`);
      assert.ok(EXPECTED_EVIDENCE_STRENGTHS.has(entry.strength), `${candidate.oldIdentifier} entry ${index} has known strength`);
      assert.equal(typeof entry.label, "string", `${candidate.oldIdentifier} entry ${index} has string label`);
      assert.notEqual(entry.label.trim(), "", `${candidate.oldIdentifier} entry ${index} has non-empty label`);
    });
  });
};

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
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["level-regression"]);
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

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p53199", {
        name: "MakioHS",
        classId: "8",
        level: 553,
        semantic: semantic([1000, 2000, 3000, 4000, 5000], {
          fortress: { availability: "available", values: [10, 20, 30] },
        }),
      }),
      historical("s3_eu_p53200", {
        name: "Other Druid",
        classId: "8",
        level: 552,
        semantic: semantic([9000, 2000, 3000, 4000, 5000], {
          fortress: { availability: "available", values: [10, 20, 30] },
        }),
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p209891",
        name: "Makio",
        classId: "8",
        level: 565,
        originNumericId: 462,
        semantic: semantic([1200, 2100, 3200, 4200, 5200], {
          fortress: { availability: "available", values: [11, 21, 31] },
        }),
      }),
      post({
        identifier: "f28_net_p209891",
        timestamp: Date.parse("2026-04-05T10:00:00Z"),
        name: "Makio",
        classId: "8",
        level: 569,
        originNumericId: 462,
        semantic: semantic([1220, 2110, 3210, 4210, 5210], {
          fortress: { availability: "available", values: [12, 22, 32] },
        }),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53199")?.evidence.baseAttributesConsistent, true);
  assert.equal(result.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53200")?.rejected, true);
  assert.deepEqual(
    result.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53200")?.rejectReasons,
    ["base-stat-regression"],
  );
  assert.equal(
    isPlayerFusionReadyCandidate(result.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53199")!),
    true,
  );
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        semantic: semantic([100, 100, 100, 100, 100]),
      }),
    ],
    newObservations: [
      post({
        semantic: semantic([101, 100, 99, 105, 100]),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates[0]?.rejected, true);
  assert.equal(result.candidates[0]?.evidence.baseAttributesConsistent, false);
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["base-stat-regression"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        semantic: semantic([100, 100, 100, 100, 100]),
      }),
    ],
    newObservations: [
      post({
        semantic: semantic([100, 100, 100, 100, 100]),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.rejected, false);
  assert.equal(result.candidates[0]?.evidence.baseAttributesConsistent, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        semantic: semantic(null, {
          baseAttributes: { availability: "unsupported", values: null },
        }),
      }),
    ],
    newObservations: [
      post({
        semantic: semantic([101, 100, 99, 105, 100]),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.rejected, false);
  assert.equal(result.candidates[0]?.evidence.baseAttributesConsistent, null);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        name: "old name",
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
      }),
      historical("s3_eu_p10", {
        name: "renamed later",
        timestamp: Date.parse("2026-01-31T10:00:00Z"),
      }),
    ],
    newObservations: [post({ name: "old name" })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.exactName, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        semantic: semantic(null, {
          fortress: { availability: "available", values: [1, 1, 1] },
        }),
      }),
      historical("s3_eu_p11", {
        semantic: semantic(null, {
          fortress: { availability: "available", values: [1, 1, 1] },
        }),
      }),
    ],
    newObservations: [
      post({
        name: "Darth Monk",
        semantic: semantic(null, {
          fortress: { availability: "available", values: [2, 2, 2] },
        }),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.every((candidate) => candidate.evidence.fortressContinuity === true), true);
  assert.equal(result.candidates.every((candidate) => candidate.classification === "strong"), true);
  assert.equal(selectPlayerFusionReadyCandidates(result).length, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 520 }), historical("s3_eu_p10", { level: 500, timestamp: Date.parse("2026-01-01T10:00:00Z") })],
    newObservations: [post({ name: "Darth Monk", level: 510 })],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates[0]?.rejected, true);
  assert.equal(result.candidates[0]?.oldLevel, 520);
  assert.equal(result.candidates[0]?.evidence.levelConsistent, false);
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["level-regression"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 500 })],
    newObservations: [post({ level: 500 })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelConsistent, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 500 })],
    newObservations: [post({ level: 550 })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelConsistent, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: null, levelAvailability: "missing" })],
    newObservations: [post({ level: 550 })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelConsistent, null);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 500 })],
    newObservations: [post({ level: null, levelAvailability: "missing" })],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelConsistent, null);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", { level: 500, timestamp: Date.parse("2026-01-01T10:00:00Z") }),
      historical("s3_eu_p10", { level: 510, timestamp: Date.parse("2026-01-31T10:00:00Z") }),
    ],
    newObservations: [
      post({ level: 520, timestamp: Date.parse("2026-04-03T10:00:00Z") }),
      post({ level: 530, timestamp: Date.parse("2026-04-05T10:00:00Z") }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.oldLevel, 510);
  assert.equal(result.candidates[0]?.evidence.levelConsistent, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", { level: 500, timestamp: Date.parse("2026-01-01T10:00:00Z") }),
      historical("s3_eu_p10", { level: 510, timestamp: Date.parse("2026-01-31T10:00:00Z") }),
    ],
    newObservations: [
      post({ level: 490, timestamp: Date.parse("2026-04-03T10:00:00Z") }),
      post({ level: 530, timestamp: Date.parse("2026-04-05T10:00:00Z") }),
    ],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates[0]?.oldLevel, 510);
  assert.equal(result.candidates[0]?.evidence.levelConsistent, false);
  assert.deepEqual(result.candidates[0]?.rejectReasons, ["level-regression"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s1_eu_p4809", {
        server: "EU1",
        name: "HardiyDK",
        level: 586,
        timestamp: Date.parse("2026-01-31T10:18:13.890Z"),
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p4809",
        name: "HardiyDK",
        level: 589,
        originNumericId: 458,
        timestamp: Date.parse("2026-02-21T14:44:11.553Z"),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelProgression.category, "normal");
  assert.equal(result.candidates[0]?.evidence.levelProgression.rawLevelGain, 3);
  assert.equal(result.candidates[0]?.evidence.levelProgression.fusionCompensation, 0);
  assert.equal(result.candidates[0]?.evidence.levelProgression.adjustedLevelGain, 3);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s1_eu_p4809", {
        server: "EU1",
        name: "HardiyDK",
        level: 586,
        timestamp: Date.parse("2026-01-31T10:18:13.890Z"),
      }),
      historical("s1_eu_p11", {
        server: "EU1",
        name: "Darth Monk",
        level: 11,
        timestamp: Date.parse("2026-01-02T12:00:09.395Z"),
      }),
      historical("s1_eu_p12", {
        server: "EU1",
        name: "Matti",
        level: 449,
        timestamp: Date.parse("2026-01-02T12:00:09.395Z"),
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p4809",
        name: "HardiyDK",
        level: 589,
        originNumericId: 458,
        timestamp: Date.parse("2026-02-21T14:44:11.553Z"),
      }),
    ],
  }).results[0];

  const hardiy = result.candidates.find((candidate) => candidate.oldIdentifier === "s1_eu_p4809");
  const darth = result.candidates.find((candidate) => candidate.oldIdentifier === "s1_eu_p11");
  const matti = result.candidates.find((candidate) => candidate.oldIdentifier === "s1_eu_p12");

  assert.equal(result.status, "high-confidence");
  assert.equal(hardiy?.rejected, false);
  assert.equal(hardiy?.evidence.levelProgression.category, "normal");
  assert.equal(darth?.rejected, true);
  assert.equal(darth?.evidence.levelProgression.category, "extreme-contradiction");
  assert.deepEqual(darth?.rejectReasons, ["level-progression-extreme"]);
  assert.equal(matti?.rejected, true);
  assert.deepEqual(matti?.rejectReasons, ["level-progression-extreme"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s1_eu_p2248", {
        server: "EU1",
        name: "Jurik Joriksson",
        level: 530,
        timestamp: Date.parse("2026-01-31T10:18:13.890Z"),
        semantic: semantic([2419, 66003, 2443, 23823, 1935], {
          fortress: { availability: "available", values: [1, 2, 3] },
          pets: { availability: "available", values: [1, 1, 1] },
        }),
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p1473",
        name: "Jurik Joriksson",
        level: 595,
        originNumericId: 458,
        timestamp: Date.parse("2026-02-21T14:44:11.553Z"),
        semantic: semantic([2509, 69444, 2533, 26043, 2028], {
          fortress: { availability: "available", values: [2, 3, 4] },
          pets: { availability: "available", values: [1, 1, 1] },
        }),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.rejected, false);
  assert.equal(result.candidates[0]?.evidence.levelProgression.category, "extreme-contradiction");
  assert.deepEqual(result.candidates[0]?.rejectReasons, []);
  assert.ok(result.candidates[0]?.notes.some((note) => note.includes("unusually high")));
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p10", {
        level: 500,
        timestamp: Date.parse("2026-01-31T10:00:00Z"),
      }),
    ],
    newObservations: [
      post({
        level: 540,
        timestamp: Date.parse("2026-04-03T10:00:00Z"),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelProgression.category, "plausible-burst");
  assert.equal(result.candidates[0]?.rejected, false);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s1_eu_p10", {
        server: "EU1",
        level: 150,
      }),
    ],
    newObservations: [
      post({
        originNumericId: 458,
        level: 170,
      }),
    ],
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.evidence.levelProgression.category, "insufficient-sample");
  assert.equal(result.candidates[0]?.rejected, false);
}

{
  const schemaResults = [
    resolvePlayerFusions({
      historicalObservations: [
        historical("schema_anchor", {
          guildIdentifier: "same_guild",
          semantic: semantic([100, 200, 300, 400, 500], {
            fortress: { availability: "available", values: [1, 2, 3] },
            pets: { availability: "available", values: [1, 1, 1] },
          }),
        }),
      ],
      newObservations: [
        post({
          guildIdentifier: "same_guild",
          semantic: semantic([100, 200, 300, 400, 500], {
            fortress: { availability: "available", values: [2, 3, 4] },
            pets: { availability: "available", values: [1, 1, 1] },
          }),
        }),
      ],
    }).results[0],
    resolvePlayerFusions({
      historicalObservations: [historical("schema_hard", { classId: "2" })],
      newObservations: [post()],
    }).results[0],
    resolvePlayerFusions({
      historicalObservations: [historical("schema_warning", { name: "Old Warning", level: 10 })],
      newObservations: [post({ name: "New Warning", level: 600 })],
    }).results[0],
    resolvePlayerFusions({
      historicalObservations: [historical("schema_weak", { name: "Old Burst", level: 500 })],
      newObservations: [post({ name: "New Burst", level: 540 })],
    }).results[0],
  ];
  const schemaCandidates = schemaResults.flatMap((result) => result.candidates);
  const schemaStrengths = new Set(schemaCandidates.flatMap((candidate) => candidate.evidence.entries.map((entry) => entry.strength)));

  assertCandidateEvidenceSchema(schemaCandidates);
  EXPECTED_EVIDENCE_STRENGTHS.forEach((strength) => {
    assert.ok(schemaStrengths.has(strength), `schema fixture should cover ${strength}`);
  });
}

console.log("playerFusionResolver test passed");
