import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tools/toplists').filter(file => file.endsWith('.test.mts') && !file.includes('.browser.')).sort();
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs', `tools/toplists/${file}`], { encoding: 'utf8', timeout: 120000 });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
  if (result.status !== 0) { failed++; console.log(result.stdout, result.stderr, result.error ?? ''); }
}
console.log(`${files.length - failed}/${files.length} passed`);
process.exitCode = failed ? 1 : 0;
