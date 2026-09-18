import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { deleteDB } from "idb";

import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  confirmFusionIdentityLink,
  mergeReadyFusionIdentityItems,
  rejectFusionIdentityCandidate,
  unlinkFusionIdentityAlias,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";

type MemberInput = {
  id: string;
  name: string;
  server: string;
  guildSegment: string;
  guildName: string;
  level?: number;
};

const COA = "01234567890123456789ab";
const OTHER_COA = "1111111111111111111111";

const member = ({ id, name, server, guildSegment, guildName, level = 10 }: MemberInput) => ({
  memberRef: id,
  name,
  classId: "1",
  level,
  baseStats: null,
  totalStats: null,
  server,
  guildSegment,
  groupSegment: guildSegment,
  guildName,
  guildRole: "member" as const,
});

const group = (server: string, segment: string, name: string, memberCount: number, coaString: string) => ({
  identifier: `${server}_${segment}`,
  server,
  name,
  memberCount,
  coaString,
});

const snapshot = (
  id: string,
  timestampMs: number,
  server: string,
  members: MemberInput[],
  groups: unknown[],
): GuildHubLogicalScanSnapshot => ({
  id,
  timestamp: new Date(timestampMs).toISOString(),
  timestampMs,
  players: members.map((entry) => ({ identifier: entry.id })),
  groups,
  servers: [server],
  playerCount: members.length,
  groupCount: groups.length,
  guildCount: groups.length,
  rawData: { players: [], groups },
  normalizedMembers: members.map(member),
  sourceScanId: id,
  sourceScanFilename: `${id}.json`,
  sourceImportedAt: new Date(timestampMs).toISOString(),
});

