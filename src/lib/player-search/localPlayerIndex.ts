import type { PlayerCardData, PlayerCardPotion } from "../../components/player-card/types";
import { resolvePotionAssetKey } from "../../components/potions/potionAssets";
import { getClassMetaById, iconForClassName } from "../../data/classes";
import { getGuildClassAccent } from "../../components/guilds/classColors";
import { guideAssetByKey } from "../../data/guidehub/assets";
import type { GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../guilds/localScanLibrary";
import {
  normalizeGuildScanMembers,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
  type NormalizedGuildRole,
} from "../guilds/guildScanNormalizer";
import { resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";
import { normalizePlayerIdentifierKey } from "../identities/playerIdentityStore";
import {
  buildPlayerCardDevelopmentLookup,
  type PlayerCardDevelopmentSummary,
  type PlayerCardDevelopmentSourceEntry,
} from "../player-progress/playerCardDevelopment";
import { normalizeSfPlayerPotions } from "../parsing/normalizedConsumables";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../parsing/normalizedPlayer";
import { readSfPlayerStats } from "../parsing/parseSfJson";
import { readSfPlayerSaveArray } from "../parsing/playerSaveLayout";
import { createPortraitOptionsFromSaveArray } from "../portraitFromSave";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { toDriveThumbProxy } from "../urls";

type JsonRecord = Record<string, unknown>;

export type LocalPlayerIndexIdentityKind = "identifier" | "server-player-id" | "scan-name";

export type LocalPlayerIndexPlayer = {
  key: string;
  identityKind: LocalPlayerIndexIdentityKind;
  name: string;
  server: string | null;
  guildName: string | null;
  xpTotal: number | null;
  scannedAtMs: number;
  importedAtMs: number;
  sourceScanId: string;
  sourceFilename: string;
  queryText: string;
  card: PlayerCardData;
  development?: PlayerCardDevelopmentSummary | null;
};

type LocalPlayerIndexEntry = LocalPlayerIndexPlayer & {
  developmentSource: PlayerCardDevelopmentSourceEntry;
};

type LocalPlayerIndexTargetFilter = {
  refs: ReadonlySet<string>;
  names: ReadonlySet<string>;
} | null;

export type LocalPlayerIndexScanInput = {
  scan: GuildHubLocalScan;
  summary: GuildHubScanSummary;
};

export type LocalPlayerIndexBuildStats = {
  scanCount: number;
  playerEntryCount: number;
  indexedPlayerCount: number;
};

export type LocalPlayerIndexResult = {
  players: LocalPlayerIndexPlayer[];
  stats: LocalPlayerIndexBuildStats;
};

const ROLE_LABELS: Record<Exclude<NormalizedGuildRole, null>, string> = {
  leader: "Leader",
  officer: "Officer",
  member: "Member",
};

export function buildLocalPlayerIndex(
  scans: LocalPlayerIndexScanInput[],
  options: {
    serverFilter?: string | null;
    analyticsData?: GuildAnalyticsDerivedData | null;
    identityResolutionSnapshot?: IdentityResolutionSnapshot | null;
    targetPlayerRefs?: readonly string[] | null;
    targetPlayerNames?: readonly string[] | null;
    includeCards?: boolean;
  } = {},
): LocalPlayerIndexResult {
  const builder = createLocalPlayerIndexBuilder(options);
  scans.forEach((input) => builder.addScan(input));
  return builder.finish();
}

export function createLocalPlayerIndexBuilder(
  options: {
    serverFilter?: string | null;
    analyticsData?: GuildAnalyticsDerivedData | null;
    identityResolutionSnapshot?: IdentityResolutionSnapshot | null;
    targetPlayerRefs?: readonly string[] | null;
    targetPlayerNames?: readonly string[] | null;
    includeCards?: boolean;
  } = {},
) {
  const serverFilter = normalizeServer(options.serverFilter);
  const targetFilter = buildTargetFilter({
    targetPlayerRefs: options.targetPlayerRefs ?? null,
    targetPlayerNames: options.targetPlayerNames ?? null,
    identityResolutionSnapshot: options.identityResolutionSnapshot ?? null,
  });
  const includeCards = options.includeCards ?? true;
  const allPlayers: LocalPlayerIndexEntry[] = [];
  let scanCount = 0;

  return {
    addScan(input: LocalPlayerIndexScanInput) {
      scanCount += 1;
      allPlayers.push(...buildPlayersFromScan(input.scan, input.summary, serverFilter, targetFilter, includeCards));
    },
    finish(): LocalPlayerIndexResult {
      const developmentByKey = buildPlayerCardDevelopmentLookup(
        allPlayers.map((player) => player.developmentSource),
        {
          analyticsData: options.analyticsData ?? null,
          identityResolutionSnapshot: options.identityResolutionSnapshot ?? null,
        },
      );
      const deduped = new Map<string, LocalPlayerIndexPlayer>();

      for (const player of allPlayers) {
        const nextPlayer: LocalPlayerIndexPlayer = {
          ...player,
          development: developmentByKey.get(player.key) ?? null,
        };
        const previous = deduped.get(nextPlayer.key);
        if (!previous || comparePlayerFreshness(nextPlayer, previous) < 0) {
          deduped.set(nextPlayer.key, nextPlayer);
        }
      }

      const players = [...deduped.values()].sort(
        (a, b) =>
          b.scannedAtMs - a.scannedAtMs ||
          a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" }) ||
          (a.server ?? "").localeCompare(b.server ?? "", "de-DE", { sensitivity: "base" }),
      );

      return {
        players,
        stats: {
          scanCount,
          playerEntryCount: allPlayers.length,
          indexedPlayerCount: players.length,
        },
      };
    },
  };
}

function buildTargetFilter({
  targetPlayerRefs,
  targetPlayerNames,
  identityResolutionSnapshot,
}: {
  targetPlayerRefs: readonly string[] | null;
  targetPlayerNames: readonly string[] | null;
  identityResolutionSnapshot: IdentityResolutionSnapshot | null;
}): LocalPlayerIndexTargetFilter {
  if (!targetPlayerRefs && !targetPlayerNames) return null;
  const refs = new Set<string>();
  const names = new Set<string>();

  const addIdentifier = (value: string | null | undefined) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    addRefCandidate(refCandidate(raw));

    const unprefixed = stripIdentityKeyPrefix(raw);
    if (unprefixed !== raw) addRefCandidate(refCandidate(unprefixed));

    if (!identityResolutionSnapshot) return;
    const resolution = resolvePlayerIdentity(identityResolutionSnapshot, unprefixed);
    if (!resolution.resolved) return;
    resolution.aliases.forEach((alias) => {
      addRefCandidate(refCandidate(alias.identifier));
      addRefCandidate(alias.identifierKey);
    });
  };

  targetPlayerRefs?.forEach(addIdentifier);
  targetPlayerNames?.forEach((name) => {
    const normalized = normalizeSearch(name);
    if (normalized) names.add(normalized);
  });

  return { refs, names };

  function addRefCandidate(value: string | null) {
    if (value) refs.add(value);
  }
}

function isTargetPlayer(player: JsonRecord, sourceScanId: string, targetFilter: LocalPlayerIndexTargetFilter) {
  if (!targetFilter) return true;

  const identifier = readString(player, ["identifier", "Identifier"]);
  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServer(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier),
  );
  const name = readString(player, ["name", "Name", "playerName", "Player Name"]);

  const refCandidates = [
    identifier,
    stripIdentityKeyPrefix(identifier),
    playerId && server ? `${server.toLowerCase()}_p${playerId}` : null,
    identifier ? `identifier:${identifier.toLowerCase()}` : null,
    playerId && server ? `server-player-id:${server.toLowerCase()}:p${playerId}` : null,
    name ? `scan-name:${sourceScanId}:${normalizeSearch(name)}` : null,
  ];
  if (refCandidates.some((candidate) => refCandidate(candidate) && targetFilter.refs.has(refCandidate(candidate) ?? ""))) {
    return true;
  }

  const normalizedName = normalizeSearch(name);
  return Boolean(normalizedName && targetFilter.names.has(normalizedName));
}

