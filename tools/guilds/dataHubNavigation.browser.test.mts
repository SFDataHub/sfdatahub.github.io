import { outputPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile and incognito context; no user browser or cloud writes.
// Actual production registration, gates, layout, parents, local profile pipeline,
// IDB and ScanManagement. Neighbor screens and external presentation are stubs.
const evidenceDirectory = outputPath(process.env.SFDATAHUB_NAV_EVIDENCE ?? artifactPath("tmp/w22/navigation"));
await mkdir(outputPath(evidenceDirectory), { recursive: true });
const fixturePath = "/tools/guilds/fixtures/dataHubRoutes/mocks.tsx";
const aliases: Record<string,string> = {
  "/src/lib/firebase":"db", "/src/context/AuthContext":"useAuth",
  "/src/context/DataJobsContext":"useDataJobs, getDataJobDetail, getDataJobProgress, getDataJobStatusLabel",
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
for (const page of ["Planner","FusionPlanner/FusionPlanner","Waitlist","Activity","Imports","Announcements","Events","Roles","Settings"]) aliases["/src/pages/GuildHub/"+page]="default:RegisteredPage";
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
 if(name.endsWith("/src/pages/DataHub/Toplist.tsx"))code=code.replace('const handleFocusResult = React.useCallback((ack: ToplistFocusResult) => {','const handleFocusResult = React.useCallback((ack: ToplistFocusResult) => { (globalThis as any).w08.acks.push(ack);');
 if(name.endsWith("/src/pages/DataHub/Toplist.tsx"))code=code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });','(globalThis as any).w08.loads.push({result,datasetId}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
 if(name.endsWith("/src/lib/data-hub/hubFavoritesStore.ts"))code=code.replace('async mutate(operation: FavoriteOperation, expectedRevision: number): Promise<HubFavoritesSnapshot> {','async mutate(operation: FavoriteOperation, expectedRevision: number): Promise<HubFavoritesSnapshot> { const proof=(globalThis as any).w12; if(proof?.mutationGate){proof.mutationHeld=true;await proof.mutationGate;}');
 if(name.endsWith("/src/lib/guilds/localScanLibrary.ts")){
 code=code.replace('export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> {','export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> { const proof=(globalThis as any).w12; if(proof){proof.summaryEnsures++;if(proof.pickerGate){proof.pickerHeld=true;await proof.pickerGate;}}');
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
  const results = await evaluate(sessionId, "w12.w20Run()");
  results.push(...await evaluate(sessionId, "w12.w21Run()"));
  results.forEach((r:string)=>console.log("PASS",r));
  const previousDocument=await evaluate(sessionId,"w12.documentId");
  await call("Page.reload",{},sessionId);await waitReady(sessionId,previousDocument);
  results.push(await evaluate(sessionId,"w12.w21Reload()"));
  const reload=await evaluate(sessionId,"w12.w20Reload()");assert.equal(reload.path,"/data-hub/guild-hub/guild/f8/f8_net_g1/dashboard");assert.deepEqual(reload.errors,[]);
  for(const width of [1400,390]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:width===390?844:950,deviceScaleFactor:1,mobile:width===390},sessionId);
    for(const view of ["dashboard","navigation","guild","player","menu"]) {
      const layout=await evaluate(sessionId,`w12.w20Show(${JSON.stringify(view)})`);assert.equal(layout.overflow,false,`${view} fits ${width}`);
      if(view==='menu') {
        await call("Page.bringToFront",{},sessionId);
        const before=await evaluate(sessionId,'({path:w12.location.pathname,revision:w12.location.key})');
        const nativeKey=async(key:string,code:string,virtual:number,shift=false)=>{
          await call("Input.dispatchKeyEvent",{type:"keyDown",key,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers:shift?8:0,...(key==='Enter'?{text:"\r",unmodifiedText:"\r"}:{})},sessionId);
          await call("Input.dispatchKeyEvent",{type:"keyUp",key,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers:shift?8:0},sessionId);
          await new Promise(resolve=>setTimeout(resolve,30));
        };
        await evaluate(sessionId,'w12.w21Narrow()');
        await evaluate(sessionId,`document.querySelector('#local-favorites-dialog [data-guild-favorites-edit]').focus();undefined`);
        await nativeKey('Enter','Enter',13);
        assert.equal(await evaluate(sessionId,`document.querySelector('#local-favorites-dialog [data-guild-favorites-edit]').getAttribute('aria-pressed')`),'true','native Enter starts editing');
        const editingShot=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);
        await writeFile(outputPath(`${evidenceDirectory}/editing-${width}.png`),Buffer.from(editingShot.data,"base64"));
        await evaluate(sessionId,'w12.w21OpenPicker()');
        const pickerShot=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);
        await writeFile(outputPath(`${evidenceDirectory}/picker-${width}.png`),Buffer.from(pickerShot.data,"base64"));
        await nativeKey('Tab','Tab',9);await nativeKey('Tab','Tab',9,true);
        assert.equal(await evaluate(sessionId,`document.querySelector('#local-favorites-dialog').contains(document.activeElement)`),true,'native tabs stay in menu');
        await nativeKey('Escape','Escape',27);
        assert.equal(await evaluate(sessionId,`!!document.querySelector('#local-favorites-dialog')&&!document.querySelector('[data-guild-picker]')&&document.activeElement?.getAttribute('aria-label')==='Add guild'`),true,'native Escape closes only picker and restores plus');
        await evaluate(sessionId,`document.querySelector('#local-favorites-dialog [data-guild-favorites-edit]').focus();undefined`);await nativeKey('Enter','Enter',13);
        assert.equal(await evaluate(sessionId,`document.querySelector('#local-favorites-dialog [data-guild-favorites-edit]').getAttribute('aria-pressed')`),'false','native Enter finishes editing');
        assert.deepEqual(await evaluate(sessionId,'({path:w12.location.pathname,revision:w12.location.key})'),before,'native controls preserve location');
      }
      const shot=await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);
      await writeFile(outputPath(`${evidenceDirectory}/${view}-${width}.png`),Buffer.from(shot.data,"base64"));
    }
    await evaluate(sessionId,"document.querySelector('#local-favorites-dialog').parentElement.click();undefined");
    assert.equal(await evaluate(sessionId,"!!document.querySelector('#local-favorites-dialog')"),false,'backdrop closes');
  }
  results.push("Actual addressed reload; 1400px/390px dashboard/entries/menu fit, screenshots and backdrop behavior");
  await writeFile(outputPath(`${evidenceDirectory}/navigation-browser-results.json`),JSON.stringify({results,reload},null,2)+"\n");

} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
