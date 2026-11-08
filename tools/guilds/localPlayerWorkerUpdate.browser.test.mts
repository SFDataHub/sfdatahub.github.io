import { outputPath, historicalPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import {readFileSync,existsSync} from "node:fs";
import { framePlugin } from "./fixtures/profileBrowserGuards/framePlugin.mts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer as reservePort } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, transformWithEsbuild, type Plugin } from "vite";
// Actual RootLayout/RouteHost/LocalPlayerDetail, Dashboard, Playground Cards/Trend,
// shared profile content/Coordinator/Workers and browser IDB; fresh profile.
// Only presentation/selection and foreign archive acquisition are substituted.
const fixturePath = "/tools/guilds/fixtures/localPlayerAnalyticsExecution/mocks.tsx";
const aliases: Record<string, string> = {
    "/src/components/ContentShell": "Shell as default", "/src/components/guilds/GuildContextBar": "None as default",
    "/src/components/guilds/GuildEmblem": "None as default,None as GuildEmblemArtwork,useGuildEmblemVisual,prepareGuildCoa,useRenderedCoaUrl", "/src/components/avatar/PortraitPreview": "Portrait as default",
    "/src/pages/GuildHub/hooks/useGuildHubSelection": "useGuildHubSelection", "/src/pages/GuildHub/dashboardLocalFirst": "acquireDashboardLocalFirstFeatureScans",
};
let armed: string | undefined;
const held: Array<{
    end: (data: string) => void;
}> = [];
const calls: Array<{
    kind: string;
    id: string;
    at: number;
}> = [];
const metrics: Array<{
    phase: string;
    id: string;
    realm: string;
    wallMs: number;
    at: number;
}> = [];
const instrumentation = new Set<string>();
let deployed = false, unavailable = false;
const historicalRoot = "tools/guilds/fixtures/localPlayerWorkerUpdate";
const provenance = JSON.parse(readFileSync(`${historicalRoot}/provenance.json`, "utf8"));
for (const fixture of provenance) {
    assert.equal(createHash("sha256").update(readFileSync(fixture.fixture)).digest("hex"), fixture.sha256, `historical bytes changed: ${fixture.fixture}`);
}
// Blob workers have no directory against which relative imports can resolve.
// Resolve every runtime import, including subsequently added proof/audit modules.
async function moduleBytes(file: string, source = readFileSync(file, "utf8")) {
    const compiled = (await transformWithEsbuild(source, file, { loader: "ts" })).code;
    let imports = 0;
    const code = compiled.replace(/from (["'])(\.[^"']+)\1/g, (_match, quote, specifier) => {
        imports++;
        const resolved = path.posix.resolve("/", path.posix.dirname(file), specifier);
        return `from ${quote}${resolved}${path.posix.extname(resolved) ? "" : ".ts"}${quote}`;
    });
    assert(imports > 0, `module imports must be resolved: ${file}`);
    assert(!/from ["']\./.test(code), `unresolved blob import: ${file}`);
    return code;
}
const initialSW = readFileSync(`${historicalRoot}/w19n02/public/service-worker.js`, "utf8");
const transportPath = "src/lib/local-player-profile/executionTransport.ts";
const workerPath = "src/workers/playerAnalytics.worker.ts";
const oldModule = await moduleBytes(transportPath, readFileSync(`${historicalRoot}/w19/${transportPath}`, "utf8"));
const historicalV2Module = await moduleBytes(transportPath, readFileSync(`${historicalRoot}/w19n02/${transportPath}`, "utf8"));
const currentContractMatch = readFileSync(transportPath, "utf8").match(/export const ANALYTICS_TRANSPORT_VERSION = (\d+);/);
assert(currentContractMatch, "current contract version must be explicit");
const currentContractVersion = Number(currentContractMatch[1]);
assert.equal(historicalV2Module.split("ANALYTICS_TRANSPORT_VERSION = 2;").length - 1, 1);
// A separate synthetic same-contract old implementation retains the original
// W19n02 regression: contract equality alone must not keep stale module code.
// Only the version tag changes; the archived bytes themselves stay untouched.
const compatibleModule = historicalV2Module.replace("ANALYTICS_TRANSPORT_VERSION = 2;", `ANALYTICS_TRANSPORT_VERSION = ${currentContractVersion};`);
const currentWorker = await moduleBytes(workerPath);
const historicalWorker = readFileSync(`${historicalRoot}/w19/${workerPath}`, "utf8");
const transportImport = /import \{ ANALYTICS_TRANSPORT_VERSION[^\n]+\n/g;
assert.equal([...historicalWorker.matchAll(transportImport)].length, 1, "one historical transport import is frozen to v1");
const legacySource = historicalWorker.replace(transportImport, "const ANALYTICS_TRANSPORT_VERSION = 1;\n");
const legacyWorker = await moduleBytes(workerPath, legacySource);
assert(oldModule.includes("ANALYTICS_TRANSPORT_VERSION = 1"));
assert(historicalV2Module.includes("ANALYTICS_TRANSPORT_VERSION = 2") && !historicalV2Module.includes("renewalUsed"));
assert(compatibleModule.includes(`ANALYTICS_TRANSPORT_VERSION = ${currentContractVersion}`) && !compatibleModule.includes("renewalUsed"));
const plugin: Plugin = { name: "w07-production-consumers", enforce: "pre",
    resolveId(source, importer) { if (!importer || !source.startsWith("."))
        return; const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, ""); const key = Object.keys(aliases).find(k => resolved.endsWith(k)); if (key)
        return `\0w07:${key}`; },
    load(id) { if (id.startsWith("\0w07:"))
        return `${id.slice(5) === "/src/pages/GuildHub/dashboardLocalFirst" ? "export * from '/src/pages/GuildHub/dashboardLocalFirst.ts';" : ""} export { ${aliases[id.slice(5)]} } from '${fixturePath}';`; },
    configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (req.url === "/__w07unavailable") { unavailable = true; res.end("{}"); return; }
            if (req.url === "/__w07available") { unavailable = false; res.end("{}"); return; }
            if (unavailable && req.url?.startsWith("/src/workers/playerAnalytics.worker.ts")) { res.statusCode = 503; res.end("controlled missing analytics worker"); return; }
            if (req.url === "/service-worker.js") { res.setHeader("Content-Type", "text/javascript"); res.setHeader("Cache-Control", "no-store"); res.end(deployed ? readFileSync("public/service-worker.js", "utf8") : initialSW); return; }
            if (req.url === "/sw.js") { res.setHeader("Content-Type", deployed ? "text/html" : "text/javascript"); res.setHeader("Cache-Control", "no-store"); res.end(deployed ? "<!doctype html><html><body>SPA fallback for removed sw.js</body></html>" : initialSW); return; }
            if (req.url?.startsWith("/__w07bytes")) { const kind = new URL(req.url, "http://localhost").searchParams.get("kind"); res.setHeader("Content-Type", "text/javascript"); res.end(kind === "old-module" ? oldModule : kind === "compatible-module" ? compatibleModule : kind === "historical-v2-module" ? historicalV2Module : kind === "old-worker" ? legacyWorker : kind === "old-main" ? (await server.transformRequest("/src/main.tsx?historical-main"))!.code : currentWorker); return; }
            if (req.url === "/__w07deploy") { deployed = true; res.end("{}"); return; }
            if (req.url === "/__w19legacy.js") { res.setHeader("Content-Type", "text/javascript"); res.end(legacyWorker); return; }
            if (req.url === "/__w19sw.js") { res.setHeader("Content-Type", "text/javascript"); res.setHeader("Service-Worker-Allowed", "/"); res.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));"); return; }
            if (!req.url?.startsWith("/__w07"))
                return next();
            const url = new URL(req.url, "http://localhost");
            const action = url.pathname.slice(6);
            const kind = url.searchParams.get("kind") ?? "source";
            res.setHeader("Content-Type", "application/json");
            if (action === "resetmetrics") {
                metrics.length = 0;
                calls.length = 0;
                res.end("{}");
                return;
            }
            if (action === "metric") {
                metrics.push({ phase: url.searchParams.get("phase") ?? "unknown", id: url.searchParams.get("id") ?? "", realm: url.searchParams.get("realm") ?? "", wallMs: Number(url.searchParams.get("at")), at: performance.now() });
                res.end("{}");
                return;
            }
            if (action === "arm") {
                armed = kind;
                res.end("{}");
                return;
            }
            if (action === "release") {
                armed = undefined;
                for (const response of held.splice(0))
                    response.end("{}");
                res.end("{}");
                return;
            }
            if (action === "gate") {
                calls.push({ kind, id: url.searchParams.get("id") ?? "", at: performance.now() });
                if (armed === kind) {
                    armed = undefined;
                    held.push(res);
                }
                else
                    res.end("{}");
                return;
            }
            res.end(JSON.stringify({ held: held.length, calls, metrics }));
        });
    },
    transform(code, id) {
        code = code.replace(/\r\n/g, "\n");
        const replace = (anchor: string, replacement: string) => {
            assert.equal(code.split(anchor).length - 1, 1, `instrument anchor must match once: ${id}: ${anchor}`);
            instrumentation.add(anchor);
            return code.replace(anchor, replacement);
        };
        const initial = path.join(process.argv.includes('--proof-before') || process.argv.includes('--before') ? historicalPath('tmp/w19/initial') : process.cwd(), path.relative(process.cwd(), id.split('?')[0]));
        if (process.argv.includes('--proof-before') && (id.includes('local-player-profile') || id.includes('playerAnalytics.worker.ts'))) code = readFileSync(initial, 'utf8');
        const normalized = id.replace(/\\/g, "/");
        if (normalized.endsWith("/src/main.tsx?historical-main")) return readFileSync("tools/guilds/fixtures/localPlayerWorkerUpdate/w19n02/src/main.tsx", "utf8");
        if (normalized.endsWith("/src/main.tsx")) return 'import "/tools/guilds/fixtures/localPlayerLoadingRecovery/updateFixture.tsx";';
        if (normalized.endsWith("/src/lib/local-player-profile/cardTrendExecution.ts"))
            code = replace('const own = ++generation;', 'const own = ++generation; void fetch(`/__w07metric?phase=acquisition&id=${kind}&realm=${refresh ? "refresh" : "initial"}&at=${Date.now()}`);');
        if (normalized.endsWith("/src/lib/local-player-profile/executionWork.ts"))
            code = replace('const started = performance.now();', 'const started = performance.now(); if (typeof window === "undefined") await fetch(`/__w07gate?kind=${work.kind}&id=${work.kind === "source" ? work.summary.sourceScanId : "projection"}`);');
        if (normalized.endsWith("/src/lib/local-player-profile/executionTransport.ts"))
            code = replace('}, budgetMs);', '}, (globalThis as any).w07?.noresponseBudget ?? budgetMs);');
        if (normalized.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
            code = replace('export async function getGuildHubLocalScan(id: string) {', 'export async function getGuildHubLocalScan(id: string) { const w07Stack = new Error().stack ?? ""; void fetch(`/__w07metric?phase=raw&id=${encodeURIComponent(id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
            code = replace('return auditReturn(__audit15, scan ? persistScanNormalizationIfNeeded(db, scan) : null);', 'const result = scan ? await persistScanNormalizationIfNeeded(db, scan) : null; await (globalThis as any).w07AfterRaw?.(id,w07Stack); return auditReturn(__audit15, result);');
            code = replace('    const scan = await db.get(SCAN_STORE, key);', '    const scan = await db.get(SCAN_STORE, key); void fetch(`/__w07metric?phase=raw-summary&id=${encodeURIComponent(String(key))}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
            code = replace('    const latest = await (auditValue(__audit3, auditEnter(__audit3, \"db.get\"), (db.get(SCAN_STORE, scan.id))));', '    const latest = await (auditValue(__audit3, auditEnter(__audit3, \"db.get\"), (db.get(SCAN_STORE, scan.id)))); void fetch(`/__w07metric?phase=raw-repair-reread&id=${encodeURIComponent(scan.id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
        }
        if (normalized.endsWith("/src/pages/Playground/playerPerformanceModel.ts"))
            code = replace('export function buildAnalyticsIndexes(data: GuildAnalyticsDerivedData | null): AnalyticsIndexes {', 'export function buildAnalyticsIndexes(data: GuildAnalyticsDerivedData | null): AnalyticsIndexes { void fetch("/__w07metric?phase=index");');
        if (normalized.endsWith("/src/lib/guilds/guildSnapshotCompleteness.ts"))
            code = replace('export function buildGuildSnapshotCompletenessReports(data: GuildAnalyticsDerivedData | null | undefined) {', 'export function buildGuildSnapshotCompletenessReports(data: GuildAnalyticsDerivedData | null | undefined) { void fetch("/__w07metric?phase=completeness");');
        if (normalized.endsWith("/src/lib/guilds/localGuildAnalyticsStore.ts"))
            code = replace('  const normalizationDurations: number[] = [];', '  void fetch(`/__w07metric?phase=sourcebuild&id=${encodeURIComponent(scan.id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`); const normalizationDurations: number[] = [];');
        if (normalized.endsWith("/src/lib/local-player-profile/useLocalProfilePart.ts"))
            code = replace('setState({ key, area, comparison, part });', '(globalThis as any).w07.uiWrites++; setState({ key, area, comparison, part });');
        return code;
    }
};
const evidenceDirectory = outputPath(process.env.SFDATAHUB_WORKER_EVIDENCE ?? artifactPath("tmp/w120/worker-update"));
await mkdir(outputPath(evidenceDirectory), { recursive: true });
const chrome = process.env.W07_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w19n02-dev-", 'browser-profiles'));
// Use an OS-assigned port, never Vite's default localhost:5173 app port.
const probe = reservePort();
await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
const reserved = probe.address();
assert(reserved && typeof reserved !== "string");
const testPort = reserved.port;
await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "recharts", "lucide-react", "react-i18next", "i18next"] },
    plugins: [framePlugin, plugin], worker: { plugins: () => [framePlugin, plugin], format: "es" }, root: process.cwd(), server: { host: "127.0.0.1", port: testPort, strictPort: true, watch:null } });
