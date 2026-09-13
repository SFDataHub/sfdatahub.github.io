import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  isNormalizedGuildMemberInGuild,
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

const GUILD_ANALYTICS_DB_NAME = "sfdatahub-guild-analytics";
const GUILD_ANALYTICS_DB_VERSION = 1;
export const DERIVED_ANALYTICS_VERSION = 1;

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

export type GuildAnalyticsMaterializeOptions = {
  onProgress?: (progress: GuildAnalyticsMaterializeProgress) => void;
};

export type GuildAnalyticsSummaryEnsureOptions = {
  loadSourceById: (sourceScanId: string) => Promise<GuildHubLocalScan | null>;
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
  await reconcileGuildAnalyticsSourcesFromSummaries(db, activeSummaries, options);
  return readGuildAnalyticsDerivedDataFromDb(db);
}

async function readGuildAnalyticsDerivedDataFromDb(
  db: IDBPDatabase<GuildAnalyticsDb>,
): Promise<GuildAnalyticsDerivedData> {
  const [snapshots, members, guilds] = await Promise.all([
    db.getAll(SNAPSHOT_STORE),
    db.getAll(MEMBER_STORE),
    db.getAll(GUILD_STORE),
  ]);

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
  const existingSources = await db.getAll(SOURCE_STORE);
  const existingById = new Map(existingSources.map((source) => [source.sourceScanId, source]));
  const activeSummaryById = new Map(summaries.map((summary) => [summary.sourceScanId, summary]));
  const hasVersionMismatch = existingSources.some((source) => source.derivedVersion !== DERIVED_ANALYTICS_VERSION);

  if (hasVersionMismatch) {
    await clearDerivedAnalyticsDb(db);
    existingById.clear();
  } else {
    for (const source of existingSources) {
      if (!activeSummaryById.has(source.sourceScanId)) {
        await deleteSourceRecords(db, source.sourceScanId);
        existingById.delete(source.sourceScanId);
      }
    }
  }

  for (const summary of summaries) {
    const source = existingById.get(summary.sourceScanId);
    if (isSourceCurrentForSummary(source, summary)) continue;

    const scan = await options.loadSourceById(summary.sourceScanId);
    if (!scan || !isGuildHubScanAnalyticsEnabled(scan)) {
      await deleteSourceRecords(db, summary.sourceScanId);
      await yieldToBrowser();
      continue;
    }

    await materializeSourceIntoDb(db, scan);
    await yieldToBrowser();
  }
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
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  const records = await buildDerivedRecords(scan, snapshots, options);

  await deleteSourceRecords(db, scan.id);

  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  await Promise.all([
    ...records.snapshots.map((snapshot) => tx.objectStore(SNAPSHOT_STORE).put(snapshot)),
    ...records.members.map((member) => tx.objectStore(MEMBER_STORE).put(member)),
    ...records.guilds.map((guild) => tx.objectStore(GUILD_STORE).put(guild)),
    tx.objectStore(SOURCE_STORE).put({
      sourceScanId: scan.id,
      sourceUpdatedAt: getSourceUpdatedAt(scan),
      sourceContentHash: scan.contentHash,
      derivedVersion: DERIVED_ANALYTICS_VERSION,
      materializedAt: new Date().toISOString(),
      snapshotCount: records.snapshots.length,
    }),
  ]);
  await tx.done;
}

async function buildDerivedRecords(
  scan: GuildHubLocalScan,
  snapshots: GuildHubLogicalScanSnapshot[],
  options?: GuildAnalyticsMaterializeOptions,
): Promise<GuildAnalyticsDerivedData> {
  const snapshotRecords: GuildAnalyticsDerivedSnapshot[] = [];
  const memberRecords: GuildAnalyticsMemberSnapshot[] = [];
  const guildRecords: GuildAnalyticsGuildSnapshot[] = [];
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
    for (const member of snapshot.normalizedMembers) {
      const duplicateIndex = memberDuplicateCounts.get(member.memberRef) ?? 0;
      memberDuplicateCounts.set(member.memberRef, duplicateIndex + 1);
      memberRecords.push(toMemberSnapshot(scan, snapshot, member, duplicateIndex));
      processedMembers += 1;
      if (processedMembers >= nextYieldAt) {
        reportProgress();
        nextYieldAt += 500;
        await yieldToBrowser();
      }
    }

    guildRecords.push(...buildGuildSnapshotRecords(scan, snapshot));
    processedSnapshots += 1;
    reportProgress();
    await yieldToBrowser();
  }

  return { snapshots: snapshotRecords, members: memberRecords, guilds: guildRecords };
}

function toMemberSnapshot(
  scan: GuildHubLocalScan,
  snapshot: GuildHubLogicalScanSnapshot,
  member: NormalizedGuildMember,
  duplicateIndex: number,
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
    server: member.server,
    guildSegment: member.guildSegment,
    groupSegment: member.groupSegment,
    guildIdentifier,
    guildName: member.guildName,
  };
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
    const levels = draft.members.map((member) => member.level).filter(isFiniteNumber);
    const baseStats = draft.members.map((member) => member.baseStats).filter(isFiniteNumber);
    const totalStats = draft.members.map((member) => member.totalStats).filter(isFiniteNumber);

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
      memberCount: draft.memberCountOverride ?? draft.members.length,
      averageLevel: average(levels),
      averageBaseStats: average(baseStats),
      averageTotalStats: average(totalStats),
    };
  });
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
