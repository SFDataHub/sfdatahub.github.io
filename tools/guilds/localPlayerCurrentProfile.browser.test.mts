import { temporaryPrefix, artifactPath } from '../codex/workspace.mjs';
import { framePlugin } from "./fixtures/profileBrowserGuards/framePlugin.mts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile + incognito context. No connection to the user's browser.
// RootLayout/RouteHost/LocalPlayerDetail, Hero/Analytics/Insights, Coordinator,
// profile/card/trend Workers, IDB and receipts run. Auth/cloud/portraits, foreign
// acquisition and the existing Toplist presentation/view-worker boundaries are doubles.
const fixturePath = "/tools/guilds/fixtures/currentProfile/mocks.tsx";
const aliases: Record<string, string> = {
  "/src/components/guilds/GuildEmblem": "None as default,None as GuildEmblemArtwork,useGuildEmblemVisual", "/src/components/avatar/PortraitPreview": "default:None",
  "/src/components/ContentShell": "default:Shell", "/src/components/ContentFrame/Frame": "default:Shell",
  "/src/components/guilds/GuildContextBar": "default:None", "/src/components/guild-trend/GuildTrendChart": "default:None",
  "/src/components/Filters/BottomFilterSheet": "default:None", "/src/components/Filters/ServerSheet": "default:None",
  "/src/components/Filters/ListSwitcher": "default:None", "/src/components/Filters/HudFilters": "default:HudFilters",
  "/src/components/Filters/FilterContext": "FilterProvider,useFilters",
  "/src/components/export/ToplistExportController": "default:ExportController",
  "/src/context/ToplistsDataContextCore": "ToplistsDataStaticProvider", "/src/context/AuthContext": "useAuth",
  "/src/pages/GuildHub/hooks/useGuildHubSelection": "useGuildHubSelection",
  "/src/pages/GuildHub/dashboardLocalFirst": "acquireDashboardLocalFirstFeatureScans",
  "/src/pages/Toplists/playertoplists": "TableDataView", "/src/pages/Toplists/guildtoplists": "default:None",
  "/src/lib/toplists/localToplistViewWorkerClient": "LocalToplistViewWorkerCancelledError,LocalToplistViewWorkerSession",
};
const plugin: Plugin = {
  name: "w05-isolated-boundaries", enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    const key = Object.keys(aliases).find(key => resolved.endsWith(key));
    if (key) return `\0w05:${key}`;
  },
  load(id) {
    if (!id.startsWith("\0w05:")) return;
    const value = aliases[id.slice(5)];
    if (value.startsWith("default:")) return `export { ${value.slice(8)} as default } from '${fixturePath}';`;
    return `export { ${value} } from '${fixturePath}';`;
  },
  transform(code, id) {
    code=code.replace(/\r\n/g,"\n"); const normalized = id.replace(/\\/g, "/");
    // Test-only call counters and Promise gates; production control flow stays
    // intact. Raw gates hold delivery AFTER the actual physical source read.
    if (normalized.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
      code = code.replace('export async function getGuildHubLocalScan(id: string) {', 'export async function getGuildHubLocalScan(id: string) { const w05Stack = new Error().stack ?? ""; (globalThis as any).w05?.raw.push({id, stack:w05Stack});');
      code = code.replace('return scan ? persistScanNormalizationIfNeeded(db, scan) : null;', 'const result = scan ? await persistScanNormalizationIfNeeded(db, scan) : null; if (w05Stack.includes("localProfileEntry")) await (globalThis as any).w05AfterGate?.("rawGates", id); return result;');
      code = code.replace('return new Map(entries);', 'if (new Error().stack?.includes("localProfileEntry")) await (globalThis as any).w05AfterGate?.("validityGates", sourceIds[0]); return new Map(entries);');
    }
    if (normalized.endsWith("/src/lib/parsing/normalizedPlayer.ts")) code = code.replace('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {', 'export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => { (globalThis as any).w05?.core.push({name: (player as any)?.name, stack:new Error().stack ?? ""});');
    if (normalized.endsWith("/src/lib/guilds/localGuildAnalyticsStore.ts")) code = code.replace('): Promise<GuildAnalyticsReadResult> {', '): Promise<GuildAnalyticsReadResult> { await (globalThis as any).w05BeforeComparison?.(summaries);');
    if (normalized.endsWith("/src/pages/DataHub/localToplistPageModel.ts")) code = code.replace('): Promise<LocalToplistArchiveContext> {', '): Promise<LocalToplistArchiveContext> { if ((globalThis as any).w05?.context) return (globalThis as any).w05.context;');
    if (normalized.endsWith("/src/lib/toplists/localToplistService.ts")) code = 'import { localToplistDatasetId as w05DatasetId } from "./localToplistStore";\n' + code.replace('): Promise<LocalToplistLoadResult> {', '): Promise<LocalToplistLoadResult> { if ((globalThis as any).w05?.results) return (globalThis as any).w05.results.get(w05DatasetId(selectedEntries));');
    // Observe completion to prove negative cases after the old action finishes,
    // instead of waiting an arbitrary duration and assuming it cannot reopen.
    if (normalized.endsWith("/src/lib/data-hub/localProfileEntry.ts")) {
      code = code.replace('  if (entry.observation.kind === "invalid")', '  const w15Attempt=++(globalThis as any).w05.entryStarts; try { if (entry.observation.kind === "invalid")');
      code = code.replace('return buildLocalPlayerProfileModel({ ...seed, rawPlayer: seed.rawPlayer, currentSeed: seed });', 'const profile = buildLocalPlayerProfileModel({ ...seed, rawPlayer: seed.rawPlayer, currentSeed: seed }); (globalThis as any).w05.profile = profile; return profile;');
      code = code.replace('  return read(selected);\n}', '  return await read(selected); } finally { (globalThis as any).w05.actionEnds++; (globalThis as any).w05.entryEnds.push(w15Attempt); }\n}');
      code = code.replace('return read(entry.observation.anchor);', 'return await read(entry.observation.anchor);').replace('return finish(prepared);', 'return await finish(prepared);');
    }
    if (normalized.endsWith("/src/pages/GuildHub/useLocalPlayerProfileAction.ts")) {
      code = code.replace('if (next) setProfile(next);', 'if (next) { (globalThis as any).w05.profile = next; setProfile(next); }');
      code = code.replace('} finally {', '} finally { (globalThis as any).w05.actionEnds++;');
    }
    // W-06 moved the real Current-Insights consumer to the staged coordinator.
    // Observe the same actual request lifetime, including settlement after Close.
    if (normalized.endsWith("/src/lib/local-player-profile/coordinator.ts")) {
      code = code.replace('const isCurrent = area === "current" || area === "currentInsights";', 'if (area === "currentInsights") (globalThis as any).w05.insightsStarts++; const isCurrent = area === "current" || area === "currentInsights";');
      code = code.replace('return part as LocalProfilePart<LocalProfileValues[K]>;', 'if (area === "currentInsights") (globalThis as any).w05.insightsEnds++; return part as LocalProfilePart<LocalProfileValues[K]>;');
      code = code.replace('} catch (error) {\n      return { status: !validGeneration()', '} catch (error) {\n      if (area === "currentInsights") (globalThis as any).w05.insightsEnds++; return { status: !validGeneration()');
    }
    if (normalized.endsWith("/src/pages/GuildHub/Dashboard.tsx")) code = code.replaceAll('setState(current => current.latest?.context === context\n          ?', '(globalThis as any).w05.comparisonCommits++; setState(current => current.latest?.context === context\n          ?').replace('} finally {', '} finally { (globalThis as any).w05.comparisonEnds++;').replace('<button type="button" className={styles.memberRow}', '<button data-testid="w05-list-row" data-name={member.name} type="button" className={styles.memberRow}');
    return code;
  },
};

