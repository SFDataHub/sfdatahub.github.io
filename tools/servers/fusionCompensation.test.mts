import assert from "node:assert/strict";

import type { LocalServerDefinition } from "../../src/data/serverRegistry.ts";
import {
  calculateFusionLevelCompensationFromOrigins,
  calculateThirtyDayMonthDifference,
  floorToPreviousHalfMonth,
  getFusionLevelCompensation,
  getFusionPathLevelCompensation,
} from "../../src/lib/servers/fusionCompensation.ts";

const levelFromMonths = (months: number) => Math.floor(months * 2);

assert.equal(floorToPreviousHalfMonth(0.49), 0);
assert.equal(levelFromMonths(0.49), 0);
assert.equal(floorToPreviousHalfMonth(0.5), 0.5);
assert.equal(levelFromMonths(0.5), 1);
assert.equal(floorToPreviousHalfMonth(0.99), 0.5);
assert.equal(levelFromMonths(0.99), 1);
assert.equal(floorToPreviousHalfMonth(1), 1);
assert.equal(levelFromMonths(1), 2);
assert.equal(floorToPreviousHalfMonth(1.49), 1);
assert.equal(levelFromMonths(1.49), 2);
assert.equal(floorToPreviousHalfMonth(1.5), 1.5);
assert.equal(levelFromMonths(1.5), 3);

assert.equal(calculateThirtyDayMonthDifference("2023-02-24", "2023-01-06"), 49 / 30);

const eu1 = getFusionLevelCompensation("EU1", "F28");
const eu2 = getFusionLevelCompensation("EU2", "F28");
const eu3 = getFusionLevelCompensation("EU3", "F28");
const eu4 = getFusionLevelCompensation("EU4", "F28");
assert.equal(eu1.available && eu1.compensationLevels, 0);
assert.equal(eu2.available && eu2.compensationLevels, 3);
assert.equal(eu3.available && eu3.compensationLevels, 6);
assert.equal(eu4.available && eu4.compensationLevels, 9);

const eu2Path = getFusionPathLevelCompensation("EU2", "F28");
assert.equal(eu2Path.available && eu2Path.compensationLevels, 3);

const es10ToMaerwynn = getFusionPathLevelCompensation("ES10", "MAERWYNN");
assert.equal(es10ToMaerwynn.available && es10ToMaerwynn.compensationPolicy, "none");
assert.equal(es10ToMaerwynn.available && es10ToMaerwynn.compensationLevels, 0);

const br1ToMaerwynn = getFusionPathLevelCompensation("BR1", "MAERWYNN");
assert.equal(br1ToMaerwynn.available && br1ToMaerwynn.compensationPolicy, "none");
assert.equal(br1ToMaerwynn.available && br1ToMaerwynn.compensationLevels, 0);

assert.deepEqual(getFusionPathLevelCompensation("W46", "F24"), {
  available: false,
  reason: "unknown-compensation-policy",
  originServer: "W46",
  destinationServer: "F24",
});

assert.deepEqual(getFusionLevelCompensation("W46", "F24"), {
  available: false,
  reason: "unknown-compensation-policy",
  originServer: "W46",
  destinationServer: "F24",
});

const firstStageToMaerwynn = getFusionLevelCompensation("F1", "MAERWYNN");
assert.equal(firstStageToMaerwynn.available && firstStageToMaerwynn.compensationPolicy, "none");
assert.equal(firstStageToMaerwynn.available && firstStageToMaerwynn.compensationApplicable, false);
assert.deepEqual(getFusionLevelCompensation("BR1", "MAERWYNN"), {
  available: false,
  reason: "origin-not-in-fusion-group",
  originServer: "BR1",
  destinationServer: "MAERWYNN",
});

const originWithoutDate: LocalServerDefinition = {
  code: "EU2",
  displayName: "EU 2",
  host: "s2.sfgame.eu",
  region: "EU",
  type: "origin",
  active: false,
  aliases: [],
};
const oldest: LocalServerDefinition = {
  code: "EU1",
  displayName: "EU 1",
  host: "s1.sfgame.eu",
  releaseDate: "2023-01-06",
  region: "EU",
  type: "origin",
  active: false,
  aliases: [],
};
const destination: LocalServerDefinition = {
  code: "F28",
  displayName: "Fusion 28",
  host: "f28.sfgame.net",
  region: "Fusion",
  type: "fusion",
  active: true,
  aliases: [],
};
assert.deepEqual(
  calculateFusionLevelCompensationFromOrigins(originWithoutDate, destination, [oldest, originWithoutDate], "levelGoldV1"),
  {
    available: false,
    reason: "missing-release-date",
    originServer: "EU2",
    destinationServer: "F28",
  },
);
assert.deepEqual(calculateFusionLevelCompensationFromOrigins(originWithoutDate, destination, [oldest, originWithoutDate], "none"), {
  available: true,
  compensationPolicy: "none",
  compensationApplicable: false,
  originServer: "EU2",
  destinationServer: "F28",
  oldestOriginServer: null,
  originReleaseDate: null,
  oldestReleaseDate: null,
  rawMonthDifference: null,
  flooredHalfMonths: null,
  compensationLevels: 0,
});
assert.deepEqual(calculateFusionLevelCompensationFromOrigins(originWithoutDate, destination, [oldest, originWithoutDate], "unknown"), {
  available: false,
  reason: "unknown-compensation-policy",
  originServer: "EU2",
  destinationServer: "F28",
});

console.log("fusionCompensation test passed");
