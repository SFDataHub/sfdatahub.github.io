import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createPlayerIdentityStore } from '../../src/lib/identities/playerIdentityStore.ts';
import { createGuildIdentityStore } from '../../src/lib/identities/guildIdentityStore.ts';
import { buildFusionIdentityManagementReportFromSnapshots, confirmFusionIdentityLink, mergeReadyFusionIdentityItems, listGuildFusionIdentityMergeItems, type FusionIdentityManagementReport } from '../../src/lib/identities/fusionIdentityManagement.ts';
import { listFusionIdentityAnalysisScopes } from '../../src/lib/identities/fusionIdentityScopes.ts';
import { buildPlayerIdentityResolutionIndex, buildGuildIdentityResolutionIndex, resolvePlayerIdentity, resolveGuildIdentity, collectPlayerIdentityObservations } from '../../src/lib/identities/identityResolution.ts';

const suffix=crypto.randomUUID(),player=createPlayerIdentityStore({dbName:'normal-merge-'+suffix}),guild=createGuildIdentityStore({dbName:'normal-guild-'+suffix});
const item=(id:string,type:'player'|'guild'='player')=>({id,entityType:type,status:'ready',currentIdentifier:'current-'+id,readyCandidateIdentifier:'old-'+id,completedAliases:[],historicalIdentifiers:[],candidates:[],observations:[],firstSeen:0,lastSeen:0,memberMigrationEdges:[],reasons:[],reasonCodes:[],diagnostics:null,completedEntityId:null});
const report={items:[item('a'),item('b'),item('g','guild')]} as unknown as FusionIdentityManagementReport;
const result=await mergeReadyFusionIdentityItems(report,{playerStore:player,guildStore:guild});
assert.equal(result.players,2);assert.equal(result.guilds,1);assert.equal(result.failedPlayers,0);assert.equal(result.skipped,0);
for(const row of result.entries){assert.equal(row.commit?.status,'stored');assert.equal(row.commit?.journal.length,1);assert.equal(row.commit?.revisionAfter,(row.commit?.revisionBefore??0)+1)}
console.log('checkpoint 0');
const previousPlayer=await player.readChanges(),previousGuild=await guild.readChanges();
const retry=await mergeReadyFusionIdentityItems(report,{playerStore:player,guildStore:guild});assert.equal(retry.players,0);assert.equal(retry.guilds,0);assert.equal(retry.skipped,3);assert(retry.entries.every(row=>row.commit?.verification==='journal'));assert.deepEqual(await player.readChanges(),previousPlayer);assert.deepEqual(await guild.readChanges(),previousGuild);

console.log('checkpoint 1');
const lies={...player,async linkPlayerIdentifiers(){return {entity:{entityId:'fiction'},aliases:[]} as never}};
const missing=await mergeReadyFusionIdentityItems({items:[item('no-write')]} as never,{playerStore:lies});assert.equal(missing.players,0);assert.equal(missing.failedPlayers,1);assert.match(missing.errors[0].message,/verification-failed/);
console.log('checkpoint 2');
const unproved=await mergeReadyFusionIdentityItems({items:[item('no-journal')]} as never,{playerStore:{...player,async readChanges(){return []}}});assert.equal(unproved.players,0);assert.equal(unproved.failedPlayers,1);assert.match(unproved.errors[0].message,/journal-verification-failed/);
// A commit whose receipt was unreadable is recovered through ordinary reread,
// without a second write. No inference from an optimistic UI Promise.
console.log('checkpoint 3');
const resumed=await mergeReadyFusionIdentityItems({items:[item('no-journal')]} as never,{playerStore:player});assert.equal(resumed.skipped,1);

console.log('checkpoint 4');
await player.rejectPlayerMatch('current-exclusion','old-exclusion');
const partial=await mergeReadyFusionIdentityItems({items:[item('valid'),item('exclusion'),item('valid2')]} as never,{playerStore:player});assert.equal(partial.players,2);assert.equal(partial.failedPlayers,0);assert.equal(partial.excluded,1);assert.equal(await player.getPlayerIdentity('current-exclusion'),null);assert(await player.isPlayerMatchRejected('current-exclusion','old-exclusion'));
const afterPartial=await player.readChanges();
const repeat=await mergeReadyFusionIdentityItems({items:[item('valid'),item('exclusion'),item('valid2')]} as never,{playerStore:player});assert.equal(repeat.skipped,2);assert.equal(repeat.failedPlayers,0);assert.equal(repeat.excluded,1);assert.deepEqual(await player.readChanges(),afterPartial);

