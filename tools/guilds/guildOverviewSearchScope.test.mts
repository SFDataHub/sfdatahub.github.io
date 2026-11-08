import assert from "node:assert/strict";
import { constrainHubSearchQuery, restoreHubSearchQuery } from "../../src/lib/data-hub/useHubSearch.ts";
import { defaultHubSearchQuery, type HubSearchQuery } from "../../src/lib/data-hub/hubSearchService.ts";

const key = "sfdatahub:hub-search:v1:guild-overview";
const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const sessions = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (name: string) => sessions.get(name) ?? null } });
const overview = (query: HubSearchQuery) => constrainHubSearchQuery(query, "guild", false, "current");
try {
  const fresh = overview(restoreHubSearchQuery(key));
  assert.deepEqual(fresh, { ...defaultHubSearchQuery, kind: "guild", mode: "profile", scope: { kind: "current" } });
  const historical: HubSearchQuery = { text: "Guild", kind: "both", mode: "toplist", scope: { kind: "historical", from: "2026-09", to: "2026-09", server: "F9" } };
  sessions.set(key, JSON.stringify(historical));
  sessions.set("sfdatahub:hub-search:v1", "dashboard sentinel");
  sessions.set("sfdatahub:hub-search:v1:player-overview", "player sentinel");
  const restored = restoreHubSearchQuery(key);
  assert.deepEqual(restored, historical, "generic restore retains supported historical sessions");
  assert.deepEqual(overview(restored), { text: "Guild", kind: "guild", mode: "profile", scope: { kind: "current" } });
  assert.deepEqual(restored, historical, "constraint does not mutate restored input");
  assert.deepEqual(overview({ ...restored, text: "Another query" }).scope, { kind: "current" }, "subsequent updates cannot restore hidden filters");
  assert.deepEqual(constrainHubSearchQuery(restored, "guild"), { ...historical, kind: "guild", mode: "profile" }, "legacy guild scope remains supported");
  assert.deepEqual(constrainHubSearchQuery(restored, "player"), { ...historical, kind: "player", mode: "profile" }, "player scope remains unchanged");
  assert.deepEqual(constrainHubSearchQuery(restored, undefined, true), { ...historical, scope: { kind: "current" } }, "dashboard retains both/current and its selected target mode");
  assert.equal(sessions.get("sfdatahub:hub-search:v1"), "dashboard sentinel");
  assert.equal(sessions.get("sfdatahub:hub-search:v1:player-overview"), "player sentinel");
  sessions.set(key, JSON.stringify({ ...historical, scope: { kind: "current", server: "F9", from: "2026-09", to: "2026-09" } }));
  assert.deepEqual(overview(restoreHubSearchQuery(key)).scope, { kind: "current" }, "scope contains no leftover server/month values");
  for (const damaged of ["broken JSON", JSON.stringify({ ...historical, scope: { kind: "historical", from: "bad", to: "bad" } })]) {
    sessions.set(key, damaged);
    assert.deepEqual(overview(restoreHubSearchQuery(key)), fresh, "existing damaged-session fallback remains current");
  }
  console.log("PASS guild Overview fixed current scope, fresh/stored/damaged sessions, preserved text, update constraint and unchanged legacy/dashboard consumers");
} finally {
  if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
}
