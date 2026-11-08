import { outputPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import {readFileSync,existsSync} from "node:fs";
import assert from "node:assert/strict";
import { createServer as reservePort } from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, type Plugin } from "vite";
// Actual RootLayout/RouteHost/LocalPlayerDetail, Dashboard, Playground Cards/Trend,
// shared profile content/Coordinator/Workers and browser IDB; fresh profile.
// Only presentation/selection and foreign archive acquisition are substituted.
let deployed = false;
const evidence = outputPath(process.env.SFDATAHUB_UPDATE_EVIDENCE ?? artifactPath("tmp/w19n02"));
const production = JSON.parse(readFileSync(evidence + "/production-assets.json", "utf8"));
const plugin: Plugin = { name: "w19n02-static-production-stands", configureServer(server) {
    server.middlewares.use((req, res) => {
        if (req.url === "/__w07deploy") { deployed = true; res.end("{}"); return; }
        const requested = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
        const stand = production.stands[deployed ? "current" : "old"];
        const pathname = requested === "/" ? "/index.html" : requested;
        const asset = path.resolve(stand.directory, "." + pathname);
        if (!asset.startsWith(path.resolve(stand.directory) + path.sep)) { res.statusCode = 403; res.end(); return; }
        if (!existsSync(asset)) { res.statusCode = 404; res.end("Missing production asset"); return; }
        res.setHeader("Content-Type", pathname.endsWith(".html") ? "text/html" : pathname.endsWith(".js") ? "text/javascript" : pathname.endsWith(".css") ? "text/css" : "application/octet-stream");
        res.setHeader("Cache-Control", "no-store"); res.end(readFileSync(asset));
    });
} };
const chrome = process.env.W07_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w19n02-browser-", 'browser-profiles'));
// Use an OS-assigned port, never Vite's default localhost:5173 app port.
const probe = reservePort();
await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
const reserved = probe.address();
assert(reserved && typeof reserved !== "string");
const testPort = reserved.port;
await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [plugin], root: process.cwd(), server: { host: "127.0.0.1", port: testPort, strictPort: true, watch:null } });
let child: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined;
let nextId = 0;
const pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}>();
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
    if (result.exceptionDetails)
        throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
try {
    await server.listen();
    const address = server.httpServer!.address();
    assert(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    child = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", `--user-data-dir=${profile}`], { stdio: "ignore" });
    let portFile = "";
    for (let attempt = 0; attempt < 500; attempt++) {
        try {
            portFile = await readFile(path.join(profile, "DevToolsActivePort"), "utf8");
            break;
        }
        catch {
            await pause();
        }
    }
    assert(portFile, "isolated Chrome debug endpoint is required");
    const [port, endpoint] = portFile.trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(new Error("CDP connection failed")); });
    socket.onmessage = event => {
        const message = JSON.parse(String(event.data));
        if (message.method === "Runtime.exceptionThrown")
            console.log("browser exception:", JSON.stringify(message.params.exceptionDetails));
        if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error" && !String(message.params.args[0]?.value).startsWith("Warning: An update"))
            console.log("browser:", message.params.args.map((arg: any) => arg.value ?? arg.description).join(" "));
        const waiter = pending.get(message.id);
        if (!waiter)
            return;
        pending.delete(message.id);
        if (message.error)
            waiter.reject(new Error(JSON.stringify(message.error)));
        else
            waiter.resolve(message.result);
    };
    const { browserContextId } = await call("Target.createBrowserContext");
    const { targetId } = await call("Target.createTarget", { url: `${origin}/`, browserContextId });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Runtime.enable", {}, sessionId);
    await call("Page.bringToFront", {}, sessionId);
    for (let attempt = 0; attempt < 1000; attempt++) {
        if (await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"))
            break;
        await pause();
    }
    assert.equal(await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"), true, "React fixture must load");
    const waitReady = async () => {
      for (let attempt = 0; attempt < 1500; attempt++) { if (await evaluate(sessionId, "Boolean(globalThis.w07?.productionReady)")) return; await pause(); }
      throw Error('normal production app entry did not become ready');
    };
    await waitReady();
    const reloadReady = async () => {
      const previous = await evaluate(sessionId, "performance.timeOrigin");
      await call('Page.reload', {}, sessionId);
      for (let attempt = 0; attempt < 1500; attempt++) {
        if (await evaluate(sessionId, `performance.timeOrigin !== ${previous} && Boolean(globalThis.w07?.productionReady)`)) return;
        await pause();
      }
      throw Error('new production document did not become ready');
    };
    const seed = await evaluate(sessionId, "w07.productionSeed()");
    const old = await evaluate(sessionId, "w07.productionRun()");
    assert.equal(old.version, 1);
    await evaluate(sessionId, "fetch('/__w07deploy').then(r => r.text())");
    await reloadReady();
    const current = await evaluate(sessionId, "w07.productionRun()");
    assert.equal(current.version, 2);
    await reloadReady();
    const reload = await evaluate(sessionId, "w07.productionRun()");
    assert.deepEqual(current.durable, old.durable);
    assert.deepEqual(reload.durable, old.durable);
    assert.ok(old.workerURLs.some((url: string) => url.includes(production.stands.old.worker)));
    assert.ok(current.workerURLs.some((url: string) => url.includes(production.stands.current.worker)));
    assert.ok(current.workerURLs.every((url: string) => !url.includes(production.stands.old.worker)));
    console.log('PASS actual two production asset states, ordinary same-origin reload, native matching Worker, consumers and persisted bytes');
    await writeFile(outputPath(evidence + "/production-browser.json"), JSON.stringify({ seed, old, current, reload }, null, 2) + "\n");
    await call("Target.disposeBrowserContext", { browserContextId });
}
finally {
    socket?.close();
    child?.kill();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 });
    assert.equal(existsSync(profile), false, "own temporary browser profile removed");
    await writeFile(outputPath(`${evidence}/browser-cleanup-${process.argv.includes("--uncontrolled-page") ? "uncontrolled" : process.argv.includes("--legacy-registration") ? "legacy" : "production"}.json`), JSON.stringify({ profile, removed: true }) + "\n");
}
