import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  isNormalizedGuildMemberInGuild,
  normalizeGuildScanMember,
  normalizeGuildScanServer,
  normalizeGuildSegmentForScan,
  type NormalizedGuildMember,
} from "./guildScanNormalizer";
import {
  deriveGuildHubLogicalScanSnapshots,
  isGuildHubScanAnalyticsEnabled,
  type GuildHubLocalScan,
  type GuildHubLogicalScanSnapshot,
  type GuildHubScanSummary,
} from "./localScanLibrary";
import {
  readProgressRadarCombinedBaseStatsForPlayer,
  readProgressRadarTotalXpForPlayer,
} from "../../pages/Playground/progressRadarModel";
import {
  resolveGuildIdentity,
  resolvePlayerIdentity,
  type IdentityResolutionSnapshot,
} from "../identities/identityResolution";

const GUILD_ANALYTICS_DB_NAME = "sfdatahub-guild-analytics";
const GUILD_ANALYTICS_DB_VERSION = 1;
export const DERIVED_ANALYTICS_VERSION = 3;

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
  materializedAt: string;
  snapshotCount: number;
};

export type GuildAnalyticsDerivedSnapshot = {
  id: string;
  sourceScanId: string;
  sourceScanFilename: string;
  sourceImportedAt: string;
  timestamp: string;
  snapshotTimestamp: number;
};

export type GuildAnalyticsMemberSnapshot = {
  id: string;
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  snapshotTimestamp: number;
  memberRef: string;
  name: string;
  classId: string | null;
  level: number | null;
  baseStats: number | null;
  totalStats: number | null;
  xpTotal: number | null;
  focusedBaseStats: number | null;
  server: string | null;
  guildSegment: string | null;
  groupSegment: string | null;
  guildIdentifier: string | null;
  guildName: string | null;
};

export type GuildAnalyticsGuildSnapshot = {
  id: string;
  snapshotId: string;
  sourceScanId: string;
  sourceScanFilename: string;
  snapshotTimestamp: number;
  server: string | null;
  guildSegment: string | null;
  guildIdentifier: string | null;
  guildName: string | null;
  memberCount: number;
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
};

export type GuildAnalyticsSummaryEnsureOptions = {
  loadSourceById: (sourceScanId: string) => Promise<GuildHubLocalScan | null>;
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void;
  onSourceDiagnostic?: (entry: GuildAnalyticsSourceDiagnostic) => void;
  onPhase?: (phase: GuildAnalyticsLoadPhaseUpdate) => void;
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

interface GuildAnalyticsDb extends DBSchema {
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
      upgrade(db) {
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
    });
  }

  return analyticsDbPromise;
}

export async function ensureGuildAnalyticsDerivedData(scans: GuildHubLocalScan[]): Promise<GuildAnalyticsDerivedData> {
  const db = await getGuildAnalyticsDb();
  const analyticsScans = scans.filter(isGuildHubScanAnalyticsEnabled);
  await reconcileGuildAnalyticsSources(db, analyticsScans);
  return readGuildAnalyticsDerivedDataFromDb(db);
}

export async function ensureGuildAnalyticsDerivedDataFromSummaries(
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
  await reconcileGuildAnalyticsSourcesFromSummaries(db, activeSummaries, options);
  options.onPhase?.({ phase: "loading-derived-analytics" });
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
  await reconcileGuildAnalyticsSourcesFromSummaries(db, activeSummaries, options);
  options.onPhase?.({ phase: "loading-derived-analytics" });

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

async function readGuildAnalyticsDerivedDataFromDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
  onDiagnostic?: (entry: GuildAnalyticsDiagnosticEntry) => void,
): Promise<GuildAnalyticsDerivedData> {
  const startedAt = nowMs();
  const [snapshots, members, guilds] = await Promise.all([
    db.getAll(SNAPSHOT_STORE),
    db.getAll(MEMBER_STORE),
    db.getAll(GUILD_STORE),
  ]);
  emitDiagnostic(onDiagnostic, "derived-read", startedAt, snapshots.length + members.length + guilds.length, {
    snapshots: snapshots.length,
    members: members.length,
    guilds: guilds.length,
  });

  return {
    snapshots: snapshots.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    members,
    guilds: guilds.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
  };
}

export async function readGuildAnalyticsDerivedSource(sourceScanId: string): Promise<GuildAnalyticsDerivedData> {
  const db = await getGuildAnalyticsDb();
  const [snapshots, members, guilds] = await Promise.all([
    db.getAllFromIndex(SNAPSHOT_STORE, "by_sourceScanId", sourceScanId),
    db.getAllFromIndex(MEMBER_STORE, "by_sourceScanId", sourceScanId),
    db.getAllFromIndex(GUILD_STORE, "by_sourceScanId", sourceScanId),
  ]);

  return {
    snapshots: snapshots.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    members,
    guilds: guilds.sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
  };
}