let child: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined;
let evidenceSession: string | undefined;
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
    assert.notEqual(address.port, 5173);
    await writeFile(outputPath(`${evidenceDirectory}/isolation.json`), JSON.stringify({ origin, profile, cwd: process.cwd(), freshProfile: true }, null, 2));
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
    evidenceSession = sessionId;
    await call("Runtime.enable", {}, sessionId);
    await call("Page.bringToFront", {}, sessionId);
    for (let attempt = 0; attempt < 1000; attempt++) {
        if (await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"))
            break;
        await pause();
    }
    assert.equal(await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"), true, "React fixture must load");
    for (let attempt = 0; attempt < 1000; attempt++) { if (await evaluate(sessionId, "Boolean(w07.updateReady)")) break; await pause(); }
    const reloadReady = async (params: Record<string, unknown> = {}) => {
      const previous = await evaluate(sessionId, "performance.timeOrigin");
      await call('Page.reload', params, sessionId);
      for (let attempt = 0; attempt < 1500; attempt++) {
        if (await evaluate(sessionId, `performance.timeOrigin !== ${previous} && Boolean(globalThis.w07?.updateReady)`)) return;
        await pause();
      }
      throw Error('new app document did not become ready');
    };
    const legacy = process.argv.includes('--legacy-registration');
    console.log("STAGE seedUpdate");
    const seed = await evaluate(sessionId, `w07.seedUpdate(${legacy})`);
    console.log("STAGE beforeUpdate");
    const before = await evaluate(sessionId, "w07.beforeUpdate()");
    const result: any = { seed, before };
    if (!process.argv.includes('--before')) {
      await evaluate(sessionId, "fetch('/__w07deploy').then(r => r.text())");
      if (legacy) {
        result.legacyUpdateError = await evaluate(sessionId, "navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => '', e => String(e))");
        assert.match(result.legacyUpdateError, /MIME|SecurityError/, 'actual legacy update fails on HTML as in user screenshot');
      }
      await reloadReady();
      console.log("STAGE afterUpdate");
      result.after = await evaluate(sessionId, "w07.afterUpdate()");
      if (process.argv.includes('--uncontrolled-page')) {
        // Construct the already-activated / uncontrolled-document condition.
        // This forced navigation is TEST SETUP, never an application action.
        await call('Network.enable', {}, sessionId);
        await call('Network.setBypassServiceWorker', { bypass: true }, sessionId);
        await reloadReady({ ignoreCache: true });
        result.uncontrolled = await evaluate(sessionId, "w07.afterUpdate()");
        result.controller = await evaluate(sessionId, "navigator.serviceWorker.controller?.scriptURL ?? null");
        assert.equal(result.controller, null, 'native browser document is uncontrolled while registration remains active');
        result.activeScript = await evaluate(sessionId, "navigator.serviceWorker.getRegistration().then(r => ({ script: r.active.scriptURL, state: r.active.state }))");
        assert.equal(result.activeScript.script, origin + '/service-worker.js');
        assert.equal(result.activeScript.state, 'activated');
        await call('Network.setBypassServiceWorker', { bypass: false }, sessionId);
      } else {
        result.controller = await evaluate(sessionId, "navigator.serviceWorker.controller?.scriptURL ?? null");
        assert.equal(result.controller, origin + '/service-worker.js', 'canonical controller takes over the same root scope');
      }
      console.log("STAGE renewShared");
      result.sharing = await evaluate(sessionId, "w07.renewShared()");
      console.log("STAGE faultUpdate");
      result.unavailable = await evaluate(sessionId, "w07.faultUpdate()");
      result.historicalV2 = await evaluate(sessionId, "w07.seedHistoricalV2()");
      await reloadReady();
      result.historicalReload = await evaluate(sessionId, "w07.afterUpdate()");
      assert.deepEqual(result.historicalReload.sources, result.after.sources, 'historical v2 module update retains source generations');
      result.compatible = await evaluate(sessionId, "w07.seedCompatible()");
      await reloadReady();
      result.reload = await evaluate(sessionId, "w07.afterUpdate()");
      assert.deepEqual(result.reload.sources, result.after.sources, 'reload retains source generations');
    }
    assert.equal(instrumentation.size, 11, "every required instrumentation anchor was applied");
    console.log(JSON.stringify(result));
    await writeFile(outputPath(`${evidenceDirectory}/${process.argv.includes('--before') ? 'before-update' : process.argv.includes('--uncontrolled-page') ? 'after-uncontrolled-page' : legacy ? 'after-legacy-registration' : 'after-update'}.json`), JSON.stringify({ result, calls, metrics, instrumentation: [...instrumentation] }, null, 2) + "\n");
    await call("Target.disposeBrowserContext", { browserContextId });
} catch (error) {
    if (evidenceSession) {
        const body = await evaluate(evidenceSession, 'document.body.innerText').catch(e => String(e));
        await writeFile(outputPath(`${evidenceDirectory}/failure.json`), JSON.stringify({ error: String(error), body, calls, metrics, instrumentation: [...instrumentation] }, null, 2));
        const screenshot = await call('Page.captureScreenshot', {}, evidenceSession).catch(() => undefined);
        if (screenshot?.data) await writeFile(outputPath(`${evidenceDirectory}/failure.png`), Buffer.from(screenshot.data, 'base64'));
    }
    throw error;
}
finally {
    socket?.close();
    child?.kill();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 });
    assert.equal(existsSync(profile), false, "own temporary browser profile removed");
    await writeFile(outputPath(`${evidenceDirectory}/browser-cleanup-${process.argv.includes("--uncontrolled-page") ? "uncontrolled" : process.argv.includes("--legacy-registration") ? "legacy" : "canonical"}.json`), JSON.stringify({ profile, removed: true }) + "\n");
}
