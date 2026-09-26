import { getFusionOrigins, resolveServer } from "../servers/serverResolver";

export type GuildFusionStatus =
  | "autoEligible"
  | "reviewRequired"
  | "unresolved"
  | "noHistoricalData"
  | "split"
  | "convergence";

export type GuildFusionRelationType = "identityContinuity" | "memberMigration";
export type GuildFusionEvidenceStrength =
  | "neutral"
  | "weakSupport"
  | "support"
  | "strongSupport"
  | "identityAnchor"
  | "warning";
export type GuildFusionCandidateClassification = "rejected" | "weak" | "plausible" | "strong" | "anchored";
export type GuildFusionEvidenceEntryType =
  | "exact-name"
  | "unique-exact-name"
  | "fusion-base-name"
  | "same-coa"
  | "member-flow"
  | "structural-rename"
  | "leader-continuity"
  | "officer-continuity"
  | "leadership-core"
  | "guild-progression"
  | "assignment";
export type GuildFusionEvidenceAvailability = "available" | "unavailable" | "partial";

export type GuildFusionEvidenceEntry = {
  type: GuildFusionEvidenceEntryType;
  strength: GuildFusionEvidenceStrength;
  label: string;
  source?: "name" | "coa" | "members" | "leadership" | "progression" | "assignment";
  availability?: GuildFusionEvidenceAvailability;
  details?: string;
};

export type GuildFusionProgressionSnapshot = {
  treasure?: number | null;
  instructor?: number | null;
  knights?: number | null;
  raid?: number | null;
  portalFloor?: number | null;
  hydra?: number | null;
  guildPet?: number | null;
  honor?: number | null;
  rank?: number | null;
};

export type GuildFusionObservation = {
  guildIdentifier: string;
  serverCode: string | null;
  timestamp: number;
  name: string | null;
  memberIdentifiers: string[];
  memberCount: number | null;
  coa?: string | null;
  leaderIdentifier?: string | null;
  officerIdentifiers?: string[];
  progression?: GuildFusionProgressionSnapshot | null;
};

export type GuildFusionPlayerMatch = {
  oldIdentifier: string;
  oldName: string | null;
  newIdentifier: string;
  newName: string | null;
};

export type GuildFusionMatchedMember = {
  oldIdentifier: string;
  oldName: string | null;
  newIdentifier: string;
  newName: string | null;
};

export type GuildFusionFlowPeer = {
  guildIdentifier: string;
  name: string | null;
  serverCode: string | null;
  matchedMemberCount: number;
};

export type GuildFusionFlowEvidence = {
  matchedMemberCount: number;
  oldMappedMemberCount: number;
  newMappedMemberCount: number;
  oldShare: number;
  newShare: number;
  oldTopDestination: GuildFusionFlowPeer | null;
  oldSecondDestination: GuildFusionFlowPeer | null;
  newTopSource: GuildFusionFlowPeer | null;
  newSecondSource: GuildFusionFlowPeer | null;
  isOldTopDestination: boolean;
  isNewTopSource: boolean;
  isUniqueOldTop: boolean;
  isUniqueNewTop: boolean;
  mutualDominant: boolean;
};

export type GuildFusionConflictEvidence = {
  relevant: boolean;
  topCount: number;
  secondCount: number;
  topGuildIdentifier: string | null;
  secondGuildIdentifier: string | null;
};

export type GuildFusionLeadershipEvidence = {
  oldLeaderIdentifier: string | null;
  newLeaderIdentifier: string | null;
  oldLeaderResolved: boolean;
  newLeaderResolved: boolean;
  sameLogicalLeader: boolean | null;
  oldOfficerCount: number;
  newOfficerCount: number;
  oldOfficerResolvedCount: number;
  newOfficerResolvedCount: number;
  continuedOfficers: number;
  leadershipCoreOverlap: number;
};

export type GuildFusionCandidate = GuildFusionFlowEvidence & {
  relationType: "identityContinuity";
  oldGuildIdentifier: string;
  oldServer: string | null;
  oldName: string | null;
  oldMemberCount: number | null;
  oldCoa: string | null;
  newGuildIdentifier: string;
  newName: string | null;
  newMemberCount: number | null;
  exactName: boolean;
  uniqueExactName: boolean;
  fusionBaseName: boolean;
  fusionBaseNameOrigin: string | null;
  sameCoA: boolean;
  structuralRename: boolean;
  structuralSecondSourceCount: number;
  structuralSourceRatio: number | null;
  structuralSourceDelta: number;
  leadership: GuildFusionLeadershipEvidence;
  classification: GuildFusionCandidateClassification;
  evidenceEntries: GuildFusionEvidenceEntry[];
  actionable: boolean;
  assignmentConflict: boolean;
  reservedByReadyAssignment: boolean;
  relevantCompetitor: boolean;
  dominantWinner: boolean;
  matchedMembers: GuildFusionMatchedMember[];
  splitEvidence: GuildFusionConflictEvidence;
  convergenceEvidence: GuildFusionConflictEvidence;
  autoEligible: boolean;
  reviewRequired: boolean;
};

export type GuildFusionMigrationEdge = GuildFusionFlowEvidence & {
  relationType: "memberMigration";
  oldGuildIdentifier: string;
  oldServer: string | null;
  oldName: string | null;
  newGuildIdentifier: string;
  newName: string | null;
  matchedPlayers: GuildFusionMatchedMember[];
  matchedMembers: GuildFusionMatchedMember[];
};

export type GuildFusionFlowSummary = {
  sources: GuildFusionFlowPeer[];
  destinations: GuildFusionFlowPeer[];
  hasSplitEvidence: boolean;
  hasConvergenceEvidence: boolean;
};

export type GuildFusionReliableHistoricalLookup = {
  type: "fusion-base-name";
  originServer: string;
  baseName: string;
  matchingObservationCount: number;
};

export type GuildFusionGuildResult = {
  newGuild: GuildFusionObservation;
  status: GuildFusionStatus;
  identityCandidates: GuildFusionCandidate[];
  memberMigrationEdges: GuildFusionMigrationEdge[];
  flowSummary: GuildFusionFlowSummary;
  splitCandidate: boolean;
  convergenceCandidate: boolean;
  candidateCount: number;
  candidates: GuildFusionCandidate[];
  reasons: string[];
  reliableHistoricalLookup: GuildFusionReliableHistoricalLookup | null;
};

export type GuildFusionResolverInput = {
  historicalGuildObservations: GuildFusionObservation[];
  newGuildObservations: GuildFusionObservation[];
  highConfidencePlayerMatches: GuildFusionPlayerMatch[];
  scope?: GuildFusionScopeContext;
  onProgress?: (progress: GuildFusionResolverProgress) => void;
  onDiagnostics?: (diagnostics: GuildFusionResolverDiagnostics) => void;
};

export type GuildFusionResolverProgress = {
  current: number;
  total: number;
};

export type GuildFusionResolverResult = {
  results: GuildFusionGuildResult[];
};

export type GuildFusionResolverDiagnostics = {
  currentGuilds: number;
  historicalGuildHistories: number;
  historicalGuildsBeforeBoundary: number;
  guildCandidatesGenerated: number;
  guildCandidatesEvaluated: number;
  guildCandidatesRetained: number;
  memberFlowCalls: number;
  memberFlowTotalMs: number;
  memberComparisons: number;
  flowCount: number;
};

