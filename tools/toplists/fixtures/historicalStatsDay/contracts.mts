import assert from "node:assert/strict";
import { resolveLocalToplistCompareEntryPlan, resolveHistoricalStatsDayEntryPlan, buildHistoricalPlayerStatsDayValues, buildLocalToplistComparisonSnapshotSet } from "../../../../src/pages/DataHub/localToplistCompareModel.ts";
import { compareLocalToplists } from "../../../../src/lib/toplists/localToplistComparison.ts";
import type { ScanArchiveManifest, ScanArchiveManifestScan } from "../../../../src/lib/scanArchive/types.ts";
import type { LocalPlayerToplistRow } from "../../../../src/lib/toplists/localToplistTypes.ts";
import type { LocalToplistLoadResult } from "../../../../src/lib/toplists/localToplistService.ts";
import type { IdentityResolutionSnapshot } from "../../../../src/lib/identities/identityResolution.ts";

const scans = ["2026-02", "2026-06", "2026-09", "2026-10", "2026-11"].flatMap(month => ["s1_eu", "s2_eu"].map(server => {
  const timestamp = Date.parse(month + "-04T12:00:00Z"), id = server + ":" + timestamp;
  return { id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(), path: id + ".json.gz", sha256: "a".repeat(64), format: "sftools.raw.v1", compression: "gzip", compressedBytes: 1, uncompressedBytes: 2,
    searchIndex: { schemaVersion: 2, path: id + ".search.json.gz", sha256: "b".repeat(64), compressedBytes: 1, uncompressedBytes: 2, playerCount: 1, groupCount: 0 } } as ScanArchiveManifestScan;
}));
const monthly = Object.fromEntries(["2026-02", "2026-06", "2026-09", "2026-10", "2026-11"].map(month => [month, Object.fromEntries(scans.filter(s => s.timestampUtc.startsWith(month)).map(s => [s.server, { scanIds: [s.id] }]))]));
const manifest = { schemaVersion: 1, archiveYear: 2026, revision: 1, scans, toplists: { schemaVersion: 1, monthly, current: monthly["2026-11"] } } as ScanArchiveManifest;
const input = { selectedServers: ["EU1", "EU2"], manifests: [manifest], manifestUrlsByYear: { 2026: "https://example.test/manifest.json" } };
const plan = (from: string, to: string, mode: "months" | "progress" | "off" = "months") => resolveLocalToplistCompareEntryPlan({ ...input, mode, resolveFusionSources: true, progressSinceMonth: from, compareFromMonth: from, compareToMonth: to });
const history = resolveHistoricalStatsDayEntryPlan(plan("2026-10", "2026-11"), input);
assert.equal(history.previousMonth, "2026-09"); assert.equal(history.currentMonth, "2026-10"); assert.equal(history.previousEntries.length, 2);
assert.equal(resolveHistoricalStatsDayEntryPlan(plan("2026-06", "2026-10"), input).previousMonth, "2026-02");
assert.equal(resolveHistoricalStatsDayEntryPlan(plan("2026-09", "2026-11", "progress"), input).previousMonth, "2026-07");
assert.equal(resolveHistoricalStatsDayEntryPlan(plan("2026-06", "2026-11"), input).status, "unavailable", "No nearest-month fallback for missing January");
assert.equal(resolveHistoricalStatsDayEntryPlan(plan("2026-10", "2026-11", "off"), input).active, false);
const split = { ...manifest, scans: [...scans, { ...scans[4], id: "supplement" }], toplists: { ...manifest.toplists!, monthly: { ...monthly, "2026-09": { ...monthly["2026-09"], s1_eu: { scanIds: [scans[4].id, "supplement"] } } } } } as ScanArchiveManifest;
assert.equal(resolveHistoricalStatsDayEntryPlan(history, { ...input, manifests: [split] }).previousEntries.length, 0); // C would be August, not another available month.
const complete = resolveHistoricalStatsDayEntryPlan(plan("2026-10", "2026-11"), { ...input, manifests: [split] });
assert.equal(complete.previousEntries.filter(e => e.server === "s1_eu").length, 2);

