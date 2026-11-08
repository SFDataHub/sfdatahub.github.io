import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { outputPath, artifactPath } from '../../../codex/workspace.mjs';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,existsSync,rmSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
const phase=process.argv[2];
const args=process.argv.slice(3);
const original=new Map();
function capture(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='profileBrowserGuards')capture(f);}else if(/\.(json|png)$/.test(f))original.set(f,readFileSync(f));}}
for(const dir of ['tools/guilds/fixtures','tools/toplists/fixtures','tools/scanArchive/fixtures'])capture(dir);
const results=[];const outputs={};
try{const started=performance.now();const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:1800000,maxBuffer:32*1024*1024});
results.push({command:'node.exe '+args.join(' '),exitCode:r.status,signal:r.signal,elapsedMs:performance.now()-started,stdout:r.stdout,stderr:r.stderr});
console.log(r.stdout,r.stderr);
for(const [f,bytes]of original){if(existsSync(f)&&!readFileSync(f).equals(bytes))outputs[f]=readFileSync(f).toString('base64');}
writeFileSync(artifactPath(`tools/guilds/fixtures/profileBrowserGuards/${phase}.json`),JSON.stringify({results,outputs},null,2)+'\n');process.exitCode=r.status??1;
}finally{}
