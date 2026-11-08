import assert from "node:assert/strict";
import { createPreferencesStore, PLAYER_RADAR_MODES, PREFERENCES_KEY } from "../../../../src/lib/settings/preferences";

let raw = JSON.stringify({ schemaVersion: 1, general: { navigationMode: "sidebar" }, dataHub: {
  profiles: { attributeSumMode: "all-five", guildProfileMode: "total", playerRadarMode: "main" },
}, future: "preserve existing preferences".repeat(200) });
let rejectAll = false;
const attempts: string[] = [];
const storage = {
  getItem: (key: string) => key === PREFERENCES_KEY ? raw : null,
  setItem: (_key: string, value: string) => {
    attempts.push(value.startsWith("sfh:z") ? "compact" : "expanded");
    if (rejectAll || !value.startsWith("sfh:z")) throw new DOMException("quota", "QuotaExceededError");
    raw = value;
  },
};
let store = createPreferencesStore(() => storage);
for (const playerRadarMode of [...PLAYER_RADAR_MODES.slice(1), "main"] as const) {
  const result = store.savePreferences({ playerRadarMode }, store.getSnapshot());
  assert.equal(result.status, "saved");
  assert.deepEqual(attempts.splice(0), ["expanded", "compact"]);
  // A fresh document reads the choice from storage, not the live UI state.
  store = createPreferencesStore(() => storage);
  assert.equal(store.getSnapshot().playerRadarMode, playerRadarMode);
  assert.equal(store.getSnapshot().attributeSumMode, "all-five");
  assert.equal(store.getSnapshot().guildProfileMode, "total");
  assert.equal(store.getSnapshot().navigationMode, "sidebar");
}
console.log("PASS all four radar choices persist through the existing compact quota fallback");
const before = raw;
rejectAll = true;
assert.equal(store.savePreferences({ playerRadarMode: "class" }, store.getSnapshot()).status, "write-error");
assert.equal(raw, before);
assert.equal(store.getSnapshot().playerRadarMode, "main");
console.log("PASS failed persistence preserves the last durable preference");
