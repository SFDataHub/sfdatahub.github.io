import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import {
  GUILD_SCAN_NORMALIZER_VERSION,
  normalizeGuildScanMember,
  normalizeGuildScanMembers,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "./guildScanNormalizer";
import {
  type DerivedGuildCoaMetadata,
  extractDerivedGuildCoaMetadata,
  extractGuildCoaString,
  isValidGuildCoaString,
} from "./guildCoa";
import {
  deriveGuildCoverageForLogicalSnapshots,
  summarizeGuildCoverage,
  type GuildCoverageSummary,
} from "./guildCoverage";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { parsers } from "../import/parsers";
import { parseSfJson } from "../parsing/parseSfJson";
import type { GuildAnalyticsMaterializeOptions } from "./localGuildAnalyticsStore";

const GUILD_HUB_DB_NAME = "sfdatahub-guild-hub";
const GUILD_HUB_DB_VERSION = 2;
const LOCAL_DATA_DB_NAME = "sfdatahub-local-data";
const LOCAL_DATA_DB_VERSION = 2;
const SCAN_STORE = "scans";
const SCAN_SUMMARY_STORE = "scanSummaries";
const METADATA_STORE = "metadata";
const STATE_STORE = "state";
const GUILD_SELECTION_STATE_KEY = "guild-selection";
const GUILD_HUB_SCANS_MIGRATION_KEY = "migration.guildHubScans";
const LOCAL_SCAN_LIBRARY_CHANGE_EVENT = "sfdatahub:local-scans-changed";
export const GUILD_HUB_SCAN_SUMMARY_VERSION = 3;

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

export type GuildHubScanMergeMode = "merged-file" | "scan-slot";
export type GuildHubScanSlotStatus = "staging" | "active";

export type GuildHubLocalScan = {
  id: string;
  contentHash: string;
  filename: string;
  displayName?: string;
  importedAt: string;
  updatedAt?: string;
  scannedAt: string | null;
  servers: string[];
  playerCount: number;
  groupCount: number;
  guildCount?: number;
  rawData: unknown;
  derivedGuildCoa?: DerivedGuildCoaMetadata;
  normalizedMembers?: NormalizedGuildMember[];
  normalizerVersion?: number;
  detectedType?: "players" | "guilds" | "scan";
  parserName?: string | null;
  isMergedBundle?: boolean;
  isScanSlot?: boolean;
  scanSlotStatus?: GuildHubScanSlotStatus;
  mergedSourceIds?: string[];
  containedInScanSlotId?: string | null;
  analyticsEnabled?: boolean;
  [key: string]: unknown;
};

export type GuildHubLogicalScanSnapshot = {
  id: string;
  timestamp: string;
  timestampMs: number;
  players: unknown[];
  groups: unknown[];
  servers: string[];
  playerCount: number;
  groupCount: number;
  guildCount: number;
  rawData: NormalizedRawScanRecord;
  normalizedMembers: NormalizedGuildMember[];
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
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
  coaString?: string | null;
  sourceScanId?: string;
  sourceScanFilename?: string;
  sourceScannedAt?: string | null;
  sourceImportedAt?: string;
};

export type GuildHubScanSummary = {
  sourceScanId: string;
  filename: string;
  displayName?: string;
  importedAt: number;
  updatedAt: number;
  importedAtIso: string;
  updatedAtIso?: string;
  scannedAt: string | null;
  logicalScanCount: number;
  firstSnapshotTimestamp: number | null;
  lastSnapshotTimestamp: number | null;
  snapshotTimestamps: number[];
  servers: string[];
  playerCount: number;
  groupCount: number;
  guildCount: number;
  guilds: GuildHubLocalGuildIdentity[];
  guildCoverage: GuildCoverageSummary;
  isMergedBundle?: boolean;
  isScanSlot?: boolean;
  scanSlotStatus?: GuildHubScanSlotStatus;
  mergedSourceIds?: string[];
  containedInScanSlotId?: string | null;
  analyticsEnabled?: boolean;
  contentHash?: string;
  summaryVersion: number;
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
  coaString?: string | null;
};

export type GuildHubSelectionState = {
  selectedGuilds: GuildHubSelectionGuild[];
  activeGuildId: string | null;
};

export type GuildHubImportScanResult =
  | { status: "imported"; scan: GuildHubLocalScan }
  | { status: "duplicate"; scan: GuildHubLocalScan };

export type GuildHubImportScanRecordsResult = {
  imported: GuildHubLocalScan[];
  duplicates: GuildHubLocalScan[];
};

export type GuildHubScanMergeProgress = {
  phase: string;
  processedSnapshots: number;
  totalSnapshots: number;
  processedMembers: number;
  totalMembers: number;
};

export type GuildHubScanMergeOptions = {
  targetScanId?: string;
  mode?: GuildHubScanMergeMode;
  displayName?: string;
  onProgress?: (progress: GuildHubScanMergeProgress) => void;
};

export type GuildHubScanSlotRecoveryResult =
  | { status: "completed"; scan: GuildHubLocalScan }
  | { status: "interrupted"; scan: GuildHubLocalScan | null };

export type SfDataHubLocalScan = GuildHubLocalScan;
export type SfDataHubImportScanResult = GuildHubImportScanResult;
export type SfDataHubImportScanRecordsResult = GuildHubImportScanRecordsResult;

type GuildHubStateRecord = {
  key: string;
  value: unknown;
  updatedAt: string;
};

type LocalDataMetadataRecord = {
  key: string;
  value: unknown;
  updatedAt: string;
};

interface LocalScanDb extends DBSchema {
  scans: {
    key: string;
    value: GuildHubLocalScan;
    indexes: {
      by_contentHash: string;
      by_importedAt: string;
    };
  };
  scanSummaries: {
    key: string;
    value: GuildHubScanSummary;
    indexes: {
      by_importedAt: number;
      by_updatedAt: number;
    };
  };
  metadata: {
    key: string;
    value: LocalDataMetadataRecord;
  };
}

interface GuildHubStateDb extends DBSchema {
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

let guildHubStateDbPromise: Promise<IDBPDatabase<GuildHubStateDb>> | null = null;
let localScanDbPromise: Promise<IDBPDatabase<LocalScanDb>> | null = null;
let legacyScanMigrationPromise: Promise<void> | null = null;
const scanLibraryListeners = new Set<() => void>();

function ensureLocalScanStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<
    LocalScanDb,
    (typeof SCAN_STORE | typeof SCAN_SUMMARY_STORE | typeof METADATA_STORE)[],
    "versionchange"
  >,
) {
  const store = db.objectStoreNames.contains(SCAN_STORE)
    ? transaction.objectStore(SCAN_STORE)
    : db.createObjectStore(SCAN_STORE, { keyPath: "id" });
  if (!store.indexNames.contains("by_contentHash")) {
    store.createIndex("by_contentHash", "contentHash", { unique: true });
  }
  if (!store.indexNames.contains("by_importedAt")) {
    store.createIndex("by_importedAt", "importedAt");
  }
}

function ensureLocalScanSummaryStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<
    LocalScanDb,
    (typeof SCAN_STORE | typeof SCAN_SUMMARY_STORE | typeof METADATA_STORE)[],
    "versionchange"
  >,
) {
  const store = db.objectStoreNames.contains(SCAN_SUMMARY_STORE)
    ? transaction.objectStore(SCAN_SUMMARY_STORE)
    : db.createObjectStore(SCAN_SUMMARY_STORE, { keyPath: "sourceScanId" });
  if (!store.indexNames.contains("by_importedAt")) {
    store.createIndex("by_importedAt", "importedAt");
  }
  if (!store.indexNames.contains("by_updatedAt")) {
    store.createIndex("by_updatedAt", "updatedAt");
  }
}

