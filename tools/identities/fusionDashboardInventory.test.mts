import assert from "node:assert/strict";

import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityDashboardInventoryFromSnapshots,
} from "../../src/lib/identities/fusionDashboardInventory.ts";

type MemberInput = {
  id: string;
  name: string;
  server: string;
  guildSegment: string;
  guildName: string;
};

const member = (input: MemberInput) => ({
  memberRef: input.id,
  name: input.name,
  classId: "1",
  level: 10,
  baseStats: null,
  totalStats: null,
  server: input.server,
  guildSegment: input.guildSegment,
  groupSegment: input.guildSegment,
  guildName: input.guildName,
  guildRole: "member" as const,
});

const group = (server: string, segment: string, name: string) => ({
  identifier: `${server}_${segment}`,
  server,
  name,
  memberCount: 1,
});

const snapshot = (
  id: string,
  timestampMs: number,
  servers: string[],
  members: MemberInput[],
): GuildHubLogicalScanSnapshot => ({
  id,
  timestamp: new Date(timestampMs).toISOString(),
  timestampMs,
  players: members.map((entry) => ({ identifier: entry.id })),
  groups: members.map((entry) => group(entry.server, entry.guildSegment, entry.guildName)),
  servers,
  playerCount: members.length,
  groupCount: members.length,
  guildCount: members.length,
  rawData: { players: [], groups: [] },
  normalizedMembers: members.map(member),
  sourceScanId: id,
  sourceScanFilename: `${id}.json`,
  sourceImportedAt: new Date(timestampMs).toISOString(),
});

const getF28Scope = (snapshots: GuildHubLogicalScanSnapshot[]) => {
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(snapshots);
  const scope = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  assert.ok(scope);
  return { inventory, scope };
};

{
  const base = [
    snapshot("eu1", 1000, ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
    snapshot("f28", 2000, ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Alice (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(base);
  const scope = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  assert.ok(scope);
  assert.equal(inventory.coverage.some((entry) => entry.serverCode === "EU1"), true);
  assert.equal(inventory.coverage.some((entry) => entry.serverCode === "F28"), true);
  assert.equal(scope.currentPlayerIdentifiers.length, 1);
  assert.equal(scope.currentGuildIdentifiers.length, 1);
  assert.equal(scope.coverage.find((entry) => entry.serverCode === "EU1")?.role, "historical-origin");
  assert.equal(scope.coverage.find((entry) => entry.serverCode === "F28")?.role, "current-target");
}

{
  const relevant = [
    snapshot("eu1", 1000, ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
  ];
  const withIrrelevant = [
    ...relevant,
    snapshot("foreign", 1500, ["US9"], [
      {
        id: "us9_p1",
        name: "Other",
        server: "US9",
        guildSegment: "g1",
        guildName: "Other",
      },
    ]),
  ];
  const firstScope = buildFusionIdentityDashboardInventoryFromSnapshots(relevant).scopes[0];
  const secondInventory = buildFusionIdentityDashboardInventoryFromSnapshots(withIrrelevant);
  const secondScope = secondInventory.scopes[0];
  assert.equal(firstScope.scanFingerprint, secondScope.scanFingerprint);
  assert.equal(secondInventory.coverage.some((entry) => entry.serverCode === "US9"), true);
  assert.equal(secondScope.coverage.find((entry) => entry.serverCode === "US9")?.role, "outside-scope");
}

{
  const base = [
    snapshot("f28", 2000, ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Alice",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
    ]),
  ];
  const withRelevant = [
    ...base,
    snapshot("f28-new", 3000, ["f28_net"], [
      {
        id: "f28_net_p2",
        name: "Bob",
        server: "f28_net",
        guildSegment: "g10",
        guildName: "Mages",
      },
    ]),
  ];
  assert.notEqual(getF28Scope(base).scope.scanFingerprint, getF28Scope(withRelevant).scope.scanFingerprint);
}

{
  const base = [
    snapshot("f28", 2000, ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Alice",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
    ]),
  ];
  const withHistorical = [
    snapshot("eu3", 1000, ["s3_eu"], [
      {
        id: "s3_eu_p1",
        name: "Alice",
        server: "s3_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
    ...base,
  ];
  assert.notEqual(getF28Scope(base).scope.scanFingerprint, getF28Scope(withHistorical).scope.scanFingerprint);
}

{
  const mixed = [
    snapshot("mixed-foreign-first", 3000, ["US9", "f28_net"], [
      {
        id: "f28_net_p1",
        name: "Alice",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
      {
        id: "us9_p1",
        name: "Other",
        server: "US9",
        guildSegment: "g1",
        guildName: "Other",
      },
    ]),
  ];
  const { inventory, scope } = getF28Scope(mixed);
  assert.equal(inventory.coverage.some((entry) => entry.serverCode === "US9"), true);
  assert.equal(scope.relevantSnapshotIds.includes("mixed-foreign-first::F28"), true);
  assert.equal(scope.relevantSnapshotIds.includes("mixed-foreign-first::US9"), false);
  assert.equal(scope.currentPlayerIdentifiers.includes("f28_net_p1"), true);
}

{
  const multiOrigin = [
    snapshot("all-origins", 1000, ["s4_eu", "s2_eu", "s1_eu", "s3_eu"], [
      {
        id: "s1_eu_p1",
        name: "One",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "One",
      },
      {
        id: "s2_eu_p2",
        name: "Two",
        server: "s2_eu",
        guildSegment: "g2",
        guildName: "Two",
      },
      {
        id: "s3_eu_p3",
        name: "Three",
        server: "s3_eu",
        guildSegment: "g3",
        guildName: "Three",
      },
      {
        id: "s4_eu_p4",
        name: "Four",
        server: "s4_eu",
        guildSegment: "g4",
        guildName: "Four",
      },
    ]),
    snapshot("f28", 2000, ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Current",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Current",
      },
    ]),
  ];
  const { scope } = getF28Scope(multiOrigin);
  assert.equal(scope.relevantSnapshotIds.includes("all-origins::EU1"), true);
  assert.equal(scope.relevantSnapshotIds.includes("all-origins::EU2"), true);
  assert.equal(scope.relevantSnapshotIds.includes("all-origins::EU3"), true);
  assert.equal(scope.relevantSnapshotIds.includes("all-origins::EU4"), true);
}

{
  const ordered = [
    snapshot("eu1", 1000, ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
    snapshot("mixed", 2000, ["f28_net", "s3_eu"], [
      {
        id: "f28_net_p1",
        name: "Alice",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
      {
        id: "s3_eu_p3",
        name: "Cara",
        server: "s3_eu",
        guildSegment: "g3",
        guildName: "Mages",
      },
    ]),
  ];
  const reversed = [
    snapshot("mixed", 2000, ["s3_eu", "f28_net"], [
      {
        id: "s3_eu_p3",
        name: "Cara",
        server: "s3_eu",
        guildSegment: "g3",
        guildName: "Mages",
      },
      {
        id: "f28_net_p1",
        name: "Alice",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
    ]),
    snapshot("eu1", 1000, ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
  ];
  assert.equal(getF28Scope(ordered).scope.scanFingerprint, getF28Scope(reversed).scope.scanFingerprint);
}
