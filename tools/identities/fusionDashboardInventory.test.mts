import assert from "node:assert/strict";

import type { LocalServerFusionEvent } from "../../src/data/serverFusions.ts";
import type { LocalServerDefinition } from "../../src/data/serverRegistry.ts";
import type {
  GuildHubLogicalScanSnapshot,
  GuildHubScanSummary,
} from "../../src/lib/guilds/localScanLibrary.ts";
import {
  type FusionIdentityDashboardInventoryTiming,
  buildFusionIdentityDashboardInventoryFromSnapshots,
  buildFusionIdentityDashboardInventoryFromSummaries,
  normalizeFusionIdentityScopeInventory,
  type FusionIdentityScopeInventory,
} from "../../src/lib/identities/fusionDashboardInventory.ts";

type MemberInput = {
  id: string;
  name: string;
  server: string;
  guildSegment: string;
  guildName: string;
};

const timestamp = (value: string) => Date.parse(`${value}T12:00:00Z`);

const matchableTargets = (snapshots: GuildHubLogicalScanSnapshot[]) =>
  buildFusionIdentityDashboardInventoryFromSnapshots(snapshots, {
    atDate: "2026-09-24",
  }).scopes
    .filter((entry) => entry.isLocallyMatchable)
    .map((entry) => entry.scope.targetServerCode);

const serverDefinition = (
  code: string,
  type: LocalServerDefinition["type"] = "origin",
): LocalServerDefinition => ({
  code,
  displayName: code,
  host: `${code.toLowerCase()}.example.test`,
  hosts: [`${code.toLowerCase()}.example.test`],
  region: "Test",
  type,
  active: true,
  aliases: [],
});

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

const summaryFromSnapshot = (
  entry: GuildHubLogicalScanSnapshot,
  contentHash = `hash-${entry.id}`,
): GuildHubScanSummary => ({
  sourceScanId: entry.sourceScanId,
  filename: entry.sourceScanFilename,
  importedAt: Date.parse(entry.sourceImportedAt),
  updatedAt: Date.parse(entry.sourceImportedAt),
  importedAtIso: entry.sourceImportedAt,
  scannedAt: entry.timestamp,
  logicalScanCount: 1,
  firstSnapshotTimestamp: entry.timestampMs,
  lastSnapshotTimestamp: entry.timestampMs,
  snapshotTimestamps: [entry.timestampMs],
  servers: entry.servers,
  playerCount: entry.playerCount,
  groupCount: entry.groupCount,
  guildCount: entry.guildCount,
  guilds: [],
  guildCoverage: {
    completeGuildSnapshotCount: 0,
    incompleteGuildSnapshotCount: 0,
    overcountGuildSnapshotCount: 0,
    unknownGuildSnapshotCount: 0,
    byServer: [],
  },
  fusionInventorySlices: entry.servers.map((server) => {
    const members = entry.normalizedMembers.filter((member) => member.server === server);
    const persistIdentifiers = server === "f28_net" || server.toUpperCase() === "F28";
    return {
      id: `${entry.id}::${server}`,
      snapshotId: entry.id,
      sourceScanId: entry.sourceScanId,
      sourceScanFilename: entry.sourceScanFilename,
      sourceImportedAt: entry.sourceImportedAt,
      timestamp: entry.timestamp,
      timestampMs: entry.timestampMs,
      server,
      playerCount: members.length,
      guildCount: members.length,
      ...(persistIdentifiers
        ? {
            playerIdentifiers: members.map((member) => member.memberRef),
            guildIdentifiers: members.map((member) => `${server.toLowerCase()}_${member.guildSegment}`),
          }
        : {}),
    };
  }),
  contentHash,
  summaryVersion: 5,
});

const getF28Scope = (snapshots: GuildHubLogicalScanSnapshot[]) => {
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(snapshots, {
    atDate: "2026-09-24",
  });
  const scope = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  assert.ok(scope);
  return { inventory, scope };
};

