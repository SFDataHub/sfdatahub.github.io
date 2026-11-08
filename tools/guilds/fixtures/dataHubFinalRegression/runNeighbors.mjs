import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const files=['guilds/dataHubNeighbors.test.mts','scanArchive/archiveBuilderCore.test.mts','scanArchive/scanArchiveBuilderManifest.test.mts','scanArchive/scanArchiveBuilderClient.test.mts','scanArchive/scanArchiveBuilderWorker.test.mts','scanArchive/scanArchiveBuilderUi.test.mts','scanArchive/scanArchiveBuilderMonthly.test.mts'];
const results=[];
for(const file of files){
 const result=spawnSync(process.execPath,['--import','tsx','--import','./tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs',`tools/${file}`],{encoding:'utf8',timeout:120000});
 const passed=result.status===0;results.push({file,passed,exitCode:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr});console.log(`${passed?'PASS':'FAIL'} ${file}`);
 if(!passed)console.log(result.stdout,result.stderr,result.error??'');
}
writeFileSync(artifactPath('tools/guilds/fixtures/dataHubFinalRegression/neighbor-node-results.json'),JSON.stringify(results,null,2)+'\n');
console.log(`${results.filter(r=>r.passed).length}/${files.length} passed`);process.exitCode=results.every(r=>r.passed)?0:1;
