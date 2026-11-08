import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { importGuildHubLocalScan, listGuildHubScanSummaries } from "../../src/lib/guilds/localScanLibrary.ts";
import { startSharedGuildTrendRun, type GuildTrendHistory } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
import { buildDashboardGuildComparison, buildDashboardGuildTrendIntervals } from "../../src/pages/GuildHub/dashboardGuildComparison.ts";
const now = Date.UTC(2026, 10, 2), startMs = Date.UTC(2025, 10, 2), day = 86400000;
const add = async (guild: number, at: number, declared: boolean) => importGuildHubLocalScan(`${guild}-${at}.json`, JSON.stringify({
  players: [{ identifier: `f8_net_p${guild}`, prefix: "f8_net", group: `f8_net_g${guild}`, groupname: "Guild", timestamp: at, name: "Player", class: 1, level: 100, xpTotal: at, values: { Base: 100, "Base Constitution": 100, Attribute: 200, Constitution: 200 } }],
  groups: [{ identifier: `f8_net_g${guild}`, prefix: "f8_net", name: "Guild", timestamp: at, ...(declared ? { memberCount: 1 } : {}) }],
}));
for (const guild of [1, 2]) { await add(guild, now, true); await add(guild, startMs, true); await add(guild, startMs - day, false); }
await add(1, startMs - 10 * day, true);
for (const guild of [1, 2]) {
  let history: GuildTrendHistory | undefined;
  const run = startSharedGuildTrendRun({ summaries: await listGuildHubScanSummaries(), guildTarget: { logoIdentifier: `f8_net_g${guild}`, server: "f8_net" }, sourceScope: "dashboard-guild", includeServerHistory: true, chartWindow: { startMs, endMs: now }, onHistory: value => { history = value; } });
  try {
    await run.promise;
    const model = buildDashboardGuildComparison(history, "f8_net", `f8_net_g${guild}`, now);
    const intervals = buildDashboardGuildTrendIntervals(model);
    assert(!history!.data.guilds.some(row => row.snapshotTimestamp === startMs - day), "inferred count cannot certify an invisible prior roster");
    if (guild === 1) assert.equal(intervals[0].start.scannedAtMs, startMs - 10 * day);
    else { assert(history!.data.guilds.every(row => row.snapshotTimestamp >= startMs)); assert.equal(intervals[0].start.scannedAtMs, startMs, "no fabricated comparison for first visible observation"); }
  } finally { run.cancel(); }
}
console.log("PASS declared complete prior basis, unknown-count exclusion and absent-basis missing comparison");
