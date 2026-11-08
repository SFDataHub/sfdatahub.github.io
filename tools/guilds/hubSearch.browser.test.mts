import { outputPath, artifactPath, regressionFixture, temporaryPrefix } from '../codex/workspace.mjs';
// Controlled catalog, manifests, compressed sidecars and Raw. Production
// downloads, integrity validation, acquisition, routing, target parents and DOM ACK.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

// Fresh Chrome profile and incognito context; no user browser or cloud writes.
// Actual production registration, gates, layout, parents, local profile pipeline,
// IDB and ScanManagement. Neighbor screens and external presentation are stubs.
const timestamp=Date.UTC(2026,9,6,12), older=Date.UTC(2026,8,6,12);
const player=(id:number,at:number,name:string)=>({identifier:`f8_net_p${id}`,prefix:"f8_net",timestamp:at,name,class:1,level:101,rank:id,guildIdentifier:"f8_net_g1",guildName:"Fixture Guild",values:{Base:1000,Attribute:2000,"Base Strength":500,"Base Constitution":500}});
const guild=(at:number)=>({identifier:"f8_net_g1",prefix:"f8_net",timestamp:at,name:"Fixture Guild",rank:1,memberCount:3,memberIdentifiers:["f8_net_p1","f8_net_p2","f8_net_p3"]});
const byteMap=new Map<string,Buffer>(); const descriptors:any[]=[];
for(const [id,at,players,groups] of [
 ["current-a",timestamp,[player(1,timestamp,"Current Player 1")],[guild(timestamp)]],
 ["current-b",timestamp,[player(2,timestamp,"Current Player 2"),player(3,timestamp,"Archive Player 3")],[]],
 ["historical",older,[player(1,older,"Historical Player 1")],[guild(older)]],
] as const){
 const raw=Buffer.from(JSON.stringify({players,groups}));const zipped=gzipSync(raw);const sha256=createHash("sha256").update(zipped).digest("hex");
 const index=Buffer.from(JSON.stringify({schemaVersion:1,archiveScanId:id,sourceSha256:sha256,server:"f8_net",timestamp:at,players:players.map(p=>({identifier:p.identifier,name:p.name,guildIdentifier:p.guildIdentifier,guildName:p.guildName})),guilds:groups.map(g=>({identifier:g.identifier,name:g.name}))}));const compressed=gzipSync(index);
 byteMap.set(`/archive/${id}.gz`,zipped);byteMap.set(`/archive/search/${id}.search.json.gz`,compressed);
 descriptors.push({id,server:"f8_net",timestamp:at,path:`${id}.gz`,format:"sftools.raw.v1",compression:"gzip",sha256,compressedBytes:zipped.length,uncompressedBytes:raw.length,playerCount:players.length,groupCount:groups.length,
 searchIndex:{schemaVersion:1,path:`search/${id}.search.json.gz`,sha256:createHash("sha256").update(compressed).digest("hex"),compressedBytes:compressed.length,uncompressedBytes:index.length,playerCount:players.length,groupCount:groups.length}});
}
const transport:{path:string;bytes:number}[]=[];let corruptSidecar=false;
function serveArchive(url:string,host:string,res:any){
 const address = url;
 url = url.split("?")[0]; // Content hash query changes cache addressing, not the fixture file path.
 if(!url.includes('catalog.json')&&!url.startsWith('/archive/'))return false;
 if(url.startsWith('/archive/control')){corruptSidecar=new URL(address,`http://${host}`).searchParams.get('corrupt')==='1';res.setHeader('Content-Type','application/json');res.end('{}');return true;}
 if(url==='/archive/metrics.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(transport));return true;}
 const manifestUrl=`http://${host}/archive/manifest.json`;
 const manifest={schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(timestamp).toISOString(),scanCount:3,serverCount:1,scans:descriptors,toplists:{schemaVersion:1,current:{f8_net:{scanIds:['current-a','current-b']}},monthly:{'2026-09':{f8_net:'historical'}}}};
 const catalog={schemaVersion:1,archives:[{year:2026,active:true,manifestUrl}]};
 const bytes=(corruptSidecar && url==='/archive/search/current-a.search.json.gz' ? Buffer.from('damaged sidecar') : byteMap.get(url))??Buffer.from(JSON.stringify(url.endsWith('catalog.json')?catalog:url.endsWith('setup.json')?{catalog,manifest}:manifest));
 transport.push({path:url,bytes:bytes.length});res.setHeader('Content-Type',byteMap.has(url)?'application/gzip':'application/json');res.end(bytes);return true;
}
const evidence=outputPath(process.env.SFDATAHUB_SEARCH_EVIDENCE ?? artifactPath("tmp/w24/browser"));
await mkdir(outputPath(evidence),{recursive:true});
const presentation=process.env.SFDATAHUB_SEARCH_PRESENTATION==='1';
const assetLog:{url:string;bytes:number;sha256:string;cached:boolean}[]=[];
const fixturePath = "/tools/guilds/fixtures/hubSearch/mocks.tsx";
const aliases: Record<string,string> = {
  "/src/lib/firebase":"db", "/src/context/AuthContext":"useAuth",
  "/src/context/DataJobsContext":"useDataJobs, getDataJobDetail, getDataJobProgress, getDataJobStatusLabel",
  "/src/components/ContentShell":"default:Shell", "/src/components/ContentFrame/Frame":"default:Shell",
  "/src/components/Topbar/Topbar":"default:Topbar", "/src/components/LogoDock/LogoDock":"default:None",
  "/src/components/auth/LoginModalHost":"default:None",
  "/src/components/avatar/PortraitPreview":"default:Portrait",
  "/src/components/Filters/ServerSheet":"default:None", "/src/components/Filters/ListSwitcher":"default:None",
  "/src/components/Filters/HudFilters":"default:HudFilters",
  "/src/components/export/ToplistExportController":"default:ExportController",
  "/src/context/ToplistsDataContext":"Forbidden as ToplistsProvider",
  "/src/components/ProfileOverlay/ProfileOverlay":"default:Forbidden", "/src/components/ProfileOverlay/GuildProfileOverlay":"default:Forbidden",
  "/src/lib/api/toplistsFirestore":"getPlayerToplistSnapshotByDocIdCached",
};
for (const page of ["Planner","FusionPlanner/FusionPlanner","FightTracking","Waitlist","Activity","Imports","Announcements","Events","Roles","Settings"]) aliases["/src/pages/GuildHub/"+page]="default:RegisteredPage";
if(presentation)delete aliases['/src/components/avatar/PortraitPreview'];
async function asset(url:string){
 assert(/^https:\/\/(pm-lib\.12hp\.de\/PortraitMaker-res\/|sf-libs\.12hp\.de\/coa-lib\/assets\/|images\.weserv\.nl\/\?)/.test(url),'only existing presentation assets');
 const digest=createHash('sha256').update(url).digest('hex');
 const filename=artifactPath('renderer-assets/'+digest);
 await mkdir(outputPath(path.dirname(filename)),{recursive:true});
 let bytes=await readFile(path.join(regressionFixture('guilds/fixtures/renderers/renderer-assets'),digest)).catch(()=>undefined) ?? await readFile(filename).catch(()=>undefined);const cached=!!bytes;
 if(!bytes){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,url);bytes=Buffer.from(await response.arrayBuffer());await writeFile(outputPath(filename),bytes);}
 assetLog.push({url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),cached});return bytes;
}
const plugin: Plugin = {
 name:"w12-production-routes", enforce:"pre",
 configureServer(server) {
  server.middlewares.use(async (req,res,next) => {
   if(presentation&&req.url?.startsWith('/w24-assets/')){
    const relative=req.url.slice('/w24-assets/'.length);const url=relative.startsWith('portrait/')?'https://pm-lib.12hp.de/'+relative.slice(9):'https://sf-libs.12hp.de/coa-lib/'+relative.slice(4);
    try{const bytes=await asset(url);res.setHeader('Content-Type',url.endsWith('.json')?'application/json':url.endsWith('.woff2')?'font/woff2':url.endsWith('.svg')?'image/svg+xml':url.endsWith('.webp')?'image/webp':'image/png');res.end(bytes);}catch(error){console.error(error);res.statusCode=503;res.end('controlled asset unavailable');}return;
   }
   if(serveArchive(req.url ?? "", req.headers.host ?? "", res)) return;
   const pathname=req.url?.split('?')[0];
   if(!['/','/test/','/beta/'].includes(pathname??'')){next();return;}
   const html=(await readFile('tools/guilds/fixtures/hubSearch/proof.html','utf8')).replace('./fixture.tsx','/tools/guilds/fixtures/hubSearch/fixture.tsx');
   res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url!,html));
  });
 },
 resolveId(source,importer) {
  if(presentation&&source.startsWith('https://pm-lib'))return '\0w24:portrait';
  if(presentation&&source.startsWith('https://sf-libs'))return '\0w24:coa';
  if(source.startsWith("https://sf-libs"))return "\0w12:coa";
  if(!importer||!source.startsWith("."))return;
  const resolved=path.resolve(path.dirname(importer),source).replace(/\\/g,"/").replace(/\.(tsx?|jsx?)$/,"");
  const key=Object.keys(aliases).find(key=>resolved.endsWith(key)); if(key)return "\0w12:"+key;
 },
 async load(id) {
  if(id==='\0w24:portrait'||id==='\0w24:coa'){const kind=id.endsWith('portrait')?'portrait':'coa';const source=await readFile(regressionFixture(`guilds/fixtures/renderers/${kind}-renderer.js`),'utf8');return source.replaceAll('import.meta.url',`new URL('/w24-assets/${kind}/${kind==='portrait'?'PortraitMaker-core-latest.min.js':'coa-lib-1.0.0.min.js'}',window.location.origin).href`);}
  if(id==="\0w12:coa")return "export class CoaRenderer {}";if(!id.startsWith("\0w12:"))return;const value=aliases[id.slice(5)];return value.startsWith("default:")?`export { ${value.slice(8)} as default } from '${fixturePath}';`:`export { ${value} } from '${fixturePath}';`;
 },
 transform(code,id) {
 code=code.replace(/\r\n/g,"\n");const name=id.replace(/\\/g,"/");
 if(name.endsWith("/src/pages/DataHub/Toplist.tsx"))code=code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });','(globalThis as any).w08.loads.push({result,datasetId}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts"))code=code.replace('export async function getGuildHubLocalScan(id: string) {','export async function getGuildHubLocalScan(id: string) { const proof=(globalThis as any).w12; if(proof){proof.reads.push((new Error().stack?.includes("localProfileEntry")?"entry:":"history/parent:")+id); if(proof.gate && proof.gateSource===id){proof.gateHeld=true;await proof.gate;}}');
 if(name.endsWith("/src/lib/parsing/normalizedPlayer.ts"))code=code.replace('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {','export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => { (globalThis as any).w12?.cores.push(String((player as any)?.name));');
 if(name.endsWith("/src/pages/GuildHub/localPlayerProfileAdapter.ts"))code=code.replace('  const normalized = seed', '  (globalThis as any).w12?.builds.push(input.sourceScanId); const normalized = seed');
 if(name.endsWith("/src/lib/local-player-profile/coordinator.ts"))code=code.replace('const realmCoordinator = createLocalPlayerProfileCoordinator();','const realmCoordinator = createLocalPlayerProfileCoordinator(); (globalThis as any).w12Coordinator=realmCoordinator;');
 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts"))code=code.replace('export async function readGuildHubLocalScanForSearch(id: string) {','export async function readGuildHubLocalScanForSearch(id: string) { const proof=(globalThis as any).w12; proof?.searchReads.push(id); if(proof?.gate && proof.gateSource===id && new Error().stack?.includes("hubTargetResolver")){proof.gateHeld=true;await proof.gate;}');
 if(name.endsWith("/src/pages/DataHub/Toplist.tsx"))code=code.replace('const handleFocusResult = React.useCallback((ack: ToplistFocusResult) => {','const handleFocusResult = React.useCallback((ack: ToplistFocusResult) => { const proof=(globalThis as any).w12; if(proof?.holdAcks){proof.heldAcks.push({ack,replay:()=>handleFocusResult(ack)});return;}');
 if(name.endsWith("/src/lib/scanArchive/searchIndexService.ts"))code=code.replace('const payload = validateScanArchiveSearchIndexPayload(await dependencies.downloadSearchIndex(entry, signal), entry);','const start=performance.now(); const payload = validateScanArchiveSearchIndexPayload(await dependencies.downloadSearchIndex(entry, signal), entry); (globalThis as any).w12?.indexTimings.push({id:entry.id,ms:performance.now()-start});');

 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts"))code=code.replace('const source = await tx.objectStore(SCAN_STORE).get(projection.source);','if((globalThis as any).w12)(globalThis as any).w12.projectionCommitReads++; const source = await tx.objectStore(SCAN_STORE).get(projection.source);');
 if(presentation&&name.endsWith('/src/lib/data-hub/hubSearchAppearance.ts'))code=code.replace('  if (kind === "guild") return','  if((globalThis as any).w12)(globalThis as any).w12.appearanceRows++; if (kind === "guild") return');
 if(presentation&&name.endsWith('/src/lib/data-hub/hubSearchProjection.ts'))code=code.replace('  return runHubSearchWork(', '  if((globalThis as any).w12)(globalThis as any).w12.projectionBuilds++; return runHubSearchWork(');
 if(presentation&&name.endsWith('/src/lib/guilds/localScanLibrary.ts'))code=code.replace('export async function putHubSearchProjection(projection: HubSearchProjection, options: HubSearchExecutionOptions = {}) {','export async function putHubSearchProjection(projection: HubSearchProjection, options: HubSearchExecutionOptions = {}) { if((globalThis as any).w12)(globalThis as any).w12.projectionWrites++;');
 if(name.endsWith("/src/lib/data-hub/hubSearchService.ts"))code=code.replace('  start(query: HubSearchQuery) {','  start(query: HubSearchQuery) { const proof=(globalThis as any).w12; proof?.searchControllers.push(this); if(proof?.preparationGate){const original=this.dependencies.readLocal;this.dependencies.readLocal=async(...args)=>{await proof.preparationGate;return original(...args);};}');
 return code;
 }
};

