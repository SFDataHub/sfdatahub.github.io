import { classifyPlayerLevelProgression, type PlayerLevelProgressionEvidence } from "./playerLevelProgressionEvidence";
import { getClassMetaById } from "../../data/classes";
import { getFusionPathLevelCompensation } from "../servers/fusionCompensation";
import {
  getDirectFusionDestination,
  getFusionEvent,
  getFusionLineage,
  getFusionOrigins,
  isFusionAncestor,
  resolveServer,
} from "../servers/serverResolver";
import {
  comparePlayerPortraitAppearance,
  type PlayerPortraitAppearanceSummary,
} from "./playerPortraitAppearance";

export type PlayerFusionOriginSource =
  | "numeric"
  | "fusionSuffix"
  | "fusionLineage"
  | "currentServerNoPredecessor"
  | "unknown";

export type PlayerFusionResultStatus =
  | "high-confidence"
  | "candidate"
  | "ambiguous"
  | "unresolved"
  | "conflict"
  | "no-predecessor";

export type PlayerFusionLevelRegressionMode = "strict-boundary" | "legacy-compatible-observation";

export type PlayerFusionRejectReason =
  | "different-class"
  | "level-drop"
  | "level-regression"
  | "level-progression-extreme"
  | "origin-mismatch"
  | "base-attributes-contradiction"
  | "base-stat-regression";

export type PlayerFusionFieldAvailability = "available" | "missing" | "unsupported" | "invalid";
export type PlayerFusionEvidenceStrength =
  | "hardContradiction"
  | "strongContradiction"
  | "neutral"
  | "weakSupport"
  | "support"
  | "strongSupport"
  | "identityAnchor";
export type PlayerFusionCandidateClassification = "rejected" | "weak" | "plausible" | "strong" | "anchored";
export type PlayerFusionEvidenceEntryType =
  | "origin-compatibility"
  | "class-compatibility"
  | "level-monotonicity"
  | "level-progression"
  | "base-monotonicity"
  | "base-unchanged-stats"
  | "base-secondary-stability"
  | "base-ordering"
  | "fortress-continuity"
  | "pet-continuity"
  | "portrait-continuity"
  | "guild-continuity"
  | "exact-name"
  | "fusion-base-name"
  | "assignment";

export type PlayerFusionEvidenceEntry = {
  type: PlayerFusionEvidenceEntryType;
  strength: PlayerFusionEvidenceStrength;
  availability?: PlayerFusionFieldAvailability | "available" | "unavailable";
  label: string;
  detail?: string;
};

export type PlayerFusionBaseFingerprint = {
  available: boolean;
  unchangedCount: number | null;
  unchangedAttributes: string[];
  unchangedSecondaryCount: number | null;
  orderingStable: boolean | null;
};

export type PlayerFusionSemanticVector = {
  availability: PlayerFusionFieldAvailability;
  values: number[] | null;
};

export type PlayerFusionSemanticSummary = {
  baseAttributes?: PlayerFusionSemanticVector;
  fortress?: PlayerFusionSemanticVector;
  pets?: PlayerFusionSemanticVector;
  portrait?: PlayerPortraitAppearanceSummary;
};

export type PlayerFusionEvidence = {
  originMatches: boolean | null;
  sameClass: boolean | null;
  levelConsistent: boolean | null;
  exactName: boolean;
  fusionBaseName: boolean;
  sameGuild: boolean | null;
  baseAttributesConsistent: boolean | null;
  baseFingerprint: PlayerFusionBaseFingerprint;
  fortressContinuity: boolean | null;
  petContinuity: boolean | null;
  portraitContinuity: boolean | null;
  portraitDiscriminating: boolean | null;
  levelProgression: PlayerLevelProgressionEvidence;
  entries: PlayerFusionEvidenceEntry[];
};

export type PlayerFusionObservation = {
  identifier: string;
  server: string | null;
  timestamp: number;
  name: string;
  classId: string | null;
  level: number | null;
  levelAvailability?: PlayerFusionFieldAvailability;
  guildIdentifier?: string | null;
  guildName?: string | null;
  originNumericId?: number | null;
  fusionSuffixServer?: string | null;
  semantic?: PlayerFusionSemanticSummary;
};

export type PlayerFusionCandidate = {
  oldIdentifier: string;
  oldServer: string | null;
  oldName: string | null;
  oldClassId: string | null;
  oldLevel: number | null;
  oldGuildIdentifier: string | null;
  oldGuildName: string | null;
  comparisonTimestamp: number | null;
  historyObservationCount: number;
  evidence: PlayerFusionEvidence;
  classification: PlayerFusionCandidateClassification;
  rejected: boolean;
  rejectReasons: PlayerFusionRejectReason[];
  notes: string[];
};

export type PlayerFusionPlayerResult = {
  newIdentifier: string;
  currentServer: string | null;
  resolvedOriginServers: string[];
  originSource: PlayerFusionOriginSource;
  status: PlayerFusionResultStatus;
  diagnostics: PlayerFusionDiagnostics;
  candidatesBeforeHardFilters: number;
  candidatesAfterHardFilters: number;
  candidates: PlayerFusionCandidate[];
  reasons: string[];
};

export type PlayerFusionReliableHistoricalLookup = {
  type: "fusion-suffix-base-name";
  originServer: string;
  baseName: string;
  classId: string | null;
  matchingObservationCount: number;
  compatibleClassObservationCount: number;
};

export type PlayerFusionDiagnostics = {
  historicalPoolSize: number;
  corridorHistoriesConsidered: number;
  earlyHardRejectedCandidates: number;
  earlyClassRejectedCandidates: number;
  earlyLevelRejectedCandidates: number;
  earlyBaseRejectedCandidates: number;
  fullCandidatesMaterialized: number;
  fullCandidatesEvaluated: number;
  candidatesGeneratedInitially: number;
  candidatesAfterHardCompatibility: number;
  candidatesAfterSemanticEvaluation: number;
  candidatesRetainedAfterEvaluation: number;
  candidatesDiscardedAfterEvaluation: number;
  candidateClassificationCounts: Record<PlayerFusionCandidateClassification, number>;
  retainedCandidateClassificationCounts: Record<PlayerFusionCandidateClassification, number>;
  rejectReasonCounts: Partial<Record<PlayerFusionRejectReason, number>>;
  evidenceEntriesGenerated: number;
  evidenceEntriesRetained: number;
  reliableHistoricalLookup: PlayerFusionReliableHistoricalLookup | null;
};

export type PlayerFusionResolverInput = {
  historicalObservations: PlayerFusionObservation[];
  newObservations: PlayerFusionObservation[];
  scope?: PlayerFusionScopeContext;
  levelRegressionMode?: PlayerFusionLevelRegressionMode;
  enableLevelProgressionEvidence?: boolean;
  enablePortraitEvidence?: boolean;
  enablePipelineDiagnostics?: boolean;
  onProgress?: (progress: PlayerFusionResolverProgress) => void;
  onDiagnostics?: (diagnostics: PlayerFusionResolverDiagnostics) => void;
  onLiveDiagnostics?: (diagnostic: PlayerFusionResolverLiveDiagnostic) => void;
};

export type PlayerFusionResolverProgress = {
  current: number;
  total: number;
};

export type PlayerFusionResolverCandidateStats = {
  total: number;
  min: number;
  median: number;
  p95: number;
  max: number;
};

export type PlayerFusionPipelineStageName =
  | "candidate-materialization-total"
  | "candidate-setup-origin"
  | "candidate-level-boundary"
  | "candidate-class-fallback"
  | "candidate-name-guild"
  | "candidate-level-progression"
  | "candidate-base"
  | "candidate-fortress"
  | "candidate-pets"
  | "candidate-portrait"
  | "candidate-evidence-entries"
  | "candidate-classification"
  | "portrait-discrimination"
  | "level-progression-cleanup"
  | "retention"
  | "result-aggregation";

export type PlayerFusionPipelineStageTiming = {
  stage: PlayerFusionPipelineStageName;
  calls: number;
  totalMs: number;
  avgMsPerCall: number;
  maxMs: number;
};

export type PlayerFusionHistoricalIndexPhaseDiagnostics = {
  phase: string;
  durationMs: number;
  entries: number;
  totalReferences: number;
  largestBucket: number;
};

export type PlayerFusionCandidatePoolBucketDiagnostics = {
  bucket: string;
  playerCount: number;
  fullCandidates: number;
  totalEvaluationMs: number;
};

export type PlayerFusionCandidateFlowDiagnostics = {
  corridorHistoriesConsidered: number;
  earlyClassRejected: number;
  earlyLevelRejected: number;
  earlyBaseRejected: number;
  fullCandidatesMaterialized: number;
  fullCandidatesEvaluated: number;
  rejectedByClassFallback: number;
  rejectedByLevel: number;
  rejectedByBase: number;
  rejectedByOrigin: number;
  rejectedByLevelProgressionCleanup: number;
  rejectedByOtherHardConstraint: number;
  afterHardRejects: number;
  weak: number;
  plausible: number;
  strong: number;
  anchored: number;
  actionable: number;
  retained: number;
};

export type PlayerFusionPipelinePrecheckAudit = {
  levelPrecheckCalls: number;
  levelPrecheckRejects: number;
  levelPrecheckSurvivors: number;
  levelPrecheckUnavailable: number;
  levelPrecheckTotalMs: number;
  levelRejectTotalMs: number;
  levelSurvivorTotalMs: number;
  basePrecheckCalls: number;
  basePrecheckRejects: number;
  basePrecheckSurvivors: number;
  basePrecheckUnavailable: number;
  basePrecheckTotalMs: number;
  baseRejectTotalMs: number;
  baseSurvivorTotalMs: number;
  baseBoundarySelectionCalls: number;
  baseBoundarySelectionTotalMs: number;
  baseReliabilityPredicateCalls: number;
  baseReliabilityPredicateTotalMs: number;
  baseSemanticVectorLookupCalls: number;
  baseSemanticVectorLookupTotalMs: number;
  baseCompareCalls: number;
  baseCompareTotalMs: number;
  candidateFusionContextsResolved: number;
  precheckResultsCreated: number;
  levelComparisonObjectsCreated: number;
  boundarySelectionsCreated: number;
  semanticVectorLookups: number;
  survivorPrecheckObjectsRetained: number;
  createCandidateCalls: number;
  createCandidateTotalMs: number;
};

export type PlayerFusionPipelineDiagnostics = {
  historicalIndexPhases: PlayerFusionHistoricalIndexPhaseDiagnostics[];
  candidateFlow: PlayerFusionCandidateFlowDiagnostics;
  precheckAudit: PlayerFusionPipelinePrecheckAudit;
  stageTimings: PlayerFusionPipelineStageTiming[];
  candidatePoolBuckets: PlayerFusionCandidatePoolBucketDiagnostics[];
};

export type PlayerFusionResolverDiagnostics = {
  historicalObservationCount: number;
  currentObservationCount: number;
  historicalHistoryCount: number;
  currentHistoryCount: number;
  historyPreparationMs: number;
  timeToFirstPlayerStartMs: number | null;
  timeToFirstPlayerCompletedMs: number | null;
  playerLoopMs: number;
  totalMs: number;
  corridorHistoriesConsidered: PlayerFusionResolverCandidateStats;
  earlyHardRejectedCandidates: PlayerFusionResolverCandidateStats;
  earlyClassRejectedCandidates: PlayerFusionResolverCandidateStats;
  earlyLevelRejectedCandidates: PlayerFusionResolverCandidateStats;
  earlyBaseRejectedCandidates: PlayerFusionResolverCandidateStats;
  fullCandidatesMaterialized: PlayerFusionResolverCandidateStats;
  fullCandidatesEvaluated: PlayerFusionResolverCandidateStats;
  candidatesGeneratedInitially: PlayerFusionResolverCandidateStats;
  candidatesAfterHardCompatibility: PlayerFusionResolverCandidateStats;
  candidatesAfterHardFilters: PlayerFusionResolverCandidateStats;
  actionableCandidates: PlayerFusionResolverCandidateStats;
  pipeline?: PlayerFusionPipelineDiagnostics;
};

export type PlayerFusionResolverLiveDiagnostic = {
  event:
    | "player-resolution-entered"
    | "history-preparation-started"
    | "history-preparation-finished"
    | "historical-index-build-finished"
    | "player-retention-checkpoint"
    | "player-started"
    | "candidate-histories-started"
    | "candidate-histories-origin-filter-finished"
    | "candidate-histories-history-scan-finished"
    | "candidate-histories-finished"
    | "player-candidate-count"
    | "player-finished"
    | "progress-emitted";
  playerIndex?: number;
  durationMs?: number;
  historicalHistoriesTotal?: number;
  scopeHistoricalHistories?: number;
  candidateHistoriesBeforeFiltering?: number;
  candidateHistoriesAfterBasicFiltering?: number;
  corridorHistoriesConsidered?: number;
  earlyHardRejectedCandidates?: number;
  earlyClassRejectedCandidates?: number;
  earlyLevelRejectedCandidates?: number;
  earlyBaseRejectedCandidates?: number;
  fullCandidatesMaterialized?: number;
  fullCandidatesEvaluated?: number;
  finalCandidateCount?: number;
  nestedFullHistoryScans?: number;
  candidateHistoryComparisons?: number;
  relatedByHistoryKeyFullScanComparisons?: number;
  historicalIndexPhases?: PlayerFusionHistoricalIndexPhaseDiagnostics[];
  historiesByServerBucketCount?: number;
  historiesByServerTotalReferences?: number;
  historiesByServerLargestBucket?: number;
  historiesByServerAndClassBucketCount?: number;
  historiesByServerAndClassTotalReferences?: number;
  historiesByServerAndClassLargestBucket?: number;
  historiesByServerWithUnreliableClassBucketCount?: number;
  historiesByServerWithUnreliableClassTotalReferences?: number;
  historiesByServerWithUnreliableClassLargestBucket?: number;
  historiesByServerAndNameBucketCount?: number;
  historiesByServerAndNameTotalReferences?: number;
  historiesByServerAndNameLargestBucket?: number;
  relatedByHistoryKeyCount?: number;
  relatedByHistoryKeyTotalReferences?: number;
  relatedByHistoryKeyMedianReferences?: number;
  relatedByHistoryKeyP95References?: number;
  relatedByHistoryKeyMaxReferences?: number;
  lineageRelationCacheEntries?: number;
  processedPlayers?: number;
  corridorHistoriesConsideredCumulative?: number;
  generatedCandidatesCumulative?: number;
  earlyHardRejectedCandidatesCumulative?: number;
  earlyClassRejectedCandidatesCumulative?: number;
  earlyLevelRejectedCandidatesCumulative?: number;
  earlyBaseRejectedCandidatesCumulative?: number;
  fullCandidatesMaterializedCumulative?: number;
  fullCandidatesEvaluatedCumulative?: number;
  retainedCandidatesCumulative?: number;
  discardedAfterEvaluationCumulative?: number;
  actionableCandidatesCumulative?: number;
  weakCandidatesEvaluated?: number;
  rejectedCandidatesEvaluated?: number;
  rejectedCandidatesRetained?: number;
  weakCandidatesRetained?: number;
  plausibleCandidatesRetained?: number;
  strongCandidatesRetained?: number;
  anchoredCandidatesRetained?: number;
  evidenceEntriesGenerated?: number;
  evidenceEntriesRetained?: number;
  maxCandidatesForOnePlayer?: number;
  medianRetainedCandidatesPerPlayer?: number;
  usedJSHeapSizeMb?: number;
  totalJSHeapSizeMb?: number;
  jsHeapSizeLimitMb?: number;
};

