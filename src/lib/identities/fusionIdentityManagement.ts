import {
  deriveGuildHubLogicalScanSnapshots,
  listSfDataHubLocalScansReadOnly,
  type GuildHubLogicalScanSnapshot,
} from "../guilds/localScanLibrary";
import { resolveServer } from "../servers/serverResolver";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "./playerFusionPreviewAdapter";
import {
  getDefaultFusionIdentityAnalysisScope,
  isServerInFusionIdentityScope,
  type FusionIdentityAnalysisScope,
} from "./fusionIdentityScopes";
import {
  createGuildIdentityStore,
  getGuildAliases,
  getGuildEntityForAlias,
  isGuildLinkRejected,
  listGuildEntities,
  listGuildExclusions,
  linkGuildAliases,
  rejectGuildLink,
  unlinkGuildAlias,
  type GuildAliasSource,
} from "./guildIdentityStore";
import {
  createPlayerIdentityStore,
  getPlayerAliases,
  getPlayerIdentity,
  isPlayerMatchRejected,
  listPlayerEntities,
  listPlayerExclusions,
  linkPlayerIdentifiers,
  rejectPlayerMatch,
  unlinkPlayerIdentifier,
  type PlayerAliasSource,
} from "./playerIdentityStore";
import {
  getGuildFusionClassificationRank,
  isGuildFusionActionableIdentityCandidate,
  isGuildFusionReadyCandidate,
  resolveGuildFusions,
  type GuildFusionCandidate,
  type GuildFusionMigrationEdge,
  type GuildFusionMatchedMember,
  type GuildFusionPlayerMatch,
  type GuildFusionGuildResult,
  type GuildFusionObservation,
} from "./guildFusionResolver";
import {
  getPlayerFusionClassificationRank,
  hasPlayerFusionHardContradiction,
  isPlayerFusionActionableIdentityCandidate,
  isPlayerFusionReadyCandidate,
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "./playerFusionResolver";
import type { FusionIdentityProgress } from "./fusionIdentityWorkerTypes";

export type FusionIdentityEntityType = "player" | "guild";
export type FusionIdentityManagementStatus =
  | "ready"
  | "review"
  | "unresolved"
  | "noHistoricalObservation"
  | "noHistory"
  | "completed";

export type FusionIdentityManagementReasonCode =
  | "no-historical-scans"
  | "no-historical-observation"
  | "no-viable-candidate"
  | "level-regression"
  | "level-progression-contradiction"
  | "semantic-contradictions"
  | "reserved-by-other-identity"
  | "rejected-by-exclusion"
  | "assignment-conflict"
  | "no-actionable-candidate"
  | "multiple-relevant-candidates"
  | "insufficient-player-evidence"
  | "insufficient-guild-evidence"
  | "insufficient-continuity";

export type FusionIdentityCandidatePipelineDiagnostics = {
  historicalPoolSize: number;
  candidatesGeneratedInitially: number;
  candidatesAfterHardCompatibility: number;
  candidatesAfterSemanticEvaluation: number;
  candidatesRejectedByLevelRegression: number;
  candidatesRejectedByLevelProgression: number;
  candidatesAfterExclusions: number;
  candidatesAfterReservations: number;
  finalCandidates: number;
};

export type FusionIdentityHistoricalLookupDiagnostics = {
  type: "fusion-suffix-base-name" | "guild-fusion-base-name";
  originServer: string;
  baseName: string;
  classId?: string | null;
  matchingObservationCount: number;
  compatibleClassObservationCount?: number;
};

export type FusionIdentityManagementDiagnostics = {
  reasonCode: FusionIdentityManagementReasonCode;
  originServerCodes: string[];
  historicalSnapshotCount: number;
  reliableHistoricalLookup: FusionIdentityHistoricalLookupDiagnostics | null;
  candidatePipeline: FusionIdentityCandidatePipelineDiagnostics;
};

export type FusionIdentityObservationSummary = {
  identifier: string;
  name: string | null;
  server: string | null;
  timestamp: number;
  classId?: string | null;
  level?: number | null;
  guildIdentifier?: string | null;
  guildName?: string | null;
};

export type FusionIdentityCandidate =
  | {
      entityType: "player";
      historicalIdentifier: string;
      historicalName: string | null;
      historicalServer: string | null;
      ready: boolean;
      rejected: boolean;
      assignedToOtherIdentity: boolean;
      evidence: PlayerFusionCandidate;
    }
  | {
      entityType: "guild";
      historicalIdentifier: string;
      historicalName: string | null;
      historicalServer: string | null;
      ready: boolean;
      rejected: boolean;
      assignedToOtherIdentity: boolean;
      evidence: GuildFusionCandidate;
    };

export type FusionIdentityGuildMemberRef = {
  identifier: string;
  name: string;
};

export type FusionIdentityGuildMemberRefsByStatus = {
  review: FusionIdentityGuildMemberRef[];
  unresolved: FusionIdentityGuildMemberRef[];
  noHistoricalObservation: FusionIdentityGuildMemberRef[];
  noHistory: FusionIdentityGuildMemberRef[];
};

export type FusionIdentityGuildMemberStatusSummary = {
  totalMembers: number;
  resolvedMembers: number;
  readyMembers: number;
  completedMembers: number;
  reviewMembers: number;
  unresolvedMembers: number;
  noHistoricalObservationMembers: number;
  noHistoricalDataMembers: number;
  missingManagementEntries: number;
  memberRefsByStatus: FusionIdentityGuildMemberRefsByStatus;
};

export type FusionIdentityManagementItem = {
  id: string;
  entityType: FusionIdentityEntityType;
  status: FusionIdentityManagementStatus;
  currentIdentifier: string;
  currentName: string | null;
  currentServer: string | null;
  observations: FusionIdentityObservationSummary[];
  firstSeen: number;
  lastSeen: number;
  historicalIdentifiers: string[];
  candidates: FusionIdentityCandidate[];
  memberMigrationEdges: GuildFusionMigrationEdge[];
  memberStatusSummary?: FusionIdentityGuildMemberStatusSummary | null;
  reasons: string[];
  reasonCodes: FusionIdentityManagementReasonCode[];
  diagnostics: FusionIdentityManagementDiagnostics | null;
  readyCandidateIdentifier: string | null;
  completedEntityId: string | null;
  completedAliases: string[];
};

export type FusionIdentityManagementSummary = {
  total: number;
  ready: number;
  review: number;
  unresolved: number;
  noHistoricalObservation: number;
  noHistory: number;
  completed: number;
  players: number;
  guilds: number;
};

export type FusionIdentityManagementScope = {
  label: string;
  originServerCodes: string[];
  targetServerCode: string;
  allSnapshotCount: number;
  historicalSnapshotCount: number;
  postFusionSnapshotCount: number;
  firstHistoricalTimestamp: number | null;
  lastHistoricalTimestamp: number | null;
  firstPostFusionTimestamp: number | null;
  lastPostFusionTimestamp: number | null;
  playerObservationCount: number;
  guildObservationCount: number;
};

export type FusionIdentityAliasOption = {
  entityType: FusionIdentityEntityType;
  identifier: string;
  name: string | null;
  server: string | null;
  firstSeen: number;
  lastSeen: number;
  linkedEntityId: string | null;
};

export type FusionIdentityManagementReport = {
  scope: FusionIdentityManagementScope;
  summary: FusionIdentityManagementSummary;
  items: FusionIdentityManagementItem[];
  currentAliases: FusionIdentityAliasOption[];
  historicalAliases: FusionIdentityAliasOption[];
};

export type FusionIdentityManagementStores = {
  playerStore?: PlayerIdentityManagementStore;
  guildStore?: GuildIdentityManagementStore;
};

type PlayerIdentityManagementStore = Pick<
  ReturnType<typeof createPlayerIdentityStore>,
  | "getPlayerIdentity"
  | "getPlayerAliases"
  | "isPlayerMatchRejected"
  | "listPlayerEntities"
  | "listPlayerExclusions"
  | "linkPlayerIdentifiers"
  | "rejectPlayerMatch"
  | "unlinkPlayerIdentifier"
>;

type GuildIdentityManagementStore = Pick<
  ReturnType<typeof createGuildIdentityStore>,
  | "getGuildEntityForAlias"
  | "getGuildAliases"
  | "isGuildLinkRejected"
  | "listGuildEntities"
  | "listGuildExclusions"
  | "linkGuildAliases"
  | "rejectGuildLink"
  | "unlinkGuildAlias"
>;

export type FusionIdentityManagementInput = FusionIdentityManagementStores & {
  snapshots: GuildHubLogicalScanSnapshot[];
};

export type FusionIdentityManagementBuildOptions = {
  onProgress?: (progress: FusionIdentityProgress) => void;
  enablePlayerLevelProgressionEvidence?: boolean;
  enablePlayerPortraitEvidence?: boolean;
  scope?: FusionIdentityAnalysisScope;
};

const ORIGIN_SERVER_CODES = ["EU1", "EU2", "EU3", "EU4"];
const TARGET_SERVER_CODE = "F28";
const ORIGIN_SERVER_CODE_SET = new Set(ORIGIN_SERVER_CODES);

const getFallbackFusionIdentityScope = (): FusionIdentityAnalysisScope => ({
  id: TARGET_SERVER_CODE,
  label: "EU1-EU4 -> F28",
  originServerCodes: ORIGIN_SERVER_CODES,
  originServerNames: ORIGIN_SERVER_CODES,
  targetServerCode: TARGET_SERVER_CODE,
  targetServerName: TARGET_SERVER_CODE,
});

const resolveBuildScope = (
  scope: FusionIdentityAnalysisScope | null | undefined,
) => scope ?? getDefaultFusionIdentityAnalysisScope() ?? getFallbackFusionIdentityScope();

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const dedupeGuildMatchedMembers = (members: GuildFusionMatchedMember[]) => {
  const byLogicalPair = new Map<string, GuildFusionMatchedMember>();
  members.forEach((member) => {
    const oldKey = normalizeIdentifierKey(member.oldIdentifier);
    const newKey = normalizeIdentifierKey(member.newIdentifier);
    const key =
      oldKey && newKey
        ? `${oldKey}\u0000${newKey}`
        : `${oldKey || member.oldIdentifier}\u0000${newKey || member.newIdentifier}`;
    if (!byLogicalPair.has(key)) byLogicalPair.set(key, member);
  });
  return [...byLogicalPair.values()].sort(
    (left, right) =>
      left.oldIdentifier.localeCompare(right.oldIdentifier, undefined, {
        numeric: true,
        sensitivity: "base",
      }) ||
      left.newIdentifier.localeCompare(right.newIdentifier, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
  );
};

const mergeGuildMigrationEdge = (
  existing: GuildFusionMigrationEdge,
  edge: GuildFusionMigrationEdge,
): GuildFusionMigrationEdge => {
  const bestEvidence =
    edge.matchedMemberCount > existing.matchedMemberCount ||
    (edge.matchedMemberCount === existing.matchedMemberCount &&
      Number(edge.mutualDominant) > Number(existing.mutualDominant))
      ? edge
      : existing;
  const matchedMembers = dedupeGuildMatchedMembers([
    ...(existing.matchedMembers ?? []),
    ...(edge.matchedMembers ?? []),
  ]);
  return {
    ...bestEvidence,
    matchedMemberCount: matchedMembers.length,
    matchedPlayers: matchedMembers,
    matchedMembers,
  };
};

const dedupeGuildMigrationEdgesByOldGuild = (
  edges: GuildFusionMigrationEdge[],
) => {
  const byOldGuild = new Map<string, GuildFusionMigrationEdge>();
  edges.forEach((edge) => {
    const key = normalizeIdentifierKey(edge.oldGuildIdentifier);
    const existing = byOldGuild.get(key);
    const matchedMembers = dedupeGuildMatchedMembers(
      edge.matchedMembers ?? edge.matchedPlayers ?? [],
    );
    byOldGuild.set(
      key,
      existing
        ? mergeGuildMigrationEdge(existing, edge)
        : {
            ...edge,
            matchedMemberCount: matchedMembers.length,
            matchedPlayers: matchedMembers,
            matchedMembers,
          },
    );
  });
  return [...byOldGuild.values()].sort(
    (left, right) =>
      right.matchedMemberCount - left.matchedMemberCount ||
      left.oldGuildIdentifier.localeCompare(
        right.oldGuildIdentifier,
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
  );
};

const resolveServerCode = (value: unknown) =>
  resolveServer(String(value ?? ""))?.code ?? null;

const sortNumbers = (values: number[]) =>
  values.filter(Number.isFinite).sort((left, right) => left - right);

const firstNumber = (values: number[]) => sortNumbers(values)[0] ?? null;
const lastNumber = (values: number[]) => {
  const sorted = sortNumbers(values);
  return sorted[sorted.length - 1] ?? null;
};

const toObservationSummary = (
  observation: PlayerFusionObservation,
): FusionIdentityObservationSummary => ({
  identifier: observation.identifier,
  name: observation.name,
  server: resolveServerCode(observation.server),
  timestamp: observation.timestamp,
  classId: observation.classId,
  level: observation.level,
  guildIdentifier: observation.guildIdentifier,
  guildName: observation.guildName,
});

const toGuildObservationSummary = (
  observation: GuildFusionObservation,
): FusionIdentityObservationSummary => ({
  identifier: observation.guildIdentifier,
  name: observation.name,
  server: observation.serverCode,
  timestamp: observation.timestamp,
});

const compareByLatestThenName = (
  left: FusionIdentityManagementItem,
  right: FusionIdentityManagementItem,
) =>
  right.lastSeen - left.lastSeen ||
  left.entityType.localeCompare(right.entityType) ||
  String(left.currentName ?? left.currentIdentifier).localeCompare(
    String(right.currentName ?? right.currentIdentifier),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );

const summarize = (
  items: FusionIdentityManagementItem[],
): FusionIdentityManagementSummary => ({
  total: items.length,
  ready: items.filter((item) => item.status === "ready").length,
  review: items.filter((item) => item.status === "review").length,
  unresolved: items.filter((item) => item.status === "unresolved").length,
  noHistoricalObservation: items.filter(
    (item) => item.status === "noHistoricalObservation",
  ).length,
  noHistory: items.filter((item) => item.status === "noHistory").length,
  completed: items.filter((item) => item.status === "completed").length,
  players: items.filter((item) => item.entityType === "player").length,
  guilds: items.filter((item) => item.entityType === "guild").length,
});

const emptyGuildMemberStatusSummary =
  (): FusionIdentityGuildMemberStatusSummary => ({
    totalMembers: 0,
    resolvedMembers: 0,
    readyMembers: 0,
    completedMembers: 0,
    reviewMembers: 0,
    unresolvedMembers: 0,
    noHistoricalObservationMembers: 0,
    noHistoricalDataMembers: 0,
    missingManagementEntries: 0,
    memberRefsByStatus: {
      review: [],
      unresolved: [],
      noHistoricalObservation: [],
      noHistory: [],
    },
  });

const createEmptyReport = (
  snapshots: GuildHubLogicalScanSnapshot[],
  scopeDefinition: FusionIdentityAnalysisScope = getFallbackFusionIdentityScope(),
  playerObservationCount = 0,
  guildObservationCount = 0,
): FusionIdentityManagementReport => ({
  scope: {
    label: scopeDefinition.label,
    originServerCodes: scopeDefinition.originServerCodes,
    targetServerCode: scopeDefinition.targetServerCode,
    allSnapshotCount: snapshots.length,
    historicalSnapshotCount: 0,
    postFusionSnapshotCount: 0,
    firstHistoricalTimestamp: null,
    lastHistoricalTimestamp: null,
    firstPostFusionTimestamp: null,
    lastPostFusionTimestamp: null,
    playerObservationCount,
    guildObservationCount,
  },
  summary: summarize([]),
  items: [],
  currentAliases: [],
  historicalAliases: [],
});

const groupPlayerObservations = (observations: PlayerFusionObservation[]) => {
  const byIdentifier = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.identifier);
    if (!key) return;
    byIdentifier.set(key, [...(byIdentifier.get(key) ?? []), observation]);
  });
  return byIdentifier;
};

