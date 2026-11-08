import assert from "node:assert/strict";
import { guildChartAvailableTimes } from "../../src/pages/GuildHub/dashboardChartWindow.ts";
import type { GuildHubScanSummary } from "../../src/lib/guilds/localScanLibrary.ts";
const source = (id: string, at: number, guildIdentifier = "f28_g1") => ({ sourceScanId: id, scannedAtMs: at, guildIdentifier, guild: { server: guildIdentifier.replace(/_g[^_]+$/, "") } });
const slices = [
  { timestampMs: 10, guildIdentifiers: ["f28_net_g1"] },
  { timestampMs: 20, guildIdentifiers: ["f28_g1"] },
  { timestampMs: 5, guildIdentifiers: ["f28_g2"] },
  { timestampMs: 2, guildIdentifiers: ["s3_eu_g1"] },
  { timestampMs: 40, guildIdentifiers: ["f28_net_g1"] },
];
const summaries = [{ sourceScanId: "own", fusionInventorySlices: slices }] as GuildHubScanSummary[];
assert.deepEqual(guildChartAvailableTimes([source("own", 20), source("legacy", 3), source("current", 30)], summaries, 30), [20, 10, 3], "multi-date own import options use physical guild metadata, retain legacy fallback, exclude foreign IDs, unrelated guilds and future observations");
assert.deepEqual(guildChartAvailableTimes([source("own", 20), source("confirmed-historical", 9, "eu3_g7")], summaries, 30), [20, 10, 9]);
console.log("PASS metadata-only multi-date own-import periods, server aliases, certified historical sources and no name/numeric-ID cross-server matches");
