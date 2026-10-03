import assert from "node:assert/strict";
import {
  buildGuildAnalyticsSeries,
} from "../../src/lib/guilds/localGuildAnalytics";
import type {
  GuildAnalyticsDerivedData,
  GuildAnalyticsMemberSnapshot,
} from "../../src/lib/guilds/localGuildAnalyticsStore";
import {
  buildGuildIdentityResolutionIndex,
  buildPlayerIdentityResolutionIndex,
  type IdentityResolutionSnapshot,
} from "../../src/lib/identities/identityResolution";
import {
  buildGuildTrendModel,
  buildPlayerPerformanceModel,
} from "../../src/pages/Playground/playerPerformanceModel";

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const END = START + DAY_MS * 10;

const tests = [
  {
    name: "Gildentrend nutzt 50 Snapshot-Mitglieder statt 30 Identity-Matches",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, members("a", "f28_g1", 1, 50, 1_000, 100)),
        guildSnapshot("b", END, "f28_g1", 50, members("b", "f28_g1", 1, 50, 2_000, 200)),
      ]);
      const result = buildGuildTrendModel({ analyticsData: data, guildTarget: { guildId: "f28_g1", server: "f28" } });
      assert.equal(result.status, "ready");
      assert.equal(result.snapshots[0].declaredMemberCount, 50);
      assert.equal(result.snapshots[0].foundUniqueMemberCount, 50);
      assert.equal(result.snapshots[0].averageXpTotal, averageRange(1_000, 1_049));
      assert.equal(result.intervals[0].xp.absoluteGrowth, 1_000);
    },
  },
  {
    name: "Intervallreferenz mittelt Start und Ende aus ihren jeweiligen damaligen Kadern",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, [
          member("a", "f28_g1", "target", 1_000, 100),
          ...members("a", "f28_g1", 1, 49, 1_001, 101),
        ]),
        guildSnapshot("b", END, "f28_g1", 50, [
          member("b", "f28_g1", "target", 2_000, 200),
          ...members("b", "f28_g1", 26, 49, 2_001, 201),
        ]),
      ]);
      const result = buildPlayerPerformanceModel([], {
        analyticsData: data,
        target: { name: "Target", server: "f28", memberRef: "target" },
      });
      assert.equal(result.status, "ready");
      assert.equal(result.segments[0].guildReference.xpPerDay.start?.memberCount, 50);
      assert.equal(result.segments[0].guildReference.xpPerDay.end?.memberCount, 50);
      assert.equal(result.segments[0].guildReference.xpPerDay.start?.average, (1_000 + averageRange(1_001, 1_049) * 49) / 50);
      assert.equal(result.segments[0].guildReference.xpPerDay.end?.average, (2_000 + averageRange(2_001, 2_049) * 49) / 50);
    },
  },
  {
    name: "deklarierte 50 und gefundene 49 werden als unvollstaendig ausgeschlossen",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, members("a", "f28_g1", 1, 49, 1_000, 100)),
      ]);
      const result = buildGuildTrendModel({ analyticsData: data, guildTarget: { guildId: "f28_g1", server: "f28" } });
      assert.equal(result.snapshots.length, 0);
      assert.match(result.excludedGuildSnapshots[0].exclusionReason ?? "", /49.*50/);
    },
  },
  {
    name: "50 Member mit 49 XP-Werten sind fuer XP/Performance unbrauchbar",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, members("a", "f28_g1", 1, 50, 1_000, 100, { missingXpAt: 50 })),
      ]);
      const result = buildGuildTrendModel({ analyticsData: data, guildTarget: { guildId: "f28_g1", server: "f28" } });
      assert.equal(result.snapshots.length, 0);
      assert.match(result.excludedGuildSnapshots[0].exclusionReason ?? "", /XP Total.*49\/50/);
    },
  },
  {
    name: "50 Member mit 49 Basiswerten sind fuer Basiswerte/Performance unbrauchbar",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, members("a", "f28_g1", 1, 50, 1_000, 100, { missingBaseAt: 50 })),
      ]);
      const result = buildGuildTrendModel({ analyticsData: data, guildTarget: { guildId: "f28_g1", server: "f28" } });
      assert.equal(result.snapshots.length, 0);
      assert.match(result.excludedGuildSnapshots[0].exclusionReason ?? "", /Basiswerte.*49\/50/);
    },
  },
  {
    name: "Guild Analytics bildet Durchschnitt nur bei vollstaendiger Metrikabdeckung",
    run() {
      const data = analyticsData([
        guildSnapshot("a", START, "f28_g1", 50, members("a", "f28_g1", 1, 50, 1_000, 100, { missingStoredBaseAt: 50 })),
      ]);
      const series = buildGuildAnalyticsSeries(data, { name: "Guild", guildId: "f28_g1", server: "f28" }, "avgBaseStats", "all");
      assert.equal(series.allPoints.length, 0);
      const memberSeries = buildGuildAnalyticsSeries(data, { name: "Guild", guildId: "f28_g1", server: "f28" }, "memberCount", "all");
      assert.equal(memberSeries.allPoints[0].values.memberCount, 50);
    },
  },
  {
    name: "Fusion-Aliase waehlen historische Gilde, danach gilt der exakte damalige Kader",
    run() {
      const data = analyticsData([
        guildSnapshot("old", START, "f27_g9", 50, members("old", "f27_g9", 1, 50, 1_000, 100)),
        guildSnapshot("new", END, "f28_g9", 50, members("new", "f28_g9", 51, 50, 3_000, 300)),
        guildSnapshot("other", END, "f27_g9", 50, members("other", "f27_g9", 101, 50, 9_000, 900)),
      ]);
      const result = buildGuildTrendModel({
        analyticsData: data,
        identityResolutionSnapshot: guildIdentity(["f27_g9", "f28_g9"]),
        guildTarget: { guildId: "f28_g9", server: "f28" },
      });
      assert.deepEqual(result.snapshots.map((snapshot) => snapshot.guildIdentifier), ["f27_g9", "f28_g9"]);
      assert.equal(result.snapshots[0].averageXpTotal, averageRange(1_000, 1_049));
      assert.equal(result.snapshots[1].averageXpTotal, averageRange(3_000, 3_049));
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}

function guildIdentity(identifiers: string[]): IdentityResolutionSnapshot {
  const entityId = "guild_identity_1";
  return {
    players: buildPlayerIdentityResolutionIndex([]),
    guilds: buildGuildIdentityResolutionIndex([
      {
        entity: { entityId, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        aliases: identifiers.map((identifier, index) => ({
          identifier,
          identifierKey: identifier.toLowerCase(),
          entityId,
          addedAt: new Date(START + index * DAY_MS).toISOString(),
          source: "manual" as const,
          confirmedAt: new Date(START + index * DAY_MS).toISOString(),
        })),
      },
    ]),
  };
}

function analyticsData(rows: ReturnType<typeof guildSnapshot>[]): GuildAnalyticsDerivedData {
  return {
    snapshots: rows.map((row) => ({
      id: row.snapshotId,
      sourceScanId: row.sourceScanId,
      sourceScanFilename: `${row.sourceScanId}.json`,
      sourceImportedAt: new Date(row.timestamp).toISOString(),
      timestamp: new Date(row.timestamp).toISOString(),
      snapshotTimestamp: row.timestamp,
    })),
    guilds: rows.map((row) => ({
      id: `guild-${row.snapshotId}-${row.guildIdentifier}`,
      snapshotId: row.snapshotId,
      sourceScanId: row.sourceScanId,
      sourceScanFilename: `${row.sourceScanId}.json`,
      snapshotTimestamp: row.timestamp,
      server: row.guildIdentifier.split("_")[0] ?? null,
      guildSegment: row.guildIdentifier.split("_")[1] ?? null,
      guildIdentifier: row.guildIdentifier,
      guildName: "Guild",
      memberCount: row.memberCount,
      averageLevel: null,
      averageBaseStats: null,
      averageTotalStats: null,
    })),
    members: rows.flatMap((row) => row.members),
  };
}

function guildSnapshot(
  id: string,
  timestamp: number,
  guildIdentifier: string,
  memberCount: number,
  snapshotMembers: GuildAnalyticsMemberSnapshot[],
) {
  return {
    snapshotId: `snapshot-${id}`,
    sourceScanId: `scan-${id}`,
    timestamp,
    guildIdentifier,
    memberCount,
    members: snapshotMembers.map((snapshotMember) => ({
      ...snapshotMember,
      snapshotId: `snapshot-${id}`,
      sourceScanId: `scan-${id}`,
      sourceScanFilename: `scan-${id}.json`,
      snapshotTimestamp: timestamp,
    })),
  };
}

function members(
  snapshotId: string,
  guildIdentifier: string,
  startIndex: number,
  count: number,
  xpStart: number,
  baseStart: number,
  options: { missingXpAt?: number; missingBaseAt?: number; missingStoredBaseAt?: number } = {},
) {
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return member(
      snapshotId,
      guildIdentifier,
      `member-${index}`,
      options.missingXpAt === offset + 1 ? null : xpStart + offset,
      options.missingBaseAt === offset + 1 ? null : baseStart + offset,
      options.missingStoredBaseAt === offset + 1 ? null : baseStart + offset,
    );
  });
}

function member(
  snapshotId: string,
  guildIdentifier: string,
  ref: string,
  xpTotal: number | null,
  focusedBaseStats: number | null,
  storedBaseStats = focusedBaseStats,
): GuildAnalyticsMemberSnapshot {
  return {
    id: `${snapshotId}-${ref}`,
    snapshotId: `snapshot-${snapshotId}`,
    sourceScanId: `scan-${snapshotId}`,
    sourceScanFilename: `scan-${snapshotId}.json`,
    snapshotTimestamp: START,
    memberRef: ref,
    name: ref === "target" ? "Target" : `Member ${ref}`,
    classId: null,
    level: 500,
    baseStats: storedBaseStats,
    totalStats: storedBaseStats == null ? null : storedBaseStats * 5,
    xpTotal,
    focusedBaseStats,
    server: guildIdentifier.split("_")[0] ?? null,
    guildSegment: guildIdentifier.split("_")[1] ?? null,
    groupSegment: guildIdentifier.split("_")[1] ?? null,
    guildIdentifier,
    guildName: "Guild",
  };
}

function averageRange(start: number, end: number) {
  return (start + end) / 2;
}
