import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath } from '../../../codex/workspace.mjs';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
const results = [];
const info = 'tsconfig.tsbuildinfo';
const original = await readFile(info).catch(()=>undefined);
try {
  for (const args of [
    ['node_modules/typescript/bin/tsc','-b','--pretty','false'],
    ['node_modules/typescript/bin/tsc','-p','tools/toplists/fixtures/localToplistProgress/tsconfig.json','--pretty','false'],
    ['node_modules/typescript/bin/tsc','-p','tools/toplists/fixtures/localToplistStart/tsconfig.json','--pretty','false'],
    ['--check','tools/toplists/fixtures/localToplistProgress/runChecks.mjs'],
  ]) {
    const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    results.push({command:`node.exe ${args.join(' ')}`,exitCode:r.status,stdout:r.stdout,stderr:r.stderr});
    console.log(r.status===0?'PASS':'FAIL',args.join(' '));
    if (r.status!==0) console.log(r.stdout,r.stderr,r.error??'');
  }
} finally {
  if (original) await writeFile(outputPath(info),original); else await rm(info,{force:true});
}
await writeFile(artifactPath('tmp/w18/technical-results.json'),JSON.stringify(results,null,2)+'\n');
process.exitCode=results.every(r=>r.exitCode===0)?0:1;
