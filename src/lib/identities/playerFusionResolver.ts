import { getFusionOrigins, resolveServer } from "../servers/serverResolver";

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

export type PlayerFusionRejectReason = "different-class" | "level-drop" | "origin-mismatch";

export type PlayerFusionEvidence = {
  originMatches: boolean | null;
  sameClass: boolean | null;
  levelConsistent: boolean | null;
  exactName: boolean;
  fusionBaseName: boolean;
  sameGuild: boolean | null;
};

export type PlayerFusionObservation = {
  identifier: string;
  server: string | null;
  timestamp: number;
  name: string;
  classId: string | null;
  level: number | null;
  guildIdentifier?: string | null;
  guildName?: string | null;
  originNumericId?: number | null;
  fusionSuffixServer?: string | null;
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
  candidatesBeforeHardFilters: number;
  candidatesAfterHardFilters: number;
  candidates: PlayerFusionCandidate[];
  reasons: string[];
};

export type PlayerFusionResolverInput = {
  historicalObservations: PlayerFusionObservation[];
  newObservations: PlayerFusionObservation[];
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

const compareByTimestamp = (left: PlayerFusionObservation, right: PlayerFusionObservation) =>
  left.timestamp - right.timestamp || normalizeIdentifierKey(left.identifier).localeCompare(normalizeIdentifierKey(right.identifier));

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

const selectComparisonObservation = (history: PlayerHistory, newObservation: PlayerFusionObservation) => {
  const eligible = history.observations
    .filter((observation) => observation.timestamp < newObservation.timestamp)
    .sort((left, right) => right.timestamp - left.timestamp);
  const candidates = eligible.length ? eligible : [...history.observations].sort((left, right) => right.timestamp - left.timestamp);

  const levelCompatible = candidates.find(
    (observation) =>
      observation.level == null || newObservation.level == null || newObservation.level >= observation.level,
  );

  return {
    observation: levelCompatible ?? candidates[0] ?? null,
    latestObservationHadLevelDrop: Boolean(
      candidates[0]?.level != null && newObservation.level != null && newObservation.level < candidates[0].level,
    ),
    hasAnyLevelCompatibleObservation: Boolean(levelCompatible),
  };
};

const createCandidate = (
  history: PlayerHistory,
  newObservation: PlayerFusionObservation,
  originServers: Set<string>,
): PlayerFusionCandidate => {
  const notes: string[] = [];
  const rejectReasons: PlayerFusionRejectReason[] = [];
  const oldServer = history.server;

  if (!oldServer || !originServers.has(oldServer)) {
    rejectReasons.push("origin-mismatch");
  }

  const selected = selectComparisonObservation(history, newObservation);
  const oldObservation = selected.observation;
  if (selected.latestObservationHadLevelDrop && selected.hasAnyLevelCompatibleObservation) {
    notes.push("latest historical observation had a level drop; older compatible observation used");
  }

  const oldClass = normalizeClassId(oldObservation?.classId);
  const newClass = normalizeClassId(newObservation.classId);
  const sameClass = oldClass && newClass ? oldClass === newClass : null;
  if (sameClass === false) rejectReasons.push("different-class");

  const levelConsistent =
    oldObservation?.level != null && newObservation.level != null ? newObservation.level >= oldObservation.level : null;
  if (levelConsistent === false) rejectReasons.push("level-drop");

  const oldName = normalizeComparableText(oldObservation?.name);
  const newName = normalizeComparableText(newObservation.name);
  const suffix = readFusionSuffix(newObservation.name, newObservation.fusionSuffixServer);
  const baseName = normalizeComparableText(suffix?.baseName ?? "");
  const oldGuild = oldObservation ? getGuildKey(oldObservation) : "";
  const newGuild = getGuildKey(newObservation);

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
      exactName: Boolean(oldName && newName && oldName === newName),
      fusionBaseName: Boolean(oldName && baseName && oldName === baseName),
      sameGuild: oldGuild && newGuild ? oldGuild === newGuild : null,
    },
    rejected: rejectReasons.length > 0,
    rejectReasons,
    notes,
  };
};

const classifyPlayerResult = (
  originSource: PlayerFusionOriginSource,
  candidates: PlayerFusionCandidate[],
): PlayerFusionResultStatus => {
  if (originSource === "currentServerNoPredecessor") return "no-predecessor";

  const viable = candidates.filter((candidate) => !candidate.rejected);
  if (!viable.length) return "unresolved";

  const strong = viable.filter((candidate) => candidate.evidence.exactName || candidate.evidence.fusionBaseName);
  if (strong.length === 1) return "high-confidence";
  if (strong.length > 1 || viable.length > 1) return "ambiguous";
  return "candidate";
};

export const resolvePlayerFusions = (input: PlayerFusionResolverInput): PlayerFusionResolverResult => {
  const histories = buildHistories(input.historicalObservations);
  const initialResults = input.newObservations.map((newObservation): PlayerFusionPlayerResult => {
    const origin = resolveOriginsForNewObservation(newObservation);
    const originServers = new Set(origin.resolvedOriginServers);
    const matchingHistories = originServers.size
      ? histories.filter((history) => history.server && originServers.has(history.server))
      : [];
    const candidates = matchingHistories.map((history) => createCandidate(history, newObservation, originServers));
    const candidatesAfterHardFilters = candidates.filter((candidate) => !candidate.rejected).length;

    return {
      newIdentifier: newObservation.identifier,
      currentServer: origin.currentServer,
      resolvedOriginServers: origin.resolvedOriginServers,
      originSource: origin.originSource,
      status: classifyPlayerResult(origin.originSource, candidates),
      candidatesBeforeHardFilters: matchingHistories.length,
      candidatesAfterHardFilters,
      candidates,
      reasons: origin.reasons,
    };
  });

  const highConfidenceByOldIdentifier = new Map<string, PlayerFusionPlayerResult[]>();
  initialResults.forEach((result) => {
    if (result.status !== "high-confidence") return;
    const highConfidenceCandidate = result.candidates.find(
      (candidate) => !candidate.rejected && (candidate.evidence.exactName || candidate.evidence.fusionBaseName),
    );
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
