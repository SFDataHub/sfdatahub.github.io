import { outputPath, artifactPath, siblingInput, regressionFixture, temporaryPrefix } from '../codex/workspace.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { searchIndexPayloadForScanArchiveEntry } from '../../src/lib/scanArchive/archiveBuilderCore.ts';
import { resolveServer } from '../../src/lib/servers/serverResolver.ts';
import { performancePlugin } from './fixtures/dataHubRuntimeAuditPerformance/plugin.mts';

const arg=(key:string,fallback:string)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const suite=arg('--suite','audit'), evidence=arg('--evidence',artifactPath('tmp/w32/performance/off')), auditMode=arg('--audit','off');
await mkdir(outputPath(evidence),{recursive:true});
const archiveRoot=path.resolve(siblingInput('scan archiv/scan-archive-2026'));
const manifestBytes=await readFile(path.join(archiveRoot,'manifest.json'));
let manifest=JSON.parse(manifestBytes.toString());
const counts=JSON.parse(await readFile(regressionFixture('toplists/fixtures/performance/archive-derived-counts.json'),'utf8'));
const originalCatalog=await readFile('public/data/scan-archive/catalog.json');
const transport:any[]=[];const buffers=new Map<string,Buffer>();
const setupStart=Date.now();
let expectedPlayers=counts.current.players, physicalSources=58;
let servers=Object.keys(manifest.toplists.current).map(server=>resolveServer(server)!.code);
if(suite==='single') {servers=['F28'];expectedPlayers=counts.current.counts.f28_net.validPlayers;physicalSources=1;}
if(suite==='synthetic') {
 const namespaces=Object.keys(manifest.toplists.current), stamp=Date.UTC(2026,9,6);const scans:any[]=[];
 for(let index=0;index<namespaces.length;index++){
  const server=namespaces[index], timestamp=stamp;
  const raw={players:Array.from({length:1205},(_,i)=>({identifier:`${server}_p${i+1}`,prefix:server,timestamp,name:i===1204?(server==='f8_net'?'FarAway':`LastPlayer-${server}`):i===1100?'BeyondServer':i===1002?'AlphaPerson':`Player${String(i).padStart(4,'0')}`,guildIdentifier:i===1003?null:`${server}_g${i===1002?2:1}`,guildName:i===1003?null:i===1002?'Other Guild':'Alpha Guild',class:i===1002?2:1,level:100+i,rank:i+1,values:{Base:10000-i,'Base Strength':10000-i,'Base Intelligence':10000-i,'Base Constitution':500,Attribute:15000-i,Constitution:750}})),groups:[{identifier:`${server}_g1`,prefix:server,timestamp,name:'Alpha Guild',rank:1,memberCount:1003,avgLevel:500},{identifier:`${server}_g2`,prefix:server,timestamp,name:'Other Guild',rank:2,memberCount:1,avgLevel:200},{identifier:`${server}_g3`,prefix:server,timestamp,name:'Empty Guild',rank:3,memberCount:0,avgLevel:100}]};
  const rawText=JSON.stringify(raw), compressed=gzipSync(rawText), scanPath=`controlled/${server}.json.gz`;
  const scan:any={id:`w29-controlled-${index}`,server,timestamp,timestampUtc:new Date(timestamp).toISOString(),path:scanPath,format:'sftools.raw.v1',compression:'gzip',sha256:createHash('sha256').update(compressed).digest('hex'),compressedBytes:compressed.length,uncompressedBytes:Buffer.byteLength(rawText),playerCount:1205,groupCount:3};
  const search=searchIndexPayloadForScanArchiveEntry(scan,raw);const b=gzipSync(JSON.stringify(search));scan.searchIndex={schemaVersion:search.schemaVersion,path:`controlled/${server}.search.json.gz`,sha256:createHash('sha256').update(b).digest('hex'),compressedBytes:b.length,uncompressedBytes:Buffer.byteLength(JSON.stringify(search)),playerCount:1205,groupCount:3};
  buffers.set(scanPath,compressed);buffers.set(scan.searchIndex.path,b);scans.push(scan);
 }
 manifest={schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(stamp).toISOString(),scanCount:45,serverCount:45,scans,toplists:{schemaVersion:1,current:Object.fromEntries(scans.map(e=>[e.server,e.id])),monthly:{}}};expectedPlayers=54225;physicalSources=45;
} else {
 for(const scan of manifest.scans){buffers.set(scan.path,await readFile(path.join(archiveRoot,scan.path)));if(scan.searchIndex)buffers.set(scan.searchIndex.path,await readFile(path.join(archiveRoot,scan.searchIndex.path)));}
}
const setupMs=Date.now()-setupStart;
const profile=await mkdtemp(temporaryPrefix('sfdatahub-w29-', 'browser-profiles'));
const server=await createServer({configLoader:"runner", configFile:false,root:process.cwd(),cacheDir:path.join(profile,'vite-cache'),
 optimizeDeps:{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','react-router-dom','lucide-react','react-i18next','i18next','@tanstack/react-virtual']},
 plugins:[performancePlugin(arg('--old-source',''))],server:{host:'127.0.0.1',port:0,watch:null}});
server.middlewares.use((req,res,next)=>{
 const pathname=new URL(req.url??'/','http://localhost').pathname;
 const origin=`http://${req.headers.host}`;
 if(pathname==='/w29/config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({servers,expectedPlayers,physicalSources,f8Players:counts.current.counts.f8_net.validPlayers,f28Players:counts.current.counts.f28_net.validPlayers,detail:suite==='profile'}));return;}
 if(pathname==='/data/scan-archive/catalog.json'){const catalog=JSON.parse(originalCatalog.toString());for(const a of catalog.archives)if(a.year===2026)a.manifestUrl=origin+'/w29/archive/manifest.json';res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(catalog));return;}
 if(pathname==='/w29/archive/manifest.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(manifest));return;}
 if(pathname.startsWith('/w29/archive/')){const name=decodeURIComponent(pathname.slice('/w29/archive/'.length)),bytes=buffers.get(name);if(!bytes){res.statusCode=404;res.end('missing archive');return;}transport.push({at:Date.now(),path:name,bytes:bytes.length});res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Length',bytes.length);res.setHeader('Cache-Control','no-store');res.end(bytes);return;}
 next();
});
const transportLayer=server.middlewares.stack.pop()!;server.middlewares.stack.unshift(transportLayer);
let browser:ReturnType<typeof spawn>|undefined,socket:WebSocket|undefined,id=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:unknown)=>void}>();const workerSessions=new Map<string,string>();
const pause=(ms=25)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function call(method:string,params:Record<string,unknown>={},sessionId?:string):Promise<any>{const n=++id;const promise=new Promise((resolve,reject)=>pending.set(n,{resolve,reject}));socket!.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));return promise;}
async function evaluate(sessionId:string,expression:string){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function ready(sessionId:string,oldId?:string){for(let i=0;i<3000;i++){try{if(await evaluate(sessionId,`Boolean(globalThis.w29?.ready)${oldId?`&&w29.documentId!==${JSON.stringify(oldId)}`:''}`)){assert.equal(await evaluate(sessionId,'w29.error'),undefined);return;}}catch(e){if(!/context|navigat|closed/.test(String(e)))throw e;}await pause();}throw Error('fixture readiness');}
async function launchJob(sessionId:string,expression:string){await evaluate(sessionId,`w29.jobDone=false;w29.jobError=undefined;${expression}.then(value=>{w29.jobResult=value;w29.jobDone=true;},error=>{w29.jobError=error.stack;w29.jobDone=true;});undefined`);for(let i=0;i<20000;i++){if(await evaluate(sessionId,'w29.jobDone')){const error=await evaluate(sessionId,'w29.jobError');assert.equal(error,undefined,error);return evaluate(sessionId,'w29.jobResult');}await pause();}throw Error('application measurement timeout');}
async function heaps(sessionId:string){const out:any[]=[];for(const [sid,url]of [[sessionId,'window'],...workerSessions]as [string,string][]){try{out.push({realm:url,...await call('Runtime.getHeapUsage',{},sid)});}catch{}}return out;}
async function save(name:string,value:any){await writeFile(outputPath(path.join(evidence,name)),JSON.stringify(value,null,2)+'\n');}
async function entry(sessionId:string,label:string,profileCPU=false){
 const reuse=label.includes('-reuse-');const state=await evaluate(sessionId,'w29.state()');if(label.endsWith('-A'))assert.deepEqual(state,{scans:0,archiveScanBindings:0,localToplistSnapshots:0});else{assert.equal(state.scans,physicalSources);assert.equal(state.archiveScanBindings,reuse?0:physicalSources);assert.equal(state.localToplistSnapshots,label.endsWith('-B')?0:physicalSources);}
 if(profileCPU){await call('Profiler.enable',{},sessionId);await call('Profiler.setSamplingInterval',{interval:1000},sessionId);await call('Profiler.start',{},sessionId);}
 await evaluate(sessionId,'globalThis.sfhDataHubRuntimeAudit?.console(false);globalThis.sfhDataHubRuntimeAudit?.clear();');
 const result=await launchJob(sessionId,'w29.start()');assert.equal(result.total,expectedPlayers);assert(result.visible);assert.equal(result.state.scans,physicalSources);assert.equal(result.state.localToplistSnapshots,physicalSources);
 if(profileCPU)await save(label+'-cpu-profile.json',(await call('Profiler.stop',{},sessionId)).profile);
 const report=await evaluate(sessionId,'w29.report()');assert.deepEqual(report.errors,[]);report.identities=await evaluate(sessionId,'w29.identities()');report.beforeState=state;report.firstVisible=result;report.heaps=await heaps(sessionId);const auditSnapshot=await evaluate(sessionId,'globalThis.sfhDataHubRuntimeAudit?.snapshot()??null');report.audit={mode:auditMode,snapshot:auditSnapshot,serializedUtf8Bytes:auditSnapshot?Buffer.byteLength(JSON.stringify(auditSnapshot)):0};report.setup=await evaluate(sessionId,'({navigationStart:performance.timeOrigin,fixtureReady:w29.startAt,documentId:w29.documentId})');report.resultHashes=await evaluate(sessionId,'w29.resultHashes()');await save(label+'.json',report);console.log(JSON.stringify({label,ms:result.ms,players:result.total,events:report.events.length,longTasks:report.longTasks.length}));return report;
}
try {
 await server.listen();const address=server.httpServer!.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 browser=spawn(process.env.W08_CHROME??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`],{stdio:'ignore'});
 let endpoint='';for(let i=0;i<2000;i++){try{endpoint=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');break;}catch{await pause();}}assert(endpoint);const [port,suffix]=endpoint.trim().split(/\r?\n/);socket=new WebSocket(`ws://127.0.0.1:${port}${suffix}`);await new Promise<void>((resolve,reject)=>{socket!.onopen=()=>resolve();socket!.onerror=()=>reject(Error('Chrome CDP'));});
 socket.onmessage=event=>{const m=JSON.parse(String(event.data));if(m.method==='Target.attachedToTarget'&&m.params.targetInfo.type==='worker')workerSessions.set(m.params.sessionId,m.params.targetInfo.url);if(m.method==='Target.detachedFromTarget')workerSessions.delete(m.params.sessionId);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(Error(JSON.stringify(m.error)));else p.resolve(m.result);};
 await save(suite+'-environment.json',{node:process.version,vite:JSON.parse(await readFile('node_modules/vite/package.json','utf8')).version,browser:await call('Browser.getVersion'),viewport:{width:1400,height:950},setupMs,manifestRevision:manifest.revision,originalManifestSHA256:createHash('sha256').update(manifestBytes).digest('hex'),catalogSHA256:createHash('sha256').update(originalCatalog).digest('hex'),servers,physicalSources,expectedPlayers,collection:'counts/spans without payload serialization; profiles separate',entryBoundary:'fixture module loading and scope setup outside timed route mount; actual Toplist entry to visible DOM'});
 const repetitions=suite==='primary'?3:suite==='interaction'?2:1;
 for(let repeat=1;repeat<=repetitions;repeat++){
  const {browserContextId}=await call('Target.createBrowserContext');const{targetId}=await call('Target.createTarget',{url:'about:blank',browserContextId});const{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});await call('Runtime.enable',{},sessionId);await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true},sessionId);await call('Emulation.setDeviceMetricsOverride',{width:1400,height:950,deviceScaleFactor:1,mobile:false},sessionId);
  await call('Page.enable',{},sessionId);await call('Page.addScriptToEvaluateOnNewDocument',{source: auditMode==='on' ? 'localStorage.setItem(\"sfh:debug:dataHubRuntimeAudit\",\"1\");' : 'localStorage.removeItem(\"sfh:debug:dataHubRuntimeAudit\");'},sessionId);
  const url=origin+'/tools/toplists/fixtures/dataHubRuntimeAuditPerformance/proof.html';const navStart=Date.now();await call('Page.navigate',{url},sessionId);await ready(sessionId);await save(`${suite}-${repeat}-setup.json`,{navigationMs:Date.now()-navStart,state:await evaluate(sessionId,'w29.state()')});
  if(suite==='reuse'){
   // Normal import and derivation prepare this existing-data fixture. That
   // work, plus removal of sidecar bindings, is outside the measured entry.
   const preparation=await launchJob(sessionId,'w29.start()');assert.equal(preparation.total,expectedPlayers);await save('reuse-preparation.json',preparation);
   await evaluate(sessionId,'w29.removeBindings()');
   for(let run=1;run<=3;run++){
    const old=await evaluate(sessionId,'w29.documentId');await call('Page.reload',{},sessionId);await ready(sessionId,old);
    await entry(sessionId,`primary-reuse-${run}-R`);
   }
   await evaluate(sessionId,'w29.removeDerived()');const old=await evaluate(sessionId,'w29.documentId');await call('Page.reload',{},sessionId);await ready(sessionId,old);await entry(sessionId,'primary-reuse-1-B');
   await call('Target.disposeBrowserContext',{browserContextId});workerSessions.clear();continue;
  }
  if(suite==='interaction'||suite==='reset'){
   const kind=suite==='reset'?'reset':repeat===1?'server':'reset';const pre=await launchJob(sessionId,`w29.prepareInteraction(${JSON.stringify(kind)})`);await pause(500);const attemptAt=Date.now();
   await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pre.coordinates},sessionId);await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...pre.coordinates},sessionId);
   const result=await launchJob(sessionId,`w29.finishInteraction(${JSON.stringify(kind)},${attemptAt})`);assert.deepEqual(result.errors,[]);assert.equal(result.interaction.scope.length,kind==='server'?44:0);assert(result.interaction.receivedAt);
   await save(`${suite}-${kind}.json`,result);console.log(JSON.stringify(result.interaction));
   await call('Target.disposeBrowserContext',{browserContextId});workerSessions.clear();continue;
  }
  await entry(sessionId,`${suite}-${repeat}-A`,suite==='profile');
  if(false&&repeat===1&&suite==='primary'){await evaluate(sessionId,'w29.removeDerived()');const old=await evaluate(sessionId,'w29.documentId');await call('Page.reload',{},sessionId);await ready(sessionId,old);await entry(sessionId,`${suite}-${repeat}-B`);}
  for(let warmRun=1;warmRun<=3;warmRun++){
  const old=await evaluate(sessionId,'w29.documentId');const reloadStart=Date.now();await call('Page.reload',{},sessionId);await ready(sessionId,old);const reloadPreambleMs=Date.now()-reloadStart;
  const warm=await entry(sessionId,`${suite}-${warmRun}-C`,suite==='profile');await save(`${suite}-${warmRun}-reload.json`,{ordinaryReload:true,preambleMs:reloadPreambleMs,documentIdBefore:old,documentIdAfter:warm.documentId});
  }
  if(suite==='profile'){
   for(const width of [1400,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false},sessionId);
    const coordinates=await launchJob(sessionId,"w29.preparedCoordinates('filter')");const start=Date.now();await call('Input.insertText',{text:coordinates.value},sessionId);
    const result=await launchJob(sessionId,`w29.finishPrepared('filter',${start})`);await save(`prepared-${width}-filter.json`,result);console.log(JSON.stringify({width,...result.interaction}));
    await evaluate(sessionId,`(()=>{const input=document.querySelector('#sheet-search, #guild-hub-local-toplist-search');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(1000);
    await evaluate(sessionId,`(()=>{const select=document.querySelector('#toplists-sort');select.value='main';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(1000);
    await launchJob(sessionId,"w29.preparedCoordinates('sort')");const sortStart=Date.now();await call('Input.dispatchKeyEvent',{type:'char',text:'l'},sessionId);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
    const sort=await launchJob(sessionId,`w29.finishPrepared('sort',${sortStart})`);await save(`prepared-${width}-sort.json`,sort);console.log(JSON.stringify({width,...sort.interaction}));
   }
   await call('Emulation.setDeviceMetricsOverride',{width:1400,height:950,deviceScaleFactor:1,mobile:false},sessionId);
  }
  if(suite==='profile'){await evaluate(sessionId,`(()=>{const select=document.querySelector('#toplists-sort');select.value='main';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(1000);}
  if(suite==='profile'){await evaluate(sessionId,`(()=>{const select=document.querySelector('[data-toplist-search-mode]');select.value='search';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(1000);}
  if(suite==='audit'&&repeat===1){
   const start=await evaluate(sessionId,'__w29.now()');const operations=await launchJob(sessionId,`w29.runOperations(${suite==='audit'&&repeat===1})`);const end=await evaluate(sessionId,'__w29.now()');
   const report=await evaluate(sessionId,`w29.report(${start},${end})`);report.operations=operations;report.heaps=await heaps(sessionId);await save(`${suite}-${repeat}-D.json`,report);await save(`${suite}-${repeat}-D-audit.json`,await evaluate(sessionId,'globalThis.sfhDataHubRuntimeAudit?.snapshot()??null'));console.log(JSON.stringify({label:`${suite}-${repeat}-D`,operations:operations.map((x:any)=>({label:x.label,ms:x.ms,total:x.total}))}));
  }
  await call('Target.disposeBrowserContext',{browserContextId});workerSessions.clear();
 }
 await save(suite+'-transport.json',transport);
}finally{
 socket?.close();browser?.kill();await server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 await save(suite+'-cleanup.json',{profileRemoved:true,serverClosed:true});
}
