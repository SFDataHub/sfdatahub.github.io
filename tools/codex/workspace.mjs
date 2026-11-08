import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync, mkdirSync, readFileSync, lstatSync } from 'node:fs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function nativePath(value) {
  if (process.platform === 'win32') return value.replace(/^\/mnt\/([a-z])\//i, (_, drive) => `${drive.toUpperCase()}:\\`).replaceAll('/', '\\');
  return value.replace(/^([a-z]):[\\/]/i, (_, drive) => `/mnt/${drive.toLowerCase()}/`).replaceAll('\\', '/');
}
function canonical(value) {
  let current = path.resolve(value), suffix = [];
  while (!lstatSync(current, { throwIfNoEntry: false })) {
    const parent = path.dirname(current);
    if (parent === current) break;
    suffix.unshift(path.basename(current)); current = parent;
  }
  if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink() && !existsSync(current)) throw Error(`Cannot use a dangling link as a Codex path: ${current}`);
  return path.join(existsSync(current) ? realpathSync.native(current) : current, ...suffix);
}
function within(value, root) {
  // DrvFs can accept case aliases even when Node itself runs on Linux.
  const comparable = value => process.platform === 'win32' || /^\/mnt\/[a-z](?:\/|$)/i.test(value) ? value.toLowerCase() : value;
  const relative = path.relative(comparable(root), comparable(value));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function inheritedWorkspace() {
  for (let current = repoRoot; ; current = path.dirname(current)) {
    const marker = path.join(current, '.sfdatahub-codex-workspace.json');
    if (existsSync(marker)) {
      const data = JSON.parse(readFileSync(marker, 'utf8'));
      if (data.repo !== 'sfdatahub.github.io') throw Error(`Unexpected Codex workspace marker: ${marker}`);
      return { directory: current, original: nativePath(data.originalRepo) };
    }
    if (path.dirname(current) === current) return undefined;
  }
}
const copyMarker = path.join(repoRoot, '.sfdatahub-codex-copy.json');
const copy = existsSync(copyMarker) ? JSON.parse(readFileSync(copyMarker, 'utf8')) : undefined;
const inherited = copy ? { directory: nativePath(copy.workDir), original: nativePath(copy.originalRepo) } : inheritedWorkspace();
export const originalRepoRoot = canonical(inherited?.original ?? repoRoot);
const override = process.env.SFDATAHUB_CODEX_WORK_DIR;
if (override && !path.isAbsolute(nativePath(override))) throw Error('SFDATAHUB_CODEX_WORK_DIR must be an absolute repo-specific workspace path');
export const workDir = canonical(override ? nativePath(override) : inherited?.directory ?? path.resolve(repoRoot, '../codex/sfdatahub.github.io'));
if (within(workDir, canonical(repoRoot)) || within(workDir, originalRepoRoot)) throw Error('Codex workspace must be outside the product repository');
if (workDir === canonical(path.resolve(originalRepoRoot, '../codex'))) throw Error('SFDATAHUB_CODEX_WORK_DIR must name the repo-specific workspace, not the shared codex parent');
// Children and isolated copies inherit the resolved workspace without manual setup.
process.env.SFDATAHUB_CODEX_WORK_DIR = workDir;

export function outputPath(value) {
  if (!value) throw Error('An explicit output path is required');
  const result = canonical(path.resolve(repoRoot, nativePath(value)));
  if (within(result, originalRepoRoot)) throw Error(`Codex output must be outside the product repository: ${result}`);
  if (!existsSync(path.dirname(result))) mkdirSync(path.dirname(result), { recursive: true });
  return result;
}
export function artifactPath(relative) {
  const cleaned = relative.replaceAll('\\', '/').replace(/^tmp\//, '').replace(/^tools\//, '');
  const result = canonical(path.resolve(workDir, 'test-runs', cleaned));
  if (!within(result, canonical(path.join(workDir, 'test-runs'))) || !within(result, workDir)) throw Error(`Invalid artifact path: ${relative}`);
  return outputPath(result);
}
export function temporaryPrefix(prefix, category = 'test-runs') {
  if (!['test-runs', 'repo-copies', 'browser-profiles'].includes(category) || /[\\/]/.test(prefix)) throw Error(`Invalid temporary location: ${category}/${prefix}`);
  const directory = canonical(path.join(workDir, category, 'scratch', '.entry'));
  if (!within(directory, canonical(path.join(workDir, category))) || !within(directory, workDir)) throw Error(`Invalid temporary location: ${category}/${prefix}`);
  return path.join(path.dirname(outputPath(directory)), prefix);
}
export function historicalPath(relative) {
  const result = canonical(path.resolve(workDir, nativePath(relative)));
  if (!within(result, workDir) || !existsSync(result)) throw Error(`Required historical Codex input is missing: ${result}. Restore this historical input; current product code is not a substitute.`);
  return result;
}
export function regressionFixture(relative) {
  const result = path.resolve(repoRoot, 'tools', nativePath(relative));
  if (!within(result, path.join(repoRoot, 'tools')) || !existsSync(result)) throw Error(`Required regression fixture is missing: ${result}`);
  return result;
}

export function siblingInput(relative) {
  const result = path.resolve(originalRepoRoot, '..', nativePath(relative));
  if (!existsSync(result)) throw Error(`Required adjacent repository input is missing: ${result}`);
  return result;
}

// Child loaders, OCR helpers and browsers inherit external operating-system temp
// paths as well as the repo-specific workspace. Set these before starting them.
const runtimeTemp = path.dirname(artifactPath('runtime-temp/.entry'));
const npmCache = path.dirname(artifactPath('runtime-npm-cache/.entry'));
Object.assign(process.env, { TEMP: runtimeTemp, TMP: runtimeTemp, TMPDIR: runtimeTemp, npm_config_cache: npmCache });

// Other local tools use this interface instead of duplicating the path contract.
if (process.argv[1] && path.resolve(nativePath(process.argv[1])) === fileURLToPath(import.meta.url)) {
  const [operation, value] = process.argv.slice(2);
  const result = operation === '--artifact' ? artifactPath(value)
    : operation === '--historical' ? historicalPath(value)
    : operation === '--output' ? outputPath(value)
    : operation === '--json' ? { repoRoot, originalRepoRoot, workDir }
    : undefined;
  if (result === undefined) throw Error('Usage: workspace.mjs --json | --artifact <relative> | --historical <relative> | --output <path>');
  console.log(JSON.stringify(result));
}
