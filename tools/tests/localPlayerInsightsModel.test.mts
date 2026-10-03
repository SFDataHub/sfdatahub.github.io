import assert from "node:assert/strict";
import { calculateHighestNonNegativeXpPerDay } from "../../src/components/local-player-profile/localPlayerInsightsModel";

const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);

const tests = [
  {
    name: "hoechster XP/Tag-Wert verwendet gebrochene tatsaechliche Tagesdauer",
    run() {
      const result = calculateHighestNonNegativeXpPerDay([
        { scannedAtMs: START, xpTotal: 1_000 },
        { scannedAtMs: START + DAY_MS / 2, xpTotal: 1_500 },
        { scannedAtMs: START + DAY_MS * 2, xpTotal: 2_000 },
      ]);
      assert.equal(result, 1_000);
    },
  },
  {
    name: "negative und unvollstaendige XP-Intervalle werden ignoriert",
    run() {
      const result = calculateHighestNonNegativeXpPerDay([
        { scannedAtMs: START, xpTotal: 2_000 },
        { scannedAtMs: START + DAY_MS, xpTotal: 1_000 },
        { scannedAtMs: START + DAY_MS * 2, xpTotal: null },
        { scannedAtMs: START + DAY_MS * 3, xpTotal: 1_300 },
      ]);
      assert.equal(result, null);
    },
  },
  {
    name: "identische oder rueckwaerts laufende Zeitpunkte erzeugen keinen Wert",
    run() {
      const result = calculateHighestNonNegativeXpPerDay([
        { scannedAtMs: START, xpTotal: 1_000 },
        { scannedAtMs: START, xpTotal: 2_000 },
        { scannedAtMs: START - DAY_MS, xpTotal: 3_000 },
      ]);
      assert.equal(result, null);
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`ok - ${test.name}`);
}
