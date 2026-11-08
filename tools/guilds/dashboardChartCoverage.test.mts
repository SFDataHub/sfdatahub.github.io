import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {buildDashboardGuildComparison, buildDashboardGuildTrendIntervals, guildComparisonSeries} from '../../src/pages/GuildHub/dashboardGuildComparison.ts';
import {buildGuildTrendModel} from '../../src/pages/Playground/playerPerformanceModel.ts';
import {loadIdentityResolutionSnapshot} from '../../src/lib/identities/identityResolution.ts';
import {linkPlayerIdentifiers} from '../../src/lib/identities/playerIdentityStore.ts';
const day=86400000, at=Date.UTC(2026,7,2), metrics=['xp','baseMain','conBase','base','attrTotal','conTotal','total','mine','treasury'] as const;
function fixture(counts:(number|null)[],used:number[],changes?:(member:any,index:number,time:number)=>void){
 const snapshots=counts.map((_,i)=>({id:'s'+i,sourceScanId:'scan'+i,sourceScanFilename:'fixture'+i,snapshotTimestamp:at+i*day}));
 const guilds=snapshots.map((s,i)=>({...s,id:'g'+i,snapshotId:s.id,server:'f8_net',guildIdentifier:'f8_net_g1',guildSegment:'1',guildName:'Guild',memberCount:counts[i],declaredMemberCount:counts[i],averageLevel:1}));
 const members=snapshots.flatMap((s,i)=>Array.from({length:used[i]},(_,j)=>{
  const m:any={...s,id:'m'+i+'-'+j,snapshotId:s.id,memberRef:'f8_net_p'+j,server:'f8_net',guildIdentifier:'f8_net_g1',guildSegment:'1',groupSegment:'1',xpTotal:100+i*10+j,baseMain:20+i+j,conBase:5,focusedBaseStats:25+i+j,attrTotal:30+i+j,conTotal:10,focusedTotalStats:40+i+j,mine:0,treasury:0};changes?.(m,j,i);return m;
 }));
 return {data:{snapshots,guilds,members},guildRankings:[{guildIdentifier:'f8_net_g1',server:'f8_net',hofRank:1,timestampMs:at}] } as any;
}
const prepare=(input:any)=>buildDashboardGuildComparison(input,'f8_net','f8_net_g1',at+20*day);
const input=fixture([50,50,50,50,50,49,49,null,50],[50,49,45,44,3,44,43,49,0]);
const original=structuredClone(input),result=prepare(input),row=result.displayRows[0];
for(const metric of metrics){
 assert.deepEqual([...row.byTime.values()].map(s=>s.progress[metric].value!=null),[true,true,true,false,false,true,false,false,false],metric+' absolute boundary');
 assert.deepEqual([...row.byTime.values()].map(s=>s.progress[metric].coverage.partial),[false,true,true,false,false,true,false,false,false]);
}
assert.deepEqual(input,original,'source rows unchanged');
assert.equal(row.byTime.get(at+day)!.progress.xp.value,134,'actual average, no extrapolation');
assert.equal(row.byTime.get(at+day)!.values.xp,null,'strict delta basis remains unavailable');
assert.equal(row.byTime.get(at)!.progress.mine.value,0,'real zero');
assert.equal(row.byTime.get(at+7*day)!.progress.xp.coverage.reason,'unknown');
assert.equal(row.byTime.get(at+8*day)!.progress.xp.coverage.reason,'empty');
const trends=buildDashboardGuildTrendIntervals(result);
assert.equal(trends.length,8,'all adjacent actual stands retained');
assert.deepEqual(trends.map(i=>i.xp!=null),[true,true,false,false,false,false,false,false]);
assert.equal(trends[0].xp!.perDay,9.5);assert.equal(trends[0].xp!.absoluteGrowth,9.5);assert.equal(trends[0].elapsedDays,1);
assert.equal(trends[1].coverage!.xp.start.partial,true);assert.equal(trends[1].coverage!.xp.end.partial,true);
assert.equal(buildDashboardGuildTrendIntervals(result),trends,'preparation reused');
assert.equal(prepare(input),result,'stand aggregation reused');
const full=fixture([50,50,50],[50,50,50]);
const fullChart=buildDashboardGuildTrendIntervals(prepare(full));
const strict=buildGuildTrendModel({analyticsData:full.data,guildTarget:{logoIdentifier:'f8_net_g1',server:'f8_net'}});
assert.equal(strict.intervals.length,2);for(let i=0;i<2;i++){assert.deepEqual(fullChart[i].xp,strict.intervals[i].xp);assert.deepEqual(fullChart[i].base,strict.intervals[i].base)}
const independent=fixture([50,50,50],[50,50,50],(m,j,i)=>{if(i===1&&j<6)m.xpTotal=null;if(i===2&&j<5){m.conBase=null;m.conTotal=null}});
const separate=prepare(independent),s=[...separate.displayRows[0].byTime.values()];
assert.equal(s[1].progress.xp.value,null,'six missing metric values despite all rows');assert.equal(s[1].progress.base.coverage.used,50);
assert.equal(s[2].progress.base.coverage.used,45,'joint Main/CON denominator');assert.equal(s[2].progress.total.coverage.used,45);assert.equal(s[2].progress.baseMain.coverage.used,50);
assert(buildDashboardGuildTrendIntervals(separate).every(i=>i.xp===null),'no interval across excluded middle endpoint');
assert(buildDashboardGuildTrendIntervals(separate).every(i=>i.base!==null),'independent base intervals');
const nonfinite=fixture([50],[50],(m,j)=>{if(j<6)m.xpTotal=NaN;if(j===0)m.conBase=Infinity});
assert.equal(prepare(nonfinite).displayRows[0].byTime.get(at)!.progress.xp.value,null);
const dup=fixture([50],[50]);dup.data.members.push({...dup.data.members[0],id:'duplicate'});
assert.equal(prepare(dup).displayRows[0].byTime.get(at)!.progress.xp.coverage.used,50,'duplicate observations not counted twice');
await linkPlayerIdentifiers('f8_net_p0','f8_net_p100',{source:'manual'});
const aliases=fixture([50],[50]);aliases.identity=await loadIdentityResolutionSnapshot();aliases.data.members.push({...aliases.data.members[0],id:'alias',memberRef:'f8_net_p100'});
assert.equal(prepare(aliases).displayRows[0].byTime.get(at)!.progress.xp.coverage.used,50,'confirmed aliases deduped');
const conflict=fixture([50],[50]);conflict.data.members.push({...conflict.data.members[0],id:'conflict',guildIdentifier:'f8_net_g2',guildSegment:'2'});
assert.equal(prepare(conflict).displayRows[0].byTime.get(at)!.progress.xp.coverage.reason,'conflict');
assert.equal(prepare(fixture([49],[50])).displayRows[0].byTime.get(at)!.progress.xp.coverage.reason,'excess');
for(const n of [0,-1,NaN,49.5])assert.equal(prepare(fixture([n],[1])).displayRows[0].byTime.get(at)!.progress.xp.coverage.reason,'unknown','invalid total');
const onlyPartial=prepare(fixture([50,50],[45,45]));assert.equal(buildDashboardGuildTrendIntervals(onlyPartial).length,1,'no complete snapshot required for chart-only history');
const sameDay=fixture([50,50,50],[50,3,50]);sameDay.data.guilds[1].snapshotTimestamp=at+1000;sameDay.data.members.filter((m:any)=>m.snapshotId==='s1').forEach((m:any)=>m.snapshotTimestamp=at+1000);sameDay.data.snapshots[1].snapshotTimestamp=at+1000;
assert.equal(prepare(sameDay).displayRows[0].byTime.size,3,'real same-day scans remain distinct');
const hof=fixture([null,null,null],[0,0,0]);hof.guildRankings=[{guildIdentifier:'f8_net_g1',server:'f8_net',hofRank:1,timestampMs:at},{guildIdentifier:'f8_net_g1',server:'f8_net',hofRank:null,timestampMs:at+day},{guildIdentifier:'f8_net_g1',server:'f8_net',hofRank:1,timestampMs:at+2*day},{guildIdentifier:'f9_net_g1',server:'f9_net',hofRank:2,timestampMs:at+day}];
const ranks=guildComparisonSeries(prepare(hof),'general',m=>m);
assert.equal(ranks.length,1,'unconfirmed foreign guild stays separate');assert.deepEqual(ranks[0].timePoints?.map(p=>p.value),[1,null,1],'HoF retains missing observation and ignores roster threshold');
console.log('PASS: chart coverage boundaries, per-metric nulls, zero/components, aliases/duplicates/conflicts, exact adjacent pairs, strict full-value/formula parity, same-day scans and HoF data preservation');

