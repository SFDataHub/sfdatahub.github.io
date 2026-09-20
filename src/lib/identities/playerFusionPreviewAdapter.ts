import {
  deriveGuildHubLogicalScanSnapshots,
  listSfDataHubLocalScansReadOnly,
  type GuildHubLogicalScanSnapshot,
} from "../guilds/localScanLibrary";
import { extractGuildCoaString } from "../guilds/guildCoa";
import { normalizeGuildScanServer, normalizeGuildSegmentForScan } from "../guilds/guildScanNormalizer";
import {
  normalizeSfPlayerCharacterCore,
  type NormalizedPlayer,
  type NormalizedPlayerFieldStatus,
} from "../parsing/normalizedPlayer";
import { resolveServer } from "../servers/serverResolver";
import {
  resolveGuildFusions,
  type GuildFusionObservation,
  type GuildFusionPlayerMatch,
  type GuildFusionResolverResult,
} from "./guildFusionResolver";
import {
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
  type PlayerFusionFieldAvailability,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
  type PlayerFusionSemanticVector,
} from "./playerFusionResolver";

type JsonRecord = Record<string, unknown>;

export type FusionIdentityPreviewSnapshot = {
  id: string;
  label: string;
  timestampMs: number;
  sourceScanId: string;
  sourceScanFilename: string;
  playerCount: number;
};

export type FusionIdentityPreviewPlayerResult = {
  result: PlayerFusionPlayerResult;
  newObservation: PlayerFusionObservation;
};

export type FusionIdentityPreviewReport = {
  snapshot: FusionIdentityPreviewSnapshot;
  totalPlayers: number;
  historicalObservationCount: number;
  results: FusionIdentityPreviewPlayerResult[];
  guildReport: GuildFusionResolverResult;
  totalGuilds: number;
  historicalGuildObservationCount: number;
};

const SUPPORTED_ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const SUPPORTED_POST_FUSION_CODE = "F28";

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const readCurrentCompactOriginNumericId = (player: JsonRecord | null) => {
  if (!player) return null;
  const saveVersion = toFiniteNumber(player.saveVersion);
  const save = Array.isArray(player.save) ? player.save : null;
  if (saveVersion !== 2 || save?.length !== 70) return null;
  return toFiniteNumber(save[68]);
};

const ATTRIBUTE_KEYS = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;
const FORTRESS_BUILDING_KEYS = [
  "fortress",
  "quarters",
  "woodcutter",
  "quarry",
  "gemMine",
  "academy",
  "archeryGuild",
  "barracks",
  "mageTower",
  "treasury",
  "smithy",
  "fortifications",
] as const;
const PET_ELEMENT_KEYS = ["shadow", "light", "earth", "fire", "water"] as const;

const combineAvailability = (statuses: Array<NormalizedPlayerFieldStatus | undefined>): PlayerFusionFieldAvailability => {
  if (statuses.length && statuses.every((status) => status === "available")) return "available";
  if (statuses.some((status) => status === "invalid")) return "invalid";
  if (statuses.some((status) => status === "unsupported")) return "unsupported";
  return "missing";
};

const strictVector = (values: Array<number | null | undefined>, availability: PlayerFusionFieldAvailability): PlayerFusionSemanticVector => ({
  availability,
  values: availability === "available" && values.every((value) => typeof value === "number" && Number.isFinite(value))
    ? (values as number[])
    : null,
});

const supportingVector = (values: Array<number | null | undefined>, statuses: Array<NormalizedPlayerFieldStatus | undefined>): PlayerFusionSemanticVector => {
  const availability = combineAvailability(statuses);
  const hasFiniteValue = values.some((value) => typeof value === "number" && Number.isFinite(value));
  const finiteValues = values.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0));
  return {
    availability: hasFiniteValue ? "available" : availability,
    values: hasFiniteValue ? finiteValues : null,
  };
};

export const createPlayerFusionSemanticSummary = (player: JsonRecord | null) => {
  if (!player) return undefined;
  const normalized: NormalizedPlayer = normalizeSfPlayerCharacterCore(player);
  const fields = normalized.metadata.fields;
  const baseAttributePaths = ATTRIBUTE_KEYS.map((attribute) => `attributes.${attribute}.base`);
  const baseAttributes = strictVector(
    ATTRIBUTE_KEYS.map((attribute) => normalized.attributes[attribute].base),
    combineAvailability(baseAttributePaths.map((path) => fields[path]?.status)),
  );
  const fortressPaths = [
    "fortress.upgrades",
    "fortress.gladiator",
    "fortress.knights",
    ...FORTRESS_BUILDING_KEYS.map((building) => `fortress.buildings.${building}`),
  ];
  const fortress = supportingVector(
    [
      normalized.fortress.upgrades,
      normalized.fortress.gladiator,
      normalized.fortress.knights,
      ...FORTRESS_BUILDING_KEYS.map((building) => normalized.fortress.buildings[building]),
    ],
    fortressPaths.map((path) => normalized.fortress.metadata.fields[path]?.status ?? fields[path]?.status),
  );
  const pets = supportingVector(
    [
      ...PET_ELEMENT_KEYS.map((element) => normalized.pets?.bonuses[element]),
      ...PET_ELEMENT_KEYS.map((element) => normalized.pets?.habitatProgress[element]),
    ],
    [
      ...PET_ELEMENT_KEYS.map((element) => normalized.pets?.metadata.fields[`bonuses.${element}`]?.status),
      ...PET_ELEMENT_KEYS.map((element) => normalized.pets?.metadata.fields[`habitatProgress.${element}`]?.status),
    ],
  );

  return {
    baseAttributes,
    fortress,
    pets,
  };
};

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const readString = (record: JsonRecord | null, keys: readonly string[]) => {
  if (!record) return null;
  const canonical = new Map<string, string>();
  Object.keys(record).forEach((key) => {
    canonical.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), key);
  });

  for (const key of keys) {
    const value = record[key] ?? record[canonical.get(key.toLowerCase().replace(/[^a-z0-9]/g, "")) ?? ""];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
};

