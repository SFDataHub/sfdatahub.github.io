import { artifactPath } from '../../../codex/workspace.mjs';
import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const output=artifactPath('tools/guilds/fixtures/dataHubFinalRegression/'+(process.argv.length>2?'browser-guards-retry-results.json':'browser-guards-results.json'));
const files=['guilds/localDataCoordination.browser.test.mts','toplists/localToplistRevision.browser.test.mts','guilds/pageContexts.browser.test.mts','guilds/hubFavorites.browser.test.mts','guilds/dataHubRoutes.browser.test.mts','guilds/localPlayerAnalyticsCoordinator.browser.test.mts','guilds/hubSearch.browser.test.mts','guilds/localPlayerCurrentProfile.browser.test.mts','guilds/localPlayerAnalyticsExecution.browser.test.mts','scanArchive/dataHubScanInventory.browser.test.mts'];
const results=[];
for(const file of files.filter(f=>process.argv.length<=2||process.argv.slice(2).includes(f))){const start=performance.now();const result=spawnSync(process.execPath,['--import','tsx',`tools/${file}`],{encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});const passed=result.status===0;const groups=(result.stdout.match(/^PASS /gm)??[]).length;results.push({file,passed,exitCode:result.status,signal:result.signal,elapsedMs:performance.now()-start,passLines:groups,stdout:result.stdout,stderr:result.stderr});writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log(`${passed?'PASS':'FAIL'} ${file} ${groups} PASS lines`);if(!passed)console.log(result.stdout,result.stderr);}
process.exitCode=results.every(r=>r.passed)?0:1;
