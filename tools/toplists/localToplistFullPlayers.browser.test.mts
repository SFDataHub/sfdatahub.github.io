import { outputPath, temporaryPrefix, artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile + incognito context. No connection to the user's browser.
// Acquisition and unrelated presentation are controlled. The actual Toplist
// parent, shared tables, View/Search workers, focus, profile action and IDB run.
const exportOnly=process.argv.includes("--export-only");
const beforeArgument=process.argv.indexOf("--before-source");
const beforeOriginal=beforeArgument<0?undefined:process.argv[beforeArgument+1];
let beforeSource: string | undefined;
if(beforeOriginal){beforeSource=await mkdtemp(temporaryPrefix("sfdatahub-w28-baseline-", 'repo-copies'));await cp(path.join(beforeOriginal,"src"),path.join(beforeSource,"src"),{recursive:true});for(const file of ["tsconfig.json","tsconfig.app.json","package.json"])await cp(path.join(beforeOriginal,file),path.join(beforeSource,file));await symlink(path.join(process.cwd(),"node_modules"),path.join(beforeSource,"node_modules"),"junction");}
const fixturePath = "/tools/toplists/fixtures/localToplistFullPlayers/mocks.tsx";
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
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    if (importer.replace(/\\/g, "/").endsWith("/localToplistFullPlayers/mocks.tsx") && source.endsWith("/Filters/HudFilters")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    const key = Object.keys(aliases).find(key => resolved.endsWith(key));
    if (key) return `\0w08:${key}`;
    if (beforeSource && resolved.includes('/src/')) {
      const candidate=path.join(beforeSource,'src',resolved.split('/src/')[1]);
      return [candidate,candidate+'.ts',candidate+'.tsx',path.join(candidate,'index.ts'),path.join(candidate,'index.tsx')].find(file=>existsSync(file)&&statSync(file).isFile());
    }
  },
  load(id) {
    if (!id.startsWith("\0w08:")) return;
    const value = aliases[id.slice(5)];
    if (value.startsWith("default:")) return `export { ${value.slice(8)} as default } from '${fixturePath}';`;
    return `export { ${value} } from '${fixturePath}';`;
  },
  transform(code, id) {
    code = code.replace(/\r\n/g, "\n");
    const name = id.replace(/\\/g, "/");
    if (name.endsWith("/src/pages/DataHub/localToplistPageModel.ts")) code = code.replace('): Promise<LocalToplistArchiveContext> {', '): Promise<LocalToplistArchiveContext> { if ((globalThis as any).w08?.context) return (globalThis as any).w08.context;');
    if (name.endsWith("/src/lib/toplists/localToplistService.ts")) code = code.replace('  ...defaultDependencies,', '  ...defaultDependencies, acquireEntries: (globalThis as any).w08?.acquire ?? defaultDependencies.acquireEntries,');
    if (name.endsWith("/src/pages/DataHub/Toplist.tsx")) {
      code=code.replace('setLocalExportSnapshot({ ...snapshot, rowCount: exportRows.length,','(globalThis as any).w27.exportRows=exportRows; (globalThis as any).w27.exportWindow=playerReadOnlyData.window; setLocalExportSnapshot({ ...snapshot, rowCount: exportRows.length,');
      code=code.replace('  const currentViewResult =', '  (globalThis as any).w27.viewContext={requestKey:activeViewRequest?.contextKey,datasetId:activeViewRequest?.request.datasetId,contentRevision:activeViewRequest?.request.contentRevision,compareKey:comparePlan.loadKey}; const currentViewResult =');
      code=code.replace('      .then((next) => {\n        if (!cancelled && latestViewRequestKeyRef.current === viewRequest.key)', '      .then((next) => { (globalThis as any).w27.viewDecisions.push({requestId:next.requestId,key:viewRequest.key,latestKey:latestViewRequestKeyRef.current,cancelled});\n        if (!cancelled && latestViewRequestKeyRef.current === viewRequest.key)');
      code=code.replace('          setViewState({ key: viewRequest.contextKey, requestKey: viewRequest.key, result: next', '          (globalThis as any).w27.viewCommits.push({requestId:next.requestId,key:viewRequest.key}); setViewState({ key: viewRequest.contextKey, requestKey: viewRequest.key, result: next');
      code = code.replace('  const compareExpected = comparePlan.active;', '  (globalThis as any).w08.compareState = {compareMode, compareFromMonth, compareToMonth, key: comparePlan.loadKey, classes: selectedClasses, current: compareLoadState.current, previous: compareLoadState.previous, error: compareLoadState.error, loading: compareLoadState.loading, status: comparisonResult?.status, currentRows: comparisonResult?.currentPlayerView.rows.length}; const compareExpected = comparePlan.active;');
      code = code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });', '(globalThis as any).w08.loads.push({datasetId, result}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
      code = code.replace('    const complete = (value: LocalToplistFocusTarget)', '    (globalThis as any).w08.acks.push(ack); const complete = (value: LocalToplistFocusTarget)');
    }
    if (name.endsWith("/src/lib/toplists/localToplistViewWorkerClient.ts")) code=code.replace('      if (!pending) return;', '      (globalThis as any).w27.clientDeliveries.push({requestId:response.requestId,knownPending:!!pending,active:this.active}); if (!pending) return;');
    if (name.endsWith("/src/pages/GuildHub/useLocalPlayerProfileAction.ts")) code = code.replace('if (next) setProfile(next);', 'if (next) { (globalThis as any).w08.profile = next; setProfile(next); }');
    if (name.endsWith("/src/lib/guilds/localScanLibrary.ts")) code = code.replace('export async function prepareGuildHubSearchProjection(scan: GuildHubLocalScan, reset: string, options: HubSearchExecutionOptions = {}) {', 'export async function prepareGuildHubSearchProjection(scan: GuildHubLocalScan, reset: string, options: HubSearchExecutionOptions = {}) { (globalThis as any).w27?.preparations.push(scan.id);');
    return code;
  },
};

