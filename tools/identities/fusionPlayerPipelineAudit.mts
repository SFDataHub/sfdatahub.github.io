import assert from "node:assert/strict";

import {
  resolvePlayerFusions,
  type PlayerFusionObservation,
  type PlayerFusionResolverDiagnostics,
  type PlayerFusionScopeContext,
  type PlayerFusionSemanticSummary,
} from "../../src/lib/identities/playerFusionResolver.ts";

type PipelineAuditScenario = {
  label: string;
  historicalServer: string;
  currentServer: string;
  currentNameSuffix?: string;
  scope: PlayerFusionScopeContext;
  historicalCount: number;
  currentCount: number;
};

const semantic = (baseAttributes: number[]): PlayerFusionSemanticSummary => ({
  baseAttributes: {
    availability: "available",
    values: baseAttributes,
  },
});

const timestampHistorical = Date.parse("2025-04-01T12:00:00Z");
const timestampCurrent = Date.parse("2025-06-01T12:00:00Z");

const createHistoricalObservation = (
  scenario: PipelineAuditScenario,
  index: number,
): PlayerFusionObservation => {
  const classPattern: Array<string | null> = ["7", "1", "2", "3", null];
  const classId = classPattern[index % classPattern.length];
  const sameClassOrdinal = Math.floor(index / classPattern.length);
  const sameClassVariant = classId === "7" ? sameClassOrdinal % 4 : -1;
  const level = sameClassVariant === 0 ? 260 : 100;
  const baseAttributes =
    sameClassVariant === 1
      ? [250, 240, 230, 220, 210]
      : [10, 20, 30, 40, 50];

  return {
    identifier: `${scenario.historicalServer.toLowerCase()}_p${index}`,
    server: scenario.historicalServer,
    timestamp: timestampHistorical,
    name: `Historical ${scenario.label} ${index}`,
    classId,
    level,
    guildIdentifier: `old_g${index % 25}`,
    guildName: `Old Guild ${index % 25}`,
    semantic: semantic(baseAttributes),
  };
};

const createCurrentObservation = (
  scenario: PipelineAuditScenario,
  index: number,
): PlayerFusionObservation => ({
  identifier: `${scenario.currentServer.toLowerCase()}_p${index}`,
  server: scenario.currentServer,
  timestamp: timestampCurrent,
  name: scenario.currentNameSuffix
    ? `Current ${scenario.label} ${index} (${scenario.currentNameSuffix})`
    : `Current ${scenario.label} ${index}`,
  classId: "7",
  level: 200,
  guildIdentifier: `new_g${index % 25}`,
  guildName: `New Guild ${index % 25}`,
  originNumericId: null,
  semantic: semantic([100, 100, 100, 100, 100]),
});