const formatSnapshotLabel = (snapshot: GuildHubLogicalScanSnapshot) => {
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(snapshot.timestampMs));
  return `${dateLabel} - ${snapshot.sourceScanFilename}`;
};

const toPreviewSnapshot = (snapshot: GuildHubLogicalScanSnapshot): FusionIdentityPreviewSnapshot => ({
  id: snapshot.id,
  label: formatSnapshotLabel(snapshot),
  timestampMs: snapshot.timestampMs,
  sourceScanId: snapshot.sourceScanId,
  sourceScanFilename: snapshot.sourceScanFilename,
  playerCount: snapshot.playerCount,
});

const buildRawPlayerLookup = (snapshot: GuildHubLogicalScanSnapshot) => {
  const lookup = new Map<string, JsonRecord>();
  snapshot.players.map(asRecord).forEach((player) => {
    const identifier = normalizeIdentifierKey(player?.identifier);
    if (identifier && player) lookup.set(identifier, player);
  });
  return lookup;
};

export const createFusionIdentityObservations = (
  snapshot: GuildHubLogicalScanSnapshot,
): PlayerFusionObservation[] => {
  const rawPlayersByIdentifier = buildRawPlayerLookup(snapshot);

  return snapshot.normalizedMembers.map((member) => {
    const rawPlayer = rawPlayersByIdentifier.get(normalizeIdentifierKey(member.memberRef)) ?? null;
    const rawIdentifier = typeof rawPlayer?.identifier === "string" && rawPlayer.identifier.trim()
      ? rawPlayer.identifier.trim()
      : member.memberRef;

    return {
      identifier: rawIdentifier,
      server: member.server,
      timestamp: snapshot.timestampMs,
      name: member.name,
      classId: member.classId,
      level: member.level,
      levelAvailability: typeof member.level === "number" && Number.isFinite(member.level) && member.level > 0 ? "available" : "missing",
      guildIdentifier: member.guildSegment ?? member.groupSegment,
      guildName: member.guildName,
      originNumericId: readCurrentCompactOriginNumericId(rawPlayer),
      semantic: createPlayerFusionSemanticSummary(rawPlayer),
    };
  });
};

const buildGuildIdentifier = (server: string | null, segment: string | null, name: string | null) => {
  if (segment) return server ? `${server.toLowerCase()}_${segment}` : segment;
  const nameKey = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return nameKey ? `${server?.toLowerCase() ?? "unknown"}_name_${nameKey}` : null;
};

const readGroupInfo = (group: unknown) => {
  const record = asRecord(group);
  if (!record) return null;
  const rawIdentifier = readString(record, [
    "guildIdentifier",
    "Guild Identifier",
    "identifier",
    "Identifier",
    "groupIdentifier",
    "groupId",
    "guildId",
    "id",
  ]);
  const server = normalizeGuildScanServer(
    readString(record, ["server", "Server", "prefix", "world", "realm"]) ?? rawIdentifier?.match(/^(.+)_g[^_]+$/i)?.[1],
  );
  const segment = normalizeGuildSegmentForScan(rawIdentifier);
  const name = readString(record, ["name", "Name", "groupname", "groupName", "guildName", "guild"]);
  const memberCount = toFiniteNumber(readString(record, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]));
  const guildIdentifier = buildGuildIdentifier(server, segment, name);
  if (!guildIdentifier) return null;

  return {
    guildIdentifier,
    serverCode: resolveServerCode(server),
    name,
    memberCount,
    coa: extractGuildCoaString(record),
  };
};

