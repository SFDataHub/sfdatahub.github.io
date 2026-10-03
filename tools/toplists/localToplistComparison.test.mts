import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  compareLocalToplists,
  type LocalToplistComparisonSnapshotSet,
} from "../../src/lib/toplists/localToplistComparison.ts";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistSnapshotMeta,
} from "../../src/lib/toplists/localToplistTypes.ts";

const prevTs = Date.UTC(2026, 0, 1, 12, 0, 0);
const currTs = Date.UTC(2026, 0, 31, 12, 0, 0);

const snapshot = (server: string, archiveScanId: string, scanTimestamp: number): LocalToplistSnapshotMeta => ({
  server,
  sourceServer: server,
  archiveScanId,
  archiveSha256: archiveScanId.padEnd(64, "a").slice(0, 64),
  scanTimestamp,
  manifestYear: 2026,
  localScanId: `local-${archiveScanId}`,
  playerCount: 0,
  guildCount: 0,
  issues: [],
});

const player = (overrides: Partial<LocalPlayerToplistRow> & { identifier: string; name: string }): LocalPlayerToplistRow => ({
  rowKey: overrides.identifier,
  identifier: overrides.identifier,
  playerId: overrides.playerId ?? overrides.identifier,
  name: overrides.name,
  server: overrides.server ?? "EU1",
  sourceServer: overrides.sourceServer ?? overrides.server ?? "EU1",
  scanTimestamp: overrides.scanTimestamp ?? currTs,
  manifestYear: 2026,
  archiveScanId: overrides.archiveScanId ?? "scan",
  archiveSha256: "a".repeat(64),
  localScanId: overrides.localScanId ?? "local",
  class: overrides.class ?? "Warrior",
  classId: overrides.classId ?? 1,
  guild: overrides.guild ?? null,
  guildIdentifier: overrides.guildIdentifier ?? null,
  hofRank: overrides.hofRank ?? null,
  level: overrides.level ?? null,
  main: overrides.main ?? null,
  con: overrides.con ?? null,
  sum: overrides.sum ?? null,
  ratio: overrides.ratio ?? null,
  mainTotal: overrides.mainTotal ?? null,
  conTotal: overrides.conTotal ?? null,
  sumTotal: overrides.sumTotal ?? null,
  xpProgress: overrides.xpProgress ?? null,
  xpTotal: overrides.xpTotal ?? null,
  mine: overrides.mine ?? null,
  treasury: overrides.treasury ?? null,
  statsPerDay: null,
  statsDayTotal: null,
  lastScan: overrides.lastScan ?? null,
  latestScanAtSec: overrides.latestScanAtSec ?? Math.floor((overrides.scanTimestamp ?? currTs) / 1000),
});

const guild = (overrides: Partial<LocalGuildToplistRow> & { guildIdentifier: string; name: string }): LocalGuildToplistRow => ({
  rowKey: overrides.guildIdentifier,
  guildId: overrides.guildId ?? overrides.guildIdentifier,
  guildIdentifier: overrides.guildIdentifier,
  name: overrides.name,
  server: overrides.server ?? "EU1",
  sourceServer: overrides.sourceServer ?? overrides.server ?? "EU1",
  scanTimestamp: overrides.scanTimestamp ?? currTs,
  manifestYear: 2026,
  archiveScanId: overrides.archiveScanId ?? "scan",
  archiveSha256: "a".repeat(64),
  localScanId: overrides.localScanId ?? "local",
  hofRank: overrides.hofRank ?? null,
  honor: overrides.honor ?? null,
  raids: overrides.raids ?? null,
  portalFloor: overrides.portalFloor ?? null,
  hydra: overrides.hydra ?? null,
  petLevel: overrides.petLevel ?? null,
  instructor: overrides.instructor ?? null,
  memberCount: overrides.memberCount ?? null,
  avgLevel: overrides.avgLevel ?? null,
  avgBaseMain: overrides.avgBaseMain ?? null,
  avgConBase: overrides.avgConBase ?? null,
  avgSumBaseTotal: overrides.avgSumBaseTotal ?? null,
  avgAttrTotal: overrides.avgAttrTotal ?? null,
  avgConTotal: overrides.avgConTotal ?? null,
  avgTotalStats: overrides.avgTotalStats ?? null,
  avgMine: overrides.avgMine ?? null,
  avgTreasury: overrides.avgTreasury ?? null,
  sumAvg: overrides.sumAvg ?? null,
  memberBasisStatus: overrides.memberBasisStatus ?? "complete",
  memberBasisCount: overrides.memberBasisCount ?? 0,
  lastScan: overrides.lastScan ?? null,
  latestScanAtSec: overrides.latestScanAtSec ?? Math.floor((overrides.scanTimestamp ?? currTs) / 1000),
});

