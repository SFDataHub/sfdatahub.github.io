import { serverComparisonKey } from "../servers/serverResolver";
import { W158_FIXTURE_SOURCES, W158_CLEANUP_KEY } from "./w158FixtureEvidence";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditCaught, auditCount, auditEvent, auditFields, type AuditFields } from "../data-hub/runtimeAudit";
import { checkHubSearchExecution, type HubSearchExecutionOptions } from "../data-hub/hubSearchExecution";
import { buildHubSearchProjectionCooperatively, hubSearchFingerprint, readHubSearchReferenceEvidence, HUB_SEARCH_KEY_PREFIX, HUB_SEARCH_PROJECTION_VERSION, HUB_SEARCH_PARSER_VERSION, type HubSearchProjection, type HubSearchRawRow } from "../data-hub/hubSearchProjection";
import { createScanProvenance, observePersonalScanImport, readCompatibleScanProvenance, mergeTransferredScanProvenance, type LocalScanProvenance } from "./localScanProvenance";
import { archiveExpectation, ARCHIVE_READINESS_VERSION, type ArchiveReadiness } from "../data-hub/archiveReadiness";
import { revalidateLocalDataDependencies, type LocalDependencyReceipt, type LocalDependencyNotification, subscribeToLocalDataDependencies } from "../local-data/localDataDependencies";
import { matchesLocalSourceValidity } from "./localSourceValidity";
import { withLocalDataWrite, type LocalDataWriteLease } from "../local-data/localDataCoordination";
import { commitLocalDataMutation } from "../local-data/localDataTransaction";
import { createLocalChangesStore, localChangesDb, readLocalDataChanges, readLocalResetGeneration, subscribeToLocalDataChanges, type LocalChangesSchema, type LocalDataChangeInput } from "../local-data/localDataChanges";
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type IDBPObjectStore, type StoreNames } from "idb";
import {
  GUILD_SCAN_NORMALIZER_VERSION,
  normalizeGuildScanMember,
  normalizeGuildScanMembers,
  normalizeGuildScanMembersCooperatively,
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
import { LOCAL_SERVER_FUSION_EVENTS } from "../../data/serverFusions";
import { resolveServer } from "../servers/serverResolver";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { parsers } from "../import/parsers";
import { parseSfJson } from "../parsing/parseSfJson";
import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload, ScanArchiveSourceMetadata } from "../scanArchive/types";
import { validateScanArchivePayload, validateScanArchiveSearchIndexPayload } from "../scanArchive/validation";
import type { GuildAnalyticsMaterializeOptions } from "./localGuildAnalyticsStore";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "../toplists/localToplistTypes";

import {
  LOCAL_SCAN_CORE_NORMALIZER_VERSION,
  hasCurrentLocalSourceValidity,
  type LocalSourceValidity,
} from "./localSourceValidity";

const GUILD_HUB_DB_NAME = "sfdatahub-guild-hub";
const GUILD_HUB_DB_VERSION = 2;
const LOCAL_DATA_DB_NAME = "sfdatahub-local-data";
const LOCAL_DATA_DB_VERSION = 6;
const SCAN_STORE = "scans";
const SCAN_SUMMARY_STORE = "scanSummaries";
const METADATA_STORE = "metadata";
const ARCHIVE_SCAN_BINDING_STORE = "archiveScanBindings";
const ARCHIVE_SEARCH_INDEX_STORE = "archiveSearchIndexes";
const LOCAL_TOPLIST_SNAPSHOT_STORE = "localToplistSnapshots";
const STATE_STORE = "state";
const GUILD_HUB_SCANS_MIGRATION_KEY = "migration.guildHubScans";
const LOCAL_SCAN_LIBRARY_CHANGE_EVENT = "sfdatahub:local-scans-changed";
export const GUILD_HUB_SCAN_SUMMARY_VERSION = 5;

type JsonRecord = Record<string, unknown>;
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
  coreNormalizerVersion?: number;
  sourceGeneration?: string;
  detectedType?: "players" | "guilds" | "scan";
  parserName?: string | null;
  isMergedBundle?: boolean;
  isScanSlot?: boolean;
  scanSlotStatus?: GuildHubScanSlotStatus;
  mergedSourceIds?: string[];
  containedInScanSlotId?: string | null;
  analyticsEnabled?: boolean;
  provenance?: LocalScanProvenance;
  archiveSource?: ScanArchiveSourceMetadata;
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

export type GuildHubScanPreviewStatistics = {
  normalizedMemberCount: number;
  snapshots: Array<{ timestamp: string; playerCount: number; guildCount: number }>;
};

export type GuildHubFusionInventorySlice = {
  id: string;
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
  timestamp: string;
  timestampMs: number;
  server: string;
  playerCount: number;
  guildCount: number;
  playerIdentifiers?: string[];
  guildIdentifiers?: string[];
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
  fusionInventorySlices?: GuildHubFusionInventorySlice[];
  isMergedBundle?: boolean;
  isScanSlot?: boolean;
  scanSlotStatus?: GuildHubScanSlotStatus;
  mergedSourceIds?: string[];
  containedInScanSlotId?: string | null;
  analyticsEnabled?: boolean;
  provenance?: LocalScanProvenance;
  archiveSource?: ScanArchiveSourceMetadata;
  archiveBindings?: GuildHubArchiveScanBinding[];
  contentHash?: string;
  summaryVersion: number;
  normalizerVersion?: number;
  coreNormalizerVersion?: number;
  sourceGeneration?: string;
};

export type GuildHubArchiveScanBinding = ScanArchiveSourceMetadata & {
  key: string;
  localScanId: string;
  localContentHash: string;
  readiness?: ArchiveReadiness;
  createdAt: string;
  updatedAt: string;
};

export type GuildHubArchiveSearchIndexCacheRecord = {
  key: string;
  archiveScanId: string;
  archiveYear: number;
  manifestRevision: number;
  manifestUrl: string;
  server: string;
  timestamp: number;
  sourceSha256: string;
  searchIndexPath: string;
  searchIndexSha256: string;
  compressedBytes: number;
  uncompressedBytes: number;
  playerCount: number;
  groupCount: number;
  payload: ScanArchiveSearchIndexPayload;
  createdAt: string;
  updatedAt: string;
};

export type GuildHubLocalToplistSnapshotRecord = {
  key: string;
  derivationVersion: number;
  normalizerVersion?: number;
  coreNormalizerVersion?: number;
  sourceGeneration?: string;
  manifestYear: number;
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  scanTimestamp: number;
  localScanId: string;
  localContentHash: string;
  playerRows: LocalPlayerToplistRow[];
  guildRows: LocalGuildToplistRow[];
  snapshotMeta: LocalToplistSnapshotMeta;
  issues: LocalToplistIssue[];
  createdAt: string;
  updatedAt: string;
};

export type GuildHubScanSummaryBackfillResult = {
  orphanSummaryCount: number;
  rebuiltSummaryCount: number;
};

export type ListGuildHubScanSummariesOptions = {
  auditContext?: AuditFields;
  ensureCurrent?: boolean;
};

export type GuildHubSelectionGuild = {
  observedAtMs?: number | null;
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
  recordRevision?: number;
  compatibilityRevision?: number;
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

export type GuildHubLocalScanImportPreviewOptions = {
  id?: string;
  archiveSource?: ScanArchiveSourceMetadata;
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

interface LocalScanDb extends DBSchema, LocalChangesSchema {
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
  archiveScanBindings: {
    key: string;
    value: GuildHubArchiveScanBinding;
    indexes: {
      by_localScanId: string;
    };
  };
  archiveSearchIndexes: {
    key: string;
    value: GuildHubArchiveSearchIndexCacheRecord;
    indexes: {
      by_archiveScanId: string;
    };
  };
  localToplistSnapshots: {
    key: string;
    value: GuildHubLocalToplistSnapshotRecord;
    indexes: {
      by_archiveScanId: string;
      by_localScanId: string;
    };
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

type LocalDataVersionStore =
  | "localChanges"
  | typeof SCAN_STORE
  | typeof SCAN_SUMMARY_STORE
  | typeof METADATA_STORE
  | typeof ARCHIVE_SCAN_BINDING_STORE
  | typeof ARCHIVE_SEARCH_INDEX_STORE
  | typeof LOCAL_TOPLIST_SNAPSHOT_STORE;

function ensureLocalScanStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<LocalScanDb, LocalDataVersionStore[], "versionchange">,
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
  transaction: IDBPTransaction<LocalScanDb, LocalDataVersionStore[], "versionchange">,
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

function ensureArchiveScanBindingStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<LocalScanDb, LocalDataVersionStore[], "versionchange">,
) {
  const store = db.objectStoreNames.contains(ARCHIVE_SCAN_BINDING_STORE)
    ? transaction.objectStore(ARCHIVE_SCAN_BINDING_STORE)
    : db.createObjectStore(ARCHIVE_SCAN_BINDING_STORE, { keyPath: "key" });
  if (!store.indexNames.contains("by_localScanId")) {
    store.createIndex("by_localScanId", "localScanId");
  }
}

function ensureArchiveSearchIndexStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<LocalScanDb, LocalDataVersionStore[], "versionchange">,
) {
  const store = db.objectStoreNames.contains(ARCHIVE_SEARCH_INDEX_STORE)
    ? transaction.objectStore(ARCHIVE_SEARCH_INDEX_STORE)
    : db.createObjectStore(ARCHIVE_SEARCH_INDEX_STORE, { keyPath: "key" });
  if (!store.indexNames.contains("by_archiveScanId")) {
    store.createIndex("by_archiveScanId", "archiveScanId");
  }
}

function ensureLocalToplistSnapshotStore(
  db: IDBPDatabase<LocalScanDb>,
  transaction: IDBPTransaction<LocalScanDb, LocalDataVersionStore[], "versionchange">,
) {
  const store = db.objectStoreNames.contains(LOCAL_TOPLIST_SNAPSHOT_STORE)
    ? transaction.objectStore(LOCAL_TOPLIST_SNAPSHOT_STORE)
    : db.createObjectStore(LOCAL_TOPLIST_SNAPSHOT_STORE, { keyPath: "key" });
  if (!store.indexNames.contains("by_archiveScanId")) {
    store.createIndex("by_archiveScanId", "archiveScanId");
  }
  if (!store.indexNames.contains("by_localScanId")) {
    store.createIndex("by_localScanId", "localScanId");
  }
}

function isLocalDataDbReady(db: IDBPDatabase<LocalScanDb>) {
  if (!db.objectStoreNames.contains("localChanges")) return false;
  if (!db.objectStoreNames.contains(SCAN_STORE)) return false;
  if (!db.objectStoreNames.contains(SCAN_SUMMARY_STORE)) return false;
  if (!db.objectStoreNames.contains(METADATA_STORE)) return false;
  if (!db.objectStoreNames.contains(ARCHIVE_SCAN_BINDING_STORE)) return false;
  if (!db.objectStoreNames.contains(ARCHIVE_SEARCH_INDEX_STORE)) return false;
  if (!db.objectStoreNames.contains(LOCAL_TOPLIST_SNAPSHOT_STORE)) return false;

  const tx = db.transaction(SCAN_STORE);
  const { indexNames } = tx.store;
  const ready = indexNames.contains("by_contentHash") && indexNames.contains("by_importedAt");
  void tx.done.catch(() => undefined);
  if (!ready) return false;

  const bindingTx = db.transaction(ARCHIVE_SCAN_BINDING_STORE);
  const { indexNames: bindingIndexNames } = bindingTx.store;
  const bindingsReady = bindingIndexNames.contains("by_localScanId");
  void bindingTx.done.catch(() => undefined);
  if (!bindingsReady) return false;

  const searchIndexTx = db.transaction(ARCHIVE_SEARCH_INDEX_STORE);
  const { indexNames: searchIndexIndexNames } = searchIndexTx.store;
  const searchIndexesReady = searchIndexIndexNames.contains("by_archiveScanId");
  void searchIndexTx.done.catch(() => undefined);
  if (!searchIndexesReady) return false;

  const toplistTx = db.transaction(LOCAL_TOPLIST_SNAPSHOT_STORE);
  const { indexNames: toplistIndexNames } = toplistTx.store;
  const toplistsReady = toplistIndexNames.contains("by_archiveScanId") && toplistIndexNames.contains("by_localScanId");
  void toplistTx.done.catch(() => undefined);
  if (!toplistsReady) return false;

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
      createLocalChangesStore(db);
      ensureLocalScanStore(db, transaction);
      ensureLocalScanSummaryStore(db, transaction);
      ensureLocalMetadataStore(db);
      ensureArchiveScanBindingStore(db, transaction);
      ensureArchiveSearchIndexStore(db, transaction);
      ensureLocalToplistSnapshotStore(db, transaction);
    },
    blocking() { const opened = localScanDbPromise; localScanDbPromise = null; legacyScanMigrationPromise = null; void opened?.then(db => db.close(), () => {}); },
    terminated() { localScanDbPromise = null; legacyScanMigrationPromise = null; },
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
    }).catch(error => { localScanDbPromise = null; throw error; });
  }

  return localScanDbPromise;
}

function isCompletedMigrationMarker(record: LocalDataMetadataRecord | undefined) {
  return isRecord(record?.value) && record.value.status === "completed";
}

async function writeGuildHubScansMigrationCompletedMarker(db: IDBPDatabase<LocalScanDb>) {
  const completedAt = new Date().toISOString();
  await commitScanMutation(db, [METADATA_STORE], async tx => { await tx.objectStore(METADATA_STORE).put({
    key: GUILD_HUB_SCANS_MIGRATION_KEY,
    value: { status: "completed", completedAt },
    updatedAt: completedAt,
  }); }, [], [], { kinds: ["maintenance"], unknownImpact: true });
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

  await commitScanMutation(localDb, [SCAN_STORE, METADATA_STORE], async tx => {
    if (isCompletedMigrationMarker(await tx.objectStore(METADATA_STORE).get(GUILD_HUB_SCANS_MIGRATION_KEY))) return false;
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
  }, [], legacyScans, { kinds: ["content", "maintenance"], unknownImpact: true });
}

