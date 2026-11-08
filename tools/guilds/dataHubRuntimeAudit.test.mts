import assert from 'node:assert/strict';
import { auditBegin, auditPhaseBegin, auditSpan, auditSpanEnd, auditCall, auditEnter, auditValue, auditReturn, auditLeave, auditError, auditDiscard, auditCurrent, auditFields, auditCount, auditMergeWorker, auditWorkerResult, auditLink, dataHubRuntimeAudit as api, AUDIT_LIMITS } from '../../src/lib/data-hub/runtimeAudit.ts';
api.disable();api.clear();api.console(false);
assert.equal(auditBegin('F08','disabled'), null);assert.equal(api.status().active,0);
const raw={ players: [{ secret:'do not retain' }] };
assert.equal(auditReturn(null,raw),raw);
api.enable();
const outer=auditBegin('F08','nested')!;
const leaf=auditSpan(outer,'narrow','sync-elapsed');auditSpanEnd(outer,leaf);
const phase=auditPhaseBegin('container',outer)!;
const one=auditEnter(phase,'call','sync-elapsed');const two=auditEnter(phase,'nested','sync-elapsed');auditValue(phase,two,1);auditValue(phase,one,1);
assert.equal(auditCurrent(),null);
const promise=Promise.resolve(raw);assert.equal(auditCall(outer,'identity',()=>promise),promise);assert.equal(auditReturn(phase,promise),promise);
await promise;await Promise.resolve();auditLeave(outer);
const report=api.snapshot().reports.find(r=>r.id===outer.id)!;
assert.equal(report.status,'completed');assert(report.elapsedMs!>=0);assert(report.unobservedWallMs!>=-0.001);assert.equal(report.coverageComplete,false);assert(!JSON.stringify(api.snapshot()).includes('do not retain'));
const interrupted=auditBegin('F10','disable-does-not-abort-work')!;let ran=false;
const work=new Promise<void>(resolve=>queueMicrotask(()=>{ran=true;resolve();}));auditReturn(interrupted,work);api.disable();await work;assert(ran);assert.equal(interrupted.record,undefined);assert(api.snapshot().reports.some(r=>r.id===interrupted.id&&r.status==='recording-stopped'));
api.enable();api.clear();
const large=auditBegin('S02','limits')!;
for(let i=0;i<1200;i++){const span=auditSpan(large,'read');auditSpanEnd(large,span);auditCount(large,'requests');}
for(let i=0;i<100;i++){auditFields(large,{['field'+i]:i});auditLink(large,'external'+i,'consumer');}
auditLeave(large);const limited=api.snapshot().reports[0];assert.equal(limited.spans.length,1000);assert.equal(limited.droppedSpans,200);assert.equal(limited.counts.requests,1200);assert(limited.droppedFields>0);assert(limited.droppedLinks>0);assert.equal(limited.links.length,AUDIT_LIMITS.links);assert(limited.links.every(l=>l.retained===false));
for(let i=0;i<250;i++){const run=auditBegin('F05','ring')!;auditLeave(run);}assert.equal(api.status().completed,200);assert.equal(api.status().evictedReports,51);
api.clear();const handles=[];for(let i=0;i<250;i++)handles.push(auditBegin('F22','active-limit')!);assert.equal(api.status().active,200);assert(handles.slice(0,50).every(h=>h.record===undefined));api.clear();assert(handles.every(h=>h.record===undefined));assert.equal(api.status().completed,0);
const stale=auditBegin('F16','stale')!;auditDiscard(stale);auditLeave(stale);assert.equal(api.snapshot().reports[0].status,'stale-discarded');
const failure=auditBegin('F30','error')!;const error=new Error('original');try{auditCall(failure,'throw',()=>{throw error;});}catch(observed){assert.equal(observed,error);auditError(failure,observed);}auditLeave(failure);assert.equal(api.snapshot().reports[1].status,'failed');
const inFlight=auditBegin('F36','clear')!;api.clear();assert.equal(inFlight.record,undefined);api.disable();
console.log('runtime audit: disabled identity, nested intervals, errors, stale, clear/disable, active/report/span/field/reference limits passed');

api.enable();api.clear();
const diagnostic=auditBegin('F20','diagnostic-failure-isolation')!;
const poisoned=new Proxy({}, {get(){throw new Error('diagnostic getter failure');}});
assert.equal(auditReturn(diagnostic,poisoned),poisoned);
const enter=auditEnter(diagnostic,'returned-value');assert.equal(auditValue(diagnostic,enter,poisoned),poisoned);
assert.equal(auditCall(diagnostic,'returned-value',()=>poisoned),poisoned);
auditMergeWorker(diagnostic,poisoned as any);auditLeave(diagnostic);
assert.equal(api.status().active,0);assert(api.status().diagnosticErrors>=4);api.disable();
console.log('diagnostic getters and malformed remote report do not change feature values or errors');