function ensureLocalMetadataStore(db: IDBPDatabase<LocalScanDb>) {
  if (!db.objectStoreNames.contains(METADATA_STORE)) {
    db.createObjectStore(METADATA_STORE, { keyPath: "key" });
  }
}

function isLocalDataDbReady(db: IDBPDatabase<LocalScanDb>) {
  if (!db.objectStoreNames.contains(SCAN_STORE)) return false;
  if (!db.objectStoreNames.contains(SCAN_SUMMARY_STORE)) return false;
  if (!db.objectStoreNames.contains(METADATA_STORE)) return false;

  const tx = db.transaction(SCAN_STORE);
  const { indexNames } = tx.store;
  const ready = indexNames.contains("by_contentHash") && indexNames.contains("by_importedAt");
  void tx.done.catch(() => undefined);
  if (!ready) return false;

  const summaryTx = db.transaction(SCAN_SUMMARY_STORE);
  const { indexNames: summaryIndexNames } = summaryTx.store;
  const summariesReady = summaryIndexNames.contains("by_importedAt") && summaryIndexNames.contains("by_updatedAt");
  void summaryTx.done.catch(() => undefined);
  return summariesReady;
}

function isGuildHubStateDbReady(db: IDBPDatabase<GuildHubStateDb>) {
  return db.objectStoreNames.contains(STATE_STORE);
}

function isIndexedDbVersionError(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "VersionError";
  }
  return isRecord(error) && error.name === "VersionError";
}

async function openGuildHubStateDbAtMinimumVersion() {
  try {
    return await openDB<GuildHubStateDb>(GUILD_HUB_DB_NAME, GUILD_HUB_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STATE_STORE)) {
          db.createObjectStore(STATE_STORE, { keyPath: "key" });
        }
      },
    });
  } catch (error) {
    if (!isIndexedDbVersionError(error)) throw error;
    return openDB<GuildHubStateDb>(GUILD_HUB_DB_NAME);
  }
}

function getGuildHubStateDb() {
  if (!guildHubStateDbPromise) {
    guildHubStateDbPromise = openGuildHubStateDbAtMinimumVersion().then(async (db) => {
      if (!isGuildHubStateDbReady(db)) {
        const nextVersion = db.version + 1;
        db.close();
        guildHubStateDbPromise = openDB<GuildHubStateDb>(GUILD_HUB_DB_NAME, nextVersion, {
          upgrade(upgradeDb) {
            if (!upgradeDb.objectStoreNames.contains(STATE_STORE)) {
              upgradeDb.createObjectStore(STATE_STORE, { keyPath: "key" });
            }
          },
        });
        return guildHubStateDbPromise;
      }

      return db;
    });
  }

  return guildHubStateDbPromise;
}

async function openLocalScanDb(version: number) {
  return openDB<LocalScanDb>(LOCAL_DATA_DB_NAME, version, {
    upgrade(db, _oldVersion, _newVersion, transaction) {
      ensureLocalScanStore(db, transaction);
      ensureLocalScanSummaryStore(db, transaction);
      ensureLocalMetadataStore(db);
    },
  });
}

async function openLocalScanDbAtMinimumVersion() {
  try {
    return await openLocalScanDb(LOCAL_DATA_DB_VERSION);
  } catch (error) {
    if (!isIndexedDbVersionError(error)) throw error;
    return openDB<LocalScanDb>(LOCAL_DATA_DB_NAME);
  }
}

function getLocalScanDbWithoutMigration() {
  if (!localScanDbPromise) {
    localScanDbPromise = openLocalScanDbAtMinimumVersion().then(async (db) => {
      if (!isLocalDataDbReady(db)) {
        const nextVersion = db.version + 1;
        db.close();
        localScanDbPromise = openLocalScanDb(nextVersion);
        return localScanDbPromise;
      }

      return db;
    });
  }

  return localScanDbPromise;
}

function isCompletedMigrationMarker(record: LocalDataMetadataRecord | undefined) {
  return isRecord(record?.value) && record.value.status === "completed";
}

async function writeGuildHubScansMigrationCompletedMarker(db: IDBPDatabase<LocalScanDb>) {
  const completedAt = new Date().toISOString();
  await db.put(METADATA_STORE, {
    key: GUILD_HUB_SCANS_MIGRATION_KEY,
    value: { status: "completed", completedAt },
    updatedAt: completedAt,
  });
}

