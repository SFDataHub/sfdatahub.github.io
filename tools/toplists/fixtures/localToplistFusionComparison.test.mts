import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCAL_SERVER_FUSION_EVENTS } from '../../../src/data/serverFusions.ts';
import { resolveLocalToplistCompareEntryPlan, enrichLocalPlayerCompareRows } from '../../../src/pages/DataHub/localToplistCompareModel.ts';
import { compareLocalToplists } from '../../../src/lib/toplists/localToplistComparison.ts';
import { buildPlayerIdentityResolutionIndex } from '../../../src/lib/identities/identityResolution.ts';
import type { LocalPlayerToplistRow, LocalToplistSnapshotMeta } from '../../../src/lib/toplists/localToplistTypes.ts';
import type { ScanArchiveManifest, ScanArchiveManifestScan } from '../../../src/lib/scanArchive/types.ts';

const scan = (server: string, month: string, day = 2): ScanArchiveManifestScan => {
  const timestamp = Date.parse(`${month}-${String(day).padStart(2,'0')}T12:00:00Z`), id = `${server}-${month}-${day}`;
  return { id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(), path: id+'.json.gz', format: 'sf-tools', compression: 'gzip', sha256: id.padEnd(64,'a'), compressedBytes: 1, uncompressedBytes: 2,
    searchIndex: {schemaVersion: 1, path: id+'.search.json.gz', sha256:'b'.repeat(64), compressedBytes:1, uncompressedBytes:2, playerCount:1, groupCount:0} };
};
const manifests = (scans: ScanArchiveManifestScan[]) => [...new Set(scans.map(s=>new Date(s.timestamp).getUTCFullYear()))].map(year => {
  const subset = scans.filter(s=>new Date(s.timestamp).getUTCFullYear()===year);
  const monthly: Record<string, Record<string,string>> = {};
  for(const s of subset) (monthly[s.timestampUtc.slice(0,7)]??={})[s.server]=s.id;
  return { schemaVersion:1, archiveYear:year, revision:1, updatedAt:'2026-10-29T00:00:00Z', scanCount:subset.length, serverCount:new Set(subset.map(s=>s.server)).size, scans:subset,
    toplists:{schemaVersion:1,current:Object.fromEntries(subset.map(s=>[s.server,s.id])),monthly} } as ScanArchiveManifest;
});
const plan = (scans: ScanArchiveManifestScan[], servers=['F29'], from='2026-09', to='2026-10', mode: 'progress'|'months'='months', fusion=true) => resolveLocalToplistCompareEntryPlan({mode, selectedServers:servers, progressSinceMonth:from, compareFromMonth:from, compareToMonth:to, manifests:manifests(scans), manifestUrlsByYear:Object.fromEntries([2023,2024,2025,2026].map(y=>[y,`https://example.invalid/${y}/manifest.json`])),resolveFusionSources:fusion});
for(const mode of ['months','progress'] as const) test(`${mode}: every registered fusion resolves its own origins before creation`,()=>{
  for(const event of LOCAL_SERVER_FUSION_EVENTS){
    const date=new Date(event.effectiveDate+'T00:00:00Z'); date.setUTCMonth(date.getUTCMonth()-1);
    const from=date.toISOString().slice(0,7), to=event.effectiveDate.slice(0,7);
    const p=plan([...event.origins.map(s=>scan(s,from)),scan(event.target,to,28)],[event.target],from,to,mode);
    assert.equal(p.status,'complete',event.target);assert.deepEqual(new Set(p.previousServers),new Set(event.origins));assert.deepEqual(p.currentServers,[event.target]);
  }
});
test('multistage lineage stops at the servers alive in each month; complete OG pool and overlap deduplication',()=>{
  const events=LOCAL_SERVER_FUSION_EVENTS.filter(e=>['F7','F10','F13'].includes(e.target));
  const origins=events.flatMap(e=>[...e.origins]);
  const scans=[...origins.map(s=>scan(s,'2023-11')),...events.map(e=>scan(e.target,'2026-04')),scan('BLACKFOREST','2026-06')];
  const p=plan(scans,['BLACKFOREST','F7','PL7'],'2023-11','2026-06');
  assert.deepEqual(new Set(p.previousServers),new Set(origins));assert.equal(p.previousEntries.length,origins.length);assert.equal(new Set(p.previousEntries.map(e=>e.id)).size,origins.length);
  const mid=plan(scans,['BLACKFOREST'],'2026-04','2026-06');assert.deepEqual(new Set(mid.previousServers),new Set(['F7','F10','F13']));
  const both=plan(scans,['BLACKFOREST'],'2023-11','2026-04');assert.deepEqual(new Set(both.currentServers),new Set(['F7','F10','F13']));
});
test('direct baseline wins; guild callers keep the direct-only contract',()=>{
  const scans=[scan('F29','2026-09'),...['EU5','EU6','EU7','EU8'].map(s=>scan(s,'2026-09')),scan('F29','2026-10',28)];
  assert.deepEqual(plan(scans).previousServers,['F29']);
  const without=scans.filter(s=>s.server!=='F29'||s.timestampUtc.startsWith('2026-10'));
  assert.equal(plan(without,['F29'],'2026-09','2026-10','months',false).status,'unavailable');
});
test('partial and truly missing sources stay honest; no wrong-month or post-fusion origin substitution',()=>{
  const scans=[scan('EU5','2026-09'),scan('EU6','2026-08'),scan('F29','2026-10',28)];
  const p=plan(scans);assert.equal(p.status,'partial');assert.deepEqual(p.previousServers,['EU5']);assert.deepEqual(p.missingPreviousServers,['EU6','EU7','EU8']);
  assert(p.noticeMessages.join(' ').includes('EU6'));assert(!p.noticeMessages.join(' ').includes('No selected server'));
  assert.equal(plan(scans,['F29'],'2026-07','2026-09').status,'unavailable');
  const late=plan([scan('EU5','2026-10',20),scan('F29','2026-11')],['F29'],'2026-10','2026-11');assert.equal(late.status,'unavailable');
  const early=plan([scan('EU5','2026-10',2),scan('F29','2026-11')],['F29'],'2026-10','2026-11');assert.equal(early.status,'partial');assert.deepEqual(early.previousServers,['EU5']);
});
const player=(server:string,id:string,value:number,month:string,extra:Partial<LocalPlayerToplistRow>={}):LocalPlayerToplistRow=>({rowKey:server+'_'+id,identifier:server.toLowerCase()+'_p'+id,playerId:id,name:'Same possible name',server,sourceServer:server,scanTimestamp:Date.parse(month+'-02T00:00:00Z'),latestScanAtSec:Date.parse(month+'-02T00:00:00Z')/1000,manifestYear:2026,archiveScanId:server+'-'+month,archiveSha256:'a'.repeat(64),localScanId:server+'-'+month,class:'Warrior',classId:1,guild:null,guildIdentifier:null,hofRank:null,level:100,main:value,con:10,sum:value,ratio:null,mainTotal:value+100,conTotal:20,sumTotal:value+100,xpProgress:null,xpTotal:null,mine:null,treasury:null,statsPerDay:null,statsDayTotal:null,lastScan:null,...extra});
const identities=(...groups:string[][])=>({players:buildPlayerIdentityResolutionIndex(groups.map((refs,i)=>({entity:{entityId:'person'+i,createdAt:'2026-01-01',updatedAt:'2026-10-29'},aliases:refs.map(identifier=>({identifier,identifierKey:identifier.toLowerCase(),entityId:'person'+i,source:'manual' as const,addedAt:'2026-01-01'}))})))});
const previous=[player('EU5','10',100,'2026-09'),player('EU6','80',900,'2026-09'),player('EU7','90',500,'2026-09'),player('EU8','20',50,'2026-09')];
const current=[player('F29','99',1000,'2026-10'),player('F29','20',600,'2026-10'),player('F29','77',400,'2026-10')];
const sources={previousServers:['EU5','EU6','EU7','EU8'],currentServers:['F29']};
const compare=(old=previous,now=current,confirmed=identities(['s5_eu_p10','f29_net_p99']),direction:'asc'|'desc'='desc',metricKey='sum')=>{
  const set=(month:string,rows:LocalPlayerToplistRow[])=>({month,players:rows,guilds:[],snapshots:[...new Set(rows.map(r=>r.server))].map(server=>({server} as LocalToplistSnapshotMeta))});
  return compareLocalToplists(set('2026-09',old),set('2026-10',now),{filters:{servers:['F29']},playerSources:sources,playerIdentities:confirmed,playerSort:{metricKey,direction}});
};
test('decisive full historical rank proof: unmatched historic players change the matched rank',()=>{
  const result=compare(), match=result.players.find(r=>r.current?.identifier==='f29_p99')!;
  assert.equal(result.previousPlayerView.rows.length,4);assert.equal(match.previousTableRank,3);assert.equal(match.currentTableRank,1);assert.equal(match.rankDelta,2);assert.equal(match.deltas.sum,900);assert.equal(match.statsDays,30);assert.equal(match.statsPerDay,30);
  const subset=compare([previous[0]]).players.find(r=>r.current?.identifier==='f29_p99')!;assert.equal(subset.previousTableRank,1);assert.notEqual(subset.rankDelta,match.rankDelta);
  const asc=compare(previous,current,identities(['eu5_p10','f29_p99']),'asc').players.find(r=>r.current?.identifier==='f29_p99')!;assert.equal(asc.previousTableRank,2);assert.equal(asc.currentTableRank,3);assert.equal(asc.rankDelta,-1);
});
test('unconfirmed possible OG observation, same numeric ID/name, and missing OG all remain NEW without invented values',()=>{
  const result=compare();for(const id of ['f29_p20','f29_p77']){const row=result.players.find(r=>r.current?.identifier===id)!;assert.equal(row.status,'entered');assert.equal(row.previous,null);assert.equal(row.previousTableRank,null);assert.equal(row.rankDelta,null);assert.equal(row.metricDelta,null);assert.equal(row.statsPerDay,null);assert(Object.values(row.deltas).every(v=>v===null));}
  assert.equal(compare(previous,current,identities()).counts.playersMatched,0);
});
test('confirmed multistage identity group and registered spellings resolve without rewriting observations',()=>{
  const result=compare(previous,current,identities(['s5_eu_p10','f28_net_p51','f29_net_p99']));
  const row=result.players.find(r=>r.current?.identifier==='f29_p99')!;assert.equal(row.status,'matched');assert.equal(row.previous?.identifier,'eu5_p10');assert.equal(row.previous?.server,'EU5');
  assert.equal(compare(previous.filter(r=>r.server!=='EU5')).counts.playersMatched,0);
});
test('ambiguities never choose a predecessor or share one observation between current players',()=>{
  const manyOld=compare(previous,current,identities(['eu5_p10','eu6_p80','f29_p99']));assert.equal(manyOld.players.find(r=>r.current?.identifier==='f29_p99')?.status,'conflict');
  const manyNow=compare(previous,current,identities(['eu5_p10','f29_p99','f29_p20']));assert.equal(manyNow.counts.playersMatched,0);assert.equal(manyNow.counts.playersConflicts,2);
  const contradictory=compare(previous,current,identities(['eu5_p10','f29_p99'],['eu6_p80','f29_net_p99']));assert.equal(contradictory.players.find(r=>r.current?.identifier==='f29_p99')?.status,'conflict');
});
test('identity merge/unlink snapshots immediately change compare validity; fixed values and enrichment remain intact',()=>{
  const linked=compare().players.find(r=>r.current?.identifier==='f29_p99')!;
  const unlinked=compare(previous,current,identities(['eu5_p10'],['f29_p99'])).players.find(r=>r.current?.identifier==='f29_p99')!;assert.equal(unlinked.status,'entered');
  const values=compare(previous,current,identities(['eu5_p10','f29_p99']),'desc','sumTotal').players.find(r=>r.current?.identifier==='f29_p99')!;assert.equal(values.deltas.sumTotal,900);assert.equal(current[0].sumTotal,1100);assert.equal(previous[0].sumTotal,200);
  const enriched=enrichLocalPlayerCompareRows({rows:[{identifier:current[0].identifier,__localRow:current[0],tableRank:1} as any],comparisonRows:[linked],playerAvgMode:'total'});assert.equal(enriched[0]._rankDelta,2);assert.equal(enriched[0]._statsPerDayTotal,30);assert.equal(enriched[0]._compareMissing,false);
});