async function ensureLegacyScanMigration() {
    const __audit1 = auditBegin("S06", "ensureLegacyScanMigration");
    try {
  if (!legacyScanMigrationPromise) {
    legacyScanMigrationPromise = migrateLegacyScansToLocalDataDb().catch((error) => {
      legacyScanMigrationPromise = null;
      throw error;
    });
  }

  return auditReturn(__audit1, legacyScanMigrationPromise);

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

async function getLocalScanDb() {
  await ensureLegacyScanMigration();
  return getLocalScanDbWithoutMigration();
}

type ScanWriteTransaction = IDBPTransaction<LocalScanDb, StoreNames<LocalScanDb>[], "readwrite">;

function scanMutationChange(before: readonly GuildHubLocalScan[], after: readonly GuildHubLocalScan[], extra: Partial<LocalDataChangeInput> = {}): LocalDataChangeInput {
  return {
    owner: "sources", kinds: ["content"],
    sourceIds: [...new Set([...before, ...after].map(scan => scan.id))],
    removedSourceIds: [], servers: [...new Set([...before, ...after].flatMap(scan => scan.servers))],
    unknownImpact: [...before, ...after].some(scan => !scan.servers.length), ...extra,
  };
}

async function commitScanMutation<T>(
  db: IDBPDatabase<LocalScanDb>, stores: StoreNames<LocalScanDb>[],
  mutate: (tx: ScanWriteTransaction) => Promise<T>,
  before: readonly GuildHubLocalScan[] = [], after: readonly GuildHubLocalScan[] = [],
  extra: Partial<LocalDataChangeInput> & { expectedAbsentIds?: readonly string[] } = {}, lease?: LocalDataWriteLease,
) {
  const { expectedAbsentIds = [], ...details } = extra;
  let changed = true;
  return commitLocalDataMutation(db, stores, () => changed ? scanMutationChange(before, after, details) : null, async tx => {
    for (const id of expectedAbsentIds) {
      if (await tx.objectStore(SCAN_STORE).getKey(id) !== undefined) throw new Error(`Source changed before library commit: ${id}`);
    }
    // Precomputed updates/policy operations must not resurrect deletes or restore
    // metadata loaded before another participating writer's successful commit.
    if (before.length) {
      for (const expected of before) {
        const latest = await tx.objectStore(SCAN_STORE).get(expected.id);
        if (!latest || latest.sourceGeneration !== expected.sourceGeneration ||
            latest.contentHash !== expected.contentHash || latest.updatedAt !== expected.updatedAt ||
            latest.normalizerVersion !== expected.normalizerVersion || latest.coreNormalizerVersion !== expected.coreNormalizerVersion ||
            latest.analyticsEnabled !== expected.analyticsEnabled ||
            (stores.includes(SCAN_SUMMARY_STORE) && after.some(scan => scan.id === expected.id) && JSON.stringify(latest.provenance) !== JSON.stringify(expected.provenance))) {
          throw new Error(`Source changed before library commit: ${expected.id}`);
        }
      }
    }
    const result = await mutate(tx);
    if (result === false) changed = false;
    return result;
  }, lease);
}

export async function ensureSfDataHubLocalDataReady() {
  await getLocalScanDb();
}

type W158CleanupReceipt = {
  version: 1; status: "running" | "complete" | "partial";
  verifiedSourceIds: string[]; removedSourceIds: string[]; removedFavoriteIds: string[];
  conflicts: string[]; completedAt?: string;
};

/** Closed, one-time repair of the two externally backed-up W158 sources.
 * Runs before normal application consumers mount. A durable checkpoint permits
 * recovery across the existing separate Raw/Analytics/Hub databases. Every
 * deletion reuses the normal source invalidation path and the same writer lease.
 * Historical change journals and unrelated settings/identities are preserved. */
export async function migrateW158FixtureData(): Promise<W158CleanupReceipt> {
  const db = await getLocalScanDb();
  const { getPlayerIdentity } = await import("../identities/playerIdentityStore");
  const { getGuildEntityForAlias } = await import("../identities/guildIdentityStore");
  const { removeW158FixtureFavorites } = await import("../data-hub/hubFavoritesStore");
  return withLocalDataWrite(async lease => {
    const prior = (await db.get(METADATA_STORE, W158_CLEANUP_KEY))?.value as W158CleanupReceipt | undefined;
    if (prior?.version === 1 && (prior.status === "complete" || prior.status === "partial")) return prior;
    const receipt: W158CleanupReceipt = prior?.version === 1 ? structuredClone(prior) : {
      version: 1, status: "running", verifiedSourceIds: [], removedSourceIds: [], removedFavoriteIds: [], conflicts: [],
    };
    const conflict = (message: string) => { if (!receipt.conflicts.includes(message)) receipt.conflicts.push(message); };
    const save = () => commitScanMutation(db, [METADATA_STORE], async tx => {
      await tx.objectStore(METADATA_STORE).put({ key: W158_CLEANUP_KEY, value: receipt, updatedAt: new Date().toISOString() });
    }, [], [], { owner: "sources", kinds: ["maintenance"], sourceIds: receipt.verifiedSourceIds, unknownImpact: false }, lease);
    const summaries = await db.getAll(SCAN_SUMMARY_STORE);
    for (const evidence of W158_FIXTURE_SOURCES) {
      const scan = await db.get(SCAN_STORE, evidence.id);
      if (!scan && !receipt.verifiedSourceIds.includes(evidence.id)) continue;
      if (scan) {
        const archive = scan.archiveSource;
        if (scan.contentHash !== evidence.hash || await sha256Hex(JSON.stringify(scan.rawData)) !== evidence.hash ||
            archive?.provider !== "scan-archive" || archive.archiveScanId !== evidence.archiveId ||
            archive.manifestUrl !== "http://localhost:5173/w158-manifest.json" || archive.sha256 !== evidence.archiveHash ||
            archive.path !== `${evidence.archiveId}.json.gz` || archive.timestamp !== evidence.timestamp ||
            scan.isScanSlot || scan.containedInScanSlotId || summaries.some(s => s.mergedSourceIds?.includes(evidence.id))) {
          conflict(`Source evidence or shared bundle conflict: ${evidence.id}`); continue;
        }
        const bindings = await db.getAllFromIndex(ARCHIVE_SCAN_BINDING_STORE, "by_localScanId", evidence.id);
        if (bindings.some(b => b.archiveScanId !== evidence.archiveId || b.localContentHash !== evidence.hash ||
            b.sha256 !== evidence.archiveHash || b.manifestUrl !== archive.manifestUrl)) {
          conflict(`Shared archive binding: ${evidence.id}`); continue;
        }
        if (!receipt.verifiedSourceIds.includes(evidence.id)) receipt.verifiedSourceIds.push(evidence.id);
        // Persist source authorization before deleting from separate databases.
        await save();
      }
      await removeGuildHubLocalScanRecords([evidence.id], lease);
      // Archive search records have their own archive index, not a local ID.
      await commitScanMutation(db, [ARCHIVE_SEARCH_INDEX_STORE], async tx => {
        const store = tx.objectStore(ARCHIVE_SEARCH_INDEX_STORE);
        for (const record of await store.index("by_archiveScanId").getAll(evidence.archiveId)) {
          if (record.sourceSha256 === evidence.archiveHash && record.manifestUrl === "http://localhost:5173/w158-manifest.json") await store.delete(record.key);
          else conflict(`Archive index evidence conflict: ${record.key}`);
        }
      }, [], [], { owner: "archive-index", kinds: ["reset"], sourceIds: [evidence.id], unknownImpact: false }, lease);
      if (!receipt.removedSourceIds.includes(evidence.id)) receipt.removedSourceIds.push(evidence.id);
      await save();
    }
    // The saved originals have no identity rows for these exact references.
    // Any identity now present has no proven fixture-only provenance: retain it
    // and its favorites, including groups shared with genuine references.
    const identityReferences = [
      await getPlayerIdentity("f8_net_p1"), await getPlayerIdentity("f8_net_p2"),
      await getGuildEntityForAlias("f8_net_g1"), await getGuildEntityForAlias("f8_g1"),
    ];
    if (identityReferences.some(Boolean)) conflict("Unproven identity reference for W158; identities and favorites retained");
    else if (W158_FIXTURE_SOURCES.every(s => receipt.removedSourceIds.includes(s.id))) {
      const favorites = await removeW158FixtureFavorites(lease);
      receipt.removedFavoriteIds = [...new Set([...receipt.removedFavoriteIds, ...favorites.removed])];
      favorites.conflicts.forEach(id => conflict(`Favorite evidence changed: ${id}`));
    }
    receipt.status = receipt.conflicts.length ? "partial" : "complete";
    receipt.completedAt = new Date().toISOString();
    await save();
    return receipt;
  });
}

// Journal reads also serve metadata-only subscriptions; never trigger Raw migration.
export async function readSfDataHubLocalChanges(after = 0, latestOnly = false) {
  return readLocalDataChanges(localChangesDb(await getLocalScanDbWithoutMigration()), after, latestOnly);
}

export async function readLocalToplistResetGeneration(sourceId: string) {
  return readLocalResetGeneration(localChangesDb(await getLocalScanDbWithoutMigration()), "toplists", sourceId);
}

function notifyLocalScanLibraryChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCAL_SCAN_LIBRARY_CHANGE_EVENT));
    return;
  }

}

subscribeToLocalDataChanges(change => {
  if (change.owner === "sources") notifyLocalScanLibraryChanged();
});

export function subscribeToSfDataHubLocalScanChanges(listener: (cause?: LocalDependencyNotification) => void, diagnosticContext?: AuditFields) {
  return subscribeToLocalDataDependencies({ allSources: true }, listener, undefined, diagnosticContext);
}

export async function readGuildHubSelectionState(): Promise<GuildHubSelectionState> {
  const { readGuildFavoritesAdapter } = await import("../data-hub/hubFavoritesStore");
  return readGuildFavoritesAdapter();
}

