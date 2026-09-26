import assert from "node:assert/strict";

import { resolvePlayerFusions, type PlayerFusionObservation, type PlayerFusionResolverLiveDiagnostic } from "../../src/lib/identities/playerFusionResolver.ts";

const numberFromEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const historicalCount = numberFromEnv("HISTORICAL_HISTORIES", 2500);
const currentCount = numberFromEnv("CURRENT_PLAYERS", 50);
const timestampHistorical = Date.parse("2025-04-01T12:00:00Z");
const timestampCurrent = Date.parse("2025-06-01T12:00:00Z");

const historicalObservations: PlayerFusionObservation[] = Array.from(
  { length: historicalCount },
  (_, index) => ({
    identifier: `f6_p${index}`,
    server: "F6",
    timestamp: timestampHistorical,
    name: `Historical ${index}`,
    classId: String([7, 1, 2, 3, 4][index % 5]),
    level: 100,
    guildIdentifier: `f6_g${index % 100}`,
    guildName: `Guild ${index % 100}`,
  }),
);

const newObservations: PlayerFusionObservation[] = Array.from(
  { length: currentCount },
  (_, index) => ({
    identifier: `stumblesteppe_p${index}`,
    server: "STUMBLESTEPPE",
    timestamp: timestampCurrent,
    name: `Current ${index} (FR5)`,
    classId: "7",
    level: 200,
    guildIdentifier: `stumble_g${index % 100}`,
    guildName: `Current Guild ${index % 100}`,
    originNumericId: null,
  }),
);

let indexDiagnostic: PlayerFusionResolverLiveDiagnostic | null = null;
const checkpoints: PlayerFusionResolverLiveDiagnostic[] = [];

const result = resolvePlayerFusions({
  historicalObservations,
  newObservations,
  scope: {
    targetServerCode: "STUMBLESTEPPE",
    historicalServerCodes: ["FR5", "F6"],
    boundaryEffectiveDate: "2025-05-01",
  },
  onLiveDiagnostics: (diagnostic) => {
    if (diagnostic.event === "historical-index-build-finished") {
      indexDiagnostic = diagnostic;
    }
    if (diagnostic.event === "player-retention-checkpoint") {
      checkpoints.push(diagnostic);
    }
  },
});

const finalCheckpoint = checkpoints.at(-1);
const retainedCandidates = result.results.reduce(
  (sum, player) => sum + player.candidates.length,
  0,
);
const retainedEvidenceEntries = result.results.reduce(
  (sum, player) =>
    sum +
    player.candidates.reduce(
      (candidateSum, candidate) => candidateSum + candidate.evidence.entries.length,
      0,
    ),
  0,
);
const retainedByClassification = result.results.reduce(
  (counts, player) => {
    player.candidates.forEach((candidate) => {
      counts[candidate.classification] += 1;
    });
    return counts;
  },
  {
    rejected: 0,
    weak: 0,
    plausible: 0,
    strong: 0,
    anchored: 0,
  },
);
const sameClassHistoricalCount = historicalObservations.filter(
  (observation) => observation.classId === "7",
).length;
const differentClassHistoricalCount = historicalCount - sameClassHistoricalCount;

console.log("[fusion-player-memory-audit] input", {
  historicalCount,
  currentCount,
  sameClassHistoricalCount,
  differentClassHistoricalCount,
});
console.log("[fusion-player-memory-audit] preparedIndex", {
  scopeHistoricalHistories: indexDiagnostic?.scopeHistoricalHistories,
  historiesByServerBucketCount: indexDiagnostic?.historiesByServerBucketCount,
  historiesByServerTotalReferences: indexDiagnostic?.historiesByServerTotalReferences,
  historiesByServerLargestBucket: indexDiagnostic?.historiesByServerLargestBucket,
  historiesByServerAndClassBucketCount: indexDiagnostic?.historiesByServerAndClassBucketCount,
  historiesByServerAndClassTotalReferences: indexDiagnostic?.historiesByServerAndClassTotalReferences,
  historiesByServerAndClassLargestBucket: indexDiagnostic?.historiesByServerAndClassLargestBucket,
  historiesByServerWithUnreliableClassBucketCount: indexDiagnostic?.historiesByServerWithUnreliableClassBucketCount,
  historiesByServerWithUnreliableClassTotalReferences: indexDiagnostic?.historiesByServerWithUnreliableClassTotalReferences,
  historiesByServerWithUnreliableClassLargestBucket: indexDiagnostic?.historiesByServerWithUnreliableClassLargestBucket,
  historiesByServerAndNameBucketCount: indexDiagnostic?.historiesByServerAndNameBucketCount,
  historiesByServerAndNameTotalReferences: indexDiagnostic?.historiesByServerAndNameTotalReferences,
  historiesByServerAndNameLargestBucket: indexDiagnostic?.historiesByServerAndNameLargestBucket,
  relatedByHistoryKeyCount: indexDiagnostic?.relatedByHistoryKeyCount,
  relatedByHistoryKeyTotalReferences: indexDiagnostic?.relatedByHistoryKeyTotalReferences,
  relatedByHistoryKeyMedianReferences: indexDiagnostic?.relatedByHistoryKeyMedianReferences,
  relatedByHistoryKeyP95References: indexDiagnostic?.relatedByHistoryKeyP95References,
  relatedByHistoryKeyMaxReferences: indexDiagnostic?.relatedByHistoryKeyMaxReferences,
});
console.log("[fusion-player-memory-audit] finalCheckpoint", finalCheckpoint);
console.log("[fusion-player-memory-audit] retained", {
  retainedCandidates,
  retainedEvidenceEntries,
  retainedByClassification,
  retainedCandidatesPerPlayer: retainedCandidates / currentCount,
  retainedEvidenceEntriesPerPlayer: retainedEvidenceEntries / currentCount,
});

assert.ok(finalCheckpoint, "expected a retention checkpoint");
assert.equal(
  finalCheckpoint?.generatedCandidatesCumulative,
  historicalCount * currentCount,
);
assert.equal(
  finalCheckpoint?.earlyClassRejectedCandidatesCumulative,
  differentClassHistoricalCount * currentCount,
);
assert.equal(
  finalCheckpoint?.fullCandidatesMaterializedCumulative,
  sameClassHistoricalCount * currentCount,
);
assert.equal(
  finalCheckpoint?.fullCandidatesEvaluatedCumulative,
  sameClassHistoricalCount * currentCount,
);
assert.ok(
  (finalCheckpoint?.fullCandidatesMaterializedCumulative ?? historicalCount * currentCount) <
    (finalCheckpoint?.generatedCandidatesCumulative ?? 0),
);
assert.equal(finalCheckpoint?.actionableCandidatesCumulative, 0);
assert.equal(finalCheckpoint?.weakCandidatesEvaluated, sameClassHistoricalCount * currentCount);
assert.equal(finalCheckpoint?.rejectedCandidatesEvaluated, differentClassHistoricalCount * currentCount);
assert.equal(finalCheckpoint?.retainedCandidatesCumulative, 0);
assert.equal(finalCheckpoint?.evidenceEntriesRetained, 0);
assert.notEqual(
  finalCheckpoint?.generatedCandidatesCumulative,
  finalCheckpoint?.retainedCandidatesCumulative,
);
assert.equal(retainedCandidates, 0);
assert.equal(retainedEvidenceEntries, 0);