const evidenceArgument=process.argv.indexOf("--evidence");
const evidenceDir=outputPath(evidenceArgument < 0 ? process.env.W27_FILTER_EVIDENCE ?? artifactPath("tmp/w28") : process.argv[evidenceArgument+1]);
const chrome = process.env.W08_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w27-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next", "@tanstack/react-virtual"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null, fs: {allow: [process.cwd(), ...(beforeSource ? [beforeSource] : [])]} } });
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
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: `about:blank`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await call('Page.navigate',{url:`${origin}/tools/toplists/fixtures/localToplistFullPlayers/proof.html`},sessionId);
  for (let attempt = 0; attempt < 1000; attempt++) { if (await evaluate(sessionId, "Boolean(globalThis.w27?.ready)")) break; await pause(); }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w27?.ready)"), true, "React fixture must load");
  await evaluate(sessionId,`${exportOnly ? "w27.runExportOnly()" : beforeSource ? "w27.runBefore()" : "w27.run()"}.then(result=>{w27.result=result;w27.done=true;},error=>{w27.error=error.stack;w27.done=true;}); undefined`);
  for(let i=0;i<5000;i++){if(await evaluate(sessionId,"Boolean(w27.done)"))break;await pause();}
  const error=await evaluate(sessionId,"w27.error");
  if(error) console.log(await evaluate(sessionId,"({error:w27.error,messages:w27.messages.slice(-12),body:document.body.innerText.slice(-2000)})"));
  assert.equal(error,undefined,error);assert.equal(await evaluate(sessionId,"w27.done"),true);
  if(exportOnly){
    const result=await evaluate(sessionId,"({results:w27.result,exportCost:w27.exportCost,exportRows:w27.exportRows.length,exportDecorKeys:Object.keys(w27.exportWindow.decor),errors:w27.errors})");
    assert.deepEqual(result.errors,[]);
    await writeFile(outputPath(`${evidenceDir}/export-browser.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
  } else {
  const cold=await evaluate(sessionId,"({results:w27.result,measurements:w27.measurements,longTasks:w27.longTasks})");
  const documentId=await evaluate(sessionId,"w27.documentId");
  await call('Page.reload',{},sessionId);
  let warmReady=false;
  for(let attempt=0;attempt<1000;attempt++){
    try{if(await evaluate(sessionId,`Boolean(globalThis.w27?.ready)&&w27.documentId!==${JSON.stringify(documentId)}`)){warmReady=true;break;}}
    catch(error){if(!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error)))throw error;}
    await pause();
  }
  assert(warmReady,'new document fixture must be ready after ordinary reload');
  await evaluate(sessionId,`w27.runWarm(${!!beforeSource}).then(result=>{w27.result=result;w27.done=true;},error=>{w27.error=error.stack;w27.done=true;}); undefined`);
  for(let i=0;i<5000;i++){if(await evaluate(sessionId,"Boolean(w27.done)"))break;await pause();}
  assert.equal(await evaluate(sessionId,"w27.error"),undefined);
  const visual=[];
  for(const width of [1400,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:false},sessionId);
    visual.push(await evaluate(sessionId,`${beforeSource ? "w27.visualBefore" : "w27.visual"}(${width})`));
    const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true},sessionId);
    await writeFile(outputPath(`${evidenceDir}/${beforeSource ? "before" : "full-players"}-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  const result=await evaluate(sessionId,"({results:w27.result,measurements:w27.measurements,longTasks:w27.longTasks,errors:w27.errors,publicCalls:w27.publicCalls})");
  assert.deepEqual(result.errors,[]);assert.equal(result.publicCalls,0);
  await writeFile(outputPath(`${evidenceDir}/${beforeSource ? "before" : "full-players"}-browser.json`),JSON.stringify({...result,cold,visual},null,2)+'\n');
  console.log(JSON.stringify({...result,cold,visual},null,2));
  }
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  if(beforeSource)await rm(beforeSource,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
