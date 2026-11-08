import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDB } from 'idb';
import { seedLocalSourceValidityFixture } from './localSourceValidityFixture.mts';
import { inputs, anchor, start, DAY, player, group, richInputs } from './fixtures/localPlayerAnalyticsCoordinator/inputs.ts';
import { linkPlayerIdentifiers, unlinkPlayerIdentifier } from '../../src/lib/identities/playerIdentityStore.ts';
import { linkGuildAliases } from '../../src/lib/identities/guildIdentityStore.ts';
import { resolveLocalPlayerCurrentSeed } from '../../src/pages/GuildHub/localPlayerCurrentSeed.ts';
import { buildLocalPlayerProfileModel } from '../../src/pages/GuildHub/localPlayerProfileAdapter.ts';
import { buildLocalPlayerAnalytics } from '../../src/components/local-player-profile/localPlayerAnalyticsModel.ts';
import { buildLocalPlayerInsights } from '../../src/components/local-player-profile/localPlayerInsightsModel.ts';
import { createLocalPlayerProfileCoordinator } from '../../src/lib/local-player-profile/coordinator.ts';
import { isLocalProfileEvidenceCurrent } from '../../src/lib/local-player-profile/historyBasis.ts';
import { resetGuildAnalyticsDerivedData } from '../../src/lib/guilds/localGuildAnalyticsStore.ts';
import { updateGuildHubLocalScan, importGuildHubLocalScan, deleteGuildHubLocalScans } from '../../src/lib/guilds/localScanLibrary.ts';
import type { LocalPlayerProfileModel } from '../../src/components/local-player-profile/types.ts';
import type { LocalProfilePart } from '../../src/lib/local-player-profile/contract.ts';
import type { LocalPlayerAnalyticsResult } from '../../src/components/local-player-profile/localPlayerAnalyticsModel.ts';