// Explicit monthly-set metadata, not date/name coincidence, identifies a
// guild-only supplementary file. Every physical observation remains intact.
const {toScanArchiveEntries}=await import('../../src/lib/scanArchive/validation.ts');
const monthlyInput=fixture([50,50,50],[50,0,50]);
const monthlyComparison=prepare(monthlyInput);
const descriptor=(i:number)=>({id:'archive'+i,server:'f8_net',timestamp:at+i*day,path:'s'+i+'.json.gz',format:'sftools.raw.v1',compression:'gzip',sha256:String(i+1).repeat(64),compressedBytes:1,uncompressedBytes:1,playerCount:i===1?0:50,groupCount:1});
const manifest:any={archiveYear:2026,revision:1,scans:[descriptor(0),descriptor(1)],toplists:{monthly:{'2026-08':{f8_net:{scanIds:['archive0','archive1']}}}}};
const entries=toScanArchiveEntries(manifest,'https://archive.test/manifest.json');
assert.equal(entries[0].toplistSetKey,undefined,'passive metadata does not alter existing toplist selection keys');
assert.deepEqual(entries[0].monthlySets?.[0].scanIds,['archive0','archive1']);
const summaries:any[]=monthlyInput.data.snapshots.map((snapshot:any,i:number)=>({sourceScanId:snapshot.sourceScanId,contentHash:'local'+i,archiveBindings:[{archiveScanId:'archive'+i,localScanId:snapshot.sourceScanId,localContentHash:'local'+i,sha256:String(i+1).repeat(64),manifestUrl:'https://archive.test/manifest.json',timestamp:at+i*day}]}));
const context={entries:entries.filter(e=>e.playerCount>0),summaries};
const monthlyIntervals=buildDashboardGuildTrendIntervals(monthlyComparison,context);
assert.equal(monthlyIntervals.length,1,'bound guild-only supplement does not create a member boundary');
assert.equal(monthlyIntervals[0].start.scannedAtMs,at,'original member timestamp retained');
assert.equal(monthlyIntervals[0].end.scannedAtMs,at+2*day);assert.equal(monthlyIntervals[0].elapsedDays,2);
assert.equal(monthlyIntervals[0].xp!.perDay,10,'actual two-day rate, no transplant to supplementary timestamp');
assert.deepEqual(monthlyIntervals[0].archiveSupplements,[{observedAt:at+day,memberAt:at}]);
assert.equal(monthlyComparison.displayRows[0].byTime.size,3,'supplementary observation remains in original comparison history');
assert.equal(monthlyComparison.displayRows[0].byTime.get(at+day)!.progress.xp.value,null,'no old values assigned to later guild timestamp');
assert.equal(buildDashboardGuildTrendIntervals(monthlyComparison,context),monthlyIntervals,'context-bound projection cached');
for(const change of [(c:any)=>{c.summaries[1].archiveBindings=[]},(c:any)=>{c.summaries[1].archiveBindings[0].localContentHash='stale'},(c:any)=>{c.summaries[0].archiveBindings[0].sha256='wrong'},(c:any)=>{c.summaries[1].archiveBindings[0].timestamp++},(c:any)=>{c.entries[0].monthlySets=[]}]){
 const c=structuredClone(context);change(c);assert.equal(buildDashboardGuildTrendIntervals(monthlyComparison,c).length,2,'unproved fragment remains a real excluded boundary');
}
const realPartial=fixture([50,50,50],[50,3,50]);assert.equal(buildDashboardGuildTrendIntervals(prepare(realPartial),context).length,2,'real three-member scan never suppressed as a supplement');
const changedCount=fixture([50,49,50],[50,0,50]);assert.equal(buildDashboardGuildTrendIntervals(prepare(changedCount),context).length,2,'changed declared roster cannot reuse earlier complete basis');
const incompleteRoster=fixture([50,50,50],[45,0,50]);assert.equal(buildDashboardGuildTrendIntervals(prepare(incompleteRoster),context).length,2,'monthly representative requires a complete physical roster');
const metricGap=fixture([50,50,50],[50,0,50],(m,j,i)=>{if(i===0&&j<6)m.xpTotal=null});const metricPairs=buildDashboardGuildTrendIntervals(prepare(metricGap),context);assert.equal(metricPairs.length,1);assert.equal(metricPairs[0].xp,null);assert(metricPairs[0].base,'supplement classification does not mix metric coverage');
assert.equal(buildDashboardGuildTrendIntervals(monthlyComparison).length,2,'without verified set context no implicit grouping');
console.log('PASS: explicit monthly-set provenance, filtered zero-player descriptors, local/hash/time guards, physical timestamps, no global selection change or same-day merging');

