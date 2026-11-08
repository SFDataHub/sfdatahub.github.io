import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
  for (let i = 0; i < 1000; i++) { if (check()) return; await act(async () => { await pause(); }); }
  throw Error(`${message}: ${document.body.innerText.slice(-1500)}`);
}
const api: any = { ready: false, loads: [], acks: [], publicCalls: 0, messages: [], responses: [], rawDownloads: [], indexRequests: [], preparations: [], errors: [], held: [], holdViewText: null, holdSearch: false, holdCompareNext: false, compareHeld: [], compareRequestIds: new Set<number>(), viewCommits: [], viewDecisions: [], clientDeliveries: [] };
(globalThis as any).w08 = api;
(globalThis as any).w27 = api;
window.addEventListener("unhandledrejection", event => api.errors.push(String(event.reason)));
const currentTime = Date.UTC(2026, 9, 6), monthTime = Date.UTC(2026, 8, 6), baselineTime = Date.UTC(2026, 7, 6);
const entry = (id: string, server: string, timestamp: number): ScanArchiveEntry => ({ id, server, timestamp, timestampUtc: new Date(timestamp).toISOString(),
  path: `${id}.json.gz`, format: "sftools.raw.v1", compression: "gzip", sha256: id.slice(0,1).repeat(64), compressedBytes: 1, uncompressedBytes: 1,
  searchIndex: { schemaVersion: 1, path: `${id}.search.json.gz`, sha256: "f".repeat(64), compressedBytes: 1, uncompressedBytes: 1, playerCount: 1005, groupCount: 3 },
  playerCount: 1005, groupCount: 3, archiveYear: 2026, manifestRevision: 1, manifestUrl: `${location.origin}/w27-manifest.json`, fileUrl: `${location.origin}/${id}.gz` });
