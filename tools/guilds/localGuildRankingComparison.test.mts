import { siblingInput, artifactPath } from '../codex/workspace.mjs';
import assert from 'node:assert/strict';
import { buildLocalGuildRanking } from '../../src/pages/GuildHub/localGuildRanking.ts';
import { readLocalGuildRankingComparisonMembers } from '../../src/pages/GuildHub/useLocalGuildRankingComparison.ts';
import { buildPlayerIdentityResolutionIndex, type IdentityResolutionSnapshot } from '../../src/lib/identities/identityResolution.ts';
import type { GuildTrendSnapshot } from '../../src/pages/Playground/playerPerformanceModel.ts';
import { readLocalGuildPlayerStats } from '../../src/pages/GuildHub/localGuildPlayerStats.ts';
const identities: IdentityResolutionSnapshot = {
  players: buildPlayerIdentityResolutionIndex([{entity:{entityId:'confirmed',createdAt:'0',updatedAt:'0'},aliases:['f8_net_p1','f7_net_p11'].map(identifier=>({identifier,identifierKey:identifier,entityId:'confirmed',source:'manual',addedAt:'0'}))}]),
  guilds:{byIdentifier:new Map(),byIdentityId:new Map()},
};
const raw=(key:string,base:number,group='f8_net_g1')=>({identifier:key,prefix:key.replace(/_p[^_]+$/,''),name:'Same name',timestamp:1000,class:1,group,values:{Base:base,'Base Constitution':base/2,Attribute:base*2,Constitution:base}});
const member=(key:string,base:number)=>({key,name:'Same name',classLabel:'Warrior',playerStats:readLocalGuildPlayerStats(raw(key,base))});
const snapshot={guildIdentifier:'f8_net_g1',foundUniqueMemberCount:3} as GuildTrendSnapshot;
const current=[member('f8_net_p1',250),member('f8_net_p2',150),member('f8_net_p3',80),member('f8_net_p4',70),member('f8_net_p5',0)];
// Confirmed alias p11 belongs to another guild. p7 has the same name and
// another server; neither supplies a prior target-guild rank for p1/p4.
const inputs=[raw('f8_net_p99',300),raw('f8_net_p2',220),raw('f8_net_p5',0),raw('f7_net_p11',80,'f7_net_g9'),raw('f7_net_p4',20,'f7_net_g9'),raw('f8_net_p700',400,'f8_net_g9')];
const comparison=readLocalGuildRankingComparisonMembers(inputs,snapshot,current,identities);
assert.deepEqual(comparison.members.map(m=>m.key),['f8_net_p99','f8_net_p2','f8_net_p5']);
assert.deepEqual(comparison.players.map(m=>m.key),['f8_net_p99','f8_net_p2','f8_net_p5','f7_net_p11']);
for(const mode of ['base','total'] as const)for(const category of ['main','con','sum'] as const){
 const scale=mode==='base'?{main:1,con:.5,sum:1.5}[category]:{main:2,con:1,sum:3}[category];
 const rows=buildLocalGuildRanking(current,comparison.members,category,mode,identities,{players:comparison.players,rosterComplete:true});
 assert.deepEqual(rows.map(r=>[r.key,r.rankStatus,r.rankDelta,r.valueDelta]),[
  ['f8_net_p1','new',null,170*scale],['f8_net_p2','compared',0,-70*scale],['f8_net_p3','new',null,null],['f8_net_p4','new',null,null],['f8_net_p5','compared',-2,0],
 ]);
 const unavailable=buildLocalGuildRanking(current,[],category,mode,identities,{players:[],rosterComplete:false});
 assert(unavailable.every(r=>r.rankStatus==='unavailable'&&r.rankDelta===null&&r.valueDelta===null));
}
assert.throws(()=>readLocalGuildRankingComparisonMembers(inputs,{...snapshot,foundUniqueMemberCount:4},current,identities),/Incomplete/);
const literal=readLocalGuildRankingComparisonMembers(inputs,snapshot,current,{...identities,players:{byIdentifier:new Map(),byIdentityId:new Map()}});
assert(!literal.players.some(m=>m.key==='f7_net_p11'),'no unconfirmed cross-server identity match');
const duplicate=[...comparison.players,member('f8_net_p1',90)];
const ambiguous=buildLocalGuildRanking(current,comparison.members,'main','base',identities,{players:duplicate,rosterComplete:true});
assert.equal(ambiguous[0].rankStatus,'new');assert.equal(ambiguous[0].valueDelta,null,'ambiguous history cannot provide attribute value');
const incompleteValue={...member('f8_net_p1',80),playerStats:readLocalGuildPlayerStats({class:1,values:{'Base Constitution':40}})};
const missing=buildLocalGuildRanking([current[0]],[incompleteValue],'main','base',identities,{players:[incompleteValue],rosterComplete:true})[0];
assert.equal(missing.rankStatus,'unavailable');assert.equal(missing.valueDelta,null,'missing is not zero');
const invalidKey={...member('name:Same name',1)};
assert.equal(buildLocalGuildRanking([current[0]],[invalidKey],'main','base',identities,{players:[],rosterComplete:true})[0].rankStatus,'unavailable','incomplete identity roster cannot confirm a newcomer');
console.log('PASS separate roster/value histories, six category modes, confirmed alias, same names/different servers, newcomer with/without values, zero, ambiguity and incomplete evidence');

