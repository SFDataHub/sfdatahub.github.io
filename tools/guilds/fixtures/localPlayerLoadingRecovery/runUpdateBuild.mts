import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath, temporaryPrefix, historicalPath } from '../../../codex/workspace.mjs';
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { build, type Plugin } from "vite";
import { createHash } from "node:crypto";
import { framePlugin } from "../profileBrowserGuards/framePlugin.mts";
const evidence = outputPath(artifactPath("tmp/w19n02"));
const root = process.cwd();
if (process.argv.includes('--cleanup')) {
  const record = JSON.parse(readFileSync(evidence + '/production-assets.json', 'utf8'));
  for (const directory of record.temporaryDirectories) {
    const checked = outputPath(directory);
    if (!path.basename(checked).startsWith('sfdatahub-w19n02-')) throw Error('Invalid task output directory');
    rmSync(checked, { recursive: true, force: true });
  }
  writeFileSync(outputPath(evidence + '/production-output-cleanup.json'), JSON.stringify({ removed: record.temporaryDirectories }, null, 2) + '\n');
  process.exit(0);
}
const directories: string[] = [];
const buildInfo = readdirSync('.').filter(f => f.endsWith('.tsbuildinfo')).map(f => [f, readFileSync(f)] as const);
const results: unknown[] = [];
const fixture = "/tools/guilds/fixtures/localPlayerAnalyticsExecution/mocks.tsx";
const aliases: Record<string, string> = {
  "/src/components/ContentShell": "Shell as default", "/src/components/guilds/GuildContextBar": "None as default",
  "/src/components/guilds/GuildEmblem": "None as default,None as GuildEmblemArtwork,useGuildEmblemVisual", "/src/components/avatar/PortraitPreview": "Portrait as default",
  "/src/pages/GuildHub/hooks/useGuildHubSelection": "useGuildHubSelection", "/src/pages/GuildHub/dashboardLocalFirst": "acquireDashboardLocalFirstFeatureScans",
};
const plugin: Plugin = { name: "w19n02-limited-consumer-boundaries", enforce: "pre", resolveId(source, importer) {
  if (!importer || !source.startsWith('.')) return;
  const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, '/').replace(/\.(tsx?|jsx?)$/, '');
  const key = Object.keys(aliases).find(k => resolved.endsWith(k)); if (key) return '\0w19n02:' + key;
}, load(id) { if (id.startsWith('\0w19n02:')) return `export { ${aliases[id.slice(8)]} } from '${fixture}';`; },
transform(code, id) { if (id.replace(/\\/g, '/').endsWith('/src/main.tsx')) return 'import "/tools/guilds/fixtures/localPlayerLoadingRecovery/productionFixture.tsx";'; return code; } };
function inspect(directory: string) {
  const assets = path.join(directory, 'assets');
  const names = readdirSync(assets);
  const worker = names.find(n => /^playerAnalytics\.worker-.+\.js$/.test(n));
  if (!worker) throw Error('Missing actual hashed worker');
  const code = readFileSync(path.join(assets, worker), 'utf8');
  const clients = names.filter(n => n.endsWith('.js') && n !== worker).flatMap(n => {
    const content = readFileSync(path.join(assets, n), 'utf8'), at = content.indexOf(worker);
    return at < 0 ? [] : [{ name: n, reference: content.slice(Math.max(0, at - 90), at + worker.length + 90), devQuery: content.slice(Math.max(0, at - 90), at + worker.length + 90).includes('analytics-contract=') }];
  });
  if (!clients.length || clients.some(c => c.devQuery)) throw Error('Invalid original production worker reference');
  return { directory, worker, workerSHA256: createHash('sha256').update(code).digest('hex'), ready: code.includes('type:"ready"'), clients, html: readFileSync(path.join(directory, 'index.html'), 'utf8') };
}
try {
  const original = mkdtempSync(temporaryPrefix('sfdatahub-w19n02-original-', 'test-runs')); directories.push(original);
  const command = `npm.cmd run build -- --outDir "${original}"`;
  const result = spawnSync(command, { shell: true, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
  results.push({ command, exitCode: result.status, stdout: result.stdout, stderr: result.stderr });
  console.log(result.status === 0 ? 'PASS original production build' : 'FAIL original production build');
  if (result.status !== 0) throw Error(result.stdout + result.stderr);
  const originalProof = inspect(original);
  const stands: Record<string, ReturnType<typeof inspect>> = {};
  for (const stand of ['old', 'current']) {
    const workspace = mkdtempSync(temporaryPrefix('sfdatahub-w19n02-' + stand + '-', 'repo-copies')); directories.push(workspace);
    for (const folder of ['src', 'public']) cpSync(stand === 'old' ? path.join(historicalPath('tmp/w19n02/initial'), folder) : path.join(root, folder), path.join(workspace, folder), { recursive: true });
    cpSync(path.join(root, 'tools/guilds/fixtures'), path.join(workspace, 'tools/guilds/fixtures'), { recursive: true });
    for (const file of ['index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'package.json']) cpSync(stand === 'old' ? path.join(historicalPath('tmp/w19n02/initial'), file) : path.join(root, file), path.join(workspace, file));
    for (const file of readdirSync(root).filter(f => /^\.env($|\.)/.test(f))) cpSync(path.join(root, file), path.join(workspace, file));
    if (stand === 'old') for (const file of JSON.parse(readFileSync(historicalPath('tmp/w19/code-files.json'), 'utf8')).slice(0, 6)) cpSync(path.join(historicalPath('tmp/w19/initial'), file), path.join(workspace, file));
    symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'junction');
    const output = path.join(workspace, 'out'); mkdirSync(outputPath(output));
    await build({configLoader:"runner",  root: workspace, configFile: path.join(workspace, 'vite.config.ts'), mode: 'production', plugins: [framePlugin, plugin], build: { outDir: output } });
    stands[stand] = inspect(output);
    results.push({ command: `Vite build: original config/mode, isolated ${stand} source workspace, bounded consumer doubles`, exitCode: 0 });
  }
  if (stands.old.worker === stands.current.worker || !stands.current.ready || stands.old.ready) throw Error('Two actual old/new production worker states not proven');
  writeFileSync(outputPath(evidence + '/production-assets.json'), JSON.stringify({ original: originalProof, stands, temporaryDirectories: directories }, null, 2) + '\n');
  console.log('PASS two isolated production asset stands', stands.old.worker, stands.current.worker);
} catch (error) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  throw error;
} finally {
  for (const file of readdirSync('.').filter(f => f.endsWith('.tsbuildinfo'))) if (!buildInfo.some(([name]) => name === file)) rmSync(file);
  for (const [name, bytes] of buildInfo) writeFileSync(outputPath(name), bytes);
  writeFileSync(outputPath(evidence + '/production-build-results.json'), JSON.stringify(results, null, 2) + '\n');
}
