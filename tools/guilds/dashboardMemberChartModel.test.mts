import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { buildDashboardGuildComparison, guildComparisonSeries } from "../../src/pages/GuildHub/dashboardGuildComparison.ts";
import { buildDashboardHistory } from "../../src/pages/GuildHub/dashboardHistory.ts";
import { comparePlayerSeries, memberChartPlayerPoints, memberChartColor, toggleMemberSelection, rankingMemberSelection } from "../../src/pages/GuildHub/dashboardMemberChartModel.ts";
import { projectChartGaps } from "../../src/components/ui/charts/anchoredLineChartGaps.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
import type { GuildTrendHistory } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
const times=[1000,2000,3000];
const identity=await loadIdentityResolutionSnapshot();
function fixture(): GuildTrendHistory {
  return { identity, guildRankings: times.flatMap((timestampMs, time) => Array.from({ length: 16 }, (_, index) => ({
    sourceScanId: "s" + time, guildIdentifier: "f8_net_g" + (index + 1), server: "f8_net", timestampMs,
    hofRank: time === 2 ? index + 1 : 16 - index,
  }))), data: {
    snapshots: times.map((snapshotTimestamp, time) => ({ id: "s" + time, sourceScanId: "s" + time, sourceScanFilename: "fixture", sourceImportedAt: "2026-10-24", timestamp: new Date(snapshotTimestamp).toISOString(), snapshotTimestamp })),
    guilds: times.flatMap((snapshotTimestamp, time) => Array.from({ length: 16 }, (_, index) => ({
      id: `g${time}-${index}`, snapshotId: "s" + time, sourceScanId: "s" + time, sourceScanFilename: "fixture", snapshotTimestamp,
      server: "f8_net", guildIdentifier: "f8_net_g" + (index + 1), guildSegment: String(index + 1), guildName: "Guild " + (index + 1),
      memberCount: index + 1, declaredMemberCount: index + 1, averageLevel: 100, averageBaseStats: null, averageTotalStats: null,
    }))),
    members: times.flatMap((snapshotTimestamp, time) => Array.from({ length: 16 }, (_, index) => Array.from({ length: index + 1 }, (_, member) => ({
      id: `m${time}-${index}-${member}`, snapshotId: "s" + time, sourceScanId: "s" + time, sourceScanFilename: "fixture", snapshotTimestamp,
      memberRef: `f8_net_p${index * 100 + member}`, name: "Player " + member, classId: "1", level: 100, hofRank: 100 + index * 10,
      baseStats: 900, totalStats: 1900, xpTotal: index * 100 + time, focusedBaseStats: index * 10,
      baseMain: index * 7, conBase: index * 3, attrTotal: index * 14, conTotal: index * 6, focusedTotalStats: index * 20,
      mine: index, treasury: index + 1, server: "f8_net", guildIdentifier: "f8_net_g" + (index + 1), guildSegment: String(index + 1), groupSegment: String(index + 1), guildName: "Guild " + (index + 1),
    }))).flat()),
  } };
}
const input=fixture();
await linkPlayerIdentifiers("f8_net_p0", "f7_net_p90", {source:"manual"});
await linkPlayerIdentifiers("f7_net_p90", "f6_net_p900", {source:"manual"});
await linkGuildAliases("f8_net_g1", "f7_net_g90", {source:"manual"});
await linkGuildAliases("f7_net_g90", "f6_net_g900", {source:"manual"});
input.identity=await loadIdentityResolutionSnapshot();
for(const row of [...input.data.guilds,...input.data.members])if(row.guildIdentifier==="f8_net_g1"&&row.snapshotTimestamp!==3000){const first=row.snapshotTimestamp===1000;Object.assign(row,{guildIdentifier:first?"f6_net_g900":"f7_net_g90",server:first?"f6_net":"f7_net",snapshotTimestamp:first?1000:2100,...("memberRef" in row?{memberRef:first?"f6_net_p900":"f7_net_p90"}:{})});}
const members=[{key:"f8_net_p0",name:"Same name",classLabel:null},{key:"f8_net_p100",name:"Same name",classLabel:null}];
const history=buildDashboardHistory(input,members,"f8_net_g1",3000);
const comparison=buildDashboardGuildComparison(input,"f8_net","f8_net_g1",3000,"s2");
const label=(metric:string)=>metric==="hof"?"Spieler-HoF-Rang":metric;
const guildBefore=guildComparisonSeries(comparison,"base",m=>m),serialized=JSON.stringify(guildBefore);
assert.deepEqual(comparePlayerSeries(history,[],["base"],label),[]);
assert.equal(JSON.stringify(guildComparisonSeries(comparison,"base",m=>m)),serialized);
const one=comparePlayerSeries(history,[members[0].key],["base"],label);
assert.deepEqual(one[0].timePoints.map(p=>p.timestampMs),[1000,2100,3000]);
assert(!one[0].timePoints.some(p=>p.timestampMs===2000));
assert.deepEqual(memberChartPlayerPoints(history,members[0].key,"hof").map(p=>p.value),[100,100,100]);
const two=comparePlayerSeries(history,members.map(m=>m.key),["base"],label);
assert.equal(new Set(two.map(s=>s.key)).size,2,"same names remain distinct identities");
assert(!guildBefore.some(g=>two.some(p=>p.key===g.key)),"guild/player namespaces differ");
assert.equal(comparePlayerSeries(history,[members[1].key,members[0].key],["base"],label)[0].color,one[0].color);
const historical=buildDashboardHistory(input,[{...members[0],key:"f6_net_p900"}],"f8_net_g1",3000);
assert.equal(comparePlayerSeries(historical,["f6_net_p900"],["base"],label)[0].color,one[0].color,"confirmed identity color survives aliases");
assert.equal(comparePlayerSeries(history,[],["base"],label).length,0,"removal removes player lines");
assert.equal(JSON.stringify(guildComparisonSeries(comparison,"base",m=>m)),serialized,"player projection cannot change guilds");
const playerRanks=comparePlayerSeries(history,[members[0].key],["hof"],label);
const guildRanks=guildComparisonSeries(comparison,"general",()=>"Gilden-HoF-Rang");
assert(playerRanks[0].label.includes("Spieler-HoF-Rang"));assert(guildRanks.every(s=>s.label.includes("Gilden-HoF-Rang")));
const row=history.rows[0];row.byTime.set(2100,{...row.byTime.get(2100)!,focusedBaseStats:null});
assert.equal(comparePlayerSeries(history,[members[0].key],["base"],label)[0].timePoints[1].value,null,"actual missing value retained");
for(const missing of [5,6]){const data=fixture();const roster=data.data.members.filter(m=>m.guildIdentifier==="f8_net_g8"&&m.snapshotTimestamp===2000);roster.slice(0,missing).forEach(m=>m.baseMain=null);const c=buildDashboardGuildComparison(data,"f8_net","f8_net_g8",3000,"s2");const stand=c.displayRows.find(r=>r.key===c.currentGuildKey)!.byTime.get(2000)!;assert.equal(stand.progress.base.value!=null,missing===5);assert.equal(stand.complete,true);}
let profile=["profile"],overlay:string[]=[];
for(const key of ["a","b","a","b"]){overlay=toggleMemberSelection(overlay,key);assert.deepEqual(profile,["profile"]);}
assert.deepEqual(overlay,[]);assert.equal(rankingMemberSelection([]),null);assert.equal(rankingMemberSelection(["a"]),"a");assert.equal(rankingMemberSelection(["a","b"]),null);
for(let i=0;i<32;i++)overlay=toggleMemberSelection(overlay,"p"+i);assert.equal(overlay.length,32);assert.equal(memberChartColor("a"),memberChartColor("a"));
// Same domain points can coexist in entering/exiting render states. Render
// keys distinguish them while hover retains the original series/time/value.
const renderRows = ["top::base-exit", "top::base-enter"].map((renderKey, index) => ({ key: "top::base", renderKey, color: "red", opacity: 0.5, drawProgress: 1,
  coords: [{ pointKey: "1000", x: 10, y: 20, value: 10 + index }, { pointKey: "2000", x: 20, y: null }, { pointKey: "3000", x: 30, y: 40, value: 30 + index }].map(coord => ({ ...coord, seriesLabel: index ? "Top 15" : "Top 3", note: index ? "10/15" : "3/3", partial: false })) }));
