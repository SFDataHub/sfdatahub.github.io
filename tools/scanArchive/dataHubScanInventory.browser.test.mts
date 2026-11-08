import { outputPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";

// Entire real DataHub, ContentShell, hook, validators, import/binding/IDB paths.
// Only archive HTTP responses are controlled. Instrumentation counts actual
// operation boundaries, never replaces import, readiness or inventar results.
const plugin: Plugin = { name: "w09-operation-counters", enforce: "pre", transform(code, id) {
  code = code.replace(/\r\n/g, "\n");
  const name = id.replace(/\\/g, "/");
  if (name.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
    code = code.replace('function localScanMatchesArchiveEntry(scan: GuildHubLocalScan, entry: ScanArchiveEntry) {',
      'function localScanMatchesArchiveEntry(scan: GuildHubLocalScan, entry: ScanArchiveEntry) { if ((globalThis as any).w09) (globalThis as any).w09.costs.payloadValidations++;');
    code = code.replace('export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) {',
      'export async function readDataHubLocalScanMetadata(options: { includeContentHashes?: boolean } = {}) { if ((globalThis as any).w09) { (globalThis as any).w09.costs.metadataSnapshots++; if (options.includeContentHashes) (globalThis as any).w09.costs.otherMetadataReads++; }');
    const anchor = 'async function performGuildHubArchiveReadiness(entries: readonly ScanArchiveEntry[], options: ArchiveReadinessOptions = {}) {';
    assert(code.includes(anchor), "real readiness gate anchor");
    code = code.replace(anchor, anchor + ' if ((globalThis as any).w09?.proofGate) { (globalThis as any).w09.proofHeld = true; await (globalThis as any).w09.proofGate; }');
    code += '\n(globalThis as any).w09ReadinessInspect=()=>({flights:readinessInFlight.size,consumers:[...readinessInFlight.values()].reduce((n,e)=>n+e.consumers,0)});';
  }
  if (name.endsWith("/src/lib/guilds/guildScanNormalizer.ts")) code = code.replace('): NormalizedGuildMember[] {',
    '): NormalizedGuildMember[] { if ((globalThis as any).w09) (globalThis as any).w09.costs.normalizations++;');
  if (name.endsWith("/src/lib/guilds/localGuildAnalyticsStore.ts")) code = code.replace('  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });',
    '  if ((globalThis as any).w09) (globalThis as any).w09.costs.derivedBuilds++;\n  options?.onPhase?.({ phase: "normalizing-historical-data", sourceId: scan.id });');
  if (name.endsWith("/src/lib/data-hub/dataHubScanInventory.ts")) {
    const count = (key: string) => `(globalThis as any).w09.costs.${key}++`;
    code = code.replace('  start() {', '  start() { ' + count("kpiStarts") + '; ' + count("kpiSubscriptions") + ';');
    code = code.replace('  dispose() {', '  dispose() { ' + count("kpiDisposes") + '; ' + count("kpiUnsubscriptions") + ';');
    code = code.replaceAll('await this.dependencies.readLocal()', '(' + count("kpiMetadataReads") + ', await this.dependencies.readLocal())');
    code = code.replaceAll('await this.dependencies.capture(', '(' + count("kpiDependencyReads") + ', await this.dependencies.capture(').replace('({ scanInventory: true });', '({ scanInventory: true }));');
    code = code.replaceAll('await this.dependencies.revalidate(receipt)', '(' + count("kpiDependencyReads") + ', await this.dependencies.revalidate(receipt))');
    code = code.replace('await this.dependencies.confirm(initial.candidates, { signal: abort.signal, expectedBindings: local.bindings })', '(' + count("kpiConfirmations") + ', await this.dependencies.confirm(initial.candidates, { signal: abort.signal, expectedBindings: local.bindings }))');
    code = code.replace('loadBasis: signal => loadDataHubArchiveBasis({ signal })', 'loadBasis: signal => { ' + count("kpiArchiveLoads") + '; return loadDataHubArchiveBasis({ signal, fetcher: (input, init) => { ' + count("kpiArchiveRequests") + '; return fetch(input, init); } }); }');
    code = code.replace('this.listeners.forEach(listener => listener(this.state));', 'this.listeners.forEach(listener => { ' + count("publications") + '; listener(this.state); });');
  }
  return code;
} };
const directory = "tools/scanArchive/fixtures/dataHubScanInventory";
const evidenceDirectory = outputPath(process.env.SFDATAHUB_INVENTORY_EVIDENCE ?? artifactPath("tmp/w22/inventory"));
await mkdir(outputPath(evidenceDirectory), { recursive: true });
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w09-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "react-i18next", "i18next"] },
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
  const evidence = await evaluate(session, "globalThis.w09?.capture"); if (!evidence) return;
  const shot = await call("Page.captureScreenshot", { format: "png", fromSurface: true }, session);
  await writeFile(outputPath(`${evidenceDirectory}/${evidence.kind}.png`), Buffer.from(shot.data, "base64"));
  screenshots.push(evidence); await evaluate(session, "w09.capture=null");
}
try {
  await server.listen(); const address = server.httpServer!.address(); assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  child = spawn(process.env.W09_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
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
  for (let i = 0; i < 1000; i++) { if (await evaluate(sessionId, "Boolean(globalThis.w09?.ready)")) break; await pause(); }
  assert.equal(await evaluate(sessionId, "Boolean(globalThis.w09?.ready)"), true, "real dashboard fixture loads");
  const results: string[] = [];
  for (const [method, narrow] of [["run", false], ["runNarrow", true]] as const) {
    if (narrow) await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(sessionId, `w09.done=false;w09.error=undefined;w09.${method}().then(result=>{w09.result=result;w09.done=true},error=>{w09.error=error.stack;w09.done=true});undefined`);
    for (let i = 0; i < 2000; i++) { await capture(sessionId); if (await evaluate(sessionId, "w09.done")) break; await pause(); }
    assert.equal(await evaluate(sessionId, "w09.error"), undefined); assert.equal(await evaluate(sessionId, "w09.done"), true);
    for (const result of await evaluate(sessionId, "w09.result") as string[]) { results.push(result); console.log(`PASS ${result}`); }
  }
  await evaluate(sessionId, 'document.querySelector("[data-inventory-toggle]").focus()');
  const key = async (key: string, code: string, virtual: number, shift = false) => {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtual, modifiers: shift ? 8 : 0, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) }, sessionId);
    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtual, modifiers: shift ? 8 : 0 }, sessionId);
    await pause();
  };
  await key("Enter", "Enter", 13);
  assert.equal(await evaluate(sessionId, 'document.querySelector("[data-inventory-toggle]").getAttribute("aria-expanded")'), "false");
  await key("Enter", "Enter", 13);
  await key("Tab", "Tab", 9);
  assert.equal(await evaluate(sessionId, 'document.activeElement?.textContent'), "Erneut prüfen");
  await key("Tab", "Tab", 9, true);
  assert.equal(await evaluate(sessionId, 'document.activeElement?.hasAttribute("data-inventory-toggle")'), true);
  await key("Tab", "Tab", 9);
  await key("Escape", "Escape", 27);
  assert.equal(await evaluate(sessionId, 'document.activeElement?.hasAttribute("data-inventory-toggle") && document.querySelectorAll("[data-inventory-kpi]").length === 0'), true);
  results.push("native Enter/Tab/ShiftTab/Escape: disclosure toggles, retry reachable, focus returns");
  const costs = await evaluate(sessionId, "w09.evidence");
  assert.deepEqual(await evaluate(sessionId, "w09.errors"), []);
  await writeFile(outputPath(`${evidenceDirectory}/browser-results.json`), JSON.stringify({ results, screenshots, costs }, null, 2) + "\n");
  console.log("MEASURED", JSON.stringify(costs)); await call("Target.disposeBrowserContext", { browserContextId });
} finally { socket?.close(); child?.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {}); }
