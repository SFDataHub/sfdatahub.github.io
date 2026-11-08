import { outputPath, artifactPath, temporaryPrefix, historicalPath } from '../codex/workspace.mjs';
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer as httpServer, type Server } from "node:http";
import path from "node:path";
import { build, createServer, type ViteDevServer } from "vite";
import { updateFixturePlugin } from "./fixtures/dataHubRuntimeAuditReload/plugin.mts";

const root = process.cwd();
const evidenceArgument = process.argv.indexOf("--evidence");
const evidence = outputPath(path.resolve(evidenceArgument < 0 ? artifactPath("tmp/w32/reload") : process.argv[evidenceArgument + 1]));
const fullPlayers = process.argv.includes("--full-players");
const oldSourceArgument = process.argv.indexOf("--old-source");
const oldSource = historicalPath((oldSourceArgument < 0 ? process.env.W27_OLD_SOURCE : process.argv[oldSourceArgument + 1]) ?? "tmp/w32/initial");
assert(oldSource, "saved pre-W32 source directory is required");
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const commands: any[] = [], assets: any = {}, cases: any[] = [], served: any[] = [], cleanup: any[] = [], browserEvents: any[] = [];
const temporary: string[] = [], devServers: ViteDevServer[] = [], hmrServers: Server[] = [];
const previousNodeEnv = process.env.NODE_ENV;
const selected = ["/src/appBootstrap.ts", "/src/lib/local-player-profile/workerAssets.ts", "/src/main.tsx", "/src/pages/DataHub/Toplist.tsx",
  "/src/lib/toplists/localToplistViewWorkerClient.ts", "/src/workers/localToplistView.worker.ts", "/src/lib/toplists/localToplistNameFilter.ts",
  "/src/lib/guilds/guildScanNormalizer.ts", "/src/lib/toplists/localToplistView.ts", "/src/lib/guilds/localScanLibrary.ts", "/src/lib/scanArchive/localFirstScanAcquisition.ts"];
