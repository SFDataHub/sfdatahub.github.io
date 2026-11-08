import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { importGuildHubLocalScan, listGuildHubScanSummaries, deleteGuildHubLocalScans } from '../../src/lib/guilds/localScanLibrary';
import { loadDashboardMemberComparison } from '../../src/pages/GuildHub/dashboardMemberComparison';
import { readLocalGuildMemberValues } from '../../src/pages/GuildHub/localGuildPlayerStats';
const day=86400000,now=Date.UTC(2026,9,4),old=now-35*day;
const player=(id:number,at:number)=>({identifier:`stumblesteppe_net_p${id}`,prefix:'stumblesteppe_net',timestamp:at,name:`Player ${id}`,class:1,level:100,xpTotal:1000,group:'stumblesteppe_net_g1',groupname:'Guild',values:{Base:100,'Base Constitution':80}});
const group=(at:number,count?:number)=>({identifier:'stumblesteppe_net_g1',prefix:'stumblesteppe_net',timestamp:at,name:'Guild',...(count==null?{}:{memberCount:count})});
const current=[player(1,now),player(2,now)];
const currentScan=await importGuildHubLocalScan('w103-current.json',JSON.stringify({players:current,groups:[group(now,2)]}));
const run=async()=>loadDashboardMemberComparison({summaries:await listGuildHubScanSummaries(),currentSourceId:currentScan.scan.id,currentTimestamp:now,guild:{name:'Guild',server:'STUMBLESTEPPE',logoIdentifier:'stumblesteppe_net_g1'},members:current.map(p=>({key:p.identifier,name:p.name,classLabel:'Warrior',playerStats:readLocalGuildMemberValues(p)}))});
const check=async(name:string,players:unknown[],groups:unknown[],reason:string,found:number,declared:number|null)=>{
 const scan=await importGuildHubLocalScan(`w103-${name}.json`,JSON.stringify({players,groups}));
 const result=await run();assert.equal(result.comparison.status,'empty',name);assert.equal(result.comparison.timestamp,null,'excluded is not used');
 const c=result.comparison.coverage!;assert.equal(c.reason,reason);assert.equal(c.timestamp,old);assert.equal(c.sourceScanId,scan.scan.id);assert.equal(c.foundMemberCount,found);assert.equal(c.declaredMemberCount,declared);assert.equal(result.work.rawReads,0,'prepared diagnostics do not read Raw');
 await deleteGuildHubLocalScans([scan.scan.id]);console.log('PASS',name);return c;
};
assert.equal((await run()).comparison.coverage,undefined,'no candidate is not an incomplete candidate');
await check('known-count',[player(1,old)],[group(old,2)],'members',1,2);
await check('unknown-count',[player(1,old),player(2,old)],[group(old)],'unknown-total',2,null);
const noXp={...player(2,old),xpTotal:undefined,level:undefined};
const xp=await check('missing-xp',[player(1,old),noXp],[group(old,2)],'values',2,2);assert.equal(xp.validXpTotalCount,1);assert.equal(xp.validBaseStatsCount,2);
const noBase={...player(2,old),values:{}};
const base=await check('missing-base',[player(1,old),noBase],[group(old,2)],'values',2,2);assert.equal(base.validXpTotalCount,2);assert.equal(base.validBaseStatsCount,1);
const valid=await importGuildHubLocalScan('w103-valid.json',JSON.stringify({players:[player(1,old),player(2,old),{...player(3,old),group:'stumblesteppe_net_g2',groupname:'СССР'}],groups:[group(old,2)]}));
const rejectedTime=now-29*day;
const rejected=await importGuildHubLocalScan('w103-later-incomplete.json',JSON.stringify({players:[],groups:[group(rejectedTime,2)]}));
const result=await run();assert.equal(result.comparison.status,'ready');assert.equal(result.comparison.timestamp,old);assert.equal(result.comparison.sourceScanId,valid.scan.id);assert.equal(result.comparison.coverage?.sourceScanId,valid.scan.id);assert.equal(result.comparison.coverage?.reason,null);assert.equal(result.comparison.coverage?.foundMemberCount,2);assert(result.comparison.rankings?.general?.level?.every(r=>r.valueDelta===0&&r.rankDelta===0));assert.equal(result.work.rawReads,1);assert.equal(result.work.normalizedPlayers,2,'foreign non-Latin guild excluded by exact membership');
// A valid persistent v4 source without the additive declaration metadata uses
// the existing selected-source Raw recheck; it does not need a reset/rebuild.
const {openDB}=await import('idb');
const db=await openDB('sfdatahub-guild-analytics');
const marker=await db.get('sources',valid.scan.id);delete marker.progress;await db.put('sources',marker);
for(const g of await db.getAll('guilds'))if(g.sourceScanId===valid.scan.id){delete g.declaredMemberCount;await db.put('guilds',g)}
db.close();
const legacy=await run();assert.equal(legacy.comparison.status,'ready');assert.equal(legacy.comparison.timestamp,old);assert.equal(legacy.comparison.coverage?.declaredMemberCount,2);assert.equal(legacy.work.rawReads,1);assert.equal(legacy.work.projections,1);
await deleteGuildHubLocalScans([valid.scan.id,rejected.scan.id]);
console.log('PASS no candidate, known/unknown totals, separate metric coverage, exact named-server membership, successful 28-day fallback with coherent date/source/coverage/deltas');
