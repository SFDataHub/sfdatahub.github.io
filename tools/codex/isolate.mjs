import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoRoot, originalRepoRoot, workDir, temporaryPrefix } from './workspace.mjs';

// Preserve the current checkout, including uncommitted and untracked source files.
// Package junctions share dependencies; mutable optimizer/typecheck caches stay private.
export function createRepoCopy(prefix = 'current-') {
  const directory = fs.mkdtempSync(temporaryPrefix(prefix, 'repo-copies'));
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'copy-worker.mjs');
  const result = spawnSync(process.execPath, [worker, repoRoot, directory], {
    env: { ...process.env, UV_THREADPOOL_SIZE: '64' }, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Independent test copy failed: ${directory}`);
  fs.writeFileSync(path.join(directory, '.sfdatahub-codex-copy.json'), JSON.stringify({ originalRepo: originalRepoRoot, workDir }));
  return directory;
}
export function ensureIsolatedRun(entry) {
  if (path.resolve(repoRoot) !== path.resolve(originalRepoRoot)) {
    process.chdir(repoRoot);
    return;
  }
  const directory = createRepoCopy('starter-');
  const script = path.relative(repoRoot, fileURLToPath(entry));
  const result = spawnSync(process.execPath, [...process.execArgv, path.join(directory, script), ...process.argv.slice(2)], {
    cwd: directory, stdio: 'inherit', env: { ...process.env, SFDATAHUB_CODEX_WORK_DIR: workDir },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
