import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath } from '../../../codex/workspace.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
const info='tsconfig.tsbuildinfo';const previous=existsSync(info)?readFileSync(info):null;
const results=[];
try{for(const args of [
 ['node_modules/typescript/bin/tsc','-b','--pretty','false'],
 ['node_modules/typescript/bin/tsc','-p','tools/guilds/fixtures/profileBrowserGuards/tsconfig.json','--pretty','false'],
 ['node_modules/typescript/bin/tsc','-p','tools/guilds/fixtures/dataHubFinalRegression/tsconfig.json','--pretty','false'],
 ['--check','tools/guilds/fixtures/profileBrowserGuards/run.mjs'],
 ['--check','tools/guilds/fixtures/profileBrowserGuards/runChecks.mjs'],
 ['--check','tools/guilds/fixtures/profileBrowserGuards/runNode.mjs'],
 ['--check','tools/guilds/fixtures/profileBrowserGuards/runLegacy.mjs'],
 ['--check','tools/guilds/fixtures/dataHubFinalRegression/runBrowserGuards.mjs'],
]){const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});results.push({command:'node.exe '+args.join(' '),exitCode:r.status,stdout:r.stdout,stderr:r.stderr});console.log(r.status===0?'PASS':'FAIL',args.join(' '));if(r.status!==0)console.log(r.stdout,r.stderr);}}
finally{if(previous)writeFileSync(outputPath(info),previous);else rmSync(info,{force:true});}
writeFileSync(artifactPath('tools/guilds/fixtures/profileBrowserGuards/technical-results.json'),JSON.stringify(results,null,2)+'\n');process.exitCode=results.every(r=>r.exitCode===0)?0:1;
