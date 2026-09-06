import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  GUILD_SCAN_NORMALIZER_VERSION,
  normalizeGuildScanMembers,
  type NormalizedGuildMember,
} from "./guildScanNormalizer";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { parsers } from "../import/parsers";

const DB_NAME = "sfdatahub-guild-hub";
const DB_VERSION = 2;
const SCAN_STORE = "scans";
const STATE_STORE = "state";
const GUILD_SELECTION_STATE_KEY = "guild-selection";
const LOCAL_SCAN_LIBRARY_CHANGE_EVENT = "sfdatahub:local-scans-changed";

type JsonRecord = Record<string, unknown>;
type RawScanRecord = JsonRecord & {
  players?: unknown[];
  groups?: unknown[];
  guilds?: unknown[];
  data?: unknown;
};
type NormalizedRawScanRecord = JsonRecord & {
  players: unknown[];
  groups: unknown[];
};

export type GuildHubLocalScan = {
  id: string;
  contentHash: string;
  filename: string;
  importedAt: string;
  updatedAt?: string;
  scannedAt: string | null;
  servers: string[];
  playerCount: number;
  groupCount: number;
  guildCount?: number;
  rawData: unknown;
  normalizedMembers?: NormalizedGuildMember[];
  normalizerVersion?: number;
  detectedType?: "players" | "guilds" | "scan";
  parserName?: string | null;
};

export type GuildHubLocalServerOption = {
  id: string;
  rawServers: string[];
  scanCount: number;
};

export type GuildHubLocalGuildIdentity = {
  key: string;
  guildId: string;
  guildIdentifier: string | null;
  name: string;
  server: string;
  hofRank: number | null;
  memberCount: number | null;
  sourceScanId?: string;
  sourceScanFilename?: string;
  sourceScannedAt?: string | null;
  sourceImportedAt?: string;
};

export type GuildHubSelectionGuild = {
  id: string;
  guildId: string;
  name: string;
  server: string;
  logo?: string;
  logoIdentifier: string;
  hofRank?: number | null;
  memberCount?: number | null;
};

export type GuildHubSelectionState = {
  selectedGuilds: GuildHubSelectionGuild[];
  activeGuildId: string | null;
};

export type GuildHubImportScanResult =
  | { status: "imported"; scan: GuildHubLocalScan }
  | { status: "duplicate"; scan: GuildHubLocalScan };

export type SfDataHubLocalScan = GuildHubLocalScan;
export type SfDataHubImportScanResult = GuildHubImportScanResult;

type GuildHubStateRecord = {
  key: string;
  value: unknown;
  updatedAt: string;
};

interface GuildHubScanDb extends DBSchema {
  scans: {
    key: string;
    value: GuildHubLocalScan;
    indexes: {
      by_contentHash: string;
      by_importedAt: string;
    };
  };
  state: {
    key: string;
    value: GuildHubStateRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<GuildHubScanDb>> | null = null;
const scanLibraryListeners = new Set<() => void>();

function getGuildHubScanDb() {
  if (!dbPromise) {
    dbPromise = openDB<GuildHubScanDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SCAN_STORE)) {
          const store = db.createObjectStore(SCAN_STORE, { keyPath: "id" });
          store.createIndex("by_contentHash", "contentHash", { unique: true });
          store.createIndex("by_importedAt", "importedAt");
        }
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: "key" });
        }
      },
    });
  }

  return dbPromise;
}

function notifyLocalScanLibraryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCAL_SCAN_LIBRARY_CHANGE_EVENT));
    return;
  }

  scanLibraryListeners.forEach((listener) => listener());
}

export function subscribeToSfDataHubLocalScanChanges(listener: () => void) {
  scanLibraryListeners.add(listener);

  const handleWindowEvent = () => listener();
  if (typeof window !== "undefined") {
    window.addEventListener(LOCAL_SCAN_LIBRARY_CHANGE_EVENT, handleWindowEvent);
  }

  return () => {
    scanLibraryListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener(LOCAL_SCAN_LIBRARY_CHANGE_EVENT, handleWindowEvent);
    }
  };
}