const normalize = (value: unknown) => {
 const result = JSON.parse(JSON.stringify(value));
 // New technical availability/receipts are asserted separately; every legacy business field remains compared.
 for (const field of ['availability','dependency','dependencies']) delete result[field];
 return result;
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; }
const locks = navigator.locks, originalRequest = locks.request.bind(locks);
function gateNextLock() {
 const entered = deferred(), resume = deferred(); let intercepted = false;
 Object.defineProperty(locks, 'request', { configurable: true, value: async (...args: any[]) => {
   if (!intercepted) { intercepted = true; Object.defineProperty(locks, 'request', { configurable: true, value: originalRequest }); entered.resolve(); await resume.promise; }
   return (originalRequest as any)(...args);
 }});
 return { entered, resume };
}
async function until(check: () => boolean, message: string) {
 const deadline = Date.now()+10000;
 while (!check()) { if(Date.now()>deadline) throw Error(message); await new Promise(r=>setTimeout(r,5)); }
}
for (const input of inputs) await seedLocalSourceValidityFixture({ ...input, filename: input.id + '.json', contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length });
await linkPlayerIdentifiers('f7_net_p1', 'f8_net_p1', { source: 'manual' });
await linkGuildAliases('f7_net_g1', 'f8_net_g1', { source: 'manual' });
async function profile(source: string, ref: string, time = anchor): Promise<LocalPlayerProfileModel> {
 const observation = { sourceScanId: source, sourcePlayerKey: ref, sourceMemberRef: ref, scannedAtMs: time, scannedAtIso: new Date(time).toISOString(), guild: { name: 'Fixture Guild', server: ref.split('_p')[0], identifier: ref.replace(/_p\d+$/, '_g1') } };
 const seed = await resolveLocalPlayerCurrentSeed(observation); assert.ok(seed);
 return buildLocalPlayerProfileModel({ ...observation, rawPlayer: seed.rawPlayer, currentSeed: seed });
}
const coordinator = createLocalPlayerProfileCoordinator();
const a = await profile('w06-current','f8_net_p1');
const first = coordinator.acquire(a), joiner = coordinator.acquire(a);
const gate = gateNextLock();
const analyticsJob = first.request('analytics'), duplicateJob = joiner.request('analytics');
const bestsJob = joiner.request('bests');
await gate.entered.promise;
assert.equal(first.counters.preparation,1);
const current = await first.request('currentInsights'); assert.equal(current.status,'ready'); assert.equal(current.value?.rankings.player,10);
assert.equal(first.counters.currentRawReads,0);
const preparedCurrent=await first.request("current");assert.ok(preparedCurrent.value);assert.equal("currentSeed" in preparedCurrent.value,false,"no mutable Raw/core references in Current display contract");assert.throws(()=>preparedCurrent.value!.hero.metrics.push({label:"x",value:"x"}),TypeError);
assert.equal(first.counters.indexBuilds,0,'Current Insights must finish before held history');
gate.resume.resolve();
const [analytics, duplicate, bests] = await Promise.all([analyticsJob,duplicateJob,bestsJob]);
assert.equal(analytics.status,'ready',analytics.reason); assert.equal(duplicate.value,analytics.value,'joined projections publish same immutable result');
assert.equal(bests.status,'ready',bests.reason);
assert.equal(first.counters.preparation,1); assert.equal(first.counters.indexBuilds,1); assert.equal(first.counters.performanceBuilds,1);
assert.equal(first.counters.sourceBuilds,6,'foreign server source is not prepared');
assert.equal(first.counters.analyticsProjections,1); assert.equal(first.counters.bestsProjections,1);
assert.equal(first.counters.historicalRawReads,10,'6 source loads + 4 matched rank sources');
const hit = await joiner.request('analytics'); assert.equal(hit.value,analytics.value);
const bComparison = await first.request('analytics',start+10*DAY); assert.notEqual(bComparison.value,analytics.value);
const back = await first.request('analytics'); assert.equal(back.value,analytics.value);
assert.equal(first.counters.analyticsProjections,2); assert.equal(first.counters.preparation,1);
console.log('PASS sharing counts',JSON.stringify(first.counters));
const history = await first.request('history'); assert.ok(history.value);
assert.throws(()=>history.value!.analyticsData.members.sort(),TypeError);
assert.throws(()=>history.value!.indexes.membersBySnapshotId.clear(),TypeError);
assert.throws(()=>analytics.value!.xp.series[0].points.push({timestamp:1,label:'x',value:1,detail:'x'}),TypeError);
console.log('PASS immutable arrays, maps and shared projection values');
// W119 retains the complete W05 references, with previously hidden confirmed
// f7_net/f7 guild history now reachable through the shared observation resolver.
// Current/Insights and all unrelated history fields remain compared in full.
const references = JSON.parse(await readFile('tools/guilds/fixtures/localPlayerAnalyticsCoordinator/references.json','utf8'));
for (const reference of references) {
 const target = await profile(reference.source,reference.ref,reference.time);
 const lease = coordinator.acquire(target);
 for (const [index, comparison] of [undefined,start,start+10*DAY,start+30*DAY].entries()) {
   const part = await lease.request('analytics',comparison); assert.ok(part.value,part.reason);
   assert.deepEqual(normalize(part.value),reference.analytics[index],`${reference.ref}/${reference.time}/${comparison}`);
 }
 const [currentPart,bestsPart] = await Promise.all([lease.request('currentInsights'),lease.request('bests')]);
 assert.deepEqual(normalize({status:'ready',...currentPart.value,personalBests:bestsPart.value}),reference.insights);
 lease.release();
}
const confirmedStart = await first.request('analytics', start);
assert.equal(confirmedStart.value!.comparison.selectedTimestamp, start, 'requested confirmed historical anchor remains selected');
assert.equal(confirmedStart.value!.xp.series[0].points[0].rawValue, inputs[0].rawData.players[0].xpTotal, 'real historical zero reaches the chart');
assert.equal(confirmedStart.value!.xp.series[0].points[0].timestamp, start);
assert.equal(confirmedStart.value!.xp.rateSummary.player, (800 - 0) / 65, 'rate uses the actual historical/current values and exact 65-day window');
assert.deepEqual(normalize(await buildLocalPlayerAnalytics(a)),references[0].analytics[0]);
assert.deepEqual(normalize(await buildLocalPlayerInsights(a)),references[0].insights);
console.log('PASS 16 complete Analytics + 4 Insights references, adapters, aliases, ties, historical anchor/later history, missing endpoint, partial roster, zero/negative rules');
for(const input of richInputs) await seedLocalSourceValidityFixture({ ...input, filename:input.id+'.json',contentHash:input.id, importedAt:new Date(anchor).toISOString(),scannedAt:new Date(anchor).toISOString(), servers:[],playerCount:3,groupCount:1 });
const rich = await profile('w06-rich-1','s50_net_p1');
const richRef=JSON.parse(await readFile('tools/guilds/fixtures/localPlayerAnalyticsCoordinator/reference-rich.json','utf8'));
assert.deepEqual(normalize(await buildLocalPlayerAnalytics(rich)),richRef.analytics);
assert.deepEqual(normalize(await buildLocalPlayerInsights(rich)),richRef.insights);
assert.deepEqual(richRef.insights.playerVsAverage[0],{key:'str',label:'Strength',playerValue:0,guildAverage:150,validGuildMembers:2});
console.log('PASS original-builder full-core Current reference: real zero, per-attribute missing and valid-member means');
const emptyTarget={...a,sourceScanId:'missing-source', sourcePlayerKey:'s99_net_p1',analytics:{...a.analytics,server:'s99_net',memberRef:'s99_net_p1',guildIdentifier:'s99_net_g1'}};
const emptyLease=coordinator.acquire(emptyTarget);
assert.equal((await emptyLease.request('analytics')).status,'empty');assert.equal((await emptyLease.request('analytics')).status,'empty');assert.equal(emptyLease.counters.preparation,2);emptyLease.release();
await seedLocalSourceValidityFixture({id:'w06-empty-source',filename:'empty.json',contentHash:'empty',importedAt:new Date(anchor).toISOString(),scannedAt:new Date(anchor).toISOString(),servers:['s60_net'],playerCount:0,groupCount:0,rawData:{players:[],groups:[]}});
const partialLease=coordinator.acquire({...emptyTarget,sourceScanId:'w06-empty-source',analytics:{...emptyTarget.analytics,server:'s60_net',memberRef:'s60_net_p1',guildIdentifier:'s60_net_g1'}});
assert.equal((await partialLease.request('analytics')).status,'partial');assert.equal((await partialLease.request('analytics')).status,'partial');assert.equal(partialLease.counters.preparation,2);partialLease.release();
await deleteGuildHubLocalScans(['w06-empty-source']);
console.log('PASS empty + partial basis repeated same-key demand, no completed veto');
const fallbackRefs=JSON.parse(await readFile('tools/guilds/fixtures/localPlayerAnalyticsCoordinator/reference-fallback.json','utf8'));
for(const ref of fallbackRefs){const fallback=coordinator.acquire({...a,analytics:{...a.analytics,memberRef:ref.memberRef}});assert.deepEqual(normalize((await fallback.request('analytics')).value),ref.analytics);fallback.release();}
console.log('PASS absent/unmatched memberRef: existing namefallback and confirmed alias history');
first.release(); assert.equal(coordinator.activeContextCount(),1,'remaining lease retains results');
joiner.release(); assert.equal(coordinator.activeContextCount(),0,'last lease releases entire context');
const unrelatedPlayer={...player(anchor,99),name:'Unrelated',guildIdentifier:'f8_net_g99',guildName:'Other Guild'};
await seedLocalSourceValidityFixture({id:'w06-unrelated-same-server',filename:'unrelated.json',contentHash:'unrelated',importedAt:new Date(anchor).toISOString(),scannedAt:new Date(anchor).toISOString(),servers:['f8_net'],playerCount:1,groupCount:1,rawData:{players:[unrelatedPlayer],groups:[{...group(anchor,'f8_net',1),identifier:'f8_net_g99',name:'Other Guild'}]}});
const bounded=coordinator.acquire(a);const boundedHistory=await bounded.request('history');assert.ok(boundedHistory.value);
assert.equal(boundedHistory.value.analyticsData.snapshots.some(row=>row.sourceScanId==='w06-unrelated-same-server'),false);
assert.equal(bounded.counters.sourceBuilds,0);assert.equal(bounded.counters.historicalRawReads,0);bounded.release();
console.log('PASS known unrelated same-server source omitted: metadata inventoried, zero Raw/source builds');
// First and joiner abort are symmetric. Hold actual production identity preparation.
for (const abortFirst of [true,false]) {
 const g=gateNextLock(), firstSignal=new AbortController(), joinSignal=new AbortController();
 const x=coordinator.acquire(a,firstSignal.signal), y=coordinator.acquire(a,joinSignal.signal);
 const px=x.request('analytics'),py=y.request('analytics'); await g.entered.promise;
 (abortFirst?firstSignal:joinSignal).abort(); g.resume.resolve();
 const [rx,ry]=await Promise.all([px,py]); assert.equal((abortFirst?rx:ry).status,'cancelled'); assert.equal((abortFirst?ry:rx).status,'ready');
 assert.equal(x.counters.preparation,1); assert.equal(x.counters.indexBuilds,1); x.release();y.release();
 assert.equal(coordinator.activeContextCount(),0);
}
console.log('PASS first and joiner abort preserve the remaining consumer');
const anchorGate=gateNextLock(), earlier=coordinator.acquire(a), later=coordinator.acquire(await profile('w06-current','f8_net_p1',anchor+20*DAY));
const earlierJob=earlier.request('analytics'),laterJob=later.request('analytics');await anchorGate.entered.promise;
assert.equal(earlier.counters.preparation,1,'anchor is a projection dependency, not a duplicate basis');
anchorGate.resume.resolve();const [earlierResult,laterResult]=await Promise.all([earlierJob,laterJob]);
assert.equal(earlierResult.value?.comparison.currentTimestamp,anchor);assert.equal(laterResult.value?.comparison.currentTimestamp,anchor+20*DAY);
assert.equal(earlier.counters.indexBuilds,1);assert.equal(earlier.counters.analyticsProjections,2);assert.equal(later.counters,earlier.counters);
const laterFinished=laterResult.value;earlier.release();assert.equal((await later.request('analytics')).value,laterFinished,'closing earlier anchor retains active later consumer basis');later.release();assert.equal(coordinator.activeContextCount(),0);
console.log('PASS two simultaneous physical anchors share history, separate projections, independent close and final release');