const groupGuildObservations = (observations: GuildFusionObservation[]) => {
  const byIdentifier = new Map<string, GuildFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.guildIdentifier);
    if (!key) return;
    byIdentifier.set(key, [...(byIdentifier.get(key) ?? []), observation]);
  });
  return byIdentifier;
};

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ??
  null;

const toGuildMemberRef = (
  item: FusionIdentityManagementItem,
): FusionIdentityGuildMemberRef => ({
  identifier: item.currentIdentifier,
  name: item.currentName ?? item.currentIdentifier,
});

const attachGuildMemberStatusSummaries = (
  items: FusionIdentityManagementItem[],
  currentGuildsByIdentifier: Map<string, GuildFusionObservation[]>,
) => {
  const playerByIdentifier = new Map(
    items
      .filter((item) => item.entityType === "player")
      .map((item) => [normalizeIdentifierKey(item.currentIdentifier), item]),
  );

  items
    .filter((item) => item.entityType === "guild")
    .forEach((item) => {
      const latestGuildObservation = latestByTimestamp(
        currentGuildsByIdentifier.get(
          normalizeIdentifierKey(item.currentIdentifier),
        ) ?? [],
      );
      const memberKeys = [
        ...new Set(
          (latestGuildObservation?.memberIdentifiers ?? [])
            .map(normalizeIdentifierKey)
            .filter(Boolean),
        ),
      ];
      const summary = emptyGuildMemberStatusSummary();
      const observedMemberCount = memberKeys.length;
      const rosterMemberCount =
        latestGuildObservation?.memberCount != null &&
        Number.isFinite(latestGuildObservation.memberCount)
          ? Math.max(0, latestGuildObservation.memberCount)
          : observedMemberCount;
      summary.totalMembers = Math.max(observedMemberCount, rosterMemberCount);
      summary.missingManagementEntries = Math.max(
        0,
        summary.totalMembers - observedMemberCount,
      );

      memberKeys.forEach((memberKey) => {
        const playerItem = playerByIdentifier.get(memberKey);
        if (!playerItem) {
          summary.missingManagementEntries += 1;
          return;
        }

        if (playerItem.status === "ready") {
          summary.readyMembers += 1;
          summary.resolvedMembers += 1;
        } else if (playerItem.status === "completed") {
          summary.completedMembers += 1;
          summary.resolvedMembers += 1;
        } else if (playerItem.status === "review") {
          summary.reviewMembers += 1;
          summary.memberRefsByStatus.review.push(toGuildMemberRef(playerItem));
        } else if (playerItem.status === "noHistoricalObservation") {
          summary.noHistoricalObservationMembers += 1;
          summary.memberRefsByStatus.noHistoricalObservation.push(
            toGuildMemberRef(playerItem),
          );
        } else if (playerItem.status === "noHistory") {
          summary.noHistoricalDataMembers += 1;
          summary.memberRefsByStatus.noHistory.push(
            toGuildMemberRef(playerItem),
          );
        } else {
          summary.unresolvedMembers += 1;
          summary.memberRefsByStatus.unresolved.push(
            toGuildMemberRef(playerItem),
          );
        }
      });

      item.memberStatusSummary = summary;
    });
};