const projected = projectChartGaps(renderRows, new Map([["top::base", "Top"]]), 100);
assert.equal(projected.markers.length, 6); assert.equal(new Set(projected.markers.map(marker => marker.key)).size, 6);
assert.equal(new Set(projected.connections.map(connection => connection.key)).size, 2);
assert.deepEqual(projected.markers.filter(marker => marker.point.timestampMs === 1000).map(marker => marker.point.value), [10, 11]);
assert(projected.markers.every(marker => marker.point.seriesKey === "top::base"));
assert.deepEqual(projected.markers.filter(marker => marker.point.timestampMs === 1000).map(marker => marker.point.seriesLabel), ["Top 3", "Top 15"], "transition hover keeps each rendered state's label and value");
assert.deepEqual(projected.markers.filter(marker => marker.point.timestampMs === 1000).map(marker => marker.point.note), ["3/3", "10/15"], "rendered coverage travels with its actual value");
const coincident = projectChartGaps([{ ...renderRows[0], coords: ["a", "b"].map((observationKey, index) => ({ pointKey: observationKey, observationKey, timestampMs: 1000, x: 10, y: 20, value: index + 1 })) }], new Map(), 100);
assert.equal(new Set(coincident.markers.map(marker => marker.key)).size, 2);
assert.deepEqual(coincident.markers.map(marker => [marker.point.timestampMs, marker.point.value, marker.point.observationKey]), [[1000, 1, "a"], [1000, 2, "b"]], "distinct source observations at one time survive unchanged");
assert.deepEqual(projectChartGaps(renderRows, new Map(), 100).markers.map(marker => marker.key), projected.markers.map(marker => marker.key), "stable render identities independent of labels");


console.log("PASS W127: unchanged guild projection/tolerance, add/remove players, separate selection, confirmed two-fusion identities/colors, observed-only times, real missing values, both labeled HoF ranks, retained transition/observation keys");
