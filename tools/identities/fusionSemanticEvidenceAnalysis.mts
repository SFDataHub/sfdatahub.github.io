import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityCandidate,
  type FusionIdentityManagementItem,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createFusionIdentityGuildObservations, createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import type { GuildFusionCandidate } from "../../src/lib/identities/guildFusionResolver.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer, type NormalizedPlayerFieldStatus } from "../../src/lib/parsing/normalizedPlayer.ts";
import {
  createNormalizedGuildIndexes,
  linkNormalizedPlayerToGuildMember,
  normalizeSfGuildsFromScan,
  type NormalizedGuild,
  type NormalizedGuildMember,
} from "../../src/lib/parsing/normalizedGuild.ts";

type JsonRecord = Record<string, unknown>;

type ScanBundle = {
  snapshot: GuildHubLogicalScanSnapshot;
  rawPlayersByIdentifier: Map<string, JsonRecord>;
  normalizedPlayerCache: Map<string, NormalizedPlayer>;
  normalizedGuilds: NormalizedGuild[];
  normalizedGuildByIdentifier: Map<string, NormalizedGuild>;
};

type StatusCounts = Record<NormalizedPlayerFieldStatus, number>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const ATTRIBUTE_KEYS = ["strength", "dexterity", "intelligence", "constitution", "luck"] as const;
const PLAYER_FIELD_FAMILIES = [
  "registeredAt",
  "class",
  "level",
  "attr.base",
  "attr.purchased",
  "attr.total",
  "fortress",
  "dungeons",
  "pets",
  "scrapbook",
  "guildMembership",
] as const;
const GUILD_CASES = [
  { label: "Magic Mushrooms", currentName: "Magic Mushrooms", historicalId: "eu1_g8" },
  { label: "Hangover", currentName: "Hangover" },
  { label: "Dead End -> Erben im Wandel", currentName: "Erben im Wandel", historicalId: "eu4_g14" },
  { label: "Die Legion -> Legion Z", currentName: "Legion Z", historicalId: "eu3_g4877" },
  { label: "GenerationZ -> Legion Z", currentName: "Legion Z", historicalId: "eu4_g1352" },
] as const;

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

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const guildIdentifierAliases = (identifier: string | null | undefined) => {
  const raw = String(identifier ?? "").trim().toLowerCase();
  if (!raw) return [];
  const aliases = new Set([raw]);
  const serverAliases: Array<[RegExp, string]> = [
    [/^s1_eu_/, "eu1_"],
    [/^s2_eu_/, "eu2_"],
    [/^s3_eu_/, "eu3_"],
    [/^s4_eu_/, "eu4_"],
    [/^f28_net_/, "f28_"],
    [/^eu1_/, "s1_eu_"],
    [/^eu2_/, "s2_eu_"],
    [/^eu3_/, "s3_eu_"],
    [/^eu4_/, "s4_eu_"],
    [/^f28_/, "f28_net_"],
  ];
  serverAliases.forEach(([pattern, replacement]) => {
    if (pattern.test(raw)) aliases.add(raw.replace(pattern, replacement));
  });
  return [...aliases];
};

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null ? "missing" : new Date(timestamp).toISOString();

const printSection = (title: string) => console.log(`\n## ${title}`);

const emptyStatusCounts = (): StatusCounts => ({ available: 0, missing: 0, unsupported: 0, invalid: 0 });

const addStatus = (counts: StatusCounts, status: NormalizedPlayerFieldStatus) => {
  counts[status] += 1;
};

const getScanTimestamp = (raw: JsonRecord): number | null => {
  const players = Array.isArray(raw.players) ? raw.players.map(asRecord).filter(Boolean) : [];
  return players.map((player) => toFiniteNumber(player?.timestamp)).find((timestamp) => timestamp != null) ?? null;
};

const listJsonFiles = (root: string): string[] =>
  fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") && entry.name !== "manifest.json" ? [fullPath] : [];
  });

const readSnapshot = (filePath: string): GuildHubLogicalScanSnapshot | null => {
  const raw = asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
  if (!raw || !Array.isArray(raw.players)) return null;
  const timestampMs = getScanTimestamp(raw);
  if (timestampMs == null) return null;
  const groups = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.guilds) ? raw.guilds : [];
  const fileName = path.basename(filePath);

  return {
    id: `${fileName}::${timestampMs}`,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    players: raw.players,
    groups,
    servers: [],
    playerCount: raw.players.length,
    groupCount: groups.length,
    guildCount: groups.length,
    rawData: { ...raw, players: raw.players, groups },
    normalizedMembers: normalizeGuildScanMembers(raw),
    sourceScanId: fileName,
    sourceScanFilename: fileName,
    sourceImportedAt: new Date(timestampMs).toISOString(),
  };
};

