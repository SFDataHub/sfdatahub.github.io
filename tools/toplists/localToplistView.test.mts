import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildLocalGuildToplistView,
  buildLocalPlayerToplistView,
} from "../../src/lib/toplists/localToplistView.ts";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
} from "../../src/lib/toplists/localToplistTypes.ts";

const ts = Date.UTC(2026, 0, 15, 12, 0, 0);

const player = (overrides: Partial<LocalPlayerToplistRow> & { identifier: string; name: string }): LocalPlayerToplistRow => ({
  rowKey: overrides.identifier,
  identifier: overrides.identifier,
  playerId: overrides.playerId ?? overrides.identifier,
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

const guild = (overrides: Partial<LocalGuildToplistRow> & { guildIdentifier: string; name: string }): LocalGuildToplistRow => ({
  rowKey: overrides.guildIdentifier,
  guildId: overrides.guildId ?? overrides.guildIdentifier,
  guildIdentifier: overrides.guildIdentifier,
  name: overrides.name,
  server: overrides.server ?? "EU1",
  sourceServer: overrides.sourceServer ?? overrides.server ?? "EU1",
  scanTimestamp: overrides.scanTimestamp ?? ts,
  manifestYear: 2026,
  archiveScanId: overrides.archiveScanId ?? "scan",
  archiveSha256: "a".repeat(64),
  localScanId: overrides.localScanId ?? "local",
  hofRank: overrides.hofRank ?? null,
  honor: overrides.honor ?? null,
  raids: overrides.raids ?? null,
  portalFloor: overrides.portalFloor ?? null,
  hydra: overrides.hydra ?? null,
  petLevel: overrides.petLevel ?? null,
  instructor: overrides.instructor ?? null,
  memberCount: overrides.memberCount ?? null,
  avgLevel: overrides.avgLevel ?? null,
  avgBaseMain: overrides.avgBaseMain ?? null,
  avgConBase: overrides.avgConBase ?? null,
  avgSumBaseTotal: overrides.avgSumBaseTotal ?? null,
  avgAttrTotal: overrides.avgAttrTotal ?? null,
  avgConTotal: overrides.avgConTotal ?? null,
  avgTotalStats: overrides.avgTotalStats ?? null,
  avgMine: overrides.avgMine ?? null,
  avgTreasury: overrides.avgTreasury ?? null,
  sumAvg: overrides.sumAvg ?? null,
  memberBasisStatus: overrides.memberBasisStatus ?? "complete",
  memberBasisCount: overrides.memberBasisCount ?? 0,
  lastScan: overrides.lastScan ?? null,
  latestScanAtSec: overrides.latestScanAtSec ?? Math.floor((overrides.scanTimestamp ?? ts) / 1000),
});

describe("local toplist view", () => {
  test("filters players by multiple normalized servers and leaves empty server filters open", () => {
    const rows = [
      player({ identifier: "eu1_p1", name: "Ada", server: "EU1", sum: 10 }),
      player({ identifier: "eu2_p1", name: "Ben", server: "EU2", sum: 20 }),
      player({ identifier: "x_p1", name: "Cy", server: "X9", sum: 30 }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { filters: { servers: ["eu1", "eu2"] } }).rows.map((row) => row.identifier),
      ["eu2_p1", "eu1_p1"],
    );
    assert.equal(buildLocalPlayerToplistView(rows, { filters: { servers: [] } }).rows.length, 3);
  });

  test("filters player classes only for player views", () => {
    const players = [
      player({ identifier: "p1", name: "Ada", class: "Battle Mage", sum: 20 }),
      player({ identifier: "p2", name: "Ben", class: "Warrior", sum: 30 }),
    ];
    const guilds = [
      guild({ guildIdentifier: "g1", name: "Alpha", avgLevel: 10 }),
      guild({ guildIdentifier: "g2", name: "Beta", avgLevel: 20 }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(players, { filters: { playerClasses: ["battle_mage"] } }).rows.map((row) => row.identifier),
      ["p1"],
    );
    assert.equal(buildLocalGuildToplistView(guilds, { filters: { playerClasses: ["battle_mage"] } }).rows.length, 2);
  });

  test("sorts numeric player metrics with missing values last for both directions", () => {
    const rows = [
      player({ identifier: "p1", name: "Ada", sum: 20 }),
      player({ identifier: "p2", name: "Ben", sum: null }),
      player({ identifier: "p3", name: "Cy", sum: 40 }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "sum", direction: "desc" } }).rows.map((row) => row.identifier),
      ["p3", "p1", "p2"],
    );
    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "sum", direction: "asc" } }).rows.map((row) => row.identifier),
      ["p1", "p3", "p2"],
    );
  });

  test("sorts player ratio by the same public numeric main-ratio basis used for display", () => {
    const rows = [
      player({ identifier: "balanced", name: "Balanced", main: 2930, con: 2725, sum: 5655, ratio: 52 }),
      player({ identifier: "main-heavy", name: "Main Heavy", main: 80, con: 20, sum: 100, ratio: 80 }),
      player({ identifier: "missing", name: "Missing", main: 0, con: 0, sum: 0, ratio: null }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "ratio", direction: "desc" } }).rows.map((row) => row.identifier),
      ["main-heavy", "balanced", "missing"],
    );
    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "ratio", direction: "asc" } }).rows.map((row) => row.identifier),
      ["balanced", "main-heavy", "missing"],
    );
  });

  test("uses base player stat fields for local player ranking until total mode is requested", () => {
    const rows = [
      player({ identifier: "base-leader", name: "Base Leader", main: 300, con: 100, sum: 400, mainTotal: 310, conTotal: 110, sumTotal: 420 }),
      player({ identifier: "total-leader", name: "Total Leader", main: 200, con: 90, sum: 290, mainTotal: 800, conTotal: 780, sumTotal: 1580 }),
      player({ identifier: "missing-total", name: "Missing Total", main: 100, con: 600, sum: 700, mainTotal: null, conTotal: null, sumTotal: null }),
    ];

    const base = buildLocalPlayerToplistView(rows, {
      sort: { metricKey: "sum", direction: "desc" },
      playerAverageMode: "base",
    });
    const total = buildLocalPlayerToplistView(rows, {
      sort: { metricKey: "sum", direction: "desc" },
      playerAverageMode: "total",
    });

    assert.deepEqual(base.rows.map((row) => [row.identifier, row.tableRank]), [
      ["missing-total", 1],
      ["base-leader", 2],
      ["total-leader", 3],
    ]);
    assert.deepEqual(total.rows.map((row) => [row.identifier, row.tableRank]), [
      ["total-leader", 1],
      ["base-leader", 2],
      ["missing-total", 3],
    ]);
    assert.equal(base.sort.playerAverageMode, "base");
    assert.equal(total.sort.playerAverageMode, "total");
  });

  test("maps local player main and constitution sorts to total fields in total mode", () => {
    const rows = [
      player({ identifier: "base-main", name: "Base Main", main: 500, con: 100, mainTotal: 520, conTotal: 110 }),
      player({ identifier: "total-main", name: "Total Main", main: 300, con: 200, mainTotal: 900, conTotal: 250 }),
      player({ identifier: "total-con", name: "Total Con", main: 200, con: 700, mainTotal: 240, conTotal: 950 }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "main" }, playerAverageMode: "base" }).rows.map((row) => row.identifier),
      ["base-main", "total-main", "total-con"],
    );
    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "main" }, playerAverageMode: "total" }).rows.map((row) => row.identifier),
      ["total-main", "base-main", "total-con"],
    );
    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "constitution" }, playerAverageMode: "total" }).rows.map((row) => row.identifier),
      ["total-con", "total-main", "base-main"],
    );
  });

  test("keeps non-stat player sorts independent from player total mode", () => {
    const rows = [
      player({ identifier: "lower-level", name: "Lower Level", level: 10, sum: 900, sumTotal: 9000 }),
      player({ identifier: "higher-level", name: "Higher Level", level: 20, sum: 100, sumTotal: 100 }),
    ];

    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "level" }, playerAverageMode: "base" }).rows.map((row) => row.identifier),
      ["higher-level", "lower-level"],
    );
    assert.deepEqual(
      buildLocalPlayerToplistView(rows, { sort: { metricKey: "level" }, playerAverageMode: "total" }).rows.map((row) => row.identifier),
      ["higher-level", "lower-level"],
    );
  });

  test("keeps tableRank separate from historical hofRank and uses sequential ranks after filtering", () => {
    const result = buildLocalPlayerToplistView([
      player({ identifier: "p1", name: "Ada", sum: 10, hofRank: 99 }),
      player({ identifier: "p2", name: "Ben", sum: 30, hofRank: 1 }),
    ]);

    assert.equal(result.rows[0]?.identifier, "p2");
    assert.equal(result.rows[0]?.tableRank, 1);
    assert.equal(result.rows[0]?.hofRank, 1);
    assert.equal(result.rows[1]?.tableRank, 2);
    assert.equal(result.rows[1]?.hofRank, 99);
  });

  test("caps local players to a public-style top 1000 base-stat result before active table sorting", () => {
    const rows = Array.from({ length: 1005 }, (_, index) => player({
      identifier: `p${String(index).padStart(4, "0")}`,
      name: `Player ${index}`,
      sum: 2000 - index,
      level: index,
    }));
    rows.push(player({ identifier: "outside-high-level", name: "Outside", sum: 1, level: 999999 }));

    const result = buildLocalPlayerToplistView(rows, { sort: { metricKey: "level", direction: "desc" } });

    assert.equal(result.rows.length, 1000);
    assert.equal(result.rows[0]?.identifier, "p0999");
    assert.equal(result.rows[0]?.tableRank, 1);
    assert.equal(result.rows.at(-1)?.identifier, "p0000");
    assert.equal(result.rows.some((row) => row.identifier === "outside-high-level"), false);
  });

  test("applies guild filters inside the stable top 1000 cohort without backfilling outsiders", () => {
    const rows = Array.from({ length: 999 }, (_, index) => player({
      identifier: `other-${String(index).padStart(3, "0")}`,
      name: `Other ${index}`,
      guild: "Other Guild",
      sum: 3000 - index,
      level: index,
    }));
    rows.push(player({ identifier: "alpha-inside", name: "Alpha Inside", guild: "Alpha Guild", sum: 1500, level: 5000 }));
    rows.push(player({ identifier: "alpha-outside", name: "Alpha Outside", guild: "Alpha Guild", sum: 1, level: 9999 }));

    const filtered = buildLocalPlayerToplistView(rows, {
      filters: { guilds: [" alpha guild "] },
      sort: { metricKey: "level", direction: "desc" },
    });
    const cleared = buildLocalPlayerToplistView(rows, {
      filters: { guilds: [] },
      sort: { metricKey: "sum", direction: "desc" },
    });

    assert.deepEqual(filtered.rows.map((row) => [row.identifier, row.tableRank]), [["alpha-inside", 1]]);
    assert.equal(filtered.rows.some((row) => row.identifier === "alpha-outside"), false);
    assert.equal(cleared.rows.length, 1000);
    assert.equal(cleared.rows.some((row) => row.identifier === "alpha-outside"), false);
  });

  test("returns every matching local player when fewer than the top 1000 limit match", () => {
    const rows = Array.from({ length: 25 }, (_, index) => player({
      identifier: `p${index}`,
      name: `Player ${index}`,
      sum: index,
    }));

    assert.equal(buildLocalPlayerToplistView(rows).rows.length, 25);
  });

  test("uses stable server-name-identifier fallback without creating competition ranks", () => {
    const result = buildLocalPlayerToplistView([
      player({ identifier: "b", name: "Same", server: "EU2", sum: 50 }),
      player({ identifier: "a", name: "Same", server: "EU1", sum: 50 }),
      player({ identifier: "c", name: "Another", server: "EU1", sum: 50 }),
    ]);

    assert.deepEqual(result.rows.map((row) => row.identifier), ["b", "c", "a"]);
    assert.deepEqual(result.rows.map((row) => row.tableRank), [1, 2, 3]);
  });

  test("sorts guilds by default average level and keeps missing averages last", () => {
    const result = buildLocalGuildToplistView([
      guild({ guildIdentifier: "g1", name: "Alpha", avgLevel: null }),
      guild({ guildIdentifier: "g2", name: "Beta", avgLevel: 90 }),
      guild({ guildIdentifier: "g3", name: "Gamma", avgLevel: 100 }),
    ]);

    assert.deepEqual(result.rows.map((row) => row.guildIdentifier), ["g3", "g2", "g1"]);
    assert.deepEqual(result.rows.map((row) => row.tableRank), [1, 2, 3]);
  });

  test("uses total guild average fields only when requested", () => {
    const rows = [
      guild({
        guildIdentifier: "g1",
        name: "Alpha",
        avgBaseMain: 200,
        avgConBase: 400,
        avgSumBaseTotal: 600,
        avgAttrTotal: 300,
        avgConTotal: 450,
        avgTotalStats: 750,
      }),
      guild({
        guildIdentifier: "g2",
        name: "Beta",
        avgBaseMain: 250,
        avgConBase: 350,
        avgSumBaseTotal: 650,
        avgAttrTotal: 260,
        avgConTotal: 460,
        avgTotalStats: 720,
      }),
    ];

    assert.deepEqual(
      buildLocalGuildToplistView(rows, { sort: { metricKey: "guildAvgMain" }, guildAverageMode: "base" }).rows.map((row) => row.guildIdentifier),
      ["g2", "g1"],
    );
    assert.deepEqual(
      buildLocalGuildToplistView(rows, { sort: { metricKey: "guildAvgMain" }, guildAverageMode: "total" }).rows.map((row) => row.guildIdentifier),
      ["g1", "g2"],
    );
    assert.deepEqual(
      buildLocalGuildToplistView(rows, { sort: { metricKey: "guildAvgCon" }, guildAverageMode: "base" }).rows.map((row) => row.guildIdentifier),
      ["g1", "g2"],
    );
    assert.deepEqual(
      buildLocalGuildToplistView(rows, { sort: { metricKey: "guildAvgCon" }, guildAverageMode: "total" }).rows.map((row) => row.guildIdentifier),
      ["g2", "g1"],
    );
    const totalSum = buildLocalGuildToplistView(rows, { sort: { metricKey: "guildAvgSum" }, guildAverageMode: "total" });
    assert.deepEqual(totalSum.rows.map((row) => [row.guildIdentifier, row.tableRank]), [
      ["g1", 1],
      ["g2", 2],
    ]);
    assert.equal(totalSum.sort.guildAverageMode, "total");
  });

  test("falls back from unknown metric keys with a structured issue", () => {
    const result = buildLocalPlayerToplistView([player({ identifier: "p1", name: "Ada", sum: 1 })], {
      sort: { metricKey: "unknown-local-metric" },
    });

    assert.equal(result.sort.metricKey, "sum");
    assert.equal(result.issues[0]?.code, "invalid-source-metadata");
  });

  test("treats single-snapshot statsDay as not derived", () => {
    const result = buildLocalPlayerToplistView([
      player({ identifier: "p2", name: "Ben", server: "EU1", sum: 999 }),
      player({ identifier: "p1", name: "Ada", server: "EU1", sum: 1 }),
    ], { sort: { metricKey: "statsDay" } });

    assert.deepEqual(result.rows.map((row) => row.identifier), ["p2", "p1"]);
  });

  test("is fully structured-clone serializable", () => {
    const result = buildLocalGuildToplistView([guild({ guildIdentifier: "g1", name: "Alpha", avgLevel: 1 })]);
    assert.deepEqual(structuredClone(result), result);
  });
});

console.log("localToplistView.test: ok");
