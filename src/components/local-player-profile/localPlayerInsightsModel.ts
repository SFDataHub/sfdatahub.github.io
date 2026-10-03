import {
  getGuildHubLocalScan,
  listGuildHubScanSummaries,
  type GuildHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
import {
  ensureGuildAnalyticsDerivedDataFromSummaries,
} from "../../lib/guilds/localGuildAnalyticsStore";
import {
  isNormalizedGuildMemberInGuild,
  normalizeGuildScanMember,
  normalizeGuildSegmentForScan,
} from "../../lib/guilds/guildScanNormalizer";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { normalizeSfGuild } from "../../lib/parsing/normalizedGuild";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import {
  buildPlayerPerformanceModel,
  type PlayerPerformanceSnapshot,
} from "../../pages/Playground/playerPerformanceModel";
import type { LocalBaseStatValues, LocalPlayerProfileModel } from "./types";

type JsonRecord = Record<string, unknown>;

export type LocalPlayerAttributeComparison = {
  key: keyof LocalBaseStatValues;
  label: string;
  playerValue: number | null;
  guildAverage: number | null;
  validGuildMembers: number;
};

export type LocalPlayerInsightsModel = {
  status: "ready" | "loading" | "error";
  message?: string;
  rankings: {
    player: number | null;
    guild: number | null;
    server: number | null;
  };
  progression: {
    gameCompletion: number | null;
    itemsDiscovered: number | null;
  };
  playerVsAverage: LocalPlayerAttributeComparison[];
  personalBests: {
    highestXpPerDay: number | null;
    highestDungeon: number | null;
    bestServerRank: number | null;
    historyAvailable: boolean;
  };
};

const DAY_MS = 86_400_000;

const ATTRIBUTE_DEFS: Array<{ key: keyof LocalBaseStatValues; normalizedKey: keyof NormalizedPlayer["attributes"]; label: string }> = [
  { key: "str", normalizedKey: "strength", label: "Strength" },
  { key: "dex", normalizedKey: "dexterity", label: "Dexterity" },
  { key: "int", normalizedKey: "intelligence", label: "Intelligence" },
  { key: "con", normalizedKey: "constitution", label: "Constitution" },
  { key: "lck", normalizedKey: "luck", label: "Luck" },
];

export async function buildLocalPlayerInsights(profile: LocalPlayerProfileModel): Promise<LocalPlayerInsightsModel> {
  const [currentScan, summaries, identityResolutionSnapshot] = await Promise.all([
    getGuildHubLocalScan(profile.sourceScanId),
    listGuildHubScanSummaries(),
    loadIdentityResolutionSnapshot(),
  ]);
  const analyticsData = await ensureGuildAnalyticsDerivedDataFromSummaries(summaries, {
    loadSourceById: getGuildHubLocalScan,
  });
  const performance = buildPlayerPerformanceModel([], {
    analyticsData,
    identityResolutionSnapshot,
    target: {
      name: profile.analytics.playerName,
      server: profile.analytics.server,
      memberRef: profile.analytics.memberRef,
    },
  });
  const currentScanModel = buildCurrentScanInsights(profile, currentScan);
  const personalBests = await buildPersonalBests(performance.snapshots);

  return {
    status: "ready",
    rankings: currentScanModel.rankings,
    progression: currentScanModel.progression,
    playerVsAverage: currentScanModel.playerVsAverage,
    personalBests,
  };
}

function buildCurrentScanInsights(profile: LocalPlayerProfileModel, scan: GuildHubLocalScan | null) {
  const raw = asRecord(scan?.rawData);
  const players = filterEntriesForTimestamp(Array.isArray(raw?.players) ? raw.players : [], profile.analytics.scannedAtMs)
    .map(asRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const groups = filterEntriesForTimestamp(
    Array.isArray(raw?.groups) ? raw.groups : Array.isArray(raw?.guilds) ? raw.guilds : [],
    profile.analytics.scannedAtMs,
  )
    .map(asRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const fallbackServer = normalizeServer(profile.analytics.server);
  const player = findCurrentPlayer(players, profile, fallbackServer);
  const normalizedPlayer = safeNormalizePlayer(player);
  const guildSegment = normalizeGuildSegmentForScan(profile.analytics.guildIdentifier);
  const guildName = profile.analytics.guildName ?? normalizedPlayer?.guild.name ?? null;
  const guildIdentity = {
    name: guildName ?? "",
    server: fallbackServer,
    guildSegment,
  };
  const guildPlayers = players.filter((entry) => {
    const member = normalizeGuildScanMember(entry, fallbackServer);
    if (!member) return false;
    return isNormalizedGuildMemberInGuild(member, guildIdentity);
  });
  const guild = findCurrentGuild(groups, profile, fallbackServer, guildSegment);

  return {
    rankings: {
      player: readPositiveRank(normalizedPlayer?.progression.rank ?? readNumber(player, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"])),
      guild: readPositiveRank(guild?.progression.rank ?? null),
      server: null,
    },
    progression: {
      gameCompletion: null,
      itemsDiscovered: normalizedPlayer?.progressionStatus.scrapbook.count ?? null,
    },
    playerVsAverage: buildPlayerVsAverage(normalizedPlayer, guildPlayers),
  };
}

function buildPlayerVsAverage(
  normalizedPlayer: NormalizedPlayer | null,
  guildPlayers: JsonRecord[],
): LocalPlayerAttributeComparison[] {
  const guildValuesByKey = new Map<keyof LocalBaseStatValues, number[]>();
  ATTRIBUTE_DEFS.forEach((attribute) => guildValuesByKey.set(attribute.key, []));

  guildPlayers.forEach((player) => {
    const normalized = safeNormalizePlayer(player);
    if (!normalized) return;
    ATTRIBUTE_DEFS.forEach((attribute) => {
      const value = finiteNumber(normalized.attributes[attribute.normalizedKey].base);
      if (value != null) guildValuesByKey.get(attribute.key)?.push(value);
    });
  });

  return ATTRIBUTE_DEFS.map((attribute) => {
    const guildValues = guildValuesByKey.get(attribute.key) ?? [];
    return {
      key: attribute.key,
      label: attribute.label,
      playerValue: finiteNumber(normalizedPlayer?.attributes[attribute.normalizedKey].base),
      guildAverage: average(guildValues),
      validGuildMembers: guildValues.length,
    };
  });
}

async function buildPersonalBests(snapshots: PlayerPerformanceSnapshot[]): Promise<LocalPlayerInsightsModel["personalBests"]> {
  const highestXpPerDay = calculateHighestNonNegativeXpPerDay(snapshots);
  const ranks = await readRanksFromMatchedSnapshots(snapshots);

  return {
    highestXpPerDay,
    highestDungeon: null,
    bestServerRank: ranks.length ? Math.min(...ranks) : null,
    historyAvailable: snapshots.length > 0,
  };
}

export function calculateHighestNonNegativeXpPerDay(
  snapshots: Array<Pick<PlayerPerformanceSnapshot, "scannedAtMs" | "xpTotal">>,
) {
  let highestXpPerDay: number | null = null;
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const elapsedDays = (current.scannedAtMs - previous.scannedAtMs) / DAY_MS;
    const startXp = finiteNumber(previous.xpTotal);
    const endXp = finiteNumber(current.xpTotal);
    if (elapsedDays <= 0 || startXp == null || endXp == null) continue;
    const delta = endXp - startXp;
    if (delta < 0) continue;
    const perDay = delta / elapsedDays;
    if (!Number.isFinite(perDay)) continue;
    highestXpPerDay = highestXpPerDay == null ? perDay : Math.max(highestXpPerDay, perDay);
  }
  return highestXpPerDay;
}

async function readRanksFromMatchedSnapshots(snapshots: PlayerPerformanceSnapshot[]) {
  const scansById = new Map<string, GuildHubLocalScan | null>();
  await Promise.all(
    [...new Set(snapshots.map((snapshot) => snapshot.scanId))].map(async (scanId) => {
      scansById.set(scanId, await getGuildHubLocalScan(scanId));
    }),
  );

  return snapshots
    .map((snapshot) => {
      const scan = scansById.get(snapshot.scanId) ?? null;
      const raw = asRecord(scan?.rawData);
      const players = filterEntriesForTimestamp(Array.isArray(raw?.players) ? raw.players : [], snapshot.scannedAtMs)
        .map(asRecord)
        .filter((entry): entry is JsonRecord => Boolean(entry));
      const player = findSnapshotPlayer(players, snapshot);
      const normalized = safeNormalizePlayer(player);
      return readPositiveRank(
        normalized?.progression.rank ??
        readNumber(player, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]),
      );
    })
    .filter(isFiniteNumber);
}

function findSnapshotPlayer(players: JsonRecord[], snapshot: PlayerPerformanceSnapshot) {
  const memberRef = snapshot.memberRef?.toLowerCase() ?? null;
  const identifier = snapshot.identifier?.toLowerCase() ?? null;
  return players.find((player) => {
    const playerIdentifier = readString(player, ["identifier", "Identifier"])?.toLowerCase() ?? null;
    if (playerIdentifier && (playerIdentifier === memberRef || playerIdentifier === identifier)) return true;
    const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
    const server = normalizeServer(
      readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(playerIdentifier) ?? snapshot.server,
    );
    return Boolean(playerId && server && memberRef === `${server}_p${playerId}`.toLowerCase());
  }) ?? null;
}

function findCurrentPlayer(players: JsonRecord[], profile: LocalPlayerProfileModel, fallbackServer: string | null) {
  const sourceKey = profile.sourcePlayerKey.toLowerCase();
  const memberRef = profile.analytics.memberRef?.toLowerCase() ?? null;
  return players.find((player) => {
    const identifier = readString(player, ["identifier", "Identifier"])?.toLowerCase() ?? null;
    if (identifier && (identifier === sourceKey || identifier === memberRef)) return true;
    const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
    const server = normalizeServer(
      readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier) ?? fallbackServer,
    );
    if (playerId && server && `${server}_p${playerId}`.toLowerCase() === sourceKey) return true;
    if (sourceKey.includes(":name:")) {
      const name = readString(player, ["name", "Name", "playerName", "Player Name"]);
      return sourceKey.endsWith(`:name:${normalizeLoose(name)}`);
    }
    return false;
  }) ?? null;
}

function findCurrentGuild(
  groups: JsonRecord[],
  profile: LocalPlayerProfileModel,
  fallbackServer: string | null,
  guildSegment: string | null,
) {
  const guildName = normalizeLoose(profile.analytics.guildName);
  return groups
    .map((group) => normalizeSfGuild(group, { fallbackServer }))
    .find((guild) => {
      if (!guild) return false;
      const server = normalizeServer(guild.identity.server);
      const serverMatches = !fallbackServer || !server || fallbackServer === server;
      const segment = normalizeGuildSegmentForScan(guild.identity.identifier);
      if (guildSegment && segment && guildSegment === segment && serverMatches) return true;
      return Boolean(guildName && normalizeLoose(guild.identity.name) === guildName && serverMatches);
    }) ?? null;
}

function filterEntriesForTimestamp(entries: unknown[], scannedAtMs: number) {
  const timestamped = entries.filter((entry) => getEntryTimestampMs(entry) != null);
  if (!timestamped.length) return entries;
  return timestamped.filter((entry) => getEntryTimestampMs(entry) === scannedAtMs);
}

function getEntryTimestampMs(entry: unknown) {
  const record = asRecord(entry);
  if (!record) return null;
  return toTimestampMs(pickValue(record, ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"]));
}

function safeNormalizePlayer(player: unknown): NormalizedPlayer | null {
  if (!player) return null;
  try {
    return normalizeSfPlayerCharacterCore(player);
  } catch {
    return null;
  }
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readPositiveRank(value: unknown) {
  const rank = finiteNumber(value);
  return rank != null && rank > 0 ? rank : null;
}

function asRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function canonicalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickValue(record: JsonRecord | null, keys: string[]) {
  if (!record) return undefined;
  const sources = [record, asRecord(record.values), asRecord(record.latest), asRecord(asRecord(record.latest)?.values)].filter(
    (entry): entry is JsonRecord => Boolean(entry),
  );

  for (const source of sources) {
    const lookup = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => lookup.set(canonicalizeKey(key), value));
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const value = lookup.get(canonicalizeKey(key));
      if (value != null) return value;
    }
  }

  return undefined;
}

function readString(record: JsonRecord | null, keys: string[]) {
  const value = pickValue(record, keys);
  const text = String(value ?? "").trim();
  return text || null;
}

function readNumber(record: JsonRecord | null, keys: string[]) {
  const value = pickValue(record, keys);
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).trim().replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function toTimestampMs(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d{13}$/.test(text)) return Number(text);
  if (/^\d{10}$/.test(text)) return Number(text) * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value)?.toLowerCase() ?? null;
}

function parseServerFromIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ?? null;
}

function normalizeLoose(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
