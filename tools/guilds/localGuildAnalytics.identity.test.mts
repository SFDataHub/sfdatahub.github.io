import assert from "node:assert/strict";

import {
  buildGuildAnalyticsPlayerComparison,
  buildGuildAnalyticsProgressReport,
  buildGuildAnalyticsSeries,
  type GuildAnalyticsGuildIdentity,
} from "../../src/lib/guilds/localGuildAnalytics.ts";
import type {
  GuildAnalyticsDerivedData,
  GuildAnalyticsGuildSnapshot,
  GuildAnalyticsMemberSnapshot,
} from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import {
  buildGuildIdentityResolutionIndex,
  buildPlayerIdentityResolutionIndex,
  type IdentityResolutionSnapshot,
} from "../../src/lib/identities/identityResolution.ts";
import type { GuildAlias, GuildEntity } from "../../src/lib/identities/guildIdentityStore.ts";
import type { PlayerAlias, PlayerEntity } from "../../src/lib/identities/playerIdentityStore.ts";

const activeGuild: GuildAnalyticsGuildIdentity = {
  guildId: "f28_g1",
  logoIdentifier: "f28_g1",
  name: "Current Guild",
  server: "f28",
};

const entity = (entityId: string, createdAt: string): PlayerEntity => ({
  entityId,
  createdAt,
  updatedAt: createdAt,
});

const alias = (identifier: string, entityId: string, addedAt: string): PlayerAlias => ({
  identifier,
  identifierKey: identifier.toLowerCase(),
  entityId,
  addedAt,
  source: "manual",
  confirmedAt: addedAt,
});

const guildEntity = (entityId: string, createdAt: string): GuildEntity => ({
  entityId,
  createdAt,
  updatedAt: createdAt,
});

const guildAlias = (identifier: string, entityId: string, addedAt: string): GuildAlias => ({
  identifier,
  identifierKey: identifier.toLowerCase(),
  entityId,
  addedAt,
  source: "manual",
  confirmedAt: addedAt,
});

const playerIdentitySnapshot: IdentityResolutionSnapshot = {
  players: buildPlayerIdentityResolutionIndex([
    {
      entity: entity("player_a", "2026-09-01T00:00:00.000Z"),
      aliases: [
        alias("old_ref", "player_a", "2026-09-01T00:00:00.000Z"),
        alias("intermediate_ref", "player_a", "2026-09-02T00:00:00.000Z"),
        alias("current_ref", "player_a", "2026-09-03T00:00:00.000Z"),
      ],
    },
    {
      entity: entity("player_b", "2026-09-04T00:00:00.000Z"),
      aliases: [
        alias("b1", "player_b", "2026-09-04T00:00:00.000Z"),
        alias("b2", "player_b", "2026-09-05T00:00:00.000Z"),
      ],
    },
  ]),
  guilds: { byIdentifier: new Map(), byIdentityId: new Map() },
};

const guildIdentitySnapshot: IdentityResolutionSnapshot = {
  players: playerIdentitySnapshot.players,
  guilds: buildGuildIdentityResolutionIndex([
    {
      entity: guildEntity("guild_a", "2026-09-01T00:00:00.000Z"),
      aliases: [
        guildAlias("s3_g7", "guild_a", "2026-09-01T00:00:00.000Z"),
        guildAlias("f6_g8", "guild_a", "2026-09-02T00:00:00.000Z"),
        guildAlias("f28_g1", "guild_a", "2026-09-03T00:00:00.000Z"),
      ],
    },
    {
      entity: guildEntity("guild_b", "2026-09-04T00:00:00.000Z"),
      aliases: [
        guildAlias("f28_other", "guild_b", "2026-09-04T00:00:00.000Z"),
        guildAlias("s9_other", "guild_b", "2026-09-05T00:00:00.000Z"),
      ],
    },
  ]),
};

const snapshot = (id: string, timestamp: number) => ({
  id,
  sourceScanId: id,
  sourceScanFilename: `${id}.json`,
  sourceImportedAt: new Date(timestamp).toISOString(),
  timestamp: new Date(timestamp).toISOString(),
  snapshotTimestamp: timestamp,
});

