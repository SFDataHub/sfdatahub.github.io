import assert from "node:assert/strict";
import { createHubToplistTarget } from "../../src/lib/data-hub/hubTargetResolver.ts";
import { normalizeToplistServerSelection } from "../../src/pages/DataHub/localToplistPageModel.ts";
import { readLocalGuildMemberValues, summarizeLocalGuildPlayerStats } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";
import { DEFAULT_DASHBOARD_MEMBER_MODE, buildLocalGuildRanking, guildModeCategories } from "../../src/pages/GuildHub/localGuildRanking.ts";
import { orderMemberComparisonCandidates } from "../../src/pages/GuildHub/dashboardMemberComparison.ts";
import { startDashboardMemberComparison, type MemberComparisonWorker } from "../../src/pages/GuildHub/dashboardMemberComparisonClient.ts";
import type { DashboardMemberComparisonRequest, DashboardMemberComparisonResult } from "../../src/pages/GuildHub/dashboardMemberComparison.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { buildPlayerIdentityResolutionIndex, type IdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
const ids: IdentityResolutionSnapshot = { players: buildPlayerIdentityResolutionIndex([{entity:{entityId:"confirmed",createdAt:"0",updatedAt:"0"},aliases:["f8_net_p1","f7_net_p11"].map(identifier=>({identifier,identifierKey:identifier,entityId:"confirmed",source:"manual",addedAt:"0"}))}]),guilds:{byIdentifier:new Map(),byIdentityId:new Map()} };
const member=(key:string, level:number|null,xp:number|null,hof:number|null,base:number|null,mine:number|null,treasury:number|null)=>({key,name:"Same name",classLabel:"Warrior",playerStats:{baseMain:base,conBase:base,sumBaseTotal:base==null?null:2*base,attrTotal:base==null?null:3*base,conTotal:base,totalStats:base==null?null:4*base,level,xpTotal:xp,hofRank:hof,mine,treasury,mountBonus:50}});
const current=[member("f8_net_p1",100,2000,10,200,20,10),member("f8_net_p2",100,3000,50,100,10,5),member("f8_net_p3",100,null,null,0,0,0),member("f8_net_p4",null,null,0,null,null,null)];
const old=[member("f8_net_p99",100,4000,100,300,30,15),member("f8_net_p2",100,2000,40,80,8,6),member("f8_net_p3",100,3000,20,0,0,0)];
const other=member("f7_net_p11",98,1000,30,150,15,7);
const compare={players:[...old,other],rosterComplete:true};
for(const [server,code,identifier] of [["eu8","EU8","s8_eu_p1"],["s8_eu","EU8","s8_eu_p1"],["f28","F28","f28_net_p1"],["f28_net","F28","f28_net_p1"]]) {
 const command=createHubToplistTarget("player","Player",server,[identifier]).state.hubToplistTarget!;
 assert.equal(command.server,code,"card commands use the picker/filter server code");
 assert.equal(normalizeToplistServerSelection([command.server])[0],command.server,"focus target and selected-server set use identical casing and namespace");
 assert.deepEqual(command.identifiers,[identifier],"player identity namespace is preserved independently of the server filter code");
}
assert.equal(DEFAULT_DASHBOARD_MEMBER_MODE,"base");
assert.deepEqual(guildModeCategories("general"),["level","hof"]);assert.deepEqual(guildModeCategories("fortress"),["mine","treasury"]);
// Same level: cumulative XP independently determines B/A/C currently and departed/C/B historically.
const levels=buildLocalGuildRanking(current,old,"level","general",ids,compare);
assert.deepEqual(levels.map(r=>[r.key,r.rank,r.rankDelta,r.valueDelta,r.rankStatus]),[["f8_net_p2",1,2,0,"compared"],["f8_net_p1",2,null,2,"new"],["f8_net_p3",3,-1,0,"compared"],["f8_net_p4",null,null,null,"unavailable"]]);
const hof=buildLocalGuildRanking(current,old,"hof","general",ids,compare);
assert.deepEqual(hof.map(r=>[r.key,r.valueDelta,r.rankDelta]),[["f8_net_p1",20,null],["f8_net_p2",-10,0],["f8_net_p3",null,null],["f8_net_p4",null,null]]);
for(const [mode,scale] of [["base",[1,1,2]],["total",[3,1,4]]] as const)for(const [i,category] of (["main","con","sum"] as const).entries()){
 const rows=buildLocalGuildRanking(current,old,category,mode,ids,compare);
 assert.deepEqual(rows.map(r=>r.valueDelta),[50*scale[i],20*scale[i],0,null]);
 assert.deepEqual(rows.filter(r=>r.rank!=null).slice(0,3).map(r=>r.key),summarizeLocalGuildPlayerStats(current,mode)[i].entries.map(r=>r.key));
}
assert.deepEqual(buildLocalGuildRanking(current,old,"mine","fortress",ids,compare).map(r=>r.valueDelta),[5,2,0,null]);
assert.deepEqual(buildLocalGuildRanking(current,old,"treasury","fortress",ids,compare).map(r=>r.valueDelta),[3,-1,0,null]);
assert.equal(buildLocalGuildRanking(current,old,"level","general",null,compare).find(r=>r.key===current[0].key)?.valueDelta,null,"unconfirmed different namespace cannot supply history");
const ambiguous=buildLocalGuildRanking(current,old,"level","general",ids,{...compare,players:[...compare.players,member("f8_net_p1",90,10,1,1,1,1)]});assert.equal(ambiguous.find(r=>r.key===current[0].key)?.valueDelta,null);
assert.equal(buildLocalGuildRanking([current[0]],[member("f8_net_p1",90,10,0,0,0,0)],"hof","general",null)[0].valueDelta,null,"zero historical HoF is unavailable");
const missing=readLocalGuildMemberValues({class:1});assert.equal(missing.level,null);assert.equal(missing.mine,null);assert.equal(missing.mountBonus,null);
const raw={class:1,level:100,xp:999999,xpTotal:123456,rank:0,Mount:50,values:{Base:0,"Base Constitution":0}};
const core=normalizeSfPlayerCharacterCore(raw);core.fortress.buildings.gemMine=0;core.fortress.buildings.treasury=5;
const zero=readLocalGuildMemberValues(raw,core);assert.equal(zero.xpTotal,123456,"explicit cumulative total beats XP in the current level");assert.equal(zero.hofRank,null);assert.equal(zero.sumBaseTotal,0);assert.equal(zero.mine,0);assert.equal(zero.treasury,5);assert.equal(zero.mountBonus,50);
const now=Date.UTC(2026,9,13),day=86400000,candidate=(days:number,id=String(days))=>({scannedAtMs:now-days*day,sourceScanId:id,guildIdentifier:"f8_net_g1"});
assert.deepEqual(orderMemberComparisonCandidates([candidate(5),candidate(35),candidate(45),candidate(-1),candidate(20)],now,"f8_net_g1").map(c=>c.sourceScanId),["35","45","20","5"]);
assert.deepEqual(orderMemberComparisonCandidates([candidate(20),candidate(5)],now,"f8_net_g1").map(c=>c.sourceScanId),["20","5"]);
class WorkerDouble extends EventTarget { posts:unknown[]=[]; terminated=0; postMessage(v:unknown){this.posts.push(v);} terminate(){this.terminated++;} reply(v:unknown){this.dispatchEvent(new MessageEvent("message",{data:v}));} }
const input={summaries:[],members:current,currentSourceId:"current",currentTimestamp:now,guild:{name:"Guild",server:"f8_net",logoIdentifier:"f8_net_g1"}} satisfies DashboardMemberComparisonRequest;
const result={comparison:{status:"empty",timestamp:null,members:[],identities:null},work:{rawReads:0,normalizedPlayers:0,derivedSelectionRows:0,projections:0,elapsedMs:0},dependencies:{need:{},sources:0,players:0,guilds:0} } as DashboardMemberComparisonResult;
const worker=new WorkerDouble(),run=startDashboardMemberComparison(input,()=>worker as MemberComparisonWorker);let settled=false;run.promise.then(()=>settled=true);worker.reply({id:"stale",result});await Promise.resolve();assert(!settled);const id=(worker.posts[0] as {id:string}).id;worker.reply({id,result});assert.equal(await run.promise,result);assert.equal(worker.terminated,1);worker.reply({id,result});assert.equal(worker.terminated,1);
const cancelWorker=new WorkerDouble(),cancel=startDashboardMemberComparison(input,()=>cancelWorker as MemberComparisonWorker);const rejection=assert.rejects(cancel.promise,{name:"AbortError"});cancel.cancel();cancel.cancel();await rejection;assert.equal(cancelWorker.terminated,1);
const failureWorker=new WorkerDouble(),failure=startDashboardMemberComparison(input,()=>failureWorker as MemberComparisonWorker);const failed=assert.rejects(failure.promise,/worker failed/);failureWorker.dispatchEvent(new Event("error"));await failed;assert.equal(failureWorker.terminated,1);
await assert.rejects(startDashboardMemberComparison(input,()=>{throw Error("startup");}).promise,/startup/);
console.log("PASS W55 four modes/10 fields, cumulative XP ties current/history, HoF sorting/sign, other-guild newcomer, aliases/namespaces/ambiguity, null/zero, domain readers, comparison fallback, worker IDs/cancel/unmount/error");
