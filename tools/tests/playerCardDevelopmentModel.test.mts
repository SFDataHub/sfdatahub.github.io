import assert from "node:assert/strict";
import type { GuildAnalyticsDerivedData, GuildAnalyticsMemberSnapshot } from "../../src/lib/guilds/localGuildAnalyticsStore";
import { resolveDefaultComparisonTimestamp } from "../../src/lib/player-progress/comparisonScanSelection";
import {
  buildPlayerCardDevelopmentLookup,
  classifyDevelopmentTrend,
  classifyPlayerComparisonTone,
  classifyTrendFromSmoothedValues,
  type PlayerCardDevelopmentSourceEntry,
} from "../../src/lib/player-progress/playerCardDevelopment";

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const D10 = START + DAY_MS * 10;
const D20 = START + DAY_MS * 20;
const D35 = START + DAY_MS * 35;
const D45 = START + DAY_MS * 45;

const tests = [
  {
    name: "XP erscheint nicht mehr als Player-Card-Metrik",
    run() {
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 170)],
        rows: [
          guildRow("a", START, [500, 501, 502], [100, 110, 120]),
          guildRow("d", D35, [503, 504, 505], [170, 180, 190]),
        ],
      });
      assert.equal("level" in summary, true);
      assert.equal("xp" in summary, false);
    },
  },
  {
    name: "Level-Gesamtdelta und Level pro Tag sind korrekt",
    run() {
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 170)],
        rows: [
          guildRow("a", START, [500, 501, 502], [100, 110, 120]),
          guildRow("d", D35, [502, 503, 504], [170, 180, 190]),
        ],
      });
      assert.equal(summary.level.playerDelta, 3);
      assert.equal(summary.level.playerPerDay, 3 / 35);
      assert.equal(summary.level.guildDelta, 2);
      assert.equal(summary.level.guildPerDay, 2 / 35);
    },
  },
  {
    name: "Basiswerte-Gesamtdelta und Basiswerte pro Tag sind korrekt",
    run() {
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 170)],
        rows: [
          guildRow("a", START, [500, 501, 502], [100, 110, 120]),
          guildRow("d", D35, [502, 503, 504], [150, 160, 170]),
        ],
      });
      assert.equal(summary.baseStats.playerDelta, 70);
      assert.equal(summary.baseStats.playerPerDay, 70 / 35);
      assert.equal(summary.baseStats.guildDelta, 50);
      assert.equal(summary.baseStats.guildPerDay, 50 / 35);
    },
  },
  {
    name: "alle sieben Trendgrenzen inklusive exakter Grenzwerte sind eindeutig",
    run() {
      assert.equal(classifyDevelopmentTrend(60, 100), "strong-up");
      assert.equal(classifyDevelopmentTrend(65, 100), "clear-up");
      assert.equal(classifyDevelopmentTrend(80, 100), "clear-up");
      assert.equal(classifyDevelopmentTrend(85, 100), "slight-up");
      assert.equal(classifyDevelopmentTrend(90, 100), "slight-up");
      assert.equal(classifyDevelopmentTrend(95, 100), "stable");
      assert.equal(classifyDevelopmentTrend(100, 95), "stable");
      assert.equal(classifyDevelopmentTrend(100, 85), "slight-down");
      assert.equal(classifyDevelopmentTrend(100, 65), "clear-down");
      assert.equal(classifyDevelopmentTrend(100, 60), "strong-down");
    },
  },
  {
    name: "unbekannter Zustand bei nur einer Tagesrate",
    run() {
      assert.equal(classifyTrendFromSmoothedValues([10]), "unknown");
    },
  },
  {
    name: "positiver Wert kann fallenden Trend haben",
    run() {
      assert.equal(classifyDevelopmentTrend(20, 10), "strong-down");
    },
  },
  {
    name: "unterdurchschnittlicher Wert kann steigenden Trend haben",
    run() {
      const summary = buildSummary({
        players: [
          playerEntry(START, "scan-a", 500, 100),
          playerEntry(D10, "scan-b", 500, 103),
          playerEntry(D20, "scan-c", 500, 110),
          playerEntry(D35, "scan-d", 501, 125),
        ],
        rows: [
          guildRow("a", START, [500, 500, 500], [100, 100, 100]),
          guildRow("b", D10, [501, 501, 501], [160, 160, 160]),
          guildRow("c", D20, [502, 502, 502], [210, 210, 210]),
          guildRow("d", D35, [503, 503, 503], [250, 250, 250]),
        ],
      });
      assert.equal(summary.baseStats.playerTone, "blue-violet");
      assert.equal(summary.baseStats.playerTrend.state, "clear-up");
    },
  },
  {
    name: "Spieler- und Gilden-Leveltrends werden unabhaengig berechnet",
    run() {
      const summary = buildSummary({
        players: [
          playerEntry(START, "scan-a", 500, 100),
          playerEntry(D10, "scan-b", 500, 110),
          playerEntry(D20, "scan-c", 501, 120),
          playerEntry(D35, "scan-d", 504, 130),
        ],
        rows: [
          guildRow("a", START, [500, 500, 500], [100, 100, 100]),
          guildRow("b", D10, [503, 503, 503], [110, 110, 110]),
          guildRow("c", D20, [504, 504, 504], [120, 120, 120]),
          guildRow("d", D35, [504, 504, 504], [130, 130, 130]),
        ],
      });
      assert.equal(summary.level.playerTrend.state, "clear-up");
      assert.equal(summary.level.guildTrend.state, "strong-down");
    },
  },
  {
    name: "alle Vergleichsfarbbereiche folgen den sichtbaren Schwellen",
    run() {
      assert.equal(tone(130, 100), "turquoise");
      assert.equal(tone(129.9, 100), "green");
      assert.equal(tone(110, 100), "green");
      assert.equal(tone(109.9, 100), "ice-blue");
      assert.equal(tone(90, 100), "ice-blue");
      assert.equal(tone(89.9, 100), "blue-violet");
      assert.equal(tone(70, 100), "blue-violet");
      assert.equal(tone(50, 100), "amber");
      assert.equal(tone(25, 100), "orange");
    },
  },
  {
    name: "kurze Intervalle und kleine Level-Gildendeltas fallen auf Blau/Violett zurueck",
    run() {
      assert.equal(tone(40, 100, { elapsedDays: 10 }), "blue-violet");
      assert.equal(tone(0.2, 0.8, { metric: "level", elapsedDays: 35 }), "blue-violet");
    },
  },
  {
    name: "Rot erfordert mindestens 30 Tage und ein zweites auffaelliges Intervall",
    run() {
      assert.equal(tone(20, 100, { elapsedDays: 29, previousRatio: 0.3 }), "blue-violet");
      assert.equal(tone(20, 100, { elapsedDays: 35, previousRatio: 0.5 }), "blue-violet");
      assert.equal(tone(20, 100, { elapsedDays: 35, previousRatio: 0.3 }), "red");
    },
  },
  {
    name: "fehlende Gildenreferenz erzeugt keinen Vergleichszustand",
    run() {
      assert.equal(tone(100, null), "none");
      assert.equal(tone(100, 0), "none");
      assert.equal(tone(100, -10), "none");
    },
  },
  {
    name: "Beispielquoten werden nicht mehr neutral zusammengefasst",
    run() {
      assert.equal(tone(40.182, 41.733), "ice-blue");
      assert.equal(tone(18, 22.2, { metric: "level" }), "blue-violet");
    },
  },
  {
    name: "stabiler und unbekannter Trend bleiben getrennte Anzeigezustaende",
    run() {
      const stable = classifyDevelopmentTrend(100, 100);
      const unknown = classifyTrendFromSmoothedValues([10]);
      assert.equal(stable, "stable");
      assert.equal(unknown, "unknown");
      assert.notEqual(stable, unknown);
    },
  },
  {
    name: "Default-Scanpaar entspricht weiterhin dem lokalen Spielerprofil",
    run() {
      const defaultTimestamp = resolveDefaultComparisonTimestamp(
        [{ timestamp: D20 }, { timestamp: D10 }, { timestamp: START }],
        D35,
      );
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 135)],
        rows: [
          guildRow("a", START, [500, 501, 502], [100, 110, 120]),
          guildRow("b", D10, [501, 502, 503], [101, 111, 121]),
          guildRow("c", D20, [502, 503, 504], [102, 112, 122]),
          guildRow("d", D35, [503, 504, 505], [103, 113, 123]),
        ],
      });
      assert.equal(defaultTimestamp, START);
      assert.equal(summary.selectedTimestamp, defaultTimestamp);
    },
  },
  {
    name: "unvollstaendige Gildensnapshots erzeugen keinen Wert",
    run() {
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 150)],
        rows: [
          guildRow("a", START, [500, 501, 502], [100, 110, 120]),
          guildRow("d", D35, [502, 503, 504], [150, 160, 170], { declaredMemberCount: 4 }),
        ],
      });
      assert.equal(summary.level.guildDelta, null);
      assert.equal(summary.baseStats.guildDelta, null);
    },
  },
  {
    name: "unvollstaendige Levelabdeckung verwirft den Gilden-Levelwert",
    run() {
      const summary = buildSummary({
        players: [playerEntry(START, "scan-a", 500, 100), playerEntry(D35, "scan-d", 503, 150)],
        rows: [
          guildRow("a", START, [500, null, 502], [100, 110, 120]),
          guildRow("d", D35, [502, 503, 504], [150, 160, 170]),
        ],
      });
      assert.equal(summary.level.guildDelta, null);
      assert.equal(summary.baseStats.guildDelta, 50);
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}

function buildSummary({ players, rows }: { players: PlayerCardDevelopmentSourceEntry[]; rows: ReturnType<typeof guildRow>[] }) {
  const summary = buildPlayerCardDevelopmentLookup(players, { analyticsData: analyticsData(rows) }).get("player:hero");
  assert.ok(summary);
  return summary;
}

function tone(
  playerDelta: number,
  guildDelta: number | null,
  options: {
    metric?: "baseStats" | "level";
    elapsedDays?: number;
    previousRatio?: number | null;
  } = {},
) {
  const metric = options.metric ?? "baseStats";
  const elapsedDays = options.elapsedDays ?? 35;
  const previousRatio = options.previousRatio;
  const guildIntervalDelta = guildDelta ?? 0;
  return classifyPlayerComparisonTone({
    metric,
    elapsedDays,
    playerDelta,
    guildDelta,
    selectedTimestamp: D10,
    currentTimestamp: D35,
    playerIntervals:
      previousRatio == null
        ? []
        : [
            interval(START, D10, previousRatio * 100),
            interval(D10, D35, playerDelta),
          ],
    guildIntervals:
      previousRatio == null
        ? []
        : [
            interval(START, D10, 100),
            interval(D10, D35, guildIntervalDelta),
          ],
  });
}

function interval(startTimestamp: number, endTimestamp: number, delta: number) {
  const elapsedDays = (endTimestamp - startTimestamp) / DAY_MS;
  return {
    startTimestamp,
    endTimestamp,
    elapsedDays,
    delta,
    perDay: delta / elapsedDays,
    trendPerDay: delta / elapsedDays,
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
      server: "f28",
      guildSegment: "g1",
      guildIdentifier: "f28_g1",
      guildName: "Guild",
      memberCount: row.memberCount,
      averageLevel: null,
      averageBaseStats: null,
      averageTotalStats: null,
    })),
    members: rows.flatMap((row) => row.members),
  };
}

