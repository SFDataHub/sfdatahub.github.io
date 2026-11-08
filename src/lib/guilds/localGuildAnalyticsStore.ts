import { rememberProfileSumComponents } from "../local-player-profile/profileSumHistory";
import { serverComparisonKey } from "../servers/serverResolver";
import { readDeclaredMemberCount } from "./guildCoverage";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditAliasPromise } from "../data-hub/runtimeAudit";
import { withLocalDataWrite, type LocalDataWriteLease } from "../local-data/localDataCoordination";
import { commitLocalDataMutation } from "../local-data/localDataTransaction";
import { createLocalChangesStore, localChangesDb, readLocalDataChanges, readLocalResetGeneration, type LocalChangesSchema } from "../local-data/localDataChanges";
import { openDB, unwrap, wrap, type DBSchema, type IDBPDatabase } from "idb";
import {
  GUILD_SCAN_NORMALIZER_VERSION,
  normalizeGuildScanMember,
  guildScanNormalizationExecutionCode,
  isNormalizedGuildMemberInGuild,
  readGuildScanMemberIdentity,
  normalizeGuildScanServer,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "./guildScanNormalizer";
import {
  GUILD_HUB_SCAN_SUMMARY_VERSION,
  deriveGuildHubLogicalScanSnapshots, deriveGuildHubLogicalScanSnapshotsCooperatively, readGuildHubRawSnapshots,
  isGuildHubScanAnalyticsEnabled,
  readGuildHubLocalScanSourceInventory,
  ensureSfDataHubLocalDataReady,
  readGuildHubLocalScanSourceValidity,
  normalizeGuildHubLocalScanForDerivation,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
  type GuildHubScanSummary,
} from "./localScanLibrary";
import {
  readProgressRadarAnalyticsValuesForPlayer, readStoredGuildProgressValues,
} from "../../pages/Playground/progressRadarModel";
import {
  resolveGuildIdentity,
  revalidateIdentityResolutionSnapshot,
  resolvePlayerIdentity,
  type IdentityResolutionSnapshot,
} from "../identities/identityResolution";

import { LOCAL_SCAN_CORE_NORMALIZER_VERSION, hasCurrentLocalSourceValidity, matchesLocalSourceValidity, localSourceValidityKey } from "./localSourceValidity";

const GUILD_ANALYTICS_DB_NAME = "sfdatahub-guild-analytics";
const GUILD_ANALYTICS_DB_VERSION = 2;
export const DERIVED_ANALYTICS_VERSION = 4;
// Additive values are versioned separately: upgrading an existing source must
// not delete/rewrite its entire prepared history just to add chart columns.
export const PROGRESS_VALUES_VERSION = 2;
type ProgressValues = Pick<ReturnType<typeof readProgressRadarAnalyticsValuesForPlayer>,
  "baseMain" | "conBase" | "attrTotal" | "conTotal" | "focusedTotalStats" | "mine" | "treasury"> & { hofRank?: number | null };
type ProgressExtension = { version: number; members: Record<string, ProgressValues>; declaredCounts: Record<string, number | null> };

const SOURCE_STORE = "sources";
const SNAPSHOT_STORE = "snapshots";
const MEMBER_STORE = "members";
const GUILD_STORE = "guilds";

type JsonRecord = Record<string, unknown>;

export type GuildAnalyticsSourceRecord = {
  sourceScanId: string;
  sourceUpdatedAt: string;
  sourceContentHash: string;
  derivedVersion: number;
  sourceGeneration?: string;
  normalizerVersion?: number;
  coreNormalizerVersion?: number;
  progress?: ProgressExtension;
  materializedAt: string;
  snapshotCount: number;
};

export type GuildAnalyticsDerivedSnapshot = {
  id: string;
  sourceGeneration?: string;
  derivedVersion?: number;
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
  timestamp: string;
  snapshotTimestamp: number;
};

export type GuildAnalyticsMemberSnapshot = {
  id: string;
  sourceGeneration?: string;
  derivedVersion?: number;
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  snapshotTimestamp: number;
  memberRef: string;
  name: string;
  classId: string | null;
  level: number | null;
  hofRank?: number | null;
  baseStats: number | null;
  totalStats: number | null;
  xpTotal: number | null;
  focusedBaseStats: number | null;
  baseMain?: number | null;
  conBase?: number | null;
  attrTotal?: number | null;
  conTotal?: number | null;
  focusedTotalStats?: number | null;
  mine?: number | null;
  treasury?: number | null;
  server: string | null;
  guildSegment: string | null;
  groupSegment: string | null;
  guildIdentifier: string | null;
  guildName: string | null;
};

export type GuildAnalyticsGuildSnapshot = {
  id: string;
  sourceGeneration?: string;
  derivedVersion?: number;
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  snapshotTimestamp: number;
  server: string | null;
  guildSegment: string | null;
  guildIdentifier: string | null;
  guildName: string | null;
  memberCount: number;
  declaredMemberCount?: number | null;
  averageLevel: number | null;
  averageBaseStats: number | null;
  averageTotalStats: number | null;
};

export type GuildAnalyticsDerivedData = {
  snapshots: GuildAnalyticsDerivedSnapshot[];
  members: GuildAnalyticsMemberSnapshot[];
  guilds: GuildAnalyticsGuildSnapshot[];
};

export type GuildAnalyticsMaterializeProgress = {
  processedSnapshots: number;
  totalSnapshots: number;
  processedMembers: number;
  totalMembers: number;
};

export type GuildAnalyticsCommitPhase = "analytics-write-lock-acquired" | "analytics-transaction-started" | "analytics-existing-rows-deleted" | "analytics-member-writes-started" | "analytics-first-member-batch-complete" | "analytics-half-member-batches-complete" | "analytics-member-requests-issued" | "analytics-member-requests-complete" | "analytics-transaction-committed";
export type GuildAnalyticsLoadPhase =
  | "loading-local-scan-data"
  | "checking-analytics-cache"
  | "rebuilding-analytics-data"
  | "normalizing-historical-data"
  | "saving-derived-analytics"
  | "loading-derived-analytics";

export type GuildAnalyticsLoadPhaseUpdate = {
  phase: GuildAnalyticsLoadPhase;
  sourceIndex?: number;
  sourceCount?: number;
  sourceId?: string;
};

export type GuildAnalyticsDiagnosticEntry = {
  phase: string;
  durationMs: number;
  count?: number;
  details?: Record<string, string | number | boolean | null>;
};

export type GuildAnalyticsSourceDiagnostic = {
  sourceId: string;
  totalMs: number;
  rawSourceLoadMs: number;
  normalizationTotalMs: number;
  snapshotBuildMs: number;
  memberObservationBuildMs: number;
  guildObservationBuildMs: number;
  writeMs: number;
  snapshotCount: number;
  memberObservationCount: number;
  guildObservationCount: number;
};

export type GuildAnalyticsMaterializeOptions = {
  onProgress?: (progress: GuildAnalyticsMaterializeProgress) => void;
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
  onSourceDiagnostic?: (entry: GuildAnalyticsSourceDiagnostic) => void;
  onPhase?: (phase: GuildAnalyticsLoadPhaseUpdate) => void;
  onCommitPhase?: (phase: GuildAnalyticsCommitPhase) => void;
};

export type GuildAnalyticsSummaryEnsureOptions = {
  includeProgressValues?: boolean;
  /** Local profile history requests only these sources; existing global callers retain their contract. */
  readSourceIds?: readonly string[];
  loadSourceById: (sourceScanId: string) => Promise<GuildHubLocalScan | null>;
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
  onSourceDiagnostic?: (entry: GuildAnalyticsSourceDiagnostic) => void;
  onPhase?: (phase: GuildAnalyticsLoadPhaseUpdate) => void;
  onCommitPhase?: (phase: GuildAnalyticsCommitPhase) => void;
};

export type GuildAnalyticsScopedGuildIdentity = {
  name: string;
  server?: string | null;
  guildId?: string | null;
  logoIdentifier?: string | null;
};

export type GuildAnalyticsScopedReadOptions = {
  guild: GuildAnalyticsScopedGuildIdentity | null | undefined;
  identitySnapshot?: Pick<IdentityResolutionSnapshot, "players" | "guilds"> | null;
  range?: unknown;
  selectedPlayerRefs?: readonly string[];
  /** Explicit, already resolved history scope; other scoped readers retain their defaults. */
  guildIdentifiers?: readonly string[];
  sourceIds?: readonly string[];
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
};

export type GuildAnalyticsReadMode = "scoped" | "global-fallback";

export type GuildAnalyticsReadResult = {
  data: GuildAnalyticsDerivedData;
  mode: GuildAnalyticsReadMode;
  fallbackReason: string | null;
};

export type GuildAnalyticsScopedSummaryEnsureOptions = GuildAnalyticsSummaryEnsureOptions & {
  guild?: GuildAnalyticsScopedGuildIdentity | null;
  identitySnapshot?: Pick<IdentityResolutionSnapshot, "players" | "guilds"> | null;
  range?: unknown;
  selectedPlayerRefs?: readonly string[];
};

interface GuildAnalyticsDb extends DBSchema, LocalChangesSchema {
  sources: {
    key: string;
    value: GuildAnalyticsSourceRecord;
    indexes: {
      by_derivedVersion: number;
    };
  };
  snapshots: {
    key: string;
    value: GuildAnalyticsDerivedSnapshot;
    indexes: {
      by_sourceScanId: string;
      by_snapshotTimestamp: number;
    };
  };
  members: {
    key: string;
    value: GuildAnalyticsMemberSnapshot;
    indexes: {
      by_sourceScanId: string;
      by_snapshotTimestamp: number;
      by_memberRef: string;
      by_guildIdentifier: string;
      by_memberRefTimestamp: [string, number];
      by_guildTimestamp: [string, number];
    };
  };
  guilds: {
    key: string;
    value: GuildAnalyticsGuildSnapshot;
    indexes: {
      by_sourceScanId: string;
      by_snapshotTimestamp: number;
      by_guildIdentifier: string;
      by_guildTimestamp: [string, number];
    };
  };
}

let analyticsDbPromise: Promise<IDBPDatabase<GuildAnalyticsDb>> | null = null;

const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const emitDiagnostic = (
  callback: ((entry: GuildAnalyticsDiagnosticEntry) => void) | undefined,
  phase: string,
  startedAt: number,
  count?: number,
  details?: Record<string, string | number | boolean | null>,
) => {
  callback?.({
    phase,
    durationMs: nowMs() - startedAt,
    ...(typeof count === "number" ? { count } : {}),
    ...(details ? { details } : {}),
  });
};

function getGuildAnalyticsDb() {
  if (!analyticsDbPromise) {
    analyticsDbPromise = openDB<GuildAnalyticsDb>(GUILD_ANALYTICS_DB_NAME, GUILD_ANALYTICS_DB_VERSION, {
      upgrade(db, oldVersion) {
        createLocalChangesStore(db);
        if (oldVersion >= 1) return;
        const sources = db.createObjectStore(SOURCE_STORE, { keyPath: "sourceScanId" });
        sources.createIndex("by_derivedVersion", "derivedVersion");

        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshots.createIndex("by_sourceScanId", "sourceScanId");
        snapshots.createIndex("by_snapshotTimestamp", "snapshotTimestamp");

        const members = db.createObjectStore(MEMBER_STORE, { keyPath: "id" });
        members.createIndex("by_sourceScanId", "sourceScanId");
        members.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
        members.createIndex("by_memberRef", "memberRef");
        members.createIndex("by_guildIdentifier", "guildIdentifier");
        members.createIndex("by_memberRefTimestamp", ["memberRef", "snapshotTimestamp"]);
        members.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);

        const guilds = db.createObjectStore(GUILD_STORE, { keyPath: "id" });
        guilds.createIndex("by_sourceScanId", "sourceScanId");
        guilds.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
        guilds.createIndex("by_guildIdentifier", "guildIdentifier");
        guilds.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);
      },
      blocking() { const opened = analyticsDbPromise; analyticsDbPromise = null; void opened?.then(db => db.close(), () => {}); },
      terminated() { analyticsDbPromise = null; },
    }).catch(error => { analyticsDbPromise = null; throw error; });
  }

  return analyticsDbPromise;
}

