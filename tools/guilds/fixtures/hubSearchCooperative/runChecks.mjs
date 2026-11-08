import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, temporaryPrefix, artifactPath } from '../../../codex/workspace.mjs';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
const result=[];
const info='tsconfig.tsbuildinfo';
const previousInfo=await readFile(info).catch(()=>null);
try {
  for(const args of [
    ['node_modules/typescript/bin/tsc','-b','--pretty','false'],
    ['node_modules/typescript/bin/tsc','-p','tools/guilds/fixtures/dataHubFinalRegression/tsconfig.json','--pretty','false'],
    ['--check','tools/guilds/fixtures/dataHubFinalRegression/runRegression.mjs'],
    ['--check','tools/guilds/fixtures/dataHubFinalRegression/runNeighbors.mjs'],
    ['--check','tools/guilds/fixtures/dataHubFinalRegression/runBrowserGuards.mjs'],
    ['node_modules/typescript/bin/tsc','-p','tools/guilds/fixtures/hubSearchCooperative/tsconfig.json','--pretty','false'],
    ['node_modules/typescript/bin/tsc','-p','tools/guilds/fixtures/profileBrowserGuards/tsconfig.json','--pretty','false'],
    ['--check','tools/guilds/fixtures/hubSearchCooperative/run.mjs'],
    ['--check','tools/guilds/fixtures/hubSearchCooperative/runChecks.mjs'],
  ]) {
    const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    result.push({command:`node.exe ${args.join(' ')}`,exitCode:r.status,stdout:r.stdout,stderr:r.stderr});
    console.log(r.status===0?'PASS':'FAIL',args.join(' '));if(r.status!==0)console.log(r.stdout,r.stderr);
  }
} finally {if(previousInfo)await writeFile(outputPath(info),previousInfo);else await rm(info,{force:true});}
const directory=await mkdtemp(temporaryPrefix('sfdatahub-w16-production-', 'test-runs'));
const outDir=path.join(directory,'dist');
const start=performance.now();
async function inventory(dir){let files=0,bytes=0;for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){const value=await inventory(file);files+=value.files;bytes+=value.bytes;}else{files++;bytes+=(await stat(file)).size;}}return {files,bytes};}
let buildResult={command:'Vite build({configLoader:"runner", mode:production,cacheDir:<Windows TEMP>/vite-cache,build:{outDir:<Windows TEMP>/dist,emptyOutDir:true}})',config:'vite.config.ts',publicDir:'public',outDir,exitCode:1,elapsedMs:0,removed:false};
try {await build({configLoader:"runner", mode:'production',cacheDir:path.join(directory,'vite-cache'),build:{outDir,emptyOutDir:true}});buildResult={...buildResult,...await inventory(outDir),exitCode:0,elapsedMs:performance.now()-start};}
catch(error){buildResult.error=String(error);}
finally {await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});buildResult.removed=true;}
result.push(buildResult);
await writeFile(artifactPath('tools/guilds/fixtures/hubSearchCooperative/technical-results.json'),JSON.stringify(result,null,2)+'\n');
process.exitCode=result.every(r=>r.exitCode===0)?0:1;
