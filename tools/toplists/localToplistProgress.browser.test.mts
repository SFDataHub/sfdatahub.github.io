import { temporaryPrefix, artifactPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh Chrome profile + incognito context. No connection to the user's browser.
// Acquisition and unrelated presentation are controlled. The actual Toplist
// parent, shared tables, View/Search workers, focus, profile action and IDB run.
const normalApp = process.argv.includes("--app");
const fixturePath = "/tools/toplists/fixtures/localToplistRevision/mocks.tsx";
const aliases: Record<string, string> = {
  "/src/components/ContentShell": "default:Shell", "/src/components/ContentFrame/Frame": "default:Shell",
  "/src/components/guilds/GuildContextBar": "default:None",
  "/src/components/Filters/ListSwitcher": "default:None",
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
  name: "w17-production-entry", enforce: "pre",
  resolveId(source, importer) {
    if (normalApp) {
      if (source.startsWith("https://sf-libs")) return "\0w17:coa";
      return;
    }
    if (!importer || !source.startsWith(".")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    const key = Object.keys(aliases).find(key => resolved.endsWith(key));
    if (key) return `\0w08:${key}`;
  },
  load(id) {
    if (id === "\0w17:coa") return "export class CoaRenderer {}";
    if (!id.startsWith("\0w08:")) return;
    const value = aliases[id.slice(5)];
    if (value.startsWith("default:")) return `export { ${value.slice(8)} as default } from '${fixturePath}';`;
    return `export { ${value} } from '${fixturePath}';`;
  },
  transform(code, id) {
    code = code.replace(/\r\n/g, "\n");
    const name = id.replace(/\\/g, "/");
    if (normalApp && name.endsWith("/src/main.tsx")) code = 'import "/tools/toplists/fixtures/localToplistProgress/fixture.tsx";\n' + code;
    if (name.endsWith("/src/pages/DataHub/localToplistPageModel.ts")) code = code.replace("  return {\n    status: issues.length", "  (globalThis as any).w17.contextIssues = issues; return {\n    status: issues.length");
    if (name.endsWith("/src/lib/toplists/localToplistService.ts")) code = code.replace('  ...defaultDependencies,', '  ...defaultDependencies, acquireEntries: (globalThis as any).w08?.acquire ?? defaultDependencies.acquireEntries,');
    if (name.endsWith("/src/lib/toplists/localToplistViewWorkerClient.ts")) code = code.replace('      const response = event.data;', '      const response = event.data; (globalThis as any).w17?.bindings.push({expected: this.active, pending: this.pending.get(response?.requestId)?.type, actual: response});');
    if (name.endsWith("/src/pages/DataHub/Toplist.tsx")) {
      code = code.replace('  const compareExpected = comparePlan.active;', '  (globalThis as any).w08.compareState = {compareMode, compareFromMonth, compareToMonth, key: comparePlan.loadKey, classes: selectedClasses, current: compareLoadState.current, previous: compareLoadState.previous, error: compareLoadState.error, loading: compareLoadState.loading, status: comparisonResult?.status, currentRows: comparisonResult?.currentPlayerView.rows.length}; const compareExpected = comparePlan.active;');
      code = code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });', '(globalThis as any).w08.loads.push({datasetId, result}); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
      code = code.replace('    const complete = (value: LocalToplistFocusTarget)', '    (globalThis as any).w08.acks.push(ack); const complete = (value: LocalToplistFocusTarget)');
    }
    if (name.endsWith("/src/pages/GuildHub/useLocalPlayerProfileAction.ts")) code = code.replace('if (next) setProfile(next);', 'if (next) { (globalThis as any).w08.profile = next; setProfile(next); }');
    return code;
  },
};

const chrome = process.env.W08_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w18-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: "vite.config.ts", cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: normalApp ? {} : { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next", "@tanstack/react-virtual"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null, hmr: false } });
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
  socket.onmessage = async event => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.bindingCalled" && message.params.name === "w18Command") {
      const value = JSON.parse(message.params.payload);
      if (value.type === "viewport") await call("Emulation.setDeviceMetricsOverride",{width:value.width,height:value.height,deviceScaleFactor:1,mobile:false},message.sessionId);
      else {
        const shot = await call("Page.captureScreenshot",{format:"png",fromSurface:true},message.sessionId);
        await writeFile(artifactPath(`tmp/w18/${process.argv.includes('--before')?'before':'after'}-${value.label}.png`),Buffer.from(shot.data,"base64"));
      }
      await call("Runtime.evaluate",{expression:"w18Resolve()"},message.sessionId);
    }
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception:", JSON.stringify(message.params.exceptionDetails));
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update")) console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: normalApp ? `${origin}/?normal=1#/data-hub` : `${origin}/tools/toplists/fixtures/localToplistProgress/proof.html${process.argv.includes("--stale") ? "?stale=1" : ""}`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Runtime.addBinding",{name:"w18Command"},sessionId);
  await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (await evaluate(sessionId, "Boolean(globalThis.w17?.ready)")) break;
    await pause();
  }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w17?.ready)"), true, "React fixture must load");
  (await call("Runtime.evaluate", {expression:`w17.before = ${process.argv.includes('--before')}`}, sessionId));
  const result = await evaluate(sessionId, "w17.run()");
  await writeFile(artifactPath(`tmp/w18/${process.argv.includes('--before') ? 'before' : 'after'}${normalApp ? '-app' : process.argv.includes('--stale') ? '-stale' : ''}-browser.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (!process.argv.includes('--before')) assert.equal(result.error, undefined, result.error);
  const proof = await evaluate(sessionId, "w17.positions");
  await writeFile(artifactPath(`tmp/w18/${process.argv.includes('--before') ? 'before' : 'after'}-positions.json`), JSON.stringify(proof,null,2)+"\n");
  const screenshot = await call("Page.captureScreenshot",{format:"png",fromSurface:true},sessionId);
  await writeFile(artifactPath(`tmp/w18/${process.argv.includes('--before') ? 'before' : 'after'}-final.png`),Buffer.from(screenshot.data,"base64"));
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
