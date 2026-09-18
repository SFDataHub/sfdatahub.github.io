import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const buildSave = (length: number): unknown[] => Array.from({ length }, () => 0);

const currentSave = (): unknown[] => {
  const save = buildSave(70);
  save[1] = 101;
  save[3] = 20;
  save[4] = 1000;
  save[5] = 2000;
  save[6] = 300;
  save[7] = 4;
  save[18] = 1;
  save[19] = 0;
  save[20] = 1;
  save[21] = 1;
  save[23] = 111;
  save[24] = 123;
  save[25] = 456;
  save[26] = 22;
  save[28] = 33;
  save[29] = 999;
  for (let index = 30; index < 45; index += 1) save[index] = 0;
  save[66] = 10000;
  return save;
};

const modernDungeons = () => {
  const light = buildSave(37);
  const shadow = buildSave(37);
  light[0] = 0;
  light[14] = 7;
  light[17] = 44;
  light[31] = 8;
  shadow[0] = 0;
  shadow[14] = 9;
  shadow[17] = 10;
  return { light, shadow, class: [0, 1, 2, 3, 4], group: 55, raid: 12 };
};

const resources = (): unknown[] => {
  const values = buildSave(17);
  values[1] = 0;
  values[2] = 0;
  values[3] = 0;
  values[4] = 0;
  values[5] = 0;
  values[7] = 0;
  values[9] = 0;
  values[10] = 0;
  values[11] = 0;
  values[12] = 0;
  values[13] = 1;
  values[14] = 2;
  values[15] = 3;
  values[16] = 4;
  return values;
};

const tower = (): unknown[] => {
  const values = buildSave(476);
  values[146] = 0;
  values[294] = 0;
  values[442] = 0;
  values[448] = 0;
  values[449] = 0;
  values[450] = 0;
  values[451] = 0;
  values[452] = 0;
  values[453] = 0;
  values[455] = 0;
  values[456] = 0;
  values[457] = 0;
  values[458] = 0;
  values[459] = 0;
  values[460] = 0;
  values[461] = 0;
  values[463] = 0;
  values[464] = 0;
  values[465] = 0;
  values[466] = 0;
  values[468] = 0;
  values[469] = 0;
  values[470] = 0;
  values[473] = 0;
  values[474] = 0;
  values[475] = 0;
  return values;
};

const pets = (): unknown[] => {
  const values = buildSave(264);
  values[2] = 0;
  values[102] = 0;
  values[103] = 0;
  values[104] = 5;
  values[105] = 0;
  values[106] = 0;
  values[107] = 0;
  values[108] = 0;
  return values;
};

{
  const player = {
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    dungeons: modernDungeons(),
    fortress: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 999, 77, 0, 0, 0, 0, 0, 0, 0, 0],
    fortressrank: 88,
    resources: resources(),
    tower: tower(),
    pets: pets(),
    status: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    offset: 500,
  };
  const before = JSON.stringify(player);
  const normalized = normalizeSfPlayerCharacterCore(player);

  assert.equal(JSON.stringify(player), before);
  assert.equal(normalized.metadata.layout, "currentCompact");
  assert.equal(normalized.attributes.strength.base, 0);
  assert.equal(normalized.metadata.fields["attributes.strength.base"]?.status, "available");
  assert.equal(normalized.pets?.collection?.pets[0]?.level, 0);
  assert.equal(normalized.pets?.collection?.pets[0]?.found, false);
  assert.equal(normalized.pets?.metadata.fields["collection.pets.0.found"]?.status, "available");
  assert.equal(normalized.dungeons.normal.entries[0]?.progress, 0);
  assert.equal(normalized.dungeons.metadata.fields["normal.entries.0.progress"]?.status, "available");
  assert.equal(normalized.fortress.buildings.quarters, 0);
  assert.equal(normalized.fortress.metadata.fields["fortress.buildings.quarters"]?.status, "available");
  assert.equal(normalized.resources.currencies.mushrooms.current, 0);
  assert.equal(normalized.resources.metadata.fields["resources.currencies.mushrooms.current"]?.status, "available");
  assert.equal(normalized.underworld.buildings.heart, 0);
  assert.equal(normalized.underworld.metadata.fields["underworld.buildings.heart"]?.status, "available");

  assert.equal(normalized.dungeons.portals.player.progress, 44);
  assert.equal(normalized.progressionStatus.portalBonuses.health, 44);
  assert.equal(normalized.progressionStatus.portalBonuses.damage, 22);
  assert.equal(normalized.dungeons.portals.guild.progress, 55);
  assert.equal(normalized.pets?.bonuses.shadow, 5);
  assert.equal(normalized.progressionStatus.guildBonuses.pet, null);
  assert.equal(normalized.progressionStatus.metadata.fields["guildBonuses.pet"]?.status, "unsupported");
  assert.equal(normalized.combat.source.damage.min, 123);
  assert.equal(normalized.combat.damage.min, null);
  assert.equal(normalized.metadata.fields["combat.damage.min"]?.status, "missing");
}

{
  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    saveVersion: 2,
    save: currentSave(),
    resources: resources(),
    tower: tower(),
    witch: [1, 2, 3, 4],
    idle: [0, 0, 1],
    toilet: [1, 2, 3, 4],
  });

  assert.equal(normalized.resources.metadata.fields["resources.currencies.mushrooms.current"]?.status, "unsupported");
  assert.equal(normalized.underworld.metadata.fields["underworld.buildings.heart"]?.status, "unsupported");
  assert.equal(normalized.extended.witch.metadata.fields["witch.stage"]?.status, "unsupported");
  assert.equal(normalized.extended.idle.metadata.fields["idle.sacrifices"]?.status, "unsupported");
  assert.equal(normalized.extended.toilet.metadata.fields["toilet.aura"]?.status, "unsupported");
}

{
  const badResources = resources();
  const badTower = tower();
  const badFortress = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, "soon", 50, 0, 0, 0];
  badResources[15] = "bad";
  badTower[468] = 5;
  badTower[469] = "later";
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    fortress: badFortress,
    resources: badResources,
    tower: badTower,
    status: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "paid", 0, 2],
  });

  assert.equal(normalized.resources.currencies.mushrooms.total, null);
  assert.equal(normalized.resources.metadata.fields["resources.currencies.mushrooms.total"]?.status, "invalid");
  assert.equal(normalized.resources.pets.fireFood, null);
  assert.equal(normalized.resources.metadata.fields["resources.pets.fireFood"]?.status, "invalid");
  assert.equal(normalized.fortress.currentBuilding.finishesAt, null);
  assert.equal(normalized.fortress.metadata.fields["fortress.currentBuilding.finishesAt"]?.status, "invalid");
  assert.equal(normalized.underworld.currentUpgrade.finishesAt, null);
  assert.equal(normalized.underworld.metadata.fields["underworld.currentUpgrade.finishesAt"]?.status, "invalid");
}

console.log("normalizedPlayer.coverage test passed");