const dataset = (
  month: string,
  scanTimestamp: number,
  players: LocalPlayerToplistRow[],
  guilds: LocalGuildToplistRow[],
  server = "EU1",
): LocalToplistComparisonSnapshotSet => ({
  month,
  snapshots: [snapshot(server, `${server}-${month}`, scanTimestamp)],
  players,
  guilds,
});

const findPlayer = (result: ReturnType<typeof compareLocalToplists>, identifier: string) => {
  const row = result.players.find((entry) => entry.current?.identifier === identifier || entry.previous?.identifier === identifier);
  assert.ok(row, `expected player comparison for ${identifier}`);
  return row;
};

const findGuild = (result: ReturnType<typeof compareLocalToplists>, identifier: string) => {
  const row = result.guilds.find((entry) => entry.current?.guildIdentifier === identifier || entry.previous?.guildIdentifier === identifier);
  assert.ok(row, `expected guild comparison for ${identifier}`);
  return row;
};

describe("local toplist comparison", () => {
  test("matches exact players, computes deltas, stats/day, and positive rankDelta for improvements", () => {
    const previous = dataset("2026-01", prevTs, [
      player({ identifier: "p1", name: "Ada", sum: 100, level: 10, main: 70, con: 30, scanTimestamp: prevTs }),
      player({ identifier: "p2", name: "Ben", sum: 90, level: 9, main: 50, con: 40, scanTimestamp: prevTs }),
    ], []);
    const current = dataset("2026-02", currTs, [
      player({ identifier: "p1", name: "Ada", sum: 110, level: 11, main: 75, con: 35, scanTimestamp: currTs }),
      player({ identifier: "p2", name: "Ben", sum: 120, level: 10, main: 80, con: 40, scanTimestamp: currTs }),
    ], []);

    const result = compareLocalToplists(previous, current);
    const ben = findPlayer(result, "p2");
    const ada = findPlayer(result, "p1");

    assert.equal(result.status, "complete");
    assert.equal(ben.status, "matched");
    assert.equal(ben.matchType, "exact");
    assert.equal(ben.previousTableRank, 2);
    assert.equal(ben.currentTableRank, 1);
    assert.equal(ben.rankDelta, 1);
    assert.equal(ben.metricDelta, 30);
    assert.equal(ben.deltas.main, 30);
    assert.equal(ben.statsDays, 30);
    assert.equal(ben.statsPerDay, 1);
    assert.equal(ada.rankDelta, -1);
  });

  test("does not match players by equal names when identifiers differ", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "old-id", name: "Same", sum: 100, scanTimestamp: prevTs })], []),
      dataset("2026-02", currTs, [player({ identifier: "new-id", name: "Same", sum: 110, scanTimestamp: currTs })], []),
    );

    assert.equal(result.counts.playersMatched, 0);
    assert.equal(result.counts.playersEntered, 1);
    assert.equal(result.counts.playersLeft, 1);
  });

  test("matches players through explicit active fusion identity links", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "origin_p1", name: "Ada", server: "OLD", sum: 100, scanTimestamp: prevTs })], [], "OLD"),
      dataset("2026-02", currTs, [player({ identifier: "target_p9", name: "Ada", server: "NEW", sum: 160, scanTimestamp: currTs })], [], "NEW"),
      {
        playerIdentityLinks: [{
          previousServer: "OLD",
          previousIdentifier: "origin_p1",
          currentServer: "NEW",
          currentIdentifier: "target_p9",
          identityKey: "fusion-ada",
          effectiveFromSec: Math.floor(Date.UTC(2026, 0, 15) / 1000),
        }],
      },
    );

    const row = findPlayer(result, "target_p9");
    assert.equal(row.status, "matched");
    assert.equal(row.matchType, "fusion");
    assert.equal(row.identityKey, "fusion-ada");
    assert.equal(row.metricDelta, 60);
  });

  test("ignores fusion links outside their effective time window", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "origin_p1", name: "Ada", server: "OLD", sum: 100, scanTimestamp: prevTs })], [], "OLD"),
      dataset("2026-02", currTs, [player({ identifier: "target_p9", name: "Ada", server: "NEW", sum: 160, scanTimestamp: currTs })], [], "NEW"),
      {
        playerIdentityLinks: [{
          previousServer: "OLD",
          previousIdentifier: "origin_p1",
          currentServer: "NEW",
          currentIdentifier: "target_p9",
          effectiveFromSec: Math.floor(Date.UTC(2026, 5, 1) / 1000),
        }],
      },
    );

    assert.equal(result.counts.playersMatched, 0);
    assert.equal(result.counts.playersEntered, 1);
    assert.equal(result.counts.playersLeft, 1);
  });

  test("reports ambiguous player fusion links as conflicts", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [
        player({ identifier: "old-a", name: "Ada", server: "OLD", sum: 100, scanTimestamp: prevTs }),
        player({ identifier: "old-b", name: "Ada", server: "OLD", sum: 90, scanTimestamp: prevTs }),
      ], [], "OLD"),
      dataset("2026-02", currTs, [player({ identifier: "new-a", name: "Ada", server: "NEW", sum: 160, scanTimestamp: currTs })], [], "NEW"),
      {
        playerIdentityLinks: [
          { previousServer: "OLD", previousIdentifier: "old-a", currentServer: "NEW", currentIdentifier: "new-a", effectiveFromSec: 1 },
          { previousServer: "OLD", previousIdentifier: "old-b", currentServer: "NEW", currentIdentifier: "new-a", effectiveFromSec: 1 },
        ],
      },
    );

    assert.equal(result.counts.playersConflicts, 1);
    assert.equal(result.issues.some((entry) => entry.code === "ambiguous-player-fusion"), true);
  });

  test("uses each server's own scan timestamps for stats/day", () => {
    const result = compareLocalToplists(
      {
        month: "2026-01",
        snapshots: [snapshot("EU1", "a", prevTs), snapshot("EU2", "b", prevTs)],
        players: [
          player({ identifier: "eu1_p1", name: "Ada", server: "EU1", sum: 100, scanTimestamp: prevTs }),
          player({ identifier: "eu2_p1", name: "Ben", server: "EU2", sum: 100, scanTimestamp: prevTs }),
        ],
        guilds: [],
      },
      {
        month: "2026-02",
        snapshots: [snapshot("EU1", "c", currTs), snapshot("EU2", "d", Date.UTC(2026, 0, 16, 12))],
        players: [
          player({ identifier: "eu1_p1", name: "Ada", server: "EU1", sum: 400, scanTimestamp: currTs }),
          player({ identifier: "eu2_p1", name: "Ben", server: "EU2", sum: 250, scanTimestamp: Date.UTC(2026, 0, 16, 12) }),
        ],
        guilds: [],
      },
    );

    assert.equal(findPlayer(result, "eu1_p1").statsPerDay, 10);
    assert.equal(findPlayer(result, "eu2_p1").statsPerDay, 10);
  });

  test("does not compute stats/day when a sum is missing or time does not move forward", () => {
    const missing = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "p1", name: "Ada", sum: null, scanTimestamp: prevTs })], []),
      dataset("2026-02", currTs, [player({ identifier: "p1", name: "Ada", sum: 120, scanTimestamp: currTs })], []),
    );
    const stale = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "p1", name: "Ada", sum: 100, scanTimestamp: currTs })], []),
      dataset("2026-02", currTs, [player({ identifier: "p1", name: "Ada", sum: 120, scanTimestamp: prevTs })], []),
    );

    assert.equal(findPlayer(missing, "p1").statsPerDay, null);
    assert.equal(findPlayer(stale, "p1").statsPerDay, null);
  });

  test("rejects same or reversed comparison months without substituting data", () => {
    const same = compareLocalToplists(
      dataset("2026-02", prevTs, [player({ identifier: "p1", name: "Ada", sum: 1, scanTimestamp: prevTs })], []),
      dataset("2026-02", currTs, [player({ identifier: "p1", name: "Ada", sum: 2, scanTimestamp: currTs })], []),
    );
    const reversed = compareLocalToplists(
      dataset("2026-03", prevTs, [player({ identifier: "p1", name: "Ada", sum: 1, scanTimestamp: prevTs })], []),
      dataset("2026-02", currTs, [player({ identifier: "p1", name: "Ada", sum: 2, scanTimestamp: currTs })], []),
    );

    assert.equal(same.status, "empty");
    assert.equal(same.players.length, 0);
    assert.equal(reversed.issues.some((entry) => entry.code === "invalid-comparison-months"), true);
  });

  test("reports partial comparison sides per server", () => {
    const result = compareLocalToplists(
      { ...dataset("2026-01", prevTs, [player({ identifier: "a", name: "A", server: "EU1", sum: 1, scanTimestamp: prevTs })], [], "EU1") },
      { ...dataset("2026-02", currTs, [player({ identifier: "b", name: "B", server: "EU2", sum: 1, scanTimestamp: currTs })], [], "EU2") },
    );

    assert.equal(result.status, "partial");
    assert.equal(result.issues.filter((entry) => entry.code === "partial-comparison-side").length, 2);
  });

  test("matches guilds exactly and computes direct and average deltas", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [], [guild({ guildIdentifier: "g1", name: "Alpha", raids: 10, avgLevel: 100, avgBaseMain: 200, scanTimestamp: prevTs })]),
      dataset("2026-02", currTs, [], [guild({ guildIdentifier: "g1", name: "Alpha", raids: 12, avgLevel: 110, avgBaseMain: 260, scanTimestamp: currTs })]),
      { guildSort: { metricKey: "guildRaids" } },
    );

    const row = findGuild(result, "g1");
    assert.equal(row.status, "matched");
    assert.equal(row.matchType, "exact");
    assert.equal(row.metricDelta, 2);
    assert.equal(row.deltas.avgLevel, 10);
    assert.equal(row.deltas.avgBaseMain, 60);
  });

  test("keeps incomplete guild average deltas null while direct deltas remain available", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [], [guild({ guildIdentifier: "g1", name: "Alpha", raids: 10, avgLevel: 100, memberBasisStatus: "complete", scanTimestamp: prevTs })]),
      dataset("2026-02", currTs, [], [guild({ guildIdentifier: "g1", name: "Alpha", raids: 12, avgLevel: 110, memberBasisStatus: "incomplete", scanTimestamp: currTs })]),
    );

    const row = findGuild(result, "g1");
    assert.equal(row.deltas.raids, 2);
    assert.equal(row.deltas.avgLevel, null);
    assert.equal(row.issues[0]?.code, "incomplete-guild-comparison-average");
  });

  test("does not match guilds by equal names when identifiers differ", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [], [guild({ guildIdentifier: "old-g", name: "Same", avgLevel: 100, scanTimestamp: prevTs })]),
      dataset("2026-02", currTs, [], [guild({ guildIdentifier: "new-g", name: "Same", avgLevel: 120, scanTimestamp: currTs })]),
    );

    assert.equal(result.counts.guildsMatched, 0);
    assert.equal(result.counts.guildsEntered, 1);
    assert.equal(result.counts.guildsLeft, 1);
  });

  test("supports explicit guild fusion links but reports ambiguous links as conflicts", () => {
    const matched = compareLocalToplists(
      dataset("2026-01", prevTs, [], [guild({ guildIdentifier: "old-g", name: "Same", server: "OLD", avgLevel: 100, scanTimestamp: prevTs })], "OLD"),
      dataset("2026-02", currTs, [], [guild({ guildIdentifier: "new-g", name: "Same", server: "NEW", avgLevel: 120, scanTimestamp: currTs })], "NEW"),
      { guildIdentityLinks: [{ previousServer: "OLD", previousIdentifier: "old-g", currentServer: "NEW", currentIdentifier: "new-g", effectiveFromSec: 1 }] },
    );
    const conflict = compareLocalToplists(
      dataset("2026-01", prevTs, [], [
        guild({ guildIdentifier: "old-a", name: "Same", server: "OLD", avgLevel: 100, scanTimestamp: prevTs }),
        guild({ guildIdentifier: "old-b", name: "Same", server: "OLD", avgLevel: 101, scanTimestamp: prevTs }),
      ], "OLD"),
      dataset("2026-02", currTs, [], [guild({ guildIdentifier: "new-g", name: "Same", server: "NEW", avgLevel: 120, scanTimestamp: currTs })], "NEW"),
      {
        guildIdentityLinks: [
          { previousServer: "OLD", previousIdentifier: "old-a", currentServer: "NEW", currentIdentifier: "new-g", effectiveFromSec: 1 },
          { previousServer: "OLD", previousIdentifier: "old-b", currentServer: "NEW", currentIdentifier: "new-g", effectiveFromSec: 1 },
        ],
      },
    );

    assert.equal(findGuild(matched, "new-g").matchType, "fusion");
    assert.equal(conflict.counts.guildsConflicts, 1);
    assert.equal(conflict.issues.some((entry) => entry.code === "ambiguous-guild-fusion"), true);
  });

  test("applies filters and metric choices before ranking both comparison sides", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [
        player({ identifier: "w1", name: "War", class: "Warrior", sum: 100, scanTimestamp: prevTs }),
        player({ identifier: "m1", name: "Mage", class: "Mage", sum: 1000, scanTimestamp: prevTs }),
      ], []),
      dataset("2026-02", currTs, [
        player({ identifier: "w1", name: "War", class: "Warrior", sum: 200, scanTimestamp: currTs }),
        player({ identifier: "m1", name: "Mage", class: "Mage", sum: 1, scanTimestamp: currTs }),
      ], []),
      { filters: { playerClasses: ["Warrior"] }, playerSort: { metricKey: "sum" } },
    );

    assert.equal(result.players.length, 1);
    assert.equal(result.players[0]?.current?.identifier, "w1");
    assert.equal(result.players[0]?.currentTableRank, 1);
    assert.equal(result.players[0]?.previousTableRank, 1);
  });

  test("preserves historical server, guild, and rank fields on both sides", () => {
    const result = compareLocalToplists(
      dataset("2026-01", prevTs, [player({ identifier: "p1", name: "Ada", server: "OLD", guild: "Old Guild", guildIdentifier: "old-g", hofRank: 50, sum: 100, scanTimestamp: prevTs })], [], "OLD"),
      dataset("2026-02", currTs, [player({ identifier: "p1", name: "Ada", server: "OLD", guild: "New Guild", guildIdentifier: "new-g", hofRank: 40, sum: 120, scanTimestamp: currTs })], [], "OLD"),
    );

    const row = findPlayer(result, "p1");
    assert.equal(row.previous?.guild, "Old Guild");
    assert.equal(row.current?.guild, "New Guild");
    assert.equal(row.previous?.hofRank, 50);
    assert.equal(row.current?.hofRank, 40);
  });

  test("handles larger synthetic inputs without quadratic name matching", () => {
    const previousPlayers = Array.from({ length: 1200 }, (_, index) =>
      player({ identifier: `p${index}`, name: `Same ${index % 10}`, sum: index, scanTimestamp: prevTs }));
    const currentPlayers = Array.from({ length: 1200 }, (_, index) =>
      player({ identifier: `p${index}`, name: `Same ${index % 10}`, sum: index + 100, scanTimestamp: currTs }));

    const result = compareLocalToplists(
      dataset("2026-01", prevTs, previousPlayers, []),
      dataset("2026-02", currTs, currentPlayers, []),
    );

    assert.equal(result.counts.playersMatched, 1200);
    assert.equal(result.counts.playersEntered, 0);
    assert.deepEqual(structuredClone(result), result);
  });
});

console.log("localToplistComparison.test: ok");
