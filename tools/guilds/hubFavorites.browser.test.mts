import { outputPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Production dashboard, guild management, ContextBar, local Overlay/Hero/current
// coordinator/action and all IDB/lock/store paths run. The independent W13
// search is omitted so W10 favorite-read budgets remain consumer-specific;
// the combined Dashboard is checked by hubSearch.browser.test.mts. Only independent historical
// panels are omitted; archive catalog is an empty controlled HTTP fixture.
const plugin: Plugin = { name: "w10-isolated-proof", enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !source.startsWith(".")) return;
    const id = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.tsx?$/, "");
    if (["/src/lib/featureAccessConfig", "/src/pages/DataHub/HubSearch", "/src/components/local-player-profile/LocalPlayerAnalytics", "/src/components/local-player-profile/LocalPlayerProfileInsights"].some(suffix => id.endsWith(suffix))) return path.resolve("tools/guilds/fixtures/hubFavorites/mocks.tsx");
  },
  transform(code, id) {
    code = code.replace(/\r\n/g, "\n"); const name = id.replace(/\\/g, "/");
    if (name.endsWith("/src/lib/data-hub/hubFavoritesStore.ts")) {
      code = code.replace('async restore(): Promise<HubFavoritesSnapshot> {', 'async restore(): Promise<HubFavoritesSnapshot> { await (globalThis as any).w10?.restoreGate;');
      code = code.replace('async mutate(operation: FavoriteOperation, expectedRevision: number): Promise<HubFavoritesSnapshot> {', 'async mutate(operation: FavoriteOperation, expectedRevision: number): Promise<HubFavoritesSnapshot> { await (globalThis as any).w10?.mutationGate;');
      code = code.replace('this.channel.onmessage = () => { void this.refresh("favorites-broadcast"); };', 'this.channel.onmessage = () => { if ((globalThis as any).w10?.missNotifications) return; void this.refresh("favorites-broadcast"); };');
    }
    if (name.endsWith("/src/lib/data-hub/hubFavoritesProjection.ts")) {
      const entry = 'export async function projectHubFavorites(favorites: readonly HubFavorite[], context?: AuditFields, record?: object): Promise<FavoriteProjection[]> {';
      assert(code.includes(entry), 'current shared favorite projection entry must be instrumented');
      code = code.replace(entry, entry + ' const w10ProjectionGate = (globalThis as any).w10?.projectionGate;');
      code = code.replace('  return auditReturn(__audit1, favorites.map(favorite => {', '  const rows: FavoriteProjection[] = favorites.map(favorite => {');
      const end = '  }));\n\n    } catch (__auditError)';
      assert(code.includes(end), 'current favorite projection completion must be instrumented');
      code = code.replace(end, '  }); if (w10ProjectionGate) { (globalThis as any).w10.projectionHeld = true; await w10ProjectionGate; (globalThis as any).w10.projectionEnds++; } if ((globalThis as any).w10) (globalThis as any).w10.work.favoriteProjectionCompletions++; return auditReturn(__audit1, rows);\n\n    } catch (__auditError)');
    }
    if (name.endsWith("/src/lib/parsing/normalizedPlayer.ts")) code = code.replace('export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => {', 'export const normalizeSfPlayerCharacterCore = (player: unknown): NormalizedPlayer => { if ((globalThis as any).w10) (globalThis as any).w10.costs.normalizations++;');
    if (name.endsWith("/src/lib/guilds/guildScanNormalizer.ts")) code = code.replace('): NormalizedGuildMember[] {', '): NormalizedGuildMember[] { if ((globalThis as any).w10) (globalThis as any).w10.costs.normalizations++;');
    if (name.endsWith("/src/lib/guilds/localGuildAnalyticsStore.ts")) code = code.replace('  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });', '  if ((globalThis as any).w10) (globalThis as any).w10.costs.derivedBuilds++;\n  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });');
    if (name.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
      code = code.replace('export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) {',
        'export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) { if ((globalThis as any).w10) (globalThis as any).w10.work[options.includeContentHashes ? "favoriteMetadataReads" : "kpiMetadataReads"]++;');
      code = code.replace('async function performGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) {',
        'async function performGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) { if ((globalThis as any).w10) (globalThis as any).w10.work.archiveReadinessRuns++;');
      code = code.replace('export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> {',
        'export async function ensureGuildHubScanSummaries(): Promise<GuildHubScanSummaryBackfillResult> { if ((globalThis as any).w10) (globalThis as any).w10.work.summaryEnsureRuns++;');
    }
    if (name.endsWith("/src/pages/GuildHub/localPlayerCurrentSeed.ts")) code = code.replace('  if (seed) {', '  if ((globalThis as any).w10) (globalThis as any).w10.work.currentSeedResolutions++;\n  if (seed) {');
    return code;
  }
};
const evidenceDirectory = outputPath(process.env.SFDATAHUB_FAVORITES_EVIDENCE ?? artifactPath("tmp/w22/hubFavorites"));
await mkdir(outputPath(evidenceDirectory),{recursive:true});
const directory = "tools/guilds/fixtures/hubFavorites";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w10-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "react-i18next", "i18next", "lucide-react"] },
  plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch: null } });