export async function writeGuildHubSelectionState(state: GuildHubSelectionState): Promise<void> {
  const { writeGuildFavoritesAdapter } = await import("../data-hub/hubFavoritesStore");
  return writeGuildFavoritesAdapter(state);
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

function indexRecordKeys(record: JsonRecord) {
  const lookup = new Map<string, string>();
  for (const key of Object.keys(record)) {
    const canon = canonKey(key);
    if (canon && !lookup.has(canon)) lookup.set(canon, key);
  }
  return lookup;
}

function pickFirst(record: JsonRecord, keys: string[], lookup = indexRecordKeys(record)) {
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


function readFirstTimestampMillis(record: JsonRecord, keys: string[] = SCAN_TIMESTAMP_KEYS) {
  for (const key of keys) {
    const direct = record[key];
    const parsed = toTimestampMillis(direct);
    if (parsed != null) return parsed;
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

/** Existing timestamp buckets, without a second member/core/stat normalization. */
export function readGuildHubRawSnapshots(scan: GuildHubLocalScan) {
  const raw = getScanRawData(scan);
  return raw ? deriveLogicalTimestampBuckets(raw) : [];
}

/** Read-only selection using the established row/parsed/root snapshot contract.
 * Does not normalize player cores or accept a caller's unverified header time. */
export function selectGuildHubRawSnapshot(scan: GuildHubLocalScan, timestampMs: number) {
  const raw = getScanRawData(scan);
  return raw ? deriveLogicalTimestampBuckets(raw).find(bucket => bucket.timestampMs === timestampMs) ?? null : null;
}

/** Search reads the established logical buckets without constructing normalized
 * members, cores, cards or analytics. Unclassified rows remain searchable. */
export function readGuildHubSearchRows(scan: GuildHubLocalScan): HubSearchRawRow[] {
  const rows: HubSearchRawRow[] = [];
  for (const row of iterateGuildHubSearchRows(scan)) if (row) rows.push(row);
  return rows;
}

/** Preparation checkpoints precede document work. Direct observation times take
 * priority; only a single parsed own-player time, then root time, can cover the
 * whole input when direct observations are absent (the logical bucket contract).
 * Arrays and records remain caller-owned; no Raw clone or normalized cores. */
export function* iterateGuildHubSearchRows(scan: GuildHubLocalScan): Generator<HubSearchRawRow | undefined> {
  const raw = getScanRawData(scan);
  if (!raw) throw new Error("Search source format unavailable");
  const timesByRow = new Map<unknown, number>();
  const guildCopies = new Map<string, number>();
  const sourceServers = new Set<string>();
  const sectionServers = new Map<number | null, Set<string>>();
  for (const values of [raw.players, raw.groups]) for (const value of values) {
    const at = getEntryTimestampMillis(value);
    if (at !== null) timesByRow.set(value, at);
    const servers = readHubSearchReferenceEvidence(values === raw.players ? "player" : "guild", value).servers;
    const section = sectionServers.get(at) ?? new Set<string>();
    for (const server of servers) { sourceServers.add(server); section.add(server); }
    sectionServers.set(at, section);
    if (values === raw.groups && isRecord(value)) {
      const id = toTrimmedString(pickFirst(value, ["guildIdentifier", "Guild Identifier", "identifier", "Identifier"]));
      if (id) guildCopies.set(id, (guildCopies.get(id) ?? 0) + 1);
    }
    yield;
  }
  // A header may describe the whole source only when row evidence agrees and
  // the source is not mixed. Mixed sources need an unambiguous logical section.
  const headerServers = readHubSearchReferenceEvidence("player", {
    server: raw.server, prefix: raw.prefix, world: raw.world, realm: raw.realm, srv: raw.srv, shard: raw.shard,
  }).servers;
  const wholeServers = new Set([...sourceServers, ...headerServers]);
  const wholeContext = wholeServers.size === 1 ? wholeServers.values().next().value : null;
  let fallback: number | null = null;
  if (!timesByRow.size) {
    const parsedTimes = new Set<number>();
    try {
      // parseSfJson maps players independently. Keep its complete-call failure
      // behavior while avoiding one synchronous parse of the entire source.
      for (const value of raw.players) {
        for (const player of parseSfJson({ players: [value] }).ownPlayers) {
          const at = toTimestampMillis(player.timestamp);
          if (at !== null && Number.isFinite(at)) parsedTimes.add(at);
        }
        yield;
      }
    } catch { parsedTimes.clear(); }
    if (parsedTimes.size === 1) fallback = parsedTimes.values().next().value ?? null;
    if (fallback === null) fallback = readFirstTimestampMillis(raw);
  }
  for (const kind of ["player", "guild"] as const) {
    const values = kind === "player" ? raw.players : raw.groups;
    for (let index = 0; index < values.length; index++) {
      const value = values[index];
      const guild = kind === "guild" && isRecord(value)
        ? extractGuildFromGroup(value, { players: [], groups: [] }, { ...scan, servers: [] }) : null;
      const section = sectionServers.get(timesByRow.get(value) ?? null);
      const serverContext = wholeContext ?? (sourceServers.size > 1 && timesByRow.has(value) && section?.size === 1 ? section.values().next().value : null);
      yield { kind, raw: value, row: String(index), at: timesByRow.get(value) ?? fallback,
        // A shared logical/file clock still locates the snapshot, but does not
        // certify an individual row's freshness for search ranking.
        timeQuality: timesByRow.has(value) ? "observation" : fallback === null ? "unknown" : "file",
        serverContext,
        ...(guild ? { guild: { name: guild.name, identifier: guild.guildIdentifier ?? (guild.server ? `${guild.server}_g${guild.guildId}` : null), server: guild.server,
          // The identifier-wide import metadata cannot certify two different observations.
          coaString: guild.guildIdentifier && (guildCopies.get(guild.guildIdentifier) ?? 0) > 1 && isRecord(value)
            ? extractGuildCoaString(value) : guild.coaString } } : {}) };
    }
  }
}

/** Source-local invalidation only, with no extra reads. Durable fingerprint and
 * reset evidence remain authoritative under the writer lease at commit. */
export async function prepareGuildHubSearchProjection(scan: GuildHubLocalScan, reset: string, options: HubSearchExecutionOptions = {}) {
    const __audit2 = auditPhaseBegin("prepareGuildHubSearchProjection", undefined, "async-container");
    try {
  let invalidated = false;
  const unsubscribe = subscribeToLocalDataChanges(change => {
    if (change.owner === "sources" && change.kinds.some(kind => ["content", "normalization", "release", "exclusion", "maintenance", "reset"].includes(kind)) &&
        (change.unknownImpact || [...change.sourceIds, ...change.removedSourceIds].includes(scan.id)) ||
        change.owner === "hub-search" && change.kinds.includes("reset") && (!change.sourceIds.length || change.sourceIds.includes(scan.id))) invalidated = true;
  });
  try {
    return auditReturn(__audit2, await (auditValue(__audit2, auditEnter(__audit2, "buildHubSearchProjectionCooperatively"), ((auditValue(__audit2, auditEnter(__audit2, "buildHubSearchProjectionCooperatively", "sync-elapsed"), (buildHubSearchProjectionCooperatively(scan, iterateGuildHubSearchRows(scan), reset,
      { ...options, allowed: () => !invalidated && options.allowed?.() !== false }))))))));
  } finally { unsubscribe(); }

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}

export function deriveGuildHubLogicalScanSnapshots(
  scan: GuildHubLocalScan,
  optionsOrIndex:
    | { onNormalizedSnapshotCreated?: (durationMs: number) => void; onNormalizedPlayerCreated?: Parameters<typeof normalizeGuildScanMembers>[1]; includeSnapshot?: (rawData: unknown) => boolean }
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
    if (options.includeSnapshot?.(rawData) === false) return [];
    const normalizedStartedAt = performance.now();
    const normalizedMembers = normalizeGuildScanMembers(rawData, options.onNormalizedPlayerCreated);
    options.onNormalizedSnapshotCreated?.(performance.now() - normalizedStartedAt);
    const servers = extractServers(rawData);
    const guildCount = countScanGuilds(rawData, normalizedMembers, servers);

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

/** Import and main-thread source preparation keep the established snapshot
 * boundaries and callbacks while yielding within a large single snapshot. */
export async function deriveGuildHubLogicalScanSnapshotsCooperatively(
  scan: GuildHubLocalScan,
  options: Exclude<Parameters<typeof deriveGuildHubLogicalScanSnapshots>[1], number> = {},
): Promise<GuildHubLogicalScanSnapshot[]> {
  const raw = getScanRawData(scan);
  if (!raw) return [];
  const snapshots: GuildHubLogicalScanSnapshot[] = [];
  for (const bucket of deriveLogicalTimestampBuckets(raw)) {
    const timestamp = isoFromTimestampMillis(bucket.timestampMs);
    if (!timestamp) continue;
    const rawData = createSnapshotRawData(raw, bucket);
    if (options.includeSnapshot?.(rawData) === false) continue;
    let activeMs = 0;
    const normalizedMembers = await normalizeGuildScanMembersCooperatively(
      rawData, options.onNormalizedPlayerCreated, duration => { activeMs += duration; },
    );
    options.onNormalizedSnapshotCreated?.(activeMs);
    const servers = extractServers(rawData);
    const guildCount = countScanGuilds(rawData, normalizedMembers, servers);
    snapshots.push({
      id: `${scan.id}::${bucket.timestampMs}`, timestamp, timestampMs: bucket.timestampMs,
      players: bucket.players, groups: bucket.groups, servers,
      playerCount: bucket.players.length, groupCount: bucket.groups.length, guildCount,
      rawData, normalizedMembers, sourceScanId: scan.id,
      sourceScanFilename: scan.filename, sourceImportedAt: scan.importedAt,
    });
  }
  return snapshots;
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
    // Both projections read the same immutable row in this pass. Preserve
    // first canonical-key precedence without indexing every raw key twice.
    const lookup = indexRecordKeys(entry);
    addServer(servers, pickFirst(entry, ["server", "Server", "prefix", "world", "realm", "srv", "shard"], lookup));
    addServer(servers, parseServerFromIdentifier(pickFirst(entry, ["identifier", "Identifier", "guildIdentifier"], lookup)));
  }

  return [...servers].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeLocalServer(value: unknown): string | null {
  return normalizeServerKeyFromInput(value);
}

export function parseServerFromGuildIdentifier(value: unknown): string | null {
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
  if (!players.length && !groups.length &&
      !Array.isArray(scan.rawData.players) && !Array.isArray(scan.rawData.groups) && !Array.isArray(scan.rawData.guilds)) return null;

  return {
    ...scan.rawData,
    players,
    groups,
  };
}

export function normalizeGuildHubLocalScanForDerivation(scan: GuildHubLocalScan): GuildHubLocalScan {
  const raw = getScanRawData(scan);
  if (!raw) return scan;
  const normalizedPlayers =
    scan.normalizerVersion === GUILD_SCAN_NORMALIZER_VERSION &&
    scan.coreNormalizerVersion === LOCAL_SCAN_CORE_NORMALIZER_VERSION && Array.isArray(scan.normalizedMembers)
      ? scan.normalizedMembers
      : normalizeGuildScanMembers(raw);
  const servers = extractServers(raw);
  const guildCount = countScanGuilds(raw, normalizedPlayers, servers);

  if (
    hasCurrentLocalSourceValidity(scan) &&
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
    coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION,
    // Deterministic for concurrent repairs and readonly normalization of the same
    // input. New imports/updates have fresh generations, including same-hash ABA.
    sourceGeneration: JSON.stringify([
      scan.sourceGeneration ?? [scan.id, scan.contentHash, scan.updatedAt ?? scan.importedAt],
      GUILD_SCAN_NORMALIZER_VERSION, LOCAL_SCAN_CORE_NORMALIZER_VERSION, "repair",
    ]),
  };
}

async function persistScanNormalizationIfNeeded(db: IDBPDatabase<LocalScanDb>, scan: GuildHubLocalScan): Promise<GuildHubLocalScan | null> {
    const __audit3 = auditPhaseBegin("persistScanNormalizationIfNeeded", undefined, "async-container");
    try {
  const normalized = (auditValue(__audit3, auditEnter(__audit3, "normalizeGuildHubLocalScanForDerivation", "sync-elapsed"), (normalizeGuildHubLocalScanForDerivation(scan))));
  const existingSummary = await (auditValue(__audit3, auditEnter(__audit3, "db.get"), (db.get(SCAN_SUMMARY_STORE, scan.id))));
  if (normalized === scan && existingSummary &&
      existingSummary.sourceGeneration === scan.sourceGeneration &&
      existingSummary.normalizerVersion === scan.normalizerVersion &&
      existingSummary.coreNormalizerVersion === scan.coreNormalizerVersion &&
      existingSummary.contentHash === scan.contentHash &&
      (existingSummary.updatedAtIso ?? existingSummary.importedAtIso) === (scan.updatedAt ?? scan.importedAt) &&
      existingSummary.analyticsEnabled === scan.analyticsEnabled &&
      (auditValue(__audit3, auditEnter(__audit3, "JSON.stringify", "sync-elapsed"), (JSON.stringify(existingSummary.provenance)))) === (auditValue(__audit3, auditEnter(__audit3, "JSON.stringify", "sync-elapsed"), (JSON.stringify(scan.provenance)))) &&
      isCurrentGuildHubScanSummary(existingSummary)) return auditReturn(__audit3, scan);
  const summary = createGuildHubScanSummary(normalized);
  try {
    await (auditValue(__audit3, auditEnter(__audit3, "commitScanMutation"), (commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
      await Promise.all([tx.objectStore(SCAN_STORE).put(normalized), tx.objectStore(SCAN_SUMMARY_STORE).put(summary)]);
    }, [scan], [normalized], { kinds: ["normalization"] }))));
    return auditReturn(__audit3, normalized);
  } catch (error) { auditCaught(__audit3, error);
    if (!(error instanceof Error) || !error.message.startsWith("Source changed before library commit:")) throw error;
    const latest = await (auditValue(__audit3, auditEnter(__audit3, "db.get"), (db.get(SCAN_STORE, scan.id))));
    return auditReturn(__audit3, latest ? persistScanNormalizationIfNeeded(db, latest) : null);
  }

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}

/** Small durable validity projection. No Raw payload reads or normalization. */
export async function readGuildHubLocalScanSourceValidity(sourceIds: readonly string[]) {
    const __audit4 = auditPhaseBegin("readGuildHubLocalScanSourceValidity", undefined, "async-container");
    try {
  const db = await (auditValue(__audit4, auditEnter(__audit4, "getLocalScanDbWithoutMigration"), (getLocalScanDbWithoutMigration())));
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE]);
  const entries = await (auditValue(__audit4, auditEnter(__audit4, "Promise.all"), (Promise.all([...new Set(sourceIds)].map(async (id) => {
    const [key, summary] = await Promise.all([
      tx.objectStore(SCAN_STORE).getKey(id), tx.objectStore(SCAN_SUMMARY_STORE).get(id),
    ]);
    return [id, key !== undefined && summary && isCurrentGuildHubScanSummary(summary) &&
      hasCurrentLocalSourceValidity(summary) ? summary as GuildHubScanSummary & LocalSourceValidity : null] as const;
  })))));
  await (auditValue(__audit4, auditEnter(__audit4, "tx.done"), (tx.done)));
  return auditReturn(__audit4, new Map(entries));

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
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

function collectGuildIdentitiesForScan(
  scan: GuildHubLocalScan,
  snapshots: readonly GuildHubLogicalScanSnapshot[] = deriveGuildHubLogicalScanSnapshots(scan),
): GuildHubLocalGuildIdentity[] {
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

function countScanGuilds(raw: NormalizedRawScanRecord, normalizedMembers: NormalizedGuildMember[], servers = extractServers(raw)) {
  const guildKeys = new Set<string>();
  const scanShell: GuildHubLocalScan = {
    id: "",
    contentHash: "",
    filename: "",
    importedAt: "",
    scannedAt: null,
    servers,
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
      if (serverComparisonKey(guild.server) !== serverComparisonKey(normalizedServer)) continue;
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
      if (serverComparisonKey(guild.server) !== serverComparisonKey(normalizedServer)) continue;
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

const fusionInventoryTargetServerCodes = new Set<string>(
  LOCAL_SERVER_FUSION_EVENTS.map((event) => event.target),
);

const resolveFusionInventoryServerCode = (server: unknown) => {
  const resolved = resolveServer(String(server ?? ""))?.code;
  if (resolved) return resolved;
  const normalized = normalizeLocalServer(server);
  return normalized ? normalized.toUpperCase() : null;
};

const shouldPersistFusionInventoryIdentifiers = (server: unknown) => {
  const serverCode = resolveFusionInventoryServerCode(server);
  return serverCode ? fusionInventoryTargetServerCodes.has(serverCode) : false;
};

const buildFusionInventoryGuildIdentifier = (
  server: string | null,
  segment: string | null,
  name: string | null,
) => {
  if (segment) return server ? `${server.toLowerCase()}_${segment}` : segment;
  const nameKey = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return nameKey ? `${server?.toLowerCase() ?? "unknown"}_name_${nameKey}` : null;
};

function createFusionInventorySlices(
  snapshots: readonly GuildHubLogicalScanSnapshot[],
): GuildHubFusionInventorySlice[] {
  const slices: GuildHubFusionInventorySlice[] = [];

  snapshots.forEach((snapshot) => {
    const byServer = new Map<
      string,
      {
        server: string;
        playerIdentifiers: Set<string>;
        guildIdentifiers: Set<string>;
      }
    >();
    const ensureSlice = (server: unknown) => {
      const normalized = normalizeLocalServer(server);
      if (!normalized) return null;
      const key = normalized.toLowerCase();
      const existing = byServer.get(key);
      if (existing) return existing;
      const created = {
        server: normalized,
        playerIdentifiers: new Set<string>(),
        guildIdentifiers: new Set<string>(),
      };
      byServer.set(key, created);
      return created;
    };

    snapshot.servers.forEach(ensureSlice);

    snapshot.normalizedMembers.forEach((member) => {
      const slice = ensureSlice(member.server);
      if (!slice) return;
      const memberRef = toTrimmedString(member.memberRef);
      if (memberRef) slice.playerIdentifiers.add(memberRef);
      const guildIdentifier = buildFusionInventoryGuildIdentifier(
        normalizeLocalServer(member.server),
        normalizeGuildSegmentForScan(member.guildSegment ?? member.groupSegment),
        member.guildName,
      );
      if (guildIdentifier) slice.guildIdentifiers.add(guildIdentifier);
    });

    snapshot.groups.forEach((group) => {
      if (!isRecord(group)) return;
      const rawIdentifier = toTrimmedString(
        pickFirst(group, [
          "guildIdentifier",
          "Guild Identifier",
          "identifier",
          "Identifier",
          "groupIdentifier",
          "groupId",
          "guildId",
          "id",
        ]),
      );
      const server = normalizeLocalServer(
        pickFirst(group, ["server", "Server", "prefix", "world", "realm"]) ??
          rawIdentifier?.match(/^(.+)_g[^_]+$/i)?.[1],
      );
      const slice = ensureSlice(server);
      if (!slice) return;
      const guildIdentifier = buildFusionInventoryGuildIdentifier(
        server,
        normalizeGuildSegmentForScan(rawIdentifier),
        toTrimmedString(pickFirst(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"])),
      );
      if (guildIdentifier) slice.guildIdentifiers.add(guildIdentifier);
    });

    [...byServer.values()]
      .sort((left, right) => left.server.localeCompare(right.server, undefined, { sensitivity: "base" }))
      .forEach((slice) => {
        const playerIdentifiers = [...slice.playerIdentifiers].sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
        );
        const guildIdentifiers = [...slice.guildIdentifiers].sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
        );
        const persistIdentifiers = shouldPersistFusionInventoryIdentifiers(slice.server);
        slices.push({
          id: `${snapshot.id}::${slice.server}`,
          snapshotId: snapshot.id,
          sourceScanId: snapshot.sourceScanId,
          sourceScanFilename: snapshot.sourceScanFilename,
          sourceImportedAt: snapshot.sourceImportedAt,
          timestamp: snapshot.timestamp,
          timestampMs: snapshot.timestampMs,
          server: slice.server,
          playerCount: slice.playerIdentifiers.size,
          guildCount: slice.guildIdentifiers.size,
          ...(persistIdentifiers ? { playerIdentifiers, guildIdentifiers } : {}),
        });
      });
  });

  return slices;
}

function createGuildHubScanSummary(
  scan: GuildHubLocalScan,
  snapshots = deriveGuildHubLogicalScanSnapshots(scan),
): GuildHubScanSummary {
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
    // Coverage, inventory and identities project the same prepared snapshots.
    guilds: collectGuildIdentitiesForScan(scan, snapshots),
    guildCoverage,
    fusionInventorySlices: createFusionInventorySlices(snapshots),
    ...(scan.isMergedBundle ? { isMergedBundle: true } : {}),
    ...(scan.isScanSlot ? { isScanSlot: true } : {}),
    ...(scan.scanSlotStatus ? { scanSlotStatus: scan.scanSlotStatus } : {}),
    ...(scan.mergedSourceIds ? { mergedSourceIds: scan.mergedSourceIds } : {}),
    ...("containedInScanSlotId" in scan ? { containedInScanSlotId: scan.containedInScanSlotId ?? null } : {}),
    ...(typeof scan.analyticsEnabled === "boolean" ? { analyticsEnabled: scan.analyticsEnabled } : {}),
    ...(scan.provenance ? { provenance: scan.provenance } : {}),
    ...(scan.archiveSource ? { archiveSource: scan.archiveSource } : {}),
    contentHash: scan.contentHash,
    summaryVersion: GUILD_HUB_SCAN_SUMMARY_VERSION,
    sourceGeneration: scan.sourceGeneration,
    normalizerVersion: scan.normalizerVersion,
    coreNormalizerVersion: scan.coreNormalizerVersion,
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
    sourceGeneration: scan.sourceGeneration,
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

  if (scan.provenance) next.provenance = scan.provenance;
  else delete next.provenance;

  if (scan.archiveSource) next.archiveSource = scan.archiveSource;
  else delete next.archiveSource;

  return next;
}


function isCurrentGuildHubScanSummary(summary: GuildHubScanSummary | undefined) {
  const hasCurrentFusionInventorySliceSchema =
    Array.isArray(summary?.fusionInventorySlices) &&
    summary.fusionInventorySlices.every((slice) => {
      const hasPlayerIdentifiers = Array.isArray(slice.playerIdentifiers);
      const hasGuildIdentifiers = Array.isArray(slice.guildIdentifiers);
      if (shouldPersistFusionInventoryIdentifiers(slice.server)) {
        return hasPlayerIdentifiers && hasGuildIdentifiers;
      }
      return !hasPlayerIdentifiers && !hasGuildIdentifiers;
    });

  return (
    summary?.summaryVersion === GUILD_HUB_SCAN_SUMMARY_VERSION &&
    typeof summary.contentHash === "string" &&
    typeof summary.guildCoverage?.completeGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.incompleteGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.overcountGuildSnapshotCount === "number" &&
    typeof summary.guildCoverage.unknownGuildSnapshotCount === "number" &&
    Array.isArray(summary.guildCoverage.byServer) &&
    hasCurrentFusionInventorySliceSchema
  );
}

export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> {
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

  if (!orphanSummaryKeys.length && !rebuildKeys.length) {
    return { orphanSummaryCount: 0, rebuiltSummaryCount: 0 };
  }

  for (const orphanKey of orphanSummaryKeys) {
    await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
      if (await tx.objectStore(SCAN_STORE).getKey(orphanKey) !== undefined) return false;
      await tx.objectStore(SCAN_SUMMARY_STORE).delete(orphanKey);
    }, [], [], { kinds: ["normalization"], sourceIds: [orphanKey], unknownImpact: true });
  }

  for (const key of rebuildKeys) {
    const scan = await db.get(SCAN_STORE, key);
    if (scan) {
      await persistScanNormalizationIfNeeded(db, scan);
      await yieldToBrowser();
    }
  }

  return {
    orphanSummaryCount: orphanSummaryKeys.length,
    rebuiltSummaryCount: rebuildKeys.length,
  };
}

export async function listGuildHubScanSummaries(options: ListGuildHubScanSummariesOptions = {}) {
    const __audit5 = auditBegin("S06", "listGuildHubScanSummaries");
    if (options.auditContext) auditFields(__audit5, options.auditContext);
    auditFields(__audit5, { physicalSummaryRead: true, ensureCurrent: options.ensureCurrent !== false });
    try {
  if (options.ensureCurrent !== false) {
    await (auditValue(__audit5, auditEnter(__audit5, "ensureGuildHubScanSummaries"), (ensureGuildHubScanSummaries())));
  }
  const db = await (auditValue(__audit5, auditEnter(__audit5, "getLocalScanDb"), (getLocalScanDb())));
  const summaries = await attachArchiveBindingsToSummaries(db, await (auditValue(__audit5, auditEnter(__audit5, "db.getAll"), (db.getAll(SCAN_SUMMARY_STORE)))));
  return auditReturn(__audit5, summaries.sort(compareScanSummaries));

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
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

const archiveBindingKey = (archiveScanId: string, archiveSha256: string) =>
  `${archiveScanId.trim()}:${archiveSha256.trim().toLowerCase()}`;

const archiveSearchIndexCacheKey = (archiveScanId: string, searchIndexSha256: string) =>
  `${archiveScanId.trim()}:${searchIndexSha256.trim().toLowerCase()}`;

const createArchiveBindingFromEntry = (
  entry: ScanArchiveEntry,
  scan: GuildHubLocalScan,
  existing?: GuildHubArchiveScanBinding | null,
): GuildHubArchiveScanBinding => {
  const now = new Date().toISOString();
  return {
    key: archiveBindingKey(entry.id, entry.sha256),
    provider: "scan-archive",
    archiveScanId: entry.id,
    archiveYear: entry.archiveYear,
    manifestRevision: entry.manifestRevision,
    manifestUrl: entry.manifestUrl,
    path: entry.path,
    sha256: entry.sha256,
    server: entry.server,
    timestamp: entry.timestamp,
    localScanId: scan.id,
    localContentHash: scan.contentHash,
    readiness: { version: ARCHIVE_READINESS_VERSION, sourceId: scan.id, contentHash: scan.contentHash,
      sourceGeneration: scan.sourceGeneration!, normalizerVersion: scan.normalizerVersion!,
      coreNormalizerVersion: scan.coreNormalizerVersion!, expectation: archiveExpectation(entry), checkedAt: now },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
};

function archiveBindingMatchesEntry(binding: GuildHubArchiveScanBinding, entry: ScanArchiveEntry) {
  // Preserve the acquisition lookup's physical matching policy. A compatible
  // existing Raw is rechecked below and receives the CURRENT full expectation;
  // a manifest revision/URL change alone must not force another download.
  return binding.archiveScanId === entry.id && binding.sha256.toLowerCase() === entry.sha256.toLowerCase() &&
    binding.archiveYear === entry.archiveYear && binding.server === entry.server && binding.timestamp === entry.timestamp;
}

function localScanMatchesArchiveEntry(scan: GuildHubLocalScan, entry: ScanArchiveEntry) {
  try {
    validateScanArchivePayload(scan.rawData, entry);
    return true;
  } catch {
    return false;
  }
}

async function cleanupArchiveBinding(db: IDBPDatabase<LocalScanDb>, binding: GuildHubArchiveScanBinding) {
  if (!db.objectStoreNames.contains(ARCHIVE_SCAN_BINDING_STORE)) return;
  await commitScanMutation(db, [ARCHIVE_SCAN_BINDING_STORE], async tx => {
    const latest = await tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).get(binding.key);
    if (!latest || JSON.stringify(latest) !== JSON.stringify(binding)) return false;
    await tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).delete(binding.key);
  }, [], [], { sourceIds: [binding.localScanId], servers: [binding.server], kinds: ["binding"], unknownImpact: false });
}

function archiveSearchIndexRecordMatchesEntry(record: GuildHubArchiveSearchIndexCacheRecord, entry: ScanArchiveEntry) {
  const searchIndex = entry.searchIndex;
  if (!searchIndex) return false;
  return (
    record.archiveScanId === entry.id &&
    record.sourceSha256.toLowerCase() === entry.sha256.toLowerCase() &&
    record.searchIndexSha256.toLowerCase() === searchIndex.sha256.toLowerCase() &&
    record.searchIndexPath === searchIndex.path &&
    record.payload.schemaVersion === searchIndex.schemaVersion &&
    record.archiveYear === entry.archiveYear &&
    record.manifestRevision === entry.manifestRevision &&
    record.manifestUrl === entry.manifestUrl &&
    record.server === entry.server &&
    record.timestamp === entry.timestamp &&
    record.compressedBytes === searchIndex.compressedBytes &&
    record.uncompressedBytes === searchIndex.uncompressedBytes &&
    record.playerCount === searchIndex.playerCount &&
    record.groupCount === searchIndex.groupCount
  );
}

function createArchiveSearchIndexRecordFromEntry(
  entry: ScanArchiveEntry,
  payload: ScanArchiveSearchIndexPayload,
  existing?: GuildHubArchiveSearchIndexCacheRecord | null,
): GuildHubArchiveSearchIndexCacheRecord {
  if (!entry.searchIndex) throw new Error(`Archivscan ${entry.id} hat keinen Suchindex.`);
  const now = new Date().toISOString();
  return {
    key: archiveSearchIndexCacheKey(entry.id, entry.searchIndex.sha256),
    archiveScanId: entry.id,
    archiveYear: entry.archiveYear,
    manifestRevision: entry.manifestRevision,
    manifestUrl: entry.manifestUrl,
    server: entry.server,
    timestamp: entry.timestamp,
    sourceSha256: entry.sha256,
    searchIndexPath: entry.searchIndex.path,
    searchIndexSha256: entry.searchIndex.sha256,
    compressedBytes: entry.searchIndex.compressedBytes,
    uncompressedBytes: entry.searchIndex.uncompressedBytes,
    playerCount: entry.searchIndex.playerCount,
    groupCount: entry.searchIndex.groupCount,
    payload,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function bindGuildHubLocalScanToArchiveEntry(
  entry: ScanArchiveEntry,
  localScanId: string,
): Promise<GuildHubArchiveScanBinding> {
    const __audit6 = auditPhaseBegin("bindGuildHubLocalScanToArchiveEntry", undefined, "async-container");
    try {
  const db = await (auditValue(__audit6, auditEnter(__audit6, "getLocalScanDb"), (getLocalScanDb())));
  const scan = await (auditValue(__audit6, auditEnter(__audit6, "db.get"), (db.get(SCAN_STORE, localScanId))));
  if (!scan) throw new Error(`Lokaler Scan wurde nicht gefunden: ${localScanId}`);
  const normalizedScan = await (auditValue(__audit6, auditEnter(__audit6, "persistScanNormalizationIfNeeded"), (persistScanNormalizationIfNeeded(db, scan))));
  if (!normalizedScan || !localScanMatchesArchiveEntry(normalizedScan, entry)) {
    throw new Error(`Lokaler Scan passt nicht zum Archivscan ${entry.id}.`);
  }

  const key = archiveBindingKey(entry.id, entry.sha256);
  const existing = await (auditValue(__audit6, auditEnter(__audit6, "db.get"), (db.get(ARCHIVE_SCAN_BINDING_STORE, key))));
  const binding = createArchiveBindingFromEntry(entry, normalizedScan, existing);
  await (auditValue(__audit6, auditEnter(__audit6, "commitScanMutation"), (commitScanMutation(db, [SCAN_STORE, ARCHIVE_SCAN_BINDING_STORE], async tx => { await tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).put(binding); }, [normalizedScan], [normalizedScan], { kinds: ["binding"] }))));
  return auditReturn(__audit6, binding);

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}

export async function findGuildHubLocalScanByArchiveBinding(entry: ScanArchiveEntry): Promise<GuildHubLocalScan | null> {
    const __audit7 = auditPhaseBegin("findGuildHubLocalScanByArchiveBinding", undefined, "async-container");
    try {
  const db = await (auditValue(__audit7, auditEnter(__audit7, "getLocalScanDb"), (getLocalScanDb())));
  const binding = await (auditValue(__audit7, auditEnter(__audit7, "db.get"), (db.get(ARCHIVE_SCAN_BINDING_STORE, archiveBindingKey(entry.id, entry.sha256)))));
  if (!binding) return auditReturn(__audit7, null);
  if (!archiveBindingMatchesEntry(binding, entry)) {
    await (auditValue(__audit7, auditEnter(__audit7, "cleanupArchiveBinding"), (cleanupArchiveBinding(db, binding))));
    return auditReturn(__audit7, null);
  }
  const scan = await (auditValue(__audit7, auditEnter(__audit7, "db.get"), (db.get(SCAN_STORE, binding.localScanId))));
  if (!scan) {
    await (auditValue(__audit7, auditEnter(__audit7, "cleanupArchiveBinding"), (cleanupArchiveBinding(db, binding))));
    return auditReturn(__audit7, null);
  }
  const normalizedScan = await (auditValue(__audit7, auditEnter(__audit7, "persistScanNormalizationIfNeeded"), (persistScanNormalizationIfNeeded(db, scan))));
  if (!normalizedScan || normalizedScan.contentHash !== binding.localContentHash || !localScanMatchesArchiveEntry(normalizedScan, entry)) {
    await (auditValue(__audit7, auditEnter(__audit7, "cleanupArchiveBinding"), (cleanupArchiveBinding(db, binding))));
    return auditReturn(__audit7, null);
  }
  await (auditValue(__audit7, auditEnter(__audit7, "confirmGuildHubArchiveReadiness"), (confirmGuildHubArchiveReadiness([entry], { expectedBindings: [binding], scans: new Map([[normalizedScan.id, normalizedScan]]) }))));
  return auditReturn(__audit7, normalizedScan);

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
}

export async function deleteGuildHubArchiveScanBinding(archiveScanId: string, archiveSha256: string) {
  const db = await getLocalScanDb();
  let binding: GuildHubArchiveScanBinding | undefined;
  await commitLocalDataMutation(db, [ARCHIVE_SCAN_BINDING_STORE], () => binding ? {
    owner: "sources", kinds: ["binding"], sourceIds: [binding.localScanId], removedSourceIds: [], servers: [binding.server], unknownImpact: !binding.server,
  } : null, async tx => {
    const store = tx.objectStore(ARCHIVE_SCAN_BINDING_STORE);
    const key = archiveBindingKey(archiveScanId, archiveSha256);
    binding = await store.get(key);
    if (binding) await store.delete(key);
  });
}

export async function listGuildHubArchiveScanBindings() {
  const db = await getLocalScanDb();
  return db.getAll(ARCHIVE_SCAN_BINDING_STORE);
}

async function readScanContentHashKeys(store: IDBPObjectStore<LocalScanDb, LocalDataVersionStore[], typeof SCAN_STORE, "readonly">) {
    const __audit8 = auditPhaseBegin("readScanContentHashKeys", undefined, "async-container");
    try {
  const hashes = new Map<string, string>();
  if (!store?.indexNames.contains("by_contentHash")) return auditReturn(__audit8, hashes);
  // Index cursor.key is the Raw record's contentHash; primaryKey is its source ID.
  // A key cursor cannot expose/clone the stored Raw payload.
  let cursor = await (auditValue(__audit8, auditEnter(__audit8, "store.index(\"by_contentHash\").openKeyCursor"), (store.index("by_contentHash").openKeyCursor())));
  while (cursor) {
    if (typeof cursor.key === "string") hashes.set(String(cursor.primaryKey), cursor.key);
    cursor = await (auditValue(__audit8, auditEnter(__audit8, "cursor.continue"), (cursor.continue())));
  }
  return auditReturn(__audit8, hashes);

    } catch (__auditError) { auditError(__audit8, __auditError); throw __auditError; }
    finally { auditLeave(__audit8); }
}

/** Entity inventory validation, not a Raw generation/analytics certificate.
 * The independently read Raw hash and current derivation contracts establish
 * content identity. Summary generation alone never certifies the live Raw. */
export function isGuildHubFavoriteScanSummaryCurrent(summary: GuildHubScanSummary, rawContentHash: string | undefined) {
  return Boolean(rawContentHash && summary.contentHash === rawContentHash &&
    hasCurrentLocalSourceValidity(summary) &&
    Array.isArray(summary.servers) && summary.servers.every(server => typeof server === "string") &&
    Array.isArray(summary.guilds) && summary.guilds.every(guild => isRecord(guild) && typeof guild.server === "string") &&
    Number.isSafeInteger(summary.playerCount) && summary.playerCount >= 0 &&
    Number.isSafeInteger(summary.guildCount) && summary.guildCount >= 0 &&
    isRecord(summary.guildCoverage) && Array.isArray(summary.fusionInventorySlices) &&
    summary.fusionInventorySlices.every(slice => isRecord(slice) && typeof slice.server === "string" &&
      slice.sourceScanId === summary.sourceScanId && Number.isSafeInteger(slice.playerCount) && slice.playerCount >= 0 &&
      (slice.playerIdentifiers === undefined || Array.isArray(slice.playerIdentifiers) && slice.playerIdentifiers.every(id => typeof id === "string")) &&
      (slice.guildIdentifiers === undefined || Array.isArray(slice.guildIdentifiers) && slice.guildIdentifiers.every(id => typeof id === "string"))) &&
    isCurrentGuildHubScanSummary(summary));
}

/** Atomic metadata snapshot. No backfill, normalization, Rawpool read or Analytics.
 * Summaries are a projection owned by the same Raw transaction. Missing summaries
 * are explicitly incomplete; orphan summaries never prove an existing source.
 * Optional content evidence uses existing index keys, never Raw values. */
export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) {
    const __audit9 = auditBegin("S06", "readDataHubLocalScanMetadata");
    try {
  const db = await (auditValue(__audit9, auditEnter(__audit9, "getLocalScanDbWithoutMigration"), (getLocalScanDbWithoutMigration())));
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE, ARCHIVE_SCAN_BINDING_STORE, METADATA_STORE]);
  void tx.done.catch(() => {});
  const [keys, summaries, bindings, migration, sourceContentHashes] = await (auditValue(__audit9, auditEnter(__audit9, "Promise.all"), (Promise.all([
    tx.objectStore(SCAN_STORE).getAllKeys(), tx.objectStore(SCAN_SUMMARY_STORE).getAll(),
    tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).getAll(), tx.objectStore(METADATA_STORE).get(GUILD_HUB_SCANS_MIGRATION_KEY),
    options.includeContentHashes ? readScanContentHashKeys(tx.objectStore(SCAN_STORE)) : undefined,
  ]))));
  await (auditValue(__audit9, auditEnter(__audit9, "tx.done"), (tx.done)));
  let migrationComplete = isCompletedMigrationMarker(migration);
  if (!migrationComplete) {
    const legacy = await (auditValue(__audit9, auditEnter(__audit9, "getGuildHubStateDb"), (getGuildHubStateDb())));
    migrationComplete = !legacy.objectStoreNames.contains(SCAN_STORE) || (await (auditValue(__audit9, auditEnter(__audit9, "legacy.getAllKeys"), (legacy.getAllKeys(SCAN_STORE))))).length === 0;
  }
  const sourceIds = keys.map(String), ids = new Set(sourceIds);
  const presentSummaries = summaries.filter(summary => ids.has(summary.sourceScanId));
  return auditReturn(__audit9, { sourceIds, summaries: presentSummaries, bindings, migrationComplete,
    ...(sourceContentHashes ? { sourceContentHashes } : {}),
    metadataComplete: migrationComplete && presentSummaries.length === sourceIds.length });

    } catch (__auditError) { auditError(__audit9, __auditError); throw __auditError; }
    finally { auditLeave(__audit9); }
}

/** Only explicitly bound candidates. One Raw read/normalization per source in a
 * batch, payloads released when the batch resolves. No acquisition or Analytics.
 * The guarded certificate write checks both source validity and binding identity
 * in the very same W-04 transaction, so Unbind cannot be undone by a late proof. */
type ArchiveReadinessOptions = {
  signal?: AbortSignal; expectedBindings?: readonly GuildHubArchiveScanBinding[]; scans?: Map<string, GuildHubLocalScan>;
};
const readinessInFlight = new Map<string, {
  promise: Promise<Awaited<ReturnType<typeof performGuildHubArchiveReadiness>>>;
  abort: AbortController; consumers: number;
}>();
export async function confirmGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) {
  if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
  const db = await getLocalScanDbWithoutMigration();
  const bindings = options.expectedBindings ?? await db.getAll(ARCHIVE_SCAN_BINDING_STORE);
  const keys = new Set(entries.map(entry => archiveBindingKey(entry.id, entry.sha256)));
  const relevant = bindings.filter(binding => keys.has(binding.key));
  const key = JSON.stringify([entries.map(archiveExpectation).sort(), relevant.map(binding => JSON.stringify(binding)).sort()]);
  let shared = readinessInFlight.get(key);
  if (!shared) {
    const abort = new AbortController();
    const promise = performGuildHubArchiveReadiness(entries, { ...options, signal: abort.signal, expectedBindings: relevant })
      .finally(() => { if (readinessInFlight.get(key)?.promise === promise) readinessInFlight.delete(key); });
    shared = { promise, abort, consumers: 0 }; readinessInFlight.set(key, shared);
  }
  const job = shared;
  job.consumers++;
  return new Promise<Awaited<ReturnType<typeof performGuildHubArchiveReadiness>>>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true; options.signal?.removeEventListener("abort", cancelled);
      job.consumers--;
      if (!job.consumers) { job.abort.abort(); if (readinessInFlight.get(key) === job) readinessInFlight.delete(key); }
      return true;
    };
    const cancelled = () => { if (finish()) reject(new DOMException("aborted", "AbortError")); };
    options.signal?.addEventListener("abort", cancelled, { once: true });
    if (options.signal?.aborted) cancelled();
    job.promise.then(result => { if (finish()) resolve(result); }, error => { if (finish()) reject(error); });
  });
}
async function performGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) {
  const db = await getLocalScanDbWithoutMigration();
  const bindings = options.expectedBindings ?? await db.getAll(ARCHIVE_SCAN_BINDING_STORE);
  const byKey = new Map(bindings.map(binding => [binding.key, binding]));
  const groups = new Map<string, Array<{ entry: ScanArchiveEntry; binding: GuildHubArchiveScanBinding }>>();
  const seen = new Set<string>();
  for (const entry of entries) {
    const expectation = archiveExpectation(entry);
    if (seen.has(expectation)) continue;
    seen.add(expectation);
    const binding = byKey.get(archiveBindingKey(entry.id, entry.sha256));
    if (!binding) continue;
    const group = groups.get(binding.localScanId) ?? [];
    group.push({ entry, binding }); groups.set(binding.localScanId, group);
  }
  const confirmed: string[] = [], failed: string[] = [];
  let rawReads = 0, payloadValidations = 0, normalizationWrites = 0;
  const pending = [...groups.entries()]; let next = 0;
  const checkAbort = () => { if (options.signal?.aborted) throw new DOMException("aborted", "AbortError"); };
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
    while (next < pending.length) {
      checkAbort();
      const [id, group] = pending[next++];
      let scan = options.scans?.get(id);
      if (!scan) { rawReads++; scan = await db.get(SCAN_STORE, id); }
      checkAbort();
      if (!scan) { failed.push(...group.map(item => item.entry.id)); continue; }
      const before = scan;
      const normalized = await persistScanNormalizationIfNeeded(db, scan);
      if (!normalized) { failed.push(...group.map(item => item.entry.id)); continue; }
      scan = normalized;
      if (scan !== before) normalizationWrites++;
      for (const { entry, binding } of group) {
        checkAbort();
        if (scan.contentHash !== binding.localContentHash) { failed.push(entry.id); continue; }
        payloadValidations++;
        if (!localScanMatchesArchiveEntry(scan, entry)) { failed.push(entry.id); continue; }
        const certificate = createArchiveBindingFromEntry(entry, scan, binding);
        let saved = false;
        let changed = false;
        await commitLocalDataMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE, ARCHIVE_SCAN_BINDING_STORE], () => changed ?
          scanMutationChange([], [scan!], { kinds: ["readiness"] }) : null, async tx => {
          checkAbort();
          const [rawKey, summary] = await Promise.all([
            tx.objectStore(SCAN_STORE).getKey(scan!.id), tx.objectStore(SCAN_SUMMARY_STORE).get(scan!.id),
          ]);
          if (rawKey === undefined || !summary || summary.contentHash !== scan!.contentHash || !matchesLocalSourceValidity(summary, scan)) {
            throw new Error(`Source changed before readiness commit: ${scan!.id}`);
          }
          const latest = await tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).get(binding.key);
          if (!latest || JSON.stringify(latest) !== JSON.stringify(binding)) return false;
          // Avoid refresh loops and journal churn for identical warm proofs.
          if (JSON.stringify(latest.readiness && { ...latest.readiness, checkedAt: "" }) ===
              JSON.stringify({ ...certificate.readiness, checkedAt: "" })) { saved = true; return false; }
          await tx.objectStore(ARCHIVE_SCAN_BINDING_STORE).put(certificate);
          saved = true; changed = true;
        });
        if (saved) confirmed.push(entry.id); else failed.push(entry.id);
      }
    }
  }));
  return { confirmed, failed, rawReads, payloadValidations, normalizationWrites };
}

