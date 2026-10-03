import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import type { ToplistGuildRow, ToplistPlayerRow } from "../../src/lib/toplists/toplistContracts.ts";
import { buildLocalToplistExportModel } from "../../src/pages/GuildHub/localToplistExportModel.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_EXPORT_AMOUNTS = [50, 100, 150] as const;
const PUBLIC_DEFAULT_EXPORT_AMOUNT = 50;

const selectRowsForPublicExportAmount = <T>(rows: readonly T[], amount: number) => rows.slice(0, amount);

const player = (index: number): ToplistPlayerRow & { tableRank: number } => ({
  identifier: `eu1_p${index}`,
  playerId: String(index),
  flag: null,
  deltaRank: null,
  server: "EU1",
  name: `Player ${index}`,
  class: "Warrior",
  level: index,
  guild: index % 2 === 0 ? "Guild" : null,
  main: 1000 + index,
  con: 900 + index,
  sum: 1900 + index,
  ratio: null,
  mainTotal: 2000 + index,
  conTotal: 1800 + index,
  sumTotal: 3800 + index,
  xpProgress: null,
  xpTotal: null,
  mine: null,
  treasury: null,
  lastScan: null,
  deltaSum: null,
  tableRank: index,
});

const guild = (index: number): ToplistGuildRow & { tableRank: number } => ({
  guildId: `g${index}`,
  guildIdentifier: `eu1__g${index}`,
  server: "EU1",
  name: `Guild ${index}`,
  hofRank: index,
  honor: 10000 - index,
  raids: index,
  portalFloor: index,
  hydra: index,
  instructor: index,
  petLevel: index,
  memberCount: 50,
  avgLevel: 100 + index,
  avgBaseMain: 1000 + index,
  avgConBase: 900 + index,
  avgSumBaseTotal: 1900 + index,
  avgAttrTotal: 2000 + index,
  avgConTotal: 1800 + index,
  avgTotalStats: 3800 + index,
  avgMine: null,
  avgTreasury: null,
  lastScan: null,
  deltaHonor: null,
  tableRank: index,
} as ToplistGuildRow & { tableRank: number });

const baseOptions = {
  selectedServers: ["EU1"],
  selectedClasses: [],
  listView: "table",
  contextLoading: false,
  dataLoading: false,
  viewLoading: false,
  contextError: null,
  dataError: null,
  viewError: null,
  hasCurrentEntries: true,
  isFullyUnavailable: false,
  isExporting: false,
  playerRows: [] as ToplistPlayerRow[],
  visiblePlayerRows: [] as ToplistPlayerRow[],
  guildRows: [] as ToplistGuildRow[],
  playerSort: { metricKey: "sum", direction: "desc" as const },
  guildSort: { metricKey: "guildAvgLevel", direction: "desc" as const },
  playerValueMode: "base" as const,
  guildValueMode: "base" as const,
  playerUpdatedAt: 1,
  guildUpdatedAt: 2,
  playerError: null,
  guildError: null,
};