const guildSnapshot = (snapshotId: string, timestamp: number): GuildAnalyticsGuildSnapshot => ({
  id: `${snapshotId}::guild`,
  snapshotId,
  sourceScanId: snapshotId,
  sourceScanFilename: `${snapshotId}.json`,
  snapshotTimestamp: timestamp,
  server: "f28",
  guildSegment: "g1",
  guildIdentifier: "f28_g1",
  guildName: "Current Guild",
  memberCount: 50,
  averageLevel: 525,
  averageBaseStats: 1_000_000,
  averageTotalStats: 2_000_000,
});

const guildSnapshotForIdentifier = (
  snapshotId: string,
  timestamp: number,
  guildIdentifier: string,
  guildName: string,
  memberCount: number,
  averageLevel: number,
): GuildAnalyticsGuildSnapshot => {
  const [server, guildSegment] = guildIdentifier.split("_");
  return {
    id: `${snapshotId}::guild::${guildIdentifier}`,
    snapshotId,
    sourceScanId: snapshotId,
    sourceScanFilename: `${snapshotId}.json`,
    snapshotTimestamp: timestamp,
    server: server ?? null,
    guildSegment: guildSegment ?? null,
    guildIdentifier,
    guildName,
    memberCount,
    averageLevel,
    averageBaseStats: averageLevel * 1_000,
    averageTotalStats: averageLevel * 2_000,
  };
};

const member = (
  id: string,
  snapshotId: string,
  timestamp: number,
  memberRef: string,
  name: string,
  level: number,
  guildIdentifier: string,
  guildName: string,
): GuildAnalyticsMemberSnapshot => {
  const [server, guildSegment] = guildIdentifier.split("_");
  return {
    id,
    snapshotId,
    sourceScanId: snapshotId,
    sourceScanFilename: `${snapshotId}.json`,
    snapshotTimestamp: timestamp,
    memberRef,
    name,
    classId: null,
    level,
    baseStats: level * 100,
    totalStats: level * 200,
    server: server ?? null,
    guildSegment: guildSegment ?? null,
    groupSegment: guildSegment ?? null,
    guildIdentifier,
    guildName,
  };
};

const timestamps = [
  Date.UTC(2025, 10, 1),
  Date.UTC(2026, 1, 1),
  Date.UTC(2026, 5, 1),
  Date.UTC(2026, 8, 1),
  Date.UTC(2026, 8, 15),
  Date.UTC(2026, 9, 1),
];

const data: GuildAnalyticsDerivedData = {
  snapshots: timestamps.map((timestamp, index) => snapshot(`scan-${index + 1}`, timestamp)),
  guilds: timestamps.map((timestamp, index) => guildSnapshot(`scan-${index + 1}`, timestamp)),
  members: [
    member("obs-old-1", "scan-1", timestamps[0], "old_ref", "OldName", 500, "s3_g7", "Guild A"),
    member("obs-old-2", "scan-2", timestamps[1], "old_ref", "OldName", 510, "s3_g8", "Guild B"),
    member("obs-mid", "scan-3", timestamps[2], "intermediate_ref", "MiddleName", 520, "f6_g9", "Guild C"),
    member("obs-current-1", "scan-4", timestamps[3], "current_ref", "NewName", 530, "f28_g1", "Current Guild"),
    member("obs-current-duplicate", "scan-4", timestamps[3], "current_ref", "NewName", 530, "f28_g1", "Current Guild"),
    member("obs-other-identity", "scan-5", timestamps[4], "b1", "Other", 999, "f28_g1", "Current Guild"),
    member("obs-unresolved", "scan-6", timestamps[5], "solo_ref", "Solo", 540, "f28_g1", "Current Guild"),
    member("obs-name-heuristic-trap", "scan-6", timestamps[5], "unlinked_same_name", "NewName", 777, "f28_g1", "Current Guild"),
  ],
};

const buildSelectedHistory = (selectedRef: string, snapshotInput: IdentityResolutionSnapshot | null = playerIdentitySnapshot) =>
  buildGuildAnalyticsPlayerComparison(data, activeGuild, "avgLevel", "all", [selectedRef], snapshotInput)
    .playerSeries[0]?.points ?? [];