export async function getGuildHubArchiveSearchIndexCache(entry: ScanArchiveEntry) {
  if (!entry.searchIndex) return null;
  const db = await getLocalScanDbWithoutMigration();
  const key = archiveSearchIndexCacheKey(entry.id, entry.searchIndex.sha256);
  const record = await db.get(ARCHIVE_SEARCH_INDEX_STORE, key);
  if (!record) return null;
  if (!archiveSearchIndexRecordMatchesEntry(record, entry)) {
    await commitScanMutation(db, [ARCHIVE_SEARCH_INDEX_STORE], async tx => { await tx.objectStore(ARCHIVE_SEARCH_INDEX_STORE).delete(key); }, [], [], { owner: "archive-index", kinds: ["derived"], unknownImpact: true });
    return null;
  }
  try {
    validateScanArchiveSearchIndexPayload(record.payload, entry);
    return record;
  } catch {
    await commitScanMutation(db, [ARCHIVE_SEARCH_INDEX_STORE], async tx => { await tx.objectStore(ARCHIVE_SEARCH_INDEX_STORE).delete(key); }, [], [], { owner: "archive-index", kinds: ["derived"], unknownImpact: true });
    return null;
  }
}

export async function putGuildHubArchiveSearchIndexCache(
  entry: ScanArchiveEntry,
  payload: ScanArchiveSearchIndexPayload,
) {
  if (!entry.searchIndex) throw new Error(`Archivscan ${entry.id} hat keinen Suchindex.`);
  const db = await getLocalScanDbWithoutMigration();
  const validated = validateScanArchiveSearchIndexPayload(payload, entry);
  const key = archiveSearchIndexCacheKey(entry.id, entry.searchIndex.sha256);
  const existing = await db.get(ARCHIVE_SEARCH_INDEX_STORE, key);
  const record = createArchiveSearchIndexRecordFromEntry(entry, validated, existing);
  await commitScanMutation(db, [ARCHIVE_SEARCH_INDEX_STORE], async tx => { await tx.objectStore(ARCHIVE_SEARCH_INDEX_STORE).put(record); }, [], [], { owner: "archive-index", kinds: ["derived"], servers: [record.server] });
  return record;
}

