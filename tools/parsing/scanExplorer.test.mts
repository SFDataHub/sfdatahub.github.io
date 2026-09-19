import assert from "node:assert/strict";

import {
  buildScanExplorerData,
  filterScanExplorerEntities,
  getLimitedScanExplorerResults,
  normalizeScanExplorerPlayer,
  SCAN_EXPLORER_MAX_VISIBLE_RESULTS,
} from "../../src/components/ScanManagement/scanExplorer.ts";
import {
  formatScanExplorerCompactEntryValue,
  getVisibleScanExplorerMetrics,
  toScanExplorerTimestampDate,
} from "../../src/components/ScanManagement/scanExplorerFormatting.ts";
import type { SfDataHubLocalScan } from "../../src/lib/guilds/localScanLibrary.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const timestamp = 1_700_000_000;
const daySeconds = 86_400;

const buildSave = (id: number, level: number, characterClass: number) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = id;
  save[3] = level;
  save[20] = characterClass;
  save[21] = 3;
  save[29] = timestamp + daySeconds;
  return save;
};

const scan: SfDataHubLocalScan = {
  id: "scan-explorer-test",
  contentHash: "content-hash",
  filename: "scan-explorer-test.json",
  importedAt: new Date(timestamp * 1000).toISOString(),
  scannedAt: new Date(timestamp * 1000).toISOString(),
  servers: ["f28"],
  playerCount: 2,
  groupCount: 1,
  guildCount: 1,
  rawData: {
    timestamp,
    players: [
      {
        timestamp,
        own: 1,
        saveVersion: 2,
        save: buildSave(1001, 603, 7),
        identifier: "f28_p1001",
        prefix: "f28",
        name: "Darth Monk",
        guildIdentifier: "f28_g42",
        guildName: "Welten im Wandel",
        offset: 0,
        potions: [0, 16, 2, 4, timestamp + daySeconds * 2, timestamp + daySeconds * 3, 0, 25, 25, 25],
        fortress: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, timestamp + daySeconds * 5, timestamp + daySeconds * 4, 12, 2500, 77],
      },
      {
        timestamp,
        own: 0,
        saveVersion: 2,
        save: buildSave(1002, 511, 2),
        identifier: "f28_p1002",
        prefix: "f28",
        name: "Arc Mage",
        guildIdentifier: "f28_g42",
        guildName: "Welten im Wandel",
      },
      {
        timestamp,
        saveVersion: 2,
        save: [],
      },
    ],
    groups: [
      {
        timestamp,
        identifier: "f28_g42",
        prefix: "f28",
        name: "Welten im Wandel",
        memberCount: 2,
      },
    ],
  },
};

const before = JSON.stringify(scan.rawData);
const data = buildScanExplorerData(scan);

assert.equal(JSON.stringify(scan.rawData), before, "scan explorer must not mutate rawData");
assert.equal(data.snapshots.length, 1);
assert.equal(data.players.length, 2);
assert.equal(data.guilds.length, 1);

const [firstPlayer] = data.players;
assert.equal(firstPlayer.name, "Darth Monk");
assert.equal(firstPlayer.classId, 7);
assert.equal(firstPlayer.level, 603);
assert.equal(firstPlayer.guildName, "Welten im Wandel");
assert.equal("normalized" in firstPlayer, false, "scan explorer list entities must not eagerly normalize players");

const firstNormalizedPlayer = normalizeScanExplorerPlayer(firstPlayer);
assert.equal(firstNormalizedPlayer.identity.class, 7);
assert.equal(firstNormalizedPlayer.progression.level, 603);
assert.equal(firstNormalizedPlayer.progressionStatus.mount.expiresAt, (timestamp + daySeconds) * 1000);
assert.equal(firstNormalizedPlayer.potions?.slots[0]?.expires, (timestamp + daySeconds * 2) * 1000);
assert.equal(firstNormalizedPlayer.fortress.currentBuilding.startsAt, (timestamp + daySeconds * 4) * 1000);
assert.equal(firstNormalizedPlayer.fortress.currentBuilding.finishesAt, (timestamp + daySeconds * 5) * 1000);
assert.equal(toScanExplorerTimestampDate(firstNormalizedPlayer.progressionStatus.mount.expiresAt)?.getUTCFullYear(), 2023);
assert.equal(toScanExplorerTimestampDate(firstNormalizedPlayer.potions?.slots[0]?.expires)?.getUTCFullYear(), 2023);
assert.equal(toScanExplorerTimestampDate(firstNormalizedPlayer.fortress.currentBuilding.startsAt)?.getUTCFullYear(), 2023);
assert.equal(toScanExplorerTimestampDate(firstNormalizedPlayer.fortress.currentBuilding.finishesAt)?.getUTCFullYear(), 2023);
assert.equal(toScanExplorerTimestampDate(null), null);
assert.equal(toScanExplorerTimestampDate(Number.NaN), null);

const guild = data.guilds[0];
assert.equal(guild.group.guildName, "Welten im Wandel");
assert.equal(guild.group.server, "F28");
assert.equal(guild.group.rows[0].declaredMemberCount, 2);
assert.equal(guild.group.rows[0].countedMemberCount, 2);
assert.equal(guild.group.rows[0].complete, true);

