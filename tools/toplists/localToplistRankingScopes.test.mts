import assert from "node:assert/strict";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import { compareLocalToplists } from "../../src/lib/toplists/localToplistComparison.ts";
import { enrichLocalPlayerCompareRows } from "../../src/pages/DataHub/localToplistCompareModel.ts";
import { defaultToplistColumns, normalizeColumnView, toplistColumnTree } from "../../src/lib/toplists/toplistColumns.ts";
import type { ToplistPlayerRow } from "../../src/lib/toplists/toplistContracts.ts";
import type { LocalToplistViewWorkerRequest, LocalToplistViewWorkerResponse, LocalToplistViewWorkerViewRequest } from "../../src/lib/toplists/localToplistViewWorkerTypes.ts";

const now = Date.UTC(2026, 10, 2), day = 86400000;
function dataset(historical: boolean) {
  const timestamp = historical ? now - 30 * day : now;
  return deriveLocalToplistsFromConfirmedScans(["s1_eu", "s2_eu"].map((server, si) => ({
    server, manifestYear: 2026, scanTimestamp: timestamp, archiveScanId: server,
    archiveSha256: "a".repeat(64), localScanId: server,
    confirmation: { kind: "archiveSource" as const, archiveScanId: server, archiveSha256: "a".repeat(64) },
    rawScan: { players: Array.from({ length: 230 }, (_, i) => {
      const base = 10000 - i * 10 - si;
      const growth = historical ? 0 : i * 30;
      return { identifier: `${server}_p${i + 1}`, prefix: server, timestamp, name: `Player ${i}`,
        class: i % 2 ? 1 : 2, guildIdentifier: `${server}_g${i % 2 + 1}`, guildName: `Guild ${i % 2}`,
        values: { Base: base + growth, Attribute: base + (historical ? 0 : (230 - i) * 60), Constitution: 2000, "Base Strength": base + growth, "Base Dexterity": base + growth,
          "Base Intelligence": base + growth, "Base Constitution": 1000,
          "Total Strength": base + (historical ? 0 : (230 - i) * 60),
          "Total Dexterity": base + (historical ? 0 : (230 - i) * 60),
          "Total Intelligence": base + (historical ? 0 : (230 - i) * 60), "Total Constitution": 2000 } };
    }), groups: [1, 2].map(i => ({ identifier: `${server}_g${i}`, prefix: server, timestamp, name: `Guild ${i - 1}`, memberCount: 115 })) },
  })));
}
const old = dataset(true), current = dataset(false);
const previous = { month: "2026-10", players: old.players, guilds: old.guilds, snapshots: old.snapshots };
const target = { month: "2026-11", players: current.players, guilds: current.guilds, snapshots: current.snapshots };
let response: LocalToplistViewWorkerResponse;
(globalThis as unknown as { postMessage: (m: LocalToplistViewWorkerResponse) => void }).postMessage = m => { response = m; };
await import("../../src/workers/localToplistView.worker.ts");
let requestId = 0;
const receive = globalThis.onmessage as unknown as (e: { data: LocalToplistViewWorkerRequest }) => void;
receive({ data: { type: "init", requestId: ++requestId, datasetId: "rankings", playerRows: current.players, guildRows: current.guilds } });
const request: Omit<LocalToplistViewWorkerViewRequest, "requestId"> = { type: "view", datasetId: "rankings", tab: "players", filters: {}, sort: { metricKey: "sum", direction: "desc" }, playerLimit: null, page: 1, pageSize: 200, windowStart: 0 };
function send(changes: Partial<typeof request> = {}) {
  receive({ data: { ...request, ...changes, requestId: ++requestId } });
  assert(response.ok && response.type === "view", JSON.stringify(response));
  return response;
}
for (const metricKey of ["statsDay", "statsDayTotal"]) {
  const result = compareLocalToplists(previous, target, { playerSort: { metricKey, direction: "desc" } });
  const values = result.playerStatsDayValues[metricKey === "statsDayTotal" ? "total" : "base"];
  const rows = send({ sort: { metricKey, direction: "desc" }, playerStatsDayValues: values }).playerRows;
  assert(rows.some(row => values[row.rowKey] != null));
  assert.deepEqual(rows.map(row => row.rowKey), result.currentPlayerView.rows.slice(0, 200).map(row => row.rowKey));
  for (const [i, row] of rows.entries()) {
    const comparison = result.players.find(r => r.current?.rowKey === row.rowKey)!;
    assert.equal(comparison.currentTableRank, i + 1);
    assert.equal(comparison.previousTableRank, null);
    assert.equal(comparison.rankDelta, null);
    assert.equal(comparison.rankings?.overallRank?.delta, null);
    const publicRow = { ...row, __localRow: row } as unknown as ToplistPlayerRow;
    const enriched = enrichLocalPlayerCompareRows({ rows: [publicRow], comparisonRows: result.players, playerAvgMode: "base" })[0];
    assert.equal(enriched._rank, i + 1);
  }
  const sorted = result.currentPlayerView.rows.map(row => values[row.rowKey]);
  assert(sorted.every((value, i) => i === 0 || value == null || sorted[i - 1]! >= value));
}
const baseline = send();
const second = send({ windowStart: 200 });
assert.equal(second.playerRows[0].tableRank, 201);
const jump = send({ targetPlayer: { server: "EU1", identifier: "s1_eu_p50" } });
assert.equal(jump.totalRows, 460);
const jumped = jump.playerRows.find(row => row.identifier === "s1_eu_p50")!;
assert.equal(jumped.rowKey, send({ windowStart: jumped.tableRank - 1 }).playerRows[0].rowKey);
const filtered = send({ nameFilter: "Player 22", filters: { playerClasses: ["warrior"] } });
assert(filtered.playerRows.length > 0);
for (const [i, row] of filtered.playerRows.entries()) {
  assert.equal(row.tableRank, i + 1);
  assert(row.rankings?.overallRank?.rank! >= i + 1);
  assert.equal(row.rankings?.serverRank?.rank, baseline.playerRows.find(r => r.rowKey === row.rowKey)?.rankings?.serverRank?.rank ?? row.rankings?.serverRank?.rank);
}
const favorites = ["EU1\u0000s1_eu_p10", "EU2\u0000s2_eu_p20"];
assert.deepEqual(send({ nameFilter: "", allowedPlayerKeys: favorites }).playerRows.map(r => r.tableRank), [1, 2]);
const cmp = compareLocalToplists(previous, target, { nameFilter: "Player 22", playerSort: request.sort, filters: { playerClasses: ["warrior"] } });
assert.deepEqual(cmp.currentPlayerView.rows.map(r => r.rowKey), filtered.playerRows.map(r => r.rowKey));
for (const row of cmp.players.filter(r => r.current && r.previous)) {
  const before = cmp.previousPlayerView.rows.find(r => r.rowKey === row.previous!.rowKey);
  assert.equal(row.rankDelta, before ? before.tableRank - row.currentTableRank! : null);
}
const guilds = send({ tab: "guilds", nameFilter: "Guild 1", sort: { metricKey: "guildName", direction: "asc" } }).guildRows;
assert.deepEqual(guilds.map(r => r.tableRank), [1, 2]);
assert(guilds.every(r => r.rankings?.overallRank?.rank! > 1));
for (const kind of ["players", "guilds"] as const) {
  assert(!defaultToplistColumns(kind).includes("overallRank"));
  const ranks = toplistColumnTree(kind).find(n => n.key === "rankings")!;
  assert.deepEqual(new Set(ranks.children.map(n => n.key)), new Set(kind === "players" ? ["rank", "rankDelta", "overallRank", "serverRank", "classRank"] : ["rank", "overallRank", "serverRank"]));
  const saved = { activeId: "kept", views: [{ id: "kept", name: "Kept", columns: ["name", "rank", "overallRank", "serverRank"], widths: { name: 250, overallRank: 119 } }] };
  const view = normalizeColumnView(saved, kind);
  assert.deepEqual(view.views, saved.views);
  assert.equal(view.activeId, "kept");
}
console.log("PASS ranking scopes, daily bases, filtered history, windows, jump, favorites and saved view contracts");