const buildAliasOptions = async (
  entityType: FusionIdentityEntityType,
  observations: Array<PlayerFusionObservation | GuildFusionObservation>,
  getLinkedEntityId: (identifier: string) => Promise<string | null>,
): Promise<FusionIdentityAliasOption[]> => {
  const grouped = new Map<
    string,
    Array<PlayerFusionObservation | GuildFusionObservation>
  >();
  observations.forEach((observation) => {
    const identifier =
      entityType === "guild"
        ? (observation as GuildFusionObservation).guildIdentifier
        : (observation as PlayerFusionObservation).identifier;
    const key = normalizeIdentifierKey(identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });

  return Promise.all(
    [...grouped.values()].map(async (group) => {
      const latest = latestByTimestamp(group);
      const firstSeen =
        firstNumber(group.map((observation) => observation.timestamp)) ?? 0;
      const lastSeen =
        lastNumber(group.map((observation) => observation.timestamp)) ??
        firstSeen;
      const identifier =
        latest && entityType === "guild"
          ? (latest as GuildFusionObservation).guildIdentifier
          : (latest as PlayerFusionObservation)?.identifier;
      const name =
        latest && entityType === "guild"
          ? latest.name
          : (latest as PlayerFusionObservation)?.name;
      const server =
        latest && entityType === "guild"
          ? (latest as GuildFusionObservation).serverCode
          : resolveServerCode((latest as PlayerFusionObservation)?.server);
      return {
        entityType,
        identifier: identifier ?? "",
        name: name ?? null,
        server,
        firstSeen,
        lastSeen,
        linkedEntityId: identifier ? await getLinkedEntityId(identifier) : null,
      };
    }),
  );
};

const buildHighConfidencePlayerMatches = (
  playerResults: PlayerFusionPlayerResult[],
): GuildFusionPlayerMatch[] =>
  playerResults.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = selectPlayerFusionReadyCandidates(result)[0];
    if (!candidate) return [];
    return [
      {
        oldIdentifier: candidate.oldIdentifier,
        oldName: candidate.oldName,
        newIdentifier: result.newIdentifier,
        newName: null,
      },
    ];
  });

