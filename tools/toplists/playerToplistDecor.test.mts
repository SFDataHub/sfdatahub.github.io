import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ToplistPlayerRow } from "../../src/lib/toplists/toplistContracts.ts";
import {
  buildLocalPlayerToplistView,
  type LocalToplistRankedPlayerRow,
} from "../../src/lib/toplists/localToplistView.ts";
import type { LocalPlayerToplistRow } from "../../src/lib/toplists/localToplistTypes.ts";
import {
  PLAYER_TOPLIST_MAIN_RANK_COLORS,
  buildPlayerToplistCompareKey,
  buildPlayerToplistDecorMap,
  getPlayerToplistFrameStyle,
  getPlayerToplistRankTone,
} from "../../src/pages/Toplists/playerToplistDecor.ts";

const ts = Date.UTC(2026, 0, 15, 12, 0, 0);

const localPlayer = (
  overrides: Partial<LocalPlayerToplistRow> & { identifier: string; name: string },
): LocalPlayerToplistRow => ({
  rowKey: overrides.identifier,
  identifier: overrides.identifier,
  playerId: overrides.playerId ?? overrides.identifier.replace(/^.+_p/i, ""),
  name: overrides.name,
  server: overrides.server ?? "EU1",
  sourceServer: overrides.sourceServer ?? overrides.server ?? "EU1",
  scanTimestamp: overrides.scanTimestamp ?? ts,
  manifestYear: 2026,
  archiveScanId: overrides.archiveScanId ?? "scan",
  archiveSha256: "a".repeat(64),
  localScanId: overrides.localScanId ?? "local",
  class: overrides.class ?? "Warrior",
  classId: overrides.classId ?? 1,
  guild: overrides.guild ?? null,
  guildIdentifier: overrides.guildIdentifier ?? null,
  hofRank: overrides.hofRank ?? null,
  level: overrides.level ?? null,
  main: overrides.main ?? null,
  con: overrides.con ?? null,
  sum: overrides.sum ?? null,
  ratio: overrides.ratio ?? null,
  mainTotal: overrides.mainTotal ?? null,
  conTotal: overrides.conTotal ?? null,
  sumTotal: overrides.sumTotal ?? null,
  xpProgress: overrides.xpProgress ?? null,
  xpTotal: overrides.xpTotal ?? null,
  mine: overrides.mine ?? null,
  treasury: overrides.treasury ?? null,
  statsPerDay: null,
  statsDayTotal: null,
  lastScan: overrides.lastScan ?? null,
  latestScanAtSec: overrides.latestScanAtSec ?? Math.floor((overrides.scanTimestamp ?? ts) / 1000),
});

const publicPlayer = (
  overrides: Partial<ToplistPlayerRow> & { identifier: string; name: string },
): ToplistPlayerRow => ({
  identifier: overrides.identifier,
  playerId: overrides.playerId ?? overrides.identifier.replace(/^.+_p/i, ""),
  flag: overrides.flag ?? null,
  deltaRank: overrides.deltaRank ?? null,
  server: overrides.server ?? "EU1",
  name: overrides.name,
  class: overrides.class ?? "Warrior",
  level: overrides.level ?? null,
  guild: overrides.guild ?? null,
  main: overrides.main ?? null,
  con: overrides.con ?? null,
  sum: overrides.sum ?? null,
  ratio: overrides.ratio ?? null,
  mainTotal: overrides.mainTotal ?? null,
  conTotal: overrides.conTotal ?? null,
  sumTotal: overrides.sumTotal ?? null,
  xpProgress: overrides.xpProgress ?? null,
  xpTotal: overrides.xpTotal ?? null,
  mine: overrides.mine ?? null,
  treasury: overrides.treasury ?? null,
  lastScan: overrides.lastScan ?? null,
  deltaSum: overrides.deltaSum ?? null,
});

const rankedLocalToPublic = (row: LocalToplistRankedPlayerRow): ToplistPlayerRow =>
  publicPlayer({
    identifier: row.identifier,
    playerId: row.playerId,
    server: row.server,
    name: row.name,
    class: row.class,
    level: row.level,
    guild: row.guild,
    main: row.main,
    con: row.con,
    sum: row.sum,
    ratio: row.ratio == null ? null : String(row.ratio),
    mainTotal: row.mainTotal,
    conTotal: row.conTotal,
    sumTotal: row.sumTotal,
    xpProgress: row.xpProgress,
    xpTotal: row.xpTotal,
    mine: row.mine,
    treasury: row.treasury,
    lastScan: row.lastScan,
  });

const decorFor = (rows: readonly ToplistPlayerRow[], identifier: string, mode: "base" | "total" = "base") => {
  const row = rows.find((candidate) => candidate.identifier === identifier);
  assert.ok(row, `missing test row ${identifier}`);
  return buildPlayerToplistDecorMap(rows, mode).get(buildPlayerToplistCompareKey(row));
};

