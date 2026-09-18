import assert from "node:assert/strict";

import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import { parseSfJson } from "../../src/lib/parsing/parseSfJson.ts";

const buildSave = (length: number): unknown[] => Array.from({ length }, () => 0);

const currentSave = (): unknown[] => {
  const save = buildSave(70);
  save[1] = 101;
  save[3] = 20;
  save[18] = 1;
  save[19] = 0;
  save[20] = 1;
  save[21] = 999;
  return save;
};

const currentResources = (): unknown[] => [
  1859,
  93,
  1015031509,
  6,
  6886,
  3108587667,
  90000000,
  1046384291,
  30000000,
  5967493,
  2152148,
  1978045413,
  539,
  514,
  617,
  551,
  552,
];

const currentTower = (): unknown[] => {
  const tower = buildSave(476);
  tower[146] = 1;
  tower[294] = 2;
  tower[442] = 3;
  tower[448] = 11;
  tower[449] = 12;
  tower[450] = 13;
  tower[451] = 14;
  tower[452] = 15;
  tower[453] = 16;
  tower[455] = 17;
  tower[456] = 18;
  tower[457] = 19;
  tower[458] = 1978045413;
  tower[459] = 22;
  tower[460] = 23;
  tower[461] = 24;
  tower[463] = 26;
  tower[464] = 2700;
  tower[465] = 2800;
  tower[466] = 2900;
  tower[468] = 4;
  tower[469] = 200;
  tower[470] = 300;
  tower[473] = 40;
  tower[474] = 41;
  tower[475] = 20;
  return tower;
};

const currentIdle = (): unknown[] => {
  const idle = buildSave(118);
  idle[2] = 431;
  for (let index = 0; index < 10; index += 1) {
    idle[3 + index] = index;
    idle[43 + index] = 2;
    idle[53 + index] = 3;
  }
  idle[73] = 9999;
  idle[75] = 7;
  idle[76] = 8;
  idle[77] = 1;
  return idle;
};

const currentWitch = (): unknown[] => {
  const witch = buildSave(35);
  witch[0] = 2;
  witch[1] = 14;
  witch[2] = 10;
  witch[3] = 9;
  witch[6] = 50;
  [11, 31, 41, 51, 61, 71, 81, 91, 101].forEach((type, index) => {
    const base = 8 + index * 3;
    witch[base + 1] = 1000 + type;
    witch[base + 2] = 10 + index;
  });
  return witch;
};

{
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    resources: currentResources(),
    status: [0, 3, 4, 100, 90, 10, 77, 2, 5 << 16, 0, 0, 0, 0, 30, 0, 40, 0, 0, 0, 6],
    tower: currentTower(),
    idle: currentIdle(),
    witch: currentWitch(),
    toilet: [6, 70, 999, 120],
    pets: buildSave(264),
    webshopid: "VbGl8Msf$r466",
    timestamp: 100000,
    offset: 1000,
  });

  assert.equal(normalized.resources.metadata.layout, "currentCompact");
  assert.equal(normalized.resources.currencies.mushrooms.current, 93);
  assert.equal(normalized.resources.currencies.gold.raw, 1015031509);
  assert.equal(normalized.resources.currencies.gold.value, 10150315.09);
  assert.equal(normalized.resources.fortress.wood, 3108587667);
  assert.equal(normalized.resources.smithy.metal, 5967493);
  assert.equal(normalized.resources.underworld.souls, 1978045413);
  assert.equal(normalized.resources.pets.waterFood, 552);
  assert.equal(normalized.resources.currencies.mushrooms.total, 70);

  assert.equal(normalized.underworld.buildings.heart, 11);
  assert.equal(normalized.underworld.units.goblinUpgrades, 1);
  assert.equal(normalized.underworld.resources.goldPitGold, 27);
  assert.equal(normalized.underworld.resources.timeMachineMushrooms, 6);
  assert.equal(normalized.underworld.resources.timeMachineDailyUsed, 5);
  assert.deepEqual(normalized.underworld.currentUpgrade, {
    active: true,
    type: 3,
    building: "extractor",
    startsAt: 301000,
    finishesAt: 201000,
  });

  assert.equal(normalized.extended.idle.sacrifices, 431);
  assert.equal(normalized.extended.idle.upgrades.money[0], 4);
  assert.equal(normalized.extended.idle.upgrades.total, 60);
  assert.equal(normalized.extended.witch.items, 10);
  assert.equal(normalized.extended.witch.stage, 9);
  assert.equal(normalized.extended.witch.finish, 0);
  assert.equal(normalized.extended.toilet.aura, 6);
  assert.equal(normalized.extended.toilet.capacity, 120);
  assert.equal(normalized.extended.extras.webshopId, "VbGl8Msf$r466");
  assert.equal(normalized.extended.extras.status.action.finishesAt, 101000);
  assert.equal(normalized.extended.extras.status.calendarDay, 5);

  assert.equal(normalized.pets?.foods.water, normalized.resources.pets.waterFood);
}

{
  const normalized = normalizeSfPlayerCharacterCore({
    own: 0,
    saveVersion: 2,
    save: currentSave(),
    resources: currentResources(),
    tower: currentTower(),
    witch: currentWitch(),
  });

  assert.equal(normalized.resources.currencies.mushrooms.current, null);
  assert.equal(normalized.resources.metadata.fields["resources.currencies.mushrooms.current"]?.status, "unsupported");
  assert.equal(normalized.underworld.buildings.heart, null);
  assert.equal(normalized.underworld.metadata.fields["underworld.buildings.heart"]?.status, "unsupported");
  assert.equal(normalized.extended.witch.stage, null);
  assert.equal(normalized.extended.witch.metadata.fields["witch.stage"]?.status, "unsupported");
}

{
  const resources = currentResources();
  resources[10] = "bad";
  resources[12] = 0;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save: currentSave(),
    resources,
  });

  assert.equal(normalized.resources.smithy.crystals, null);
  assert.equal(normalized.resources.metadata.fields["resources.smithy.crystals"]?.status, "invalid");
  assert.equal(normalized.resources.pets.shadowFood, 0);
  assert.equal(normalized.resources.metadata.fields["resources.pets.shadowFood"]?.status, "available");
}

{
  const save = buildSave(650);
  save[1] = 101;
  save[3] = 1234;
  save[7] = 20;
  save[29] = 1;
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    save,
    resources: currentResources(),
    offset: 500,
  });

  assert.equal(normalized.resources.currencies.hourglass, 6886);
  assert.equal(normalized.extended.extras.registeredAt, 1234500);
  assert.equal(normalized.underworld.metadata.fields["underworld.buildings.heart"]?.status, "missing");
}

{
  const parsed = parseSfJson({
    players: [
      {
        own: 1,
        identifier: "s1_p101",
        prefix: "s1",
        save: currentSave(),
        saveVersion: 2,
        toilet: [0, 5, 99, 25],
      },
    ],
  });

  assert.equal(parsed.ownPlayer?.toilet?.aura, 0);
  assert.equal(parsed.ownPlayer?.toilet?.fill, 5);
  assert.equal(parsed.ownPlayer?.toilet?.capacity, 25);
}

console.log("normalizedResourcesUnderworldExtended test passed");