// Players-only Monthly Add files are also fragments of the explicit set. Their
// inferred guild rows must not hide the next full monthly interval.
const playerAdd=fixture([50,null,50],[50,3,50]);
const playerManifest=structuredClone(manifest);
playerManifest.scans[1].playerCount=3;playerManifest.scans[1].groupCount=0;
const playerContext={entries:toScanArchiveEntries(playerManifest,'https://archive.test/manifest.json'),summaries};
const playerComparison=prepare(playerAdd),savedPlayerAdd=structuredClone(playerAdd);
const playerIntervals=buildDashboardGuildTrendIntervals(playerComparison,playerContext);
assert.equal(playerIntervals.length,1,'players-only addition is not a second monthly guild stand');
assert.equal(playerIntervals[0].start.scannedAtMs,at);
assert.equal(playerIntervals[0].end.scannedAtMs,at+2*day);
assert.equal(playerIntervals[0].xp!.perDay,10,'next full monthly bar has the actual complete endpoints');
assert.equal(playerComparison.displayRows[0].byTime.size,3,'original three-player observation retained');
assert.deepEqual(playerAdd,savedPlayerAdd,'no member transplant or source mutation');
assert.equal(buildDashboardGuildTrendIntervals(playerComparison).length,2,'unbound real same-day scans remain separate');
for(const change of [(c:any)=>{c.summaries[1].archiveBindings=[]},(c:any)=>{c.summaries[1].archiveBindings[0].localContentHash='stale'},(c:any)=>{c.entries[0].monthlySets=[];c.entries[1].monthlySets=[]}]){
 const c=structuredClone(playerContext);change(c);assert.equal(buildDashboardGuildTrendIntervals(playerComparison,c).length,2,'players-only classification requires valid complete set provenance');
}
const newPlayer=fixture([50,null,50],[50,3,50],(m,j,i)=>{if(i===1&&j===0)m.memberRef='f8_net_p999'});
assert.equal(buildDashboardGuildTrendIntervals(prepare(newPlayer),playerContext).length,2,'a changed roster is not an already covered player addition');
const addConflict=fixture([50,null,50],[50,3,50]);addConflict.data.members.push({...addConflict.data.members.find((m:any)=>m.snapshotId==='s1'),id:'conflicting-add',guildIdentifier:'f8_net_g2',guildSegment:'2'});
assert.equal(buildDashboardGuildTrendIntervals(prepare(addConflict),playerContext).length,2,'unknown declared count must not hide a membership conflict');
const observedGuildManifest=structuredClone(playerManifest);observedGuildManifest.scans[1].groupCount=1;
assert.equal(buildDashboardGuildTrendIntervals(playerComparison,{entries:toScanArchiveEntries(observedGuildManifest,'https://archive.test/manifest.json'),summaries}).length,2,'a real partial guild observation stays a boundary');
console.log('PASS: players-only monthly additions reuse the complete physical source; original rows, independent scans, changed rosters, conflicts and stale bindings stay protected');