const chrome = process.env.W05_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w05-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "recharts", "lucide-react", "react-i18next", "i18next"] },
  plugins: [framePlugin, plugin], worker: {plugins:()=>[framePlugin,plugin],format:"es"}, root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch:null } });
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
  const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/currentProfile/proof.html`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Page.bringToFront", {}, sessionId);
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (await evaluate(sessionId, "Boolean(globalThis.w05?.ready)")) break;
    await pause();
  }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w05?.ready)"), true, "React fixture must load");
  // Start separately so a stalled proof cannot silence user-facing progress.
  await evaluate(sessionId, "w05.run().then(result => {w05.result=result;w05.done=true;},error => {w05.error=error.stack;w05.done=true;}); undefined");
  for (let attempt = 0; attempt < 2000; attempt++) {
    if (await evaluate(sessionId, "Boolean(w05.done)")) break;
    await pause();
  }
  const error = await evaluate(sessionId, "w05.error");
  await writeFile(artifactPath("tools/guilds/fixtures/profileBrowserGuards/current-profile-results.json"),JSON.stringify(await evaluate(sessionId,"({error:w05.error,result:w05.result,raw:w05.raw,core:w05.core,ends:w05.actionEnds,body:document.body.innerText})"),null,2)+"\n");
  assert.equal(error, undefined, error);
  assert.equal(await evaluate(sessionId, "Boolean(w05.done)"), true);
  for (const result of await evaluate(sessionId, "w05.result") as string[]) console.log(`PASS ${result}`);
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