const historyFromCurrent = buildSelectedHistory("current_ref");
const historyFromOld = buildSelectedHistory("old_ref");
const historyFromIntermediate = buildSelectedHistory("intermediate_ref");

assert.deepEqual(
  historyFromCurrent.map((point) => point.value),
  [500, 510, 520, 530],
);
assert.deepEqual(
  historyFromOld.map((point) => point.scanId),
  historyFromCurrent.map((point) => point.scanId),
);
assert.deepEqual(
  historyFromIntermediate.map((point) => point.scanId),
  historyFromCurrent.map((point) => point.scanId),
);

assert.deepEqual(
  historyFromCurrent.map((point) => point.playerName),
  ["OldName", "OldName", "MiddleName", "NewName"],
);
assert.deepEqual(
  historyFromCurrent.map((point) => point.guildName),
  ["Guild A", "Guild B", "Guild C", "Current Guild"],
);
assert.deepEqual(
  historyFromCurrent.map((point) => point.membership),
  ["otherGuild", "otherGuild", "otherGuild", "currentGuild"],
);
assert.deepEqual(
  historyFromCurrent.map((point) => point.scannedAtMs),
  [...historyFromCurrent.map((point) => point.scannedAtMs)].sort((left, right) => left - right),
);
assert.equal(historyFromCurrent.some((point) => point.value === 999), false);
assert.equal(historyFromCurrent.some((point) => point.value === 777), false);
assert.equal(historyFromCurrent.filter((point) => point.scanId === "scan-4").length, 1);

const unresolvedRawHistory = buildSelectedHistory("solo_ref");
const unresolvedLegacyHistory = buildSelectedHistory("solo_ref", null);
assert.deepEqual(unresolvedRawHistory, unresolvedLegacyHistory);
assert.deepEqual(
  unresolvedRawHistory.map((point) => point.value),
  [540],
);

const otherIdentityHistory = buildSelectedHistory("b2");
assert.deepEqual(
  otherIdentityHistory.map((point) => point.value),
  [999],
);

const missingPeriodHistory = buildSelectedHistory("current_ref").filter((point) => point.value != null);
assert.equal(missingPeriodHistory.length, 4);
assert.equal(missingPeriodHistory.some((point) => point.scanId === "scan-5"), false);
assert.equal(missingPeriodHistory.some((point) => point.scanId === "scan-6"), false);

const guildData: GuildAnalyticsDerivedData = {
  snapshots: timestamps.map((timestamp, index) => snapshot(`guild-scan-${index + 1}`, timestamp)),
  guilds: [
    guildSnapshotForIdentifier("guild-scan-1", timestamps[0], "s3_g7", "Old Guild", 40, 500),
    guildSnapshotForIdentifier("guild-scan-2", timestamps[1], "s3_g7", "Old Guild", 42, 510),
    guildSnapshotForIdentifier("guild-scan-3", timestamps[2], "f6_g8", "Middle Guild", 44, 520),
    guildSnapshotForIdentifier("guild-scan-4", timestamps[3], "f28_g1", "Current Guild", 46, 530),
    guildSnapshotForIdentifier("guild-scan-5", timestamps[4], "f28_other", "Other Guild", 99, 999),
    guildSnapshotForIdentifier("guild-scan-6", timestamps[5], "solo_g1", "Solo Guild", 51, 540),
    guildSnapshotForIdentifier("guild-scan-6", timestamps[5], "same_name_trap", "Current Guild", 88, 777),
  ],
  members: [
    member("guild-member-old-1", "guild-scan-1", timestamps[0], "stable_member", "Stable", 500, "s3_g7", "Old Guild"),
    member("guild-member-old-2", "guild-scan-2", timestamps[1], "stable_member", "Stable", 510, "s3_g7", "Old Guild"),
    member("guild-member-mid", "guild-scan-3", timestamps[2], "stable_member", "Stable", 520, "f6_g8", "Middle Guild"),
    member("guild-member-current", "guild-scan-4", timestamps[3], "stable_member", "Stable", 530, "f28_g1", "Current Guild"),
    member("guild-member-other", "guild-scan-5", timestamps[4], "other_member", "Other", 999, "f28_other", "Other Guild"),
    member("guild-member-solo", "guild-scan-6", timestamps[5], "solo_member", "Solo", 540, "solo_g1", "Solo Guild"),
    member("guild-member-name-trap", "guild-scan-6", timestamps[5], "trap_member", "Trap", 777, "same_name_trap", "Current Guild"),
  ],
};