/** Prepares only supplied sources; inventory maintenance is explicitly separate. */
export async function ensureGuildAnalyticsDerivedData(scans: GuildHubLocalScan[]): Promise<GuildAnalyticsDerivedData> {
  const db = await getGuildAnalyticsDb();
  const resetGenerations = await captureAnalyticsResetGenerations(db, scans.map(scan => scan.id));
  const analyticsScans = scans.filter(isGuildHubScanAnalyticsEnabled);
  for (const inputScan of analyticsScans) {
    const scan = normalizeGuildHubLocalScanForDerivation(inputScan);
    const source = await db.get(SOURCE_STORE, scan.id);
    if (isSourceCurrent(source, scan)) continue;
    await materializeSourceIntoDb(db, scan, undefined, resetGenerations.get(scan.id));
    await yieldToBrowser();
  }
  return readGuildAnalyticsDerivedDataFromDb(db);
}

/** Compatibility adapter: prepares requested sources, never reconciles inventory.
 * The global read is retained for existing history/comparison consumers.
 */
export async function ensureGuildAnalyticsDerivedDataFromSummaries(
  summaries: GuildHubScanSummary[],
  options: GuildAnalyticsSummaryEnsureOptions,
): Promise<GuildAnalyticsDerivedData> {
  return ensureGuildAnalyticsSourceDataFromSummaries(summaries, options);
}

/** Source-scoped writes with the existing global, version-valid history read. */
export async function ensureGuildAnalyticsSourceDataFromSummaries(
  summaries: GuildHubScanSummary[],
  options: GuildAnalyticsSummaryEnsureOptions,
): Promise<GuildAnalyticsDerivedData> {
  const db = await getGuildAnalyticsDb();
  const activeSummaries = summaries.filter(isGuildHubScanAnalyticsEnabled);
  options.onDiagnostic?.({
    phase: "active-source-selection",
    durationMs: 0,
    count: activeSummaries.length,
    details: {
      summaryCount: summaries.length,
      activeSourceCount: activeSummaries.length,
    },
  });
  const committed = await ensureRequestedGuildAnalyticsSources(db, activeSummaries, options);
  options.onPhase?.({ phase: "loading-derived-analytics" });
  if (options.readSourceIds) {
    const parts = await Promise.all([...new Set(options.readSourceIds)].map(sourceId => {
      const prepared = committed.get(sourceId);
      // Use every freshly committed row, with the same live marker/generation
      // validation as the persisted reader. Avoid reading back the full source
      // just written within the same worker response budget.
      return prepared ? filterCurrentDerivedData(db, prepared) : readGuildAnalyticsDerivedSource(sourceId);
    }));
    return {
      snapshots: parts.flatMap(part => part.snapshots).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
      // The global reader uses IDB primary-key order. Preserve its tie decisions.
      members: parts.flatMap(part => part.members).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      guilds: parts.flatMap(part => part.guilds).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    };
  }
  return readGuildAnalyticsDerivedDataFromDb(db, options.onDiagnostic);
}

export async function ensureGuildAnalyticsScopedDataFromSummaries(
  summaries: GuildHubScanSummary[],
  options: GuildAnalyticsScopedSummaryEnsureOptions,
): Promise<GuildAnalyticsReadResult> {
  const db = await getGuildAnalyticsDb();
  const activeSummaries = summaries.filter(isGuildHubScanAnalyticsEnabled);
  options.onDiagnostic?.({
    phase: "active-source-selection",
    durationMs: 0,
    count: activeSummaries.length,
    details: {
      summaryCount: summaries.length,
      activeSourceCount: activeSummaries.length,
    },
  });
  await ensureRequestedGuildAnalyticsSources(db, activeSummaries, options);
  options.onPhase?.({ phase: "loading-derived-analytics" });

  if (options.identitySnapshot) options = { ...options, identitySnapshot: await revalidateIdentityResolutionSnapshot(options.identitySnapshot) };
  const fallbackReason = getScopedReadFallbackReason(options.guild, options.identitySnapshot);
  if (!fallbackReason) {
    try {
      const data = await readGuildAnalyticsScopedData({
        guild: options.guild,
        identitySnapshot: options.identitySnapshot,
        range: options.range,
        selectedPlayerRefs: options.selectedPlayerRefs,
        onDiagnostic: options.onDiagnostic,
      });
      emitReadModeDiagnostic(options.onDiagnostic, "scoped", null, data);
      return { data, mode: "scoped", fallbackReason: null };
    } catch {
      const data = await readGuildAnalyticsDerivedDataFromDb(db, options.onDiagnostic);
      emitReadModeDiagnostic(options.onDiagnostic, "global-fallback", "scoped-read-error", data);
      return { data, mode: "global-fallback", fallbackReason: "scoped-read-error" };
    }
  }

  const data = await readGuildAnalyticsDerivedDataFromDb(db, options.onDiagnostic);
  emitReadModeDiagnostic(options.onDiagnostic, "global-fallback", fallbackReason, data);
  return { data, mode: "global-fallback", fallbackReason };
}

/** Validate/repair only demanded Sources, then read their indexed player/guild
 * scope. A current Source never requires its full member population here. */
export async function ensureGuildAnalyticsProfileDataFromSummaries(
  summaries: GuildHubScanSummary[],
  scope: Pick<GuildAnalyticsScopedReadOptions, "selectedPlayerRefs" | "guildIdentifiers">,
  options: GuildAnalyticsSummaryEnsureOptions,
): Promise<GuildAnalyticsDerivedData> {
  const db = await getGuildAnalyticsDb();
  const active = summaries.filter(isGuildHubScanAnalyticsEnabled);
  await ensureRequestedGuildAnalyticsSources(db, active, options);
  const data = await readGuildAnalyticsScopedData({ guild: null, ...scope,
    sourceIds: active.map(summary => summary.sourceScanId), onDiagnostic: options.onDiagnostic });
  // Source preparation historically exposes IDB primary-key order to tie selection.
  return { ...data, members: data.members.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) };
}

const emitReadModeDiagnostic = (
  callback: ((entry: GuildAnalyticsDiagnosticEntry) => void) | undefined,
  mode: GuildAnalyticsReadMode,
  fallbackReason: string | null,
  data: GuildAnalyticsDerivedData,
) => {
  callback?.({
    phase: "analytics-read-mode",
    durationMs: 0,
    count: data.snapshots.length + data.members.length + data.guilds.length,
    details: {
      mode,
      fallbackReason,
      snapshots: data.snapshots.length,
      members: data.members.length,
      guilds: data.guilds.length,
    },
  });
};

