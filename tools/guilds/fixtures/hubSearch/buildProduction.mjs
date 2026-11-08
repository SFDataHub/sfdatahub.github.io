import { ensureIsolatedRun } from '../../../codex/isolate.mjs';
ensureIsolatedRun(import.meta.url);
import { temporaryPrefix, artifactPath } from '../../../codex/workspace.mjs';
import { build } from 'vite';
import { mkdtemp, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const outDir=await mkdtemp(temporaryPrefix('sfdatahub-w13-production-', 'test-runs'));
const started=performance.now();
await build({configLoader:"runner", mode:'production',build:{outDir,emptyOutDir:true}});
async function inventory(dir){let files=0,bytes=0;for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){const value=await inventory(file);files+=value.files;bytes+=value.bytes;}else{files++;bytes+=(await stat(file)).size;}}return {files,bytes};}
const result={outDir,elapsedMs:performance.now()-started,...await inventory(outDir),mode:'production',config:'vite.config.ts',publicDir:'public',deploy:false};
await writeFile(artifactPath('tools/guilds/fixtures/hubSearch/build-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