const createSnapshots = () => [
  snapshot(
    "old-eu1",
    1000,
    "s1_eu",
    [
      { id: "s1_eu_p1", name: "Alice", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p2", name: "Bob", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p3", name: "Cid", server: "s1_eu", guildSegment: "g1", guildName: "Knights" },
      { id: "s1_eu_p4", name: "Dora", server: "s1_eu", guildSegment: "g2", guildName: "Visitors" },
      { id: "s1_eu_p5", name: "Eve", server: "s1_eu", guildSegment: "g2", guildName: "Visitors" },
    ],
    [group("s1_eu", "g1", "Knights", 3, COA), group("s1_eu", "g2", "Visitors", 2, OTHER_COA)],
  ),
  snapshot(
    "old-eu2",
    1200,
    "s2_eu",
    [{ id: "s2_eu_p9", name: "ManualOnly", server: "s2_eu", guildSegment: "g7", guildName: "Archive" }],
    [group("s2_eu", "g7", "Archive", 1, "3333333333333333333333")],
  ),
  snapshot(
    "new-f28-a",
    2000,
    "f28_net",
    [
      { id: "f28_net_p901", name: "Alice (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p902", name: "Bob (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p903", name: "Cid (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p904", name: "Dora (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p905", name: "Eve (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 11 },
      { id: "f28_net_p999", name: "Native", server: "f28_net", guildSegment: "g8", guildName: "Newcomers", level: 1 },
    ],
    [group("f28_net", "g9", "Knights", 5, COA), group("f28_net", "g8", "Newcomers", 1, "2222222222222222222222")],
  ),
  snapshot(
    "new-f28-b",
    3000,
    "f28_net",
    [
      { id: "f28_net_p901", name: "Alice (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p902", name: "Bob (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p903", name: "Cid (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p904", name: "Dora (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
      { id: "f28_net_p905", name: "Eve (s1_eu)", server: "f28_net", guildSegment: "g9", guildName: "Knights", level: 12 },
    ],
    [group("f28_net", "g9", "Knights", 5, COA)],
  ),
];

const dbSuffix = Date.now();
const playerDb = `fusion-identity-management-player-${dbSuffix}`;
const guildDb = `fusion-identity-management-guild-${dbSuffix}`;
await deleteDB(playerDb);
await deleteDB(guildDb);

const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const snapshots = createSnapshots();
const before = JSON.stringify(snapshots);

let report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.scope.label, "EU1-EU4 -> F28");
assert.equal(report.scope.postFusionSnapshotCount, 2);
assert.equal(report.items.filter((item) => item.entityType === "player").length, 6);
assert.equal(report.items.filter((item) => item.entityType === "guild").length, 2);
assert.equal(report.items.filter((item) => item.currentIdentifier === "f28_net_p901").length, 1);

const knights = report.items.find((item) => item.entityType === "guild" && item.currentName === "Knights");
assert.ok(knights);
assert.equal(knights.status, "ready");
assert.equal(knights.readyCandidateIdentifier, "eu1_g1");
assert.ok(knights.memberMigrationEdges.some((edge) => edge.oldGuildIdentifier === "eu1_g2"));

const readyPlayers = report.items.filter((item) => item.entityType === "player" && item.status === "ready");
assert.equal(readyPlayers.length, 5);

const mergeResult = await mergeReadyFusionIdentityItems(report, { playerStore, guildStore });
assert.equal(mergeResult.players, 5);
assert.equal(mergeResult.guilds, 1);
assert.deepEqual(mergeResult.errors, []);
assert.equal(JSON.stringify(snapshots), before);

report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_net_p901")?.status, "completed");
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_g9")?.status, "completed");

await unlinkFusionIdentityAlias("guild", "eu1_g1", { guildStore });
report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_g9")?.status, "ready");

await confirmFusionIdentityLink("player", "f28_net_p999", "s2_eu_p9", { playerStore });
report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
assert.equal(report.items.find((item) => item.currentIdentifier === "f28_net_p999")?.status, "completed");

const rejectPlayerDb = `fusion-identity-management-player-reject-${dbSuffix}`;
const rejectGuildDb = `fusion-identity-management-guild-reject-${dbSuffix}`;
await deleteDB(rejectPlayerDb);
await deleteDB(rejectGuildDb);
const rejectPlayerStore = createPlayerIdentityStore({ dbName: rejectPlayerDb });
const rejectGuildStore = createGuildIdentityStore({ dbName: rejectGuildDb });

await rejectFusionIdentityCandidate("player", "f28_net_p901", "s1_eu_p1", { playerStore: rejectPlayerStore });
await rejectFusionIdentityCandidate("guild", "f28_g9", "eu1_g1", { guildStore: rejectGuildStore });
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: rejectPlayerStore,
  guildStore: rejectGuildStore,
});
const rejectedAlice = report.items.find((item) => item.currentIdentifier === "f28_net_p901");
assert.equal(rejectedAlice?.status, "review");
assert.equal(rejectedAlice?.candidates[0]?.rejected, true);
assert.equal(rejectedAlice?.readyCandidateIdentifier, null);
const rejectedKnights = report.items.find((item) => item.currentIdentifier === "f28_g9");
assert.equal(rejectedKnights?.status, "unresolved");
assert.ok(rejectedKnights?.memberMigrationEdges.some((edge) => edge.oldGuildIdentifier === "eu1_g2"));

const collisionPlayerDb = `fusion-identity-management-player-collision-${dbSuffix}`;
const collisionGuildDb = `fusion-identity-management-guild-collision-${dbSuffix}`;
await deleteDB(collisionPlayerDb);
await deleteDB(collisionGuildDb);
const collisionPlayerStore = createPlayerIdentityStore({ dbName: collisionPlayerDb });
const collisionGuildStore = createGuildIdentityStore({ dbName: collisionGuildDb });
await collisionPlayerStore.linkPlayerIdentifiers("s1_eu_p1", "f28_net_p777", {
  source: "manual",
  confirmedAt: "2026-09-16T00:00:00.000Z",
});
report = await buildFusionIdentityManagementReportFromSnapshots({
  snapshots,
  playerStore: collisionPlayerStore,
  guildStore: collisionGuildStore,
});
const collisionAlice = report.items.find((item) => item.currentIdentifier === "f28_net_p901");
assert.notEqual(collisionAlice?.status, "ready");
assert.equal(
  collisionAlice?.candidates.some((candidate) => candidate.historicalIdentifier === "s1_eu_p1"),
  false,
);

await playerStore.close();
await guildStore.close();
await rejectPlayerStore.close();
await rejectGuildStore.close();
await collisionPlayerStore.close();
await collisionGuildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
await deleteDB(rejectPlayerDb);
await deleteDB(rejectGuildDb);
await deleteDB(collisionPlayerDb);
await deleteDB(collisionGuildDb);

console.log("fusionIdentityManagement test passed");
