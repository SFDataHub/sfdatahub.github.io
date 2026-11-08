import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
const mode = process.argv[2] ?? 'node';
const prefix = ['--import', 'tsx'];
const groups = {
  node: ['tools/guilds/localPlayerAnalyticsExecution.test.mts', 'tools/guilds/localPlayerAnalyticsCoordinator.test.mts', 'tools/guilds/localSourceValidity.test.mts', 'tools/guilds/localPlayerLoadingRecovery.test.mts', 'tools/guilds/localPlayerWorkerUpdate.test.mts', 'tools/guilds/localDataCoordination.test.mts', 'tools/toplists/localToplistService.test.mts'].map(f => [...prefix, '--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs', f]),
  browser: ['tools/guilds/localPlayerAnalyticsExecution.browser.test.mts', 'tools/guilds/localPlayerLoadingRecovery.browser.test.mts', 'tools/guilds/localPlayerAnalyticsCoordinator.browser.test.mts', 'tools/guilds/localPlayerCurrentProfile.browser.test.mts', 'tools/guilds/localDataCoordination.browser.test.mts'].map(f => [...prefix, f]),
  toplists: [['tools/toplists/localToplistStart.browser.test.mts'], ['tools/toplists/localToplistStart.browser.test.mts', '--stale'], ['tools/toplists/localToplistProgress.browser.test.mts']].map(args => [...prefix, ...args]),
  types: [['node_modules/typescript/bin/tsc', '-b', '--pretty', 'false'], ['node_modules/typescript/bin/tsc', '-p', 'tools/guilds/fixtures/localPlayerLoadingRecovery/tsconfig.json', '--pretty', 'false'], ['node_modules/typescript/bin/tsc', '-p', 'tools/guilds/fixtures/profileBrowserGuards/tsconfig.json', '--pretty', 'false']],
};
if (!(mode in groups)) throw Error('Unknown check group');
const infos = readdirSync('.').filter(f => f.endsWith('.tsbuildinfo')).map(f => [f, readFileSync(f)]);
const results = [];
try {
  for (const args of groups[mode]) {
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    results.push({ command: 'node.exe ' + args.join(' '), exitCode: r.status, stdout: r.stdout, stderr: r.stderr, error: String(r.error ?? '') });
    console.log(r.status === 0 ? 'PASS' : 'FAIL', args.join(' '));
    if (r.status !== 0) console.log(r.stdout, r.stderr, r.error ?? '');
    writeFileSync(artifactPath(`tmp/w19n02/${mode}-results.json`), JSON.stringify(results, null, 2) + '\n');
  }
} finally {
  if (mode === 'types') {
    for (const f of readdirSync('.').filter(f => f.endsWith('.tsbuildinfo'))) if (!infos.some(([name]) => name === f)) rmSync(f);
    for (const [name, bytes] of infos) writeFileSync(outputPath(name), bytes);
  }
}
process.exitCode = results.every(r => r.exitCode === 0) ? 0 : 1;
