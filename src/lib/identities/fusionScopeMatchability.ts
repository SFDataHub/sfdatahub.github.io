import type { FusionIdentityAnalysisScope } from "./fusionIdentityScopes";

export type FusionIdentityScopeMatchabilityObservation = {
  serverCode: string | null | undefined;
  timestampMs: number;
  playerCount?: number;
  guildCount?: number;
  playerObservationCount?: number;
  guildObservationCount?: number;
};

export type FusionIdentityScopeLocalMatchability = {
  isLocallyMatchable: boolean;
  hasHistoricalObservations: boolean;
  hasCurrentTargetObservations: boolean;
};

export class FusionIdentityScopeNotLocallyMatchableError extends Error {
  constructor(
    targetServerCode: string,
    readonly matchability?: FusionIdentityScopeLocalMatchability,
  ) {
    super(`Fusion scope ${targetServerCode} is not locally matchable.`);
    this.name = "FusionIdentityScopeNotLocallyMatchableError";
  }
}

const compareNumbers = (left: number, right: number) => left - right;

const parseEffectiveDateTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const hasObservationData = (
  observation: FusionIdentityScopeMatchabilityObservation,
) => {
  const playerCount =
    observation.playerObservationCount ?? observation.playerCount;
  const guildCount = observation.guildObservationCount ?? observation.guildCount;
  if (playerCount == null && guildCount == null) return true;
  return (playerCount ?? 0) > 0 || (guildCount ?? 0) > 0;
};

export const getFusionIdentityScopeLocalMatchability = (
  scope: FusionIdentityAnalysisScope,
  observations: readonly FusionIdentityScopeMatchabilityObservation[],
): FusionIdentityScopeLocalMatchability => {
  const lineageServerCodes = new Set(
    scope.lineageServerCodes.length
      ? scope.lineageServerCodes
      : [...scope.originServerCodes, scope.targetServerCode],
  );
  const scopedObservations = observations.filter(
    (observation) =>
      observation.serverCode &&
      lineageServerCodes.has(observation.serverCode) &&
      hasObservationData(observation),
  );
  const historicalObservations = scopedObservations.filter(
    (observation) => observation.serverCode !== scope.targetServerCode,
  );
  const currentTargetObservations = scopedObservations.filter(
    (observation) => observation.serverCode === scope.targetServerCode,
  );
  const effectiveDateTimestamp = parseEffectiveDateTimestamp(scope.effectiveDate);

  if (effectiveDateTimestamp != null) {
    const hasHistoricalObservations = historicalObservations.some(
      (observation) => observation.timestampMs < effectiveDateTimestamp,
    );
    const hasCurrentTargetObservations = currentTargetObservations.some(
      (observation) => observation.timestampMs >= effectiveDateTimestamp,
    );
    return {
      hasHistoricalObservations,
      hasCurrentTargetObservations,
      isLocallyMatchable:
        scope.analysisSupported &&
        scope.temporalStatus !== "future" &&
        hasHistoricalObservations &&
        hasCurrentTargetObservations,
    };
  }

  const historicalTimestamps = historicalObservations
    .map((observation) => observation.timestampMs)
    .sort(compareNumbers);
  const currentTimestamps = currentTargetObservations
    .map((observation) => observation.timestampMs)
    .sort(compareNumbers);
  const hasOrderedPair = historicalTimestamps.some((historicalTimestamp) =>
    currentTimestamps.some((currentTimestamp) => historicalTimestamp < currentTimestamp),
  );

  return {
    hasHistoricalObservations: hasOrderedPair,
    hasCurrentTargetObservations: hasOrderedPair,
    isLocallyMatchable:
      scope.analysisSupported &&
      scope.temporalStatus !== "future" &&
      hasOrderedPair,
  };
};
