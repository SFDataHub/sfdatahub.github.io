import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { ToplistGuildRow, ToplistPlayerRow } from "../../src/lib/toplists/toplistContracts.ts";
import type { ScanArchiveManifest, ScanArchiveManifestScan } from "../../src/lib/scanArchive/types.ts";
import type { LocalGuildToplistComparisonRow, LocalPlayerToplistComparisonRow } from "../../src/lib/toplists/localToplistComparison.ts";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../src/lib/toplists/localToplistTypes.ts";
import {
  enrichLocalGuildCompareRows,
  enrichLocalPlayerCompareRows,
  resolveLocalToplistCompareEntryPlan,
} from "../../src/pages/GuildHub/localToplistCompareModel.ts";

const scan = (id: string, server: string, timestamp: number): ScanArchiveManifestScan => ({
  id,
  server,
  timestamp,
  timestampUtc: new Date(timestamp).toISOString(),
  path: `${id}.json.gz`,
  format: "sf-tools",
  compression: "gzip",
  sha256: id.padEnd(64, "a").slice(0, 64),
  compressedBytes: 1,
  uncompressedBytes: 2,
  playerCount: 1,
  groupCount: 1,
  searchIndex: {
    schemaVersion: 1,
    path: `${id}.search.json.gz`,
    sha256: id.padEnd(64, "b").slice(0, 64),
    compressedBytes: 1,
    uncompressedBytes: 2,
    playerCount: 1,
    groupCount: 1,
  },
});

const manifest = (): ScanArchiveManifest => ({
  schemaVersion: 1,
  archiveYear: 2026,
  revision: 1,
  updatedAt: "2026-03-01T00:00:00.000Z",
  scanCount: 7,
  serverCount: 3,
  scans: [
    scan("eu1-jan", "EU1", Date.UTC(2026, 0, 10)),
    scan("eu1-feb", "EU1", Date.UTC(2026, 1, 10)),
    scan("eu1-current", "EU1", Date.UTC(2026, 2, 10)),
    scan("eu2-feb", "EU2", Date.UTC(2026, 1, 10)),
    scan("eu2-current", "EU2", Date.UTC(2026, 2, 10)),
    scan("eu3-feb", "EU3", Date.UTC(2026, 1, 10)),
    scan("eu3-current", "EU3", Date.UTC(2026, 2, 10)),
  ],
  toplists: {
    schemaVersion: 1,
    current: {
      EU1: "eu1-current",
      EU2: "eu2-current",
      EU3: "eu3-current",
    },
    monthly: {
      "2026-01": {
        EU1: "eu1-jan",
      },
      "2026-02": {
        EU1: "eu1-feb",
        EU2: "eu2-feb",
        EU3: "eu3-feb",
      },
    },
  },
});

const manifestUrlsByYear = { 2026: "https://example.invalid/archive/2026/manifest.json" };

const localPlayer = (overrides: Partial<LocalPlayerToplistRow>): LocalPlayerToplistRow => ({
  rowKey: "p1",
  identifier: "eu1_p1",
  playerId: "1",
  name: "Ada",
  server: "EU1",
  sourceServer: "EU1",
  scanTimestamp: Date.UTC(2026, 1, 10),
  manifestYear: 2026,
  archiveScanId: "scan",
  archiveSha256: "a".repeat(64),
  localScanId: "local",
  class: "Warrior",
  classId: 1,
  guild: null,
  guildIdentifier: null,
  hofRank: null,
  level: 1,
  main: 100,
  con: 50,
  sum: 150,
  ratio: null,
  mainTotal: 130,
  conTotal: 70,
  sumTotal: 200,
  xpProgress: null,
  xpTotal: null,
  mine: null,
  treasury: null,
  statsPerDay: null,
  statsDayTotal: null,
  lastScan: null,
  latestScanAtSec: Math.floor(Date.UTC(2026, 1, 10) / 1000),
  ...overrides,
});

