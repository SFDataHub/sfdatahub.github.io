import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries, updateGuildHubLocalScan, deleteGuildHubLocalScans } from "../../src/lib/guilds/localScanLibrary.ts";
import { loadDashboardMemberComparison } from "../../src/pages/GuildHub/dashboardMemberComparison.ts";
import { readLocalGuildMemberValues } from "../../src/pages/GuildHub/localGuildPlayerStats.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { resetGuildAnalyticsDerivedData } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import { comparisonDeltaTrace } from "../../src/pages/GuildHub/dashboardComparisonDiagnostic.ts";
const now=Date.UTC(2026,9,13),day=86400000;
const row=(id:number,at:number,level:number,xp:number,rank:number,base:number,group="f8_net_g1")=>({identifier:`f8_net_p${id}`,prefix:"f8_net",timestamp:at,name:"Same name",class:1,level,xpTotal:xp,rank,group,groupname:group==="f8_net_g1"?"Guild":"Other",values:{Base:base,"Base Constitution":base,Attribute:2*base,Constitution:base}});
const group=(at:number)=>({identifier:"f8_net_g1",prefix:"f8_net",timestamp:at,name:"Guild",memberCount:2});
const current=[row(1,now,110,800,10,200),row(2,now,110,900,30,150)];
const history=(at:number)=>({players:[row(99,at,109,800,40,160),row(2,at,109,700,20,130),row(11,at,107,500,50,100,"f8_net_g2"),{...row(66,at,109,750,60,140,"f8_net_g3"),groupname:"СССР"}],groups:[group(at)]});
await linkPlayerIdentifiers("f8_net_p1","f8_net_p11",{source:"manual"});
const currentImport=await importGuildHubLocalScan("w55-current.json",JSON.stringify({players:current,groups:[group(now)]}));
const old=await importGuildHubLocalScan("w55-old.json",JSON.stringify(history(now-35*day)));
const recent=await importGuildHubLocalScan("w55-recent.json",JSON.stringify(history(now-5*day)));
const members=current.map(p=>({key:p.identifier,name:p.name,classLabel:"Warrior",playerStats:readLocalGuildMemberValues(p)}));
const run=async(logoIdentifier="f8_net_g1")=>loadDashboardMemberComparison({summaries:await listGuildHubScanSummaries(),currentSourceId:currentImport.scan.id,currentTimestamp:now,guild:{name:"Guild",server:"f8_net",logoIdentifier},members});
const first=await run();assert.equal(first.comparison.status,"ready");assert.equal(first.comparison.timestamp,now-35*day);assert.equal(first.comparison.sourceScanId,old.scan.id);assert.equal(first.comparison.guildIdentifier,"f8_net_g1");assert.equal(first.work.rawReads,1);assert.equal(first.work.normalizedPlayers,3);assert.equal(first.work.projections,1);
assert.deepEqual(first.comparison.rankings?.general?.level?.map(r=>[r.key,r.rank,r.rankDelta,r.valueDelta,r.rankStatus]),[["f8_net_p2",1,1,1,"compared"],["f8_net_p1",2,null,3,"new"]]);
assert.equal(first.comparison.rankings?.general?.hof?.find(r=>r.key==="f8_net_p1")?.valueDelta,40);
assert.equal(first.comparison.rankings?.base?.main?.find(r=>r.key==="f8_net_p1")?.valueDelta,100);
assert.equal(first.comparison.identities,null);assert.deepEqual(first.comparison.members,[],"no raw or identity graph crosses worker boundary");
assert.equal(first.comparison.groups?.general?.[0].average,110);
// Same source ID and timestamp with new content must produce refreshed values.
const changed=history(now-35*day);changed.players[2].values.Base=80;
await updateGuildHubLocalScan(old.scan.id,"w55-old.json",JSON.stringify(changed));
assert.equal((await run()).comparison.rankings?.base?.main?.find(r=>r.key==="f8_net_p1")?.valueDelta,120);
// A saved old guild alias does not change equal-time source preference.
await linkGuildAliases("f8_net_g1","f8_net_g0",{source:"manual"});
const alternate=history(now-35*day);alternate.groups[0].identifier="f8_net_g0";
alternate.players.slice(0,2).forEach(p=>{p.group="f8_net_g0";p.values.Base=50;});
const alternateImport=await importGuildHubLocalScan("w55-alternate-alias.json",JSON.stringify(alternate));
assert.equal((await run("f8_net_g0")).comparison.rankings?.base?.main?.find(r=>r.key==="f8_net_p2")?.valueDelta,20,"prefer current observation guild alias at equal timestamp");
// Valid prepared rows removed: bounded raw fallback retains the exact comparison.
await resetGuildAnalyticsDerivedData();const fallback=await run();assert.equal(fallback.comparison.timestamp,now-35*day);assert.equal(fallback.work.rawReads,1);assert.equal(fallback.comparison.rankings?.base?.main?.find(r=>r.key==="f8_net_p1")?.valueDelta,120);
assert.equal((await run("f8_net_g0")).comparison.rankings?.base?.main?.find(r=>r.key==="f8_net_p2")?.valueDelta,20,"raw fallback also preserves the current guild alias preference");
await deleteGuildHubLocalScans([old.scan.id,alternateImport.scan.id]);assert.equal((await run()).comparison.timestamp,now-5*day,"oldest available fallback under thirty days");
await deleteGuildHubLocalScans([recent.scan.id]);assert.equal((await run()).comparison.status,"empty");
console.log("PASS W55 actual local import/IDB/domain normalization, prepared selection, one raw read/shared batch, all-mode results, outside-guild identity history, same-ID content refresh, missing derived fallback, source deletion, no comparison");