async function filterCurrentDerivedData(
  db: IDBPDatabase<GuildAnalyticsDb>,
  data: GuildAnalyticsDerivedData,
): Promise<GuildAnalyticsDerivedData> {
    const __audit1 = auditPhaseBegin("filterCurrentDerivedData", undefined, "async-container");
    try {
  const sourceIds = [...new Set([
    ...data.snapshots.map((row) => row.sourceScanId),
    ...data.members.map((row) => row.sourceScanId),
    ...data.guilds.map((row) => row.sourceScanId),
  ])];
  const sources = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all(sourceIds.map((id) => db.get(SOURCE_STORE, id))))));
  const liveSources = await (auditValue(__audit1, auditEnter(__audit1, "readGuildHubLocalScanSourceValidity"), (readGuildHubLocalScanSourceValidity(sourceIds))));
  const currentSources = new Map(sources.filter(
    (source): source is GuildAnalyticsSourceRecord => Boolean(source &&
      isSourceCurrentForSummary(source, liveSources.get(source.sourceScanId) ?? undefined)),
  ).map((source) => [source.sourceScanId, source]));
  const isCurrentRow = (row: { sourceScanId: string; sourceGeneration?: string; derivedVersion?: number }) => {
    const marker = currentSources.get(row.sourceScanId);
    return Boolean(marker && row.sourceGeneration === marker.sourceGeneration && row.derivedVersion === marker.derivedVersion);
  };
  return auditReturn(__audit1, {
    snapshots: data.snapshots.filter(isCurrentRow),
    members: data.members.filter(isCurrentRow).map(row => {
      const values = currentSources.get(row.sourceScanId)?.progress?.members[row.id];
      return values ? { ...row, ...values } : row;
    }),
    guilds: data.guilds.filter(isCurrentRow).map(row => {
      const extension = currentSources.get(row.sourceScanId)?.progress;
      return extension ? { ...row, declaredMemberCount: extension.declaredCounts[row.id] ?? null } : row;
    }),
  });

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

async function readGuildAnalyticsDerivedDataFromDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void,
): Promise<GuildAnalyticsDerivedData> {
    const __audit2 = auditPhaseBegin("readGuildAnalyticsDerivedDataFromDb", undefined, "async-container");
    try {
  const startedAt = nowMs();
  const [storedSnapshots, storedMembers, storedGuilds] = await (auditValue(__audit2, auditEnter(__audit2, "Promise.all"), (Promise.all([
    db.getAll(SNAPSHOT_STORE),
    db.getAll(MEMBER_STORE),
    db.getAll(GUILD_STORE),
  ]))));
  const { snapshots, members, guilds } = await (auditValue(__audit2, auditEnter(__audit2, "filterCurrentDerivedData"), (filterCurrentDerivedData(db, {
    snapshots: storedSnapshots, members: storedMembers, guilds: storedGuilds,
  }))));
  emitDiagnostic(onDiagnostic, "derived-read", startedAt, snapshots.length + members.length + guilds.length, {
    snapshots: snapshots.length,
    members: members.length,
    guilds: guilds.length,
  });

  return auditReturn(__audit2, {
    snapshots: snapshots.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    members,
    guilds: guilds.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
  });

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}

export async function readGuildAnalyticsDerivedSource(sourceScanId: string): Promise<GuildAnalyticsDerivedData> {
    const __audit3 = auditPhaseBegin("readGuildAnalyticsDerivedSource", undefined, "async-container");
    try {
  const db = await (auditValue(__audit3, auditEnter(__audit3, "getGuildAnalyticsDb"), (getGuildAnalyticsDb())));
  const [storedSnapshots, storedMembers, storedGuilds] = await (auditValue(__audit3, auditEnter(__audit3, "Promise.all"), (Promise.all([
    db.getAllFromIndex(SNAPSHOT_STORE, "by_sourceScanId", sourceScanId),
    db.getAllFromIndex(MEMBER_STORE, "by_sourceScanId", sourceScanId),
    db.getAllFromIndex(GUILD_STORE, "by_sourceScanId", sourceScanId),
  ]))));

  const { snapshots, members, guilds } = await (auditValue(__audit3, auditEnter(__audit3, "filterCurrentDerivedData"), (filterCurrentDerivedData(db, {
    snapshots: storedSnapshots, members: storedMembers, guilds: storedGuilds,
  }))));
  return auditReturn(__audit3, {
    snapshots: snapshots.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    members,
    guilds: guilds.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
  });

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}

export async function readGuildAnalyticsScopedData(
  options: GuildAnalyticsScopedReadOptions,
): Promise<GuildAnalyticsDerivedData> {
    const __audit4 = auditPhaseBegin("readGuildAnalyticsScopedData", undefined, "async-container");
    try {
  const startedAt = nowMs();
  const db = await (auditValue(__audit4, auditEnter(__audit4, "getGuildAnalyticsDb"), (getGuildAnalyticsDb())));
  if (options.identitySnapshot) options = { ...options, identitySnapshot: await (auditValue(__audit4, auditEnter(__audit4, "revalidateIdentityResolutionSnapshot"), (revalidateIdentityResolutionSnapshot(options.identitySnapshot)))) };
  const guildIdentifiers = [...new Set([...collectScopedGuildIdentifiers(options.guild, options.identitySnapshot),
    ...(options.guildIdentifiers ?? []).map(ref => ref.toLowerCase())])].sort();
  const selectedPlayerRefs = collectScopedPlayerRefs(
    options.selectedPlayerRefs ?? [],
    options.identitySnapshot,
  );

  const [storedGuilds, guildMembers, playerMembers] = await (auditValue(__audit4, auditEnter(__audit4, "Promise.all"), (Promise.all([
    readUniqueRecordsByIndex(
      guildIdentifiers,
      (identifier) => db.getAllFromIndex(GUILD_STORE, "by_guildIdentifier", identifier),
      (guild) => guild.id,
    ),
    readUniqueRecordsByIndex(
      guildIdentifiers,
      (identifier) => db.getAllFromIndex(MEMBER_STORE, "by_guildIdentifier", identifier),
      (member) => member.id,
    ),
    readUniqueRecordsByIndex(
      selectedPlayerRefs,
      (memberRef) => db.getAllFromIndex(MEMBER_STORE, "by_memberRef", memberRef),
      (member) => member.id,
    ),
  ]))));
  const sourceIds = options.sourceIds ? new Set(options.sourceIds) : null;
  const includesSource = (row: { sourceScanId: string }) => !sourceIds || sourceIds.has(row.sourceScanId);
  const { guilds, members } = await (auditValue(__audit4, auditEnter(__audit4, "filterCurrentDerivedData"), (filterCurrentDerivedData(db, {
    snapshots: [],
    guilds: storedGuilds.filter(includesSource),
    members: sortMembersByTime(uniqueBy([...guildMembers, ...playerMembers].filter(includesSource), (member) => member.id)),
  }))));
  const snapshotIds = new Set<string>();
  guilds.forEach((guild) => snapshotIds.add(guild.snapshotId));
  members.forEach((member) => snapshotIds.add(member.snapshotId));
  const validated = await filterCurrentDerivedData(db, {
    snapshots: await (auditValue(__audit4, auditEnter(__audit4, "readSnapshotsByIds"), (readSnapshotsByIds(db, snapshotIds)))), members, guilds,
  });
  const snapshots = validated.snapshots;

  emitDiagnostic(
    options.onDiagnostic,
    "scoped-derived-read",
    startedAt,
    snapshots.length + members.length + guilds.length,
    {
      guildIdentifierCount: guildIdentifiers.length,
      selectedPlayerRefCount: selectedPlayerRefs.length,
      snapshots: snapshots.length,
      members: members.length,
      guilds: guilds.length,
    },
  );

  return auditReturn(__audit4, {
    snapshots,
    members: validated.members,
    guilds: sortGuildsByTime(validated.guilds),
  });

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}

const collectScopedGuildIdentifiers = (
  guild: GuildAnalyticsScopedGuildIdentity | null | undefined,
  identitySnapshot?: Pick<IdentityResolutionSnapshot, "guilds"> | null,
) => {
  if (!guild) return [];
  const identifiers = new Set<string>();
  const addIdentifier = (value: string | null | undefined) => {
    const identifier = String(value ?? "").trim();
    if (!identifier) return;
    identifiers.add(identifier.toLowerCase());
    collectDerivedGuildIdentifierCandidates(identifier, guild.server).forEach((candidate) =>
      identifiers.add(candidate),
    );
  };

  const seedIdentifiers = collectScopedGuildSeedIdentifiers(guild);
  seedIdentifiers.forEach(addIdentifier);

  if (identitySnapshot) {
    for (const identifier of seedIdentifiers) {
      if (!identifier) continue;
      const resolution = resolveGuildIdentity(identitySnapshot, identifier);
      if (!resolution.resolved) continue;
      resolution.aliasIdentifiers.forEach(addIdentifier);
    }
  }

  return [...identifiers].sort();
};

const getScopedReadFallbackReason = (
  guild: GuildAnalyticsScopedGuildIdentity | null | undefined,
  identitySnapshot?: Pick<IdentityResolutionSnapshot, "guilds"> | null,
) => {
  if (!guild) return "no-guild";
  const seedIdentifiers = collectScopedGuildSeedIdentifiers(guild);
  if (!seedIdentifiers.length) return "no-stable-identifier";
  if (!identitySnapshot) return "no-identity-snapshot";
  const hasIdentityMatch = seedIdentifiers.some((identifier) =>
    resolveGuildIdentity(identitySnapshot, identifier).resolved,
  );
  return hasIdentityMatch ? null : "no-identity-match";
};

const collectScopedGuildSeedIdentifiers = (guild: GuildAnalyticsScopedGuildIdentity) => {
  const identifiers = new Set<string>();
  const addIdentifier = (value: string | null | undefined) => {
    const identifier = String(value ?? "").trim();
    if (identifier) identifiers.add(identifier);
  };

  addIdentifier(guild.logoIdentifier);
  addIdentifier(guild.guildId);
  collectDerivedGuildIdentifierCandidates(guild.logoIdentifier ?? guild.guildId, guild.server).forEach(addIdentifier);
  return [...identifiers];
};

const collectDerivedGuildIdentifierCandidates = (
  value: string | null | undefined,
  fallbackServer: string | null | undefined,
) => {
  const identifier = String(value ?? "").trim();
  if (!identifier) return [];
  const candidates = new Set<string>();
  const segment = normalizeGuildSegmentForScan(identifier);
  const server =
    normalizeServerFromGuildIdentifier(identifier) ??
    normalizeGuildScanServer(fallbackServer);
  if (segment) {
    candidates.add(segment);
    if (server) candidates.add(`${server}_${segment}`);
  }
  return [...candidates];
};

const normalizeServerFromGuildIdentifier = (value: string) => {
  const match = /^([a-z0-9]+?)(?:_net)?_g[a-z0-9]+$/i.exec(value.trim());
  return match?.[1] ? normalizeGuildScanServer(match[1]) : null;
};

const collectScopedPlayerRefs = (
  selectedPlayerRefs: readonly string[],
  identitySnapshot?: Pick<IdentityResolutionSnapshot, "players"> | null,
) => {
  const refs = new Set<string>();
  const addRef = (value: string | null | undefined) => {
    const ref = String(value ?? "").trim().toLowerCase();
    if (ref) refs.add(ref);
  };
  selectedPlayerRefs.forEach((memberRef) => {
    addRef(memberRef);
    if (!identitySnapshot) return;
    const resolution = resolvePlayerIdentity(identitySnapshot, memberRef);
    if (!resolution.resolved) return;
    resolution.aliasIdentifiers.forEach(addRef);
  });
  return [...refs].sort();
};

async function readUniqueRecordsByIndex<TRecord>(
  values: readonly string[],
  read: (value: string) => Promise<TRecord[]>,
  getKey: (record: TRecord) => string,
) {
    const __audit5 = auditPhaseBegin("readUniqueRecordsByIndex", undefined, "async-container");
    try {
  const records = await (auditValue(__audit5, auditEnter(__audit5, "Promise.all"), (Promise.all(values.map((value) => read(value))))));
  return auditReturn(__audit5, uniqueBy(records.flat(), getKey));

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}

async function readSnapshotsByIds(
  db: IDBPDatabase<GuildAnalyticsDb>,
  snapshotIds: ReadonlySet<string>,
) {
    const __audit6 = auditPhaseBegin("readSnapshotsByIds", undefined, "async-container");
    try {
  const snapshots = await (auditValue(__audit6, auditEnter(__audit6, "Promise.all"), (Promise.all(
    [...snapshotIds].sort().map((snapshotId) => db.get(SNAPSHOT_STORE, snapshotId)),
  ))));
  return auditReturn(__audit6, snapshots
    .filter((snapshot): snapshot is GuildAnalyticsDerivedSnapshot => Boolean(snapshot))
    .sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)));

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}

function uniqueBy<TRecord>(
  records: readonly TRecord[],
  getKey: (record: TRecord) => string,
) {
  const byKey = new Map<string, TRecord>();
  records.forEach((record) => {
    const key = getKey(record);
    if (!byKey.has(key)) byKey.set(key, record);
  });
  return [...byKey.values()];
}

const sortMembersByTime = (members: GuildAnalyticsMemberSnapshot[]) =>
  [...members].sort(
    (a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id),
  );

const sortGuildsByTime = (guilds: GuildAnalyticsGuildSnapshot[]) =>
  [...guilds].sort(
    (a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id),
  );

export async function materializeGuildAnalyticsSource(scan: GuildHubLocalScan, options?: GuildAnalyticsMaterializeOptions) {
  const db = await getGuildAnalyticsDb();
  await materializeSourceIntoDb(db, scan, options);
}

export async function deleteGuildAnalyticsDerivedSources(sourceScanIds: string[], lease?: LocalDataWriteLease) {
  if (!sourceScanIds.length) return;
  const db = await getGuildAnalyticsDb();
  for (const sourceScanId of sourceScanIds) {
    await deleteSourceRecords(db, sourceScanId, lease);
  }
}

/** Explicit maintenance operation. Caller subsets/complete flags are not accepted.
 * It only reconciles metadata; it does not rebuild historical raw sources.
 * Raw and derived databases are separate: this is not an atomic cross-DB operation.
 */
export async function reconcileGuildAnalyticsSources(): Promise<{
  status: "complete" | "incomplete";
  removedSourceIds: string[];
  reason: string | null;
}> {
  await ensureSfDataHubLocalDataReady();
  const db = await getGuildAnalyticsDb();
  return withLocalDataWrite(async lease => {
    const existingSources = await db.getAll(SOURCE_STORE);
    let inventory: Awaited<ReturnType<typeof readGuildHubLocalScanSourceInventory>>;
    try {
      inventory = await readGuildHubLocalScanSourceInventory();
    } catch (error) {
      return {
        status: "incomplete" as const,
        removedSourceIds: [],
        reason: error instanceof Error ? error.message : "Source inventory enumeration failed.",
      };
    }
    const rawIds = new Set(inventory.sourceIds);
    const disabledIds = new Set(inventory.analyticsDisabledSourceIds);
    const removedSourceIds: string[] = [];
    for (const source of existingSources) {
      if (rawIds.has(source.sourceScanId) && !disabledIds.has(source.sourceScanId)) continue;
      await deleteSourceRecords(db, source.sourceScanId, lease);
      removedSourceIds.push(source.sourceScanId);
    }
    return { status: "complete" as const, removedSourceIds, reason: null };
  });
}

async function ensureRequestedGuildAnalyticsSources(
  db: IDBPDatabase<GuildAnalyticsDb>,
  summaries: GuildHubScanSummary[],
  options: GuildAnalyticsSummaryEnsureOptions,
) {
    const __audit7 = auditPhaseBegin("ensureRequestedGuildAnalyticsSources", undefined, "async-container");
    try {
  const committed = new Map<string, GuildAnalyticsDerivedData>();
  const wanted = new Set(options.readSourceIds ?? []);
  const resetGenerations = await (auditValue(__audit7, auditEnter(__audit7, "captureAnalyticsResetGenerations"), (captureAnalyticsResetGenerations(db, summaries.map(summary => summary.sourceScanId)))));
  options.onPhase?.({ phase: "checking-analytics-cache" });
  const versionCheckStartedAt = nowMs();
  const liveSummaries = await (auditValue(__audit7, auditEnter(__audit7, "readGuildHubLocalScanSourceValidity"), (readGuildHubLocalScanSourceValidity(summaries.map((summary) => summary.sourceScanId)))));
  const requestedSummaries = [...new Map(summaries.map((summary) => [
    summary.sourceScanId, liveSummaries.get(summary.sourceScanId) ?? summary,
  ])).values()];
  const existingSources = (await (auditValue(__audit7, auditEnter(__audit7, "Promise.all"), (Promise.all(requestedSummaries.map(
    (summary) => db.get(SOURCE_STORE, summary.sourceScanId),
  )))))).filter((source): source is GuildAnalyticsSourceRecord => Boolean(source));
  const existingById = new Map(existingSources.map((source) => [source.sourceScanId, source]));
  const hasVersionMismatch = existingSources.some((source) => source.derivedVersion !== DERIVED_ANALYTICS_VERSION);
  const storedVersions = Array.from(new Set(existingSources.map((source) => source.derivedVersion))).sort((a, b) => a - b);
  emitDiagnostic(options.onDiagnostic, "derived-version-check", versionCheckStartedAt, existingSources.length, {
    storedVersion: storedVersions.length === 1 ? storedVersions[0] : storedVersions.join(",") || "none",
    currentVersion: DERIVED_ANALYTICS_VERSION,
    hasVersionMismatch,
  });
  for (const summary of options.includeProgressValues ? requestedSummaries : []) {
    const source = existingById.get(summary.sourceScanId);
    if (!isSourceCurrentForSummary(source, liveSummaries.get(summary.sourceScanId) ?? undefined) || source?.progress?.version === PROGRESS_VALUES_VERSION) continue;
    const scan = await options.loadSourceById(summary.sourceScanId);
    if (!scan || scan.id !== summary.sourceScanId) throw Error(`Missing Progress source: ${summary.sourceScanId}`);
    const extended = await extendStoredProgressValues(db, scan, options, resetGenerations.get(scan.id)!);
    if (wanted.has(scan.id)) committed.set(scan.id, extended);
  }
  // Version mismatch is repaired sourcewise, on demand. No consumer owns global reset.
  const rebuildSummaries = requestedSummaries.filter((summary) => !isSourceCurrentForSummary(existingById.get(summary.sourceScanId), liveSummaries.get(summary.sourceScanId) ?? undefined));
  const rematerializationStartedAt = nowMs();
  let rebuiltCount = 0;

  for (const summary of rebuildSummaries) {
    const source = existingById.get(summary.sourceScanId);
    if (isSourceCurrentForSummary(source, liveSummaries.get(summary.sourceScanId) ?? undefined)) continue;

    options.onPhase?.({
      phase: "rebuilding-analytics-data",
      sourceIndex: rebuiltCount + 1,
      sourceCount: rebuildSummaries.length,
      sourceId: summary.sourceScanId,
    });
    const sourceStartedAt = nowMs();
    const rawSourceLoadStartedAt = nowMs();
    const resetGeneration = resetGenerations.get(summary.sourceScanId)!;
    const scan = await (auditValue(__audit7, auditEnter(__audit7, "options.loadSourceById"), (options.loadSourceById(summary.sourceScanId))));
    const rawSourceLoadMs = nowMs() - rawSourceLoadStartedAt;
    options.onDiagnostic?.({
      phase: "raw-source-load",
      durationMs: rawSourceLoadMs,
      count: scan ? 1 : 0,
      details: {
        sourceId: summary.sourceScanId,
      },
    });
    if (scan && scan.id !== summary.sourceScanId) {
      throw new Error(`Requested source ${summary.sourceScanId} resolved to unexpected source ${scan.id}.`);
    }
    if (!scan || !isGuildHubScanAnalyticsEnabled(scan)) {
      await (auditValue(__audit7, auditEnter(__audit7, "withLocalDataWrite"), (withLocalDataWrite(async lease => {
        if (await readAnalyticsResetGeneration(db, summary.sourceScanId) !== resetGeneration) throw new Error("Analytics reset changed during source load.");
        const live = (await readGuildHubLocalScanSourceValidity([summary.sourceScanId])).get(summary.sourceScanId);
        if (!live || !isGuildHubScanAnalyticsEnabled(live)) await deleteSourceRecords(db, summary.sourceScanId, lease);
      }))));
      await (auditValue(__audit7, auditEnter(__audit7, "yieldToBrowser"), (yieldToBrowser())));
      continue;
    }

    const emitSourcePhase = (phase: GuildAnalyticsLoadPhaseUpdate) =>
      options.onPhase?.({
        ...phase,
        sourceIndex: phase.sourceIndex ?? rebuiltCount + 1,
        sourceCount: phase.sourceCount ?? rebuildSummaries.length,
      });

    await (auditValue(__audit7, auditEnter(__audit7, "materializeSourceIntoDb"), (materializeSourceIntoDb(db, scan, {
      onDiagnostic: options.onDiagnostic,
      onSourceDiagnostic: (entry) => {
        options.onSourceDiagnostic?.({
          ...entry,
          totalMs: nowMs() - sourceStartedAt,
          rawSourceLoadMs,
        });
      },
      onPhase: emitSourcePhase,
      onCommitPhase: options.onCommitPhase,
    }, resetGeneration, wanted.has(scan.id) ? data => committed.set(scan.id, data) : undefined))));
    rebuiltCount += 1;
    await (auditValue(__audit7, auditEnter(__audit7, "yieldToBrowser"), (yieldToBrowser())));
  }

  emitDiagnostic(options.onDiagnostic, "derived-rematerialization-total", rematerializationStartedAt, rebuiltCount, {
    rebuild: rebuiltCount > 0,
    rebuildSourceCount: rebuiltCount,
    candidateSourceCount: rebuildSummaries.length,
  });
  return committed;

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
}

function isSourceCurrent(source: GuildAnalyticsSourceRecord | undefined, scan: GuildHubLocalScan) {
  return (
    source?.derivedVersion === DERIVED_ANALYTICS_VERSION &&
    source.sourceUpdatedAt === getSourceUpdatedAt(scan) &&
    source.sourceContentHash === scan.contentHash &&
    matchesLocalSourceValidity(source, scan)
  );
}

function isSourceCurrentForSummary(source: GuildAnalyticsSourceRecord | undefined, summary: GuildHubScanSummary | undefined) {
  if (!summary || !isGuildHubScanAnalyticsEnabled(summary)) return false;
  return (
    source?.derivedVersion === DERIVED_ANALYTICS_VERSION &&
    source.sourceUpdatedAt === getSummarySourceUpdatedAt(summary) &&
    Boolean(summary.contentHash) &&
    source.sourceContentHash === summary.contentHash &&
    matchesLocalSourceValidity(source, summary)
  );
}

const inFlightSourceMaterializations = new Map<string, Promise<void>>();

async function materializeSourceIntoDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
  inputScan: GuildHubLocalScan,
  options?: GuildAnalyticsMaterializeOptions,
  capturedResetGeneration?: string,
  onCommittedData?: (data: GuildAnalyticsDerivedData) => void,
) {
    const __audit8 = auditPhaseBegin("materializeSourceIntoDb", undefined, "async-container");
    try {
  const resetGeneration = capturedResetGeneration ?? await (auditValue(__audit8, auditEnter(__audit8, "readAnalyticsResetGeneration"), (readAnalyticsResetGeneration(db, inputScan.id))));
  const scan = (auditValue(__audit8, auditEnter(__audit8, "normalizeGuildHubLocalScanForDerivation", "sync-elapsed"), (normalizeGuildHubLocalScanForDerivation(inputScan))));
  if (!hasCurrentLocalSourceValidity(scan)) throw new Error(`Source cannot be normalized: ${scan.id}`);
  const key = (auditValue(__audit8, auditEnter(__audit8, "JSON.stringify", "sync-elapsed"), (JSON.stringify([scan.id, scan.contentHash, getSourceUpdatedAt(scan),
    localSourceValidityKey(scan), DERIVED_ANALYTICS_VERSION, resetGeneration]))));
  const existing = inFlightSourceMaterializations.get(key);
  if (existing) return auditReturn(__audit8, existing);
  const sourceJob = (auditValue(__audit8, auditEnter(__audit8, "buildAndCommitSourceIntoDb", "sync-elapsed"), (buildAndCommitSourceIntoDb(db, scan, options, resetGeneration, onCommittedData))));
  const job = sourceJob.finally(() => {
    inFlightSourceMaterializations.delete(key);
  });
  auditAliasPromise(job, sourceJob);
  inFlightSourceMaterializations.set(key, job);
  return auditReturn(__audit8, job);

    } catch (__auditError) { auditError(__audit8, __auditError); throw __auditError; }
    finally { auditLeave(__audit8); }
}

/** Audit-only fingerprints of the functions actually loaded in this realm. */
export function guildAnalyticsExecutionCode() {
  return { moduleUrl: import.meta.url,
    store: [DERIVED_ANALYTICS_VERSION, buildAndCommitSourceIntoDb, toMemberSnapshot, deleteByIndex,
      isSourceCurrent, isSourceCurrentForSummary, filterCurrentDerivedData,
      ensureGuildAnalyticsSourceDataFromSummaries, ensureRequestedGuildAnalyticsSources].join("\n"),
    snapshots: [GUILD_SCAN_NORMALIZER_VERSION, LOCAL_SCAN_CORE_NORMALIZER_VERSION,
      GUILD_HUB_SCAN_SUMMARY_VERSION, deriveGuildHubLogicalScanSnapshots, normalizeGuildScanMember,
      guildScanNormalizationExecutionCode()].join("\n"),
    values: [readProgressRadarAnalyticsValuesForPlayer, readStoredGuildProgressValues].join("\n") };
}

async function extendStoredProgressValues(db: IDBPDatabase<GuildAnalyticsDb>, scan: GuildHubLocalScan, options: GuildAnalyticsSummaryEnsureOptions, reset: string) {
  const audit = auditPhaseBegin("extendStoredProgressValues");
  try {
    const started = nowMs();
    const [snapshots, members, guilds] = await Promise.all([
      db.getAllFromIndex(SNAPSHOT_STORE, "by_sourceScanId", scan.id),
      db.getAllFromIndex(MEMBER_STORE, "by_sourceScanId", scan.id),
      db.getAllFromIndex(GUILD_STORE, "by_sourceScanId", scan.id),
    ]);
    const byId = new Map(members.map(row => [row.id, row]));
    const extension: ProgressExtension = { version: PROGRESS_VALUES_VERSION, members: {}, declaredCounts: {} };
    const guildsBySnapshot = new Map<string, GuildAnalyticsGuildSnapshot[]>();
    for (const guild of guilds) { const rows = guildsBySnapshot.get(guild.snapshotId) ?? []; rows.push(guild); guildsBySnapshot.set(guild.snapshotId, rows); }
    for (const bucket of readGuildHubRawSnapshots(scan)) {
      const snapshotId = `${scan.id}::${bucket.timestampMs}`, duplicates = new Map<string, number>();
      for (const raw of bucket.players) {
        const player = asRecord(raw); if (!player) continue;
        const identity = readGuildScanMemberIdentity(player, normalizeGuildScanServer(player.prefix ?? player.server));
        if (!identity) continue;
        const duplicate = duplicates.get(identity.memberRef) ?? 0; duplicates.set(identity.memberRef, duplicate + 1);
        const id = `${snapshotId}::member::${identity.memberRef}::${duplicate}`, member = byId.get(id);
        if (member) extension.members[id] = { ...readStoredGuildProgressValues(player, member.classId), hofRank: readPreparedPlayerHofRank(player) };
      }
      const counts = new Map(bucket.groups.flatMap(raw => {
        const group = asRecord(raw); if (!group) return [];
        const info = readGroupAnalyticsInfo(group); return info.guildIdentifier ? [[info.guildIdentifier.toLowerCase(), info.declaredMemberCount] as const] : [];
      }));
      for (const guild of guildsBySnapshot.get(snapshotId) ?? []) extension.declaredCounts[guild.id] = counts.get(guild.guildIdentifier?.toLowerCase() ?? "") ?? null;
    }
    auditFields(audit, { sourceScanId: scan.id, addedMemberValues: Object.keys(extension.members).length, coreCalculations: 0, statCalculations: 0 });
    await withLocalDataWrite(async lease => {
      if (await readAnalyticsResetGeneration(db, scan.id) !== reset) throw Error("Analytics reset changed during Progress extension");
      const live = (await readGuildHubLocalScanSourceValidity([scan.id])).get(scan.id);
      if (!live || !matchesLocalSourceValidity(scan, live) || !isGuildHubScanAnalyticsEnabled(live)) throw Error("Progress source changed during extension");
      await commitLocalDataMutation(db, [SOURCE_STORE], { owner: "analytics", kinds: ["derived"], sourceIds: [scan.id], removedSourceIds: [], servers: scan.servers, unknownImpact: !scan.servers.length }, async tx => {
        options.onCommitPhase?.("analytics-transaction-started");
        const marker = await tx.objectStore(SOURCE_STORE).get(scan.id);
        if (!isSourceCurrent(marker, scan)) throw Error("Progress cache basis changed");
        await tx.objectStore(SOURCE_STORE).put({ ...marker!, progress: extension });
      }, lease);
    });
    options.onDiagnostic?.({ phase: "progress-values-extension", durationMs: nowMs() - started, count: Object.keys(extension.members).length, details: { sourceId: scan.id, fullStatCalculations: 0 } });
    return auditReturn(audit, { snapshots, members, guilds });
  } catch (error) { auditError(audit, error); throw error; } finally { auditLeave(audit); }
}

async function buildAndCommitSourceIntoDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
  scan: GuildHubLocalScan,
  options: GuildAnalyticsMaterializeOptions | undefined,
  resetGeneration: string,
  onCommittedData?: (data: GuildAnalyticsDerivedData) => void,
) {
    const __audit9 = auditBegin("S03", "buildAndCommitSourceIntoDb");
  if (__audit9) auditFields(__audit9, { sourceScanId: scan.id, sourceGeneration: scan.sourceGeneration, contentHash: scan.contentHash, resetGeneration, realmFlightMap: "local-to-this-realm", workDisposition: "new-build" });
    try {
  const normalizationDurations: number[] = [];
  const progressValues = new WeakMap<object, ReturnType<typeof readProgressRadarAnalyticsValuesForPlayer> & { hofRank?: number | null }>();
  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });
  const snapshotBuildStartedAt = nowMs();
  const snapshots = await (auditValue(__audit9, auditEnter(__audit9, "deriveGuildHubLogicalScanSnapshots", "async-container"), ((typeof window === "undefined" ? deriveGuildHubLogicalScanSnapshots : deriveGuildHubLogicalScanSnapshotsCooperatively)(scan, {
    onNormalizedSnapshotCreated: (durationMs) => normalizationDurations.push(durationMs),
    onNormalizedPlayerCreated: (raw, core, stats) => {
      const player = asRecord(raw);
      if (player) rememberProfileSumComponents(player, core);
      if (player) progressValues.set(player, { ...readProgressRadarAnalyticsValuesForPlayer(player, core, stats), hofRank: core?.progression.rank ?? readPreparedPlayerHofRank(player) });
    },
  }))));
  const snapshotBuildMs = nowMs() - snapshotBuildStartedAt;
  const normalizationTotalMs = normalizationDurations.reduce((sum, durationMs) => sum + durationMs, 0);
  options?.onDiagnostic?.({
    phase: "source-snapshot-build",
    durationMs: snapshotBuildMs,
    count: snapshots.length,
    details: {
      sourceId: scan.id,
      snapshotCount: snapshots.length,
    },
  });
  options?.onDiagnostic?.({
    phase: "normalization-total",
    durationMs: normalizationTotalMs,
    count: snapshots.length,
    details: {
      sourceId: scan.id,
    },
  });
  const { data: records, timings } = await (auditValue(__audit9, auditEnter(__audit9, "buildDerivedRecords"), ((auditValue(__audit9, auditEnter(__audit9, "buildDerivedRecords", "sync-elapsed"), (buildDerivedRecords(scan, snapshots, options, progressValues)))))));
  const progressExtension: ProgressExtension = {
    version: PROGRESS_VALUES_VERSION,
    members: Object.fromEntries(records.members.map(row => [row.id, {
      hofRank: row.hofRank ?? null, baseMain: row.baseMain ?? null, conBase: row.conBase ?? null,
      attrTotal: row.attrTotal ?? null, conTotal: row.conTotal ?? null,
      focusedTotalStats: row.focusedTotalStats ?? null, mine: row.mine ?? null, treasury: row.treasury ?? null,
    }])),
    declaredCounts: Object.fromEntries(records.guilds.map(row => [row.id, row.declaredMemberCount ?? null])),
  };
  // Stamp these job-local records once, before entering the write lease. They
  // are also the exact rows handed back after the durable commit, when wanted.
  for (const rows of [records.snapshots, records.members, records.guilds]) {
    for (const row of rows) {
      row.sourceGeneration = scan.sourceGeneration;
      row.derivedVersion = DERIVED_ANALYTICS_VERSION;
    }
  }

  const sourceWriteStartedAt = nowMs();
  options?.onPhase?.({ phase: "saving-derived-analytics", sourceId: scan.id });
  await (auditValue(__audit9, auditEnter(__audit9, "withLocalDataWrite"), (withLocalDataWrite(async lease => {
    options?.onCommitPhase?.("analytics-write-lock-acquired");
    if (await readAnalyticsResetGeneration(db, scan.id) !== resetGeneration) throw new Error(`Reset changed before Analytics commit: ${scan.id}`);
    const liveSource = (await readGuildHubLocalScanSourceValidity([scan.id])).get(scan.id);
    if (!liveSource || liveSource.sourceScanId !== scan.id ||
        !isGuildHubScanAnalyticsEnabled(scan) || !isGuildHubScanAnalyticsEnabled(liveSource) ||
        !matchesLocalSourceValidity(scan, liveSource) || !liveSource.contentHash ||
        liveSource.contentHash !== scan.contentHash ||
        getSummarySourceUpdatedAt(liveSource) !== getSourceUpdatedAt(scan)) {
      throw new Error(`Source changed before Analytics commit: ${scan.id}`);
    }
    await commitLocalDataMutation(db, [SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], {
      owner: "analytics", kinds: ["derived"], sourceIds: [scan.id], removedSourceIds: [], servers: scan.servers, unknownImpact: !scan.servers.length,
  }, async tx => {
    options?.onCommitPhase?.("analytics-transaction-started");
    // Replacement and marker commit share one transaction, including removal of
    // old rows. A failed build/transaction leaves the previous generation intact.
    await Promise.all([
      deleteByIndex(tx.objectStore(SNAPSHOT_STORE).index("by_sourceScanId"), scan.id),
      deleteByIndex(tx.objectStore(MEMBER_STORE).index("by_sourceScanId"), scan.id),
      deleteByIndex(tx.objectStore(GUILD_STORE).index("by_sourceScanId"), scan.id),
    ]);
    options?.onCommitPhase?.("analytics-existing-rows-deleted");
    const snapshotWriteStartedAt = nowMs();
    await Promise.all(records.snapshots.map((snapshot) => tx.objectStore(SNAPSHOT_STORE).put(snapshot)));
    emitDiagnostic(options?.onDiagnostic, "derived-snapshots-write", snapshotWriteStartedAt, records.snapshots.length, {
      sourceId: scan.id,
    });
    const memberWriteStartedAt = nowMs();
    options?.onCommitPhase?.("analytics-member-writes-started");
    const memberStore = unwrap(tx.objectStore(MEMBER_STORE));
    // Queue the native writes together. Serial group waits are costly with a
    // disk-backed database; per-row JS promises/listeners are unnecessary.
    // Requests execute in order. Errors abort the transaction and its final
    // request; tx.done below still certifies all rows and the source marker.
    const memberWrites: Promise<unknown>[] = [];
    let lastWrite: IDBRequest<IDBValidKey> | undefined;
    for (let index = 0; index < records.members.length; index++) {
      lastWrite = memberStore.put(records.members[index]);
      if (index + 1 === Math.min(500, records.members.length)) {
        memberWrites.push(wrap(lastWrite).then(() => options?.onCommitPhase?.("analytics-first-member-batch-complete")));
      }
      if (index + 1 === Math.ceil(records.members.length / 2)) {
        memberWrites.push(wrap(lastWrite).then(() => options?.onCommitPhase?.("analytics-half-member-batches-complete")));
      }
    }
    options?.onCommitPhase?.("analytics-member-requests-issued");
    if (lastWrite) memberWrites.push(wrap(lastWrite));
    await Promise.all(memberWrites);
    options?.onCommitPhase?.("analytics-member-requests-complete");
    emitDiagnostic(options?.onDiagnostic, "derived-members-write", memberWriteStartedAt, records.members.length, {
      sourceId: scan.id,
    });
    const guildWriteStartedAt = nowMs();
    await Promise.all(records.guilds.map((guild) => tx.objectStore(GUILD_STORE).put(guild)));
    emitDiagnostic(options?.onDiagnostic, "derived-guilds-write", guildWriteStartedAt, records.guilds.length, {
      sourceId: scan.id,
    });
    const sourceRecordWriteStartedAt = nowMs();
    await tx.objectStore(SOURCE_STORE).put({
        sourceScanId: scan.id,
        sourceUpdatedAt: getSourceUpdatedAt(scan),
        sourceContentHash: scan.contentHash,
        derivedVersion: DERIVED_ANALYTICS_VERSION,
        sourceGeneration: scan.sourceGeneration,
        normalizerVersion: scan.normalizerVersion,
        coreNormalizerVersion: scan.coreNormalizerVersion,
        progress: progressExtension,
        materializedAt: new Date().toISOString(),
        snapshotCount: records.snapshots.length,
      });
    emitDiagnostic(options?.onDiagnostic, "derived-sources-write", sourceRecordWriteStartedAt, 1, {
      sourceId: scan.id,
    });
  }, lease);
    options?.onCommitPhase?.("analytics-transaction-committed");
  }))));
  onCommittedData?.(records);
  const writeMs = nowMs() - sourceWriteStartedAt;
  emitDiagnostic(options?.onDiagnostic, "source-write", sourceWriteStartedAt, records.snapshots.length + records.members.length + records.guilds.length + 1, {
    sourceId: scan.id,
  });
  options?.onSourceDiagnostic?.({
    sourceId: scan.id,
    totalMs: snapshotBuildMs + timings.memberObservationBuildMs + timings.guildObservationBuildMs + writeMs,
    rawSourceLoadMs: 0,
    normalizationTotalMs,
    snapshotBuildMs,
    memberObservationBuildMs: timings.memberObservationBuildMs,
    guildObservationBuildMs: timings.guildObservationBuildMs,
    writeMs,
    snapshotCount: records.snapshots.length,
    memberObservationCount: records.members.length,
    guildObservationCount: records.guilds.length,
  });

    } catch (__auditError) { auditError(__audit9, __auditError); throw __auditError; }
    finally { auditLeave(__audit9); }
}