export async function readGuildHubSelectionState(): Promise<GuildHubSelectionState> {
  const db = await getGuildHubScanDb();
  const record = await db.get(STATE_STORE, GUILD_SELECTION_STATE_KEY);
  const value = record?.value;

  if (!isRecord(value)) {
    return { selectedGuilds: [], activeGuildId: null };
  }

  return {
    selectedGuilds: Array.isArray(value.selectedGuilds) ? (value.selectedGuilds as GuildHubSelectionGuild[]) : [],
    activeGuildId: typeof value.activeGuildId === "string" ? value.activeGuildId : null,
  };
}

export async function writeGuildHubSelectionState(state: GuildHubSelectionState): Promise<void> {
  const db = await getGuildHubScanDb();
  await db.put(STATE_STORE, {
    key: GUILD_SELECTION_STATE_KEY,
    value: state,
    updatedAt: new Date().toISOString(),
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const canon = canonKey(key);
    if (canon && !lookup.has(canon)) lookup.set(canon, key);
  }

  for (const key of keys) {
    const resolvedKey = lookup.get(canonKey(key));
    const value = resolvedKey ? record[resolvedKey] : undefined;
    if (value != null && String(value).trim()) return value;
  }

  return undefined;
}

function toTrimmedString(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function findArrayInRawScan(value: JsonRecord, keys: string[]): unknown[] {
  for (const key of keys) {
    const direct = value[key];
    if (Array.isArray(direct)) return direct;
  }

  const nested = isRecord(value.data) ? value.data : null;
  if (nested) {
    for (const key of keys) {
      const direct = nested[key];
      if (Array.isArray(direct)) return direct;
    }
  }

  return [];
}

async function detectRawScanPayload(value: unknown): Promise<{
  detectedType: "players" | "guilds" | "scan";
  parserName: string | null;
}> {
  if (!isRecord(value)) {
    throw new Error("Keine gültige JSON-Struktur.");
  }

  const preferredParserNames = Array.isArray(value.players)
    ? ["sftools-players-bare"]
    : Array.isArray(value.groups)
      ? ["sftools-guilds-bare"]
      : [];
  const orderedParsers = [
    ...preferredParserNames
      .map((name) => parsers.find((parser) => parser.name === name))
      .filter((parser): parser is (typeof parsers)[number] => Boolean(parser)),
    ...parsers.filter((parser) => !preferredParserNames.includes(parser.name)),
  ];

  for (const parser of orderedParsers) {
    try {
      if (!parser.detect(value)) continue;
      const detected = await parser.parse(value);
      return { detectedType: detected.type, parserName: parser.name };
    } catch {
      // Try the next parser; global scan import is intentionally generic.
    }
  }

  throw new Error("Keine gültige SF-Tools-Struktur erkannt.");
}

async function requireRawScan(value: unknown): Promise<{
  raw: NormalizedRawScanRecord;
  detectedType: "players" | "guilds" | "scan";
  parserName: string | null;
}> {
  if (!isRecord(value)) {
    throw new Error("Keine gültige JSON-Struktur.");
  }

  const detection = await detectRawScanPayload(value);
  const players = findArrayInRawScan(value, ["players"]);
  const groups = findArrayInRawScan(value, ["groups", "guilds"]);

  if (!players.length && !groups.length) {
    throw new Error("Keine gültige SF-Tools-Struktur: players[] oder groups[] erwartet.");
  }

  return {
    raw: {
      ...value,
      players,
      groups,
    },
    ...detection,
  };
}

async function sha256Hex(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createScanId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `guild-hub-scan:${Date.now().toString(36)}:${random}`;
}

function toTimestampMillis(value: unknown): number | null {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

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

function isoFromTimestampValue(value: unknown): string | null {
  const millis = toTimestampMillis(value);
  if (millis == null) return null;

  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function readFirstTimestamp(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const direct = record[key];
    const parsed = isoFromTimestampValue(direct);
    if (parsed) return parsed;
  }

  return null;
}

function extractScannedAt(raw: NormalizedRawScanRecord) {
  const timestampKeys = ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"];
  const rootTimestamp = readFirstTimestamp(raw, timestampKeys);
  if (rootTimestamp) return rootTimestamp;

  const timestamps = new Set<string>();
  for (const entry of [...raw.players, ...raw.groups]) {
    if (!isRecord(entry)) continue;
    const parsed = readFirstTimestamp(entry, timestampKeys);
    if (parsed) timestamps.add(parsed);
    if (timestamps.size > 1) return null;
  }

  return timestamps.size === 1 ? [...timestamps][0] : null;
}

function addPrefix(target: Set<string>, value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed) target.add(trimmed);
}

function addServer(target: Set<string>, value: unknown) {
  const normalized = normalizeServerKeyFromInput(value);
  if (normalized) {
    target.add(normalized);
    return;
  }
  addPrefix(target, value);
}

function parseServerFromIdentifier(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  const match = raw.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ? normalizeLocalServer(match[1]) : null;
}

function extractServers(raw: NormalizedRawScanRecord) {
  const servers = new Set<string>();
  addServer(servers, raw.prefix);
  addServer(servers, raw.server);
  addServer(servers, raw.world);
  addServer(servers, raw.realm);
  addServer(servers, raw.srv);
  addServer(servers, raw.shard);

  for (const entry of [...raw.players, ...raw.groups]) {
    if (!isRecord(entry)) continue;
    addServer(servers, pickFirst(entry, ["server", "Server", "prefix", "world", "realm", "srv", "shard"]));
    addServer(servers, parseServerFromIdentifier(pickFirst(entry, ["identifier", "Identifier", "guildIdentifier"])));
  }

  return [...servers].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeLocalServer(value: unknown): string | null {
  return normalizeServerKeyFromInput(value);
}

function parseServerFromGuildIdentifier(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  const match = raw.match(/^(.+)_g[^_]+$/i);
  return match?.[1] ? normalizeLocalServer(match[1]) : null;
}

function getScanRawData(scan: GuildHubLocalScan): NormalizedRawScanRecord | null {
  if (!isRecord(scan.rawData)) {
    return null;
  }

  const players = findArrayInRawScan(scan.rawData, ["players"]);
  const groups = findArrayInRawScan(scan.rawData, ["groups", "guilds"]);
  if (!players.length && !groups.length) return null;

  return {
    ...scan.rawData,
    players,
    groups,
  };
}

function normalizeStoredScan(scan: GuildHubLocalScan): GuildHubLocalScan {
  const raw = getScanRawData(scan);
  if (!raw) return scan;
  const normalizedPlayers =
    scan.normalizerVersion === GUILD_SCAN_NORMALIZER_VERSION && Array.isArray(scan.normalizedMembers)
      ? scan.normalizedMembers
      : normalizeGuildScanMembers(raw);
  const guildCount = countScanGuilds(raw, normalizedPlayers);
  const servers = extractServers(raw);

  if (
    scan.normalizerVersion === GUILD_SCAN_NORMALIZER_VERSION &&
    Array.isArray(scan.normalizedMembers) &&
    scan.guildCount === guildCount &&
    scan.groupCount === guildCount &&
    scan.servers.length === servers.length &&
    scan.servers.every((server, index) => server === servers[index])
  ) {
    return scan;
  }

  return {
    ...scan,
    servers,
    groupCount: guildCount,
    guildCount,
    normalizedMembers: normalizedPlayers,
    normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION,
  };
}

async function persistScanNormalizationIfNeeded(db: IDBPDatabase<GuildHubScanDb>, scan: GuildHubLocalScan) {
  const normalized = normalizeStoredScan(scan);
  if (normalized !== scan) {
    await db.put(SCAN_STORE, normalized);
  }
  return normalized;
}

function resolveServerForGroup(group: JsonRecord, raw: NormalizedRawScanRecord, scan: GuildHubLocalScan): string | null {
  const guildIdentifier = pickFirst(group, [
    "guildIdentifier",
    "Guild Identifier",
    "identifier",
    "Identifier",
    "groupIdentifier",
    "Group Identifier",
  ]);
  const direct =
    pickFirst(group, ["server", "prefix", "world", "realm", "srv", "shard"]) ??
    parseServerFromGuildIdentifier(guildIdentifier) ??
    raw.prefix ??
    (scan.servers.length === 1 ? scan.servers[0] : undefined);
  return normalizeLocalServer(direct);
}

function parseGuildIdSegment(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  const identifierMatch = raw.match(/_g([a-z0-9-]+)$/i);
  if (identifierMatch?.[1]) return identifierMatch[1];
  const prefixedMatch = raw.match(/^g([a-z0-9-]+)$/i);
  if (prefixedMatch?.[1]) return prefixedMatch[1];
  return raw;
}

function extractGuildFromGroup(
  group: JsonRecord,
  raw: NormalizedRawScanRecord,
  scan: GuildHubLocalScan,
): GuildHubLocalGuildIdentity | null {
  const server = resolveServerForGroup(group, raw, scan);
  if (!server) return null;

  const guildIdentifier = toTrimmedString(
    pickFirst(group, [
      "guildIdentifier",
      "Guild Identifier",
      "identifier",
      "Identifier",
      "groupIdentifier",
      "Group Identifier",
    ]),
  );
  const guildId = parseGuildIdSegment(
    guildIdentifier ??
      pickFirst(group, [
        "guildId",
        "guildid",
        "Guild ID",
        "id",
        "ID",
        "gid",
        "groupId",
        "groupid",
        "Group ID",
        "group",
      ]),
  );
  const name = toTrimmedString(
    pickFirst(group, ["name", "Name", "guildName", "Guild Name", "groupName", "groupname"]),
  );

  if (!guildId || !name) return null;

  const key = `${server.toLowerCase()}::g${guildId.toLowerCase()}`;

  return {
    key,
    guildId,
    guildIdentifier,
    name,
    server,
    hofRank: toFiniteNumberOrNull(
      pickFirst(group, [
        "hallOfFameRank",
        "Hall of Fame Rank",
        "hofRank",
        "HoF",
        "rank",
        "Rank",
        "guildRank",
        "Guild Rank",
      ]),
    ),
    memberCount: toFiniteNumberOrNull(
      pickFirst(group, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]),
    ),
  };
}

function withScanSource(guild: GuildHubLocalGuildIdentity, scan: GuildHubLocalScan): GuildHubLocalGuildIdentity {
  return {
    ...guild,
    sourceScanId: scan.id,
    sourceScanFilename: scan.filename,
    sourceScannedAt: scan.scannedAt,
    sourceImportedAt: scan.importedAt,
  };
}

function normalizeGuildIdForIdentity(value: string | null) {
  if (!value) return null;
  const prefixedMatch = value.match(/^g(.+)$/i);
  return prefixedMatch?.[1] ? prefixedMatch[1] : value;
}

function isStableGuildSegment(value: string | null) {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  return /^g[a-z0-9-]+$/.test(raw) || /^[a-z0-9]+_(?:eu|net)_g[a-z0-9-]+$/.test(raw);
}

function guildIdentityFromMember(member: NormalizedGuildMember): GuildHubLocalGuildIdentity | null {
  const server = normalizeLocalServer(member.server);
  const guildSegmentCandidate = isStableGuildSegment(member.guildSegment)
    ? member.guildSegment
    : isStableGuildSegment(member.groupSegment)
      ? member.groupSegment
      : null;
  const guildSegment = guildSegmentCandidate ?? null;
  const guildId = normalizeGuildIdForIdentity(guildSegment);
  const name = toTrimmedString(member.guildName);

  if (!server || !guildId || !guildSegment) return null;

  return {
    key: `${server.toLowerCase()}::g${guildId.toLowerCase()}`,
    guildId,
    guildIdentifier: guildSegment,
    name: name ?? guildSegment,
    server,
    hofRank: null,
    memberCount: null,
  };
}

function collectGuildIdentitiesForScan(scan: GuildHubLocalScan): GuildHubLocalGuildIdentity[] {
  const raw = getScanRawData(scan);
  if (!raw) return [];

  const guilds = new Map<string, GuildHubLocalGuildIdentity>();

  for (const group of raw.groups) {
    if (!isRecord(group)) continue;
    const guild = extractGuildFromGroup(group, raw, scan);
    if (guild) guilds.set(guild.key, withScanSource(guild, scan));
  }

  const normalizedMembers = Array.isArray(scan.normalizedMembers)
    ? scan.normalizedMembers
    : normalizeGuildScanMembers(raw);
  const memberCounts = new Map<string, number>();

  for (const member of normalizedMembers) {
    const guild = guildIdentityFromMember(member);
    if (!guild) continue;
    memberCounts.set(guild.key, (memberCounts.get(guild.key) ?? 0) + 1);
    if (!guilds.has(guild.key)) {
      guilds.set(guild.key, withScanSource(guild, scan));
    } else {
      const existing = guilds.get(guild.key)!;
      if (!existing.name && guild.name) {
        guilds.set(guild.key, { ...existing, name: guild.name });
      }
    }
  }

  return [...guilds.values()].map((guild) => ({
    ...guild,
    memberCount: guild.memberCount ?? memberCounts.get(guild.key) ?? null,
  }));
}

function countScanGuilds(raw: NormalizedRawScanRecord, normalizedMembers: NormalizedGuildMember[]) {
  const guildKeys = new Set<string>();
  const scanShell: GuildHubLocalScan = {
    id: "",
    contentHash: "",
    filename: "",
    importedAt: "",
    scannedAt: null,
    servers: extractServers(raw),
    playerCount: raw.players.length,
    groupCount: raw.groups.length,
    rawData: raw,
    normalizedMembers,
    normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION,
  };

  for (const group of raw.groups) {
    if (!isRecord(group)) continue;
    const guild = extractGuildFromGroup(group, raw, scanShell);
    if (guild) guildKeys.add(guild.key);
  }

  for (const member of normalizedMembers) {
    const guild = guildIdentityFromMember(member);
    if (guild) guildKeys.add(guild.key);
  }

  return guildKeys.size;
}

function compareServerOptions(a: GuildHubLocalServerOption, b: GuildHubLocalServerOption) {
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });
}

