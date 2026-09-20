export type GuildFusionStatus =
  | "autoEligible"
  | "reviewRequired"
  | "unresolved"
  | "noHistoricalData"
  | "split"
  | "convergence";

export type GuildFusionRelationType = "identityContinuity" | "memberMigration";

export type GuildFusionObservation = {
  guildIdentifier: string;
  serverCode: string | null;
  timestamp: number;
  name: string | null;
  memberIdentifiers: string[];
  memberCount: number | null;
  coa?: string | null;
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
  sameCoA: boolean;
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
};

export type GuildFusionResolverInput = {
  historicalGuildObservations: GuildFusionObservation[];
  newGuildObservations: GuildFusionObservation[];
  highConfidencePlayerMatches: GuildFusionPlayerMatch[];
};

export type GuildFusionResolverResult = {
  results: GuildFusionGuildResult[];
};

type GuildHistory = {
  guildIdentifier: string;
  observations: GuildFusionObservation[];
};

type Flow = {
  oldGuild: GuildFusionObservation;
  newGuild: GuildFusionObservation;
  matchedMembers: GuildFusionMatchedMember[];
};

const SMALL_MIGRATION_MAX_MATCHED_MEMBERS = 2;
const AUTO_ELIGIBLE_MIN_MATCHED_MEMBERS = 3;
const RELEVANT_SECONDARY_FLOW_MIN_MATCHED_MEMBERS = 3;

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeNameKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

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

const hasIdentityContinuityEvidence = (
  exactName: boolean,
  sameCoA: boolean,
  flowEvidence: GuildFusionFlowEvidence,
) => {
  if (exactName || sameCoA) return true;
  if (flowEvidence.matchedMemberCount <= SMALL_MIGRATION_MAX_MATCHED_MEMBERS) return false;
  return flowEvidence.mutualDominant;
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
      Number(right.autoEligible) - Number(left.autoEligible) ||
      Number(right.exactName && right.sameCoA) - Number(left.exactName && left.sameCoA) ||
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
    if (migrationEdges.length) return ["member migrations found, but no continuity evidence"];
    return ["no plausible identity continuity evidence"];
  }
  if (status === "autoEligible") return ["strict continuity evidence: exact name, same CoA, mutual dominance, sufficient players"];
  if (status === "convergence") return ["multiple relevant historical member cores converge into this guild"];
  if (status === "split") return ["a historical guild has multiple relevant post-fusion destinations"];
  if (identityCandidates.length) return ["plausible continuity requires review"];
  return [];
};