export async function deleteGuildHubArchiveSearchIndexCache(archiveScanId: string, searchIndexSha256: string) {
  const db = await getLocalScanDbWithoutMigration();
  await commitScanMutation(db, [ARCHIVE_SEARCH_INDEX_STORE], async tx => { await tx.objectStore(ARCHIVE_SEARCH_INDEX_STORE).delete(archiveSearchIndexCacheKey(archiveScanId, searchIndexSha256)); }, [], [], { owner: "archive-index", kinds: ["reset"], unknownImpact: true });
}

export async function listGuildHubArchiveSearchIndexCacheRecords() {
  const db = await getLocalScanDb();
  return db.getAll(ARCHIVE_SEARCH_INDEX_STORE);
}

export async function getGuildHubLocalToplistSnapshotRecord(cacheKey: string) {
  const key = cacheKey.trim();
  if (!key) return null;
  const db = await getLocalScanDb();
  return (await db.get(LOCAL_TOPLIST_SNAPSHOT_STORE, key)) ?? null;
}

export async function putGuildHubLocalToplistSnapshotRecord(record: GuildHubLocalToplistSnapshotRecord, options: { lease?: LocalDataWriteLease; resetGeneration: string; dependencies: LocalDependencyReceipt }) {
  if (!options?.dependencies || typeof options.resetGeneration !== "string") throw new Error("Toplist writes require captured dependency and reset certificates.");
  if (!options.dependencies.need.allSources && !options.dependencies.need.sourceIds?.includes(record.localScanId)) throw new Error("Toplist dependency certificate does not cover its source.");
  const db = await getLocalScanDb();
  return withLocalDataWrite(async lease => {
    const existing = await db.get(LOCAL_TOPLIST_SNAPSHOT_STORE, record.key);
    const now = new Date().toISOString();
    const next: GuildHubLocalToplistSnapshotRecord = {
      ...record,
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now,
    };
    const live = (await readGuildHubLocalScanSourceValidity([next.localScanId])).get(next.localScanId);
    if (!live || !hasCurrentLocalSourceValidity(next) || !matchesLocalSourceValidity(next, live) || live.contentHash !== next.localContentHash) throw new Error("Toplist source changed before cache commit.");
    if (!(await revalidateLocalDataDependencies(options.dependencies)).current) throw new Error("Toplist source dependencies changed before cache commit.");
    if (await readLocalToplistResetGeneration(next.localScanId) !== options.resetGeneration) throw new Error("Toplist reset changed before cache commit.");
    await commitScanMutation(db, [LOCAL_TOPLIST_SNAPSHOT_STORE], async tx => { await tx.objectStore(LOCAL_TOPLIST_SNAPSHOT_STORE).put(next); }, [], [], { owner: "toplists", kinds: ["derived"], sourceIds: [next.localScanId], servers: [next.server] }, lease);
    return next;
  }, { lease: options.lease });
}