function compareGuildOptions(a: GuildHubLocalGuildIdentity, b: GuildHubLocalGuildIdentity) {
  const aRank = typeof a.hofRank === "number" ? a.hofRank : Number.MAX_SAFE_INTEGER;
  const bRank = typeof b.hofRank === "number" ? b.hofRank : Number.MAX_SAFE_INTEGER;
  return aRank - bRank || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function collectLocalServersForScan(scan: GuildHubLocalScan): Array<{ normalized: string; raw: string }> {
  const servers: Array<{ normalized: string; raw: string }> = [];
  const addServer = (raw: unknown) => {
    const normalized = normalizeLocalServer(raw);
    const rawText = toTrimmedString(raw);
    if (normalized && rawText) servers.push({ normalized, raw: rawText });
  };

  scan.servers.forEach(addServer);

  const raw = getScanRawData(scan);
  if (raw) {
    addServer(raw.prefix);
    for (const group of raw.groups) {
      if (!isRecord(group)) continue;
      const resolved = resolveServerForGroup(group, raw, scan);
      if (resolved) servers.push({ normalized: resolved, raw: resolved });
    }
  }

  return servers;
}

export function listGuildHubLocalServersFromScans(scans: GuildHubLocalScan[]): GuildHubLocalServerOption[] {
  const byServer = new Map<string, { rawServers: Set<string>; scanIds: Set<string> }>();

  for (const scan of scans) {
    for (const { normalized, raw } of collectLocalServersForScan(scan)) {
      const key = normalized.toLowerCase();
      const entry = byServer.get(key) ?? { rawServers: new Set<string>(), scanIds: new Set<string>() };
      entry.rawServers.add(raw);
      entry.scanIds.add(scan.id);
      byServer.set(key, entry);
    }
  }

  return [...byServer.entries()]
    .map(([key, entry]) => ({
      id: normalizeLocalServer(key) ?? key.toUpperCase(),
      rawServers: [...entry.rawServers].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      scanCount: entry.scanIds.size,
    }))
    .sort(compareServerOptions);
}

export function listGuildHubLocalGuildsForServerFromScans(
  scans: GuildHubLocalScan[],
  server: string,
): GuildHubLocalGuildIdentity[] {
  const normalizedServer = normalizeLocalServer(server);
  if (!normalizedServer) return [];

  const guilds = new Map<string, GuildHubLocalGuildIdentity>();

  for (const scan of scans) {
    for (const guild of collectGuildIdentitiesForScan(scan)) {
      if (guild.server.toLowerCase() !== normalizedServer.toLowerCase()) continue;
      const existing = guilds.get(guild.key);
      if (!existing || isNewerGuildSource(guild, existing)) {
        guilds.set(guild.key, guild);
      }
    }
  }

  return [...guilds.values()].sort(compareGuildOptions);
}

function compareScans(a: GuildHubLocalScan, b: GuildHubLocalScan) {
  const aScanned = a.scannedAt ? Date.parse(a.scannedAt) : Number.NEGATIVE_INFINITY;
  const bScanned = b.scannedAt ? Date.parse(b.scannedAt) : Number.NEGATIVE_INFINITY;
  if (aScanned !== bScanned) return bScanned - aScanned;

  return Date.parse(b.importedAt) - Date.parse(a.importedAt);
}

function scanSourceTimeMs(guild: GuildHubLocalGuildIdentity) {
  const scanned = guild.sourceScannedAt ? Date.parse(guild.sourceScannedAt) : NaN;
  if (Number.isFinite(scanned)) return scanned;
  const imported = guild.sourceImportedAt ? Date.parse(guild.sourceImportedAt) : NaN;
  return Number.isFinite(imported) ? imported : Number.NEGATIVE_INFINITY;
}

function isNewerGuildSource(candidate: GuildHubLocalGuildIdentity, existing: GuildHubLocalGuildIdentity) {
  const candidateScanned = candidate.sourceScannedAt ? Date.parse(candidate.sourceScannedAt) : NaN;
  const existingScanned = existing.sourceScannedAt ? Date.parse(existing.sourceScannedAt) : NaN;
  const hasCandidateScanned = Number.isFinite(candidateScanned);
  const hasExistingScanned = Number.isFinite(existingScanned);

  if (hasCandidateScanned && hasExistingScanned && candidateScanned !== existingScanned) {
    return candidateScanned > existingScanned;
  }

  if (hasCandidateScanned !== hasExistingScanned) {
    return scanSourceTimeMs(candidate) > scanSourceTimeMs(existing);
  }

  return scanSourceTimeMs(candidate) > scanSourceTimeMs(existing);
}

async function findScanByHash(contentHash: string) {
  const db = await getGuildHubScanDb();
  return db.getFromIndex(SCAN_STORE, "by_contentHash", contentHash);
}

function buildLocalScanRecord({
  id,
  filename,
  contentHash,
  rawData,
  raw,
  detectedType,
  parserName,
  importedAt,
  updatedAt,
}: {
  id: string;
  filename: string;
  contentHash: string;
  rawData: unknown;
  raw: NormalizedRawScanRecord;
  detectedType: "players" | "guilds" | "scan";
  parserName: string | null;
  importedAt: string;
  updatedAt?: string;
}): GuildHubLocalScan {
  const normalizedPlayers = normalizeGuildScanMembers(raw);
  const servers = extractServers(raw);
  const guildCount = countScanGuilds(raw, normalizedPlayers);

  return {
    id,
    contentHash,
    filename,
    importedAt,
    updatedAt,
    scannedAt: extractScannedAt(raw),
    servers,
    playerCount: raw.players.length,
    groupCount: guildCount,
    guildCount,
    rawData,
    normalizedMembers: normalizedPlayers,
    normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION,
    detectedType,
    parserName,
  };
}

export async function listGuildHubLocalScans() {
  const db = await getGuildHubScanDb();
  const scans = await db.getAll(SCAN_STORE);
  const normalizedScans = await Promise.all(scans.map((scan) => persistScanNormalizationIfNeeded(db, scan)));
  return normalizedScans.sort(compareScans);
}

export async function importGuildHubLocalScan(filename: string, content: string): Promise<GuildHubImportScanResult> {
  const rawData = JSON.parse(content);
  const { raw, detectedType, parserName } = await requireRawScan(rawData);
  const contentHash = await sha256Hex(content);
  const duplicate = await findScanByHash(contentHash);
  if (duplicate) {
    const db = await getGuildHubScanDb();
    return { status: "duplicate", scan: await persistScanNormalizationIfNeeded(db, duplicate) };
  }

  const scan = buildLocalScanRecord({
    id: createScanId(),
    filename,
    contentHash,
    importedAt: new Date().toISOString(),
    rawData,
    raw,
    detectedType,
    parserName,
  });

  const db = await getGuildHubScanDb();
  await db.add(SCAN_STORE, scan);
  notifyLocalScanLibraryChanged();
  return { status: "imported", scan };
}

export async function updateGuildHubLocalScan(id: string, filename: string, content: string): Promise<GuildHubLocalScan> {
  const db = await getGuildHubScanDb();
  const existing = await db.get(SCAN_STORE, id);
  if (!existing) throw new Error("Scan wurde nicht gefunden.");

  const rawData = JSON.parse(content);
  const { raw, detectedType, parserName } = await requireRawScan(rawData);
  const contentHash = await sha256Hex(content);
  const duplicate = await findScanByHash(contentHash);
  if (duplicate && duplicate.id !== id) {
    throw new Error("Dieser Scan ist bereits vorhanden.");
  }

  const scan = buildLocalScanRecord({
    id,
    filename,
    contentHash,
    importedAt: existing.importedAt,
    updatedAt: new Date().toISOString(),
    rawData,
    raw,
    detectedType,
    parserName,
  });

  await db.put(SCAN_STORE, scan);
  notifyLocalScanLibraryChanged();
  return scan;
}

export async function deleteGuildHubLocalScans(ids: string[]) {
  if (!ids.length) return;

  const db = await getGuildHubScanDb();
  const tx = db.transaction(SCAN_STORE, "readwrite");
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
  notifyLocalScanLibraryChanged();
}

export function getSfDataHubScanNormalizedPlayers(scan: SfDataHubLocalScan): NormalizedGuildMember[] {
  return Array.isArray(scan.normalizedMembers) ? scan.normalizedMembers : [];
}

export const listSfDataHubLocalScans = listGuildHubLocalScans;
export const importSfDataHubLocalScan = importGuildHubLocalScan;
export const updateSfDataHubLocalScan = updateGuildHubLocalScan;
export const deleteSfDataHubLocalScans = deleteGuildHubLocalScans;
export const listSfDataHubLocalServersFromScans = listGuildHubLocalServersFromScans;
export const listSfDataHubLocalGuildsForServerFromScans = listGuildHubLocalGuildsForServerFromScans;