function stripIdentityKeyPrefix(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const prefixed = raw.match(/^(?:identifier|server-player-id):(.+)$/i);
  return prefixed?.[1] ?? raw;
}

function refCandidate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return normalizePlayerIdentifierKey(raw);
  } catch {
    return raw.toLowerCase();
  }
}

function buildPlayersFromScan(
  scan: GuildHubLocalScan,
  summary: GuildHubScanSummary,
  serverFilter: string | null,
  targetFilter: LocalPlayerIndexTargetFilter,
  includeCards: boolean,
): LocalPlayerIndexEntry[] {
  const raw = asRecord(scan.rawData);
  if (!raw) return [];
  const players = getRecordArray(raw.players);
  if (!players.length) return [];
  const rawGroups = getRecordArray(raw.groups);
  const groups = rawGroups.length ? rawGroups : getRecordArray(raw.guilds);
  const groupsBySegment = buildGroupLookup(groups);
  const normalizedMembers = Array.isArray(scan.normalizedMembers)
    ? scan.normalizedMembers
    : normalizeGuildScanMembers(scan.rawData);
  const normalizedByRef = new Map(normalizedMembers.map((member) => [member.memberRef.toLowerCase(), member]));
  const scanMs = scanTimestampMs(scan, summary);

  return players
    .filter((player) => isTargetPlayer(player, scan.id, targetFilter))
    .map((player) => toIndexPlayer(player, scan, summary, scanMs, normalizedByRef, groupsBySegment, serverFilter, includeCards))
    .filter((player): player is LocalPlayerIndexEntry => Boolean(player));
}