let browser: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined, server: Server | undefined;
let requestId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
async function call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
  const id = ++requestId;
  const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return reply;
}
async function evaluate(sessionId: string, expression: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    new Promise<any>((_, reject) => { timer = setTimeout(() => reject(new Error(`CDP timeout: ${expression}`)), 60000); })]).finally(() => clearTimeout(timer));
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function listen() {
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server!.address(); assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function stopServer() {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined;
}
async function workspace(stand: "old" | "current") {
  const directory = await mkdtemp(temporaryPrefix(`sfdatahub-w27-validation-${stand}-`, 'repo-copies')); temporary.push(directory);
  await cp(path.join(stand === "old" ? oldSource! : root, "src"), path.join(directory, "src"), { recursive: true });
  await mkdir(outputPath(path.join(directory, "tools")), { recursive: true });
  await cp(path.join(stand === "old" ? oldSource! : root, "tools/playerDerivedHelpers.ts"), path.join(directory, "tools/playerDerivedHelpers.ts"));
  await mkdir(outputPath(path.join(directory, "tools/toplists/fixtures")), { recursive: true });
  await cp(path.join(root, "tools/toplists/fixtures/dataHubRuntimeAuditReload"), path.join(directory, "tools/toplists/fixtures/dataHubRuntimeAuditReload"), { recursive: true });
  for (const file of ["index.html", "vite.config.ts", "package.json", "tsconfig.json"])
    await cp(path.join(root, file), path.join(directory, file));
  for (const file of (await readdir(root)).filter(name => /^\.env($|\.)/.test(name))) await cp(path.join(root, file), path.join(directory, file));
  await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "junction");
  await symlink(path.join(root, "public"), path.join(directory, "public"), "junction");
  return directory;
}
async function inspectBuild(directory: string) {
  const names = await readdir(path.join(directory, "assets"));
  const worker = names.find(name => /^localToplistView\.worker-.+\.js$/.test(name)); assert(worker, "actual hashed Viewworker");
  const workerBytes = await readFile(path.join(directory, "assets", worker));
  const clients: any[] = [], lookupClients: any[] = [];
  for (const name of names.filter(name => name.endsWith(".js") && name !== worker)) {
    const bytes = await readFile(path.join(directory, "assets", name));
    if (!name.includes('.worker-') && bytes.includes(Buffer.from('lookupIds.push')))
      lookupClients.push({ file: name, sha256: hash(bytes) });
    if (bytes.includes(Buffer.from(worker))) clients.push({ file: name, sha256: hash(bytes), containsDevQueryLiteral: bytes.includes(Buffer.from("content-contract=")) });
  }
  assert(clients.length, "matching actual production client reference");
  assert(lookupClients.length, "actual production lookup code emitted in window module graph");
  return { directory, worker, workerSHA256: hash(workerBytes), clients, lookupClients };
}
async function pageReady(sessionId: string, previous?: string) {
  for (let i = 0; i < 4000; i++) {
    try {
      if (await evaluate(sessionId, `Boolean(globalThis.w27Update?.ready) ${previous ? `&& w27Update.documentId !== ${JSON.stringify(previous)}` : ""}`)) return;
    } catch (error) {
      // A normal reload can destroy the execution context between two CDP
      // messages. Retry only this expected navigation boundary.
      if (!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error))) throw error;
    }
    const fatal = browserEvents.find(event => event.sessionId === sessionId && event.params.exceptionDetails.exception?.description &&
      !event.params.exceptionDetails.exception.description.includes("Cannot use 'import.meta' outside a module"));
    if (fatal) throw Error(`actual app entry failed: ${fatal.params.exceptionDetails.exception.description}`);
    await pause();
  }
  throw Error("normal index/bootstrap/main entry did not load");
}
async function cacheSnapshot(sessionId: string) {
  return evaluate(sessionId, `(async()=>{const cache=await caches.open('sfdatahub-cache-v2');const entries=[];for(const request of await cache.keys()){const response=await cache.match(request);const bytes=await response.arrayBuffer();const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');entries.push({url:request.url,sha256:sha});}return entries;})()`);
}
async function runCase(kind: "dev" | "production", origin: string, deploy: () => void) {
  const { browserContextId } = await call("Target.createBrowserContext");
  const { targetId } = await call("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Runtime.enable", {}, sessionId);
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await call("Page.navigate", { url: `${origin}/#/data-hub/toplist` }, sessionId);
  await pageReady(sessionId);
  // Initial native SW installation is preparation of the OLD browser state.
  // The later update step consists solely of an ordinary document reload.
  await evaluate(sessionId, `(async()=>{await navigator.serviceWorker.register('/service-worker.js',{scope:'/'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));})()`);
  const firstDocument = await evaluate(sessionId, "w27Update.documentId");
  await call("Page.reload", {}, sessionId); await pageReady(sessionId, firstDocument);
  const old = await evaluate(sessionId, "w27Update.old()"); assert.equal(old.stand, "old"); assert(old.controller);
  const before = await evaluate(sessionId, "w27Update.durable()");
  assert(before.stores.some((s: any) => s.store === "scans" && s.records.length), "actual stored raw scan");
  assert(before.stores.some((s: any) => s.store === "localToplistSnapshots" && s.records.length), "actual valid stored derived snapshot");
  assert(before.stores.some((s: any) => s.store === "state" && s.records.some((r: any) => r.id === "hub-favorites")), "actual saved local favorites");
  assert.deepEqual(before.scope, ["F8"]);
  const oldRequests = served.filter(r => r.kind === kind && r.stand === "old");
  if (kind === "dev") {
    // Store the REAL transformed old modules at their stable request URLs.
    // Native canonical SW remains active; no executable response is fabricated.
    const moduleRequests = oldRequests.filter(r => selected.includes(new URL(r.url, origin).pathname));
    assert(moduleRequests.some(r => r.url.includes("localToplistView.worker.ts")), "old native worker graph actually served");
    for (const request of moduleRequests) {
      await evaluate(sessionId, `(async()=>{const r=await fetch(${JSON.stringify(request.url)});if(!r.ok)throw Error('old cache seed HTTP');await (await caches.open('sfdatahub-cache-v2')).put(${JSON.stringify(request.url)},r);})()`);
    }
  }
  const cacheBefore = await cacheSnapshot(sessionId);
  const shotOld = await call("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
  await writeFile(outputPath(path.join(evidence, `${kind}-old.png`)), Buffer.from(shotOld.data, "base64"));
  deploy();
  await call("Page.reload", {}, sessionId); await pageReady(sessionId, old.documentId);
  let current: any;
  try { current = await evaluate(sessionId, "w27Update.filter()"); }
  catch (error) {
    await writeFile(outputPath(path.join(evidence, `${kind}-failed-state.json`)), JSON.stringify(await evaluate(sessionId, "({scrollBefore:w27Update.scrollBefore,body:document.body.innerText.slice(-3000),responses:w27Update.responses.slice(-3),messages:w27Update.messages.slice(-10),scroll:[...document.querySelectorAll('.toplists-table-scroll')].map(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,top:el.scrollTop})),errors:w27Update.errors})"),null,2));
    throw error;
  } assert.equal(current.stand, "current"); assert(current.controller);
  const audit = await evaluate(sessionId, "sfhDataHubRuntimeAudit.snapshot()"); assert(audit.enabled); assert(audit.reports.some((r:any)=>r.spans.some((s:any)=>s.name==="worker-result")),"normal current feature receives worker audit"); await writeFile(outputPath(path.join(evidence,`${kind}-audit.json`)),JSON.stringify(audit,null,2));
  const after = await evaluate(sessionId, "w27Update.durable()"); assert.deepEqual(after, before, "raw/derived/favorites IDs and hashes plus server selection preserved");
  assert.deepEqual(current.preservedBeforeActivation, before, "normal reload preserves existing data and selection before acquisition");
  const cacheAfter = await cacheSnapshot(sessionId);
  for (const entry of cacheBefore) assert(cacheAfter.some((now: any) => now.url === entry.url && now.sha256 === entry.sha256), `old cache entry preserved: ${entry.url}`);
  const shot = await call("Page.captureScreenshot", { format: "png", fromSurface: true }, sessionId);
  await writeFile(outputPath(path.join(evidence, `${kind}-filter-after-reload.png`)), Buffer.from(shot.data, "base64"));
  const currentRequests = served.filter(r => r.kind === kind && r.stand === "current");
  if (kind === "dev") for (const pathname of ["/src/workers/localToplistView.worker.ts", "/src/lib/toplists/localToplistNameFilter.ts", "/src/lib/guilds/guildScanNormalizer.ts", "/src/lib/toplists/localToplistView.ts", "/src/lib/guilds/localScanLibrary.ts", "/src/lib/scanArchive/localFirstScanAcquisition.ts"])
    assert(currentRequests.some(r => new URL(r.url, origin).pathname === pathname), `actual current worker dependency delivered: ${pathname}`);
  else {
    assert(old.workerURLs.some((url: string) => url.includes(assets.old.worker)));
    assert(current.workerURLs.some((url: string) => url.includes(assets.current.worker)));
    assert(current.workerURLs.every((url: string) => url.includes(assets.current.worker) || !url.includes("localToplistView.worker-")));
    for (const state of [old, current])
      assert(state.workerURLs.every((url: string) => !new URL(url).searchParams.has("content-contract")), "actual production workers have no DEV contract query");
    assert(currentRequests.some(r => r.url.includes(assets.current.worker) && r.sha256 === assets.current.workerSHA256) ||
      cacheAfter.some((entry: any) => entry.url.includes(assets.current.worker) && entry.sha256 === assets.current.workerSHA256),
      "unchanged actual viewworker delivered from network or retained native SW cache");
    for (const [stand, requests] of [["old", oldRequests], ["current", currentRequests]] as const)
      assert(assets[stand].lookupClients.some((client: any) => requests.some(r => r.url.includes(client.file) && r.sha256 === client.sha256)), `actual ${stand} lookup module delivered`);
    for (const [stand, requests] of [["old", oldRequests], ["current", currentRequests]] as const)
      for (const client of assets[stand].clients)
        assert(requests.some(r => r.url.includes(client.file) && r.sha256 === client.sha256), `actual matching ${stand} production client delivered`);
  }
  const result = { kind, origin, old, current, before, after, cacheBefore, cacheAfter, ordinaryReload: true, noCacheClear: true, noReimport: true,
    oldRequests, currentRequests, errors: await evaluate(sessionId, "w27Update.errors") };
  assert.deepEqual(result.errors, []); cases.push(result);
  await writeFile(outputPath(path.join(evidence, "reload-update-results.json")), JSON.stringify({ cases, assets }, null, 2) + "\n");
  console.log(`PASS ${kind}: actual pre-W30 client → ordinary reload → new lookup for locally existing unselected source; durable records and old caches retained`);
  await call("Target.disposeBrowserContext", { browserContextId });
}
try {
  await mkdir(outputPath(evidence), { recursive: true });
  const workspaces = { old: await workspace("old"), current: await workspace("current") };
  console.log("Authenticated old and current source copied into separate temporary workspaces");
  const profile = await mkdtemp(temporaryPrefix("sfdatahub-w27-validation-browser-", 'browser-profiles')); temporary.push(profile);
  browser = spawn(process.env.W08_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: "ignore" });
  let endpoint = "";
  for (let i = 0; i < 1000; i++) { try { endpoint = await readFile(path.join(profile, "DevToolsActivePort"), "utf8"); break; } catch { await pause(); } }
  assert(endpoint, "isolated Chrome endpoint");
  const [port, socketPath] = endpoint.trim().split(/\r?\n/); socket = new WebSocket(`ws://127.0.0.1:${port}${socketPath}`);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(Error("CDP connection failed")); });
  socket.onmessage = event => { const message = JSON.parse(String(event.data)); const waiter = pending.get(message.id); if (!waiter) { if (message.method === "Runtime.exceptionThrown") browserEvents.push(message); return; } pending.delete(message.id); if (message.error) waiter.reject(Error(JSON.stringify(message.error))); else waiter.resolve(message.result); };
  for (const stand of ["old", "current"] as const) {
    // Vite's normal client still needs its websocket handshake. Keep each
    // isolated server's transport on a private random port; watch remains off.
    const hmrServer = httpServer(); hmrServers.push(hmrServer);
    await new Promise<void>(resolve => hmrServer.listen(0, "127.0.0.1", resolve));
    const address = hmrServer.address(); assert(address && typeof address !== "string");
    devServers.push(await createServer({configLoader:"runner",  root: workspaces[stand], configFile: path.join(workspaces[stand], "vite.config.ts"),
      cacheDir: path.join(profile, `vite-${stand}`), plugins: [updateFixturePlugin(stand, fullPlayers)],
      server: { middlewareMode: true, hmr: { server: hmrServer, host: "127.0.0.1", clientPort: address.port }, watch: null } }));
  }
  let deployed = false;
  server = httpServer((req, res) => {
    const stand = deployed ? "current" : "old", pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (selected.includes(pathname)) {
      const chunks: Buffer[] = [], write = res.write.bind(res), end = res.end.bind(res);
      res.write = ((chunk: any, ...args: any[]) => { if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return (write as any)(chunk, ...args); }) as typeof res.write;
      res.end = ((chunk?: any, ...args: any[]) => { if (chunk && typeof chunk !== "function") chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); const bytes = Buffer.concat(chunks); served.push({ kind: "dev", stand, url: req.url, sha256: hash(bytes), bytes: bytes.length, status: res.statusCode }); return (end as any)(chunk, ...args); }) as typeof res.end;
    }
    devServers[deployed ? 1 : 0].middlewares(req, res, () => { res.statusCode = 404; res.end("Missing fixture asset"); });
  });
  await runCase("dev", await listen(), () => { deployed = true; });
  await stopServer(); for (const vite of devServers.splice(0)) await vite.close();
  // Vite's dev API sets NODE_ENV=development in this process. A normal vite
  // build starts in a separate process; restore that production environment
  // explicitly for this sequential two-stand orchestration.
  process.env.NODE_ENV = "production";
  for (const stand of ["old", "current"] as const) {
    const directory = path.join(workspaces[stand], "out");
    const command = `NODE_ENV=production; Vite build({configLoader:"runner", root:${JSON.stringify(workspaces[stand])},configFile:"vite.config.ts",mode:"production",plugins:[updateFixturePlugin(${JSON.stringify(stand)}),productionConfigProof],build:{outDir:${JSON.stringify(directory)}}})`;
    let configProof: any;
    try { await build({configLoader:"runner",  root: workspaces[stand], configFile: path.join(workspaces[stand], "vite.config.ts"), mode: "production",
      plugins: [updateFixturePlugin(stand, fullPlayers), { name: "w27-production-config-proof", configResolved(config) {
        configProof = { mode: config.mode, isProduction: config.isProduction, nodeEnv: process.env.NODE_ENV,
          workerFormat: config.worker.format, base: config.base, buildTarget: config.build.target };
        assert.equal(config.isProduction, true); assert.equal(config.mode, "production");
      } }], build: { outDir: directory } }); commands.push({ command, exitCode: 0, configProof }); }
    catch (error) { commands.push({ command, exitCode: 1, error: String(error) }); throw error; }
    assets[stand] = await inspectBuild(directory);
  }
  assert.notEqual(assets.old.worker, assets.current.worker, "audit instrumentation changes actual worker bytes");
  assert.notEqual(assets.old.workerSHA256, assets.current.workerSHA256);
  assert.notEqual(assets.old.lookupClients[0].sha256, assets.current.lookupClients[0].sha256, "actual emitted lookup changed");
  await writeFile(outputPath(path.join(evidence, "production-assets.json")), JSON.stringify(assets, null, 2) + "\n");
  deployed = false;
  server = httpServer(async (req, res) => {
    const stand = deployed ? "current" : "old"; const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const directory = assets[stand].directory, filename = path.resolve(directory, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!filename.startsWith(directory + path.sep)) { res.statusCode = 403; res.end(); return; }
    try { const bytes = await readFile(filename); res.setHeader("Content-Type", filename.endsWith(".html") ? "text/html" : filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "application/octet-stream");
      res.setHeader("Cache-Control", "no-store"); served.push({ kind: "production", stand, url: req.url, sha256: hash(bytes), bytes: bytes.length }); res.end(bytes);
    } catch { res.statusCode = 404; res.end("Missing actual production asset"); }
  });
  await runCase("production", await listen(), () => { deployed = true; });
} finally {
  socket?.close(); browser?.kill(); await stopServer();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  for (const vite of devServers) await vite.close();
  for (const hmrServer of hmrServers) await new Promise<void>(resolve => hmrServer.close(() => resolve()));
  for (const directory of temporary.reverse()) { await rm(directory, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }); cleanup.push({ directory, removed: true }); }
  await writeFile(outputPath(path.join(evidence, "build-commands.json")), JSON.stringify(commands, null, 2) + "\n");
  await writeFile(outputPath(path.join(evidence, "cleanup.json")), JSON.stringify(cleanup, null, 2) + "\n");
  await writeFile(outputPath(path.join(evidence, "served-assets.json")), JSON.stringify(served, null, 2) + "\n");
  await writeFile(outputPath(path.join(evidence, "browser-events.json")), JSON.stringify(browserEvents, null, 2) + "\n");
}
