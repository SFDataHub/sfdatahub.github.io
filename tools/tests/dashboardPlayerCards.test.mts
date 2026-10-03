import assert from "node:assert/strict";
import type { GuildHubLocalScan, GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary";
import { formatPlayerCardDevelopmentPeriod, type PlayerCardDevelopmentSummary } from "../../src/lib/player-progress/playerCardDevelopment";
import { buildLocalPlayerIndex, type LocalPlayerIndexPlayer } from "../../src/lib/player-search/localPlayerIndex";
import {
  buildDashboardPlayerCardItems,
  buildDashboardStaticPlayerCardItems,
  DASHBOARD_MEMBER_GRID_DESKTOP_COLUMNS,
  DEFAULT_DASHBOARD_MEMBER_VIEW,
  sortDashboardMembers,
  type DashboardPlayerCardMember,
} from "../../src/pages/GuildHub/dashboardPlayerCards";

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 3, 18);
const END = Date.UTC(2026, 8, 29);

const tests = [
  {
    name: "aktueller Snapshot mit 50 Mitgliedern erzeugt sofort 50 statische Cards",
    run() {
      const members = Array.from({ length: 50 }, (_, index) => member(index + 1));
      const items = buildDashboardStaticPlayerCardItems({
        members,
        playerLookup: new Map(),
        developmentStatus: "loading",
      });
      assert.equal(items.length, 50);
      assert.equal(items[0].card.name, "Member 1");
      assert.equal(items[49].card.name, "Member 50");
      assert.equal(items[49].developmentStatus, "loading");
      assert.equal("development" in items[49].card, false);
      assert.equal("developmentStatus" in items[49].card, false);
      assert.equal(items[49].card.portraitFallbackUrl, null);
      assert.equal(items[49].card.portraitFallbackLabel, "Portrait nicht verfügbar");
    },
  },
  {
    name: "Mitglieder ohne Player-Identity oder Entwicklungshistorie bleiben sichtbar",
    run() {
      const members = [member(1), member(2, { localRef: undefined })];
      const items = buildDashboardPlayerCardItems({
        members,
        players: [playerForMember(members[0])],
        currentSourceScanId: "scan-current",
        currentTimestampMs: END,
      });
      assert.equal(items.length, 2);
      assert.equal(items[1].indexedPlayer, null);
      assert.equal(items[1].card.name, "Member 2");
      assert.equal(items[1].development, null);
      assert.equal(items[1].developmentStatus, "ready");
    },
  },
  {
    name: "Dashboard-Snapshot ist der feste Endpunkt und behält statische Card-Daten",
    run() {
      const target = member(1);
      const baseItems = buildDashboardStaticPlayerCardItems({
        members: [target],
        playerLookup: new Map([[target.localRef?.sourcePlayerKey ?? "", { identifier: "f28_p1", name: "Current Hero", level: 611 }]]),
        developmentStatus: "loading",
      });
      const portrait = { class: 1, race: 2 };
      baseItems[0].card.portrait = portrait;
      baseItems[0].card.hasPortrait = true;
      const items = buildDashboardPlayerCardItems({
        members: [target],
        players: [
          playerForMember(target, { scannedAtMs: END, sourceScanId: "scan-current", cardName: "Indexed Hero" }),
          playerForMember(target, { scannedAtMs: END + DAY_MS, sourceScanId: "scan-later", cardName: "Later Hero" }),
        ],
        currentSourceScanId: "scan-current",
        currentTimestampMs: END,
        baseItems,
      });
      assert.equal(items[0].indexedPlayer?.sourceScanId, "scan-current");
      assert.equal(items[0].card.name, "Current Hero");
      assert.equal(items[0].card.level, 611);
      assert.equal(items[0].card.portrait, portrait);
      assert.equal(items[0].card.hasPortrait, true);
      assert.equal("development" in items[0].card, false);
      assert.equal(items[0].developmentStatus, "ready");
      assert.ok(items[0].development);
    },
  },
  {
    name: "Cards ohne fertiges Development bleiben waehrend des Worker-Laufs im Ladezustand",
    run() {
      const target = member(1);
      const baseItems = buildDashboardStaticPlayerCardItems({
        members: [target],
        playerLookup: new Map(),
        developmentStatus: "loading",
      });
      const items = buildDashboardPlayerCardItems({
        members: [target],
        players: [],
        currentSourceScanId: "scan-current",
        currentTimestampMs: END,
        baseItems,
      });
      assert.equal(items[0].development, null);
      assert.equal(items[0].developmentStatus, "loading");
    },
  },
  {
    name: "abgeschlossene Berechnung ohne Historie wird separat als unverfuegbar markiert",
    run() {
      const target = member(1);
      const items = buildDashboardPlayerCardItems({
        members: [target],
        players: [],
        currentSourceScanId: "scan-current",
        currentTimestampMs: END,
        developmentStatus: "unavailable",
      });
      assert.equal(items[0].development, null);
      assert.equal(items[0].developmentStatus, "unavailable");
    },
  },
  {
    name: "Card-Reihenfolge entspricht der bestehenden Memberlisten-Sortierung",
    run() {
      const sorted = sortDashboardMembers([
        member(3, { name: "Zulu", guildRole: "member", level: 600 }),
        member(2, { name: "Officer", guildRole: "officer", level: 100 }),
        member(1, { name: "Leader", guildRole: "leader", level: 1 }),
        member(4, { name: "Alpha", guildRole: "member", level: 600 }),
      ]);
      assert.deepEqual(sorted.map((entry) => entry.name), ["Leader", "Officer", "Alpha", "Zulu"]);
    },
  },
  {
    name: "Initiale Dashboard-Ansicht ist Cards",
    run() {
      assert.equal(DEFAULT_DASHBOARD_MEMBER_VIEW, "cards");
    },
  },
  {
    name: "Dashboard-Card-Grid ist auf fuenf Desktop-Spalten ausgelegt",
    run() {
      assert.equal(DASHBOARD_MEMBER_GRID_DESKTOP_COLUMNS, 5);
    },
  },
  {
    name: "Worker-Index kann auf Zielspieler begrenzt und Card-Details ueberspringen",
    run() {
      const result = buildLocalPlayerIndex(
        [
          {
            scan: localScan([
              rawPlayer(1, "Target Hero"),
              rawPlayer(2, "Other Hero"),
            ]),
            summary: scanSummary(),
          },
        ],
        {
          serverFilter: "f28",
          targetPlayerRefs: ["f28_p1"],
          targetPlayerNames: [],
          includeCards: false,
        },
      );
      assert.equal(result.players.length, 1);
      assert.equal(result.players[0].name, "Target Hero");
      assert.equal(result.players[0].card.potions.length, 0);
      assert.equal(result.players[0].card.hasPortrait, false);
      assert.equal(result.players[0].card.portraitFallbackUrl, null);
    },
  },
  {
    name: "angezeigte Daten und Tagesdauer kommen aus dem verwendeten Scanpaar",
    run() {
      assert.equal(formatPlayerCardDevelopmentPeriod(START, END, (END - START) / DAY_MS), "18.04.26 - 29.09.26 · 164 Tage");
      assert.equal(formatPlayerCardDevelopmentPeriod(null, END, null), "Kein Vergleichsscan");
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}

function rawPlayer(index: number, name: string) {
  return {
    identifier: `f28_p${index}`,
    playerId: String(index),
    server: "f28",
    name,
    level: 500 + index,
    class: "Krieger",
    hofRank: index,
    guildName: "Legion Z",
    scannedAt: END,
  };
}

function localScan(players: ReturnType<typeof rawPlayer>[]): GuildHubLocalScan {
  return {
    id: "scan-current",
    contentHash: "hash-current",
    filename: "scan-current.json",
    importedAt: new Date(END).toISOString(),
    scannedAt: new Date(END).toISOString(),
    servers: ["f28"],
    playerCount: players.length,
    groupCount: 0,
    rawData: { players, groups: [] },
    normalizedMembers: [],
  };
}

function scanSummary(): GuildHubScanSummary {
  return {
    sourceScanId: "scan-current",
    filename: "scan-current.json",
    importedAt: END,
    updatedAt: END,
    importedAtIso: new Date(END).toISOString(),
    scannedAt: new Date(END).toISOString(),
    logicalScanCount: 1,
    firstSnapshotTimestamp: END,
    lastSnapshotTimestamp: END,
    snapshotTimestamps: [END],
    servers: ["f28"],
    playerCount: 2,
    groupCount: 0,
    guildCount: 0,
    guilds: [],
    guildCoverage: {
      uniqueGuildCount: 0,
      completeUniqueGuildCount: 0,
      guildSnapshotCount: 0,
      completeGuildSnapshotCount: 0,
      incompleteGuildSnapshotCount: 0,
      overcountGuildSnapshotCount: 0,
      unknownGuildSnapshotCount: 0,
      byServer: [],
    },
  };
}

function member(
  index: number,
  options: Partial<DashboardPlayerCardMember> = {},
): DashboardPlayerCardMember {
  const memberRef = `f28_p${index}`;
  return {
    key: memberRef,
    name: `Member ${index}`,
    classLabel: "Krieger",
    classMeta: null,
    level: 500 + index,
    hofRank: index,
    guildRole: "member",
    localRef: {
      sourceScanId: "scan-current",
      sourcePlayerKey: memberRef,
      identifier: memberRef,
      playerId: String(index),
      server: "f28",
    },
    ...options,
  };
}

function playerForMember(
  playerMember: DashboardPlayerCardMember,
  options: { scannedAtMs?: number; sourceScanId?: string; cardName?: string } = {},
): LocalPlayerIndexPlayer {
  const scannedAtMs = options.scannedAtMs ?? END;
  const sourceScanId = options.sourceScanId ?? "scan-current";
  const key = `identifier:${playerMember.localRef?.identifier ?? playerMember.key}`;
  return {
    key,
    identityKind: "identifier",
    name: playerMember.name,
    server: playerMember.localRef?.server ?? null,
    guildName: "Legion Z",
    xpTotal: null,
    scannedAtMs,
    importedAtMs: scannedAtMs,
    sourceScanId,
    sourceFilename: `${sourceScanId}.json`,
    queryText: playerMember.name,
    card: {
      name: options.cardName ?? playerMember.name,
      className: playerMember.classLabel,
      level: playerMember.level,
      guildRole: "Member",
      hofRank: playerMember.hofRank,
    },
    development: {
      currentTimestamp: END,
      selectedTimestamp: START,
      elapsedDays: (END - START) / DAY_MS,
      baseStats: metric("baseStats"),
      level: metric("level"),
    },
  };
}

function metric(key: "baseStats" | "level"): PlayerCardDevelopmentSummary["baseStats"] {
  return {
    key,
    label: key === "baseStats" ? "Basiswerte" : "Level",
    playerDelta: null,
    playerPerDay: null,
    playerTone: "none",
    guildDelta: null,
    guildPerDay: null,
    playerTrend: { state: "unknown", rates: [] },
    guildTrend: { state: "unknown", rates: [] },
  };
}
