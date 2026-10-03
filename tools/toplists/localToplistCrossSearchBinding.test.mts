import assert from "node:assert/strict";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../src/lib/toplists/localToplistTypes.ts";
import { buildLocalPlayerToplistView } from "../../src/lib/toplists/localToplistView.ts";
import { resolveLocalToplistSearchSelection } from "../../src/pages/GuildHub/localToplistSearchFlow.ts";

const responses: any[] = [];
(globalThis as any).postMessage = (message: any) => {
  responses.push(message);
};

await import("../../src/workers/localToplistView.worker.ts");

const send = (message: any) => {
  responses.length = 0;
  (globalThis as any).onmessage({ data: message });
  assert.equal(responses.length, 1);
  return responses[0];
};

const basePlayer = (row: Partial<LocalPlayerToplistRow>): LocalPlayerToplistRow => ({
  rowKey: row.rowKey ?? `${row.server}:${row.identifier}`,
  identifier: row.identifier ?? "",
  playerId: row.playerId ?? null,
  name: row.name ?? "",
  server: row.server ?? "EU1",
  sourceServer: row.sourceServer ?? row.server ?? "EU1",
  scanTimestamp: row.scanTimestamp ?? 1,
  manifestYear: row.manifestYear ?? 2026,
  archiveScanId: row.archiveScanId ?? "scan",
  archiveSha256: row.archiveSha256 ?? "sha",
  localScanId: row.localScanId ?? "local",
  class: row.class ?? "mage",
  classId: row.classId ?? null,
  guild: row.guild ?? null,
  guildIdentifier: row.guildIdentifier ?? null,
  hofRank: row.hofRank ?? null,
  level: row.level ?? null,
  main: row.main ?? null,
  con: row.con ?? null,
  sum: row.sum ?? null,
  ratio: row.ratio ?? null,
  mainTotal: row.mainTotal ?? null,
  conTotal: row.conTotal ?? null,
  sumTotal: row.sumTotal ?? null,
  xpProgress: row.xpProgress ?? null,
  xpTotal: row.xpTotal ?? null,
  mine: row.mine ?? null,
  treasury: row.treasury ?? null,
  statsPerDay: null,
  statsDayTotal: null,
  lastScan: row.lastScan ?? null,
  latestScanAtSec: row.latestScanAtSec ?? null,
});

const baseGuild = (row: Partial<LocalGuildToplistRow>): LocalGuildToplistRow => ({
  rowKey: row.rowKey ?? `${row.server}:${row.guildId}`,
  guildId: row.guildId ?? "",
  guildIdentifier: row.guildIdentifier ?? row.guildId ?? "",
  name: row.name ?? "",
  server: row.server ?? "EU1",
  sourceServer: row.sourceServer ?? row.server ?? "EU1",
  scanTimestamp: row.scanTimestamp ?? 1,
  manifestYear: row.manifestYear ?? 2026,
  archiveScanId: row.archiveScanId ?? "scan",
  archiveSha256: row.archiveSha256 ?? "sha",
  localScanId: row.localScanId ?? "local",
  hofRank: row.hofRank ?? null,
  honor: row.honor ?? null,
  raids: row.raids ?? null,
  portalFloor: row.portalFloor ?? null,
  hydra: row.hydra ?? null,
  petLevel: row.petLevel ?? null,
  instructor: row.instructor ?? null,
  memberCount: row.memberCount ?? null,
  avgLevel: row.avgLevel ?? null,
  avgBaseMain: row.avgBaseMain ?? null,
  avgConBase: row.avgConBase ?? null,
  avgSumBaseTotal: row.avgSumBaseTotal ?? null,
  avgAttrTotal: row.avgAttrTotal ?? null,
  avgConTotal: row.avgConTotal ?? null,
  avgTotalStats: row.avgTotalStats ?? null,
  avgMine: row.avgMine ?? null,
  avgTreasury: row.avgTreasury ?? null,
  sumAvg: row.sumAvg ?? null,
  memberBasisStatus: row.memberBasisStatus ?? "complete",
  memberBasisCount: row.memberBasisCount ?? 1,
  lastScan: row.lastScan ?? null,
  latestScanAtSec: row.latestScanAtSec ?? null,
});

const playerRows = [
  basePlayer({ identifier: "eu1_inside", name: "Cross Inside", server: "EU1", guild: "Alpha Guild", class: "mage", sum: 5000, level: 10 }),
  ...Array.from({ length: 999 }, (_, index) =>
    basePlayer({ identifier: `eu1_filler_${index}`, name: `Filler ${index}`, server: "EU1", guild: "Other Guild", class: "warrior", sum: 4000 - index, level: index }),
  ),
  basePlayer({ identifier: "eu1_outside", name: "Cross Outside", server: "EU1", guild: "Alpha Guild", class: "mage", sum: 1, level: 9999 }),
];

send({
  requestId: 1,
  type: "init",
  datasetId: "cross-a",
  playerRows,
  guildRows: [
    baseGuild({ guildId: "10", guildIdentifier: "guild-10", name: "Alpha Guild", server: "EU1" }),
  ],
});

send({
  requestId: 2,
  type: "view",
  datasetId: "cross-a",
  tab: "guilds",
  filters: { servers: ["EU1"] },
  sort: { metricKey: "guildAvgLevel", direction: "desc" },
  guildAverageMode: "base",
  page: 1,
  pageSize: 250,
});

const search = send({
  requestId: 3,
  type: "search",
  datasetId: "cross-a",
  query: "alpha",
  limit: 10,
  jumpableGuildIdentifiers: ["eu1__10"],
});
const inside = search.results.find((result: any) => result.identifier === "eu1_inside");
const outside = search.results.find((result: any) => result.identifier === "eu1_outside");
assert.equal(inside?.status, "jumpable");
assert.equal(outside?.status, "outside-toplist");

assert.deepEqual(resolveLocalToplistSearchSelection("guilds", inside, "EU1", 11), {
  action: "focus-player",
  target: { kind: "player", server: "EU1", identifier: "eu1_inside", label: "Cross Inside", nonce: 11 },
  nextTab: "players",
});

const guildResult = search.results.find((result: any) => result.kind === "guild");
assert.deepEqual(resolveLocalToplistSearchSelection("players", guildResult, "EU1", 12), {
  action: "focus-guild",
  target: { kind: "guild", server: "EU1", identifier: "eu1__10", label: "Alpha Guild", nonce: 12 },
  nextTab: "guilds",
});
assert.deepEqual(resolveLocalToplistSearchSelection("guilds", guildResult, "EU1", 13), {
  action: "focus-guild",
  target: { kind: "guild", server: "EU1", identifier: "eu1__10", label: "Alpha Guild", nonce: 13 },
  nextTab: null,
});

const filtered = buildLocalPlayerToplistView(playerRows, {
  filters: { servers: ["EU1"], guilds: ["Alpha Guild"] },
  sort: { metricKey: "level", direction: "desc" },
});
assert.deepEqual(filtered.rows.map((row) => row.identifier), ["eu1_inside"]);
assert.equal(filtered.rows.some((row) => row.identifier === "eu1_outside"), false);

console.log("localToplistCrossSearchBinding.test: ok");