export type PlayerFusionResolverResult = {
  results: PlayerFusionPlayerResult[];
};

type PlayerHistory = {
  identifier: string;
  server: string | null;
  observations: PlayerFusionObservation[];
};

type PreparedPlayerHistory = {
  history: PlayerHistory;
  key: string;
  index: number;
  server: string | null;
  lineageDepth: number;
  nameKeys: Set<string>;
  classKeys: Set<string>;
};

type PreparedPlayerHistoricalIndex = {
  histories: PlayerHistory[];
  preparedHistories: PreparedPlayerHistory[];
  historiesByServer: Map<string, PreparedPlayerHistory[]>;
  historiesByServerAndClass: Map<string, PreparedPlayerHistory[]>;
  historiesByServerWithUnreliableClass: Map<string, PreparedPlayerHistory[]>;
  historiesByServerAndName: Map<string, PreparedPlayerHistory[]>;
  relatedByHistoryKey: Map<string, PreparedPlayerHistory[]>;
  bucketCount: number;
  largestBucketSize: number;
  candidateHistoryComparisons: number;
  relatedByHistoryKeyFullScanComparisons: number;
  phaseDiagnostics: PlayerFusionHistoricalIndexPhaseDiagnostics[];
};

type CandidateHistoryBuildResult = {
  histories: PlayerHistory[];
  corridorHistoriesConsidered: number;
  earlyHardRejectedCandidates: number;
  earlyClassRejectedCandidates: number;
  earlyLevelRejectedCandidates: number;
  earlyBaseRejectedCandidates: number;
  fullCandidatesMaterialized: number;
};

type PlayerCandidateBoundaryPrecheck = {
  history: PlayerHistory;
  oldServer: string | null;
  newServer: string | null;
  fusionEventTimestamp: number | null;
  selected: ReturnType<typeof selectLevelComparison>;
  levelConsistent: boolean | null;
  levelRejectReason: PlayerFusionRejectReason | null;
  baseBoundary: {
    historicalObservation: PlayerFusionObservation | null;
    currentObservation: PlayerFusionObservation | null;
    fallbackHistoricalObservation: PlayerFusionObservation | null;
    fallbackCurrentObservation: PlayerFusionObservation | null;
    hasReliableBoundary: boolean;
  };
  oldBaseVector: PlayerFusionSemanticVector | null;
  newBaseVector: PlayerFusionSemanticVector | null;
  baseAttributesConsistent: boolean | null;
  baseRejectReason: PlayerFusionRejectReason | null;
  notes: string[];
};

type PlayerCandidatePrecheckResult = {
  survivors: PlayerCandidateBoundaryPrecheck[];
  earlyLevelRejectedCandidates: number;
  earlyBaseRejectedCandidates: number;
};

type MutablePipelineStageTiming = {
  calls: number;
  totalMs: number;
  maxMs: number;
};

type MutableCandidatePoolBucketDiagnostics = {
  bucket: string;
  playerCount: number;
  fullCandidates: number;
  totalEvaluationMs: number;
};

type PlayerFusionPipelineAuditAccumulator = {
  historicalIndexPhases: PlayerFusionHistoricalIndexPhaseDiagnostics[];
  stageTimings: Record<PlayerFusionPipelineStageName, MutablePipelineStageTiming>;
  candidatePoolBuckets: Record<string, MutableCandidatePoolBucketDiagnostics>;
  precheckAudit: PlayerFusionPipelinePrecheckAudit;
};

export type PlayerFusionScopeContext = {
  targetServerCode: string;
  historicalServerCodes: string[];
  boundaryEffectiveDate?: string | null;
};

const normalizeComparableText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeClassId = (value: string | number | null | undefined) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const resolveServerCode = (value: string | number | null | undefined) => resolveServer(value)?.code ?? null;

type FusionLineageResolver = typeof getFusionLineage;

export const derivePlayerHistoricalCorridor = (
  input: {
    resolvedOriginServerCodes: readonly string[];
    targetServerCode: string | null | undefined;
    scope?: PlayerFusionScopeContext;
  },
  getLineage: FusionLineageResolver = getFusionLineage,
) => {
  const targetServerCode = resolveServerCode(input.targetServerCode);
  const scopeServerCodes = input.scope?.historicalServerCodes.length
    ? new Set(input.scope.historicalServerCodes)
    : null;
  const corridor: string[] = [];
  const seen = new Set<string>();

  const addServer = (serverCode: string) => {
    if (serverCode === targetServerCode) return;
    if (scopeServerCodes && !scopeServerCodes.has(serverCode)) return;
    if (seen.has(serverCode)) return;
    seen.add(serverCode);
    corridor.push(serverCode);
  };

  input.resolvedOriginServerCodes.forEach((origin) => {
    const originServerCode = resolveServerCode(origin);
    if (!originServerCode) return;
    if (scopeServerCodes && !scopeServerCodes.has(originServerCode)) return;

    const lineage = getLineage(originServerCode).map((server) => server.code);
    const targetIndex = targetServerCode ? lineage.indexOf(targetServerCode) : -1;
    const serverCodes = targetIndex >= 0 ? lineage.slice(0, targetIndex) : [originServerCode];
    serverCodes.forEach(addServer);
  });

  return corridor;
};

const getGuildKey = (observation: PlayerFusionObservation) =>
  normalizeComparableText(observation.guildIdentifier ?? observation.guildName ?? "");

const sortDescendingByTimestamp = (observations: PlayerFusionObservation[]) =>
  [...observations].sort((left, right) => right.timestamp - left.timestamp);

const latestObservation = (history: PlayerHistory) => sortDescendingByTimestamp(history.observations)[0] ?? null;

const earliestObservation = (history: PlayerHistory) => [...history.observations].sort(compareByTimestamp)[0] ?? null;

const compareByTimestamp = (left: PlayerFusionObservation, right: PlayerFusionObservation) =>
  left.timestamp - right.timestamp || normalizeIdentifierKey(left.identifier).localeCompare(normalizeIdentifierKey(right.identifier));

const parseFusionEventTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const buildHistories = (observations: PlayerFusionObservation[]) => {
  const byIdentifier = new Map<string, PlayerHistory>();

  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.identifier);
    if (!key) return;

    const existing = byIdentifier.get(key);
    if (existing) {
      existing.observations.push(observation);
      return;
    }

    byIdentifier.set(key, {
      identifier: observation.identifier,
      server: resolveServerCode(observation.server),
      observations: [observation],
    });
  });

  return [...byIdentifier.values()].map((history) => ({
    ...history,
    observations: [...history.observations].sort(compareByTimestamp),
  }));
};

const readFusionSuffix = (name: string, explicitSuffix?: string | null) => {
  if (explicitSuffix) {
    const resolved = resolveServerCode(explicitSuffix);
    return resolved ? { baseName: name, server: resolved } : null;
  }

  const match = name.match(/^(.*?)\s+\(([^()]+)\)$/i);
  if (!match?.[1] || !match[2]) return null;

  const server = resolveServerCode(match[2]);
  return server ? { baseName: match[1].trim(), server } : null;
};

const fallbackLineageOrigins = (
  currentServer: string | null,
  scope: PlayerFusionScopeContext | undefined,
) => {
  if (scope?.historicalServerCodes.length) return scope.historicalServerCodes;
  return currentServer ? getFusionOrigins(currentServer).map((server) => server.code) : [];
};

const isValidScopeOrigin = (
  serverCode: string | null | undefined,
  scope: PlayerFusionScopeContext | undefined,
) => {
  if (!serverCode) return false;
  if (!scope) return true;
  return scope.historicalServerCodes.includes(serverCode);
};

const resolveOriginsForNewObservation = (
  observation: PlayerFusionObservation,
  scope?: PlayerFusionScopeContext,
) => {
  const currentServer = resolveServerCode(observation.server);

  if (observation.originNumericId != null) {
    const originServer = resolveServerCode(observation.originNumericId);
    if (originServer && currentServer && originServer === currentServer) {
      return {
        currentServer,
        originSource: "currentServerNoPredecessor" as const,
        resolvedOriginServers: [originServer],
        reasons: ["numeric origin equals current server; no historical fusion predecessor expected"],
      };
    }

    if (originServer && isValidScopeOrigin(originServer, scope)) {
      return {
        currentServer,
        originSource: "numeric" as const,
        resolvedOriginServers: [originServer],
        reasons: [`numeric origin resolved to ${originServer}`],
      };
    }
  }

  const suffix = readFusionSuffix(observation.name, observation.fusionSuffixServer);
  if (suffix?.server && isValidScopeOrigin(suffix.server, scope)) {
    return {
      currentServer,
      originSource: "fusionSuffix" as const,
      resolvedOriginServers: [suffix.server],
      reasons: [`fusion name suffix resolved to ${suffix.server}`],
    };
  }

  if (currentServer) {
    const lineageOrigins = fallbackLineageOrigins(currentServer, scope);
    if (lineageOrigins.length) {
      return {
        currentServer,
        originSource: "fusionLineage" as const,
        resolvedOriginServers: lineageOrigins,
        reasons: [`fusion lineage produced ${lineageOrigins.join(", ")}`],
      };
    }
  }

  return {
    currentServer,
    originSource: "unknown" as const,
    resolvedOriginServers: [],
    reasons: ["origin could not be resolved"],
  };
};

const resolveOriginsForNewHistory = (
  history: PlayerHistory,
  scope?: PlayerFusionScopeContext,
) => {
  const latest = latestObservation(history) ?? history.observations[0];
  const currentServer = resolveServerCode(latest?.server ?? history.server);
  const observationsNewestFirst = sortDescendingByTimestamp(history.observations);

  const numericObservation = observationsNewestFirst.find((observation) => observation.originNumericId != null);
  if (numericObservation?.originNumericId != null) {
    const originServer = resolveServerCode(numericObservation.originNumericId);
    if (originServer && currentServer && originServer === currentServer) {
      return {
        currentServer,
        originSource: "currentServerNoPredecessor" as const,
        resolvedOriginServers: [originServer],
        reasons: ["numeric origin equals current server; no historical fusion predecessor expected"],
      };
    }

    if (originServer && isValidScopeOrigin(originServer, scope)) {
      return {
        currentServer,
        originSource: "numeric" as const,
        resolvedOriginServers: [originServer],
        reasons: [`numeric origin resolved to ${originServer} from player history`],
      };
    }
  }

  const suffixObservation = observationsNewestFirst
    .map((observation) => readFusionSuffix(observation.name, observation.fusionSuffixServer))
    .find((entry) => entry?.server && isValidScopeOrigin(entry.server, scope));
  if (suffixObservation?.server) {
    return {
      currentServer,
      originSource: "fusionSuffix" as const,
      resolvedOriginServers: [suffixObservation.server],
      reasons: [`fusion name suffix resolved to ${suffixObservation.server} from player history`],
    };
  }

  if (latest) return resolveOriginsForNewObservation(latest, scope);

  return {
    currentServer,
    originSource: "unknown" as const,
    resolvedOriginServers: [],
    reasons: ["origin could not be resolved"],
  };
};

const uniqueNormalizedNames = (observations: PlayerFusionObservation[]) =>
  new Set(observations.map((observation) => normalizeComparableText(observation.name)).filter(Boolean));

const fusionBaseNames = (
  observations: PlayerFusionObservation[],
  validOriginServers?: Set<string>,
) =>
  new Set(
    observations
      .map((observation) => {
        const suffix = readFusionSuffix(observation.name, observation.fusionSuffixServer);
        if (!suffix?.server) return "";
        if (validOriginServers && !validOriginServers.has(suffix.server)) return "";
        return normalizeComparableText(suffix.baseName);
      })
      .filter(Boolean),
  );

const historyKey = (history: PlayerHistory) => normalizeIdentifierKey(history.identifier);

const historyNameKeys = (history: PlayerHistory) => uniqueNormalizedNames(history.observations);

const historyClassKeys = (history: PlayerHistory) =>
  new Set(
    history.observations
      .map((observation) => normalizeClassId(observation.classId))
      .filter((value): value is string => Boolean(value)),
  );

const reliableClassKey = (classKeys: Set<string>) =>
  classKeys.size === 1 ? [...classKeys][0] ?? null : null;

const haveCompatiblePreparedHistoryIdentitySignals = (
  left: PreparedPlayerHistory,
  right: PreparedPlayerHistory,
) => {
  if (!valuesOverlap(left.nameKeys, right.nameKeys)) return false;
  return !left.classKeys.size || !right.classKeys.size || valuesOverlap(left.classKeys, right.classKeys);
};

const areOnSameFusionLineage = (
  leftServer: string | null,
  rightServer: string | null,
) =>
  Boolean(
    leftServer &&
      rightServer &&
      leftServer !== rightServer &&
      (isFusionAncestor(leftServer, rightServer) ||
        isFusionAncestor(rightServer, leftServer)),
  );

const lineageDepth = (serverCode: string | null) => {
  if (!serverCode) return 0;
  let depth = 1;
  let current = serverCode;
  const visited = new Set<string>();
  while (!visited.has(current)) {
    visited.add(current);
    const next = getDirectFusionDestination(current)?.code;
    if (!next) break;
    depth += 1;
    current = next;
  }
  return depth;
};

const serverAndNameKey = (server: string, name: string) => `${server}\u0000${name}`;

const serverAndClassKey = (server: string, classKey: string) => `${server}\u0000${classKey}`;

const pushMapEntry = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const entries = map.get(key);
  if (entries) {
    entries.push(value);
    return;
  }
  map.set(key, [value]);
};