const createScanBundle = (snapshot: GuildHubLogicalScanSnapshot): ScanBundle => {
  const rawPlayersByIdentifier = new Map<string, JsonRecord>();
  snapshot.players.map(asRecord).forEach((player) => {
    if (!player) return;
    const identifier = normalizeKey(player.identifier);
    if (!identifier) return;
    rawPlayersByIdentifier.set(identifier, player);
  });

  const normalizedGuilds = normalizeSfGuildsFromScan(snapshot.rawData);
  const normalizedGuildByIdentifier = new Map<string, NormalizedGuild>();
  normalizedGuilds.forEach((guild) => {
    guildIdentifierAliases(guild.identity.identifier).forEach((key) => normalizedGuildByIdentifier.set(key, guild));
  });

  return { snapshot, rawPlayersByIdentifier, normalizedPlayerCache: new Map(), normalizedGuilds, normalizedGuildByIdentifier };
};

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp)[0] ?? null;

const groupPlayerObservations = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const groupByHistoricalIdentifier = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const fullGuildIdentifier = (observation: Pick<PlayerFusionObservation, "server" | "guildIdentifier">) => {
  const raw = String(observation.guildIdentifier ?? "").trim();
  if (!raw) return null;
  if (raw.includes("_g")) return raw.toLowerCase();
  const server = String(observation.server ?? "").trim().toLowerCase();
  return server ? `${server}_${raw.toLowerCase()}` : raw.toLowerCase();
};

const getBundle = (bundlesByTimestamp: Map<number, ScanBundle>, timestamp: number) => bundlesByTimestamp.get(timestamp) ?? null;

const getNormalizedPlayer = (bundle: ScanBundle | null, identifier: string | null | undefined) => {
  const key = normalizeKey(identifier);
  if (!bundle || !key) return null;
  const cached = bundle.normalizedPlayerCache.get(key);
  if (cached) return cached;
  const raw = bundle.rawPlayersByIdentifier.get(key);
  if (!raw) return null;
  const normalized = normalizeSfPlayerCharacterCore(raw);
  bundle.normalizedPlayerCache.set(key, normalized);
  return normalized;
};

const normalizedForObservation = (
  bundlesByTimestamp: Map<number, ScanBundle>,
  observation: PlayerFusionObservation | null | undefined,
) => {
  if (!observation) return null;
  return getNormalizedPlayer(getBundle(bundlesByTimestamp, observation.timestamp), observation.identifier);
};

const normalizedGuildForObservation = (
  bundlesByTimestamp: Map<number, ScanBundle>,
  guildIdentifier: string | null | undefined,
  timestamp: number | null | undefined,
) => {
  if (!guildIdentifier || timestamp == null) return null;
  return getBundle(bundlesByTimestamp, timestamp)?.normalizedGuildByIdentifier.get(normalizeKey(guildIdentifier)) ?? null;
};

const findNormalizedGuildAcrossBundles = (
  bundles: ScanBundle[],
  guildIdentifier: string,
  options: { before?: number; after?: number; latest?: boolean } = {},
) => {
  const matches = bundles.flatMap((bundle) => {
    const guild = guildIdentifierAliases(guildIdentifier)
      .map((alias) => bundle.normalizedGuildByIdentifier.get(alias))
      .find(Boolean);
    if (!guild) return [];
    if (options.before != null && bundle.snapshot.timestampMs >= options.before) return [];
    if (options.after != null && bundle.snapshot.timestampMs < options.after) return [];
    return [{ timestamp: bundle.snapshot.timestampMs, guild }];
  });
  return matches.sort((left, right) => (options.latest ? right.timestamp - left.timestamp : left.timestamp - right.timestamp))[0]?.guild ?? null;
};

const fieldStatus = (
  normalized: NormalizedPlayer | null,
  family: (typeof PLAYER_FIELD_FAMILIES)[number],
): NormalizedPlayerFieldStatus => {
  if (!normalized) return "missing";
  if (family === "registeredAt") return normalized.extended.extras.metadata.fields["extras.registeredAt"]?.status ?? "missing";
  if (family === "class") return normalized.metadata.fields["identity.class"]?.status ?? "missing";
  if (family === "level") return normalized.metadata.fields["progression.level"]?.status ?? "missing";
  if (family === "guildMembership") return normalized.metadata.fields["guild.name"]?.status ?? "missing";
  if (family === "scrapbook") return normalized.progressionStatus.metadata.fields["scrapbook.count"]?.status ?? "missing";
  if (family === "fortress") {
    const statuses = Object.values(normalized.fortress.metadata.fields).map((entry) => entry.status);
    return statuses.includes("available") ? "available" : statuses.includes("invalid") ? "invalid" : statuses.includes("missing") ? "missing" : "unsupported";
  }
  if (family === "dungeons") {
    const statuses = Object.values(normalized.dungeons.metadata.fields).map((entry) => entry.status);
    return statuses.includes("available") ? "available" : statuses.includes("invalid") ? "invalid" : statuses.includes("missing") ? "missing" : "unsupported";
  }
  if (family === "pets") {
    const statuses = Object.values(normalized.pets?.metadata.fields ?? {}).map((entry) => entry.status);
    if (!statuses.length) return "missing";
    return statuses.includes("available") ? "available" : statuses.includes("invalid") ? "invalid" : statuses.includes("missing") ? "missing" : "unsupported";
  }
  if (family === "attr.base") {
    const statuses = ATTRIBUTE_KEYS.map((key) => normalized.metadata.fields[`attributes.${key}.base`]?.status ?? "missing");
    return statuses.every((status) => status === "available") ? "available" : statuses.includes("invalid") ? "invalid" : statuses.includes("missing") ? "missing" : "unsupported";
  }
  if (family === "attr.purchased") {
    const statuses = ATTRIBUTE_KEYS.map((key) => normalized.metadata.fields[`attributes.${key}.purchased`]?.status ?? "missing");
    return statuses.every((status) => status === "available") ? "available" : statuses.includes("invalid") ? "invalid" : statuses.includes("missing") ? "missing" : "unsupported";
  }
  const values = ATTRIBUTE_KEYS.map((key) => normalized.attributes[key].total);
  return values.every((value) => value != null) ? "available" : "missing";
};

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const attrVector = (normalized: NormalizedPlayer | null, part: "base" | "purchased" | "total") => {
  if (!normalized) return null;
  const values = ATTRIBUTE_KEYS.map((key) => numberValue(normalized.attributes[key][part]));
  return values.every((value): value is number => value != null) ? values : null;
};