export async function deleteGuildHubLocalToplistSnapshotRecord(cacheKey: string) {
  const key = cacheKey.trim();
  if (!key) return;
  const db = await getLocalScanDb();
  await commitScanMutation(db, [LOCAL_TOPLIST_SNAPSHOT_STORE], async tx => { await tx.objectStore(LOCAL_TOPLIST_SNAPSHOT_STORE).delete(key); }, [], [], { owner: "toplists", kinds: ["reset"], unknownImpact: true });
}

export async function listGuildHubLocalToplistSnapshotRecords() {
  const db = await getLocalScanDb();
  return db.getAll(LOCAL_TOPLIST_SNAPSHOT_STORE);
}

export async function deleteGuildHubLocalToplistSnapshotRecordsForLocalScanIds(localScanIds: readonly string[]) {
  const ids = [...new Set(localScanIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return;
  const db = await getLocalScanDb();
  await commitScanMutation(db, [LOCAL_TOPLIST_SNAPSHOT_STORE], async tx => {
    const store = tx.objectStore(LOCAL_TOPLIST_SNAPSHOT_STORE);
    const index = store.index("by_localScanId");
    const keys = (await Promise.all(ids.map((id) => index.getAllKeys(id)))).flat();
    await Promise.all(keys.map((key) => store.delete(key)));
  }, [], [], { owner: "toplists", kinds: ["reset"], sourceIds: ids });
}

async function attachArchiveBindingsToSummaries(
  db: IDBPDatabase<LocalScanDb>,
  summaries: readonly GuildHubScanSummary[],
) {
  const bindings = await db.getAll(ARCHIVE_SCAN_BINDING_STORE);
  if (!bindings.length) return [...summaries];
  const bindingsByLocalScanId = new Map<string, GuildHubArchiveScanBinding[]>();
  bindings.forEach((binding) => {
    const group = bindingsByLocalScanId.get(binding.localScanId);
    if (group) group.push(binding);
    else bindingsByLocalScanId.set(binding.localScanId, [binding]);
  });
  return summaries.map((summary) => {
    const matching = (bindingsByLocalScanId.get(summary.sourceScanId) ?? []).filter(
      (binding) => binding.localContentHash === summary.contentHash,
    );
    if (!matching.length) return summary;
    return {
      ...summary,
      archiveBindings: matching.sort((left, right) => left.archiveScanId.localeCompare(right.archiveScanId)),
    };
  });
}

export async function findGuildHubLocalScanByArchiveScanId(archiveScanId: string) {
    const __audit10 = auditPhaseBegin("findGuildHubLocalScanByArchiveScanId", undefined, "async-container");
    try {
  const normalizedArchiveScanId = archiveScanId.trim();
  if (!normalizedArchiveScanId) return auditReturn(__audit10, null);
  const db = await (auditValue(__audit10, auditEnter(__audit10, "getLocalScanDb"), (getLocalScanDb())));
  // Read metadata directly: the public summary reader can repair/backfill Raw.
  // Keep candidate discovery and authoritative selection in one IDB snapshot.
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE]);
  const scanStore = tx.objectStore(SCAN_STORE);
  const summaries = await (auditValue(__audit10, auditEnter(__audit10, "tx.objectStore(SCAN_SUMMARY_STORE).getAll"), (tx.objectStore(SCAN_SUMMARY_STORE).getAll())));
  // Both stores use the source scan ID as primary key. getAll preserves IDB
  // key order (not locale/numeric sorting), just like the former Raw getAll.
  auditCount(__audit10, "lookupSummaryReadCalls"); auditCount(__audit10, "lookupSummaryRows", summaries.length);
  const candidate = summaries.find((summary) => summary.archiveSource?.archiveScanId === normalizedArchiveScanId);
  auditEvent(__audit10, candidate ? "summary-candidate-present" : "no-summary-candidate");
  const rawCandidate = candidate ? await (auditValue(__audit10, auditEnter(__audit10, "scanStore.get"), (scanStore.get(candidate.sourceScanId)))) : undefined;
  if (candidate) auditCount(__audit10, "candidateRawReadCalls");
  auditEvent(__audit10, !candidate ? "no-metadata-candidate" : !rawCandidate ? "candidate-raw-missing" : rawCandidate.archiveSource?.archiveScanId === normalizedArchiveScanId ? "candidate-raw-verified" : "candidate-raw-mismatch");
  let match: GuildHubLocalScan | null;
  if (rawCandidate?.archiveSource?.archiveScanId === normalizedArchiveScanId) {
    // Summary freshness/coverage cannot prove that an earlier Raw has no such
    // archive ID. Check that prefix even when its summaries look current.
    // Later keys cannot change the first-match result and need no Raw reads.
    const earlierKeys = await (auditValue(__audit10, auditEnter(__audit10, "scanStore.getAllKeys"), (scanStore.getAllKeys(IDBKeyRange.upperBound(rawCandidate.id, true)))));
    auditCount(__audit10, "prefixKeys", earlierKeys.length);
    match = rawCandidate;
    // Release each nonmatching payload rather than retaining a Raw inventory,
    // even when the metadata candidate happens to be the final primary key.
    for (const key of earlierKeys) {
      auditCount(__audit10, "prefixRawReadCalls");
      const earlierScan = await (auditValue(__audit10, auditEnter(__audit10, "scanStore.get"), (scanStore.get(key))));
      if (earlierScan?.archiveSource?.archiveScanId === normalizedArchiveScanId) {
        match = earlierScan;
        break;
      }
    }
  } else {
    // No negative metadata cache: missing, orphaned or stale summaries never
    // hide a Raw, including immediately after an import or a competing write.
    if (__audit10) auditEvent(__audit10, "raw-fallback", { reason: !candidate ? "no-metadata-candidate" : !rawCandidate ? "candidate-raw-missing" : "candidate-raw-mismatch" });
    const scans = await (auditValue(__audit10, auditEnter(__audit10, "scanStore.getAll"), (scanStore.getAll())));
    auditCount(__audit10, "fullRawReadCalls"); auditCount(__audit10, "fullRawReturnedRows", scans.length);
    match = scans.find((scan) => scan.archiveSource?.archiveScanId === normalizedArchiveScanId) ?? null;
  }
  await (auditValue(__audit10, auditEnter(__audit10, "tx.done"), (tx.done)));
  auditEvent(__audit10, match ? "raw-found" : "raw-authoritatively-missing");
  return auditReturn(__audit10, match ? persistScanNormalizationIfNeeded(db, match) : null);

    } catch (__auditError) { auditError(__audit10, __auditError); throw __auditError; }
    finally { auditLeave(__audit10); }
}

async function materializeGuildAnalyticsScan(scan: GuildHubLocalScan, options?: GuildAnalyticsMaterializeOptions) {
    const __audit11 = auditPhaseBegin("materializeGuildAnalyticsScan", undefined, "async-container");
    try {
  if (!isGuildHubScanAnalyticsEnabled(scan)) return auditReturn(__audit11, undefined);
  const { materializeGuildAnalyticsSource } = await (auditValue(__audit11, auditEnter(__audit11, "import"), (import("./localGuildAnalyticsStore"))));
  await (auditValue(__audit11, auditEnter(__audit11, "materializeGuildAnalyticsSource"), (materializeGuildAnalyticsSource(scan, options))));

    } catch (__auditError) { auditError(__audit11, __auditError); throw __auditError; }
    finally { auditLeave(__audit11); }
}

async function deleteGuildAnalyticsSources(ids: string[], lease?: LocalDataWriteLease) {
  const { deleteGuildAnalyticsDerivedSources } = await import("./localGuildAnalyticsStore");
  await deleteGuildAnalyticsDerivedSources(ids, lease);
}

