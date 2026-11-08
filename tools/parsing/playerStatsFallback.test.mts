import assert from "node:assert/strict";
import { readSfPlayerStats } from "../../src/lib/parsing/parseSfJson.ts";

const latestValues = { "Base Strength": 10, "Base Dexterity": 5, Strength: 25, Dexterity: 15 };
const sums = (row: unknown) => {
  const stats = readSfPlayerStats(row);
  return [stats.baseStats, stats.totalStats];
};

assert.deepEqual(sums({ latestValues }), [15, 40], "missing pairs use the latest attribute sums");
assert.deepEqual(sums({ baseStats: 7, latestValues }), [7, 40], "only the missing total falls back");
assert.deepEqual(sums({ totalStats: 9, latestValues }), [15, 9], "only the missing base falls back");
assert.deepEqual(sums({ baseStats: 0, totalStats: 0, latestValues }), [0, 0], "zero is a valid explicit sum");
assert.deepEqual(sums({ baseMain: 2, conBase: 3, attrTotal: 4, conTotal: 6, latestValues }), [5, 10], "pairs precede latest sums");
assert.deepEqual(sums({ sumBaseTotal: 100, totalStats: 200, baseMain: 2, conBase: 3, latestValues }), [100, 200], "explicit sums precede pairs");
assert.deepEqual(sums({ latestValues: { "Base Strength": 10, Strength: 25 } }), [null, null], "one known attribute cannot form a sum");
assert.deepEqual(sums({ latestValues, "Base Strength": 20, Strength: 30 }), [25, 45], "top-level values retain merge precedence");
assert.deepEqual(sums(null), [null, null]);
console.log("playerStatsFallback passed");
