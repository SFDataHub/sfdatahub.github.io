import { temporaryPrefix, artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile and incognito context; no user browser or cloud writes.
// Actual production registration, gates, layout, parents, local profile pipeline,
// IDB and ScanManagement. Neighbor screens and external presentation are stubs.
const fixturePath = "/tools/guilds/fixtures/dataHubRoutes/mocks.tsx";
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
const workerCosts:unknown[]=[];
const plugin: Plugin = {
 name:"w12-production-routes", enforce:"pre",
 configureServer(server) {
  server.middlewares.use(async (req,res,next) => {
   if(req.url==='/__w15cost'){let body='';for await(const chunk of req)body+=chunk;workerCosts.push(JSON.parse(body));res.end('{}');return;}
   const pathname=req.url?.split('?')[0];
   if(!['/','/test/','/beta/'].includes(pathname??'')){next();return;}
   const html=(await readFile('tools/guilds/fixtures/dataHubRoutes/proof.html','utf8')).replace('./fixture.tsx','/tools/guilds/fixtures/dataHubRoutes/fixture.tsx');
   res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url!,html));
  });
 },
 resolveId(source,importer) {
  if(source.startsWith("https://sf-libs"))return "\0w12:coa";
  if(!importer||!source.startsWith("."))return;
  const resolved=path.resolve(path.dirname(importer),source).replace(/\\/g,"/").replace(/\.(tsx?|jsx?)$/,"");
  const key=Object.keys(aliases).find(key=>resolved.endsWith(key)); if(key)return "\0w12:"+key;
 },
 load(id) {if(id==="\0w12:coa")return "export class CoaRenderer {}";if(!id.startsWith("\0w12:"))return;const value=aliases[id.slice(5)];return value.startsWith("default:")?`export { ${value.slice(8)} as default } from '${fixturePath}';`:`export { ${value} } from '${fixturePath}';`;},
 transform(code,id) {
 code=code.replace(/\r\n/g,"\n");const name=id.replace(/\\/g,"/");
 if(name.endsWith("/src/pages/DataHub/localToplistPageModel.ts"))code=code.replace('): Promise<LocalToplistArchiveContext> {','): Promise<LocalToplistArchiveContext> { if ((globalThis as any).w08?.context) return (globalThis as any).w08.context;');
 if(name.endsWith("/src/lib/toplists/localToplistService.ts"))code=code.replace('  ...defaultDependencies,','  ...defaultDependencies, acquireEntries:(globalThis as any).w08?.acquire ?? defaultDependencies.acquireEntries,');
 if(name.endsWith("/src/pages/DataHub/Toplist.tsx"))code=code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });','(globalThis as any).w08.loads.push({result,datasetId}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts")){
 code='import {registerScan,recordRead} from "/tools/guilds/fixtures/profileBrowserGuards/costProbe";\n'+code;
 code=code.replace('export function normalizeGuildHubLocalScanForDerivation(scan: GuildHubLocalScan): GuildHubLocalScan {','export function normalizeGuildHubLocalScanForDerivation(scan: GuildHubLocalScan): GuildHubLocalScan { registerScan(scan);');
 code=code.replace('  const scan = await db.get(SCAN_STORE, id);','  const scan = await db.get(SCAN_STORE, id); recordRead(scan,id,new Error().stack??"\");');
 }
 if(name.endsWith("/src/lib/data-hub/localProfileEntry.ts")){
 code=code.replace('  if (entry.observation.kind === "invalid")','  try { if (entry.observation.kind === "invalid")').replace('  return read(selected);\n}','  return await read(selected); } finally { const proof=(globalThis as any).w12;if(proof)proof.requestEnds++; }\n}').replace('return read(entry.observation.anchor);','return await read(entry.observation.anchor);').replace('return finish(prepared);','return await finish(prepared);');
 code='import {recordValidity} from "/tools/guilds/fixtures/profileBrowserGuards/costProbe";\n'+code.replaceAll('await isLocalPlayerCurrentSeedValid(prepared, prepared)','await recordValidity(isLocalPlayerCurrentSeedValid(prepared, prepared),prepared)');}
 if(name.endsWith("/src/pages/GuildHub/Dashboard.tsx"))code=code.replace('if (seed) profileNavigation.open(seed);','if (seed) { (globalThis as any).w12.lastSeed=seed; profileNavigation.open(seed); }');
 if(name.endsWith("/src/lib/parsing/normalizedPlayer.ts"))code='import {recordCore} from "/tools/guilds/fixtures/profileBrowserGuards/costProbe";\n'+code.replace('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {','export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => { recordCore(player,new Error().stack??"\");');
 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts"))code=code.replace('export async function getGuildHubLocalScan(id: string) {','export async function getGuildHubLocalScan(id: string) { const proof=(globalThis as any).w12; if(proof){proof.reads.push((new Error().stack?.includes("localProfileEntry")?"entry:":"history/parent:")+id); if(proof.gate && proof.gateSource===id){proof.gateHeld=true;await proof.gate;}}');
 if(name.endsWith("/src/lib/parsing/normalizedPlayer.ts"))code=code.replace('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {','export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => { (globalThis as any).w12?.cores.push(String((player as any)?.name));');
 if(name.endsWith("/src/pages/GuildHub/localPlayerProfileAdapter.ts"))code=code.replace('  const normalized = seed', '  (globalThis as any).w12?.builds.push(input.sourceScanId); const normalized = seed');
 if(name.endsWith("/src/components/local-player-profile/localPlayerInsightsModel.ts"))code=code.replace('  const scansById = new Map<string, GuildHubLocalScan | null>();','  const scansById = new Map<string, GuildHubLocalScan | null>(); const proof=(globalThis as any).w12; if(proof?.ranksGate){proof.ranksHeld=true;await proof.ranksGate;}');
 if(name.endsWith("/src/lib/local-player-profile/coordinator.ts"))code=code.replace('return part as LocalProfilePart<LocalProfileValues[K]>;','(globalThis as any).w12?.currentParts.push({area,status:part.status,ref:this.profile.analytics.memberRef,at:this.profile.analytics.scannedAtMs,counters:{...this.counters}}); return part as LocalProfilePart<LocalProfileValues[K]>;');
 if(name.endsWith("/src/lib/local-player-profile/coordinator.ts"))code=code.replace('const realmCoordinator = createLocalPlayerProfileCoordinator();','const realmCoordinator = createLocalPlayerProfileCoordinator(); (globalThis as any).w12Coordinator=realmCoordinator;');
 return code;
 }
};