// W108: every trend metric uses the existing exact endpoints and coverage.
const added = ['attrTotal','conTotal','total','mine','treasury','baseMain','conBase'] as const;
for (const metric of added) {
 assert.deepEqual(trends.map(i=>i[metric]!=null),[true,true,false,false,false,false,false,false],metric+' no bridging excluded stands');
 for (const interval of buildDashboardGuildTrendIntervals(prepare(full))) {
  const a=prepare(full).displayRows[0].byTime.get(interval.start.scannedAtMs)!.progress[metric];
  const b=prepare(full).displayRows[0].byTime.get(interval.end.scannedAtMs)!.progress[metric];
  assert.equal(interval[metric]!.startAverage,a.value);assert.equal(interval[metric]!.endAverage,b.value);
  assert.equal(interval[metric]!.perDay,(b.value!-a.value!)/interval.elapsedDays);
  assert.deepEqual(interval.coverage![metric],{start:a.coverage,end:b.coverage});
 }
 const month=buildDashboardGuildTrendIntervals(playerComparison,playerContext)[0];
 assert(month[metric]);assert.equal(month.start.scannedAtMs,at);assert.equal(month.end.scannedAtMs,at+2*day);
 assert.equal(month[metric]!.perDay,(metric==='mine'||metric==='treasury')?0:metric==='conTotal'||metric==='conBase'?0:1);
}
const separated=buildDashboardGuildTrendIntervals(prepare(independent));
assert.equal(separated[1].coverage!.attrTotal!.start.used,50);
assert.equal(separated[1].coverage!.total!.end.used,45,'sum uses joint valid Main/CON contributors');
const buildingGap=fixture([50,50,50,50],[50,50,50,50],(m,j,i)=>{if(i===1&&j<6)m.mine=null;if(i===2&&j<5)m.treasury=null});
const buildings=buildDashboardGuildTrendIntervals(prepare(buildingGap));
assert.deepEqual(buildings.map(i=>i.mine!=null),[false,false,true]);
assert.equal(buildings[2].mine!.absoluteGrowth,0,'unchanged building is a valid zero');
assert.equal(buildings[1].coverage!.treasury!.end.partial,true);
assert.equal(buildings[2].coverage!.treasury!.start.partial,true);
assert.equal(buildings[2].coverage!.treasury!.end.partial,false);
console.log('PASS W108: all metric mappings, joint sums, monthly add, per-end coverage, exact times, null gaps and zero growth');