console.log('checkpoint 5');
let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),entry=new Promise<void>(r=>entered=r);
const frozen={items:[item('frozen')]} as unknown as FusionIdentityManagementReport;
const first=mergeReadyFusionIdentityItems(frozen,{playerStore:player,onProgress:async p=>{if(!p.processed){entered();await gate}}});await entry;
frozen.items[0].currentIdentifier='changed';frozen.items[0].readyCandidateIdentifier='changed-old';
await assert.rejects(()=>mergeReadyFusionIdentityItems(frozen,{playerStore:player}),/already-running/);release();const firstDone=await first;assert.equal(firstDone.players,1);assert.equal(firstDone.entries[0].currentIdentifier,'current-frozen');assert.equal(await player.getPlayerIdentity('changed'),null);
console.log('checkpoint 6');
let current=true;
const interrupted=await mergeReadyFusionIdentityItems({items:[item('interrupt-a'),item('interrupt-b')]} as never,{playerStore:player,isCurrent:()=>current,onProgress:p=>{if(p.processed)current=false}});
// Progress can be batched; force interruption at the first durable commit.
const interruptStore={...player,async linkPlayerIdentifiers(a:string,b:string,m:any){const out=await player.linkPlayerIdentifiers(a,b,m);current=false;return out}};current=true;
const stopped=await mergeReadyFusionIdentityItems({items:[item('stop-a'),item('stop-b')]} as never,{playerStore:interruptStore,isCurrent:()=>current});assert.equal(stopped.players,1);assert.equal(stopped.failedPlayers,1);assert.equal(stopped.errors[0].message,'comparison-context-changed');
current=true;const continued=await mergeReadyFusionIdentityItems({items:[item('stop-a'),item('stop-b')]} as never,{playerStore:player,isCurrent:()=>current});assert.equal(continued.skipped,1);assert.equal(continued.players,1);

// Namespace spelling belongs to the shared resolver; references and source
// records remain exact. Separate servers with the same number never collapse.
console.log('checkpoint 7');
await player.linkPlayerIdentifiers('s12_eu_p771','f27_net_p881',{source:'manual'});
await guild.linkGuildAliases('eu12_g72','f27_g82',{source:'manual'});
let snapshot={players:buildPlayerIdentityResolutionIndex(await player.listPlayerEntities()),guilds:buildGuildIdentityResolutionIndex(await guild.listGuildEntities())};
assert.equal(resolvePlayerIdentity(snapshot,'EU12_p771').identityId,resolvePlayerIdentity(snapshot,'f27_p881').identityId);
assert.equal(resolvePlayerIdentity(snapshot,'s11_eu_p771').resolved,false);
assert.equal(resolveGuildIdentity(snapshot,'s12_eu_g72').identityId,resolveGuildIdentity(snapshot,'f27_net_g82').identityId);
const observation={memberRef:'EU12_p771',snapshotTimestamp:123,sourceScanId:'exact-source',id:'exact-key'};
assert.equal(collectPlayerIdentityObservations(snapshot,'f27_p881',[observation]).observations[0].observation,observation);
await player.linkPlayerIdentifiers('eu12_p771','unrelated',{source:'manual'});snapshot={...snapshot,players:buildPlayerIdentityResolutionIndex(await player.listPlayerEntities())};assert.equal(resolvePlayerIdentity(snapshot,'s12_eu_p771').status,'conflict');assert.equal(resolvePlayerIdentity(snapshot,'EU12_p771').resolved,false);