const publicPlayer = (local: LocalPlayerToplistRow): ToplistPlayerRow & { __localRow: LocalPlayerToplistRow; tableRank: number } => ({
  __localRow: local,
  tableRank: 1,
  identifier: local.identifier,
  playerId: local.playerId,
  flag: null,
  deltaRank: null,
  server: local.server,
  name: local.name,
  class: local.class,
  level: local.level,
  guild: local.guild,
  main: local.main,
  con: local.con,
  sum: local.sum,
  ratio: null,
  mainTotal: local.mainTotal,
  conTotal: local.conTotal,
  sumTotal: local.sumTotal,
  xpProgress: local.xpProgress,
  xpTotal: local.xpTotal,
  mine: local.mine,
  treasury: local.treasury,
  lastScan: local.lastScan,
  deltaSum: null,
});

const localGuild = (overrides: Partial<LocalGuildToplistRow>): LocalGuildToplistRow => ({
  rowKey: "g1",
  guildId: "g1",
  guildIdentifier: "eu1_g1",
  name: "Alpha",
  server: "EU1",
  sourceServer: "EU1",
  scanTimestamp: Date.UTC(2026, 1, 10),
  manifestYear: 2026,
  archiveScanId: "scan",
  archiveSha256: "a".repeat(64),
  localScanId: "local",
  hofRank: 5,
  honor: 1000,
  raids: 10,
  portalFloor: 3,
  hydra: 2,
  petLevel: 1,
  instructor: 1,
  memberCount: 40,
  avgLevel: 100,
  avgBaseMain: 1000,
  avgConBase: 900,
  avgSumBaseTotal: 1900,
  avgAttrTotal: 1200,
  avgConTotal: 950,
  avgTotalStats: 2150,
  avgMine: 0,
  avgTreasury: null,
  sumAvg: 1900,
  memberBasisStatus: "complete",
  memberBasisCount: 40,
  lastScan: null,
  latestScanAtSec: Math.floor(Date.UTC(2026, 1, 10) / 1000),
  ...overrides,
});

const publicGuild = (local: LocalGuildToplistRow): ToplistGuildRow & { __localRow: LocalGuildToplistRow; tableRank: number } => ({
  __localRow: local,
  tableRank: 1,
  guildId: local.guildId,
  server: local.server,
  name: local.name,
  honor: local.honor,
  raids: local.raids,
  portalFloor: local.portalFloor,
  hydra: local.hydra,
  instructor: local.instructor,
  memberCount: local.memberCount,
  hofRank: local.hofRank,
  latestScanAtSec: local.latestScanAtSec,
  lastScan: local.lastScan,
  sumAvg: local.sumAvg,
  avgLevel: local.avgLevel,
  avgTreasury: local.avgTreasury,
  avgMine: local.avgMine,
  avgBaseMain: local.avgBaseMain,
  avgConBase: local.avgConBase,
  avgSumBaseTotal: local.avgSumBaseTotal,
  avgAttrTotal: local.avgAttrTotal,
  avgConTotal: local.avgConTotal,
  avgTotalStats: local.avgTotalStats,
});