const buildPreparedHistoricalIndex = (
  histories: PlayerHistory[],
  scope: PlayerFusionScopeContext | undefined,
  liveDiagnostics?: (diagnostic: PlayerFusionResolverLiveDiagnostic) => void,
  pipelineAudit?: PlayerFusionPipelineAuditAccumulator,
): PreparedPlayerHistoricalIndex => {
  const startedAt = performance.now();
  const phaseDiagnostics: PlayerFusionHistoricalIndexPhaseDiagnostics[] = [];
  const recordIndexPhase = (
    phase: string,
    phaseStartedAt: number,
    stats: { entries: number; totalReferences: number; largestBucket: number },
  ) => {
    phaseDiagnostics.push({
      phase,
      durationMs: performance.now() - phaseStartedAt,
      entries: stats.entries,
      totalReferences: stats.totalReferences,
      largestBucket: stats.largestBucket,
    });
  };
  const scopeHistoricalServerCodes = scope?.historicalServerCodes.length
    ? new Set(scope.historicalServerCodes)
    : null;
  const prepareStartedAt = performance.now();
  const preparedHistories = histories
    .flatMap((history, index): PreparedPlayerHistory[] => {
      if (scopeHistoricalServerCodes && (!history.server || !scopeHistoricalServerCodes.has(history.server))) {
        return [];
      }
      return [{
        history,
        key: historyKey(history),
        index,
        server: history.server,
        lineageDepth: lineageDepth(history.server),
        nameKeys: historyNameKeys(history),
        classKeys: historyClassKeys(history),
      }];
    });
  recordIndexPhase("prepare-history-metadata", prepareStartedAt, {
    entries: preparedHistories.length,
    totalReferences: preparedHistories.length,
    largestBucket: preparedHistories.length,
  });
  const historiesByServer = new Map<string, PreparedPlayerHistory[]>();
  const historiesByServerAndClass = new Map<string, PreparedPlayerHistory[]>();
  const historiesByServerWithUnreliableClass = new Map<string, PreparedPlayerHistory[]>();
  const historiesByServerAndName = new Map<string, PreparedPlayerHistory[]>();
  const historiesByName = new Map<string, PreparedPlayerHistory[]>();

  const bucketStartedAt = performance.now();
  preparedHistories.forEach((prepared) => {
    if (prepared.server) {
      pushMapEntry(historiesByServer, prepared.server, prepared);
      const classKey = reliableClassKey(prepared.classKeys);
      if (classKey) {
        pushMapEntry(historiesByServerAndClass, serverAndClassKey(prepared.server, classKey), prepared);
      } else {
        pushMapEntry(historiesByServerWithUnreliableClass, prepared.server, prepared);
      }
      prepared.nameKeys.forEach((name) => {
        pushMapEntry(historiesByServerAndName, serverAndNameKey(prepared.server!, name), prepared);
      });
    }
    prepared.nameKeys.forEach((name) => pushMapEntry(historiesByName, name, prepared));
  });
  const historiesByServerStats = mapArrayStats(historiesByServer);
  const historiesByServerAndClassStats = mapArrayStats(historiesByServerAndClass);
  const historiesByServerWithUnreliableClassStats = mapArrayStats(historiesByServerWithUnreliableClass);
  const historiesByServerAndNameStats = mapArrayStats(historiesByServerAndName);
  const historiesByNameStats = mapArrayStats(historiesByName);
  recordIndexPhase("build-server-name-class-buckets", bucketStartedAt, {
    entries:
      historiesByServer.size +
      historiesByServerAndClass.size +
      historiesByServerWithUnreliableClass.size +
      historiesByServerAndName.size +
      historiesByName.size,
    totalReferences:
      historiesByServerStats.totalReferences +
      historiesByServerAndClassStats.totalReferences +
      historiesByServerWithUnreliableClassStats.totalReferences +
      historiesByServerAndNameStats.totalReferences +
      historiesByNameStats.totalReferences,
    largestBucket: Math.max(
      historiesByServerStats.largestBucket,
      historiesByServerAndClassStats.largestBucket,
      historiesByServerWithUnreliableClassStats.largestBucket,
      historiesByServerAndNameStats.largestBucket,
      historiesByNameStats.largestBucket,
    ),
  });

  const lineageRelationCache = new Map<string, boolean>();
  const arePreparedOnSameFusionLineage = (
    leftServer: string | null,
    rightServer: string | null,
  ) => {
    if (!leftServer || !rightServer || leftServer === rightServer) return false;
    const key = leftServer < rightServer
      ? `${leftServer}\u0000${rightServer}`
      : `${rightServer}\u0000${leftServer}`;
    const cached = lineageRelationCache.get(key);
    if (cached != null) return cached;
    const related = areOnSameFusionLineage(leftServer, rightServer);
    lineageRelationCache.set(key, related);
    return related;
  };

  let candidateHistoryComparisons = 0;
  const relatedByHistoryKey = new Map<string, PreparedPlayerHistory[]>();

  const relatedStartedAt = performance.now();
  preparedHistories.forEach((prepared) => {
    const related = new Set<PreparedPlayerHistory>();
    prepared.nameKeys.forEach((name) => {
      historiesByName.get(name)?.forEach((candidate) => {
        if (related.has(candidate)) return;
        candidateHistoryComparisons += 1;
        if (
          (candidate === prepared ||
            arePreparedOnSameFusionLineage(prepared.server, candidate.server)) &&
          haveCompatiblePreparedHistoryIdentitySignals(prepared, candidate)
        ) {
          related.add(candidate);
        }
      });
    });
    relatedByHistoryKey.set(
      prepared.key,
      preparedHistories.filter((candidate) => related.has(candidate)),
    );
  });
  const relatedByHistoryKeyFullScanComparisons = preparedHistories.length * preparedHistories.length;
  const relatedByHistoryKeyStats = mapArrayStats(relatedByHistoryKey);
  recordIndexPhase("build-related-history-groups", relatedStartedAt, {
    entries: relatedByHistoryKeyStats.bucketCount,
    totalReferences: relatedByHistoryKeyStats.totalReferences,
    largestBucket: relatedByHistoryKeyStats.largestBucket,
  });

  const statsStartedAt = performance.now();
  const bucketSizes = [...historiesByName.values()].map((entries) => entries.length);
  recordIndexPhase("final-index-stats", statsStartedAt, {
    entries: bucketSizes.length,
    totalReferences: historiesByNameStats.totalReferences,
    largestBucket: bucketSizes.length ? Math.max(...bucketSizes) : 0,
  });
  pipelineAudit?.historicalIndexPhases.push(...phaseDiagnostics);
  liveDiagnostics?.({
    event: "historical-index-build-finished",
    durationMs: performance.now() - startedAt,
    historicalHistoriesTotal: histories.length,
    scopeHistoricalHistories: preparedHistories.length,
    candidateHistoryComparisons,
    relatedByHistoryKeyFullScanComparisons,
    nestedFullHistoryScans: 0,
    historicalIndexPhases: phaseDiagnostics,
    candidateHistoriesAfterBasicFiltering: relatedByHistoryKey.size,
    historiesByServerBucketCount: historiesByServerStats.bucketCount,
    historiesByServerTotalReferences: historiesByServerStats.totalReferences,
    historiesByServerLargestBucket: historiesByServerStats.largestBucket,
    historiesByServerAndClassBucketCount: historiesByServerAndClassStats.bucketCount,
    historiesByServerAndClassTotalReferences: historiesByServerAndClassStats.totalReferences,
    historiesByServerAndClassLargestBucket: historiesByServerAndClassStats.largestBucket,
    historiesByServerWithUnreliableClassBucketCount: historiesByServerWithUnreliableClassStats.bucketCount,
    historiesByServerWithUnreliableClassTotalReferences: historiesByServerWithUnreliableClassStats.totalReferences,
    historiesByServerWithUnreliableClassLargestBucket: historiesByServerWithUnreliableClassStats.largestBucket,
    historiesByServerAndNameBucketCount: historiesByServerAndNameStats.bucketCount,
    historiesByServerAndNameTotalReferences: historiesByServerAndNameStats.totalReferences,
    historiesByServerAndNameLargestBucket: historiesByServerAndNameStats.largestBucket,
    relatedByHistoryKeyCount: relatedByHistoryKeyStats.bucketCount,
    relatedByHistoryKeyTotalReferences: relatedByHistoryKeyStats.totalReferences,
    relatedByHistoryKeyMedianReferences: relatedByHistoryKeyStats.medianReferences,
    relatedByHistoryKeyP95References: relatedByHistoryKeyStats.p95References,
    relatedByHistoryKeyMaxReferences: relatedByHistoryKeyStats.largestBucket,
    lineageRelationCacheEntries: lineageRelationCache.size,
  });

  return {
    histories: preparedHistories.map((prepared) => prepared.history),
    preparedHistories,
    historiesByServer,
    historiesByServerAndClass,
    historiesByServerWithUnreliableClass,
    historiesByServerAndName,
    relatedByHistoryKey,
    bucketCount: historiesByName.size,
    largestBucketSize: bucketSizes.length ? Math.max(...bucketSizes) : 0,
    candidateHistoryComparisons,
    relatedByHistoryKeyFullScanComparisons,
    phaseDiagnostics,
  };
};

const mergePlayerHistories = (
  anchor: PlayerHistory,
  histories: PlayerHistory[],
): PlayerHistory => {
  const observations = new Map<string, PlayerFusionObservation>();
  histories
    .flatMap((history) => history.observations)
    .forEach((observation) => {
      const key = [
        normalizeIdentifierKey(observation.identifier),
        resolveServerCode(observation.server) ?? "",
        observation.timestamp,
        normalizeComparableText(observation.name),
      ].join("\u0000");
      observations.set(key, observation);
    });

  return {
    identifier: anchor.identifier,
    server: anchor.server,
    observations: [...observations.values()].sort(compareByTimestamp),
  };
};

const buildCandidateHistories = (
  historicalIndex: PreparedPlayerHistoricalIndex,
  newHistory: PlayerHistory,
  historicalCorridorServers: Set<string>,
  liveDiagnostics?: (diagnostic: PlayerFusionResolverLiveDiagnostic) => void,
): CandidateHistoryBuildResult => {
  const startedAt = performance.now();
  const currentReliableClassKey = reliableClassKey(historyClassKeys(newHistory));
  const scopedHistoriesByKey = new Map<string, PreparedPlayerHistory>();
  [...historicalCorridorServers].forEach((server) => {
    (historicalIndex.historiesByServer.get(server) ?? []).forEach((history) =>
      scopedHistoriesByKey.set(history.key, history),
    );
  });
  const scopedHistories = [...scopedHistoriesByKey.values()];
  liveDiagnostics?.({
    event: "candidate-histories-origin-filter-finished",
    durationMs: performance.now() - startedAt,
    historicalHistoriesTotal: historicalIndex.histories.length,
    scopeHistoricalHistories: scopedHistories.length,
  });

  const scanStartedAt = performance.now();
  const histories: PlayerHistory[] = [];
  let earlyClassRejectedCandidates = 0;
  scopedHistories.forEach((history) => {
    const related = historicalIndex.relatedByHistoryKey.get(history.key) ?? [];
    const originRelated = related.filter(
      (candidate) => candidate.server && historicalCorridorServers.has(candidate.server),
    );
    const canonical = [...originRelated].sort(
      (left, right) =>
        right.lineageDepth - left.lineageDepth ||
        left.key.localeCompare(right.key),
    )[0];

    if (canonical && canonical.key !== history.key) return;

    const relatedClassKeys = new Set<string>();
    related.forEach((entry) => {
      entry.classKeys.forEach((classKey) => relatedClassKeys.add(classKey));
    });
    const historicalReliableClassKey = reliableClassKey(relatedClassKeys);
    if (
      currentReliableClassKey &&
      historicalReliableClassKey &&
      historicalReliableClassKey !== currentReliableClassKey
    ) {
      earlyClassRejectedCandidates += 1;
      return;
    }

    histories.push(mergePlayerHistories(history.history, related.map((entry) => entry.history)));
  });
  liveDiagnostics?.({
    event: "candidate-histories-history-scan-finished",
    durationMs: performance.now() - scanStartedAt,
    historicalHistoriesTotal: historicalIndex.histories.length,
    scopeHistoricalHistories: scopedHistories.length,
    corridorHistoriesConsidered: scopedHistories.length,
    earlyHardRejectedCandidates: earlyClassRejectedCandidates,
    earlyClassRejectedCandidates,
    fullCandidatesMaterialized: histories.length,
    nestedFullHistoryScans: 0,
    candidateHistoryComparisons: 0,
  });
  return {
    histories,
    corridorHistoriesConsidered: scopedHistories.length,
    earlyHardRejectedCandidates: earlyClassRejectedCandidates,
    earlyClassRejectedCandidates,
    earlyLevelRejectedCandidates: 0,
    earlyBaseRejectedCandidates: 0,
    fullCandidatesMaterialized: histories.length,
  };
};

const valuesOverlap = <T>(left: Set<T>, right: Set<T>) => [...left].some((value) => right.has(value));

const hasHardCompatibilityRejection = (candidate: PlayerFusionCandidate) =>
  candidate.rejectReasons.some((reason) => isPlayerFusionHardContradictionReason(reason));

const percentile = (values: number[], percentileValue: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
};

const PLAYER_FUSION_PIPELINE_STAGE_NAMES: PlayerFusionPipelineStageName[] = [
  "candidate-materialization-total",
  "candidate-setup-origin",
  "candidate-level-boundary",
  "candidate-class-fallback",
  "candidate-name-guild",
  "candidate-level-progression",
  "candidate-base",
  "candidate-fortress",
  "candidate-pets",
  "candidate-portrait",
  "candidate-evidence-entries",
  "candidate-classification",
  "portrait-discrimination",
  "level-progression-cleanup",
  "retention",
  "result-aggregation",
];

const createPipelineStageTimings = () =>
  PLAYER_FUSION_PIPELINE_STAGE_NAMES.reduce(
    (timings, stage) => {
      timings[stage] = { calls: 0, totalMs: 0, maxMs: 0 };
      return timings;
    },
    {} as Record<PlayerFusionPipelineStageName, MutablePipelineStageTiming>,
  );

const createPrecheckAuditCounters = (): PlayerFusionPipelinePrecheckAudit => ({
  levelPrecheckCalls: 0,
  levelPrecheckRejects: 0,
  levelPrecheckSurvivors: 0,
  levelPrecheckUnavailable: 0,
  levelPrecheckTotalMs: 0,
  levelRejectTotalMs: 0,
  levelSurvivorTotalMs: 0,
  basePrecheckCalls: 0,
  basePrecheckRejects: 0,
  basePrecheckSurvivors: 0,
  basePrecheckUnavailable: 0,
  basePrecheckTotalMs: 0,
  baseRejectTotalMs: 0,
  baseSurvivorTotalMs: 0,
  baseBoundarySelectionCalls: 0,
  baseBoundarySelectionTotalMs: 0,
  baseReliabilityPredicateCalls: 0,
  baseReliabilityPredicateTotalMs: 0,
  baseSemanticVectorLookupCalls: 0,
  baseSemanticVectorLookupTotalMs: 0,
  baseCompareCalls: 0,
  baseCompareTotalMs: 0,
  candidateFusionContextsResolved: 0,
  precheckResultsCreated: 0,
  levelComparisonObjectsCreated: 0,
  boundarySelectionsCreated: 0,
  semanticVectorLookups: 0,
  survivorPrecheckObjectsRetained: 0,
  createCandidateCalls: 0,
  createCandidateTotalMs: 0,
});