{
  const base = [
    snapshot("eu1", timestamp("2026-01-01"), ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Alice",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Knights",
      },
    ]),
    snapshot("f28", timestamp("2026-02-07"), ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Alice (s1_eu)",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Knights",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(base, {
    atDate: "2026-09-24",
  });
  const scope = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  assert.ok(scope);
  assert.equal(inventory.coverage.some((entry) => entry.serverCode === "EU1"), true);
  assert.equal(inventory.coverage.some((entry) => entry.serverCode === "F28"), true);
  assert.equal(scope.currentPlayerIdentifiers.length, 1);
  assert.equal(scope.currentGuildIdentifiers.length, 1);
  assert.equal(scope.isLocallyMatchable, true);
  assert.equal(scope.hasHistoricalObservations, true);
  assert.equal(scope.hasCurrentTargetObservations, true);
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
  const firstScope = buildFusionIdentityDashboardInventoryFromSnapshots(relevant, {
    atDate: "2026-09-24",
  }).scopes[0];
  const secondInventory = buildFusionIdentityDashboardInventoryFromSnapshots(withIrrelevant, {
    atDate: "2026-09-24",
  });
  const secondScope = secondInventory.scopes[0];
  assert.equal(firstScope.scanFingerprint, secondScope.scanFingerprint);
  assert.equal(secondInventory.coverage.some((entry) => entry.serverCode === "US9"), true);
  assert.equal(secondScope.coverage.find((entry) => entry.serverCode === "US9"), undefined);
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
  const maerwynnLineage = [
    snapshot("f1", 1000, ["f1_fu"], [
      {
        id: "f1_fu_p1",
        name: "Fusion Player",
        server: "f1_fu",
        guildSegment: "g1",
        guildName: "Fusion Guild",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(maerwynnLineage, {
    atDate: "2026-09-24",
  });
  const scope = inventory.scopes.find(
    (entry) => entry.scope.targetServerCode === "MAERWYNN",
  );
  assert.ok(scope);
  assert.equal(scope.scope.analysisSupported, true);
  assert.equal(scope.scope.isCurrentTerminalTarget, true);
  assert.equal(scope.isLocallyMatchable, false);
  assert.equal(scope.coverage.find((entry) => entry.serverCode === "F1")?.role, "intermediate-fusion-target");
  assert.equal(scope.relevantSnapshotIds.includes("f1::F1"), true);
  assert.equal(scope.currentPlayerIdentifiers.length, 0);
}

{
  const futureF29 = [
    snapshot("eu5", 1000, ["s5_eu"], [
      {
        id: "s5_eu_p1",
        name: "Future Origin",
        server: "s5_eu",
        guildSegment: "g1",
        guildName: "Future Guild",
      },
    ]),
  ];
  const before = buildFusionIdentityDashboardInventoryFromSnapshots(futureF29, {
    atDate: "2026-09-24",
  }).scopes.find((entry) => entry.scope.targetServerCode === "F29");
  assert.ok(before);
  assert.equal(before.scope.temporalStatus, "future");
  assert.equal(before.scope.isCurrentTerminalTarget, false);
  assert.equal(before.scope.analysisSupported, false);
  assert.equal(before.isLocallyMatchable, false);
  assert.equal(before.currentPlayerIdentifiers.length, 0);

  const after = buildFusionIdentityDashboardInventoryFromSnapshots(
    [
      ...futureF29,
      snapshot("f29", 2000, ["f29_fu"], [
        {
          id: "f29_fu_p1",
          name: "Future Target",
          server: "f29_fu",
          guildSegment: "g9",
          guildName: "Future Target Guild",
        },
      ]),
    ],
    { atDate: "2026-10-17" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "F29");
  assert.ok(after);
  assert.equal(after.scope.temporalStatus, "effective");
  assert.equal(after.scope.isCurrentTerminalTarget, true);
  assert.equal(after.scope.analysisSupported, true);
  assert.equal(after.isLocallyMatchable, false);
  assert.equal(after.currentPlayerIdentifiers.includes("f29_fu_p1"), true);
}

{
  const onlyTarget = [
    snapshot("f27", timestamp("2025-09-01"), ["f27_fu"], [
      {
        id: "f27_fu_p1",
        name: "Current F27",
        server: "f27_fu",
        guildSegment: "g27",
        guildName: "Current F27",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(onlyTarget, {
    atDate: "2026-09-24",
  });
  const f27 = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F27");
  assert.ok(f27);
  assert.equal(f27.scope.analysisSupported, true);
  assert.equal(f27.isLocallyMatchable, false);
  assert.deepEqual(matchableTargets(onlyTarget), []);
}

{
  const onlyHistorical = [
    snapshot("eu5", timestamp("2026-09-01"), ["s5_eu"], [
      {
        id: "s5_eu_p1",
        name: "Future Origin",
        server: "s5_eu",
        guildSegment: "g5",
        guildName: "Future Origin",
      },
    ]),
    snapshot("eu6", timestamp("2026-09-02"), ["s6_eu"], [
      {
        id: "s6_eu_p1",
        name: "Future Origin",
        server: "s6_eu",
        guildSegment: "g6",
        guildName: "Future Origin",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(onlyHistorical, {
    atDate: "2026-09-24",
  });
  const f29 = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F29");
  assert.ok(f29);
  assert.equal(f29.scope.temporalStatus, "future");
  assert.equal(f29.isLocallyMatchable, false);
  assert.deepEqual(f29.coverage.map((entry) => entry.serverCode), ["EU5", "EU6"]);
  assert.deepEqual(matchableTargets(onlyHistorical), []);
}

{
  const f28Coverage = [
    ...["s1_eu", "s2_eu", "s3_eu", "s4_eu", "s5_eu", "s6_eu", "s7_eu", "s8_eu", "s9_eu", "s10_eu"].map(
      (server, index) =>
        snapshot(`origin-${index + 1}`, timestamp("2026-01-01"), [server], [
          {
            id: `${server}_p1`,
            name: `Origin ${index + 1}`,
            server,
            guildSegment: `g${index + 1}`,
            guildName: `Origin ${index + 1}`,
          },
        ]),
    ),
    snapshot("f27", timestamp("2025-09-01"), ["f27_fu"], [
      {
        id: "f27_fu_p1",
        name: "F27",
        server: "f27_fu",
        guildSegment: "g27",
        guildName: "F27",
      },
    ]),
    snapshot("am1", timestamp("2026-01-01"), ["AM1"], [
      {
        id: "am1_p1",
        name: "AM1",
        server: "AM1",
        guildSegment: "g1",
        guildName: "AM1",
      },
    ]),
    snapshot("f28", timestamp("2026-02-07"), ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "F28",
        server: "f28_net",
        guildSegment: "g28",
        guildName: "F28",
      },
    ]),
  ];
  const { scope } = getF28Scope(f28Coverage);
  assert.equal(scope.isLocallyMatchable, true);
  assert.deepEqual(scope.coverage.map((entry) => entry.serverCode), [
    "EU1",
    "EU2",
    "EU3",
    "EU4",
    "F28",
  ]);
}

{
  const maerwynnCurrent = snapshot("maerwynn", timestamp("2025-05-01"), ["maerwynn"], [
    {
      id: "maerwynn_p1",
      name: "Stage Current",
      server: "MAERWYNN",
      guildSegment: "gm",
      guildName: "Stage Current",
    },
  ]);
  const f5Historical = snapshot("f5", timestamp("2025-01-01"), ["f5_fu"], [
    {
      id: "f5_fu_p1",
      name: "Stage Historical",
      server: "F5",
      guildSegment: "g5",
      guildName: "Stage Historical",
    },
  ]);
  const es10Historical = snapshot("es10", timestamp("2024-01-01"), ["s10_es"], [
    {
      id: "s10_es_p1",
      name: "Stage Historical",
      server: "ES10",
      guildSegment: "g10",
      guildName: "Stage Historical",
    },
  ]);

  const withIntermediate = buildFusionIdentityDashboardInventoryFromSnapshots(
    [f5Historical, maerwynnCurrent],
    { atDate: "2026-09-24" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(withIntermediate);
  assert.equal(withIntermediate.isLocallyMatchable, true);

  const withoutIntermediate = buildFusionIdentityDashboardInventoryFromSnapshots(
    [es10Historical, maerwynnCurrent],
    { atDate: "2026-09-24" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(withoutIntermediate);
  assert.equal(withoutIntermediate.isLocallyMatchable, true);

  const historicalOnly = buildFusionIdentityDashboardInventoryFromSnapshots(
    [es10Historical, f5Historical],
    { atDate: "2026-09-24" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(historicalOnly);
  assert.equal(historicalOnly.isLocallyMatchable, false);

  const currentOnly = buildFusionIdentityDashboardInventoryFromSnapshots(
    [maerwynnCurrent],
    { atDate: "2026-09-24" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(currentOnly);
  assert.equal(currentOnly.isLocallyMatchable, false);
}

{
  const mixedLineage = [
    snapshot("es10", timestamp("2024-01-01"), ["s10_es"], [
      {
        id: "s10_es_p1",
        name: "Stage Historical",
        server: "ES10",
        guildSegment: "g10",
        guildName: "Stage Historical",
      },
    ]),
    snapshot("f5", timestamp("2025-01-01"), ["f5_fu"], [
      {
        id: "f5_fu_p1",
        name: "Stage Intermediate",
        server: "F5",
        guildSegment: "g5",
        guildName: "Stage Intermediate",
      },
    ]),
    snapshot("maerwynn", timestamp("2025-05-01"), ["maerwynn"], [
      {
        id: "maerwynn_p1",
        name: "Stage Current",
        server: "MAERWYNN",
        guildSegment: "gm",
        guildName: "Stage Current",
      },
    ]),
    snapshot("eu1", timestamp("2026-01-01"), ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Foreign Historical",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Foreign Historical",
      },
    ]),
    snapshot("f28", timestamp("2026-02-07"), ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Foreign Current",
        server: "f28_net",
        guildSegment: "g28",
        guildName: "Foreign Current",
      },
    ]),
  ];
  const maerwynn = buildFusionIdentityDashboardInventoryFromSnapshots(mixedLineage, {
    atDate: "2026-09-24",
  }).scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(maerwynn);
  assert.deepEqual(maerwynn.coverage.map((entry) => entry.serverCode), [
    "ES10",
    "F5",
    "MAERWYNN",
  ]);
}

{
  const registry = ["OLD", "TARGET", "DATED"].map((code) =>
    serverDefinition(code, code === "OLD" ? "origin" : "fusion"),
  );
  const unknownEvent: LocalServerFusionEvent = {
    id: "fusion-target",
    origins: ["OLD"],
    target: "TARGET",
    compensationPolicy: "unknown",
  };
  const datedEvent: LocalServerFusionEvent = {
    id: "fusion-dated",
    origins: ["OLD"],
    target: "DATED",
    effectiveDate: "2026-01-10",
    compensationPolicy: "none",
  };

  const unknownMatchable = buildFusionIdentityDashboardInventoryFromSnapshots(
    [
      snapshot("old", timestamp("2026-01-01"), ["OLD"], [
        {
          id: "old_p1",
          name: "Old",
          server: "OLD",
          guildSegment: "g1",
          guildName: "Old",
        },
      ]),
      snapshot("target", timestamp("2026-01-02"), ["TARGET"], [
        {
          id: "target_p1",
          name: "Target",
          server: "TARGET",
          guildSegment: "g2",
          guildName: "Target",
        },
      ]),
    ],
    { atDate: "2026-09-24", registry, events: [unknownEvent] },
  ).scopes.find((entry) => entry.scope.targetServerCode === "TARGET");
  assert.ok(unknownMatchable);
  assert.equal(unknownMatchable.isLocallyMatchable, true);

  const unknownOneSide = buildFusionIdentityDashboardInventoryFromSnapshots(
    [
      snapshot("old", timestamp("2026-01-01"), ["OLD"], [
        {
          id: "old_p1",
          name: "Old",
          server: "OLD",
          guildSegment: "g1",
          guildName: "Old",
        },
      ]),
    ],
    { atDate: "2026-09-24", registry, events: [unknownEvent] },
  ).scopes.find((entry) => entry.scope.targetServerCode === "TARGET");
  assert.ok(unknownOneSide);
  assert.equal(unknownOneSide.isLocallyMatchable, false);

  const datedMatchable = buildFusionIdentityDashboardInventoryFromSnapshots(
    [
      snapshot("old", timestamp("2026-01-01"), ["OLD"], [
        {
          id: "old_p1",
          name: "Old",
          server: "OLD",
          guildSegment: "g1",
          guildName: "Old",
        },
      ]),
      snapshot("dated", timestamp("2026-01-11"), ["DATED"], [
        {
          id: "dated_p1",
          name: "Dated",
          server: "DATED",
          guildSegment: "g2",
          guildName: "Dated",
        },
      ]),
    ],
    { atDate: "2026-09-24", registry, events: [datedEvent] },
  ).scopes.find((entry) => entry.scope.targetServerCode === "DATED");
  assert.ok(datedMatchable);
  assert.equal(datedMatchable.isLocallyMatchable, true);

  const targetBeforeBoundary = buildFusionIdentityDashboardInventoryFromSnapshots(
    [
      snapshot("old", timestamp("2026-01-01"), ["OLD"], [
        {
          id: "old_p1",
          name: "Old",
          server: "OLD",
          guildSegment: "g1",
          guildName: "Old",
        },
      ]),
      snapshot("dated", timestamp("2026-01-05"), ["DATED"], [
        {
          id: "dated_p1",
          name: "Dated",
          server: "DATED",
          guildSegment: "g2",
          guildName: "Dated",
        },
      ]),
    ],
    { atDate: "2026-09-24", registry, events: [datedEvent] },
  ).scopes.find((entry) => entry.scope.targetServerCode === "DATED");
  assert.ok(targetBeforeBoundary);
  assert.equal(targetBeforeBoundary.isLocallyMatchable, false);
}

{
  const snapshots = [
    snapshot("eu1", 1000, ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Legacy Origin",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Legacy Guild",
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
    snapshot("f1", 3000, ["f1_fu"], [
      {
        id: "f1_fu_p1",
        name: "Inventory Only",
        server: "f1_fu",
        guildSegment: "g1",
        guildName: "Inventory Guild",
      },
    ]),
  ];
  const inventory = buildFusionIdentityDashboardInventoryFromSnapshots(snapshots, {
    atDate: "2026-09-24",
  });
  const f28 = inventory.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  const maerwynn = inventory.scopes.find(
    (entry) => entry.scope.targetServerCode === "MAERWYNN",
  );
  assert.ok(f28);
  assert.ok(maerwynn);

  const legacyF28 = {
    ...f28,
    scope: {
      id: "F28",
      label: "EU1-EU4 -> F28",
      targetServerCode: "F28",
      targetServerName: "Fusion 28",
      originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
      originServerNames: ["EU 1", "EU 2", "EU 3", "EU 4"],
    },
  } as unknown as FusionIdentityScopeInventory;
  const dashboardScopes = [legacyF28, maerwynn].map(normalizeFusionIdentityScopeInventory);

  assert.deepEqual(dashboardScopes[0]?.scope.directOriginServerCodes, [
    "EU1",
    "EU2",
    "EU3",
    "EU4",
  ]);
  assert.equal(dashboardScopes[0]?.scope.analysisSupported, true);
  assert.equal(dashboardScopes[1]?.scope.targetServerCode, "MAERWYNN");
  assert.equal(dashboardScopes[1]?.scope.analysisSupported, true);
  assert.equal(
    dashboardScopes.every((entry) => Array.isArray(entry.scope.directOriginServerCodes)),
    true,
  );
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

{
  const snapshots = [
    snapshot("eu1", timestamp("2026-01-01"), ["s1_eu"], [
      {
        id: "s1_eu_p1",
        name: "Legacy Origin",
        server: "s1_eu",
        guildSegment: "g1",
        guildName: "Legacy Guild",
      },
    ]),
    snapshot("f28", timestamp("2026-02-07"), ["f28_net"], [
      {
        id: "f28_net_p1",
        name: "Current",
        server: "f28_net",
        guildSegment: "g9",
        guildName: "Current",
      },
    ]),
    snapshot("f1", timestamp("2025-05-01"), ["f1_fu"], [
      {
        id: "f1_fu_p1",
        name: "Inventory Only",
        server: "f1_fu",
        guildSegment: "g1",
        guildName: "Inventory Guild",
      },
    ]),
  ];
  const contentHashByScanId = new Map(snapshots.map((entry) => [entry.sourceScanId, `hash-${entry.id}`]));
  const fromSnapshots = buildFusionIdentityDashboardInventoryFromSnapshots(snapshots, {
    atDate: "2026-09-24",
    contentHashByScanId,
  });
  const fromSummaries = buildFusionIdentityDashboardInventoryFromSummaries(
    snapshots.map((entry) => summaryFromSnapshot(entry, contentHashByScanId.get(entry.sourceScanId))),
    { atDate: "2026-09-24" },
  );
  const snapshotF28 = fromSnapshots.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  const summaryF28 = fromSummaries.scopes.find((entry) => entry.scope.targetServerCode === "F28");
  const summaryMaerwynn = fromSummaries.scopes.find((entry) => entry.scope.targetServerCode === "MAERWYNN");
  assert.ok(snapshotF28);
  assert.ok(summaryF28);
  assert.ok(summaryMaerwynn);
  assert.equal(summaryF28.scanFingerprint, snapshotF28.scanFingerprint);
  assert.equal(summaryF28.currentPlayerIdentifiers.includes("f28_net_p1"), true);
  assert.equal(summaryF28.currentGuildIdentifiers.includes("f28_net_g9"), true);
  assert.equal(summaryF28.relevantSnapshotIds.includes("f28::F28"), true);
  assert.equal(summaryF28.relevantSnapshotIds.includes("f1::F1"), false);
  assert.equal(fromSummaries.coverage.some((entry) => entry.serverCode === "F1"), true);
  assert.equal(
    fromSummaries.scopes.every(
      (entry) =>
        Array.isArray(entry.scope.directOriginServerCodes) &&
        Array.isArray(entry.scope.transitiveOriginServerCodes) &&
        Array.isArray(entry.currentPlayerIdentifiers) &&
        Array.isArray(entry.currentGuildIdentifiers),
    ),
    true,
  );
  assert.equal(fromSummaries.coverage.find((entry) => entry.serverCode === "EU1")?.playerObservationCount, 1);
  assert.equal(snapshots.map((entry) => summaryFromSnapshot(entry)).flatMap((summary) =>
    summary.fusionInventorySlices ?? [],
  ).some((slice) => slice.server === "s1_eu" && Array.isArray(slice.playerIdentifiers)), false);
  assert.equal(snapshots.map((entry) => summaryFromSnapshot(entry)).flatMap((summary) =>
    summary.fusionInventorySlices ?? [],
  ).some((slice) => slice.server === "f28_net" && Array.isArray(slice.playerIdentifiers)), true);
}

{
  const firstTarget = snapshot("f28-first", timestamp("2026-02-07"), ["f28_net"], [
    {
      id: "f28_net_a",
      name: "Current A",
      server: "f28_net",
      guildSegment: "g1",
      guildName: "Guild 1",
    },
    {
      id: "f28_net_b",
      name: "Current B",
      server: "f28_net",
      guildSegment: "g2",
      guildName: "Guild 2",
    },
    {
      id: "f28_net_c",
      name: "Current C",
      server: "f28_net",
      guildSegment: "g2",
      guildName: "Guild 2",
    },
  ]);
  const secondTarget = snapshot("f28-second", timestamp("2026-02-14"), ["f28_net"], [
    {
      id: "f28_net_b",
      name: "Current B Duplicate",
      server: "f28_net",
      guildSegment: "g2",
      guildName: "Guild 2",
    },
    {
      id: "f28_net_c",
      name: "Current C Duplicate",
      server: "f28_net",
      guildSegment: "g2",
      guildName: "Guild 2",
    },
    {
      id: "f28_net_d",
      name: "Current D",
      server: "f28_net",
      guildSegment: "g3",
      guildName: "Guild 3",
    },
  ]);
  const newestPartialTarget = snapshot("f28-partial", timestamp("2026-03-01"), ["f28_net"], [
    {
      id: "f28_net_d",
      name: "Current D Partial",
      server: "f28_net",
      guildSegment: "g3",
      guildName: "Guild 3",
    },
  ]);
  const historicalWithoutPersistedIdentifiers = snapshot("eu1-historical", timestamp("2026-01-01"), ["s1_eu"], [
    {
      id: "s1_eu_historical_only",
      name: "Historical Only",
      server: "s1_eu",
      guildSegment: "g9",
      guildName: "Historical Guild",
    },
  ]);
  const summaryF28 = buildFusionIdentityDashboardInventoryFromSummaries(
    [
      summaryFromSnapshot(historicalWithoutPersistedIdentifiers),
      summaryFromSnapshot(firstTarget),
      summaryFromSnapshot(secondTarget),
      summaryFromSnapshot(newestPartialTarget),
    ],
    { atDate: "2026-09-24" },
  ).scopes.find((entry) => entry.scope.targetServerCode === "F28");
  assert.ok(summaryF28);
  assert.deepEqual(summaryF28.currentPlayerIdentifiers, [
    "f28_net_a",
    "f28_net_b",
    "f28_net_c",
    "f28_net_d",
  ]);
  assert.deepEqual(summaryF28.currentGuildIdentifiers, [
    "f28_net_g1",
    "f28_net_g2",
    "f28_net_g3",
  ]);
  assert.equal(summaryF28.currentPlayerIdentifiers.includes("s1_eu_historical_only"), false);
}

{
  const physicalMultiServer = snapshot("physical-multi", timestamp("2026-02-07"), ["s1_eu", "s2_eu", "f28_net"], [
    {
      id: "s1_eu_p1",
      name: "Origin One",
      server: "s1_eu",
      guildSegment: "g1",
      guildName: "Origin One",
    },
    {
      id: "s2_eu_p2",
      name: "Origin Two",
      server: "s2_eu",
      guildSegment: "g2",
      guildName: "Origin Two",
    },
    {
      id: "f28_net_p1",
      name: "Target",
      server: "f28_net",
      guildSegment: "g9",
      guildName: "Target",
    },
  ]);
  const timings: FusionIdentityDashboardInventoryTiming[] = [];
  const inventory = buildFusionIdentityDashboardInventoryFromSummaries(
    [summaryFromSnapshot(physicalMultiServer)],
    {
      atDate: "2026-09-24",
      onTiming: (timing) => timings.push(timing),
    },
  );

  assert.deepEqual(
    inventory.coverage.map((entry) => entry.serverCode),
    ["EU1", "EU2", "F28"],
  );
  assert.equal(inventory.scanCount, 1);
  assert.equal(inventory.allSnapshotCount, 1);
  assert.equal(timings.some((timing) => timing.phase === "raw-scan-loading"), false);
  assert.equal(timings.some((timing) => timing.phase === "normalized-snapshot-creation"), false);
}