async function buildDerivedRecords(
  scan: GuildHubLocalScan,
  snapshots: GuildHubLogicalScanSnapshot[],
  options: GuildAnalyticsMaterializeOptions | undefined,
  progressValues: WeakMap<object, ReturnType<typeof readProgressRadarAnalyticsValuesForPlayer> & { hofRank?: number | null }>,
): Promise<{
  data: GuildAnalyticsDerivedData;
  timings: {
    memberObservationBuildMs: number;
    guildObservationBuildMs: number;
  };
}> {
    const __audit10 = auditPhaseBegin("buildDerivedRecords", undefined, "async-container");
    try {
  const snapshotRecords: GuildAnalyticsDerivedSnapshot[] = [];
  const memberRecords: GuildAnalyticsMemberSnapshot[] = [];
  const guildRecords: GuildAnalyticsGuildSnapshot[] = [];
  let memberObservationBuildMs = 0;
  let guildObservationBuildMs = 0;
  const totalSnapshots = snapshots.length;
  const totalMembers = snapshots.reduce((sum, snapshot) => sum + snapshot.normalizedMembers.length, 0);
  let processedSnapshots = 0;
  let processedMembers = 0;
  let nextYieldAt = 500;

  const reportProgress = () => {
    options?.onProgress?.({
      processedSnapshots,
      totalSnapshots,
      processedMembers,
      totalMembers,
    });
  };

  reportProgress();

  for (const snapshot of snapshots) {
    snapshotRecords.push({
      id: snapshot.id,
      sourceScanId: scan.id,
      sourceScanFilename: scan.filename,
      sourceImportedAt: scan.importedAt,
      timestamp: snapshot.timestamp,
      snapshotTimestamp: snapshot.timestampMs,
    });

    const memberDuplicateCounts = new Map<string, number>();
    const rawPlayerByMemberRef = (auditValue(__audit10, auditEnter(__audit10, "buildRawPlayerLookup", "sync-elapsed"), (buildRawPlayerLookup(snapshot))));
    const memberBuildStartedAt = nowMs();
    for (const member of snapshot.normalizedMembers) {
      const duplicateIndex = memberDuplicateCounts.get(member.memberRef) ?? 0;
      memberDuplicateCounts.set(member.memberRef, duplicateIndex + 1);
      const rawPlayers = rawPlayerByMemberRef.get(member.memberRef.toLowerCase()) ?? [];
      memberRecords.push(toMemberSnapshot(scan, snapshot, member, duplicateIndex, rawPlayers[duplicateIndex] ?? rawPlayers[0] ?? null, progressValues));
      processedMembers += 1;
      if (processedMembers >= nextYieldAt) {
        reportProgress();
        nextYieldAt += 500;
        await (auditValue(__audit10, auditEnter(__audit10, "yieldToBrowser"), (yieldToBrowser())));
      }
    }
    memberObservationBuildMs += nowMs() - memberBuildStartedAt;

    const guildBuildStartedAt = nowMs();
    guildRecords.push(...(auditValue(__audit10, auditEnter(__audit10, "buildGuildSnapshotRecords", "sync-elapsed"), (buildGuildSnapshotRecords(scan, snapshot)))));
    guildObservationBuildMs += nowMs() - guildBuildStartedAt;
    processedSnapshots += 1;
    reportProgress();
    await (auditValue(__audit10, auditEnter(__audit10, "yieldToBrowser"), (yieldToBrowser())));
  }

  options?.onDiagnostic?.({
    phase: "member-observation-build",
    durationMs: memberObservationBuildMs,
    count: memberRecords.length,
    details: {
      sourceId: scan.id,
    },
  });
  options?.onDiagnostic?.({
    phase: "guild-observation-build",
    durationMs: guildObservationBuildMs,
    count: guildRecords.length,
    details: {
      sourceId: scan.id,
    },
  });

  return auditReturn(__audit10, {
    data: { snapshots: snapshotRecords, members: memberRecords, guilds: guildRecords },
    timings: {
      memberObservationBuildMs,
      guildObservationBuildMs,
    },
  });

    } catch (__auditError) { auditError(__audit10, __auditError); throw __auditError; }
    finally { auditLeave(__audit10); }
}

