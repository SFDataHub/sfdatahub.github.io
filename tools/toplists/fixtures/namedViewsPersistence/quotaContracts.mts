import assert from "node:assert/strict";
import { CLASSES } from "../../../../src/data/classes";
import { DEFAULT_LOCAL_TABLE, loadFromStorage, persistLocalFilters } from "../../../../src/components/Filters/FilterContext";

const key = "SFH_LOCAL_TL_FILTERS_V1";
let raw: string | null = null;
let attempts = 0;
let unavailable = false;
const storage = {
  getItem: () => raw,
  setItem: (_key: string, value: string) => {
    attempts++;
    if (unavailable || value.length > 284) throw new DOMException("Origin quota exhausted", "QuotaExceededError");
    raw = value;
  },
};
Object.assign(globalThis, { localStorage: storage });
const initial = loadFromStorage(key, undefined, true).state;
const all = CLASSES.map(c => c.key);
for (const classes of [all, ["warrior", "mage"], []]) {
  const state = { ...initial, servers: ["F28"], classes, sortBy: "level", localTable: { ...DEFAULT_LOCAL_TABLE, compareMode: "months" as const, compareFromMonth: "2026-08", compareToMonth: "2026-09" } };
  attempts = 0;
  const persisted = persistLocalFilters(storage, key, raw, state);
  assert.equal(attempts, 2, "Full write hits quota; compact write succeeds");
  assert.equal(raw, persisted);
  assert.ok(!Object.hasOwn(JSON.parse(raw!), "classes"));
  const restored = loadFromStorage(key, undefined, true).state;
  assert.deepEqual(restored.classes, classes);
  assert.deepEqual(restored.servers, ["F28"]);
  assert.equal(restored.sortBy, "level");
  assert.deepEqual(restored.localTable, state.localTable);
  // Server edits and subsequent writes must use the successful compact basis.
  const next = { ...restored, servers: ["F29"] };
  persistLocalFilters(storage, key, raw, next);
  assert.deepEqual(loadFromStorage(key, undefined, true).state.classes, classes);
  console.log(`PASS quota -> compact save -> reload: ${classes.length} classes, server/Compare/other filters preserved`);
}
for (const mask of [-1, 4096, 0.5, "0", null]) {
  raw = JSON.stringify({ localClassSelectionVersion: 1, localClassSelectionMask: mask });
  assert.deepEqual(loadFromStorage(key, undefined, true).state.classes, all);
}
raw = JSON.stringify({ localClassSelectionMask: 0 });
assert.deepEqual(loadFromStorage(key, undefined, true).state.classes, all, "Unversioned invalid data is not Clear");
raw = JSON.stringify({ classes: ["mage"], localClassSelectionVersion: 1, localClassSelectionMask: 0 });
assert.deepEqual(loadFromStorage(key, undefined, true).state.classes, ["mage"], "Full valid selection takes precedence over stale wire metadata");
unavailable = true;
const before = raw;
assert.throws(() => persistLocalFilters(storage, key, raw, initial), { name: "QuotaExceededError" });
assert.equal(raw, before, "Failed fallback never reports or stores success");
assert.throws(() => persistLocalFilters({ setItem: () => { throw new DOMException("blocked", "SecurityError"); } }, key, raw, initial), { name: "SecurityError" });
console.log("PASS invalid masks/defaults, stale metadata, exhausted fallback and access-error contracts");
