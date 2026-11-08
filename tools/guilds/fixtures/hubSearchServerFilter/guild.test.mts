import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { seedLocalSourceValidityFixture } from "../../localSourceValidityFixture.mts";
import { linkGuildAliases } from "../../../../src/lib/identities/guildIdentityStore.ts";
import { HubSearchController, defaultHubSearchQuery } from "../../../../src/lib/data-hub/hubSearchService.ts";
import { resolveHubSearchTarget } from "../../../../src/lib/data-hub/hubTargetResolver.ts";
import { parseObservation } from "../../../../src/lib/data-hub/routes.ts";

const at = Date.UTC(2026, 9, 4);
await seedLocalSourceValidityFixture({ id: "guild-filter", contentHash: "guild-filter-hash", filename: "guild-filter.json",
  importedAt: new Date(at + 999999).toISOString(), scannedAt: null, servers: [], playerCount: 0, groupCount: 2,
  rawData: { players: [], groups: [{ identifier: "f8_net_g42", name: "Endgegner", timestamp: at },
    { identifier: "eu5_net_g42", name: "Endgegner Newer", timestamp: at + 1000 }] } });
await linkGuildAliases("f8_net_g42", "eu5_net_g42", { source: "manual", confirmedAt: new Date(at).toISOString() });
const controller = new HubSearchController({ loadArchive: async () => ({ entries: [], failed: 0, unknown: 0 }) });
controller.start({ ...defaultHubSearchQuery, kind: "guild", text: "End, F8" });
for (let i = 0; controller.getSnapshot().local.preparing && i < 500; i++) await new Promise(r => setTimeout(r, 10));
const hit = controller.getSnapshot().hits[0];
assert.equal(hit.identity, "confirmed"); assert.equal(hit.name, "Endgegner");
assert.deepEqual(hit.references.map(r => r.identifier), ["f8_net_g42"]); assert.equal(hit.occurrences.length, 1);
const options = { allowed: () => true, accessAllowed: () => true };
const profile = await resolveHubSearchTarget(hit, { ...options, mode: "profile" });
assert(profile.path.includes("/f8/"));
const observation = parseObservation("?" + profile.path.split("?")[1]);
assert.equal(observation.kind, "exact");
if (observation.kind === "exact") { assert.equal(observation.anchor.source, "guild-filter"); assert.equal(observation.anchor.at, at); }
const toplist = await resolveHubSearchTarget(hit, { ...options, mode: "toplist" });
assert.equal(toplist.state.hubToplistTarget?.server, "F8"); assert.deepEqual(toplist.state.hubToplistTarget?.identifiers, ["f8_net_g42"]);
controller.dispose();
console.log("PASS confirmed guild: filtered name, occurrence, anchored profile and toplist use F8 despite newer EU identity observation");
