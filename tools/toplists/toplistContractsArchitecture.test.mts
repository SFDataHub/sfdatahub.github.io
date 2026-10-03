import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = new URL("../..", import.meta.url);
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const legacyNames = [
  `Firestore${"ToplistPlayerRow"}`,
  `Firestore${"ToplistGuildRow"}`,
  `Firestore${"LatestToplistSnapshot"}`,
  `Firestore${"LatestGuildToplistSnapshot"}`,
];

const sourceRoots = ["src", "tools/toplists"];
const ignoredSegments = new Set(["assets", "dist", "node_modules"]);

const listSourceFiles = (dir: string): string[] => {
  const absolute = new URL(`../../${dir}`, import.meta.url);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredSegments.has(entry.name)) return [];
    const rel = join(dir, entry.name).replace(/\\/g, "/");
    const entryUrl = new URL(`../../${rel}`, import.meta.url);
    if (entry.isDirectory()) return listSourceFiles(rel);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx|mts)$/.test(entry.name)) return [];
    return [rel];
  });
};

const allSource = sourceRoots.flatMap(listSourceFiles);
const contractsSource = read("src/lib/toplists/toplistContracts.ts");
const coreSource = read("src/context/ToplistsDataContextCore.tsx");
const firestoreProviderSource = read("src/context/ToplistsDataContext.tsx");
const firestoreSource = read("src/lib/api/toplistsFirestore.ts");
const guildHubToplistSource = read("src/pages/GuildHub/Toplist.tsx");
const compareModelSource = read("src/pages/GuildHub/localToplistCompareModel.ts");
const exportModelSource = read("src/pages/GuildHub/localToplistExportModel.ts");
const playerToplistsSource = read("src/pages/Toplists/playertoplists.tsx");
const guildToplistsSource = read("src/pages/Toplists/guildtoplists.tsx");
const playerDecorSource = read("src/pages/Toplists/playerToplistDecor.ts");

for (const file of allSource) {
  const source = read(file);
  for (const legacyName of legacyNames) {
    assert.equal(source.includes(legacyName), false, `${legacyName} remains in ${file}`);
  }
}

assert.match(contractsSource, /export type ToplistPlayerRow = \{/);
assert.match(contractsSource, /export type ToplistGuildRow = \{[\s\S]*?petLevel: number \| null;[\s\S]*?instructor: number \| null;/);
assert.match(contractsSource, /export type ToplistPlayerSnapshot = \{/);
assert.match(contractsSource, /export type ToplistGuildSnapshot = \{/);
assert.doesNotMatch(contractsSource, /firebase|firestore|toplistsFirestore/);

assert.match(coreSource, /export const ToplistsDataContext = createContext<ToplistsDataContextValue \| null>\(null\);/);
assert.match(coreSource, /export function ToplistsDataStaticProvider/);
assert.match(coreSource, /export function useToplistsData/);
assert.doesNotMatch(coreSource, /firebase|toplistsFirestore|from "\.\.\/lib\/api\/toplistsFirestore"/);
assert.equal((coreSource.match(/createContext</g) ?? []).length, 1);
assert.equal((firestoreProviderSource.match(/createContext</g) ?? []).length, 0);
assert.match(firestoreProviderSource, /from "\.\/ToplistsDataContextCore"/);
assert.match(firestoreProviderSource, /<ToplistsDataContext\.Provider value=\{value\}>/);

assert.doesNotMatch(firestoreSource, /export type ToplistPlayerRow = \{/);
assert.doesNotMatch(firestoreSource, /export type ToplistGuildRow = \{/);
assert.match(firestoreSource, /from "\.\.\/toplists\/toplistContracts"/);
assert.match(firestoreSource, /const mapFirestorePlayerRow = \(raw: any\): ToplistPlayerRow \| null => \{/);
assert.match(firestoreSource, /mapFirestoreGuildRow/);

for (const [name, source] of [
  ["GuildHub/Toplist.tsx", guildHubToplistSource],
  ["localToplistCompareModel.ts", compareModelSource],
  ["localToplistExportModel.ts", exportModelSource],
] as const) {
  assert.doesNotMatch(source, /toplistsFirestore/, `${name} must not import the Firestore runtime module`);
}

assert.match(guildHubToplistSource, /from "\.\.\/\.\.\/context\/ToplistsDataContextCore"/);
assert.match(guildHubToplistSource, /from "\.\.\/\.\.\/lib\/toplists\/toplistContracts"/);
assert.match(compareModelSource, /from "\.\.\/\.\.\/lib\/toplists\/toplistContracts"/);
assert.match(exportModelSource, /from "\.\.\/\.\.\/lib\/toplists\/toplistContracts"/);
assert.match(playerToplistsSource, /useToplistsData[\s\S]*from "\.\.\/\.\.\/context\/ToplistsDataContextCore"/);
assert.match(guildToplistsSource, /from "\.\.\/\.\.\/context\/ToplistsDataContextCore"/);
assert.match(playerDecorSource, /from "\.\.\/\.\.\/lib\/toplists\/toplistContracts"/);

assert.ok(statSync(new URL("../../src/context/ToplistsDataContextCore.tsx", import.meta.url)).isFile());
assert.ok(relative(repoRoot.pathname, new URL("../../src/lib/toplists/toplistContracts.ts", import.meta.url).pathname));

console.log("toplistContractsArchitecture.test: ok");