export async function readGuildAnalyticsScopedData(
  options: GuildAnalyticsScopedReadOptions,
): Promise<GuildAnalyticsDerivedData> {
  const startedAt = nowMs();
  const db = await getGuildAnalyticsDb();
  const guildIdentifiers = collectScopedGuildIdentifiers(options.guild, options.identitySnapshot);
  const selectedPlayerRefs = collectScopedPlayerRefs(
    options.selectedPlayerRefs ?? [],
    options.identitySnapshot,
  );

  const [guilds, guildMembers, playerMembers] = await Promise.all([
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
  ]);
  const members = sortMembersByTime(
    uniqueBy([...guildMembers, ...playerMembers], (member) => member.id),
  );
  const snapshotIds = new Set<string>();
  guilds.forEach((guild) => snapshotIds.add(guild.snapshotId));
  members.forEach((member) => snapshotIds.add(member.snapshotId));
  const snapshots = await readSnapshotsByIds(db, snapshotIds);

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

  return {
    snapshots,
    members,
    guilds: sortGuildsByTime(guilds),
  };
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
  const records = await Promise.all(values.map((value) => read(value)));
  return uniqueBy(records.flat(), getKey);
}

async function readSnapshotsByIds(
  db: IDBPDatabase<GuildAnalyticsDb>,
  snapshotIds: ReadonlySet<string>,
) {
  const snapshots = await Promise.all(
    [...snapshotIds].sort().map((snapshotId) => db.get(SNAPSHOT_STORE, snapshotId)),
  );
  return snapshots
    .filter((snapshot): snapshot is GuildAnalyticsDerivedSnapshot => Boolean(snapshot))
    .sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id));
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

export async function deleteGuildAnalyticsDerivedSources(sourceScanIds: string[]) {
  if (!sourceScanIds.length) return;
  const db = await getGuildAnalyticsDb();
  for (const sourceScanId of sourceScanIds) {
    await deleteSourceRecords(db, sourceScanId);
  }
}

async function reconcileGuildAnalyticsSources(db: IDBPDatabase<GuildAnalyticsDb>, scans: GuildHubLocalScan[]) {
  const existingSources = await db.getAll(SOURCE_STORE);
  const expectedIds = new Set(scans.map((scan) => scan.id));
  const hasVersionMismatch = existingSources.some((source) => source.derivedVersion !== DERIVED_ANALYTICS_VERSION);

  if (hasVersionMismatch) {
    await clearDerivedAnalyticsDb(db);
  } else {
    for (const source of existingSources) {
      if (!expectedIds.has(source.sourceScanId)) {
        await deleteSourceRecords(db, source.sourceScanId);
      }
    }
  }

  for (const scan of scans) {
    const source = await db.get(SOURCE_STORE, scan.id);
    if (isSourceCurrent(source, scan)) continue;
    await materializeSourceIntoDb(db, scan);
    await yieldToBrowser();
  }
}