describe("local toplist compare model", () => {
  const rawF28Manifest = (): ScanArchiveManifest => {
    const source = manifest();
    source.scans = [
      scan("f28-aug-a", "f28_net", Date.UTC(2026, 7, 2, 9)),
      scan("f28-aug-b", "f28_net", Date.UTC(2026, 7, 2, 10)),
      scan("f28-sep-a", "f28_net", Date.UTC(2026, 8, 5, 9)),
      scan("f28-sep-b", "f28_net", Date.UTC(2026, 8, 5, 10)),
    ];
    source.scanCount = source.scans.length;
    source.serverCount = 1;
    source.toplists = {
      schemaVersion: 1,
      current: { f28_net: { scanIds: ["f28-sep-a", "f28-sep-b"] } },
      monthly: {
        "2026-08": { f28_net: { scanIds: ["f28-aug-a", "f28-aug-b"] } },
        "2026-09": { f28_net: { scanIds: ["f28-sep-a", "f28-sep-b"] } },
      },
    };
    return source;
  };
  const rawF28Plan = (source: ScanArchiveManifest, mode: "months" | "progress" = "months") =>
    resolveLocalToplistCompareEntryPlan({
      mode, selectedServers: ["F28"], progressSinceMonth: "2026-08",
      compareFromMonth: "2026-08", compareToMonth: "2026-09",
      manifests: [source], manifestUrlsByYear,
    });

  for (const mode of ["progress", "months"] as const) {
    for (const kind of ["legacy", "set"] as const) {
      test(`${mode} resolves UI F28 against f28_net with ${kind} references`, () => {
        const source = rawF28Manifest();
        if (kind === "legacy") {
          source.toplists!.monthly!["2026-08"].f28_net = "f28-aug-a";
          source.toplists!.monthly!["2026-09"].f28_net = "f28-sep-a";
          source.toplists!.current!.f28_net = "f28-sep-a";
        }
        const plan = rawF28Plan(source, mode);
        assert.equal(plan.status, "complete");
        assert.deepEqual(plan.commonServers, ["F28"]);
        assert.deepEqual(plan.noticeMessages, []);
        assert.deepEqual(plan.previousEntries.map((entry) => entry.id), kind === "legacy" ? ["f28-aug-a"] : ["f28-aug-a", "f28-aug-b"]);
        assert.deepEqual(plan.currentEntries.map((entry) => entry.id), kind === "legacy" ? ["f28-sep-a"] : ["f28-sep-a", "f28-sep-b"]);
        assert(plan.previousEntries.concat(plan.currentEntries).every((entry) => entry.server === "f28_net"));
      });
    }
  }

  test("keeps genuine missing September terminal despite unreferenced September scans", () => {
    const source = rawF28Manifest();
    delete source.toplists!.monthly!["2026-09"];
    delete source.toplists!.current!.f28_net;
    for (const mode of ["months", "progress"] as const) {
      const plan = rawF28Plan(source, mode);
      assert.equal(plan.status, "unavailable");
      assert.deepEqual(plan.missingPreviousServers, []);
      assert.deepEqual(plan.missingCurrentServers, ["F28"]);
      assert.deepEqual(plan.previousEntries, []);
      assert.deepEqual(plan.currentEntries, []);
      assert.deepEqual(plan.noticeMessages, [
        mode === "months" ? "Server F28 has no comparison target for 2026-09." : "Server F28 has no current comparison target.",
        "No selected server exists on both comparison sides.",
      ]);
    }
  });

  test("retains the common raw-key server while reporting partial missing sources on both sides", () => {
    const source = rawF28Manifest();
    source.scans.push(scan("eu30-sep", "s30_eu", Date.UTC(2026, 8, 5)), scan("gnar-aug", "gnarogrim_net", Date.UTC(2026, 7, 2)));
    source.scanCount = source.scans.length;
    source.serverCount = 3;
    source.toplists!.monthly!["2026-08"].gnarogrim_net = "gnar-aug";
    source.toplists!.monthly!["2026-09"].s30_eu = "eu30-sep";
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months", selectedServers: ["EU30", "F28", "GNAROGRIM"], progressSinceMonth: "",
      compareFromMonth: "2026-08", compareToMonth: "2026-09", manifests: [source], manifestUrlsByYear,
    });
    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["F28"]);
    assert.deepEqual(plan.missingPreviousServers, ["EU30"]);
    assert.deepEqual(plan.missingCurrentServers, ["GNAROGRIM"]);
    assert.deepEqual(plan.noticeMessages, [
      "Server EU30 has no comparison baseline for 2026-08.",
      "Server GNAROGRIM has no comparison target for 2026-09.",
    ]);
    assert.deepEqual(plan.previousEntries.map((entry) => entry.id), ["f28-aug-a", "f28-aug-b"]);
    assert.deepEqual(plan.currentEntries.map((entry) => entry.id), ["f28-sep-a", "f28-sep-b"]);
  });

  test("keeps plans and source keys invariant under scan and set-member input reordering", () => {
    const source = rawF28Manifest();
    const shuffled = structuredClone(source);
    shuffled.scans.reverse();
    for (const refs of [shuffled.toplists!.current!, ...Object.values(shuffled.toplists!.monthly!)]) {
      for (const ref of Object.values(refs)) if (typeof ref !== "string") ref.scanIds.reverse();
    }
    for (const mode of ["months", "progress"] as const) assert.deepEqual(rawF28Plan(shuffled, mode), rawF28Plan(source, mode));
  });

  test("changes compare keys when sources recover, set membership changes or a source hash changes", () => {
    const source = rawF28Manifest();
    const ready = rawF28Plan(source);
    const missing = structuredClone(source);
    delete missing.toplists!.monthly!["2026-09"];
    const missingPlan = rawF28Plan(missing);
    assert.equal(missingPlan.status, "unavailable");
    assert.notEqual(missingPlan.loadKey, ready.loadKey);
    const smaller = structuredClone(source);
    smaller.toplists!.monthly!["2026-08"].f28_net = { scanIds: ["f28-aug-a"] };
    const smallerPlan = rawF28Plan(smaller);
    assert.notEqual(smallerPlan.previousDatasetId, ready.previousDatasetId);
    assert.notEqual(smallerPlan.loadKey, ready.loadKey);
    const changed = structuredClone(source);
    changed.scans.find((item) => item.id === "f28-sep-a")!.sha256 = "e".repeat(64);
    const changedPlan = rawF28Plan(changed);
    assert.notEqual(changedPlan.currentDatasetId, ready.currentDatasetId);
    assert.notEqual(changedPlan.loadKey, ready.loadKey);
  });

  for (const mode of ["progress", "months"] as const) {
    test(`${mode} resolves raw archive keys per side and retains every explicit set member`, () => {
      const source = manifest();
      source.scans = [
        scan("f28-aug", "f28_fu", Date.UTC(2026, 7, 2)),
        scan("f28-sep-a", "f28_net", Date.UTC(2026, 8, 5, 9)),
        scan("f28-sep-b", "f28_net", Date.UTC(2026, 8, 5, 10)),
        scan("gnar-aug-a", "gnarogrim_net", Date.UTC(2026, 7, 2, 9)),
        scan("gnar-aug-b", "gnarogrim_net", Date.UTC(2026, 7, 2, 10)),
        scan("gnar-sep", "granogrim_net", Date.UTC(2026, 8, 5)),
      ];
      source.scanCount = source.scans.length;
      source.serverCount = new Set(source.scans.map((item) => item.server)).size;
      source.toplists = {
        schemaVersion: 1,
        current: { f28_net: { scanIds: ["f28-sep-a", "f28-sep-b"] }, granogrim_net: "gnar-sep" },
        monthly: {
          "2026-08": { f28_fu: "f28-aug", gnarogrim_net: { scanIds: ["gnar-aug-a", "gnar-aug-b"] } },
          "2026-09": { f28_net: { scanIds: ["f28-sep-a", "f28-sep-b"] }, granogrim_net: "gnar-sep" },
        },
      };
      const unchanged = structuredClone(source);
      const plan = resolveLocalToplistCompareEntryPlan({
        mode, selectedServers: ["Gnarogrim", "F28", "f28_net", "granogrim_net"],
        progressSinceMonth: "2026-08", compareFromMonth: "2026-08", compareToMonth: "2026-09",
        manifests: [source], manifestUrlsByYear,
      });
      assert.equal(plan.status, "complete");
      assert.deepEqual(plan.commonServers, ["GNAROGRIM", "F28"]);
      assert.deepEqual(plan.noticeMessages, []);
      assert.deepEqual(plan.missingPreviousServers, []);
      assert.deepEqual(plan.missingCurrentServers, []);
      assert.equal(plan.previousMonth, "2026-08");
      assert.equal(plan.currentMonth, "2026-09");
      assert.deepEqual(new Set(plan.previousEntries.map((entry) => entry.id)), new Set(["f28-aug", "gnar-aug-a", "gnar-aug-b"]));
      assert.deepEqual(new Set(plan.currentEntries.map((entry) => entry.id)), new Set(["f28-sep-a", "f28-sep-b", "gnar-sep"]));
      assert.deepEqual(new Set(plan.previousEntries.map((entry) => entry.server)), new Set(["f28_fu", "gnarogrim_net"]));
      assert.deepEqual(new Set(plan.currentEntries.map((entry) => entry.server)), new Set(["f28_net", "granogrim_net"]));
      for (const entry of plan.currentEntries.filter((item) => item.server === "f28_net")) {
        assert.deepEqual(entry.toplistSetScanIds, ["f28-sep-a", "f28-sep-b"]);
      }
      assert.notEqual(plan.previousDatasetId, plan.currentDatasetId);
      assert.deepEqual(source, unchanged);
    });
  }

  test("maps regional and named aliases while preserving missing-side notices and never selecting unreferenced scans", () => {
    const source = manifest();
    source.scans = [
      scan("eu30-aug", "s30_eu", Date.UTC(2026, 7, 2)),
      scan("eu30-sep", "s30_eu", Date.UTC(2026, 8, 5)),
      scan("stumble-aug", "stumblesteppe_net", Date.UTC(2026, 7, 2)),
      scan("stumble-unreferenced", "stumblesteppe_net", Date.UTC(2026, 8, 5)),
    ];
    source.scanCount = source.scans.length;
    source.serverCount = new Set(source.scans.map((item) => item.server)).size;
    source.toplists = {
      schemaVersion: 1,
      current: { s30_eu: "eu30-sep" },
      monthly: {
        "2026-08": { s30_eu: "eu30-aug", stumblesteppe_net: "stumble-aug" },
        "2026-09": { s30_eu: "eu30-sep" },
      },
    };
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months", selectedServers: ["EU30", "s30_eu", "STUMPLESTEPPE"],
      progressSinceMonth: "", compareFromMonth: "2026-08", compareToMonth: "2026-09",
      manifests: [source], manifestUrlsByYear,
    });
    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU30"]);
    assert.deepEqual(plan.missingPreviousServers, []);
    assert.deepEqual(plan.missingCurrentServers, ["STUMBLESTEPPE"]);
    assert.deepEqual(plan.noticeMessages, ["Server STUMBLESTEPPE has no comparison target for 2026-09."]);
    assert.deepEqual(plan.previousEntries.map((entry) => entry.id), ["eu30-aug"]);
    assert.deepEqual(plan.currentEntries.map((entry) => entry.id), ["eu30-sep"]);
  });

  test("keeps the singular baseline notice for one missing baseline server", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.missingPreviousServers, ["EU2"]);
    assert.deepEqual(plan.missingCurrentServers, []);
    assert.deepEqual(plan.noticeMessages, ["Server EU2 has no comparison baseline for 2026-01."]);
  });

  test("lists all missing baseline servers in selected order", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU3", "EU2"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU1"]);
    assert.deepEqual(plan.missingPreviousServers, ["EU3", "EU2"]);
    assert.deepEqual(plan.noticeMessages, ["Servers EU3 and EU2 have no comparison baseline for 2026-01."]);
  });

  test("lists all missing target servers separately", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-02",
      compareToMonth: "2026-01",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU1"]);
    assert.deepEqual(plan.missingPreviousServers, []);
    assert.deepEqual(plan.missingCurrentServers, ["EU2", "EU3"]);
    assert.deepEqual(plan.noticeMessages, ["Servers EU2 and EU3 have no comparison target for 2026-01."]);
  });

  test("keeps baseline and target missing groups together without merging them", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-04",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "unavailable");
    assert.deepEqual(plan.commonServers, []);
    assert.deepEqual(plan.missingPreviousServers, ["EU2", "EU3"]);
    assert.deepEqual(plan.missingCurrentServers, ["EU1", "EU2", "EU3"]);
    assert.deepEqual(plan.noticeMessages, [
      "Servers EU2 and EU3 have no comparison baseline for 2026-01.",
      "Servers EU1, EU2 and EU3 have no comparison target for 2026-04.",
      "No selected server exists on both comparison sides.",
    ]);
  });

  test("keeps partial compare entries for common servers while reporting multiple missing servers", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU1"]);
    assert.deepEqual(plan.previousEntries.map((entry) => entry.id), ["eu1-jan"]);
    assert.deepEqual(plan.currentEntries.map((entry) => entry.id), ["eu1-feb"]);
    assert.deepEqual(plan.missingPreviousServers, ["EU2", "EU3"]);
  });

  test("stays terminal without a common server and still lists every missing server", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "unavailable");
    assert.deepEqual(plan.commonServers, []);
    assert.deepEqual(plan.previousEntries, []);
    assert.deepEqual(plan.currentEntries, []);
    assert.deepEqual(plan.missingPreviousServers, ["EU2", "EU3"]);
    assert.deepEqual(plan.noticeMessages, [
      "Servers EU2 and EU3 have no comparison baseline for 2026-01.",
      "No selected server exists on both comparison sides.",
    ]);
  });

  test("deduplicates alias variants before building missing server lists", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU2", "s2_eu", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.deepEqual(plan.missingPreviousServers, ["EU2", "EU3"]);
    assert.deepEqual(plan.noticeMessages[0], "Servers EU2 and EU3 have no comparison baseline for 2026-01.");
  });

  test("keeps common server order aligned with the selected server order", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU3", "EU1", "EU2"],
      progressSinceMonth: "",
      compareFromMonth: "2026-02",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "complete");
    assert.deepEqual(plan.commonServers, ["EU3", "EU1", "EU2"]);
    assert.deepEqual(plan.noticeMessages, []);
  });

  test("replaces missing server lists when the selected month changes", () => {
    const januaryPlan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });
    const februaryPlan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-02",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.deepEqual(januaryPlan.missingPreviousServers, ["EU2", "EU3"]);
    assert.deepEqual(februaryPlan.missingPreviousServers, []);
    assert.deepEqual(februaryPlan.noticeMessages, []);
  });

  test("does not duplicate notices across identical evaluations", () => {
    const input = {
      mode: "months" as const,
      selectedServers: ["EU1", "EU2", "EU3"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    };

    const firstPlan = resolveLocalToplistCompareEntryPlan(input);
    const secondPlan = resolveLocalToplistCompareEntryPlan(input);

    assert.deepEqual(firstPlan.noticeMessages, ["Servers EU2 and EU3 have no comparison baseline for 2026-01."]);
    assert.deepEqual(secondPlan.noticeMessages, firstPlan.noticeMessages);
    assert.deepEqual(secondPlan.missingPreviousServers, firstPlan.missingPreviousServers);
  });

  test("resolves progress as current target against monthly baseline and keeps only common servers", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "progress",
      selectedServers: ["EU1", "EU2"],
      progressSinceMonth: "2026-01",
      compareFromMonth: "",
      compareToMonth: "",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU1"]);
    assert.deepEqual(plan.previousEntries.map((entry) => entry.id), ["eu1-jan"]);
    assert.deepEqual(plan.currentEntries.map((entry) => entry.id), ["eu1-current"]);
    assert.equal(plan.issues.some((issue) => issue.code === "missing-previous-server" && issue.server === "EU2"), true);
  });

  test("resolves month-to-month without silently replacing missing months", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU1", "EU2"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "partial");
    assert.deepEqual(plan.commonServers, ["EU1"]);
    assert.deepEqual(plan.currentEntries.map((entry) => entry.id), ["eu1-feb"]);
    assert.equal(plan.currentEntries.some((entry) => entry.id === "eu2-feb"), false);
  });

  test("returns terminal unavailable when there is no common server", () => {
    const plan = resolveLocalToplistCompareEntryPlan({
      mode: "months",
      selectedServers: ["EU2"],
      progressSinceMonth: "",
      compareFromMonth: "2026-01",
      compareToMonth: "2026-02",
      manifests: [manifest()],
      manifestUrlsByYear,
    });

    assert.equal(plan.status, "unavailable");
    assert.deepEqual(plan.commonServers, []);
    assert.equal(plan.previousEntries.length, 0);
    assert.equal(plan.currentEntries.length, 0);
    assert.equal(plan.issues.some((issue) => issue.code === "no-common-servers"), true);
  });

  test("maps player compare rows to public readonly fields including base and total stats/day", () => {
    const previous = localPlayer({ sum: 100, sumTotal: 160, latestScanAtSec: Math.floor(Date.UTC(2026, 0, 10) / 1000) });
    const current = localPlayer({ sum: 130, sumTotal: 220, latestScanAtSec: Math.floor(Date.UTC(2026, 0, 20) / 1000) });
    const comparison: LocalPlayerToplistComparisonRow = {
      status: "matched",
      matchType: "exact",
      identityKey: "EU1\u0000eu1_p1",
      previous,
      current,
      previousTableRank: 3,
      currentTableRank: 1,
      rankDelta: 2,
      metricDelta: 30,
      deltas: { sum: 30, sumTotal: 60, main: null, con: null, level: null, ratio: null, mainTotal: null, conTotal: null, xpProgress: null, xpTotal: null, mine: null, treasury: null },
      statsDays: 10,
      statsPerDay: 3,
      issues: [],
    };

    const [base] = enrichLocalPlayerCompareRows({ rows: [publicPlayer(current)], comparisonRows: [comparison], playerAvgMode: "base" });
    const [total] = enrichLocalPlayerCompareRows({ rows: [publicPlayer(current)], comparisonRows: [comparison], playerAvgMode: "total" });

    assert.equal((base as any)._rankDelta, 2);
    assert.equal((base as any)._delta.sum, 30);
    assert.equal((base as any)._statsPerDayBase, 3);
    assert.equal((base as any)._statsPerDayTotal, 6);
    assert.equal((base as any)._statsPerDay, 3);
    assert.equal((total as any)._statsPerDay, 6);
  });

  test("maps guild compare deltas without turning null into zero", () => {
    const current = localGuild({ avgMine: 0, avgTreasury: null });
    const comparison: LocalGuildToplistComparisonRow = {
      status: "matched",
      matchType: "exact",
      identityKey: "EU1\u0000eu1_g1",
      previous: localGuild({ honor: 900, avgMine: 0, avgTreasury: null }),
      current,
      previousTableRank: 2,
      currentTableRank: 1,
      rankDelta: 1,
      metricDelta: 100,
      deltas: { honor: 100, avgMine: 0, avgTreasury: null },
      issues: [],
    };

    const [row] = enrichLocalGuildCompareRows({ rows: [publicGuild(current)], comparisonRows: [comparison] });
    assert.equal((row as any)._rankDelta, 1);
    assert.equal((row as any)._delta.honor, 100);
    assert.equal((row as any)._delta.avgMine, 0);
    assert.equal((row as any)._delta.avgTreasury, null);
  });
});

console.log("localToplistCompareModel.test: ok");
