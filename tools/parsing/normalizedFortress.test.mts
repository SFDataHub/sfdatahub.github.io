import assert from "node:assert/strict";

import { normalizeSfPlayerFortress } from "../../src/lib/parsing/normalizedFortress.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const buildSave = (length: number): unknown[] => Array.from({ length }, () => 0);

const setLegacyBuildings = (save: unknown[], start: number, levels: number[]) => {
  levels.forEach((level, index) => {
    save[start + index] = level;
  });
};

const currentSave = (): unknown[] => {
  const save = buildSave(70);
  save[1] = 101;
  save[3] = 20;
  save[18] = 1;
  save[19] = 0;
  save[20] = 1;
  return save;
};

{
  const fortress = normalizeSfPlayerFortress({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortress: [1, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5, 100, 50, 66, 777, 42],
    fortressrank: 13,
    offset: 1000,
  });

  assert.equal(fortress.metadata.layout, "currentCompact");
  assert.equal(fortress.source, "fortress");
  assert.deepEqual(fortress.buildings, {
    fortress: 1,
    quarters: 0,
    woodcutter: 3,
    quarry: 4,
    gemMine: 5,
    academy: 6,
    archeryGuild: 7,
    barracks: 8,
    mageTower: 9,
    treasury: 10,
    smithy: 11,
    fortifications: 12,
  });
  assert.equal(fortress.metadata.fields["fortress.buildings.quarters"]?.status, "available");
  assert.equal(fortress.upgrades, 66);
  assert.equal(fortress.honor, 777);
  assert.equal(fortress.rank, 42);
  assert.equal(fortress.raidHonor, 777 - 10 * 76);
  assert.deepEqual(fortress.currentBuilding, {
    active: true,
    type: 4,
    building: "gemMine",
    startsAt: 51000,
    finishesAt: 101000,
  });
  assert.equal(fortress.metadata.fields["fortress.raidHonor"]?.provenance, "calculated");
}

{
  const save = currentSave();
  save[0] = 99;
  save[10] = 98;
  const fortress = normalizeSfPlayerFortress({
    own: 0,
    saveVersion: 2,
    save,
    fortress: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    fortressrank: 314,
  });

  assert.equal(fortress.metadata.layout, "currentCompact");
  assert.equal(fortress.source, "fortress");
  assert.equal(fortress.buildings.fortress, 12);
  assert.equal(fortress.buildings.fortifications, 1);
  assert.equal(fortress.rank, 314);
  assert.equal(fortress.upgrades, null);
  assert.equal(fortress.honor, null);
  assert.equal(fortress.raidHonor, null);
  assert.equal(fortress.currentBuilding.active, null);
  assert.equal(fortress.metadata.fields["fortress.upgrades"]?.status, "unsupported");
  assert.equal(fortress.metadata.fields["fortress.currentBuilding.active"]?.status, "unsupported");
}

{
  const save = buildSave(650);
  setLegacyBuildings(save, 524, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  save[571] = 10;
  save[572] = 123;
  save[573] = 120;
  save[581] = 88;
  save[582] = 999;
  save[583] = 77;

  const fortress = normalizeSfPlayerFortress({
    own: 1,
    save,
    fortressrank: 55,
    offset: 500,
  });

  assert.equal(fortress.metadata.layout, "legacyOwn");
  assert.equal(fortress.source, "save");
  assert.equal(fortress.buildings.fortress, 2);
  assert.equal(fortress.buildings.fortifications, 13);
  assert.deepEqual(fortress.currentBuilding, {
    active: true,
    type: 9,
    building: "treasury",
    startsAt: 120500,
    finishesAt: 123500,
  });
  assert.equal(fortress.upgrades, 88);
  assert.equal(fortress.honor, 999);
  assert.equal(fortress.rank, 77);
  assert.equal(fortress.raidHonor, 999 - 10 * 90);
}

{
  const save = buildSave(256);
  setLegacyBuildings(save, 208, [4, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  save[244] = 0;
  save[245] = 111;
  save[246] = 99;
  save[247] = 12;
  save[248] = 345;

  const fortress = normalizeSfPlayerFortress({
    own: 0,
    save,
    fortressrank: 222,
    offset: 250,
  });

  assert.equal(fortress.metadata.layout, "legacyOther");
  assert.equal(fortress.source, "save");
  assert.equal(fortress.buildings.quarters, 0);
  assert.deepEqual(fortress.currentBuilding, {
    active: false,
    type: null,
    building: null,
    startsAt: null,
    finishesAt: null,
  });
  assert.equal(fortress.upgrades, 12);
  assert.equal(fortress.honor, 345);
  assert.equal(fortress.rank, 222);
  assert.equal(fortress.raidHonor, 345 - 10 * 59);
}

{
  const fortress = normalizeSfPlayerFortress({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortress: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 99, 100, 50, 1, 2, 3],
  });

  assert.equal(fortress.currentBuilding.active, true);
  assert.equal(fortress.currentBuilding.type, 98);
  assert.equal(fortress.currentBuilding.building, "unknown");
  assert.equal(fortress.metadata.fields["fortress.currentBuilding.building"]?.status, "invalid");
}

{
  const fortress = normalizeSfPlayerFortress({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortress: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5, "soon", 50, 1, 2, 3],
  });

  assert.equal(fortress.currentBuilding.active, true);
  assert.equal(fortress.currentBuilding.building, "gemMine");
  assert.equal(fortress.currentBuilding.startsAt, 50000);
  assert.equal(fortress.currentBuilding.finishesAt, null);
  assert.equal(fortress.metadata.fields["fortress.currentBuilding.finishRaw"]?.status, "invalid");
  assert.equal(fortress.metadata.fields["fortress.currentBuilding.finishesAt"]?.status, "invalid");
}

{
  const fortress = normalizeSfPlayerFortress({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortressrank: 1,
  });

  assert.equal(fortress.metadata.layout, "currentCompact");
  assert.equal(fortress.source, null);
  assert.equal(fortress.buildings.fortress, null);
  assert.equal(fortress.metadata.fields["fortress.source"]?.status, "missing");
  assert.equal(fortress.metadata.fields["fortress.buildings.fortress"]?.status, "missing");
}

{
  const fortress = normalizeSfPlayerFortress({
    own: 1,
    identifier: "s1_p123",
  });

  assert.equal(fortress.metadata.layout, "unknown");
  assert.equal(fortress.source, null);
  assert.equal(fortress.upgrades, null);
  assert.equal(fortress.metadata.fields["fortress.source"]?.status, "unsupported");
  assert.equal(fortress.metadata.fields["fortress.buildings.fortress"]?.status, "unsupported");
}

{
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortress: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 2, 300, 4],
  });

  assert.equal(normalized.fortress.rank, 4);
  assert.equal(normalized.fortress.currentBuilding.active, false);
  assert.equal(normalized.fortress.raidHonor, 180);
}

console.log("normalizedFortress.test.mts passed");
