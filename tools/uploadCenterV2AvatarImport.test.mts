import assert from "node:assert/strict";

import {
  AVATAR_SEARCH_RESULT_LIMIT,
  buildAvatarImportPlayerEntries,
  filterAvatarImportPlayerEntries,
  getImportablePortrait,
  normalizeAvatarEntry,
} from "../src/components/UploadCenter/avatarImportPlayers.ts";

const compactSave = (id: number, overrides: Record<number, number> = {}) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = id;
  save[3] = overrides[3] ?? 605;
  save[8] = overrides[8] ?? 7;
  save[9] = overrides[9] ?? 203;
  save[10] = overrides[10] ?? 104;
  save[11] = overrides[11] ?? 6;
  save[12] = overrides[12] ?? 99;
  save[13] = overrides[13] ?? 4;
  save[14] = overrides[14] ?? 5;
  save[15] = overrides[15] ?? 3;
  save[16] = overrides[16] ?? 0;
  save[17] = overrides[17] ?? 0;
  save[18] = overrides[18] ?? 8;
  save[19] = overrides[19] ?? 1;
  save[20] = overrides[20] ?? 7;
  return save;
};

const legacyOtherSave = (id: number) => {
  const save = Array.from({ length: 256 }, () => 0);
  save[0] = id;
  save[2] = 500;
  save[8] = 9;
  save[9] = 304;
  save[10] = 205;
  save[11] = 8;
  save[12] = 106;
  save[13] = 6;
  save[14] = 7;
  save[15] = 11;
  save[16] = 0;
  save[17] = 0;
  save[18] = 4;
  save[19] = 2;
  save[20] = 2;
  return save;
};

const legacyOwnSave = (id: number) => {
  const save = Array.from({ length: 706 }, () => 0);
  save[1] = id;
  save[7] = 450;
  save[17] = 3;
  save[18] = 401;
  save[19] = 302;
  save[20] = 4;
  save[21] = 99;
  save[22] = 2;
  save[23] = 1;
  save[24] = 6;
  save[25] = 11;
  save[26] = 0;
  save[27] = 8;
  save[28] = 1;
  save[29] = 7;
  save[705] = 3;
  return save;
};

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      {
        own: 0,
        prefix: "f28_net",
        identifier: "f28_net_p191020",
        name: "Darth Monk",
        groupname: "Welten im Wandel",
        saveVersion: 2,
        save: compactSave(191020),
      },
    ],
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].own, false);
  assert.equal(entries[0].layout, "currentCompact");
  assert.equal(entries[0].level, 605);
  assert.equal(entries[0].classLabel, "Demon Hunter");

  const normalized = normalizeAvatarEntry(entries[0]);
  const portrait = getImportablePortrait(normalized);
  assert.equal(portrait?.status, "available");
  assert.equal(portrait?.appearance.beard.none, true);
}

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      {
        own: 0,
        prefix: "s3_eu",
        identifier: "s3_eu_p72909",
        name: "Erdkruemel",
        guildName: "50Todsuenden",
        save: legacyOtherSave(72909),
      },
    ],
  });
  const portrait = getImportablePortrait(normalizeAvatarEntry(entries[0]));
  assert.equal(entries[0].layout, "legacyOther");
  assert.equal(portrait?.appearance.mouth, 9);
  assert.equal(portrait?.appearance.hair.style, 4);
  assert.equal(portrait?.appearance.hair.color, 3);
}

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      {
        own: 1,
        prefix: "s1_eu",
        identifier: "s1_eu_p42",
        name: "Legacy Own",
        save: legacyOwnSave(42),
      },
    ],
  });
  const portrait = getImportablePortrait(normalizeAvatarEntry(entries[0]));
  assert.equal(entries[0].layout, "legacyOwn");
  assert.equal(entries[0].own, true);
  assert.equal(portrait?.appearance.horn.style, 11);
  assert.equal(portrait?.frame.status, "available");
  assert.equal(portrait?.frame.frameId, 3);
}

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      { own: 0, prefix: "f28_net", identifier: "f28_net_p1", name: "Roster Only" },
      { own: 0, prefix: "f28_net", identifier: "f28_net_p2", name: "Invalid", save: [1, 2, 3] },
    ],
  });
  assert.equal(entries.length, 0);
}

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      {
        own: 0,
        prefix: "f28_net",
        identifier: "f28_net_p191020",
        name: "Darth Monk",
        groupname: "Welten im Wandel",
        saveVersion: 2,
        save: compactSave(191020),
      },
    ],
  });
  assert.equal(filterAvatarImportPlayerEntries(entries, "darth").length, 1);
  assert.equal(filterAvatarImportPlayerEntries(entries, "F28_NET_P191020").length, 1);
  assert.equal(filterAvatarImportPlayerEntries(entries, "F28").length, 1);
  assert.equal(filterAvatarImportPlayerEntries(entries, "wandel").length, 1);
  assert.equal(filterAvatarImportPlayerEntries(entries, "missing").length, 0);
}

{
  const players = Array.from({ length: 2500 }, (_, index) => ({
    own: 0,
    prefix: "f28_net",
    identifier: `f28_net_p${index + 1}`,
    name: index === 2499 ? "Needle Player" : `Player ${index + 1}`,
    saveVersion: 2,
    save: compactSave(index + 1),
  }));
  const entries = buildAvatarImportPlayerEntries({ players });
  assert.equal(entries.length, 2500);
  assert.equal(entries.slice(0, AVATAR_SEARCH_RESULT_LIMIT).length, 100);
  assert.equal(filterAvatarImportPlayerEntries(entries, "needle")[0]?.identifier, "f28_net_p2500");
}

{
  const entries = buildAvatarImportPlayerEntries({
    players: [
      {
        own: 0,
        prefix: "f28_net",
        identifier: "f28_net_p1",
        name: "First",
        saveVersion: 2,
        save: compactSave(1, { 8: 1 }),
      },
      {
        own: 0,
        prefix: "f28_net",
        identifier: "f28_net_p2",
        name: "Second",
        saveVersion: 2,
        save: compactSave(2, { 8: 12 }),
      },
    ],
  });
  const first = getImportablePortrait(normalizeAvatarEntry(entries[0]));
  const second = getImportablePortrait(normalizeAvatarEntry(entries[1]));
  assert.equal(first?.appearance.mouth, 1);
  assert.equal(second?.appearance.mouth, 12);
}

console.log("UploadCenter V2 avatar import tests passed");
