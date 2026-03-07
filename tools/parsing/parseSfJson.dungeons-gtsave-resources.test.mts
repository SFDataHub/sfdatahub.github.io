import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { parseSfJson } from "../../src/lib/parsing/parseSfJson.ts";

const save = Array.from({ length: 706 }, () => 0);
save[17] = 5;
save[18] = 203;
save[19] = 101;
save[20] = 7;
save[21] = 304;
save[22] = 6;
save[23] = 4;
save[24] = 2;
save[25] = 405;
save[26] = 0;
save[27] = 2;
save[28] = 2;
save[29] = 3;
save[705] = 50;

const light = Array.from({ length: 37 }, () => -2);
const shadow = Array.from({ length: 37 }, () => -2);
light[0] = 10;
shadow[0] = 9;
light[14] = 77;
shadow[14] = 66;
light[17] = 44;
shadow[17] = 33;
light[31] = 22;

const tower = Array.from({ length: 476 }, () => 0);
tower[146] = 1;
tower[294] = 2;
tower[442] = 3;
tower[448 + 0] = 11;
tower[448 + 1] = 12;
tower[448 + 2] = 13;
tower[448 + 3] = 14;
tower[448 + 4] = 15;
tower[448 + 5] = 16;
tower[448 + 7] = 18;
tower[448 + 8] = 19;
tower[448 + 9] = 20;
tower[448 + 10] = 0;
tower[448 + 11] = 22;
tower[448 + 12] = 23;
tower[448 + 13] = 24;
tower[448 + 15] = 26;
tower[448 + 16] = 2700;
tower[448 + 17] = 2800;
tower[448 + 18] = 2900;
tower[448 + 20] = 5;
tower[448 + 21] = 200;
tower[448 + 22] = 300;
tower[448 + 25] = 31;
tower[448 + 26] = 32;
tower[448 + 27] = 33;

const equippedItems = Array.from({ length: 191 }, (_, index) => index + 1);
const backpackItems = Array.from({ length: 951 }, () => 0);
for (let slot = 0; slot < 45; slot += 1) {
  backpackItems[slot * 19] = slot % 2 === 0 ? 1 : 0;
}
const companionItems = Array.from({ length: 571 }, (_, index) => index + 1);
const dummyItems = Array.from({ length: 191 }, (_, index) => index + 1);
const shakesItems = Array.from({ length: 115 }, () => 0);
const fidgetItems = Array.from({ length: 115 }, () => 0);
for (let slot = 0; slot < 6; slot += 1) {
  shakesItems[slot * 19] = slot + 1;
  fidgetItems[slot * 19] = slot % 2 === 0 ? 1 : 0;
}
const pets = Array.from({ length: 266 }, () => 0);
pets[2] = 200;
pets[22] = 150;
pets[42] = 120;
pets[62] = 110;
pets[82] = 90;
pets[103] = 12;
pets[104] = 20;
pets[105] = 21;
pets[106] = 22;
pets[107] = 23;
pets[108] = 24;
pets[210] = 1;
pets[211] = 2;
pets[212] = 3;
pets[213] = 4;
pets[214] = 5;
pets[233] = 777;
pets[234] = 888;
pets[255] = 1234;
pets[256] = 5678;
pets[259] = 11;
pets[260] = 12;
pets[261] = 13;
pets[262] = 14;
pets[263] = 15;
const idle = Array.from({ length: 118 }, () => 0);
idle[2] = 431;
idle[3] = 1;
idle[12] = 10;
idle[43] = 2;
idle[53] = 3;
idle[73] = 9999;
idle[75] = 7;
idle[76] = 8;
idle[77] = 1;
const dailyTasks = [1, 2, 3, 4, 5, 6];
const dailyTasksRewards = [1, 5, 0, 24, 100, 0, 10, 0, 25, 200];
const achievements = Array.from({ length: 230 }, (_, index) => (index < 115 ? 0 : index));
achievements[0] = 1;
achievements[3] = 1;
achievements[115] = 55;
achievements[118] = 99;
const calendar = Array.from({ length: 40 }, (_, index) => index + 1);
const units = [7, 8, 9, 10, 11];
const witch = Array.from({ length: 35 }, () => 0);
witch[0] = 2;
witch[1] = 14;
witch[2] = 33;
witch[3] = 9;
witch[6] = 1234;
witch[9] = 5678;
witch[10] = 2222;
witch[12] = 6789;
witch[13] = 3333;