// Different registered fusion, different identifiers and guilds. Both a former
// member now elsewhere and a member no longer in the latest roster stay inside
// the exact guild selection. No production registry fixture is inserted.
console.log('checkpoint 8');
const scope=listFusionIdentityAnalysisScopes().find(s=>s.targetServerCode==='F27')!;assert(scope);
const origin=scope.directOriginServerCodes[0].toLowerCase(),target=scope.targetServerCode.toLowerCase();
const oldTime=Date.parse(scope.effectiveDate!)-86400000,newTime=Date.parse(scope.effectiveDate!)+86400000;
function scan(id:string,server:string,time:number,members:any[],groups:any[]){return {id,sourceScanId:id,timestampMs:time,timestamp:new Date(time).toISOString(),servers:[server],sourceScanFilename:id+'.json',sourceImportedAt:new Date(time).toISOString(),players:members.map(m=>({identifier:m.memberRef})),normalizedMembers:members,groups,rawData:{players:[],groups},playerCount:members.length,groupCount:groups.length,guildCount:groups.length} as any}
const member=(ref:string,name:string,server:string,segment:string,level:number)=>({memberRef:ref,name,server,guildSegment:segment,groupSegment:segment,guildName:segment==='g71'?'Aurora':'Elsewhere',classId:'1',level,baseStats:null,totalStats:null,guildRole:'member'});
const older=scan('alternate-old',origin,oldTime,[member(origin+'_p710','Aster',origin,'g71',100),member(origin+'_p711','Beryl',origin,'g71',100)], [{identifier:origin+'_g71',server:origin,name:'Aurora',memberCount:2,coaString:'01234567890123456789ab'}]);
const newer=scan('alternate-new',target,newTime,[member(target+'_p810','Aster',target,'g81',101),member(target+'_p811','Beryl',target,'g82',101)],[{identifier:target+'_g81',server:target,name:'Aurora',memberCount:1,coaString:'01234567890123456789ab'},{identifier:target+'_g82',server:target,name:'Elsewhere',memberCount:1,coaString:'1111111111111111111111'}]);
const p2=createPlayerIdentityStore({dbName:'alternate-player-'+suffix}),g2=createGuildIdentityStore({dbName:'alternate-guild-'+suffix});
await g2.linkGuildAliases(target+'_g81',origin+'_g71',{source:'manual'});
console.log('checkpoint 9');
const alternate=await buildFusionIdentityManagementReportFromSnapshots({snapshots:[older,newer],playerStore:p2,guildStore:g2},{scope});
const aurora=alternate.items.find(i=>i.entityType==='guild'&&i.currentIdentifier.endsWith('_g81'))!;assert(aurora);
const selected=listGuildFusionIdentityMergeItems(alternate,aurora);assert(selected.some(i=>i.currentIdentifier.endsWith('_p811')),'historical member outside current roster included');
const altSaved=await mergeReadyFusionIdentityItems({...alternate,items:selected},{playerStore:p2,guildStore:g2});assert.equal(altSaved.players,selected.length);assert.equal(altSaved.errors.length,0);assert(selected.length>0);
console.log('normalFusionMerge passed: real commits, durable readback, retries, exclusions, no-write/no-journal rejection, double start, frozen selection, interruption/resume, shared spellings/conflict, alternative registered fusion with historical member');
const { isLocalDataChangeRelevant } = await import('../../src/lib/local-data/localDataChanges.ts');
assert(isLocalDataChangeRelevant({owner:'player-identities',kinds:['identity'],sourceIds:[],removedSourceIds:[],servers:[],unknownImpact:false,committedAt:new Date().toISOString(),originalAliases:['s12_eu_p771']},{playerAliases:['EU12_p771']}));
assert(!isLocalDataChangeRelevant({owner:'player-identities',kinds:['identity'],sourceIds:[],removedSourceIds:[],servers:[],unknownImpact:false,committedAt:new Date().toISOString(),originalAliases:['s12_eu_p771']},{playerAliases:['s11_eu_p771']}));
// A spelling already stored in one group is used through the normal atomic link
// contract. No source/reference rewrite and no second identity is fabricated.
await assert.rejects(()=>confirmFusionIdentityLink('player','f27_net_p881','s12_eu_p771',{playerStore:player}),/observation-reference-conflict/);
await player.linkPlayerIdentifiers('s14_eu_p901','f26_net_p902',{source:'manual'});
const canonical=await confirmFusionIdentityLink('player','f26_p902','EU14_p901',{playerStore:player});
assert.equal(canonical.commit.status,'skipped');

