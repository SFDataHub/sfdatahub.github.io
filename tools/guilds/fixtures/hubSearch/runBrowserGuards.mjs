import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const files=['guilds/localDataCoordination.browser.test.mts','toplists/localToplistRevision.browser.test.mts','guilds/pageContexts.browser.test.mts','guilds/hubFavorites.browser.test.mts','guilds/dataHubRoutes.browser.test.mts','guilds/localPlayerAnalyticsCoordinator.browser.test.mts'];
const results=[];
for(const file of files){const start=performance.now();const result=spawnSync(process.execPath,['--import','tsx',`tools/${file}`],{encoding:'utf8',timeout:300000});const passed=result.status===0;results.push({file,passed,elapsedMs:performance.now()-start,stdout:result.stdout,stderr:result.stderr});console.log(`${passed?'PASS':'FAIL'} ${file}`);if(!passed)console.log(result.stdout,result.stderr);}
writeFileSync(artifactPath('tools/guilds/fixtures/hubSearch/browser-guards-results.json'),JSON.stringify(results,null,2)+'\n');process.exitCode=results.every(r=>r.passed)?0:1;
