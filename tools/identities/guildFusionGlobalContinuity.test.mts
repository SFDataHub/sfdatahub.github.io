import assert from 'node:assert/strict';
import {resolveServer} from '../../src/lib/servers/serverResolver.ts';
import {resolveGuildFusions,type GuildFusionObservation,type GuildFusionResolverInput} from '../../src/lib/identities/guildFusionResolver.ts';
// Two independent continuations plus a leadership migration. F27 is registered;
// neither names nor references reproduce the personal case.
const ids=(s:string,n:number)=>Array.from({length:n},(_,i)=>`${s}_p${i+1}`);
const guild=(id:string,name:string,members:string[],time:number,leader?:string,coa:string|null=null):GuildFusionObservation=>({guildIdentifier:id,serverCode:resolveServer(id.slice(0,id.lastIndexOf('_g')))?.code??null,timestamp:time,name,memberIdentifiers:members,memberCount:50,leaderIdentifier:leader,coa});
const a=ids('w57_net',30),b=ids('w58_net',40),x=ids('f27',30),y=ids('f27',34).map((_,i)=>`f27_p${101+i}`);
const input:GuildFusionResolverInput={scope:{targetServerCode:'F27',historicalServerCodes:['W57','W58','W59','W60']},historicalGuildObservations:[guild('w57_net_g801','Copper Finch',a,1,a[0],'abc'),guild('w58_net_g802','Silver Birch',b,1,b[34])],newGuildObservations:[guild('f27_g901','Copper Finch',[...x,...y.slice(28)],2,y[28],'abc'),guild('f27_g902','Silver Birch',y.slice(0,28),2,y[0])],highConfidencePlayerMatches:[...a.map((oldIdentifier,i)=>({oldIdentifier,newIdentifier:x[i],oldName:null,newName:null})),...b.slice(0,34).map((oldIdentifier,i)=>({oldIdentifier:b[i<28?i:i+6],newIdentifier:y[i],oldName:null,newName:null}))]};
const semantic=(i:GuildFusionResolverInput)=>resolveGuildFusions(i).results.map(r=>({id:r.newGuild.guildIdentifier,status:r.status,ready:r.identityCandidates.filter(c=>c.autoEligible).map(c=>c.oldGuildIdentifier),migration:r.memberMigrationEdges.map(e=>({old:e.oldGuildIdentifier,count:e.matchedMemberCount,members:e.matchedMembers.map(m=>m.oldIdentifier).sort()})),split:r.splitCandidate,convergence:r.convergenceCandidate}));
const result=semantic(input);
assert.deepEqual(result.map(r=>r.status),['autoEligible','autoEligible']);
assert.deepEqual(result[0].ready,['w57_net_g801']);assert.deepEqual(result[1].ready,['w58_net_g802']);
assert.equal(result[0].migration[0]?.count,6);
for(let mask=0;mask<8;mask++)assert.deepEqual(semantic({...input,historicalGuildObservations:mask&1?[...input.historicalGuildObservations].reverse():input.historicalGuildObservations,newGuildObservations:mask&2?[...input.newGuildObservations].reverse():input.newGuildObservations,highConfidencePlayerMatches:mask&4?[...input.highConfidencePlayerMatches].reverse():input.highConfidencePlayerMatches}),result);
// Leader alone is contextual support; no guild identity can be inferred from a
// solitary person moving, even if that person becomes leader at the destination.
const solitary=resolveGuildFusions({historicalGuildObservations:[guild('w57_net_g5','Before',[a[0]],1,a[0])],newGuildObservations:[guild('f27_g5','After',[x[0]],2,x[0])],highConfidencePlayerMatches:[input.highConfidencePlayerMatches[0]]}).results[0];
assert.notEqual(solitary.status,'autoEligible');
// Renamed guild, independent mutual flow and leader support remain eligible.
const renamed=resolveGuildFusions({...input,historicalGuildObservations:[input.historicalGuildObservations[0]],newGuildObservations:[{...input.newGuildObservations[0],name:'Golden Finch',leaderIdentifier:x[0],coa:null}],highConfidencePlayerMatches:input.highConfidencePlayerMatches.slice(0,30)}).results[0];
assert.equal(renamed.status,'autoEligible');
console.log('guildFusionGlobalContinuity: two continuations, leadership migration, leader support, eight permutations passed');
// A coat/leader minor migration still classified strong must be compared on
// independent continuity evidence before claims are counted globally.
const sharedCoat={...input,historicalGuildObservations:input.historicalGuildObservations.map(g=>({...g,coa:'abc'})),newGuildObservations:input.newGuildObservations.map(g=>({...g,coa:'abc'}))};
assert.deepEqual(semantic(sharedCoat).map(r=>({ready:r.ready,migration:r.migration})),result.map(r=>({ready:r.ready,migration:r.migration})));
// A losing outgoing claim cannot become Ready while its proposed owner remains
// in a genuine convergence with another equally anchored origin.
const third=ids('w59_net',30),thirdNew=ids('f27',30).map((_,i)=>`f27_p${201+i}`);
const unresolvedOwner={...sharedCoat,historicalGuildObservations:[...sharedCoat.historicalGuildObservations,guild('w59_net_g803','Copper Finch',third,1,undefined,'abc')],newGuildObservations:sharedCoat.newGuildObservations.map((g,i)=>i===0?{...g,memberIdentifiers:[...g.memberIdentifiers,...thirdNew]}:g),highConfidencePlayerMatches:[...sharedCoat.highConfidencePlayerMatches,...third.map((oldIdentifier,i)=>({oldIdentifier,newIdentifier:thirdNew[i],oldName:null,newName:null}))]};
const ambiguous=resolveGuildFusions(unresolvedOwner).results;
assert.notEqual(ambiguous[0].status,'autoEligible');
assert.equal(ambiguous[1].identityCandidates.find(c=>c.autoEligible)?.oldGuildIdentifier,'w58_net_g802');
// Two independently matching successor names/coats remain a true split, even
// with different flow sizes. No rule simply chooses the largest group.
const split=resolveGuildFusions({...input,historicalGuildObservations:[input.historicalGuildObservations[1]],newGuildObservations:input.newGuildObservations.map(g=>({...g,name:'Silver Birch',coa:null}))}).results;
assert(split.every(r=>r.status==='split'));
console.log('global comparison: shared coat, unresolved convergence owner, true unequal split protected');

