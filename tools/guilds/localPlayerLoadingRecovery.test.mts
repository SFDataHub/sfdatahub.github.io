import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { openDB } from "idb";
import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
import { inputs, anchor } from "./fixtures/localPlayerAnalyticsCoordinator/inputs.ts";
import { importGuildHubLocalScan, listGuildHubScanSummaries, readGuildHubLocalScanSourceValidity } from "../../src/lib/guilds/localScanLibrary.ts";
import { startSharedPlayerCardsRun } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
import { sharedAnalyticsPreparation, sourcePreparationKey } from "../../src/lib/local-player-profile/sharedPreparation.ts";
import { DERIVED_ANALYTICS_VERSION } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
import { prepareLocalPlayerHistory, emptyProfileBuildCounters } from "../../src/lib/local-player-profile/historyBasis.ts";
const input = inputs[3];
const { summary } = await seedLocalSourceValidityFixture({ ...input, filename: "recovery.json", contentHash: "recovery-hash", importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length });
const db = await openDB("sfdatahub-local-data");
const peer = await seedLocalSourceValidityFixture({ ...inputs[1], filename: "history.json", contentHash: "history-hash", importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: inputs[1].rawData.players.length, groupCount: 1 });
await db.put("scans", { ...peer.scan, normalizerVersion: 0, coreNormalizerVersion: 0 });
await db.put("scanSummaries", { ...peer.summary, normalizerVersion: 0, coreNormalizerVersion: 0 });


const summaries = await listGuildHubScanSummaries();
console.log("before history proof", JSON.stringify({ sourceId: peer.scan.id, expected: sourcePreparationKey(summaries.find(s => s.sourceScanId === peer.scan.id)!, "proof"), actual: (await readGuildHubLocalScanSourceValidity([peer.scan.id])).get(peer.scan.id) }));
const run = startSharedPlayerCardsRun({ summaries: summaries.filter(s => s.sourceScanId === input.id), serverFilter: "f8_net" });
try {
  const result = await run.promise;
  assert.ok(result.index.players.length);
  console.log("PASS older supported normalizers repaired on demand; cards valid", result.index.players.length);
} finally { run.cancel(); db.close(); }
const analytics = await openDB("sfdatahub-guild-analytics");
const derived = await analytics.get("sources", peer.scan.id);
assert.equal(derived.derivedVersion, DERIVED_ANALYTICS_VERSION);
await analytics.put("sources", { ...derived, derivedVersion: DERIVED_ANALYTICS_VERSION - 1 });
analytics.close();
for (const expectedBuilds of [1, 0]) {
  const before = sharedAnalyticsPreparation.inspect();
  const next = startSharedPlayerCardsRun({ summaries: (await listGuildHubScanSummaries()).filter(s => s.sourceScanId === input.id), serverFilter: "f8_net" });
  try { assert.ok((await next.promise).index.players.length); assert.equal(sharedAnalyticsPreparation.inspect().sourceBuilds - before.sourceBuilds, expectedBuilds); }
  finally { next.cancel(); }
}
console.log("PASS relevant readonly History with older Derived is renewed once; unchanged valid data reused");
const local = await openDB("sfdatahub-local-data");
const beforeMaintenance = await listGuildHubScanSummaries();
await local.put("scanSummaries", { ...(await local.get("scanSummaries", peer.scan.id)), summaryVersion: 4 });
const maintenance = startSharedPlayerCardsRun({ summaries: beforeMaintenance.filter(s => s.sourceScanId === input.id), serverFilter: "f8_net" });
try { assert.ok((await maintenance.promise).index.players.length); }
finally { maintenance.cancel(); }
console.log("PASS older Summary format repaired during metadata inventory starts a new acquisition before dispatch");
await local.put("scans", { ...(await local.get("scans", peer.scan.id)), normalizerVersion: 8 });
await local.put("scanSummaries", { ...(await local.get("scanSummaries", peer.scan.id)), normalizerVersion: 8 });
local.close();
const scope = sharedAnalyticsPreparation.acquire("profile");
try {
  const basis = await prepareLocalPlayerHistory({ sourceScanId: input.id, sourcePlayerKey: "f8_net_p1", analytics: { memberRef: "f8_net_p1", playerName: "Hero", server: "f8_net", guildIdentifier: "f8_net_g1", guildName: "Fixture Guild", scannedAtMs: anchor } }, new AbortController().signal, emptyProfileBuildCounters(), () => {}, () => {}, scope);
  assert.equal(basis.coverage, "complete");
  assert.ok(basis.analyticsData.members.some(m => m.sourceScanId === peer.scan.id));
} finally { scope.release(); }
console.log("PASS selected local profile demand renews older History with a new receipt and proof");
let resumedPlayers = 0;
const lost = startSharedPlayerCardsRun({ summaries: [{ ...summary, sourceScanId: "lost-legacy", normalizerVersion: 0 }], serverFilter: "f8_net", onRefresh: value => { resumedPlayers = value.index.players.length; } });
try {
  await assert.rejects(lost.promise, /cannot be renewed/);
  const beforeResume = sharedAnalyticsPreparation.inspect().dispatches;
  await lost.revalidate(); await lost.revalidate();
  assert.equal(sharedAnalyticsPreparation.inspect().dispatches, beforeResume, "unchanged failed preflight remains terminal");
  await importGuildHubLocalScan("new-valid-stand.json", JSON.stringify(inputs[1].rawData));
  await lost.revalidate();
  assert.ok(resumedPlayers > 0, "resume after an actual new valid stand recovers failed preflight");
} finally { lost.cancel(); }
console.log("PASS source loss during preflight is terminal until a real new stand, with automatic resume recovery");