describe("local toplist export model", () => {
  test("builds a full player export source pool independent from the visible slice", () => {
    const playerRows = Array.from({ length: 1000 }, (_, index) => player(index + 1));
    const visiblePlayerRows = playerRows.slice(0, 100);
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "players",
      selectedClasses: ["warrior"],
      playerRows,
      visiblePlayerRows,
      playerValueMode: "total",
      playerSort: { metricKey: "main", direction: "desc" },
      playerUpdatedAt: 123,
    });

    assert.equal(model.canExport, true);
    assert.equal(model.snapshot.kind, "players");
    assert.equal(model.snapshot.rowCount, 1000);
    assert.equal(model.snapshot.presetReadOnlyData.rows.length, 1000);
    assert.equal(model.snapshot.presetReadOnlyData.allRows?.length, 1000);
    assert.equal(model.snapshot.presetReadOnlyData.rows[0]?.identifier, "eu1_p1");
    assert.equal(model.snapshot.presetReadOnlyData.rows.at(-1)?.identifier, "eu1_p1000");
    assert.equal((model.snapshot.presetReadOnlyData.rows.at(-1) as any).tableRank, 1000);
    assert.equal(model.snapshot.presetReadOnlyData.playerAvgMode, "total");
    assert.deepEqual(model.snapshot.selectedClasses, ["warrior"]);

    visiblePlayerRows.length = 0;
    assert.equal(model.snapshot.presetReadOnlyData.rows.length, 1000);
  });

  test("uses the public default amount from the full player source pool", () => {
    const playerRows = Array.from({ length: 1000 }, (_, index) => player(index + 1));
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "players",
      playerRows,
      visiblePlayerRows: playerRows.slice(0, 100),
    });

    assert.equal(model.canExport, true);
    const exportedRows = selectRowsForPublicExportAmount(model.snapshot.presetReadOnlyData.rows, PUBLIC_DEFAULT_EXPORT_AMOUNT);
    assert.equal(exportedRows.length, PUBLIC_DEFAULT_EXPORT_AMOUNT);
    assert.equal(exportedRows[0]?.identifier, "eu1_p1");
    assert.equal(exportedRows.at(-1)?.identifier, "eu1_p50");
  });

  test("exports all available player rows when fewer rows exist than the public default", () => {
    const playerRows = Array.from({ length: 37 }, (_, index) => player(index + 1));
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "players",
      playerRows,
      visiblePlayerRows: playerRows.slice(0, 10),
    });

    assert.equal(model.canExport, true);
    const exportedRows = selectRowsForPublicExportAmount(model.snapshot.presetReadOnlyData.rows, PUBLIC_DEFAULT_EXPORT_AMOUNT);
    assert.equal(exportedRows.length, 37);
    assert.equal(exportedRows.at(-1)?.identifier, "eu1_p37");
  });

  test("uses each public export amount without adding a local amount above the public maximum", () => {
    const playerRows = Array.from({ length: 250 }, (_, index) => player(index + 1));
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "players",
      playerRows,
      visiblePlayerRows: playerRows.slice(0, 100),
    });

    assert.equal(model.canExport, true);
    for (const amount of PUBLIC_EXPORT_AMOUNTS) {
      const exportedRows = selectRowsForPublicExportAmount(model.snapshot.presetReadOnlyData.rows, amount);
      assert.equal(exportedRows.length, amount);
      assert.equal(exportedRows.at(-1)?.identifier, `eu1_p${amount}`);
    }
    assert.equal(Math.max(...PUBLIC_EXPORT_AMOUNTS), 150);
  });

  test("builds a full guild export snapshot from the current guild worker view", () => {
    const guildRows = Array.from({ length: 250 }, (_, index) => guild(index + 1));
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "guilds",
      guildRows,
      guildValueMode: "total",
      guildSort: { metricKey: "guildAvgSum", direction: "desc" },
      guildUpdatedAt: 456,
    });

    assert.equal(model.canExport, true);
    assert.equal(model.snapshot.kind, "guilds");
    assert.equal(model.snapshot.rowCount, 250);
    assert.equal(model.snapshot.presetReadOnlyData.rows.length, 250);
    assert.equal(model.snapshot.presetReadOnlyData.rows[0]?.guildId, "g1");
    assert.equal(model.snapshot.presetReadOnlyData.rows.at(-1)?.guildId, "g250");
    assert.equal((model.snapshot.presetReadOnlyData.rows.at(-1) as any).tableRank, 250);
    assert.equal(model.snapshot.presetReadOnlyData.avgMode, "total");
    assert.equal(model.snapshot.sort.metricKey, "guildAvgSum");
  });

  test("guild exports use the same public amount selection from the local source pool", () => {
    const guildRows = Array.from({ length: 90 }, (_, index) => guild(index + 1));
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "guilds",
      guildRows,
    });

    assert.equal(model.canExport, true);
    const exportedRows = selectRowsForPublicExportAmount(model.snapshot.presetReadOnlyData.rows, PUBLIC_DEFAULT_EXPORT_AMOUNT);
    assert.equal(exportedRows.length, PUBLIC_DEFAULT_EXPORT_AMOUNT);
    assert.equal(exportedRows[0]?.guildId, "g1");
    assert.equal(exportedRows.at(-1)?.guildId, "g50");
  });

  test("blocks empty, unavailable, loading, error, non-table, no-server, and exporting states", () => {
    const playerRows = [player(1)];
    const cases = [
      { expected: "no_servers", patch: { selectedServers: [] } },
      { expected: "not_table_view", patch: { listView: "cards" } },
      { expected: "loading", patch: { viewLoading: true } },
      { expected: "error", patch: { viewError: "boom" } },
      { expected: "no_current_entries", patch: { hasCurrentEntries: false } },
      { expected: "unavailable", patch: { isFullyUnavailable: true } },
      { expected: "empty", patch: { playerRows: [] } },
      { expected: "exporting", patch: { isExporting: true } },
    ];

    for (const item of cases) {
      const model = buildLocalToplistExportModel({
        ...baseOptions,
        tab: "players",
        playerRows,
        visiblePlayerRows: playerRows,
        ...item.patch,
      });
      assert.equal(model.canExport, false);
      assert.equal(model.blockedReason, item.expected);
    }
  });

  test("allows partially available selections by exporting only the rows already present", () => {
    const model = buildLocalToplistExportModel({
      ...baseOptions,
      tab: "players",
      selectedServers: ["EU1", "EU2"],
      playerRows: [player(1), { ...player(2), server: "EU2", identifier: "eu2_p2" }],
      visiblePlayerRows: [player(1)],
    });

    assert.equal(model.canExport, true);
    assert.deepEqual(model.snapshot.selectedServers, ["EU1", "EU2"]);
    assert.deepEqual(model.snapshot.presetReadOnlyData.rows.map((row) => row.identifier), ["eu1_p1", "eu2_p2"]);
  });

  test("keeps the public export controller default amount path unchanged", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src/components/export/ToplistExportController.tsx"), "utf8");
    const dialogSource = fs.readFileSync(path.join(repoRoot, "src/components/export/ToplistPngExportDialog.tsx"), "utf8");
    const localModelSource = fs.readFileSync(path.join(repoRoot, "src/pages/GuildHub/localToplistExportModel.ts"), "utf8");
    const localToplistSource = fs.readFileSync(path.join(repoRoot, "src/pages/GuildHub/Toplist.tsx"), "utf8");

    assert.match(source, /const \[exportAmount, setExportAmount\] = React\.useState<ToplistExportAmount>\(50\)/);
    assert.match(dialogSource, /export type ToplistExportAmount = 50 \| 100 \| 150/);
    assert.match(dialogSource, /\[50, 100, 150\]\.map/);
    assert.equal(source.includes("resolvePresetAmount"), false);
    assert.equal(localToplistSource.includes("resolvePresetAmount"), false);
    assert.match(localToplistSource, /presetAmount=\{amount\}/);
    assert.equal(localModelSource.includes("LOCAL_PLAYER_EXPORT_ROW_LIMIT"), false);
    assert.equal(localModelSource.includes("presetAmount"), false);
    assert.match(source, /if \(!liveTableRef\.current \|\| isExportingPng\) return/);
    assert.match(source, /finally \{\s*setIsExportingPng\(false\);/s);
    assert.equal(source.includes("loadOrBuildLocalToplistSnapshots"), false);
    assert.equal(source.includes("LocalToplistViewWorkerSession"), false);
  });
});

console.log("localToplistExport.test: ok");
