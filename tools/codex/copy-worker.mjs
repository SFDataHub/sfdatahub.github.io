// Independent editable copies: always copy file bytes, never hard-link source files.
import fs from 'node:fs';
import path from 'node:path';
import { nativePath, outputPath } from './workspace.mjs';
const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) throw Error('Source and destination are required');
const source = path.resolve(nativePath(sourceArgument));
const destination = outputPath(destinationArgument);
const fsp = fs.promises;
const excluded = new Set(['.git', 'node_modules', 'dist', '.history']);
const files = [], directories = [];
function visit(from, to) {
  directories.push(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (excluded.has(entry.name) || (from === source && ['tmp', '.agents', '.codex', '.aws'].includes(entry.name))) continue;
    const input = path.join(from, entry.name), output = path.join(to, entry.name);
    if (entry.isSymbolicLink()) throw Error(`Editable source copies must not share linked source files: ${input}`);
    if (entry.isDirectory()) visit(input, output);
    else files.push([input, output]);
  }
}
visit(source, destination);
let directoryIndex = 0;
await Promise.all(Array.from({ length: 24 }, async () => {
  while (directoryIndex < directories.length) await fsp.mkdir(directories[directoryIndex++], { recursive: true });
}));
let next = 0;
await Promise.all(Array.from({ length: 24 }, async () => {
  while (next < files.length) {
    const [input, output] = files[next++];
    await fsp.copyFile(input, output, fs.constants.COPYFILE_EXCL);
  }
}));
const dependencies = path.join(source, 'node_modules'), target = path.join(destination, 'node_modules');
await fsp.mkdir(target, { recursive: true });
const links = [];
for (const entry of fs.readdirSync(dependencies, { withFileTypes: true })) {
  if (entry.name.startsWith('.') && entry.name !== '.bin') continue;
  const from = path.join(dependencies, entry.name), to = path.join(target, entry.name);
  if (entry.name.startsWith('@') && fs.statSync(from).isDirectory()) {
    await fsp.mkdir(to, { recursive: true });
    for (const name of fs.readdirSync(from)) links.push([path.join(from, name), path.join(to, name), true]);
  } else links.push([from, to, fs.statSync(from).isDirectory()]);
}
next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < links.length) {
    const [from, to, directory] = links[next++];
    await fsp.symlink(from, to, process.platform === 'win32' && directory ? 'junction' : directory ? 'dir' : 'file');
  }
}));