const createPipelineAuditAccumulator = (): PlayerFusionPipelineAuditAccumulator => ({
  historicalIndexPhases: [],
  stageTimings: createPipelineStageTimings(),
  candidatePoolBuckets: {},
  precheckAudit: createPrecheckAuditCounters(),
});

const recordPipelineStageTiming = (
  audit: PlayerFusionPipelineAuditAccumulator | undefined,
  stage: PlayerFusionPipelineStageName,
  startedAt: number,
) => {
  if (!audit) return;
  const durationMs = performance.now() - startedAt;
  const timing = audit.stageTimings[stage];
  timing.calls += 1;
  timing.totalMs += durationMs;
  timing.maxMs = Math.max(timing.maxMs, durationMs);
};

const toPipelineStageTiming = (
  stage: PlayerFusionPipelineStageName,
  timing: MutablePipelineStageTiming,
): PlayerFusionPipelineStageTiming => ({
  stage,
  calls: timing.calls,
  totalMs: timing.totalMs,
  avgMsPerCall: timing.calls ? timing.totalMs / timing.calls : 0,
  maxMs: timing.maxMs,
});

const candidatePoolBucketName = (candidateCount: number) => {
  if (candidateCount <= 0) return "0";
  if (candidateCount <= 100) return "1-100";
  if (candidateCount <= 1000) return "101-1000";
  if (candidateCount <= 5000) return "1001-5000";
  if (candidateCount <= 10000) return "5001-10000";
  return "10001+";
};

const recordCandidatePoolBucket = (
  audit: PlayerFusionPipelineAuditAccumulator | undefined,
  fullCandidates: number,
  durationMs: number,
) => {
  if (!audit) return;
  const bucket = candidatePoolBucketName(fullCandidates);
  const entry = audit.candidatePoolBuckets[bucket] ?? {
    bucket,
    playerCount: 0,
    fullCandidates: 0,
    totalEvaluationMs: 0,
  };
  entry.playerCount += 1;
  entry.fullCandidates += fullCandidates;
  entry.totalEvaluationMs += durationMs;
  audit.candidatePoolBuckets[bucket] = entry;
};

const rejectReasonValue = (
  counts: Partial<Record<PlayerFusionRejectReason, number>>,
  reason: PlayerFusionRejectReason,
) => counts[reason] ?? 0;

const buildPipelineDiagnostics = (input: {
  audit: PlayerFusionPipelineAuditAccumulator;
  corridorHistoriesConsidered: number;
  earlyClassRejectedCandidates: number;
  earlyLevelRejectedCandidates: number;
  earlyBaseRejectedCandidates: number;
  fullCandidatesMaterialized: number;
  fullCandidatesEvaluated: number;
  candidatesAfterHardCompatibility: number;
  actionableCandidates: number;
  retainedCandidates: number;
  materializedRejectReasonCounts: Partial<Record<PlayerFusionRejectReason, number>>;
  materializedClassificationCounts: Record<PlayerFusionCandidateClassification, number>;
}): PlayerFusionPipelineDiagnostics => {
  const materializedLevelRejected =
    rejectReasonValue(input.materializedRejectReasonCounts, "level-regression") +
    rejectReasonValue(input.materializedRejectReasonCounts, "level-drop");
  const materializedBaseRejected =
    rejectReasonValue(input.materializedRejectReasonCounts, "base-stat-regression") +
    rejectReasonValue(input.materializedRejectReasonCounts, "base-attributes-contradiction");
  const levelRejected = materializedLevelRejected + input.earlyLevelRejectedCandidates;
  const baseRejected = materializedBaseRejected + input.earlyBaseRejectedCandidates;
  const classFallbackRejected = rejectReasonValue(input.materializedRejectReasonCounts, "different-class");
  const originRejected = rejectReasonValue(input.materializedRejectReasonCounts, "origin-mismatch");
  const levelProgressionRejected = rejectReasonValue(input.materializedRejectReasonCounts, "level-progression-extreme");
  const knownHardRejectReasons =
    levelRejected +
    baseRejected +
    classFallbackRejected +
    originRejected +
    levelProgressionRejected;
  const allHardRejectReasonOccurrences = Object.entries(input.materializedRejectReasonCounts)
    .filter(([reason]) => isPlayerFusionHardContradictionReason(reason as PlayerFusionRejectReason))
    .reduce((sum, [, count]) => sum + (count ?? 0), 0);

  return {
    historicalIndexPhases: input.audit.historicalIndexPhases,
    candidateFlow: {
      corridorHistoriesConsidered: input.corridorHistoriesConsidered,
      earlyClassRejected: input.earlyClassRejectedCandidates,
      earlyLevelRejected: input.earlyLevelRejectedCandidates,
      earlyBaseRejected: input.earlyBaseRejectedCandidates,
      fullCandidatesMaterialized: input.fullCandidatesMaterialized,
      fullCandidatesEvaluated: input.fullCandidatesEvaluated,
      rejectedByClassFallback: classFallbackRejected,
      rejectedByLevel: levelRejected,
      rejectedByBase: baseRejected,
      rejectedByOrigin: originRejected,
      rejectedByLevelProgressionCleanup: levelProgressionRejected,
      rejectedByOtherHardConstraint: Math.max(0, allHardRejectReasonOccurrences - knownHardRejectReasons),
      afterHardRejects: input.candidatesAfterHardCompatibility,
      weak: input.materializedClassificationCounts.weak,
      plausible: input.materializedClassificationCounts.plausible,
      strong: input.materializedClassificationCounts.strong,
      anchored: input.materializedClassificationCounts.anchored,
      actionable: input.actionableCandidates,
      retained: input.retainedCandidates,
    },
    precheckAudit: input.audit.precheckAudit,
    stageTimings: PLAYER_FUSION_PIPELINE_STAGE_NAMES.map((stage) =>
      toPipelineStageTiming(stage, input.audit.stageTimings[stage]),
    ),
    candidatePoolBuckets: Object.values(input.audit.candidatePoolBuckets).sort(
      (left, right) =>
        ["0", "1-100", "101-1000", "1001-5000", "5001-10000", "10001+"].indexOf(left.bucket) -
        ["0", "1-100", "101-1000", "1001-5000", "5001-10000", "10001+"].indexOf(right.bucket),
    ),
  };
};

const summarizeCandidateCounts = (
  values: readonly number[],
): PlayerFusionResolverCandidateStats => {
  if (!values.length) {
    return { total: 0, min: 0, median: 0, p95: 0, max: 0 };
  }
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    min: Math.min(...values),
    median: percentile([...values], 50),
    p95: percentile([...values], 95),
    max: Math.max(...values),
  };
};

const mapArrayStats = <K, V>(map: Map<K, V[]>) => {
  const sizes = [...map.values()].map((entries) => entries.length);
  return {
    bucketCount: map.size,
    totalReferences: sizes.reduce((sum, value) => sum + value, 0),
    largestBucket: sizes.length ? Math.max(...sizes) : 0,
    medianReferences: percentile(sizes, 50),
    p95References: percentile(sizes, 95),
  };
};

const readHeapSnapshotMb = () => {
  const memory = (globalThis.performance as unknown as {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
  }).memory;
  if (!memory) return {};
  const toMb = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value / 1024 / 1024)
      : undefined;
  return {
    usedJSHeapSizeMb: toMb(memory.usedJSHeapSize),
    totalJSHeapSizeMb: toMb(memory.totalJSHeapSize),
    jsHeapSizeLimitMb: toMb(memory.jsHeapSizeLimit),
  };
};

export const isPlayerFusionHardContradictionReason = (reason: PlayerFusionRejectReason) =>
  reason === "different-class" ||
  reason === "level-drop" ||
  reason === "level-regression" ||
  reason === "origin-mismatch" ||
  reason === "base-stat-regression" ||
  reason === "base-attributes-contradiction";

export const hasPlayerFusionHardContradiction = (candidate: PlayerFusionCandidate) =>
  candidate.rejectReasons.some(isPlayerFusionHardContradictionReason);

const classEvidence = (oldObservations: PlayerFusionObservation[], newObservations: PlayerFusionObservation[]) => {
  const oldClasses = new Set(oldObservations.map((observation) => normalizeClassId(observation.classId)).filter(Boolean));
  const newClasses = new Set(newObservations.map((observation) => normalizeClassId(observation.classId)).filter(Boolean));
  if (!oldClasses.size || !newClasses.size) return null;
  return valuesOverlap(oldClasses, newClasses);
};

const isSaneLevel = (level: number | null | undefined) =>
  typeof level === "number" && Number.isFinite(level) && level > 0;

const hasReliableLevel = (observation: PlayerFusionObservation) => {
  if (!isSaneLevel(observation.level)) return false;
  return observation.levelAvailability == null || observation.levelAvailability === "available";
};

export const selectReliableFusionBoundaryObservations = <T extends { timestamp: number }>(input: {
  historicalObservations: T[];
  currentObservations: T[];
  fusionEventTimestamp: number | null;
  isReliable: (observation: T) => boolean;
}) => {
  const fusionEventTimestamp = input.fusionEventTimestamp;
  const currentByTime = [...input.currentObservations].sort((left, right) => left.timestamp - right.timestamp);
  const earliestCurrent =
    fusionEventTimestamp == null
      ? currentByTime[0] ?? null
      : currentByTime.find((observation) => observation.timestamp >= fusionEventTimestamp) ??
        currentByTime[0] ??
        null;
  const earliestReliableCurrent =
    currentByTime.find(
      (observation) =>
        input.isReliable(observation) &&
        (fusionEventTimestamp == null || observation.timestamp >= fusionEventTimestamp),
    ) ??
    currentByTime.find(input.isReliable) ??
    null;
  const boundaryCurrent = earliestReliableCurrent ?? earliestCurrent;
  const eligibleHistorical = input.historicalObservations.filter((observation) =>
    fusionEventTimestamp != null
      ? observation.timestamp < fusionEventTimestamp
      : boundaryCurrent == null || observation.timestamp < boundaryCurrent.timestamp,
  );
  const historicalPool = eligibleHistorical.length ? eligibleHistorical : input.historicalObservations;
  const latestHistoricalBeforeBoundary =
    [...historicalPool].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const latestReliableHistorical =
    [...historicalPool]
      .filter(input.isReliable)
      .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

  return {
    historicalObservation: latestReliableHistorical,
    currentObservation: earliestReliableCurrent,
    fallbackHistoricalObservation: latestReliableHistorical ?? latestHistoricalBeforeBoundary,
    fallbackCurrentObservation: earliestReliableCurrent ?? earliestCurrent,
    hasReliableBoundary: Boolean(latestReliableHistorical && earliestReliableCurrent),
  };
};

const selectLevelComparison = (
  history: PlayerHistory,
  newHistory: PlayerHistory,
  mode: PlayerFusionLevelRegressionMode,
  fusionEventTimestamp: number | null,
) => {
  if (mode === "legacy-compatible-observation") {
    const earliestNew =
      fusionEventTimestamp == null
        ? earliestObservation(newHistory)
        : [...newHistory.observations].sort(compareByTimestamp).find((observation) => observation.timestamp >= fusionEventTimestamp) ?? null;
    const newLevel = earliestNew?.level ?? null;
    const eligible = history.observations
      .filter((observation) =>
        fusionEventTimestamp != null
          ? observation.timestamp < fusionEventTimestamp
          : earliestNew == null || observation.timestamp < earliestNew.timestamp,
      )
      .sort((left, right) => right.timestamp - left.timestamp);
    const candidates = eligible.length ? eligible : sortDescendingByTimestamp(history.observations);
    const levelCompatible = candidates.find(
      (observation) => observation.level == null || newLevel == null || newLevel >= observation.level,
    );
    const selected = levelCompatible ?? candidates[0] ?? null;

    return {
      observation: selected,
      newObservation: earliestNew,
      levelConsistent: selected?.level != null && newLevel != null ? newLevel >= selected.level : null,
      hasReliableLevelBoundary: Boolean(selected?.level != null && newLevel != null),
      notes:
        candidates[0]?.level != null && newLevel != null && newLevel < candidates[0].level && levelCompatible
          ? ["latest historical observation had a level drop; older compatible observation used"]
          : [],
    };
  }

  const boundary = selectReliableFusionBoundaryObservations({
    historicalObservations: history.observations,
    currentObservations: newHistory.observations,
    fusionEventTimestamp,
    isReliable: hasReliableLevel,
  });
  const oldLevel = boundary.historicalObservation?.level ?? null;
  const newLevel = boundary.currentObservation?.level ?? null;
  const levelConsistent = oldLevel != null && newLevel != null ? newLevel >= oldLevel : null;

  return {
    observation: boundary.fallbackHistoricalObservation,
    newObservation: boundary.fallbackCurrentObservation,
    levelConsistent,
    hasReliableLevelBoundary: boundary.hasReliableBoundary,
    notes: [] as string[],
  };
};

type PlayerFusionSemanticVectorField = Exclude<keyof PlayerFusionSemanticSummary, "portrait">;

const findSemanticVector = (
  observations: PlayerFusionObservation[],
  field: PlayerFusionSemanticVectorField,
  direction: "latest" | "earliest",
): PlayerFusionSemanticVector | null => {
  const sorted = direction === "latest" ? sortDescendingByTimestamp(observations) : [...observations].sort(compareByTimestamp);
  return sorted.find((observation) => observation.semantic?.[field]?.availability === "available" && observation.semantic[field]?.values)?.semantic?.[
    field
  ] ?? null;
};

const hasReliableSemanticVector = (
  observation: PlayerFusionObservation,
  field: PlayerFusionSemanticVectorField,
) =>
  observation.semantic?.[field]?.availability === "available" &&
  Boolean(observation.semantic[field]?.values?.length);

const semanticVectorFromObservation = (
  observation: PlayerFusionObservation | null,
  field: PlayerFusionSemanticVectorField,
) => observation?.semantic?.[field] ?? null;