const parsed = parseSfJson({
  players: [
    {
      own: 1,
      identifier: "s5_eu_p1859",
      prefix: "s5_eu",
      name: "Parser Test",
      description: "  parser description  ",
      save,
      dungeons: { light, shadow },
      gtsave: { tokens: 122316, floor: 10330, floor_max: 345, rank: 7 },
      resources: [1859, 93, 1015031509, 6, 6886, 3108587667, 90000000, 1046384291, 30000000, 5967493, 2152148, 1978045413, 539, 514, 617, 551, 552],
      tower,
      offset: -3600000,
      equippedItems,
      backpackItems,
      companionItems,
      dummyItems,
      shakesItems,
      fidgetItems,
      pets,
      scrapbook: "AQ",
      scrapbook_legendary: "Ag",
      idle,
      dailyTasks,
      dailyTasksRewards,
      achievements,
      calendar,
      units,
      witch,
      timestamp: 1764957283804,
      fortressrank: 2329,
      version: 2015,
      webshopid: "VbGl8Msf$r466",
    },
  ],
});

assert.equal(parsed.playersCount, 1);
assert.ok(parsed.ownPlayer);
assert.equal(parsed.ownPlayer?.description, "  parser description  ");
assert.equal(parsed.ownPlayer?.dungeons?.source, "modern");
assert.equal(parsed.ownPlayer?.dungeons?.normal[0], 10);
assert.equal(parsed.ownPlayer?.dungeons?.shadow[0], 9);
assert.equal(parsed.ownPlayer?.dungeons?.tower, 77);
assert.equal(parsed.ownPlayer?.dungeons?.twister, 66);
assert.equal(parsed.ownPlayer?.dungeons?.player, 44);
assert.equal(parsed.ownPlayer?.dungeons?.youtube, 33);
assert.equal(parsed.ownPlayer?.dungeons?.sandstorm, 22);

assert.equal(parsed.ownPlayer?.groupTournament?.tokens, 122316);
assert.equal(parsed.ownPlayer?.groupTournament?.floor, 10330);
assert.equal(parsed.ownPlayer?.groupTournament?.floorMax, 345);
assert.equal(parsed.ownPlayer?.groupTournament?.rank, 7);

assert.equal(parsed.ownPlayer?.resources?.mushrooms, 93);
assert.equal(parsed.ownPlayer?.resources?.metal, 5967493);
assert.equal(parsed.ownPlayer?.resources?.crystals, 2152148);
assert.equal(parsed.ownPlayer?.resources?.souls, 1978045413);
assert.equal(parsed.ownPlayer?.resources?.waterFood, 552);

assert.equal(parsed.ownPlayer?.underworld?.goblinUpgrades, 1);
assert.equal(parsed.ownPlayer?.underworld?.trollUpgrades, 2);
assert.equal(parsed.ownPlayer?.underworld?.keeperUpgrades, 3);
assert.equal(parsed.ownPlayer?.underworld?.heart, 11);
assert.equal(parsed.ownPlayer?.underworld?.goldPit, 13);
assert.equal(parsed.ownPlayer?.underworld?.goldPitGold, 27);
assert.equal(parsed.ownPlayer?.underworld?.goldPitMax, 28);
assert.equal(parsed.ownPlayer?.underworld?.goldPitHourly, 29);
assert.equal(parsed.ownPlayer?.underworld?.upgrade.building, 4);
assert.equal(parsed.ownPlayer?.underworld?.upgrade.finish, 200 * 1000 - 3600000);
assert.equal(parsed.ownPlayer?.underworld?.upgrade.start, 300 * 1000 - 3600000);