type GuildHistory = {
  guildIdentifier: string;
  observations: GuildFusionObservation[];
};

export type GuildFusionScopeContext = {
  targetServerCode: string;
  historicalServerCodes: string[];
};

type Flow = {
  oldGuild: GuildFusionObservation;
  newGuild: GuildFusionObservation;
  matchedMembers: GuildFusionMatchedMember[];
};

type RelationDraft = {
  newGuild: GuildFusionObservation;
  identityCandidates: GuildFusionCandidate[];
  memberMigrationEdges: GuildFusionMigrationEdge[];
};

const SMALL_MIGRATION_MAX_MATCHED_MEMBERS = 2;
const STRONG_FLOW_MIN_MATCHED_MEMBERS = 3;
const SAME_COA_RENAME_MIN_MATCHED_MEMBERS = 10;
const STRUCTURAL_RENAME_MIN_MATCHED_MEMBERS = 10;
const STRUCTURAL_RENAME_MIN_SHARE = 0.29;
const STRUCTURAL_RENAME_MIN_SOURCE_RATIO = 2;
const STRUCTURAL_RENAME_MIN_SOURCE_DELTA = 8;
const RELEVANT_SECONDARY_FLOW_MIN_MATCHED_MEMBERS = 3;
const CLASSIFICATION_RANK: Record<GuildFusionCandidateClassification, number> = {
  rejected: 0,
  weak: 1,
  plausible: 2,
  strong: 3,
  anchored: 4,
};

export const getGuildFusionClassificationRank = (classification: GuildFusionCandidateClassification) =>
  CLASSIFICATION_RANK[classification] ?? 0;

export const isGuildFusionActionableIdentityCandidate = (candidate: GuildFusionCandidate) =>
  candidate.actionable && (candidate.classification === "plausible" || candidate.classification === "strong" || candidate.classification === "anchored");

export const isGuildFusionReadyCandidate = (candidate: GuildFusionCandidate) =>
  isGuildFusionActionableIdentityCandidate(candidate) &&
  (candidate.classification === "strong" || candidate.classification === "anchored") &&
  !candidate.assignmentConflict &&
  !candidate.reservedByReadyAssignment;

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeNameKey = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFC")
    .toLowerCase();

const resolveServerCode = (value: string | number | null | undefined) => resolveServer(value)?.code ?? null;

const readGuildFusionSuffix = (name: string | null | undefined) => {
  const text = String(name ?? "").replace(/\u00a0/g, " ").trim();
  if (!text) return null;
  const match = /^(.*?)\s+\(([^()]+)\)$/.exec(text);
  if (!match?.[1] || !match[2]) return null;

  const server = resolveServerCode(match[2]);
  return server ? { baseName: match[1].trim(), server } : null;
};

const validFusionBaseNameServers = (
  newServer: string,
  scope: GuildFusionScopeContext | undefined,
) =>
  new Set(
    scope?.historicalServerCodes.length
      ? scope.historicalServerCodes
      : getFusionOrigins(newServer).map((server) => server.code),
  );

const getValidFusionBaseNameEvidence = (
  oldGuild: GuildFusionObservation,
  newGuild: GuildFusionObservation,
  scope?: GuildFusionScopeContext,
) => {
  const suffix = readGuildFusionSuffix(newGuild.name);
  const newServer = resolveServerCode(newGuild.serverCode);
  const oldServer = resolveServerCode(oldGuild.serverCode);
  if (!suffix || !newServer || !oldServer) return null;

  const validOriginServers = validFusionBaseNameServers(newServer, scope);
  if (!validOriginServers.has(suffix.server) || suffix.server !== oldServer) return null;
  if (normalizeNameKey(suffix.baseName) !== normalizeNameKey(oldGuild.name)) return null;

  return suffix;
};

const getReliableFusionBaseNameLookup = (
  newGuild: GuildFusionObservation,
  oldGuilds: GuildFusionObservation[],
  scope?: GuildFusionScopeContext,
): GuildFusionReliableHistoricalLookup | null => {
  const suffix = readGuildFusionSuffix(newGuild.name);
  const newServer = resolveServerCode(newGuild.serverCode);
  if (!suffix || !newServer) return null;

  const validOriginServers = validFusionBaseNameServers(newServer, scope);
  if (!validOriginServers.has(suffix.server)) return null;

  const matchingObservationCount = oldGuilds.filter(
    (oldGuild) =>
      resolveServerCode(oldGuild.serverCode) === suffix.server &&
      normalizeNameKey(oldGuild.name) === normalizeNameKey(suffix.baseName),
  ).length;

  return {
    type: "fusion-base-name",
    originServer: suffix.server,
    baseName: suffix.baseName,
    matchingObservationCount,
  };
};

const createEdgeKey = (oldGuildIdentifier: string, newGuildIdentifier: string) =>
  `${normalizeIdentifierKey(oldGuildIdentifier)}\u0000${normalizeIdentifierKey(newGuildIdentifier)}`;

const buildHistories = (observations: GuildFusionObservation[]) => {
  const histories = new Map<string, GuildHistory>();

  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.guildIdentifier);
    if (!key) return;
    const history = histories.get(key) ?? { guildIdentifier: observation.guildIdentifier, observations: [] };
    history.observations.push(observation);
    histories.set(key, history);
  });

  return [...histories.values()].map((history) => ({
    ...history,
    observations: [...history.observations].sort(
      (left, right) => left.timestamp - right.timestamp || left.guildIdentifier.localeCompare(right.guildIdentifier),
    ),
  }));
};

const selectLatestBefore = (observations: GuildFusionObservation[], timestamp: number) =>
  [...observations]
    .filter((observation) => observation.timestamp < timestamp)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? observations[observations.length - 1] ?? null;

const addLatestMembership = (
  target: Map<string, GuildFusionObservation>,
  guildObservation: GuildFusionObservation,
) => {
  guildObservation.memberIdentifiers.forEach((identifier) => {
    const key = normalizeIdentifierKey(identifier);
    if (!key) return;
    const existing = target.get(key);
    if (!existing || existing.timestamp < guildObservation.timestamp) {
      target.set(key, guildObservation);
    }
  });
};

const buildLatestOldMembership = (histories: GuildHistory[], beforeTimestamp: number) => {
  const membership = new Map<string, GuildFusionObservation>();
  histories.forEach((history) => {
    const observation = selectLatestBefore(history.observations, beforeTimestamp);
    if (observation) addLatestMembership(membership, observation);
  });
  return membership;
};

const buildCurrentMembership = (guilds: GuildFusionObservation[]) => {
  const membership = new Map<string, GuildFusionObservation>();
  guilds.forEach((guild) => addLatestMembership(membership, guild));
  return membership;
};

const buildMatchedMemberEdges = (
  oldMembership: Map<string, GuildFusionObservation>,
  newMembership: Map<string, GuildFusionObservation>,
  matches: GuildFusionPlayerMatch[],
) => {
  const edges = new Map<string, Flow>();

  matches.forEach((match) => {
    const oldGuild = oldMembership.get(normalizeIdentifierKey(match.oldIdentifier));
    const newGuild = newMembership.get(normalizeIdentifierKey(match.newIdentifier));
    if (!oldGuild || !newGuild) return;

    const edgeKey = createEdgeKey(oldGuild.guildIdentifier, newGuild.guildIdentifier);
    const edge = edges.get(edgeKey) ?? { oldGuild, newGuild, matchedMembers: [] };
    edge.matchedMembers.push({
      oldIdentifier: match.oldIdentifier,
      oldName: match.oldName,
      newIdentifier: match.newIdentifier,
      newName: match.newName,
    });
    edges.set(edgeKey, edge);
  });

  return edges;
};

