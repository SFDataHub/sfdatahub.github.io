import assert from "node:assert/strict";

import {
  derivePlayerHistoricalCorridor,
  isPlayerFusionActionableIdentityCandidate,
  isPlayerFusionReadyCandidate,
  resolvePlayerFusions,
  selectReliableFusionBoundaryObservations,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionCandidateClassification,
  type PlayerFusionEvidenceEntryType,
  type PlayerFusionEvidenceStrength,
  type PlayerFusionResolverLiveDiagnostic,
  type PlayerFusionSemanticSummary,
  type PlayerFusionObservation,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import type {
  PlayerPortraitAppearanceFingerprint,
  PlayerPortraitAppearanceSummary,
} from "../../src/lib/identities/playerPortraitAppearance.ts";

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

const portraitFingerprint = (
  overrides: Partial<PlayerPortraitAppearanceFingerprint> = {},
): PlayerPortraitAppearanceFingerprint => ({
  mouth: 1,
  hairStyle: 2,
  hairColor: 3,
  browsStyle: 4,
  browsColor: 5,
  eyes: 6,
  beardNone: false,
  beardStyle: 7,
  beardColor: 8,
  nose: 9,
  ears: 10,
  extra: 11,
  hornStyle: 12,
  specialPortraitActive: false,
  specialPortraitId: null,
  ...overrides,
});

const portrait = (
  overrides: Partial<PlayerPortraitAppearanceFingerprint> = {},
): PlayerPortraitAppearanceSummary => ({
  availability: "available",
  layout: "currentCompact",
  fingerprint: portraitFingerprint(overrides),
});

const unavailablePortrait = (
  availability: Exclude<PlayerPortraitAppearanceSummary["availability"], "available"> = "missing",
): PlayerPortraitAppearanceSummary => ({
  availability,
  layout: "unknown",
  fingerprint: null,
});

const portraitEntry = (candidate: PlayerFusionCandidate) =>
  candidate.evidence.entries.find((entry) => entry.type === "portrait-continuity") ?? null;

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
  "portrait-continuity",
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
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 1);
  assert.deepEqual(result.diagnostics.rejectReasonCounts, { "different-class": 1 });
  assert.equal(result.diagnostics.earlyClassRejectedCandidates, 1);
  assert.equal(result.diagnostics.fullCandidatesMaterialized, 0);
  assert.equal(result.diagnostics.evidenceEntriesGenerated, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_p10", { level: 520 })],
    newObservations: [post({ level: 510 })],
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 1);
  assert.deepEqual(result.diagnostics.rejectReasonCounts, { "level-regression": 1 });
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
  assert.equal(result.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53200"), undefined);
  assert.equal(result.diagnostics.rejectReasonCounts["base-stat-regression"], 1);
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
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 1);
  assert.equal(result.diagnostics.rejectReasonCounts["base-stat-regression"], 1);
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
  const preBoundary = { id: "pre", timestamp: Date.parse("2026-05-01T00:00:00Z"), reliable: true };
  const postBoundaryHistorical = { id: "historical-post", timestamp: Date.parse("2026-08-01T00:00:00Z"), reliable: true };
  const beforeCurrent = { id: "current-pre", timestamp: Date.parse("2026-05-25T00:00:00Z"), reliable: true };
  const postCurrent = { id: "current-post", timestamp: Date.parse("2026-06-05T00:00:00Z"), reliable: true };

  const boundary = selectReliableFusionBoundaryObservations({
    historicalObservations: [preBoundary, postBoundaryHistorical],
    currentObservations: [beforeCurrent, postCurrent],
    fusionEventTimestamp: Date.parse("2026-06-01T00:00:00Z"),
    isReliable: (observation) => observation.reliable,
  });

  assert.equal(boundary.historicalObservation?.id, "pre");
  assert.equal(boundary.currentObservation?.id, "current-post");
  assert.equal(boundary.fallbackHistoricalObservation?.id, "pre");
  assert.equal(boundary.fallbackCurrentObservation?.id, "current-post");
}