const {resolveFavorite}=await import('../../src/lib/data-hub/hubFavoritesProjection.ts');
const {favoriteReference}=await import('../../src/lib/data-hub/hubFavoritesContract.ts');
const conflictingReference=favoriteReference('player','s12_eu_p771')!;
assert.equal(resolveFavorite({kind:'player',reference:conflictingReference,originalReferences:[conflictingReference],referenceIssue:null} as never,snapshot).identity,'conflict','shared namespace conflicts stay visible in favorites');
// Two promoted claims in a malformed/stale selection cannot append two current
// persons to one historical entity, even if both initially have no store entry.
const collisionReport={items:[{...item('collision-a'),readyCandidateIdentifier:'s14_eu_p990'},{...item('collision-b'),readyCandidateIdentifier:'EU14_p990'}]} as never;
const collisionResult=await mergeReadyFusionIdentityItems(collisionReport,{playerStore:player});assert.equal(collisionResult.players,0);assert.equal(collisionResult.failedPlayers,0);assert.equal(collisionResult.unresolved,2);assert(collisionResult.errors.every(e=>e.message==='assignment-conflict'));

const chainScope=listFusionIdentityAnalysisScopes().find(s=>s.targetServerCode==='BLACKFOREST')!;assert(chainScope);
const chainPlayer=createPlayerIdentityStore({dbName:'chain-player-'+suffix}),chainGuild=createGuildIdentityStore({dbName:'chain-guild-'+suffix});
const chainMembers=(server:string,base:number,segment:string,level:number)=>Array.from({length:5},(_,index)=>member(`${server}_p${base+index}`,`Aster${index}${server==='s7_pl'?'':' (s7_pl)'}`,server,segment,level));
const chainGroup=(server:string,segment:string)=>[{identifier:`${server}_${segment}`,server,name:'Northlight',memberCount:5,coaString:'01234567890123456789ab'}];
const chainSnapshots=[scan('chain-origin','s7_pl',Date.parse('2023-12-07T12:00:00Z'),chainMembers('s7_pl',610,'g61',500),chainGroup('s7_pl','g61')),scan('chain-intermediate','f7_net',Date.parse('2026-04-01T12:00:00Z'),chainMembers('f7_net',710,'g71',501),chainGroup('f7_net','g71')),scan('chain-current','blackforest_net',Date.parse('2026-06-01T12:00:00Z'),chainMembers('blackforest_net',810,'g81',502),chainGroup('blackforest_net','g81'))];
for(let i=0;i<5;i++)await chainPlayer.linkPlayerIdentifiers('blackforest_net_p'+(810+i),'f7_net_p'+(710+i),{source:'manual'});
await chainGuild.linkGuildAliases('blackforest_g81','f7_g71',{source:'manual'});
const chainBefore=await buildFusionIdentityManagementReportFromSnapshots({snapshots:chainSnapshots,playerStore:chainPlayer,guildStore:chainGuild},{scope:chainScope});
const pendingChain=chainBefore.items.filter(i=>i.entityType==='player'&&i.status==='ready'&&i.readyCandidateIdentifier?.startsWith('s7_pl_'));
assert.equal(pendingChain.length,5,JSON.stringify(chainBefore.items.map(i=>({id:i.currentIdentifier,status:i.status,ready:i.readyCandidateIdentifier,candidates:i.candidates.map(c=>({id:c.historicalIdentifier,ready:c.ready,rejected:c.rejected,assigned:c.assignedToOtherIdentity,classification:c.evidence.classification}))}))));
const chainSaved=await mergeReadyFusionIdentityItems(chainBefore,{playerStore:chainPlayer,guildStore:chainGuild});assert.equal(chainSaved.players,5);assert.equal(chainSaved.failedPlayers,0);
for(let i=0;i<5;i++)assert.equal((await chainPlayer.getPlayerIdentity('s7_pl_p'+(610+i)))?.entityId,(await chainPlayer.getPlayerIdentity('blackforest_net_p'+(810+i)))?.entityId);
console.log('normalFusionMerge multistage passed: PL7 -> F7 -> Blackforest, existing partial chains, normal remaining commits and canonical collision refusal');
const {resolveServer}=await import('../../src/lib/servers/serverResolver.ts');
const playerSpellings=createPlayerIdentityStore({dbName:'stored-spellings-player-'+suffix}),guildSpellings=createGuildIdentityStore({dbName:'stored-spellings-guild-'+suffix});
const currentSpelling=resolveServer(target)!.aliases.find(value=>value.includes('_'))??target;
const oldSpelling=resolveServer(origin)!.aliases.find(value=>value.includes('_'))??origin;
await playerSpellings.linkPlayerIdentifiers(currentSpelling+'_p810',oldSpelling+'_p710',{source:'manual'});
await guildSpellings.linkGuildAliases(currentSpelling+'_g81',oldSpelling+'_g71',{source:'manual'});
const storedSpellings=await buildFusionIdentityManagementReportFromSnapshots({snapshots:[older,newer],playerStore:playerSpellings,guildStore:guildSpellings},{scope});
assert.equal(storedSpellings.items.find(i=>i.currentIdentifier.endsWith('_p810'))?.status,'completed','normal Matching rereads stored player namespace variants as complete');
assert.equal(storedSpellings.items.find(i=>i.entityType==='guild'&&i.currentIdentifier.endsWith('_g81'))?.status,'completed','normal Matching rereads stored guild namespace variants as complete');