function normalizeScanSlotDisplayName(displayName: string | undefined) {
  const normalized = (displayName ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Scan-Slot-Name darf nicht leer sein.");
  return normalized;
}

async function removeGuildHubLocalScanRecords(ids: string[], lease?: LocalDataWriteLease) {
  if (!ids.length) return;

  const db = await getLocalScanDb();
  const before = (await Promise.all(ids.map(id => db.get(SCAN_STORE, id)))).filter((scan): scan is GuildHubLocalScan => Boolean(scan));
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE, ARCHIVE_SCAN_BINDING_STORE, LOCAL_TOPLIST_SNAPSHOT_STORE, METADATA_STORE], async tx => {
    const scanStore = tx.objectStore(SCAN_STORE);
    const summaryStore = tx.objectStore(SCAN_SUMMARY_STORE);
    const bindingStore = tx.objectStore(ARCHIVE_SCAN_BINDING_STORE);
    const toplistStore = tx.objectStore(LOCAL_TOPLIST_SNAPSHOT_STORE);
    const bindingIndex = bindingStore.index("by_localScanId");
    const toplistIndex = toplistStore.index("by_localScanId");
    const bindingKeys = (await Promise.all(ids.map((id) => bindingIndex.getAllKeys(id)))).flat();
    const toplistKeys = (await Promise.all(ids.map((id) => toplistIndex.getAllKeys(id)))).flat();
    await Promise.all([
      ...ids.flatMap((id) => [scanStore.delete(id), summaryStore.delete(id), tx.objectStore(METADATA_STORE).delete(HUB_SEARCH_KEY_PREFIX + id)]),
      ...bindingKeys.map((key) => bindingStore.delete(key)),
      ...toplistKeys.map((key) => toplistStore.delete(key)),
    ]);
  }, before, [], { sourceIds: ids, removedSourceIds: ids, kinds: ["content", "binding"], unknownImpact: before.some(scan => !scan.servers.length) }, lease);
  await deleteGuildAnalyticsSources(ids, lease);
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
    sourceGeneration: createScanId(),
    containedInScanSlotId: activeSlot.id,
    analyticsEnabled: false,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, containedSources);
  const slotSummary = createGuildHubScanSummary(activeSlot);
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
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
  }, [slot, ...sources], [activeSlot, ...containedSources], { kinds: ["release"] });
  return activeSlot;
}

async function restoreScanSlotSourcesAndRemoveTarget(targetId: string, sourceIds: string[]) {
  const db = await getLocalScanDb();
  const target = await db.get(SCAN_STORE, targetId);
  const sources = (await Promise.all(sourceIds.map((sourceId) => db.get(SCAN_STORE, sourceId)))).filter(
    (source): source is GuildHubLocalScan => Boolean(source),
  );
  if (sources.some(source => source.containedInScanSlotId && source.containedInScanSlotId !== targetId)) throw new Error("Scan-Slot-Recovery conflicts with another slot.");
  const restoredSources = sources.map((source) => ({
    ...source,
    sourceGeneration: createScanId(),
    containedInScanSlotId: null,
    analyticsEnabled: true,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, restoredSources);
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
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
  }, [...(target ? [target] : []), ...sources], restoredSources, { expectedAbsentIds: target ? [] : [targetId], sourceIds: [targetId, ...sourceIds], removedSourceIds: [targetId], kinds: ["release"], unknownImpact: true });
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
  archiveSource,
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
  archiveSource?: ScanArchiveSourceMetadata;
}): GuildHubLocalScan {
  const normalizedPlayers = normalizeGuildScanMembers(raw);
  const servers = extractServers(raw);
  const guildCount = countScanGuilds(raw, normalizedPlayers);

  const scan: GuildHubLocalScan = {
    id,
    sourceGeneration: createScanId(),
    coreNormalizerVersion: LOCAL_SCAN_CORE_NORMALIZER_VERSION,
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
    ...(archiveSource ? { archiveSource } : {}),
  };

  return scan;
}

export async function listGuildHubLocalScans() {
    const __audit12 = auditBegin("S06", "listGuildHubLocalScans");
    try {
  const db = await (auditValue(__audit12, auditEnter(__audit12, "getLocalScanDb"), (getLocalScanDb())));
  const scans = await (auditValue(__audit12, auditEnter(__audit12, "db.getAll"), (db.getAll(SCAN_STORE))));
  const normalizedScans = await (auditValue(__audit12, auditEnter(__audit12, "Promise.all"), (Promise.all(scans.map((scan) => persistScanNormalizationIfNeeded(db, scan))))));
  return auditReturn(__audit12, normalizedScans.filter((scan): scan is GuildHubLocalScan => scan !== null).sort(compareScans));

    } catch (__auditError) { auditError(__audit12, __auditError); throw __auditError; }
    finally { auditLeave(__audit12); }
}

export async function listGuildHubLocalScansReadOnly() {
    const __audit13 = auditBegin("S06", "listGuildHubLocalScansReadOnly");
    try {
  const db = await (auditValue(__audit13, auditEnter(__audit13, "getLocalScanDbWithoutMigration"), (getLocalScanDbWithoutMigration())));
  const scans = await (auditValue(__audit13, auditEnter(__audit13, "db.getAll"), (db.getAll(SCAN_STORE))));
  return auditReturn(__audit13, scans.map(normalizeGuildHubLocalScanForDerivation).sort(compareScans));

    } catch (__auditError) { auditError(__audit13, __auditError); throw __auditError; }
    finally { auditLeave(__audit13); }
}

/** Complete local source inventory, without raw normalization or legacy migration.
 * A pending legacy migration is incomplete inventory and cannot authorize deletion.
 * Summaries supply policy candidates only; raw records confirm explicit exclusion.
 */
export async function readGuildHubLocalScanSourceInventory(): Promise<{
  sourceIds: string[];
  analyticsDisabledSourceIds: string[];
}> {
  const db = await getLocalScanDbWithoutMigration();
  const tx = db.transaction([SCAN_STORE, SCAN_SUMMARY_STORE, METADATA_STORE]);
  // Consume transaction failure even when a request rejects before awaiting tx.done.
  void tx.done.catch(() => {});
  const [keys, summaries, migration] = await Promise.all([
    Promise.resolve().then(() => tx.objectStore(SCAN_STORE).getAllKeys()),
    Promise.resolve().then(() => tx.objectStore(SCAN_SUMMARY_STORE).getAll()),
    Promise.resolve().then(() => tx.objectStore(METADATA_STORE).get(GUILD_HUB_SCANS_MIGRATION_KEY)),
  ]);
  if (!isCompletedMigrationMarker(migration)) {
    await tx.done;
    throw new Error("Local source inventory is incomplete: legacy scan migration is pending.");
  }
  const sourceIds = keys.map(String);
  const sourceIdSet = new Set(sourceIds);
  const disabledCandidates = summaries.filter(
    (summary) => sourceIdSet.has(summary.sourceScanId) && summary.analyticsEnabled === false,
  );
  // Only policy candidates need a raw read; existence uses keys, never all payloads.
  const candidates = await Promise.all(disabledCandidates.map(
    async (summary) => tx.objectStore(SCAN_STORE).get(summary.sourceScanId),
  ));
  await tx.done;
  return {
    sourceIds,
    analyticsDisabledSourceIds: candidates.filter(
      (scan): scan is GuildHubLocalScan => Boolean(scan) && scan?.analyticsEnabled === false,
    ).map((scan) => scan.id),
  };
}

/** Cold search preparation deliberately bypasses full source normalization. */
export async function readGuildHubLocalScanForSearch(id: string) {
  return (await (await getLocalScanDbWithoutMigration()).get(SCAN_STORE, id)) ?? null;
}
export async function readHubSearchArchiveMetadata(key: string): Promise<unknown> {
  return (await (await getLocalScanDbWithoutMigration()).get(METADATA_STORE, "hub-search:archive-scope:" + key))?.value;
}
export async function putHubSearchArchiveMetadata(key: string, value: unknown) {
  const db = await getLocalScanDbWithoutMigration();
  await commitLocalDataMutation(db, [METADATA_STORE], { owner: "hub-search", kinds: ["derived"], sourceIds: [], removedSourceIds: [], servers: [], unknownImpact: false }, async tx => {
    await tx.objectStore(METADATA_STORE).put({ key: "hub-search:archive-scope:" + key, value, updatedAt: new Date().toISOString() });
  });
}
export async function readHubSearchProjectionInventory() {
  const db = await getLocalScanDbWithoutMigration();
  const tx = db.transaction([METADATA_STORE, "localChanges"]);
  const [records, changes] = await Promise.all([tx.objectStore(METADATA_STORE).getAll(), tx.objectStore("localChanges").getAll()]);
  const resets = changes.filter(c => c.kinds.includes("reset"));
  await tx.done;
  return { sourceChanges: changes.filter(c => c.owner === "sources"), projections: new Map(records.filter(r => r.key.startsWith(HUB_SEARCH_KEY_PREFIX)).map(r => [r.key.slice(HUB_SEARCH_KEY_PREFIX.length), r.value as HubSearchProjection])),
    resetFor: (source: string) => JSON.stringify(resets.filter(c => c.owner === "hub-search" && (!c.sourceIds.length || c.sourceIds.includes(source))).map(c => c.sequence)) };
}
export async function putHubSearchProjection(projection: HubSearchProjection, options: HubSearchExecutionOptions = {}) {
  checkHubSearchExecution(options);
  const db = await getLocalScanDbWithoutMigration();
  return commitLocalDataMutation(db, [SCAN_STORE, METADATA_STORE], { owner: "hub-search", kinds: ["derived"], sourceIds: [projection.source], removedSourceIds: [], servers: [], unknownImpact: false }, async tx => {
    checkHubSearchExecution(options);
    const source = await tx.objectStore(SCAN_STORE).get(projection.source);
    const resets = await tx.objectStore("localChanges").index("by_kind").getAll("reset");
    const reset = JSON.stringify(resets.filter(c => c.owner === "hub-search" && (!c.sourceIds.length || c.sourceIds.includes(projection.source))).map(c => c.sequence));
    if (!source || hubSearchFingerprint(source) !== projection.fingerprint || reset !== projection.reset || projection.version !== HUB_SEARCH_PROJECTION_VERSION ||
      projection.parserVersion !== HUB_SEARCH_PARSER_VERSION || projection.normalizerVersion !== GUILD_SCAN_NORMALIZER_VERSION || projection.coreVersion !== LOCAL_SCAN_CORE_NORMALIZER_VERSION) throw new Error("Search source changed before commit");
    const sourceChanges = (await tx.objectStore("localChanges").getAll()).filter(c => c.owner === "sources");
    projection.sourceSequence = sourceChanges[sourceChanges.length - 1]?.sequence ?? 0;
    // Payload and complete/version evidence are a single atomic metadata value.
    checkHubSearchExecution(options);
    await tx.objectStore(METADATA_STORE).put({ key: HUB_SEARCH_KEY_PREFIX + projection.source, value: projection, updatedAt: new Date().toISOString() });
  });
}
export async function resetHubSearchProjections(sourceIds: readonly string[] = []) {
  const db = await getLocalScanDbWithoutMigration();
  await commitLocalDataMutation(db, [METADATA_STORE], { owner: "hub-search", kinds: ["reset"], sourceIds: [...sourceIds], removedSourceIds: [], servers: [], unknownImpact: !sourceIds.length }, async tx => {
    const keys = sourceIds.length ? sourceIds.map(id => HUB_SEARCH_KEY_PREFIX + id) : (await tx.objectStore(METADATA_STORE).getAllKeys()).filter(key => String(key).startsWith(HUB_SEARCH_KEY_PREFIX));
    await Promise.all(keys.map(key => tx.objectStore(METADATA_STORE).delete(key)));
  });
}
async function prepareImportedHubSearch(scan: GuildHubLocalScan) {
    const __audit14 = auditPhaseBegin("prepareImportedHubSearch", undefined, "async-container");
    try {
  try {
    const inventory = await (auditValue(__audit14, auditEnter(__audit14, "readHubSearchProjectionInventory"), (readHubSearchProjectionInventory())));
    const projection = await (auditValue(__audit14, auditEnter(__audit14, "prepareGuildHubSearchProjection"), (prepareGuildHubSearchProjection(scan, inventory.resetFor(scan.id)))));
    await (auditValue(__audit14, auditEnter(__audit14, "putHubSearchProjection"), (putHubSearchProjection(projection))));
  } catch (error) { auditCaught(__audit14, error);
    // An optional derived index must never turn a saved Raw import into failure.
    console.warn("Local search preparation deferred", error);
  }

    } catch (__auditError) { auditError(__audit14, __auditError); throw __auditError; }
    finally { auditLeave(__audit14); }
}

export async function getGuildHubLocalScan(id: string) {
    const __audit15 = auditPhaseBegin("getGuildHubLocalScan", undefined, "async-container");
    try {
  const db = await (auditValue(__audit15, auditEnter(__audit15, "getLocalScanDb"), (getLocalScanDb())));
  const scan = await (auditValue(__audit15, auditEnter(__audit15, "db.get"), (db.get(SCAN_STORE, id))));
  return auditReturn(__audit15, scan ? persistScanNormalizationIfNeeded(db, scan) : null);

    } catch (__auditError) { auditError(__audit15, __auditError); throw __auditError; }
    finally { auditLeave(__audit15); }
}

export function isGuildHubScanAnalyticsEnabled(scan: Pick<GuildHubLocalScan, "analyticsEnabled">) {
  return scan.analyticsEnabled !== false;
}