{
  const preBoundary = { id: "pre", timestamp: Date.parse("2026-01-01T00:00:00Z"), reliable: true };
  const postBoundaryHistorical = { id: "historical-post", timestamp: Date.parse("2026-03-01T00:00:00Z"), reliable: true };
  const firstCurrent = { id: "current-first", timestamp: Date.parse("2026-02-01T00:00:00Z"), reliable: true };

  const boundary = selectReliableFusionBoundaryObservations({
    historicalObservations: [preBoundary, postBoundaryHistorical],
    currentObservations: [firstCurrent],
    fusionEventTimestamp: null,
    isReliable: (observation) => observation.reliable,
  });

  assert.equal(boundary.historicalObservation?.id, "pre");
  assert.equal(boundary.currentObservation?.id, "current-first");
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("base_boundary_heal", {
        name: "Boundary Heal",
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
        semantic: semantic([100, 7000, 100, 100, 100]),
      }),
      historical("base_boundary_heal", {
        name: "Boundary Heal",
        timestamp: Date.parse("2026-03-01T10:00:00Z"),
        semantic: semantic([100, 6000, 100, 100, 100]),
      }),
    ],
    newObservations: [
      post({
        name: "Boundary Heal",
        timestamp: Date.parse("2026-02-01T10:00:00Z"),
        semantic: semantic([100, 6500, 100, 100, 100]),
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.rejectReasonCounts["base-stat-regression"], 1);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("base_boundary_false_reject", {
        name: "Boundary Valid",
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
        semantic: semantic([100, 6000, 100, 100, 100]),
      }),
      historical("base_boundary_false_reject", {
        name: "Boundary Valid",
        timestamp: Date.parse("2026-03-01T10:00:00Z"),
        semantic: semantic([100, 7500, 100, 100, 100]),
      }),
    ],
    newObservations: [
      post({
        name: "Boundary Valid",
        timestamp: Date.parse("2026-02-01T10:00:00Z"),
        semantic: semantic([100, 6500, 100, 100, 100]),
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.rejected, false);
  assert.equal(result.candidates[0]?.evidence.baseAttributesConsistent, true);
  assert.deepEqual(result.candidates[0]?.rejectReasons, []);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("base_boundary_availability", {
        name: "Boundary Availability",
        timestamp: Date.parse("2026-01-01T10:00:00Z"),
        semantic: semantic([100, 6000, 100, 100, 100]),
      }),
      historical("base_boundary_availability", {
        name: "Boundary Availability",
        timestamp: Date.parse("2026-01-31T10:00:00Z"),
        semantic: semantic(null, {
          baseAttributes: { availability: "missing", values: null },
        }),
      }),
    ],
    newObservations: [
      post({
        name: "Boundary Availability",
        timestamp: Date.parse("2026-02-01T10:00:00Z"),
        semantic: semantic(null, {
          baseAttributes: { availability: "missing", values: null },
        }),
      }),
      post({
        name: "Boundary Availability",
        timestamp: Date.parse("2026-02-02T10:00:00Z"),
        semantic: semantic([100, 6500, 100, 100, 100]),
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.rejected, false);
  assert.equal(result.candidates[0]?.evidence.baseAttributesConsistent, true);
  assert.deepEqual(result.candidates[0]?.rejectReasons, []);
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
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.rejectReasonCounts["level-regression"], 1);
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
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.rejectReasonCounts["level-regression"], 1);
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
  assert.equal(darth, undefined);
  assert.equal(matti, undefined);
  assert.equal(result.diagnostics.rejectReasonCounts["level-progression-extreme"], 2);
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
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("single_pet_support", {
        name: "Old Pet",
        level: 500,
        semantic: semantic(null, {
          pets: { availability: "available", values: [3, 2, 1] },
        }),
      }),
    ],
    newObservations: [
      post({
        name: "New Pet",
        level: 501,
        semantic: semantic(null, {
          pets: { availability: "available", values: [3, 2, 1] },
        }),
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "candidate");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 1);
  assert.equal(result.diagnostics.evidenceEntriesGenerated > 0, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("single_portrait_support", {
        name: "Old Portrait Only",
        level: 500,
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait Only",
        level: 501,
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "candidate");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 1);
  assert.equal(result.diagnostics.evidenceEntriesGenerated > 0, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s3_eu_p48915", {
        name: "Danko369CZ",
        classId: "8",
        level: 392,
        timestamp: Date.parse("2025-11-01T13:23:41.934Z"),
        semantic: semantic(null, {
          pets: { availability: "available", values: [12, 8, 5] },
        }),
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p207342",
        name: "iksor EU3",
        classId: "8",
        level: 586,
        timestamp: Date.parse("2026-04-03T10:11:29.955Z"),
        originNumericId: 462,
        semantic: semantic(null, {
          pets: { availability: "available", values: [12, 8, 5] },
        }),
      }),
    ],
  }).results[0];

  assert.equal(result.newIdentifier, "f28_net_p207342");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 1);
  assert.equal(result.diagnostics.evidenceEntriesGenerated > 0, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_single", {
        name: "Old Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  const entry = portraitEntry(result.candidates[0]!);
  assert.equal(result.candidates[0]?.evidence.portraitContinuity, true);
  assert.equal(result.candidates[0]?.evidence.portraitDiscriminating, false);
  assert.equal(entry?.strength, "weakSupport");
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_match", {
        name: "Old Portrait Match",
        semantic: semantic(null, { portrait: portrait() }),
      }),
      historical("portrait_other", {
        name: "Old Portrait Other",
        semantic: semantic(null, { portrait: portrait({ mouth: 20 }) }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  const match = result.candidates.find((candidate) => candidate.oldIdentifier === "portrait_match")!;
  const other = result.candidates.find((candidate) => candidate.oldIdentifier === "portrait_other")!;
  assert.equal(match.evidence.portraitContinuity, true);
  assert.equal(match.evidence.portraitDiscriminating, true);
  assert.equal(portraitEntry(match)?.strength, "support");
  assert.equal(other.evidence.portraitContinuity, false);
  assert.equal(other.evidence.portraitDiscriminating, false);
  assert.equal(portraitEntry(other)?.strength, "neutral");
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_collision_a", {
        name: "Old Portrait A",
        semantic: semantic(null, { portrait: portrait() }),
      }),
      historical("portrait_collision_b", {
        name: "Old Portrait B",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(
    result.candidates.every((candidate) => candidate.evidence.portraitContinuity === true),
    true,
  );
  assert.equal(
    result.candidates.every((candidate) => portraitEntry(candidate)?.strength === "weakSupport"),
    true,
  );
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_available", {
        name: "Old Portrait Available",
        semantic: semantic(null, { portrait: portrait() }),
      }),
      historical("portrait_unavailable", {
        name: "Old Portrait Unavailable",
        semantic: semantic(null, { portrait: unavailablePortrait("rosterOnly") }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  const available = result.candidates.find((candidate) => candidate.oldIdentifier === "portrait_available")!;
  const unavailable = result.candidates.find((candidate) => candidate.oldIdentifier === "portrait_unavailable")!;
  assert.equal(available.evidence.portraitContinuity, true);
  assert.equal(available.evidence.portraitDiscriminating, false);
  assert.equal(portraitEntry(available)?.strength, "weakSupport");
  assert.equal(unavailable.evidence.portraitContinuity, null);
  assert.equal(portraitEntry(unavailable), null);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_mismatch", {
        name: "Old Portrait",
        semantic: semantic(null, { portrait: portrait({ hairColor: 21 }) }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  assert.equal(result.candidates[0]?.evidence.portraitContinuity, false);
  assert.equal(result.candidates[0]?.evidence.portraitDiscriminating, false);
  assert.equal(portraitEntry(result.candidates[0]!)?.strength, "neutral");
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("portrait_missing", {
        name: "Old Portrait",
        semantic: semantic(null, { portrait: unavailablePortrait("missing") }),
      }),
    ],
    newObservations: [
      post({
        name: "New Portrait",
        semantic: semantic(null, { portrait: portrait() }),
      }),
    ],
  }).results[0];

  assert.equal(result.candidates[0]?.evidence.portraitContinuity, null);
  assert.equal(result.candidates[0]?.evidence.portraitDiscriminating, null);
  assert.equal(portraitEntry(result.candidates[0]!), null);
}

{
  const es10NumericId = resolveServer("ES10")?.numericId;
  assert.ok(es10NumericId != null, "expected ES10 numeric id in registry");
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("f5_fu_p77", {
        server: "F5",
        timestamp: Date.parse("2025-01-10T10:00:00Z"),
        name: "Stage Hero",
        level: 110,
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        timestamp: Date.parse("2025-05-10T10:00:00Z"),
        name: "Stage Hero",
        level: 120,
        originNumericId: es10NumericId,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.originSource, "numeric");
  assert.deepEqual(result.resolvedOriginServers, ["ES10"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.oldIdentifier, "f5_fu_p77");
  assert.equal(result.candidates[0]?.oldServer, "F5");
  assert.equal(result.candidates[0]?.oldLevel, 110);
  assert.equal(result.candidates[0]?.historyObservationCount, 1);
  assert.equal(result.candidates[0]?.evidence.originMatches, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s10_es_p1", {
        server: "ES10",
        timestamp: Date.parse("2024-01-10T10:00:00Z"),
        name: "Stage Hero",
        level: 100,
      }),
      historical("f5_fu_p77", {
        server: "F5",
        timestamp: Date.parse("2025-01-10T10:00:00Z"),
        name: "Stage Hero",
        level: 110,
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        timestamp: Date.parse("2025-05-10T10:00:00Z"),
        name: "Stage Hero",
        level: 120,
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.originSource, "fusionLineage");
  assert.deepEqual(result.resolvedOriginServers, ["ES10", "F5"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.oldIdentifier, "s10_es_p1");
  assert.equal(result.candidates[0]?.historyObservationCount, 2);
  assert.equal(result.candidates[0]?.evidence.exactName, true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("f4_sibling_p1", {
        server: "F4",
        timestamp: Date.parse("2025-01-10T10:00:00Z"),
        name: "Sibling Hero",
        level: 110,
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        timestamp: Date.parse("2025-05-10T10:00:00Z"),
        name: "Sibling Hero (ES10)",
        level: 120,
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5", "F4"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.originSource, "fusionSuffix");
  assert.deepEqual(result.resolvedOriginServers, ["ES10"]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.diagnostics.historicalPoolSize, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s10_es_p1", {
        server: "ES10",
        timestamp: Date.parse("2024-01-10T10:00:00Z"),
        name: "Missing Step Hero",
        level: 100,
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        timestamp: Date.parse("2025-05-10T10:00:00Z"),
        name: "Missing Step Hero (ES10)",
        level: 120,
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.candidates[0]?.oldIdentifier, "s10_es_p1");
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("f5_legacy_p1", {
        server: "F5",
        timestamp: Date.parse("2025-01-10T10:00:00Z"),
        name: "Legacy Step Hero",
        level: 110,
        originNumericId: null,
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        timestamp: Date.parse("2025-05-10T10:00:00Z"),
        name: "Legacy Step Hero (ES10)",
        level: 120,
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.originSource, "fusionSuffix");
  assert.equal(result.candidates[0]?.oldIdentifier, "f5_legacy_p1");
  assert.equal(result.candidates[0]?.evidence.fusionBaseName, true);
}

{
  const corridor = derivePlayerHistoricalCorridor(
    {
      resolvedOriginServerCodes: ["ES10"],
      targetServerCode: "MAERWYNN",
      scope: {
        targetServerCode: "MAERWYNN",
        historicalServerCodes: ["ES10", "F1", "F2", "F5"],
        boundaryEffectiveDate: null,
      },
    },
    ((serverCode: string) =>
      serverCode === "ES10"
        ? [
            { code: "ES10" },
            { code: "F1" },
            { code: "F2" },
            { code: "F5" },
            { code: "MAERWYNN" },
          ]
        : [{ code: serverCode }]) as never,
  );

  assert.deepEqual(corridor, ["ES10", "F1", "F2", "F5"]);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("s10_es_p1", {
        server: "ES10",
        name: "Scope Hero",
      }),
    ],
    newObservations: [
      post({
        identifier: "maerwynn_p1",
        server: "MAERWYNN",
        name: "Scope Hero (EU1)",
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "MAERWYNN",
      historicalServerCodes: ["ES10", "F5"],
      boundaryEffectiveDate: "2025-04-25",
    },
  }).results[0];

  assert.equal(result.originSource, "fusionLineage");
  assert.deepEqual(result.resolvedOriginServers, ["ES10", "F5"]);
  assert.equal(result.candidates[0]?.evidence.fusionBaseName, false);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: Array.from({ length: 40 }, (_, index) =>
      historical(`weak_p${index}`, {
        server: "EU3",
        name: `Weak Candidate ${index}`,
        classId: "7",
        level: 100,
      }),
    ),
    newObservations: [
      post({
        identifier: "f28_net_p_weak",
        server: "F28",
        name: "No Actionable Match",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(result.diagnostics.candidatesGeneratedInitially, 40);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 40);
  assert.equal(result.diagnostics.candidatesRetainedAfterEvaluation, 0);
  assert.equal(result.diagnostics.candidatesDiscardedAfterEvaluation, 40);
  assert.equal(result.diagnostics.evidenceEntriesGenerated > 0, true);
  assert.equal(result.diagnostics.evidenceEntriesRetained, 0);
  assert.equal(result.candidates.length, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: Array.from({ length: 30 }, (_, index) =>
      historical(`rejected_p${index}`, {
        server: "EU3",
        name: `Rejected Candidate ${index}`,
        classId: "1",
        level: 100,
      }),
    ),
    newObservations: [
      post({
        identifier: "f28_net_p_rejected",
        server: "F28",
        name: "Rejected Pool",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "unresolved");
  assert.equal(result.diagnostics.candidatesGeneratedInitially, 30);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 30);
  assert.equal(result.diagnostics.rejectReasonCounts["different-class"], 30);
  assert.equal(result.diagnostics.candidatesRetainedAfterEvaluation, 0);
  assert.equal(result.candidates.length, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: Array.from({ length: 30 }, (_, index) =>
      historical(`anchored_p${index}`, {
        server: "EU3",
        name: "Shared Anchor",
        classId: "7",
        level: 100 + index,
      }),
    ),
    newObservations: [
      post({
        identifier: "f28_net_p_anchored_many",
        server: "F28",
        name: "Shared Anchor",
        classId: "7",
        level: 300,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(result.diagnostics.candidatesGeneratedInitially, 30);
  assert.equal(result.diagnostics.candidateClassificationCounts.anchored, 30);
  assert.equal(result.diagnostics.candidatesRetainedAfterEvaluation, 25);
  assert.equal(result.candidates.length, 25);
  assert.equal(result.candidates.every((candidate) => candidate.classification === "anchored"), true);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("anchored_winner", {
        server: "EU3",
        name: "Single Anchor",
        classId: "7",
        level: 100,
      }),
      ...Array.from({ length: 20 }, (_, index) =>
        historical(`weak_competitor_${index}`, {
          server: "EU3",
          name: `Weak Competitor ${index}`,
          classId: "7",
          level: 100,
        }),
      ),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p_anchor",
        server: "F28",
        name: "Single Anchor",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "high-confidence");
  assert.equal(result.diagnostics.candidatesGeneratedInitially, 21);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 20);
  assert.equal(result.diagnostics.candidateClassificationCounts.anchored, 1);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.oldIdentifier, "anchored_winner");
}

{
  const historicalObservations = [
    ...Array.from({ length: 100 }, (_, index) =>
      historical(`class_bucket_warrior_${index}`, {
        server: "EU3",
        name: `Warrior Candidate ${index}`,
        classId: "7",
        level: 100,
      }),
    ),
    ...Array.from({ length: 100 }, (_, index) =>
      historical(`class_bucket_mage_${index}`, {
        server: "EU3",
        name: `Mage Candidate ${index}`,
        classId: "2",
        level: 100,
      }),
    ),
    ...Array.from({ length: 100 }, (_, index) =>
      historical(`class_bucket_scout_${index}`, {
        server: "EU3",
        name: `Scout Candidate ${index}`,
        classId: "3",
        level: 100,
      }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      historical(`class_bucket_unknown_${index}`, {
        server: "EU3",
        name: `Unknown Class Candidate ${index}`,
        classId: null,
        level: 100,
      }),
    ),
  ];
  const result = resolvePlayerFusions({
    historicalObservations,
    newObservations: [
      post({
        identifier: "f28_net_p_class_bucket",
        server: "F28",
        name: "Class Bucket Current",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.status, "ambiguous");
  assert.equal(result.diagnostics.corridorHistoriesConsidered, 310);
  assert.equal(result.diagnostics.candidatesGeneratedInitially, 310);
  assert.equal(result.diagnostics.earlyClassRejectedCandidates, 200);
  assert.equal(result.diagnostics.earlyHardRejectedCandidates, 200);
  assert.equal(result.diagnostics.fullCandidatesMaterialized, 110);
  assert.equal(result.diagnostics.fullCandidatesEvaluated, 110);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 200);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 110);
  assert.equal(result.diagnostics.rejectReasonCounts["different-class"], 200);
  assert.equal(result.diagnostics.candidatesRetainedAfterEvaluation, 0);
  assert.equal(result.diagnostics.evidenceEntriesGenerated > 0, true);
  assert.equal(result.diagnostics.evidenceEntriesRetained, 0);
  assert.equal(result.candidates.length, 0);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("missing_class_candidate", {
        server: "EU3",
        name: "Missing Class Candidate",
        classId: null,
        level: 100,
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p_missing_class",
        server: "F28",
        name: "Different Current Name",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(result.diagnostics.earlyClassRejectedCandidates, 0);
  assert.equal(result.diagnostics.fullCandidatesMaterialized, 1);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 1);
}

{
  const result = resolvePlayerFusions({
    historicalObservations: [
      historical("fr5_same_class", {
        server: "FR5",
        name: "FR5 Same Class",
        classId: "7",
        level: 100,
      }),
      historical("fr5_different_class", {
        server: "FR5",
        name: "FR5 Different Class",
        classId: "1",
        level: 100,
      }),
      historical("fr5_unknown_class", {
        server: "FR5",
        name: "FR5 Unknown Class",
        classId: null,
        level: 100,
      }),
      historical("f6_same_class", {
        server: "F6",
        name: "F6 Same Class",
        classId: "7",
        level: 100,
      }),
      historical("f6_different_class", {
        server: "F6",
        name: "F6 Different Class",
        classId: "1",
        level: 100,
      }),
      historical("f6_unknown_class", {
        server: "F6",
        name: "F6 Unknown Class",
        classId: null,
        level: 100,
      }),
    ],
    newObservations: [
      post({
        identifier: "stumblesteppe_p_multistage",
        server: "STUMBLESTEPPE",
        name: "Current Multi Stage (FR5)",
        classId: "7",
        level: 200,
        originNumericId: null,
      }),
    ],
    scope: {
      targetServerCode: "STUMBLESTEPPE",
      historicalServerCodes: ["FR5", "F6"],
      boundaryEffectiveDate: "2025-05-01",
    },
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.deepEqual(result.resolvedOriginServers, ["FR5"]);
  assert.equal(result.diagnostics.corridorHistoriesConsidered, 6);
  assert.equal(result.diagnostics.earlyClassRejectedCandidates, 2);
  assert.equal(result.diagnostics.fullCandidatesMaterialized, 4);
  assert.equal(result.diagnostics.candidateClassificationCounts.weak, 4);
  assert.equal(result.diagnostics.candidateClassificationCounts.rejected, 2);
}

{
  const renameResult = resolvePlayerFusions({
    historicalObservations: [
      historical("rename_candidate", {
        server: "EU3",
        name: "Old Rename",
        classId: "7",
        level: 100,
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p_rename_candidate",
        server: "F28",
        name: "New Rename",
        classId: "7",
        level: 200,
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];
  const guildChangeResult = resolvePlayerFusions({
    historicalObservations: [
      historical("guild_change_candidate", {
        server: "EU3",
        name: "Guild Change",
        classId: "7",
        level: 100,
        guildIdentifier: "old_guild",
      }),
    ],
    newObservations: [
      post({
        identifier: "f28_net_p_guild_change_candidate",
        server: "F28",
        name: "Guild Change",
        classId: "7",
        level: 200,
        guildIdentifier: "new_guild",
      }),
    ],
    enableLevelProgressionEvidence: false,
  }).results[0];

  assert.equal(renameResult.diagnostics.earlyClassRejectedCandidates, 0);
  assert.equal(renameResult.diagnostics.fullCandidatesMaterialized, 1);
  assert.equal(renameResult.diagnostics.candidateClassificationCounts.weak, 1);
  assert.equal(guildChangeResult.diagnostics.earlyClassRejectedCandidates, 0);
  assert.equal(guildChangeResult.diagnostics.fullCandidatesMaterialized, 1);
  assert.equal(guildChangeResult.diagnostics.candidateClassificationCounts.anchored, 1);
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
    if (strength === "hardContradiction" || strength === "strongContradiction") return;
    assert.ok(schemaStrengths.has(strength), `schema fixture should cover ${strength}`);
  });
  assert.equal(schemaResults[1]?.diagnostics.candidateClassificationCounts.rejected, 1);
  assert.equal(schemaResults[1]?.diagnostics.rejectReasonCounts["different-class"], 1);
  assert.equal((schemaResults[2]?.diagnostics.evidenceEntriesGenerated ?? 0) > 0, true);
}

{
  const progress: Array<{ current: number; total: number }> = [];
  resolvePlayerFusions({
    historicalObservations: [historical("s3_eu_progress_anchor")],
    newObservations: Array.from({ length: 120 }, (_, index) =>
      post({
        identifier: `f28_net_progress_${index + 1}`,
        name: `Progress ${index + 1}`,
        originNumericId: null,
      }),
    ),
    onProgress: (entry) => progress.push(entry),
  });

  assert.ok(
    progress.some((entry) => entry.current > 0 && entry.current < entry.total),
    "player resolver emits real intermediate progress",
  );
  assert.deepEqual(progress.at(-1), { current: 120, total: 120 });
}

{
  const liveDiagnostics: PlayerFusionResolverLiveDiagnostic[] = [];
  const historicalObservations = Array.from({ length: 120 }, (_, index) =>
    historical(`perf_${index + 1}`, {
      server: `EU${(index % 4) + 1}`,
      name: `Perf ${index + 1}`,
      classId: String((index % 8) + 1),
    }),
  );
  const newObservations = Array.from({ length: 8 }, (_, index) =>
    post({
      identifier: `f28_net_perf_${index + 1}`,
      name: `Perf ${index + 1}`,
      classId: String((index % 8) + 1),
      originNumericId: null,
    }),
  );

  resolvePlayerFusions({
    historicalObservations,
    newObservations,
    scope: {
      targetServerCode: "F28",
      historicalServerCodes: ["EU1", "EU2", "EU3", "EU4"],
      boundaryEffectiveDate: "2026-02-06",
    },
    onLiveDiagnostics: (diagnostic) => liveDiagnostics.push(diagnostic),
  });

  const indexBuildDiagnostics = liveDiagnostics.filter(
    (diagnostic) => diagnostic.event === "historical-index-build-finished",
  );
  const lookupDiagnostics = liveDiagnostics.filter(
    (diagnostic) => diagnostic.event === "candidate-histories-history-scan-finished",
  );

  assert.equal(indexBuildDiagnostics.length, 1);
  assert.equal(indexBuildDiagnostics[0]?.nestedFullHistoryScans, 0);
  assert.ok(
    (indexBuildDiagnostics[0]?.candidateHistoryComparisons ?? Number.POSITIVE_INFINITY) <=
      historicalObservations.length,
    "historical index compares name-bucketed histories once, not current x historical",
  );
  assert.ok(lookupDiagnostics.length >= 1);
  assert.equal(lookupDiagnostics[0]?.nestedFullHistoryScans, 0);
  assert.equal(lookupDiagnostics[0]?.candidateHistoryComparisons, 0);
}

console.log("playerFusionResolver test passed");