const lastGate=gateNextLock(), last=coordinator.acquire(a), lastJob=last.request('analytics'); await lastGate.entered.promise; last.release();
const replacement=coordinator.acquire(a); const replacementJob=replacement.request('analytics'); lastGate.resume.resolve();
assert.equal((await lastJob).status,'cancelled'); assert.equal((await replacementJob).status,'ready');
assert.equal(replacement.counters.preparation,1); replacement.release(); assert.equal(coordinator.activeContextCount(),0);
console.log('PASS last abort, old finally vs replacement, closed A rebuilt after A → B → A');
const foreign=coordinator.acquire(await profile('w06-foreign','f9_net_p1')); const foreignResult=await foreign.request('analytics'); foreign.release();
const rebuilt=coordinator.acquire(a);const rebuiltResult=await rebuilt.request('analytics'); assert.notEqual(rebuiltResult.value,foreignResult.value);assert.equal(rebuilt.counters.preparation,1);rebuilt.release();
const sameName=coordinator.acquire({...a,sourcePlayerKey:'f8_net_p2',analytics:{...a.analytics,memberRef:'f8_net_p2'}});const sameNameResult=await sameName.request('analytics');assert.equal(sameNameResult.value?.playerName,'Peer');sameName.release();
console.log('PASS same name + same server but different original identifier uses distinct history');
// Actual Raw rank read failure: keep XP best + Current, no completed partial hit.
const retry=coordinator.acquire(a); const originalGet=IDBObjectStore.prototype.get;
IDBObjectStore.prototype.get=function(key) { if(this.name==='scans' && new Error().stack?.includes('readRanksFromMatchedSnapshots')) throw Error('controlled rank failure');return originalGet.call(this,key); };
const partial=await retry.request('bests'); assert.equal(partial.status,'partial'); assert.equal(partial.value?.highestXpPerDay,210);assert.equal(partial.value?.bestServerRank,null);
assert.equal((await retry.request('currentInsights')).status,'ready'); assert.equal((await retry.request('analytics')).status,'ready');
const partialAdapter=await buildLocalPlayerInsights(a);assert.equal(partialAdapter.status,'partial');assert.equal(partialAdapter.rankings.player,10);assert.equal(partialAdapter.personalBests.highestXpPerDay,210);assert.equal(partialAdapter.availability?.bests,'partial');
IDBObjectStore.prototype.get=originalGet;
assert.equal((await retry.request('bests')).value?.bestServerRank,3); assert.equal(retry.counters.bestsProjections,2);
retry.release();console.log('PASS rank failure preserves Current/XP/Analytics and same-key rank retry');
// A failed preparation never blocks the same key.
const failed=coordinator.acquire(a); Object.defineProperty(locks,'request',{configurable:true,value:async()=>{throw Error('controlled identity read failure');}});
const failure=await failed.request('analytics'); assert.equal(failure.status,'error');
Object.defineProperty(locks,'request',{configurable:true,value:originalRequest});assert.equal((await failed.request('analytics')).status,'ready');failed.release();
console.log('PASS preparation failure and identical-key retry');
// Retained actual display subscriptions revalidate relevant changes, not foreign scopes.
const active=coordinator.acquire(a);const seen:LocalProfilePart<LocalPlayerAnalyticsResult>[]=[];
const stop=active.watch('analytics',undefined,part=>seen.push(part));await until(()=>seen.at(-1)?.status==='ready','watch initial');
const original=seen.at(-1)!.value, builds=active.counters.preparation;
await importGuildHubLocalScan('foreign-new.json',JSON.stringify({players:[player(anchor,1,'s30_net')],groups:[group(anchor,'s30_net',1)]}));
await active.revalidate(); assert.equal(active.counters.preparation,builds);assert.equal((await active.request('analytics')).value,original);
const relevant=await importGuildHubLocalScan('new-relevant.json',JSON.stringify({players:[player(anchor+30*DAY),player(anchor+30*DAY,2)],groups:[group(anchor+30*DAY)]}));
await until(()=>seen.at(-1)?.status==='ready' && seen.at(-1)?.value!==original,'new scope source refresh');
assert.ok(active.counters.preparation>builds); assert.equal(seen.at(-1)?.value?.snapshotCount,6);
const identityBefore=seen.at(-1)!.value;const sourceBuildsBeforeIdentity=active.counters.sourceBuilds;await linkPlayerIdentifiers('f8_net_p2','f7_net_p2',{source:'manual'});
await until(()=>seen.at(-1)?.status==='ready' && seen.at(-1)?.value!==identityBefore,'population identity refresh');
assert.equal(active.counters.sourceBuilds,sourceBuildsBeforeIdentity,'peer Identity must not rederive literal source measurements');
const beforeReset=seen.at(-1)!.value;await resetGuildAnalyticsDerivedData();
await until(()=>seen.at(-1)?.status==='ready' && seen.at(-1)?.value!==beforeReset,'reset refresh');
// Miss every live event: durable journal is updated directly in isolated IDB.
const receipt=(await active.request('history')).value!.evidence;
const rawDb=await openDB('sfdatahub-local-data');
await rawDb.add('localChanges',{owner:'sources',kinds:['content'],sourceIds:[relevant.scan.id],removedSourceIds:[],servers:['f8_net'],unknownImpact:false,committedAt:new Date().toISOString()});
assert.equal(await isLocalProfileEvidenceCurrent(receipt),false);
const beforeMiss=seen.at(-1)!.value;await active.revalidate();await until(()=>seen.at(-1)?.status==='ready'&&seen.at(-1)?.value!==beforeMiss,'missed event catches up');
stop();active.release();rawDb.close();
console.log('PASS new source, peer identity, reset, finished-display refresh, foreign scope exclusion and missed-event durable catch-up');
// Mutation during pending build rejects the held generation. No stale publication.
for (const kind of ['source','identity','reset'] as const) {
 const lease=coordinator.acquire(a),g=gateNextLock(),pending=lease.request('analytics');await g.entered.promise;
 if(kind==='source')await updateGuildHubLocalScan('w06-mid','Changed.json',JSON.stringify({players:[player(start+30*DAY),player(start+30*DAY,2)],groups:[group(start+30*DAY)]}));
 if(kind==='identity')await unlinkPlayerIdentifier('f7_net_p1');
 if(kind==='reset')await resetGuildAnalyticsDerivedData();
 // Allow durable subscriber to observe the mutation before releasing held identity resolution.
 await new Promise(r=>setTimeout(r,20));g.resume.resolve();assert.notEqual((await pending).status,'ready',kind);
 assert.equal((await lease.request('analytics')).status,'ready',kind+' replacement');lease.release();
}
console.log('PASS source/identity/reset changes during build reject old generation and permit replacement');
// Same selected observation is refreshed; it never advances to the later row.
const currentLease=coordinator.acquire(a);const oldCurrent=await currentLease.request('current');assert.equal(oldCurrent.value?.analytics.scannedAtMs,anchor);const beforeCurrentRefreshReads=currentLease.counters.currentRawReads;
await updateGuildHubLocalScan('w06-current','CurrentChanged.json',JSON.stringify({players:[player(anchor,1,'f8_net',900,130,7),player(anchor,2),player(anchor+20*DAY,1,'f8_net',9999,999,1)],groups:[group(anchor),group(anchor+20*DAY,'f8_net',1)]}));
await currentLease.revalidate();const newCurrent=await currentLease.request('current');assert.equal(newCurrent.value?.analytics.scannedAtMs,anchor);assert.equal((await currentLease.request("currentInsights")).value?.rankings.player,7);
assert.equal(currentLease.counters.currentRawReads-beforeCurrentRefreshReads,1);
await deleteGuildHubLocalScans(['w06-current']);await currentLease.revalidate();assert.equal((await currentLease.request('current')).status,'empty');
currentLease.release();assert.equal(coordinator.activeContextCount(),0);assert.equal(coordinator.activeHistoryCount(),0);
console.log('PASS exact Current observation refresh, targeted one-read fallback, deletion missing, no global retained context');
