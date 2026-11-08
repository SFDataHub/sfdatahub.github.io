import { historicalPath, temporaryPrefix, artifactPath, regressionFixture } from '../codex/workspace.mjs';
import {readFileSync,existsSync} from "node:fs";
import { framePlugin } from "./fixtures/profileBrowserGuards/framePlugin.mts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer, transformWithEsbuild, type Plugin } from "vite";
// Actual RootLayout/RouteHost/LocalPlayerDetail, Dashboard, Playground Cards/Trend,
// shared profile content/Coordinator/Workers and browser IDB; fresh profile.
// Only presentation/selection and foreign archive acquisition are substituted.
const fixturePath = "/tools/guilds/fixtures/localPlayerAnalyticsExecution/mocks.tsx";
const aliases: Record<string, string> = {
    "/src/components/ContentShell": "Shell as default", "/src/components/guilds/GuildContextBar": "None as default",
    "/src/components/guilds/GuildEmblem": "None as default,None as GuildEmblemArtwork,useGuildEmblemVisual", "/src/components/avatar/PortraitPreview": "Portrait as default",
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
const legacySource = (await readFile(regressionFixture("guilds/fixtures/localPlayerWorkerUpdate/w19/src/workers/playerAnalytics.worker.ts"), "utf8"))
    .replace(/import \{ ANALYTICS_TRANSPORT_VERSION[^\n]+\n/, "const ANALYTICS_TRANSPORT_VERSION = 1;\n")
    .replace('"../lib/local-player-profile/executionWork"', '"/src/lib/local-player-profile/executionWork.ts"');
const legacyWorker = (await transformWithEsbuild(legacySource, "historical-worker.ts", { loader: "ts" })).code;
const plugin: Plugin = { name: "w07-production-consumers", enforce: "pre",
    resolveId(source, importer) { if (!importer || !source.startsWith("."))
        return; const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, ""); const key = Object.keys(aliases).find(k => resolved.endsWith(k)); if (key)
        return `\0w07:${key}`; },
    load(id) { if (id.startsWith("\0w07:"))
        return `export { ${aliases[id.slice(5)]} } from '${fixturePath}';`; },
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
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
        const initial = path.join(process.argv.includes('--proof-before') || process.argv.includes('--before') ? historicalPath('tmp/w19/initial') : process.cwd(), path.relative(process.cwd(), id.split('?')[0]));
        if (process.argv.includes('--proof-before') && (id.includes('local-player-profile') || id.includes('playerAnalytics.worker.ts'))) code = readFileSync(initial, 'utf8');
        const normalized = id.replace(/\\/g, "/");
        if (normalized.endsWith("/src/lib/local-player-profile/cardTrendExecution.ts"))
            code = code.replace('const own = ++generation;', 'const own = ++generation; void fetch(`/__w07metric?phase=acquisition&id=${kind}&realm=${refresh ? "refresh" : "initial"}&at=${Date.now()}`);');
        if (normalized.endsWith("/src/lib/local-player-profile/executionWork.ts"))
            code = code.replace('const started = performance.now();', 'const started = performance.now(); if (typeof window === "undefined") await fetch(`/__w07gate?kind=${work.kind}&id=${work.kind === "source" ? work.summary.sourceScanId : "projection"}`);');
        if (normalized.endsWith("/src/lib/local-player-profile/executionTransport.ts"))
            code = code.replace('}, budgetMs);', '}, (globalThis as any).w07?.noresponseBudget ?? budgetMs);');
        if (normalized.endsWith("/src/lib/guilds/localScanLibrary.ts")) {
            code = code.replace('export async function getGuildHubLocalScan(id: string) {', 'export async function getGuildHubLocalScan(id: string) { const w07Stack = new Error().stack ?? ""; void fetch(`/__w07metric?phase=raw&id=${encodeURIComponent(id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
            code = code.replace('return scan ? persistScanNormalizationIfNeeded(db, scan) : null;', 'const result = scan ? await persistScanNormalizationIfNeeded(db, scan) : null; await (globalThis as any).w07AfterRaw?.(id,w07Stack); return result;');
            code = code.replace('    const scan = await db.get(SCAN_STORE, key);', '    const scan = await db.get(SCAN_STORE, key); void fetch(`/__w07metric?phase=raw-summary&id=${encodeURIComponent(String(key))}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
            code = code.replace('    const latest = await db.get(SCAN_STORE, scan.id);', '    const latest = await db.get(SCAN_STORE, scan.id); void fetch(`/__w07metric?phase=raw-repair-reread&id=${encodeURIComponent(scan.id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`);');
        }
        if (normalized.endsWith("/src/pages/Playground/playerPerformanceModel.ts"))
            code = code.replace('export function buildAnalyticsIndexes(data: GuildAnalyticsDerivedData | null): AnalyticsIndexes {', 'export function buildAnalyticsIndexes(data: GuildAnalyticsDerivedData | null): AnalyticsIndexes { void fetch("/__w07metric?phase=index");');
        if (normalized.endsWith("/src/lib/guilds/guildSnapshotCompleteness.ts"))
            code = code.replace('export function buildGuildSnapshotCompletenessReports(data: GuildAnalyticsDerivedData | null | undefined) {', 'export function buildGuildSnapshotCompletenessReports(data: GuildAnalyticsDerivedData | null | undefined) { void fetch("/__w07metric?phase=completeness");');
        if (normalized.endsWith("/src/lib/guilds/localGuildAnalyticsStore.ts"))
            code = code.replace('  const normalizationDurations: number[] = [];', '  void fetch(`/__w07metric?phase=sourcebuild&id=${encodeURIComponent(scan.id)}&realm=${typeof window === "undefined" ? "worker" : "window"}&at=${Date.now()}`); const normalizationDurations: number[] = [];');
        if (normalized.endsWith("/src/lib/local-player-profile/useLocalProfilePart.ts"))
            code = code.replace('part => setState({ key, area, comparison, part })', 'part => { (globalThis as any).w07.uiWrites++; setState({ key, area, comparison, part }); }');
        return code;
    }
};
const chrome = process.env.W07_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = await mkdtemp(temporaryPrefix("sfdatahub-w07-", 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, cacheDir: path.join(profile, "vite-cache"),
    optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "recharts", "lucide-react", "react-i18next", "i18next"] },
    plugins: [framePlugin, plugin], worker: { plugins: () => [framePlugin, plugin], format: "es" }, root: process.cwd(), server: { host: "127.0.0.1", port: 0, watch:null } });
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
    const { targetId } = await call("Target.createTarget", { url: `${origin}/tools/guilds/fixtures/localPlayerLoadingRecovery/proof.html`, browserContextId });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Runtime.enable", {}, sessionId);
    await call("Page.bringToFront", {}, sessionId);
    for (let attempt = 0; attempt < 1000; attempt++) {
        if (await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"))
            break;
        await pause();
    }
    assert.equal(await evaluate(sessionId, "Boolean(globalThis.w07?.ready)"), true, "React fixture must load");
    // Start separately so a stalled proof cannot silence user-facing progress.
    await evaluate(sessionId, `${process.argv.some(a => a.startsWith('--proof-')) ? 'w07.proofMismatch()' : 'w07.run()'}.then(result => {w07.result=result;w07.done=true;},error => {w07.error=error.stack;w07.done=true;}); undefined`);
    for (let attempt = 0; attempt < 2000; attempt++) {
        if (await evaluate(sessionId, "Boolean(w07.done)"))
            break;
        await pause();
    }
    const error = await evaluate(sessionId, "w07.error");
    assert.equal(error, undefined, error);
    assert.equal(await evaluate(sessionId, "Boolean(w07.done)"), true);
    const result = await evaluate(sessionId, "w07.result");
    console.log(JSON.stringify(result));
    await writeFile(artifactPath(`tmp/w19/${process.argv.includes('--proof-before') ? 'before-source-proof' : process.argv.includes('--proof-after') ? 'after-source-proof' : 'recovery-browser'}.json`), JSON.stringify({ result, calls, metrics }, null, 2) + "\n");
    await call("Target.disposeBrowserContext", { browserContextId });
}
finally {
    socket?.close();
    child?.kill();
    await server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => { });
}
