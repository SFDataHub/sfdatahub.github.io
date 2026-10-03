import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { mapFirestoreGuildRow } from "../../src/lib/api/toplistGuildRowMapper.ts";
import { readGuildLatestMeta } from "../../src/lib/import/guildLatestMeta.ts";

const csvSource = readFileSync(new URL("../../src/lib/import/csv.ts", import.meta.url), "utf8");
const importerSource = readFileSync(new URL("../../src/lib/import/importer.ts", import.meta.url), "utf8");
const monthlyBackfillSource = readFileSync(
  new URL("../backfill-monthly-guild-toplists.mts", import.meta.url),
  "utf8",
);
const guildToplistsSource = readFileSync(new URL("../../src/pages/Toplists/guildtoplists.tsx", import.meta.url), "utf8");
const guildHubToplistSource = readFileSync(new URL("../../src/pages/GuildHub/Toplist.tsx", import.meta.url), "utf8");
const firestoreSource = readFileSync(new URL("../../src/lib/api/toplistsFirestore.ts", import.meta.url), "utf8");
const guildRowMapperSource = readFileSync(new URL("../../src/lib/api/toplistGuildRowMapper.ts", import.meta.url), "utf8");
const contractsSource = readFileSync(new URL("../../src/lib/toplists/toplistContracts.ts", import.meta.url), "utf8");

const mobilePetLevelBinding =
  /renderGuildMobileDetailItem\("petLevel"[\s\S]*?fmtNum\(row\.petLevel\)[\s\S]*?renderGuildDelta\(compare\.deltas\.petLevel, compare\.compareMissing\)\)/;
const desktopPetLevelBinding =
  /<td style=\{TOPLIST_CELL_STYLE_BY_KEY\.petLevel\}>[\s\S]*?fmtNum\(row\.petLevel\)[\s\S]*?renderGuildDelta\(compare\.deltas\.petLevel, compare\.compareMissing\)[\s\S]*?<\/td>/;
const mobilePetLevelUsesInstructor =
  /renderGuildMobileDetailItem\("petLevel"[\s\S]*?fmtNum\(row\.instructor\)[\s\S]*?renderGuildDelta\(compare\.deltas\.instructor, compare\.compareMissing\)\)/;
const desktopPetLevelUsesInstructor =
  /<td style=\{TOPLIST_CELL_STYLE_BY_KEY\.petLevel\}>[\s\S]*?fmtNum\(row\.instructor\)[\s\S]*?renderGuildDelta\(compare\.deltas\.instructor, compare\.compareMissing\)[\s\S]*?<\/td>/;
const publicGuildRowTypeIncludesPetLevel =
  /export type ToplistGuildRow = \{[\s\S]*?petLevel: number \| null;[\s\S]*?instructor: number \| null;/;
const firestoreGuildMapperIncludesPetLevel =
  /export const mapFirestoreGuildRow = \(raw: any\): ToplistGuildRow \| null => \{[\s\S]*?petLevel: toNumber\(raw\.petLevel\),[\s\S]*?instructor: toNumber\(raw\.instructor\),/;
const publicGuildAdapterIncludesPetLevel =
  /function toPublicGuildRow[\s\S]*?petLevel: row\.petLevel,[\s\S]*?instructor: row\.instructor,/;

const importedMeta = readGuildLatestMeta({
  "Guild Instructor": "15",
  "Guild Pet Level": "73",
});
const publicSnapshotRow = {
  guildId: "guild-1",
  server: "F28",
  name: "Fixture Guild",
  instructor: importedMeta.instructor,
  petLevel: importedMeta.petLevel,
  deltas: {
    petLevel: 4,
    instructor: 2,
  },
};
const decodedPublicRow = mapFirestoreGuildRow(publicSnapshotRow);
const missingPetLevelMeta = readGuildLatestMeta({
  "Guild Instructor": "15",
});
const missingPetLevelDecodedRow = mapFirestoreGuildRow({
  guildId: "guild-2",
  server: "F28",
  name: "Missing Pet Guild",
  instructor: 15,
});
const zeroPetLevelMeta = readGuildLatestMeta({
  "Guild Instructor": "15",
  "Guild Pet Level": "0",
});

assert.equal(importedMeta.instructor, 15);
assert.equal(importedMeta.petLevel, 73);
assert.notEqual(importedMeta.petLevel, importedMeta.instructor);
assert.ok(decodedPublicRow);
assert.equal(decodedPublicRow.petLevel, 73);
assert.equal(decodedPublicRow.instructor, 15);
assert.equal(publicSnapshotRow.petLevel, 73);
assert.equal(publicSnapshotRow.instructor, 15);
assert.equal(missingPetLevelMeta.petLevel, null);
assert.ok(missingPetLevelDecodedRow);
assert.equal(missingPetLevelDecodedRow.petLevel, null);
assert.equal(missingPetLevelDecodedRow.instructor, 15);
assert.equal(zeroPetLevelMeta.petLevel, 0);
assert.notEqual(publicSnapshotRow.deltas.petLevel, publicSnapshotRow.deltas.instructor);
assert.match(guildToplistsSource, mobilePetLevelBinding);
assert.match(guildToplistsSource, desktopPetLevelBinding);
assert.doesNotMatch(guildToplistsSource, mobilePetLevelUsesInstructor);
assert.doesNotMatch(guildToplistsSource, desktopPetLevelUsesInstructor);
assert.match(guildToplistsSource, /petLevel: toFiniteNumber\(row\.petLevel\)/);
assert.match(guildToplistsSource, /instructor: toFiniteNumber\(row\.instructor\)/);
assert.doesNotMatch(firestoreSource, /export type \{ ToplistGuildRow \};/);
assert.match(contractsSource, publicGuildRowTypeIncludesPetLevel);
assert.match(guildRowMapperSource, firestoreGuildMapperIncludesPetLevel);
assert.match(guildHubToplistSource, publicGuildAdapterIncludesPetLevel);
assert.match(csvSource, /petLevel: toFiniteNumberOrNull\(aggregate\.petLevel\)/);
assert.match(csvSource, /petLevel: latestMeta\.petLevel/);
assert.match(importerSource, /petLevel: latestMeta\.petLevel/);
assert.match(monthlyBackfillSource, /petLevel: toFiniteNumberOrNull\(history\?\.petLevel\) \?\? latestMeta\.petLevel/);

console.log("guildToplistPetLevelRendererBinding.test: ok");