// The same global interaction at a later registered boundary, after the origin
// servers F6/F12 were themselves formed by earlier fusions.
{
  const {listFusionIdentityAnalysisScopes}=await import('../../src/lib/identities/fusionIdentityScopes.ts');
  const scope=listFusionIdentityAnalysisScopes().find(s=>s.targetServerCode==='STUMBLESTEPPE')!;
  assert(scope.lineageServerCodes.length>scope.directOriginServerCodes.length);
  const staged=JSON.parse(JSON.stringify(input).replaceAll('w57_net','f6_net').replaceAll('w58_net','f12_net').replaceAll('f27','stumblesteppe')) as GuildFusionResolverInput;
  staged.scope={targetServerCode:scope.targetServerCode,historicalServerCodes:scope.lineageServerCodes};
  staged.historicalGuildObservations.forEach(g=>g.serverCode=resolveServer(g.guildIdentifier.split('_g')[0])?.code??null);
  staged.newGuildObservations.forEach(g=>g.serverCode=scope.targetServerCode);
  const later=semantic(staged);
  assert(later.every(r=>r.status==='autoEligible'));
  assert.equal(later[0].migration[0]?.count,6);
}
console.log('registered multistage boundary: F6/F12 -> STUMBLESTEPPE passed');

{
  const absent={...input,historicalGuildObservations:input.historicalGuildObservations.map(g=>({...g,leaderIdentifier:null,officerIdentifiers:[]})),newGuildObservations:input.newGuildObservations.map(g=>({...g,leaderIdentifier:null,officerIdentifiers:[]}))};
  assert.deepEqual(semantic(absent),result);
  assert(resolveGuildFusions(absent).results.every(r=>r.identityCandidates.filter(c=>c.autoEligible).every(c=>c.leadership.sameLogicalLeader===null)));
  const collision=resolveGuildFusions({historicalGuildObservations:[guild('w57_net_g5','Coincidence',[],1,undefined,'abc')],newGuildObservations:[guild('f27_g5','Coincidence',[],2,undefined,'abc')],highConfidencePlayerMatches:[]}).results[0];
  assert.notEqual(collision.status,'autoEligible');
  assert.equal(collision.identityCandidates[0]?.classification,'plausible');
}
console.log('missing leadership, partial observed rosters and unsupported name/coat collision protected');

// The proposed owner of B can itself be in genuine convergence. An outgoing
// minor B claim then has no Ready reservation, but must still never become an
// automatic second assignment or block A by recycling its derived conflict.
{
  const c=ids('w59_net',28),z=ids('f27',28).map((_,i)=>`f27_p${301+i}`);
  const contested={...sharedCoat,historicalGuildObservations:[...sharedCoat.historicalGuildObservations,guild('w59_net_g804','Silver Birch',c,1,undefined,'abc')],newGuildObservations:sharedCoat.newGuildObservations.map((g,i)=>i===1?{...g,memberIdentifiers:[...g.memberIdentifiers,...z]}:g),highConfidencePlayerMatches:[...sharedCoat.highConfidencePlayerMatches,...c.map((oldIdentifier,i)=>({oldIdentifier,newIdentifier:z[i],oldName:null,newName:null}))]};
  const r=resolveGuildFusions(contested).results;
  assert.equal(r.find(g=>g.newGuild.guildIdentifier==='f27_g901')?.status,'autoEligible');
  assert.equal(r.find(g=>g.newGuild.guildIdentifier==='f27_g902')?.status,'convergence');
  const minor=r.find(g=>g.newGuild.guildIdentifier==='f27_g901')?.candidates.find(c=>c.oldGuildIdentifier==='w58_net_g802');
  assert.equal(minor?.reservedByReadyAssignment,false);assert.equal(minor?.assignmentConflict,true);assert.equal(minor?.autoEligible,false);assert.equal(minor?.relevantCompetitor,false);
}
console.log('unresolved owner: losing claim cannot auto-assign or recycle a derived conflict');
