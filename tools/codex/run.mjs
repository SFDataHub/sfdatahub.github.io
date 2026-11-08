import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { workDir, artifactPath } from './workspace.mjs';
import { createRepoCopy } from './isolate.mjs';

// All commands execute against a fresh copy of the actual working tree.
// Usage: node tools/codex/run.mjs [--historical] <repo-relative script> [...args]
const historical = process.argv[2] === '--historical';
const args = process.argv.slice(historical ? 3 : 2);
if (!args.length) throw Error('Usage: node tools/codex/run.mjs [--historical] <script> [...args]');
const directory = createRepoCopy('run-');
let script = args.shift();
if (historical) {
  const { historicalPath } = await import('./workspace.mjs');
  const input = historicalPath(script);
  const relative = path.relative(path.join(workDir, 'tmp'), input);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Historical scripts must be inside workspace/tmp');
  const target = path.join(directory, 'tmp', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Preserve neighboring helper modules, without copying evidence, profiles or repo copies.
  for (const name of fs.readdirSync(path.dirname(input))) {
    const from = path.join(path.dirname(input), name);
    if (/\.(mjs|mts|js|ts|tsx)$/.test(name) && fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(path.dirname(target), name));
  }
  script = target;
}
const env = { ...process.env, SFDATAHUB_CODEX_WORK_DIR: workDir };
if (historical) env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + pathToFileURL(path.join(directory, 'tools/codex/legacy-paths.mjs')).href].filter(Boolean).join(' ');
for (const [key, value] of Object.entries(env)) {
  if (/EVIDENCE$|_OUTPUT$/.test(key) && value?.replaceAll('\\', '/').startsWith('tmp/')) env[key] = artifactPath(value);
}
// Legacy code uses TEMP, process.cwd and relative tmp paths. Its temporary root is
// inside this external copy; its child processes automatically inherit workDir.
const temp = path.join(workDir, 'test-runs', 'scratch', path.basename(directory));
fs.mkdirSync(temp, { recursive: true }); Object.assign(env, { TEMP: temp, TMP: temp, TMPDIR: temp });
const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs', ...(historical ? ['--import', './tools/codex/legacy-paths.mjs'] : []), script, ...args], {
  cwd: directory, env, stdio: 'inherit',
});
console.log(`Codex test copy: ${directory}`);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
