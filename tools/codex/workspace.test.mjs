import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repoRoot, originalRepoRoot, workDir, outputPath, artifactPath, temporaryPrefix, historicalPath, regressionFixture, nativePath } from './workspace.mjs';
const before = process.cwd();
for (const key of ['TEMP', 'TMP', 'TMPDIR']) assert.equal(process.env[key], path.join(workDir, 'test-runs/runtime-temp'));
assert.equal(process.env.npm_config_cache, path.join(workDir, 'test-runs/runtime-npm-cache'));
process.chdir(path.parse(repoRoot).root);
assert.equal(artifactPath('tmp/w125/check.json'), path.join(workDir, 'test-runs/w125/check.json'));
assert.equal(regressionFixture('guilds/fixtures/localPlayerWorkerUpdate/w19/src/workers/playerAnalytics.worker.ts'), path.join(repoRoot,'tools/guilds/fixtures/localPlayerWorkerUpdate/w19/src/workers/playerAnalytics.worker.ts'));
process.chdir(before);
for(const candidate of [originalRepoRoot, path.join(originalRepoRoot,'tmp/new-output.json'), path.join(originalRepoRoot,'node_modules/.cache/new.json')]) assert.throws(()=>outputPath(candidate), /outside the product repository/);
assert.throws(()=>artifactPath('../../escape'), /Invalid artifact path/);
assert.throws(()=>historicalPath('tmp/nonexistent-w125-input'), /Required historical Codex input is missing/);
assert.throws(()=>historicalPath('../escape'), /Required historical Codex input is missing/);
assert.throws(()=>temporaryPrefix('../bad'), /Invalid temporary location/);
assert(temporaryPrefix('profile-', 'browser-profiles').startsWith(path.join(workDir,'browser-profiles')));
assert(temporaryPrefix('copy-', 'repo-copies').startsWith(path.join(workDir,'repo-copies')));
const childRoot=fs.mkdtempSync(temporaryPrefix('path-contract-'));
const historicalInput=path.join(childRoot,'input.txt');fs.writeFileSync(historicalInput,'input');
const interopInput=process.platform==='win32'
  ? historicalInput.replace(/^([a-z]):/i,(_,drive)=>`/mnt/${drive.toLowerCase()}`).replaceAll('\\','/')
  : historicalInput.replace(/^\/mnt\/([a-z])\//i,(_,drive)=>`${drive.toUpperCase()}:/`);
assert.equal(historicalPath(interopInput),historicalInput);
const helper=pathToFileURL(path.join(repoRoot,'tools/codex/workspace.mjs')).href;
function child(override){return spawnSync(process.execPath,['--input-type=module','-e',`import { workDir } from ${JSON.stringify(helper)}; console.log(workDir);`],{cwd:childRoot,env:{...process.env,SFDATAHUB_CODEX_WORK_DIR:override},encoding:'utf8'});}
const override=path.join(childRoot,'custom');
const overridden=child(override);assert.equal(overridden.status,0,overridden.stderr);assert.equal(overridden.stdout.trim(),override);
const invalid=child(path.join(originalRepoRoot,'tmp'));assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/outside the product repository/);
const relative=child('relative');assert.notEqual(relative.status,0);assert.match(relative.stderr,/must be an absolute/);
const parentWorkspace=child(path.resolve(originalRepoRoot,'../codex'));assert.notEqual(parentWorkspace.status,0);assert.match(parentWorkspace.stderr,/repo-specific workspace/);
if(process.platform==='win32')assert.equal(nativePath('/mnt/d/SFDataHub/codex/sfdatahub.github.io'),'D:\\SFDataHub\\codex\\sfdatahub.github.io');
else assert.equal(nativePath('D:\\SFDataHub\\codex\\sfdatahub.github.io'),'/mnt/d/SFDataHub/codex/sfdatahub.github.io');
// Test realpath-based rejection through a directory link, before writing anything.
const alias=path.join(childRoot,'product-alias');fs.symlinkSync(originalRepoRoot,alias,process.platform==='win32'?'junction':'dir');
assert.throws(()=>outputPath(path.join(alias,'tmp/forbidden.json')),/outside the product repository/);
fs.unlinkSync(alias);
const outsideCategory=fs.mkdtempSync(temporaryPrefix('path-contract-outside-','browser-profiles'));
fs.symlinkSync(outsideCategory,alias,process.platform==='win32'?'junction':'dir');
assert.throws(()=>artifactPath(path.relative(path.join(workDir,'test-runs'),path.join(alias,'forbidden.json'))),/Invalid artifact path/);
fs.unlinkSync(alias);fs.rmSync(outsideCategory,{recursive:true,force:true});
fs.rmSync(childRoot,{recursive:true,force:true});
console.log('PASS workspace contract: cwd independence, native paths, overrides, output confinement, symlink escape, missing historical input, and fixture resolution');
