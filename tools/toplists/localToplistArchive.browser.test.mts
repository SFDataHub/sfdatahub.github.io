import { outputPath, artifactPath, siblingInput, regressionFixture, temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { searchIndexPayloadForScanArchiveEntry } from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile + incognito context. No connection to the user's browser.
// Acquisition and unrelated presentation are controlled. The actual Toplist
// parent, shared tables, View/Search workers, focus, profile action and IDB run.
const fixturePath = "/tools/toplists/fixtures/localToplistRevision/mocks.tsx";
const evidence = outputPath(artifactPath("tmp/w26/browser"));
await mkdir(outputPath(evidence),{recursive:true});
let upgraded=false, revision=1, corruptNamed=false, holdKind="", held=false;
let releaseHold: (()=>void) | undefined;
let holdPromise: Promise<void> | undefined;
const transport: {path:string;bytes:number;kind:string;phase:string}[]=[];
const bytes=new Map<string,Buffer>();
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const save=Array<number>(70).fill(0);save[8]=1;save[9]=403;save[10]=2;save[11]=3;save[13]=2;save[14]=1;save[18]=1;save[19]=1;save[20]=1;
const servers=['f8_net','s1_eu','stumblesteppe_net'];
const names=['F8','EU1','Named'];
const scans=servers.flatMap((server,index)=>[8,9,10].map(month=>{
 const timestamp=Date.UTC(2026,month-1,6,12);
 const raw={players:Array.from({length:2},(_,i)=>({identifier:`${server}_p${i+1}`,prefix:server,timestamp,name:i===0?`${month===10?'Archive Player':'September Only'} ${names[index]}`:`Filler ${names[index]}`,class:1,saveVersion:2,save,rank:i+1,level:100+i,guildIdentifier:`${server}_g1`,guildName:`Archive Guild ${names[index]}`,values:{Base:10000-i,'Base Strength':10000-i,'Base Constitution':500,Attribute:15000-i,Constitution:750}})),groups:[{identifier:`${server}_g1`,prefix:server,timestamp,name:`Archive Guild ${names[index]}`,rank:1,memberCount:2,coaString:'0000000000000000010203'}]};
 const text=JSON.stringify(raw),compressed=gzipSync(text),path=`${month}/${server}.json.gz`;
 bytes.set('/archive/'+path,compressed);
 const entry={id:`${server}:${timestamp}`,server,timestamp,path,format:'sftools.raw.v1',compression:'gzip' as const,sha256:hash(compressed),compressedBytes:compressed.length,uncompressedBytes:Buffer.byteLength(text),playerCount:2,groupCount:1};
 const modern=searchIndexPayloadForScanArchiveEntry(entry,raw);
 const legacy={...modern,schemaVersion:1,players:modern.players.map(({appearance:_,...row})=>row),guilds:modern.guilds.map(({appearance:_,...row})=>row)};
 const search=(value:any,key:string)=>{const text=JSON.stringify(value),b=gzipSync(text),searchPath=`${month}/${server}.search.json.gz`;bytes.set(key+searchPath,b);return {schemaVersion:value.schemaVersion,path:searchPath,sha256:hash(b),compressedBytes:b.length,uncompressedBytes:Buffer.byteLength(text),playerCount:2,groupCount:1};};
 return {...entry,oldIndex:search(legacy,'old/'),newIndex:search(modern,'new/')};
}));
const actualRoot=path.resolve(siblingInput('scan archiv/scan-archive-2026'));
const actualBackup=path.resolve(siblingInput('scan archiv/.w26-before'));
const actualOld=JSON.parse(await readFile(path.join(actualBackup,'manifest.json'),'utf8'));
const actualNew=JSON.parse(await readFile(path.join(actualRoot,'manifest.json'),'utf8'));
const actualOldFiles=unzipSync(new Uint8Array(await readFile(path.join(actualBackup,'search-files.zip'))));
const realCurrent=actualOld.toplists.current.f8_net;
const realId=typeof realCurrent==='string'?realCurrent:realCurrent.scanIds[0];
const realScan=actualOld.scans.find((s:any)=>s.id===realId);
assert(realScan,'real F8 Current source');
const realPlayer=JSON.parse(gunzipSync(actualOldFiles[realScan.searchIndex.path]).toString('utf8')).players[0];
let actualMode: 'old'|'new'|undefined;
let phase='search';
function manifest(){return {schemaVersion:1,archiveYear:2026,revision,updatedAt:'2026-10-10T00:00:00Z',scanCount:scans.length,serverCount:servers.length,scans:scans.map(({oldIndex,newIndex,...s})=>({...s,searchIndex:upgraded?newIndex:oldIndex})),toplists:{schemaVersion:1,current:Object.fromEntries(scans.filter(s=>s.path.startsWith('10/')).map(s=>[s.server,s.id])),monthly:Object.fromEntries([8,9].map(month=>[`2026-0${month}`,Object.fromEntries(scans.filter(s=>s.path.startsWith(`${month}/`)).map(s=>[s.server,s.id]))]))}};}
const assetLog: {url:string;bytes:number;sha256:string;cached:boolean}[]=[];
const assetFailures:string[]=[];
async function asset(url:string){
 assert(/^https:\/\/(pm-lib\.12hp\.de\/PortraitMaker-res\/|sf-libs\.12hp\.de\/coa-lib\/assets\/|images\.weserv\.nl\/\?)/.test(url),'only existing renderer image assets');
 const digest=hash(Buffer.from(url));
 let data=await readFile(path.join(regressionFixture('guilds/fixtures/renderers/renderer-assets'),digest)).catch(()=>undefined);const cached=!!data;
 if(!data){const folder=artifactPath('tmp/w26/renderer-assets');await mkdir(outputPath(folder),{recursive:true});data=await readFile(folder+'/'+digest).catch(()=>undefined);if(!data){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,url);data=Buffer.from(await response.arrayBuffer());await writeFile(outputPath(folder+'/'+digest),data);}}
 assetLog.push({url,bytes:data.length,sha256:hash(data),cached});return data;
}
const aliases: Record<string, string> = {
  "/src/components/ContentShell": "default:Shell", "/src/components/ContentFrame/Frame": "default:Shell",
  "/src/components/guilds/GuildContextBar": "default:None", "/src/components/Filters/ServerSheet": "default:None",
  "/src/components/Filters/ListSwitcher": "default:None", "/src/components/Filters/HudFilters": "default:HudFilters",
  "/src/components/export/ToplistExportController": "default:ExportController", "/src/context/AuthContext": "useAuth",
  "/src/pages/GuildHub/hooks/useGuildHubSelection": "useGuildHubSelection",
  "/src/components/local-player-profile/LocalHeroPanel": "default:Hero",
  "/src/components/local-player-profile/LocalPlayerAnalytics": "default:None",
  "/src/components/local-player-profile/LocalPlayerProfileInsights": "default:None",
  "/src/context/ToplistsDataContext": "Forbidden as ToplistsProvider",
  "/src/components/ProfileOverlay/ProfileOverlay": "default:Forbidden", "/src/components/ProfileOverlay/GuildProfileOverlay": "default:Forbidden",
  "/src/lib/api/toplistsFirestore": "getPlayerToplistSnapshotByDocIdCached",
};
const plugin: Plugin = {
  name: "w08-acquisition-and-presentation", enforce: "pre",
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
   const u=new URL(req.url??'/',`http://${req.headers.host}`);
   if(u.pathname==='/w26/actual-old'){actualMode='old';phase='actual-old-search';res.end('ok');return;}
   if(u.pathname==='/w26/actual-new'){actualMode='new';phase='actual-new-search';res.end('ok');return;}
   if(u.pathname==='/w26/actual-setup'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({scan:realScan,player:realPlayer,manifest:actualOld,oldRevision:actualOld.revision,newRevision:actualNew.revision}));return;}
   if(u.pathname.startsWith('/actual/')){if(u.pathname==='/actual/manifest.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(actualMode==='new'?actualNew:actualOld));return;}
    const rel=decodeURIComponent(u.pathname.slice(8));const b=actualMode==='old'?Buffer.from(actualOldFiles[rel]):await readFile(path.join(actualRoot,rel));transport.push({path:u.pathname+u.search,bytes:b.length,kind:rel.includes('.search.')?'index':'raw',phase});res.setHeader('Cache-Control','max-age=31536000, immutable');res.end(b);return;}
   if(u.pathname==='/w26/update'){upgraded=true;revision=2;res.end('ok');return;}
   if(u.pathname==='/w26/corrupt'){corruptNamed=true;revision=3;res.end('ok');return;}
   if(u.pathname==='/w26/recover'){corruptNamed=false;res.end('ok');return;}
   if(u.pathname==='/w26/hold'){holdKind=u.searchParams.get('kind')??'';held=false;holdPromise=new Promise(resolve=>{releaseHold=resolve;});if(holdKind==='index')revision++;res.end('ok');return;}
   if(u.pathname==='/w26/held'){res.end(JSON.stringify(held));return;}
   if(u.pathname==='/w26/release'){holdKind='';releaseHold?.();res.end('ok');return;}
   if(u.pathname==='/w26/phase'){phase=u.searchParams.get('value')??'unknown';res.end('ok');return;}
   if(u.pathname==='/data/scan-archive/catalog.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({schemaVersion:1,archives:[{year:2026,active:true,manifestUrl:`http://${req.headers.host}/${actualMode?"actual":"archive"}/manifest.json`}]}));return;}
   if(u.pathname==='/archive/manifest.json'){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(manifest()));return;}
   if(u.pathname.startsWith('/archive/')){const search=u.pathname.includes('.search.');const b=bytes.get(search?(upgraded?'new/':'old/')+u.pathname.slice(9):u.pathname);if(!b){res.statusCode=404;res.end('missing');return;}if(holdKind===(search?'index':'raw')&&u.pathname.includes('stumblesteppe')){held=true;await holdPromise;}
   const sent=corruptNamed&&search&&u.pathname.includes('stumblesteppe')?Buffer.from('bad compressed index'):b;
   transport.push({path:u.pathname+u.search,bytes:sent.length,kind:search?'index':'raw',phase});res.setHeader('Cache-Control','max-age=31536000, immutable');res.end(sent);return;}
   if(u.pathname.startsWith('/w26-assets/')){const rel=u.pathname.slice(12),kind=rel.startsWith('portrait/')?'portrait':'coa';const url=kind==='portrait'?'https://pm-lib.12hp.de/'+rel.slice(9):'https://sf-libs.12hp.de/coa-lib/'+rel.slice(4);try{res.setHeader('Content-Type',url.endsWith('.json')?'application/json':'image/png');res.end(await asset(url));}catch(error){assetFailures.push(url+': '+String(error));res.statusCode=503;res.end(String(error));}return;}
   next();
  });},
  resolveId(source, importer) {
    if(source.startsWith('https://pm-lib'))return '\0w26:portrait';
    if(source.startsWith('https://sf-libs'))return '\0w26:coa';
    if (!importer || !source.startsWith(".")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    const key = Object.keys(aliases).find(key => resolved.endsWith(key));
    if (key) return `\0w08:${key}`;
  },
  async load(id) {
    if(id==='\0w26:portrait'||id==='\0w26:coa'){const kind=id.endsWith('portrait')?'portrait':'coa';return (await readFile(regressionFixture(`guilds/fixtures/renderers/${kind}-renderer.js`),'utf8')).replaceAll('import.meta.url',`new URL('/w26-assets/${kind}/${kind==='portrait'?'PortraitMaker-core-latest.min.js':'coa-lib-1.0.0.min.js'}',window.location.origin).href`);}
    if (!id.startsWith("\0w08:")) return;
    const value = aliases[id.slice(5)];
    if (value.startsWith("default:")) return `export { ${value.slice(8)} as default } from '${fixturePath}';`;
    return `export { ${value} } from '${fixturePath}';`;
  },
  transform(code, id) {
    code=code.replace(/\r\n/g,"\n");
    const name = id.replace(/\\/g, "/");
    if (name.endsWith("/src/pages/DataHub/Toplist.tsx")) {
      code = code.replace('  const compareExpected = comparePlan.active;', '  (globalThis as any).w08.compareState = {compareMode, compareFromMonth, compareToMonth, key: comparePlan.loadKey, classes: selectedClasses, current: compareLoadState.current, previous: compareLoadState.previous, error: compareLoadState.error, loading: compareLoadState.loading, status: comparisonResult?.status, currentRows: comparisonResult?.currentPlayerView.rows.length}; const compareExpected = comparePlan.active;');
      code = code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });', '(globalThis as any).w08.loads.push({datasetId, result}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
      code = code.replace('    const complete = (value: LocalToplistFocusTarget)', '    (globalThis as any).w08.acks.push(ack); const complete = (value: LocalToplistFocusTarget)');
    }
    if (name.endsWith("/src/pages/GuildHub/useLocalPlayerProfileAction.ts")) code = code.replace('if (next) setProfile(next);', 'if (next) { (globalThis as any).w08.profile = next; setProfile(next); }');
    if(name.endsWith('/src/lib/guilds/localScanLibrary.ts'))code=code.replace('export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) {','export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) { if((globalThis as any).w26) (globalThis as any).w26.localSearchReads++;').replace('export async function prepareGuildHubSearchProjection(scan: GuildHubLocalScan, reset: string, options: HubSearchExecutionOptions = {}) {','export async function prepareGuildHubSearchProjection(scan: GuildHubLocalScan, reset: string, options: HubSearchExecutionOptions = {}) { if((globalThis as any).w26) (globalThis as any).w26.localSearchReads++;');
    return code;
  },
};

