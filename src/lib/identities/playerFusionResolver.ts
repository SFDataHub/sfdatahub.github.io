import { classifyPlayerLevelProgression, type PlayerLevelProgressionEvidence } from "./playerLevelProgressionEvidence";
import { getClassMetaById } from "../../data/classes";
import { getFusionLevelCompensation } from "../servers/fusionCompensation";
import { getFusionEvent, getFusionOrigins, resolveServer } from "../servers/serverResolver";
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
  candidatesGeneratedInitially: number;
  candidatesAfterHardCompatibility: number;
  candidatesAfterSemanticEvaluation: number;
  reliableHistoricalLookup: PlayerFusionReliableHistoricalLookup | null;
};

export type PlayerFusionResolverInput = {
  historicalObservations: PlayerFusionObservation[];
  newObservations: PlayerFusionObservation[];
  levelRegressionMode?: PlayerFusionLevelRegressionMode;
  enableLevelProgressionEvidence?: boolean;
  enablePortraitEvidence?: boolean;
};

export type PlayerFusionResolverResult = {
  results: PlayerFusionPlayerResult[];
};

type PlayerHistory = {
  identifier: string;
  server: string | null;
  observations: PlayerFusionObservation[];
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

  const match = name.match(/^(.*?)\s+\((s\d+(?:_?eu|eu))\)$/i);
  if (!match?.[1] || !match[2]) return null;

  const server = resolveServerCode(match[2]);
  return server ? { baseName: match[1].trim(), server } : null;
};

