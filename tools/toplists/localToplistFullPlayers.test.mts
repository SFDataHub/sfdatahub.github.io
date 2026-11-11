import { artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { deriveLocalToplistsFromConfirmedScans } from "../../src/lib/toplists/localToplistDerivation.ts";
import { buildLocalPlayerToplistView } from "../../src/lib/toplists/localToplistView.ts";
import { summarizeLocalPlayerCompareRows } from "../../src/pages/DataHub/localToplistCompareModel.ts";
import { compareLocalToplists } from "../../src/lib/toplists/localToplistComparison.ts";
import type { LocalToplistViewWorkerRequest, LocalToplistViewWorkerResponse, LocalToplistViewWorkerSuccess, LocalToplistViewWorkerViewRequest } from "../../src/lib/toplists/localToplistViewWorkerTypes.ts";
let response: LocalToplistViewWorkerResponse;
(globalThis as unknown as { postMessage: (value: LocalToplistViewWorkerResponse) => void }).postMessage = value => { response = value; };
await import("../../src/workers/localToplistView.worker.ts");
let requestId = 0;
const measurements: { label: string; ms: number; bytes: number; rows: number; total: number }[] = [];
function send(message: Omit<LocalToplistViewWorkerViewRequest, "requestId"> | Omit<Extract<LocalToplistViewWorkerRequest, {type: "init"}>, "requestId">, label?: string): LocalToplistViewWorkerSuccess {
  const start = performance.now();
  (globalThis.onmessage as unknown as (e: { data: LocalToplistViewWorkerRequest }) => void)({ data: { ...message, requestId: ++requestId } });
  assert(response.ok, response.ok ? "" : response.error);
  assert(response.type === "view" || response.type === "init");
  if (label) measurements.push({ label, ms: performance.now() - start, bytes: JSON.stringify(response).length, rows: response.playerRows.length, total: response.totalRows });
  return response;
}
const stamp = Date.UTC(2026, 9, 6);
function fixture(server: string, index: number, historical = false) {
  const timestamp = historical ? stamp - 31 * 86400000 : stamp;
  return { server, manifestYear: 2026, scanTimestamp: timestamp, archiveScanId: server, archiveSha256: "a".repeat(64), localScanId: `local-${server}`,
    confirmation: { kind: "archiveSource" as const, archiveScanId: server, archiveSha256: "a".repeat(64) },
    rawScan: { players: Array.from({ length: 1205 }, (_, i) => ({ identifier: `${server}_p${i+1}`, prefix: server, timestamp,
      name: i === 1204 ? "LastPlayer" : i === 1100 ? "BeyondServer" : i === 1000 ? "SameName" : `Player${i}`,
      class: 1, level: i, guildIdentifier: `${server}_g1`, guildName: historical ? "Historical" : "CurrentGuild",
      values: { Base: 1000000 - index*10000 - i - (historical ? 500 : 0), "Base Strength": 1000000 - index*10000 - i - (historical ? 500 : 0), "Base Constitution": 500 } })),
      groups: [{ identifier: `${server}_g1`, prefix: server, timestamp, name: historical ? "Historical" : "CurrentGuild", memberCount: 1205 }] } };
}
const current = deriveLocalToplistsFromConfirmedScans(Array.from({length:45}, (_, i) => fixture(`s${i+1}_eu`, i)));
assert.equal(current.players.length, 54225, "normalization and derivation preserve every player on all 45 servers");
assert(current.snapshots.every(snapshot => snapshot.playerCount === 1205), "each server contributes more than 1000");
const historical = deriveLocalToplistsFromConfirmedScans([fixture("s1_eu", 0, true)]);
send({type:"init",datasetId:"full",contentRevision:"r1",playerRows:current.players,guildRows:current.guilds}, "init 45 servers");
const request: Omit<LocalToplistViewWorkerViewRequest, "requestId"> = { type:"view",datasetId:"full",contentRevision:"r1",tab:"players",filters:{},sort:{metricKey:"sum",direction:"desc"},playerLimit:null,windowStart:0,page:1,pageSize:200 };
const first=send(request,"initial window");assert.equal(first.totalRows,54225);assert.equal(first.playerRows.length,200);
assert.equal(send({...request,playerLimit:undefined,windowStart:undefined,page:999}).playerRows.length,0,"legacy out-of-range pages remain empty");
const all:string[]=[];
for(let start=0;start<first.totalRows;start+=200){const page=send({...request,windowStart:start});assert(page.playerRows.length<=200);assert.equal(page.contentRevision,"r1");all.push(...page.playerRows.map(row=>row.rowKey));}
assert.equal(all.length,54225);assert.equal(new Set(all).size,54225);
const last=send({...request,windowStart:54200},"last window");assert.equal(last.playerRows.at(-1)?.tableRank,54225);
const target=send({...request,targetPlayer:{server:"EU1",identifier:"s1_eu_p1101"}},"jump beyond server 1000");assert.equal(target.targetIndex,1100);assert(target.playerRows.some(row=>row.identifier==="s1_eu_p1101"&&row.tableRank===1101));
const sorted=send({...request,sort:{metricKey:"level",direction:"desc"},targetPlayer:{server:"EU1",identifier:"s1_eu_p1101"}},"sorted jump");assert(sorted.targetIndex!>1100);assert(sorted.playerRows.some(row=>row.identifier==="s1_eu_p1101"));
const filtered=send({...request,nameFilter:"BeyondServer"},"filter beyond both limits");assert.equal(filtered.totalRows,45);assert(filtered.playerRows.every((row,i)=>row.tableRank===i+1));assert.equal(filtered.playerRows[0].rankings?.overallRank?.rank,1101);
assert.equal(send({...request,nameFilter:"SameName"}).totalRows,45,"same names preserve server identities");
assert.equal(send({...request,filters:{servers:["EU1"]}}).totalRows,1205);assert.equal(send({...request,filters:{servers:["EU1","EU2"]}}).totalRows,2410);assert.equal(send({...request,filters:{servers:["EU2"]}}).totalRows,1205);
assert.equal(send({...request,filters:{servers:["EU1"]},nameFilter:"LastPlayer"}).playerRows[0].tableRank,1);
const comparison=compareLocalToplists({month:"2026-09",players:historical.players,guilds:historical.guilds,snapshots:historical.snapshots}, {month:"2026-10",players:current.players.filter(row=>row.server==="EU1"),guilds:current.guilds.filter(row=>row.server==="EU1"),snapshots:current.snapshots.slice(0,1)});
assert.equal(comparison.currentPlayerView.rows.length,1205);assert.equal(comparison.previousPlayerView.rows.length,1205);
const matched=comparison.players.find(row=>row.current?.identifier==="s1_eu_p1101");assert.equal(matched?.rankDelta,0);assert.equal(matched?.deltas.sum,500);
assert.deepEqual(summarizeLocalPlayerCompareRows(comparison.players,"base",()=>true),{average:16,max:16},"Compare cell tones use the full view, independent of the window");
send({type:"init",datasetId:"month",playerRows:historical.players,guildRows:historical.guilds});
const month=send({...request,datasetId:"month",contentRevision:undefined,nameFilter:"LastPlayer"});assert.equal(month.playerRows[0].guild,"Historical");assert.equal(month.playerRows[0].tableRank,1);
// Shared helper defaults stay unchanged for other top lists.
assert.equal(buildLocalPlayerToplistView(current.players).rows.length,1000);
await mkdir(artifactPath("tmp/w28"),{recursive:true});await writeFile(artifactPath("tmp/w28/full-players-unit.json"),JSON.stringify({controlledPlayers:54225,servers:45,playersPerServer:1205,measurements},null,2));
console.log("localToplistFullPlayers.test: ok",JSON.stringify(measurements));