async function reconcileGuildAnalyticsSourcesFromSummaries(
  db: IDBPDatabase<GuildAnalyticsDb>,
  summaries: GuildHubScanSummary[],
  options: GuildAnalyticsSummaryEnsureOptions,
) {
  options.onPhase?.({ phase: "checking-analytics-cache" });
  const versionCheckStartedAt = nowMs();
  const existingSources = await db.getAll(SOURCE_STORE);
  const existingById = new Map(existingSources.map((source) => [source.sourceScanId, source]));
  const activeSummaryById = new Map(summaries.map((summary) => [summary.sourceScanId, summary]));
  const hasVersionMismatch = existingSources.some((source) => source.derivedVersion !== DERIVED_ANALYTICS_VERSION);
  const storedVersions = Array.from(new Set(existingSources.map((source) => source.derivedVersion))).sort((a, b) => a - b);
  emitDiagnostic(options.onDiagnostic, "derived-version-check", versionCheckStartedAt, existingSources.length, {
    storedVersion: storedVersions.length === 1 ? storedVersions[0] : storedVersions.join(",") || "none",
    currentVersion: DERIVED_ANALYTICS_VERSION,
    hasVersionMismatch,
  });

  if (hasVersionMismatch) {
    const resetStartedAt = nowMs();
    await clearDerivedAnalyticsDb(db);
    emitDiagnostic(options.onDiagnostic, "derived-reset", resetStartedAt, 4, {
      storesCleared: "sources,snapshots,members,guilds",
    });
    existingById.clear();
  } else {
    for (const source of existingSources) {
      if (!activeSummaryById.has(source.sourceScanId)) {
        await deleteSourceRecords(db, source.sourceScanId);
        existingById.delete(source.sourceScanId);
      }
    }
  }

  const rebuildSummaries = summaries.filter((summary) => !isSourceCurrentForSummary(existingById.get(summary.sourceScanId), summary));
  const rematerializationStartedAt = nowMs();
  let rebuiltCount = 0;

  for (const summary of rebuildSummaries) {
    const source = existingById.get(summary.sourceScanId);
    if (isSourceCurrentForSummary(source, summary)) continue;

    options.onPhase?.({
      phase: "rebuilding-analytics-data",
      sourceIndex: rebuiltCount + 1,
      sourceCount: rebuildSummaries.length,
      sourceId: summary.sourceScanId,
    });
    const sourceStartedAt = nowMs();
    const rawSourceLoadStartedAt = nowMs();
    const scan = await options.loadSourceById(summary.sourceScanId);
    const rawSourceLoadMs = nowMs() - rawSourceLoadStartedAt;
    options.onDiagnostic?.({
      phase: "raw-source-load",
      durationMs: rawSourceLoadMs,
      count: scan ? 1 : 0,
      details: {
        sourceId: summary.sourceScanId,
      },
    });
    if (!scan || !isGuildHubScanAnalyticsEnabled(scan)) {
      await deleteSourceRecords(db, summary.sourceScanId);
      await yieldToBrowser();
      continue;
    }

    const emitSourcePhase = (phase: GuildAnalyticsLoadPhaseUpdate) =>
      options.onPhase?.({
        ...phase,
        sourceIndex: phase.sourceIndex ?? rebuiltCount + 1,
        sourceCount: phase.sourceCount ?? rebuildSummaries.length,
      });

    await materializeSourceIntoDb(db, scan, {
      onDiagnostic: options.onDiagnostic,
      onSourceDiagnostic: (entry) => {
        options.onSourceDiagnostic?.({
          ...entry,
          totalMs: nowMs() - sourceStartedAt,
          rawSourceLoadMs,
        });
      },
      onPhase: emitSourcePhase,
    });
    rebuiltCount += 1;
    await yieldToBrowser();
  }

  emitDiagnostic(options.onDiagnostic, "derived-rematerialization-total", rematerializationStartedAt, rebuiltCount, {
    rebuild: rebuiltCount > 0,
    rebuildSourceCount: rebuiltCount,
    candidateSourceCount: rebuildSummaries.length,
  });
}

function isSourceCurrent(source: GuildAnalyticsSourceRecord | undefined, scan: GuildHubLocalScan) {
  return (
    source?.derivedVersion === DERIVED_ANALYTICS_VERSION &&
    source.sourceUpdatedAt === getSourceUpdatedAt(scan) &&
    source.sourceContentHash === scan.contentHash
  );
}

function isSourceCurrentForSummary(source: GuildAnalyticsSourceRecord | undefined, summary: GuildHubScanSummary) {
  return (
    source?.derivedVersion === DERIVED_ANALYTICS_VERSION &&
    source.sourceUpdatedAt === getSummarySourceUpdatedAt(summary) &&
    Boolean(summary.contentHash) &&
    source.sourceContentHash === summary.contentHash
  );
}

async function materializeSourceIntoDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
  scan: GuildHubLocalScan,
  options?: GuildAnalyticsMaterializeOptions,
) {
  const normalizationDurations: number[] = [];
  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });
  const snapshotBuildStartedAt = nowMs();
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan, {
    onNormalizedSnapshotCreated: (durationMs) => normalizationDurations.push(durationMs),
  });
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
  const { data: records, timings } = await buildDerivedRecords(scan, snapshots, options);

  const sourceWriteStartedAt = nowMs();
  await deleteSourceRecords(db, scan.id);

  options?.onPhase?.({ phase: "saving-derived-analytics", sourceId: scan.id });
  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  const snapshotWriteStartedAt = nowMs();
  await Promise.all(records.snapshots.map((snapshot) => tx.objectStore(SNAPSHOT_STORE).put(snapshot)));
  emitDiagnostic(options?.onDiagnostic, "derived-snapshots-write", snapshotWriteStartedAt, records.snapshots.length, {
    sourceId: scan.id,
  });
  const memberWriteStartedAt = nowMs();
  await Promise.all(records.members.map((member) => tx.objectStore(MEMBER_STORE).put(member)));
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
      materializedAt: new Date().toISOString(),
      snapshotCount: records.snapshots.length,
    });
  emitDiagnostic(options?.onDiagnostic, "derived-sources-write", sourceRecordWriteStartedAt, 1, {
    sourceId: scan.id,
  });
  await tx.done;
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
}

