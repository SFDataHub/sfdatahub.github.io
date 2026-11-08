import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { dataHubRuntimeAudit as audit } from '../../../../src/lib/data-hub/runtimeAudit';
import { loadScanArchiveSearchIndexSet as load } from '../../../../src/lib/scanArchive/searchIndexService';
import { deleteGuildHubArchiveSearchIndexCache } from '../../../../src/lib/guilds/localScanLibrary';
import { useLocalToplistArchiveSearch } from '../../../../src/pages/DataHub/useLocalToplistArchiveSearch';
import type { LocalToplistArchiveContext } from '../../../../src/pages/DataHub/localToplistPageModel';
const g=globalThis as any;
const proof:any=g.w33={ready:false,headlines:[],depth:0,methods:{},messages:[],hook:null};
let measuring=false;
const originalGroup=console.groupCollapsed.bind(console),originalEnd=console.groupEnd.bind(console);
console.groupCollapsed=(...args:any[])=>{if(!proof.depth)proof.headlines.push(String(args[0]));proof.depth++;originalGroup(...args);};
console.groupEnd=()=>{proof.depth--;if(proof.depth<0)throw Error('Unbalanced console group');originalEnd();};
for(const proto of [IDBObjectStore.prototype,IDBIndex.prototype] as any[]){for(const method of ['get','getAll','getKey','getAllKeys','count','put','add','delete','clear','openCursor','openKeyCursor']){const original=proto[method];if(!original)continue;proto[method]=function(...args:any[]){if(measuring){const name=(this.objectStore?.name??this.name)+':'+method;proof.methods[name]=(proof.methods[name]??0)+1;}return original.apply(this,args);};}}
const NativeWorker=Worker;
g.Worker=class extends NativeWorker {postMessage(message:any,...args:any[]){if(measuring)proof.messages.push({type:message.type,requestId:message.requestId});return (super.postMessage as any)(message,...args);}};
void (async()=>{
const manifest=await fetch('/w33/archive/manifest.json').then(r=>r.json());
const currentIds=new Set(Object.values(manifest.toplists.current).flatMap((s:any)=>typeof s==='string'?[s]:s.scanIds));
const entries=manifest.scans.filter((s:any)=>currentIds.has(s.id)).map((s:any)=>({...s,archiveYear:2026,manifestRevision:manifest.revision,manifestUrl:location.origin+'/w33/archive/manifest.json',fileUrl:location.origin+'/w33/archive/'+s.path}));
proof.entries=entries;proof.manifest=manifest;
const context:LocalToplistArchiveContext={status:'complete',catalog:null,manifests:[manifest],manifestUrlsByYear:{2026:location.origin+'/w33/archive/manifest.json'},selections:[],entries,serverOptions:[],issues:[]};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const functional=(r:any)=>({status:r.status,loaded:r.loadedIndexes,failed:r.failedIndexes,occurrences:r.searchSet.getOccurrences().length,networkAccessed:r.networkAccessed});
proof.seed=async()=>{audit.disable();const result=await load(entries);return functional(result);};
proof.cache=async(enabled:boolean)=>{enabled?audit.enable():audit.disable();audit.clear();audit.console(true);proof.headlines=[];proof.methods={};proof.messages=[];measuring=true;try{const result=await load(entries,{auditConsumerArea:'Topliste'});return {result:functional(result),methods:proof.methods,messages:proof.messages,headlines:proof.headlines,snapshot:audit.snapshot(),depth:proof.depth};}finally{measuring=false;}};
proof.miss=async()=>{await deleteGuildHubArchiveSearchIndexCache(entries[0].id,entries[0].searchIndex.sha256);audit.clear();proof.headlines=[];const result=await load(entries,{auditConsumerArea:'Topliste'});return {result:functional(result),headlines:proof.headlines,snapshot:audit.snapshot()};};
proof.failure=async()=>{const entry=entries[1];await deleteGuildHubArchiveSearchIndexCache(entry.id,entry.searchIndex.sha256);await fetch('/w33/control?corrupt='+encodeURIComponent(entry.searchIndex.path));audit.clear();proof.headlines=[];try{const result=await load(entries,{auditConsumerArea:'Topliste'});return {result:functional(result),headlines:proof.headlines,snapshot:audit.snapshot()};}finally{await fetch('/w33/control');}};
proof.parallel=async()=>{const entry=entries[0];await deleteGuildHubArchiveSearchIndexCache(entry.id,entry.searchIndex.sha256);await fetch('/w33/control?delay=100');audit.clear();proof.headlines=[];const abort=new AbortController();const a=load([entry],{auditConsumerArea:'Topliste',signal:abort.signal});const b=load([entry],{auditConsumerArea:'Hubsuche'});await pause(15);abort.abort();const [first,second]=await Promise.all([a,b]);await fetch('/w33/control');return {first:functional(first),second:functional(second),headlines:proof.headlines,snapshot:audit.snapshot()};};
let root:ReturnType<typeof createRoot>|undefined;
let update:(text:string)=>void;
function App(){proof.renderCalls++;const [text,setText]=React.useState(''),[tick,setTick]=React.useState(0);update=text=>flushSync(()=>setText(text));proof.rerender=()=>flushSync(()=>setTick(n=>n+1));const result=useLocalToplistArchiveSearch(context,null,text,0,true);proof.hook=result;return <main><h1>Topliste · Suchdiagnose</h1><input aria-label="Suchtext" value={text} onChange={e=>setText(e.target.value)}/><output data-tick={tick}>{result.loading?'Suchvorbereitung läuft':`${result.results.length} Ergebnisse`}</output></main>;}
proof.mount=async(strict=true)=>{audit.enable();audit.clear();proof.headlines=[];proof.renderCalls=0;root??=createRoot(document.getElementById('root')!);flushSync(()=>root!.render(strict?<React.StrictMode><App/></React.StrictMode>:<App/>));await pause(60);return {headlines:proof.headlines,snapshot:audit.snapshot(),renderCalls:proof.renderCalls};};
proof.query=async(text:string)=>{update(text);for(let n=0;n<500;n++){if(!proof.hook.loading)return {results:proof.hook.results.map((r:any)=>({id:r.id,label:r.label})),headlines:proof.headlines,snapshot:audit.snapshot()};await pause(20);}throw Error('Hook load timeout');};
proof.ready=true;

})();
