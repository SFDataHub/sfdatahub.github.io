import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { seedLocalSourceValidityFixture } from "../../localSourceValidityFixture.mts";
import { readGuildHubSearchRows } from "../../../../src/lib/guilds/localScanLibrary.ts";
import { buildHubSearchProjection } from "../../../../src/lib/data-hub/hubSearchProjection.ts";
import { aggregateHubSearchHits, defaultHubSearchQuery } from "../../../../src/lib/data-hub/hubSearchService.ts";

const at = Date.UTC(2026, 9, 4);
const { scan } = await seedLocalSourceValidityFixture({ id: "time-evidence", contentHash: "time-evidence-hash", filename: "recent-file.json",
  importedAt: new Date(at + 999999).toISOString(), scannedAt: new Date(at + 999999).toISOString(), servers: ["F8"], playerCount: 1, groupCount: 1,
  rawData: { timestamp: at + 100000, players: [{ identifier: "f8_net_p1", name: "Same" }], groups: [{ identifier: "f8_net_g1", name: "Same" }] } });
const project = (rawData: unknown) => {
  const input = { ...scan, rawData };
  return buildHubSearchProjection(input, readGuildHubSearchRows(input), "[]").documents;
};
const file = project(scan.rawData);
assert.deepEqual(file.map(d => [d.at, d.timeQuality]), [[at + 100000, "file"], [at + 100000, "file"]]);
const unknown = project({ players: [{ identifier: "f8_net_p1", name: "Same" }], groups: [] });
assert.equal(unknown[0].at, null); assert.equal(unknown[0].timeQuality, "unknown");
const direct = project({ players: [{ identifier: "f8_net_p2", name: "Same", timestamp: at }], groups: [] });
assert.equal(direct[0].timeQuality, "observation");
const result = aggregateHubSearchHits([...file, ...direct].map(local => ({ ...local, local })), undefined,
  { ...defaultHubSearchQuery, text: "Same", kind: "player" }, 1, 1);
assert.equal(result.hits[0].reference?.identifier, "f8_net_p2");
console.log("PASS individual time outranks newer file clock; absent row/root time ignores importedAt and scannedAt; guild header time remains file evidence");