function toMemberSnapshot(
  scan: GuildHubLocalScan,
  snapshot: GuildHubLogicalScanSnapshot,
  member: NormalizedGuildMember,
  duplicateIndex: number,
  rawPlayer: JsonRecord | null,
  progressValues: WeakMap<object, ReturnType<typeof readProgressRadarAnalyticsValuesForPlayer> & { hofRank?: number | null }>,
): GuildAnalyticsMemberSnapshot {
  const guildIdentifier = buildMemberGuildIdentifier(member);
  const progress = rawPlayer ? progressValues.get(rawPlayer) : undefined;
  if (rawPlayer && !progress) throw new Error("Missing prepared analytics values for Raw member.");
  return {
    id: `${snapshot.id}::member::${member.memberRef}::${duplicateIndex}`,
    snapshotId: snapshot.id,
    sourceScanId: scan.id,
    sourceScanFilename: scan.filename,
    snapshotTimestamp: snapshot.timestampMs,
    memberRef: member.memberRef,
    name: member.name,
    classId: member.classId,
    level: member.level,
    hofRank: progress?.hofRank ?? (rawPlayer ? readPreparedPlayerHofRank(rawPlayer) : null),
    baseStats: member.baseStats,
    totalStats: member.totalStats,
    xpTotal: progress?.xpTotal ?? null,
    focusedBaseStats: progress?.focusedBaseStats ?? null,
    baseMain: progress?.baseMain ?? null, conBase: progress?.conBase ?? null,
    attrTotal: progress?.attrTotal ?? null, conTotal: progress?.conTotal ?? null,
    focusedTotalStats: progress?.focusedTotalStats ?? null,
    mine: progress?.mine ?? null, treasury: progress?.treasury ?? null,
    server: member.server,
    guildSegment: member.guildSegment,
    groupSegment: member.groupSegment,
    guildIdentifier,
    guildName: member.guildName,
  };
}

