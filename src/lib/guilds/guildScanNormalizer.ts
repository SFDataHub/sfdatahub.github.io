import { slimPlayer } from "../import/parsers";
import { parseSaveStringToArray } from "../parsing/extractPortrait";
import { readSfPlayerStats } from "../parsing/parseSfJson";
import { normalizeServerKeyFromInput } from "../players/identifier";

export const GUILD_SCAN_NORMALIZER_VERSION = 9;

type JsonRecord = Record<string, unknown>;

export type NormalizedGuildRole = "leader" | "officer" | "member" | null;

export type NormalizedGuildMember = {
  memberRef: string;
  name: string;
  classId: string | null;
  level: number | null;
  baseStats: number | null;
  totalStats: number | null;
  server: string | null;
  guildSegment: string | null;
  groupSegment: string | null;
  guildName: string | null;
  guildRole: NormalizedGuildRole;
};

export type NormalizedGuildMatchIdentity = {
  name: string;
  server: string | null;
  guildSegment: string | null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeDisplayString = (value: unknown) => {
  const text = normalizeText(value).replace(/\u00a0/g, " ");
  if (!text || ["?", "-", "--", "n/a", "na", "null", "undefined"].includes(text.toLowerCase())) return null;
  return text;
};

const canonicalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeLoose = (value: unknown) =>
  normalizeText(value)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const asRecord = (value: unknown): JsonRecord | null =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const getMemberValue = (record: JsonRecord, keys: readonly string[]) => {
  const latest = asRecord(record.latest);
  const sources = [record, asRecord(record.values), latest, asRecord(latest?.values)].filter(
    (source): source is JsonRecord => Boolean(source),
  );

  for (const source of sources) {
    const canonical = new Map<string, unknown>();
    Object.entries(source).forEach(([key, value]) => {
      canonical.set(canonicalizeKey(key), value);
    });

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
      const value = canonical.get(canonicalizeKey(key));
      if (value != null) return value;
    }
  }

  return undefined;
};

const readString = (record: JsonRecord, keys: readonly string[]) => normalizeDisplayString(getMemberValue(record, keys));

const toFiniteNumberOrNull = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNumberArray = (value: unknown) =>
  Array.isArray(value) ? value.map((entry) => toFiniteNumberOrNull(entry) ?? 0) : null;

export const normalizeGuildScanServer = (value: unknown) => {
  const normalized = normalizeServerKeyFromInput(value)?.toLowerCase();
  if (normalized) return normalized;
  const fallback = normalizeText(value).toLowerCase().replace(/\s+/g, "");
  return fallback || null;
};

const parseServerFromIdentifier = (value: unknown) => {
  const identifier = normalizeText(value);
  const match = identifier.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ? normalizeGuildScanServer(match[1]) : null;
};

const parsePlayerIdFromIdentifier = (value: unknown) => {
  const identifier = normalizeText(value);
  const match = identifier.match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeGuildSegmentForScan = (value: unknown) => {
  const raw = normalizeText(value).toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  const identifierMatch = raw.match(/_g([^_]+)$/);
  if (identifierMatch?.[1]) return `g${identifierMatch[1]}`;
  const prefixedMatch = raw.match(/^g([^_]+)$/);
  if (prefixedMatch?.[1]) return `g${prefixedMatch[1]}`;
  if (/^\d+$/.test(raw)) return `g${raw}`;
  return raw;
};

const readGuildSegment = (player: JsonRecord) =>
  normalizeGuildSegmentForScan(
    readString(player, [
      "guildIdentifier",
      "Guild Identifier",
      "groupIdentifier",
      "Group Identifier",
      "groupId",
      "groupid",
      "guildId",
      "guildid",
      "Guild ID",
    ]),
  );

const readGroupSegment = (player: JsonRecord) => normalizeGuildSegmentForScan(readString(player, ["group", "Group"]));

const readGuildName = (player: JsonRecord) =>
  readString(player, ["groupname", "groupName", "guildName", "Guild Name", "guild", "Guild", "group", "Group"]);

const decodeGuildRole = (value: unknown): NormalizedGuildRole => {
  const raw = toFiniteNumberOrNull(value);
  if (raw === 1) return "leader";
  if (raw === 2) return "officer";
  if (raw === 3) return "member";
  return null;
};

const readGroupSaveArray = (group: JsonRecord) => {
  const saveArr = toNumberArray(group.save ?? group.groupSave);
  if (saveArr && saveArr.length) return saveArr;
  const saveString = readString(group, ["saveString"]);
  return saveString ? parseSaveStringToArray(saveString) : [];
};

const readGroupServer = (group: JsonRecord, fallbackServer: string | null) =>
  normalizeGuildScanServer(readString(group, ["server", "Server", "prefix", "world", "realm"])) ||
  parseServerFromIdentifier(readString(group, ["identifier", "Identifier", "guildIdentifier", "Guild Identifier", "group", "Group"])) ||
  fallbackServer;

const memberRoleKey = (server: string | null, playerId: number | string) =>
  `${server ? `${server}_` : ""}p${String(playerId).trim().toLowerCase()}`;

const buildGuildRoleLookup = (raw: JsonRecord, fallbackServer: string | null) => {
  const groups = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.guilds) ? raw.guilds : [];
  const roles = new Map<string, Exclude<NormalizedGuildRole, null>>();

  groups
    .map(asRecord)
    .filter((group): group is JsonRecord => Boolean(group))
    .forEach((group) => {
      const saveArray = readGroupSaveArray(group);
      if (!saveArray.length) return;
      const server = readGroupServer(group, fallbackServer);

      for (let slot = 0; slot < 50; slot += 1) {
        const memberId = toFiniteNumberOrNull(saveArray[14 + slot]);
        if (memberId == null || memberId <= 0) continue;
        const role = decodeGuildRole(saveArray[314 + slot]);
        if (!role) continue;
        roles.set(memberRoleKey(server, memberId), role);
        if (!server) roles.set(memberRoleKey(null, memberId), role);
      }
    });

  return roles;
};

