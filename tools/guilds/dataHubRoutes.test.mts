import assert from "node:assert/strict";
import { LEGACY_DATA_HUB_ROUTES, localCopyLink, localEntityPath, parseLocalEntity, parseObservation, safeLocalReturn, registerAppReturnRoutes } from "../../src/lib/data-hub/routes.ts";
const entity = parseLocalEntity("player", "F8", "f8_net_p123"); assert.ok(entity);
assert.equal(entity.serverNamespace, "f8");
for (const [server, id] of [["F9", "f8_net_p123"], ["F8", "123"], ["unknown", "unknown_p123"], ["F8", "f8_net_g123"]]) assert.equal(parseLocalEntity("player", server, id), null);
console.log("PASS full entity identifiers and registry namespaces");
const anchor = { source: "source & +/%", at: 1700000000000, row: "f8_net_p123", snapshot: "source & +/%::1700000000000", hash: "abc" };
const path = localEntityPath("player", entity, anchor);
assert.deepEqual(parseObservation(path.slice(path.indexOf("?"))), { kind: "exact", anchor });
assert.deepEqual(parseObservation("?unrelated=1"), { kind: "free" });
for (const bad of ["?at=1", "?source=s", "?source=s&at=1&snapshot=wrong", "?source=s&at=NaN", "?source=s&at=0", "?source=s&at=1&row=", "?source=s&source=t&at=1", "?source=s&at=9007199254740992"]) assert.equal(parseObservation(bad).kind, "invalid");
console.log("PASS durable observation query and invalid combinations");
for (const base of ["/", "/test/", "/beta/"]) {
  assert.equal(localCopyLink(path, `https://fixture.test${base}?deployment=1#/old`), `https://fixture.test${base}?deployment=1#${path}`);
}
console.log("PASS root, test and beta deployment copy links");
for (const bad of ["https://external.test/", "//external.test/", "javascript:1", "/data-hub/../evil", "/data-hub\\evil", "/unknown", "/player/f8_net_p123", "/data-hub/player-hub/player/F9/f8_net_p123", "/data-hub/player-hub/player/F8/%zz", "/data-hub#evil"]) assert.equal(safeLocalReturn(bad), null);
assert.equal(safeLocalReturn(path), path);
assert.equal(Object.keys(LEGACY_DATA_HUB_ROUTES).length, 16);
assert.equal(LEGACY_DATA_HUB_ROUTES["/guild-hub/toplist"], "/data-hub/toplist");
assert.equal(LEGACY_DATA_HUB_ROUTES["/guild-hub/compare-guilds"], "/data-hub/analytics");
assert.equal(LEGACY_DATA_HUB_ROUTES["/guild-hub/imports"], "/data-hub/guild-hub/import");
assert.equal(LEGACY_DATA_HUB_ROUTES["/guild-hub/unknown"], undefined);
console.log("PASS known local return targets and exhaustive legacy mapping");

// Global search origins use actual router declarations; the fallback must not accept arbitrary strings.
registerAppReturnRoutes([{ children: [
  { path: "/" }, { path: "/help" }, { path: "/community/news" }, { path: "/u/:profileId" },
  { path: "/guidehub/*" }, { path: "*" },
] }]);
for (const target of ["/", "/help?section=search", "/community/news", "/u/123", "/guidehub/players"]) assert.equal(safeLocalReturn(target), target);
for (const bad of ["https://external.test/help", "//external.test/help", "/unknown", "/community/unknown", "/guidehub/../help", "/guidehub/%2e%2e/help", "/guidehub/%5cexternal", "/DATA-HUB/player-hub/player/F9/f8_net_p123", "/data%2dhub/player-hub/player/F9/f8_net_p123", "/u/%zz", "/help#external", "/data-hub/player-hub/player/F9/f8_net_p123"]) assert.equal(safeLocalReturn(bad), null);
assert.equal(safeLocalReturn(path), path);
// Page Back rejects self returns even if the query or a legacy route differs.
assert.equal(safeLocalReturn("/data-hub/identity-matching?previous=1", "/data-hub/identity-matching"), null);
assert.equal(safeLocalReturn("/guild-hub/fight-tracking?previous=1", "/data-hub/guild-hub/fight-tracking"), null);
assert.equal(safeLocalReturn("/data-hub/guild-hub/fight-tracking", "/guild-hub/fight-tracking"), null);
assert.equal(safeLocalReturn("/data-hub/identity-matching", "/DATA-HUB/IDENTITY-MATCHING/"), null);
assert.equal(safeLocalReturn("/help?section=search", "/data-hub/identity-matching"), "/help?section=search");
assert.equal(safeLocalReturn("/", "/data-hub/identity-matching"), "/");
assert.equal(safeLocalReturn(path, "/data-hub/guild-hub/fight-tracking"), path);
assert.equal(safeLocalReturn("/data-hub/identity-matching?previous=1"), "/data-hub/identity-matching?previous=1");
console.log("PASS page self-return prevention, query preservation and genuine Home origin");
registerAppReturnRoutes([]);
console.log("PASS registered global origins, fallback exclusion and existing local source validation");
