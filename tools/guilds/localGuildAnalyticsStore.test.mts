import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB, openDB, type DBSchema } from "idb";

import {
  DERIVED_ANALYTICS_VERSION,
  ensureGuildAnalyticsDerivedDataFromSummaries,
  type GuildAnalyticsDiagnosticEntry,
  type GuildAnalyticsGuildSnapshot,
  type GuildAnalyticsLoadPhaseUpdate,
  type GuildAnalyticsMemberSnapshot,
  type GuildAnalyticsSourceRecord,
  type GuildAnalyticsSourceDiagnostic,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";

const DB_NAME = "sfdatahub-guild-analytics";
const SOURCE_STORE = "sources";
const SNAPSHOT_STORE = "snapshots";
const MEMBER_STORE = "members";
const GUILD_STORE = "guilds";

interface TestGuildAnalyticsDb extends DBSchema {
  sources: {
    key: string;
    value: GuildAnalyticsSourceRecord;
  };
  snapshots: {
    key: string;
    value: {
      id: string;
      sourceScanId: string;
      sourceScanFilename: string;
      sourceImportedAt: string;
      timestamp: string;
      snapshotTimestamp: number;
    };
  };
  members: {
    key: string;
    value: GuildAnalyticsMemberSnapshot;
  };
  guilds: {
    key: string;
    value: GuildAnalyticsGuildSnapshot;
  };
}

const packLowerShort = (low: number, high = 0) => low + (high << 16);

const buildCurrentSave = (
  id: number,
  level: number,
  classId: number,
  bases: readonly number[],
  bonuses: readonly number[],
) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = id;
  save[3] = packLowerShort(level);
  save[20] = packLowerShort(classId);
  bases.forEach((value, index) => {
    save[30 + index] = value;
  });
  bonuses.forEach((value, index) => {
    save[35 + index] = value;
  });
  return save;
};

const sourceScanId = "scan-v2-rematerialize";
const sourceUpdatedAt = "2026-09-27T08:00:00.000Z";
const sourceContentHash = "content-hash-v2";
const snapshotTimestamp = Date.UTC(2026, 8, 27, 8);
const snapshotIso = new Date(snapshotTimestamp).toISOString();

const summary: GuildHubScanSummary = {
  sourceScanId,
  filename: "scan.json",
  importedAt: Date.parse(sourceUpdatedAt),
  updatedAt: Date.parse(sourceUpdatedAt),
  importedAtIso: sourceUpdatedAt,
  updatedAtIso: sourceUpdatedAt,
  scannedAt: snapshotIso,
  logicalScanCount: 1,
  firstSnapshotTimestamp: snapshotTimestamp,
  lastSnapshotTimestamp: snapshotTimestamp,
  snapshotTimestamps: [snapshotTimestamp],
  servers: ["s3"],
  playerCount: 1,
  groupCount: 1,
  guildCount: 1,
  guilds: [],
  guildCoverage: {
    completeGuildSnapshotCount: 0,
    incompleteGuildSnapshotCount: 0,
    overcountGuildSnapshotCount: 0,
    unknownGuildSnapshotCount: 0,
    partialMemberSnapshotCount: 0,
    rosterOnlyGuildSnapshotCount: 0,
  },
  contentHash: sourceContentHash,
  summaryVersion: 5,
};

const scan: GuildHubLocalScan = {
  id: sourceScanId,
  contentHash: sourceContentHash,
  filename: "scan.json",
  importedAt: sourceUpdatedAt,
  updatedAt: sourceUpdatedAt,
  scannedAt: snapshotIso,
  servers: ["s3"],
  playerCount: 1,
  groupCount: 1,
  guildCount: 1,
  analyticsEnabled: true,
  rawData: {
    players: [
      {
        identifier: "s3_p101",
        name: "Stats Holder",
        prefix: "s3",
        guildIdentifier: "s3_g7",
        guildName: "Guild A",
        timestamp: snapshotTimestamp,
        own: 1,
        saveVersion: 2,
        save: buildCurrentSave(101, 500, 1, [100, 110, 120, 130, 140], [10, 11, 12, 13, 14]),
      },
    ],
    groups: [],
  },
};

const openAnalyticsDb = () =>
  openDB<TestGuildAnalyticsDb>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SOURCE_STORE)) {
        const sources = db.createObjectStore(SOURCE_STORE, { keyPath: "sourceScanId" });
        sources.createIndex("by_derivedVersion", "derivedVersion");
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
        snapshots.createIndex("by_sourceScanId", "sourceScanId");
        snapshots.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
      }
      if (!db.objectStoreNames.contains(MEMBER_STORE)) {
        const members = db.createObjectStore(MEMBER_STORE, { keyPath: "id" });
        members.createIndex("by_sourceScanId", "sourceScanId");
        members.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
        members.createIndex("by_memberRef", "memberRef");
        members.createIndex("by_guildIdentifier", "guildIdentifier");
        members.createIndex("by_memberRefTimestamp", ["memberRef", "snapshotTimestamp"]);
        members.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);
      }
      if (!db.objectStoreNames.contains(GUILD_STORE)) {
        const guilds = db.createObjectStore(GUILD_STORE, { keyPath: "id" });
        guilds.createIndex("by_sourceScanId", "sourceScanId");
        guilds.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
        guilds.createIndex("by_guildIdentifier", "guildIdentifier");
        guilds.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);
      }
    },
  });