export async function createGuildHubLocalScanImportPreview(
  filename: string,
  content: string,
  options: GuildHubLocalScanImportPreviewOptions = {},
): Promise<GuildHubLocalScan> {
    const __audit16 = auditPhaseBegin("createGuildHubLocalScanImportPreview", undefined, "async-container");
    try {
  const rawData = (auditValue(__audit16, auditEnter(__audit16, "JSON.parse", "sync-elapsed"), (JSON.parse(content))));
  const derivedGuildCoa = extractDerivedGuildCoaMetadata(rawData, content);
  const { raw, detectedType, parserName } = await (auditValue(__audit16, auditEnter(__audit16, "requireRawScan"), (requireRawScan(rawData))));
  const contentHash = await (auditValue(__audit16, auditEnter(__audit16, "sha256Hex"), (sha256Hex(content))));
  return auditReturn(__audit16, (auditValue(__audit16, auditEnter(__audit16, "buildLocalScanRecord", "sync-elapsed"), (buildLocalScanRecord({
    id: options.id ?? createScanId(),
    filename,
    contentHash,
    importedAt: new Date().toISOString(),
    rawData,
    derivedGuildCoa,
    raw,
    detectedType,
    parserName,
    archiveSource: options.archiveSource,
  })))));

    } catch (__auditError) { auditError(__audit16, __auditError); throw __auditError; }
    finally { auditLeave(__audit16); }
}

/** This named file-import API is personal. Generic previews/commits default to system. */
export async function importGuildHubLocalScan(filename: string, content: string): Promise<GuildHubImportScanResult> {
  const scan = await createGuildHubLocalScanImportPreview(filename, content);
  return commitGuildHubLocalScanPreview(scan, { personalSFToolsImport: true });
}

export async function commitGuildHubLocalScanPreview(
  scan: GuildHubLocalScan,
  options?: { personalSFToolsImport?: boolean; analytics?: GuildAnalyticsMaterializeOptions; onBeforeRawCommit?: () => void | Promise<void> },
): Promise<GuildHubImportScanResult> {
    const __audit17 = auditPhaseBegin("commitGuildHubLocalScanPreview", undefined, "async-container");
    try {
  const db = await (auditValue(__audit17, auditEnter(__audit17, "getLocalScanDb"), (getLocalScanDb())));
  const preexisting = await (auditValue(__audit17, auditEnter(__audit17, "findScanByHash"), (findScanByHash(scan.contentHash))));
  // The preview isn't persisted evidence. Commit establishes its new origin.
  scan = { ...(auditValue(__audit17, auditEnter(__audit17, "normalizeGuildHubLocalScanForDerivation", "sync-elapsed"), (normalizeGuildHubLocalScanForDerivation(scan)))), sourceGeneration: createScanId() };
  scan.provenance = createScanProvenance(scan);
  if (options?.personalSFToolsImport) scan.provenance = observePersonalScanImport(scan);
  const summary = preexisting ? undefined : createGuildHubScanSummary(
    scan, await deriveGuildHubLogicalScanSnapshotsCooperatively(scan),
  );
  if (!preexisting) await (auditValue(__audit17, auditEnter(__audit17, "options?.onBeforeRawCommit"), (options?.onBeforeRawCommit?.())));
  let committed = scan, duplicate = false, changed = false;
  await (auditValue(__audit17, auditEnter(__audit17, "commitLocalDataMutation"), (commitLocalDataMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], () => changed ?
    scanMutationChange([], [committed], { kinds: duplicate ? ["provenance"] : ["content", "provenance"] }) : null, async tx => {
    const store = tx.objectStore(SCAN_STORE);
    // Recheck under the existing writer lease/transaction. A stale preflight
    // duplicate can neither resurrect a delete nor annotate a changed source.
    const latest = await store.index("by_contentHash").get(scan.contentHash);
    if (latest) {
      duplicate = true;
      committed = latest;
      if (options?.personalSFToolsImport) {
        const provenance = observePersonalScanImport(latest);
        if (JSON.stringify(provenance) !== JSON.stringify(latest.provenance)) {
          committed = { ...latest, provenance };
          const oldSummary = await tx.objectStore(SCAN_SUMMARY_STORE).get(latest.id);
          await store.put(committed);
          await tx.objectStore(SCAN_SUMMARY_STORE).put(oldSummary ? applyScanMetadataToSummary(oldSummary, committed) : createGuildHubScanSummary(committed));
          changed = true;
        }
      }
      return;
    }
    await store.add(scan);
    await tx.objectStore(SCAN_SUMMARY_STORE).add(summary ?? createGuildHubScanSummary(scan));
    changed = true;
  }))));
  if (!duplicate) { await (auditValue(__audit17, auditEnter(__audit17, "prepareImportedHubSearch"), (prepareImportedHubSearch(committed)))); await (auditValue(__audit17, auditEnter(__audit17, "materializeGuildAnalyticsScan"), (materializeGuildAnalyticsScan(committed, options?.analytics)))); }
  return auditReturn(__audit17, { status: duplicate ? "duplicate" : "imported", scan: committed });

    } catch (__auditError) { auditError(__audit17, __auditError); throw __auditError; }
    finally { auditLeave(__audit17); }
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

  bundle.provenance = { ...createScanProvenance(bundle), originalSourceIds: existingSources
    .filter(source => readCompatibleScanProvenance(source)?.role === "original")
    .map(source => source.id) };
  const bundleSnapshots = deriveGuildHubLogicalScanSnapshots(bundle);
  options?.onProgress?.({
    phase: "Lokale Daten werden aktualisiert",
    processedSnapshots: bundleSnapshots.length,
    totalSnapshots: bundleSnapshots.length,
    processedMembers: bundle.playerCount,
    totalMembers: bundle.playerCount,
  });

  const summary = createGuildHubScanSummary(bundle);
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
    await Promise.all([tx.objectStore(SCAN_STORE).add(bundle), tx.objectStore(SCAN_SUMMARY_STORE).add(summary)]);
  }, existingSources, [bundle]);

  if (mode === "scan-slot") {
    try {
      const activeSlot = await activateGuildHubScanSlot(db, bundle, uniqueSourceIds, existingSources);
      await materializeGuildAnalyticsScan(activeSlot);
          return activeSlot;
    } catch (error) {
      await restoreScanSlotSourcesAndRemoveTarget(bundle.id, uniqueSourceIds);
      throw error;
    }
  }

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
  const prepared = scans.map(source => {
    const scan = normalizeGuildHubLocalScanForDerivation({ ...source, sourceGeneration: createScanId() });
    const provenance = readCompatibleScanProvenance(source);
    if (provenance) scan.provenance = provenance;
    else delete scan.provenance;
    return scan;
  });
  const imported: GuildHubLocalScan[] = [], duplicates: GuildHubLocalScan[] = [], touched: GuildHubLocalScan[] = [];
  await commitLocalDataMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], () => touched.length ?
    scanMutationChange([], touched, { kinds: imported.length ? ["content", "provenance"] : ["provenance"] }) : null, async tx => {
    const store = tx.objectStore(SCAN_STORE), summaries = tx.objectStore(SCAN_SUMMARY_STORE);
    const addedIds = new Set<string>();
    for (const incoming of prepared) {
      if (addedIds.has(incoming.id)) throw new Error(`Scan-ID ist mehrfach in der Transferdatei enthalten: ${incoming.id}`);
      const byId = await store.get(incoming.id);
      if (byId && byId.contentHash !== incoming.contentHash) throw new Error(`Scan-ID-Konflikt: ${incoming.id}`);
      const local = byId ?? await store.index("by_contentHash").get(incoming.contentHash);
      if (local) {
        const provenance = mergeTransferredScanProvenance(local, incoming);
        const next = provenance ? { ...local, provenance } : local;
        if (JSON.stringify(next.provenance) !== JSON.stringify(local.provenance)) {
          const oldSummary = await summaries.get(local.id);
          await store.put(next);
          await summaries.put(oldSummary ? applyScanMetadataToSummary(oldSummary, next) : createGuildHubScanSummary(next));
          touched.push(next);
        }
        duplicates.push(next);
      } else {
        await store.add(incoming);
        await summaries.add(createGuildHubScanSummary(incoming));
        imported.push(incoming); touched.push(incoming); addedIds.add(incoming.id);
      }
    }
  });
  for (const scan of imported) await prepareImportedHubSearch(scan);
  await Promise.all(imported.map(scan => materializeGuildAnalyticsScan(scan)));
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

  // Keep source role/containment. A user update of a synthetic slot is still
  // synthetic; it must not invent a new original. Archive bindings stay separate
  // and their generation/hash certificates expire on this update.
  scan.isMergedBundle = existing.isMergedBundle;
  scan.isScanSlot = existing.isScanSlot;
  scan.scanSlotStatus = existing.scanSlotStatus;
  scan.mergedSourceIds = existing.mergedSourceIds;
  scan.containedInScanSlotId = existing.containedInScanSlotId;
  scan.analyticsEnabled = existing.analyticsEnabled;
  scan.displayName = existing.displayName;
  if (contentHash === existing.contentHash) {
    scan.provenance = readCompatibleScanProvenance(existing);
    scan.archiveSource = existing.archiveSource;
  }
  const previousProvenance = readCompatibleScanProvenance(existing);
  scan.provenance ??= { ...createScanProvenance(scan, previousProvenance?.history ?? "unknown"),
    ...(previousProvenance?.originalSourceIds ? { originalSourceIds: previousProvenance.originalSourceIds } : {}) };
  scan.provenance = observePersonalScanImport(scan);
  const summary = createGuildHubScanSummary(scan);
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
    await Promise.all([tx.objectStore(SCAN_STORE).put(scan), tx.objectStore(SCAN_SUMMARY_STORE).put(summary)]);
  }, [existing], [scan]);
  await prepareImportedHubSearch(scan);
  await materializeGuildAnalyticsScan(scan);
  return scan;
}

export async function renameGuildHubScanSlot(id: string, displayName: string): Promise<GuildHubLocalScan> {
  const normalizedDisplayName = normalizeScanSlotDisplayName(displayName);
  const db = await getLocalScanDb();
  const existing = await db.get(SCAN_STORE, id);
  if (!existing?.isScanSlot) throw new Error("Scan-Slot wurde nicht gefunden.");

  const renamed: GuildHubLocalScan = {
    ...existing,
    sourceGeneration: createScanId(),
    displayName: normalizedDisplayName,
  };
  const existingSummary = await db.get(SCAN_SUMMARY_STORE, id);
  if (!existingSummary) throw new Error("Scan-Slot-Summary wurde nicht gefunden.");
  const summary = applyScanMetadataToSummary(existingSummary, renamed);
  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
    await Promise.all([tx.objectStore(SCAN_STORE).put(renamed), tx.objectStore(SCAN_SUMMARY_STORE).put(summary)]);
  }, [existing], [renamed]);
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
    sourceGeneration: createScanId(),
    containedInScanSlotId: null,
    analyticsEnabled: true,
  }));
  const sourceSummaries = await readExistingScanSummaries(db, restoredSources);

  await commitScanMutation(db, [SCAN_STORE, SCAN_SUMMARY_STORE], async tx => {
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
  }, [slot, ...sources], restoredSources, { sourceIds: [id, ...sourceIds], removedSourceIds: [id], kinds: ["release"] });
  await Promise.all(restoredSources.map((source) => materializeGuildAnalyticsScan(source)));
  await deleteGuildAnalyticsSources([id]);
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
      const activeSlot = await activateGuildHubScanSlot(db, target, effectiveSourceIds);
      await materializeGuildAnalyticsScan(activeSlot);
          return { status: "completed", scan: activeSlot };
    } catch {
      await restoreScanSlotSourcesAndRemoveTarget(target.id, effectiveSourceIds);
          return { status: "interrupted", scan: null };
    }
  }

  if (target || effectiveSourceIds.length > 0) {
    await restoreScanSlotSourcesAndRemoveTarget(targetSourceScanId, effectiveSourceIds);
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
export const findSfDataHubLocalScanByArchiveScanId = findGuildHubLocalScanByArchiveScanId;
export const bindSfDataHubLocalScanToArchiveEntry = bindGuildHubLocalScanToArchiveEntry;
export const findSfDataHubLocalScanByArchiveBinding = findGuildHubLocalScanByArchiveBinding;
export const deleteSfDataHubArchiveScanBinding = deleteGuildHubArchiveScanBinding;
export const listSfDataHubArchiveScanBindings = listGuildHubArchiveScanBindings;
export const getSfDataHubArchiveSearchIndexCache = getGuildHubArchiveSearchIndexCache;
export const putSfDataHubArchiveSearchIndexCache = putGuildHubArchiveSearchIndexCache;
export const deleteSfDataHubArchiveSearchIndexCache = deleteGuildHubArchiveSearchIndexCache;
export const listSfDataHubArchiveSearchIndexCacheRecords = listGuildHubArchiveSearchIndexCacheRecords;
export const getSfDataHubLocalToplistSnapshotRecord = getGuildHubLocalToplistSnapshotRecord;
export const putSfDataHubLocalToplistSnapshotRecord = putGuildHubLocalToplistSnapshotRecord;
export const deleteSfDataHubLocalToplistSnapshotRecord = deleteGuildHubLocalToplistSnapshotRecord;
export const listSfDataHubLocalToplistSnapshotRecords = listGuildHubLocalToplistSnapshotRecords;
export const deleteSfDataHubLocalToplistSnapshotRecordsForLocalScanIds = deleteGuildHubLocalToplistSnapshotRecordsForLocalScanIds;
export const listSfDataHubScanSummaries = listGuildHubScanSummaries;
export const listSfDataHubLocalServersFromScans = listGuildHubLocalServersFromScans;
export const listSfDataHubLocalGuildsForServerFromScans = listGuildHubLocalGuildsForServerFromScans;
export const listSfDataHubLocalServersFromScanSummaries = listGuildHubLocalServersFromScanSummaries;
export const listSfDataHubLocalGuildsForServerFromScanSummaries = listGuildHubLocalGuildsForServerFromScanSummaries;
