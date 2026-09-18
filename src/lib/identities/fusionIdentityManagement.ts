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
  resolveGuildFusions,
  type GuildFusionCandidate,
  type GuildFusionMigrationEdge,
  type GuildFusionPlayerMatch,
  type GuildFusionGuildResult,
  type GuildFusionObservation,
} from "./guildFusionResolver";
import {
  resolvePlayerFusions,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "./playerFusionResolver";

export type FusionIdentityEntityType = "player" | "guild";
export type FusionIdentityManagementStatus =
  | "ready"
  | "review"
  | "unresolved"
  | "noHistory"
  | "completed";

export type FusionIdentityObservationSummary = {
  identifier: string;
  name: string | null;
  server: string | null;
  timestamp: number;
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
  reasons: string[];
  readyCandidateIdentifier: string | null;
  completedEntityId: string | null;
  completedAliases: string[];
};

export type FusionIdentityManagementSummary = {
  total: number;
  ready: number;
  review: number;
  unresolved: number;
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

const ORIGIN_SERVER_CODES = ["EU1", "EU2", "EU3", "EU4"];
const TARGET_SERVER_CODE = "F28";
const ORIGIN_SERVER_CODE_SET = new Set(ORIGIN_SERVER_CODES);

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const sortNumbers = (values: number[]) => values.filter(Number.isFinite).sort((left, right) => left - right);

const firstNumber = (values: number[]) => sortNumbers(values)[0] ?? null;
const lastNumber = (values: number[]) => {
  const sorted = sortNumbers(values);
  return sorted[sorted.length - 1] ?? null;
};

const toObservationSummary = (observation: PlayerFusionObservation): FusionIdentityObservationSummary => ({
  identifier: observation.identifier,
  name: observation.name,
  server: resolveServerCode(observation.server),
  timestamp: observation.timestamp,
  guildIdentifier: observation.guildIdentifier,
  guildName: observation.guildName,
});

const toGuildObservationSummary = (observation: GuildFusionObservation): FusionIdentityObservationSummary => ({
  identifier: observation.guildIdentifier,
  name: observation.name,
  server: observation.serverCode,
  timestamp: observation.timestamp,
});

const compareByLatestThenName = (left: FusionIdentityManagementItem, right: FusionIdentityManagementItem) =>
  right.lastSeen - left.lastSeen ||
  left.entityType.localeCompare(right.entityType) ||
  String(left.currentName ?? left.currentIdentifier).localeCompare(String(right.currentName ?? right.currentIdentifier), undefined, {
    numeric: true,
    sensitivity: "base",
  });

const summarize = (items: FusionIdentityManagementItem[]): FusionIdentityManagementSummary => ({
  total: items.length,
  ready: items.filter((item) => item.status === "ready").length,
  review: items.filter((item) => item.status === "review").length,
  unresolved: items.filter((item) => item.status === "unresolved").length,
  noHistory: items.filter((item) => item.status === "noHistory").length,
  completed: items.filter((item) => item.status === "completed").length,
  players: items.filter((item) => item.entityType === "player").length,
  guilds: items.filter((item) => item.entityType === "guild").length,
});

const createEmptyReport = (
  snapshots: GuildHubLogicalScanSnapshot[],
  playerObservationCount = 0,
  guildObservationCount = 0,
): FusionIdentityManagementReport => ({
  scope: {
    label: "EU1-EU4 -> F28",
    originServerCodes: ORIGIN_SERVER_CODES,
    targetServerCode: TARGET_SERVER_CODE,
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
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const buildAliasOptions = async (
  entityType: FusionIdentityEntityType,
  observations: Array<PlayerFusionObservation | GuildFusionObservation>,
  getLinkedEntityId: (identifier: string) => Promise<string | null>,
): Promise<FusionIdentityAliasOption[]> => {
  const grouped = new Map<string, Array<PlayerFusionObservation | GuildFusionObservation>>();
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
      const firstSeen = firstNumber(group.map((observation) => observation.timestamp)) ?? 0;
      const lastSeen = lastNumber(group.map((observation) => observation.timestamp)) ?? firstSeen;
      const identifier =
        latest && entityType === "guild"
          ? (latest as GuildFusionObservation).guildIdentifier
          : (latest as PlayerFusionObservation)?.identifier;
      const name = latest && entityType === "guild" ? latest.name : (latest as PlayerFusionObservation)?.name;
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

const buildHighConfidencePlayerMatches = (playerResults: PlayerFusionPlayerResult[]): GuildFusionPlayerMatch[] =>
  playerResults.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = result.candidates.find(
      (item) => !item.rejected && (item.evidence.exactName || item.evidence.fusionBaseName),
    );
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

const selectManagementPlayerCandidates = (candidates: PlayerFusionCandidate[]) =>
  [...candidates]
    .filter((candidate) => !candidate.rejected || candidate.evidence.exactName || candidate.evidence.fusionBaseName)
    .sort(
      (left, right) =>
        Number(right.evidence.exactName || right.evidence.fusionBaseName) -
          Number(left.evidence.exactName || left.evidence.fusionBaseName) ||
        Number(right.evidence.sameGuild === true) - Number(left.evidence.sameGuild === true) ||
        Number(right.evidence.sameClass === true) - Number(left.evidence.sameClass === true) ||
        (right.oldLevel ?? 0) - (left.oldLevel ?? 0) ||
        left.oldIdentifier.localeCompare(right.oldIdentifier, undefined, { numeric: true, sensitivity: "base" }),
    )
    .slice(0, 25);

type IdentityStoreState = {
  aliasEntityIdByKey: Map<string, string>;
  aliasesByEntityId: Map<string, string[]>;
  rejectedPairKeys: Set<string>;
};

const createIdentityPairKey = (left: string, right: string) =>
  [normalizeIdentifierKey(left), normalizeIdentifierKey(right)].sort().join("::");

const loadPlayerIdentityState = async (store: PlayerIdentityManagementStore): Promise<IdentityStoreState> => {
  const [entities, exclusions] = await Promise.all([store.listPlayerEntities(), store.listPlayerExclusions()]);
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

const loadGuildIdentityState = async (store: GuildIdentityManagementStore): Promise<IdentityStoreState> => {
  const [entities, exclusions] = await Promise.all([store.listGuildEntities(), store.listGuildExclusions()]);
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

const readLinkedAliasesFromState = (state: IdentityStoreState, identifier: string) => {
  const entityId = state.aliasEntityIdByKey.get(normalizeIdentifierKey(identifier)) ?? null;
  return {
    entityId,
    aliases: entityId ? state.aliasesByEntityId.get(entityId) ?? [] : [],
  };
};

const isRejectedByState = (state: IdentityStoreState, left: string, right: string) =>
  state.rejectedPairKeys.has(createIdentityPairKey(left, right));

const isAssignedToOtherIdentity = (
  state: IdentityStoreState,
  historicalIdentifier: string,
  currentEntityId: string | null | undefined,
) => {
  const historicalEntityId = state.aliasEntityIdByKey.get(normalizeIdentifierKey(historicalIdentifier));
  return Boolean(historicalEntityId && historicalEntityId !== currentEntityId);
};

const readLinkedAliases = async (
  getEntity: (identifier: string) => Promise<{ entityId: string } | null>,
  getAliases: (entityId: string) => Promise<string[]>,
  identifier: string,
) => {
  const entity = await getEntity(identifier);
  if (!entity) return { entityId: null, aliases: [] };
  return { entityId: entity.entityId, aliases: await getAliases(entity.entityId) };
};

const createAssignedHistoricalMap = async (
  items: Array<{ currentIdentifier: string; historicalIdentifiers: string[]; entityId: string | null }>,
) => {
  const assignments = new Map<string, Set<string>>();
  items.forEach((item) => {
    if (!item.entityId) return;
    item.historicalIdentifiers.forEach((historicalIdentifier) => {
      const key = normalizeIdentifierKey(historicalIdentifier);
      if (!key) return;
      assignments.set(key, new Set([...(assignments.get(key) ?? []), normalizeIdentifierKey(item.currentIdentifier)]));
    });
  });
  return assignments;
};

const hasAssignedToOther = (
  assignments: Map<string, Set<string>>,
  historicalIdentifier: string,
  currentIdentifier: string,
) => {
  const assigned = assignments.get(normalizeIdentifierKey(historicalIdentifier));
  return Boolean(assigned && [...assigned].some((identifier) => identifier !== normalizeIdentifierKey(currentIdentifier)));
};

const applyReadyCollisions = (items: FusionIdentityManagementItem[]) => {
  const readyByHistorical = new Map<string, FusionIdentityManagementItem[]>();
  items.forEach((item) => {
    if (item.status !== "ready" || !item.readyCandidateIdentifier) return;
    const key = `${item.entityType}:${normalizeIdentifierKey(item.readyCandidateIdentifier)}`;
    readyByHistorical.set(key, [...(readyByHistorical.get(key) ?? []), item]);
  });

  readyByHistorical.forEach((collidingItems) => {
    if (collidingItems.length < 2) return;
    collidingItems.forEach((item) => {
      item.status = "review";
      item.reasons = [...item.reasons, "one historical identity is proposed for multiple current identities"];
      item.readyCandidateIdentifier = null;
    });
  });
};

const buildPlayerItems = async (
  currentObservationsByIdentifier: Map<string, PlayerFusionObservation[]>,
  playerResults: PlayerFusionPlayerResult[],
  stores: { playerStore: PlayerIdentityManagementStore },
  identityState: IdentityStoreState,
) => {
  const currentLinkReads = [...currentObservationsByIdentifier.values()].map((observations) => {
      const latest = latestByTimestamp(observations);
      const currentIdentifier = latest?.identifier ?? observations[0]?.identifier ?? "";
      const linked = readLinkedAliasesFromState(identityState, currentIdentifier);
      return {
        currentIdentifier,
        entityId: linked.entityId,
        historicalIdentifiers: linked.aliases.filter((alias) => normalizeIdentifierKey(alias) !== normalizeIdentifierKey(currentIdentifier)),
        aliases: linked.aliases,
      };
    });
  const resultByIdentifier = new Map(playerResults.map((result) => [normalizeIdentifierKey(result.newIdentifier), result]));

  return Promise.all(
    [...currentObservationsByIdentifier.entries()].map(async ([key, observations]): Promise<FusionIdentityManagementItem> => {
      const latest = latestByTimestamp(observations);
      const result = resultByIdentifier.get(key);
      const currentIdentifier = latest?.identifier ?? result?.newIdentifier ?? key;
      const linked = currentLinkReads.find((entry) => normalizeIdentifierKey(entry.currentIdentifier) === normalizeIdentifierKey(currentIdentifier));
      const completedAliases = linked?.aliases ?? [];
      const completedHistorical = linked?.historicalIdentifiers ?? [];

      const toCandidate = (candidate: PlayerFusionCandidate): FusionIdentityCandidate => {
        const rejected = candidate.rejected || isRejectedByState(identityState, currentIdentifier, candidate.oldIdentifier);
        const assignedToOtherIdentity = isAssignedToOtherIdentity(identityState, candidate.oldIdentifier, linked?.entityId);
        return {
          entityType: "player",
          historicalIdentifier: candidate.oldIdentifier,
          historicalName: candidate.oldName,
          historicalServer: candidate.oldServer,
          ready:
            !rejected &&
            !assignedToOtherIdentity &&
            result?.status === "high-confidence" &&
            (candidate.evidence.exactName || candidate.evidence.fusionBaseName),
          rejected,
          assignedToOtherIdentity,
          evidence: candidate,
        };
      };
      const allCandidates = (result?.candidates ?? []).map(toCandidate);
      const displayCandidateKeys = new Set(
        selectManagementPlayerCandidates(result?.candidates ?? []).map((candidate) => normalizeIdentifierKey(candidate.oldIdentifier)),
      );
      const candidates = allCandidates.filter((candidate) =>
        displayCandidateKeys.has(normalizeIdentifierKey(candidate.historicalIdentifier)) && !candidate.assignedToOtherIdentity,
      );
      const readyCandidate = allCandidates.filter((candidate) => candidate.ready);
      const activeCandidates = allCandidates.filter((candidate) => !candidate.rejected && !candidate.assignedToOtherIdentity);
      const hasHistory = Boolean(result && result.originSource !== "currentServerNoPredecessor" && result.originSource !== "unknown");
      const status: FusionIdentityManagementStatus = completedHistorical.length
        ? "completed"
        : readyCandidate.length === 1
          ? "ready"
          : activeCandidates.length ||
              result?.status === "ambiguous" ||
              result?.status === "conflict" ||
              result?.status === "candidate"
            ? "review"
            : !hasHistory || result?.status === "no-predecessor"
              ? "noHistory"
              : "unresolved";

      return {
        id: `player:${normalizeIdentifierKey(currentIdentifier)}`,
        entityType: "player",
        status,
        currentIdentifier,
        currentName: latest?.name ?? result?.newIdentifier ?? null,
        currentServer: resolveServerCode(latest?.server ?? result?.currentServer),
        observations: observations.map(toObservationSummary).sort((left, right) => left.timestamp - right.timestamp),
        firstSeen: firstNumber(observations.map((observation) => observation.timestamp)) ?? 0,
        lastSeen: lastNumber(observations.map((observation) => observation.timestamp)) ?? 0,
        historicalIdentifiers: completedHistorical,
        candidates,
        memberMigrationEdges: [],
        reasons: [...(result?.reasons ?? [])],
        readyCandidateIdentifier: status === "ready" ? readyCandidate[0]?.historicalIdentifier ?? null : null,
        completedEntityId: linked?.entityId ?? null,
        completedAliases,
      };
    }),
  );
};

const buildGuildItems = async (
  currentObservationsByIdentifier: Map<string, GuildFusionObservation[]>,
  guildResults: GuildFusionGuildResult[],
  stores: { guildStore: GuildIdentityManagementStore },
  identityState: IdentityStoreState,
) => {
  const currentLinkReads = [...currentObservationsByIdentifier.values()].map((observations) => {
      const latest = latestByTimestamp(observations);
      const currentIdentifier = latest?.guildIdentifier ?? observations[0]?.guildIdentifier ?? "";
      const linked = readLinkedAliasesFromState(identityState, currentIdentifier);
      return {
        currentIdentifier,
        entityId: linked.entityId,
        historicalIdentifiers: linked.aliases.filter((alias) => normalizeIdentifierKey(alias) !== normalizeIdentifierKey(currentIdentifier)),
        aliases: linked.aliases,
      };
    });
  const resultsByIdentifier = new Map<string, GuildFusionGuildResult[]>();
  guildResults.forEach((result) => {
    const key = normalizeIdentifierKey(result.newGuild.guildIdentifier);
    resultsByIdentifier.set(key, [...(resultsByIdentifier.get(key) ?? []), result]);
  });

  return Promise.all(
    [...currentObservationsByIdentifier.entries()].map(async ([key, observations]): Promise<FusionIdentityManagementItem> => {
      const latest = latestByTimestamp(observations);
      const currentIdentifier = latest?.guildIdentifier ?? key;
      const linked = currentLinkReads.find((entry) => normalizeIdentifierKey(entry.currentIdentifier) === normalizeIdentifierKey(currentIdentifier));
      const completedAliases = linked?.aliases ?? [];
      const completedHistorical = linked?.historicalIdentifiers ?? [];
      const results = resultsByIdentifier.get(key) ?? [];
      const rawCandidates = results.flatMap((result) => result.identityCandidates);
      const migrationEdges = results.flatMap((result) => result.memberMigrationEdges);
      const candidateByOld = new Map<string, GuildFusionCandidate>();
      rawCandidates.forEach((candidate) => {
        const candidateKey = normalizeIdentifierKey(candidate.oldGuildIdentifier);
        const existing = candidateByOld.get(candidateKey);
        if (!existing || Number(candidate.autoEligible) > Number(existing.autoEligible) || candidate.matchedMemberCount > existing.matchedMemberCount) {
          candidateByOld.set(candidateKey, candidate);
        }
      });

      const allCandidates = [...candidateByOld.values()].map((candidate): FusionIdentityCandidate => {
        const rejected = isRejectedByState(identityState, currentIdentifier, candidate.oldGuildIdentifier);
        const assignedToOtherIdentity = isAssignedToOtherIdentity(identityState, candidate.oldGuildIdentifier, linked?.entityId);
        return {
          entityType: "guild",
          historicalIdentifier: candidate.oldGuildIdentifier,
          historicalName: candidate.oldName,
          historicalServer: candidate.oldServer,
          ready: !rejected && !assignedToOtherIdentity && candidate.autoEligible,
          rejected,
          assignedToOtherIdentity,
          evidence: candidate,
        };
      });
      const candidates = allCandidates.filter((candidate) => !candidate.assignedToOtherIdentity);
      const activeCandidates = allCandidates.filter((candidate) => !candidate.rejected && !candidate.assignedToOtherIdentity);
      const readyCandidateIdentifiers = new Set(activeCandidates.filter((candidate) => candidate.ready).map((candidate) => candidate.historicalIdentifier));
      const plausibleIdentityIdentifiers = new Set(activeCandidates.map((candidate) => candidate.historicalIdentifier));
      const hasOnlyOnePlausibleIdentity = plausibleIdentityIdentifiers.size === 1;
      const hasConsistentAutoIdentity = readyCandidateIdentifiers.size === 1 && hasOnlyOnePlausibleIdentity;
      const hasHistoricalData = results.some((result) => result.status !== "noHistoricalData") || rawCandidates.length > 0 || migrationEdges.length > 0;
      const status: FusionIdentityManagementStatus = completedHistorical.length
        ? "completed"
        : hasConsistentAutoIdentity
          ? "ready"
          : activeCandidates.length
            ? "review"
            : hasHistoricalData
              ? "unresolved"
              : "noHistory";

      return {
        id: `guild:${normalizeIdentifierKey(currentIdentifier)}`,
        entityType: "guild",
        status,
        currentIdentifier,
        currentName: latest?.name ?? null,
        currentServer: latest?.serverCode ?? null,
        observations: observations.map(toGuildObservationSummary).sort((left, right) => left.timestamp - right.timestamp),
        firstSeen: firstNumber(observations.map((observation) => observation.timestamp)) ?? 0,
        lastSeen: lastNumber(observations.map((observation) => observation.timestamp)) ?? 0,
        historicalIdentifiers: completedHistorical,
        candidates,
        memberMigrationEdges: migrationEdges,
        reasons: [...new Set(results.flatMap((result) => result.reasons))],
        readyCandidateIdentifier: status === "ready" ? [...readyCandidateIdentifiers][0] ?? null : null,
        completedEntityId: linked?.entityId ?? null,
        completedAliases,
      };
    }),
  );
};

export async function buildFusionIdentityManagementReportFromSnapshots(
  input: FusionIdentityManagementInput,
): Promise<FusionIdentityManagementReport> {
  const snapshots = [...input.snapshots].sort((left, right) => left.timestampMs - right.timestampMs);
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
  const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
  const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
  const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
    ORIGIN_SERVER_CODE_SET.has(resolveServerCode(observation.server) ?? ""),
  );
  const currentPlayerObservations = allPlayerObservations.filter(
    (observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE,
  );
  const historicalGuildObservations = allGuildObservations.filter((observation) =>
    ORIGIN_SERVER_CODE_SET.has(observation.serverCode ?? ""),
  );
  const currentGuildObservations = allGuildObservations.filter((observation) => observation.serverCode === TARGET_SERVER_CODE);

  if (!currentPlayerObservations.length && !currentGuildObservations.length) {
    return createEmptyReport(snapshots, allPlayerObservations.length, allGuildObservations.length);
  }

  const postFusionSnapshots = snapshots.filter((snapshot) => {
    const players = createFusionIdentityObservations(snapshot);
    const guilds = createFusionIdentityGuildObservations(snapshot);
    return (
      players.some((observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE) ||
      guilds.some((observation) => observation.serverCode === TARGET_SERVER_CODE)
    );
  });
  const historicalSnapshots = snapshots.filter((snapshot) => {
    const players = createFusionIdentityObservations(snapshot);
    const guilds = createFusionIdentityGuildObservations(snapshot);
    return (
      players.some((observation) => ORIGIN_SERVER_CODE_SET.has(resolveServerCode(observation.server) ?? "")) ||
      guilds.some((observation) => ORIGIN_SERVER_CODE_SET.has(observation.serverCode ?? ""))
    );
  });

  const playerResults = resolvePlayerFusions({
    historicalObservations: historicalPlayerObservations,
    newObservations: [...groupPlayerObservations(currentPlayerObservations).values()].map((observations) => latestByTimestamp(observations) ?? observations[0]),
  }).results;
  const highConfidencePlayerMatches = buildHighConfidencePlayerMatches(playerResults);
  const currentGuildsByIdentifier = groupGuildObservations(currentGuildObservations);
  const guildResults = postFusionSnapshots.flatMap((snapshot) => {
    const snapshotTimestamp = snapshot.timestampMs;
    const newGuildObservations = createFusionIdentityGuildObservations(snapshot).filter(
      (observation) => observation.serverCode === TARGET_SERVER_CODE,
    );
    if (!newGuildObservations.length) return [];
    return resolveGuildFusions({
      historicalGuildObservations: historicalGuildObservations.filter((observation) => observation.timestamp < snapshotTimestamp),
      newGuildObservations,
      highConfidencePlayerMatches,
    }).results;
  });
  const [playerIdentityState, guildIdentityState] = await Promise.all([
    loadPlayerIdentityState(playerStore),
    loadGuildIdentityState(guildStore),
  ]);

  const [playerItems, guildItems, currentPlayerAliases, historicalPlayerAliases, currentGuildAliases, historicalGuildAliases] =
    await Promise.all([
      buildPlayerItems(groupPlayerObservations(currentPlayerObservations), playerResults, { playerStore }, playerIdentityState),
      buildGuildItems(currentGuildsByIdentifier, guildResults, { guildStore }, guildIdentityState),
      buildAliasOptions("player", currentPlayerObservations, async (identifier) => readLinkedAliasesFromState(playerIdentityState, identifier).entityId),
      buildAliasOptions("player", historicalPlayerObservations, async (identifier) => readLinkedAliasesFromState(playerIdentityState, identifier).entityId),
      buildAliasOptions("guild", currentGuildObservations, async (identifier) => readLinkedAliasesFromState(guildIdentityState, identifier).entityId),
      buildAliasOptions("guild", historicalGuildObservations, async (identifier) => readLinkedAliasesFromState(guildIdentityState, identifier).entityId),
    ]);

  const items = [...playerItems, ...guildItems].sort(compareByLatestThenName);
  applyReadyCollisions(items);

  return {
    scope: {
      label: "EU1-EU4 -> F28",
      originServerCodes: ORIGIN_SERVER_CODES,
      targetServerCode: TARGET_SERVER_CODE,
      allSnapshotCount: snapshots.length,
      historicalSnapshotCount: historicalSnapshots.length,
      postFusionSnapshotCount: postFusionSnapshots.length,
      firstHistoricalTimestamp: firstNumber(historicalSnapshots.map((snapshot) => snapshot.timestampMs)),
      lastHistoricalTimestamp: lastNumber(historicalSnapshots.map((snapshot) => snapshot.timestampMs)),
      firstPostFusionTimestamp: firstNumber(postFusionSnapshots.map((snapshot) => snapshot.timestampMs)),
      lastPostFusionTimestamp: lastNumber(postFusionSnapshots.map((snapshot) => snapshot.timestampMs)),
      playerObservationCount: allPlayerObservations.length,
      guildObservationCount: allGuildObservations.length,
    },
    summary: summarize(items),
    items,
    currentAliases: [...currentPlayerAliases, ...currentGuildAliases].sort((left, right) => right.lastSeen - left.lastSeen),
    historicalAliases: [...historicalPlayerAliases, ...historicalGuildAliases].sort((left, right) => right.lastSeen - left.lastSeen),
  };
}

export async function loadFusionIdentityManagementReport(
  stores: FusionIdentityManagementStores = {},
): Promise<FusionIdentityManagementReport> {
  const scans = await listSfDataHubLocalScansReadOnly();
  const snapshots = scans.flatMap(deriveGuildHubLogicalScanSnapshots);
  return buildFusionIdentityManagementReportFromSnapshots({ snapshots, ...stores });
}

export async function confirmFusionIdentityLink(
  entityType: FusionIdentityEntityType,
  currentIdentifier: string,
  historicalIdentifier: string,
  options: FusionIdentityManagementStores & { source?: PlayerAliasSource | GuildAliasSource } = {},
) {
  const confirmedAt = new Date().toISOString();
  if (entityType === "player") {
    const store = options.playerStore ?? { linkPlayerIdentifiers };
    return store.linkPlayerIdentifiers(currentIdentifier, historicalIdentifier, {
      source: (options.source as PlayerAliasSource | undefined) ?? "manual",
      confirmedAt,
    });
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
    return store.rejectPlayerMatch(currentIdentifier, historicalIdentifier, { source: "manual" });
  }

  const store = options.guildStore ?? { rejectGuildLink };
  return store.rejectGuildLink(currentIdentifier, historicalIdentifier, { source: "manual" });
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
  const readyItems = report.items.filter((item) => item.status === "ready" && item.readyCandidateIdentifier);
  const result = {
    players: 0,
    guilds: 0,
    errors: [] as Array<{ itemId: string; message: string }>,
  };

  for (const item of readyItems) {
    try {
      await confirmFusionIdentityLink(item.entityType, item.currentIdentifier, item.readyCandidateIdentifier ?? "", {
        ...options,
        source: "automatic",
      });
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