// W132: the same worker result carries both definitions and their deltas.
const sumRow = (id:number, at:number, base:number, bonus:number) => {
 const save=Array(70).fill(0); save[29]=1; for(let i=0;i<5;i++){save[30+i]=base+i;save[35+i]=bonus;}
 return {...row(id,at,100,10000,1,base,"f8_net_g5"),save,saveVersion:2};
};
const sumCurrent=[sumRow(200,now,10,100),sumRow(201,now,20,200)];
const sumHistory=[sumRow(200,now-35*day,5,50),sumRow(201,now-35*day,15,150)];
const sumGroup=(at:number)=>({...group(at),identifier:"f8_net_g5",name:"Sum guild"});
const sumImport=await importGuildHubLocalScan("w132-sum-current.json",JSON.stringify({players:sumCurrent,groups:[sumGroup(now)]}));
await importGuildHubLocalScan("w132-sum-history.json",JSON.stringify({players:sumHistory,groups:[sumGroup(now-35*day)]}));
const sumResult=await loadDashboardMemberComparison({summaries:await listGuildHubScanSummaries(),currentSourceId:sumImport.scan.id,currentTimestamp:now,guild:{name:"Sum guild",server:"f8_net",logoIdentifier:"f8_net_g5"},members:sumCurrent.map(p=>({key:p.identifier,name:p.name,classLabel:"Warrior",playerStats:readLocalGuildMemberValues(p)}))});
assert.equal(sumResult.comparison.status,"ready");
const fiveBase=sumResult.comparison.allFive!.rankings!.base!.sum!;
const fiveTotal=sumResult.comparison.allFive!.rankings!.total!.sum!;
assert.deepEqual(fiveBase.map(r=>[r.key,r.value,r.valueDelta]),[["f8_net_p201",110,25],["f8_net_p200",60,25]]);
assert.deepEqual(fiveTotal.map(r=>[r.key,r.value,r.valueDelta]),[["f8_net_p201",1110,275],["f8_net_p200",560,275]]);
assert.equal(sumResult.comparison.allFive!.groups!.base![2].average,85);
assert.equal(sumResult.work.rawReads,1,"both prepared modes share the comparison source read");
console.log("PASS W132 worker prepares both sum definitions, independent rankings/means and matching delta endpoints in one source read");

