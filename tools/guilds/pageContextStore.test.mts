import assert from "node:assert/strict";
import { PageContextStore, PAGE_CONTEXT_PREFIX, pageGuildReference } from "../../src/lib/data-hub/pageContextStore.ts";
import { applyFavoriteOperation } from "../../src/lib/data-hub/hubFavoritesStore.ts";
import { guildFavorite, migrateGuildFavorites } from "../../src/lib/data-hub/hubFavoritesContract.ts";

const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
const store = new PageContextStore(() => storage);
const guild = (id: number) => ({ id: `f8_net_g${id}`, guildId: String(id), name: `Guild ${id}`, server: "F8", logoIdentifier: `f8_net_g${id}` });
const a = pageGuildReference(guild(1)), b = pageGuildReference(guild(2));
let dashboardNotifications = 0, analyticsNotifications = 0;
store.subscribe("guild-dashboard", () => dashboardNotifications++);
store.subscribe("guild-analytics", () => analyticsNotifications++);
store.selectGuild("guild-dashboard", a); store.selectGuild("guild-analytics", b);
store.selectGuild("guild-hub", b);
assert.deepEqual(store.get("guild-dashboard").guild, a);
assert.deepEqual(store.get("guild-analytics").guild, b);
assert.equal(dashboardNotifications, 1); assert.equal(analyticsNotifications, 1);
console.log("PASS independent feature inputs, generations and subscriptions");

const reload = new PageContextStore(() => storage);
assert.deepEqual(reload.get("guild-dashboard").guild, a); assert.deepEqual(reload.get("guild-analytics").guild, b);
const early = new PageContextStore(() => storage);
const before = early.get("fight-tracking").generation;
early.selectGuild("fight-tracking", b); early.initializeGuild("fight-tracking", a, before);
assert.deepEqual(early.get("fight-tracking").guild, b);
early.selectGuild("fight-tracking", null);
early.initializeGuild("fight-tracking", a, early.get("fight-tracking").generation);
assert.equal(new PageContextStore(() => storage).get("fight-tracking").guild, null);
console.log("PASS reload restores each own context; early choice and explicit clear defeat late legacy initialization");

store.selectServers(["F28"]); store.selectGuild("guild-dashboard", b);
store.initializeServers(["F8"], 0);
assert.deepEqual(new PageContextStore(() => storage).get("local-toplist").servers, ["F28"]);
store.selectServers([]); store.initializeServers(["F8"], store.get("local-toplist").generation);
assert.deepEqual(store.get("local-toplist").servers, []);
const otherTab = new PageContextStore(() => ({ getItem: () => null, setItem: () => {} }));
assert.equal(otherTab.get("guild-dashboard").initialized, false);
console.log("PASS manual/missing/empty toplist server survives foreign selection, late default, reload; separate tab storage");

reload.acceptTarget("guild-dashboard", b, "navigation-1");
reload.selectGuild("guild-dashboard", null);
new PageContextStore(() => storage).acceptTarget("guild-dashboard", b, "navigation-1");
assert.equal(new PageContextStore(() => storage).get("guild-dashboard").guild, null);
reload.acceptTarget("guild-dashboard", a, "navigation-2");
assert.deepEqual(reload.get("guild-dashboard").guild, a);
reload.acceptTarget("guild-dashboard", b, "navigation-1");
assert.deepEqual(reload.get("guild-dashboard").guild, a);
console.log("PASS explicit target overrides own session once; remount/reload does not replay consumed router target after clear");

let snapshot = migrateGuildFavorites({ selectedGuilds: [guild(1), guild(2)], activeGuildId: guild(1).id }, null);
const compatibility = structuredClone(snapshot.compatibility);
store.selectGuild("guild-dashboard", a);
for (const operation of [{ type: "save" as const, favorite: guildFavorite(guild(3), 0, null, false) }, { type: "reorderGuild" as const, id: guild(2).id, targetIndex: 0 }, { type: "removeGuild" as const, id: guild(1).id }]) {
  snapshot = applyFavoriteOperation(snapshot, operation, snapshot.record.recordRevision);
  assert.deepEqual(snapshot.compatibility, compatibility);
  assert.deepEqual(store.get("guild-dashboard").guild, a);
}
assert.throws(() => applyFavoriteOperation(snapshot, { type: "selectGuild", id: guild(2).id }, snapshot.record.recordRevision), /read-only/);
assert.throws(() => applyFavoriteOperation(snapshot, { type: "replaceGuilds", state: { selectedGuilds: [guild(2)], activeGuildId: guild(2).id, compatibilityRevision: 1 } }, snapshot.record.recordRevision), /read-only/);
console.log("PASS save/remove/reorder retain historical compatibility and page reference; obsolete active writers reject");

values.set(PAGE_CONTEXT_PREFIX + "guild-dashboard", '{"schemaVersion":99}');
const invalid = new PageContextStore(() => storage); invalid.initializeGuild("guild-dashboard", a, 0);
assert.equal(invalid.get("guild-dashboard").guild, null); assert.match(invalid.get("guild-dashboard").error!, /Invalid/);
invalid.selectGuild("guild-dashboard", b); assert.equal(invalid.get("guild-dashboard").error, null);
const unavailable = new PageContextStore(() => { throw Error("blocked storage"); });
unavailable.selectGuild("guild-dashboard", a);
assert.deepEqual(unavailable.get("guild-dashboard").guild, a); assert.match(unavailable.get("guild-dashboard").error!, /blocked/);
assert(!JSON.stringify([...values.values()]).includes("rawPlayer"));
console.log("PASS invalid/failed session is explained, never silently overwritten by legacy; explicit choice recovers metadata only");

const blankValues = new Map<string, string>();
const blankStorage = {getItem: (key: string) => blankValues.get(key) ?? null, setItem: (key: string, value: string) => {blankValues.set(key,value);}};
const emptyStart = new PageContextStore(() => blankStorage);
emptyStart.initializeServers([], emptyStart.get("local-toplist").generation);
assert.deepEqual(new PageContextStore(() => blankStorage).get("local-toplist").servers, []);
emptyStart.initializeServers(["F8", "STUMBLESTEPPE"], emptyStart.get("local-toplist").generation);
assert.deepEqual(emptyStart.get("local-toplist").servers, []);
emptyStart.selectServers(["F8", "STUMBLESTEPPE"]);
const allRestore = new PageContextStore(() => blankStorage);
allRestore.initializeServers([], allRestore.get("local-toplist").generation);
assert.deepEqual(allRestore.get("local-toplist").servers, ["F8", "STUMBLESTEPPE"], "existing complete scopes retain their unverifiable provenance");
allRestore.selectServers([]);
allRestore.acceptToplistTarget("STUMBLESTEPPE", "explicit-target");
assert.deepEqual(allRestore.get("local-toplist").servers, ["STUMBLESTEPPE"]);
allRestore.selectServers([]);
assert.equal(new PageContextStore(() => blankStorage).acceptToplistTarget("STUMBLESTEPPE", "explicit-target"), false);
assert.deepEqual(new PageContextStore(() => blankStorage).get("local-toplist").servers, []);
console.log("PASS empty ordinary default, late manifest veto, preserved complete own scopes, single-server explicit target and consumed-target empty reload");