// W132: same time/identity/coverage rules, separately keyed profile projections.
const five = fixture([50,50],[50,45], (m,j,i) => { m.profileAllSums = {base: 1000 + i*100 + j, total: 2000 + i*200 + j}; });
const beforeFive = structuredClone(five);
const twoHistory = buildDashboardGuildComparison(five, "f8_net", "f8_net_g1", at + day, undefined, "main-con");
const fiveHistory = buildDashboardGuildComparison(five, "f8_net", "f8_net_g1", at + day, undefined, "all-five");
assert.notEqual(twoHistory, fiveHistory, "mode owns aggregate cache entries");
assert.equal(buildDashboardGuildComparison(five, "f8_net", "f8_net_g1", at + day, undefined, "all-five"), fiveHistory);
const fiveStands = fiveHistory.displayRows[0].byTime;
assert.equal(fiveStands.get(at)!.progress.base.value, 1024.5);
assert.equal(fiveStands.get(at+day)!.progress.base.value, 1122);
assert.equal(fiveStands.get(at+day)!.progress.base.coverage.used, 45, "five missing members remain tolerated");
const fiveInterval = buildDashboardGuildTrendIntervals(fiveHistory)[0];
assert.equal(fiveInterval.base!.absoluteGrowth, 97.5, "both delta endpoints use five attributes");
assert.equal(fiveInterval.total!.absoluteGrowth, 197.5);
assert.equal(fiveStands.get(at)!.progress.baseMain.value, twoHistory.displayRows[0].byTime.get(at)!.progress.baseMain.value);
assert.deepEqual(five, beforeFive, "stored analytics unchanged");
const unknownClass = fixture([1],[1], m => {m.baseMain=null;m.attrTotal=null;m.profileAllSums={base:0,total:0};});
const unknownFive = buildDashboardGuildComparison(unknownClass,"f8_net","f8_net_g1",at,undefined,"all-five");
assert.equal(unknownFive.displayRows[0].byTime.get(at)!.progress.base.value,0,"five components do not need a primary class");
console.log("PASS W132 independent aggregate caches, five-member tolerance, both sum delta endpoints and zero with unknown primary class");