const seedDerivedData = async (derivedVersion: number) => {
  const db = await openAnalyticsDb();
  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  await Promise.all([
    tx.objectStore(SOURCE_STORE).clear(),
    tx.objectStore(SNAPSHOT_STORE).clear(),
    tx.objectStore(MEMBER_STORE).clear(),
    tx.objectStore(GUILD_STORE).clear(),
  ]);
  await Promise.all([
    tx.objectStore(SOURCE_STORE).put({
      sourceScanId,
      sourceUpdatedAt,
      sourceContentHash,
      derivedVersion,
      materializedAt: "2026-09-27T08:01:00.000Z",
      snapshotCount: 1,
    }),
    tx.objectStore(SNAPSHOT_STORE).put({
      id: "stale-snapshot",
      sourceScanId,
      sourceScanFilename: "scan.json",
      sourceImportedAt: sourceUpdatedAt,
      timestamp: snapshotIso,
      snapshotTimestamp,
    }),
    tx.objectStore(MEMBER_STORE).put({
      id: "stale-member",
      snapshotId: "stale-snapshot",
      sourceScanId,
      sourceScanFilename: "scan.json",
      snapshotTimestamp,
      memberRef: "s3_p101",
      name: "Stats Holder",
      classId: null,
      level: 500,
      baseStats: 0,
      totalStats: 0,
      server: "s3",
      guildSegment: "g7",
      groupSegment: "g7",
      guildIdentifier: "s3_g7",
      guildName: "Guild A",
    }),
    tx.objectStore(GUILD_STORE).put({
      id: "stale-guild",
      snapshotId: "stale-snapshot",
      sourceScanId,
      sourceScanFilename: "scan.json",
      snapshotTimestamp,
      server: "s3",
      guildSegment: "g7",
      guildIdentifier: "s3_g7",
      guildName: "Guild A",
      memberCount: 1,
      averageLevel: 500,
      averageBaseStats: 0,
      averageTotalStats: 0,
    }),
  ]);
  await tx.done;
  db.close();
};

const readStoredSource = async () => {
  const db = await openAnalyticsDb();
  const source = await db.get(SOURCE_STORE, sourceScanId);
  db.close();
  return source;
};

await deleteDB(DB_NAME);

await seedDerivedData(1);
let loadSourceCount = 0;
const rebuildDiagnostics: GuildAnalyticsDiagnosticEntry[] = [];
const rebuildSourceDiagnostics: GuildAnalyticsSourceDiagnostic[] = [];
const rebuildPhases: GuildAnalyticsLoadPhaseUpdate[] = [];
const rebuilt = await ensureGuildAnalyticsDerivedDataFromSummaries([summary], {
  loadSourceById: async (requestedSourceScanId) => {
    loadSourceCount += 1;
    assert.equal(requestedSourceScanId, sourceScanId);
    return scan;
  },
  onDiagnostic: (entry) => rebuildDiagnostics.push(entry),
  onSourceDiagnostic: (entry) => rebuildSourceDiagnostics.push(entry),
  onPhase: (phase) => rebuildPhases.push(phase),
});

assert.equal(DERIVED_ANALYTICS_VERSION, 3);
assert.equal(loadSourceCount, 1);
assert.equal(rebuilt.members.length, 1);
assert.equal(rebuilt.members[0].baseStats, 600);
assert.equal(rebuilt.members[0].totalStats, 660);
assert.equal(rebuilt.guilds[0].averageBaseStats, 600);
assert.equal(rebuilt.guilds[0].averageTotalStats, 660);
assert.equal((await readStoredSource())?.derivedVersion, DERIVED_ANALYTICS_VERSION);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "derived-version-check"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "derived-reset"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "raw-source-load"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "normalization-total"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "member-observation-build"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "guild-observation-build"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "derived-members-write"), true);
assert.equal(rebuildDiagnostics.some((entry) => entry.phase === "derived-read"), true);
assert.equal(rebuildSourceDiagnostics.length, 1);
assert.equal(rebuildSourceDiagnostics[0].sourceId, sourceScanId);
assert.equal(rebuildSourceDiagnostics[0].snapshotCount, 1);
assert.equal(rebuildSourceDiagnostics[0].memberObservationCount, 1);
const rebuildPhase = rebuildPhases.find((phase) => phase.phase === "rebuilding-analytics-data");
assert.ok(rebuildPhase);
assert.equal(rebuildPhase.sourceIndex, 1);
assert.equal(rebuildPhase.sourceCount, 1);
assert.equal(rebuildPhases.some((phase) => phase.phase === "normalizing-historical-data" && phase.sourceIndex === 1), true);
assert.equal(rebuildPhases.some((phase) => phase.phase === "saving-derived-analytics" && phase.sourceIndex === 1), true);

await seedDerivedData(DERIVED_ANALYTICS_VERSION);
loadSourceCount = 0;
const currentDiagnostics: GuildAnalyticsDiagnosticEntry[] = [];
const currentPhases: GuildAnalyticsLoadPhaseUpdate[] = [];
const current = await ensureGuildAnalyticsDerivedDataFromSummaries([summary], {
  loadSourceById: async () => {
    loadSourceCount += 1;
    return scan;
  },
  onDiagnostic: (entry) => currentDiagnostics.push(entry),
  onPhase: (phase) => currentPhases.push(phase),
});

assert.equal(loadSourceCount, 0);
assert.equal(current.members.length, 1);
assert.equal(current.members[0].id, "stale-member");
assert.equal(current.members[0].baseStats, 0);
assert.equal(current.members[0].totalStats, 0);
assert.equal((await readStoredSource())?.derivedVersion, DERIVED_ANALYTICS_VERSION);
assert.equal(currentDiagnostics.some((entry) => entry.phase === "derived-version-check"), true);
assert.equal(currentDiagnostics.some((entry) => entry.phase === "derived-reset"), false);
assert.equal(currentDiagnostics.some((entry) => entry.phase === "raw-source-load"), false);
assert.equal(currentPhases.some((phase) => phase.phase === "rebuilding-analytics-data"), false);

console.log("localGuildAnalyticsStore test passed");
