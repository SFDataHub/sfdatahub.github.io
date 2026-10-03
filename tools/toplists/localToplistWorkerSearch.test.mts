import assert from "node:assert/strict";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../src/lib/toplists/localToplistTypes.ts";

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

send({
  requestId: 1,
  type: "init",
  datasetId: "dataset-a",
  playerRows: [
    basePlayer({ identifier: "eu1_p1", name: "Äther", server: "EU1", guild: "Wächter", class: "mage", sum: 5000 }),
    basePlayer({ identifier: "eu1_p2", name: "Aetherion", server: "EU1", guild: "Wächter", class: "warrior", sum: 4999 }),
    ...Array.from({ length: 998 }, (_, index) =>
      basePlayer({ identifier: `eu1_filler_${index}`, name: `Filler ${index}`, server: "EU1", guild: "Other", class: "scout", sum: 4000 - index }),
    ),
    basePlayer({ identifier: "eu1_p3", name: "North Ather", server: "EU1", guild: "Other", class: "scout", sum: 1 }),
  ],
  guildRows: [
    baseGuild({ guildId: "10", guildIdentifier: "guild-10", name: "Wächter", server: "EU1" }),
  ],
});

const tooShort = send({
  requestId: 2,
  type: "search",
  datasetId: "dataset-a",
  query: "ae",
});
assert.equal(tooShort.ok, true);
assert.deepEqual(tooShort.results, []);

const search = send({
  requestId: 3,
  type: "search",
  datasetId: "dataset-a",
  query: "  äther  ",
  jumpableGuildIdentifiers: ["eu1__10"],
});

assert.equal(search.ok, true);
assert.equal(search.type, "search");
assert.equal(search.normalizedQuery, "ather");
assert.equal(search.results[0].kind, "player");
assert.equal(search.results[0].identifier, "eu1_p1");
assert.equal(search.results[0].status, "jumpable");
assert.equal(search.results.find((result: any) => result.identifier === "eu1_p3")?.status, "outside-toplist");

const guildSearch = send({
  requestId: 4,
  type: "search",
  datasetId: "dataset-a",
  query: "wachter",
  jumpableGuildIdentifiers: ["eu1__10"],
});
assert.ok(guildSearch.results.some((result: any) => result.kind === "guild" && result.identifier === "eu1__10"));

const serverSearch = send({
  requestId: 5,
  type: "search",
  datasetId: "dataset-a",
  query: "eu5",
});
assert.ok(serverSearch.results.some((result: any) => result.kind === "server" && result.identifier === "EU5"));

console.log("localToplistWorkerSearch.test: ok");
