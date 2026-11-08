import { outputPath, regressionFixture, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
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
const completeGuild=process.argv.includes("--benchmark");
const player=(id:number,at:number,name:string)=>({identifier:`f8_net_p${id}`,prefix:"f8_net",timestamp:at,name,class:1,level:101,rank:id,guildIdentifier:"f8_net_g1",guildName:"Fixture Guild",...(completeGuild?{xpTotal:at===timestamp?2000:at===older?1000:500,baseMain:at===timestamp?150:at===older?100:50,conBase:100,strengthBase:at===timestamp?150:at===older?100:50,dexterityBase:0,intelligenceBase:30,constitutionBase:100,luckBase:20}:{}),values:{Base:1000,Attribute:2000,"Base Strength":500,"Base Constitution":500}});
const guild=(at:number)=>({identifier:"f8_net_g1",prefix:"f8_net",timestamp:at,name:"Fixture Guild",rank:1,memberCount:3,memberIdentifiers:["f8_net_p1","f8_net_p2","f8_net_p3"]});
const byteMap=new Map<string,Buffer>(); const descriptors:any[]=[];
const baselineAt=Date.UTC(2026,7,6,12);
const extraGuildScans=completeGuild ? [["baseline",baselineAt,[1,2,3].map(n=>player(n,baselineAt,`Historical Player ${n}`)),[guild(baselineAt)]] as const] : [];
for(const [id,at,players,groups] of [
 ["current-a",timestamp,(completeGuild?[1,2,3].map(n=>player(n,timestamp,`Current Player ${n}`)):[player(1,timestamp,"Current Player 1")]),[guild(timestamp)]],
 ["current-b",timestamp,[player(2,timestamp,"Current Player 2"),player(3,timestamp,"Archive Player 3")],[]],
 ["historical",older,(completeGuild?[1,2,3].map(n=>player(n,older,`Historical Player ${n}`)):[player(1,older,"Historical Player 1")]),[guild(older)]],
 ...extraGuildScans,
] as const){
 const raw=Buffer.from(JSON.stringify({players,groups}));const zipped=gzipSync(raw);const sha256=createHash("sha256").update(zipped).digest("hex");
 const index=Buffer.from(JSON.stringify({schemaVersion:1,archiveScanId:id,sourceSha256:sha256,server:"f8_net",timestamp:at,players:players.map(p=>({identifier:p.identifier,name:p.name,guildIdentifier:p.guildIdentifier,guildName:p.guildName})),guilds:groups.map(g=>({identifier:g.identifier,name:g.name}))}));const compressed=gzipSync(index);
 byteMap.set(`/archive/${id}.gz`,zipped);byteMap.set(`/archive/search/${id}.search.json.gz`,compressed);
 descriptors.push({id,server:"f8_net",timestamp:at,path:`${id}.gz`,format:"sftools.raw.v1",compression:"gzip",sha256,compressedBytes:zipped.length,uncompressedBytes:raw.length,playerCount:players.length,groupCount:groups.length,
 searchIndex:{schemaVersion:1,path:`search/${id}.search.json.gz`,sha256:createHash("sha256").update(compressed).digest("hex"),compressedBytes:compressed.length,uncompressedBytes:index.length,playerCount:players.length,groupCount:groups.length}});
}
const transport:{path:string;bytes:number}[]=[];let corruptSidecar=false;let rawOffline=false;
function serveArchive(url:string,host:string,res:any){
 if(!url.includes('catalog.json')&&!url.startsWith('/archive/'))return false;
 if(url.startsWith('/archive/control')){const control=new URL(url,`http://${host}`).searchParams;corruptSidecar=control.get('corrupt')==='1';rawOffline=control.get('raw')==='offline';res.setHeader('Content-Type','application/json');res.end('{}');return true;}
 if(url==='/archive/metrics.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(transport));return true;}
 if(rawOffline && url==='/archive/historical.gz'){transport.push({path:url,bytes:0});res.statusCode=503;res.end('controlled offline');return true;}
 const manifestUrl=`http://${host}/archive/manifest.json`;
 const manifest={schemaVersion:1,archiveYear:2026,revision:1,updatedAt:new Date(timestamp).toISOString(),scanCount:descriptors.length,serverCount:1,scans:descriptors,toplists:{schemaVersion:1,current:{f8_net:{scanIds:['current-a','current-b']}},monthly:{'2026-09':{f8_net:'historical'},'2026-10':{f8_net:{scanIds:['current-a','current-b']}},...(completeGuild?{'2026-08':{f8_net:'baseline'}}:{})}}};
 const catalog={schemaVersion:1,archives:[{year:2026,active:true,manifestUrl}]};
 const bytes=(corruptSidecar && url==='/archive/search/current-a.search.json.gz' ? Buffer.from('damaged sidecar') : byteMap.get(url))??Buffer.from(JSON.stringify(url.endsWith('catalog.json')?catalog:url.endsWith('setup.json')?{catalog,manifest}:manifest));
 transport.push({path:url,bytes:bytes.length});res.setHeader('Content-Type',byteMap.has(url)?'application/gzip':'application/json');res.end(bytes);return true;
}
const fixturePath = "/tools/guilds/fixtures/dataHubRuntimeAudit/mocks.tsx";
const aliases: Record<string,string> = {
  "/src/lib/firebase":"db", "/src/context/AuthContext":"useAuth",

  "/src/components/ContentShell":"default:Shell", "/src/components/ContentFrame/Frame":"default:Shell",
  "/src/components/Topbar/Topbar":"default:Topbar", "/src/components/LogoDock/LogoDock":"default:None",
  "/src/components/auth/LoginModalHost":"default:None",
  "/src/components/avatar/PortraitPreview":"default:Portrait",
  "/src/components/Filters/ServerSheet":"default:None", "/src/components/Filters/ListSwitcher":"default:None",
  "/src/components/Filters/HudFilters":"default:HudFilters",

  "/src/context/ToplistsDataContext":"Forbidden as ToplistsProvider",
  "/src/components/ProfileOverlay/ProfileOverlay":"default:Forbidden", "/src/components/ProfileOverlay/GuildProfileOverlay":"default:Forbidden",
  "/src/lib/api/toplistsFirestore":"getPlayerToplistSnapshotByDocIdCached",
};
for (const page of ["Planner","Waitlist","Activity","Announcements","Events","Roles","Settings"]) aliases["/src/pages/GuildHub/"+page]="default:RegisteredPage";
const plugin: Plugin = {
 name:"w12-production-routes", enforce:"pre",
 configureServer(server) {
  server.middlewares.use(async (req,res,next) => {
   if ((req.url??'').startsWith('/w32/ocr/') || (req.url??'').startsWith('/w32/core/')) {
    const core=(req.url??'').startsWith('/w32/core/'), name=path.basename((req.url??'').split('?')[0]);
    const file=core?path.join('node_modules/tesseract.js-core',name):name==='worker.min.js'?'node_modules/tesseract.js/dist/worker.min.js':path.join(regressionFixture('guilds/fixtures/ocr-assets'),name);
    const bytes=await readFile(file);res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'application/javascript':'application/octet-stream');res.end(bytes);return;
   }
   if(serveArchive(req.url ?? "", req.headers.host ?? "", res)) return;
   const pathname=req.url?.split('?')[0];
   if(!['/','/test/','/beta/'].includes(pathname??'')){next();return;}
   const html=(await readFile('tools/guilds/fixtures/dataHubRuntimeAudit/proof.html','utf8')).replace('./fixture.tsx','/tools/guilds/fixtures/dataHubRuntimeAudit/fixture.tsx');
   res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url!,html));
  });
 },
 resolveId(source,importer) {
  if(source === "firebase/firestore" && /(?:compareGuilds|FusionPlanner|SetupTab)\.tsx$/.test(importer??""))return path.resolve("tools/guilds/fixtures/dataHubRuntimeAudit/firestore.ts");
  if(source.startsWith("https://sf-libs"))return "\0w12:coa";
  if(!importer||!source.startsWith("."))return;
  const resolved=path.resolve(path.dirname(importer),source).replace(/\\/g,"/").replace(/\.(tsx?|jsx?)$/,"");
  const key=Object.keys(aliases).find(key=>resolved.endsWith(key)); if(key)return "\0w12:"+key;
 },
 async load(id) {const oldIndex=process.argv.indexOf("--old-source");const clean=id.replace(/\\/g,"/").split("?")[0];if(oldIndex>=0&&!id.startsWith("\0")&&clean.includes("/src/")&&/\.[cm]?[jt]sx?$/.test(clean))return readFile(path.join(process.argv[oldIndex+1],"src",clean.split("/src/")[1]),"utf8");if(id==="\0w12:coa")return "export class CoaRenderer {}";if(!id.startsWith("\0w12:"))return;const value=aliases[id.slice(5)];return value.startsWith("default:")?`export { ${value.slice(8)} as default } from '${fixturePath}';`:`export { ${value} } from '${fixturePath}';`;},
 transform(code,id) {
  code=code.replace(/\r\n/g,"\n");const name=id.replace(/\\/g,"/");
  if(process.argv.includes('--w16-probe') && name.endsWith('/fixtures/dataHubRuntimeAudit/fixture.tsx')) code='import "../hubSearchCooperative/browserProbe";\n'+code;
  const add=(anchor:string,counter:string)=>{assert(code.includes(anchor),`missing instrument anchor ${counter} in ${name}`);code=code.replace(anchor,anchor+` (globalThis as any).w14Hit?.(${JSON.stringify(counter)});`);};
  if(name.endsWith('/src/lib/parsing/normalizedPlayer.ts'))add('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {','playerCore');
  if(name.endsWith('/src/lib/guilds/guildScanNormalizer.ts'))add('): NormalizedGuildMember | null {','guildMember');
  if(name.endsWith('/src/lib/data-hub/hubSearchProjection.ts')) {
   const asyncPath=code.includes('buildHubSearchProjectionCooperatively');
   if(asyncPath) {
    add('export function buildHubSearchProjection(scan: GuildHubLocalScan, rows: readonly HubSearchRawRow[], reset: string): HubSearchProjection {','searchProjectionSync');
    code=code.replace('  const work = projectHubSearchRows(scan, rows, reset);', '  const w14At=performance.now(); const work = projectHubSearchRows(scan, rows, reset);').replace('if (next.done) return next.value;', 'if (next.done) { (globalThis as any).w14Timing?.("searchProjectionSyncCpu",w14At); return next.value; }');
    const anchor='  return runHubSearchWork(projectHubSearchRows(scan, rows, reset), options);';
    assert(code.includes(anchor),'missing cooperative projection instrument anchor');
    code=code.replace(anchor, '  (globalThis as any).w14Hit?.("searchProjection"); (globalThis as any).w16SourceStart?.(scan.id, true); try { return await runHubSearchWork(projectHubSearchRows(scan, rows, reset), options); } finally { (globalThis as any).w16SourceEnd?.(scan.id); }');
   } else {
    code=code.replace('  const documents: HubSearchDocument[]', '  (globalThis as any).w16SourceStart?.(scan.id); const w14At=performance.now(); const documents: HubSearchDocument[]').replace('  return { version: HUB_SEARCH_PROJECTION_VERSION', '  (globalThis as any).w16SourceEnd?.(scan.id); (globalThis as any).w14Timing?.("searchProjectionCpu",w14At); return { version: HUB_SEARCH_PROJECTION_VERSION');
    add('export function buildHubSearchProjection(scan: GuildHubLocalScan, rows: readonly HubSearchRawRow[], reset: string): HubSearchProjection {','searchProjection');
   }
  }
  if(name.endsWith('/src/lib/data-hub/hubSearchExecution.ts')) {
   code=code.replace('if (next.done) { checkHubSearchExecution(options); return next.value; }', 'if (next.done) { (globalThis as any).w14Timing?.("searchParserProjectionCpu",started); (globalThis as any).w16Slice?.(started,steps,false); checkHubSearchExecution(options); return next.value; }');
   const anchor='      await new Promise<void>(resolve => setTimeout(resolve, 0));';
   assert(code.includes(anchor),'missing cooperative yield instrument anchor');
   code=code.replace(anchor, '      (globalThis as any).w14Timing?.("searchParserProjectionCpu",started); (globalThis as any).w16Slice?.(started,steps,true);\n'+anchor);
  }
  if(name.endsWith('/src/lib/guilds/localScanLibrary.ts')) {
   code=code.replace('      const value = values[index];', '      (globalThis as any).w16RowsStarted?.(scan.id); const value = values[index];');
   code=code.replace('export function readGuildHubSearchRows(scan: GuildHubLocalScan): HubSearchRawRow[] {', 'export function readGuildHubSearchRows(scan: GuildHubLocalScan): HubSearchRawRow[] { const w14At=performance.now();').replace('  return rows;\n}', '  (globalThis as any).w14Timing?.("searchParserCpu",w14At); return rows;\n}');
   add('export async function readGuildHubLocalScanForSearch(id: string) {','searchRawReader');
   add(code.includes('export async function putHubSearchProjection(projection: HubSearchProjection, options:') ? 'export async function putHubSearchProjection(projection: HubSearchProjection, options: HubSearchExecutionOptions = {}) {' : 'export async function putHubSearchProjection(projection: HubSearchProjection) {','projectionCommit');
   const commitStart=code.indexOf('export async function putHubSearchProjection('),commitEnd=code.indexOf('export async function resetHubSearchProjections(',commitStart);
   assert(commitStart>=0 && commitEnd>commitStart,'missing projection commit window');
   const commit=code.slice(commitStart,commitEnd).replace('  const db =', '  const w16CommitAt=performance.now(); (globalThis as any).w16CommitStart?.(projection.source,w16CommitAt); const db =').replace('  });\n}', '  }).finally(()=>{ (globalThis as any).w14Timing?.("projectionCommitElapsed",w16CommitAt); (globalThis as any).w16CommitEnd?.(projection.source); });\n}');
   code=code.slice(0,commitStart)+commit+code.slice(commitEnd);

   add('export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> {','summaryEnsure');
   add('async function persistScanNormalizationIfNeeded(db: IDBPDatabase<LocalScanDb>, scan: GuildHubLocalScan): Promise<GuildHubLocalScan | null> {','normalizationRepairCheck');
   add('async function performGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) {','readiness');
   code+='\n(globalThis as any).w14ReadinessInspect=()=>({flights:readinessInFlight.size,consumers:[...readinessInFlight.values()].reduce((n,e)=>n+e.consumers,0)});';
  }
  if(name.endsWith('/src/pages/GuildHub/fightReportOcr.ts')) code=code.replace('logger: (message)', 'workerPath: location.origin+"/w32/ocr/worker.min.js", langPath: location.origin+"/w32/ocr", corePath: location.origin+"/w32/core", logger: (message)');
  if(name.endsWith('/src/components/export/ToplistExportController.tsx')) code=code.replace('    return (\n      <>\n        <ToplistPngExportDialog', '    (globalThis as any).w32Export=handleConfirmExportPng;\n    return (\n      <>\n        <ToplistPngExportDialog');
  if(name.endsWith('/src/pages/DataHub/Toplist.tsx')) code=code.replace('  const currentSearchResults =', '  (globalThis as any).w32ExportPrepare=handleLocalExportPng;\n  const currentSearchResults =');
  if(name.endsWith('/src/pages/GuildHub/FightTracking.tsx'))code=code.replace('  const syncPanel =', '  (globalThis as any).w14Tracker={tracker,trackerMembers,syncPlan,trackerScanSnapshot,openTracker,loadSyncPlan,handleImportScanMembers,createManualTracker,setSetupGuildName,setSetupGuildServer}; const syncPanel =');
  if(name.endsWith('/src/lib/data-hub/localProfileEntry.ts'))code=code.replace('      const bindings = metadata.bindings.filter', '      (globalThis as any).w14Hit?.("w12Recovery"); if((globalThis as any).w14RecoveryGate){(globalThis as any).w14RecoveryHeld=true;await (globalThis as any).w14RecoveryGate;check(allowed);} const bindings = metadata.bindings.filter');
  if(name.endsWith('/src/lib/data-hub/dataHubScanInventory.ts')) {
   code=code.replace('  start() {', '  start() { (globalThis as any).w14Hit?.("inventoryStart"); ((globalThis as any).w14Inventories ??= new Set()).add(this);');
   code=code.replaceAll('await this.dependencies.readLocal()', '((globalThis as any).w14Hit?.("inventoryMetadata"), await this.dependencies.readLocal())');
   add('  async refreshArchive() {','inventoryArchive');
   code=code.replace('const proof = await this.dependencies.confirm', '(globalThis as any).w14Hit?.("inventoryConfirm"); const proof = await this.dependencies.confirm');
  }
  if(name.endsWith('/src/lib/data-hub/hubSearchService.ts')) {
   code=code.replace('          this.costs.projectionBytes +=', '          const w16SerialAt=performance.now(); this.costs.projectionBytes +=').replace('JSON.stringify(projection)).byteLength;', 'JSON.stringify(projection)).byteLength; (globalThis as any).w14Timing?.("projectionSerializationCpu",w16SerialAt);');
  }
  if(name.endsWith('/src/lib/data-hub/hubSearchService.ts'))add('  start(query: HubSearchQuery) {','searchStart');
  if(name.endsWith('/src/lib/data-hub/hubSearchService.ts'))code=code.replace('  start(query: HubSearchQuery) {', '  start(query: HubSearchQuery) { (globalThis as any).w12?.searchControllers.push(this);');
  if(name.endsWith('/src/pages/GuildHub/localPlayerProfileAdapter.ts'))code=code.replace('  const normalized = seed', '  (globalThis as any).w14Hit?.("profileAdapter"); const normalized = seed');
  if(name.endsWith('/src/lib/local-player-profile/historyBasis.ts'))code=code.replace('  counters.preparation++;', '  (globalThis as any).w14Hit?.("historyPreparation"); counters.preparation++;');
  if(name.endsWith('/src/lib/local-player-profile/coordinator.ts'))code=code.replace('const realmCoordinator = createLocalPlayerProfileCoordinator();', 'const realmCoordinator = createLocalPlayerProfileCoordinator(); (globalThis as any).w12Coordinator=realmCoordinator;');
  if(name.endsWith('/src/lib/toplists/localToplistDerivation.ts'))add('): LocalToplistDerivationResult {','toplistDerivation');
  if(name.endsWith('/src/lib/guilds/localGuildAnalyticsStore.ts'))code=code.replace('  const snapshotRecords: GuildAnalyticsDerivedSnapshot[] = [];', '  (globalThis as any).w14Hit?.("analyticsBuild"); const snapshotRecords: GuildAnalyticsDerivedSnapshot[] = [];');
  if(name.endsWith('/src/lib/guilds/localGuildAnalyticsStore.ts'))code=code.replace('export async function ensureGuildAnalyticsDerivedData(scans: GuildHubLocalScan[]): Promise<GuildAnalyticsDerivedData> {', 'export async function ensureGuildAnalyticsDerivedData(scans: GuildHubLocalScan[]): Promise<GuildAnalyticsDerivedData> { (globalThis as any).w14Hit?.("analyticsEnsure");');
  if(name.endsWith('/src/lib/scanArchive/localFirstScanAcquisition.ts'))code+='\n(globalThis as any).w14AcquisitionInspect=()=>inFlightArchiveImports.size;';
  if(name.endsWith('/src/pages/DataHub/Toplist.tsx'))code=code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });','(globalThis as any).w08.loads.push({result,datasetId}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
  return code;
 }

};

