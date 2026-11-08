import { temporaryPrefix, artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile + incognito context. No connection to the user's browser.
// Actual Dashboard/Analytics/Index/Toplist/FightTracking/Fusion parents,
// ContextBars, page owners, IDB and Toplist workers/focus run. Public reads,
// archive HTTP delivery and unrelated presentation/history are controlled.
const fixturePath = "/tools/guilds/fixtures/pageContexts/mocks.tsx";
const aliases: Record<string, string> = {
  "/src/lib/firebase": "db",
  "/src/components/ContentShell": "default:Shell", "/src/components/ContentFrame/Frame": "default:Shell",
  "/src/components/Filters/ServerSheet": "default:None",
  "/src/components/Filters/ListSwitcher": "default:None", "/src/components/Filters/HudFilters": "default:HudFilters",
  "/src/components/export/ToplistExportController": "default:ExportController", "/src/context/AuthContext": "useAuth",
  "/src/components/local-player-profile/LocalHeroPanel": "default:Hero",
  "/src/components/local-player-profile/LocalPlayerAnalytics": "default:None",
  "/src/components/local-player-profile/LocalPlayerProfileInsights": "default:None",
  "/src/context/ToplistsDataContext": "Forbidden as ToplistsProvider",
  "/src/components/ProfileOverlay/ProfileOverlay": "default:Forbidden", "/src/components/ProfileOverlay/GuildProfileOverlay": "default:Forbidden",
  "/src/lib/api/toplistsFirestore": "getPlayerToplistSnapshotByDocIdCached",
};
const plugin: Plugin = {
  name: "w11-production-page-contexts", enforce: "pre",
  resolveId(source, importer) {
    if (source.startsWith("https://sf-libs")) return "\0w11:coa";
    if (!importer || !source.startsWith(".")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    const key = Object.keys(aliases).find(key => resolved.endsWith(key));
    if (key) return `\0w08:${key}`;
  },
  load(id) {
    if (id === "\0w11:coa") return "export class CoaRenderer {}";
    if (!id.startsWith("\0w08:")) return;
    const value = aliases[id.slice(5)];
    if (value.startsWith("default:")) return `export { ${value.slice(8)} as default } from '${fixturePath}';`;
    return `export { ${value} } from '${fixturePath}';`;
  },
  transform(code, id) {
    code = code.replace(/\r\n/g, "\n");
    const name = id.replace(/\\/g, "/");
    if (name.endsWith("/src/pages/DataHub/localToplistPageModel.ts")) code = code.replace('): Promise<LocalToplistArchiveContext> {', '): Promise<LocalToplistArchiveContext> { if ((globalThis as any).w08?.context) { const manifestGate = (globalThis as any).w11?.manifestGate; if (manifestGate) { (globalThis as any).w11.manifestHeld = true; await manifestGate; } return (globalThis as any).w08.context; }');
    if (name.endsWith("/src/lib/toplists/localToplistService.ts")) code = code.replace('  ...defaultDependencies,', '  ...defaultDependencies, acquireEntries: (globalThis as any).w08?.acquire ?? defaultDependencies.acquireEntries,');
    if (name.endsWith("/src/pages/DataHub/Toplist.tsx")) {
      code = code.replace('  const compareExpected = comparePlan.active;', '  (globalThis as any).w08.compareState = {compareMode, compareFromMonth, compareToMonth, key: comparePlan.loadKey, classes: selectedClasses, current: compareLoadState.current, previous: compareLoadState.previous, error: compareLoadState.error, loading: compareLoadState.loading, status: comparisonResult?.status, currentRows: comparisonResult?.currentPlayerView.rows.length}; const compareExpected = comparePlan.active;');
      code = code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });', '(globalThis as any).w08.loads.push({datasetId, result}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
      code = code.replace('  const openGuildDashboard = React.useCallback', '  (globalThis as any).w11.toplistFavorite = handleFavoriteGuildFocus; const openGuildDashboard = React.useCallback');
      code = code.replace('    const complete = (value: LocalToplistFocusTarget)', '    (globalThis as any).w08.acks.push(ack); const complete = (value: LocalToplistFocusTarget)');
    }
    if (name.endsWith("/src/pages/GuildHub/useLocalPlayerProfileAction.ts")) code = code.replace('if (next) setProfile(next);', 'if (next) { (globalThis as any).w08.profile = next; setProfile(next); }');
    if (name.endsWith("/src/lib/data-hub/hubFavoritesStore.ts")) code = code.replace('async restore(): Promise<HubFavoritesSnapshot> {', 'async restore(): Promise<HubFavoritesSnapshot> { await (globalThis as any).w11?.restoreGate;');
    if (name.endsWith("/src/pages/GuildHub/Dashboard.tsx")) code = code.replace('  const { activeGuild } = selection;', '  const { activeGuild } = selection; (globalThis as any).w11.parents.dashboard = {guild: activeGuild};');
    if (name.endsWith("/src/pages/DataHub/compareGuilds.tsx")) code = code.replace('  const [serverFilter,', '  (globalThis as any).w11.parents.analytics = {guild: activeGuild, activeTab, overviewMetric, overviewRange, selectedPlayerIds, setRange: setOverviewRange, setMetric: setOverviewMetric, setPlayers: setSelectedPlayerIds};\n  const [serverFilter,');
    if (name.endsWith("/src/pages/GuildHub/FusionPlanner/FusionPlanner.tsx")) code = code.replace('  const [membersLoading,', '  (globalThis as any).w11.fusionMembers = members; const [membersLoading,').replace('  const [scenarios,', '  (globalThis as any).w11.parents.fusion = {setupState, setSetup:setSetupState};\n  const [scenarios,');
    if (name.endsWith("/src/pages/GuildHub/Dashboard.tsx")) code = code.replace('  const scanState = useDashboardScans(activeGuild);', '  const scanState = useDashboardScans(activeGuild); Object.assign((globalThis as any).w11.parents.dashboard, {current: scanState.latest?.guildContextId, error:scanState.error});');
    if (name.endsWith("/src/lib/guilds/localScanLibrary.ts")) code = code.replace('export async function getGuildHubLocalScan(id: string) {', 'export async function getGuildHubLocalScan(id: string) { const gate = (globalThis as any).w11?.currentGate; if (gate) { (globalThis as any).w11.currentHeld = true; await gate; }');
    if (name.endsWith("/src/pages/GuildHub/FusionPlanner/FusionPlanner.tsx")) code = code.replace('  const activeScenario = React.useMemo(', '  Object.assign((globalThis as any).w11.parents.fusion, {scenarios,activeScenarioId}); const activeScenario = React.useMemo(');
    return code;
  },
};

const chrome = process.env.W11_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w11-", 'browser-profiles'));
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
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception:", JSON.stringify(message.params.exceptionDetails));
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update")) console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/pageContexts/proof.html`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const waitReady = async (session: string, previousDocument?: string) => { for (let i=0;i<1200;i++) { if (await evaluate(session,`Boolean(globalThis.w11?.ready) && globalThis.w11.documentId !== ${JSON.stringify(previousDocument)}`)) return; await pause(); } throw Error("production fixture did not load"); };
  await waitReady(sessionId);
  const results = await evaluate(sessionId, "w11.run()"); results.forEach((result: string) => console.log("PASS",result));
  const beforeReload = await evaluate(sessionId, "w11.contexts()");
  const previousDocument = await evaluate(sessionId, "w11.documentId");
  await call("Page.reload", {}, sessionId); await waitReady(sessionId, previousDocument);
  const afterReload = await evaluate(sessionId, "w11.checkReload()");
  for (const feature of ["guild-hub","guild-dashboard","guild-analytics","local-toplist","fight-tracking"]) assert.deepEqual(afterReload[feature], beforeReload[feature]);
  results.push("Real browser reload retains each tab session context, including manually unavailable toplist server");
  await evaluate(sessionId, 'document.querySelector("[data-context-controls] button:not([aria-label])").click();undefined');
  const beforeEmptyReload = await evaluate(sessionId, "w11.documentId");
  await call("Page.reload",{},sessionId); await waitReady(sessionId,beforeEmptyReload);
  assert.match(await evaluate(sessionId,"w11.checkEmptyReload()"),/Choose a guild for this page/);
  results.push("Explicit detail-consumer clear survives real reload without reapplying available legacy favorite");
  await evaluate(sessionId, `document.querySelector('[data-context-controls] button[aria-label="Guild 2, F8 auswählen"]').click();undefined`);
  const { targetId: peerTarget } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/pageContexts/proof.html?peer=1`, browserContextId });
  const { sessionId: peerSession } = await call("Target.attachToTarget", {targetId: peerTarget, flatten: true});
  await call("Runtime.enable",{},peerSession); await waitReady(peerSession);
  await evaluate(peerSession,"w11.peerRun()");
  assert.equal((await evaluate(peerSession,"w11.contexts()"))["guild-dashboard"].guild.guild.id,"f8_net_g3");
  assert.equal((await evaluate(sessionId,"w11.contexts()"))["guild-dashboard"].guild.guild.id,"f8_net_g2");
  assert.equal(await evaluate(peerSession,"w11.savePeer()"),true);
  for (let i=0;i<1000;i++) { if (await evaluate(sessionId,'w11.snapshot()?.record.favorites.some(f=>f.guild?.id === "f8_net_g4")')) break; await pause(); }
  assert.equal(await evaluate(sessionId,'w11.snapshot()?.record.favorites.some(f=>f.guild?.id === "f8_net_g4")'),true);
  assert.equal((await evaluate(sessionId,"w11.contexts()"))["guild-dashboard"].guild.guild.id,"f8_net_g2");
  results.push("Two real tabs share favorite commits while retaining independent live page selections");
  assert.deepEqual(await evaluate(sessionId,"w11.errors"),[]); assert.deepEqual(await evaluate(peerSession,"w11.errors"),[]);
  const screenshot = await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);
  await writeFile(artifactPath("tools/guilds/fixtures/pageContexts/dashboard.png"), Buffer.from(screenshot.data,"base64"));
  await writeFile(artifactPath("tools/guilds/fixtures/pageContexts/browser-results.json"),JSON.stringify({results,beforeReload,afterReload,peer: await evaluate(peerSession,"w11.contexts()")},null,2)+"\n");
  results.slice(-2).forEach((result: string) => console.log("PASS",result));
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