// W105: whole-roster HUDs share the badges' identity-only archive assignment.
import { dashboardArchivePlayer, indexDashboardArchivePlayers, prepareDashboardHudMembers, dashboardRankingCounts, dashboardBuildingCount, dashboardBuildingMax, dashboardArchiveMetric } from '../../src/pages/GuildHub/localGuildRanking.ts';
import type { MonthlyRankingPayload, RankingPlayer } from '../../src/lib/scanArchive/monthlyRanking.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const buildingMember = (key: string, mine: number | null, treasury: number | null) => ({...member(key,1),playerStats:{...member(key,1).playerStats,mine,treasury}});
const rankPlayer = (id: string, server: number | null, serverClass: number | null, classKey=1) => ({identifier:id,classKey,statuses:{level:'available'},ranks:{level:{server,serverClass,global:1,globalClass:1}}}) as unknown as RankingPlayer;
const rankRows = [rankPlayer('f8_net_p1',100,101),rankPlayer('f8_net_p2',500,100),rankPlayer('f8_net_p3',1000,501,2),rankPlayer('f8_net_p4',1001,1000,2),rankPlayer('f8_net_p5',100,100,2)];
const payload = {players:rankRows} as MonthlyRankingPayload;
const index = indexDashboardArchivePlayers(payload,identities);
const all = [...current,member('f7_net_p11',250),member('F8_p2',150),member('F8_p1',250),member('F7_p11',250)];
const prepared = prepareDashboardHudMembers(all,identities,index);
assert.equal(prepared.groups.length,5,'confirmed identity and server aliases deduplicated');
assert.equal(dashboardArchivePlayer('f7_net_p11',index),rankRows[0]);
assert.equal(dashboardArchivePlayer('name:Same name',index),null);
for(const [limit,server,serverClass] of [[100,2,2],[500,3,3],[1000,4,5]]) {
 const counts=dashboardRankingCounts(prepared,'avg-level',limit,5);
 assert.deepEqual([counts.server.hits,counts.serverClass.hits],[server,serverClass]);
 assert(!counts.server.partial&&!counts.serverClass.partial);
}
const tied = prepareDashboardHudMembers([current[0],current[4]],null,index);
assert.equal(dashboardRankingCounts(tied,'avg-level',100,2).server.hits,2,'competition ties not sliced');
assert.equal(dashboardRankingCounts(prepared,'avg-level',1,5).server.hits,0,'complete real zero');
const partial=prepareDashboardHudMembers([...all,member('f8_net_p99',3)],identities,index);
assert.equal(dashboardRankingCounts(partial,'avg-level',100,6).server.hits,2);
assert(dashboardRankingCounts(partial,'avg-level',100,6).server.partial);
assert(dashboardRankingCounts(prepared,'avg-level',100,null).server.partial);
const hudMissing=prepareDashboardHudMembers([member('f8_net_p99',3)],null,index);
assert.equal(dashboardRankingCounts(hudMissing,'avg-level',100,1).server.hits,null);
const missingClassIndex=indexDashboardArchivePlayers({players:[rankPlayer('f8_net_p1',101,null)]} as MonthlyRankingPayload,null);
const missingClass=dashboardRankingCounts(prepareDashboardHudMembers([current[0]],null,missingClassIndex),'avg-level',100,1);
assert.equal(missingClass.server.hits,0);assert.equal(missingClass.serverClass.hits,null);
const hudAmbiguous=indexDashboardArchivePlayers({players:[...rankRows,rankPlayer('f8_net_p1',1,1)]} as MonthlyRankingPayload,null);
assert.equal(dashboardArchivePlayer('f8_net_p1',hudAmbiguous),null);
const emptyIndex=indexDashboardArchivePlayers(null,null);
assert.equal(dashboardRankingCounts(prepareDashboardHudMembers(current,null,emptyIndex),'avg-level',100,5).server.hits,null);
assert.equal(dashboardBuildingMax('mine'),100);assert.equal(dashboardBuildingMax('treasury'),45);
const buildings=prepareDashboardHudMembers([buildingMember('f8_net_p1',100,44),buildingMember('f7_net_p11',100,44),buildingMember('f8_net_p2',99,45),buildingMember('f8_net_p3',null,45),buildingMember('f8_net_p4',100,46),buildingMember('f8_net_p5',0,0)],identities,emptyIndex);
assert.deepEqual(dashboardBuildingCount(buildings,'mine',5),{hits:2,known:4,total:5,partial:true,max:100});
assert.deepEqual(dashboardBuildingCount(buildings,'treasury',5),{hits:2,known:4,total:5,partial:true,max:45});
assert.equal(dashboardBuildingCount(buildings,'mine',null).total,null);
assert.equal(dashboardBuildingCount(prepareDashboardHudMembers([buildingMember('f8_net_p1',99,44)],null,emptyIndex),'mine',1).hits,0,'highest observed is not building maximum');
assert.equal(dashboardBuildingCount(prepareDashboardHudMembers([buildingMember('f8_net_p1',null,null)],null,emptyIndex),'mine',1).hits,null);
const conflicting=prepareDashboardHudMembers([buildingMember('f8_net_p1',100,45),buildingMember('f7_net_p11',99,45)],identities,emptyIndex);
assert.equal(dashboardBuildingCount(conflicting,'mine',1).hits,null,'conflicting confirmed aliases are unknown');
assert.equal(dashboardBuildingCount(conflicting,'treasury',1).hits,1);
const noIdentity=prepareDashboardHudMembers([buildingMember('name:Same name',100,45)],null,emptyIndex);
assert.equal(dashboardBuildingCount(noIdentity,'mine',1).hits,null,'no name-only identity');
// W110: global fields have independent coverage; never fall back to server ranks.
const globalRows = rankRows.map((row, i) => ({ ...row, ranks: { level: { ...row.ranks.level,
 global: [100, 500, 1000, 1001, 100][i], globalClass: [101, 100, 501, 1000, 100][i],
} } })) as RankingPlayer[];
const globalMembers = (rows: RankingPlayer[]) => prepareDashboardHudMembers(all, identities, indexDashboardArchivePlayers({ players: rows } as MonthlyRankingPayload, identities));
for (const [limit, global, globalClass] of [[100, 2, 2], [500, 3, 3], [1000, 4, 5]]) {
 const counts = dashboardRankingCounts(globalMembers(globalRows), 'avg-level', limit, 5);
 assert.deepEqual([counts.global.hits, counts.globalClass.hits], [global, globalClass]);
 assert.equal(counts.global.known, 5, 'aliases count once');
 assert(!counts.global.partial && !counts.globalClass.partial);
}
const withoutGlobal = globalRows.map(row => ({...row, ranks:{level:{...row.ranks.level, global:null, globalClass:null}}})) as RankingPlayer[];
const unavailableGlobal = dashboardRankingCounts(globalMembers(withoutGlobal), 'avg-level', 100, 5);
assert.equal(unavailableGlobal.global.hits, null); assert.equal(unavailableGlobal.globalClass.hits, null);
assert.equal(unavailableGlobal.global.known, 0); assert(unavailableGlobal.global.partial);
assert.equal(unavailableGlobal.server.hits, 2, 'available server ranks remain independent');
const partlyGlobal = [...withoutGlobal]; partlyGlobal[0] = globalRows[0];
const partialGlobal = dashboardRankingCounts(globalMembers(partlyGlobal), 'avg-level', 100, 5);
assert.deepEqual(partialGlobal.global, {hits:1,known:1,total:5,partial:true});
assert.deepEqual(partialGlobal.globalClass, {hits:0,known:1,total:5,partial:true});
const invalidGlobal = [0, -1, 0.5, Number.NaN, null].map((global, i) => ({...globalRows[i], ranks:{level:{...globalRows[i].ranks.level, global}}})) as RankingPlayer[];
assert.equal(dashboardRankingCounts(globalMembers(invalidGlobal), 'avg-level', 100, 5).global.hits, null);
const statusMissing = globalRows.map(row => ({...row,statuses:{level:'unavailable'}})) as unknown as RankingPlayer[];
assert.equal(dashboardRankingCounts(globalMembers(statusMissing), 'avg-level', 100, 5).global.hits, null);
assert(dashboardRankingCounts(globalMembers(globalRows), 'avg-level', 100, null).global.partial);
const archiveChecks=[];
for (const server of ['stumblesteppe_net','f28_net']) {
 const filename=siblingInput(`scan archiv/scan-archive-2026/2026-09/${server}/monthly.ranking.json.gz`);
 const data=JSON.parse(gunzipSync(readFileSync(filename)).toString()) as MonthlyRankingPayload;
 const guild=data.guilds.find(g=>g.guildIdentifier===`${server}_g${server==='f28_net'?'9108':'66309'}`)!;
 assert(guild);
 const roster=guild.memberPlayerIdentifiers.map(key=>member(key,1));
 const prepared=prepareDashboardHudMembers(roster,null,indexDashboardArchivePlayers(data,null));
 for (const category of ['avg-level','avg-base','avg-base-main','avg-base-con','avg-total','avg-total-main','avg-total-con']) for(const limit of [100,500,1000]) {
  const metric=dashboardArchiveMetric(category)!;
  const counts=dashboardRankingCounts(prepared,category,limit,guild.memberCount);
  for(const scope of ['server','serverClass','global','globalClass'] as const) {
   const ranks=roster.map(m=>data.players.find(p=>p.identifier===m.key)).filter(p=>p?.statuses[metric]==='available').map(p=>p!.ranks[metric][scope]).filter((r):r is number=>r!=null&&Number.isInteger(r)&&r>0);
   const hits=ranks.filter(r=>r<=limit).length;
   assert.equal(counts[scope].hits,ranks.length?hits:null);
   assert.equal(counts[scope].known,ranks.length);
   archiveChecks.push({filename,month:data.month,category,metric,limit,scope,...counts[scope]});
  }
 }
}
mkdirSync(artifactPath('tmp/w110'),{recursive:true});
writeFileSync(artifactPath('tmp/w110/archive-count-checks.json'),JSON.stringify(archiveChecks,null,2));
console.log('PASS W105 limits including exact 100/500/1000, own class, ties, whole roster, aliases/deduplication, unavailable vs partial vs zero, separate building maxima/coverage and 168 real archive scope counts, W110 independent global coverage/invalid/missing ranks');