const selectManagementPlayerCandidates = (
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

type IdentityStoreState = {
  aliasEntityIdByKey: Map<string, string>;
  aliasesByEntityId: Map<string, string[]>;
  rejectedPairKeys: Set<string>;
};

const createIdentityPairKey = (left: string, right: string) =>
  [normalizeIdentifierKey(left), normalizeIdentifierKey(right)]
    .sort()
    .join("::");

const loadPlayerIdentityState = async (
  store: PlayerIdentityManagementStore,
): Promise<IdentityStoreState> => {
  const [entities, exclusions] = await Promise.all([
    store.listPlayerEntities(),
    store.listPlayerExclusions(),
  ]);
  const aliasEntityIdByKey = new Map<string, string>();
  const aliasesByEntityId = new Map<string, string[]>();

  entities.forEach(({ entity, aliases }) => {
    aliasesByEntityId.set(
      entity.entityId,
      aliases.map((alias) => alias.identifier),
    );
    aliases.forEach((alias) => {
      aliasEntityIdByKey.set(alias.identifierKey, entity.entityId);
    });
  });

  return {
    aliasEntityIdByKey,
    aliasesByEntityId,
    rejectedPairKeys: new Set(exclusions.map((exclusion) => exclusion.pairKey)),
  };
};

const loadGuildIdentityState = async (
  store: GuildIdentityManagementStore,
): Promise<IdentityStoreState> => {
  const [entities, exclusions] = await Promise.all([
    store.listGuildEntities(),
    store.listGuildExclusions(),
  ]);
  const aliasEntityIdByKey = new Map<string, string>();
  const aliasesByEntityId = new Map<string, string[]>();

  entities.forEach(({ entity, aliases }) => {
    aliasesByEntityId.set(
      entity.entityId,
      aliases.map((alias) => alias.identifier),
    );
    aliases.forEach((alias) => {
      aliasEntityIdByKey.set(alias.identifierKey, entity.entityId);
    });
  });

  return {
    aliasEntityIdByKey,
    aliasesByEntityId,
    rejectedPairKeys: new Set(exclusions.map((exclusion) => exclusion.pairKey)),
  };
};

const readLinkedAliasesFromState = (
  state: IdentityStoreState,
  identifier: string,
) => {
  const entityId =
    state.aliasEntityIdByKey.get(normalizeIdentifierKey(identifier)) ?? null;
  return {
    entityId,
    aliases: entityId ? (state.aliasesByEntityId.get(entityId) ?? []) : [],
  };
};

const isRejectedByState = (
  state: IdentityStoreState,
  left: string,
  right: string,
) => state.rejectedPairKeys.has(createIdentityPairKey(left, right));

const isAssignedToOtherIdentity = (
  state: IdentityStoreState,
  historicalIdentifier: string,
  currentEntityId: string | null | undefined,
) => {
  const historicalEntityId = state.aliasEntityIdByKey.get(
    normalizeIdentifierKey(historicalIdentifier),
  );
  return Boolean(historicalEntityId && historicalEntityId !== currentEntityId);
};

const readLinkedAliases = async (
  getEntity: (identifier: string) => Promise<{ entityId: string } | null>,
  getAliases: (entityId: string) => Promise<string[]>,
  identifier: string,
) => {
  const entity = await getEntity(identifier);
  if (!entity) return { entityId: null, aliases: [] };
  return {
    entityId: entity.entityId,
    aliases: await getAliases(entity.entityId),
  };
};

const createAssignedHistoricalMap = async (
  items: Array<{
    currentIdentifier: string;
    historicalIdentifiers: string[];
    entityId: string | null;
  }>,
) => {
  const assignments = new Map<string, Set<string>>();
  items.forEach((item) => {
    if (!item.entityId) return;
    item.historicalIdentifiers.forEach((historicalIdentifier) => {
      const key = normalizeIdentifierKey(historicalIdentifier);
      if (!key) return;
      assignments.set(
        key,
        new Set([
          ...(assignments.get(key) ?? []),
          normalizeIdentifierKey(item.currentIdentifier),
        ]),
      );
    });
  });
  return assignments;
};

const hasAssignedToOther = (
  assignments: Map<string, Set<string>>,
  historicalIdentifier: string,
  currentIdentifier: string,
) => {
  const assigned = assignments.get(
    normalizeIdentifierKey(historicalIdentifier),
  );
  return Boolean(
    assigned &&
    [...assigned].some(
      (identifier) => identifier !== normalizeIdentifierKey(currentIdentifier),
    ),
  );
};

const READY_ASSIGNMENT_CONFLICT_REASON =
  "historical identity is claimed by multiple current identities";
const RESERVED_CANDIDATE_REMOVED_REASON =
  "one or more candidate identities are reserved by other ready assignments";

const appendReason = (item: FusionIdentityManagementItem, reason: string) => {
  if (item.reasons.includes(reason)) return;
  item.reasons = [...item.reasons, reason];
};

const appendReasonCode = (
  item: FusionIdentityManagementItem,
  reasonCode: FusionIdentityManagementReasonCode,
) => {
  if (item.reasonCodes.includes(reasonCode)) return;
  item.reasonCodes = [...item.reasonCodes, reasonCode];
  if (item.diagnostics && item.diagnostics.reasonCode !== reasonCode) {
    item.diagnostics = { ...item.diagnostics, reasonCode };
  }
};

const createPipelineDiagnostics = (
  result: PlayerFusionPlayerResult | null | undefined,
  candidatesAfterExclusions: number,
  candidatesAfterReservations: number,
  finalCandidates: number,
): FusionIdentityCandidatePipelineDiagnostics => ({
  historicalPoolSize: result?.diagnostics.historicalPoolSize ?? 0,
  candidatesGeneratedInitially:
    result?.diagnostics.candidatesGeneratedInitially ?? 0,
  candidatesAfterHardCompatibility:
    result?.diagnostics.candidatesAfterHardCompatibility ?? 0,
  candidatesAfterSemanticEvaluation:
    result?.diagnostics.candidatesAfterSemanticEvaluation ??
    result?.candidatesAfterHardFilters ??
    0,
  candidatesRejectedByLevelRegression:
    result?.candidates.filter((candidate) =>
      candidate.rejectReasons.includes("level-regression"),
    ).length ?? 0,
  candidatesRejectedByLevelProgression:
    result?.candidates.filter((candidate) =>
      candidate.rejectReasons.includes("level-progression-extreme"),
    ).length ?? 0,
  candidatesAfterExclusions,
  candidatesAfterReservations,
  finalCandidates,
});

const createPlayerDiagnostics = ({
  result,
  reasonCode,
  historicalSnapshotCount,
  candidatesAfterExclusions,
  candidatesAfterReservations,
  finalCandidates,
}: {
  result: PlayerFusionPlayerResult | null | undefined;
  reasonCode: FusionIdentityManagementReasonCode;
  historicalSnapshotCount: number;
  candidatesAfterExclusions: number;
  candidatesAfterReservations: number;
  finalCandidates: number;
}): FusionIdentityManagementDiagnostics => ({
  reasonCode,
  originServerCodes: result?.resolvedOriginServers ?? [],
  historicalSnapshotCount,
  reliableHistoricalLookup:
    result?.diagnostics.reliableHistoricalLookup ?? null,
  candidatePipeline: createPipelineDiagnostics(
    result,
    candidatesAfterExclusions,
    candidatesAfterReservations,
    finalCandidates,
  ),
});

const createGuildDiagnostics = (
  reasonCode: FusionIdentityManagementReasonCode,
  historicalSnapshotCount: number,
  pipeline: FusionIdentityCandidatePipelineDiagnostics,
  reliableHistoricalLookup: FusionIdentityHistoricalLookupDiagnostics | null = null,
  originServerCodes: string[] = ORIGIN_SERVER_CODES,
): FusionIdentityManagementDiagnostics => ({
  reasonCode,
  originServerCodes,
  historicalSnapshotCount,
  reliableHistoricalLookup,
  candidatePipeline: pipeline,
});

const hasSemanticContradiction = (candidates: FusionIdentityCandidate[]) =>
  candidates.some(
    (candidate) =>
      candidate.entityType === "player" &&
      candidate.evidence.rejectReasons.some(
        (reason) =>
          reason === "base-stat-regression" ||
          reason === "base-attributes-contradiction",
      ),
  );

const hasLevelRegression = (candidates: FusionIdentityCandidate[]) =>
  candidates.some(
    (candidate) =>
      candidate.entityType === "player" &&
      candidate.evidence.rejectReasons.some(
        (reason) => reason === "level-regression",
      ),
  );

const hasLevelProgressionContradiction = (
  candidates: FusionIdentityCandidate[],
) =>
  candidates.some(
    (candidate) =>
      candidate.entityType === "player" &&
      candidate.evidence.rejectReasons.includes("level-progression-extreme") &&
      !hasPlayerFusionHardContradiction(candidate.evidence),
  );

const hasRejectedCandidate = (candidates: FusionIdentityCandidate[]) =>
  candidates.some((candidate) => candidate.rejected);

const isActionableManagementCandidate = (candidate: FusionIdentityCandidate) =>
  candidate.entityType === "guild"
    ? isGuildFusionActionableIdentityCandidate(candidate.evidence)
    : isPlayerFusionActionableIdentityCandidate(candidate.evidence);

const insufficientEvidenceReasonCode = (
  entityType: FusionIdentityEntityType,
): FusionIdentityManagementReasonCode =>
  entityType === "guild"
    ? "insufficient-guild-evidence"
    : "insufficient-player-evidence";

const reviewReasonCodeForActionableCandidates = (
  entityType: FusionIdentityEntityType,
  candidates: FusionIdentityCandidate[],
): FusionIdentityManagementReasonCode => {
  if (
    candidates.some(
      (candidate) =>
        candidate.entityType === "guild" &&
        candidate.evidence.assignmentConflict,
    )
  ) {
    return "assignment-conflict";
  }
  return candidates.length === 1
    ? insufficientEvidenceReasonCode(entityType)
    : "multiple-relevant-candidates";
};

const managementReasonText = (
  entityType: FusionIdentityEntityType,
  reasonCode: FusionIdentityManagementReasonCode,
) => {
  if (reasonCode === "insufficient-guild-evidence") {
    return "likely historical guild found, but reliable guild/member continuity is insufficient for automatic linking";
  }
  if (reasonCode === "insufficient-player-evidence") {
    return "likely historical player found, but identity evidence is insufficient for automatic linking";
  }
  if (reasonCode === "multiple-relevant-candidates") {
    return entityType === "guild"
      ? "multiple relevant historical guild candidates require review"
      : "multiple relevant historical player candidates require review";
  }
  if (reasonCode === "no-actionable-candidate") {
    return entityType === "guild"
      ? "historical guild data exists, but no candidate has enough positive identity evidence for review"
      : "only weak compatibility matches were found; no candidate has enough identity evidence for review";
  }
  return null;
};

const sumOriginCoverage = (
  originServerCodes: string[],
  countsByServer: Map<string, number>,
) =>
  originServerCodes.reduce(
    (sum, server) => sum + (countsByServer.get(server) ?? 0),
    0,
  );

const itemAssignmentKey = (item: FusionIdentityManagementItem) =>
  `${item.entityType}:${normalizeIdentifierKey(item.currentIdentifier)}`;

const historicalAssignmentKey = (
  entityType: FusionIdentityEntityType,
  historicalIdentifier: string,
) => `${entityType}:${normalizeIdentifierKey(historicalIdentifier)}`;

const recomputeNonCompletedStatus = (item: FusionIdentityManagementItem) => {
  if (item.status === "completed") return;
  const activeCandidates = item.candidates.filter(
    (candidate) => !candidate.rejected && !candidate.assignedToOtherIdentity,
  );
  const activeActionableCandidates = activeCandidates.filter(
    isActionableManagementCandidate,
  );
  const activeReadyCandidates = activeActionableCandidates.filter(
    (candidate) =>
      candidate.ready ||
      (candidate.entityType === "player" &&
        isPlayerFusionReadyCandidate(candidate.evidence)),
  );

  if (item.readyCandidateIdentifier) {
    const readyCandidate = activeCandidates.find(
      (candidate) =>
        normalizeIdentifierKey(candidate.historicalIdentifier) ===
        normalizeIdentifierKey(item.readyCandidateIdentifier),
    );
    if (readyCandidate) {
      item.status = "ready";
      item.reasonCodes = [];
      return;
    }
  }

  item.readyCandidateIdentifier = null;
  if (item.reasons.includes(READY_ASSIGNMENT_CONFLICT_REASON)) {
    item.status = "review";
    appendReasonCode(item, "assignment-conflict");
    return;
  }

  if (activeReadyCandidates.length === 1) {
    item.status = "ready";
    item.readyCandidateIdentifier =
      activeReadyCandidates[0]?.historicalIdentifier ?? null;
    item.reasonCodes = [];
    return;
  }

  if (activeActionableCandidates.length) {
    item.status = "review";
    const existingConflict =
      item.reasonCodes.includes("assignment-conflict") ||
      item.reasons.includes(READY_ASSIGNMENT_CONFLICT_REASON);
    const nextReasonCode = existingConflict
      ? "assignment-conflict"
      : reviewReasonCodeForActionableCandidates(
          item.entityType,
          activeActionableCandidates,
        );
    item.reasonCodes = item.reasonCodes.filter(
      (reasonCode) => reasonCode === "reserved-by-other-identity",
    );
    appendReasonCode(item, nextReasonCode);
    return;
  }

  if (item.diagnostics) {
    item.diagnostics = {
      ...item.diagnostics,
      candidatePipeline: {
        ...item.diagnostics.candidatePipeline,
        candidatesAfterReservations: activeActionableCandidates.length,
        finalCandidates: item.candidates.length,
      },
    };
  }

  item.status =
    item.status === "noHistory" || item.status === "noHistoricalObservation"
      ? item.status
      : "unresolved";
};

const applyGlobalAssignmentResolution = (
  items: FusionIdentityManagementItem[],
) => {
  const readyByHistorical = new Map<string, FusionIdentityManagementItem[]>();
  items.forEach((item) => {
    if (item.status !== "ready" || !item.readyCandidateIdentifier) return;
    const key = historicalAssignmentKey(
      item.entityType,
      item.readyCandidateIdentifier,
    );
    readyByHistorical.set(key, [...(readyByHistorical.get(key) ?? []), item]);
  });

  const reservations = new Map<string, FusionIdentityManagementItem>();
  readyByHistorical.forEach((collidingItems) => {
    if (collidingItems.length === 1) {
      const item = collidingItems[0];
      if (item?.readyCandidateIdentifier) {
        reservations.set(
          historicalAssignmentKey(
            item.entityType,
            item.readyCandidateIdentifier,
          ),
          item,
        );
      }
      return;
    }

    collidingItems.forEach((item) => {
      item.status = "review";
      appendReason(item, READY_ASSIGNMENT_CONFLICT_REASON);
      item.readyCandidateIdentifier = null;
    });
  });

  items.forEach((item) => {
    if (item.status === "completed") return;

    const ownerCandidateKeys = new Set<string>();
    if (item.readyCandidateIdentifier) {
      ownerCandidateKeys.add(
        historicalAssignmentKey(item.entityType, item.readyCandidateIdentifier),
      );
    }

    let removedReservedCandidate = false;
    item.candidates = item.candidates.filter((candidate) => {
      const candidateKey = historicalAssignmentKey(
        item.entityType,
        candidate.historicalIdentifier,
      );
      const owner = reservations.get(candidateKey);
      if (!owner) return true;
      if (itemAssignmentKey(owner) === itemAssignmentKey(item)) return true;
      removedReservedCandidate = true;
      return false;
    });

    if (item.status === "ready" && item.readyCandidateIdentifier) {
      const readyKey = historicalAssignmentKey(
        item.entityType,
        item.readyCandidateIdentifier,
      );
      item.candidates = item.candidates.filter(
        (candidate) =>
          ownerCandidateKeys.has(
            historicalAssignmentKey(
              item.entityType,
              candidate.historicalIdentifier,
            ),
          ) ||
          historicalAssignmentKey(
            item.entityType,
            candidate.historicalIdentifier,
          ) === readyKey,
      );
    }

    if (removedReservedCandidate) {
      appendReason(item, RESERVED_CANDIDATE_REMOVED_REASON);
      appendReasonCode(item, "reserved-by-other-identity");
    }
    recomputeNonCompletedStatus(item);
  });

  items.forEach((item) => {
    if (item.status === "ready" || item.status === "completed") {
      item.reasonCodes = [];
    }
  });
};

const buildPlayerItems = async (
  currentObservationsByIdentifier: Map<string, PlayerFusionObservation[]>,
  playerResults: PlayerFusionPlayerResult[],
  stores: { playerStore: PlayerIdentityManagementStore },
  identityState: IdentityStoreState,
  historicalPlayerSnapshotCountsByServer: Map<string, number>,
) => {
  const currentLinkReads = [...currentObservationsByIdentifier.values()].map(
    (observations) => {
      const latest = latestByTimestamp(observations);
      const currentIdentifier =
        latest?.identifier ?? observations[0]?.identifier ?? "";
      const linked = readLinkedAliasesFromState(
        identityState,
        currentIdentifier,
      );
      return {
        currentIdentifier,
        entityId: linked.entityId,
        historicalIdentifiers: linked.aliases.filter(
          (alias) =>
            normalizeIdentifierKey(alias) !==
            normalizeIdentifierKey(currentIdentifier),
        ),
        aliases: linked.aliases,
      };
    },
  );
  const resultByIdentifier = new Map(
    playerResults.map((result) => [
      normalizeIdentifierKey(result.newIdentifier),
      result,
    ]),
  );

  return Promise.all(
    [...currentObservationsByIdentifier.entries()].map(
      async ([key, observations]): Promise<FusionIdentityManagementItem> => {
        const latest = latestByTimestamp(observations);
        const result = resultByIdentifier.get(key);
        const currentIdentifier =
          latest?.identifier ?? result?.newIdentifier ?? key;
        const linked = currentLinkReads.find(
          (entry) =>
            normalizeIdentifierKey(entry.currentIdentifier) ===
            normalizeIdentifierKey(currentIdentifier),
        );
        const completedAliases = linked?.aliases ?? [];
        const completedHistorical = linked?.historicalIdentifiers ?? [];

        const toCandidate = (
          candidate: PlayerFusionCandidate,
        ): FusionIdentityCandidate => {
          const rejected =
            candidate.rejected ||
            isRejectedByState(
              identityState,
              currentIdentifier,
              candidate.oldIdentifier,
            );
          const assignedToOtherIdentity = isAssignedToOtherIdentity(
            identityState,
            candidate.oldIdentifier,
            linked?.entityId,
          );
          const resolverReady = Boolean(
            result &&
            selectPlayerFusionReadyCandidates(result).some(
              (readyCandidate) =>
                readyCandidate.oldIdentifier === candidate.oldIdentifier,
            ),
          );
          return {
            entityType: "player",
            historicalIdentifier: candidate.oldIdentifier,
            historicalName: candidate.oldName,
            historicalServer: candidate.oldServer,
            ready: !rejected && !assignedToOtherIdentity && resolverReady,
            rejected,
            assignedToOtherIdentity,
            evidence: candidate,
          };
        };
        const allCandidates = (result?.candidates ?? []).map(toCandidate);
        const displayCandidateKeys = new Set(
          selectManagementPlayerCandidates(result?.candidates ?? []).map(
            (candidate) => normalizeIdentifierKey(candidate.oldIdentifier),
          ),
        );
        const candidates = allCandidates.filter(
          (candidate) =>
            displayCandidateKeys.has(
              normalizeIdentifierKey(candidate.historicalIdentifier),
            ) && !candidate.assignedToOtherIdentity,
        );
        const readyCandidate = allCandidates.filter(
          (candidate) => candidate.ready,
        );
        const activeCandidates = allCandidates.filter(
          (candidate) =>
            !candidate.rejected && !candidate.assignedToOtherIdentity,
        );
        const activeActionableCandidates = activeCandidates.filter(
          isActionableManagementCandidate,
        );
        const originServerCodes = result?.resolvedOriginServers ?? [];
        const historicalSnapshotCount = sumOriginCoverage(
          originServerCodes,
          historicalPlayerSnapshotCountsByServer,
        );
        const reliableLookup =
          result?.diagnostics.reliableHistoricalLookup ?? null;
        const hasHistoricalScanCoverage = historicalSnapshotCount > 0;
        const candidatesAfterExclusions = allCandidates.filter(
          (candidate) => !candidate.rejected,
        ).length;
        const reasonCode: FusionIdentityManagementReasonCode =
          completedHistorical.length
            ? "no-viable-candidate"
            : readyCandidate.length === 1
              ? "no-viable-candidate"
              : activeActionableCandidates.length
                ? reviewReasonCodeForActionableCandidates(
                    "player",
                    activeActionableCandidates,
                  )
                : activeCandidates.length
                  ? "no-actionable-candidate"
                  : result?.status === "no-predecessor" ||
                      (originServerCodes.length > 0 &&
                        !hasHistoricalScanCoverage)
                    ? "no-historical-scans"
                    : reliableLookup &&
                        hasHistoricalScanCoverage &&
                        reliableLookup.compatibleClassObservationCount === 0
                      ? "no-historical-observation"
                      : hasLevelRegression(allCandidates)
                        ? "level-regression"
                        : hasLevelProgressionContradiction(allCandidates)
                          ? "level-progression-contradiction"
                          : hasSemanticContradiction(allCandidates)
                            ? "semantic-contradictions"
                            : hasRejectedCandidate(allCandidates)
                              ? "rejected-by-exclusion"
                              : "no-viable-candidate";
        const status: FusionIdentityManagementStatus =
          completedHistorical.length
            ? "completed"
            : readyCandidate.length === 1
              ? "ready"
              : activeActionableCandidates.length
                ? "review"
                : reasonCode === "no-historical-scans"
                  ? "noHistory"
                  : reasonCode === "no-historical-observation"
                    ? "noHistoricalObservation"
                    : "unresolved";
        const managementReason = managementReasonText("player", reasonCode);

        return {
          id: `player:${normalizeIdentifierKey(currentIdentifier)}`,
          entityType: "player",
          status,
          currentIdentifier,
          currentName: latest?.name ?? result?.newIdentifier ?? null,
          currentServer: resolveServerCode(
            latest?.server ?? result?.currentServer,
          ),
          observations: observations
            .map(toObservationSummary)
            .sort((left, right) => left.timestamp - right.timestamp),
          firstSeen:
            firstNumber(
              observations.map((observation) => observation.timestamp),
            ) ?? 0,
          lastSeen:
            lastNumber(
              observations.map((observation) => observation.timestamp),
            ) ?? 0,
          historicalIdentifiers: completedHistorical,
          candidates,
          memberMigrationEdges: [],
          reasons: [
            ...(result?.reasons ?? []),
            ...(managementReason ? [managementReason] : []),
            ...(reasonCode === "no-historical-observation"
              ? [
                  "no matching historical player observation in covered origin scans",
                ]
              : reasonCode === "level-regression"
                ? [
                    "no viable identity remained after reliable level continuity checks",
                  ]
                : reasonCode === "level-progression-contradiction"
                  ? [
                      "no viable identity remained after compensation-adjusted level progression checks",
                    ]
                  : reasonCode === "semantic-contradictions"
                    ? [
                        "no viable identity remained after semantic consistency checks",
                      ]
                    : reasonCode === "rejected-by-exclusion"
                      ? ["no remaining candidate after exclusions"]
                      : reasonCode === "no-actionable-candidate"
                        ? []
                        : reasonCode === "insufficient-player-evidence" ||
                            reasonCode === "multiple-relevant-candidates"
                          ? []
                          : []),
          ],
          reasonCodes:
            status === "ready" || status === "completed" ? [] : [reasonCode],
          diagnostics: createPlayerDiagnostics({
            result,
            reasonCode,
            historicalSnapshotCount,
            candidatesAfterExclusions,
            candidatesAfterReservations: activeActionableCandidates.length,
            finalCandidates: candidates.length,
          }),
          readyCandidateIdentifier:
            status === "ready"
              ? (readyCandidate[0]?.historicalIdentifier ?? null)
              : null,
          completedEntityId: linked?.entityId ?? null,
          completedAliases,
        };
      },
    ),
  );
};

const buildGuildItems = async (
  currentObservationsByIdentifier: Map<string, GuildFusionObservation[]>,
  guildResults: GuildFusionGuildResult[],
  stores: { guildStore: GuildIdentityManagementStore },
  identityState: IdentityStoreState,
  historicalGuildSnapshotCount: number,
  originServerCodes: string[],
) => {
  const currentLinkReads = [...currentObservationsByIdentifier.values()].map(
    (observations) => {
      const latest = latestByTimestamp(observations);
      const currentIdentifier =
        latest?.guildIdentifier ?? observations[0]?.guildIdentifier ?? "";
      const linked = readLinkedAliasesFromState(
        identityState,
        currentIdentifier,
      );
      return {
        currentIdentifier,
        entityId: linked.entityId,
        historicalIdentifiers: linked.aliases.filter(
          (alias) =>
            normalizeIdentifierKey(alias) !==
            normalizeIdentifierKey(currentIdentifier),
        ),
        aliases: linked.aliases,
      };
    },
  );
  const resultsByIdentifier = new Map<string, GuildFusionGuildResult[]>();
  guildResults.forEach((result) => {
    const key = normalizeIdentifierKey(result.newGuild.guildIdentifier);
    resultsByIdentifier.set(key, [
      ...(resultsByIdentifier.get(key) ?? []),
      result,
    ]);
  });

  return Promise.all(
    [...currentObservationsByIdentifier.entries()].map(
      async ([key, observations]): Promise<FusionIdentityManagementItem> => {
        const latest = latestByTimestamp(observations);
        const currentIdentifier = latest?.guildIdentifier ?? key;
        const linked = currentLinkReads.find(
          (entry) =>
            normalizeIdentifierKey(entry.currentIdentifier) ===
            normalizeIdentifierKey(currentIdentifier),
        );
        const completedAliases = linked?.aliases ?? [];
        const completedHistorical = linked?.historicalIdentifiers ?? [];
        const results = resultsByIdentifier.get(key) ?? [];
        const rawCandidates = results.flatMap(
          (result) => result.identityCandidates,
        );
        const migrationEdges = dedupeGuildMigrationEdgesByOldGuild(
          results.flatMap((result) => result.memberMigrationEdges),
        );
        const reliableGuildLookup =
          results
            .map((result) => result.reliableHistoricalLookup)
            .find(
              (
                lookup,
              ): lookup is NonNullable<
                GuildFusionGuildResult["reliableHistoricalLookup"]
              > => Boolean(lookup),
            ) ?? null;
        const reliableHistoricalLookup: FusionIdentityHistoricalLookupDiagnostics | null =
          reliableGuildLookup
            ? {
                type: "guild-fusion-base-name",
                originServer: reliableGuildLookup.originServer,
                baseName: reliableGuildLookup.baseName,
                matchingObservationCount:
                  reliableGuildLookup.matchingObservationCount,
              }
            : null;
        const candidateByOld = new Map<string, GuildFusionCandidate>();
        rawCandidates.forEach((candidate) => {
          const candidateKey = normalizeIdentifierKey(
            candidate.oldGuildIdentifier,
          );
          const existing = candidateByOld.get(candidateKey);
          if (
            !existing ||
            getGuildFusionClassificationRank(candidate.classification) >
              getGuildFusionClassificationRank(existing.classification) ||
            Number(candidate.autoEligible) > Number(existing.autoEligible) ||
            candidate.matchedMemberCount > existing.matchedMemberCount
          ) {
            candidateByOld.set(candidateKey, candidate);
          }
        });

        const allCandidates = [...candidateByOld.values()].map(
          (candidate): FusionIdentityCandidate => {
            const rejected = isRejectedByState(
              identityState,
              currentIdentifier,
              candidate.oldGuildIdentifier,
            );
            const assignedToOtherIdentity = isAssignedToOtherIdentity(
              identityState,
              candidate.oldGuildIdentifier,
              linked?.entityId,
            );
            return {
              entityType: "guild",
              historicalIdentifier: candidate.oldGuildIdentifier,
              historicalName: candidate.oldName,
              historicalServer: candidate.oldServer,
              ready:
                !rejected &&
                !assignedToOtherIdentity &&
                isGuildFusionReadyCandidate(candidate) &&
                candidate.autoEligible,
              rejected,
              assignedToOtherIdentity,
              evidence: candidate,
            };
          },
        );
        const candidates = allCandidates.filter(
          (candidate) => !candidate.assignedToOtherIdentity,
        );
        const activeCandidates = allCandidates.filter(
          (candidate) =>
            !candidate.rejected && !candidate.assignedToOtherIdentity,
        );
        const activeActionableCandidates = activeCandidates.filter(
          isActionableManagementCandidate,
        );
        const readyCandidateIdentifiers = new Set(
          activeActionableCandidates
            .filter((candidate) => candidate.ready)
            .map((candidate) => candidate.historicalIdentifier),
        );
        const plausibleIdentityIdentifiers = new Set(
          activeActionableCandidates.map(
            (candidate) => candidate.historicalIdentifier,
          ),
        );
        const hasOnlyOnePlausibleIdentity =
          plausibleIdentityIdentifiers.size === 1;
        const hasConsistentAutoIdentity =
          readyCandidateIdentifiers.size === 1 && hasOnlyOnePlausibleIdentity;
        const hasHistoricalData =
          results.some((result) => result.status !== "noHistoricalData") ||
          rawCandidates.length > 0 ||
          migrationEdges.length > 0;
        const hasReliableMissingHistoricalObservation =
          Boolean(reliableHistoricalLookup) &&
          reliableHistoricalLookup?.matchingObservationCount === 0;
        const reasonCode: FusionIdentityManagementReasonCode =
          completedHistorical.length
            ? "no-viable-candidate"
            : hasConsistentAutoIdentity
              ? "no-viable-candidate"
              : activeActionableCandidates.length
                ? reviewReasonCodeForActionableCandidates(
                    "guild",
                    activeActionableCandidates,
                  )
                : activeCandidates.length
                  ? "no-actionable-candidate"
                  : hasReliableMissingHistoricalObservation
                    ? "no-historical-observation"
                    : hasHistoricalData
                      ? "no-actionable-candidate"
                      : "no-historical-scans";
        const status: FusionIdentityManagementStatus =
          completedHistorical.length
            ? "completed"
            : hasConsistentAutoIdentity
              ? "ready"
              : activeActionableCandidates.length
                ? "review"
                : hasReliableMissingHistoricalObservation
                  ? "noHistoricalObservation"
                  : hasHistoricalData
                    ? "unresolved"
                    : "noHistory";
        const managementReason = managementReasonText("guild", reasonCode);

        return {
          id: `guild:${normalizeIdentifierKey(currentIdentifier)}`,
          entityType: "guild",
          status,
          currentIdentifier,
          currentName: latest?.name ?? null,
          currentServer: latest?.serverCode ?? null,
          observations: observations
            .map(toGuildObservationSummary)
            .sort((left, right) => left.timestamp - right.timestamp),
          firstSeen:
            firstNumber(
              observations.map((observation) => observation.timestamp),
            ) ?? 0,
          lastSeen:
            lastNumber(
              observations.map((observation) => observation.timestamp),
            ) ?? 0,
          historicalIdentifiers: completedHistorical,
          candidates,
          memberMigrationEdges: migrationEdges,
          reasons: [
            ...new Set([
              ...results.flatMap((result) => result.reasons),
              ...(managementReason ? [managementReason] : []),
            ]),
          ],
          reasonCodes:
            status === "ready" || status === "completed" ? [] : [reasonCode],
          diagnostics: createGuildDiagnostics(
            reasonCode,
            historicalGuildSnapshotCount,
            {
              historicalPoolSize: results.length,
              candidatesGeneratedInitially: rawCandidates.length,
              candidatesAfterHardCompatibility: rawCandidates.length,
              candidatesAfterSemanticEvaluation: rawCandidates.length,
              candidatesRejectedByLevelRegression: 0,
              candidatesRejectedByLevelProgression: 0,
              candidatesAfterExclusions: allCandidates.filter(
                (candidate) => !candidate.rejected,
              ).length,
              candidatesAfterReservations: activeActionableCandidates.length,
              finalCandidates: candidates.length,
            },
            reliableHistoricalLookup,
            originServerCodes,
          ),
          readyCandidateIdentifier:
            status === "ready"
              ? ([...readyCandidateIdentifiers][0] ?? null)
              : null,
          completedEntityId: linked?.entityId ?? null,
          completedAliases,
        };
      },
    ),
  );
};

export async function buildFusionIdentityManagementReportFromSnapshots(
  input: FusionIdentityManagementInput,
  options: FusionIdentityManagementBuildOptions = {},
): Promise<FusionIdentityManagementReport> {
  const emitProgress = options.onProgress ?? (() => undefined);
  const scopeDefinition = resolveBuildScope(options.scope);
  const originServerCodeSet = new Set(scopeDefinition.originServerCodes);
  const targetServerCode = scopeDefinition.targetServerCode;
  const snapshots = [...input.snapshots].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  emitProgress({
    phase: "preparing",
    current: snapshots.length,
    total: snapshots.length,
    message: `Preparing ${snapshots.length} local scan snapshots`,
  });
  const playerStore: PlayerIdentityManagementStore = input.playerStore ?? {
    getPlayerIdentity,
    getPlayerAliases,
    isPlayerMatchRejected,
    listPlayerEntities,
    listPlayerExclusions,
    linkPlayerIdentifiers,
    rejectPlayerMatch,
    unlinkPlayerIdentifier,
  };
  const guildStore: GuildIdentityManagementStore = input.guildStore ?? {
    getGuildEntityForAlias,
    getGuildAliases,
    isGuildLinkRejected,
    listGuildEntities,
    listGuildExclusions,
    linkGuildAliases,
    rejectGuildLink,
    unlinkGuildAlias,
  };
  const allPlayerObservations: PlayerFusionObservation[] = [];
  const allGuildObservations: GuildFusionObservation[] = [];
  const postFusionSnapshots: GuildHubLogicalScanSnapshot[] = [];
  const historicalSnapshots: GuildHubLogicalScanSnapshot[] = [];
  const historicalPlayerSnapshotCountsByServer = new Map<string, number>();
  const historicalGuildSnapshotServers = new Set<string>();

  snapshots.forEach((snapshot, index) => {
    const players = createFusionIdentityObservations(snapshot);
    const guilds = createFusionIdentityGuildObservations(snapshot);
    allPlayerObservations.push(...players);
    allGuildObservations.push(...guilds);

    const hasPostFusionData =
      players.some(
        (observation) =>
          resolveServerCode(observation.server) === targetServerCode,
      ) ||
      guilds.some(
        (observation) => observation.serverCode === targetServerCode,
      );
    const hasHistoricalData =
      players.some((observation) =>
        originServerCodeSet.has(resolveServerCode(observation.server) ?? ""),
      ) ||
      guilds.some((observation) =>
        originServerCodeSet.has(observation.serverCode ?? ""),
      );
    if (hasPostFusionData) postFusionSnapshots.push(snapshot);
    if (hasHistoricalData) {
      historicalSnapshots.push(snapshot);
      new Set(
        players
          .map((observation) => resolveServerCode(observation.server))
          .filter((server): server is string =>
            originServerCodeSet.has(server ?? ""),
          ),
      ).forEach((server) =>
        historicalPlayerSnapshotCountsByServer.set(
          server,
          (historicalPlayerSnapshotCountsByServer.get(server) ?? 0) + 1,
        ),
      );
      new Set(
        guilds
          .map((observation) => observation.serverCode)
          .filter((server): server is string =>
            originServerCodeSet.has(server ?? ""),
          ),
      ).forEach((server) =>
        historicalGuildSnapshotServers.add(`${server}:${snapshot.timestampMs}`),
      );
    }

    emitProgress({
      phase: "normalizing",
      current: index + 1,
      total: snapshots.length,
      message: "Normalizing local scan snapshots",
    });
  });

  const historicalPlayerObservations = allPlayerObservations.filter(
    (observation) =>
      originServerCodeSet.has(resolveServerCode(observation.server) ?? ""),
  );
  const currentPlayerObservations = allPlayerObservations.filter(
    (observation) =>
      resolveServerCode(observation.server) === targetServerCode,
  );
  const historicalGuildObservations = allGuildObservations.filter(
    (observation) => originServerCodeSet.has(observation.serverCode ?? ""),
  );
  const currentGuildObservations = allGuildObservations.filter(
    (observation) => observation.serverCode === targetServerCode,
  );

  if (!currentPlayerObservations.length && !currentGuildObservations.length) {
    return createEmptyReport(
      snapshots,
      scopeDefinition,
      allPlayerObservations.length,
      allGuildObservations.length,
    );
  }

  const currentPlayersByIdentifier = groupPlayerObservations(
    currentPlayerObservations,
  );
  emitProgress({
    phase: "player-histories",
    current: currentPlayersByIdentifier.size,
    total: currentPlayersByIdentifier.size,
    message: "Building player observation histories",
  });

  emitProgress({
    phase: "player-resolution",
    current: 0,
    total: currentPlayersByIdentifier.size,
    message: "Resolving player identities",
  });
  const playerResults = resolvePlayerFusions({
    historicalObservations: historicalPlayerObservations,
    newObservations: currentPlayerObservations,
    enableLevelProgressionEvidence:
      options.enablePlayerLevelProgressionEvidence,
    enablePortraitEvidence: options.enablePlayerPortraitEvidence,
  }).results;
  emitProgress({
    phase: "player-resolution",
    current: playerResults.length,
    total: currentPlayersByIdentifier.size,
    message: "Resolved player identities",
  });

  const highConfidencePlayerMatches =
    buildHighConfidencePlayerMatches(playerResults);
  const currentGuildsByIdentifier = groupGuildObservations(
    currentGuildObservations,
  );
  const guildResults: GuildFusionGuildResult[] = [];
  postFusionSnapshots.forEach((snapshot, index) => {
    const snapshotTimestamp = snapshot.timestampMs;
    const newGuildObservations = createFusionIdentityGuildObservations(
      snapshot,
    ).filter((observation) => observation.serverCode === targetServerCode);
    if (newGuildObservations.length) {
      guildResults.push(
        ...resolveGuildFusions({
          historicalGuildObservations: historicalGuildObservations.filter(
            (observation) => observation.timestamp < snapshotTimestamp,
          ),
          newGuildObservations,
          highConfidencePlayerMatches,
        }).results,
      );
    }
    emitProgress({
      phase: "guild-resolution",
      current: index + 1,
      total: postFusionSnapshots.length,
      message: "Resolving guild identities",
    });
  });

  emitProgress({
    phase: "assignment",
    message: "Reading confirmed identity links and exclusions",
  });
  const [playerIdentityState, guildIdentityState] = await Promise.all([
    loadPlayerIdentityState(playerStore),
    loadGuildIdentityState(guildStore),
  ]);

  emitProgress({ phase: "report", message: "Building management report" });
  const [
    playerItems,
    guildItems,
    currentPlayerAliases,
    historicalPlayerAliases,
    currentGuildAliases,
    historicalGuildAliases,
  ] = await Promise.all([
    buildPlayerItems(
      currentPlayersByIdentifier,
      playerResults,
      { playerStore },
      playerIdentityState,
      historicalPlayerSnapshotCountsByServer,
    ),
    buildGuildItems(
      currentGuildsByIdentifier,
      guildResults,
      { guildStore },
      guildIdentityState,
      historicalGuildSnapshotServers.size,
      scopeDefinition.originServerCodes,
    ),
    buildAliasOptions(
      "player",
      currentPlayerObservations,
      async (identifier) =>
        readLinkedAliasesFromState(playerIdentityState, identifier).entityId,
    ),
    buildAliasOptions(
      "player",
      historicalPlayerObservations,
      async (identifier) =>
        readLinkedAliasesFromState(playerIdentityState, identifier).entityId,
    ),
    buildAliasOptions(
      "guild",
      currentGuildObservations,
      async (identifier) =>
        readLinkedAliasesFromState(guildIdentityState, identifier).entityId,
    ),
    buildAliasOptions(
      "guild",
      historicalGuildObservations,
      async (identifier) =>
        readLinkedAliasesFromState(guildIdentityState, identifier).entityId,
    ),
  ]);

  const items = [...playerItems, ...guildItems];
  emitProgress({
    phase: "assignment",
    message: "Applying global ready reservations",
  });
  applyGlobalAssignmentResolution(items);
  attachGuildMemberStatusSummaries(items, currentGuildsByIdentifier);
  items.sort(compareByLatestThenName);

  return {
    scope: {
      label: scopeDefinition.label,
      originServerCodes: scopeDefinition.originServerCodes,
      targetServerCode: scopeDefinition.targetServerCode,
      allSnapshotCount: snapshots.length,
      historicalSnapshotCount: historicalSnapshots.length,
      postFusionSnapshotCount: postFusionSnapshots.length,
      firstHistoricalTimestamp: firstNumber(
        historicalSnapshots.map((snapshot) => snapshot.timestampMs),
      ),
      lastHistoricalTimestamp: lastNumber(
        historicalSnapshots.map((snapshot) => snapshot.timestampMs),
      ),
      firstPostFusionTimestamp: firstNumber(
        postFusionSnapshots.map((snapshot) => snapshot.timestampMs),
      ),
      lastPostFusionTimestamp: lastNumber(
        postFusionSnapshots.map((snapshot) => snapshot.timestampMs),
      ),
      playerObservationCount: allPlayerObservations.length,
      guildObservationCount: allGuildObservations.length,
    },
    summary: summarize(items),
    items,
    currentAliases: [...currentPlayerAliases, ...currentGuildAliases].sort(
      (left, right) => right.lastSeen - left.lastSeen,
    ),
    historicalAliases: [
      ...historicalPlayerAliases,
      ...historicalGuildAliases,
    ].sort((left, right) => right.lastSeen - left.lastSeen),
  };
}

export async function loadFusionIdentityManagementReport(
  stores: FusionIdentityManagementStores = {},
  options: FusionIdentityManagementBuildOptions = {},
): Promise<FusionIdentityManagementReport> {
  const scopeDefinition = resolveBuildScope(options.scope);
  options.onProgress?.({ phase: "loading", message: "Loading local scans" });
  const scans = await listSfDataHubLocalScansReadOnly();
  options.onProgress?.({
    phase: "preparing",
    current: 0,
    total: scans.length,
    message: "Preparing fusion scan pool",
  });
  const snapshots: GuildHubLogicalScanSnapshot[] = [];
  scans.forEach((scan, index) => {
    snapshots.push(...deriveGuildHubLogicalScanSnapshots(scan));
    options.onProgress?.({
      phase: "preparing",
      current: index + 1,
      total: scans.length,
      message: "Preparing fusion scan pool",
    });
  });
  const scopedSnapshots = snapshots.filter((snapshot) => {
    const players = createFusionIdentityObservations(snapshot);
    const guilds = createFusionIdentityGuildObservations(snapshot);
    return (
      players.some((observation) =>
        isServerInFusionIdentityScope(
          scopeDefinition,
          resolveServerCode(observation.server),
        ),
      ) ||
      guilds.some((observation) =>
        isServerInFusionIdentityScope(scopeDefinition, observation.serverCode),
      )
    );
  });
  return buildFusionIdentityManagementReportFromSnapshots(
    { snapshots: scopedSnapshots, ...stores },
    { ...options, scope: scopeDefinition },
  );
}

export async function confirmFusionIdentityLink(
  entityType: FusionIdentityEntityType,
  currentIdentifier: string,
  historicalIdentifier: string,
  options: FusionIdentityManagementStores & {
    source?: PlayerAliasSource | GuildAliasSource;
  } = {},
) {
  const confirmedAt = new Date().toISOString();
  if (entityType === "player") {
    const store = options.playerStore ?? { linkPlayerIdentifiers };
    return store.linkPlayerIdentifiers(
      currentIdentifier,
      historicalIdentifier,
      {
        source: (options.source as PlayerAliasSource | undefined) ?? "manual",
        confirmedAt,
      },
    );
  }

  const store = options.guildStore ?? { linkGuildAliases };
  return store.linkGuildAliases(currentIdentifier, historicalIdentifier, {
    source: (options.source as GuildAliasSource | undefined) ?? "manual",
    confirmedAt,
  });
}

export async function rejectFusionIdentityCandidate(
  entityType: FusionIdentityEntityType,
  currentIdentifier: string,
  historicalIdentifier: string,
  options: FusionIdentityManagementStores = {},
) {
  if (entityType === "player") {
    const store = options.playerStore ?? { rejectPlayerMatch };
    return store.rejectPlayerMatch(currentIdentifier, historicalIdentifier, {
      source: "manual",
    });
  }

  const store = options.guildStore ?? { rejectGuildLink };
  return store.rejectGuildLink(currentIdentifier, historicalIdentifier, {
    source: "manual",
  });
}

export async function unlinkFusionIdentityAlias(
  entityType: FusionIdentityEntityType,
  identifier: string,
  options: FusionIdentityManagementStores = {},
) {
  if (entityType === "player") {
    const store = options.playerStore ?? { unlinkPlayerIdentifier };
    await store.unlinkPlayerIdentifier(identifier);
    return;
  }

  const store = options.guildStore ?? { unlinkGuildAlias };
  await store.unlinkGuildAlias(identifier);
}

export async function mergeReadyFusionIdentityItems(
  report: FusionIdentityManagementReport,
  options: FusionIdentityManagementStores = {},
) {
  const readyItems = report.items.filter(
    (item) => item.status === "ready" && item.readyCandidateIdentifier,
  );
  const result = {
    players: 0,
    guilds: 0,
    errors: [] as Array<{ itemId: string; message: string }>,
  };

  for (const item of readyItems) {
    try {
      await confirmFusionIdentityLink(
        item.entityType,
        item.currentIdentifier,
        item.readyCandidateIdentifier ?? "",
        {
          ...options,
          source: "automatic",
        },
      );
      if (item.entityType === "player") result.players += 1;
      else result.guilds += 1;
    } catch (error) {
      result.errors.push({
        itemId: item.id,
        message: error instanceof Error ? error.message : "merge_failed",
      });
    }
  }

  return result;
}