const vectorNonDecreasing = (oldValues: number[] | null, newValues: number[] | null) =>
  oldValues != null && newValues != null ? oldValues.every((value, index) => newValues[index] >= value) : null;

const vectorExact = (left: number[] | null, right: number[] | null) =>
  left != null && right != null ? left.every((value, index) => right[index] === value) : null;

const sumVector = (values: number[] | null) => values?.reduce((total, value) => total + value, 0) ?? null;

const dungeonVector = (normalized: NormalizedPlayer | null) => {
  if (!normalized) return null;
  const values = [
    normalized.dungeons.totals.normal,
    normalized.dungeons.totals.shadow,
    normalized.dungeons.totals.class,
    normalized.dungeons.tower.progress,
    normalized.dungeons.twister.progress,
    normalized.dungeons.raid.progress,
    normalized.dungeons.portals.player.progress,
  ].map(numberValue);
  return values.some((value) => value != null) ? values.map((value) => value ?? 0) : null;
};

const fortressVector = (normalized: NormalizedPlayer | null) => {
  if (!normalized) return null;
  const buildings = Object.values(normalized.fortress.buildings).map(numberValue);
  const values = [normalized.fortress.upgrades, normalized.fortress.gladiator, normalized.fortress.knights, ...buildings].map(numberValue);
  return values.some((value) => value != null) ? values.map((value) => value ?? 0) : null;
};

const petsVector = (normalized: NormalizedPlayer | null) => {
  if (!normalized?.pets) return null;
  const values = [
    ...Object.values(normalized.pets.bonuses),
    ...Object.values(normalized.pets.habitatProgress),
    normalized.pets.own?.totalCount ?? null,
    normalized.pets.own?.totalLevel ?? null,
  ].map(numberValue);
  return values.some((value) => value != null) ? values.map((value) => value ?? 0) : null;
};

const registeredAt = (normalized: NormalizedPlayer | null) => normalized?.extended.extras.registeredAt ?? null;
const playerClass = (normalized: NormalizedPlayer | null) => normalized?.identity.class ?? null;
const playerLevel = (normalized: NormalizedPlayer | null) => normalized?.progression.level ?? null;

const progressionPlausible = (oldValue: number | null, newValue: number | null) =>
  oldValue != null && newValue != null ? newValue >= oldValue : null;

const statusCountsByLayout = (bundles: ScanBundle[]) => {
  const counts = new Map<string, Record<(typeof PLAYER_FIELD_FAMILIES)[number], StatusCounts & { total: number }>>();
  bundles.forEach((bundle) => {
    bundle.rawPlayersByIdentifier.forEach((rawPlayer) => {
      const player = normalizeSfPlayerCharacterCore(rawPlayer);
      const layout = player.metadata.layout;
      const layoutCounts =
        counts.get(layout) ??
        Object.fromEntries(PLAYER_FIELD_FAMILIES.map((family) => [family, { ...emptyStatusCounts(), total: 0 }])) as Record<
          (typeof PLAYER_FIELD_FAMILIES)[number],
          StatusCounts & { total: number }
        >;
      PLAYER_FIELD_FAMILIES.forEach((family) => {
        layoutCounts[family].total += 1;
        addStatus(layoutCounts[family], fieldStatus(player, family));
      });
      counts.set(layout, layoutCounts);
    });
  });
  return counts;
};

const formatStatusCounts = (counts: StatusCounts & { total: number }) => {
  const pct = counts.total ? Math.round((counts.available / counts.total) * 100) : 0;
  return `available=${counts.available}/${counts.total} (${pct}%) missing=${counts.missing} unsupported=${counts.unsupported} invalid=${counts.invalid}`;
};

