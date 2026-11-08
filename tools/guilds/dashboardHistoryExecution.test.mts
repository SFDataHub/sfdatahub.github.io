import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries } from "../../src/lib/guilds/localScanLibrary.ts";
import { startSharedGuildTrendRun, type GuildTrendHistory } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
import { buildDashboardHistory, buildDashboardMemberTrends } from "../../src/pages/GuildHub/dashboardHistory.ts";
const now=Date.UTC(2026,9,17), old=now-35*86400000;
const row=(at:number,guild:string,xp:number)=>({identifier:"f8_net_p1",prefix:"f8_net",timestamp:at,name:"Current member",class:1,level:100,xpTotal:xp,group:guild,groupname:guild,values:{Base:100,"Base Constitution":100}});
const group=(at:number,id:string)=>({identifier:id,prefix:"f8_net",timestamp:at,name:id,memberCount:1});
await importGuildHubLocalScan("current.json",JSON.stringify({players:[row(now,"f8_net_g1",30000)],groups:[group(now,"f8_net_g1")]}));
await importGuildHubLocalScan("prior-other-guild.json",JSON.stringify({players:[row(old,"f8_net_g2",10000),{...row(old,"f8_net_g2",20000),identifier:"f8_net_p9",name:"Prior guild peer"}],groups:[{...group(old,"f8_net_g2"),memberCount:2}]}));
let history: GuildTrendHistory | undefined;
const run=startSharedGuildTrendRun({summaries:await listGuildHubScanSummaries(),guildTarget:{logoIdentifier:"f8_net_g1",server:"f8_net"},sourceScope:"dashboard-guild",memberRefs:["f8_net_p1"],onHistory:value=>{history=value;}});
try {
 const result=await run.promise;
 assert(history,"validated history callback delivered before result");assert.ok(result.guild?.identifier?.endsWith("_g1"));
 const model=buildDashboardHistory(history,[{key:"f8_net_p1",name:"Current member",classLabel:"Warrior"}],result.guild!.identifier,now);
 assert.deepEqual(model.xp[0].timePoints?.map(point=>point.value),[10000,30000],"current roster history includes member-only sources outside the current guild");
 assert.equal(model.rows.length,1,"supporting historical guild peers never enter the visible player pool");
 assert.equal(buildDashboardMemberTrends(model,"xp")[0].pairs.length,1,"complete historical support roster retained for established individual interval calculation");
 console.log("PASS validated shared publication and individual current-member history across prior guild-only sources");
}finally{run.cancel();}

// W132: extend the exact bound prepared source without changing stored Analytics.
const { executeAnalyticsWork } = await import("../../src/lib/local-player-profile/executionWork.ts");
const { readGuildAnalyticsDerivedSource } = await import("../../src/lib/guilds/localGuildAnalyticsStore.ts");
const { getGuildHubLocalScan } = await import("../../src/lib/guilds/localScanLibrary.ts");
const { prepareProfileSumHistory, projectProfileSumHistory } = await import("../../src/lib/local-player-profile/profileSumHistory.ts");
const summary = (await listGuildHubScanSummaries()).find(s => s.filename === "current.json")!;
const stored = await readGuildAnalyticsDerivedSource(summary.sourceScanId);
const extended = await executeAnalyticsWork({kind:"source", summary, includeProgressValues:true}, new AbortController().signal) as any;
assert.equal(extended.rawReads,1,"one bound local source read for a cached history lacking components");
assert.equal(extended.builds,0,"no Analytics rebuild");
assert.deepEqual(await readGuildAnalyticsDerivedSource(summary.sourceScanId),stored,"Analytics not rewritten for profile fields");
assert(extended.data.members.every((m:any)=>m.profileAllSums && !('profileAllSums' in stored.members.find(r=>r.id===m.id)!)));
const scan = (await getGuildHubLocalScan(summary.sourceScanId))!;
assert.throws(()=>prepareProfileSumHistory(stored,{...scan,contentHash:"changed"},summary),/source changed/);
const wrongSnapshot = {...stored,members:stored.members.map(m=>({...m,snapshotTimestamp:m.snapshotTimestamp+1}))};
assert.throws(()=>prepareProfileSumHistory(wrongSnapshot,scan,summary),/observation changed/);
const twice = projectProfileSumHistory(extended.data,"all-five");
assert(twice.members.every((m:any)=>m.profileBaseStats===null),"generic sums cannot replace missing five components");
assert(projectProfileSumHistory(extended.data,"main-con").members.every((m:any)=>m.profileBaseStats===m.focusedBaseStats));
console.log("PASS W132 exact bound source/snapshot extension, no Analytics rebuild/write and prepared selection");