assert.equal(parsed.ownPlayer?.equippedItems?.chunkSize, 19);
assert.equal(parsed.ownPlayer?.equippedItems?.slots.length, 10);
assert.equal(parsed.ownPlayer?.equippedItems?.slots[0]?.name, "Head");
assert.equal(parsed.ownPlayer?.equippedItems?.remainder.length, 1);

assert.equal(parsed.ownPlayer?.backpackItems?.slots.length, 45);
assert.equal(parsed.ownPlayer?.backpackItems?.slots[0]?.section, "backpack");
assert.equal(parsed.ownPlayer?.backpackItems?.slots[20]?.section, "chest");
assert.equal(parsed.ownPlayer?.backpackItems?.remainder.length, 96);

assert.equal(parsed.ownPlayer?.companionItems?.bert.length, 10);
assert.equal(parsed.ownPlayer?.companionItems?.mark.length, 10);
assert.equal(parsed.ownPlayer?.companionItems?.kunigunde.length, 10);
assert.equal(parsed.ownPlayer?.companionItems?.remainder.length, 1);

assert.equal(parsed.ownPlayer?.dummyItems?.slots.length, 10);
assert.equal(parsed.ownPlayer?.dummyItems?.slots[0]?.name, "Head");
assert.equal(parsed.ownPlayer?.dummyItems?.remainder.length, 1);

assert.equal(parsed.ownPlayer?.shakesItems?.slots.length, 6);
assert.equal(parsed.ownPlayer?.shakesItems?.slots[0]?.type, 1);
assert.equal(parsed.ownPlayer?.shakesItems?.remainder.length, 1);

assert.equal(parsed.ownPlayer?.fidgetItems?.slots.length, 6);
assert.equal(parsed.ownPlayer?.fidgetItems?.slots[0]?.type, 1);
assert.equal(parsed.ownPlayer?.fidgetItems?.remainder.length, 1);

const ownPets = parsed.ownPlayer?.pets;
assert.equal(ownPets?.source, "own");
if (ownPets?.source === "own") {
  assert.equal(ownPets.levels.all.length, 100);
  assert.equal(ownPets.levels.shadow[0], 200);
  assert.equal(ownPets.totals.totalCount, 12);
  assert.equal(ownPets.rank, 777);
  assert.equal(ownPets.honor, 888);
  assert.equal(ownPets.foods.water, 15);
}

assert.equal(parsed.ownPlayer?.scrapbook?.encoded, "AQ");
assert.equal(parsed.ownPlayer?.scrapbook?.decoded.length, 8);
assert.equal(parsed.ownPlayer?.legendaryScrapbook?.encoded, "Ag");
assert.equal(parsed.ownPlayer?.legendaryScrapbook?.decoded.length, 8);

assert.equal(parsed.ownPlayer?.idle?.sacrifices, 431);
assert.equal(parsed.ownPlayer?.idle?.buildings.length, 10);
assert.equal(parsed.ownPlayer?.idle?.money, 9999);
assert.equal(parsed.ownPlayer?.idle?.upgrades.speed.length, 10);
assert.equal(parsed.ownPlayer?.idle?.upgrades.moneyIncreaseFlag, 1);

assert.equal(parsed.ownPlayer?.dailyTasks?.triplets.length, 2);
assert.equal(parsed.ownPlayer?.dailyTasks?.rewards?.length, 2);
assert.equal(parsed.ownPlayer?.dailyTasks?.rewards?.[0]?.collected, true);

assert.equal(parsed.ownPlayer?.achievements?.half, 115);
assert.equal(parsed.ownPlayer?.achievements?.entries.length, 115);
assert.equal(parsed.ownPlayer?.achievements?.entries[0]?.owned, true);
assert.equal(parsed.ownPlayer?.achievements?.entries[0]?.progress, 55);
assert.equal(parsed.ownPlayer?.achievements?.entries[3]?.owned, true);
assert.equal(parsed.ownPlayer?.achievements?.entries[3]?.progress, 99);