function guildRow(
  id: string,
  timestamp: number,
  levelValues: Array<number | null>,
  baseValues: Array<number | null>,
  options: { guildIdentifier?: string; declaredMemberCount?: number } = {},
) {
  const guildIdentifier = options.guildIdentifier ?? "f28_g1";
  return {
    snapshotId: `snapshot-${id}`,
    sourceScanId: `scan-${id}`,
    timestamp,
    guildIdentifier,
    memberCount: options.declaredMemberCount ?? levelValues.length,
    members: levelValues.map((level, index): GuildAnalyticsMemberSnapshot => ({
      id: `member-${id}-${index}`,
      snapshotId: `snapshot-${id}`,
      sourceScanId: `scan-${id}`,
      sourceScanFilename: `scan-${id}.json`,
      snapshotTimestamp: timestamp,
      memberRef: `${guildIdentifier}_p${index + 1}`,
      name: `Member ${index + 1}`,
      classId: null,
      level,
      baseStats: baseValues[index],
      totalStats: baseValues[index] == null ? null : baseValues[index] * 5,
      xpTotal: 1_000 + index,
      focusedBaseStats: baseValues[index],
      server: "f28",
      guildSegment: "g1",
      groupSegment: "g1",
      guildIdentifier,
      guildName: "Guild",
    })),
  };
}

function playerEntry(timestamp: number, sourceScanId: string, level: number | null, baseStats: number | null): PlayerCardDevelopmentSourceEntry {
  return {
    playerKey: "player:hero",
    name: "Hero",
    server: "f28",
    memberRef: "f28_p1",
    sourceScanId,
    scannedAtMs: timestamp,
    guildIdentifier: "f28_g1",
    guildName: "Guild",
    level,
    baseStats,
  };
}
