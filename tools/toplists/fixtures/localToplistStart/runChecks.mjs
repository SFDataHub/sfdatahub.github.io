import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, temporaryPrefix, artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
const results = [];
const info = 'tsconfig.tsbuildinfo';
const previousInfo = await readFile(info).catch(() => null);
try {
  for (const args of [
    ['node_modules/typescript/bin/tsc', '-b', '--pretty', 'false'],
    ['node_modules/typescript/bin/tsc', '-p', 'tools/toplists/fixtures/localToplistStart/tsconfig.json', '--pretty', 'false'],
    ['--check', 'tools/toplists/fixtures/localToplistStart/runChecks.mjs'],
  ]) {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    results.push({command: `node.exe ${args.join(' ')}`, exitCode: result.status, stdout: result.stdout, stderr: result.stderr});
    console.log(result.status === 0 ? 'PASS' : 'FAIL', args.join(' '));
    if (result.status !== 0) console.log(result.stdout, result.stderr);
  }
} finally {
  if (previousInfo) await writeFile(outputPath(info), previousInfo); else await rm(info, {force:true});
}
const directory = await mkdtemp(temporaryPrefix('sfdatahub-w17-production-', 'test-runs'));
const outDir = path.join(directory, 'dist');
const production = {command:'Vite build with original vite.config.ts, production mode, external TEMP cache and output', exitCode:1, outDir, removed:false};
try {
  await build({configLoader:"runner", mode:'production',cacheDir:path.join(directory,'vite-cache'),build:{outDir,emptyOutDir:true}});
  const workers = (await readdir(path.join(outDir,'assets'))).filter(name => name.startsWith('localToplistView.worker-') && name.endsWith('.js'));
  if (workers.length !== 1) throw Error(`Expected one built View worker, got ${workers.length}`);
  const code = await readFile(path.join(outDir,'assets',workers[0]),'utf8');
  if (!code.includes('contentRevision') || !code.includes('datasetId')) throw Error('Built worker missing mandatory binding fields');
  const parents = (await readdir(path.join(outDir,'assets'))).filter(name => name.startsWith('index-') && name.endsWith('.js'));
  let main;
  for (const name of parents) {
    const candidate = await readFile(path.join(outDir,'assets',name),'utf8');
    if (candidate.includes('local_toplist_view_worker_response_binding_mismatch')) main = candidate;
  }
  if (!main || !main.includes(workers[0])) throw Error('Actual built client does not reference the validated worker');
  if (main.includes('&content-contract=1')) throw Error('Dev-only worker suffix leaked into production bundle');
  Object.assign(production,{exitCode:0,workers,mandatoryBindings:true,devSuffixAbsent:true});
} catch(error) {production.error=String(error);} finally {
  await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});production.removed=true;
}
results.push(production);
await writeFile(artifactPath('tmp/w17/technical-results.json'),JSON.stringify(results,null,2)+'\n');
process.exitCode=results.every(result=>result.exitCode===0)?0:1;