assert.equal(parsed.ownPlayer?.calendar?.values.length, 40);
assert.equal(parsed.ownPlayer?.units?.wall, 7);
assert.equal(parsed.ownPlayer?.units?.warriors, 8);
assert.equal(parsed.ownPlayer?.units?.mages, 9);
assert.equal(parsed.ownPlayer?.units?.archers, 10);

assert.equal(parsed.ownPlayer?.witch?.stage, 2);
assert.equal(parsed.ownPlayer?.witch?.items, 14);
assert.equal(parsed.ownPlayer?.witch?.itemsNext, 33);
assert.equal(parsed.ownPlayer?.witch?.item, 9);
assert.equal(parsed.ownPlayer?.witch?.finish, 1234 * 1000 - 3600000);
assert.equal(parsed.ownPlayer?.witch?.scrolls.length, 9);
assert.equal(parsed.ownPlayer?.witch?.scrolls[0]?.picIndex, 5678);
assert.equal(parsed.ownPlayer?.witch?.scrolls[0]?.type, 678);
assert.equal(parsed.ownPlayer?.witch?.scrolls[0]?.date, 2222 * 1000 - 3600000);

assert.equal(parsed.ownPlayer?.timestamp, 1764957283804);
assert.equal(parsed.ownPlayer?.fortressRank, 2329);
assert.equal(parsed.ownPlayer?.version, 2015);
assert.equal(parsed.ownPlayer?.webshopId, "VbGl8Msf$r466");

const samplePath = "/mnt/d/SFDataHub/sfdatahub-discord-bot/files_2025_12_07_12_31_02_593.json";
assert.ok(existsSync(samplePath), `sample json missing: ${samplePath}`);
const sampleParsed = parseSfJson(JSON.parse(readFileSync(samplePath, "utf8")));
assert.ok(sampleParsed.ownPlayer);
assert.ok(sampleParsed.ownPlayer?.equippedItems);
assert.ok(sampleParsed.ownPlayer?.backpackItems);
assert.ok(sampleParsed.ownPlayer?.companionItems);
assert.ok(sampleParsed.ownPlayer?.dummyItems);
assert.ok(sampleParsed.ownPlayer?.shakesItems);
assert.ok(sampleParsed.ownPlayer?.fidgetItems);
assert.ok(sampleParsed.ownPlayer?.pets);
assert.ok(sampleParsed.ownPlayer?.scrapbook);
assert.ok(sampleParsed.ownPlayer?.legendaryScrapbook);
assert.ok(sampleParsed.ownPlayer?.idle);
assert.ok(sampleParsed.ownPlayer?.dailyTasks);
assert.equal(sampleParsed.ownPlayer?.dailyTasks?.triplets.length, 19);
assert.equal(sampleParsed.ownPlayer?.dailyTasks?.rewards?.length, 3);
assert.equal(sampleParsed.ownPlayer?.underworld?.upgrade.finish, 1765921333 * 1000 - 3600000);
assert.equal(sampleParsed.ownPlayer?.dummyItems?.slots.length, 10);
assert.equal(sampleParsed.ownPlayer?.shakesItems?.slots.length, 6);
assert.equal(sampleParsed.ownPlayer?.fidgetItems?.slots.length, 6);
assert.ok(sampleParsed.ownPlayer?.achievements);
assert.ok(sampleParsed.ownPlayer?.calendar);
assert.ok(sampleParsed.ownPlayer?.units);
assert.ok(sampleParsed.ownPlayer?.witch);
assert.equal(sampleParsed.ownPlayer?.timestamp, 1764957283804);
assert.equal(sampleParsed.ownPlayer?.fortressRank, 2329);
assert.equal(sampleParsed.ownPlayer?.version, 2015);
assert.equal(sampleParsed.ownPlayer?.webshopId, "VbGl8Msf$r466");
assert.equal(typeof sampleParsed.ownPlayer?.description, "string");
assert.ok((sampleParsed.ownPlayer?.description ?? "").includes("Good soldiers"));

console.log("parseSfJson.dungeons-gtsave-resources test passed");