let child: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined, nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20));
async function call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
  const id = ++nextId;
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); return response;
}
async function evaluate(sessionId: string, expression: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    new Promise<any>((_, reject) => { timer = setTimeout(() => reject(Error(`CDP timeout: ${expression}`)), 45000); })]).finally(() => clearTimeout(timer));
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const screenshots: any[] = [];
async function capture(session: string) {
  const evidence = await evaluate(session, "globalThis.w10?.capture"); if (!evidence) return;
  const shot = await call("Page.captureScreenshot", { format: "png", fromSurface: true }, session);
  await writeFile(outputPath(`${evidenceDirectory}/${evidence.kind}.png`), Buffer.from(shot.data, "base64"));
  screenshots.push(evidence); await evaluate(session, "w10.capture=null");
}
try {
  await server.listen(); const address = server.httpServer!.address(); assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  child = spawn(process.env.W10_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: "ignore" });
  let portFile = "";
  for (let i = 0; i < 500; i++) { try { portFile = await readFile(path.join(profile, "DevToolsActivePort"), "utf8"); break; } catch { await pause(); } }
  assert(portFile, "isolated Chrome required"); const [port, endpoint] = portFile.trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(Error("CDP connection failed")); });
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.exceptionThrown") console.log("browser exception", JSON.stringify(message.params.exceptionDetails));
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") console.log("browser", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    const waiter = pending.get(message.id); if (!waiter) return; pending.delete(message.id);
    if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: `${origin}/${directory}/proof.html`, browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId); await call("Page.bringToFront", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (let i = 0; i < 1000; i++) { if (await evaluate(sessionId, "Boolean(globalThis.w10?.ready)")) break; await pause(); }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w10?.ready)"), true, "real dashboard fixture loads");
  const results: string[] = [];
  for (const [method, narrow] of [["run", false], ["runNarrow", true]] as const) {
    if (narrow) await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(sessionId, `w10.done=false;w10.error=undefined;w10.${method}().then(result=>{w10.result=result;w10.done=true},error=>{w10.error=error.stack;w10.done=true});undefined`);
    for (let i = 0; i < 2000; i++) { await capture(sessionId); if (await evaluate(sessionId, "w10.done")) break; await pause(); }
    assert.equal(await evaluate(sessionId, "w10.error"), undefined); assert.equal(await evaluate(sessionId, "w10.done"), true);
    for (const result of await evaluate(sessionId, "w10.result") as string[]) { results.push(result); console.log(`PASS ${result}`); }
  }
  // Genuine second Window realm, same incognito origin and browser IndexedDB.
  const { targetId: peerTarget } = await call("Target.createTarget", { url: `${origin}/${directory}/proof.html?peer`, browserContextId });
  const { sessionId: peerSession } = await call("Target.attachToTarget", { targetId: peerTarget, flatten: true });
  await call("Runtime.enable", {}, peerSession);
  for (let i = 0; i < 1000; i++) { if (await evaluate(peerSession, 'Boolean(globalThis.w10?.ready && globalThis.w10.snapshot().status === "ready")')) break; await pause(); }
  assert.equal(await evaluate(peerSession, 'w10.snapshot().status'), "ready");
  await evaluate(sessionId, 'navigator.locks.request("sfdatahub:local-data:write:v1",async()=>{w10.lockHeld=true;await new Promise(r=>w10.releaseLock=r)});undefined');
  for (let i = 0; i < 500; i++) { if (await evaluate(sessionId, "w10.lockHeld")) break; await pause(); }
  await evaluate(sessionId, 'w10.concurrentDone=false;w10.peerSave(9001).then(value=>{w10.concurrentValue=value;w10.concurrentDone=true});undefined');
  await evaluate(peerSession, 'w10.concurrentDone=false;w10.peerSave(9002).then(value=>{w10.concurrentValue=value;w10.concurrentDone=true});undefined');
  await evaluate(sessionId, 'w10.releaseLock();undefined');
  for (let i = 0; i < 1000; i++) { if (await evaluate(sessionId, "w10.concurrentDone") && await evaluate(peerSession, "w10.concurrentDone")) break; await pause(); }
  assert.equal(await evaluate(sessionId, "w10.concurrentValue"), true); assert.equal(await evaluate(peerSession, "w10.concurrentValue"), true);
  await evaluate(sessionId, "w10.refresh()"); await evaluate(peerSession, "w10.refresh()");
  for (const session of [sessionId, peerSession]) assert.deepEqual(await evaluate(session, 'w10.snapshot().snapshot.record.favorites.filter(f=>f.display.name?.startsWith("Peer ")).map(f=>f.display.name).sort()'), ["Peer 9001", "Peer 9002"]);
  results.push("two actual browser tabs: simultaneous stale saves under W-04 lock preserve both entities and durable revisions");
  await evaluate(sessionId, "w10.closeNotifications()");
  await evaluate(peerSession, "w10.peerSave(9003)");
  assert.equal(await evaluate(sessionId, 'w10.snapshot().snapshot.record.favorites.some(f=>f.display.name === "Peer 9003")'), false);
  await call("Page.bringToFront", {}, sessionId);
  await evaluate(sessionId, "w10.focus();undefined");
  for (let i = 0; i < 500; i++) { if (await evaluate(sessionId, 'w10.snapshot().snapshot.record.favorites.some(f=>f.display.name === "Peer 9003")')) break; await pause(); }
  assert.equal(await evaluate(sessionId, 'w10.snapshot().snapshot.record.favorites.some(f=>f.display.name === "Peer 9003")'), true);
  results.push("missed BroadcastChannel notification: actual focus handler recovers persisted newer revision");
  await call("Page.bringToFront", {}, sessionId);
  await evaluate(sessionId, "w10.refresh()"); await pause();
  const beforeKeyboard = await evaluate(sessionId, "w10.keyboardRevision()");
  const focused = await evaluate(sessionId, "w10.keyboardReady()"); assert(focused);
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }, sessionId);
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  for (let i = 0; i < 500; i++) { if (await evaluate(sessionId, "w10.keyboardRevision()") > beforeKeyboard) break; await pause(); }
  assert(await evaluate(sessionId, "w10.keyboardRevision()") > beforeKeyboard, JSON.stringify(await evaluate(sessionId, "({focused:document.activeElement?.outerHTML,state:w10.snapshot().status,error:w10.snapshot().error})")));
  results.push("native CDP keyboard Enter on focused production reorder button commits at narrow width");
  assert.deepEqual(await evaluate(peerSession, "w10.errors"), []);
  results.slice(-3).forEach(result => console.log(`PASS ${result}`));
  const costs = await evaluate(sessionId, "w10.evidence");
  const summaryValidity = await evaluate(sessionId, "w10.summaryValidity");
  assert.equal(summaryValidity.length, 6, "all production Summary validity measurement windows executed");
  assert.deepEqual(await evaluate(sessionId, "w10.errors"), []);
  await writeFile(outputPath(`${evidenceDirectory}/browser-results.json`), JSON.stringify({ results, screenshots, costs, summaryValidity }, null, 2) + "\n");
  console.log("MEASURED", JSON.stringify(costs)); console.log("MEASURED N02", JSON.stringify(summaryValidity)); await call("Target.disposeBrowserContext", { browserContextId });
} finally { socket?.close(); child?.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); }
