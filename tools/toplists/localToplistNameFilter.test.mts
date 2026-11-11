import assert from "node:assert/strict";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import { buildLocalPlayerToplistView } from "../../src/lib/toplists/localToplistView.ts";
import { compareLocalToplists } from "../../src/lib/toplists/localToplistComparison.ts";
import type { LocalToplistViewWorkerRequest, LocalToplistViewWorkerResponse, LocalToplistViewWorkerViewRequest } from "../../src/lib/toplists/localToplistViewWorkerTypes.ts";
import { buildLocalToplistViewRequestKey } from "../../src/pages/DataHub/localToplistPageModel.ts";

let response: LocalToplistViewWorkerResponse;
(globalThis as unknown as { postMessage: (message: LocalToplistViewWorkerResponse) => void }).postMessage = message => { response = message; };
await import("../../src/workers/localToplistView.worker.ts");
const receive = globalThis.onmessage as unknown as (event: MessageEvent<LocalToplistViewWorkerRequest>) => void;
let requestId = 0;
function send(request: Omit<LocalToplistViewWorkerViewRequest, "requestId">) {
  receive({ data: { ...request, requestId: ++requestId } } as MessageEvent<LocalToplistViewWorkerRequest>);
  assert(response.ok, response.ok ? undefined : response.error);
  assert.equal(response.type, "view");
  return response;
}
const stamp = Date.UTC(2026, 9, 6);
function data(server: string, historic = false) {
  const guild = historic ? "Historical" : "Älpha";
  const players = Array.from({ length: 1005 }, (_, i) => ({ identifier: `${server}_p${i + 1}`, prefix: server, timestamp: stamp,
    name: i === 1004 ? "FarAway" : i === 1003 ? "Solo" : i === 1002 ? "AlphaPerson" : `Player${i}`,
    guildIdentifier: i === 1003 ? null : `${server}_g${i === 1002 ? 2 : 1}`, guildName: i === 1003 ? null : i === 1002 ? "Other" : guild,
    class: i === 1002 ? 2 : 1, level: i + 100, rank: i + 1,
    values: { Base: 10000 - i, "Base Strength": 10000 - i, "Base Intelligence": 10000 - i, "Base Constitution": 500, Attribute: 12000 - i, Constitution: 600 } }));
  return deriveLocalToplistsFromConfirmedScans([{ server, manifestYear: 2026, scanTimestamp: stamp,
    archiveScanId: server, archiveSha256: "a".repeat(64), localScanId: `local-${server}`,
    confirmation: { kind: "archiveSource", archiveScanId: server, archiveSha256: "a".repeat(64) },
    rawScan: { players, groups: [{ identifier: `${server}_g1`, prefix: server, timestamp: stamp, name: guild, memberCount: 1003, avgLevel: 200 },
      { identifier: `${server}_g2`, prefix: server, timestamp: stamp, name: "Other", memberCount: 1, avgLevel: 200 }] } }]);
}
const current = data("s1_eu"), second = data("s2_eu"), historical = data("s1_eu", true);
assert.equal(current.players.length, 1005);
function init(players = current.players, guilds = current.guilds, id = "current") {
  receive({ data: { type: "init", requestId: ++requestId, datasetId: id, playerRows: players, guildRows: guilds } } as MessageEvent<LocalToplistViewWorkerRequest>);
  assert(response.ok);
}
const request: Omit<LocalToplistViewWorkerViewRequest, "requestId"> = { type: "view", datasetId: "current", tab: "players",
  filters: { servers: ["EU1"] }, sort: { metricKey: "sum", direction: "desc" }, page: 1, pageSize: 1000 };