const resolveOriginsForNewObservation = (observation: PlayerFusionObservation) => {
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

    if (originServer) {
      return {
        currentServer,
        originSource: "numeric" as const,
        resolvedOriginServers: [originServer],
        reasons: [`numeric origin resolved to ${originServer}`],
      };
    }
  }

  const suffix = readFusionSuffix(observation.name, observation.fusionSuffixServer);
  if (suffix?.server) {
    return {
      currentServer,
      originSource: "fusionSuffix" as const,
      resolvedOriginServers: [suffix.server],
      reasons: [`fusion name suffix resolved to ${suffix.server}`],
    };
  }

  if (currentServer) {
    const lineageOrigins = getFusionOrigins(currentServer).map((server) => server.code);
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

const resolveOriginsForNewHistory = (history: PlayerHistory) => {
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

    if (originServer) {
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
    .find((entry) => entry?.server);
  if (suffixObservation?.server) {
    return {
      currentServer,
      originSource: "fusionSuffix" as const,
      resolvedOriginServers: [suffixObservation.server],
      reasons: [`fusion name suffix resolved to ${suffixObservation.server} from player history`],
    };
  }

  if (latest) return resolveOriginsForNewObservation(latest);

  return {
    currentServer,
    originSource: "unknown" as const,
    resolvedOriginServers: [],
    reasons: ["origin could not be resolved"],
  };
};

const uniqueNormalizedNames = (observations: PlayerFusionObservation[]) =>
  new Set(observations.map((observation) => normalizeComparableText(observation.name)).filter(Boolean));

const fusionBaseNames = (observations: PlayerFusionObservation[]) =>
  new Set(
    observations
      .map((observation) => normalizeComparableText(readFusionSuffix(observation.name, observation.fusionSuffixServer)?.baseName ?? ""))
      .filter(Boolean),
  );

const valuesOverlap = <T>(left: Set<T>, right: Set<T>) => [...left].some((value) => right.has(value));

const hasHardCompatibilityRejection = (candidate: PlayerFusionCandidate) =>
  candidate.rejectReasons.some((reason) => isPlayerFusionHardContradictionReason(reason));

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
      : currentByTime.find((observation) => observation.timestamp >= fusionEventTimestamp) ?? null;
  const earliestReliableCurrent =
    currentByTime.find(
      (observation) =>
        input.isReliable(observation) &&
        (fusionEventTimestamp == null || observation.timestamp >= fusionEventTimestamp),
    ) ?? null;
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
  history: PlayerHistory,
  newHistory: PlayerHistory,
  originServers: Set<string>,
  levelRegressionMode: PlayerFusionLevelRegressionMode,
  enableLevelProgressionEvidence: boolean,
): PlayerFusionCandidate => {
  const notes: string[] = [];
  const rejectReasons: PlayerFusionRejectReason[] = [];
  const oldServer = history.server;
  const newServer = resolveServerCode(latestObservation(newHistory)?.server ?? newHistory.server);
  const fusionEventTimestamp = parseFusionEventTimestamp(
    oldServer && newServer ? getFusionEvent(oldServer, newServer)?.effectiveDate ?? null : null,
  );

  if (!oldServer || !originServers.has(oldServer)) {
    rejectReasons.push("origin-mismatch");
  }

  const selected = selectLevelComparison(history, newHistory, levelRegressionMode, fusionEventTimestamp);
  const oldObservation = selected.observation;
  notes.push(...selected.notes);

  const sameClass = classEvidence(history.observations, newHistory.observations);
  if (sameClass === false) rejectReasons.push("different-class");

  const levelConsistent = selected.levelConsistent;
  if (levelConsistent === false && selected.hasReliableLevelBoundary) {
    rejectReasons.push(levelRegressionMode === "strict-boundary" ? "level-regression" : "level-drop");
    if (levelRegressionMode === "strict-boundary") {
      notes.push("latest reliable historical level is higher than earliest reliable post-fusion level");
    }
  }

  const oldNames = uniqueNormalizedNames(history.observations);
  const newNames = uniqueNormalizedNames(newHistory.observations);
  const newBaseNames = fusionBaseNames(newHistory.observations);
  const oldGuild = oldObservation ? getGuildKey(oldObservation) : "";
  const newGuild = selected.newObservation ? getGuildKey(selected.newObservation) : "";
  const exactName = valuesOverlap(oldNames, newNames);
  const fusionBaseName = valuesOverlap(oldNames, newBaseNames);
  const sameGuild = oldGuild && newGuild ? oldGuild === newGuild : null;
  const elapsedDays =
    selected.observation && selected.newObservation
      ? Math.max(0, (selected.newObservation.timestamp - selected.observation.timestamp) / (24 * 60 * 60 * 1000))
      : null;
  const compensation = oldServer && newServer ? getFusionLevelCompensation(oldServer, newServer) : null;
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
  const baseBoundary = selectReliableFusionBoundaryObservations({
    historicalObservations: history.observations,
    currentObservations: newHistory.observations,
    fusionEventTimestamp,
    isReliable: (observation) => hasReliableSemanticVector(observation, "baseAttributes"),
  });
  const oldBaseVector = semanticVectorFromObservation(baseBoundary.historicalObservation, "baseAttributes");
  const newBaseVector = semanticVectorFromObservation(baseBoundary.currentObservation, "baseAttributes");
  const baseAttributesConsistent = compareSemanticVector(oldBaseVector, newBaseVector);
  if (baseAttributesConsistent === false) rejectReasons.push("base-stat-regression");
  const baseFingerprint = createBaseFingerprint(
    oldBaseVector,
    newBaseVector,
    baseBoundary.historicalObservation?.classId ?? oldObservation?.classId ?? selected.newObservation?.classId,
  );
  const fortressContinuity = compareSemanticVector(
    findSemanticVector(history.observations, "fortress", "latest"),
    findSemanticVector(newHistory.observations, "fortress", "earliest"),
  );
  const petContinuity = compareSemanticVector(
    findSemanticVector(history.observations, "pets", "latest"),
    findSemanticVector(newHistory.observations, "pets", "earliest"),
  );
  const portraitComparison = comparePlayerPortraitAppearance(
    findPortraitSummary(history.observations, "latest"),
    findPortraitSummary(newHistory.observations, "earliest"),
  );
  const portraitContinuity = portraitComparison.comparable
    ? portraitComparison.exact
    : null;
  const entries: PlayerFusionEvidenceEntry[] = [];
  pushEvidence(entries, {
    type: "origin-compatibility",
    strength: oldServer && originServers.has(oldServer) ? "neutral" : "hardContradiction",
    availability: oldServer ? "available" : "unavailable",
    label: oldServer && originServers.has(oldServer) ? "Origin compatible" : "Origin contradiction",
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
  const classification = classifyEvidenceEntries(entries, rejectReasons);

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
      originMatches: oldServer ? originServers.has(oldServer) : null,
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
  histories: PlayerHistory[],
  newHistory: PlayerHistory,
  originServers: Set<string>,
): PlayerFusionReliableHistoricalLookup | null => {
  const suffix = sortDescendingByTimestamp(newHistory.observations)
    .map((observation) => readFusionSuffix(observation.name, observation.fusionSuffixServer))
    .find((entry) => entry?.server && entry.baseName);
  if (!suffix?.server || !originServers.has(suffix.server)) return null;

  const normalizedBaseName = normalizeComparableText(suffix.baseName);
  if (!normalizedBaseName) return null;

  const newClasses = new Set(newHistory.observations.map((observation) => normalizeClassId(observation.classId)).filter(Boolean));
  const matchingHistories = histories.filter(
    (history) =>
      resolveServerCode(history.server) === suffix.server &&
      history.observations.some((observation) => normalizeComparableText(observation.name) === normalizedBaseName),
  );
  const compatibleClassHistories = matchingHistories.filter((history) => {
    if (!newClasses.size) return false;
    const oldClasses = new Set(history.observations.map((observation) => normalizeClassId(observation.classId)).filter(Boolean));
    if (!oldClasses.size) return false;
    return valuesOverlap(oldClasses, newClasses);
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
  const histories = buildHistories(input.historicalObservations);
  const newHistories = buildHistories(input.newObservations);
  const levelRegressionMode = input.levelRegressionMode ?? "strict-boundary";
  const enableLevelProgressionEvidence = input.enableLevelProgressionEvidence ?? true;
  const enablePortraitEvidence = input.enablePortraitEvidence ?? true;
  const initialResults = newHistories.map((newHistory): PlayerFusionPlayerResult => {
    const latest = latestObservation(newHistory) ?? newHistory.observations[0];
    const origin = resolveOriginsForNewHistory(newHistory);
    const originServers = new Set(origin.resolvedOriginServers);
    const matchingHistories = originServers.size
      ? histories.filter((history) => history.server && originServers.has(history.server))
      : [];
    const candidates = applyLevelProgressionCleanup(
      applyPortraitEvidence(
        matchingHistories.map((history) =>
          createCandidate(history, newHistory, originServers, levelRegressionMode, enableLevelProgressionEvidence),
        ),
        enablePortraitEvidence,
      ),
    );
    const candidatesAfterHardCompatibility = candidates.filter((candidate) => !hasHardCompatibilityRejection(candidate)).length;
    const candidatesAfterHardFilters = candidates.filter((candidate) => !candidate.rejected).length;

    return {
      newIdentifier: latest?.identifier ?? newHistory.identifier,
      currentServer: origin.currentServer,
      resolvedOriginServers: origin.resolvedOriginServers,
      originSource: origin.originSource,
      status: classifyPlayerResult(origin.originSource, candidates),
      diagnostics: {
        historicalPoolSize: matchingHistories.length,
        candidatesGeneratedInitially: matchingHistories.length,
        candidatesAfterHardCompatibility,
        candidatesAfterSemanticEvaluation: candidatesAfterHardFilters,
        reliableHistoricalLookup: buildReliableHistoricalLookup(histories, newHistory, originServers),
      },
      candidatesBeforeHardFilters: matchingHistories.length,
      candidatesAfterHardFilters,
      candidates,
      reasons: origin.reasons,
    };
  });

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

  return { results: initialResults };
};
