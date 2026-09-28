import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB, openDB, type DBSchema } from "idb";

import {
  buildGuildAnalyticsPlayerComparison,
  buildGuildAnalyticsSeries,
  type GuildAnalyticsGuildIdentity,
} from "../../src/lib/guilds/localGuildAnalytics.ts";
import {
  ensureGuildAnalyticsScopedDataFromSummaries,
  readGuildAnalyticsScopedData,
  type GuildAnalyticsDerivedSnapshot,
  type GuildAnalyticsGuildSnapshot,
  type GuildAnalyticsMemberSnapshot,
  type GuildAnalyticsSourceRecord,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import {
  buildGuildIdentityResolutionIndex,
  buildPlayerIdentityResolutionIndex,
  type IdentityResolutionSnapshot,
} from "../../src/lib/identities/identityResolution.ts";
import type { GuildAlias, GuildEntity } from "../../src/lib/identities/guildIdentityStore.ts";
import type { PlayerAlias, PlayerEntity } from "../../src/lib/identities/playerIdentityStore.ts";

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

const activeGuild: GuildAnalyticsGuildIdentity = {
  guildId: "f28_net_g1",
  logoIdentifier: "f28_net_g1",
  name: "Current Guild",
  server: "f28",
};

const playerEntity = (entityId: string): PlayerEntity => ({
  entityId,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

const playerAlias = (identifier: string, entityId: string): PlayerAlias => ({
  identifier,
  identifierKey: identifier.toLowerCase(),
  entityId,
  addedAt: "2026-09-01T00:00:00.000Z",
  source: "manual",
  confirmedAt: "2026-09-01T00:00:00.000Z",
});

const guildEntity = (entityId: string): GuildEntity => ({
  entityId,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

const guildAlias = (identifier: string, entityId: string): GuildAlias => ({
  identifier,
  identifierKey: identifier.toLowerCase(),
  entityId,
  addedAt: "2026-09-01T00:00:00.000Z",
  source: "manual",
  confirmedAt: "2026-09-01T00:00:00.000Z",
});

const identitySnapshot: IdentityResolutionSnapshot = {
  players: buildPlayerIdentityResolutionIndex([
    {
      entity: playerEntity("player_a"),
      aliases: [
        playerAlias("f2_p1", "player_a"),
        playerAlias("f6_p1", "player_a"),
        playerAlias("f28_p1", "player_a"),
      ],
    },
  ]),
  guilds: buildGuildIdentityResolutionIndex([
    {
      entity: guildEntity("guild_a"),
      aliases: [
        guildAlias("f6_g8", "guild_a"),
        guildAlias("f12_g9", "guild_a"),
        guildAlias("f28_g1", "guild_a"),
      ],
    },
  ]),
};

const snapshot = (id: string, timestamp: number): GuildAnalyticsDerivedSnapshot => ({
  id,
  sourceScanId: `source-${id}`,
  sourceScanFilename: `${id}.json`,
  sourceImportedAt: new Date(timestamp).toISOString(),
  timestamp: new Date(timestamp).toISOString(),
  snapshotTimestamp: timestamp,
});

const guildSnapshot = (
  snapshotId: string,
  timestamp: number,
  guildIdentifier: string,
  guildName: string,
  memberCount: number,
): GuildAnalyticsGuildSnapshot => ({
  id: `${snapshotId}::guild::${guildIdentifier}`,
  snapshotId,
  sourceScanId: `source-${snapshotId}`,
  sourceScanFilename: `${snapshotId}.json`,
  snapshotTimestamp: timestamp,
  server: guildIdentifier.split("_")[0] ?? null,
  guildSegment: guildIdentifier.split("_")[1] ?? null,
  guildIdentifier,
  guildName,
  memberCount,
  averageLevel: 100 + memberCount,
  averageBaseStats: 1000 + memberCount,
  averageTotalStats: 2000 + memberCount,
});

const memberSnapshot = (
  snapshotId: string,
  timestamp: number,
  memberRef: string,
  guildIdentifier: string,
  name: string,
): GuildAnalyticsMemberSnapshot => ({
  id: `${snapshotId}::member::${memberRef}`,
  snapshotId,
  sourceScanId: `source-${snapshotId}`,
  sourceScanFilename: `${snapshotId}.json`,
  snapshotTimestamp: timestamp,
  memberRef,
  name,
  classId: "1",
  level: Math.round(timestamp / 1000),
  baseStats: Math.round(timestamp / 10),
  totalStats: Math.round(timestamp / 5),
  xpTotal: null,
  focusedBaseStats: null,
  server: guildIdentifier.split("_")[0] ?? null,
  guildSegment: guildIdentifier.split("_")[1] ?? null,
  groupSegment: guildIdentifier.split("_")[1] ?? null,
  guildIdentifier,
  guildName: guildIdentifier === "f2_other" ? "Other Guild" : "Current Guild",
});

const snapshots = [
  snapshot("s-old-1", 1000),
  snapshot("s-old-2", 2000),
  snapshot("s-current", 3000),
  snapshot("s-player-foreign", 4000),
  snapshot("s-foreign", 5000),
];

const guilds = [
  guildSnapshot("s-old-1", 1000, "f6_g8", "Old Guild One", 3),
  guildSnapshot("s-old-2", 2000, "f12_g9", "Old Guild Two", 4),
  guildSnapshot("s-current", 3000, "f28_g1", "Current Guild", 5),
  guildSnapshot("s-foreign", 5000, "f28_g2", "Foreign Guild", 6),
];

const members = [
  memberSnapshot("s-old-1", 1000, "f6_p1", "f6_g8", "Player One"),
  memberSnapshot("s-old-1", 1000, "f6_p2", "f6_g8", "Guild Mate"),
  memberSnapshot("s-old-2", 2000, "f12_p2", "f12_g9", "Guild Mate"),
  memberSnapshot("s-current", 3000, "f28_p1", "f28_g1", "Player One"),
  memberSnapshot("s-current", 3000, "f28_p3", "f28_g1", "Current Mate"),
  memberSnapshot("s-player-foreign", 4000, "f2_p1", "f2_other", "Player One"),
  memberSnapshot("s-foreign", 5000, "f28_p999", "f28_g2", "Foreign Player"),
];

const globalData = { snapshots, members, guilds };

const openAnalyticsDb = () =>
  openDB<TestGuildAnalyticsDb>(DB_NAME, 1, {
    upgrade(db) {
      const sources = db.createObjectStore(SOURCE_STORE, { keyPath: "sourceScanId" });
      sources.createIndex("by_derivedVersion", "derivedVersion");

      const snapshotStore = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
      snapshotStore.createIndex("by_sourceScanId", "sourceScanId");
      snapshotStore.createIndex("by_snapshotTimestamp", "snapshotTimestamp");

      const memberStore = db.createObjectStore(MEMBER_STORE, { keyPath: "id" });
      memberStore.createIndex("by_sourceScanId", "sourceScanId");
      memberStore.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
      memberStore.createIndex("by_memberRef", "memberRef");
      memberStore.createIndex("by_guildIdentifier", "guildIdentifier");
      memberStore.createIndex("by_memberRefTimestamp", ["memberRef", "snapshotTimestamp"]);
      memberStore.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);

      const guildStore = db.createObjectStore(GUILD_STORE, { keyPath: "id" });
      guildStore.createIndex("by_sourceScanId", "sourceScanId");
      guildStore.createIndex("by_snapshotTimestamp", "snapshotTimestamp");
      guildStore.createIndex("by_guildIdentifier", "guildIdentifier");
      guildStore.createIndex("by_guildTimestamp", ["guildIdentifier", "snapshotTimestamp"]);
    },
  });

const seedAnalyticsDb = async () => {
  const db = await openAnalyticsDb();
  const tx = db.transaction([SOURCE_STORE, SNAPSHOT_STORE, MEMBER_STORE, GUILD_STORE], "readwrite");
  await Promise.all([
    ...snapshots.map((entry) => tx.objectStore(SNAPSHOT_STORE).put(entry)),
    ...members.map((entry) => tx.objectStore(MEMBER_STORE).put(entry)),
    ...guilds.map((entry) => tx.objectStore(GUILD_STORE).put(entry)),
  ]);
  await tx.done;
  db.close();
};

const ids = <T extends { id: string }>(records: readonly T[]) =>
  records.map((record) => record.id).sort();

const readModeDiagnostic = (
  entries: Array<{ phase: string; details?: Record<string, string | number | boolean | null> }>,
) => entries.find((entry) => entry.phase === "analytics-read-mode");

await deleteDB(DB_NAME);
await seedAnalyticsDb();

const scopedDiagnostics: Array<{ phase: string; details?: Record<string, string | number | boolean | null> }> = [];
const scopedData = await readGuildAnalyticsScopedData({
  guild: activeGuild,
  identitySnapshot,
  selectedPlayerRefs: ["f28_p1"],
  onDiagnostic: (entry) => scopedDiagnostics.push(entry),
});

assert.deepEqual(
  ids(scopedData.guilds),
  [
    "s-current::guild::f28_g1",
    "s-old-1::guild::f6_g8",
    "s-old-2::guild::f12_g9",
  ].sort(),
  "Scoped read should include all guild alias observations.",
);
assert.equal(
  scopedData.guilds.some((guild) => guild.guildIdentifier === "f28_g2"),
  false,
  "Foreign guild observations should stay out of the scoped read.",
);
assert.deepEqual(
  scopedData.members.map((member) => member.memberRef).sort(),
  ["f12_p2", "f28_p1", "f28_p3", "f2_p1", "f6_p1", "f6_p2"].sort(),
  "Scoped read should include guild members plus selected player history aliases.",
);
assert.equal(
  scopedData.members.some((member) => member.memberRef === "f28_p999"),
  false,
  "Foreign members should stay out unless requested through player history.",
);
assert.deepEqual(
  ids(scopedData.snapshots),
  ["s-current", "s-old-1", "s-old-2", "s-player-foreign"].sort(),
  "Scoped read should load only snapshot metadata referenced by scoped observations.",
);

const globalGuildSeries = buildGuildAnalyticsSeries(globalData, activeGuild, "memberCount", "all", identitySnapshot);
const scopedGuildSeries = buildGuildAnalyticsSeries(scopedData, activeGuild, "memberCount", "all", identitySnapshot);
assert.deepEqual(
  scopedGuildSeries.allPoints,
  globalGuildSeries.allPoints,
  "Guild history built from scoped data should match the global filtered result.",
);

const globalPlayerComparison = buildGuildAnalyticsPlayerComparison(
  globalData,
  activeGuild,
  "avgLevel",
  "all",
  ["f28_p1"],
  identitySnapshot,
);
const scopedPlayerComparison = buildGuildAnalyticsPlayerComparison(
  scopedData,
  activeGuild,
  "avgLevel",
  "all",
  ["f28_p1"],
  identitySnapshot,
);
assert.deepEqual(
  scopedPlayerComparison.guildSeries.allPoints,
  globalPlayerComparison.guildSeries.allPoints,
  "Guild series inside player comparison should match the global filtered result.",
);
assert.deepEqual(
  scopedPlayerComparison.playerSeries[0]?.points,
  globalPlayerComparison.playerSeries[0]?.points,
  "Player history over identity aliases should match the global filtered result.",
);
assert.equal(scopedDiagnostics.some((entry) => entry.phase === "scoped-derived-read"), true);
assert.equal(scopedDiagnostics[0]?.details?.guilds, 3);
assert.equal(scopedDiagnostics[0]?.details?.members, 6);
assert.equal(scopedDiagnostics[0]?.details?.snapshots, 4);

const productivePathDiagnostics: Array<{ phase: string; details?: Record<string, string | number | boolean | null> }> = [];
let loadSourceCallCount = 0;
const productivePathResult = await ensureGuildAnalyticsScopedDataFromSummaries([], {
  guild: activeGuild,
  identitySnapshot,
  selectedPlayerRefs: ["f28_p1"],
  loadSourceById: async () => {
    loadSourceCallCount += 1;
    return null;
  },
  onDiagnostic: (entry) => productivePathDiagnostics.push(entry),
});
const productiveReadMode = readModeDiagnostic(productivePathDiagnostics);

assert.equal(productivePathResult.mode, "scoped", "Productive summary ensure path should prefer scoped reads.");
assert.equal(productivePathResult.fallbackReason, null);
assert.equal(loadSourceCallCount, 0, "Current cache should not reload raw sources for the scoped read test fixture.");
assert.deepEqual(
  ids(productivePathResult.data.guilds),
  ids(scopedData.guilds),
  "Productive scoped path should return the same scoped guild observations.",
);
assert.deepEqual(
  ids(productivePathResult.data.snapshots),
  ids(scopedData.snapshots),
  "Productive scoped path should return the same referenced snapshots.",
);
assert.equal(productiveReadMode?.details?.mode, "scoped");
assert.equal(productiveReadMode?.details?.guilds, 3);
assert.equal(productiveReadMode?.details?.members, 6);
assert.equal(productiveReadMode?.details?.snapshots, 4);

const unmatchedIdentitySnapshot: IdentityResolutionSnapshot = {
  players: identitySnapshot.players,
  guilds: buildGuildIdentityResolutionIndex([
    {
      entity: guildEntity("guild_other"),
      aliases: [guildAlias("f28_g999", "guild_other")],
    },
  ]),
};
const fallbackDiagnostics: Array<{ phase: string; details?: Record<string, string | number | boolean | null> }> = [];
const fallbackResult = await ensureGuildAnalyticsScopedDataFromSummaries([], {
  guild: activeGuild,
  identitySnapshot: unmatchedIdentitySnapshot,
  selectedPlayerRefs: ["f28_p1"],
  loadSourceById: async () => null,
  onDiagnostic: (entry) => fallbackDiagnostics.push(entry),
});
const fallbackReadMode = readModeDiagnostic(fallbackDiagnostics);

assert.equal(fallbackResult.mode, "global-fallback", "Missing guild identity match should use the global fallback.");
assert.equal(fallbackResult.fallbackReason, "no-identity-match");
assert.equal(fallbackResult.data.guilds.length, globalData.guilds.length);
assert.equal(fallbackResult.data.members.length, globalData.members.length);
assert.equal(fallbackResult.data.snapshots.length, globalData.snapshots.length);
assert.equal(fallbackReadMode?.details?.mode, "global-fallback");
assert.equal(fallbackReadMode?.details?.fallbackReason, "no-identity-match");
assert.equal(fallbackReadMode?.details?.guilds, 4);
assert.equal(fallbackReadMode?.details?.members, 7);
assert.equal(fallbackReadMode?.details?.snapshots, 5);

console.log("localGuildAnalyticsScopedRead test passed");