async function migrateLegacyScansToLocalDataDb() {
  const localDb = await getLocalScanDbWithoutMigration();
  const existingMarker = await localDb.get(METADATA_STORE, GUILD_HUB_SCANS_MIGRATION_KEY);
  if (isCompletedMigrationMarker(existingMarker)) return;

  const legacyDb = await getGuildHubStateDb();
  if (!legacyDb.objectStoreNames.contains(SCAN_STORE)) {
    await writeGuildHubScansMigrationCompletedMarker(localDb);
    return;
  }

  const legacyScans = await legacyDb.getAll(SCAN_STORE);
  if (!legacyScans.length) {
    await writeGuildHubScansMigrationCompletedMarker(localDb);
    return;
  }

  const tx = localDb.transaction([SCAN_STORE, METADATA_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const metadataStore = tx.objectStore(METADATA_STORE);
  const contentHashIndex = scanStore.index("by_contentHash");

  for (const legacyScan of legacyScans) {
    const existingById = await scanStore.get(legacyScan.id);
    if (existingById) continue;

    const existingByHash =
      typeof legacyScan.contentHash === "string"
        ? await contentHashIndex.get(legacyScan.contentHash)
        : undefined;
    if (existingByHash) continue;

    await scanStore.add(legacyScan);
  }

  const completedAt = new Date().toISOString();
  await metadataStore.put({
    key: GUILD_HUB_SCANS_MIGRATION_KEY,
    value: { status: "completed", completedAt },
    updatedAt: completedAt,
  });
  await tx.done;
}

async function ensureLegacyScanMigration() {
  if (!legacyScanMigrationPromise) {
    legacyScanMigrationPromise = migrateLegacyScansToLocalDataDb().catch((error) => {
      legacyScanMigrationPromise = null;
      throw error;
    });
  }

  return legacyScanMigrationPromise;
}

async function getLocalScanDb() {
  await ensureLegacyScanMigration();
  return getLocalScanDbWithoutMigration();
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
  const db = await getGuildHubStateDb();
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
  const db = await getGuildHubStateDb();
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

const SCAN_TIMESTAMP_KEYS = ["scannedAt", "scanAt", "timestamp", "timestampSec", "timestampRaw"];

type LogicalTimestampBucket = {
  timestampMs: number;
  players: unknown[];
  groups: unknown[];
};

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

function isoFromTimestampMillis(millis: number): string | null {
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isoFromTimestampValue(value: unknown): string | null {
  const millis = toTimestampMillis(value);
  if (millis == null) return null;

  return isoFromTimestampMillis(millis);
}

function readFirstTimestampMillis(record: JsonRecord, keys: string[] = SCAN_TIMESTAMP_KEYS) {
  for (const key of keys) {
    const direct = record[key];
    const parsed = toTimestampMillis(direct);
    if (parsed != null) return parsed;
  }

  return null;
}

function readFirstTimestamp(record: JsonRecord, keys: string[] = SCAN_TIMESTAMP_KEYS) {
  for (const key of keys) {
    const direct = record[key];
    const parsed = isoFromTimestampValue(direct);
    if (parsed) return parsed;
  }

  return null;
}

function collectParsedPlayerTimestampMillis(raw: NormalizedRawScanRecord) {
  try {
    return parseSfJson(raw).ownPlayers
      .map((player) => toTimestampMillis(player.timestamp))
      .filter((millis): millis is number => millis != null);
  } catch {
    return [];
  }
}

function getEntryTimestampMillis(entry: unknown) {
  return isRecord(entry) ? readFirstTimestampMillis(entry) : null;
}

function addEntryToTimestampBucket(
  buckets: Map<number, LogicalTimestampBucket>,
  timestampMs: number,
  kind: "players" | "groups",
  entry: unknown,
) {
  const bucket = buckets.get(timestampMs) ?? { timestampMs, players: [], groups: [] };
  bucket[kind].push(entry);
  buckets.set(timestampMs, bucket);
}

function createWholeRawTimestampBucket(raw: NormalizedRawScanRecord, timestampMs: number): LogicalTimestampBucket {
  return {
    timestampMs,
    players: raw.players,
    groups: raw.groups,
  };
}

function deriveLogicalTimestampBuckets(raw: NormalizedRawScanRecord): LogicalTimestampBucket[] {
  const buckets = new Map<number, LogicalTimestampBucket>();

  for (const player of raw.players) {
    const timestampMs = getEntryTimestampMillis(player);
    if (timestampMs != null) addEntryToTimestampBucket(buckets, timestampMs, "players", player);
  }

  for (const group of raw.groups) {
    const timestampMs = getEntryTimestampMillis(group);
    if (timestampMs != null) addEntryToTimestampBucket(buckets, timestampMs, "groups", group);
  }

  if (!buckets.size) {
    const parsedPlayerTimestamps = [...new Set(collectParsedPlayerTimestampMillis(raw))].filter((timestampMs) =>
      Number.isFinite(timestampMs),
    );
    if (parsedPlayerTimestamps.length === 1) {
      buckets.set(parsedPlayerTimestamps[0], createWholeRawTimestampBucket(raw, parsedPlayerTimestamps[0]));
    }
  }

  if (!buckets.size) {
    const rootTimestampMs = readFirstTimestampMillis(raw);
    if (rootTimestampMs != null) {
      buckets.set(rootTimestampMs, createWholeRawTimestampBucket(raw, rootTimestampMs));
    }
  }

  return [...buckets.values()].sort((a, b) => a.timestampMs - b.timestampMs);
}

function createSnapshotRawData(raw: NormalizedRawScanRecord, bucket: LogicalTimestampBucket): NormalizedRawScanRecord {
  return {
    ...raw,
    players: bucket.players,
    groups: bucket.groups,
  };
}

export function deriveGuildHubLogicalScanSnapshots(
  scan: GuildHubLocalScan,
  optionsOrIndex:
    | { onNormalizedSnapshotCreated?: (durationMs: number) => void }
    | number = {},
): GuildHubLogicalScanSnapshot[] {
  const options =
    typeof optionsOrIndex === "number" ? {} : optionsOrIndex;
  const raw = getScanRawData(scan);
  if (!raw) return [];

  return deriveLogicalTimestampBuckets(raw).flatMap((bucket) => {
    const timestamp = isoFromTimestampMillis(bucket.timestampMs);
    if (!timestamp) return [];

    const rawData = createSnapshotRawData(raw, bucket);
    const normalizedStartedAt = performance.now();
    const normalizedMembers = normalizeGuildScanMembers(rawData);
    options.onNormalizedSnapshotCreated?.(performance.now() - normalizedStartedAt);
    const servers = extractServers(rawData);
    const guildCount = countScanGuilds(rawData, normalizedMembers);

    return {
      id: `${scan.id}::${bucket.timestampMs}`,
      timestamp,
      timestampMs: bucket.timestampMs,
      players: bucket.players,
      groups: bucket.groups,
      servers,
      playerCount: bucket.players.length,
      groupCount: bucket.groups.length,
      guildCount,
      rawData,
      normalizedMembers,
      sourceScanId: scan.id,
      sourceScanFilename: scan.filename,
      sourceImportedAt: scan.importedAt,
    };
  });
}

function extractScannedAt(raw: NormalizedRawScanRecord) {
  const snapshots = deriveLogicalTimestampBuckets(raw);
  if (snapshots.length !== 1) return null;
  return isoFromTimestampMillis(snapshots[0].timestampMs);
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

async function persistScanNormalizationIfNeeded(db: IDBPDatabase<LocalScanDb>, scan: GuildHubLocalScan) {
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

function readDerivedGuildCoaString(scan: GuildHubLocalScan, guildIdentifier: string | null) {
  if (!guildIdentifier) return null;
  const coaString = scan.derivedGuildCoa?.guildCoaByIdentifier[guildIdentifier];
  if (typeof coaString !== "string") return null;
  const trimmed = coaString.trim();
  return isValidGuildCoaString(trimmed) ? trimmed : null;
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
    coaString: readDerivedGuildCoaString(scan, guildIdentifier) ?? extractGuildCoaString(group),
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

function withLogicalSnapshotSource(
  guild: GuildHubLocalGuildIdentity,
  snapshot: GuildHubLogicalScanSnapshot,
): GuildHubLocalGuildIdentity {
  return {
    ...guild,
    sourceScanId: snapshot.sourceScanId,
    sourceScanFilename: snapshot.sourceScanFilename,
    sourceScannedAt: snapshot.timestamp,
    sourceImportedAt: snapshot.sourceImportedAt,
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
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  if (snapshots.length) {
    const guilds = new Map<string, GuildHubLocalGuildIdentity>();

    for (const snapshot of snapshots) {
      const snapshotScan: GuildHubLocalScan = {
        ...scan,
        scannedAt: snapshot.timestamp,
        servers: snapshot.servers,
        playerCount: snapshot.playerCount,
        groupCount: snapshot.guildCount,
        guildCount: snapshot.guildCount,
        rawData: snapshot.rawData,
        normalizedMembers: snapshot.normalizedMembers,
        normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION,
      };
      const memberCounts = new Map<string, number>();

      for (const group of snapshot.groups) {
        if (!isRecord(group)) continue;
        const guild = extractGuildFromGroup(group, snapshot.rawData, snapshotScan);
        if (guild) guilds.set(guild.key, withLogicalSnapshotSource(guild, snapshot));
      }

      for (const member of snapshot.normalizedMembers) {
        const guild = guildIdentityFromMember(member);
        if (!guild) continue;
        memberCounts.set(guild.key, (memberCounts.get(guild.key) ?? 0) + 1);
        const sourcedGuild = withLogicalSnapshotSource(guild, snapshot);
        if (!guilds.has(guild.key)) {
          guilds.set(guild.key, sourcedGuild);
        } else {
          const existing = guilds.get(guild.key)!;
          if (isNewerGuildSource(sourcedGuild, existing)) {
            guilds.set(guild.key, sourcedGuild);
          } else if (!existing.name && guild.name) {
            guilds.set(guild.key, { ...existing, name: guild.name });
          }
        }
      }

      for (const [guildKey, count] of memberCounts) {
        const existing = guilds.get(guildKey);
        if (existing && existing.sourceScannedAt === snapshot.timestamp) {
          guilds.set(guildKey, { ...existing, memberCount: existing.memberCount ?? count });
        }
      }
    }

    return [...guilds.values()];
  }

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

export function listGuildHubLocalServersFromScanSummaries(summaries: GuildHubScanSummary[]): GuildHubLocalServerOption[] {
  const byServer = new Map<string, { rawServers: Set<string>; scanIds: Set<string> }>();

  for (const summary of summaries) {
    const rawServers = summary.servers.length
      ? summary.servers
      : [...new Set(summary.guilds.map((guild) => guild.server).filter(Boolean))];
    for (const raw of rawServers) {
      const normalized = normalizeLocalServer(raw);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      const entry = byServer.get(key) ?? { rawServers: new Set<string>(), scanIds: new Set<string>() };
      entry.rawServers.add(raw);
      entry.scanIds.add(summary.sourceScanId);
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

export function listGuildHubLocalGuildsForServerFromScanSummaries(
  summaries: GuildHubScanSummary[],
  server: string,
): GuildHubLocalGuildIdentity[] {
  const normalizedServer = normalizeLocalServer(server);
  if (!normalizedServer) return [];

  const guilds = new Map<string, GuildHubLocalGuildIdentity>();

  for (const summary of summaries) {
    for (const guild of summary.guilds) {
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

function compareScanSummaries(a: GuildHubScanSummary, b: GuildHubScanSummary) {
  const aScanned = a.lastSnapshotTimestamp ?? Number.NEGATIVE_INFINITY;
  const bScanned = b.lastSnapshotTimestamp ?? Number.NEGATIVE_INFINITY;
  if (aScanned !== bScanned) return bScanned - aScanned;

  return b.importedAt - a.importedAt;
}

function parseTimeOrZero(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function createGuildHubScanSummary(scan: GuildHubLocalScan): GuildHubScanSummary {
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  const guildCoverage = summarizeGuildCoverage(deriveGuildCoverageForLogicalSnapshots(snapshots));
  const snapshotTimestamps = snapshots.map((snapshot) => snapshot.timestampMs).filter((value) => Number.isFinite(value));
  const servers = snapshots.length
    ? [...new Set(snapshots.flatMap((snapshot) => snapshot.servers))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      )
    : [...scan.servers];
  const playerCount = snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + snapshot.playerCount, 0)
    : scan.playerCount;
  const groupCount = snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + snapshot.groupCount, 0)
    : scan.groupCount;
  const guildCount = snapshots.length
    ? snapshots.reduce((sum, snapshot) => sum + snapshot.guildCount, 0)
    : typeof scan.guildCount === "number"
      ? scan.guildCount
      : scan.groupCount;

  return {
    sourceScanId: scan.id,
    filename: scan.filename,
    ...(scan.displayName ? { displayName: scan.displayName } : {}),
    importedAt: parseTimeOrZero(scan.importedAt),
    updatedAt: parseTimeOrZero(scan.updatedAt ?? scan.importedAt),
    importedAtIso: scan.importedAt,
    ...(scan.updatedAt ? { updatedAtIso: scan.updatedAt } : {}),
    scannedAt: scan.scannedAt,
    logicalScanCount: snapshots.length,
    firstSnapshotTimestamp: snapshotTimestamps[0] ?? null,
    lastSnapshotTimestamp: snapshotTimestamps[snapshotTimestamps.length - 1] ?? null,
    snapshotTimestamps,
    servers,
    playerCount,
    groupCount,
    guildCount,
    guilds: collectGuildIdentitiesForScan(scan),
    guildCoverage,
    ...(scan.isMergedBundle ? { isMergedBundle: true } : {}),
    ...(scan.isScanSlot ? { isScanSlot: true } : {}),
    ...(scan.scanSlotStatus ? { scanSlotStatus: scan.scanSlotStatus } : {}),
    ...(scan.mergedSourceIds ? { mergedSourceIds: scan.mergedSourceIds } : {}),
    ...("containedInScanSlotId" in scan ? { containedInScanSlotId: scan.containedInScanSlotId ?? null } : {}),
    ...(typeof scan.analyticsEnabled === "boolean" ? { analyticsEnabled: scan.analyticsEnabled } : {}),
    contentHash: scan.contentHash,
    summaryVersion: GUILD_HUB_SCAN_SUMMARY_VERSION,
  };
}

function applyScanMetadataToSummary(summary: GuildHubScanSummary, scan: GuildHubLocalScan): GuildHubScanSummary {
  const next: GuildHubScanSummary = {
    ...summary,
    sourceScanId: scan.id,
    filename: scan.filename,
    importedAt: parseTimeOrZero(scan.importedAt),
    updatedAt: parseTimeOrZero(scan.updatedAt ?? scan.importedAt),
    importedAtIso: scan.importedAt,
    scannedAt: scan.scannedAt,
    contentHash: scan.contentHash,
    summaryVersion: isCurrentGuildHubScanSummary(summary) ? GUILD_HUB_SCAN_SUMMARY_VERSION : summary.summaryVersion,
  };

  if (scan.updatedAt) next.updatedAtIso = scan.updatedAt;
  else delete next.updatedAtIso;

  if (scan.displayName) next.displayName = scan.displayName;
  else delete next.displayName;

  if (scan.isMergedBundle) next.isMergedBundle = true;
  else delete next.isMergedBundle;

  if (scan.isScanSlot) next.isScanSlot = true;
  else delete next.isScanSlot;

  if (scan.scanSlotStatus) next.scanSlotStatus = scan.scanSlotStatus;
  else delete next.scanSlotStatus;

  if (scan.mergedSourceIds) next.mergedSourceIds = scan.mergedSourceIds;
  else delete next.mergedSourceIds;

  if ("containedInScanSlotId" in scan) next.containedInScanSlotId = scan.containedInScanSlotId ?? null;
  else delete next.containedInScanSlotId;

  if (typeof scan.analyticsEnabled === "boolean") next.analyticsEnabled = scan.analyticsEnabled;
  else delete next.analyticsEnabled;

  return next;
}

async function putGuildHubScanSummary(db: IDBPDatabase<LocalScanDb>, scan: GuildHubLocalScan) {
  const summary = createGuildHubScanSummary(scan);
  await db.put(SCAN_SUMMARY_STORE, summary);
  return summary;
}

function isCurrentGuildHubScanSummary(summary: GuildHubScanSummary | undefined) {
  return (
    summary?.summaryVersion === GUILD_HUB_SCAN_SUMMARY_VERSION &&
    typeof summary.contentHash === "string" &&
    typeof summary.guildCoverage?.completeGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.incompleteGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.overcountGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.unknownGuildSnapshotCount === "number" &&
    Array.isArray(summary.guildCoverage.byServer)
  );
}

export async function ensureGuildHubScanSummaries() {
  const db = await getLocalScanDb();
  const scanKeys = (await db.getAllKeys(SCAN_STORE)).map(String);
  const summaryKeys = (await db.getAllKeys(SCAN_SUMMARY_STORE)).map(String);
  const scanKeySet = new Set(scanKeys);
  const summaryKeySet = new Set(summaryKeys);
  const orphanSummaryKeys = summaryKeys.filter((key) => !scanKeySet.has(key));
  const missingSummaryKeys = scanKeys.filter((key) => !summaryKeySet.has(key));
  const existingSummaries = await db.getAll(SCAN_SUMMARY_STORE);
  const staleSummaryKeys = existingSummaries
    .filter((summary) => scanKeySet.has(summary.sourceScanId) && !isCurrentGuildHubScanSummary(summary))
    .map((summary) => summary.sourceScanId);
  const rebuildKeys = [...new Set([...missingSummaryKeys, ...staleSummaryKeys])];

  if (!orphanSummaryKeys.length && !rebuildKeys.length) return;

  for (const orphanKey of orphanSummaryKeys) {
    await db.delete(SCAN_SUMMARY_STORE, orphanKey);
  }

  for (const key of rebuildKeys) {
    const scan = await db.get(SCAN_STORE, key);
    if (scan) {
      const normalized = await persistScanNormalizationIfNeeded(db, scan);
      await putGuildHubScanSummary(db, normalized);
      await yieldToBrowser();
    }
  }
}

export async function listGuildHubScanSummaries() {
  await ensureGuildHubScanSummaries();
  const db = await getLocalScanDb();
  return (await db.getAll(SCAN_SUMMARY_STORE)).sort(compareScanSummaries);
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
  const db = await getLocalScanDb();
  return db.getFromIndex(SCAN_STORE, "by_contentHash", contentHash);
}

async function materializeGuildAnalyticsScan(scan: GuildHubLocalScan, options?: GuildAnalyticsMaterializeOptions) {
  const { materializeGuildAnalyticsSource } = await import("./localGuildAnalyticsStore");
  await materializeGuildAnalyticsSource(scan, options);
}

async function deleteGuildAnalyticsSources(ids: string[]) {
  const { deleteGuildAnalyticsDerivedSources } = await import("./localGuildAnalyticsStore");
  await deleteGuildAnalyticsDerivedSources(ids);
}

function normalizeScanSlotDisplayName(displayName: string | undefined) {
  const normalized = (displayName ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Scan-Slot-Name darf nicht leer sein.");
  return normalized;
}

async function removeGuildHubLocalScanRecords(ids: string[]) {
  if (!ids.length) return;

  const db = await getLocalScanDb();
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
  await Promise.all(ids.flatMap((id) => [scanStore.delete(id), summaryStore.delete(id)]));
  await tx.done;
  await deleteGuildAnalyticsSources(ids);
}

async function readExistingScanSummaries(db: IDBPDatabase<LocalScanDb>, scans: GuildHubLocalScan[]) {
  return Promise.all(
    scans.map(async (scan) => {
      const summary = await db.get(SCAN_SUMMARY_STORE, scan.id);
      return {
        scan,
        summary: summary && isCurrentGuildHubScanSummary(summary) ? summary : createGuildHubScanSummary(scan),
      };
    }),
  );
}

async function activateGuildHubScanSlot(
  db: IDBPDatabase<LocalScanDb>,
  slot: GuildHubLocalScan,
  sourceIds: string[],
  loadedSources?: GuildHubLocalScan[],
) {
  const sources =
    loadedSources ??
    (await Promise.all(sourceIds.map((sourceId) => db.get(SCAN_STORE, sourceId)))).filter(
      (source): source is GuildHubLocalScan => Boolean(source),
    );
  const missingSourceIds = sourceIds.filter((sourceId) => !sources.some((source) => source.id === sourceId));
  if (missingSourceIds.length) {
    throw new Error(`Ausgewählte Scans wurden nicht gefunden: ${missingSourceIds.join(", ")}`);
  }
  if (sources.some((source) => source.isScanSlot || (source.containedInScanSlotId && source.containedInScanSlotId !== slot.id))) {
    throw new Error("Scan-Slots können nicht in neue Scan-Slots verschachtelt werden.");
  }

  const activeSlot: GuildHubLocalScan = {
    ...slot,
    isMergedBundle: true,
    isScanSlot: true,
    scanSlotStatus: "active",
    mergedSourceIds: sourceIds,
    analyticsEnabled: true,
  };
  const containedSources = sources.map((source) => ({
    ...source,
    containedInScanSlotId: activeSlot.id,
    analyticsEnabled: false,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, containedSources);
  const slotSummary = createGuildHubScanSummary(activeSlot);
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
  await Promise.all([
    scanStore.put(activeSlot),
    summaryStore.put(slotSummary),
    ...sourceSummaries.flatMap(({ scan, summary }) => [
      scanStore.put(scan),
      summaryStore.put(applyScanMetadataToSummary(summary, scan)),
    ]),
  ]);
  await tx.done;
  return activeSlot;
}

async function restoreScanSlotSourcesAndRemoveTarget(targetId: string, sourceIds: string[]) {
  const db = await getLocalScanDb();
  const sources = (await Promise.all(sourceIds.map((sourceId) => db.get(SCAN_STORE, sourceId)))).filter(
    (source): source is GuildHubLocalScan => Boolean(source),
  );
  const restoredSources = sources.map((source) => ({
    ...source,
    containedInScanSlotId: null,
    analyticsEnabled: true,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, restoredSources);
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
  await Promise.all([
    scanStore.delete(targetId),
    summaryStore.delete(targetId),
    ...sourceSummaries.flatMap(({ scan, summary }) => [
      scanStore.put(scan),
      summaryStore.put(applyScanMetadataToSummary(summary, scan)),
    ]),
  ]);
  await tx.done;
  await deleteGuildAnalyticsSources([targetId]);
}

function buildLocalScanRecord({
  id,
  filename,
  contentHash,
  rawData,
  derivedGuildCoa,
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
  derivedGuildCoa?: DerivedGuildCoaMetadata | null;
  raw: NormalizedRawScanRecord;
  detectedType: "players" | "guilds" | "scan";
  parserName: string | null;
  importedAt: string;
  updatedAt?: string;
}): GuildHubLocalScan {
  const normalizedPlayers = normalizeGuildScanMembers(raw);
  const servers = extractServers(raw);
  const guildCount = countScanGuilds(raw, normalizedPlayers);

  const scan: GuildHubLocalScan = {
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
    ...(derivedGuildCoa ? { derivedGuildCoa } : {}),
    normalizedMembers: normalizedPlayers,
    normalizerVersion: GUILD_SCAN_NORMALIZER_VERSION,
    detectedType,
    parserName,
  };

  return scan;
}

export async function listGuildHubLocalScans() {
  const db = await getLocalScanDb();
  const scans = await db.getAll(SCAN_STORE);
  const normalizedScans = await Promise.all(scans.map((scan) => persistScanNormalizationIfNeeded(db, scan)));
  return normalizedScans.sort(compareScans);
}

export async function listGuildHubLocalScansReadOnly() {
  const db = await getLocalScanDbWithoutMigration();
  const scans = await db.getAll(SCAN_STORE);
  return scans.map(normalizeStoredScan).sort(compareScans);
}

export async function getGuildHubLocalScan(id: string) {
  const db = await getLocalScanDb();
  const scan = await db.get(SCAN_STORE, id);
  return scan ? persistScanNormalizationIfNeeded(db, scan) : null;
}

export function isGuildHubScanAnalyticsEnabled(scan: Pick<GuildHubLocalScan, "analyticsEnabled">) {
  return scan.analyticsEnabled !== false;
}

export async function createGuildHubLocalScanImportPreview(filename: string, content: string): Promise<GuildHubLocalScan> {
  const rawData = JSON.parse(content);
  const derivedGuildCoa = extractDerivedGuildCoaMetadata(rawData, content);
  const { raw, detectedType, parserName } = await requireRawScan(rawData);
  const contentHash = await sha256Hex(content);
  return buildLocalScanRecord({
    id: createScanId(),
    filename,
    contentHash,
    importedAt: new Date().toISOString(),
    rawData,
    derivedGuildCoa,
    raw,
    detectedType,
    parserName,
  });
}

export async function importGuildHubLocalScan(filename: string, content: string): Promise<GuildHubImportScanResult> {
  const scan = await createGuildHubLocalScanImportPreview(filename, content);
  return commitGuildHubLocalScanPreview(scan);
}

export async function commitGuildHubLocalScanPreview(
  scan: GuildHubLocalScan,
  options?: { analytics?: GuildAnalyticsMaterializeOptions; onBeforeRawCommit?: () => void | Promise<void> },
): Promise<GuildHubImportScanResult> {
  const duplicate = await findScanByHash(scan.contentHash);
  if (duplicate) {
    const db = await getLocalScanDb();
    const normalizedDuplicate = await persistScanNormalizationIfNeeded(db, duplicate);
    const existingSummary = await db.get(SCAN_SUMMARY_STORE, normalizedDuplicate.id);
    if (!isCurrentGuildHubScanSummary(existingSummary)) {
      await putGuildHubScanSummary(db, normalizedDuplicate);
    }
    return { status: "duplicate", scan: normalizedDuplicate };
  }

  const summary = createGuildHubScanSummary(scan);
  await materializeGuildAnalyticsScan(scan, options?.analytics);
  await options?.onBeforeRawCommit?.();
  const db = await getLocalScanDb();
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  await Promise.all([tx.objectStore(SCAN_STORE).add(scan), tx.objectStore(SCAN_SUMMARY_STORE).add(summary)]);
  await tx.done;
  notifyLocalScanLibraryChanged();
  return { status: "imported", scan };
}

export async function mergeGuildHubScanSources(
  sourceScanIds: string[],
  filename: string,
  options?: GuildHubScanMergeOptions,
): Promise<GuildHubLocalScan> {
  const mode = options?.mode ?? "merged-file";
  const uniqueSourceIds = [...new Set(sourceScanIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueSourceIds.length < 2) {
    throw new Error("Für eine Zusammenführung müssen mindestens zwei Scans ausgewählt sein.");
  }
  const displayName = mode === "scan-slot" ? normalizeScanSlotDisplayName(options?.displayName) : undefined;

  const db = await getLocalScanDb();
  const sources = await Promise.all(uniqueSourceIds.map((id) => db.get(SCAN_STORE, id)));
  const missingIds = uniqueSourceIds.filter((_, index) => !sources[index]);
  if (missingIds.length) {
    throw new Error(`Ausgewählte Scans wurden nicht gefunden: ${missingIds.join(", ")}`);
  }

  const existingSources = sources.filter((scan): scan is GuildHubLocalScan => Boolean(scan));
  if (mode === "scan-slot" && existingSources.some((source) => source.isScanSlot || source.containedInScanSlotId)) {
    throw new Error("Scan-Slots können nicht in neue Scan-Slots verschachtelt werden.");
  }

  const bundleRawData = await buildMergedRawScanData(existingSources, options);
  const bundleContent = `${JSON.stringify(bundleRawData, null, 2)}\n`;
  const derivedGuildCoa = extractDerivedGuildCoaMetadata(bundleRawData, bundleContent);
  const { raw, detectedType, parserName } = await requireRawScan(bundleRawData);
  const contentHash = await sha256Hex(bundleContent);
  const duplicate = await findScanByHash(contentHash);
  if (duplicate) {
    throw new Error(`Ein identisches Bundle ist bereits vorhanden: ${duplicate.filename}`);
  }

  const importedAt = new Date().toISOString();
  const scan = buildLocalScanRecord({
    id: options?.targetScanId ?? createScanId(),
    filename,
    contentHash,
    importedAt,
    rawData: bundleRawData,
    derivedGuildCoa,
    raw,
    detectedType,
    parserName,
  });
  const bundle: GuildHubLocalScan = {
    ...scan,
    isMergedBundle: true,
    ...(mode === "scan-slot" ? { isScanSlot: true, scanSlotStatus: "staging" as const, displayName } : {}),
    mergedSourceIds: uniqueSourceIds,
    analyticsEnabled: false,
  };

  const bundleSnapshots = deriveGuildHubLogicalScanSnapshots(bundle);
  options?.onProgress?.({
    phase: "Lokale Daten werden aktualisiert",
    processedSnapshots: bundleSnapshots.length,
    totalSnapshots: bundleSnapshots.length,
    processedMembers: bundle.playerCount,
    totalMembers: bundle.playerCount,
  });

  const summary = createGuildHubScanSummary(bundle);
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  await Promise.all([tx.objectStore(SCAN_STORE).add(bundle), tx.objectStore(SCAN_SUMMARY_STORE).add(summary)]);
  await tx.done;

  if (mode === "scan-slot") {
    try {
      await materializeGuildAnalyticsScan(bundle);
      const activeSlot = await activateGuildHubScanSlot(db, bundle, uniqueSourceIds, existingSources);
      notifyLocalScanLibraryChanged();
      return activeSlot;
    } catch (error) {
      await restoreScanSlotSourcesAndRemoveTarget(bundle.id, uniqueSourceIds);
      throw error;
    }
  }

  notifyLocalScanLibraryChanged();
  return bundle;
}

async function buildMergedRawScanData(
  sources: GuildHubLocalScan[],
  options?: GuildHubScanMergeOptions,
): Promise<NormalizedRawScanRecord> {
  const sourceSnapshots = sources.map((source) => ({ source, snapshots: deriveGuildHubLogicalScanSnapshots(source) }));
  const totalSnapshots = sourceSnapshots.reduce((sum, entry) => sum + entry.snapshots.length, 0);
  const totalMembers = sourceSnapshots.reduce(
    (sum, entry) => sum + entry.snapshots.reduce((snapshotSum, snapshot) => snapshotSum + snapshot.players.length, 0),
    0,
  );
  let processedSnapshots = 0;
  let processedMembers = 0;
  let nextYieldAt = 500;

  const reportProgress = (phase: string) => {
    options?.onProgress?.({
      phase,
      processedSnapshots,
      totalSnapshots,
      processedMembers,
      totalMembers,
    });
  };

  reportProgress("Scans werden analysiert");

  const mergedPlayers: unknown[] = [];
  const mergedGroups: unknown[] = [];
  const seenPlayers = new Map<string, string>();
  const seenGroups = new Map<string, string>();
  let conflictCount = 0;

  const addEntity = (seen: Map<string, string>, target: unknown[], key: string, entity: unknown) => {
    const serialized = stableJsonStringify(entity);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, serialized);
      target.push(entity);
      return;
    }
    if (existing !== serialized) {
      conflictCount += 1;
    }
  };

  for (const { source, snapshots } of sourceSnapshots) {
    for (const snapshot of snapshots) {
      const fallbackServer = snapshot.servers.length === 1 ? snapshot.servers[0] : source.servers[0] ?? null;
      reportProgress("Duplikate werden geprüft");

      for (const player of snapshot.players) {
        addEntity(seenPlayers, mergedPlayers, buildMergedPlayerKey(player, snapshot.timestampMs, fallbackServer), player);
        processedMembers += 1;
        if (processedMembers >= nextYieldAt) {
          reportProgress("Duplikate werden geprüft");
          nextYieldAt += 500;
          await yieldToBrowser();
        }
      }

      for (const group of snapshot.groups) {
        addEntity(seenGroups, mergedGroups, buildMergedGroupKey(group, snapshot.timestampMs, fallbackServer), group);
      }

      processedSnapshots += 1;
      reportProgress("Bundle wird erstellt");
      await yieldToBrowser();
    }
  }

  if (conflictCount > 0) {
    throw new Error(
      `Zusammenführung nicht möglich: Für ${conflictCount.toLocaleString(
        "de-DE",
      )} Datensätze wurden widersprüchliche Inhalte mit identischer Scanzeit und Identität gefunden.`,
    );
  }

  const firstRaw = isRecord(sources[0]?.rawData) ? (sources[0].rawData as JsonRecord) : {};
  const mergedRaw: JsonRecord = {
    ...firstRaw,
    players: mergedPlayers,
    groups: mergedGroups,
  };
  delete mergedRaw.guilds;

  return {
    ...mergedRaw,
    players: mergedPlayers,
    groups: mergedGroups,
  };
}

function buildMergedPlayerKey(player: unknown, timestampMs: number, fallbackServer: string | null) {
  const normalized = normalizeGuildScanMember(player, fallbackServer);
  if (normalized?.memberRef) {
    return `player:${timestampMs}:${normalized.memberRef}`;
  }
  return `player:${timestampMs}:raw:${stableJsonStringify(player)}`;
}

function buildMergedGroupKey(group: unknown, timestampMs: number, fallbackServer: string | null) {
  const record = isRecord(group) ? group : null;
  if (!record) return `group:${timestampMs}:raw:${stableJsonStringify(group)}`;

  const identifier = toTrimmedString(
    pickFirst(record, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier", "groupIdentifier", "Group Identifier"]),
  );
  const server = normalizeLocalServer(
    pickFirst(record, ["server", "Server", "prefix", "world", "realm", "srv", "shard"]) ??
      parseServerFromIdentifier(identifier) ??
      fallbackServer,
  );
  const segment = normalizeGuildSegmentForScan(
    identifier ??
      pickFirst(record, ["guildId", "guildid", "Guild ID", "id", "ID", "gid", "groupId", "groupid", "Group ID"]),
  );
  if (segment) return `group:${timestampMs}:${server ?? ""}:${segment}`;

  const name = normalizeLooseIdentifier(pickFirst(record, ["name", "Name", "guildName", "Guild Name", "groupName", "groupname"]));
  if (name) return `group:${timestampMs}:${server ?? ""}:name:${name}`;

  return `group:${timestampMs}:raw:${stableJsonStringify(group)}`;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key])}`)
    .join(",")}}`;
}

function normalizeLooseIdentifier(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") {
      setTimeout(resolve, 0);
      return;
    }
    window.setTimeout(resolve, 0);
  });
}

export async function importGuildHubLocalScanRecords(scans: GuildHubLocalScan[]): Promise<GuildHubImportScanRecordsResult> {
  if (!scans.length) return { imported: [], duplicates: [] };

  const db = await getLocalScanDb();
  const imported: GuildHubLocalScan[] = [];
  const duplicates: GuildHubLocalScan[] = [];
  const pendingIds = new Set<string>();
  const pendingHashes = new Set<string>();

  for (const scan of scans) {
    const existingById = await db.get(SCAN_STORE, scan.id);
    if (existingById) {
      if (existingById.contentHash === scan.contentHash) {
        duplicates.push(existingById);
        continue;
      }
      throw new Error(`Scan-ID-Konflikt: ${scan.id}`);
    }

    const existingByHash = await findScanByHash(scan.contentHash);
    if (existingByHash) {
      duplicates.push(existingByHash);
      continue;
    }

    if (pendingIds.has(scan.id)) {
      throw new Error(`Scan-ID ist mehrfach in der Transferdatei enthalten: ${scan.id}`);
    }
    if (pendingHashes.has(scan.contentHash)) {
      duplicates.push(scan);
      continue;
    }

    pendingIds.add(scan.id);
    pendingHashes.add(scan.contentHash);
    imported.push(scan);
  }

  if (!imported.length) return { imported, duplicates };

  const summaries = imported.map((scan) => createGuildHubScanSummary(scan));
  await Promise.all(imported.map((scan) => materializeGuildAnalyticsScan(scan)));
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
  await Promise.all([
    ...imported.map((scan) => scanStore.add(scan)),
    ...summaries.map((summary) => summaryStore.add(summary)),
  ]);
  await tx.done;
  notifyLocalScanLibraryChanged();
  return { imported, duplicates };
}

export async function updateGuildHubLocalScan(id: string, filename: string, content: string): Promise<GuildHubLocalScan> {
  const db = await getLocalScanDb();
  const existing = await db.get(SCAN_STORE, id);
  if (!existing) throw new Error("Scan wurde nicht gefunden.");

  const rawData = JSON.parse(content);
  const derivedGuildCoa = extractDerivedGuildCoaMetadata(rawData, content);
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
    derivedGuildCoa,
    raw,
    detectedType,
    parserName,
  });

  await materializeGuildAnalyticsScan(scan);
  const summary = createGuildHubScanSummary(scan);
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  await Promise.all([tx.objectStore(SCAN_STORE).put(scan), tx.objectStore(SCAN_SUMMARY_STORE).put(summary)]);
  await tx.done;
  notifyLocalScanLibraryChanged();
  return scan;
}

export async function renameGuildHubScanSlot(id: string, displayName: string): Promise<GuildHubLocalScan> {
  const normalizedDisplayName = normalizeScanSlotDisplayName(displayName);
  const db = await getLocalScanDb();
  const existing = await db.get(SCAN_STORE, id);
  if (!existing?.isScanSlot) throw new Error("Scan-Slot wurde nicht gefunden.");

  const renamed: GuildHubLocalScan = {
    ...existing,
    displayName: normalizedDisplayName,
  };
  const existingSummary = await db.get(SCAN_SUMMARY_STORE, id);
  if (!existingSummary) throw new Error("Scan-Slot-Summary wurde nicht gefunden.");
  const summary = applyScanMetadataToSummary(existingSummary, renamed);
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  await Promise.all([tx.objectStore(SCAN_STORE).put(renamed), tx.objectStore(SCAN_SUMMARY_STORE).put(summary)]);
  await tx.done;
  notifyLocalScanLibraryChanged();
  return renamed;
}

export async function dissolveGuildHubScanSlot(id: string): Promise<void> {
  const db = await getLocalScanDb();
  const slot = await db.get(SCAN_STORE, id);
  if (!slot?.isScanSlot) throw new Error("Scan-Slot wurde nicht gefunden.");

  const sourceIds = [...new Set((slot.mergedSourceIds ?? []).map((sourceId) => sourceId.trim()).filter(Boolean))];
  const sources = (await Promise.all(sourceIds.map((sourceId) => db.get(SCAN_STORE, sourceId)))).filter(
    (source): source is GuildHubLocalScan => Boolean(source),
  );
  const restoredSources = sources.map((source) => ({
    ...source,
    containedInScanSlotId: null,
    analyticsEnabled: true,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, restoredSources);

  await Promise.all(restoredSources.map((source) => materializeGuildAnalyticsScan(source)));

  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE], "readwrite");
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
  await Promise.all([
    scanStore.delete(id),
    summaryStore.delete(id),
    ...sourceSummaries.flatMap(({ scan, summary }) => [
      scanStore.put(scan),
      summaryStore.put(applyScanMetadataToSummary(summary, scan)),
    ]),
  ]);
  await tx.done;
  await deleteGuildAnalyticsSources([id]);
  notifyLocalScanLibraryChanged();
}

export async function recoverGuildHubScanSlotMerge(
  targetSourceScanId: string,
  sourceScanIds: string[] = [],
): Promise<GuildHubScanSlotRecoveryResult> {
  const db = await getLocalScanDb();
  const target = await db.get(SCAN_STORE, targetSourceScanId);
  const effectiveSourceIds = [
    ...new Set(
      [...sourceScanIds, ...((target?.mergedSourceIds as string[] | undefined) ?? [])]
        .map((sourceId) => sourceId.trim())
        .filter(Boolean),
    ),
  ];

  if (
    target?.isScanSlot &&
    target.scanSlotStatus === "active" &&
    target.analyticsEnabled !== false &&
    effectiveSourceIds.length > 0
  ) {
    const sources = await Promise.all(effectiveSourceIds.map((sourceId) => db.get(SCAN_STORE, sourceId)));
    const isComplete = sources.every(
      (source) => source && source.containedInScanSlotId === target.id && source.analyticsEnabled === false,
    );
    if (isComplete) return { status: "completed", scan: target };
  }

  if (target?.isScanSlot && target.scanSlotStatus !== "active" && effectiveSourceIds.length >= 2) {
    try {
      await materializeGuildAnalyticsScan(target);
      const activeSlot = await activateGuildHubScanSlot(db, target, effectiveSourceIds);
      notifyLocalScanLibraryChanged();
      return { status: "completed", scan: activeSlot };
    } catch {
      await restoreScanSlotSourcesAndRemoveTarget(target.id, effectiveSourceIds);
      notifyLocalScanLibraryChanged();
      return { status: "interrupted", scan: null };
    }
  }

  if (target || effectiveSourceIds.length > 0) {
    await restoreScanSlotSourcesAndRemoveTarget(targetSourceScanId, effectiveSourceIds);
    notifyLocalScanLibraryChanged();
  }
  return { status: "interrupted", scan: null };
}

export async function deleteGuildHubLocalScans(ids: string[]) {
  if (!ids.length) return;

  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const db = await getLocalScanDb();
  const scans = await Promise.all(uniqueIds.map((id) => db.get(SCAN_STORE, id)));
  const slotIds = scans.filter((scan): scan is GuildHubLocalScan => Boolean(scan?.isScanSlot)).map((scan) => scan.id);
  const slotIdSet = new Set(slotIds);
  const regularIds = uniqueIds.filter((id) => !slotIdSet.has(id));

  for (const slotId of slotIds) {
    await dissolveGuildHubScanSlot(slotId);
  }

  if (regularIds.length) {
    await removeGuildHubLocalScanRecords(regularIds);
    notifyLocalScanLibraryChanged();
  }
}

export function getSfDataHubScanNormalizedPlayers(scan: SfDataHubLocalScan): NormalizedGuildMember[] {
  return Array.isArray(scan.normalizedMembers) ? scan.normalizedMembers : [];
}

export const listSfDataHubLocalScans = listGuildHubLocalScans;
export const listSfDataHubLocalScansReadOnly = listGuildHubLocalScansReadOnly;
export const getSfDataHubLocalScan = getGuildHubLocalScan;
export const createSfDataHubLocalScanImportPreview = createGuildHubLocalScanImportPreview;
export const importSfDataHubLocalScan = importGuildHubLocalScan;
export const commitSfDataHubLocalScanPreview = commitGuildHubLocalScanPreview;
export const mergeSfDataHubLocalScanSources = mergeGuildHubScanSources;
export const importSfDataHubLocalScanRecords = importGuildHubLocalScanRecords;
export const updateSfDataHubLocalScan = updateGuildHubLocalScan;
export const renameSfDataHubScanSlot = renameGuildHubScanSlot;
export const dissolveSfDataHubScanSlot = dissolveGuildHubScanSlot;
export const recoverSfDataHubScanSlotMerge = recoverGuildHubScanSlotMerge;
export const deleteSfDataHubLocalScans = deleteGuildHubLocalScans;
export const listSfDataHubScanSummaries = listGuildHubScanSummaries;
export const listSfDataHubLocalServersFromScans = listGuildHubLocalServersFromScans;
export const listSfDataHubLocalGuildsForServerFromScans = listGuildHubLocalGuildsForServerFromScans;
export const listSfDataHubLocalServersFromScanSummaries = listGuildHubLocalServersFromScanSummaries;
export const listSfDataHubLocalGuildsForServerFromScanSummaries = listGuildHubLocalGuildsForServerFromScanSummaries;