const compareSemanticVector = (
  oldVector: PlayerFusionSemanticVector | null,
  newVector: PlayerFusionSemanticVector | null,
) => {
  if (
    oldVector?.availability !== "available" ||
    newVector?.availability !== "available" ||
    !oldVector.values?.length ||
    !newVector.values?.length ||
    oldVector.values.length !== newVector.values.length
  ) {
    return null;
  }

  return oldVector.values.every((oldValue, index) => {
    const newValue = newVector.values?.[index];
    return oldValue == null || newValue == null || newValue >= oldValue;
  });
};

const resolveCandidateFusionContext = (
  history: PlayerHistory,
  newHistory: PlayerHistory,
  scope: PlayerFusionScopeContext | undefined,
) => {
  const oldServer = history.server;
  const newServer = resolveServerCode(latestObservation(newHistory)?.server ?? newHistory.server);
  const fusionEventTimestamp = parseFusionEventTimestamp(
    scope?.boundaryEffectiveDate ??
      (oldServer && newServer ? getFusionEvent(oldServer, newServer)?.effectiveDate ?? null : null),
  );
  return { oldServer, newServer, fusionEventTimestamp };
};

const precheckPlayerCandidateBoundaries = (
  history: PlayerHistory,
  newHistory: PlayerHistory,
  scope: PlayerFusionScopeContext | undefined,
  levelRegressionMode: PlayerFusionLevelRegressionMode,
  pipelineAudit?: PlayerFusionPipelineAuditAccumulator,
): PlayerCandidateBoundaryPrecheck => {
  if (pipelineAudit) {
    pipelineAudit.precheckAudit.candidateFusionContextsResolved += 1;
  }
  const { oldServer, newServer, fusionEventTimestamp } = resolveCandidateFusionContext(
    history,
    newHistory,
    scope,
  );
  const notes: string[] = [];

  const levelStartedAt = pipelineAudit ? performance.now() : 0;
  const selected = selectLevelComparison(
    history,
    newHistory,
    levelRegressionMode,
    fusionEventTimestamp,
  );
  notes.push(...selected.notes);
  const levelConsistent = selected.levelConsistent;
  const levelRejectReason =
    levelConsistent === false && selected.hasReliableLevelBoundary
      ? levelRegressionMode === "strict-boundary"
        ? "level-regression"
        : "level-drop"
      : null;
  if (levelRejectReason === "level-regression") {
    notes.push("latest reliable historical level is higher than earliest reliable post-fusion level");
  }
  if (pipelineAudit) {
    const durationMs = performance.now() - levelStartedAt;
    const audit = pipelineAudit.precheckAudit;
    audit.levelPrecheckCalls += 1;
    audit.levelPrecheckTotalMs += durationMs;
    audit.levelComparisonObjectsCreated += 1;
    if (levelRejectReason) {
      audit.levelPrecheckRejects += 1;
      audit.levelRejectTotalMs += durationMs;
    } else {
      audit.levelPrecheckSurvivors += 1;
      audit.levelSurvivorTotalMs += durationMs;
      if (levelConsistent == null || !selected.hasReliableLevelBoundary) {
        audit.levelPrecheckUnavailable += 1;
      }
    }
  }
  recordPipelineStageTiming(pipelineAudit, "candidate-level-boundary", levelStartedAt);

  if (levelRejectReason) {
    if (pipelineAudit) {
      pipelineAudit.precheckAudit.precheckResultsCreated += 1;
    }
    return {
      history,
      oldServer,
      newServer,
      fusionEventTimestamp,
      selected,
      levelConsistent,
      levelRejectReason,
      baseBoundary: {
        historicalObservation: null,
        currentObservation: null,
        fallbackHistoricalObservation: null,
        fallbackCurrentObservation: null,
        hasReliableBoundary: false,
      },
      oldBaseVector: null,
      newBaseVector: null,
      baseAttributesConsistent: null,
      baseRejectReason: null,
      notes,
    };
  }

  const baseStartedAt = pipelineAudit ? performance.now() : 0;
  const baseBoundaryStartedAt = pipelineAudit ? performance.now() : 0;
  const baseBoundary = selectReliableFusionBoundaryObservations({
    historicalObservations: history.observations,
    currentObservations: newHistory.observations,
    fusionEventTimestamp,
    isReliable: (observation) => {
      const predicateStartedAt = pipelineAudit ? performance.now() : 0;
      const result = hasReliableSemanticVector(observation, "baseAttributes");
      if (pipelineAudit) {
        const audit = pipelineAudit.precheckAudit;
        audit.baseReliabilityPredicateCalls += 1;
        audit.baseReliabilityPredicateTotalMs += performance.now() - predicateStartedAt;
      }
      return result;
    },
  });
  if (pipelineAudit) {
    const audit = pipelineAudit.precheckAudit;
    audit.baseBoundarySelectionCalls += 1;
    audit.baseBoundarySelectionTotalMs += performance.now() - baseBoundaryStartedAt;
    audit.boundarySelectionsCreated += 1;
  }
  const oldVectorStartedAt = pipelineAudit ? performance.now() : 0;
  const oldBaseVector = semanticVectorFromObservation(baseBoundary.historicalObservation, "baseAttributes");
  if (pipelineAudit) {
    const audit = pipelineAudit.precheckAudit;
    audit.baseSemanticVectorLookupCalls += 1;
    audit.baseSemanticVectorLookupTotalMs += performance.now() - oldVectorStartedAt;
    audit.semanticVectorLookups += 1;
  }
  const newVectorStartedAt = pipelineAudit ? performance.now() : 0;
  const newBaseVector = semanticVectorFromObservation(baseBoundary.currentObservation, "baseAttributes");
  if (pipelineAudit) {
    const audit = pipelineAudit.precheckAudit;
    audit.baseSemanticVectorLookupCalls += 1;
    audit.baseSemanticVectorLookupTotalMs += performance.now() - newVectorStartedAt;
    audit.semanticVectorLookups += 1;
  }
  const baseCompareStartedAt = pipelineAudit ? performance.now() : 0;
  const baseAttributesConsistent = compareSemanticVector(oldBaseVector, newBaseVector);
  if (pipelineAudit) {
    const audit = pipelineAudit.precheckAudit;
    audit.baseCompareCalls += 1;
    audit.baseCompareTotalMs += performance.now() - baseCompareStartedAt;
  }
  const baseRejectReason = baseAttributesConsistent === false ? "base-stat-regression" : null;
  if (pipelineAudit) {
    const durationMs = performance.now() - baseStartedAt;
    const audit = pipelineAudit.precheckAudit;
    audit.basePrecheckCalls += 1;
    audit.basePrecheckTotalMs += durationMs;
    if (baseRejectReason) {
      audit.basePrecheckRejects += 1;
      audit.baseRejectTotalMs += durationMs;
    } else {
      audit.basePrecheckSurvivors += 1;
      audit.baseSurvivorTotalMs += durationMs;
      audit.survivorPrecheckObjectsRetained += 1;
      if (baseAttributesConsistent == null) {
        audit.basePrecheckUnavailable += 1;
      }
    }
    audit.precheckResultsCreated += 1;
  }
  recordPipelineStageTiming(pipelineAudit, "candidate-base", baseStartedAt);

  return {
    history,
    oldServer,
    newServer,
    fusionEventTimestamp,
    selected,
    levelConsistent,
    levelRejectReason,
    baseBoundary,
    oldBaseVector,
    newBaseVector,
    baseAttributesConsistent,
    baseRejectReason,
    notes,
  };
};

const precheckCandidateHistories = (
  histories: PlayerHistory[],
  newHistory: PlayerHistory,
  scope: PlayerFusionScopeContext | undefined,
  levelRegressionMode: PlayerFusionLevelRegressionMode,
  pipelineAudit?: PlayerFusionPipelineAuditAccumulator,
): PlayerCandidatePrecheckResult => {
  const survivors: PlayerCandidateBoundaryPrecheck[] = [];
  let earlyLevelRejectedCandidates = 0;
  let earlyBaseRejectedCandidates = 0;

  histories.forEach((history) => {
    const precheck = precheckPlayerCandidateBoundaries(
      history,
      newHistory,
      scope,
      levelRegressionMode,
      pipelineAudit,
    );
    if (precheck.levelRejectReason) {
      earlyLevelRejectedCandidates += 1;
      return;
    }
    if (precheck.baseRejectReason) {
      earlyBaseRejectedCandidates += 1;
      return;
    }
    survivors.push(precheck);
  });

  return {
    survivors,
    earlyLevelRejectedCandidates,
    earlyBaseRejectedCandidates,
  };
};

const findPortraitSummary = (
  observations: PlayerFusionObservation[],
  direction: "latest" | "earliest",
) => {
  const sorted =
    direction === "latest"
      ? sortDescendingByTimestamp(observations)
      : [...observations].sort(compareByTimestamp);
  return (
    sorted.find(
      (observation) =>
        observation.semantic?.portrait?.availability === "available" &&
        observation.semantic.portrait.fingerprint,
    )?.semantic?.portrait ?? null
  );
};

const portraitEvidenceDetail = (input: {
  comparison: "exact" | "different";
  discriminating: boolean;
  comparableCandidateCount: number;
  exactMatchCandidateCount: number;
}) =>
  [
    `comparison=${input.comparison}`,
    `discriminating=${input.discriminating}`,
    `comparableCandidateCount=${input.comparableCandidateCount}`,
    `exactMatchCandidateCount=${input.exactMatchCandidateCount}`,
  ].join(" · ");

const BASE_ATTRIBUTE_LABELS = ["STR", "DEX", "INT", "CON", "LUC"] as const;
const BASE_ATTRIBUTE_INDEX = {
  strength: 0,
  dexterity: 1,
  intelligence: 2,
  constitution: 3,
  luck: 4,
} as const;

const emptyBaseFingerprint = (): PlayerFusionBaseFingerprint => ({
  available: false,
  unchangedCount: null,
  unchangedAttributes: [],
  unchangedSecondaryCount: null,
  orderingStable: null,
});