const createLogicalGuildMap = (guildItems: FusionIdentityManagementItem[]) => {
  const byGuildIdentifier = new Map<string, string>();
  guildItems
    .filter((item) => item.entityType === "guild" && item.status === "ready" && item.readyCandidateIdentifier)
    .forEach((item) => {
      const logical = item.id;
      byGuildIdentifier.set(normalizeKey(item.currentIdentifier), logical);
      if (item.readyCandidateIdentifier) byGuildIdentifier.set(normalizeKey(item.readyCandidateIdentifier), logical);
    });
  return byGuildIdentifier;
};

const logicalGuildForPlayerObservation = (
  observation: PlayerFusionObservation,
  logicalGuildByIdentifier: Map<string, string>,
) => {
  const identifier = fullGuildIdentifier(observation);
  return identifier ? logicalGuildByIdentifier.get(normalizeKey(identifier)) ?? null : null;
};

const candidateSelectedObservation = (
  historicalByIdentifier: Map<string, PlayerFusionObservation[]>,
  candidate: PlayerFusionCandidate,
  currentTimestamp: number,
) => {
  const observations = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
  const eligible = observations.filter((observation) => observation.timestamp < currentTimestamp);
  return latestByTimestamp(eligible.length ? eligible : observations);
};

const readyCandidateEvidence = (
  item: FusionIdentityManagementItem,
  playerResultByCurrent: Map<string, PlayerFusionPlayerResult>,
) => {
  const result = playerResultByCurrent.get(normalizeKey(item.currentIdentifier));
  return result?.candidates.find((candidate) => normalizeKey(candidate.oldIdentifier) === normalizeKey(item.readyCandidateIdentifier)) ?? null;
};

const selectFalseCandidates = (
  historicalObservations: PlayerFusionObservation[],
  trueHistoricalIdentifier: string,
  current: PlayerFusionObservation,
  limit = 5,
) =>
  historicalObservations
    .filter(
      (candidate) =>
        normalizeKey(candidate.identifier) !== normalizeKey(trueHistoricalIdentifier) &&
        resolveServerCode(candidate.server) === resolveServerCode(trueHistoricalIdentifier.match(/^s(\d+)_eu/)?.[0] ?? candidate.server) &&
        normalizeKey(candidate.classId) === normalizeKey(current.classId) &&
        (candidate.level == null || current.level == null || current.level >= candidate.level),
    )
    .sort((left, right) => Math.abs((current.level ?? 0) - (right.level ?? 0)) - Math.abs((current.level ?? 0) - (left.level ?? 0)))
    .slice(0, limit);

const evaluatePair = (
  oldPlayer: NormalizedPlayer | null,
  newPlayer: NormalizedPlayer | null,
) => {
  const level = progressionPlausible(playerLevel(oldPlayer), playerLevel(newPlayer));
  const base = vectorNonDecreasing(attrVector(oldPlayer, "base"), attrVector(newPlayer, "base"));
  const purchased = vectorNonDecreasing(attrVector(oldPlayer, "purchased"), attrVector(newPlayer, "purchased"));
  const total = vectorNonDecreasing(attrVector(oldPlayer, "total"), attrVector(newPlayer, "total"));
  const dungeons = vectorNonDecreasing(dungeonVector(oldPlayer), dungeonVector(newPlayer));
  const fortress = vectorNonDecreasing(fortressVector(oldPlayer), fortressVector(newPlayer));
  const pets = vectorNonDecreasing(petsVector(oldPlayer), petsVector(newPlayer));
  const regOld = registeredAt(oldPlayer);
  const regNew = registeredAt(newPlayer);
  return {
    classEqual: playerClass(oldPlayer) != null && playerClass(newPlayer) != null ? playerClass(oldPlayer) === playerClass(newPlayer) : null,
    level,
    base,
    purchased,
    total,
    dungeons,
    fortress,
    pets,
    registeredAtEqual: regOld != null && regNew != null ? regOld === regNew : null,
    baseExact: vectorExact(attrVector(oldPlayer, "base"), attrVector(newPlayer, "base")),
    purchasedExact: vectorExact(attrVector(oldPlayer, "purchased"), attrVector(newPlayer, "purchased")),
  };
};

const increment = (map: Record<string, number>, key: string, by = 1) => {
  map[key] = (map[key] ?? 0) + by;
};