api.enable();api.clear();
const recovered=auditBegin('F30','recovered-intermediate-null')!;
const optional=auditPhaseBegin('optional-tsv',recovered)!;
assert.equal(auditReturn(optional,null),null);auditLeave(optional);
const attempted=auditPhaseBegin('recoverable-attempt',recovered)!;
auditError(attempted,new Error('handled by original feature'));auditLeave(attempted);
auditReturn(recovered,{reportKind:'uncertain'});auditLeave(recovered);
assert.equal(api.snapshot().reports[0].status,'completed');
assert(api.snapshot().reports[0].spans.some(s=>s.name==='phase-error'));
api.disable();console.log('intermediate null/status/error does not override successfully completed enclosing job');

api.enable();api.clear();
const scheduled=auditBegin('F05','deliberate-wait')!;const waitSpan=auditSpan(scheduled,'original-timer','deliberate-wait');
assert.equal(auditCurrent(),null);const unrelated=auditBegin('F12','independent-during-debounce')!;
assert.equal(unrelated.record?.parentId,undefined);auditLeave(unrelated);auditSpanEnd(scheduled,waitSpan);auditLeave(scheduled);api.disable();
console.log('scheduled wait never installs an ambient owner across an asynchronous boundary');

api.enable();api.clear();const shortened=auditBegin('S03','visible-string-truncation')!;
auditFields(shortened,{generation:'x'.repeat(500)});auditLeave(shortened);
const clipped=api.snapshot().reports[0];assert.equal(clipped.fields.generation?.toString().length,240);assert(clipped.fields.generation?.toString().endsWith('…'));assert.equal(clipped.droppedFields,1);api.disable();
console.log('string truncation is counted and explicitly marked without retaining original values');

api.enable();api.clear();const workerRoot=auditBegin('worker','transitive-records')!;
const sourceChild=auditBegin('S03','source-child',workerRoot)!;
const readinessChild=auditBegin('S06','readiness-child',sourceChild)!;
auditFields(readinessChild,{generation:'y'.repeat(500)});auditLeave(readinessChild);auditLeave(sourceChild);
const folded=auditWorkerResult(workerRoot)!;
assert(folded.spans.some(s=>s.name==='worker-child-report'&&s.fields?.childFamily==='S06'));
assert(folded.spans.some(s=>s.name==='worker-child-report'&&s.fields?.childFamily==='S03'));
assert.equal(folded.counts.workerChildDroppedFields,1);api.disable();
console.log('worker descendants ending before their parent are folded with visible loss counters');

api.enable();api.clear();const mainOwner=auditBegin('F21','worker-clock-map')!;const nativeRoot=auditBegin('worker','native-reply')!;
nativeRoot.record!.parentId=mainOwner.id;const interval=auditSpan(nativeRoot,'processing','sync-elapsed')!;auditSpanEnd(nativeRoot,interval);
const remote=auditWorkerResult(nativeRoot)!;remote.timeOrigin=mainOwner.record!.timeOrigin!+1000;
auditMergeWorker(mainOwner,remote);const translated=mainOwner.record!.spans.find(s=>s.name==='worker:processing')!;
assert(Math.abs(translated.startMs-(interval.startMs+1000))<0.001);assert.equal(translated.elapsedMs,interval.elapsedMs);assert.equal(translated.fields?.translatedToMainClock,true);
auditLeave(mainOwner);api.disable();console.log('worker boundaries are preserved and mapped through timeOrigin instead of receipt duration');

api.enable();api.clear();const fieldBudget=Object.fromEntries(Array.from({length:AUDIT_LIMITS.fields},(_,n)=>['f'+n,n]));
const ending=auditBegin('F05','full-open-span-fields')!;auditSpan(ending,'pending','async-container',fieldBudget);auditLeave(ending);
const endedBudget=api.snapshot().reports[0];assert.equal(Object.keys(endedBudget.spans[0].fields!).length,AUDIT_LIMITS.fields);assert.equal(endedBudget.droppedFields,1);
const budgetMain=auditBegin('F21','full-worker-span-fields')!;const budgetRemote=auditBegin('worker','full-reply-fields')!;budgetRemote.record!.parentId=budgetMain.id;
const budgetSpan=auditSpan(budgetRemote,'processing','sync-elapsed',fieldBudget)!;auditSpanEnd(budgetRemote,budgetSpan);
auditMergeWorker(budgetMain,auditWorkerResult(budgetRemote)!);const budgetMapped=budgetMain.record!.spans.find(s=>s.name==='worker:processing')!;assert.equal(Object.keys(budgetMapped.fields!).length,AUDIT_LIMITS.fields);assert.equal(budgetMapped.fields!.translatedToMainClock,true);assert(budgetMain.record!.droppedFields>0);auditLeave(budgetMain);api.disable();
console.log('internal closure and worker clock markers obey the hard 64-field cap and expose rejected fields');