export const resolveGuildFusions = (input: GuildFusionResolverInput): GuildFusionResolverResult => {
  const histories = buildHistories(input.historicalGuildObservations);
  const newGuilds = [...input.newGuildObservations].sort((left, right) =>
    left.guildIdentifier.localeCompare(right.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
  );
  const beforeTimestamp = Math.min(...newGuilds.map((guild) => guild.timestamp).filter(Number.isFinite));
  const hasHistoricalData = histories.length > 0;
  const oldGuilds = histories
    .map((history) => selectLatestBefore(history.observations, Number.isFinite(beforeTimestamp) ? beforeTimestamp : Infinity))
    .filter((guild): guild is GuildFusionObservation => Boolean(guild));
  const oldMembership = buildLatestOldMembership(histories, Number.isFinite(beforeTimestamp) ? beforeTimestamp : Infinity);
  const newMembership = buildCurrentMembership(newGuilds);
  const flows = [...buildMatchedMemberEdges(oldMembership, newMembership, input.highConfidencePlayerMatches).values()];
  const { byOld, byNew } = buildFlowIndexes(flows);
  const flowEvidenceByKey = new Map(
    flows.map((flow) => [createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier), createFlowEvidence(flow, byOld, byNew)]),
  );

  const relationDrafts = newGuilds.map((newGuild) => {
    const identityCandidates = oldGuilds.flatMap((oldGuild): GuildFusionCandidate[] => {
      const edgeKey = createEdgeKey(oldGuild.guildIdentifier, newGuild.guildIdentifier);
      const flow = flows.find((entry) => createEdgeKey(entry.oldGuild.guildIdentifier, entry.newGuild.guildIdentifier) === edgeKey);
      const evidence = flowEvidenceByKey.get(edgeKey) ?? emptyFlowEvidence();
      const oldName = normalizeNameKey(oldGuild.name);
      const newName = normalizeNameKey(newGuild.name);
      const exactName = Boolean(oldName && newName && oldName === newName);
      const sameCoA = Boolean(oldGuild.coa && newGuild.coa && oldGuild.coa === newGuild.coa);
      if (!hasIdentityContinuityEvidence(exactName, sameCoA, evidence)) return [];

      const splitEvidence = createConflictEvidence(evidence.oldTopDestination, evidence.oldSecondDestination);
      const convergenceEvidence = createConflictEvidence(evidence.newTopSource, evidence.newSecondSource);

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
          sameCoA,
          matchedMembers: flow?.matchedMembers ?? [],
          splitEvidence,
          convergenceEvidence,
          autoEligible: false,
          reviewRequired: true,
        },
      ];
    });

    const candidateKeys = new Set(identityCandidates.map((candidate) => createEdgeKey(candidate.oldGuildIdentifier, candidate.newGuildIdentifier)));
    const memberMigrationEdges = sortMigrationEdges(
      (byNew.get(normalizeIdentifierKey(newGuild.guildIdentifier)) ?? [])
        .filter((flow) => !candidateKeys.has(createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier)))
        .map((flow) => createMigrationEdge(flow, flowEvidenceByKey.get(createEdgeKey(flow.oldGuild.guildIdentifier, flow.newGuild.guildIdentifier)) ?? emptyFlowEvidence())),
    );

    return { newGuild, identityCandidates: sortCandidates(identityCandidates), memberMigrationEdges };
  });

  const identityContinuityCountsByOld = new Map<string, number>();
  relationDrafts.forEach((draft) => {
    draft.identityCandidates.forEach((candidate) => {
      const oldKey = normalizeIdentifierKey(candidate.oldGuildIdentifier);
      identityContinuityCountsByOld.set(oldKey, (identityContinuityCountsByOld.get(oldKey) ?? 0) + 1);
    });
  });

  const results = relationDrafts.map((draft): GuildFusionGuildResult => {
    const identityCandidates = sortCandidates(
      draft.identityCandidates.map((candidate) => {
        const hasIdentityAssignmentConflict =
          draft.identityCandidates.length > 1 ||
          (identityContinuityCountsByOld.get(normalizeIdentifierKey(candidate.oldGuildIdentifier)) ?? 0) > 1;
        const autoEligible =
          candidate.exactName &&
          candidate.sameCoA &&
          candidate.mutualDominant &&
          candidate.matchedMemberCount >= AUTO_ELIGIBLE_MIN_MATCHED_MEMBERS &&
          !hasIdentityAssignmentConflict;
        return {
          ...candidate,
          autoEligible,
          reviewRequired: !autoEligible,
        };
      }),
    );
    const flowSummary = createFlowSummary(draft.newGuild, byNew, byOld, identityCandidates);
    const splitCandidate = identityCandidates.some(
      (candidate) => (identityContinuityCountsByOld.get(normalizeIdentifierKey(candidate.oldGuildIdentifier)) ?? 0) > 1,
    );
    const convergenceCandidate = identityCandidates.length > 1;
    flowSummary.hasSplitEvidence = splitCandidate;
    flowSummary.hasConvergenceEvidence = convergenceCandidate;
    const hasSingleAutoIdentity = identityCandidates.filter((candidate) => candidate.autoEligible).length === 1 && identityCandidates.length === 1;
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
      memberMigrationEdges: draft.memberMigrationEdges,
      flowSummary,
      splitCandidate,
      convergenceCandidate,
      candidateCount: identityCandidates.length,
      candidates: identityCandidates,
      reasons: createReasons(status, identityCandidates, draft.memberMigrationEdges),
    };
  });

  return { results };
};