const chrome = process.env.W08_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w08-", 'browser-profiles'));
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
const evidenceRows:any[]=[];

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
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception:", JSON.stringify(message.params.exceptionDetails));
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update")) console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: `about:blank`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.method!=='Fetch.requestPaused')return;const {requestId,request}=m.params;
   void(async()=>{if(request.url.startsWith(origin)||request.url.startsWith('data:')){await call('Fetch.continueRequest',{requestId},sessionId);return;}
    try {if(request.url.startsWith('https://fonts.googleapis.com')){await call('Fetch.fulfillRequest',{requestId,responseCode:200,body:''},sessionId);return;}
     const kind=request.url==='https://pm-lib.12hp.de/PortraitMaker-core-latest.min.js'?'portrait':request.url==='https://sf-libs.12hp.de/coa-lib/coa-lib-1.0.0.min.js'?'coa':null;
     const b=kind?Buffer.from((await readFile(regressionFixture(`guilds/fixtures/renderers/${kind}-renderer.js`),'utf8')).replaceAll('import.meta.url',JSON.stringify(`${origin}/w26-assets/${kind}/${kind==='portrait'?'PortraitMaker-core-latest.min.js':'coa-lib-1.0.0.min.js'}`))):await asset(request.url);
     await call('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:kind?'application/javascript':'image/png'},{name:'Access-Control-Allow-Origin',value:'*'}],body:b.toString('base64')},sessionId);
    }catch(error){assetFailures.push(request.url+': '+String(error));console.log('asset missing',request.url,String(error));await call('Fetch.failRequest',{requestId,errorReason:'Failed'},sessionId);}
   })().catch(error=>console.log(String(error)));
  });
  await call('Fetch.enable',{patterns:[{urlPattern:'*'}]},sessionId);
  await call('Page.navigate',{url:`${origin}/tools/toplists/fixtures/localToplistArchive/proof.html`},sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (await evaluate(sessionId, "Boolean(globalThis.w08?.ready)")) break;
    await pause();
  }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w08?.ready)"), true, "React fixture must load");
  await evaluate(sessionId,"w26.run().then(result=>{w26.result=result;w26.done=true;},error=>{w26.error=error.stack;w26.done=true;}); undefined");
  for(let i=0;i<3500;i++){if(await evaluate(sessionId,"Boolean(w26.done)"))break;await pause();}
  const error=await evaluate(sessionId,"w26.error");
  if(error){console.log(await evaluate(sessionId,"({error:w26.error,scope:w26.filters?.servers,messages:w26.messages.slice(-20),body:document.body.innerText.slice(-2000),acks:w26.acks})"));}
  assert.equal(error,undefined,error);assert.equal(await evaluate(sessionId,"w26.done"),true);
  const result=await evaluate(sessionId,"w26.result");
  for(const width of [1400,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false},sessionId);
    await evaluate(sessionId,"w26.visual()");
    await new Promise(resolve=>setTimeout(resolve,2000));
    const pixels=await evaluate(sessionId,`[...document.querySelectorAll('#guild-hub-local-toplist-search-results canvas')].map(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return {width:c.width,height:c.height,opaque:p.filter((v,i)=>i%4===3&&v>0).length};})`);
    assert(pixels.length===6&&pixels.every((p:any)=>p.opaque>0),'real portrait pixels');
    const artworks=await evaluate(sessionId,"({coa:[...document.querySelectorAll('[data-search-coa]')].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})),classes:[...document.querySelectorAll('[data-search-class]')].map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0}))})");
    assert(artworks.coa.length===3&&artworks.coa.every((i:any)=>i.src.startsWith('data:image')&&i.loaded),'real CoA pixels');
    assert(artworks.classes.length===6&&artworks.classes.every((i:any)=>i.loaded),'class icons loaded');
    const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(`${evidence}/${width}.png`),Buffer.from(shot.data,'base64'));evidenceRows.push({width,pixels,artworks});
    await evaluate(sessionId,"(()=>{const panel=document.getElementById('guild-hub-local-toplist-search-results');panel.scrollTop=panel.scrollHeight;})()");
    const guildShot=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(`${evidence}/${width}-guilds.png`),Buffer.from(guildShot.data,'base64'));
  }
  const actual=await evaluate(sessionId,'w26.actualArtifacts()');
  const actualShot=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);await writeFile(outputPath(`${evidence}/actual-archive.png`),Buffer.from(actualShot.data,'base64'));
  await writeFile(outputPath(`${evidence}/results.json`),JSON.stringify({result,actual,transport,visual:evidenceRows,assetLog,assetFailures},null,2)+'\n');
  assert.deepEqual(assetFailures,[],'all actual renderer assets must load');
  console.log(result.results.join('\n'));
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