async function buildDerivedRecords(
  scan: GuildHubLocalScan,
  snapshots: GuildHubLogicalScanSnapshot[],
  options?: GuildAnalyticsMaterializeOptions,
): Promise<{
  data: GuildAnalyticsDerivedData;
  timings: {
    memberObservationBuildMs: number;
    guildObservationBuildMs: number;
  };
}> {
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
    const rawPlayerByMemberRef = buildRawPlayerLookup(snapshot);
    const memberBuildStartedAt = nowMs();
    for (const member of snapshot.normalizedMembers) {
      const duplicateIndex = memberDuplicateCounts.get(member.memberRef) ?? 0;
      memberDuplicateCounts.set(member.memberRef, duplicateIndex + 1);
      const rawPlayers = rawPlayerByMemberRef.get(member.memberRef.toLowerCase()) ?? [];
      memberRecords.push(toMemberSnapshot(scan, snapshot, member, duplicateIndex, rawPlayers[duplicateIndex] ?? rawPlayers[0] ?? null));
      processedMembers += 1;
      if (processedMembers >= nextYieldAt) {
        reportProgress();
        nextYieldAt += 500;
        await yieldToBrowser();
      }
    }
    memberObservationBuildMs += nowMs() - memberBuildStartedAt;

    const guildBuildStartedAt = nowMs();
    guildRecords.push(...buildGuildSnapshotRecords(scan, snapshot));
    guildObservationBuildMs += nowMs() - guildBuildStartedAt;
    processedSnapshots += 1;
    reportProgress();
    await yieldToBrowser();
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

  return {
    data: { snapshots: snapshotRecords, members: memberRecords, guilds: guildRecords },
    timings: {
      memberObservationBuildMs,
      guildObservationBuildMs,
    },
  };
}

function toMemberSnapshot(
  scan: GuildHubLocalScan,
  snapshot: GuildHubLogicalScanSnapshot,
  member: NormalizedGuildMember,
  duplicateIndex: number,
  rawPlayer: JsonRecord | null,
): GuildAnalyticsMemberSnapshot {
  const guildIdentifier = buildMemberGuildIdentifier(member);
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
    baseStats: member.baseStats,
    totalStats: member.totalStats,
    xpTotal: rawPlayer ? readProgressRadarTotalXpForPlayer(rawPlayer) : null,
    focusedBaseStats: rawPlayer ? readProgressRadarCombinedBaseStatsForPlayer(rawPlayer) : null,
    server: member.server,
    guildSegment: member.guildSegment,
    groupSegment: member.groupSegment,
    guildIdentifier,
    guildName: member.guildName,
  };
}

function buildRawPlayerLookup(snapshot: GuildHubLogicalScanSnapshot) {
  const lookup = new Map<string, JsonRecord[]>();
  const fallbackServer = normalizeGuildScanServer(snapshot.rawData.prefix ?? snapshot.rawData.server);
  for (const player of snapshot.players) {
    const record = asRecord(player);
    if (!record) continue;
    const normalized = normalizeGuildScanMember(record, fallbackServer);
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

async function clearDerivedAnalyticsDb(db: IDBPDatabase<GuildAnalyticsDb>) {
  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  await Promise.all([
    tx.objectStore(SOURCE_STORE).clear(),
    tx.objectStore(SNAPSHOT_STORE).clear(),
    tx.objectStore(MEMBER_STORE).clear(),
    tx.objectStore(GUILD_STORE).clear(),
  ]);
  await tx.done;
}

async function deleteSourceRecords(db: IDBPDatabase<GuildAnalyticsDb>, sourceScanId: string) {
  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  await Promise.all([
    tx.objectStore(SOURCE_STORE).delete(sourceScanId),
    deleteByIndex(tx.objectStore(SNAPSHOT_STORE).index("by_sourceScanId"), sourceScanId),
    deleteByIndex(tx.objectStore(MEMBER_STORE).index("by_sourceScanId"), sourceScanId),
    deleteByIndex(tx.objectStore(GUILD_STORE).index("by_sourceScanId"), sourceScanId),
  ]);
  await tx.done;
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

function readGroupAnalyticsInfo(group: JsonRecord) {
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
  const guildServer = normalizeGuildScanServer(guild.server);
  const snapshotServer = normalizeGuildScanServer(snapshot.server);
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