const runScenario = (scenario: PipelineAuditScenario) => {
  let diagnostics: PlayerFusionResolverDiagnostics | null = null;
  const result = resolvePlayerFusions({
    historicalObservations: Array.from({ length: scenario.historicalCount }, (_, index) =>
      createHistoricalObservation(scenario, index),
    ),
    newObservations: Array.from({ length: scenario.currentCount }, (_, index) =>
      createCurrentObservation(scenario, index),
    ),
    scope: scenario.scope,
    enableLevelProgressionEvidence: true,
    enablePortraitEvidence: true,
    enablePipelineDiagnostics: true,
    onDiagnostics: (entry) => {
      diagnostics = entry;
    },
  });

  assert.ok(diagnostics?.pipeline, `${scenario.label}: expected pipeline diagnostics`);
  const pipeline = diagnostics.pipeline;
  const candidateFlow = pipeline.candidateFlow;
  const materialization = pipeline.stageTimings.find(
    (stage) => stage.stage === "candidate-materialization-total",
  );
  const base = pipeline.stageTimings.find((stage) => stage.stage === "candidate-base");
  const level = pipeline.stageTimings.find((stage) => stage.stage === "candidate-level-boundary");
  const precheckAudit = pipeline.precheckAudit;

  console.log(`[fusion-player-pipeline-audit] ${scenario.label} input`, {
    historicalCount: scenario.historicalCount,
    currentCount: scenario.currentCount,
    statuses: result.results.reduce<Record<string, number>>((counts, player) => {
      counts[player.status] = (counts[player.status] ?? 0) + 1;
      return counts;
    }, {}),
  });
  console.table(pipeline.historicalIndexPhases);
  console.table([candidateFlow]);
  console.table([precheckAudit]);
  console.table(pipeline.stageTimings);
  console.table(pipeline.candidatePoolBuckets);

  assert.ok(candidateFlow.corridorHistoriesConsidered > 0);
  assert.ok(candidateFlow.earlyClassRejected > 0);
  assert.ok(candidateFlow.earlyLevelRejected > 0);
  assert.ok(candidateFlow.earlyBaseRejected > 0);
  assert.ok(candidateFlow.fullCandidatesMaterialized > 0);
  const candidatesAfterClass =
    candidateFlow.fullCandidatesMaterialized +
    candidateFlow.earlyLevelRejected +
    candidateFlow.earlyBaseRejected;
  assert.ok(
    candidateFlow.fullCandidatesMaterialized < candidateFlow.corridorHistoriesConsidered,
    `${scenario.label}: class prepartition should reduce full materialization`,
  );
  assert.ok(
    candidateFlow.fullCandidatesMaterialized < candidatesAfterClass,
    `${scenario.label}: level/base prechecks should reduce full materialization after class`,
  );
  assert.ok(candidateFlow.rejectedByLevel > 0);
  assert.ok(candidateFlow.rejectedByBase > 0);
  assert.equal(materialization?.calls, candidateFlow.fullCandidatesEvaluated);
  assert.equal(base?.calls, candidateFlow.fullCandidatesEvaluated + candidateFlow.earlyBaseRejected);
  assert.equal(level?.calls, candidatesAfterClass);
  assert.equal(precheckAudit.levelPrecheckCalls, candidatesAfterClass);
  assert.equal(precheckAudit.levelPrecheckRejects, candidateFlow.earlyLevelRejected);
  assert.equal(precheckAudit.levelPrecheckSurvivors, candidateFlow.fullCandidatesEvaluated + candidateFlow.earlyBaseRejected);
  assert.equal(precheckAudit.basePrecheckCalls, candidateFlow.fullCandidatesEvaluated + candidateFlow.earlyBaseRejected);
  assert.equal(precheckAudit.basePrecheckRejects, candidateFlow.earlyBaseRejected);
  assert.equal(precheckAudit.basePrecheckSurvivors, candidateFlow.fullCandidatesEvaluated);
  assert.equal(precheckAudit.precheckResultsCreated, candidatesAfterClass);
  assert.equal(precheckAudit.levelComparisonObjectsCreated, candidatesAfterClass);
  assert.equal(precheckAudit.boundarySelectionsCreated, precheckAudit.basePrecheckCalls);
  assert.equal(precheckAudit.baseBoundarySelectionCalls, precheckAudit.basePrecheckCalls);
  assert.equal(precheckAudit.baseCompareCalls, precheckAudit.basePrecheckCalls);
  assert.equal(precheckAudit.baseSemanticVectorLookupCalls, precheckAudit.basePrecheckCalls * 2);
  assert.equal(precheckAudit.semanticVectorLookups, precheckAudit.basePrecheckCalls * 2);
  assert.equal(precheckAudit.survivorPrecheckObjectsRetained, candidateFlow.fullCandidatesEvaluated);
  assert.equal(precheckAudit.createCandidateCalls, candidateFlow.fullCandidatesEvaluated);
  assert.ok(precheckAudit.levelPrecheckTotalMs >= 0);
  assert.ok(precheckAudit.basePrecheckTotalMs >= 0);
  assert.ok(precheckAudit.baseBoundarySelectionTotalMs >= 0);
  assert.ok(precheckAudit.createCandidateTotalMs >= 0);
};

[
  {
    label: "F28-synthetic",
    historicalServer: "EU3",
    currentServer: "F28",
    scope: {
      targetServerCode: "F28",
      historicalServerCodes: ["EU1", "EU2", "EU3", "EU4"],
      boundaryEffectiveDate: "2026-02-06",
    },
    historicalCount: 500,
    currentCount: 25,
  },
  {
    label: "STUMBLESTEPPE-small-synthetic",
    historicalServer: "F6",
    currentServer: "STUMBLESTEPPE",
    currentNameSuffix: "FR5",
    scope: {
      targetServerCode: "STUMBLESTEPPE",
      historicalServerCodes: ["FR5", "F6"],
      boundaryEffectiveDate: "2025-05-01",
    },
    historicalCount: 300,
    currentCount: 10,
  },
  {
    label: "STUMBLESTEPPE-medium-synthetic",
    historicalServer: "F6",
    currentServer: "STUMBLESTEPPE",
    currentNameSuffix: "FR5",
    scope: {
      targetServerCode: "STUMBLESTEPPE",
      historicalServerCodes: ["FR5", "F6"],
      boundaryEffectiveDate: "2025-05-01",
    },
    historicalCount: 1500,
    currentCount: 30,
  },
  {
    label: "STUMBLESTEPPE-large-synthetic",
    historicalServer: "F6",
    currentServer: "STUMBLESTEPPE",
    currentNameSuffix: "FR5",
    scope: {
      targetServerCode: "STUMBLESTEPPE",
      historicalServerCodes: ["FR5", "F6"],
      boundaryEffectiveDate: "2025-05-01",
    },
    historicalCount: 3000,
    currentCount: 40,
  },
].forEach(runScenario);

console.log("fusionPlayerPipelineAudit passed");
