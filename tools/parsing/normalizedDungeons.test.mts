import assert from "node:assert/strict";

import { normalizeSfPlayerDungeons } from "../../src/lib/parsing/normalizedDungeons.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packLowerShort = (low: number, high = 0): number => low + (high << 16);

const fillCurrentSave = (save: unknown[], classId: number) => {
  save[1] = 1;
  save[3] = packLowerShort(100);
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 3000;
  save[7] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
};

const fillLegacyOwnSave = (save: unknown[], classId: number) => {
  save[1] = 1;
  save[7] = packLowerShort(100);
  save[8] = 1000;
  save[9] = 2000;
  save[10] = 3000;
  save[11] = 10;
  save[27] = packLowerShort(1);
  save[28] = 0;
  save[29] = packLowerShort(classId);
};

const fillLegacyOtherSave = (save: unknown[], classId: number) => {
  save[0] = 1;
  save[2] = packLowerShort(100);
  save[3] = 1000;
  save[4] = 2000;
  save[5] = 3000;
  save[6] = 10;
  save[18] = packLowerShort(1);
  save[19] = 0;
  save[20] = packLowerShort(classId);
};

const createModernDungeonData = () => {
  const light = Array.from({ length: 37 }, () => -2);
  const shadow = Array.from({ length: 37 }, () => -2);
  light[0] = 10;
  light[1] = 0;
  light[14] = 77;
  light[15] = 4;
  light[17] = 44;
  light[18] = 5;
  light[31] = 22;
  light[32] = 6;
  shadow[0] = 9;
  shadow[14] = 66;
  shadow[17] = 33;
  shadow[18] = 8;
  return {
    light,
    shadow,
    class: [0, 1, -1, -2, 3],
    Group: 50,
    Raid: 12,
  };
};

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 3);
  save[26] = 99;
  save[28] = 88;
  save[438] = 9999;
  const dungeons = normalizeSfPlayerDungeons({
    own: 1,
    saveVersion: 2,
    save,
    dungeons: createModernDungeonData(),
  });

  assert.equal(dungeons.normal.entries.length, 33);
  assert.equal(dungeons.normal.entries[0]?.gameId, 1);
  assert.equal(dungeons.normal.entries[14]?.gameId, 16);
  assert.equal(dungeons.normal.entries[14]?.rawIndex, 15);
  assert.equal(dungeons.normal.entries[0]?.progress, 10);
  assert.equal(dungeons.normal.entries[1]?.progress, 0);
  assert.equal(dungeons.normal.entries[1]?.unlocked, true);
  assert.equal(dungeons.normal.entries[2]?.locked, true);
  assert.equal(dungeons.totals.normal, 25);
  assert.equal(dungeons.totals.normalUnlocked, 5);
  assert.equal(dungeons.shadow.entries[16]?.progress, 8);
  assert.equal(dungeons.class.entries[0]?.progress, 0);
  assert.equal(dungeons.class.entries[3]?.locked, true);
  assert.equal(dungeons.totals.class, 4);
  assert.equal(dungeons.tower.progress, 77);
  assert.equal(dungeons.twister.progress, 66);
  assert.equal(dungeons.youtube.progress, 33);
  assert.equal(dungeons.sandstorm.progress, 22);
  assert.equal(dungeons.raid.progress, 12);
  assert.equal(dungeons.portals.player.progress, 44);
  assert.equal(dungeons.portals.guild.progress, 50);
  assert.equal(dungeons.metadata.fields["normal.entries.1.progress"]?.status, "available");
  assert.equal(dungeons.metadata.fields["normal.totalProgress"]?.provenance, "derived");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 2);
  save[21] = packLowerShort(4, 19);
  save[26] = 7;
  save[28] = 8;
  save[60] = 9;
  const dungeons = normalizeSfPlayerDungeons({
    own: 0,
    saveVersion: 2,
    save,
  });

  assert.equal(dungeons.tower.progress, 19);
  assert.equal(dungeons.portals.player.progress, 8);
  assert.equal(dungeons.portals.guild.progress, 7);
  assert.equal(dungeons.normal.entries[0]?.progress, null);
  assert.equal(dungeons.metadata.fields["normal.entries.0.progress"]?.status, "unsupported");
  assert.equal(dungeons.metadata.fields["tower.progress"]?.provenance, "raw");
}

