import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const runs=[];
for(let attempt=1;attempt<=8;attempt++){
 const args=['--import','tsx','tools/guilds/fixtures/profileBrowserGuards/legacyRouter.browser.test.mts'];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
 const result=JSON.parse(readFileSync(artifactPath('tools/guilds/fixtures/profileBrowserGuards/legacy-attribution-results.json'),'utf8'));
 runs.push({attempt,command:'node.exe '+args.join(' '),exitCode:r.status,result,stdout:r.stdout,stderr:r.stderr});
 console.log('legacy attempt',attempt,'exit',r.status,'prepared',JSON.stringify(result.measurements.preparedDashboard));
 if(r.status!==0)break;
}
writeFileSync(artifactPath('tools/guilds/fixtures/profileBrowserGuards/legacy-attribution-runs.json'),JSON.stringify(runs,null,2)+'\n');