const identities: IdentityResolutionSnapshot = { players: { byIdentifier: new Map(), byIdentityId: new Map() }, guilds: { byIdentifier: new Map(), byIdentityId: new Map() } };
const times = [Date.UTC(2026,8,4), Date.UTC(2026,9,4), Date.UTC(2026,10,2)];
function row(id: number, sum: number | null, total: number | null, stand: number): LocalPlayerToplistRow {
  const server = id === 3 ? "EU2" : "EU1", source = id === 3 ? "s2_eu" : "s1_eu";
  return { rowKey: `${stand}:${id}`, identifier: `${source}_p${id}`, playerId: String(id), name: "P" + id, server, sourceServer: source, scanTimestamp: times[stand], latestScanAtSec: times[stand] / 1000, class: id === 3 ? "Mage" : "Warrior", classId: id === 3 ? 2 : 1, guild: stand === 0 ? "Old Guild" : "New Guild", guildIdentifier: source + "_g" + stand, level: 100, main: sum, con: 0, sum, sumTotal: total, mainTotal: total, conTotal: 0, archiveScanId: String(stand), manifestYear: 2026, archiveSha256: "a".repeat(64), localScanId: String(stand), hofRank: null, ratio: null, xpProgress: null, xpTotal: null, mine: null, treasury: null, statsPerDay: null, statsDayTotal: null, lastScan: null };
}
const result = (rows: LocalPlayerToplistRow[]): LocalToplistLoadResult => ({ status: "complete", playerRows: rows, guildRows: [], snapshots: [], issues: [], readySelections: [], failedSelections: [], cacheHits: [], cacheMisses: [], derivedSelections: [], networkAccessed: false, workerRan: false });
const c = result([row(1,1000,1000,0),row(2,1000,1000,0),row(3,1000,1000,0)]);
const b = result([row(1,1600,1300,1),row(2,1000,1900,1),row(3,1300,1600,1),row(4,500,null,1)]);
const a = result([row(1,1600,4200,2),row(2,3900,1900,2),row(3,2750,3050,2),row(4,null,null,2)]);
const basis = buildHistoricalPlayerStatsDayValues(history,c,b,identities);
assert.deepEqual([1,2,3,4].map(i=>basis.base["1:"+i]),[20,0,10,null]);
assert.deepEqual([1,2,3,4].map(i=>basis.total["1:"+i]),[10,30,20,null]);
for(const [metric,mode,deltas] of [["statsDay","base",[-2,2,0]],["statsDayTotal","total",[2,-2,0]]] as const){
 const options = { playerSort: {metricKey:metric,direction:"desc" as const}, previousPlayerStatsDayValues:basis[mode], playerIdentities:identities };
 const compared=compareLocalToplists(buildLocalToplistComparisonSnapshotSet("2026-10",b),buildLocalToplistComparisonSnapshotSet("2026-11",a),options);
 for(const [index,id] of [1,2,3].entries()) {const r=compared.players.find(r=>r.current?.playerId===String(id))!;assert.equal(r.rankDelta,deltas[index]);assert.equal(r.rankings?.overallRank?.delta,deltas[index]);assert.equal(r.rankings?.serverRank?.delta,id===3?0:deltas[index]/2);assert.equal(r.rankings?.classRank?.delta,id===3?0:deltas[index]/2);}
 assert.equal(compared.players.find(r=>r.current?.playerId==="4")!.previousTableRank,null);
 const filtered=compareLocalToplists(buildLocalToplistComparisonSnapshotSet("2026-10",b),buildLocalToplistComparisonSnapshotSet("2026-11",a),{...options,nameFilter:"P2"});const p2=filtered.players.find(r=>r.current?.playerId==="2")!;assert.equal(p2.rankDelta,0);assert.equal(p2.rankings?.overallRank?.delta,deltas[1]);
 const missing=result(a.playerRows.map(r=>r.playerId==="2"?{...r,sum:null,sumTotal:null}:r));
 const missingComparison=compareLocalToplists(buildLocalToplistComparisonSnapshotSet("2026-10",b),buildLocalToplistComparisonSnapshotSet("2026-11",missing),options);assert.equal(missingComparison.players.find(r=>r.current?.playerId==="2")!.rankDelta,null);
 const noBasis=compareLocalToplists(buildLocalToplistComparisonSnapshotSet("2026-10",b),buildLocalToplistComparisonSnapshotSet("2026-11",a),{playerSort:options.playerSort});assert(noBasis.players.every(r=>r.rankDelta===null));
}
console.log("PASS interval planning, complete sets, independent Base/Total values and all rank scopes, zero/missing, name/guild changes and missing basis");
