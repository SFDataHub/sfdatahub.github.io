import probe from './observer';
import React, { Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Toplist from '../../../../src/pages/DataHub/Toplist';
import { pageContextStore } from '../../../../src/lib/data-hub/pageContextStore';
import '../../../../src/styles/base.css';

const g = globalThis as any;
const api: any = { ready: false, documentId: crypto.randomUUID(), filters: null, errors: [], publicCalls: 0, views: [], messages: [], loads: [], acknowledgements: [], commits: [], longTasks: [], workers: new Set<Worker>(), phase: 'setup' };
g.w29 = api; g.w27 = api; g.w08 = api;
api.loaded = (result: any) => { api.result=result; const record = { at:probe.now(), players:result.playerRows.length, guilds:result.guildRows.length, failed:result.failedSelections.length, cached:result.cachedSelections?.length, derived:result.derivedSelections?.length }; api.loads.push(record); probe.note('parent-data-ready',record); };
api.ack = (ack: any) => { api.acknowledgements.push({at:probe.now(),...ack}); probe.note('DOM-ACK',{identifier:ack.identifier,status:ack.status}); };
new PerformanceObserver(list=>api.longTasks.push(...list.getEntries().map(e=>({start:performance.timeOrigin+e.startTime,end:performance.timeOrigin+e.startTime+e.duration,duration:e.duration})))).observe({entryTypes:['longtask']});
window.addEventListener('error',e=>api.errors.push(String(e.error ?? e.message)));
window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
document.addEventListener('click',e=>probe.note('click-received',{trusted:e.isTrusted,text:(e.target as HTMLElement)?.textContent?.slice(0,80)}),true);
const NativeWorker=window.Worker;
let workerId=0;
window.Worker=class extends NativeWorker {
  diagnosticId=++workerId; url:string; sent=new Map<string,number>();
  constructor(url:string|URL,options?:WorkerOptions) {
    const start=probe.now();super(url,options);this.url=String(url);api.workers.add(this);
    probe.note('worker-created',{workerId:this.diagnosticId,url:this.url,constructorMs:probe.now()-start});
    this.addEventListener('message',event=>{
      if(event.data?.__w29Diag){probe.events.push(...event.data.__w29Diag.map((e:any)=>({...e,workerId:this.diagnosticId})));event.stopImmediatePropagation();return;}
      const data=event.data, at=probe.now(), meta=probe.meta(data), sent=this.sent.get(String(data.requestId));
      probe.note('worker-response',{workerId:this.diagnosticId,url:this.url,...meta,roundTripMs:sent==null?null:at-sent});
      if(data.type==='view'&&data.tab==='players')api.views.push({at,...meta,rows:data.playerRows.length,lastRank:data.playerRows.at(-1)?.tableRank,firstRank:data.playerRows[0]?.tableRank});
    });
  }
  postMessage(message:any,transfer:any=[]) {
    const start=probe.now(); this.sent.set(String(message.requestId),start);
    const meta=probe.meta(message);api.messages.push({at:start,workerId:this.diagnosticId,url:this.url,...meta});
    if(message.type==='init'&&message.playerRows?.length>200&&!api.target){
      const rows=message.playerRows;const names=new Map<string,number>();for(const row of rows)names.set(row.name,(names.get(row.name)??0)+1);
      const pick=rows.slice(Math.floor(rows.length*.6)).find((row:any)=>row.name?.length>=4&&names.get(row.name)===1&&row.localScanId)??rows.at(-1);
      api.target={identifier:pick.identifier,server:pick.server,name:pick.name};
      api.other=rows.find((row:any)=>row.name?.length>=4&&row.name!==pick.name&&names.get(row.name)===1)??rows[1];
      api.other={name:api.other.name,identifier:api.other.identifier};
    }
    const nativeStart=probe.now();
    try {super.postMessage(message,transfer);}finally{probe.note('worker-send',{workerId:this.diagnosticId,url:this.url,...meta,syncMs:probe.now()-nativeStart,diagnosisBeforeSendMs:nativeStart-start});}
  }
  terminate(){api.workers.delete(this);probe.note('worker-terminated',{workerId:this.diagnosticId,url:this.url});super.terminate();}
};
// The sender timestamp excludes diagnosis-only target selection and metadata work.
const root=createRoot(document.getElementById('root')!);
const pause=(ms=25)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const frames=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
async function until(check:()=>boolean,message:string,timeout=360000){const start=performance.now();while(performance.now()-start<timeout){if(check())return;await pause();}throw Error(message+': '+document.body.innerText.slice(-1800));}
const rows=()=>[...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')];
const visible=()=>rows().some(el=>{const r=el.getBoundingClientRect();return r.height>0&&r.bottom>0&&r.top<innerHeight;});
const latest=()=>api.views.at(-1);
const scroller=()=>document.querySelector<HTMLElement>('.toplists-table-scroll, .toplists-mobile-list')!;
const busy=()=>!!document.querySelector('[data-local-toplist-progress]');
async function text(value:string){const el=document.querySelector<HTMLInputElement>('#sheet-search, #guild-hub-local-toplist-search');assert(el,'search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el!.dispatchEvent(new Event('input',{bubbles:true}));}
async function mode(value:string){const el=document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')!;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await frames();}
async function settle(after:number,expected?:number){await until(()=>latest()?.at>=after&&!busy()&&(expected==null||latest().totalRows===expected)&&visible(),'settled visible player rows');await frames();}
api.prepare=async()=>{
  const start=probe.now();api.config=await fetch('/w29/config.json').then(r=>r.json());
  g.__w29Detail=true;pageContextStore.selectServers(api.config.servers);await pause(50);
  const state=await api.state();probe.note('fixture-setup',{start,end:probe.now(),state});api.ready=true;return state;
};
api.state=async()=>{
 const out:any={};
 for(const info of await indexedDB.databases()){
  if(!info.name?.startsWith('sfdatahub-'))continue;
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(info.name!);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  for(const store of [...db.objectStoreNames])if(['scans','archiveScanBindings','localToplistSnapshots'].includes(store))out[store]=await new Promise<number>((resolve,reject)=>{const q=db.transaction(store).objectStore(store).count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  db.close();
 }
 return {scans:0,archiveScanBindings:0,localToplistSnapshots:0,...out};
};
api.removeDerived=async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('sfdatahub-local-data');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('localToplistSnapshots','readwrite');tx.objectStore('localToplistSnapshots').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();return api.state();
};
function renderRoute(){root.render(<Profiler id="toplist" onRender={(_id,phase,actualDuration,baseDuration,startTime,commitTime)=>api.commits.push({phase,actualDuration,baseDuration,start:performance.timeOrigin+startTime,commit:performance.timeOrigin+commitTime})}><MemoryRouter initialEntries={['/data-hub/toplist']}><Toplist/></MemoryRouter></Profiler>);}
api.start=async()=>{
 api.phase='entry';api.startAt=probe.now();probe.note('measurement-start',{label:'entry'});
 renderRoute();
 await until(()=>!!document.querySelector('button[role="tab"]'),'tabs');
 ([...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(el=>el.textContent==='Players'))!.click();
 await settle(api.startAt,api.config.expectedPlayers);
 api.endAt=probe.now();api.phase='prepared';probe.note('measurement-end',{label:'entry'});return {start:api.startAt,end:api.endAt,ms:api.endAt-api.startAt,total:latest().totalRows,domRows:rows().length,visible:visible(),state:await api.state()};
};
async function measure(label:string,action:()=>Promise<void>){const start=probe.now();probe.note('measurement-start',{label});await action();await frames();const end=probe.now();probe.note('measurement-end',{label});const result={label,start,end,ms:end-start,total:latest()?.totalRows,domRows:rows().length,visible:visible()};api.operations.push(result);return result;}
api.runOperations=async(includeCompare=false)=>{
 api.operations=[];
 let at=probe.now();await mode('filter');await settle(at);at=probe.now();
 await measure('filter-first',async()=>{const t=probe.now();await text(api.target.name);await settle(t);});
 await measure('filter-identical-noop',async()=>{await text(api.target.name);});
 at=probe.now();await text('');await settle(at);
 await measure('filter-reuse-after-clear',async()=>{const t=probe.now();await text(api.target.name);await settle(t);});
 await measure('filter-other',async()=>{const t=probe.now();await text(api.other.name);await settle(t);});
 at=probe.now();await text('');await settle(at);
 await measure('sort-level',async()=>{const t=probe.now();const select=document.querySelector<HTMLOptionElement>('option[value="level"]')!.parentElement as HTMLSelectElement;select.value='level';select.dispatchEvent(new Event('change',{bubbles:true}));await settle(t);});
 at=probe.now();await mode('search');await settle(at);
 await measure('search-first-to-dom-ack',async()=>{
  await text(api.target.name);await until(()=>!!document.querySelector(`[data-toplist-search-identifier="${api.target.identifier}"]`),'archive search target',120000);
  api.searchHitAt=probe.now();const hit=document.querySelector<HTMLButtonElement>(`[data-toplist-search-identifier="${api.target.identifier}"]`)!;assert(!hit.disabled,'search target enabled');hit.click();
  await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]')&&rows().some(row=>row.dataset.sfhIdentifier===api.target.identifier),'visible target acknowledgement');
 });
 at=probe.now();await text('');await frames();
 await measure('window-new-distant',async()=>{const t=probe.now(),el=scroller();el.scrollTop=el.scrollHeight*.27;el.dispatchEvent(new Event('scroll'));await settle(t);});
 await measure('window-repeat-present',async()=>{const el=scroller();el.dispatchEvent(new Event('scroll'));});
 await measure('search-repeat-hot-index-to-dom-ack',async()=>{
  const t=probe.now();await text(api.target.name);await until(()=>!!document.querySelector(`[data-toplist-search-identifier="${api.target.identifier}"]`),'cached index search target');
  document.querySelector<HTMLButtonElement>(`[data-toplist-search-identifier="${api.target.identifier}"]`)!.click();
  await until(()=>api.acknowledgements.some((a:any)=>a.at>t&&a.status==='visibleAck'),'new visible target acknowledgement');
 });
 if(includeCompare){
  const t=probe.now();api.filters.setServers(['F8']);await settle(t,api.config.f8Players);
  await measure('compare-f8-aug-sep',async()=>{
   document.querySelector<HTMLButtonElement>('[data-proof="compare"]')!.click();await frames();
   for(const [id,value]of [['toplists-compare-from','2026-08'],['toplists-compare-to','2026-09']]){const el=document.getElementById(id) as HTMLSelectElement;el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await frames();}
   await until(()=>api.loads.some((l:any)=>l.at>t)&&!busy()&&visible(),'representative compare');
  });
 }
 return api.operations;
};
api.report=async(start=api.startAt,end=api.endAt)=>{
 await pause(100);return {documentId:api.documentId,start,end,ms:end-start,events:probe.events.filter(e=>e.start>=start&&e.start<=end),longTasks:api.longTasks.filter((e:any)=>e.start>=start&&e.end<=end),messages:api.messages.filter((e:any)=>e.at>=start&&e.at<=end),loads:api.loads.filter((e:any)=>e.at>=start&&e.at<=end),views:api.views.filter((e:any)=>e.at>=start&&e.at<=end),commits:api.commits.filter((e:any)=>e.start>=start&&e.commit<=end),target:api.target,searchHitAt:api.searchHitAt,state:await api.state(),errors:api.errors,operations:api.operations};
};
api.prepare().catch((error:Error)=>{api.error=error.stack;api.ready=true;});

api.prepareInteraction=async(kind:string)=>{
 pageContextStore.selectServers([]);renderRoute();await until(()=>!!api.filters&&!!document.querySelector('button[role="tab"]'),'interaction controls');
 ([...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(el=>el.textContent==='Players'))!.click();await frames();
 let button:HTMLButtonElement|undefined;
 if(kind==='server'){
  document.querySelector<HTMLButtonElement>('button[aria-label^="Select servers"]')!.click();await frames();
  const input=document.querySelector<HTMLInputElement>('#sheet-serversearch')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'F28');input.dispatchEvent(new Event('input',{bubbles:true}));await frames();
  await until(()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')].some(el=>el.title.replace(/\s/g,'').toUpperCase()==='FUSION28'),'F28 server chip');
  button=[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button[aria-pressed]')].find(el=>el.title.replace(/\s/g,'').toUpperCase()==='FUSION28');
 }else button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(el=>el.textContent?.trim()==='Reset');
 assert(button,'actual interaction control');const r=button!.getBoundingClientRect();button!.dataset.w29Action=kind;
 const coordinates={x:r.x+r.width/2,y:r.y+r.height/2};api.interactionStart=probe.now();api.filters.setServers(api.config.servers);return {coordinates,start:api.interactionStart,state:await api.state()};
};
api.finishInteraction=async(kind:string,attemptAt:number)=>{
 const required=kind==='server'?api.config.servers.length-1:0;
 await until(()=>api.filters.servers.length===required,'actual action processed');await frames();const reactionAt=probe.now();
 if(kind==='server'){
  document.querySelector<HTMLButtonElement>('[role="dialog"] button')?.parentElement?.querySelectorAll<HTMLButtonElement>('button')[1]?.click();
  await settle(reactionAt,api.config.expectedPlayers-api.config.f28Players);
 }else {await until(()=>!busy()&&document.body.innerText.includes('No server selected'),'visible reset reaction');await pause(10000);}
 const end=probe.now();const report=await api.report(api.interactionStart,end);
 const click=report.events.find((e:any)=>e.name==='click-received'&&e.trusted&&e.start>=attemptAt);
 return {...report,interaction:{kind,attemptAt,receivedAt:click?.start,receivedDelayMs:click?click.start-attemptAt:null,reactionAt,reactionMs:reactionAt-attemptAt,resetMessage:document.body.innerText.includes('No server selected'),liveWorkers:api.workers.size,scope:api.filters.servers,finalTotal:latest()?.totalRows,visible:visible(),end},state:await api.state()};
};
api.preparedCoordinates=async(kind:string)=>{
 if(kind==='filter'){await mode('filter');const el=document.querySelector<HTMLInputElement>('#sheet-search, #guild-hub-local-toplist-search')!;el.scrollIntoView({block:'center'});el.focus();await frames();const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,value:api.target.name};}
 const el=document.querySelector<HTMLOptionElement>('option[value="level"]')!.parentElement as HTMLSelectElement;el.scrollIntoView({block:'center'});el.focus();await frames();return {};
};
api.finishPrepared=async(kind:string,start:number)=>{
 await until(()=>api.views.some((v:any)=>v.at>start)&&!busy(),'prepared trusted action response');
 const el=scroller();el.scrollIntoView({block:'center'});await until(visible,'prepared visible response');await frames();const end=probe.now();
 return {...await api.report(start,end),interaction:{kind,attemptAt:start,reactionMs:end-start,total:latest()?.totalRows,visible:visible()}};
};

api.identities=()=>({players:api.result.playerRows.map((r:any)=>[r.server,r.identifier,r.archiveScanId,r.localScanId]).sort(),guilds:api.result.guildRows.map((r:any)=>[r.server,r.identifier,r.archiveScanId,r.localScanId]).sort()});
api.removeBindings=async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('sfdatahub-local-data');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('archiveScanBindings','readwrite');tx.objectStore('archiveScanBindings').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();return api.state();
};