const current = entry("ccccurrent", "f8_net", currentTime), second = entry("ddddsecond", "s1_eu", currentTime), month = entry("aaaamonth", "f8_net", monthTime), baseline = entry("bbbbbaseline", "f8_net", baselineTime), earlier = entry("eeeeearlier", "f8_net", Date.UTC(2026, 6, 6));
const raw = (e: ScanArchiveEntry) => {
 const historic = e.timestamp !== currentTime, guildName = historic ? "Historical Guild" : "Alpha Guild";
 const base = e.timestamp === currentTime ? 10000 : e.timestamp === monthTime ? 9000 : e.timestamp === baselineTime ? 8000 : 7000;
 return { players: Array.from({length:1005},(_,i)=>({identifier:`${e.server}_p${i+1}`,prefix:e.server,timestamp:e.timestamp,
  name:i===1004?"FarAway":i===1003?"Solo":i===1002?"AlphaPerson":`Player${String(i).padStart(4,"0")}`,
  guildIdentifier:i===1003?null:`${e.server}_g${i===1002?2:1}`,guildName:i===1003?null:i===1002?"Other Guild":guildName,
  class: historic ? 2 : i===1002?2:1,level:100+i,rank:i+1,
  values:{Base:base-i,"Base Strength":base-i,"Base Intelligence":base-i,"Base Constitution":500,Attribute:15000-i,Constitution:750}})),
  groups:[{identifier:`${e.server}_g1`,prefix:e.server,timestamp:e.timestamp,name:guildName,rank:1,memberCount:1003,avgLevel:500},
   {identifier:`${e.server}_g2`,prefix:e.server,timestamp:e.timestamp,name:"Other Guild",rank:2,memberCount:1,avgLevel:200},
   {identifier:`${e.server}_g3`,prefix:e.server,timestamp:e.timestamp,name:"Empty Guild",rank:3,memberCount:0,avgLevel:100}]};
};
const entries = [current, second, month, baseline, earlier];
api.context={status:"complete",catalog:null,manifests:[{schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(currentTime).toISOString(),scanCount:5,serverCount:2,scans:entries,
 toplists:{schemaVersion:1,current:{f8_net:current.id,s1_eu:second.id},monthly:{"2026-07":{f8_net:earlier.id},"2026-08":{f8_net:baseline.id},"2026-09":{f8_net:month.id},"2026-10":{f8_net:current.id}}}}],manifestUrlsByYear:{2026:current.manifestUrl},entries:[current,second],selections:[],serverOptions:[],issues:[]};
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
   const request=this.requests.get(event.data.requestId);api.responses.push({request,response:event.data});
   const deliver=()=>this.receiver?.call(this,event);
   if(request && api.compareRequestIds.has(request.requestId)){api.compareHeld.push({request:structuredClone(request),response:structuredClone(event.data),deliver});return;}
   if(request && (request.type==='view' && request.nameFilter===api.holdViewText || request.type==='search' && api.holdSearch))api.held.push(deliver);else deliver();
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
async function compareRace(kind:'target'|'baseline'|'off'){
 await tab('Players');await text('FarAway');await click(document.querySelector('[data-proof="compare"]'));
 await selectMonth('toplists-compare-from','2026-08');await selectMonth('toplists-compare-to','2026-09');await expectRows(['f8_net_p1005']);
 assert(api.compareState?.key?.includes('2026-09'),'old Compare ready');
 const oldReady=tableSnapshot();
 await text('Solo');await expectRows(['f8_net_p1004']);
 api.holdCompareNext=true;await text('FarAway');await until(()=>api.compareHeld.length===1,'actual held Compare Filter response');
 const held=api.compareHeld[0];assert(held.response.ok&&held.response.type==='view'&&held.response.playerRows[0]?.identifier==='f8_net_p1005','genuine old filter result');
 const oldResponseBytes=JSON.stringify(held.response);
 const header=document.querySelector('.toplists-table-header, [data-local-toplist-header]')!.getBoundingClientRect();
 const progress=document.querySelector('[data-local-toplist-progress]')!.getBoundingClientRect();assert(progress.top>=header.bottom-2,'held Compare progress remains below header');
 if(kind==='target')await selectMonth('toplists-compare-to','2026-10');
 else if(kind==='baseline')await selectMonth('toplists-compare-from','2026-07');
 else await click(document.querySelector('[data-proof="normal"]'));
 await expectRows(['f8_net_p1005']);
 await until(()=>api.viewContext?.requestKey!==oldReady.context.requestKey,'new Compare context key');
 const beforeRelease=tableSnapshot();
 assert(!beforeRelease.loading&&beforeRelease.count?.includes('1 rows'),'new context ready before release');
 assert(beforeRelease.rows[0].text!==oldReady.rows[0].text,'old/new contexts have different actual comparison values or guild');
 if(kind==='baseline'){
  assert(beforeRelease.context.datasetId===oldReady.context.datasetId,'baseline-only keeps target dataset ID');
  assert(beforeRelease.context.contentRevision===oldReady.context.contentRevision,'baseline-only keeps target content revision');
 }
 if(kind==='target')assert(beforeRelease.context.datasetId!==oldReady.context.datasetId,'target month changes target dataset');
 const commitCount=api.viewCommits.length;
 assert(JSON.stringify(held.response)===oldResponseBytes,'held response unchanged');
 api.compareHeld.splice(0);api.compareRequestIds.delete(held.request.requestId);
 await act(async()=>{held.deliver();await frame();await frame();await pause();});await expectRows(['f8_net_p1005']);
 const afterRelease=tableSnapshot();
 assert(JSON.stringify(afterRelease)===JSON.stringify(beforeRelease),'old reply cannot alter rows/ranks/values/count/loading/current request');
 assert(api.viewCommits.length===commitCount,'old reply cannot commit any View state');
 const delivery=api.clientDeliveries.findLast((d:any)=>d.requestId===held.request.requestId);
 assert(delivery,'actual old reply delivered to production client');
 api.compareRaces.push({kind,oldRequest:held.request,oldResponse:held.response,oldReady,beforeRelease,afterRelease,unchangedReply:true,noViewCommit:true,delivery,decisions:api.viewDecisions.filter((d:any)=>d.requestId===held.request.requestId)});
}
api.run=async()=>{
 const results:string[]=[];
 pageContextStore.selectServers(['F8']);
 for(const e of entries)await putSfDataHubArchiveSearchIndexCache(e,{...searchIndexPayloadForScanArchiveEntry(e,raw(e)),schemaVersion:1});
 await mount();await settled();
 assert(document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')?.value==='search','Search default');assert(input().placeholder==='enter a name','neutral Search placeholder');
 await tab('Players');await settled();
 const first=document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1"]')!;
 api.headerTop=first.closest('table')?.querySelector('thead')?.getBoundingClientRect().top;
 assert(!ids().includes('f8_net_p1005'),'FarAway is outside displayed BaseTop1000');
 await text('Player0001');await act(async()=>input().focus());
 await until(()=>!!document.querySelector('[data-toplist-search-identifier="f8_net_p2"]'),'W26 search results');
 await click(document.querySelector('[data-toplist-search-identifier="f8_net_p2"]'));
 await until(()=>!!document.querySelector('[data-toplist-target-status="visibleAck"]'),'Search DOM ACK');
 results.push('Search default; W26 explicit selection yields a bound DOM ACK');
 const before=costs();api.filterCostBaseline=before;
 await mode('filter');assert(input().value==='Player0001','mode retains text');await expectRows(['f8_net_p2']);
 assert(!document.getElementById('guild-hub-local-toplist-search-results'),'no Search panel in Filter');
 await text('FarAway');await expectRows(['f8_net_p1005']);
 const far=document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1005"]')!;
 assert(far.querySelector('td')?.textContent==='1005','rank 1005 preserved');
 assert(!document.querySelector('.toplists-row--focused'),'Filter never marks a target');
 results.push('Filter finds the former out-of-limit player with original rank 1005');
 await tab('Guilds');await expectRows(['f8__1']);
 await text('Other Guild');await expectRows(['f8__2']);
 await tab('Players');await expectRows(['f8_net_p1003']);
 await text('AlphaPerson');await expectRows(['f8_net_p1003']);
 await tab('Guilds');await expectRows(['f8__2']);
 await text('Alpha');await expectRows(['f8__1','f8__2']);
 await tab('Players');await settled();
 assert(api.responses.at(-1).response.totalRows===1004,'full name union retained');
 assert(new Set(ids()).size===ids().length,'union has no duplicated rows');
 await text('Solo');await expectRows(['f8_net_p1004']);await tab('Guilds');await expectRows([]);
 results.push('Player/guild matches, unions, no duplicate rows, and players without guilds');
 await tab('Players');await text('FarAway');await expectRows(['f8_net_p1005']);
 await act(async()=>api.filters.setClasses(['mage']));await expectRows([]);
 assert(api.filters.classes[0]==='mage','class selection retained');
 await act(async()=>api.filters.setClasses([]));await expectRows(['f8_net_p1005']);
 await act(async()=>api.filters.setGuilds(['Other Guild']));await expectRows([]);
 await act(async()=>api.filters.setGuilds([]));await expectRows(['f8_net_p1005']);
 await act(async()=>api.filters.setFavoritesOnly(true));await expectRows([]);await act(async()=>api.filters.setFavoritesOnly(false));await expectRows(['f8_net_p1005']);
 api.filterCosts=Object.fromEntries(Object.entries(costs()).map(([key,value])=>[key,value-(before as any)[key]]));
 assert(Object.values(api.filterCosts).every(value=>value===0),`Filter costs ${JSON.stringify(api.filterCosts)}`);
 assert(JSON.stringify(pageContextStore.get('local-toplist').servers)==='["F8"]','no server addition');
 results.push('Filter input/mode caused zero index/raw downloads, inits, derivations, profile preparations, loads or ACKs');
 // A real worker response is held and delivered after newer input, clear and mode changes.
 api.holdViewText='AlphaPerson';await text('AlphaPerson');await until(()=>api.held.length>0,'held old filter view');
 assert(document.querySelector('[data-local-toplist-progress]'),'filter pending has W18 progress under header');
 assert(!document.body.innerText.includes('No results'),'pending is not final empty');
 await text('Solo');await expectRows(['f8_net_p1004']);api.holdViewText=null;api.held.splice(0).forEach((deliver:()=>void)=>deliver());await expectRows(['f8_net_p1004']);
 api.holdViewText='FarAway';await text('FarAway');await until(()=>api.held.length>0,'hold before clear');await text('');await settled();
 const normalIds=ids();api.holdViewText=null;api.held.splice(0).forEach((deliver:()=>void)=>deliver());await settled();assert(JSON.stringify(ids())===JSON.stringify(normalIds),'clear rejects old view');
 await text('FarAway');await expectRows(['f8_net_p1005']);await mode('search');assert(input().value==='FarAway','return to Search retains text');await settled();assert(!ids().includes('f8_net_p1005'),'Search removes the name filter');
 api.holdSearch=true;await text('Player0002');await act(async()=>input().focus());await until(()=>api.held.length>0,'hold old Search');
 await mode('filter');await expectRows(['f8_net_p3']);api.holdSearch=false;api.held.splice(0).forEach((deliver:()=>void)=>deliver());await expectRows(['f8_net_p3']);assert(!document.getElementById('guild-hub-local-toplist-search-results'),'stale Search response cannot reopen results');
 // A selected target that has not reached DOM ACK is invalidated by mode.
 await mode('search');await text('Player0004');await act(async()=>input().focus());
 await until(()=>!!document.querySelector('[data-toplist-search-identifier="f8_net_p5"]'),'pending Search result');
 const hidden=document.createElement('style');hidden.textContent='[data-sfh-identifier="f8_net_p5"]{visibility:hidden!important}';document.head.append(hidden);
 const ackBefore=api.acks.length;await click(document.querySelector('[data-toplist-search-identifier="f8_net_p5"]'));
 await until(()=>!!document.querySelector('[data-sfh-identifier="f8_net_p5"].toplists-row--focused'),'unacknowledged target');
 await mode('filter');hidden.remove();await expectRows(['f8_net_p5']);
 assert(api.acks.length===ackBefore&&!document.querySelector('.toplists-row--focused'),'pending target/old ACK invalidated');
 results.push('Real delayed Filter/Search replies and unacknowledged targets cannot overwrite newer input, Clear or mode');
 await text('FarAway');await expectRows(['f8_net_p1005']);
 api.holdViewText='Solo';await text('Solo');await until(()=>api.held.length>0,'old server-scope filter');
 api.holdViewText=null;await act(async()=>api.filters.setServers(['F8','EU1']));await expectRows(['f8_net_p1004','s1_eu_p1004']);
 api.held.splice(0).forEach((deliver:()=>void)=>deliver());await expectRows(['f8_net_p1004','s1_eu_p1004']);
 await text('FarAway');await expectRows(['f8_net_p1005','s1_eu_p1005']);
 await tab('Guilds');await expectRows(['f8__1','eu1__1']);
 await act(async()=>api.filters.setServers([]));await settled();assert(document.body.innerText.includes('Please select at least one server.'),'empty scope keeps selection prompt');
 await act(async()=>api.filters.setServers(['F8']));await expectRows(['f8__1']);
 results.push('Equal names on different selected servers remain distinct; empty scope retains prompt');
 await click(document.querySelector('[data-proof="compare"]'));await click(document.querySelector('[data-proof="from"]'));await click(document.querySelector('[data-proof="to"]'));await expectRows(['f8__1']);
 assert(document.body.innerText.includes('Historical Guild'),'Compare uses historical target guild');
 await tab('Players');await expectRows(['f8_net_p1005']);
 const compareRow=document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1005"]')!;
 assert(compareRow.querySelector('td')?.textContent==='1005','Compare rank retained');
 api.compareCellText=compareRow.innerText;
 await text('Historical Guild');await settled();assert(api.responses.at(-1).response.totalRows===1003,'guild name matches Compare members');
 await text('FarAway');await expectRows(['f8_net_p1005']);assert(document.querySelector<HTMLElement>('[data-sfh-identifier="f8_net_p1005"]')!.innerText===api.compareCellText,'Compare values retained');
 await click(document.querySelector('[data-proof="normal"]'));await expectRows(['f8_net_p1005']);await tab('Guilds');await expectRows(['f8__1']);assert(document.body.innerText.includes('Alpha Guild'),'Current uses Current guild');
 results.push('Compare target membership, ranks and comparison cell values preserved');
 api.compareRaces=[];for(const kind of ['target','baseline','off'] as const)await compareRace(kind);
 results.push('Held native Filter replies after target month, baseline-only and Compare off cannot commit or change ready rows/ranks/values/count/loading');
 await click(document.querySelector('[data-proof="normal"]'));await tab('Guilds');await text('FarAway');await expectRows(['f8__1']);
 // Enter a true explicit single-month table with the existing Hub command contract.
 const command={version:1,kind:'player',server:'F8',identifiers:['f8_net_p2'],label:'Player0001',month:'2026-09',id:'w27-month'};
 api.holdViewText='AlphaPerson';await text('AlphaPerson');await until(()=>api.held.length>0,'old view before unmount/month');
 api.holdViewText=null;await mount({key:'month',value:{hubToplistTarget:command}});await settled();
 api.held.splice(0).forEach((deliver:()=>void)=>deliver());await settled();
 assert(document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')?.value==='search','late Filter after unmount/month cannot change mode');
 assert(document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')?.value==='search','remount defaults to Search, mode is not persisted');
 await mode('filter');await text('FarAway');await expectRows(['f8_net_p1005']);
 await tab('Guilds');await expectRows(['f8__1']);assert(document.body.innerText.includes('Historical Guild'),'single month uses historical assignment');
 results.push('Explicit single-month assignment; old server-context and unmounted Filter replies rejected; remount defaults to Search');
 api.results=results;return results;
};
api.visual=async(width:number)=>{
 await mode('filter');
 await tab('Players');await text('FarAway');await expectRows(['f8_net_p1005']);
 if(width===390){await act(async()=>{api.filters.setFilterMode('sheet');api.filters.setBottomFilterOpen(true);});await until(()=>!!document.getElementById('sheet-search'),'mobile sheet');}
 const stableHeader=document.querySelector('.toplists-table-header, [data-local-toplist-header]')!.getBoundingClientRect().top;
 const stableBody=document.querySelector('.toplists-table-scroll, [data-local-toplist-body]')!.getBoundingClientRect().top;
 api.holdViewText='Solo';await text('Solo');await until(()=>api.held.length>0,'visual pending');
 const header=document.querySelector('.toplists-table-header, [data-local-toplist-header]') as HTMLElement;
 const progress=document.querySelector('[data-local-toplist-progress]') as HTMLElement;
 await act(async()=>input().focus());
 const select=document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')!;
 const field=select.closest('label')!.parentElement!;
 const glyph=field.querySelector('svg')!;
 const rect=(el:Element)=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
 const dimensions={field:rect(field),glyph:rect(glyph),input:rect(input()),select:rect(select)};
 assert(dimensions.field.left>=0&&dimensions.field.right<=width,'shared field fits viewport');
 assert(dimensions.glyph.right<dimensions.input.left&&dimensions.input.right<dimensions.select.left,'icon, text and select do not overlap');
 assert(dimensions.glyph.width===18&&dimensions.glyph.height===18&&dimensions.field.height===40,'dashboard icon and field dimensions');
 assert([glyph,input(),select].every(el=>el.parentElement===field||el.parentElement?.parentElement===field),'one field contains all controls');
 assert(input().placeholder==='enter a name','neutral placeholder in Filter');
 const style=getComputedStyle(field);
 assert(style.borderRadius==='10px'&&style.outlineWidth==='1px'&&getComputedStyle(glyph.parentElement!).color==='rgb(176, 196, 217)','dashboard radius, focus and icon color');
 assert(header.getBoundingClientRect().top===stableHeader&&document.querySelector('.toplists-table-scroll, [data-local-toplist-body]')!.getBoundingClientRect().top===stableBody,'filter pending preserves header/body positions');
 assert(progress&&header&&progress.getBoundingClientRect().top>=header.getBoundingClientRect().bottom-2,'W18 progress stays below header');
 api.positions={width,dimensions,headerTop:header.getBoundingClientRect().top,headerBottom:header.getBoundingClientRect().bottom,progressTop:progress.getBoundingClientRect().top};
 api.holdViewText=null;api.held.splice(0).forEach((deliver:()=>void)=>deliver());await expectRows(['f8_net_p1004']);
 if(width===390){await mode('search');assert(input().value==='Solo','mobile text retained');assert(input().placeholder==='enter a name','neutral placeholder in Search');await mode('filter');await expectRows(['f8_net_p1004']);}
 await text('FarAway');await expectRows(['f8_net_p1005']);
 return api.positions;
};
api.keyboardMode=async(value:string)=>{
 await until(()=>document.querySelector<HTMLSelectElement>('[data-toplist-search-mode]')?.value===value,'native keyboard mode change');
 assert(input().value==='FarAway','keyboard mode switch preserves text');
 if(value==='filter')await expectRows(['f8_net_p1005']);else await settled();
};
api.fieldPreview=async()=>{
 await text('');await settled();await act(async()=>input().focus());
 assert(input().placeholder==='enter a name'&&input().value==='','visible neutral placeholder');
 const r=input().parentElement!.getBoundingClientRect();
 return {x:r.left-4,y:r.top-4,width:r.width+8,height:r.height+8,scale:1};
};
api.ready=true;
