import assert from "node:assert/strict";
import { buildGuildIdentityResolutionIndex, type IdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution";
import type { GuildAnalyticsDerivedData, GuildAnalyticsMemberSnapshot } from "../../src/lib/guilds/localGuildAnalyticsStore";
import type { PlayerPerformanceSnapshot } from "../../src/pages/Playground/playerPerformanceModel";
import { buildTimeAxisTicks } from "../../src/components/local-player-profile/LocalPlayerAnalytics";
import {
  buildChartTimeDomain,
  buildComparisonOptions,
  buildGuildAverageSnapshotsForRange,
  buildPeriodRateSummary,
  buildStatsSeries,
  buildXpSeries,
} from "../../src/components/local-player-profile/localPlayerAnalyticsModel";

const DAY_MS = 86_400_000;
const APRIL = Date.UTC(2026, 3, 1);
const APRIL_HALF_DAY = APRIL + DAY_MS / 2;
const MAY = Date.UTC(2026, 4, 1);
const JUNE = Date.UTC(2026, 5, 1);
const SEPTEMBER = Date.UTC(2026, 8, 28);

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "aktueller Guild-Identifier wird erkannt",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "s1_g1", [100, 300]),
        guildRow("current", SEPTEMBER, "s1_g1", [400, 600]),
      ]);
      const options = buildComparisonOptions({ analyticsData: data, currentTimestamp: SEPTEMBER, guildIdentifier: "s1_g1" });
      assert.deepEqual(options.map((option) => option.timestamp), [APRIL]);
    },
  },
  {
    name: "historischer Vorfusions-Identifier derselben Guild-Identity wird erkannt",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7", "f1_g7"]),
      });
      assert.deepEqual(options.map((option) => option.timestamp), [APRIL]);
    },
  },
  {
    name: "transitive bestätigte Fusion-Lineage wird erkannt",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("mid", MAY, "f2_g7", [200, 400]),
        guildRow("current", SEPTEMBER, "f3_g7", [500, 700]),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f3_g7",
        identityResolutionSnapshot: guildIdentity(["f3_g7", "f2_g7", "f1_g7"]),
      });
      assert.deepEqual(options.map((option) => option.timestamp), [MAY, APRIL]);
    },
  },
  {
    name: "unbeteiligte oder nur gleichnamige Gilde wird ausgeschlossen",
    run() {
      const data = analyticsData([
        guildRow("other", APRIL, "other_g7", [100, 300], "Same Name"),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600], "Same Name"),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7"]),
      });
      assert.deepEqual(options, []);
    },
  },
  {
    name: "Future-Fusion wird nicht vorzeitig einbezogen",
    run() {
      const data = analyticsData([
        guildRow("future", APRIL, "future_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7"]),
      });
      assert.deepEqual(options, []);
    },
  },
  {
    name: "vollständiger Vorfusionsscan erscheint als Vergleichsoption",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7", "f1_g7"]),
      });
      assert.equal(options.length, 1);
      assert.equal(options[0].sourceScanId, "scan-old");
    },
  },
  {
    name: "fehlender Spieler entfernt vollständigen Gildenscan nicht aus der Auswahl",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const options = buildComparisonOptions({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7", "f1_g7"]),
      });
      assert.equal(options.length, 1);
    },
  },
  {
    name: "persönliche XP-Serie verwendet absolute xpTotal-Snapshotwerte",
    run() {
      const series = buildXpSeries(
        [
          playerSnapshot(APRIL, 1_000, 120),
          playerSnapshot(MAY, 1_500, 130),
          playerSnapshot(SEPTEMBER, 1_300, 140),
        ],
        [],
        "Hero",
      );
      assert.deepEqual(series.series[0].points.map((point) => point.value), [1_000, 1_500, 1_300]);
    },
  },
  {
    name: "xpPerDayTrend wird nicht mehr als Graph-Y-Wert verwendet",
    run() {
      const snapshot = { ...playerSnapshot(APRIL, 1_000, 120), xpPerDayTrend: 999_999 } as PlayerPerformanceSnapshot & {
        xpPerDayTrend: number;
      };
      const series = buildXpSeries([snapshot], [], "Hero");
      assert.equal(series.series[0].points[0].value, 1_000);
    },
  },
  {
    name: "echte Zwischenpunkte bleiben erhalten",
    run() {
      const series = buildXpSeries(
        [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(MAY, 1_500, 130), playerSnapshot(SEPTEMBER, 2_000, 140)],
        [],
        "Hero",
      );
      assert.deepEqual(series.series[0].points.map((point) => point.timestamp), [APRIL, MAY, SEPTEMBER]);
    },
  },
  {
    name: "keine künstlichen Start- oder Endpunkte entstehen",
    run() {
      const series = buildXpSeries([playerSnapshot(MAY, 1_500, 130)], [], "Hero");
      assert.deepEqual(series.series[0].points.map((point) => point.timestamp), [MAY]);
    },
  },
  {
    name: "XP und Base Stats verwenden dieselbe explizite Zeitdomain",
    run() {
      assert.deepEqual(buildChartTimeDomain(APRIL, SEPTEMBER), { min: APRIL, max: SEPTEMBER });
    },
  },
  {
    name: "Tickdomain bleibt der gewählte Zeitraum, auch wenn XP-Punkte erst später beginnen",
    run() {
      const ticks = buildTimeAxisTicks(APRIL, SEPTEMBER, 578);
      assert.equal(ticks[0].timestamp, APRIL);
      assert.equal(ticks[ticks.length - 1].timestamp, SEPTEMBER);
      assert.equal(new Set(ticks.map((tick) => tick.label)).size, ticks.length);
    },
  },
  {
    name: "focusedBaseStats bleibt Hauptbasiswert plus Basis-Ausdauer",
    run() {
      const stats = buildStatsSeries([playerSnapshot(APRIL, 1_000, 120)]);
      assert.equal(stats.series[0].points[0].value, 120);
    },
  },
  {
    name: "absolute Gildenlinie verwendet Snapshot-Average statt Tagesrate",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const snapshots = buildGuildAverageSnapshotsForRange({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7", "f1_g7"]),
        selectedTimestamp: APRIL,
      });
      assert.deepEqual(
        snapshots.map((snapshot) => snapshot.averageXpTotal),
        [200, 500],
      );
    },
  },
  {
    name: "Player-XP/Tag nutzt exakt Start- und End-xpTotal",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(SEPTEMBER, 2_000, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.player, 1_000 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Player-Base-Stats/Tag nutzt exakt Start- und End-focusedBaseStats",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(SEPTEMBER, 2_000, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "base",
      });
      assert.equal(summary.player, 40 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Zeitraeume unter einem Tag verwenden eine gebrochene Tagesdauer",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(APRIL_HALF_DAY, 1_500, 125)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: APRIL_HALF_DAY,
        metric: "xp",
      });
      assert.equal(summary.player, 1_000);
    },
  },
  {
    name: "xpPerDayTrend beeinflusst die neue Zeitraum-KPI nicht",
    run() {
      const start = { ...playerSnapshot(APRIL, 1_000, 120), xpPerDayTrend: 999_999 } as PlayerPerformanceSnapshot & {
        xpPerDayTrend: number;
      };
      const end = { ...playerSnapshot(SEPTEMBER, 2_000, 160), xpPerDayTrend: 1 } as PlayerPerformanceSnapshot & {
        xpPerDayTrend: number;
      };
      const summary = buildPeriodRateSummary({
        playerSnapshots: [start, end],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.player, 1_000 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Zwischenpunkte beeinflussen die endpointbasierte KPI nicht",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [
          playerSnapshot(APRIL, 1_000, 120),
          playerSnapshot(MAY, 9_999_999, 999),
          playerSnapshot(SEPTEMBER, 2_000, 160),
        ],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.player, 1_000 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "fehlender Spieler am ausgewaehlten Startscan ergibt null",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(SEPTEMBER, 2_000, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.player, null);
    },
  },
  {
    name: "ein spaeterer Spielerpunkt wird nicht als Ersatzstart verwendet",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(MAY, 1_500, 140), playerSnapshot(SEPTEMBER, 2_000, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.player, null);
    },
  },
  {
    name: "fehlender Endwert betrifft nur die jeweilige Kennzahl",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(SEPTEMBER, null, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      const baseSummary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(SEPTEMBER, null, 160)],
        guildAverageSnapshots: [],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "base",
      });
      assert.equal(summary.player, null);
      assert.equal(baseSummary.player, 40 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Guild-XP/Tag verwendet absolute Start-/End-Averages vollstaendiger Snapshots",
    run() {
      const guildAverageSnapshots = [
        guildAverageSnapshot(APRIL, 200, 100),
        guildAverageSnapshot(SEPTEMBER, 500, 130),
      ];
      const summary = buildPeriodRateSummary({
        playerSnapshots: [],
        guildAverageSnapshots,
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.guildAverage, 300 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Guild-Base-Stats/Tag verwendet absolute Start-/End-Averages",
    run() {
      const guildAverageSnapshots = [
        guildAverageSnapshot(APRIL, 200, 100),
        guildAverageSnapshot(SEPTEMBER, 500, 130),
      ];
      const summary = buildPeriodRateSummary({
        playerSnapshots: [],
        guildAverageSnapshots,
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "base",
      });
      assert.equal(summary.guildAverage, 30 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "Vorfusionsstart wird ueber die bestehende Guild-Identity aufgeloest",
    run() {
      const data = analyticsData([
        guildRow("old", APRIL, "f1_g7", [100, 300]),
        guildRow("current", SEPTEMBER, "f2_g7", [400, 600]),
      ]);
      const guildAverageSnapshots = buildGuildAverageSnapshotsForRange({
        analyticsData: data,
        currentTimestamp: SEPTEMBER,
        guildIdentifier: "f2_g7",
        identityResolutionSnapshot: guildIdentity(["f2_g7", "f1_g7"]),
        selectedTimestamp: APRIL,
      });
      const summary = buildPeriodRateSummary({
        playerSnapshots: [],
        guildAverageSnapshots,
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.guildAverage, 300 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "fehlender exakter Guild-Endpunkt ergibt keinen Ersatzwert",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [],
        guildAverageSnapshots: [guildAverageSnapshot(APRIL, 200, 100), guildAverageSnapshot(MAY, 500, 130)],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.guildAverage, null);
    },
  },
  {
    name: "negative Gildenentwicklung bleibt negativ",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [],
        guildAverageSnapshots: [guildAverageSnapshot(APRIL, 500, 150), guildAverageSnapshot(SEPTEMBER, 200, 120)],
        selectedTimestamp: APRIL,
        currentTimestamp: SEPTEMBER,
        metric: "xp",
      });
      assert.equal(summary.guildAverage, -300 / ((SEPTEMBER - APRIL) / DAY_MS));
    },
  },
  {
    name: "identische Timestamps erzeugen keinen ungueltigen oder unendlichen Wert",
    run() {
      const summary = buildPeriodRateSummary({
        playerSnapshots: [playerSnapshot(APRIL, 1_000, 120)],
        guildAverageSnapshots: [guildAverageSnapshot(APRIL, 200, 100)],
        selectedTimestamp: APRIL,
        currentTimestamp: APRIL,
        metric: "xp",
      });
      assert.deepEqual(summary, { player: null, guildAverage: null });
    },
  },
  {
    name: "keine Berechnung erzeugt NaN oder Infinity",
    run() {
      const summaries = [
        buildPeriodRateSummary({
          playerSnapshots: [playerSnapshot(APRIL, 1_000, 120), playerSnapshot(SEPTEMBER, 2_000, 160)],
          guildAverageSnapshots: [guildAverageSnapshot(APRIL, 500, 150), guildAverageSnapshot(SEPTEMBER, 200, 120)],
          selectedTimestamp: APRIL,
          currentTimestamp: SEPTEMBER,
          metric: "xp",
        }),
        buildPeriodRateSummary({
          playerSnapshots: [playerSnapshot(APRIL, null, 120), playerSnapshot(SEPTEMBER, null, 160)],
          guildAverageSnapshots: [],
          selectedTimestamp: APRIL,
          currentTimestamp: SEPTEMBER,
          metric: "xp",
        }),
      ];
      for (const summary of summaries) {
        for (const value of [summary.player, summary.guildAverage]) {
          assert.equal(value == null || Number.isFinite(value), true);
        }
      }
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}

function guildIdentity(identifiers: string[]): Pick<IdentityResolutionSnapshot, "guilds"> {
  const entityId = "guild_identity_1";
  return {
    guilds: buildGuildIdentityResolutionIndex([
      {
        entity: { entityId, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        aliases: identifiers.map((identifier, index) => ({
          identifier,
          identifierKey: identifier.toLowerCase(),
          entityId,
          addedAt: new Date(APRIL + index * DAY_MS).toISOString(),
          source: "manual" as const,
          confirmedAt: new Date(APRIL + index * DAY_MS).toISOString(),
        })),
      },
    ]),
  };
}

function analyticsData(rows: ReturnType<typeof guildRow>[]): GuildAnalyticsDerivedData {
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
      id: `guild-${row.snapshotId}`,
      snapshotId: row.snapshotId,
      sourceScanId: row.sourceScanId,
      sourceScanFilename: `${row.sourceScanId}.json`,
      snapshotTimestamp: row.timestamp,
      server: null,
      guildSegment: null,
      guildIdentifier: row.guildIdentifier,
      guildName: row.guildName,
      memberCount: row.xpValues.length,
      averageLevel: null,
      averageBaseStats: null,
      averageTotalStats: null,
    })),
    members: rows.flatMap((row) =>
      row.xpValues.map((xpTotal, index): GuildAnalyticsMemberSnapshot => ({
        id: `member-${row.snapshotId}-${index}`,
        snapshotId: row.snapshotId,
        sourceScanId: row.sourceScanId,
        sourceScanFilename: `${row.sourceScanId}.json`,
        snapshotTimestamp: row.timestamp,
        memberRef: `${row.guildIdentifier}_p${index + 1}`,
        name: `Member ${index + 1}`,
        classId: null,
        level: null,
        baseStats: null,
        totalStats: null,
        xpTotal,
        focusedBaseStats: 100 + index,
        server: null,
        guildSegment: null,
        groupSegment: null,
        guildIdentifier: row.guildIdentifier,
        guildName: row.guildName,
      })),
    ),
  };
}

function guildRow(id: string, timestamp: number, guildIdentifier: string, xpValues: number[], guildName = "Guild") {
  return {
    snapshotId: `snapshot-${id}`,
    sourceScanId: `scan-${id}`,
    timestamp,
    guildIdentifier,
    guildName,
    xpValues,
  };
}

function guildAverageSnapshot(timestamp: number, averageXpTotal: number | null, averageFocusedBaseStats: number | null) {
  return {
    timestamp,
    sourceScanId: `scan-${timestamp}`,
    snapshotId: `snapshot-${timestamp}`,
    guildIdentifier: "s1_g1",
    averageXpTotal,
    averageFocusedBaseStats,
  };
}

function playerSnapshot(timestamp: number, xpTotal: number | null, baseStats: number | null): PlayerPerformanceSnapshot {
  return {
    scanId: `scan-${timestamp}`,
    snapshotId: `snapshot-${timestamp}`,
    scanLabel: `scan-${timestamp}.json`,
    scannedAtMs: timestamp,
    scannedAtIso: new Date(timestamp).toISOString(),
    identifier: "s1_p1",
    memberRef: "s1_p1",
    memberKey: "s1_p1",
    guildIdentifier: "s1_g1",
    guildKey: "guild-identity:g1",
    name: "Hero",
    server: "s1",
    guildName: "Guild",
    xpTotal,
    baseStats,
  };
}
