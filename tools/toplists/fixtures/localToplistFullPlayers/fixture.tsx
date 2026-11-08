import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { resolveServer } from "../../../../src/lib/servers/serverResolver";
import Toplist from "../../../../src/pages/DataHub/Toplist";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { searchIndexPayloadForScanArchiveEntry } from "../../../../src/lib/scanArchive/archiveBuilderCore";
import { putSfDataHubArchiveSearchIndexCache } from "../../../../src/lib/guilds/localScanLibrary";
import { acquireExplicitLocalFirstArchiveScans } from "../../../../src/lib/scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../../../../src/lib/scanArchive/types";
import "../../../../src/styles/base.css";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 3000; i++) { if (check()) return; await act(async () => { await pause(); }); }
  throw Error(`${message}: ${document.body.innerText.slice(-1500)}`);
}
const api: any = { documentId: crypto.randomUUID(), ready: false, loads: [], acks: [], publicCalls: 0, messages: [], responses: [], rawDownloads: [], indexRequests: [], preparations: [], errors: [], held: [], holdViewText: null, holdWindow: false, measurements: [], holdSearch: false, holdCompareNext: false, compareHeld: [], compareRequestIds: new Set<number>(), viewCommits: [], viewDecisions: [], clientDeliveries: [] };
(globalThis as any).w08 = api;
(globalThis as any).w27 = api;
api.longTasks=[];
new PerformanceObserver(list=>api.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:["longtask"]});
window.addEventListener("unhandledrejection", event => api.errors.push(String(event.reason)));
const currentTime = Date.UTC(2026, 9, 6), monthTime = Date.UTC(2026, 8, 6), baselineTime = Date.UTC(2026, 7, 6);
const entry = (id: string, server: string, timestamp: number): ScanArchiveEntry => ({ id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(),
  path: `${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip", sha256: id.slice(0,1).repeat(64), compressedBytes: 1, uncompressedBytes: 1,
  searchIndex: { schemaVersion: 1, path: `${id}.search.json.gz`, sha256: "f".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 1205, groupCount: 3 },
  playerCount: 1205, groupCount: 3, archiveYear: 2026, manifestRevision: 1, manifestUrl: `${location.origin}/w27-manifest.json`, fileUrl: `${location.origin}/${id}.gz` });
const current = entry("ccccurrent", "f8_net", currentTime), second = entry("ddddsecond", "s1_eu", currentTime), month = entry("aaaamonth", "f8_net", monthTime), baseline = entry("bbbbbaseline", "f8_net", baselineTime), earlier = entry("eeeeearlier", "f8_net", Date.UTC(2026, 6, 6));
const raw = (e: ScanArchiveEntry) => {
 const historic = e.timestamp !== currentTime, guildName = historic ? "Historical Guild" : "Alpha Guild";
 const base = e.timestamp === currentTime ? 10000 : e.timestamp === monthTime ? 9000 : e.timestamp === baselineTime ? 8000 : 7000;
 return { players: Array.from({length:1205},(_,i)=>({identifier:`${e.server}_p${i+1}`,prefix:e.server,timestamp:e.timestamp,
  name:i===1204?(e.server==="f8_net"?"FarAway":`LastPlayer-${e.server}`):i===1100?"BeyondServer":i===1002?"AlphaPerson":`Player${String(i).padStart(4,"0")}`,
  guildIdentifier:i===1003?null:`${e.server}_g${i===1002?2:1}`,guildName:i===1003?null:i===1002?"Other Guild":guildName,
  class: historic ? 2 : i===1002?2:1,level:100+i,rank:i+1,
  values:{Base:base-i,"Base Strength":base-i,"Base Intelligence":base-i,"Base Constitution":500,Attribute:15000-i,Constitution:750}})),
  groups:[{identifier:`${e.server}_g1`,prefix:e.server,timestamp:e.timestamp,name:guildName,rank:1,memberCount:1003,avgLevel:500},
   {identifier:`${e.server}_g2`,prefix:e.server,timestamp:e.timestamp,name:"Other Guild",rank:2,memberCount:1,avgLevel:200},
   {identifier:`${e.server}_g3`,prefix:e.server,timestamp:e.timestamp,name:"Empty Guild",rank:3,memberCount:0,avgLevel:100}]};
};
const namespaces = ["am1_net", "blackforest_net", "f11_net", "f14_net", "f17_net", "f19_net", "f21_net", "f22_net", "f23_net", "f24_net", "f25_net", "f26_net", "f27_net", "f28_net", "f8_net", "f9_net", "gnarogrim_net", "maerwynn_net", "s10_eu", "s11_eu", "s12_eu", "s13_eu", "s14_eu", "s15_eu", "s16_eu", "s17_eu", "s18_eu", "s19_eu", "s20_eu", "s21_eu", "s22_eu", "s23_eu", "s24_eu", "s25_eu", "s26_eu", "s27_eu", "s28_eu", "s29_eu", "s30_eu", "s5_eu", "s6_eu", "s7_eu", "s8_eu", "s9_eu", "stumblesteppe_net"];
const currentEntries = namespaces.map((server,i)=>({...entry(`controlled-${i}`,server,currentTime),sha256:(i+10).toString(16).padStart(64,"0")}));
const entries = [...currentEntries, month, baseline, earlier];
api.context={status:"complete",catalog:null,manifests:[{schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(currentTime).toISOString(),scanCount:entries.length,serverCount:45,scans:entries,
 toplists:{schemaVersion:1,current:Object.fromEntries(currentEntries.map(e=>[e.server,e.id])),monthly:{"2026-07":{f8_net:earlier.id},"2026-08":{f8_net:baseline.id},"2026-09":{f8_net:month.id},"2026-10":{f8_net:currentEntries.find(e=>e.server==="f8_net")!.id}}}}],manifestUrlsByYear:{2026:current.manifestUrl},entries:currentEntries,selections:[],serverOptions:[],issues:[]};
api.acquire=(selected:ScanArchiveEntry[], options:any)=>acquireExplicitLocalFirstArchiveScans(selected,{...options,dependencies:{downloadArchiveEntry:async(e:ScanArchiveEntry)=>{
 api.rawDownloads.push(e.id);return {content:JSON.stringify(raw(e))};}}});
const nativeFetch = window.fetch.bind(window);
window.fetch=((input:RequestInfo|URL,init?:RequestInit)=>{if(String(input).includes('.search.'))api.indexRequests.push(String(input));return nativeFetch(input,init);}) as typeof fetch;
const NativeWorker=window.Worker;
window.Worker=class extends NativeWorker {
 private receiver: ((event:MessageEvent)=>void)|null=null;
 private requests=new Map<number,any>();
 constructor(url:string|URL,options?:WorkerOptions){super(url,options);
  const workerURL=String(url);
  Object.defineProperty(this,'onmessage',{get:()=>this.receiver,set:value=>{this.receiver=value;}});
  super.addEventListener('message',event=>{
   const request=this.requests.get(event.data.requestId);api.responses.push({request,response:event.data,bytes:JSON.stringify(event.data).length,at:performance.now()});
   const deliver=()=>this.receiver?.call(this,event);
   if(request && api.compareRequestIds.has(request.requestId)){api.compareHeld.push({request:structuredClone(request),response:structuredClone(event.data),deliver});return;}
   if(request && (request.type==='view' && (request.nameFilter===api.holdViewText || api.holdWindow && request.windowStart>0) || request.type==='search' && api.holdSearch))api.held.push(deliver);else deliver();
  });
  api.messages.push({type:'worker-start',url:workerURL});
 }
 postMessage(message:any,transfer:Transferable[]|StructuredSerializeOptions=[]){
  if(api.holdCompareNext&&message.type==='view'&&message.nameFilter==='FarAway'){api.holdCompareNext=false;api.compareRequestIds.add(message.requestId);}
  this.requests.set(message.requestId,message);api.messages.push({type:message.type,requestId:message.requestId,nameFilter:message.nameFilter,datasetId:message.datasetId,contentRevision:message.contentRevision});
  if(Array.isArray(transfer))super.postMessage(message,transfer);else super.postMessage(message,transfer);
 }
};
const root=createRoot(document.getElementById('root')!);
async function mount(state?:any){await act(async()=>root.render(<MemoryRouter key={state?.key??'normal'} initialEntries={[{pathname:'/data-hub/toplist',state:state?.value}]}><Toplist/></MemoryRouter>));await until(()=>!!api.filters,'filters');}
const click=async(element:Element|undefined|null)=>{assert(element,'missing control');await act(async()=>(element as HTMLElement).click());};
const mode=async(value:string)=>{await act(async()=>{const el=document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')!;assert(el,'missing mode select');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});};
const tab=async(value:string)=>click([...document.querySelectorAll('button[role="tab"]')].find(el=>el.textContent===value));
const input=()=>document.querySelector<HTMLInputElement>('#sheet-search, #guild-hub-local-toplist-search')!;
async function text(value:string){await act(async()=>{const el=input();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
const ids=()=>[...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')].map(el=>el.dataset.sfhIdentifier!);
async function settled(){await until(()=>!document.querySelector('[data-local-toplist-progress]')&&api.responses.some((r:any)=>r.request?.type==='view'),'table settled');await act(async()=>{await frame();await frame();});}
async function expectRows(expected:string[]){await settled();assert(JSON.stringify([...new Set(ids())].sort())===JSON.stringify(expected.sort()),`rows expected ${expected}, got ${ids()}`);}
const costs=()=>({raw:api.rawDownloads.length,index:api.indexRequests.length,init:api.messages.filter((m:any)=>m.type==='init').length,
 derivations:api.messages.filter((m:any)=>m.type==='derive-toplists').length,preparations:api.preparations.length,loads:api.loads.length,acks:api.acks.length});
async function selectMonth(id:string,value:string){await act(async()=>{const el=document.getElementById(id) as HTMLSelectElement;assert(el&&[...el.options].some(o=>o.value===value),`month option ${id} ${value}`);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});}
const tableSnapshot=()=>({rows:[...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')].map(el=>({id:el.dataset.sfhIdentifier,text:el.innerText})),count:document.body.innerText.match(/Ready[^\n]*rows/)?.[0],loading:!!document.querySelector('[data-local-toplist-progress]'),context:structuredClone(api.viewContext)});
const latestView=()=>api.responses.findLast((r:any)=>r.request?.type==='view'&&r.request.tab==='players');
const scroller=()=>document.querySelector<HTMLElement>('.toplists-table-scroll, .toplists-mobile-list')!;
const sortedIds=()=>[...new Set(ids())].sort();
async function count(expected:number){await until(()=>latestView()?.response.totalRows===expected&&!document.querySelector('[data-local-toplist-progress]')&&ids().length>0,`full result count ${expected}`);}
const record=(label:string,start:number,before:ReturnType<typeof costs>)=>api.measurements.push({label,ms:performance.now()-start,total:latestView()?.response.totalRows,responseRows:latestView()?.response.playerRows.length,responseBytes:latestView()?.bytes,domRows:ids().length,delta:Object.fromEntries(Object.entries(costs()).map(([k,v])=>[k,v-before[k as keyof typeof before]]))});
async function scrollLast(expected:number){
 const before=costs(),start=performance.now();
 await act(async()=>{const el=scroller();el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
 await until(()=>latestView()?.response.playerRows.at(-1)?.tableRank===expected&&[...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')].some(el=>new RegExp(`^#?${expected}\\b`).test(el.innerText.trim())),'last actual DOM row');
 assert(ids().length<=70,'bounded DOM after end scroll');record('scroll last',start,before);
}
async function searchJump(identifier:string){
 const before=costs(),start=performance.now();await text('FarAway');
 await until(()=>!!document.querySelector(`[data-toplist-search-identifier="${identifier}"]`),'archive search result outside initial window');
 const result=document.querySelector<HTMLButtonElement>(`[data-toplist-search-identifier="${identifier}"]`)!;assert(!result.disabled,'full-cohort hit enabled');await click(result);
 await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]')&&!!document.querySelector(`[data-sfh-identifier="${identifier}"]`),'real visible highlighted DOM ACK');
 record('search jump',start,before);assert(ids().length<=70,'jump keeps DOM bounded');
}
api.run=async()=>{
 const results:string[]=[];
 const firstEntry=currentEntries.find(e=>e.server==='f8_net')!;
 assert(firstEntry,'controlled F8');
 pageContextStore.selectServers(['F8']);
 for(const e of entries)await putSfDataHubArchiveSearchIndexCache(e,{...searchIndexPayloadForScanArchiveEntry(e,raw(e)),schemaVersion:1});
 const initialStart=performance.now(),initialCost=costs();await mount();await tab('Players');await count(1205);record('single server initial',initialStart,initialCost);
 assert(latestView().response.playerRows.length<=200,'bounded first response');assert(!ids().includes('f8_net_p1205'),'target outside initial DOM');
 await searchJump('f8_net_p1205');assert(document.querySelector('[data-sfh-identifier="f8_net_p1205"] td')?.textContent==='1205','rank beyond per-server 1000 preserved');
 await text('');await scrollLast(1205);results.push('Single server >1000; enabled archive search, actual DOM ACK and last row without name filter');
 const before=costs(),start=performance.now();await mode('filter');await text('BeyondServer');await count(1);
 assert(document.querySelector('[data-sfh-identifier="f8_net_p1101"] td')?.textContent==='1101','filter original rank');record('filter behind old limit',start,before);
 await text('FarAway');await count(1);await click(document.querySelector('[data-proof="compare"]'));await selectMonth('toplists-compare-from','2026-08');await selectMonth('toplists-compare-to','2026-09');await count(1);
 assert(document.querySelector('[data-sfh-identifier="f8_net_p1205"] td')?.textContent==='1205','Compare full target rank');assert(document.body.innerText.includes('Historical Guild'),'Compare target membership');
 await click(document.querySelector('[data-proof="normal"]'));await count(1);await mode('search');await text('');await count(1205);
 await act(async()=>api.filters.setServers(['F8','EU5']));await count(2410);await act(async()=>api.filters.setServers(['F8']));await count(1205);
 results.push('Filter original rank, full Compare target side, server addition/removal');
 // An actual reply for a different window is held at native Worker delivery.
 api.holdWindow=true;await act(async()=>{scroller().scrollTop=300*64;scroller().dispatchEvent(new Event('scroll'));});await until(()=>api.held.length>0,'held genuine slice');
 await mode('filter');await text('BeyondServer');await count(1);const beforeRelease=sortedIds(),countBefore=latestView().response.totalRows;
 api.holdWindow=false;await act(async()=>{api.held.splice(0).forEach((deliver:()=>void)=>deliver());await frame();await frame();});
 assert(JSON.stringify(sortedIds())===JSON.stringify(beforeRelease),'late slice cannot replace new filter rows');assert(countBefore===1&&!document.querySelector('[data-local-toplist-progress]'),'late slice cannot overwrite result count or loading');
 results.push('Genuine held window reply discarded after filter context changes');
 await mode('search');await text('');const largeBefore=costs(),largeStart=performance.now();
 await act(async()=>api.filters.setServers(currentEntries.map(e=>resolveServer(e.server)!.code)));await count(45*1205);record('45 servers initial',largeStart,largeBefore);
 assert(api.loads.at(-1).result.playerRows.length===54225,'all controlled raw players in prepared context');assert(ids().length<=70,'45 servers bounded DOM');
 const warm=costs();await scrollLast(54225);await act(async()=>{scroller().scrollTop=0;scroller().dispatchEvent(new Event('scroll'));});await until(()=>ids().some(id=>id.endsWith('_p1')),'return to first window');
 assert(costs().init===warm.init&&costs().raw===warm.raw&&costs().derivations===warm.derivations,'warm scrolling has zero reinitialization/download/derivation');
 assert(api.responses.filter((r:any)=>r.request?.type==='view'&&r.request.tab==='players').every((r:any)=>r.response.playerRows.length<=200),'all actual player window responses bounded');
 results.push('54225 controlled players on 45 servers; end and start reachable; bounded responses/DOM; zero warm data work');
 api.results=results;return results;
};
api.visual=async(width:number)=>{
 await act(async()=>{await frame();await frame();});await mode('search');await text('');await count(54225);
 if(api.filters.bottomFilterOpen)await act(async()=>api.filters.setBottomFilterOpen(false));
 await scrollLast(54225);
 const last=[...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')].find(el=>/^#?54225\b/.test(el.innerText.trim()))!;
 assert(last,'actual final rank is mounted in the DOM');
 const before=costs();assert(ids().length<=70,'bounded desktop/mobile rows');
 if(width===390){await click(last.querySelector('button.toplists-mobile-summary'));await act(async()=>{await frame();await frame();});assert(document.querySelector('[aria-expanded="true"]'),'mobile row still expands');}
 return {width,total:latestView().response.totalRows,domRows:ids().length,responseRows:latestView().response.playerRows.length,last:last.innerText,scroller:{height:scroller().clientHeight,scrollHeight:scroller().scrollHeight},warm:costs().raw===before.raw&&costs().init===before.init};
};
api.ready=true;
async function oldEnd(){
 for(let i=0;i<35;i++){
  await act(async()=>{if(document.querySelector('.toplists-table-scroll')){scroller().scrollTop=scroller().scrollHeight;scroller().dispatchEvent(new Event('scroll'));}else window.scrollTo(0,document.documentElement.scrollHeight);await frame();await pause();});
  if([...document.querySelectorAll<HTMLElement>('[data-sfh-identifier]')].some(el=>/^#?1000\b/.test(el.innerText.trim())))return;
 }
 throw Error('old list end not reached');
}
api.runBefore=async()=>{
 pageContextStore.selectServers(currentEntries.map(e=>resolveServer(e.server)!.code));
 for(const e of entries)await putSfDataHubArchiveSearchIndexCache(e,{...searchIndexPayloadForScanArchiveEntry(e,raw(e)),schemaVersion:1});
 const before=costs(),start=performance.now();await mount();await tab('Players');await count(1000);record('old 45 servers initial',start,before);
 assert(api.loads.at(-1).result.playerRows.length===54225,'same full prepared old cohort');
 assert(latestView().response.playerRows.length===1000,'authentic old response size');
 let cost=costs(),time=performance.now();await oldEnd();record('old scroll to cap',time,cost);
 cost=costs();time=performance.now();await text('FarAway');await until(()=>!!document.querySelector('[data-toplist-search-identifier="f8_net_p1205"]'),'old disabled search');
 assert(document.querySelector<HTMLButtonElement>('[data-toplist-search-identifier="f8_net_p1205"]')!.disabled,'old target excluded');record('old search disabled',time,cost);
 cost=costs();time=performance.now();await mode('filter');await text('BeyondServer');await count(45);record('old filter',time,cost);
 await mode('search');await text('');await count(1000);return ['Authentic saved W27: same 54225 prepared players; truncated output 1000; FarAway search disabled; full-context name filter finds 45'];
};
api.visualBefore=async(width:number)=>{
 await act(async()=>{await frame();await frame();});await oldEnd();return {width,total:latestView().response.totalRows,domRows:ids().length,responseRows:latestView().response.playerRows.length,scroller:{height:scroller().clientHeight,scrollHeight:scroller().scrollHeight}};
};
api.runWarm=async(legacy:boolean)=>{
 const before=costs(),start=performance.now();pageContextStore.selectServers(currentEntries.map(e=>resolveServer(e.server)!.code));
 await mount();await tab('Players');await count(legacy?1000:54225);record('warm 45 servers first rows',start,before);
 assert(costs().raw===0&&costs().derivations===0,'warm initial reuses all existing sources/derived');
 let cost=costs(),time=performance.now();await mode('filter');await text('BeyondServer');await count(45);record('warm 45 servers filter',time,cost);
 await mode('search');await text('');await count(legacy?1000:54225);
 if(legacy){cost=costs();time=performance.now();await text('FarAway');await until(()=>!!document.querySelector('[data-toplist-search-identifier="f8_net_p1205"]'),'warm old target');assert(document.querySelector<HTMLButtonElement>('[data-toplist-search-identifier="f8_net_p1205"]')!.disabled,'old target remains excluded');record('warm old search disabled',time,cost);await text('');await oldEnd();}
 else{await searchJump('f8_net_p1205');await text('');await scrollLast(54225);}
 return ['Same 54225 prepared players after ordinary fixture reload; measured warm first rows, full-context filter, search and scroll'];
};

api.runExportOnly=async()=>{
 pageContextStore.selectServers(['F8']);await mount();await tab('Players');await count(1205);await scrollLast(1205);
 const before=costs();await click([...document.querySelectorAll('button')].find(el=>el.textContent==='Export PNG'));
 await until(()=>!!api.exportRows,'actual parent freezes export rows');
 assert(api.exportRows.length===1000&&api.exportRows[0].identifier==='f8_net_p1'&&api.exportRows.at(-1).identifier==='f8_net_p1000','export keeps the first cohort when invoked at the end of the list');
 assert(Object.keys(api.exportWindow.decor).some(key=>key.endsWith('_p1205')),'preset retains full-view decoration evidence outside export rows');
 const after=costs();assert(after.init===before.init&&after.raw===before.raw&&after.derivations===before.derivations,'export reuses the prepared dataset');
 assert(api.responses.filter((r:any)=>r.request?.type==='view'&&r.request.tab==='players').every((r:any)=>r.response.playerRows.length<=200),'export requests stay bounded');
 api.exportCost={init:after.init-before.init,raw:after.raw-before.raw,derivations:after.derivations-before.derivations};return ['Explicit PNG export at end of list: first 1000 frozen in <=200-row responses; complete-context decor retained; no downloads/derivation/reinit; existing 50/100/150 amounts unchanged'];
};
