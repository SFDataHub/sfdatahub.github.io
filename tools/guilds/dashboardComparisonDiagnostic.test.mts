import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries, readGuildHubLocalScanForSearch } from "../../src/lib/guilds/localScanLibrary.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { loadIdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { captureLocalDataDependencies } from "../../src/lib/local-data/localDataDependencies.ts";
import { loadDashboardMemberComparison } from "../../src/pages/GuildHub/dashboardMemberComparison.ts";
import { collectDashboardComparisonDiagnostic, comparisonRosterTrace, comparisonDeltaTrace, type DashboardComparisonEvidence } from "../../src/pages/GuildHub/dashboardComparisonDiagnostic.ts";
import { classifyDashboardTransfers } from "../../src/pages/GuildHub/dashboardTransfersModel.ts";
import { readLocalGuildMemberValues } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";
import { buildCurrentTransferGuildLookup } from "../../src/pages/GuildHub/dashboardTransferGuilds.ts";
import { startDashboardMemberComparison, type MemberComparisonWorker } from "../../src/pages/GuildHub/dashboardMemberComparisonClient.ts";
import { hashHubFavoriteRecords } from "../../src/lib/data-hub/hubFavoritesStore.ts";
const now=Date.UTC(2026,9,17),old=now-42*86400000;
const player=(id:string,at:number,level:number,rank:number,group:string,name="Same name")=>({identifier:id,prefix:id.replace(/_p\d+$/,""),timestamp:at,name,class:1,level,xpTotal:level*100,rank,group,groupname:"Sharkdom",values:{Base:200,"Base Constitution":200,Attribute:400,Constitution:400},cookie:"DO-NOT-EXPORT",inventory:{secret:"NOT-RELEVANT"}});
const currentRaw=[player("f29_net_p261250",now,115,101,"f29_net_g12605","Free Monk"),player("f29_net_p2",now,100,201,"f29_net_g12605")];
const historyRaw=[player("s8_eu_p10320",old,100,300,"s8_eu_g46","Free Monk"),player("s8_eu_p18072",old,100,400,"s8_eu_g46","Dean Winchester"),player("s8_eu_p999",old,90,600,"s8_eu_g999","Unrelated")];
const group=(identifier:string,at:number)=>({identifier,prefix:identifier.replace(/_g\d+$/,""),timestamp:at,name:"Sharkdom",memberCount:2});
const currentScan=(await importGuildHubLocalScan("current.json",JSON.stringify({players:currentRaw,groups:[group("f29_net_g12605",now)]}))).scan;
const oldScan=(await importGuildHubLocalScan("historical.json",JSON.stringify({players:historyRaw,groups:[group("s8_eu_g46",old)]}))).scan;
await linkGuildAliases("eu8_g46","f29_g12605",{source:"manual"});
await linkPlayerIdentifiers("s8_eu_p10320","f29_net_p261250",{source:"manual"});
const members=(rows:typeof currentRaw)=>rows.map(row=>({key:row.identifier,name:row.name,classLabel:"Warrior",playerStats:readLocalGuildMemberValues(row)}));
const current=members(currentRaw),historical=members(historyRaw.slice(0,2));
current[0].playerStats.mine=5;
const summaries=await listGuildHubScanSummaries(),identities=await loadIdentityResolutionSnapshot();
const dependencies=await captureLocalDataDependencies({allIdentities:true,sourceIds:[currentScan.id,oldScan.id]});
const result=await loadDashboardMemberComparison({summaries,currentSourceId:currentScan.id,currentTimestamp:now,guild:{name:"Sharkdom",server:"f29",logoIdentifier:"f29_net_g12605"},members:current,diagnostic:true});
result.comparison.execution={jobId:"actual-fixture-job",generation:3,status:result.comparison.status,dependencies:result.dependencies};
assert.equal(result.comparison.status,"ready");
const output=classifyDashboardTransfers(current,historical,identities);
const evidence:DashboardComparisonEvidence={generation:2,requestKey:"fixture-current-context",status:"ready",current:{sourceScanId:currentScan.id,scannedAtMs:now,guildIdentifier:"f29_net_g12605"},historical:{sourceScanId:oldScan.id,scannedAtMs:old,guildIdentifier:"s8_eu_g46"},currentMembers:current,historicalMembers:historical,identities,dependencies,currentDependencies:dependencies,contexts:[],currentGuilds:buildCurrentTransferGuildLookup({players:currentRaw,groups:[group("f29_net_g12605",now)]}),historicalGuilds:buildCurrentTransferGuildLookup({players:historyRaw,groups:[group("s8_eu_g46",old)]}),output,worker:result.comparison,summaries,guild:{name:"Sharkdom",server:"f29",logoIdentifier:"f29_net_g12605"},presentation:{mode:"general",selectedClasses:[]}};
const env={origin:"http://localhost:5173",route:"/data-hub/guild-hub/guild/f29/f29_net_g12605/dashboard",modules:["fixture-code"]};
const favoritesBefore=await hashHubFavoriteRecords();
// Instrument all physical mutations after normal import/preparation is finished.
const writes:string[]=[];
for(const method of ["put","add","delete","clear"] as const){const original=IDBObjectStore.prototype[method] as Function;(IDBObjectStore.prototype as any)[method]=function(...args:unknown[]){writes.push(this.name+":"+method);return original.apply(this,args)}}
const before=JSON.stringify(await readGuildHubLocalScanForSearch(oldScan.id));
const diagnostic=await collectDashboardComparisonDiagnostic(evidence,()=>true,env);
assert.equal(diagnostic.consistency.coherent,true,JSON.stringify(diagnostic.consistency));
assert.equal(diagnostic.preservation.favoritesRecordHash,favoritesBefore,'read-only favorite integrity receipt matches actual records');
assert.deepEqual(diagnostic.transfer.output?.counts,{joined:1,left:1});
assert.equal(diagnostic.freeMonk.transferRows.length,2);
assert.ok(diagnostic.freeMonk.transferRows.every(row=>row.classification==="continuation"&&row.entityId===row.stored.entityId));
assert.equal(diagnostic.transfer.matrix.find(row=>row.originalKey==="s8_eu_p18072")?.classification,"left");
const deltas=diagnostic.worker.deltas;
assert.equal(deltas.find(row=>row.key==="f29_net_p261250"&&row.mode==="general"&&row.category==="level")?.valueDelta,15);
assert.equal(deltas.find(row=>row.key==="f29_net_p261250"&&row.mode==="general"&&row.category==="hof")?.valueDelta,199);
assert.equal(deltas.find(row=>row.key==="f29_net_p261250"&&row.mode==="base"&&row.category==="main")?.valueDelta,0,"true zero stays zero");
assert.equal(deltas.find(row=>row.key==="f29_net_p261250"&&row.mode==="fortress"&&row.category==="mine")?.valueReason,"missing-historical-metric");
const text=JSON.stringify(diagnostic);assert.ok(!text.includes("DO-NOT-EXPORT")&&!text.includes("NOT-RELEVANT")&&!text.includes("Unrelated")&&!text.includes("s8_eu_p999"));
assert.equal(JSON.stringify(await readGuildHubLocalScanForSearch(oldScan.id)),before);assert.deepEqual(writes,[],"diagnostic has zero physical IDB writes");
// A fresh positive store must expose, rather than conceal, a stale used snapshot.
const stale={...identities,revisions:{players:0,guilds:0},players:{byIdentifier:new Map(),byIdentityId:new Map()}};
const broken=await collectDashboardComparisonDiagnostic({...evidence,identities:stale,output:classifyDashboardTransfers(current,historical,stale)},()=>true,env);
assert.ok(broken.consistency.problems.includes("transfer-identity-revision-mismatch"));
assert.ok(broken.freeMonk.transferRows.some(row=>row.entityId===null&&row.stored.entityId!==null));
assert.ok(broken.freeMonk.workerRows.every(row=>row.entityId!==null));
const mismatch=await collectDashboardComparisonDiagnostic({...evidence,summaries:summaries.map(summary=>summary.sourceScanId===oldScan.id?{...summary,contentHash:"different"}:summary)},()=>true,env);
assert.ok(mismatch.consistency.problems.includes("source-missing-or-binding-mismatch"));
// Never copy a completed capture into another navigation context.
let checks=0;await assert.rejects(collectDashboardComparisonDiagnostic(evidence,()=>++checks<2,env),/comparison-context-changed/);
const duplicates=comparisonRosterTrace([current[0],current[0],{...current[0],name:"Conflict"}],identities);assert.ok(duplicates.every(row=>row.bucketSize===2));
assert.ok(comparisonRosterTrace([current[0],current[0]],identities,"worker").every(row=>row.bucketSize===2),"worker retains exact repeated value observations");
// Physical journal mutation in an isolated fixture during collection forces a bounded retry.
const proto=IDBObjectStore.prototype,originalGet=proto.get;
let changed=false;
proto.get=function(...args:Parameters<IDBObjectStore['get']>){if(this.name==="scans"&&!changed){changed=true;void linkPlayerIdentifiers("f29_net_p2","s8_eu_p22",{source:"manual"});}return originalGet.apply(this,args)};
const raced=await collectDashboardComparisonDiagnostic(evidence,()=>true,env);proto.get=originalGet;
assert.equal(changed,true);assert.equal(raced.attempt,2);assert.equal(raced.consistency.coherent,false);assert.ok(raced.consistency.problems.includes("consumer-dependencies-stale"));
// Worker client accepts its own request ID only and cancels late old replies.
class FakeWorker extends EventTarget {messages:any[]=[];terminated=false;postMessage(value:any){this.messages.push(value)}terminate(){this.terminated=true}reply(value:any){this.dispatchEvent(new MessageEvent("message",{data:value}))}}
const fake=new FakeWorker();const request={summaries:[],currentSourceId:currentScan.id,currentTimestamp:now,guild:evidence.guild,members:current};
const first=startDashboardMemberComparison(request,()=>fake as unknown as MemberComparisonWorker);const rejected=assert.rejects(first.promise,/Cancelled/);first.cancel();fake.reply({id:first.id,result});await rejected;assert.equal(fake.terminated,true);
const nextWorker=new FakeWorker(),next=startDashboardMemberComparison(request,()=>nextWorker as unknown as MemberComparisonWorker);nextWorker.reply({id:first.id,result:{invalid:true}});nextWorker.reply({id:next.id,result});assert.equal(await next.promise,result);
assert.equal(comparisonDeltaTrace({status:"loading",timestamp:null,members:[],identities:null}).length,0);
console.log("PASS W117 actual IDB/worker-domain trace, full fixture matrix, Free Monk/Dean, exact source scope, no raw/store export, zero writes, stale snapshot vs fresh store, source mismatch, bounded revision retry, canceled navigation/client reply, zero/missing/HoF deltas");
