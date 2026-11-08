import { outputPath, artifactPath, siblingInput } from '../codex/workspace.mjs';
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
// The Node Main-realm console stub does not exercise cross-realm broadcasts.
const originalBroadcastChannel = globalThis.BroadcastChannel;
(globalThis as any).BroadcastChannel = undefined;
// Console behavior is tested in a controlled Main realm; no user browser data.
(globalThis as any).window = { location: { hash: '#/data-hub/toplist' }, history: { state: {} }, addEventListener() {} };
const { dataHubRuntimeAudit: api, auditBegin, auditCall, auditFields, auditLeave, auditReturn, auditObserveInputs, auditFinish, auditAssociate, auditResultId, auditRecordedEvent, auditLink, AUDIT_LIMITS } = await import('../../src/lib/data-hub/runtimeAudit.ts');
const { AUDIT_NAMES, auditConsoleSummary, auditDisplayName } = await import('../../src/lib/data-hub/runtimeAuditPresentation.ts');
const { loadScanArchiveSearchIndexSet: load } = await import('../../src/lib/scanArchive/searchIndexService.ts');
const { getSfDataHubArchiveSearchIndexCache: getCache, putSfDataHubArchiveSearchIndexCache: putCache } = await import('../../src/lib/guilds/localScanLibrary.ts');
const { createAnalyticsExecutionQueue } = await import('../../src/lib/local-player-profile/executionQueue.ts');
const evidence = outputPath(artifactPath('tmp/w33')); await mkdir(outputPath(evidence),{recursive:true});
const manifest = JSON.parse(await readFile(siblingInput('scan archiv/scan-archive-2026/manifest.json'),'utf8'));
const ids = new Set(Object.values(manifest.toplists.current).flatMap((s:any)=>typeof s==='string'?[s]:s.scanIds));
const entries = manifest.scans.filter((s:any)=>ids.has(s.id)).map((s:any)=>({...s,archiveYear:2026,manifestRevision:manifest.revision,manifestUrl:'https://fixture.invalid/manifest.json',fileUrl:'https://fixture.invalid/'+s.path}));
assert.equal(entries.length,58);
api.disable();api.clear();
const payloads = new Map<string,any>();
for(const entry of entries){const bytes=await readFile(siblingInput('scan archiv/scan-archive-2026/'+entry.searchIndex.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.searchIndex.sha256);const payload=JSON.parse(gunzipSync(bytes).toString());payloads.set(entry.id,payload);await putCache(entry,payload);}
let reads=0,writes=0,downloads=0;
const deps={getCache:async(e:any)=>{reads++;return getCache(e);},putCache:async(e:any,p:any)=>{writes++;return putCache(e,p);},downloadSearchIndex:async()=>{downloads++;throw Error('Unexpected download');}};
const off=await load(entries,{dependencies:deps,auditConsumerArea:'Topliste'});const offWork={reads,writes,downloads};
reads=writes=downloads=0;api.enable();api.clear();api.console(true);
const native={groupCollapsed:console.groupCollapsed,groupEnd:console.groupEnd,log:console.log,table:console.table};
const headers:string[]=[], top:string[]=[];let depth=0;
console.groupCollapsed=(...args:any[])=>{const title=String(args[0]);headers.push(title);if(depth===0)top.push(title);depth++;};
console.groupEnd=()=>{assert(depth>0);depth--;};console.log=()=>{};console.table=()=>{};
try {
 const on=await load(entries,{dependencies:deps,auditConsumerArea:'Topliste'});
 assert.deepEqual({reads,writes,downloads},offWork);assert.deepEqual(on.loadedIndexes,off.loadedIndexes);
 assert.equal(on.searchSet.getOccurrences().length,off.searchSet.getOccurrences().length);
 assert.equal(top.length,1);assert.match(top[0],/^Topliste · Suchvorbereitung · abgeschlossen · [\d.]+ ms · 58 Indizes · 58 Cachetreffer · 0 Downloads$/);
 assert.equal(depth,0);
 const snapshot=api.snapshot(), root=snapshot.reports.find(r=>r.action==='loadScanArchiveSearchIndexSet')!, children=snapshot.reports.filter(r=>r.action==='loadSearchIndex');
 assert.equal(children.length,58);assert.equal(root.links.length,58);assert.equal(root.droppedLinks,0);
 assert(children.every(r=>r.parentId===root.id&&r.fields.searchIndexSha256&&r.fields.archiveScanId&&r.fields.source==='cache'&&r.fields.networkAccessed===false));
 assert.equal(new Set(children.map(r=>r.fields.archiveScanId)).size,58);
 await writeFile(outputPath(evidence+'/58-cache-snapshot.json'),JSON.stringify(snapshot,null,2));
 const before=api.snapshot().reports.length;await new Promise(r=>setTimeout(r,600));assert.equal(api.snapshot().reports.length,before);assert.equal(top.length,1);
 await writeFile(outputPath(evidence+'/cache-proof.json'),JSON.stringify({headline:top[0],indices:58,uniqueSources:58,rootId:root.id,forwardLinks:root.links.length,offWork,onWork:{reads,writes,downloads},occurrences:on.searchSet.getOccurrences().length,idleMs:600},null,2));
 // Hub Search's actual two-entry batching belongs to one preparation. A later
 // query references that preparation without claiming its reads/downloads again.
 api.clear();top.length=0;const hub=auditBegin('F04','refreshArchive')!;
 for(let n=0;n<entries.length;n+=2)await auditCall(hub,'index-batch',()=>load(entries.slice(n,n+2),{dependencies:deps}),"async-container");
 auditLeave(hub);assert.equal(top.length,1);assert.match(top[0],/58 Indexzugriffe/);assert.match(top[0],/58 Cacheergebnisse/);assert.match(top[0],/0 Downloads/);
 const batched=api.snapshot();assert.equal(batched.reports.filter(r=>r.action==='loadScanArchiveSearchIndexSet').length,29);assert.equal(batched.reports.filter(r=>r.action==='loadSearchIndex').length,58);
 await writeFile(outputPath(evidence+'/batched-preparation.json'),JSON.stringify({headline:top[0],snapshot:batched},null,2));
 const query=auditBegin('F22','applied-query')!;auditLink(query,hub.id,'input-preparation');auditReturn(query,[{id:'query-hit'}]);auditLeave(query);assert.equal(top.length,2);assert.match(top[1],/1 Ergebniszeilen/);assert.match(top[1],/58 vorbereitete Indexergebnisse \(referenziert\)/);assert(!/Cachetreffer|Cacheergebnisse|Downloads/.test(top[1]));
 await writeFile(outputPath(evidence+'/referenced-preparation.json'),JSON.stringify({headline:top[1],snapshot:api.snapshot()},null,2));
 // Controlled download failure and cache miss preserve unknown versus zero.
 api.clear();top.length=0;headers.length=0;
 const bad=await load(entries.slice(0,2),{auditConsumerArea:'Topliste',dependencies:{getCache:async e=>e.id===entries[0].id?getCache(e):null,putCache,downloadSearchIndex:async()=>{throw Error('controlled network error');}}});
 assert.equal(bad.status,'partial');assert.match(top[0],/Teilbestand/);assert.match(top[0],/1 Downloadversuche/);assert.match(top[0],/Netzwerkanzahl unbekannt/);assert(!top[0].includes('0 Downloads'));
 assert(api.snapshot().reports.some(r=>r.fields.errorCode==='network-error'));await writeFile(outputPath(evidence+'/failure-snapshot.json'),JSON.stringify(api.snapshot(),null,2));
 // One physical download, two simultaneous independent consumers; first detaches.
 api.clear();top.length=0;
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let physical=0,cancelled=0;
 const sharedDeps={getCache:async()=>null,putCache:async(e:any,p:any)=>putCache(e,p),downloadSearchIndex:async(e:any,signal?:AbortSignal)=>{physical++;signal?.addEventListener('abort',()=>cancelled++);await gate;return payloads.get(e.id);}};
 const controller=new AbortController();
 const first=load(entries.slice(0,1),{signal:controller.signal,dependencies:sharedDeps,auditConsumerArea:'Topliste'});
 const second=load(entries.slice(0,1),{dependencies:sharedDeps,auditConsumerArea:'Hubsuche'});
 await new Promise(r=>setTimeout(r,10));controller.abort();release();const [a,b]=await Promise.all([first,second]);
 assert.equal(a.failedIndexes[0].errorCode,'aborted');assert.equal(b.loadedIndexes.length,1);assert.equal(physical,1);assert.equal(cancelled,0);
 const shared=api.snapshot(), sets=shared.reports.filter(r=>r.action==='loadScanArchiveSearchIndexSet'), source=shared.reports.filter(r=>r.action==='loadSearchIndex');
 assert.equal(source.length,1);assert.equal(top.length,2,"shared source adds no independent completion group");assert.equal(source[0].status,'completed');assert.equal(sets.find(r=>r.fields.consumerArea==='Topliste')!.status,'aborted');
 assert(sets.every(r=>r.links.some(l=>l.id===source[0].id)));assert.match(top.find(h=>h.startsWith('Hubsuche'))!,/0 eigene Downloads/);
 await writeFile(outputPath(evidence+'/parallel-snapshot.json'),JSON.stringify(shared,null,2));
 // Same dependency render executions remain separate observations of an input.
 api.clear();top.length=0;
 const prep=auditBegin('S05','loadScanArchiveSearchIndexSet')!, value={};auditReturn(prep,value);auditLeave(prep);
 for(let i=0;i<2;i++){const projection=auditBegin('F22','results')!;auditFields(projection,{sameDependencies:i===1});auditObserveInputs(projection,[value]);auditReturn(projection,[]);auditLeave(projection);}
 assert.equal(top.length,1);assert.equal(api.snapshot().reports.filter(r=>r.action==='results').length,2);assert(api.snapshot().reports.filter(r=>r.action==='results').every(r=>r.parentId===prep.id));
 const snapshotBefore=api.snapshot().reports.find(r=>r.id===prep.id)!;const elapsed=snapshotBefore.elapsedMs;const groups=top.length;auditRecordedEvent(prep.id,'react-commit');assert.equal(top.length,groups);assert.equal(api.snapshot().reports.find(r=>r.id===prep.id)!.elapsedMs,elapsed);
 api.console(false);const quiet=auditBegin('F22','applied-query')!;auditLeave(quiet);assert(api.snapshot().reports.some(r=>r.id===quiet.id));assert.equal(top.length,groups);
 // Final result quantities do not add intermediate phase output or repeated acceptance.
 api.clear();const resultJob=auditBegin('F20','result-quantities')!;
 const {auditPhaseBegin}=await import('../../src/lib/data-hub/runtimeAudit.ts');
 const intermediate=auditPhaseBegin('input-array',resultJob)!;auditReturn(intermediate,[1,2,3,4]);auditLeave(intermediate);
 auditReturn(resultJob,[1,2]);auditLeave(resultJob);const resultReport=api.snapshot().reports.find(r=>r.id===resultJob.id)!;
 assert.equal(resultReport.counts.resultRows,6);assert.equal(resultReport.fields.resultRows,2);assert.match(auditConsoleSummary(resultReport,api.snapshot().reports).headline,/2 Ergebniszeilen/);
 // A recovered phase failure stays visible without changing the completed status.
 const recoveredRoot=auditBegin('F30','recovered-phase')!,recoveredPhase=auditPhaseBegin('optional-input',recoveredRoot)!;
 const {auditError}=await import('../../src/lib/data-hub/runtimeAudit.ts');auditError(recoveredPhase,new Error('controlled optional phase failure'));auditLeave(recoveredPhase);auditLeave(recoveredRoot);
 const recoveredReport=api.snapshot().reports.find(r=>r.id===recoveredRoot.id)!;assert.equal(recoveredReport.status,'completed');assert.match(auditConsoleSummary(recoveredReport,api.snapshot().reports).headline,/Phasenfehler in Details/);
 // A synchronous console error cannot alter feature values or leave groups open.
 api.console(true);const throwingTable=console.table;console.table=()=>{throw Error('controlled logger error');};
 const loggerJob=auditBegin('F21','logger-isolation')!, originalValue={};assert.equal(auditReturn(loggerJob,originalValue),originalValue);auditLeave(loggerJob);console.table=throwingTable;
 assert.equal(api.status().active,0);assert.equal(depth,0);assert(api.status().diagnosticErrors>0);
 const laterGroups=top.length,laterDuration=resultReport.elapsedMs;
 auditCall(resultJob,'later-consumer-proof',()=>{const source=auditBegin('S06','listGuildHubScanSummaries')!;auditLeave(source);});
 assert.equal(top.length,laterGroups);assert.equal(api.snapshot().reports.find(r=>r.id===resultJob.id)!.elapsedMs,laterDuration);
 api.console(false);
 // All 45 names and actual profile variants have meaningful labels.
 assert.equal(Object.keys(AUDIT_NAMES).length,45);
 for(const family of Object.keys(AUDIT_NAMES)){const run=auditBegin(family as any,'name-coverage')!;assert(!/F\d\d|S\d\d/.test(auditDisplayName(run.record!)));auditLeave(run);}
 const best=auditBegin('F18','request')!;auditFields(best,{area:'bests'});assert.match(auditDisplayName(best.record!),/Persönliche Bestwerte/);auditLeave(best);
 // Queue identity exists before dispatch and remains shared with early joiners.
 api.clear();api.console(true);top.length=0;
 const cards=auditBegin('F10','run')!, trend=auditBegin('F11','run')!, queue=createAnalyticsExecutionQueue();
 const job1=queue.acquire('same-physical-source',Symbol(),'visible',async()=>{const source=auditBegin('S03','physical-source-preparation')!;auditLeave(source);return 1;},cards);
 const job2=queue.acquire('same-physical-source',Symbol(),'visible',async()=>{throw Error('duplicate physical job');},trend);
 assert.equal(job1.promise,job2.promise);await job1.promise;await Promise.resolve();auditLeave(cards);auditLeave(trend);
 const q=api.snapshot(), queued=q.reports.find(r=>r.action==='shared-queue-job')!;assert(q.reports.find(r=>r.id===trend.id)!.links.some(l=>l.id===queued.id));assert.equal(q.reports.filter(r=>r.action==='physical-source-preparation').length,1);
 await writeFile(outputPath(evidence+'/queue-proof.json'),JSON.stringify(q,null,2));
 // Independent committed views survive sort/filter changes; duplicate commits
 // and discarded render evaluations create no misleading extra completions.
 api.clear();top.length=0;api.console(true);
 const discardedView=auditBegin('F13','playerComparison')!;auditReturn(discardedView,{});auditLeave(discardedView);assert.equal(top.length,0);
 const viewA=auditBegin('F13','playerComparison')!;auditReturn(viewA,{});auditLeave(viewA);auditRecordedEvent(viewA.id,'react-commit');auditRecordedEvent(viewA.id,'react-commit');assert.equal(top.length,1);
 const viewB=auditBegin('F13','playerComparison')!;auditReturn(viewB,{});auditLeave(viewB);auditRecordedEvent(viewB.id,'react-commit');assert.equal(top.length,2);
 api.console(false);const quietView=auditBegin('F31','sortParticipationRows')!;auditReturn(quietView,[]);auditLeave(quietView);auditRecordedEvent(quietView.id,'react-commit');api.console(true);auditRecordedEvent(quietView.id,'react-commit');assert.equal(top.length,2);
 // Clear / disable reset weak identity annotations, bounded collector exposes losses.
 const old=auditBegin('F20','old-result')!, object={};auditAssociate(old,object);api.clear();assert.equal(auditResultId(object),undefined);auditLeave(old);
 api.console(false);
 for(let n=0;n<250;n++){const r=auditBegin('F21','ring')!;auditLeave(r);}assert.equal(api.status().completed,AUDIT_LIMITS.completed);assert.equal(api.status().evictedReports,50);
 const limited=auditBegin('F20','limits')!;for(let n=0;n<70;n++)auditLink(limited,'gone'+n,'child');auditLeave(limited);assert.match(auditConsoleSummary(api.snapshot().reports.at(-1)!,api.snapshot().reports,api.status().evictedReports).headline,/Aufzeichnungsdetails begrenzt/);
 const live=auditBegin('F10','disable')!;api.disable();assert.equal(live.record,undefined);assert.equal(api.status().active,0);api.clear();assert.equal(api.status().completed,0);
 await writeFile(outputPath(evidence+'/grouping-results.json'),JSON.stringify({passed:true,coverageFamilies:Object.keys(AUDIT_NAMES).length,cacheReadParity:true,controlledFailure:true,sharedPhysicalDownloads:physical,sharedCancellation:cancelled,observationsPreserved:true,commitDurationUnchanged:true,consoleOffRecording:true,boundedMemory:true,clearDisable:true},null,2));
} finally { Object.assign(console,native);api.disable();delete (globalThis as any).window;globalThis.BroadcastChannel=originalBroadcastChannel; }
console.log('PASS W33: real 58 cached indices, complete identity/linking and read parity; failure, shared consumers, queue identity, render observations, console, limits, clear/disable');
