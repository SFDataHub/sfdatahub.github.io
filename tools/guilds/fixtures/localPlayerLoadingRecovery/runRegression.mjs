import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2] ?? 'node';
const groups = {
  node: ['tools/guilds/localPlayerAnalyticsExecution.test.mts', 'tools/guilds/localPlayerAnalyticsCoordinator.test.mts', 'tools/guilds/localSourceValidity.test.mts', 'tools/guilds/localPlayerLoadingRecovery.test.mts', 'tools/guilds/localDataCoordination.test.mts', 'tools/toplists/localToplistService.test.mts'],
  browser: ['tools/guilds/localPlayerAnalyticsCoordinator.browser.test.mts', 'tools/guilds/localPlayerCurrentProfile.browser.test.mts', 'tools/guilds/localDataCoordination.browser.test.mts'],
  toplists: ['tools/toplists/localToplistStart.browser.test.mts', 'tools/toplists/localToplistStart.browser.test.mts --stale', 'tools/toplists/localToplistProgress.browser.test.mts'],
};
if (!(mode in groups)) throw Error('Unknown regression group');
const results = [];
for (const file of groups[mode]) {
  const args = ['--import', 'tsx', ...(mode === 'node' ? ['--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs'] : []), ...file.split(' ')];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
  const command = 'node.exe ' + args.join(' ');
  results.push({ command, exitCode: r.status, stdout: r.stdout, stderr: r.stderr, error: String(r.error ?? '') });
  console.log(r.status === 0 ? 'PASS' : 'FAIL', command); if (r.status !== 0) console.log(r.stdout, r.stderr, r.error ?? '');
  writeFileSync(artifactPath(`tmp/w19/${mode}-regressions.json`), JSON.stringify(results, null, 2) + '\n');
}
process.exitCode = results.every(r => r.exitCode === 0) ? 0 : 1;