function toIndexPlayer(
  player: JsonRecord,
  scan: GuildHubLocalScan,
  summary: GuildHubScanSummary,
  fallbackScannedAtMs: number,
  normalizedByRef: Map<string, NormalizedGuildMember>,
  groupsBySegment: Map<string, GroupInfo>,
  serverFilter: string | null,
  includeCards: boolean,
): LocalPlayerIndexEntry | null {
  const identifier = readString(player, ["identifier", "Identifier"]);
  const playerId = readString(player, ["playerId", "Player ID", "id", "ID"]);
  const server = normalizeServer(
    readString(player, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(identifier),
  );
  const ref = identifier ? identifier.toLowerCase() : playerId && server ? `${server.toLowerCase()}_p${playerId}` : null;
  const normalized = ref ? normalizedByRef.get(ref) ?? null : null;
  const normalizedPlayer = safeNormalizePlayer(player);
  const stats = readSfPlayerStats(player);
  const name =
    normalizedPlayer?.identity.name ??
    normalized?.name ??
    readString(player, ["name", "Name", "playerName", "Player Name"]);
  if (!name) return null;

  const identity = resolveIdentityKey({ identifier, playerId, server, name, sourceScanId: scan.id });
  const groupInfo = findGroupInfo(normalized, player, groupsBySegment);
  const guildName =
    normalizedPlayer?.guild.name ??
    normalized?.guildName ??
    readString(player, ["guildName", "Guild Name", "groupname", "groupName", "guild", "Guild"]) ??
    groupInfo?.name ??
    null;
  const classId =
    normalizedPlayer?.identity.class ??
    normalized?.classId ??
    stats.classId ??
    readString(player, ["classId", "Class ID", "class", "Class"]);
  const classMeta = getClassMetaById(classId);
  const className =
    classMeta?.label ??
    readString(player, ["className", "Class Name", "class", "Class"]) ??
    normalized?.classId ??
    null;
  const icon = iconForClassName(className);
  const iconUrl = icon.url ? toDriveThumbProxy(icon.url, 96) : undefined;
  const saveArray = includeCards ? toNumberArray(readSfPlayerSaveArray(player)) : null;
  const portrait =
    includeCards && saveArray
      ? createPortraitOptionsFromSaveArray(saveArray, { own: player.own, saveVersion: player.saveVersion, save: saveArray })
      : undefined;
  const level = normalizedPlayer?.progression.level ?? normalized?.level ?? stats.level ?? readNumber(player, ["level", "Level"]);
  const hofRank =
    normalizedPlayer?.progression.rank ??
    readNumber(player, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]);
  const role = normalized?.guildRole ?? null;
  const scannedAtMs = getEntryTimestampMs(player) ?? fallbackScannedAtMs;
  const serverDisplay = server ?? normalizedPlayer?.identity.server ?? normalized?.server ?? null;
  if (serverFilter && normalizeServer(serverDisplay)?.toLowerCase() !== serverFilter.toLowerCase()) return null;
  const classAccent = getGuildClassAccent(classMeta?.key ?? className) ?? null;
  const baseStats = readFocusedBaseStats(normalizedPlayer, classMeta?.primaryAttribute ?? null, stats);
  const xpTotal = readTotalXp(player);
  const levelValue = toFiniteNumber(level);
  const memberRef = ref;
  const guildIdentifier = resolveGuildIdentifier({
    normalized,
    normalizedPlayer,
    player,
    server: serverDisplay,
    groupInfo,
  });

  return {
    key: identity.key,
    identityKind: identity.kind,
    name,
    server: serverDisplay,
    guildName,
    xpTotal,
    scannedAtMs,
    importedAtMs: Date.parse(scan.importedAt) || summary.importedAt || 0,
    sourceScanId: scan.id,
    sourceFilename: summary.displayName || summary.filename,
    queryText: [name, serverDisplay, guildName].filter(Boolean).join(" "),
    card: {
      name,
      className,
      classIconUrl: iconUrl,
      classIconFallback: icon.fallback ?? classMeta?.fallback ?? "?",
      classAccent,
      level,
      guildRole: role ? ROLE_LABELS[role] : "-",
      hofRank,
      potions: includeCards ? buildPlayerCardPotions(player, saveArray) : [],
      portrait,
      hasPortrait: Boolean(portrait),
      portraitFallbackUrl: includeCards ? iconUrl ?? null : null,
      portraitFallbackLabel: includeCards
        ? className
          ? `Klassenbild ${className}`
          : "Portrait-Platzhalter"
        : "Portrait nicht verfügbar",
    },
    developmentSource: {
      playerKey: identity.key,
      name,
      server: serverDisplay,
      memberRef,
      scannedAtMs,
      sourceScanId: scan.id,
      guildIdentifier,
      guildName,
      level: levelValue,
      baseStats,
    },
  };
}