test('each player side retains explicitly selected independent sources even without the same server on the other side',()=>{
  const scans=[scan('EU5','2026-09'),scan('EU6','2026-09'),scan('EU7','2026-09'),scan('EU8','2026-09'),scan('EU9','2026-09'),scan('F29','2026-10',28)];
  const p=plan(scans,['F29','EU9']);assert.equal(p.status,'partial');assert.equal(p.previousEntries.length,5);assert(p.previousServers.includes('EU9'));assert.deepEqual(p.currentServers,['F29']);
  const disjoint=plan([scan('EU9','2026-09'),scan('EU10','2026-10')],['EU9','EU10']);assert.equal(disjoint.status,'partial');assert.deepEqual(disjoint.commonServers,[]);assert.deepEqual(disjoint.previousServers,['EU9']);assert.deepEqual(disjoint.currentServers,['EU10']);assert(!disjoint.noticeMessages.some(m=>m.includes('No selected server')));
});
test('legacy explicit links keep original complete reference spellings',()=>{
  const old=player('EU5','10',100,'2026-09',{identifier:'s5_eu_p10'}),now=player('F29','99',1000,'2026-10',{identifier:'f29_net_p99'});
  const set=(month:string,rows:LocalPlayerToplistRow[])=>({month,players:rows,guilds:[],snapshots:[]});
  const result=compareLocalToplists(set('2026-09',[old]),set('2026-10',[now]),{playerIdentityLinks:[{previousServer:'EU5',previousIdentifier:old.identifier,currentServer:'F29',currentIdentifier:now.identifier}]});
  assert.equal(result.players[0].status,'matched');assert.equal(result.players[0].matchType,'fusion');assert.equal(result.players[0].deltas.sum,900);
});