const activeCurrentGuild: GuildAnalyticsGuildIdentity = {
  guildId: "f28_g1",
  logoIdentifier: "f28_g1",
  name: "Current Guild",
  server: "f28",
};
const activeOldGuild: GuildAnalyticsGuildIdentity = {
  guildId: "s3_g7",
  logoIdentifier: "s3_g7",
  name: "Old Guild",
  server: "s3",
};
const activeIntermediateGuild: GuildAnalyticsGuildIdentity = {
  guildId: "f6_g8",
  logoIdentifier: "f6_g8",
  name: "Middle Guild",
  server: "f6",
};
const activeSoloGuild: GuildAnalyticsGuildIdentity = {
  guildId: "solo_g1",
  logoIdentifier: "solo_g1",
  name: "Solo Guild",
  server: "solo",
};
const activeOtherGuild: GuildAnalyticsGuildIdentity = {
  guildId: "f28_other",
  logoIdentifier: "f28_other",
  name: "Other Guild",
  server: "f28",
};

const currentGuildSeries = buildGuildAnalyticsSeries(guildData, activeCurrentGuild, "memberCount", "all", guildIdentitySnapshot);
const oldGuildSeries = buildGuildAnalyticsSeries(guildData, activeOldGuild, "memberCount", "all", guildIdentitySnapshot);
const intermediateGuildSeries = buildGuildAnalyticsSeries(guildData, activeIntermediateGuild, "memberCount", "all", guildIdentitySnapshot);

assert.deepEqual(
  currentGuildSeries.allPoints.map((point) => point.values.memberCount),
  [40, 42, 44, 46],
);
assert.deepEqual(
  oldGuildSeries.allPoints.map((point) => point.scanId),
  currentGuildSeries.allPoints.map((point) => point.scanId),
);
assert.deepEqual(
  intermediateGuildSeries.allPoints.map((point) => point.scanId),
  currentGuildSeries.allPoints.map((point) => point.scanId),
);
assert.equal(currentGuildSeries.allPoints.some((point) => point.values.memberCount === 99), false);
assert.equal(currentGuildSeries.allPoints.some((point) => point.values.memberCount === 88), false);

const currentLevelSeries = buildGuildAnalyticsSeries(guildData, activeCurrentGuild, "avgLevel", "all", guildIdentitySnapshot);
assert.deepEqual(
  currentLevelSeries.allPoints.map((point) => point.values.avgLevel),
  [500, 510, 520, 530],
);

const soloSeriesWithSnapshot = buildGuildAnalyticsSeries(guildData, activeSoloGuild, "memberCount", "all", guildIdentitySnapshot);
const soloSeriesLegacy = buildGuildAnalyticsSeries(guildData, activeSoloGuild, "memberCount", "all", null);
assert.deepEqual(soloSeriesWithSnapshot, soloSeriesLegacy);
assert.deepEqual(
  soloSeriesWithSnapshot.allPoints.map((point) => point.values.memberCount),
  [51],
);

const otherGuildSeries = buildGuildAnalyticsSeries(guildData, activeOtherGuild, "memberCount", "all", guildIdentitySnapshot);
assert.deepEqual(
  otherGuildSeries.allPoints.map((point) => point.values.memberCount),
  [99],
);

const progressReport = buildGuildAnalyticsProgressReport(guildData, activeCurrentGuild, "monthly", guildIdentitySnapshot);
assert.ok(progressReport);
assert.equal(progressReport.baseline.values.memberCount, 44);
assert.equal(progressReport.current.values.memberCount, 46);
assert.deepEqual(
  progressReport.players.map((player) => [player.memberRef, player.levelDelta]),
  [["stable_member", 10]],
);

console.log("localGuildAnalytics identity test passed");