const orderingSignature = (values: number[]) =>
  values
    .map((value, index) => ({ value, label: BASE_ATTRIBUTE_LABELS[index] }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .map((entry) => entry.label)
    .join(">");

const createBaseFingerprint = (
  oldVector: PlayerFusionSemanticVector | null,
  newVector: PlayerFusionSemanticVector | null,
  classId: string | null | undefined,
): PlayerFusionBaseFingerprint => {
  if (
    oldVector?.availability !== "available" ||
    newVector?.availability !== "available" ||
    !oldVector.values?.length ||
    !newVector.values?.length ||
    oldVector.values.length !== newVector.values.length
  ) {
    return emptyBaseFingerprint();
  }

  const oldValues = oldVector.values;
  const newValues = newVector.values;
  const deltas = oldValues.map((oldValue, index) => newValues[index] - oldValue);
  const unchangedAttributes = BASE_ATTRIBUTE_LABELS.filter((_, index) => deltas[index] === 0);
  const primaryAttribute = getClassMetaById(classId)?.primaryAttribute ?? null;
  const secondaryIndexes = [
    BASE_ATTRIBUTE_INDEX.strength,
    BASE_ATTRIBUTE_INDEX.dexterity,
    BASE_ATTRIBUTE_INDEX.intelligence,
  ].filter((index) => index !== (primaryAttribute ? BASE_ATTRIBUTE_INDEX[primaryAttribute] : -1));

  return {
    available: true,
    unchangedCount: unchangedAttributes.length,
    unchangedAttributes: [...unchangedAttributes],
    unchangedSecondaryCount: secondaryIndexes.filter((index) => deltas[index] === 0).length,
    orderingStable: orderingSignature(oldValues) === orderingSignature(newValues),
  };
};

const pushEvidence = (entries: PlayerFusionEvidenceEntry[], entry: PlayerFusionEvidenceEntry | null | undefined) => {
  if (entry) entries.push(entry);
};

const strengthCount = (entries: PlayerFusionEvidenceEntry[], strength: PlayerFusionEvidenceStrength) =>
  entries.filter((entry) => entry.strength === strength).length;

const classifyEvidenceEntries = (
  entries: PlayerFusionEvidenceEntry[],
  rejectReasons: PlayerFusionRejectReason[],
): PlayerFusionCandidateClassification => {
  if (rejectReasons.some(isPlayerFusionHardContradictionReason) || strengthCount(entries, "hardContradiction") > 0) return "rejected";
  if (strengthCount(entries, "identityAnchor") > 0) return "anchored";

  const strongSupportCount = strengthCount(entries, "strongSupport");
  const supportCount = strengthCount(entries, "support");
  const weakSupportCount = strengthCount(entries, "weakSupport");
  const strongContradictionCount = strengthCount(entries, "strongContradiction");
  const weakLevelProgression = entries.some(
    (entry) => entry.type === "level-progression" && entry.strength === "weakSupport",
  );

  if (strongSupportCount > 0 && supportCount > 0) return "strong";
  if (strongSupportCount > 0 && (weakLevelProgression || strongContradictionCount > 0)) return "strong";
  if (strongSupportCount > 1) return "strong";
  if (supportCount > 0 || strongSupportCount > 0) return "plausible";
  if (weakSupportCount > 1) return "plausible";
  return "weak";
};

const createCandidate = (
  precheck: PlayerCandidateBoundaryPrecheck,
  newHistory: PlayerHistory,
  historicalCorridorServers: Set<string>,
  originServers: Set<string>,
  enableLevelProgressionEvidence: boolean,
  pipelineAudit?: PlayerFusionPipelineAuditAccumulator,
): PlayerFusionCandidate => {
  const history = precheck.history;
  const notes: string[] = [...precheck.notes];
  const rejectReasons: PlayerFusionRejectReason[] = [];
  const setupStartedAt = pipelineAudit ? performance.now() : 0;
  const oldServer = precheck.oldServer;
  const newServer = precheck.newServer;

  if (!oldServer || !historicalCorridorServers.has(oldServer)) {
    rejectReasons.push("origin-mismatch");
  }
  recordPipelineStageTiming(pipelineAudit, "candidate-setup-origin", setupStartedAt);

  const selected = precheck.selected;
  const oldObservation = selected.observation;
  const levelConsistent = precheck.levelConsistent;

  const classStartedAt = pipelineAudit ? performance.now() : 0;
  const sameClass = classEvidence(history.observations, newHistory.observations);
  if (sameClass === false) rejectReasons.push("different-class");
  recordPipelineStageTiming(pipelineAudit, "candidate-class-fallback", classStartedAt);

  if (rejectReasons.some(isPlayerFusionHardContradictionReason)) {
    const unavailableProgression = classifyPlayerLevelProgression({
      preLevel: null,
      postLevel: null,
      elapsedDays: null,
      fusionCompensation: null,
      compensationAvailable: false,
      compensationUnavailableReason: "unavailable",
    });
    return {
      oldIdentifier: history.identifier,
      oldServer,
      oldName: oldObservation?.name ?? null,
      oldClassId: oldObservation?.classId ?? null,
      oldLevel: oldObservation?.level ?? null,
      oldGuildIdentifier: oldObservation?.guildIdentifier ?? null,
      oldGuildName: oldObservation?.guildName ?? null,
      comparisonTimestamp: oldObservation?.timestamp ?? null,
      historyObservationCount: history.observations.length,
      evidence: {
        originMatches: oldServer ? historicalCorridorServers.has(oldServer) : null,
        sameClass,
        levelConsistent,
        exactName: false,
        fusionBaseName: false,
        sameGuild: null,
        baseAttributesConsistent: precheck.baseAttributesConsistent,
        baseFingerprint: emptyBaseFingerprint(),
        fortressContinuity: null,
        petContinuity: null,
        portraitContinuity: null,
        portraitDiscriminating: null,
        levelProgression: unavailableProgression,
        entries: [],
      },
      classification: "rejected",
      rejected: true,
      rejectReasons,
      notes,
    };
  }

  const nameGuildStartedAt = pipelineAudit ? performance.now() : 0;
  const oldNames = uniqueNormalizedNames(history.observations);
  const newNames = uniqueNormalizedNames(newHistory.observations);
  const newBaseNames = fusionBaseNames(newHistory.observations, originServers);
  const oldGuild = oldObservation ? getGuildKey(oldObservation) : "";
  const newGuild = selected.newObservation ? getGuildKey(selected.newObservation) : "";
  const exactName = valuesOverlap(oldNames, newNames);
  const fusionBaseName = valuesOverlap(oldNames, newBaseNames);
  const sameGuild = oldGuild && newGuild ? oldGuild === newGuild : null;
  recordPipelineStageTiming(pipelineAudit, "candidate-name-guild", nameGuildStartedAt);

  const levelProgressionStartedAt = pipelineAudit ? performance.now() : 0;
  const elapsedDays =
    selected.observation && selected.newObservation
      ? Math.max(0, (selected.newObservation.timestamp - selected.observation.timestamp) / (24 * 60 * 60 * 1000))
      : null;
  const compensation = oldServer && newServer ? getFusionPathLevelCompensation(oldServer, newServer) : null;
  const levelProgression =
    enableLevelProgressionEvidence && levelConsistent !== false
      ? classifyPlayerLevelProgression({
          preLevel: selected.observation?.level ?? null,
          postLevel: selected.newObservation?.level ?? null,
          elapsedDays,
          fusionCompensation: compensation?.available ? compensation.compensationLevels : null,
          compensationAvailable: compensation?.available === true,
          compensationUnavailableReason: compensation?.available === false ? compensation.reason : oldServer && newServer ? null : "unknown-fusion-lineage",
        })
      : classifyPlayerLevelProgression({
          preLevel: null,
          postLevel: null,
          elapsedDays: null,
          fusionCompensation: null,
          compensationAvailable: false,
          compensationUnavailableReason: "unavailable",
        });
  if (levelProgression.category === "extreme-contradiction") {
    notes.push("compensation-adjusted level progression is unusually high; treated as plausibility evidence");
  }
  recordPipelineStageTiming(pipelineAudit, "candidate-level-progression", levelProgressionStartedAt);

  const baseBoundary = precheck.baseBoundary;
  const oldBaseVector = precheck.oldBaseVector;
  const newBaseVector = precheck.newBaseVector;
  const baseAttributesConsistent = precheck.baseAttributesConsistent;
  const baseFingerprint = createBaseFingerprint(
    oldBaseVector,
    newBaseVector,
    baseBoundary.historicalObservation?.classId ?? oldObservation?.classId ?? selected.newObservation?.classId,
  );

  const fortressStartedAt = pipelineAudit ? performance.now() : 0;
  const fortressContinuity = compareSemanticVector(
    findSemanticVector(history.observations, "fortress", "latest"),
    findSemanticVector(newHistory.observations, "fortress", "earliest"),
  );
  recordPipelineStageTiming(pipelineAudit, "candidate-fortress", fortressStartedAt);

  const petStartedAt = pipelineAudit ? performance.now() : 0;
  const petContinuity = compareSemanticVector(
    findSemanticVector(history.observations, "pets", "latest"),
    findSemanticVector(newHistory.observations, "pets", "earliest"),
  );
  recordPipelineStageTiming(pipelineAudit, "candidate-pets", petStartedAt);

  const portraitStartedAt = pipelineAudit ? performance.now() : 0;
  const portraitComparison = comparePlayerPortraitAppearance(
    findPortraitSummary(history.observations, "latest"),
    findPortraitSummary(newHistory.observations, "earliest"),
  );
  const portraitContinuity = portraitComparison.comparable
    ? portraitComparison.exact
    : null;
  recordPipelineStageTiming(pipelineAudit, "candidate-portrait", portraitStartedAt);

  const evidenceStartedAt = pipelineAudit ? performance.now() : 0;
  const entries: PlayerFusionEvidenceEntry[] = [];
  pushEvidence(entries, {
    type: "origin-compatibility",
    strength: oldServer && historicalCorridorServers.has(oldServer) ? "neutral" : "hardContradiction",
    availability: oldServer ? "available" : "unavailable",
    label: oldServer && historicalCorridorServers.has(oldServer) ? "Origin compatible" : "Origin contradiction",
  });
  if (sameClass != null) {
    pushEvidence(entries, {
      type: "class-compatibility",
      strength: sameClass ? "neutral" : "hardContradiction",
      availability: "available",
      label: sameClass ? "Class compatible" : "Class contradiction",
    });
  }
  if (levelConsistent != null) {
    pushEvidence(entries, {
      type: "level-monotonicity",
      strength: levelConsistent ? "neutral" : "hardContradiction",
      availability: "available",
      label: levelConsistent ? "Level non-decreasing" : "Level regression",
    });
  }
  if (levelProgression.category === "normal") {
    pushEvidence(entries, {
      type: "level-progression",
      strength: "support",
      availability: "available",
      label: "Normal level progression",
    });
  } else if (levelProgression.category === "plausible-burst") {
    pushEvidence(entries, {
      type: "level-progression",
      strength: "weakSupport",
      availability: "available",
      label: "Plausible level burst",
    });
  } else if (levelProgression.category === "extreme-contradiction") {
    pushEvidence(entries, {
      type: "level-progression",
      strength: "strongContradiction",
      availability: "available",
      label: "Unusually high level progression",
      detail: "Warning unless the candidate is weak in an ambiguous pool.",
    });
  }
  if (baseAttributesConsistent != null) {
    pushEvidence(entries, {
      type: "base-monotonicity",
      strength: baseAttributesConsistent ? "neutral" : "hardContradiction",
      availability: "available",
      label: baseAttributesConsistent ? "Base stats non-decreasing" : "Base-stat regression",
    });
  }
  if (baseFingerprint.unchangedCount != null && baseFingerprint.unchangedCount >= 3) {
    pushEvidence(entries, {
      type: "base-unchanged-stats",
      strength: "strongSupport",
      availability: "available",
      label: "3+ unchanged base stats",
      detail: baseFingerprint.unchangedAttributes.join(", "),
    });
  }
  if (baseFingerprint.unchangedSecondaryCount != null && baseFingerprint.unchangedSecondaryCount >= 2) {
    pushEvidence(entries, {
      type: "base-secondary-stability",
      strength: "strongSupport",
      availability: "available",
      label: "2 unchanged secondary base stats",
    });
  }
  if (baseFingerprint.orderingStable === true) {
    pushEvidence(entries, {
      type: "base-ordering",
      strength: "support",
      availability: "available",
      label: "Base-stat ordering stable",
    });
  }
  if (fortressContinuity === true) {
    pushEvidence(entries, {
      type: "fortress-continuity",
      strength: "strongSupport",
      availability: "available",
      label: "Fortress continuity",
    });
  } else if (fortressContinuity === false) {
    pushEvidence(entries, {
      type: "fortress-continuity",
      strength: "neutral",
      availability: "available",
      label: "Fortress differs",
    });
  }
  if (petContinuity === true) {
    pushEvidence(entries, {
      type: "pet-continuity",
      strength: "weakSupport",
      availability: "available",
      label: "Pet continuity",
    });
  }
  if (sameGuild === true) {
    pushEvidence(entries, {
      type: "guild-continuity",
      strength: "support",
      availability: "available",
      label: "Guild continuity",
    });
  }
  if (exactName) {
    pushEvidence(entries, {
      type: "exact-name",
      strength: "identityAnchor",
      availability: "available",
      label: "Exact name",
    });
  }
  if (fusionBaseName) {
    pushEvidence(entries, {
      type: "fusion-base-name",
      strength: "identityAnchor",
      availability: "available",
      label: "Fusion base name",
    });
  }
  recordPipelineStageTiming(pipelineAudit, "candidate-evidence-entries", evidenceStartedAt);

  const classificationStartedAt = pipelineAudit ? performance.now() : 0;
  const classification = classifyEvidenceEntries(entries, rejectReasons);
  recordPipelineStageTiming(pipelineAudit, "candidate-classification", classificationStartedAt);

  return {
    oldIdentifier: history.identifier,
    oldServer,
    oldName: oldObservation?.name ?? null,
    oldClassId: oldObservation?.classId ?? null,
    oldLevel: oldObservation?.level ?? null,
    oldGuildIdentifier: oldObservation?.guildIdentifier ?? null,
    oldGuildName: oldObservation?.guildName ?? null,
    comparisonTimestamp: oldObservation?.timestamp ?? null,
    historyObservationCount: history.observations.length,
    evidence: {
      originMatches: oldServer ? historicalCorridorServers.has(oldServer) : null,
      sameClass,
      levelConsistent,
      exactName,
      fusionBaseName,
      sameGuild,
      baseAttributesConsistent,
      baseFingerprint,
      fortressContinuity,
      petContinuity,
      portraitContinuity,
      portraitDiscriminating: null,
      levelProgression,
      entries,
    },
    classification,
    rejected: rejectReasons.some(isPlayerFusionHardContradictionReason),
    rejectReasons,
    notes,
  };
};

const buildReliableHistoricalLookup = (
  historicalIndex: PreparedPlayerHistoricalIndex,
  newHistory: PlayerHistory,
  originServers: Set<string>,
  historicalCorridorServers: Set<string>,
): PlayerFusionReliableHistoricalLookup | null => {
  const suffix = sortDescendingByTimestamp(newHistory.observations)
    .map((observation) => readFusionSuffix(observation.name, observation.fusionSuffixServer))
    .find((entry) => entry?.server && entry.baseName);
  if (!suffix?.server || !originServers.has(suffix.server)) return null;

  const normalizedBaseName = normalizeComparableText(suffix.baseName);
  if (!normalizedBaseName) return null;

  const newClasses = new Set(newHistory.observations.map((observation) => normalizeClassId(observation.classId)).filter(Boolean));
  const matchingHistoriesByKey = new Map<string, PreparedPlayerHistory>();
  [...historicalCorridorServers].forEach((server) => {
    (historicalIndex.historiesByServerAndName.get(serverAndNameKey(server, normalizedBaseName)) ?? [])
      .forEach((history) => matchingHistoriesByKey.set(history.key, history));
  });
  const matchingHistories = [...matchingHistoriesByKey.values()];
  const compatibleClassHistories = matchingHistories.filter((history) => {
    if (!newClasses.size) return false;
    if (!history.classKeys.size) return false;
    return valuesOverlap(history.classKeys, newClasses);
  });

  return {
    type: "fusion-suffix-base-name",
    originServer: suffix.server,
    baseName: suffix.baseName,
    classId: [...newClasses][0] ?? null,
    matchingObservationCount: matchingHistories.length,
    compatibleClassObservationCount: compatibleClassHistories.length,
  };
};

const isActionableClassification = (
  classification: PlayerFusionCandidateClassification,
) =>
  classification === "plausible" ||
  classification === "strong" ||
  classification === "anchored";

const applyPortraitEvidence = (
  candidates: PlayerFusionCandidate[],
  enabled: boolean,
) => {
  if (!enabled) return candidates;

  const relevantCandidates = candidates.filter(
    (candidate) =>
      !candidate.rejected && isActionableClassification(candidate.classification),
  );
  const comparableRelevantCandidates = relevantCandidates.filter(
    (candidate) => candidate.evidence.portraitContinuity != null,
  );
  const exactRelevantMatches = comparableRelevantCandidates.filter(
    (candidate) => candidate.evidence.portraitContinuity === true,
  );
  const hasDiscriminatingExactMatch =
    relevantCandidates.length > 1 &&
    comparableRelevantCandidates.length === relevantCandidates.length &&
    exactRelevantMatches.length === 1;
  const discriminatingIdentifier = hasDiscriminatingExactMatch
    ? normalizeIdentifierKey(exactRelevantMatches[0]?.oldIdentifier)
    : null;

  return candidates.map((candidate) => {
    if (candidate.rejected || candidate.evidence.portraitContinuity == null) {
      return candidate;
    }

    const discriminating =
      candidate.evidence.portraitContinuity === true &&
      discriminatingIdentifier === normalizeIdentifierKey(candidate.oldIdentifier);
    const portraitEntry: PlayerFusionEvidenceEntry = {
      type: "portrait-continuity",
      strength:
        candidate.evidence.portraitContinuity === true
          ? discriminating
            ? "support"
            : "weakSupport"
          : "neutral",
      availability: "available",
      label:
        candidate.evidence.portraitContinuity === true
          ? "Portrait continuity"
          : "Portrait differs",
      detail: portraitEvidenceDetail({
        comparison:
          candidate.evidence.portraitContinuity === true ? "exact" : "different",
        discriminating,
        comparableCandidateCount: comparableRelevantCandidates.length,
        exactMatchCandidateCount: exactRelevantMatches.length,
      }),
    };
    const entries = [...candidate.evidence.entries, portraitEntry];
    return {
      ...candidate,
      evidence: {
        ...candidate.evidence,
        portraitDiscriminating: discriminating,
        entries,
      },
      classification: classifyEvidenceEntries(entries, candidate.rejectReasons),
    };
  });
};

export const hasPlayerFusionEvidenceStrength = (
  candidate: PlayerFusionCandidate,
  strength: PlayerFusionEvidenceStrength,
) => candidate.evidence.entries.some((entry) => entry.strength === strength);

export const getPlayerFusionClassificationRank = (classification: PlayerFusionCandidateClassification) => {
  if (classification === "anchored") return 4;
  if (classification === "strong") return 3;
  if (classification === "plausible") return 2;
  if (classification === "weak") return 1;
  return 0;
};

export const selectPlayerFusionManagementCandidates = (
  candidates: PlayerFusionCandidate[],
) =>
  [...candidates]
    .filter(
      (candidate) =>
        isPlayerFusionActionableIdentityCandidate(candidate) &&
        !candidate.rejectReasons.includes("level-regression") &&
        !candidate.rejectReasons.includes("level-progression-extreme"),
    )
    .sort(
      (left, right) =>
        getPlayerFusionClassificationRank(right.classification) -
          getPlayerFusionClassificationRank(left.classification) ||
        Number(right.evidence.sameGuild === true) -
          Number(left.evidence.sameGuild === true) ||
        Number((right.evidence.baseFingerprint.unchangedCount ?? 0) >= 3) -
          Number((left.evidence.baseFingerprint.unchangedCount ?? 0) >= 3) ||
        Number(right.evidence.fortressContinuity === true) -
          Number(left.evidence.fortressContinuity === true) ||
        Number(right.evidence.levelProgression.category === "normal") -
          Number(left.evidence.levelProgression.category === "normal") ||
        (right.oldLevel ?? 0) - (left.oldLevel ?? 0) ||
        left.oldIdentifier.localeCompare(right.oldIdentifier, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    )
    .slice(0, 25);

const emptyClassificationCounts = (): Record<PlayerFusionCandidateClassification, number> => ({
  rejected: 0,
  weak: 0,
  plausible: 0,
  strong: 0,
  anchored: 0,
});

const countCandidateClassifications = (
  candidates: PlayerFusionCandidate[],
) =>
  candidates.reduce((counts, candidate) => {
    counts[candidate.classification] += 1;
    return counts;
  }, emptyClassificationCounts());

const addClassificationCounts = (
  left: Record<PlayerFusionCandidateClassification, number>,
  right: Record<PlayerFusionCandidateClassification, number>,
) => ({
  rejected: left.rejected + right.rejected,
  weak: left.weak + right.weak,
  plausible: left.plausible + right.plausible,
  strong: left.strong + right.strong,
  anchored: left.anchored + right.anchored,
});

const countRejectReasons = (
  candidates: PlayerFusionCandidate[],
) =>
  candidates.reduce<Partial<Record<PlayerFusionRejectReason, number>>>(
    (counts, candidate) => {
      candidate.rejectReasons.forEach((reason) => {
        counts[reason] = (counts[reason] ?? 0) + 1;
      });
      return counts;
    },
    {},
  );

const addRejectReasonCount = (
  counts: Partial<Record<PlayerFusionRejectReason, number>>,
  reason: PlayerFusionRejectReason,
  increment: number,
) => {
  if (increment <= 0) return counts;
  return {
    ...counts,
    [reason]: (counts[reason] ?? 0) + increment,
  };
};

const addRejectReasonCounts = (
  target: Partial<Record<PlayerFusionRejectReason, number>>,
  source: Partial<Record<PlayerFusionRejectReason, number>>,
) => {
  (Object.entries(source) as Array<[PlayerFusionRejectReason, number | undefined]>).forEach(
    ([reason, count]) => {
      if (!count) return;
      target[reason] = (target[reason] ?? 0) + count;
    },
  );
};

const countEvidenceEntries = (candidates: PlayerFusionCandidate[]) =>
  candidates.reduce((sum, candidate) => sum + candidate.evidence.entries.length, 0);

const isSemanticReadyCandidate = (candidate: PlayerFusionCandidate) =>
  !hasPlayerFusionHardContradiction(candidate) &&
  candidate.evidence.originMatches === true &&
  candidate.evidence.sameClass === true &&
  candidate.evidence.levelConsistent !== false &&
  candidate.evidence.baseAttributesConsistent === true &&
  candidate.evidence.fortressContinuity === true;

const isFullSemanticReadyCandidate = (candidate: PlayerFusionCandidate) =>
  isSemanticReadyCandidate(candidate) && candidate.evidence.petContinuity === true;

const isNameStrongIdentityCandidate = (candidate: PlayerFusionCandidate) =>
  !hasPlayerFusionHardContradiction(candidate) &&
  candidate.evidence.originMatches === true &&
  candidate.evidence.sameClass !== false &&
  (candidate.evidence.exactName || candidate.evidence.fusionBaseName);

export const isPlayerFusionStrongIdentityCandidate = (candidate: PlayerFusionCandidate) =>
  candidate.classification === "anchored" ||
  candidate.classification === "strong" ||
  isNameStrongIdentityCandidate(candidate) ||
  isFullSemanticReadyCandidate(candidate) ||
  isSemanticReadyCandidate(candidate);

export const isPlayerFusionActionableIdentityCandidate = (candidate: PlayerFusionCandidate) =>
  !candidate.rejected && isActionableClassification(candidate.classification);

export const isPlayerFusionReadyCandidate = (candidate: PlayerFusionCandidate) =>
  !candidate.rejected && (candidate.classification === "anchored" || candidate.classification === "strong");

const selectUniqueReadyCandidates = (candidates: PlayerFusionCandidate[]) => {
  const viable = candidates.filter((candidate) => !candidate.rejected);
  const anchored = viable.filter((candidate) => candidate.classification === "anchored");
  if (anchored.length) return anchored.length === 1 ? anchored : [];

  const strong = viable.filter((candidate) => candidate.classification === "strong");
  return strong.length === 1 ? strong : [];
};

export const selectPlayerFusionReadyCandidates = (result: PlayerFusionPlayerResult) => {
  if (result.status !== "high-confidence" && result.status !== "conflict") return [];
  return selectUniqueReadyCandidates(result.candidates);
};

const applyLevelProgressionCleanup = (candidates: PlayerFusionCandidate[]) => {
  const viable = candidates.filter((candidate) => !candidate.rejected);
  if (viable.length < 2) return candidates;

  const protectedCandidateKeys = new Set([
    ...viable
      .filter(
        (candidate) =>
          candidate.classification === "anchored" ||
          (candidate.classification === "strong" && candidate.evidence.levelProgression.category !== "extreme-contradiction"),
      )
      .map((candidate) => normalizeIdentifierKey(candidate.oldIdentifier)),
    ...selectUniqueReadyCandidates(candidates).map((candidate) => normalizeIdentifierKey(candidate.oldIdentifier)),
  ]);

  return candidates.map((candidate) => {
    if (
      candidate.rejected ||
      protectedCandidateKeys.has(normalizeIdentifierKey(candidate.oldIdentifier)) ||
      candidate.evidence.levelProgression.category !== "extreme-contradiction"
    ) {
      return candidate;
    }

    return {
      ...candidate,
      classification: "rejected" as const,
      rejected: true,
      rejectReasons: candidate.rejectReasons.includes("level-progression-extreme")
        ? candidate.rejectReasons
        : [...candidate.rejectReasons, "level-progression-extreme" as const],
      notes: candidate.notes.includes("weak candidate removed by extreme level progression cleanup")
        ? candidate.notes
        : [...candidate.notes, "weak candidate removed by extreme level progression cleanup"],
    };
  });
};

const PLAYER_RETENTION_DIAGNOSTIC_INTERVAL = 50;

const classifyPlayerResult = (
  originSource: PlayerFusionOriginSource,
  candidates: PlayerFusionCandidate[],
): PlayerFusionResultStatus => {
  if (originSource === "currentServerNoPredecessor") return "no-predecessor";

  const viable = candidates.filter((candidate) => !candidate.rejected);
  if (!viable.length) return "unresolved";

  if (selectUniqueReadyCandidates(candidates).length === 1) return "high-confidence";

  const strongOrAnchored = viable.filter((candidate) => candidate.classification === "anchored" || candidate.classification === "strong");
  if (strongOrAnchored.length > 1 || viable.length > 1) return "ambiguous";
  return "candidate";
};

export const resolvePlayerFusions = (input: PlayerFusionResolverInput): PlayerFusionResolverResult => {
  const startedAt = performance.now();
  input.onLiveDiagnostics?.({ event: "history-preparation-started" });
  const historyPreparationStartedAt = performance.now();
  const histories = buildHistories(input.historicalObservations);
  const newHistories = buildHistories(input.newObservations);
  const historiesPreparedAt = performance.now();
  input.onLiveDiagnostics?.({
    event: "history-preparation-finished",
    durationMs: historiesPreparedAt - historyPreparationStartedAt,
    historicalHistoriesTotal: histories.length,
  });
  const levelRegressionMode = input.levelRegressionMode ?? "strict-boundary";
  const enableLevelProgressionEvidence = input.enableLevelProgressionEvidence ?? true;
  const enablePortraitEvidence = input.enablePortraitEvidence ?? true;
  const scope = input.scope
    ? {
        ...input.scope,
        historicalServerCodes: [...new Set(input.scope.historicalServerCodes)],
      }
    : undefined;
  const pipelineAudit = input.enablePipelineDiagnostics
    ? createPipelineAuditAccumulator()
    : undefined;
  const historicalIndex = buildPreparedHistoricalIndex(
    histories,
    scope,
    input.onLiveDiagnostics,
    pipelineAudit,
  );
  const initialResults: PlayerFusionPlayerResult[] = [];
  const candidatesGeneratedInitially: number[] = [];
  const corridorHistoriesConsideredCounts: number[] = [];
  const earlyHardRejectedCandidateCounts: number[] = [];
  const earlyClassRejectedCandidateCounts: number[] = [];
  const earlyLevelRejectedCandidateCounts: number[] = [];
  const earlyBaseRejectedCandidateCounts: number[] = [];
  const fullCandidatesMaterializedCounts: number[] = [];
  const fullCandidatesEvaluatedCounts: number[] = [];
  const candidatesAfterHardCompatibilityCounts: number[] = [];
  const candidatesAfterHardFilterCounts: number[] = [];
  const actionableCandidateCounts: number[] = [];
  const retainedCandidateCounts: number[] = [];
  let generatedCandidatesCumulative = 0;
  let corridorHistoriesConsideredCumulative = 0;
  let earlyHardRejectedCandidatesCumulative = 0;
  let earlyClassRejectedCandidatesCumulative = 0;
  let earlyLevelRejectedCandidatesCumulative = 0;
  let earlyBaseRejectedCandidatesCumulative = 0;
  let fullCandidatesMaterializedCumulative = 0;
  let fullCandidatesEvaluatedCumulative = 0;
  let retainedCandidatesCumulative = 0;
  let discardedAfterEvaluationCumulative = 0;
  let actionableCandidatesCumulative = 0;
  let rejectedCandidatesEvaluated = 0;
  let weakCandidatesEvaluated = 0;
  let rejectedCandidatesRetainedCumulative = 0;
  let weakCandidatesRetainedCumulative = 0;
  let plausibleCandidatesRetainedCumulative = 0;
  let strongCandidatesRetainedCumulative = 0;
  let anchoredCandidatesRetainedCumulative = 0;
  let evidenceEntriesGenerated = 0;
  let evidenceEntriesRetained = 0;
  let maxCandidatesForOnePlayer = 0;
  const materializedRejectReasonCounts: Partial<Record<PlayerFusionRejectReason, number>> = {};
  let materializedClassificationCounts = emptyClassificationCounts();
  let firstPlayerStartedAt: number | null = null;
  let firstPlayerCompletedAt: number | null = null;
  const playerLoopStartedAt = performance.now();
  newHistories.forEach((newHistory, index) => {
    const playerStartedAt = performance.now();
    firstPlayerStartedAt ??= playerStartedAt;
    const playerIndex = index + 1;
    const isLiveDiagnosedPlayer = playerIndex === 1;
    const emitLiveDiagnostics = isLiveDiagnosedPlayer
      ? (diagnostic: PlayerFusionResolverLiveDiagnostic) =>
          input.onLiveDiagnostics?.({ playerIndex, ...diagnostic })
      : undefined;
    emitLiveDiagnostics?.({ event: "player-started", playerIndex });
    const latest = latestObservation(newHistory) ?? newHistory.observations[0];
    const origin = resolveOriginsForNewHistory(newHistory, scope);
    const originServers = new Set(origin.resolvedOriginServers);
    const historicalCorridorServers = new Set(
      derivePlayerHistoricalCorridor({
        resolvedOriginServerCodes: origin.resolvedOriginServers,
        targetServerCode: origin.currentServer ?? scope?.targetServerCode,
        scope,
      }),
    );
    emitLiveDiagnostics?.({
      event: "candidate-histories-started",
      playerIndex,
      historicalHistoriesTotal: historicalIndex.histories.length,
    });
    const candidateHistoriesStartedAt = performance.now();
    const candidateHistoryBuild = historicalCorridorServers.size
      ? buildCandidateHistories(historicalIndex, newHistory, historicalCorridorServers, emitLiveDiagnostics)
      : {
          histories: [],
          corridorHistoriesConsidered: 0,
          earlyHardRejectedCandidates: 0,
          earlyClassRejectedCandidates: 0,
          earlyLevelRejectedCandidates: 0,
          earlyBaseRejectedCandidates: 0,
          fullCandidatesMaterialized: 0,
        };
    const matchingHistories = candidateHistoryBuild.histories;
    const precheckResult = precheckCandidateHistories(
      matchingHistories,
      newHistory,
      scope,
      levelRegressionMode,
      pipelineAudit,
    );
    const fullCandidatePrechecks = precheckResult.survivors;
    const earlyLevelRejectedCandidates = precheckResult.earlyLevelRejectedCandidates;
    const earlyBaseRejectedCandidates = precheckResult.earlyBaseRejectedCandidates;
    const earlyHardRejectedCandidates =
      candidateHistoryBuild.earlyHardRejectedCandidates +
      earlyLevelRejectedCandidates +
      earlyBaseRejectedCandidates;
    const fullCandidatesMaterialized = fullCandidatePrechecks.length;
    emitLiveDiagnostics?.({
      event: "candidate-histories-finished",
      playerIndex,
      durationMs: performance.now() - candidateHistoriesStartedAt,
      historicalHistoriesTotal: historicalIndex.histories.length,
      scopeHistoricalHistories: [...historicalCorridorServers].reduce(
        (sum, server) => sum + (historicalIndex.historiesByServer.get(server)?.length ?? 0),
        0,
      ),
      candidateHistoriesBeforeFiltering: historicalIndex.histories.length,
      candidateHistoriesAfterBasicFiltering: matchingHistories.length,
      corridorHistoriesConsidered: candidateHistoryBuild.corridorHistoriesConsidered,
      earlyHardRejectedCandidates,
      earlyClassRejectedCandidates: candidateHistoryBuild.earlyClassRejectedCandidates,
      earlyLevelRejectedCandidates,
      earlyBaseRejectedCandidates,
      fullCandidatesMaterialized,
    });
    const evaluationStartedAt = pipelineAudit ? performance.now() : 0;
    const materializedCandidates = fullCandidatePrechecks.map((precheck) => {
      const candidateStartedAt = pipelineAudit ? performance.now() : 0;
      const candidate = createCandidate(
        precheck,
        newHistory,
        historicalCorridorServers,
        originServers,
        enableLevelProgressionEvidence,
        pipelineAudit,
      );
      recordPipelineStageTiming(pipelineAudit, "candidate-materialization-total", candidateStartedAt);
      if (pipelineAudit) {
        const audit = pipelineAudit.precheckAudit;
        audit.createCandidateCalls += 1;
        audit.createCandidateTotalMs += performance.now() - candidateStartedAt;
      }
      return candidate;
    });
    const portraitDiscriminationStartedAt = pipelineAudit ? performance.now() : 0;
    const candidatesWithPortraitEvidence = applyPortraitEvidence(
      materializedCandidates,
      enablePortraitEvidence,
    );
    recordPipelineStageTiming(pipelineAudit, "portrait-discrimination", portraitDiscriminationStartedAt);
    const cleanupStartedAt = pipelineAudit ? performance.now() : 0;
    const candidates = applyLevelProgressionCleanup(candidatesWithPortraitEvidence);
    recordPipelineStageTiming(pipelineAudit, "level-progression-cleanup", cleanupStartedAt);

    const retentionStartedAt = pipelineAudit ? performance.now() : 0;
    const retainedCandidates = selectPlayerFusionManagementCandidates(candidates);
    recordPipelineStageTiming(pipelineAudit, "retention", retentionStartedAt);
    const aggregationStartedAt = pipelineAudit ? performance.now() : 0;
    const materializedCandidateClassificationCounts = countCandidateClassifications(candidates);
    materializedClassificationCounts = addClassificationCounts(
      materializedClassificationCounts,
      materializedCandidateClassificationCounts,
    );
    const earlyRejectClassificationCounts = {
      ...emptyClassificationCounts(),
      rejected: earlyHardRejectedCandidates,
    };
    const candidateClassificationCounts = addClassificationCounts(
      materializedCandidateClassificationCounts,
      earlyRejectClassificationCounts,
    );
    const retainedCandidateClassificationCounts = countCandidateClassifications(retainedCandidates);
    const rejectReasonCounts = addRejectReasonCount(
      addRejectReasonCount(
        addRejectReasonCount(
          countRejectReasons(candidates),
          "different-class",
          candidateHistoryBuild.earlyClassRejectedCandidates,
        ),
        levelRegressionMode === "strict-boundary" ? "level-regression" : "level-drop",
        earlyLevelRejectedCandidates,
      ),
      "base-stat-regression",
      earlyBaseRejectedCandidates,
    );
    addRejectReasonCounts(materializedRejectReasonCounts, countRejectReasons(candidates));
    const evidenceEntryCount = countEvidenceEntries(candidates);
    const retainedEvidenceEntryCount = countEvidenceEntries(retainedCandidates);
    const candidatesAfterHardCompatibility = candidates.filter((candidate) => !hasHardCompatibilityRejection(candidate)).length;
    const candidatesAfterHardFilters = candidates.filter((candidate) => !candidate.rejected).length;
    const actionableCandidates = candidates.filter(isPlayerFusionActionableIdentityCandidate).length;
    const candidatesGeneratedForPlayer = fullCandidatesMaterialized + earlyHardRejectedCandidates;
    candidatesGeneratedInitially.push(candidatesGeneratedForPlayer);
    corridorHistoriesConsideredCounts.push(candidateHistoryBuild.corridorHistoriesConsidered);
    earlyHardRejectedCandidateCounts.push(earlyHardRejectedCandidates);
    earlyClassRejectedCandidateCounts.push(candidateHistoryBuild.earlyClassRejectedCandidates);
    earlyLevelRejectedCandidateCounts.push(earlyLevelRejectedCandidates);
    earlyBaseRejectedCandidateCounts.push(earlyBaseRejectedCandidates);
    fullCandidatesMaterializedCounts.push(fullCandidatesMaterialized);
    fullCandidatesEvaluatedCounts.push(candidates.length);
    candidatesAfterHardCompatibilityCounts.push(candidatesAfterHardCompatibility);
    candidatesAfterHardFilterCounts.push(candidatesAfterHardFilters);
    actionableCandidateCounts.push(actionableCandidates);
    retainedCandidateCounts.push(retainedCandidates.length);
    generatedCandidatesCumulative += candidatesGeneratedForPlayer;
    corridorHistoriesConsideredCumulative += candidateHistoryBuild.corridorHistoriesConsidered;
    earlyHardRejectedCandidatesCumulative += earlyHardRejectedCandidates;
    earlyClassRejectedCandidatesCumulative += candidateHistoryBuild.earlyClassRejectedCandidates;
    earlyLevelRejectedCandidatesCumulative += earlyLevelRejectedCandidates;
    earlyBaseRejectedCandidatesCumulative += earlyBaseRejectedCandidates;
    fullCandidatesMaterializedCumulative += fullCandidatesMaterialized;
    fullCandidatesEvaluatedCumulative += candidates.length;
    retainedCandidatesCumulative += retainedCandidates.length;
    discardedAfterEvaluationCumulative += candidatesGeneratedForPlayer - retainedCandidates.length;
    actionableCandidatesCumulative += actionableCandidates;
    rejectedCandidatesEvaluated += candidateClassificationCounts.rejected;
    weakCandidatesEvaluated += candidateClassificationCounts.weak;
    rejectedCandidatesRetainedCumulative += retainedCandidateClassificationCounts.rejected;
    weakCandidatesRetainedCumulative += retainedCandidateClassificationCounts.weak;
    plausibleCandidatesRetainedCumulative += retainedCandidateClassificationCounts.plausible;
    strongCandidatesRetainedCumulative += retainedCandidateClassificationCounts.strong;
    anchoredCandidatesRetainedCumulative += retainedCandidateClassificationCounts.anchored;
    evidenceEntriesGenerated += evidenceEntryCount;
    evidenceEntriesRetained += retainedEvidenceEntryCount;
    maxCandidatesForOnePlayer = Math.max(maxCandidatesForOnePlayer, retainedCandidates.length);
    recordPipelineStageTiming(pipelineAudit, "result-aggregation", aggregationStartedAt);
    recordCandidatePoolBucket(
      pipelineAudit,
      candidates.length,
      pipelineAudit ? performance.now() - evaluationStartedAt : 0,
    );
    emitLiveDiagnostics?.({
      event: "player-candidate-count",
      playerIndex,
      candidateHistoriesBeforeFiltering: historicalIndex.histories.length,
      candidateHistoriesAfterBasicFiltering: matchingHistories.length,
      corridorHistoriesConsidered: candidateHistoryBuild.corridorHistoriesConsidered,
      earlyHardRejectedCandidates,
      earlyClassRejectedCandidates: candidateHistoryBuild.earlyClassRejectedCandidates,
      earlyLevelRejectedCandidates,
      earlyBaseRejectedCandidates,
      fullCandidatesMaterialized,
      fullCandidatesEvaluated: candidates.length,
      finalCandidateCount: candidates.length,
    });

    initialResults.push({
      newIdentifier: latest?.identifier ?? newHistory.identifier,
      currentServer: origin.currentServer,
      resolvedOriginServers: origin.resolvedOriginServers,
      originSource: origin.originSource,
      status: classifyPlayerResult(origin.originSource, candidates),
      diagnostics: {
        historicalPoolSize: candidatesGeneratedForPlayer,
        corridorHistoriesConsidered: candidateHistoryBuild.corridorHistoriesConsidered,
        earlyHardRejectedCandidates,
        earlyClassRejectedCandidates: candidateHistoryBuild.earlyClassRejectedCandidates,
        earlyLevelRejectedCandidates,
        earlyBaseRejectedCandidates,
        fullCandidatesMaterialized,
        fullCandidatesEvaluated: candidates.length,
        candidatesGeneratedInitially: candidatesGeneratedForPlayer,
        candidatesAfterHardCompatibility,
        candidatesAfterSemanticEvaluation: candidatesAfterHardFilters,
        candidatesRetainedAfterEvaluation: retainedCandidates.length,
        candidatesDiscardedAfterEvaluation: candidatesGeneratedForPlayer - retainedCandidates.length,
        candidateClassificationCounts,
        retainedCandidateClassificationCounts,
        rejectReasonCounts,
        evidenceEntriesGenerated: evidenceEntryCount,
        evidenceEntriesRetained: retainedEvidenceEntryCount,
        reliableHistoricalLookup: buildReliableHistoricalLookup(
          historicalIndex,
          newHistory,
          originServers,
          historicalCorridorServers,
        ),
      },
      candidatesBeforeHardFilters: candidatesGeneratedForPlayer,
      candidatesAfterHardFilters,
      candidates: retainedCandidates,
      reasons: origin.reasons,
    });
    firstPlayerCompletedAt ??= performance.now();
    emitLiveDiagnostics?.({
      event: "player-finished",
      playerIndex,
      durationMs: performance.now() - playerStartedAt,
      earlyHardRejectedCandidates,
      earlyClassRejectedCandidates: candidateHistoryBuild.earlyClassRejectedCandidates,
      earlyLevelRejectedCandidates,
      earlyBaseRejectedCandidates,
      fullCandidatesMaterialized,
      fullCandidatesEvaluated: candidates.length,
      finalCandidateCount: candidates.length,
    });
    input.onProgress?.({ current: index + 1, total: newHistories.length });
    emitLiveDiagnostics?.({ event: "progress-emitted", playerIndex });
    const processedPlayers = index + 1;
    if (
      processedPlayers % PLAYER_RETENTION_DIAGNOSTIC_INTERVAL === 0 ||
      processedPlayers === newHistories.length
    ) {
      input.onLiveDiagnostics?.({
        event: "player-retention-checkpoint",
        processedPlayers,
        corridorHistoriesConsideredCumulative,
        generatedCandidatesCumulative,
        earlyHardRejectedCandidatesCumulative,
        earlyClassRejectedCandidatesCumulative,
        earlyLevelRejectedCandidatesCumulative,
        earlyBaseRejectedCandidatesCumulative,
        fullCandidatesMaterializedCumulative,
        fullCandidatesEvaluatedCumulative,
        retainedCandidatesCumulative,
        discardedAfterEvaluationCumulative,
        actionableCandidatesCumulative,
        rejectedCandidatesEvaluated,
        weakCandidatesEvaluated,
        rejectedCandidatesRetained: rejectedCandidatesRetainedCumulative,
        weakCandidatesRetained: weakCandidatesRetainedCumulative,
        plausibleCandidatesRetained: plausibleCandidatesRetainedCumulative,
        strongCandidatesRetained: strongCandidatesRetainedCumulative,
        anchoredCandidatesRetained: anchoredCandidatesRetainedCumulative,
        evidenceEntriesGenerated,
        evidenceEntriesRetained,
        maxCandidatesForOnePlayer,
        medianRetainedCandidatesPerPlayer: percentile(retainedCandidateCounts, 50),
        ...readHeapSnapshotMb(),
      });
    }
  });
  const playerLoopFinishedAt = performance.now();
  const pipelineDiagnostics = pipelineAudit
    ? buildPipelineDiagnostics({
        audit: pipelineAudit,
        corridorHistoriesConsidered: corridorHistoriesConsideredCumulative,
        earlyClassRejectedCandidates: earlyClassRejectedCandidatesCumulative,
        earlyLevelRejectedCandidates: earlyLevelRejectedCandidatesCumulative,
        earlyBaseRejectedCandidates: earlyBaseRejectedCandidatesCumulative,
        fullCandidatesMaterialized: fullCandidatesMaterializedCumulative,
        fullCandidatesEvaluated: fullCandidatesEvaluatedCumulative,
        candidatesAfterHardCompatibility: candidatesAfterHardCompatibilityCounts.reduce(
          (sum, count) => sum + count,
          0,
        ),
        actionableCandidates: actionableCandidatesCumulative,
        retainedCandidates: retainedCandidatesCumulative,
        materializedRejectReasonCounts,
        materializedClassificationCounts,
      })
    : undefined;

  const highConfidenceByOldIdentifier = new Map<string, PlayerFusionPlayerResult[]>();
  initialResults.forEach((result) => {
    if (result.status !== "high-confidence") return;
    const highConfidenceCandidate = selectPlayerFusionReadyCandidates(result)[0];
    if (!highConfidenceCandidate) return;

    const key = normalizeIdentifierKey(highConfidenceCandidate.oldIdentifier);
    highConfidenceByOldIdentifier.set(key, [...(highConfidenceByOldIdentifier.get(key) ?? []), result]);
  });

  highConfidenceByOldIdentifier.forEach((results) => {
    if (results.length < 2) return;
    results.forEach((result) => {
      result.status = "conflict";
      result.reasons.push("one historical identifier is a high-confidence candidate for multiple new players");
    });
  });

  const finishedAt = performance.now();
  input.onDiagnostics?.({
    historicalObservationCount: input.historicalObservations.length,
    currentObservationCount: input.newObservations.length,
    historicalHistoryCount: histories.length,
    currentHistoryCount: newHistories.length,
    historyPreparationMs: historiesPreparedAt - startedAt,
    timeToFirstPlayerStartMs:
      firstPlayerStartedAt == null ? null : firstPlayerStartedAt - startedAt,
    timeToFirstPlayerCompletedMs:
      firstPlayerCompletedAt == null ? null : firstPlayerCompletedAt - startedAt,
    playerLoopMs: playerLoopFinishedAt - playerLoopStartedAt,
    totalMs: finishedAt - startedAt,
    corridorHistoriesConsidered: summarizeCandidateCounts(corridorHistoriesConsideredCounts),
    earlyHardRejectedCandidates: summarizeCandidateCounts(earlyHardRejectedCandidateCounts),
    earlyClassRejectedCandidates: summarizeCandidateCounts(earlyClassRejectedCandidateCounts),
    earlyLevelRejectedCandidates: summarizeCandidateCounts(earlyLevelRejectedCandidateCounts),
    earlyBaseRejectedCandidates: summarizeCandidateCounts(earlyBaseRejectedCandidateCounts),
    fullCandidatesMaterialized: summarizeCandidateCounts(fullCandidatesMaterializedCounts),
    fullCandidatesEvaluated: summarizeCandidateCounts(fullCandidatesEvaluatedCounts),
    candidatesGeneratedInitially: summarizeCandidateCounts(candidatesGeneratedInitially),
    candidatesAfterHardCompatibility: summarizeCandidateCounts(candidatesAfterHardCompatibilityCounts),
    candidatesAfterHardFilters: summarizeCandidateCounts(candidatesAfterHardFilterCounts),
    actionableCandidates: summarizeCandidateCounts(actionableCandidateCounts),
    pipeline: pipelineDiagnostics,
  });

  return { results: initialResults };
};
