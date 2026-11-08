import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { spawnSync } from 'node:child_process';
const files = [
  'guilds/localPlayerCurrentSeed.test.mts',
  'tests/dashboardPlayerCards.test.mts', 'tests/localPlayerInsightsModel.test.mts',
  'tests/localPlayerAnalyticsModel.test.ts', 'tests/playerCardDevelopmentModel.test.mts',
  'toplists/localToplistCompareModel.test.mts', 'toplists/localToplistComparison.test.mts',
  'toplists/localToplistCrossSearchBinding.test.mts', 'toplists/localToplistDerivation.test.mts',
  'toplists/localToplistExport.test.mts', 'toplists/localToplistPageModel.test.mts',
  'toplists/localToplistSearchFlow.test.mts', 'toplists/localToplistStateRace.test.mts',
  'toplists/localToplistView.test.mts', 'toplists/localToplistViewWorkerClient.test.mts',
  'toplists/toplistContractsArchitecture.test.mts', 'toplists/playerToplistDecor.test.mts',
];
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs', `tools/${file}`], { encoding: 'utf8', timeout: 120000 });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
  if (result.status !== 0) { failures++; console.log(result.stdout, result.stderr, result.error ?? ''); }
}
console.log(`${files.length - failures}/${files.length} passed`);
process.exitCode = failures ? 1 : 0;