function readPreparedPlayerHofRank(player: JsonRecord): number | null {
  for (const source of [player, player.values, player.latestValues]) {
    if (!source || typeof source !== "object") continue;
    for (const key of ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]) {
      const raw = (source as JsonRecord)[key];
      if (raw == null || raw === "" || typeof raw === "boolean") continue;
      const rank = Number(raw);
      if (Number.isInteger(rank) && rank > 0) return rank;
    }
  }
  return null;
}

function buildRawPlayerLookup(snapshot: GuildHubLogicalScanSnapshot) {
  const lookup = new Map<string, JsonRecord[]>();
  const fallbackServer = normalizeGuildScanServer(snapshot.rawData.prefix ?? snapshot.rawData.server);
  for (const player of snapshot.players) {
    const record = asRecord(player);
    if (!record) continue;
    // Only the identity is needed to associate Raw rows with prepared members.
    const normalized = readGuildScanMemberIdentity(record, fallbackServer);
    if (!normalized) continue;
    const key = normalized.memberRef.toLowerCase();
    const entries = lookup.get(key) ?? [];
    entries.push(record);
    lookup.set(key, entries);
  }
  return lookup;
}

type GuildAggregateDraft = {
  snapshot: GuildHubLogicalScanSnapshot;
  server: string | null;
  guildSegment: string | null;
  guildIdentifier: string | null;
  guildName: string | null;
  memberCountOverride: number | null;
  declaredMemberCount?: number | null;
  members: NormalizedGuildMember[];
};