init();
const normal = send(request);
assert.equal(normal.totalRows, 1000);
assert(!normal.playerRows.some(row => row.name === "FarAway"));
const far = send({ ...request, nameFilter: "faraway" });
assert.equal(far.totalRows, 1);
assert.equal(far.playerRows[0].name, "FarAway");
assert.equal(far.playerRows[0].tableRank, 1, "a name filter numbers its resulting list");
assert.equal(send({ ...request, nameFilter: "faraway", allowedPlayerKeys: [] }).totalRows, 0, "empty favorites remain an additional filter");
const favorite = send({ ...request, nameFilter: "faraway", allowedPlayerKeys: ["EU1\u0000s1_eu_p1005"] });
assert.equal(favorite.playerRows[0].tableRank, 1, "favorites number the resulting list before slicing");
assert.equal(send({ ...request, tab: "guilds", nameFilter: "alpha", allowedGuildKeys: [] }).totalRows, 0);
const solo = send({ ...request, nameFilter: "solo" });
assert.equal(solo.playerRows.length, 1);
assert.equal(send({ ...request, tab: "guilds", nameFilter: "solo" }).totalRows, 0);
const union = send({ ...request, nameFilter: "alpha" });
assert.equal(union.totalRows, 1000, "union is limited only after matching");
assert.equal(new Set(union.playerRows.map(row => row.rowKey)).size, union.playerRows.length);
const guildUnion = send({ ...request, tab: "guilds", nameFilter: "alpha" });
assert.deepEqual(new Set(guildUnion.guildRows.map(row => row.name)), new Set(["Älpha", "Other"]));
const playerOnly = send({ ...request, nameFilter: "alphaperson" });
assert.equal(playerOnly.totalRows, 1, "a player match does not include their fellow members");
assert.equal(send({ ...request, tab: "guilds", nameFilter: "alphaperson" }).guildRows[0].name, "Other");
assert.equal(send({ ...request, nameFilter: "faraway", filters: { ...request.filters, playerClasses: ["mage"] } }).totalRows, 0);
assert.equal(send({ ...request, nameFilter: "faraway", filters: { ...request.filters, guilds: ["Other"] } }).totalRows, 0);
const sortedRequest = { ...request, sort: { metricKey: "level", direction: "asc" as const } };
const sorted = send(sortedRequest);
const filtered = send({ ...sortedRequest, nameFilter: "player9" });
for (const [index, row] of filtered.playerRows.entries()) assert.equal(row.tableRank, index + 1);
assert(filtered.playerRows.every((row, i, rows) => !i || row.level! >= rows[i - 1].level!));
assert.equal(send({ ...request, nameFilter: "   " }).totalRows, 1000);
init([...current.players, ...second.players], [...current.guilds, ...second.guilds], "multi");
const multi = send({ ...request, datasetId: "multi", filters: { servers: ["s1_eu", "EU2"] }, nameFilter: "faraway" });
assert.equal(multi.totalRows, 2);
assert.equal(new Set(multi.playerRows.map(row => row.server)).size, 2);
assert.equal(send({ ...request, datasetId: "multi", filters: { servers: ["EU1"] }, nameFilter: "faraway" }).totalRows, 1);
init(historical.players, historical.guilds, "month");
assert.equal(send({ ...request, datasetId: "month", tab: "guilds", nameFilter: "faraway" }).guildRows[0].name, "Historical");
assert.equal(send({ ...request, datasetId: "month", nameFilter: "alpha" }).totalRows, 1, "month uses its own membership/name context");
const comparison = compareLocalToplists({ month: "2026-08", players: historical.players, guilds: historical.guilds, snapshots: historical.snapshots },
  { month: "2026-09", players: current.players, guilds: current.guilds, snapshots: current.snapshots });
init(current.players, current.guilds, "compare");
const compareFilter = send({ ...request, datasetId: "compare", playerLimit: null, nameFilter: "faraway" });
assert.equal(compareFilter.playerRows[0].tableRank, 1);
assert.equal(send({ ...request, datasetId: "compare", tab: "guilds", nameFilter: "faraway" }).guildRows[0].name, "Älpha", "compare uses target-side membership");
const manyGuilds = Array.from({ length: 301 }, (_, i) => ({ ...current.guilds[0], guildId: String(i + 1), guildIdentifier: `s1_eu_g${i + 1}`, rowKey: `s1_eu_g${i + 1}`, name: `Match Guild ${i}` }));
init(current.players, manyGuilds, "compare-guilds");
assert.equal(send({ ...request, datasetId: "compare-guilds", tab: "guilds", guildLimit: null, pageSize: 301, nameFilter: "match" }).guildRows.length, 301, "Compare retains its existing full guild display");
assert.equal(send({ ...request, datasetId: "compare-guilds", tab: "guilds", pageSize: 250, nameFilter: "guild 300" }).guildRows.length, 1, "a guild beyond the normal 250 is reachable");
const key = { datasetId: "same", tab: "players" as const, servers: ["EU1"], playerSort: { metricKey: "sum", direction: "desc" as const }, guildSort: { metricKey: "sum", direction: "desc" as const }, playerValueMode: "base" as const, guildValueMode: "base" as const };
assert.notEqual(buildLocalToplistViewRequestKey({ ...key, nameFilter: "one" }), buildLocalToplistViewRequestKey({ ...key, nameFilter: "two" }));
console.log("localToplistNameFilter.test: ok (full-context rank 1005, cross-name union, server identity, month/compare membership)");