function buildPlayerCardPotions(player: JsonRecord, saveArray: number[] | null): PlayerCardPotion[] {
  const normalized = normalizeSfPlayerPotions(player, { saveArray });
  return (
    normalized?.slots
      .map((slot): PlayerCardPotion | null => {
        if (!slot.attribute) return null;
        const assetKey = resolvePotionAssetKey(slot.attribute, slot.size);
        const asset = assetKey ? guideAssetByKey(assetKey, 128) : null;
        const label = formatPotionLabel(slot.attribute, slot.size);
        return {
          slot: (slot.slot + 1) as 1 | 2 | 3,
          type: slot.attribute,
          size: slot.size,
          assetKey,
          iconUrl: asset?.thumb ?? null,
          label,
        };
      })
      .filter((potion): potion is PlayerCardPotion => Boolean(potion)) ?? []
  );
}

function formatPotionLabel(type: string, size: number | null) {
  const typeLabel =
    {
      strength: "Strength",
      dexterity: "Dexterity",
      intelligence: "Intelligence",
      constitution: "Constitution",
      luck: "Luck",
      life: "Life",
    }[type] ?? "Potion";
  return size != null && type !== "life" ? `${typeLabel} potion ${size}%` : `${typeLabel} potion`;
}

function readFocusedBaseStats(
  normalized: NormalizedPlayer | null,
  primaryAttribute: "strength" | "dexterity" | "intelligence" | null,
  stats: ReturnType<typeof readSfPlayerStats>,
) {
  if (normalized && primaryAttribute) {
    const main = toFiniteNumber(normalized.attributes[primaryAttribute]?.base);
    const constitution = toFiniteNumber(normalized.attributes.constitution.base);
    if (main != null && constitution != null) return main + constitution;
  }

  const main = toFiniteNumber(stats.baseMain);
  const constitution = toFiniteNumber(stats.conBase);
  return main != null && constitution != null ? main + constitution : null;
}

function readTotalXp(player: JsonRecord) {
  return readNumber(player, ["xpTotal", "XP Total", "totalXp", "Total XP", "XP_Total"]);
}

type GroupInfo = {
  name: string | null;
  server: string | null;
  segment: string | null;
};

function buildGroupLookup(groups: JsonRecord[]) {
  const lookup = new Map<string, GroupInfo>();
  groups.forEach((group) => {
    const info: GroupInfo = {
      name: readString(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"]),
      server: normalizeServer(
        readString(group, ["server", "Server", "prefix", "world", "realm"]) ??
          parseServerFromIdentifier(readString(group, ["identifier", "guildIdentifier"])),
      ),
      segment: normalizeGuildSegmentForScan(
        readString(group, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "groupId", "guildId", "id"]),
      ),
    };
    if (!info.segment) return;
    lookup.set(groupLookupKey(info.segment, info.server), info);
    lookup.set(groupLookupKey(info.segment, null), info);
  });
  return lookup;
}

function findGroupInfo(
  normalized: NormalizedGuildMember | null,
  player: JsonRecord,
  groupsBySegment: Map<string, GroupInfo>,
) {
  const server = normalizeServer(normalized?.server ?? readString(player, ["server", "Server", "prefix", "world", "realm"]));
  const segment =
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    normalizeGuildSegmentForScan(readString(player, ["guildIdentifier", "Guild Identifier", "group", "groupIdentifier", "groupId", "guildId"]));
  if (!segment) return null;
  return groupsBySegment.get(groupLookupKey(segment, server)) ?? groupsBySegment.get(groupLookupKey(segment, null)) ?? null;
}