const chrome = process.env.W12_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w12-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next", "@tanstack/react-virtual"] },
  plugins: [plugin], worker:{plugins:()=>[plugin],format:"es"}, root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null } });
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
  const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/dataHubRoutes/proof.html`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const waitReady = async (session: string, previousDocument?: string) => { for (let i=0;i<1200;i++) { if (await evaluate(session,`Boolean(globalThis.w12?.ready) && globalThis.w12.documentId !== ${JSON.stringify(previousDocument)}`)) return; await pause(); } throw Error("production fixture did not load"); };
  await waitReady(sessionId);
  await evaluate(sessionId, "w12.run().then(r=>{w12.result=r;w12.done=true},e=>{w12.error=e.stack;w12.done=true});undefined");
  for(let i=0;i<6000;i++){if(await evaluate(sessionId,"Boolean(w12.done)"))break;await pause();}
  if(await evaluate(sessionId,"w12.error"))console.log("diagnostic",await evaluate(sessionId,"({results:w12.results,location:w12.location,reads:w12.reads,cores:w12.cores,costs:globalThis.w15Costs?.events,errors:w12.errors,body:document.body.innerText.slice(-2200)})"));
  assert.equal(await evaluate(sessionId,"w12.error"),undefined);
  const results = await evaluate(sessionId,"w12.result");results.forEach((r:string)=>console.log("PASS",r));
  const measurements=await evaluate(sessionId,"w12.measurements");
  const costs=await evaluate(sessionId,"globalThis.w15Costs.events");
  const phaseMarks=await evaluate(sessionId,"globalThis.w15Costs.phaseMarks") as Array<{phase:string;timeMs:number}>;
  const previousDocument=await evaluate(sessionId,"w12.documentId");
  await call("Page.reload",{},sessionId);await waitReady(sessionId,previousDocument);
  const reload=await evaluate(sessionId,"w12.reloadCheck()");
  results.push("Actual reload of historical detail renders standalone page; historical source/time survive");
  assert.deepEqual(reload.errors,[]);
  await evaluate(sessionId,"new Promise(r=>setTimeout(r,150))");
  const wide=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/route-profile-wide.png"),Buffer.from(wide.data,"base64"));
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  await evaluate(sessionId,"new Promise(r=>setTimeout(r,100))");
  const narrow=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/route-profile-narrow.png"),Buffer.from(narrow.data,"base64"));
  assert.equal(await evaluate(sessionId,"document.documentElement.scrollWidth <= innerWidth"),true,"narrow page fits viewport");
  const compact=await evaluate(sessionId,"w12.narrowRun()");
  const overlayNarrow=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/route-overlay-narrow.png"),Buffer.from(overlayNarrow.data,"base64"));
  assert.equal(compact.parentRetained,true);results.push("Actual compact Toplist profile action opens narrow routed overlay and retains expanded parent DOM");
  await call("Emulation.setDeviceMetricsOverride",{width:1400,height:950,deviceScaleFactor:1,mobile:false},sessionId);
  await evaluate(sessionId,"new Promise(r=>setTimeout(r,150))");
  const overlayWide=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/route-overlay-wide.png"),Buffer.from(overlayWide.data,"base64"));
  const mutations=await evaluate(sessionId,"w12.mutateRun()");results.push(...mutations.results);assert.deepEqual(mutations.errors,[]);
  const deployments=[];
  for(const base of ['/','/test/','/beta/']) {
   const {targetId:baseTarget}=await call('Target.createTarget',{url:origin+base+'#'+reload.url,browserContextId});
   const {sessionId:baseSession}=await call('Target.attachToTarget',{targetId:baseTarget,flatten:true});await waitReady(baseSession);
   await evaluate(baseSession,'w12.reloadCheck()');
   const copied=await evaluate(baseSession,`(async()=>{let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value)=>{copied=value}}});document.querySelectorAll('.local-profile-route-actions button')[1].click();await Promise.resolve();return copied;})()`);
   assert.equal(copied,origin+base+'#'+reload.url);deployments.push({base,copied});await call('Target.closeTarget',{targetId:baseTarget});
  }
  results.push('Actual standalone detail and Copy link preserve root, /test/ and /beta/ deployment bases');
  await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/router-cost-results.json"),JSON.stringify({results,measurements,costs,phaseMarks,reload,compact,mutations,deployments,workerCosts:workerCosts.map((event:any)=>({...event,phase:phaseMarks.slice().reverse().find(mark=>mark.timeMs<=event.eventTimeMs)?.phase??"before-main-observation"}))},null,2)+"\n");
  console.log("PASS",results.at(-1));
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