const readGuildRoleForMember = (
  lookup: Map<string, Exclude<NormalizedGuildRole, null>>,
  server: string | null,
  playerId: string | null,
  memberRef: string,
): NormalizedGuildRole => {
  const numericPlayerId = playerId ?? parsePlayerIdFromIdentifier(memberRef);
  if (numericPlayerId != null) {
    const serverKey = lookup.get(memberRoleKey(server, numericPlayerId));
    if (serverKey) return serverKey;
    const globalKey = lookup.get(memberRoleKey(null, numericPlayerId));
    if (globalKey) return globalKey;
  }
  return null;
};

export function normalizeGuildScanMember(
  player: unknown,
  fallbackServer: string | null = null,
  guildRoleLookup: Map<string, Exclude<NormalizedGuildRole, null>> = new Map(),
): NormalizedGuildMember | null {
  const record = asRecord(player);
  if (!record) return null;

  const slim = slimPlayer(record);
  const stats = readSfPlayerStats(record);
  const slimLevel = typeof slim.level === "number" && Number.isFinite(slim.level) && slim.level > 0 ? slim.level : null;
  const identifier = readString(record, ["identifier", "Identifier"]) ?? normalizeDisplayString(slim.id);
  const playerId = readString(record, ["playerId", "Player ID", "id", "ID"]);
  const server =
    normalizeGuildScanServer(slim.server) ||
    normalizeGuildScanServer(readString(record, ["server", "Server", "prefix", "world", "realm"])) ||
    parseServerFromIdentifier(identifier) ||
    normalizeGuildScanServer(fallbackServer);
  const memberRef = identifier ? identifier.toLowerCase() : playerId && server ? `${server}_p${playerId}` : playerId;
  const name = normalizeDisplayString(slim.name) ?? readString(record, ["name", "Name", "playerName", "Player Name"]);
  if (!memberRef || !name) return null;

  return {
    memberRef,
    name,
    classId: normalizeDisplayString(slim.class) ?? stats.classId ?? readString(record, ["class", "Class", "className", "Class Name"]),
    level: stats.level ?? slimLevel,
    baseStats: stats.baseStats,
    totalStats: stats.totalStats,
    server,
    guildSegment: normalizeGuildSegmentForScan(slim.guildId) ?? readGuildSegment(record),
    groupSegment: readGroupSegment(record),
    guildName: readGuildName(record),
    guildRole: readGuildRoleForMember(guildRoleLookup, server, playerId, memberRef),
  };
}

export function normalizeGuildScanMembers(rawData: unknown): NormalizedGuildMember[] {
  const raw = asRecord(rawData);
  if (!raw || !Array.isArray(raw.players)) return [];
  const fallbackServer = normalizeGuildScanServer(raw.prefix ?? raw.server);
  const guildRoleLookup = buildGuildRoleLookup(raw, fallbackServer);

  return raw.players
    .map((player) => normalizeGuildScanMember(player, fallbackServer, guildRoleLookup))
    .filter((member): member is NormalizedGuildMember => Boolean(member));
}

export function isNormalizedGuildMemberInGuild(member: NormalizedGuildMember, guild: NormalizedGuildMatchIdentity) {
  const guildServer = normalizeGuildScanServer(guild.server);
  const memberServer = normalizeGuildScanServer(member.server);
  const serverMatches = !guildServer || !memberServer || guildServer === memberServer;
  const guildSegment = normalizeGuildSegmentForScan(guild.guildSegment);

  if (
    guildSegment &&
    (member.guildSegment === guildSegment || member.groupSegment === guildSegment) &&
    serverMatches
  ) {
    return true;
  }

  return Boolean(member.guildName && normalizeLoose(member.guildName) === normalizeLoose(guild.name) && serverMatches);
}
