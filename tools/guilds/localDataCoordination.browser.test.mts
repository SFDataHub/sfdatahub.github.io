import { temporaryPrefix } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

// Uses installed Chrome and Node's built-in CDP transport. Always a fresh profile
// AND an incognito browser context; never attaches to a user's running browser.
const chromePath = process.env.W04_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const projectCacheMetadata = path.resolve("node_modules/.vite/deps/_metadata.json");
const originalCacheMetadata = await readFile(projectCacheMetadata).catch(() => undefined);
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w04-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { host: "127.0.0.1", port: 0 }, root: process.cwd() });
await server.listen();
const address = server.httpServer!.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const child = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: "ignore" });
const pause = (ms = 20) => new Promise<void>(resolve => setTimeout(resolve, ms));
let socket: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
async function call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
  const id = ++nextId;
  const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return promise;
}
async function evaluate(session: string, expression: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, session), new Promise<any>((_, reject) => { timeout = setTimeout(() => reject(new Error(`CDP evaluation timed out: ${expression}`)), 60000); })]).finally(() => clearTimeout(timeout));
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(session: string, expression: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) return;
    await pause();
  }
  throw new Error(`Timeout: ${expression}; ${await evaluate(session, "JSON.stringify(globalThis.proof)")}`);
}
try {
  let portFile = "";
  for (let i = 0; i < 500; i++) {
    try { portFile = await readFile(path.join(profile, "DevToolsActivePort"), "utf8"); break; } catch { await pause(); }
  }
  assert(portFile, "Chrome must expose its isolated debug endpoint");
  const [port, endpoint] = portFile.trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error("CDP connection failed")); });
  socket.onmessage = event => {
    const response = JSON.parse(String(event.data));
    if (response.method === "Runtime.consoleAPICalled") console.log("browser:", response.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
    if (response.method === "Runtime.exceptionThrown") console.log("browser exception:", JSON.stringify(response.params.exceptionDetails));
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(JSON.stringify(response.error))); else waiter.resolve(response.result);
  };
  const { browserContextId } = await call("Target.createBrowserContext");
  async function tab() {
    const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/localDataCoordination/proof.html`, browserContextId });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Runtime.enable", {}, sessionId);
    await until(sessionId, "Boolean(globalThis.proof?.ready)");
    return { sessionId, targetId };
  }
  const a = await tab(), b = await tab();
  assert.equal(await evaluate(a.sessionId, "Boolean(navigator.locks && indexedDB)"), true);
  await evaluate(a.sessionId, "proof.start('tab-a', true); undefined");
  await until(a.sessionId, "proof.entered.includes('tab-a')");
  await evaluate(b.sessionId, "proof.start('tab-b'); proof.startWorker('worker'); undefined");
  await until(b.sessionId, "proof.workerReady");
  await pause(150);
  assert.deepEqual(await evaluate(a.sessionId, "proof.readLog()"), ["tab-a:enter"]);
  await evaluate(a.sessionId, "proof.release(); undefined");
  await until(b.sessionId, "proof.workerDone && proof.entered.includes('tab-b')");
  const log: string[] = await evaluate(a.sessionId, "proof.readLog()");
  assert.deepEqual(log, ["tab-a:enter", "tab-a:exit", "tab-b:enter", "tab-b:exit", "worker:enter", "worker:exit"]);
  await evaluate(b.sessionId, "proof.startWorker('terminated', true); undefined");
  await until(b.sessionId, "proof.workerEntered");
  await evaluate(a.sessionId, "proof.start('after-termination'); undefined");
  await pause(100);
  assert.equal(await evaluate(a.sessionId, "proof.entered.includes('after-termination')"), false);
  await evaluate(b.sessionId, "proof.worker.terminate(); undefined");
  await until(a.sessionId, "proof.entered.includes('after-termination')");
  await evaluate(b.sessionId, "proof.start('closing-tab', true); undefined");
  await until(b.sessionId, "proof.entered.includes('closing-tab')");
  await evaluate(a.sessionId, "proof.start('after-close'); undefined");
  await call("Target.closeTarget", { targetId: b.targetId });
  await until(a.sessionId, "proof.entered.includes('after-close')");
  await evaluate(a.sessionId, "proof.start('abort-holder', true); undefined");
  await until(a.sessionId, "proof.entered.includes('abort-holder')");
  assert.equal(await evaluate(a.sessionId, "proof.abortQueued()"), "AbortError");
  await evaluate(a.sessionId, "proof.release(); undefined");
  console.log("PASS platform: two tabs + real worker, shared IndexedDB, exclusion, queued abort, worker termination, tab close");
  if (!process.argv.includes("--platform-only")) {
    const c = await tab();
    await evaluate(a.sessionId, `globalThis.BroadcastChannel = class extends BroadcastChannel {
      constructor(name) { super(name); if (name === 'sfdatahub:local-data:changes:v1') this.addEventListener('message', event => {if (globalThis.w04DropLive) event.stopImmediatePropagation();}); }
    }`);
    await evaluate(a.sessionId, "import('/tools/guilds/fixtures/localDataCoordination/production.ts').then(m => globalThis.fixture = m)");
    await evaluate(c.sessionId, "import('/tools/guilds/fixtures/localDataCoordination/production.ts').then(m => globalThis.fixture = m)");
    await evaluate(c.sessionId, "fixture.installPeer('tab')");
    await call("Page.bringToFront", {}, a.sessionId);
    console.log(await evaluate(a.sessionId, "fixture.run()"));
    console.log("PASS production browser regressions");
  }
  await call("Target.disposeBrowserContext", { browserContextId });
} finally {
  socket?.close();
  child.kill();
  await server.close();
  // Vite may update shared worker optimizer metadata even with a temporary
  // cacheDir. Preserve the exact pre-test project metadata (including user edits).
  if (originalCacheMetadata) await void originalCacheMetadata;
  await pause(250);
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
}