// W133: separate OG sources retain their actual dates, confirmed chains and
// value ambiguity, without adding anyone to the historical guild roster.
const crossRow=(id:number,at:number,base:number,server="f29_net",guild="f29_net_g133")=>({...sumRow(id,at,base,10),identifier:`${server}_p${id}`,prefix:server,group:guild,groupname:"W133"});
const crossGroup=(at:number)=>({...group(at),identifier:"f29_net_g133",prefix:"f29_net",name:"W133",memberCount:5});
const crossCurrent=[301,302,303,304,305].map(id=>crossRow(id,now,100));
const crossHistory=[crossRow(302,now-35*day,80),...[390,391,392,393].map(id=>crossRow(id,now-35*day,90))];
const crossImport=await importGuildHubLocalScan("w133-current.json",JSON.stringify({players:crossCurrent,groups:[crossGroup(now)]}));
await importGuildHubLocalScan("w133-roster.json",JSON.stringify({players:crossHistory,groups:[crossGroup(now-35*day)]}));
await linkPlayerIdentifiers("f29_net_p301","f8_net_p701",{source:"manual"});
await linkPlayerIdentifiers("f8_net_p701","s7_eu_p801",{source:"manual"});
await linkPlayerIdentifiers("f29_net_p303","s7_eu_p803",{source:"manual"});
await linkPlayerIdentifiers("f29_net_p304","s7_eu_p804",{source:"manual"});
const og=(id:number,at:number,base:number)=>crossRow(id,at,base,"s7_eu","s7_eu_g9");
const ogAt=now-29*day+1234;
const missing=og(804,ogAt,60);delete (missing as any).save;delete (missing as any).values.Base;
const ogImport=await importGuildHubLocalScan("w133-og-preferred.json",JSON.stringify({players:[og(801,ogAt,70),og(803,ogAt,60),og(803,ogAt,61),missing,og(305,ogAt,10)],groups:[]}));
await importGuildHubLocalScan("w133-og-older.json",JSON.stringify({players:[og(801,now-35*day,20),og(803,now-35*day,20),og(804,now-35*day,20)],groups:[]}));
const ogRecent=await importGuildHubLocalScan("w133-og-recent.json",JSON.stringify({players:[og(801,now-27*day,90)],groups:[]}));
await importGuildHubLocalScan("w133-og-future.json",JSON.stringify({players:[og(801,now+day,200)],groups:[]}));
const crossInput=async()=>({summaries:await listGuildHubScanSummaries(),currentSourceId:crossImport.scan.id,currentTimestamp:now,guild:{name:"W133",server:"f29_net",logoIdentifier:"f29_net_g133"},members:crossCurrent.map(p=>({key:p.identifier,name:p.name,classLabel:"Warrior",playerStats:readLocalGuildMemberValues(p)})),diagnostic:true});
const cross=await loadDashboardMemberComparison(await crossInput());
const find=(result:typeof cross,id:number,mode:"base"|"total"="base",cat:"main"|"sum"="main",five=false)=>(five?result.comparison.allFive:result.comparison)?.rankings?.[mode]?.[cat]?.find(r=>r.key===`f29_net_p${id}`)!;
assert.equal(cross.comparison.timestamp,now-35*day,"guild comparison is unchanged");
assert.deepEqual([find(cross,301).rankStatus,find(cross,301).rankDelta,find(cross,301).valueDelta],["new",null,30]);
assert.equal(find(cross,302).valueDelta,20,"existing continuation remains authoritative");
assert.equal(find(cross,303).valueDelta,null,"conflicting physical observations remain ambiguous");
assert.equal(find(cross,304).valueDelta,null,"missing metric is not filled from another scan");
assert.equal(find(cross,305).valueDelta,null,"same numeric ID/name on another server is not an identity");
assert.equal(find(cross,301,"base","sum").valueDelta,60);
assert.equal(find(cross,301,"base","sum",true).valueDelta,150);
assert.equal(find(cross,301,"total","sum").valueDelta,60);
assert.equal(find(cross,301,"total","sum",true).valueDelta,150);
assert.equal(cross.comparison.diagnostic?.historical.length,5);
assert.deepEqual(cross.comparison.diagnostic?.valueSources?.find(s=>s.key==="s7_eu_p801"),{key:"s7_eu_p801",sourceScanId:ogImport.scan.id,scannedAtMs:ogAt});
assert.equal(cross.work.rawReads,2,"one guild read and one batched OG read for both sum modes/all players");
const fiveTrace=comparisonDeltaTrace({...cross.comparison,rankings:cross.comparison.allFive?.rankings}).find(r=>r.key==="f29_net_p301"&&r.mode==="base"&&r.category==="sum")!;
assert.equal(fiveTrace.historicalValue,360,"diagnostic uses the same prepared five-component endpoint");
assert.deepEqual(fiveTrace.valueSources,[{key:"s7_eu_p801",sourceScanId:ogImport.scan.id,scannedAtMs:ogAt}]);
// No >=28-day source: retain the oldest available younger fallback and zero.
await deleteGuildHubLocalScans([ogImport.scan.id,...(await listGuildHubScanSummaries()).filter(s=>s.filename==="w133-og-older.json").map(s=>s.sourceScanId)]);
const zero=og(801,now-27*day,0);for(let i=30;i<35;i++)zero.save[i]=0;
await updateGuildHubLocalScan(ogRecent.scan.id,"w133-og-recent.json",JSON.stringify({players:[zero],groups:[]}));
const fallbackCross=await loadDashboardMemberComparison(await crossInput());
assert.equal(fallbackCross.comparison.diagnostic?.valueSources?.find(s=>s.key==="s7_eu_p801")?.scannedAtMs,now-27*day);
assert.equal(find(fallbackCross,301,"base","sum",true).valueDelta,510,"valid historical zero retained");
console.log("PASS W133 new plus confirmed multi-hop OG values, 28-day preference and fallback, actual source/time, sums, zero, ambiguity, missing values and no unconfirmed name/ID joins");
