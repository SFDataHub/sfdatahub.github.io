import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath, temporaryPrefix } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const output = artifactPath('tmp/w19');
const infos = readdirSync('.').filter(p => p.endsWith('.tsbuildinfo')).map(p => [p, readFileSync(p)]);
const results = [];
const build = process.argv.includes('--build');
let directory;
try {
  const commands = build ? [] : [
    ['node_modules/typescript/bin/tsc', '-b', '--pretty', 'false'],
    ['node_modules/typescript/bin/tsc', '-p', 'tools/guilds/fixtures/localPlayerLoadingRecovery/tsconfig.json', '--pretty', 'false'],
    ['node_modules/typescript/bin/tsc', '-p', 'tools/guilds/fixtures/profileBrowserGuards/tsconfig.json', '--pretty', 'false'],
  ];
  for (const args of commands) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    results.push({ command: 'node.exe ' + args.join(' '), exitCode: r.status, stdout: r.stdout, stderr: r.stderr });
    console.log(r.status === 0 ? 'PASS' : 'FAIL', args.join(' ')); if (r.status !== 0) console.log(r.stdout, r.stderr);
  }
  if (build) {
    directory = mkdtempSync(temporaryPrefix('sfdatahub-w19-build-', 'test-runs'));
    const command = `npm.cmd run build -- --outDir "${directory}"`;
    const r = spawnSync(command, { shell: true, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024 });
    results.push({ command, exitCode: r.status, stdout: r.stdout, stderr: r.stderr });
    console.log(r.status === 0 ? 'PASS original production build' : 'FAIL original production build', r.stdout, r.stderr);
    if (r.status === 0) {
      const assets = path.join(directory, 'assets');
      const workerName = readdirSync(assets).find(p => /^playerAnalytics\.worker-.+\.js$/.test(p));
      if (!workerName) throw Error('No content-hashed analytics production worker');
      const code = readFileSync(path.join(assets, workerName), 'utf8');
      const clients = readdirSync(assets).filter(p => p.endsWith('.js') && p !== workerName).flatMap(p => {
        const content = readFileSync(path.join(assets, p), 'utf8');
        const at = content.indexOf(workerName);
        const binding = content.match(/version:([\w$]+),requestId:.{0,140}/);
        return at < 0 ? [] : [{ asset: p, reference: content.slice(Math.max(0, at - 100), at + workerName.length + 100), transportBinding: binding?.[0], versionExpression: binding?.[1], versionVerified: verifyVersion(content, binding?.[1]), devQuery: content.includes('analytics-contract=') }];
      });
      if (!clients.length || clients.some(c => c.devQuery) || !code.includes('"ready"') || !code.includes('"started"')) throw Error('Invalid production worker references/contract');
      const marker = code.lastIndexOf('type:"ready"');
      const workerEntry = code.slice(Math.max(0, marker - 30), marker + 1600);
      const versionExpression = workerEntry.match(/type:"ready",version:([\w$]+)/)?.[1];
      const workerVersionVerified = verifyVersion(code, versionExpression);
      writeFileSync(outputPath(output + '/production-worker.json'), JSON.stringify({ workerName, sha256: createHash('sha256').update(code).digest('hex'), clients, workerEntry, versionExpression, workerVersionVerified, readyAt: marker, startedAt: code.indexOf('"started"'), removedOutput: directory }, null, 2) + '\n');
      if (!workerVersionVerified || clients.some(c => !c.versionVerified)) throw Error('Client and worker production contract not verified');
    }
  }
} finally {
  for (const p of readdirSync('.').filter(p => p.endsWith('.tsbuildinfo'))) if (!infos.some(([name]) => name === p)) rmSync(p);
  for (const [name, bytes] of infos) writeFileSync(outputPath(name), bytes);
  if (directory) rmSync(directory, { recursive: true, force: true });
  writeFileSync(outputPath(output + (build ? '/build-results.json' : '/type-results.json')), JSON.stringify(results, null, 2) + '\n');
}
process.exitCode = results.every(r => r.exitCode === 0) ? 0 : 1;
function verifyVersion(code, expression) {
  if (expression === '2') return true;
  if (!expression) return false;
  const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\w$])${escaped}=2(?=[,;])`).test(code);
}