export const createFusionIdentityGuildObservations = (
  snapshot: GuildHubLogicalScanSnapshot,
): GuildFusionObservation[] => {
  const guilds = new Map<string, GuildFusionObservation>();

  snapshot.groups.forEach((group) => {
    const info = readGroupInfo(group);
    if (!info) return;
    guilds.set(info.guildIdentifier, {
      guildIdentifier: info.guildIdentifier,
      serverCode: info.serverCode,
      timestamp: snapshot.timestampMs,
      name: info.name,
      memberIdentifiers: [],
      memberCount: info.memberCount,
      coa: info.coa,
    });
  });

  snapshot.normalizedMembers.forEach((member) => {
    const server = normalizeGuildScanServer(member.server);
    const segment = normalizeGuildSegmentForScan(member.guildSegment ?? member.groupSegment);
    const guildIdentifier = buildGuildIdentifier(server, segment, member.guildName);
    if (!guildIdentifier) return;

    const existing = guilds.get(guildIdentifier);
    const observation =
      existing ??
      ({
        guildIdentifier,
        serverCode: resolveServerCode(server),
        timestamp: snapshot.timestampMs,
        name: member.guildName,
        memberIdentifiers: [],
        memberCount: null,
        coa: null,
      } satisfies GuildFusionObservation);

    observation.name = observation.name ?? member.guildName;
    observation.memberIdentifiers.push(member.memberRef);
    guilds.set(guildIdentifier, observation);
  });

  return [...guilds.values()].map((guild) => ({
    ...guild,
    memberIdentifiers: [...new Set(guild.memberIdentifiers)],
    memberCount: guild.memberCount ?? guild.memberIdentifiers.length,
  }));
};

const hasSupportedPostFusionPlayer = (snapshot: GuildHubLogicalScanSnapshot) =>
  createFusionIdentityObservations(snapshot).some(
    (observation) => resolveServerCode(observation.server) === SUPPORTED_POST_FUSION_CODE,
  );

const isSupportedOriginObservation = (observation: PlayerFusionObservation) => {
  const code = resolveServerCode(observation.server);
  return Boolean(code && SUPPORTED_ORIGIN_CODES.has(code));
};

const isSupportedPostFusionObservation = (observation: PlayerFusionObservation) =>
  resolveServerCode(observation.server) === SUPPORTED_POST_FUSION_CODE;

export async function loadFusionIdentityPreviewSnapshots() {
  const scans = await listSfDataHubLocalScansReadOnly();
  const snapshots = scans.flatMap(deriveGuildHubLogicalScanSnapshots).sort((left, right) => left.timestampMs - right.timestampMs);
  const postFusionSnapshots = snapshots.filter(hasSupportedPostFusionPlayer);

  return {
    allSnapshotCount: snapshots.length,
    snapshots,
    postFusionSnapshots: postFusionSnapshots.map(toPreviewSnapshot).sort((left, right) => right.timestampMs - left.timestampMs),
  };
}

export async function buildFusionIdentityPreviewReport(
  selectedSnapshotId: string,
): Promise<FusionIdentityPreviewReport | null> {
  const scans = await listSfDataHubLocalScansReadOnly();
  const snapshots = scans.flatMap(deriveGuildHubLogicalScanSnapshots).sort((left, right) => left.timestampMs - right.timestampMs);
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId);
  if (!selectedSnapshot) return null;

  const newObservations = createFusionIdentityObservations(selectedSnapshot).filter(isSupportedPostFusionObservation);
  const historicalObservations = snapshots
    .filter((snapshot) => snapshot.timestampMs < selectedSnapshot.timestampMs)
    .flatMap(createFusionIdentityObservations)
    .filter(isSupportedOriginObservation);

  const resolved = resolvePlayerFusions({ historicalObservations, newObservations });
  const observationsByIdentifier = new Map(
    newObservations.map((observation) => [normalizeIdentifierKey(observation.identifier), observation]),
  );
  const playerResults = resolved.results.map((result) => ({
    result,
    newObservation: observationsByIdentifier.get(normalizeIdentifierKey(result.newIdentifier)) ?? {
      identifier: result.newIdentifier,
      server: result.currentServer,
      timestamp: selectedSnapshot.timestampMs,
      name: result.newIdentifier,
      classId: null,
      level: null,
    },
  }));
  const highConfidencePlayerMatches: GuildFusionPlayerMatch[] = playerResults.flatMap((entry) => {
    if (entry.result.status !== "high-confidence") return [];
    const candidate = selectPlayerFusionReadyCandidates(entry.result)[0];
    if (!candidate) return [];
    return [
      {
        oldIdentifier: candidate.oldIdentifier,
        oldName: candidate.oldName,
        newIdentifier: entry.result.newIdentifier,
        newName: entry.newObservation.name,
      },
    ];
  });
  const historicalGuildObservations = snapshots
    .filter((snapshot) => snapshot.timestampMs < selectedSnapshot.timestampMs)
    .flatMap(createFusionIdentityGuildObservations)
    .filter((guild) => Boolean(guild.serverCode && SUPPORTED_ORIGIN_CODES.has(guild.serverCode)));
  const newGuildObservations = createFusionIdentityGuildObservations(selectedSnapshot).filter(
    (guild) => guild.serverCode === SUPPORTED_POST_FUSION_CODE,
  );
  const guildReport = resolveGuildFusions({
    historicalGuildObservations,
    newGuildObservations,
    highConfidencePlayerMatches,
  });

  return {
    snapshot: toPreviewSnapshot(selectedSnapshot),
    totalPlayers: newObservations.length,
    historicalObservationCount: historicalObservations.length,
    results: playerResults,
    guildReport,
    totalGuilds: newGuildObservations.length,
    historicalGuildObservationCount: historicalGuildObservations.length,
  };
}