{
  const save = Array.from({ length: 650 }, () => 0);
  fillLegacyOwnSave(save, 1);
  const dungeons = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    dungeons: {
      source: "legacy",
      normal: [10, 0, -2, -2, -2, -2, -2, -2, -2, -2, 3, 4, 10, 2, 1, -2, -2, -2, -2, -2, -2, -2, -2, -2, 5, 6, 7, 8, -2, -2, -2, -2, -2],
      shadow: [9, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, 2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2, -2],
      class: [],
      group: 25,
      player: 50,
      tower: 99,
      twister: 13,
      raid: 40,
      youtube: 11,
      sandstorm: -2,
    },
    prefix: "s3",
  }).dungeons;

  assert.equal(dungeons.normal.entries[0]?.progress, 10);
  assert.equal(dungeons.normal.entries[12]?.progress, 10);
  assert.equal(dungeons.normal.entries[27]?.progress, 8);
  assert.equal(dungeons.totals.normal, 56);
  assert.equal(dungeons.shadow.entries[15]?.progress, 2);
  assert.equal(dungeons.tower.progress, 99);
  assert.equal(dungeons.twister.progress, 13);
  assert.equal(dungeons.raid.progress, 40);
  assert.equal(dungeons.youtube.progress, 11);
  assert.equal(dungeons.sandstorm.progress, null);
  assert.equal(dungeons.metadata.fields["sandstorm.progress"]?.status, "unsupported");
  assert.equal(dungeons.class.entries[0]?.progress, null);
  assert.equal(dungeons.metadata.fields["class.entries.0.progress"]?.status, "unsupported");
}

{
  const save = Array.from({ length: 256 }, () => 0);
  fillLegacyOtherSave(save, 4);
  const dungeons = normalizeSfPlayerCharacterCore({
    own: 0,
    save,
    dungeons: {
      source: "legacy",
      normal: [1, 2, 3],
      shadow: [0],
      class: [],
      group: 7,
      player: 8,
      tower: 9,
      twister: -1,
      raid: 10,
      youtube: -2,
      sandstorm: -2,
    },
    prefix: "s4",
  }).dungeons;

  assert.equal(dungeons.normal.entries[0]?.progress, 1);
  assert.equal(dungeons.normal.entries[3]?.progress, null);
  assert.equal(dungeons.metadata.fields["normal.entries.3.progress"]?.status, "missing");
  assert.equal(dungeons.portals.player.progress, 8);
  assert.equal(dungeons.portals.guild.progress, 7);
  assert.equal(dungeons.youtube.locked, true);
}

{
  const dungeons = normalizeSfPlayerDungeons({
    own: 1,
    saveVersion: 2,
    save: Array.from({ length: 70 }, () => 0),
    dungeons: {
      light: [10, "bad"],
      shadow: Array.from({ length: 37 }, () => -2),
      class: [0, 0, 0, 0, 0],
    },
  });

  assert.equal(dungeons.normal.entries[0]?.progress, 10);
  assert.equal(dungeons.normal.entries[1]?.progress, null);
  assert.equal(dungeons.metadata.fields["normal.entries.1.progress"]?.status, "invalid");
}

{
  const dungeons = normalizeSfPlayerDungeons({ own: 1 });

  assert.equal(dungeons.normal.entries[0]?.progress, null);
  assert.equal(dungeons.metadata.fields["normal.entries.0.progress"]?.status, "missing");
  assert.equal(dungeons.metadata.fields["portals.player.progress"]?.status, "missing");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  fillCurrentSave(save, 3);
  save[26] = 50;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    dungeons: createModernDungeonData(),
    prefix: "s1",
  });

  assert.equal(normalized.dungeons.portals.player.progress, 44);
  assert.equal(normalized.progressionStatus.portalBonuses.health, 44);
  assert.equal(normalized.dungeons.portals.guild.progress, 50);
  assert.equal(normalized.progressionStatus.portalBonuses.damage, 50);
  assert.equal(normalized.dungeons.metadata.fields["portals.player.progress"]?.provenance, "raw");
  assert.equal(normalized.progressionStatus.metadata.fields["portalBonuses.health"]?.provenance, "raw");
}

console.log("normalizedDungeons.test.mts passed");
