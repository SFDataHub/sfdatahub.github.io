import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const files = [
 'guilds/dataHubRoutes.test.mts', 'guilds/localProfileEntry.test.mts',
 'guilds/pageContextStore.test.mts', 'guilds/hubFavoritesStore.test.mts',
 'guilds/localPlayerCurrentSeed.test.mts', 'guilds/localPlayerAnalyticsCoordinator.test.mts',
 'guilds/localPlayerAnalyticsExecution.test.mts', 'guilds/localSourceValidity.test.mts',
 'guilds/localDataCoordination.test.mts', 'guilds/localGuildAnalyticsScopedRead.test.mts',
 'tests/dashboardPlayerCards.test.mts', 'tests/localPlayerInsightsModel.test.mts',
 'tests/localPlayerAnalyticsModel.test.ts', 'tests/playerCardDevelopmentModel.test.mts',
 'toplists/localToplistCompareModel.test.mts', 'toplists/localToplistComparison.test.mts',
 'toplists/localToplistCrossSearchBinding.test.mts', 'toplists/localToplistDerivation.test.mts',
 'toplists/localToplistExport.test.mts', 'toplists/localToplistPageModel.test.mts',
 'toplists/localToplistSearchFlow.test.mts', 'toplists/localToplistStateRace.test.mts',
 'toplists/localToplistView.test.mts', 'toplists/localToplistViewWorkerClient.test.mts',
 'toplists/toplistContractsArchitecture.test.mts', 'toplists/playerToplistDecor.test.mts',
 'toplists/localToplistRevisionSession.test.mts',
];
const results=[];
for(const file of files){
 const result=spawnSync(process.execPath,['--import','tsx','--import','./tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs',`tools/${file}`],{encoding:'utf8',timeout:120000});
 const passed=result.status===0;results.push({file,passed});console.log(`${passed?'PASS':'FAIL'} ${file}`);
 if(!passed)console.log(result.stdout,result.stderr,result.error??'');
}
writeFileSync(artifactPath('tools/guilds/fixtures/dataHubRoutes/regression-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`${results.filter(r=>r.passed).length}/${files.length} passed`);process.exitCode=results.every(r=>r.passed)?0:1;
