import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  deriveLocalToplistsFromConfirmedScans,
} from "../../src/lib/toplists/localToplistDerivation.ts";
import {
  LOCAL_GUILD_TOPLIST_METRICS,
  LOCAL_PLAYER_TOPLIST_METRICS,
} from "../../src/lib/toplists/localToplistMetrics.ts";
import type { LocalToplistConfirmedScanSource } from "../../src/lib/toplists/localToplistTypes.ts";

const SHA = "a".repeat(64);
const YEAR = 2026;
const TS = Date.UTC(YEAR, 0, 15, 12, 0, 0);

type PlayerFixture = {
  server?: string;
  timestamp?: number;
  id: number;
  name: string;
  guildId?: number;
  guildIdentifier?: string | null;
  groupIdentifier?: string | null;
  guildIdRaw?: string | number | null;
  rawGroup?: unknown;
  guildName?: string | null;
  classId?: number;
  level?: number;
  main?: number | null;
  con?: number | null;
  mainTotal?: number | null;
  conTotal?: number | null;
  mine?: number | null;
  treasury?: number | null;
  xpProgress?: number | null;
  xpTotal?: number | null;
  omitGuildIdentifier?: boolean;
  omitMine?: boolean;
  omitTreasury?: boolean;
  omitXpProgress?: boolean;
  omitXpTotal?: boolean;
};

type GuildFixture = {
  server?: string;
  timestamp?: number;
  id: number;
  name: string;
  memberIds?: number[];
  rank?: number;
  honor?: number;
  raids?: number;
  portalFloor?: number;
  hydra?: number;
  petLevel?: number;
  instructorBonuses?: number[];
};

const makePlayer = ({
  server = "s1",
  timestamp = TS,
  id,
  name,
  guildId = 100,
  guildIdentifier,
  groupIdentifier,
  guildIdRaw,
  rawGroup,
  guildName = "Alpha",
  classId = 1,
  level = 100,
  main = 1000,
  con = 500,
  mainTotal = 1200,
  conTotal = 650,
  mine = 0,
  treasury = 10,
  xpProgress = 123,
  xpTotal = 456,
  omitGuildIdentifier = false,
  omitMine = false,
  omitTreasury = false,
  omitXpProgress = false,
  omitXpTotal = false,
}: PlayerFixture) => {
  const values: Record<string, unknown> = {
    Base: main,
    "Base Strength": main,
    "Base Constitution": con,
    Attribute: mainTotal,
    Constitution: conTotal,
  };
  if (!omitXpProgress) values.XP = xpProgress;
  if (!omitXpTotal) values["XP Total"] = xpTotal;
  if (!omitMine) values["Gem Mine"] = mine;
  if (!omitTreasury) values.Treasury = treasury;
  const row: Record<string, unknown> = {
    prefix: server,
    timestamp,
    identifier: `${server}_p${id}`,
    playerId: id,
    name,
    class: classId,
    level,
    guildName,
    rank: id,
    values,
  };
  if (!omitGuildIdentifier) row.guildIdentifier = guildIdentifier === undefined ? `${server}_g${guildId}` : guildIdentifier;
  if (groupIdentifier !== undefined) row.groupIdentifier = groupIdentifier;
  if (guildIdRaw !== undefined) row.guildId = guildIdRaw;
  if (rawGroup !== undefined) row.group = rawGroup;
  return row;
};

const makeGuild = ({
  server = "s1",
  timestamp = TS,
  id,
  name,
  memberIds = [],
  rank = 7,
  honor = 12345,
  raids = 50,
  portalFloor = 12,
  hydra = 0,
  petLevel = 33,
  instructorBonuses = [],
}: GuildFixture) => {
  const save: unknown[] = [];
  save[0] = id;
  save[7] = portalFloor * 0x10000;
  save[8] = raids;
  save[13] = honor;
  save[377] = 4;
  save[378] = petLevel;
  save[379] = hydra;
  memberIds.forEach((memberId, slot) => {
    save[14 + slot] = memberId;
    save[64 + slot] = 100 + slot;
    save[214 + slot] = 100;
    save[264 + slot] = instructorBonuses[slot] ?? 0;
    save[314 + slot] = slot === 0 ? 1 : 3;
  });
  return {
    prefix: server,
    timestamp,
    identifier: `${server}_g${id}`,
    name,
    rank,
    save,
  };
};

