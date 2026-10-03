import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  GUILD_HUB_NAV_ITEMS,
  buildLocalToplistViewRequestKey,
  buildToplistServerGroupsFromRegistry,
  collectEntriesForSearchHits,
  defaultSelectedToplistServers,
  equalToplistServerSelection,
  filterGuildRowsBySearchHits,
  filterPlayerRowsBySearchHits,
  loadLocalToplistArchiveContext,
  normalizeToplistServerSelection,
  resolveActiveGuildToplistServer,
  resolveSelectedToplistEntries,
  resolveToplistServerDefaultSync,
  selectEntriesForServers,
} from "../../src/pages/GuildHub/localToplistPageModel.ts";
import type { ScanArchiveSearchHit } from "../../src/lib/scanArchive/searchIndexService.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";
import { LOCAL_SERVER_REGISTRY } from "../../src/data/serverRegistry.ts";
import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "../../src/lib/toplists/localToplistTypes.ts";

const ts = Date.UTC(2026, 8, 19, 21, 0, 0);

const hash = (char: string) => char.repeat(64);

const scan = (server: string, index: number) => ({
  id: `${server}:${ts + index}`,
  server,
  timestamp: ts + index,
  timestampUtc: new Date(ts + index).toISOString(),
  path: `2026-09/${server}/${index}.json.gz`,
  format: "sftools.raw.v1",
  compression: "gzip" as const,
  sha256: hash(String.fromCharCode(97 + index)),
  compressedBytes: 10 + index,
  uncompressedBytes: 100 + index,
  playerCount: 2,
  groupCount: 1,
  searchIndex: {
    schemaVersion: 1 as const,
    path: `2026-09/${server}/${index}.search.json.gz`,
    sha256: hash(String.fromCharCode(100 + index)),
    compressedBytes: 5 + index,
    uncompressedBytes: 50 + index,
    playerCount: 2,
    groupCount: 1,
  },
});

const scans = [
  scan("stumblesteppe_net", 0),
  scan("f8_net", 1),
  scan("s30_eu", 2),
];

const manifest: ScanArchiveManifest = {
  schemaVersion: 1,
  archiveYear: 2026,
  revision: 2,
  updatedAt: "2026-09-20T00:00:00.000Z",
  scanCount: scans.length,
  serverCount: scans.length,
  scans,
  toplists: {
    schemaVersion: 1,
    current: Object.fromEntries(scans.map((entry) => [entry.server, entry.id])),
  },
};

const catalog = {
  schemaVersion: 1 as const,
  archives: [{ year: 2026, active: true, manifestUrl: "https://example.test/2026/manifest.json" }],
};

const fetcher = async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith("/catalog.json")) return new Response(JSON.stringify(catalog));
  if (url === "https://example.test/2026/manifest.json") return new Response(JSON.stringify(manifest));
  return new Response("not found", { status: 404 });
};

const playerRow = (server: string, identifier: string): LocalPlayerToplistRow => ({
  rowKey: identifier,
  identifier,
  playerId: identifier,
  name: identifier,
  server,
  sourceServer: server,
  scanTimestamp: ts,
  manifestYear: 2026,
  archiveScanId: `${server}:${ts}`,
  archiveSha256: hash("a"),
  localScanId: "local",
  class: "Warrior",
  classId: 1,
  guild: null,
  guildIdentifier: null,
  hofRank: null,
  level: null,
  main: null,
  con: null,
  sum: null,
  ratio: null,
  mainTotal: null,
  conTotal: null,
  sumTotal: null,
  xpProgress: null,
  xpTotal: null,
  mine: null,
  treasury: null,
  statsPerDay: null,
  statsDayTotal: null,
  lastScan: null,
  latestScanAtSec: Math.floor(ts / 1000),
});

const guildRow = (server: string, guildIdentifier: string): LocalGuildToplistRow => ({
  rowKey: guildIdentifier,
  guildId: guildIdentifier,
  guildIdentifier,
  name: guildIdentifier,
  server,
  sourceServer: server,
  scanTimestamp: ts,
  manifestYear: 2026,
  archiveScanId: `${server}:${ts}`,
  archiveSha256: hash("a"),
  localScanId: "local",
  hofRank: null,
  honor: null,
  raids: null,
  portalFloor: null,
  hydra: null,
  petLevel: null,
  instructor: null,
  memberCount: null,
  avgLevel: null,
  avgBaseMain: null,
  avgConBase: null,
  avgSumBaseTotal: null,
  avgAttrTotal: null,
  avgConTotal: null,
  avgTotalStats: null,
  avgMine: null,
  avgTreasury: null,
  sumAvg: null,
  memberBasisStatus: "complete",
  memberBasisCount: 0,
  lastScan: null,
  latestScanAtSec: Math.floor(ts / 1000),
});