const evidenceDirectory = outputPath(process.argv.includes("--extended-only") ? artifactPath("tmp/w32/extended") : process.env.SFDATAHUB_FINAL_EVIDENCE ?? artifactPath("tmp/w32/browser"));
await mkdir(outputPath(evidenceDirectory),{recursive:true});
const chrome = process.env.W13_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w14-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next", "@tanstack/react-virtual", "tesseract.js"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null } });
let child: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined;
let activeSession: string | undefined;
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
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception:", message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text, message.params.exceptionDetails.url, JSON.stringify(message.params.exceptionDetails.stackTrace));
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update")) console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  activeSession=sessionId;
  await call("Runtime.enable", {}, sessionId);
  await call("Page.enable", {}, sessionId);
  await call("Page.addScriptToEvaluateOnNewDocument", {source:process.argv.includes("--audit-off") ? "localStorage.removeItem(\"sfh:debug:dataHubRuntimeAudit\");" : "localStorage.setItem(\"sfh:debug:dataHubRuntimeAudit\",\"1\");"}, sessionId);
  await call("Page.navigate", {url:`${origin}/tools/guilds/fixtures/dataHubRuntimeAudit/proof.html`}, sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const waitReady = async (session: string, previousDocument?: string) => { for (let i=0;i<1200;i++) { if (await evaluate(session,`Boolean(globalThis.w12?.ready) && globalThis.w12.documentId !== ${JSON.stringify(previousDocument)}`)) return; await pause(); } throw Error("production fixture did not load"); };
  await waitReady(sessionId);
  const saveAudit=async(label:string)=>{const snapshot=await evaluate(sessionId,'globalThis.sfhDataHubRuntimeAudit?.snapshot()??null');await writeFile(outputPath(`${evidenceDirectory}/${label}-audit.json`),JSON.stringify(snapshot,null,2)+'\n');};
  if(process.argv.includes('--extended-only')){
   const extended=await evaluate(sessionId,'w32Extended()');await writeFile(outputPath(`${evidenceDirectory}/extended-results.json`),JSON.stringify(extended,null,2));await saveAudit('extended');
  } else if(process.argv.includes('--benchmark')){
   await evaluate(sessionId,'w12.run()');await evaluate(sessionId,'w32DashboardBench()');
   for(let n=1;n<=(process.argv.includes("--proof-only")?0:3);n++) {const previous=await evaluate(sessionId,'w12.documentId');await call('Page.reload',{},sessionId);await waitReady(sessionId,previous);const result=await evaluate(sessionId,'w32DashboardBench()');await writeFile(outputPath(`${evidenceDirectory}/guild-bench-${n}.json`),JSON.stringify(result,null,2));}
   await evaluate(sessionId,`(async()=>{w12.navigate('/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard');for(let n=0;n<1500;n++){if(document.querySelector('svg[aria-label="Gilden-Basiswerte-Trend"]')&&document.querySelectorAll('svg[data-trend]').length>=4)return;await new Promise(r=>setTimeout(r,20));}throw Error('Guild screenshot readiness');})()`);
   const metrics=await call('Page.getLayoutMetrics',{},sessionId);const fullShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1400,height:Math.min(metrics.cssContentSize.height,16000),scale:1}},sessionId);await writeFile(outputPath(`${evidenceDirectory}/guild-complete.png`),Buffer.from(fullShot.data,'base64'));
   await evaluate(sessionId,`(async()=>{const el=document.querySelector('button[aria-label="Current Player 1 lokales Spielerprofil öffnen"]');for(let p=el?.parentElement;p;p=p.parentElement){if(p.scrollHeight>p.clientHeight+5&&p.clientHeight>200){p.scrollTop=Math.max(0,el.getBoundingClientRect().top-p.getBoundingClientRect().top+p.scrollTop-50);break;}}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
   const cardsShot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(outputPath(`${evidenceDirectory}/guild-cards.png`),Buffer.from(cardsShot.data,'base64'));


  } else {
  const preparedDashboard=await evaluate(sessionId,'w14PreparedDashboard()');await writeFile(outputPath(`${evidenceDirectory}/prepared-dashboard-results.json`),JSON.stringify(preparedDashboard,null,2)+'\n');
  const opening=await evaluate(sessionId,"w12.run()");
  await writeFile(outputPath(`${evidenceDirectory}/opening-results.json`),JSON.stringify(opening,null,2)+'\n');
  await saveAudit('opening');
  const previousDocument=await evaluate(sessionId,'w12.documentId');
  await call('Page.reload',{},sessionId);await waitReady(sessionId,previousDocument);
  const reload=await evaluate(sessionId,'w12.reloadCheck()');
  await writeFile(outputPath(`${evidenceDirectory}/reload-results.json`),JSON.stringify(reload,null,2)+'\n');
  await saveAudit('reload');
  const recovery=await evaluate(sessionId,'w14Recovery()');
  await writeFile(outputPath(`${evidenceDirectory}/recovery-results.json`),JSON.stringify(recovery,null,2)+'\n');
  const large=[];
  for(const kind of ['single','multi']) {large.push(await evaluate(sessionId,`w14Large('${kind}')`));await writeFile(outputPath(`${evidenceDirectory}/large-results.json`),JSON.stringify(large,null,2)+'\n');}
  if(process.argv.includes('--w16-races')) {
   for(const sample of large) {
    const jobs=sample.cold.sourceWork;
    assert.equal(jobs?.length,sample.sourceCount,'cooperative source hooks must cover every source');
    for(const job of jobs) {
     assert(job.slices.length>1 && job.slices.some((slice:any)=>slice.yielded),'bounded work/yield hooks required');
     assert(job.slices.every((slice:any)=>slice.finished-slice.started<50),'projection slice longtask');
     assert(job.action?.beforeSourceComplete && job.action.completedRows>0 && job.action.completedRows<sample.perSource,'input must run inside projected source rows');
     assert(job.action.completedSlices>0 && job.action.focused && job.action.value==='Large','browser input callback evidence');
    }
   }
   console.log('PASS W16 bounded projection CPU and browser input between document slices for both stocks');
  }
  if(process.argv.includes('--w16-races')) { const races=await evaluate(sessionId,'w16BrowserRaces()'); await writeFile(artifactPath('tools/guilds/fixtures/hubSearchCooperative/browser-races.json'),JSON.stringify(races,null,2)+'\n'); console.log('PASS W16 four browser races inside source documents'); }
  const overlays=await evaluate(sessionId,'w14Overlays()');await writeFile(outputPath(`${evidenceDirectory}/overlay-results.json`),JSON.stringify(overlays,null,2)+'\n');
  const neighbors=await evaluate(sessionId,'w14Neighbors()');await writeFile(outputPath(`${evidenceDirectory}/neighbor-results.json`),JSON.stringify(neighbors,null,2)+'\n');
  await saveAudit('features');
  const shot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(outputPath(`${evidenceDirectory}/desktop.png`),Buffer.from(shot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);await new Promise(resolve=>setTimeout(resolve,200));const mobile=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(outputPath(`${evidenceDirectory}/mobile-390.png`),Buffer.from(mobile.data,'base64'));
  const neighborDocument=await evaluate(sessionId,'w12.documentId');await call('Page.reload',{},sessionId);await waitReady(sessionId,neighborDocument);const neighborReload=await evaluate(sessionId,'w14NeighborReload()');await writeFile(outputPath(`${evidenceDirectory}/neighbor-reload-results.json`),JSON.stringify(neighborReload,null,2)+'\n');
  await saveAudit('neighbor-reload');
  const extended=await evaluate(sessionId,'w32Extended()');await writeFile(outputPath(`${evidenceDirectory}/extended-results.json`),JSON.stringify(extended,null,2));await saveAudit('extended');
  assert.deepEqual(await evaluate(sessionId,'w12.errors'),[]);
  await writeFile(outputPath(`${evidenceDirectory}/browser-results.json`),JSON.stringify({groups:['fresh prepared dashboard current','combined cold','combined warm','persisted reload','five warm queries','visible profile target','full set visible toplist ACK','W12 surviving binding offline/retry/new-ID/fixed/free/unusable/stale','large single source','large multiple sources','overlay history and scanmanagement','filters and explicit tracker sync','filter and tracker reload'],transport,errors:[]},null,2)+'\n');
  console.log('PASS W14 13 groups: combined costs, targets, recovery, large sources, overlays, filters, tracker sync and reload');
  }
  await call('Target.disposeBrowserContext',{browserContextId});
} finally {
  if (activeSession && socket?.readyState === WebSocket.OPEN) {
   try { const state=await evaluate(activeSession,'({body:document.body.innerText,location:globalThis.w12?.location,routeLocation:globalThis.w12?.routeLocation,hash:location.hash,errors:globalThis.w12?.errors,proof:globalThis.w32ExtendedProof,audit:globalThis.sfhDataHubRuntimeAudit?.snapshot()??null})');await writeFile(outputPath(`${evidenceDirectory}/last-observed-state.json`),JSON.stringify(state,null,2)); } catch {}
  }
  socket?.close();child?.kill();await server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(()=>{});
}