describe("player toplist decoration", () => {
  test("uses the full local top-1000 view for decorations independently from the visible lazy slice", () => {
    const sourceRows = Array.from({ length: 120 }, (_, index) => {
      const ordinal = index + 1;
      const lateGlobalMain = ordinal >= 101 && ordinal <= 105 ? 700 - ordinal : null;
      return localPlayer({
        identifier: `eu1_p${ordinal}`,
        playerId: String(ordinal),
        name: `Player ${ordinal}`,
        sum: 2000 - index,
        main: lateGlobalMain ?? (ordinal === 1 ? 90 : 50 - index),
        con: 10,
        level: ordinal === 101 ? 999 : 1,
        mine: null,
      });
    });
    const fullRows = buildLocalPlayerToplistView(sourceRows, {
      sort: { metricKey: "sum", direction: "desc" },
      playerAverageMode: "base",
    }).rows.map(rankedLocalToPublic);
    const visibleRows = fullRows.slice(0, 100);
    const visibleOnlyLeader = fullRows[0];
    const lateGlobalLeader = fullRows[100];
    assert.ok(visibleOnlyLeader);
    assert.ok(lateGlobalLeader);

    const visibleSliceDecor = buildPlayerToplistDecorMap(visibleRows, "base");
    const globalDecor = buildPlayerToplistDecorMap(fullRows, "base");

    assert.equal(fullRows.length, 120);
    assert.equal(visibleRows.length, 100);
    assert.equal(visibleSliceDecor.get(buildPlayerToplistCompareKey(visibleOnlyLeader))?.mainRank, 1);
    assert.equal(globalDecor.get(buildPlayerToplistCompareKey(visibleOnlyLeader))?.mainRank, undefined);
    assert.equal(globalDecor.get(buildPlayerToplistCompareKey(lateGlobalLeader))?.mainRank, 1);
    assert.equal(getPlayerToplistFrameStyle(getPlayerToplistRankTone(globalDecor.get(buildPlayerToplistCompareKey(visibleOnlyLeader))?.mainRank, PLAYER_TOPLIST_MAIN_RANK_COLORS)), undefined);
    assert.equal(globalDecor.get(buildPlayerToplistCompareKey(visibleOnlyLeader))?.mineTier, undefined);
  });

  test("switches main and constitution decoration ranks between base and total mode while level stays stable", () => {
    const rows = [
      publicPlayer({ identifier: "eu1_p1", name: "Base Main", main: 900, con: 100, level: 10, mainTotal: 100, conTotal: 100 }),
      publicPlayer({ identifier: "eu1_p2", name: "Total Main", main: 200, con: 200, level: 20, mainTotal: 950, conTotal: 200 }),
      publicPlayer({ identifier: "eu1_p3", name: "Base Con", main: 100, con: 920, level: 30, mainTotal: 100, conTotal: 100 }),
      publicPlayer({ identifier: "eu1_p4", name: "Total Con", main: 100, con: 300, level: 40, mainTotal: 100, conTotal: 980 }),
      publicPlayer({ identifier: "eu1_p5", name: "Level Leader", main: 50, con: 50, level: 999, mainTotal: 50, conTotal: 50 }),
      publicPlayer({ identifier: "eu1_p6", name: "Sum Only", main: 1, con: 1, sum: 99999, ratio: "99", level: 1, xpProgress: 9999, xpTotal: 99999 }),
    ];

    assert.equal(decorFor(rows, "eu1_p1", "base")?.mainRank, 1);
    assert.equal(decorFor(rows, "eu1_p2", "total")?.mainRank, 1);
    assert.equal(decorFor(rows, "eu1_p3", "base")?.conRank, 1);
    assert.equal(decorFor(rows, "eu1_p4", "total")?.conRank, 1);
    assert.equal(decorFor(rows, "eu1_p5", "base")?.levelRank, 1);
    assert.equal(decorFor(rows, "eu1_p5", "total")?.levelRank, 1);

    const sumOnlyDecor = (decorFor(rows, "eu1_p6", "base") ?? {}) as Record<string, unknown>;
    assert.equal(sumOnlyDecor.sumRank, undefined);
    assert.equal(sumOnlyDecor.ratioRank, undefined);
    assert.equal(sumOnlyDecor.treasuryRank, undefined);
    assert.equal(sumOnlyDecor.xpProgressRank, undefined);
    assert.equal(sumOnlyDecor.xpTotalRank, undefined);
    assert.equal(sumOnlyDecor.statsDayRank, undefined);
  });

  test("uses the same normalized key for decoration writes and visible row lookup", () => {
    const aliasRow = publicPlayer({ identifier: "s1_p42", server: "s1.sfgame.net", name: "Alias", main: 500 });
    const canonicalRow = publicPlayer({ identifier: "EU1_p42", server: "EU1", name: "Alias", main: 500 });
    const rows = [
      aliasRow,
      publicPlayer({ identifier: "eu1_p43", server: "EU1", name: "Other", main: 400 }),
      publicPlayer({ identifier: "eu2_p44", server: "EU2", name: "Third", main: 300 }),
    ];

    assert.equal(buildPlayerToplistCompareKey(aliasRow), "eu1_p42");
    assert.equal(buildPlayerToplistCompareKey(aliasRow), buildPlayerToplistCompareKey(canonicalRow));
    const keys = rows.map(buildPlayerToplistCompareKey);
    assert.equal(keys.length, new Set(keys).size);

    const decorMap = buildPlayerToplistDecorMap(rows, "base");
    const lookupKey = buildPlayerToplistCompareKey(aliasRow);
    assert.equal(decorMap.get(lookupKey)?.mainRank, 1);
  });

  test("renders the desktop highlight span with the concrete inline frame style", () => {
    const highlighted = renderToStaticMarkup(React.createElement(
      "span",
      { style: getPlayerToplistFrameStyle(PLAYER_TOPLIST_MAIN_RANK_COLORS[0]) },
      "9001",
    ));
    const plain = renderToStaticMarkup(React.createElement(
      "span",
      { style: getPlayerToplistFrameStyle(null) },
      "42",
    ));

    assert.match(highlighted, /border:1px solid #f6e7a6/);
    assert.match(highlighted, /display:inline-flex/);
    assert.match(highlighted, /border-radius:6px/);
    assert.match(highlighted, /padding:1px 3px 0/);
    assert.doesNotMatch(plain, /style=/);
  });
});

console.log("playerToplistDecor.test: ok");
