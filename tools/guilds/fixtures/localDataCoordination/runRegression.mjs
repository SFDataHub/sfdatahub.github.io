import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { spawnSync } from 'node:child_process';
const files = [
  'guilds/localDataCoordination', 'guilds/localSourceValidity', 'guilds/localGuildAnalyticsStore', 'guilds/localGuildAnalyticsScope', 'guilds/localGuildAnalyticsScopedRead', 'guilds/localGuildAnalytics.identity',
  'toplists/localToplistStore', 'toplists/localToplistService', 'toplists/localToplistWorkerSearch',
  'scanArchive/archiveScanBindings', 'scanArchive/localFirstScanAcquisition', 'scanArchive/localFirstFeatureAcquisition', 'scanArchive/localFirstScanResolver', 'scanArchive/guildAnalyticsLocalFirst', 'scanArchive/guildDashboardLocalFirst', 'scanArchive/searchIndexService',
  'identities/playerIdentityStore', 'identities/guildIdentityStore', 'identities/identityResolution', 'identities/fusionIdentityManagement', 'identities/fusionIdentityWorkerClient', 'identities/fusionDashboardInventory',
];
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', './tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs', `tools/${file}.test.mts`], { encoding:'utf8', timeout:120000 });
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${file}`);
  if (result.status !== 0) {failed++; console.log(result.stdout, result.stderr, result.error ?? '');}
}
console.log(`${files.length-failed}/${files.length} passed`);
process.exitCode = failed ? 1 : 0;