const evaluateLeadership = (
  oldGuild: NormalizedGuild | null,
  newGuild: NormalizedGuild | null,
  logicalPlayerByIdentifier: Map<string, string>,
) => {
  const logicalPlayer = (identifier: string | null | undefined) =>
    identifier ? logicalPlayerByIdentifier.get(normalizeKey(identifier)) ?? null : null;
  const oldLeader = oldGuild?.members.find((member) => member.role.name === "leader") ?? null;
  const newLeader = newGuild?.members.find((member) => member.role.name === "leader") ?? null;
  const oldLeaderLogical = logicalPlayer(oldLeader?.identity.playerIdentifier);
  const newLeaderLogical = logicalPlayer(newLeader?.identity.playerIdentifier);
  const oldOfficers = new Set(
    (oldGuild?.members ?? [])
      .filter((member) => member.role.name === "officer")
      .map((member) => logicalPlayer(member.identity.playerIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const newOfficers = new Set(
    (newGuild?.members ?? [])
      .filter((member) => member.role.name === "officer")
      .map((member) => logicalPlayer(member.identity.playerIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const continuedOfficers = [...oldOfficers].filter((officer) => newOfficers.has(officer)).length;

  return {
    oldLeader: oldLeader?.identity.name ?? oldLeader?.identity.playerIdentifier ?? null,
    newLeader: newLeader?.identity.name ?? newLeader?.identity.playerIdentifier ?? null,
    sameLogicalLeader: oldLeaderLogical != null && newLeaderLogical != null ? oldLeaderLogical === newLeaderLogical : null,
    oldOfficers: oldOfficers.size,
    newOfficers: newOfficers.size,
    continuedOfficers,
  };
};

const guildProgressionSummary = (guild: NormalizedGuild | null) => {
  if (!guild) return null;
  return {
    treasure: guild.bonuses.totalTreasure,
    instructor: guild.bonuses.totalInstructor,
    raid: guild.combatProgress.raid,
    portalFloor: guild.combatProgress.portal.floor,
    hydra: guild.combatProgress.hydra.level,
    petLevel: guild.combatProgress.pet.level,
    knights: guild.totals.totalKnights,
  };
};

const scanRootArg = process.argv.find((arg) => arg.startsWith("--scanRoot="));
const positionalScanRoot = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const scanRoot = scanRootArg?.slice("--scanRoot=".length) || positionalScanRoot || DEFAULT_SCAN_ROOT;

const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
assert.ok(snapshots.length > 0, "expected real scan snapshots");

const bundles = snapshots.map(createScanBundle);
const bundlesByTimestamp = new Map(bundles.map((bundle) => [bundle.snapshot.timestampMs, bundle]));
const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
const historicalPlayerObservations = allPlayerObservations.filter((observation) => ORIGIN_CODES.has(resolveServerCode(observation.server) ?? ""));
const currentPlayerObservations = allPlayerObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
const historicalPlayerGroups = groupByHistoricalIdentifier(historicalPlayerObservations);
const currentPlayerGroups = groupPlayerObservations(currentPlayerObservations);
const representativeCurrentObservations = [...currentPlayerGroups.values()].map((observations) => latestByTimestamp(observations) ?? observations[0]);
const playerResults = resolvePlayerFusions({ historicalObservations: historicalPlayerObservations, newObservations: representativeCurrentObservations }).results;
const playerResultByCurrent = new Map(playerResults.map((result) => [normalizeKey(result.newIdentifier), result]));

const dbSuffix = Date.now();
const playerDb = `fusion-semantic-evidence-player-${dbSuffix}`;
const guildDb = `fusion-semantic-evidence-guild-${dbSuffix}`;
await deleteDB(playerDb);
await deleteDB(guildDb);
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });

try {
  const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
  const playerItems = report.items.filter((item) => item.entityType === "player");
  const guildItems = report.items.filter((item) => item.entityType === "guild");
  const readyPlayers = playerItems.filter((item) => item.status === "ready" && item.readyCandidateIdentifier);
  const reviewUnresolvedPlayers = playerItems.filter((item) => item.status === "review" || item.status === "unresolved");
  const reviewGuilds = guildItems.filter((item) => item.status === "review");
  const logicalGuildByIdentifier = createLogicalGuildMap(guildItems);
  const logicalPlayerByIdentifier = new Map<string, string>();
  readyPlayers.forEach((item) => {
    logicalPlayerByIdentifier.set(normalizeKey(item.currentIdentifier), item.id);
    if (item.readyCandidateIdentifier) logicalPlayerByIdentifier.set(normalizeKey(item.readyCandidateIdentifier), item.id);
  });

  printSection("Dataset");
  const postFusionSnapshots = snapshots.filter((snapshot) =>
    createFusionIdentityObservations(snapshot).some((observation) => resolveServerCode(observation.server) === TARGET_CODE),
  );
  const historicalSnapshots = snapshots.filter((snapshot) =>
    createFusionIdentityObservations(snapshot).some((observation) => ORIGIN_CODES.has(resolveServerCode(observation.server) ?? "")),
  );
  console.log(`scanRoot=${scanRoot}`);
  console.log(`scans=${snapshots.length}, preFusionScans=${historicalSnapshots.length}, postFusionScans=${postFusionSnapshots.length}`);
  console.log(`timeRange=${formatDate(snapshots[0]?.timestampMs)} -> ${formatDate(snapshots[snapshots.length - 1]?.timestampMs)}`);
  console.log(`playerObservations=${allPlayerObservations.length}, currentPlayerObservations=${currentPlayerObservations.length}, uniqueCurrentPlayers=${currentPlayerGroups.size}`);
  console.log(`guildObservations=${allGuildObservations.length}, uniqueGuildIds=${new Set(allGuildObservations.map((entry) => normalizeKey(entry.guildIdentifier))).size}`);
  console.log(`baseline players ready=${readyPlayers.length} review=${playerItems.filter((item) => item.status === "review").length} unresolved=${playerItems.filter((item) => item.status === "unresolved").length} noHistory=${playerItems.filter((item) => item.status === "noHistory").length}`);
  console.log(`baseline guilds ready=${guildItems.filter((item) => item.status === "ready").length} review=${reviewGuilds.length}`);

  printSection("Player Availability Matrix");
  const coverage = statusCountsByLayout(bundles);
  [...coverage.entries()].forEach(([layout, familyCounts]) => {
    console.log(`Layout ${layout}`);
    PLAYER_FIELD_FAMILIES.forEach((family) => console.log(`- ${family}: ${formatStatusCounts(familyCounts[family])}`));
  });

  printSection("Positive Match Stability");
  const positiveStats: Record<string, number> = {};
  const positivePairs = readyPlayers.flatMap((item) => {
    const currentObservations = currentPlayerGroups.get(normalizeKey(item.currentIdentifier)) ?? [];
    const firstCurrent = firstByTimestamp(currentObservations);
    const latestCurrent = latestByTimestamp(currentObservations);
    const historicalObservations = item.readyCandidateIdentifier ? historicalPlayerGroups.get(normalizeKey(item.readyCandidateIdentifier)) ?? [] : [];
    const lastHistorical = firstCurrent ? latestByTimestamp(historicalObservations.filter((entry) => entry.timestamp < firstCurrent.timestamp)) ?? latestByTimestamp(historicalObservations) : null;
    if (!firstCurrent || !latestCurrent || !lastHistorical) return [];
    return [{ item, firstCurrent, latestCurrent, lastHistorical }];
  });
  positivePairs.forEach(({ firstCurrent, latestCurrent, lastHistorical }) => {
    const oldPlayer = normalizedForObservation(bundlesByTimestamp, lastHistorical);
    const firstPlayer = normalizedForObservation(bundlesByTimestamp, firstCurrent);
    const latestPlayer = normalizedForObservation(bundlesByTimestamp, latestCurrent);
    const firstEval = evaluatePair(oldPlayer, firstPlayer);
    const latestEval = evaluatePair(oldPlayer, latestPlayer);
    Object.entries(firstEval).forEach(([key, value]) => increment(positiveStats, `first.${key}.${String(value)}`));
    Object.entries(latestEval).forEach(([key, value]) => increment(positiveStats, `latest.${key}.${String(value)}`));
  });
  console.log(`positiveControls=${positivePairs.length}`);
  Object.keys(positiveStats)
    .sort()
    .forEach((key) => console.log(`- ${key}: ${positiveStats[key]}`));

  printSection("Negative Candidate Separation");
  const negativeStats: Record<string, number> = {};
  const samplePositivePairs = positivePairs.slice(0, 300);
  let falsePairCount = 0;
  samplePositivePairs.forEach(({ item, firstCurrent, lastHistorical }) => {
    if (!item.readyCandidateIdentifier) return;
    const falseCandidates = historicalPlayerObservations
      .filter(
        (observation) =>
          normalizeKey(observation.identifier) !== normalizeKey(item.readyCandidateIdentifier) &&
          resolveServerCode(observation.server) === resolveServerCode(lastHistorical.server) &&
          normalizeKey(observation.classId) === normalizeKey(firstCurrent.classId) &&
          (observation.level == null || firstCurrent.level == null || firstCurrent.level >= observation.level),
      )
      .sort((left, right) => Math.abs((firstCurrent.level ?? 0) - (left.level ?? 0)) - Math.abs((firstCurrent.level ?? 0) - (right.level ?? 0)))
      .slice(0, 5);
    falseCandidates.forEach((candidateObservation) => {
      falsePairCount += 1;
      const oldPlayer = normalizedForObservation(bundlesByTimestamp, candidateObservation);
      const currentPlayer = normalizedForObservation(bundlesByTimestamp, firstCurrent);
      const evaluation = evaluatePair(oldPlayer, currentPlayer);
      Object.entries(evaluation).forEach(([key, value]) => increment(negativeStats, `${key}.${String(value)}`));
    });
  });
  console.log(`falseControls=${falsePairCount} from ready sample=${samplePositivePairs.length}`);
  Object.keys(negativeStats)
    .sort()
    .forEach((key) => console.log(`- ${key}: ${negativeStats[key]}`));

  printSection("Observation History and Review Pool");
  const reviewStats = {
    total: reviewUnresolvedPlayers.length,
    multiplePost: 0,
    guildChanged: 0,
    nameChanged: 0,
    earliestAddsSameGuildV1: 0,
    logicalGuildPositive: 0,
    semanticDifferentiatesOne: 0,
    noSemanticAvailability: 0,
  };
  const reviewExamples: string[] = [];
  reviewUnresolvedPlayers.forEach((item) => {
    const currentObservations = [...(currentPlayerGroups.get(normalizeKey(item.currentIdentifier)) ?? [])].sort((left, right) => left.timestamp - right.timestamp);
    if (currentObservations.length > 1) reviewStats.multiplePost += 1;
    if (new Set(currentObservations.map((entry) => normalizeText(entry.guildName ?? entry.guildIdentifier))).size > 1) reviewStats.guildChanged += 1;
    if (new Set(currentObservations.map((entry) => normalizeText(entry.name))).size > 1) reviewStats.nameChanged += 1;
    const firstCurrent = firstByTimestamp(currentObservations);
    const latestResult = playerResultByCurrent.get(normalizeKey(item.currentIdentifier)) ?? null;
    const firstResult = firstCurrent ? resolvePlayerFusions({ historicalObservations: historicalPlayerObservations, newObservations: [firstCurrent] }).results[0] : null;
    const latestHasSameGuild = Boolean(latestResult?.candidates.some((candidate) => !candidate.rejected && candidate.evidence.sameGuild === true));
    const firstHasSameGuild = Boolean(firstResult?.candidates.some((candidate) => !candidate.rejected && candidate.evidence.sameGuild === true));
    if (firstHasSameGuild && !latestHasSameGuild) reviewStats.earliestAddsSameGuildV1 += 1;

    const candidates = latestResult?.candidates.filter((candidate) => !candidate.rejected) ?? [];
    const currentLogicalGuilds = new Set(currentObservations.map((observation) => logicalGuildForPlayerObservation(observation, logicalGuildByIdentifier)).filter(Boolean));
    const logicalGuildCandidates = candidates.filter((candidate) => {
      const selected = candidateSelectedObservation(historicalPlayerGroups, candidate, firstCurrent?.timestamp ?? Infinity);
      return selected ? currentLogicalGuilds.has(logicalGuildForPlayerObservation(selected, logicalGuildByIdentifier) ?? "") : false;
    });
    if (logicalGuildCandidates.length === 1) reviewStats.logicalGuildPositive += 1;

    const semanticCandidates = candidates.filter((candidate) => {
      const selected = candidateSelectedObservation(historicalPlayerGroups, candidate, firstCurrent?.timestamp ?? Infinity);
      const oldPlayer = normalizedForObservation(bundlesByTimestamp, selected);
      const currentPlayer = normalizedForObservation(bundlesByTimestamp, firstCurrent);
      const evaluation = evaluatePair(oldPlayer, currentPlayer);
      return evaluation.classEqual !== false && evaluation.level !== false && evaluation.base !== false && evaluation.dungeons !== false && evaluation.fortress !== false;
    });
    if (candidates.length > 1 && semanticCandidates.length === 1) reviewStats.semanticDifferentiatesOne += 1;
    if (!candidates.length) reviewStats.noSemanticAvailability += 1;
    if (reviewExamples.length < 12 && (logicalGuildCandidates.length === 1 || semanticCandidates.length === 1 || firstHasSameGuild)) {
      reviewExamples.push(
        `${item.currentIdentifier} ${item.currentName ?? ""} status=${item.status} candidates=${candidates.length} firstSameGuild=${firstHasSameGuild} logicalGuildUnique=${logicalGuildCandidates.length === 1} semanticUnique=${semanticCandidates.length === 1}`,
      );
    }
  });
  console.log(JSON.stringify(reviewStats));
  reviewExamples.forEach((entry) => console.log(`- ${entry}`));

  printSection("Makio Semantic Evidence");
  const makioItem = playerItems.find((item) => normalizeKey(item.currentIdentifier) === "f28_net_p209891");
  const makioObservations = [...(currentPlayerGroups.get("f28_net_p209891") ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const makioResult = playerResultByCurrent.get("f28_net_p209891") ?? null;
  const makioCandidate = makioResult?.candidates.find((candidate) => candidate.oldIdentifier === "s3_eu_p53199") ?? null;
  const makioHistorical = makioCandidate ? candidateSelectedObservation(historicalPlayerGroups, makioCandidate, makioObservations[0]?.timestamp ?? Infinity) : null;
  const makioOld = normalizedForObservation(bundlesByTimestamp, makioHistorical);
  const makioFirst = normalizedForObservation(bundlesByTimestamp, makioObservations[0]);
  const makioLatest = normalizedForObservation(bundlesByTimestamp, makioObservations[makioObservations.length - 1]);
  console.log(`status=${makioItem?.status ?? "missing"} candidate=${makioCandidate ? "yes" : "no"} rejected=${makioCandidate?.rejected ?? "missing"} reasons=${makioCandidate?.rejectReasons.join(",") || "none"}`);
  console.log(`history=${makioHistorical?.identifier ?? "missing"} ${makioHistorical?.name ?? ""} level=${makioHistorical?.level ?? "missing"} guild=${makioHistorical?.guildName ?? "missing"} ts=${formatDate(makioHistorical?.timestamp)}`);
  makioObservations.forEach((observation) => console.log(`currentObs ${formatDate(observation.timestamp)} name=${observation.name} level=${observation.level} guild=${observation.guildName} origin=${observation.originNumericId ?? "none"}`));
  console.log(`firstPair=${JSON.stringify(evaluatePair(makioOld, makioFirst))}`);
  console.log(`latestPair=${JSON.stringify(evaluatePair(makioOld, makioLatest))}`);
  console.log(`oldAvailability=${PLAYER_FIELD_FAMILIES.map((family) => `${family}:${fieldStatus(makioOld, family)}`).join(" ")}`);
  console.log(`firstAvailability=${PLAYER_FIELD_FAMILIES.map((family) => `${family}:${fieldStatus(makioFirst, family)}`).join(" ")}`);
  console.log(`latestAvailability=${PLAYER_FIELD_FAMILIES.map((family) => `${family}:${fieldStatus(makioLatest, family)}`).join(" ")}`);
  console.log(`logicalGuild old=${makioHistorical ? logicalGuildForPlayerObservation(makioHistorical, logicalGuildByIdentifier) ?? "unresolved" : "missing"} first=${makioObservations[0] ? logicalGuildForPlayerObservation(makioObservations[0], logicalGuildByIdentifier) ?? "unresolved" : "missing"} latest=${makioObservations[1] ? logicalGuildForPlayerObservation(makioObservations[1], logicalGuildByIdentifier) ?? "unresolved" : "missing"}`);

  printSection("Guild Review Semantic Evidence");
  const guildCaseLines: string[] = [];
  for (const guildItem of reviewGuilds) {
    const candidates = guildItem.candidates.filter((candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> => candidate.entityType === "guild");
    candidates.forEach((candidate) => {
      const evidence = candidate.evidence as GuildFusionCandidate;
      const currentGuild = findNormalizedGuildAcrossBundles(bundles, evidence.newGuildIdentifier, {
        after: guildItem.firstSeen,
        latest: false,
      });
      const historicalGuild = findNormalizedGuildAcrossBundles(bundles, evidence.oldGuildIdentifier, {
        before: guildItem.firstSeen,
        latest: true,
      });
      const leadership = evaluateLeadership(historicalGuild, currentGuild, logicalPlayerByIdentifier);
      const progressOld = guildProgressionSummary(historicalGuild);
      const progressNew = guildProgressionSummary(currentGuild);
      guildCaseLines.push(
        `${guildItem.currentName ?? guildItem.currentIdentifier} <- ${candidate.historicalName ?? candidate.historicalIdentifier}: exactName=${evidence.exactName} sameCoA=${evidence.sameCoA} matched=${evidence.matchedMemberCount} leaderSame=${leadership.sameLogicalLeader} officers=${leadership.continuedOfficers}/${leadership.oldOfficers} progressOld=${JSON.stringify(progressOld)} progressNew=${JSON.stringify(progressNew)}`,
      );
    });
  }
  guildCaseLines.slice(0, 40).forEach((line) => console.log(`- ${line}`));

  printSection("Ground Truth Guild Cases");
  GUILD_CASES.forEach((item) => {
    const matches = guildItems.filter((entry) => normalizeText(entry.currentName) === normalizeText(item.currentName));
    const selected =
      (item.historicalId
        ? matches.find((entry) => entry.candidates.some((candidate) => normalizeKey(candidate.historicalIdentifier) === normalizeKey(item.historicalId)))
        : matches[0]) ?? null;
    const candidate = item.historicalId
      ? selected?.candidates.find((entry) => normalizeKey(entry.historicalIdentifier) === normalizeKey(item.historicalId))
      : selected?.candidates[0];
    console.log(
      `- ${item.label}: current=${selected?.currentIdentifier ?? "missing"} status=${selected?.status ?? "missing"} candidate=${candidate?.historicalIdentifier ?? "missing"} ready=${candidate?.ready ?? false}`,
    );
  });

  printSection("Delta Potential");
  console.log("| Metric | Current Baseline | Cases with additional usable evidence |");
  console.log("| --- | ---: | ---: |");
  console.log(`| Player Ready | ${readyPlayers.length} | - |`);
  console.log(`| Player Review | ${playerItems.filter((item) => item.status === "review").length} | history=${reviewStats.earliestAddsSameGuildV1}, logicalGuild=${reviewStats.logicalGuildPositive}, semanticUnique=${reviewStats.semanticDifferentiatesOne} |`);
  console.log(`| Player Unresolved | ${playerItems.filter((item) => item.status === "unresolved").length} | included in review/unresolved figures |`);
  console.log(`| Guild Ready | ${guildItems.filter((item) => item.status === "ready").length} | - |`);
  console.log(`| Guild Review | ${reviewGuilds.length} | leadership/progression lines above, no auto-ready claim |`);

  printSection("Recommendations");
  console.log("Player V2 hard compatibility: class remains safe where available; origin remains input evidence where reliable.");
  console.log("Player V2 strong positive: exact/fusion name, confirmed logical guild at close timestamps, exact registeredAt only if future data shows availability.");
  console.log("Player V2 temporal plausibility: level, base attributes, purchased attributes when available, dungeon/fortress/pet progression as availability-aware supporting evidence.");
  console.log("Player V2 supporting/volatile: total attributes and equipment-derived values; treat guild changes as neutral, not negative.");
  console.log("Guild V3 evidence: keep name/CoA/member flow, add leadership core and officer continuity via resolved logical player identities; keep normal member core separate to avoid migration-as-identity.");
  console.log("Architecture: pass historical observations[] and current observations[] into Player Resolver V2; use confirmed guild identities only after a separated pass to avoid circular evidence.");
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(playerDb);
  await deleteDB(guildDb);
}