const chrome = process.env.W13_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w13-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next", "@tanstack/react-virtual"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null } });
let child: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
async function call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
  const id = ++nextId;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return promise;
}
async function evaluate(sessionId: string, expression: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    new Promise<any>((_, reject) => { timer = setTimeout(() => reject(new Error(`CDP timeout: ${expression}`)), 60000); })]).finally(() => clearTimeout(timer));
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await server.listen();
  const address = server.httpServer!.address(); assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  child = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: "ignore" });
  let portFile = "";
  for (let attempt = 0; attempt < 500; attempt++) { try { portFile = await readFile(path.join(profile, "DevToolsActivePort"), "utf8"); break; } catch { await pause(); } }
  assert(portFile, "isolated Chrome debug endpoint is required");
  const [port, endpoint] = portFile.trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error("CDP connection failed")); });
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception:", message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update")) console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: 'about:blank', browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  if(presentation){
   socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.method!=='Fetch.requestPaused')return;const {requestId,request}=message.params;
    void (async()=>{if(request.url.startsWith(origin)||request.url.startsWith('data:')){await call('Fetch.continueRequest',{requestId},sessionId);return;}try{
     if(request.url.startsWith('https://fonts.googleapis.com/')){await call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/css'},{name:'Access-Control-Allow-Origin',value:'*'}],body:''},sessionId);return;}
     const kind=request.url==='https://pm-lib.12hp.de/PortraitMaker-core-latest.min.js'?'portrait':request.url==='https://sf-libs.12hp.de/coa-lib/coa-lib-1.0.0.min.js'?'coa':null;
     const bytes=kind?Buffer.from((await readFile(regressionFixture(`guilds/fixtures/renderers/${kind}-renderer.js`),'utf8')).replaceAll('import.meta.url',JSON.stringify(`${origin}/w24-assets/${kind}/${kind==='portrait'?'PortraitMaker-core-latest.min.js':'coa-lib-1.0.0.min.js'}`))):await asset(request.url);
     if(kind)assetLog.push({url:request.url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),cached:true});
     await call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:kind?'application/javascript':'image/png'},{name:'Access-Control-Allow-Origin',value:'*'}],body:bytes.toString('base64')},sessionId);
    }catch(error){console.error('asset blocked',request.url,String(error));await call('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},sessionId);}})();
   });
   await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);
  }
  await call('Page.navigate',{url:`${origin}/tools/guilds/fixtures/hubSearch/proof.html${presentation?'?w24-images=1':''}`},sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const waitReady = async (session: string, previousDocument?: string) => { for (let i=0;i<1200;i++) { if (await evaluate(session,`Boolean(globalThis.w12?.ready) && globalThis.w12.documentId !== ${JSON.stringify(previousDocument)}`)) return; await pause(); } throw Error("production fixture did not load"); };
  await waitReady(sessionId);
  if(presentation){
   let proof:unknown;
   try{proof=await evaluate(sessionId,'w24.run()');}catch(error){console.log('presentation diagnostic',await evaluate(sessionId,'({proof:w24.proof,location:w12.location,errors:w12.errors,body:document.body.innerText.slice(-2500)})'));const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'failed.png')),Buffer.from(shot.data,'base64'));throw error;}
   await evaluate(sessionId,"w24.showImages()");
   const wide=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'images-wide.png')),Buffer.from(wide.data,'base64'));
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);await evaluate(sessionId,'w24.showImages()');
   assert.equal(await evaluate(sessionId,'document.documentElement.scrollWidth<=innerWidth'),true,'390px layout fits');
   const narrow=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'images-narrow.png')),Buffer.from(narrow.data,'base64'));
   await evaluate(sessionId,'w24.showRecents()');const recents=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'recents-narrow.png')),Buffer.from(recents.data,'base64'));
   for(const key of ['ArrowDown','ArrowDown','ArrowUp','Enter'] as const){await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{ArrowDown:40,ArrowUp:38,Enter:13}[key]},sessionId);await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key},sessionId);}
   assert.equal(await evaluate(sessionId,"document.querySelector('[data-dashboard-search] input').value==='Visual' && w12.location.pathname==='/data-hub'"),true,'native arrows and Enter select visible query Recent amongst mixed entities');await evaluate(sessionId,'w24.showRecents()');
   await evaluate(sessionId,"(()=>{const option=document.querySelector('[data-search-option]');option.focus();option.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));})()");
   assert.equal(await evaluate(sessionId,"!document.querySelector('[data-search-dropdown]') && document.activeElement===document.querySelector('[data-dashboard-search] input')"),true,'Escape from focused Recent closes and restores input');await evaluate(sessionId,'w24.showRecents()');
   await call('Emulation.setDeviceMetricsOverride',{width:1400,height:950,deviceScaleFactor:1,mobile:false},sessionId);
   const favorites=await evaluate(sessionId,'w25.run()');
   const favoriteWide=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'favorites-wide.png')),Buffer.from(favoriteWide.data,'base64'));
   await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);await evaluate(sessionId,'w25.show()');
   const favoriteNarrow=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,'favorites-narrow.png')),Buffer.from(favoriteNarrow.data,'base64'));await evaluate(sessionId,'w25.close()');
   const previous=await evaluate(sessionId,'w12.documentId');await call('Page.reload',{},sessionId);await waitReady(sessionId,previous);const reload=await evaluate(sessionId,'w24.reload()');const favoriteReload=await evaluate(sessionId,'w25.reload()');
   const cleanup=await evaluate(sessionId,'w12.cleanupProof()');
   await writeFile(outputPath(path.join(evidence,'browser-results.json')),JSON.stringify({proof,reload,favorites,favoriteReload,cleanup,assetLog,transport},null,2)+'\n');
   console.log('PASS real PortraitMaker/CoaRenderer pixels, migration/warm costs, native Dashboard/Recent targets and reload');await call('Target.disposeBrowserContext',{browserContextId});
  }else{
  await evaluate(sessionId, "w12.run().then(r=>{w12.result=r;w12.done=true},e=>{w12.error=e.stack;w12.done=true});undefined");
  for(let i=0;i<6000;i++){if(await evaluate(sessionId,"Boolean(w12.done)"))break;await pause();}
  if(await evaluate(sessionId,"w12.error"))console.log("diagnostic",await evaluate(sessionId,"({results:w12.results,location:w12.location,reads:w12.reads,errors:w12.errors,body:document.body.innerText.slice(-2200),controllers:w12.searchControllers.map(c=>({query:c.query,state:c.getSnapshot(),inspect:c.inspect()}))})"));
  assert.equal(await evaluate(sessionId,"w12.error"),undefined);
  const results = await evaluate(sessionId,"w12.result");results.forEach((r:string)=>console.log("PASS",r));
  assert.deepEqual(await evaluate(sessionId,"w12.errors"),[]);
  const measurements=await evaluate(sessionId,"w12.measurements");
  await evaluate(sessionId,"document.querySelector('[data-hub-search]').scrollIntoView({block:'start'})");
  const wide=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,"wide.png")),Buffer.from(wide.data,"base64"));
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  const compact=await evaluate(sessionId,"w12.narrowRun()");results.push("Compact 390px: all four actual target paths and DOM ACK; keyboard reachable controls");
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9},sessionId);await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9},sessionId);
  assert.equal(await evaluate(sessionId,"document.activeElement.tagName==='SELECT' && document.activeElement.value==='toplist'"),true,"native Tab reaches target-mode control");
  const narrow=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,"narrow.png")),Buffer.from(narrow.data,"base64"));
  assert.equal(await evaluate(sessionId,"document.documentElement.scrollWidth <= innerWidth"),true,"narrow search fits viewport");
  await evaluate(sessionId,"document.querySelector('[data-hub-search-hit]').scrollIntoView({block:'center'})");
  const narrowResults=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(outputPath(path.join(evidence,"narrow-results.png")),Buffer.from(narrowResults.data,"base64"));
  assert.equal(await evaluate(sessionId,"(()=>{const button=document.querySelector('[data-hub-search-hit] > button');button.focus();return document.activeElement===button && !button.disabled;})()"),true,"native keyboard target is enabled and focused");
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:"\r",unmodifiedText:"\r"},sessionId);await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13},sessionId);
  const keyboard=await evaluate(sessionId,"w12.keyboardCheck()");results.push("Native keyboard Tab and Enter: target control reached and actual guild Toplist DOM ACK");
  const previousDocument=await evaluate(sessionId,"w12.documentId");
  await call("Page.reload",{},sessionId);await waitReady(sessionId,previousDocument);
  const reload=await evaluate(sessionId,"w12.reloadCheck()");assert.deepEqual(reload.errors,[]);
  results.push("Actual compact Dashboard search and reload preserve text/mode, constrained both/current");
  const cleanup=await evaluate(sessionId,"w12.cleanupProof()");results.push("Unmount: zero held local/archive documents, listeners and index flights");
  await writeFile(outputPath(path.join(evidence,"browser-results.json")),JSON.stringify({results,measurements,compact,keyboard,reload,cleanup,transport},null,2)+"\n");
  console.log("PASS",results.at(-1));
  await call("Target.disposeBrowserContext", { browserContextId });
  }
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