describe("local toplist page model", () => {
  test("Guild-Hub navigation contains Toplist directly after Dashboard and does not require local scans", () => {
    assert.deepEqual(GUILD_HUB_NAV_ITEMS.slice(0, 3).map((item) => item.to), [
      "/guild-hub/dashboard",
      "/guild-hub/toplist",
      "/guild-hub/analytics",
    ]);
    assert.equal(GUILD_HUB_NAV_ITEMS.find((item) => item.to === "/guild-hub/toplist")?.requiresLocalScans, false);
  });

  test("loads active manifest revision 2 and resolves three current selections", async () => {
    const context = await loadLocalToplistArchiveContext({
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    });

    assert.equal(context.status, "complete");
    assert.equal(context.manifests[0]?.revision, 2);
    assert.deepEqual(context.entries.map((entry) => entry.server).sort(), ["f8_net", "s30_eu", "stumblesteppe_net"]);
    assert.equal(context.serverOptions.length, 3);
    assert.deepEqual(defaultSelectedToplistServers(context.serverOptions).sort(), ["EU30", "F8", "STUMBLESTEPPE"]);
  });

  test("active guild server resolves through registry aliases instead of selecting every current server", async () => {
    const context = await loadLocalToplistArchiveContext({
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    });
    const activeServer = resolveActiveGuildToplistServer("f8_net");

    assert.equal(activeServer, "F8");
    assert.deepEqual(selectEntriesForServers(context.entries, [activeServer]).map((entry) => entry.server), ["f8_net"]);
  });

  test("missing active guild server is unavailable without replacing it with an available current server", async () => {
    const context = await loadLocalToplistArchiveContext({
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    });
    const activeServer = resolveActiveGuildToplistServer("f28_net");
    const resolution = resolveSelectedToplistEntries(context.entries, [activeServer]);

    assert.equal(activeServer, "F28");
    assert.deepEqual(resolution.requestedServerCodes, ["F28"]);
    assert.deepEqual(resolution.resolvedEntries, []);
    assert.deepEqual(resolution.unavailableServerCodes, ["F28"]);
    assert.equal(resolution.availabilityState, "unavailable");
  });

  test("mixed manual server selection keeps available entries and reports unavailable servers", async () => {
    const context = await loadLocalToplistArchiveContext({
      fetcher,
      catalogUrl: "https://example.test/catalog.json",
    });
    const resolution = resolveSelectedToplistEntries(context.entries, ["F8", "F28"]);

    assert.equal(resolution.availabilityState, "partial");
    assert.deepEqual(resolution.resolvedEntries.map((entry) => entry.server), ["f8_net"]);
    assert.deepEqual(resolution.unavailableServerCodes, ["F28"]);
  });

  test("server selection normalization is canonical and equality is content based", () => {
    assert.deepEqual(normalizeToplistServerSelection(["f8_net", "F8", "s30_eu"]), ["EU30", "F8"]);
    assert.equal(equalToplistServerSelection(["F8", "EU30"], ["s30_eu", "f8_net"]), true);
    assert.equal(equalToplistServerSelection(["F8"], ["F28"]), false);
  });

  test("view request keys are canonical and ignore inactive player controls for guild views", () => {
    const left = buildLocalToplistViewRequestKey({
      datasetId: "derivation:2|a",
      tab: "guilds",
      servers: ["f8_net", "EU30"],
      playerClasses: ["warrior"],
      guilds: ["Alpha"],
      playerSort: { metricKey: "sum", direction: "desc" },
      guildSort: { metricKey: "guildAvgLevel", direction: "desc" },
      playerValueMode: "base",
      guildValueMode: "base",
    });
    const right = buildLocalToplistViewRequestKey({
      datasetId: "derivation:2|a",
      tab: "guilds",
      servers: ["s30_eu", "F8"],
      playerClasses: ["mage"],
      guilds: ["Beta"],
      playerSort: { metricKey: "level", direction: "asc" },
      guildSort: { metricKey: "guildAvgLevel", direction: "desc" },
      playerValueMode: "total",
      guildValueMode: "base",
    });

    assert.equal(left, right);
  });

  test("player view request keys include class, sort, and base-total controls", () => {
    const base = {
      datasetId: "derivation:2|a",
      tab: "players" as const,
      servers: ["f8_net"],
      playerClasses: ["warrior"],
      guilds: ["Alpha"],
      playerSort: { metricKey: "sum", direction: "desc" as const },
      guildSort: { metricKey: "guildAvgLevel", direction: "desc" as const },
      playerValueMode: "base" as const,
      guildValueMode: "base" as const,
    };

    const key = buildLocalToplistViewRequestKey(base);
    assert.notEqual(key, buildLocalToplistViewRequestKey({ ...base, playerClasses: ["mage"] }));
    assert.notEqual(key, buildLocalToplistViewRequestKey({ ...base, guilds: ["Beta"] }));
    assert.notEqual(key, buildLocalToplistViewRequestKey({ ...base, playerSort: { metricKey: "level", direction: "desc" } }));
    assert.notEqual(key, buildLocalToplistViewRequestKey({ ...base, playerValueMode: "total" }));
  });

  test("same active guild default key causes no second filter write", () => {
    const first = resolveToplistServerDefaultSync({
      activeDefaultKey: "slot-a|guild-a|F28",
      previousDefaultKey: null,
      activeGuildServer: "F28",
      defaultServers: ["F8", "EU30"],
      currentServers: [],
    });
    assert.deepEqual(first, { nextDefaultKey: "slot-a|guild-a|F28", nextServers: ["F28"] });

    const second = resolveToplistServerDefaultSync({
      activeDefaultKey: "slot-a|guild-a|F28",
      previousDefaultKey: first.nextDefaultKey,
      activeGuildServer: "F28",
      defaultServers: ["F8", "EU30"],
      currentServers: ["F28"],
    });
    assert.deepEqual(second, { nextDefaultKey: "slot-a|guild-a|F28", nextServers: null });
  });

  test("content equal active guild default does not write a new server array", () => {
    const decision = resolveToplistServerDefaultSync({
      activeDefaultKey: "slot-a|guild-a|F8",
      previousDefaultKey: null,
      activeGuildServer: "F8",
      defaultServers: ["EU30"],
      currentServers: ["f8_net"],
    });
    assert.deepEqual(decision, { nextDefaultKey: "slot-a|guild-a|F8", nextServers: null });
  });

  test("manual selection remains until the active guild key changes", () => {
    const sameKey = resolveToplistServerDefaultSync({
      activeDefaultKey: "slot-a|guild-a|F28",
      previousDefaultKey: "slot-a|guild-a|F28",
      activeGuildServer: "F28",
      defaultServers: ["F8", "EU30"],
      currentServers: ["F8"],
    });
    assert.equal(sameKey.nextServers, null);

    const slotChanged = resolveToplistServerDefaultSync({
      activeDefaultKey: "slot-b|guild-b|EU30",
      previousDefaultKey: "slot-a|guild-a|F28",
      activeGuildServer: "EU30",
      defaultServers: ["F8"],
      currentServers: ["F8"],
    });
    assert.deepEqual(slotChanged, { nextDefaultKey: "slot-b|guild-b|EU30", nextServers: ["EU30"] });
  });

  test("Stumblesteppe active guild server resolves through registry typo alias", () => {
    assert.equal(resolveActiveGuildToplistServer("stumplesteppe_net"), "STUMBLESTEPPE");
  });

  test("server picker groups active registry servers independently from manifest availability", async () => {
    const context = await loadLocalToplistArchiveContext({ fetcher, catalogUrl: "https://example.test/catalog.json" });
    const groups = buildToplistServerGroupsFromRegistry(context.serverOptions);
    const emptyManifestGroups = buildToplistServerGroupsFromRegistry([]);
    const namedServers = ["BLACKFOREST", "GNAROGRIM", "MAERWYNN", "STUMBLESTEPPE"];
    const allGroupedServers = Object.values(groups).flat();
    const activeRegistryCodes = LOCAL_SERVER_REGISTRY
      .filter((server) => server.active)
      .map((server) => server.code)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    assert.deepEqual(groups, emptyManifestGroups);
    namedServers.forEach((server) => {
      assert.equal(groups.INT.includes(server), true);
      assert.equal(groups.Fusion.includes(server), false);
    });
    assert.equal(groups.Fusion.includes("F8"), true);
    assert.equal(groups.Fusion.includes("F28"), true);
    assert.equal(groups.INT.includes("SPEED"), true);
    assert.equal(groups.EU.includes("EU11"), true);
    assert.equal(groups.US.includes("AM1"), true);
    assert.equal(allGroupedServers.length, new Set(allGroupedServers).size);
    assert.deepEqual([...allGroupedServers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })), activeRegistryCodes);
  });

  test("selected server entries are exact and do not include unselected current entries", async () => {
    const context = await loadLocalToplistArchiveContext({ fetcher, catalogUrl: "https://example.test/catalog.json" });
    const selected = selectEntriesForServers(context.entries, ["F8", "EU30"]);

    assert.deepEqual(selected.map((entry) => entry.server).sort(), ["f8_net", "s30_eu"]);
    assert.equal(selected.some((entry) => entry.server === "stumblesteppe_net"), false);
  });

  test("empty server selection resolves terminal empty without selecting current entries", async () => {
    const context = await loadLocalToplistArchiveContext({ fetcher, catalogUrl: "https://example.test/catalog.json" });
    const resolution = resolveSelectedToplistEntries(context.entries, []);

    assert.deepEqual(resolution.requestedServerCodes, []);
    assert.deepEqual(resolution.resolvedEntries, []);
    assert.deepEqual(resolution.unavailableServerCodes, []);
    assert.equal(resolution.availabilityState, "empty");
  });

  test("search hits reduce archive acquisition to matching entries only", async () => {
    const context = await loadLocalToplistArchiveContext({ fetcher, catalogUrl: "https://example.test/catalog.json" });
    const f8 = context.entries.find((entry) => entry.server === "f8_net")!;
    const hit: ScanArchiveSearchHit = {
      kind: "player",
      name: "Ada",
      identifier: "f8_net_p1",
      server: "f8_net",
      archiveScanId: f8.id,
      archiveSha256: f8.sha256,
      searchIndexSha256: f8.searchIndex!.sha256,
      scanTimestamp: f8.timestamp,
      manifestYear: f8.archiveYear,
    };

    assert.deepEqual(collectEntriesForSearchHits([hit], context.entries).map((entry) => entry.server), ["f8_net"]);
  });

  test("search hit filtering uses exact server and identifier, not visible names", () => {
    const hits: ScanArchiveSearchHit[] = [{
      kind: "player",
      name: "Same",
      identifier: "f8_net_p1",
      server: "f8_net",
      archiveScanId: "a",
      archiveSha256: hash("a"),
      searchIndexSha256: hash("b"),
      scanTimestamp: ts,
      manifestYear: 2026,
    }];
    const rows = [
      playerRow("F8", "f8_net_p1"),
      playerRow("F8", "f8_net_p2"),
      playerRow("EU30", "f8_net_p1"),
    ];

    assert.deepEqual(filterPlayerRowsBySearchHits(rows, hits).map((row) => row.identifier), ["f8_net_p1"]);
  });

  test("guild search hit filtering also uses exact identity", () => {
    const hits: ScanArchiveSearchHit[] = [{
      kind: "guild",
      name: "Same",
      identifier: "s30_eu_g1",
      server: "s30_eu",
      archiveScanId: "a",
      archiveSha256: hash("a"),
      searchIndexSha256: hash("b"),
      scanTimestamp: ts,
      manifestYear: 2026,
    }];
    const rows = [
      guildRow("EU30", "s30_eu_g1"),
      guildRow("EU30", "s30_eu_g2"),
      guildRow("F8", "s30_eu_g1"),
    ];

    assert.deepEqual(filterGuildRowsBySearchHits(rows, hits).map((row) => row.guildIdentifier), ["s30_eu_g1"]);
  });

  test("catalog failures are structured and empty", async () => {
    const context = await loadLocalToplistArchiveContext({
      fetcher: async () => new Response("offline", { status: 503 }),
      catalogUrl: "https://example.test/catalog.json",
    });

    assert.equal(context.status, "empty");
    assert.equal(context.issues[0]?.code, "catalog-error");
  });
});

console.log("localToplistPageModel.test: ok");