const toPeer = (guild: GuildFusionObservation, matchedMemberCount: number): GuildFusionFlowPeer => ({
  guildIdentifier: guild.guildIdentifier,
  name: guild.name,
  serverCode: guild.serverCode,
  matchedMemberCount,
});

const rankPeers = (peers: GuildFusionFlowPeer[]) =>
  [...peers].sort(
    (left, right) =>
      right.matchedMemberCount - left.matchedMemberCount ||
      left.guildIdentifier.localeCompare(right.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp)[0] ?? null;

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const createLatestHistoricalNameCounts = (oldGuilds: GuildFusionObservation[]) => {
  const counts = new Map<string, number>();
  oldGuilds.forEach((guild) => {
    const nameKey = normalizeNameKey(guild.name);
    if (!nameKey) return;
    counts.set(nameKey, (counts.get(nameKey) ?? 0) + 1);
  });
  return counts;
};

const getStructuralSourceMetrics = (flowEvidence: GuildFusionFlowEvidence) => {
  const secondSourceCount = flowEvidence.newSecondSource?.matchedMemberCount ?? 0;
  const sourceRatio = secondSourceCount > 0 ? flowEvidence.matchedMemberCount / secondSourceCount : null;
  return {
    secondSourceCount,
    sourceRatio,
    sourceDelta: flowEvidence.matchedMemberCount - secondSourceCount,
  };
};

const isStructuralRenameEvidence = (flowEvidence: GuildFusionFlowEvidence, hasDirectIdentityCandidateForCurrent: boolean) => {
  const metrics = getStructuralSourceMetrics(flowEvidence);
  return (
    !hasDirectIdentityCandidateForCurrent &&
    flowEvidence.matchedMemberCount >= STRUCTURAL_RENAME_MIN_MATCHED_MEMBERS &&
    flowEvidence.oldShare >= STRUCTURAL_RENAME_MIN_SHARE &&
    flowEvidence.newShare >= STRUCTURAL_RENAME_MIN_SHARE &&
    flowEvidence.mutualDominant &&
    (metrics.sourceRatio ?? Number.POSITIVE_INFINITY) >= STRUCTURAL_RENAME_MIN_SOURCE_RATIO &&
    metrics.sourceDelta >= STRUCTURAL_RENAME_MIN_SOURCE_DELTA
  );
};

const hasStrongLeadershipCore = (candidate: GuildFusionCandidate) =>
  candidate.leadership.sameLogicalLeader === true &&
  (candidate.leadership.continuedOfficers >= 2 || candidate.leadership.leadershipCoreOverlap >= 3);

const hasSubstantialBidirectionalCore = (candidate: GuildFusionCandidate) =>
  candidate.matchedMemberCount >= STRUCTURAL_RENAME_MIN_MATCHED_MEMBERS &&
  candidate.oldShare >= STRUCTURAL_RENAME_MIN_SHARE &&
  candidate.newShare >= STRUCTURAL_RENAME_MIN_SHARE &&
  candidate.mutualDominant &&
  (candidate.structuralSourceRatio ?? Number.POSITIVE_INFINITY) >= STRUCTURAL_RENAME_MIN_SOURCE_RATIO &&
  candidate.structuralSourceDelta >= STRUCTURAL_RENAME_MIN_SOURCE_DELTA;

const hasDirectNameEvidence = (candidate: GuildFusionCandidate) =>
  candidate.exactName || candidate.uniqueExactName || candidate.fusionBaseName;

const hasRelevantStrongIdentityHypothesis = (candidate: GuildFusionCandidate) =>
  candidate.classification === "anchored" ||
  hasDirectNameEvidence(candidate) ||
  hasStrongLeadershipCore(candidate) ||
  hasSubstantialBidirectionalCore(candidate);

const isRelevantGuildIdentityCompetitor = (winner: GuildFusionCandidate, competitor: GuildFusionCandidate) => {
  if (competitor.assignmentConflict) return true;
  if (normalizeIdentifierKey(competitor.oldGuildIdentifier) === normalizeIdentifierKey(winner.oldGuildIdentifier)) return false;
  const winnerRank = getGuildFusionClassificationRank(winner.classification);
  const competitorRank = getGuildFusionClassificationRank(competitor.classification);

  if (competitorRank > winnerRank) return true;
  if (competitorRank === winnerRank) return hasRelevantStrongIdentityHypothesis(competitor);
  if (competitor.classification !== "strong") return false;
  return hasRelevantStrongIdentityHypothesis(competitor);
};

const buildFlowIndexes = (flows: Flow[]) => {
  const byOld = new Map<string, Flow[]>();
  const byNew = new Map<string, Flow[]>();

  flows.forEach((flow) => {
    const oldKey = normalizeIdentifierKey(flow.oldGuild.guildIdentifier);
    const newKey = normalizeIdentifierKey(flow.newGuild.guildIdentifier);
    byOld.set(oldKey, [...(byOld.get(oldKey) ?? []), flow]);
    byNew.set(newKey, [...(byNew.get(newKey) ?? []), flow]);
  });

  return { byOld, byNew };
};

const createFlowEvidence = (flow: Flow, byOld: Map<string, Flow[]>, byNew: Map<string, Flow[]>): GuildFusionFlowEvidence => {
  const oldFlows = byOld.get(normalizeIdentifierKey(flow.oldGuild.guildIdentifier)) ?? [];
  const newFlows = byNew.get(normalizeIdentifierKey(flow.newGuild.guildIdentifier)) ?? [];
  const oldMappedMemberCount = oldFlows.reduce((sum, entry) => sum + entry.matchedMembers.length, 0);
  const newMappedMemberCount = newFlows.reduce((sum, entry) => sum + entry.matchedMembers.length, 0);
  const oldDestinations = rankPeers(oldFlows.map((entry) => toPeer(entry.newGuild, entry.matchedMembers.length)));
  const newSources = rankPeers(newFlows.map((entry) => toPeer(entry.oldGuild, entry.matchedMembers.length)));
  const oldTopDestination = oldDestinations[0] ?? null;
  const oldSecondDestination = oldDestinations[1] ?? null;
  const newTopSource = newSources[0] ?? null;
  const newSecondSource = newSources[1] ?? null;
  const matchedMemberCount = flow.matchedMembers.length;
  const isOldTopDestination = Boolean(
    oldTopDestination &&
      normalizeIdentifierKey(oldTopDestination.guildIdentifier) === normalizeIdentifierKey(flow.newGuild.guildIdentifier) &&
      matchedMemberCount === oldTopDestination.matchedMemberCount,
  );
  const isNewTopSource = Boolean(
    newTopSource &&
      normalizeIdentifierKey(newTopSource.guildIdentifier) === normalizeIdentifierKey(flow.oldGuild.guildIdentifier) &&
      matchedMemberCount === newTopSource.matchedMemberCount,
  );
  const isUniqueOldTop = Boolean(
    isOldTopDestination && matchedMemberCount > (oldSecondDestination?.matchedMemberCount ?? 0),
  );
  const isUniqueNewTop = Boolean(isNewTopSource && matchedMemberCount > (newSecondSource?.matchedMemberCount ?? 0));

  return {
    matchedMemberCount,
    oldMappedMemberCount,
    newMappedMemberCount,
    oldShare: oldMappedMemberCount ? matchedMemberCount / oldMappedMemberCount : 0,
    newShare: newMappedMemberCount ? matchedMemberCount / newMappedMemberCount : 0,
    oldTopDestination,
    oldSecondDestination,
    newTopSource,
    newSecondSource,
    isOldTopDestination,
    isNewTopSource,
    isUniqueOldTop,
    isUniqueNewTop,
    mutualDominant: isUniqueOldTop && isUniqueNewTop,
  };
};

const emptyFlowEvidence = (): GuildFusionFlowEvidence => ({
  matchedMemberCount: 0,
  oldMappedMemberCount: 0,
  newMappedMemberCount: 0,
  oldShare: 0,
  newShare: 0,
  oldTopDestination: null,
  oldSecondDestination: null,
  newTopSource: null,
  newSecondSource: null,
  isOldTopDestination: false,
  isNewTopSource: false,
  isUniqueOldTop: false,
  isUniqueNewTop: false,
  mutualDominant: false,
});

const createConflictEvidence = (
  top: GuildFusionFlowPeer | null,
  second: GuildFusionFlowPeer | null,
): GuildFusionConflictEvidence => ({
  relevant: Boolean(second && second.matchedMemberCount >= RELEVANT_SECONDARY_FLOW_MIN_MATCHED_MEMBERS),
  topCount: top?.matchedMemberCount ?? 0,
  secondCount: second?.matchedMemberCount ?? 0,
  topGuildIdentifier: top?.guildIdentifier ?? null,
  secondGuildIdentifier: second?.guildIdentifier ?? null,
});

const createLogicalPlayerLookup = (matches: GuildFusionPlayerMatch[]) => {
  const logicalByIdentifier = new Map<string, string>();
  matches.forEach((match) => {
    const oldKey = normalizeIdentifierKey(match.oldIdentifier);
    const newKey = normalizeIdentifierKey(match.newIdentifier);
    if (!oldKey || !newKey) return;
    const logical = `match:${oldKey}\u0000${newKey}`;
    logicalByIdentifier.set(oldKey, logical);
    logicalByIdentifier.set(newKey, logical);
  });
  return logicalByIdentifier;
};

const resolveLogicalPlayer = (identifier: string | null | undefined, logicalByIdentifier: Map<string, string>) => {
  const key = normalizeIdentifierKey(identifier);
  return key ? logicalByIdentifier.get(key) ?? null : null;
};

const createLeadershipEvidence = (
  oldGuild: GuildFusionObservation,
  newGuild: GuildFusionObservation,
  logicalByIdentifier: Map<string, string>,
): GuildFusionLeadershipEvidence => {
  const oldLeaderLogical = resolveLogicalPlayer(oldGuild.leaderIdentifier, logicalByIdentifier);
  const newLeaderLogical = resolveLogicalPlayer(newGuild.leaderIdentifier, logicalByIdentifier);
  const oldOfficerLogical = new Set(
    (oldGuild.officerIdentifiers ?? [])
      .map((identifier) => resolveLogicalPlayer(identifier, logicalByIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const newOfficerLogical = new Set(
    (newGuild.officerIdentifiers ?? [])
      .map((identifier) => resolveLogicalPlayer(identifier, logicalByIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const oldCore = new Set([oldLeaderLogical, ...oldOfficerLogical].filter((value): value is string => Boolean(value)));
  const newCore = new Set([newLeaderLogical, ...newOfficerLogical].filter((value): value is string => Boolean(value)));

  return {
    oldLeaderIdentifier: oldGuild.leaderIdentifier ?? null,
    newLeaderIdentifier: newGuild.leaderIdentifier ?? null,
    oldLeaderResolved: Boolean(oldLeaderLogical),
    newLeaderResolved: Boolean(newLeaderLogical),
    sameLogicalLeader: oldLeaderLogical && newLeaderLogical ? oldLeaderLogical === newLeaderLogical : null,
    oldOfficerCount: oldGuild.officerIdentifiers?.length ?? 0,
    newOfficerCount: newGuild.officerIdentifiers?.length ?? 0,
    oldOfficerResolvedCount: oldOfficerLogical.size,
    newOfficerResolvedCount: newOfficerLogical.size,
    continuedOfficers: [...oldOfficerLogical].filter((officer) => newOfficerLogical.has(officer)).length,
    leadershipCoreOverlap: [...oldCore].filter((entry) => newCore.has(entry)).length,
  };
};

const hasProgressionSupport = (oldGuild: GuildFusionObservation, newGuild: GuildFusionObservation) => {
  const oldProgression = oldGuild.progression;
  const newProgression = newGuild.progression;
  if (!oldProgression || !newProgression) return false;
  const informativeFields: Array<keyof GuildFusionProgressionSnapshot> = ["raid", "hydra", "guildPet", "honor", "rank"];
  return informativeFields.some((field) => {
    const oldValue = oldProgression[field];
    const newValue = newProgression[field];
    return typeof oldValue === "number" && typeof newValue === "number" && Number.isFinite(oldValue) && Number.isFinite(newValue) && newValue >= oldValue;
  });
};

const hasOnlyCollidingExactNameEvidence = (
  exactName: boolean,
  uniqueExactName: boolean,
  fusionBaseName: boolean,
  sameCoA: boolean,
  structuralRename: boolean,
  flowEvidence: GuildFusionFlowEvidence,
  leadership: GuildFusionLeadershipEvidence,
  progressionSupport: boolean,
) =>
  exactName &&
  !uniqueExactName &&
  !fusionBaseName &&
  !sameCoA &&
  !structuralRename &&
  flowEvidence.matchedMemberCount === 0 &&
  leadership.sameLogicalLeader !== true &&
  leadership.continuedOfficers === 0 &&
  leadership.leadershipCoreOverlap === 0 &&
  !progressionSupport;

const classifyGuildCandidate = (
  exactName: boolean,
  uniqueExactName: boolean,
  fusionBaseName: boolean,
  sameCoA: boolean,
  structuralRename: boolean,
  flowEvidence: GuildFusionFlowEvidence,
  leadership: GuildFusionLeadershipEvidence,
  progressionSupport: boolean,
): GuildFusionCandidateClassification => {
  const strongFlow = flowEvidence.mutualDominant && flowEvidence.matchedMemberCount >= STRONG_FLOW_MIN_MATCHED_MEMBERS;
  const hasLeadershipAnchor = leadership.sameLogicalLeader === true;
  const positiveMemberContinuity = flowEvidence.matchedMemberCount > 0;
  const meaningfulMemberContinuity = flowEvidence.matchedMemberCount >= STRONG_FLOW_MIN_MATCHED_MEMBERS;
  const substantialMemberContinuity = flowEvidence.matchedMemberCount >= SAME_COA_RENAME_MIN_MATCHED_MEMBERS;
  const hasDirectIdentity = exactName || fusionBaseName || sameCoA || structuralRename || hasLeadershipAnchor || progressionSupport;

  if (exactName && sameCoA && strongFlow) return "anchored";
  if (fusionBaseName) return "strong";
  if (structuralRename) return "strong";
  if (exactName && uniqueExactName && sameCoA && positiveMemberContinuity) return "strong";
  if (uniqueExactName && meaningfulMemberContinuity) return "strong";
  if (exactName && sameCoA && meaningfulMemberContinuity) return "strong";
  if (exactName && strongFlow) return "strong";
  if (!exactName && sameCoA && substantialMemberContinuity) return "strong";
  if (sameCoA && (strongFlow || leadership.leadershipCoreOverlap > 0)) return "strong";
  if (leadership.sameLogicalLeader === true) return "strong";
  if (leadership.continuedOfficers >= 2 && (exactName || sameCoA || strongFlow)) return "strong";
  if (
    hasOnlyCollidingExactNameEvidence(
      exactName,
      uniqueExactName,
      fusionBaseName,
      sameCoA,
      structuralRename,
      flowEvidence,
      leadership,
      progressionSupport,
    )
  ) {
    return "weak";
  }
  if (hasDirectIdentity) return "plausible";
  if (flowEvidence.matchedMemberCount > 0) return "weak";
  return "rejected";
};

const createEvidenceEntries = ({
  exactName,
  uniqueExactName,
  fusionBaseName,
  fusionBaseNameOrigin,
  sameCoA,
  structuralRename,
  flowEvidence,
  leadership,
  progressionSupport,
}: {
  exactName: boolean;
  uniqueExactName: boolean;
  fusionBaseName: boolean;
  fusionBaseNameOrigin: string | null;
  sameCoA: boolean;
  structuralRename: boolean;
  flowEvidence: GuildFusionFlowEvidence;
  leadership: GuildFusionLeadershipEvidence;
  progressionSupport: boolean;
}): GuildFusionEvidenceEntry[] => {
  const entries: GuildFusionEvidenceEntry[] = [];
  if (exactName) {
    entries.push({
      type: "exact-name",
      strength: flowEvidence.matchedMemberCount > 0 || sameCoA ? "strongSupport" : "support",
      label: "Exact guild name",
      source: "name",
      availability: "available",
    });
  }
  if (uniqueExactName) {
    entries.push({
      type: "unique-exact-name",
      strength: flowEvidence.matchedMemberCount >= STRONG_FLOW_MIN_MATCHED_MEMBERS || (sameCoA && flowEvidence.matchedMemberCount > 0) ? "strongSupport" : "support",
      label: "Unique exact guild name",
      source: "name",
      availability: "available",
    });
  }
  if (fusionBaseName) {
    entries.push({
      type: "fusion-base-name",
      strength: "strongSupport",
      label: "Fusion base guild name",
      source: "name",
      availability: "available",
      details: fusionBaseNameOrigin ? `Origin suffix resolved to ${fusionBaseNameOrigin}` : undefined,
    });
  }
  if (sameCoA) {
    entries.push({ type: "same-coa", strength: "support", label: "Same CoA", source: "coa", availability: "available" });
  }
  if (structuralRename) {
    const metrics = getStructuralSourceMetrics(flowEvidence);
    entries.push({
      type: "structural-rename",
      strength: "strongSupport",
      label: "Structural guild continuity",
      source: "members",
      availability: "available",
      details: `${flowEvidence.matchedMemberCount} matched players; runner-up delta ${metrics.sourceDelta}`,
    });
  }
  if (flowEvidence.mutualDominant && flowEvidence.matchedMemberCount >= STRONG_FLOW_MIN_MATCHED_MEMBERS) {
    entries.push({
      type: "member-flow",
      strength: exactName || sameCoA || leadership.sameLogicalLeader === true ? "strongSupport" : "support",
      label: "Mutual dominant member flow",
      source: "members",
      availability: "available",
      details: `${flowEvidence.matchedMemberCount} matched players`,
    });
  } else if (flowEvidence.matchedMemberCount > 0) {
    entries.push({
      type: "member-flow",
      strength: flowEvidence.matchedMemberCount <= SMALL_MIGRATION_MAX_MATCHED_MEMBERS ? "weakSupport" : "support",
      label: `${flowEvidence.matchedMemberCount} matched players`,
      source: "members",
      availability: "available",
    });
  }
  if (leadership.sameLogicalLeader === true) {
    entries.push({
      type: "leader-continuity",
      strength: "strongSupport",
      label: "Leader continuity",
      source: "leadership",
      availability: "available",
    });
  } else if (leadership.sameLogicalLeader === false) {
    entries.push({
      type: "leader-continuity",
      strength: "warning",
      label: "Different resolved leader",
      source: "leadership",
      availability: "available",
    });
  } else if (leadership.oldLeaderIdentifier || leadership.newLeaderIdentifier) {
    entries.push({
      type: "leader-continuity",
      strength: "neutral",
      label: "Leader continuity unavailable",
      source: "leadership",
      availability: "partial",
    });
  }
  if (leadership.continuedOfficers > 0) {
    entries.push({
      type: "officer-continuity",
      strength: leadership.continuedOfficers >= 2 ? "strongSupport" : "support",
      label: `${leadership.continuedOfficers} continued officers`,
      source: "leadership",
      availability: "available",
    });
  }
  if (leadership.leadershipCoreOverlap > leadership.continuedOfficers) {
    entries.push({
      type: "leadership-core",
      strength: "support",
      label: `${leadership.leadershipCoreOverlap} leadership core overlap`,
      source: "leadership",
      availability: "available",
    });
  }
  if (progressionSupport) {
    entries.push({
      type: "guild-progression",
      strength: "weakSupport",
      label: "Guild progression context",
      source: "progression",
      availability: "available",
    });
  }
  return entries;
};

const createMigrationEdge = (flow: Flow, evidence: GuildFusionFlowEvidence): GuildFusionMigrationEdge => ({
  ...evidence,
  relationType: "memberMigration",
  oldGuildIdentifier: flow.oldGuild.guildIdentifier,
  oldServer: flow.oldGuild.serverCode,
  oldName: flow.oldGuild.name,
  newGuildIdentifier: flow.newGuild.guildIdentifier,
  newName: flow.newGuild.name,
  matchedPlayers: flow.matchedMembers,
  matchedMembers: flow.matchedMembers,
});

const sortCandidates = (candidates: GuildFusionCandidate[]) =>
  [...candidates].sort(
    (left, right) =>
      Number(isGuildFusionReadyCandidate(right)) - Number(isGuildFusionReadyCandidate(left)) ||
      getGuildFusionClassificationRank(right.classification) - getGuildFusionClassificationRank(left.classification) ||
      Number(right.autoEligible) - Number(left.autoEligible) ||
      Number(right.exactName && right.sameCoA) - Number(left.exactName && left.sameCoA) ||
      Number(right.leadership.sameLogicalLeader === true) - Number(left.leadership.sameLogicalLeader === true) ||
      right.leadership.continuedOfficers - left.leadership.continuedOfficers ||
      Number(right.sameCoA) - Number(left.sameCoA) ||
      Number(right.exactName) - Number(left.exactName) ||
      Number(right.mutualDominant) - Number(left.mutualDominant) ||
      Number(right.isUniqueNewTop) - Number(left.isUniqueNewTop) ||
      right.matchedMemberCount - left.matchedMemberCount ||
      left.oldGuildIdentifier.localeCompare(right.oldGuildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );

const sortMigrationEdges = (edges: GuildFusionMigrationEdge[]) =>
  [...edges].sort(
    (left, right) =>
      right.matchedMemberCount - left.matchedMemberCount ||
      left.oldGuildIdentifier.localeCompare(right.oldGuildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );

const dedupeMatchedMembers = (members: GuildFusionMatchedMember[]) => {
  const byLogicalPair = new Map<string, GuildFusionMatchedMember>();
  members.forEach((member) => {
    const oldKey = normalizeIdentifierKey(member.oldIdentifier);
    const newKey = normalizeIdentifierKey(member.newIdentifier);
    const key = oldKey && newKey ? `${oldKey}\u0000${newKey}` : `${oldKey || member.oldIdentifier}\u0000${newKey || member.newIdentifier}`;
    if (!byLogicalPair.has(key)) byLogicalPair.set(key, member);
  });
  return [...byLogicalPair.values()].sort(
    (left, right) =>
      left.oldIdentifier.localeCompare(right.oldIdentifier, undefined, { numeric: true, sensitivity: "base" }) ||
      left.newIdentifier.localeCompare(right.newIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );
};

const mergeMigrationEdge = (existing: GuildFusionMigrationEdge, edge: GuildFusionMigrationEdge): GuildFusionMigrationEdge => {
  const bestEvidence =
    edge.matchedMemberCount > existing.matchedMemberCount ||
    (edge.matchedMemberCount === existing.matchedMemberCount && Number(edge.mutualDominant) > Number(existing.mutualDominant))
      ? edge
      : existing;
  const matchedMembers = dedupeMatchedMembers([...(existing.matchedMembers ?? []), ...(edge.matchedMembers ?? [])]);
  return {
    ...bestEvidence,
    matchedMemberCount: matchedMembers.length,
    matchedPlayers: matchedMembers,
    matchedMembers,
  };
};

const dedupeCandidatesByOldGuild = (candidates: GuildFusionCandidate[]) => {
  const byOldGuild = new Map<string, GuildFusionCandidate>();
  candidates.forEach((candidate) => {
    const key = normalizeIdentifierKey(candidate.oldGuildIdentifier);
    const existing = byOldGuild.get(key);
    if (
      !existing ||
      getGuildFusionClassificationRank(candidate.classification) > getGuildFusionClassificationRank(existing.classification) ||
      candidate.matchedMemberCount > existing.matchedMemberCount ||
      candidate.evidenceEntries.length > existing.evidenceEntries.length
    ) {
      byOldGuild.set(key, candidate);
    }
  });
  return sortCandidates([...byOldGuild.values()]);
};

const dedupeMigrationEdgesByOldGuild = (edges: GuildFusionMigrationEdge[]) => {
  const byOldGuild = new Map<string, GuildFusionMigrationEdge>();
  edges.forEach((edge) => {
    const key = normalizeIdentifierKey(edge.oldGuildIdentifier);
    const existing = byOldGuild.get(key);
    byOldGuild.set(key, existing ? mergeMigrationEdge(existing, edge) : {
      ...edge,
      matchedPlayers: dedupeMatchedMembers(edge.matchedPlayers ?? edge.matchedMembers ?? []),
      matchedMembers: dedupeMatchedMembers(edge.matchedMembers ?? edge.matchedPlayers ?? []),
      matchedMemberCount: dedupeMatchedMembers(edge.matchedMembers ?? edge.matchedPlayers ?? []).length,
    });
  });
  return sortMigrationEdges([...byOldGuild.values()]);
};

const mergeRelationDraftsByNewGuild = (drafts: RelationDraft[]) => {
  const byNewGuild = new Map<string, RelationDraft>();
  drafts.forEach((draft) => {
    const key = normalizeIdentifierKey(draft.newGuild.guildIdentifier);
    const existing = byNewGuild.get(key);
    if (!existing) {
      byNewGuild.set(key, {
        ...draft,
        identityCandidates: dedupeCandidatesByOldGuild(draft.identityCandidates),
        memberMigrationEdges: dedupeMigrationEdgesByOldGuild(draft.memberMigrationEdges),
      });
      return;
    }
    byNewGuild.set(key, {
      newGuild: latestByTimestamp([existing.newGuild, draft.newGuild]) ?? draft.newGuild,
      identityCandidates: dedupeCandidatesByOldGuild([...existing.identityCandidates, ...draft.identityCandidates]),
      memberMigrationEdges: dedupeMigrationEdgesByOldGuild([...existing.memberMigrationEdges, ...draft.memberMigrationEdges]),
    });
  });
  return [...byNewGuild.values()].sort((left, right) =>
    left.newGuild.guildIdentifier.localeCompare(right.newGuild.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );
};

const createFlowSummary = (
  newGuild: GuildFusionObservation,
  byNew: Map<string, Flow[]>,
  byOld: Map<string, Flow[]>,
  identityCandidates: GuildFusionCandidate[],
): GuildFusionFlowSummary => {
  const sources = rankPeers(
    (byNew.get(normalizeIdentifierKey(newGuild.guildIdentifier)) ?? []).map((flow) =>
      toPeer(flow.oldGuild, flow.matchedMembers.length),
    ),
  );
  const destinationPeers = identityCandidates.flatMap((candidate) =>
    candidate.oldTopDestination
      ? [
          candidate.oldTopDestination,
          ...(candidate.oldSecondDestination ? [candidate.oldSecondDestination] : []),
        ]
      : [],
  );
  const destinations = rankPeers(
    destinationPeers.length
      ? destinationPeers
      : [...byOld.values()].flatMap((flows) =>
          flows
            .filter((flow) => normalizeIdentifierKey(flow.newGuild.guildIdentifier) === normalizeIdentifierKey(newGuild.guildIdentifier))
            .map((flow) => toPeer(flow.newGuild, flow.matchedMembers.length)),
        ),
  );

  return {
    sources,
    destinations,
    hasSplitEvidence: identityCandidates.some((candidate) => candidate.splitEvidence.relevant),
    hasConvergenceEvidence: Boolean(sources[1] && sources[1].matchedMemberCount >= RELEVANT_SECONDARY_FLOW_MIN_MATCHED_MEMBERS),
  };
};

const createReasons = (
  status: GuildFusionStatus,
  identityCandidates: GuildFusionCandidate[],
  migrationEdges: GuildFusionMigrationEdge[],
) => {
  if (status === "noHistoricalData") return ["no historical guild observations"];
  if (status === "unresolved") {
    if (identityCandidates.some((candidate) => candidate.classification === "weak")) return ["only weak guild relations were found"];
    if (migrationEdges.length) return ["member migrations found, but no continuity evidence"];
    return ["no plausible identity continuity evidence"];
  }
  if (status === "autoEligible") {
    const winner = identityCandidates.find((candidate) => candidate.autoEligible);
    if (winner?.classification === "anchored") return ["dominant anchored historical guild identity"];
    if (winner?.structuralRename) return ["single strong structural guild continuity after competitor filtering"];
    return ["single strong historical guild identity after competitor filtering"];
  }
  if (status === "convergence") return ["multiple equally relevant historical guild identities"];
  if (status === "split") return ["a historical guild has multiple relevant post-fusion destinations"];
  if (identityCandidates.some((candidate) => candidate.assignmentConflict)) {
    return ["historical guild identity is claimed by multiple current guilds"];
  }
  if (identityCandidates.filter((candidate) => candidate.classification === "anchored").length > 1) {
    return ["multiple anchored historical guild identities remain"];
  }
  if (identityCandidates.filter((candidate) => candidate.classification === "strong").length > 1) {
    return ["multiple strong historical guild identities remain"];
  }
  if (identityCandidates.some((candidate) => candidate.classification === "plausible")) {
    return ["historical guild identity found, but direct continuity is insufficient for automatic linking"];
  }
  if (identityCandidates.length) return ["plausible continuity requires review"];
  return [];
};

export const resolveGuildFusions = (input: GuildFusionResolverInput): GuildFusionResolverResult => {
  const scope = input.scope
    ? {
        ...input.scope,
        historicalServerCodes: [...new Set(input.scope.historicalServerCodes)],
      }
    : undefined;
  const histories = buildHistories(input.historicalGuildObservations);
  const newGuilds = [...input.newGuildObservations].sort((left, right) =>
    left.guildIdentifier.localeCompare(right.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );
  const beforeTimestamp = Math.min(...newGuilds.map((guild) => guild.timestamp).filter(Number.isFinite));
  const hasHistoricalData = histories.length > 0;
  const oldGuilds = histories
    .map((history) => selectLatestBefore(history.observations, Number.isFinite(beforeTimestamp) ? beforeTimestamp : Infinity))
    .filter((guild): guild is GuildFusionObservation => Boolean(guild));
  const historicalNameCounts = createLatestHistoricalNameCounts(oldGuilds);
  const memberFlowStartedAt = performance.now();
  const oldMembership = buildLatestOldMembership(histories, Number.isFinite(beforeTimestamp) ? beforeTimestamp : Infinity);
  const newMembership = buildCurrentMembership(newGuilds);
  const flows = [...buildMatchedMemberEdges(oldMembership, newMembership, input.highConfidencePlayerMatches).values()];
  const { byOld, byNew } = buildFlowIndexes(flows);
  const flowEvidenceByKey = new Map(
    flows.map((flow) => [createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier), createFlowEvidence(flow, byOld, byNew)]),
  );
  const memberFlowTotalMs = performance.now() - memberFlowStartedAt;
  const logicalPlayerByIdentifier = createLogicalPlayerLookup(input.highConfidencePlayerMatches);
  let guildCandidatesEvaluated = 0;
  let guildCandidatesRetained = 0;

  const relationDrafts = mergeRelationDraftsByNewGuild(newGuilds.map((newGuild, index): RelationDraft => {
    const hasDirectIdentityCandidateForCurrent = oldGuilds.some((oldGuild) => {
      const oldName = normalizeNameKey(oldGuild.name);
      const newName = normalizeNameKey(newGuild.name);
      return (
        Boolean(oldName && newName && oldName === newName) ||
        Boolean(getValidFusionBaseNameEvidence(oldGuild, newGuild, scope)) ||
        Boolean(oldGuild.coa && newGuild.coa && oldGuild.coa === newGuild.coa)
      );
    });
    guildCandidatesEvaluated += oldGuilds.length;
    const identityCandidates = oldGuilds.flatMap((oldGuild): GuildFusionCandidate[] => {
      const edgeKey = createEdgeKey(oldGuild.guildIdentifier, newGuild.guildIdentifier);
      const flow = flows.find((entry) => createEdgeKey(entry.oldGuild.guildIdentifier, entry.newGuild.guildIdentifier) === edgeKey);
      const evidence = flowEvidenceByKey.get(edgeKey) ?? emptyFlowEvidence();
      const oldName = normalizeNameKey(oldGuild.name);
      const newName = normalizeNameKey(newGuild.name);
      const exactName = Boolean(oldName && newName && oldName === newName);
      const uniqueExactName = Boolean(exactName && oldName && (historicalNameCounts.get(oldName) ?? 0) === 1);
      const fusionBaseNameEvidence = getValidFusionBaseNameEvidence(oldGuild, newGuild, scope);
      const fusionBaseName = Boolean(fusionBaseNameEvidence);
      const fusionBaseNameOrigin = fusionBaseNameEvidence?.server ?? null;
      const sameCoA = Boolean(oldGuild.coa && newGuild.coa && oldGuild.coa === newGuild.coa);
      const leadership = createLeadershipEvidence(oldGuild, newGuild, logicalPlayerByIdentifier);
      const progressionSupport = hasProgressionSupport(oldGuild, newGuild);
      const structuralRename = !exactName && !fusionBaseName && !sameCoA && isStructuralRenameEvidence(evidence, hasDirectIdentityCandidateForCurrent);
      const structuralMetrics = getStructuralSourceMetrics(evidence);
      const classification = classifyGuildCandidate(
        exactName,
        uniqueExactName,
        fusionBaseName,
        sameCoA,
        structuralRename,
        evidence,
        leadership,
        progressionSupport,
      );
      if (classification === "rejected") return [];

      const splitEvidence = createConflictEvidence(evidence.oldTopDestination, evidence.oldSecondDestination);
      const convergenceEvidence = createConflictEvidence(evidence.newTopSource, evidence.newSecondSource);
      const actionable = classification === "plausible" || classification === "strong" || classification === "anchored";

      return [
        {
          ...evidence,
          relationType: "identityContinuity",
          oldGuildIdentifier: oldGuild.guildIdentifier,
          oldServer: oldGuild.serverCode,
          oldName: oldGuild.name,
          oldMemberCount: oldGuild.memberCount,
          oldCoa: oldGuild.coa ?? null,
          newGuildIdentifier: newGuild.guildIdentifier,
          newName: newGuild.name,
          newMemberCount: newGuild.memberCount,
          exactName,
          uniqueExactName,
          fusionBaseName,
          fusionBaseNameOrigin,
          sameCoA,
          structuralRename,
          structuralSecondSourceCount: structuralMetrics.secondSourceCount,
          structuralSourceRatio: structuralMetrics.sourceRatio,
          structuralSourceDelta: structuralMetrics.sourceDelta,
          leadership,
          classification,
          evidenceEntries: createEvidenceEntries({
            exactName,
            uniqueExactName,
            fusionBaseName,
            fusionBaseNameOrigin,
            sameCoA,
            structuralRename,
            flowEvidence: evidence,
            leadership,
            progressionSupport,
          }),
          actionable,
          assignmentConflict: false,
          reservedByReadyAssignment: false,
          relevantCompetitor: false,
          dominantWinner: false,
          matchedMembers: flow?.matchedMembers ?? [],
          splitEvidence,
          convergenceEvidence,
          autoEligible: false,
          reviewRequired: true,
        },
      ];
    });
    guildCandidatesRetained += identityCandidates.length;

    const candidateKeys = new Set(
      identityCandidates
        .filter((candidate) => isGuildFusionActionableIdentityCandidate(candidate))
        .map((candidate) => createEdgeKey(candidate.oldGuildIdentifier, candidate.newGuildIdentifier)),
    );
    const memberMigrationEdges = sortMigrationEdges(
      (byNew.get(normalizeIdentifierKey(newGuild.guildIdentifier)) ?? [])
        .filter((flow) => !candidateKeys.has(createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier)))
        .map((flow) => createMigrationEdge(flow, flowEvidenceByKey.get(createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier)) ?? emptyFlowEvidence())),
    );

    const draft = { newGuild, identityCandidates: sortCandidates(identityCandidates), memberMigrationEdges };
    input.onProgress?.({ current: index + 1, total: newGuilds.length });
    return draft;
  }));

  const strongContinuityCountsByOld = new Map<string, number>();
  relationDrafts.forEach((draft) => {
    draft.identityCandidates.forEach((candidate) => {
      if (!isGuildFusionReadyCandidate(candidate)) return;
      const oldKey = normalizeIdentifierKey(candidate.oldGuildIdentifier);
      strongContinuityCountsByOld.set(oldKey, (strongContinuityCountsByOld.get(oldKey) ?? 0) + 1);
    });
  });

  const reservedReadyOwnerByOld = new Map<string, string>();
  relationDrafts.forEach((draft) => {
    const comparableReadyCandidates = draft.identityCandidates.filter(
      (candidate) =>
        isGuildFusionReadyCandidate(candidate) &&
        (strongContinuityCountsByOld.get(normalizeIdentifierKey(candidate.oldGuildIdentifier)) ?? 0) === 1,
    );
    if (comparableReadyCandidates.length !== 1) return;
    const candidate = comparableReadyCandidates[0];
    if (!candidate) return;
    reservedReadyOwnerByOld.set(normalizeIdentifierKey(candidate.oldGuildIdentifier), normalizeIdentifierKey(candidate.newGuildIdentifier));
  });

  const results = relationDrafts.map((draft): GuildFusionGuildResult => {
    const reliableHistoricalLookup = getReliableFusionBaseNameLookup(draft.newGuild, oldGuilds, scope);
    const recomputedCandidates = sortCandidates(
      draft.identityCandidates.map((candidate) => {
        const oldKey = normalizeIdentifierKey(candidate.oldGuildIdentifier);
        const strongClaimCount = strongContinuityCountsByOld.get(oldKey) ?? 0;
        const assignmentConflict = isGuildFusionReadyCandidate(candidate) && strongClaimCount > 1;
        const reservedOwner = reservedReadyOwnerByOld.get(oldKey);
        const reservedByReadyAssignment = Boolean(
          reservedOwner && reservedOwner !== normalizeIdentifierKey(candidate.newGuildIdentifier),
        );
        return {
          ...candidate,
          assignmentConflict,
          reservedByReadyAssignment,
          autoEligible: false,
          reviewRequired: candidate.actionable,
          evidenceEntries: [
            ...candidate.evidenceEntries,
            ...(assignmentConflict
              ? [{
                  type: "assignment" as const,
                  strength: "warning" as const,
                  label: "Historical guild claimed elsewhere",
                  source: "assignment" as const,
                  availability: "available" as const,
                }]
              : []),
            ...(reservedByReadyAssignment
              ? [{
                  type: "assignment" as const,
                  strength: "neutral" as const,
                  label: "Reserved by another ready identity",
                  source: "assignment" as const,
                  availability: "available" as const,
                }]
              : []),
          ],
        };
      }),
    );
    const activeAfterReservation = recomputedCandidates.filter(
      (candidate) =>
        !candidate.reservedByReadyAssignment &&
        candidate.classification !== "weak" &&
        candidate.classification !== "rejected" &&
        isGuildFusionActionableIdentityCandidate(candidate),
    );
    const readyAfterReservation = activeAfterReservation.filter(isGuildFusionReadyCandidate);
    const winner = sortCandidates(readyAfterReservation)[0] ?? null;
    const relevantCompetitors = winner
      ? activeAfterReservation.filter((candidate) => isRelevantGuildIdentityCompetitor(winner, candidate))
      : [];
    const hasRelevantCompetitors = relevantCompetitors.length > 0;
    const hasDominantWinner = Boolean(winner && !winner.assignmentConflict && !hasRelevantCompetitors);
    const finalCandidates = sortCandidates(
      recomputedCandidates.map((candidate) => {
        const autoEligible =
          hasDominantWinner &&
          normalizeIdentifierKey(winner?.oldGuildIdentifier) === normalizeIdentifierKey(candidate.oldGuildIdentifier) &&
          normalizeIdentifierKey(winner?.newGuildIdentifier) === normalizeIdentifierKey(candidate.newGuildIdentifier);
        const relevantCompetitor = Boolean(
          winner &&
            !autoEligible &&
            isRelevantGuildIdentityCompetitor(winner, candidate),
        );
        return {
          ...candidate,
          autoEligible,
          relevantCompetitor,
          dominantWinner: autoEligible,
          reviewRequired: !autoEligible && candidate.actionable && !candidate.reservedByReadyAssignment && (relevantCompetitor || !hasDominantWinner),
        };
      }),
    );
    const identityCandidates = sortCandidates(
      finalCandidates.filter(
        (candidate) =>
          !candidate.reservedByReadyAssignment &&
          candidate.classification !== "weak" &&
          candidate.classification !== "rejected" &&
          isGuildFusionActionableIdentityCandidate(candidate),
      ),
    );
    const reservedMigrationEdges = recomputedCandidates
      .filter((candidate) => candidate.reservedByReadyAssignment && candidate.matchedMemberCount > 0)
      .map((candidate) =>
        createMigrationEdge(
          {
            oldGuild: {
              guildIdentifier: candidate.oldGuildIdentifier,
              serverCode: candidate.oldServer,
              timestamp: draft.newGuild.timestamp - 1,
              name: candidate.oldName,
              memberIdentifiers: [],
              memberCount: candidate.oldMemberCount,
              coa: candidate.oldCoa,
            },
            newGuild: draft.newGuild,
            matchedMembers: candidate.matchedMembers,
          },
          candidate,
        ),
      );
    const memberMigrationEdges = dedupeMigrationEdgesByOldGuild([
      ...draft.memberMigrationEdges,
      ...reservedMigrationEdges,
    ]);
    const flowSummary = createFlowSummary(draft.newGuild, byNew, byOld, identityCandidates);
    const splitCandidate = identityCandidates.some(
      (candidate) => candidate.assignmentConflict,
    );
    const convergenceCandidate = identityCandidates.some((candidate) => candidate.relevantCompetitor);
    flowSummary.hasSplitEvidence = splitCandidate;
    flowSummary.hasConvergenceEvidence = convergenceCandidate;
    const readyCandidates = identityCandidates.filter((candidate) => candidate.autoEligible);
    const hasSingleAutoIdentity = readyCandidates.length === 1 && !convergenceCandidate;
    const status: GuildFusionStatus = !hasHistoricalData
      ? "noHistoricalData"
      : hasSingleAutoIdentity
        ? "autoEligible"
        : convergenceCandidate
          ? "convergence"
          : splitCandidate
            ? "split"
            : identityCandidates.length
              ? "reviewRequired"
              : "unresolved";

    return {
      newGuild: draft.newGuild,
      status,
      identityCandidates,
      memberMigrationEdges,
      flowSummary,
      splitCandidate,
      convergenceCandidate,
      candidateCount: identityCandidates.length,
      candidates: finalCandidates,
      reasons: createReasons(status, identityCandidates, memberMigrationEdges),
      reliableHistoricalLookup,
    };
  });

  input.onDiagnostics?.({
    currentGuilds: newGuilds.length,
    historicalGuildHistories: histories.length,
    historicalGuildsBeforeBoundary: oldGuilds.length,
    guildCandidatesGenerated: guildCandidatesEvaluated,
    guildCandidatesEvaluated,
    guildCandidatesRetained,
    memberFlowCalls: 1,
    memberFlowTotalMs,
    memberComparisons: input.highConfidencePlayerMatches.length,
    flowCount: flows.length,
  });

  return { results };
};