function resolveGuildIdentifier({
  normalized,
  normalizedPlayer,
  player,
  server,
  groupInfo,
}: {
  normalized: NormalizedGuildMember | null;
  normalizedPlayer: NormalizedPlayer | null;
  player: JsonRecord;
  server: string | null;
  groupInfo: GroupInfo | null;
}) {
  const normalizedServer = normalizeServer(server ?? normalized?.server ?? normalizedPlayer?.guild.server ?? groupInfo?.server);
  const guildIdentifier =
    normalizedPlayer?.guild.identifier ??
    readString(player, ["guildIdentifier", "Guild Identifier", "groupIdentifier", "groupId", "guildId"]) ??
    null;
  const guildSegment =
    normalizeGuildSegmentForScan(guildIdentifier) ??
    normalized?.guildSegment ??
    normalized?.groupSegment ??
    groupInfo?.segment;
  if (normalizedServer && guildSegment) return `${normalizedServer.toLowerCase()}_${guildSegment.toLowerCase()}`;
  return guildIdentifier ? guildIdentifier.toLowerCase() : null;
}

function groupLookupKey(segment: string, server: string | null) {
  return `${server?.toLowerCase() ?? "*"}:${segment.toLowerCase()}`;
}

function resolveIdentityKey({
  identifier,
  playerId,
  server,
  name,
  sourceScanId,
}: {
  identifier: string | null;
  playerId: string | null;
  server: string | null;
  name: string;
  sourceScanId: string;
}): { key: string; kind: LocalPlayerIndexIdentityKind } {
  if (identifier) return { key: `identifier:${identifier.toLowerCase()}`, kind: "identifier" };
  if (server && playerId) return { key: `server-player-id:${server.toLowerCase()}:p${playerId}`, kind: "server-player-id" };
  return { key: `scan-name:${sourceScanId}:${normalizeSearch(name)}`, kind: "scan-name" };
}

function comparePlayerFreshness(a: LocalPlayerIndexPlayer, b: LocalPlayerIndexPlayer) {
  return b.scannedAtMs - a.scannedAtMs || b.importedAtMs - a.importedAtMs || a.key.localeCompare(b.key);
}

function scanTimestampMs(scan: GuildHubLocalScan, summary: GuildHubScanSummary) {
  const scannedAt = scan.scannedAt ? Date.parse(scan.scannedAt) : NaN;
  if (Number.isFinite(scannedAt)) return scannedAt;
  if (summary.lastSnapshotTimestamp != null && Number.isFinite(summary.lastSnapshotTimestamp)) return summary.lastSnapshotTimestamp;
  return summary.importedAt || Date.parse(scan.importedAt) || 0;
}

function getEntryTimestampMs(entry: JsonRecord) {
  return readTimestampMs(entry, ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"]);
}

function readTimestampMs(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = pickFirst(record, [key]);
    const parsed = toTimestampMillis(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function toTimestampMillis(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{13}$/.test(trimmed)) return Number(trimmed);
    if (/^\d{10}$/.test(trimmed)) return Number(trimmed) * 1000;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeNormalizePlayer(player: JsonRecord) {
  try {
    return normalizeSfPlayerCharacterCore(player);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry)) : [];
}

function canonicalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const values = asRecord(record.values);
  const latest = asRecord(record.latest);
  const sources = [
    record,
    values,
    asRecord(values?.latestValues),
    latest,
    asRecord(latest?.values),
    asRecord(record.latestValues),
  ].filter((entry): entry is JsonRecord => Boolean(entry));
  for (const source of sources) {
    const lookup = new Map<string, string>();
    Object.keys(source).forEach((key) => {
      const canonical = canonicalizeKey(key);
      if (canonical && !lookup.has(canonical)) lookup.set(canonical, key);
    });

    for (const key of keys) {
      const direct = source[key];
      if (direct != null && String(direct).trim()) return direct;
      const resolved = lookup.get(canonicalizeKey(key));
      const value = resolved ? source[resolved] : undefined;
      if (value != null && String(value).trim()) return value;
    }
  }
  return undefined;
}

function readString(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  const value = pickFirst(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function readNumber(record: JsonRecord | null, keys: string[]) {
  if (!record) return null;
  const value = pickFirst(record, keys);
  if (value == null || value === "") return null;
  const parsed = parseLocaleNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocaleNumber(value: unknown) {
  if (typeof value === "number") return value;
  let raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return Number.NaN;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    raw = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    raw = /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }

  return Number(raw);
}

function toNumberArray(value: unknown[] | null): number[] | null {
  return value && value.length ? value.map((entry) => readFiniteNumber(entry) ?? 0) : null;
}

function readFiniteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toFiniteNumber(value: unknown) {
  return readFiniteNumber(value);
}

function normalizeServer(value: unknown) {
  return normalizeServerKeyFromInput(value);
}

function parseServerFromIdentifier(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(.+)_[gp][^_]+$/i);
  return match?.[1] ?? null;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}
