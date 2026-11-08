import { outputPath, artifactPath, temporaryPrefix } from '../codex/workspace.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const evidence = outputPath(artifactPath('tmp/w30'));
await mkdir(outputPath(evidence), { recursive: true });
const profile = await mkdtemp(temporaryPrefix('sfdatahub-w30-lookup-', 'browser-profiles'));
const server = await createServer({configLoader:"runner",  configFile: false, root: process.cwd(), cacheDir: path.join(profile, 'vite'),
  plugins: [{ name: 'bounded-coa', resolveId: source => source.startsWith('https://sf-libs') ? '\0coa' : undefined,
    load: id => id === '\0coa' ? 'export class CoaRenderer {}' : undefined }],
  server: { host: '127.0.0.1', port: 0, watch: null } });
let browser: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined, id = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: unknown) => void }>();
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 25));
async function call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
  const n = ++id, promise = new Promise((resolve, reject) => pending.set(n, { resolve, reject }));
  socket!.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); return promise;
}
try {
  await server.listen(); const address = server.httpServer!.address(); assert(address && typeof address !== 'string');
  browser = spawn(process.env.W08_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { stdio: 'ignore' });
  let endpoint = ''; for (let i = 0; i < 2000; i++) { try { endpoint = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8'); break; } catch { await pause(); } }
  assert(endpoint); const [port, suffix] = endpoint.trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${suffix}`);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = () => reject(Error('CDP connection')); });
  socket.onmessage = event => { const message = JSON.parse(String(event.data)), p = pending.get(message.id); if (!p) return;
    pending.delete(message.id); if (message.error) p.reject(Error(JSON.stringify(message.error))); else p.resolve(message.result); };
  const repetitions: any[] = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
  const { browserContextId } = await call('Target.createBrowserContext');
  const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId);
  await call('Page.navigate', { url: `http://127.0.0.1:${address.port}/tools/scanArchive/fixtures/localScanArchiveLookup/proof.html` }, sessionId);
  let result: any;
  for (let i = 0; i < 2000; i++) {
    const response = await call('Runtime.evaluate', { expression: 'globalThis.lookupChecks', awaitPromise: true, returnByValue: true }, sessionId);
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    result = response.result.value; if (result) break; await pause();
  }
  await writeFile(outputPath(`${evidence}/native-lookup-${repeat}.json`), JSON.stringify({ ...result, browser: await call('Browser.getVersion') }, null, 2) + '\n');
  assert(result, 'native browser proof loaded'); assert.equal(result.error, undefined, result.error);
  assert.equal(result.result.passed, true); assert.equal(result.result.nativeIndexedDB, true);
  console.log(`PASS ${result.result.cases.length} native IndexedDB lookup cases, normal import/deletion/acquisition, concurrent deletion`);
  repetitions.push(result.result);
  await call('Target.disposeBrowserContext', { browserContextId });
  }
  await writeFile(outputPath(`${evidence}/native-lookup.json`), JSON.stringify({ repetitions, browser: await call('Browser.getVersion') }, null, 2) + '\n');
} finally {
  socket?.close(); browser?.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  await writeFile(outputPath(`${evidence}/native-lookup-cleanup.json`), JSON.stringify({ profileRemoved: true, serverClosed: true }) + '\n');
}
