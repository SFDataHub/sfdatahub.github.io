// Loaded only by the historical starter. Historical script bytes stay unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { repoRoot, originalRepoRoot, workDir, nativePath, outputPath, historicalPath } from './workspace.mjs';

let mapping = false;
const exists = fs.existsSync;
function mapped(value, writing, required = true) {
  if (value instanceof URL) value = fileURLToPath(value);
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value;
  const absolute = path.resolve(process.cwd(), nativePath(value));
  for (const base of [repoRoot, originalRepoRoot, workDir]) {
    const relative = path.relative(path.join(base, 'tmp'), absolute);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    const output = path.join(workDir, 'test-runs', 'historical', relative);
    return writing ? outputPath(output) : exists(output) ? output : required ? historicalPath(path.join('tmp', relative)) : path.join(workDir, 'tmp', relative);
  }
  return writing ? outputPath(absolute) : absolute;
}
function wrap(object, name, positions) {
  const original = object[name];
  if (typeof original !== 'function') return;
  object[name] = function (...args) {
    if (mapping) return original.apply(this, args);
    mapping = true;
    try {
      for (const [position, writing] of positions) args[position] = mapped(args[position], writing, !/^(exists|stat|lstat|access)/.test(name));
      return original.apply(this, args);
    } finally { mapping = false; }
  };
}
for (const object of [fs, fs.promises]) {
  for (const name of ['readFile', 'readFileSync', 'readdir', 'readdirSync', 'stat', 'statSync', 'lstat', 'lstatSync', 'access', 'accessSync', 'existsSync', 'createReadStream']) wrap(object, name, [[0, false]]);
  for (const name of ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'createWriteStream', 'truncate', 'truncateSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'utimes', 'utimesSync', 'lutimes', 'lutimesSync']) wrap(object, name, [[0, true]]);
  for (const name of ['symlink', 'symlinkSync']) wrap(object, name, [[1, true]]);
  for (const name of ['copyFile', 'copyFileSync', 'cp', 'cpSync']) wrap(object, name, [[0, false], [1, true]]);
  for (const name of ['rename', 'renameSync']) wrap(object, name, [[0, true], [1, true]]);
  for (const name of ['open', 'openSync']) {
    const original = object[name];
    if (!original) continue;
    object[name] = function (file, flags, ...args) {
      if (mapping) return original.call(this, file, flags, ...args);
      mapping = true;
      try {
        const writing = typeof flags === 'number' ? Boolean(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) : /[wa+]/.test(flags);
        return original.call(this, mapped(file, writing), flags, ...args);
      } finally { mapping = false; }
    };
  }
  for (const name of ['link', 'linkSync']) if (object[name]) object[name] = () => { throw Error('Historical test copies must use independent file copies; hard links are reserved for the verified migration.'); };
}
syncBuiltinESMExports();
