import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { artifactPath } from '../../../codex/workspace.mjs';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const files=['guilds/localPlayerCurrentSeed.test.mts','guilds/localProfileEntry.test.mts','guilds/localPlayerAnalyticsCoordinator.test.mts','guilds/localPlayerAnalyticsExecution.test.mts','guilds/localSourceValidity.test.mts','guilds/localDataCoordination.test.mts'];
const results=[];
for(const file of files){const args=['--import','tsx','--import','./tools/guilds/fixtures/localDataCoordination/nodeLocks.mjs','tools/'+file];const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});results.push({file,command:'node.exe '+args.join(' '),exitCode:r.status,stdout:r.stdout,stderr:r.stderr});console.log(r.status===0?'PASS':'FAIL',file);if(r.status!==0)console.log(r.stdout,r.stderr);}
writeFileSync(artifactPath('tools/guilds/fixtures/profileBrowserGuards/node-results.json'),JSON.stringify(results,null,2)+'\n');process.exitCode=results.every(r=>r.exitCode===0)?0:1;
