import assert from "node:assert/strict";
import { normalizeToplistViews, normalizeColumnView, newToplistView, defaultToplistColumns } from "../../../../src/lib/toplists/toplistColumns";
import { createPreferencesStore, PREFERENCES_KEY } from "../../../../src/lib/settings/preferences";
import { CLASSES } from "../../../../src/data/classes";
import { loadFromStorage } from "../../../../src/components/Filters/FilterContext";
let checks = 0;
function check(name: string, test: () => void) { test(); checks++; console.log("PASS " + name); }
const legacy = { players: { mode: "custom", columns: ["sum", "name", "level"], future: 42 }, guilds: { mode: "default", columns: ["members", "name"] } };
const migrated = normalizeToplistViews(legacy);
check("W149 selection, order, active state, inactive configuration and unknown fields", () => {
  assert.deepEqual(migrated.players.columns, legacy.players.columns);
  assert.equal(migrated.players.activeId, "w149-custom"); assert.equal(migrated.players.future, 42);
  assert.equal(migrated.guilds.activeId, "default"); assert.deepEqual(migrated.guilds.views[0].columns, ["members", "name"]);
  assert.deepEqual(normalizeToplistViews(migrated), migrated);
});
const added = newToplistView(migrated.players, "players", "Custom", false);
const copied = newToplistView(added, "players", "Custom", true);
check("Independent IDs, duplicate names allowed, Default seed and independent copy", () => {
  assert.notEqual(added.activeId, copied.activeId); assert.equal(copied.views.length, 3);
  assert.deepEqual(added.columns, defaultToplistColumns("players"));
  copied.columns.push("server"); assert.ok(!added.columns.includes("server"));
  assert.throws(() => newToplistView(added, "players", " ", false));
});
check("Rename retains identity; delete active falls back; mandatory movable name", () => {
  const renamed = normalizeColumnView({ ...added, views: added.views.map(v => ({ ...v, name: "Renamed" })) }, "players");
  assert.equal(renamed.activeId, added.activeId);
  assert.equal(normalizeColumnView({ ...renamed, views: renamed.views.filter(v => v.id !== renamed.activeId) }, "players").activeId, "default");
  assert.deepEqual(normalizeColumnView({ mode: "custom", columns: ["sum", "sum", "bad"] }, "players").columns, ["sum", "name"]);
  assert.deepEqual(normalizeColumnView({ ...added, activeId: "default", columns: ["name"] }, "players").columns, defaultToplistColumns("players"));
});
let raw: string | null = JSON.stringify({ schemaVersion: 1, future: true, dataHub: { extra: 3, toplists: legacy } });
let fail = false;
const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { if (fail) throw Error("quota"); raw = value; } };
const store = createPreferencesStore(() => storage);
const basis = store.getSnapshot();
check("Preference update preserves other list, unrelated and unknown preferences", () => {
  assert.equal(store.savePreferences({ toplistViews: { ...basis.toplistViews, players: added } }, basis).status, "saved");
  assert.deepEqual(store.getSnapshot().toplistViews.guilds, migrated.guilds);
  assert.equal(JSON.parse(raw!).dataHub.extra, 3); assert.equal(JSON.parse(raw!).future, true);
});
check("Stale settings cannot overwrite direct changes; write errors do not publish success", () => {
  assert.equal(store.savePreferences({ toplistViews: migrated }, basis).status, "conflict");
  const current = store.getSnapshot(); fail = true;
  assert.equal(store.savePreferences({ toplistViews: migrated }, current).status, "write-error");
  assert.equal(store.getSnapshot(), current); fail = false;
});
Object.assign(globalThis, { localStorage: { getItem: (_key: string) => raw, setItem: storage.setItem } });
const load = (value: unknown) => { raw = value === undefined ? null : JSON.stringify(value); return loadFromStorage("SFH_LOCAL_TL_FILTERS_V1", undefined, true).state; };
check("Missing and invalid classes are All, stored All and partial are exact, versioned Clear is empty", () => {
  const all = CLASSES.map(c => c.key);
  assert.deepEqual(load(undefined).classes, all); assert.deepEqual(load({ classes: ["unknown"], localClassSelectionVersion: 1 }).classes, all);
  assert.deepEqual(load({ classes: all, localClassSelectionVersion: 1 }).classes, all);
  assert.deepEqual(load({ classes: ["mage", "warrior"] }).classes, ["warrior", "mage"]);
  assert.deepEqual(load({ classes: [], localClassSelectionVersion: 1 }).classes, []);
  assert.deepEqual(load({ classes: [] }).classes, all);
});
check("Durable filters and Compare restore together; open picker does not restore", () => {
  const state = load({ servers: ["f8_net"], classes: ["mage"], guilds: ["Zeta"], favoritesOnly: true, searchText: "Hero", sortBy: "level", serverSheetOpen: true, localTable: { searchMode: "filter", playerDirection: "asc", playerValueMode: "total", guildValueMode: "total", guildSort: { metricKey: "guildHonor", direction: "asc" }, compareMode: "months", compareFromMonth: "2026-08", compareToMonth: "2026-09" } });
  assert.deepEqual(state.servers, ["f8_net"]); assert.deepEqual(state.classes, ["mage"]); assert.equal(state.serverSheetOpen, false);
  assert.equal(state.localTable?.compareMode, "months"); assert.equal(state.localTable?.guildSort.metricKey, "guildHonor");
  assert.equal(state.searchText, "Hero"); assert.equal(state.sortBy, "level");
});
check("Read errors retain defaults and refuse implicit repair", () => {
  raw = "{broken"; const result = loadFromStorage("SFH_LOCAL_TL_FILTERS_V1", undefined, true);
  assert.equal(result.writable, false); assert.equal(result.state.classes.length, CLASSES.length);
});
console.log(`${checks} targeted contracts passed; storage key ${PREFERENCES_KEY}`);