const makeSource = (
  id: string,
  server: string,
  players: unknown[],
  groups: unknown[],
  overrides: Partial<LocalToplistConfirmedScanSource> = {},
): LocalToplistConfirmedScanSource => ({
  manifestYear: YEAR,
  archiveScanId: id,
  archiveSha256: SHA,
  server,
  scanTimestamp: TS,
  localScanId: `local-${id}`,
  rawScan: { players, groups },
  confirmation: { kind: "archiveSource", archiveScanId: id, archiveSha256: SHA },
  ...overrides,
});

const findPlayer = (result: ReturnType<typeof deriveLocalToplistsFromConfirmedScans>, identifier: string) => {
  const row = result.players.find((player) => player.identifier === identifier);
  assert.ok(row, `expected player ${identifier}`);
  return row;
};

const findGuild = (result: ReturnType<typeof deriveLocalToplistsFromConfirmedScans>, identifier: string) => {
  const row = result.guilds.find((guild) => guild.guildIdentifier === identifier);
  assert.ok(row, `expected guild ${identifier}`);
  return row;
};

describe("local toplist derivation", () => {
  test("derives player and guild rows from confirmed raw archive scans only", () => {
    const source = makeSource(
      "scan-a",
      "s1",
      [
        makePlayer({ id: 1, name: "Ada", level: 100, main: 1000, con: 500, mainTotal: 1200, conTotal: 650, mine: 0, treasury: 20 }),
        makePlayer({ id: 2, name: "Ben", level: 200, main: 2000, con: 700, mainTotal: 2300, conTotal: 900, mine: 4, treasury: 40 }),
      ],
      [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2], instructorBonuses: [100, 150] })],
    );

    const result = deriveLocalToplistsFromConfirmedScans([source]);
    assert.equal(result.status, "complete");
    assert.equal(result.players.length, 2);
    assert.equal(result.guilds.length, 1);
    assert.equal(result.earliestTimestamp, TS);
    assert.equal(result.latestTimestamp, TS);
    assert.equal(result.snapshots[0]?.server, "EU1");
    assert.equal(result.snapshots[0]?.sourceServer, "s1");
    assert.equal(result.snapshots[0]?.archiveScanId, "scan-a");
    assert.equal(result.snapshots[0]?.archiveSha256, SHA);

    const ada = findPlayer(result, "s1_p1");
    assert.equal(ada.server, "EU1");
    assert.equal(ada.sourceServer, "s1");
    assert.equal(ada.archiveScanId, "scan-a");
    assert.equal(ada.localScanId, "local-scan-a");
    assert.equal(ada.class, "Warrior");
    assert.equal(ada.level, 100);
    assert.equal(ada.main, 1000);
    assert.equal(ada.con, 500);
    assert.equal(ada.sum, 1500);
    assert.equal(ada.ratio, 67);
    assert.equal(ada.mainTotal, 1200);
    assert.equal(ada.conTotal, 650);
    assert.equal(ada.sumTotal, 1850);
    assert.equal(ada.xpProgress, 123);
    assert.equal(ada.xpTotal, 456);
    assert.equal(ada.mine, 0);
    assert.equal(ada.treasury, 20);
    assert.equal(ada.statsPerDay, null);
    assert.equal(ada.statsDayTotal, null);
    assert.equal(ada.latestScanAtSec, Math.floor(TS / 1000));

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.server, "EU1");
    assert.equal(guild.hofRank, 7);
    assert.equal(guild.honor, 12345);
    assert.equal(guild.raids, 50);
    assert.equal(guild.portalFloor, 12);
    assert.equal(guild.hydra, 0);
    assert.equal(guild.petLevel, 33);
    assert.equal(guild.instructor, 50);
    assert.equal(guild.memberCount, 2);
    assert.equal(guild.memberBasisStatus, "complete");
    assert.equal(guild.memberBasisCount, 2);
    assert.equal(guild.avgLevel, 150);
    assert.equal(guild.avgBaseMain, 1500);
    assert.equal(guild.avgConBase, 600);
    assert.equal(guild.avgSumBaseTotal, 2100);
    assert.equal(guild.avgAttrTotal, 1750);
    assert.equal(guild.avgConTotal, 775);
    assert.equal(guild.avgTotalStats, 2525);
    assert.equal(guild.avgMine, 2);
    assert.equal(guild.avgTreasury, 30);
    assert.equal(guild.sumAvg, 2100);

    assert.deepEqual(structuredClone(result), result);
  });

  test("keeps servers, archive bindings, identifiers, and same names separate", () => {
    const sources = [
      makeSource("scan-s1", "s1", [makePlayer({ id: 1, name: "Same" })], [makeGuild({ id: 100, name: "One", memberIds: [1] })]),
      makeSource(
        "scan-f8",
        "f8_net",
        [makePlayer({ server: "f8_net", id: 1, name: "Same", guildId: 200 })],
        [makeGuild({ server: "f8_net", id: 200, name: "Two", memberIds: [1] })],
        { confirmation: { kind: "archiveBinding", archiveScanId: "scan-f8", archiveSha256: SHA, localContentHash: "local-hash" } },
      ),
      makeSource(
        "scan-s30",
        "s30_eu",
        [makePlayer({ server: "s30_eu", id: 1, name: "Same", guildId: 300 })],
        [makeGuild({ server: "s30_eu", id: 300, name: "Three", memberIds: [1] })],
      ),
    ];

    const result = deriveLocalToplistsFromConfirmedScans(sources);
    assert.equal(result.status, "complete");
    assert.equal(result.players.length, 3);
    assert.deepEqual(result.players.map((player) => player.identifier).sort(), ["f8_net_p1", "s1_p1", "s30_eu_p1"]);
    assert.deepEqual(new Set(result.players.map((player) => player.name)), new Set(["Same"]));
    assert.deepEqual(new Set(result.players.map((player) => player.server)), new Set(["EU1", "EU30", "F8"]));
    assert.equal(findPlayer(result, "f8_net_p1").archiveScanId, "scan-f8");
    assert.equal(findGuild(result, "s30_eu_g300").server, "EU30");
  });

  test("rejects unconfirmed or mismatching raw scans without deriving rows", () => {
    const unconfirmed = makeSource(
      "scan-bad",
      "s1",
      [makePlayer({ id: 1, name: "Ada" })],
      [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      { confirmation: { kind: "archiveSource", archiveScanId: "other", archiveSha256: SHA } },
    );
    const mismatchedRaw = makeSource(
      "scan-mismatch",
      "s1",
      [makePlayer({ id: 2, name: "Ben", timestamp: TS + 1 })],
      [],
    );

    const result = deriveLocalToplistsFromConfirmedScans([unconfirmed, mismatchedRaw]);
    assert.equal(result.status, "empty");
    assert.equal(result.players.length, 0);
    assert.equal(result.guilds.length, 0);
    assert.ok(result.issues.some((issue) => issue.code === "unconfirmed-source" && issue.severity === "error"));
    assert.ok(result.issues.some((issue) => issue.code === "raw-scan-mismatch" && issue.severity === "error"));
  });

  test("does not use name aliases or cross-guild fusion for guild averages", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-alias",
        "s1",
        [
          makePlayer({ id: 1, name: "Twin", guildId: 100, main: 1000, con: 500 }),
          makePlayer({ id: 2, name: "Twin", guildId: 999, guildName: "Other", main: 9999, con: 9999 }),
        ],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      ),
    ]);

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "complete");
    assert.equal(guild.memberBasisCount, 1);
    assert.equal(guild.avgBaseMain, 1000);
    assert.equal(guild.avgConBase, 500);
    assert.equal(guild.avgSumBaseTotal, 1500);
  });

  test("uses raw group as guildIdentifier fallback", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-raw-group",
        "s1",
        [makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, rawGroup: "s1_g100", main: 1000, con: 500 })],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      ),
    ]);

    const player = findPlayer(result, "s1_p1");
    assert.equal(player.guildIdentifier, "s1_g100");

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "complete");
    assert.equal(guild.memberBasisCount, 1);
    assert.equal(guild.avgBaseMain, 1000);
    assert.equal(guild.avgConBase, 500);
    assert.equal(guild.avgSumBaseTotal, 1500);
  });

  test("keeps existing canonical guildIdentifier before raw group", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-group-priority",
        "s1",
        [makePlayer({ id: 1, name: "Ada", guildIdentifier: "s1_g100", rawGroup: "s1_g999", main: 1000, con: 500 })],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      ),
    ]);

    assert.equal(findPlayer(result, "s1_p1").guildIdentifier, "s1_g100");
    assert.equal(findGuild(result, "s1_g100").memberBasisStatus, "complete");
  });

  test("uses existing groupIdentifier and guildId before raw group", () => {
    const groupIdentifierResult = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-group-identifier-priority",
        "s1",
        [makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, groupIdentifier: "s1_g100", rawGroup: "s1_g999" })],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      ),
    ]);
    assert.equal(findPlayer(groupIdentifierResult, "s1_p1").guildIdentifier, "s1_g100");
    assert.equal(findGuild(groupIdentifierResult, "s1_g100").memberBasisStatus, "complete");

    const guildIdResult = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-guild-id-priority",
        "s1",
        [makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, guildIdRaw: "s1_g100", rawGroup: "s1_g999" })],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1] })],
      ),
    ]);
    assert.equal(findPlayer(guildIdResult, "s1_p1").guildIdentifier, "s1_g100");
    assert.equal(findGuild(guildIdResult, "s1_g100").memberBasisStatus, "complete");
  });

  test("does not treat empty, null, or non-scalar raw group as guildIdentifier", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-empty-group",
        "s1",
        [
          makePlayer({ id: 1, name: "Empty", omitGuildIdentifier: true, rawGroup: "" }),
          makePlayer({ id: 2, name: "Null", omitGuildIdentifier: true, rawGroup: null }),
          makePlayer({ id: 3, name: "Object", omitGuildIdentifier: true, rawGroup: { identifier: "s1_g100" } }),
        ],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2, 3] })],
      ),
    ]);

    assert.equal(findPlayer(result, "s1_p1").guildIdentifier, null);
    assert.equal(findPlayer(result, "s1_p2").guildIdentifier, null);
    assert.equal(findPlayer(result, "s1_p3").guildIdentifier, null);
    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "incomplete");
    assert.equal(guild.memberBasisCount, 0);
    assert.equal(guild.avgBaseMain, null);
  });

  test("marks incomplete guild member bases and leaves averages empty", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-incomplete",
        "s1",
        [makePlayer({ id: 1, name: "Ada", guildId: 100, main: 1000, con: 500 })],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2] })],
      ),
    ]);

    const guild = findGuild(result, "s1_g100");
    assert.equal(result.status, "complete");
    assert.equal(guild.memberCount, 2);
    assert.equal(guild.memberBasisStatus, "incomplete");
    assert.equal(guild.memberBasisCount, 1);
    assert.equal(guild.avgLevel, null);
    assert.equal(guild.avgBaseMain, null);
    assert.equal(guild.avgConBase, null);
    assert.equal(guild.avgSumBaseTotal, null);
    assert.ok(result.issues.some((issue) => issue.code === "incomplete-guild-member-basis" && issue.severity === "warning"));
  });

  test("computes complete guild base and total averages from expected members only", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-expected-members",
        "s1",
        [
          makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, rawGroup: "s1_g100", level: 100, main: 1000, con: 500, mainTotal: 1200, conTotal: 650 }),
          makePlayer({ id: 2, name: "Ben", omitGuildIdentifier: true, rawGroup: "s1_g100", level: 200, main: 2000, con: 700, mainTotal: 2300, conTotal: 900 }),
          makePlayer({ id: 3, name: "Extra", omitGuildIdentifier: true, rawGroup: "s1_g100", level: 999, main: 9999, con: 9999, mainTotal: 9999, conTotal: 9999 }),
        ],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2] })],
      ),
    ]);

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "complete");
    assert.equal(guild.memberBasisCount, 2);
    assert.equal(guild.avgLevel, 150);
    assert.equal(guild.avgBaseMain, 1500);
    assert.equal(guild.avgConBase, 600);
    assert.equal(guild.avgSumBaseTotal, 2100);
    assert.equal(guild.avgAttrTotal, 1750);
    assert.equal(guild.avgConTotal, 775);
    assert.equal(guild.avgTotalStats, 2525);
  });

  test("does not let extra same-guild players replace missing expected members", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-extra-does-not-complete",
        "s1",
        [
          makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, rawGroup: "s1_g100", main: 1000, con: 500 }),
          makePlayer({ id: 3, name: "Extra", omitGuildIdentifier: true, rawGroup: "s1_g100", main: 9999, con: 9999 }),
        ],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2] })],
      ),
    ]);

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "incomplete");
    assert.equal(guild.memberBasisCount, 1);
    assert.equal(guild.avgLevel, null);
    assert.equal(guild.avgBaseMain, null);
    assert.equal(guild.avgConBase, null);
    assert.equal(guild.avgSumBaseTotal, null);
    assert.equal(guild.avgAttrTotal, null);
    assert.equal(guild.avgConTotal, null);
    assert.equal(guild.avgTotalStats, null);
  });

  test("does not let duplicate player rows replace missing guild members", () => {
    const player = makePlayer({ id: 1, name: "Ada", omitGuildIdentifier: true, rawGroup: "s1_g100", main: 1000, con: 500 });
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-duplicate-does-not-complete",
        "s1",
        [player, { ...player }],
        [makeGuild({ id: 100, name: "Alpha", memberIds: [1, 2] })],
      ),
    ]);

    const guild = findGuild(result, "s1_g100");
    assert.equal(guild.memberBasisStatus, "incomplete");
    assert.equal(guild.memberBasisCount, 1);
    assert.equal(guild.avgBaseMain, null);
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-identical-player" && issue.severity === "warning"));
  });

  test("deduplicates identical rows and reports conflicting duplicates", () => {
    const player = makePlayer({ id: 1, name: "Ada", guildId: 100, level: 100 });
    const playerConflict = makePlayer({ id: 1, name: "Ada", guildId: 100, level: 101 });
    const guild = makeGuild({ id: 100, name: "Alpha", memberIds: [1] });
    const guildConflict = makeGuild({ id: 100, name: "Alpha", memberIds: [1], honor: 999 });

    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource("scan-dupes", "s1", [player, { ...player }, playerConflict], [guild, { ...guild }, guildConflict]),
    ]);

    assert.equal(result.players.length, 1);
    assert.equal(result.guilds.length, 1);
    assert.equal(findPlayer(result, "s1_p1").level, 100);
    assert.equal(findGuild(result, "s1_g100").honor, 12345);
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-identical-player" && issue.severity === "warning"));
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-conflicting-player" && issue.severity === "error"));
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-identical-guild" && issue.severity === "warning"));
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-conflicting-guild" && issue.severity === "error"));
    assert.equal(result.status, "partial");
  });

  test("preserves missing numeric values as null while keeping explicit zero", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-missing",
        "s1",
        [
          makePlayer({ id: 1, name: "Ada", mine: 0, treasury: 0, xpProgress: 0, xpTotal: 0, main: null, con: 500 }),
          makePlayer({ id: 2, name: "Ben", omitMine: true, omitTreasury: true, omitXpProgress: true, omitXpTotal: true, main: 500, con: 500 }),
        ],
        [],
      ),
    ]);

    const zeroRow = findPlayer(result, "s1_p1");
    assert.equal(zeroRow.mine, 0);
    assert.equal(zeroRow.treasury, 0);
    assert.equal(zeroRow.xpProgress, 0);
    assert.equal(zeroRow.xpTotal, 0);
    assert.equal(zeroRow.main, null);
    assert.equal(zeroRow.sum, null);
    assert.equal(zeroRow.ratio, 0);

    const missingRow = findPlayer(result, "s1_p2");
    assert.equal(missingRow.mine, null);
    assert.equal(missingRow.treasury, null);
    assert.equal(missingRow.xpProgress, null);
    assert.equal(missingRow.xpTotal, null);
  });

  test("uses public player ratio semantics instead of sum per level", () => {
    const result = deriveLocalToplistsFromConfirmedScans([
      makeSource(
        "scan-ratio",
        "s1",
        [
          makePlayer({ id: 1, name: "Ada", level: 100, main: 2930, con: 2725, mainTotal: 4000, conTotal: 3000 }),
          makePlayer({ id: 2, name: "Zero", level: 100, main: 0, con: 0, mainTotal: 0, conTotal: 0, mine: 0, treasury: 0, xpProgress: 0, xpTotal: 0 }),
        ],
        [],
      ),
    ]);

    const ada = findPlayer(result, "s1_p1");
    assert.equal(ada.sum, 5655);
    assert.equal(ada.ratio, 52);
    assert.notEqual(ada.ratio, ada.sum! / ada.level!);
    assert.equal(ada.mainTotal, 4000);
    assert.equal(ada.conTotal, 3000);
    assert.equal(ada.sumTotal, 7000);

    const zero = findPlayer(result, "s1_p2");
    assert.equal(zero.sum, 0);
    assert.equal(zero.ratio, null);
    assert.equal(zero.mine, 0);
    assert.equal(zero.treasury, 0);
    assert.equal(zero.xpProgress, 0);
    assert.equal(zero.xpTotal, 0);
  });

  test("publishes metric definitions for every existing local toplist sort key", () => {
    const playerMetrics = new Map(LOCAL_PLAYER_TOPLIST_METRICS.map((metric) => [metric.metricKey, metric]));
    for (const key of [
      "level",
      "main",
      "constitution",
      "sum",
      "statsDay",
      "ratio",
      "mine",
      "treasury",
      "mainTotal",
      "conTotal",
      "sumTotal",
      "statsDayTotal",
      "xpProgress",
      "xpTotal",
      "lastScan",
    ]) {
      assert.ok(playerMetrics.has(key), `missing player metric ${key}`);
    }
    assert.equal(playerMetrics.get("statsDay")?.missingValueBehavior, "not-derived");
    assert.equal(playerMetrics.get("statsDayTotal")?.missingValueBehavior, "not-derived");

    const guildMetrics = new Map(LOCAL_GUILD_TOPLIST_METRICS.map((metric) => [metric.metricKey, metric]));
    for (const key of ["guildMembers", "guildAvgLevel", "guildAvgMain", "guildAvgCon", "guildAvgSum", "guildRaids", "guildHydra"]) {
      assert.ok(guildMetrics.has(key), `missing guild metric ${key}`);
    }
  });

  test("stays pure and does not call browser or network sources", () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fetch must not be used by local toplist derivation");
    }) as typeof fetch;
    try {
      const result = deriveLocalToplistsFromConfirmedScans([
        makeSource("scan-pure", "s1", [makePlayer({ id: 1, name: "Ada" })], []),
      ]);
      assert.equal(result.players.length, 1);
      assert.equal(result.guilds.length, 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
