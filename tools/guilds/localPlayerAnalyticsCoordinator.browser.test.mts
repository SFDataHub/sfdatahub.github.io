import { temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Fresh profile + incognito; actual Overlay/Hero/Analytics/Insights and real IDB.
// Transform adds counters/Promise gates at existing Raw reads only.
const plugin: Plugin = {
  name: "w06-isolated-observation", enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
    if (resolved.endsWith("/src/components/avatar/PortraitPreview")) return "\0w06:portrait";
  },
  load(id) { if (id === "\0w06:portrait") return "export { Portrait as default } from '/tools/guilds/fixtures/localPlayerAnalyticsCoordinator/mocks.tsx';"; },
  transform(code, id) {
    const normalized = id.replace(/\\/g, "/");
    // W-06 keeps its Main-only Raw gates; W-07 separately covers the real worker.
    if (normalized.endsWith("/src/lib/local-player-profile/sharedPreparation.ts")) code = code.replace(/typeof Worker\s*===\s*"undefined"/, "true");
    if (normalized.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
      code = code.replace('export async function getGuildHubLocalScan(id: string) {', 'export async function getGuildHubLocalScan(id: string) { const w06Stack = new Error().stack ?? "";');
      code = code.replace('return scan ? persistScanNormalizationIfNeeded(db, scan) : null;', 'const result = scan ? await persistScanNormalizationIfNeeded(db, scan) : null; await (globalThis as any).w06AfterRaw?.(id,w06Stack); return result;');
    }
    if (normalized.endsWith("/src/lib/local-player-profile/coordinator.ts")) {
      code = code.replace('const realmCoordinator = createLocalPlayerProfileCoordinator();', 'const realmCoordinator = createLocalPlayerProfileCoordinator(); (globalThis as any).w06Coordinator = realmCoordinator;');
      code = code.replace('const isCurrent = area === "current" || area === "currentInsights";', '(globalThis as any).w06.requestStarts++; const isCurrent = area === "current" || area === "currentInsights";');
      code = code.replace('return part as LocalProfilePart<LocalProfileValues[K]>;', '(globalThis as any).w06.requestEnds++; return part as LocalProfilePart<LocalProfileValues[K]>;');
      code = code.replace('} catch (error) {\n      return { status: !validGeneration()', '} catch (error) {\n      (globalThis as any).w06.requestEnds++; return { status: !validGeneration()');
    }
    if (normalized.endsWith("/src/lib/local-player-profile/useLocalProfilePart.ts")) code = code.replace('part => setState({ key, area, comparison, part })', 'part => { (globalThis as any).w06.uiWrites++; setState({ key, area, comparison, part }); }');
    return code;
  },
};

const chrome = process.env.W06_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w06-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react", "react-i18next", "i18next"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0 } });
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
  const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/localPlayerAnalyticsCoordinator/proof.html`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Page.bringToFront", {}, sessionId);
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (await evaluate(sessionId, "Boolean(globalThis.w06?.ready)")) break;
    await pause();
  }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w06?.ready)"), true, "React fixture must load");
  // Start separately so a stalled proof cannot silence user-facing progress.
  await evaluate(sessionId, "w06.run().then(result => {w06.result=result;w06.done=true;},error => {w06.error=error.stack;w06.done=true;}); undefined");
  for (let attempt = 0; attempt < 2000; attempt++) {
    if (await evaluate(sessionId, "Boolean(w06.done)")) break;
    await pause();
  }
  const error = await evaluate(sessionId, "w06.error");
  assert.equal(error, undefined, error);
  assert.equal(await evaluate(sessionId, "Boolean(w06.done)"), true);
  for (const result of await evaluate(sessionId, "w06.result") as string[]) console.log(`PASS ${result}`);
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close(); child?.kill(); await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