function buildGuildSnapshotRecords(
  scan: GuildHubLocalScan,
  snapshot: GuildHubLogicalScanSnapshot,
): GuildAnalyticsGuildSnapshot[] {
  const aggregates = new Map<string, GuildAggregateDraft>();

  for (const group of snapshot.groups) {
    const groupRecord = asRecord(group);
    if (!groupRecord) continue;
    const info = readGroupAnalyticsInfo(groupRecord);
    if (!info.key) continue;
    const draft = aggregates.get(info.key) ?? {
      snapshot,
      server: info.server,
      guildSegment: info.guildSegment,
      guildIdentifier: info.guildIdentifier,
      guildName: info.guildName,
      memberCountOverride: null,
      members: [],
    };
    draft.memberCountOverride = info.memberCount ?? draft.memberCountOverride;
    draft.declaredMemberCount = info.declaredMemberCount ?? draft.declaredMemberCount;
    draft.guildName = draft.guildName ?? info.guildName;
    aggregates.set(info.key, draft);
  }

  for (const member of snapshot.normalizedMembers) {
    const key = buildMemberGuildKey(member);
    if (!key) continue;
    const draft = aggregates.get(key) ?? {
      snapshot,
      server: member.server,
      guildSegment: member.guildSegment ?? member.groupSegment,
      guildIdentifier: buildMemberGuildIdentifier(member),
      guildName: member.guildName,
      memberCountOverride: null,
      members: [],
    };
    draft.members.push(member);
    draft.guildName = draft.guildName ?? member.guildName;
    aggregates.set(key, draft);
  }

  return [...aggregates.entries()].map(([key, draft]) => {
    const uniqueMembers = dedupeNormalizedSnapshotMembers(draft.members);
    const memberCount = draft.memberCountOverride ?? uniqueMembers.length;
    const completeMemberSet = uniqueMembers.length === memberCount;
    const levels = uniqueMembers.map((member) => member.level).filter(isFiniteNumber);
    const baseStats = uniqueMembers.map((member) => member.baseStats).filter(isFiniteNumber);
    const totalStats = uniqueMembers.map((member) => member.totalStats).filter(isFiniteNumber);

    return {
      id: `${snapshot.id}::guild::${key}`,
      snapshotId: snapshot.id,
      sourceScanId: scan.id,
      sourceScanFilename: scan.filename,
      snapshotTimestamp: snapshot.timestampMs,
      server: draft.server,
      guildSegment: draft.guildSegment,
      guildIdentifier: draft.guildIdentifier,
      guildName: draft.guildName,
      memberCount,
      declaredMemberCount: draft.declaredMemberCount ?? null,
      averageLevel: completeMemberSet && levels.length === memberCount ? average(levels) : null,
      averageBaseStats: completeMemberSet && baseStats.length === memberCount ? average(baseStats) : null,
      averageTotalStats: completeMemberSet && totalStats.length === memberCount ? average(totalStats) : null,
    };
  });
}

function dedupeNormalizedSnapshotMembers(members: NormalizedGuildMember[]) {
  const byRef = new Map<string, NormalizedGuildMember>();
  members.forEach((member) => {
    const previous = byRef.get(member.memberRef.toLowerCase());
    if (!previous || scoreNormalizedMemberValues(member) >= scoreNormalizedMemberValues(previous)) {
      byRef.set(member.memberRef.toLowerCase(), member);
    }
  });
  return [...byRef.values()];
}

function scoreNormalizedMemberValues(member: NormalizedGuildMember) {
  return (
    Number(isFiniteNumber(member.level)) +
    Number(isFiniteNumber(member.baseStats)) +
    Number(isFiniteNumber(member.totalStats))
  );
}

async function captureAnalyticsResetGenerations(db: IDBPDatabase<GuildAnalyticsDb>, sourceIds: string[]) {
  // Read one coherent reset inventory before any long work, including all sources
  // in an Ensure request. Reset equality must not be renewed mid-request.
  const resets = await localChangesDb(db).getAllFromIndex("localChanges", "by_kind", "reset");
  return new Map(sourceIds.map(id => [id, JSON.stringify(resets.filter(change => change.owner === "analytics" && (!change.sourceIds.length || change.sourceIds.includes(id))).map(change => change.sequence))]));
}

/** Durable equality certificate for in-memory local profile results. */
export async function readGuildAnalyticsResetCertificate(sourceIds: readonly string[]) {
  const generations = await captureAnalyticsResetGenerations(await getGuildAnalyticsDb(), [...sourceIds]);
  return JSON.stringify([...generations].sort(([a], [b]) => a.localeCompare(b)));
}

async function readAnalyticsResetGeneration(db: IDBPDatabase<GuildAnalyticsDb>, sourceId: string) {
  return readLocalResetGeneration(localChangesDb(db), "analytics", sourceId);
}

export async function readGuildAnalyticsChanges(after = 0) {
  return readLocalDataChanges(localChangesDb(await getGuildAnalyticsDb()), after);
}

/** Internal Derived owner maintenance only. No consumer/UI reset adapter. */
export async function resetGuildAnalyticsDerivedData() {
  const db = await getGuildAnalyticsDb();
  await commitLocalDataMutation(db, [SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], {
    owner: "analytics", kinds: ["reset"], sourceIds: [], removedSourceIds: [], servers: [], unknownImpact: true,
  }, async tx => {
    await Promise.all([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE].map(store => tx.objectStore(store as typeof SOURCE_STORE).clear()));
  });
}

async function deleteSourceRecords(db: IDBPDatabase<GuildAnalyticsDb>, sourceScanId: string, lease?: LocalDataWriteLease) {
  await commitLocalDataMutation(db, [SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], {
    owner: "analytics", kinds: ["reset"], sourceIds: [sourceScanId], removedSourceIds: [sourceScanId], servers: [], unknownImpact: true,
  }, async tx => {
    await Promise.all([
      tx.objectStore(SOURCE_STORE).delete(sourceScanId),
      deleteByIndex(tx.objectStore(SNAPSHOT_STORE).index("by_sourceScanId"), sourceScanId),
      deleteByIndex(tx.objectStore(MEMBER_STORE).index("by_sourceScanId"), sourceScanId),
      deleteByIndex(tx.objectStore(GUILD_STORE).index("by_sourceScanId"), sourceScanId),
    ]);
  }, lease);
}

type SourceDeleteIndex = {
  getAllKeys(query: string): Promise<string[]>;
  objectStore: {
    delete(key: string): Promise<unknown>;
  };
};

async function deleteByIndex(index: SourceDeleteIndex, value: string) {
  const keys = await index.getAllKeys(value);
  await Promise.all(keys.map((key) => index.objectStore.delete(key)));
}

function getSourceUpdatedAt(scan: GuildHubLocalScan) {
  return scan.updatedAt ?? scan.importedAt;
}

function getSummarySourceUpdatedAt(summary: GuildHubScanSummary) {
  return summary.updatedAtIso ?? summary.importedAtIso;
}

function buildMemberGuildIdentifier(member: Pick<NormalizedGuildMember, "server" | "guildSegment" | "groupSegment">) {
  const guildSegment = member.guildSegment ?? member.groupSegment;
  if (!guildSegment) return null;
  return member.server ? `${member.server}_${guildSegment}` : guildSegment;
}

function buildMemberGuildKey(member: NormalizedGuildMember) {
  const server = normalizeGuildScanServer(member.server);
  const segment = normalizeGuildSegmentForScan(member.guildSegment ?? member.groupSegment);
  if (segment) return `segment:${server ?? ""}:${segment}`;
  const name = normalizeLoose(member.guildName);
  return name ? `name:${server ?? ""}:${name}` : null;
}

export function readGroupAnalyticsInfo(group: JsonRecord) {
  const guildIdentifier = readFirstString(group, [
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
    readFirstString(group, ["server", "Server", "prefix", "world", "realm"]) ?? parseServerFromIdentifier(guildIdentifier),
  );
  const guildSegment = normalizeGuildSegmentForScan(guildIdentifier);
  const guildName = readFirstString(group, ["name", "Name", "groupname", "groupName", "guildName", "guild"]);
  const key = guildSegment
    ? `segment:${server ?? ""}:${guildSegment}`
    : normalizeLoose(guildName)
      ? `name:${server ?? ""}:${normalizeLoose(guildName)}`
      : null;

  return {
    key,
    server,
    guildSegment,
    guildIdentifier: guildSegment ? (server ? `${server}_${guildSegment}` : guildSegment) : null,
    guildName,
    declaredMemberCount: readDeclaredMemberCount(group) ?? null,
    memberCount: toFiniteNumberOrNull(readFirst(group, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"])),
  };
}

export function isDerivedMemberInGuild(
  member: Pick<GuildAnalyticsMemberSnapshot, "server" | "guildSegment" | "groupSegment" | "guildName">,
  guild: { name: string; server?: string | null; guildId?: string | null; logoIdentifier?: string | null },
) {
  return isNormalizedGuildMemberInGuild(
    {
      memberRef: "",
      name: "",
      classId: null,
      level: null,
      baseStats: null,
      totalStats: null,
      server: member.server,
      guildSegment: member.guildSegment,
      groupSegment: member.groupSegment,
      guildName: member.guildName,
      guildRole: null,
    },
    {
      name: guild.name,
      server: guild.server ?? null,
      guildSegment: normalizeGuildSegmentForScan(guild.logoIdentifier ?? guild.guildId),
    },
  );
}

export function isDerivedGuildSnapshotForGuild(
  snapshot: Pick<GuildAnalyticsGuildSnapshot, "server" | "guildSegment" | "guildName">,
  guild: { name: string; server?: string | null; guildId?: string | null; logoIdentifier?: string | null },
) {
  const guildServer = serverComparisonKey(guild.server);
  const snapshotServer = serverComparisonKey(snapshot.server);
  const serverMatches = !guildServer || !snapshotServer || guildServer === snapshotServer;
  const guildSegment = normalizeGuildSegmentForScan(guild.logoIdentifier ?? guild.guildId);

  if (guildSegment && snapshot.guildSegment === guildSegment && serverMatches) {
    return true;
  }

  return Boolean(snapshot.guildName && normalizeLoose(snapshot.guildName) === normalizeLoose(guild.name) && serverMatches);
}

function readFirst(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function readFirstString(record: JsonRecord, keys: string[]) {
  const value = readFirst(record, keys);
  const text = String(value ?? "").trim();
  return text || null;
}

function parseServerFromIdentifier(value: string | null) {
  const identifier = String(value ?? "").trim();
  const match = identifier.match(/^(.+)_[pg][^_]+$/i);
  return match?.[1] ?? null;
}

function asRecord(value: unknown): JsonRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function toFiniteNumberOrNull(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeLoose(value: unknown) {
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