assert.deepEqual(
  filterScanExplorerEntities(data.players, data.guilds, "darth").players.map((player) => player.name),
  ["Darth Monk"],
);
assert.deepEqual(
  filterScanExplorerEntities(data.players, data.guilds, "f28_p1002").players.map((player) => player.name),
  ["Arc Mage"],
);
assert.equal(filterScanExplorerEntities(data.players, data.guilds, "welten").players.length, 2);
assert.equal(filterScanExplorerEntities(data.players, data.guilds, "welten").guilds.length, 1);
assert.equal(filterScanExplorerEntities(data.players, data.guilds, "missing").players.length, 0);
assert.equal(filterScanExplorerEntities(data.players, data.guilds, "missing").guilds.length, 0);

let lazyNormalizationCount = 0;
const lazilyNormalized = normalizeScanExplorerPlayer(firstPlayer, (raw) => {
  lazyNormalizationCount += 1;
  return normalizeSfPlayerCharacterCore(raw);
});
assert.equal(lazyNormalizationCount, 1);
assert.equal(lazilyNormalized.identity.name, "Darth Monk");

const largeScan: SfDataHubLocalScan = {
  id: "scan-explorer-large-test",
  contentHash: "large-content-hash",
  filename: "scan-explorer-large-test.json",
  importedAt: new Date(timestamp * 1000).toISOString(),
  scannedAt: new Date(timestamp * 1000).toISOString(),
  servers: ["f28"],
  playerCount: 20_000,
  groupCount: 1_200,
  guildCount: 1_200,
  rawData: {
    timestamp,
    players: Array.from({ length: 20_000 }, (_, index) => ({
      timestamp,
      identifier: `f28_p${index}`,
      prefix: "f28",
      name: index === 19_999 ? "UniqueTarget Player 19999" : `Player ${String(index).padStart(5, "0")}`,
      guildIdentifier: `f28_g${index % 1_200}`,
      guildName: `Guild ${index % 1_200}`,
      level: 100 + (index % 500),
      class: (index % 11) + 1,
    })),
    groups: Array.from({ length: 1_200 }, (_, index) => ({
      timestamp,
      identifier: `f28_g${index}`,
      prefix: "f28",
      name: `Guild ${index}`,
      memberCount: index < 800 ? 17 : 16,
    })),
  },
};

const largeData = buildScanExplorerData(largeScan);
assert.equal(largeData.players.length, 20_000);
assert.equal(largeData.guilds.length, 1_200);
assert.equal("normalized" in largeData.players[0], false);

const broadResults = getLimitedScanExplorerResults(largeData.players, largeData.guilds, "");
assert.equal(broadResults.playerTotal, 20_000);
assert.equal(broadResults.guildTotal, 1_200);
assert.equal(broadResults.players.length, SCAN_EXPLORER_MAX_VISIBLE_RESULTS);
assert.equal(broadResults.guilds.length, SCAN_EXPLORER_MAX_VISIBLE_RESULTS);

const broadSearchResults = getLimitedScanExplorerResults(largeData.players, largeData.guilds, "player");
assert.equal(broadSearchResults.playerTotal, 20_000);
assert.equal(broadSearchResults.players.length, SCAN_EXPLORER_MAX_VISIBLE_RESULTS);

const rarePlayerResults = getLimitedScanExplorerResults(largeData.players, largeData.guilds, "uniquetarget");
assert.equal(rarePlayerResults.playerTotal, 1);
assert.equal(rarePlayerResults.players.length, 1);
assert.equal(rarePlayerResults.players[0].name, "UniqueTarget Player 19999");

const identifierResults = getLimitedScanExplorerResults(largeData.players, largeData.guilds, "F28_P19999");
assert.equal(identifierResults.playerTotal, 1);
assert.equal(identifierResults.players[0].identifier, "f28_p19999");

const guildResults = getLimitedScanExplorerResults(largeData.players, largeData.guilds, "guild 1199");
assert.equal(guildResults.guildTotal, 1);
assert.equal(guildResults.guilds[0].group.server, "F28");
assert.equal(guildResults.guilds[0].group.guildIdentifier, "g1199");

const searchedPlayer = rarePlayerResults.players[0];
assert.equal(largeData.playerLookup.get(searchedPlayer.key)?.name, "UniqueTarget Player 19999");
assert.equal(getLimitedScanExplorerResults(largeData.players, largeData.guilds, "uniquetarget").players[0]?.key, searchedPlayer.key);
const searchedGuild = guildResults.guilds[0];
assert.equal(largeData.guildLookup.get(searchedGuild.key)?.group.guildIdentifier, "g1199");
assert.equal(getLimitedScanExplorerResults(largeData.players, largeData.guilds, "guild 1199").guilds[0]?.key, searchedGuild.key);

assert.equal(formatScanExplorerCompactEntryValue([{ type: 11 }]), null);
assert.notEqual(formatScanExplorerCompactEntryValue([{ type: 11 }]), "[object Object]");
assert.equal(formatScanExplorerCompactEntryValue([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "10 values - 1 active");
assert.equal(formatScanExplorerCompactEntryValue({ metadata: { layout: "currentCompact" } }), null);
assert.deepEqual(
  getVisibleScanExplorerMetrics([
    { label: "Layout", value: "currentCompact" },
    { label: "Own", value: true },
    { label: "Normal Entries", value: 33 },
    { label: "Missing", value: null },
  ]).map((entry) => entry.label),
  ["Normal Entries"],
);

console.log("scanExplorer.test.mts passed");