const {favoriteProjectionMatchesReference}=await import('../../src/lib/data-hub/hubFavoritesProjection.ts');
const oldFavoriteReference=favoriteReference('player','s14_eu_p901')!,currentFavoriteReference=favoriteReference('player','f26_net_p902')!;
assert(favoriteProjectionMatchesReference({favorite:{kind:'player',reference:oldFavoriteReference,originalReferences:[oldFavoriteReference],referenceIssue:null},identity:'resolved',identityId:canonical.entity.entityId,aliasIdentifiers:['s14_eu_p901','f26_net_p902'],availability:'available'} as never,'player',currentFavoriteReference),'a held player profile recognizes an unchanged original favorite through its confirmed entity');
assert(!favoriteProjectionMatchesReference({favorite:{kind:'player',reference:oldFavoriteReference,originalReferences:[oldFavoriteReference]},identity:'unresolved',identityId:null,aliasIdentifiers:[],availability:'unknown'} as never,'player',currentFavoriteReference));

// Real store/cache proof of the cross-scope freshness gap seen in the original.
{
  const cache = await import('../../src/lib/identities/fusionAnalysisCache.ts');
  const {captureLocalDataDependencies} = await import('../../src/lib/local-data/localDataDependencies.ts');
  const {listFusionIdentityAnalysisScopes} = await import('../../src/lib/identities/fusionIdentityScopes.ts');
  const scope = listFusionIdentityAnalysisScopes().find(s => s.targetServerCode === 'F27')!;
  assert(scope);
  const dependencies = await captureLocalDataDependencies({allIdentities:true});
  const boundReport = {scope:{},summary:{},items:[],dependencies} as never;
  await cache.writeFusionIdentityAnalysisCache({resolverVersion:cache.CURRENT_FUSION_RESOLVER_VERSION,scope,scanFingerprint:'unchanged-scope-sources',identityRevision:'unchanged-scope-groups',report:boundReport,timings:[]});
  const input={scope,scanFingerprint:'unchanged-scope-sources',identityRevision:'unchanged-scope-groups'};
  assert.equal((await cache.readFusionIdentityAnalysisCache(input)).state,'fresh');
  await confirmFusionIdentityLink('player','f9_net_p99117','s1_cz_p99117',{source:'manual'});
  const afterOtherScope=await cache.readFusionIdentityAnalysisCache(input);
  assert.equal(afterOtherScope.state,'stale'); assert.equal(afterOtherScope.staleReason,'identity-revision');
  assert.equal(afterOtherScope.previousEntry?.identityRevision,input.identityRevision);
}
