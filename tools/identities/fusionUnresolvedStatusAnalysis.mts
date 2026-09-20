import "fake-indexeddb/auto";

import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import { buildFusionIdentityManagementReportFromSnapshots } from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const WATCH_PLAYERS = new Set(["anythegreat", "nachbar", "mirataty", "lech poznan", "milfiway (s1eu)", "mrhyde (s1eu)", "red face 2137"]);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getScanTimestamp = (raw: JsonRecord): number | null => {
  const players = Array.isArray(raw.players) ? raw.players.map(asRecord).filter(Boolean) : [];
  return players.map((player) => toFiniteNumber(player?.timestamp)).find((timestamp) => timestamp != null) ?? null;
};

const listJsonFiles = (root: string): string[] =>
  fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") && entry.name !== "manifest.json" ? [fullPath] : [];
  });

const readSnapshot = (filePath: string): GuildHubLogicalScanSnapshot | null => {
  const raw = asRecord(JSON.parse(fs.readFileSync(filePath, "utf8")));
  if (!raw || !Array.isArray(raw.players)) return null;
  const timestampMs = getScanTimestamp(raw);
  if (timestampMs == null) return null;
  const groups = Array.isArray(raw.groups) ? raw.groups : Array.isArray(raw.guilds) ? raw.guilds : [];
  const fileName = path.basename(filePath);
  return {
    id: `${fileName}::${timestampMs}`,
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    players: raw.players,
    groups,
    servers: [],
    playerCount: raw.players.length,
    groupCount: groups.length,
    guildCount: groups.length,
    rawData: { ...raw, players: raw.players, groups },
    normalizedMembers: normalizeGuildScanMembers(raw),
    sourceScanId: fileName,
    sourceScanFilename: fileName,
    sourceImportedAt: new Date(timestampMs).toISOString(),
  };
};

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const hasFusionSuffix = (value: unknown) => /\(s[1-4]_?eu\)$/i.test(String(value ?? "").trim());

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

const suffix = Date.now();
const playerDb = `fusion-unresolved-analysis-player-${suffix}`;
const guildDb = `fusion-unresolved-analysis-guild-${suffix}`;
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = report.items.filter((item) => item.entityType === "player");
const suffixPlayers = playerItems.filter((item) => hasFusionSuffix(item.currentName));
const suffixCounts = suffixPlayers.reduce(
  (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
  {} as Record<string, number>,
);

console.log("Fusion unresolved status analysis");
console.log(`Scans included: ${report.scope.allSnapshotCount}`);
console.log(
  `Suffix players total=${suffixPlayers.length} ready=${suffixCounts.ready ?? 0} review=${suffixCounts.review ?? 0} unresolved=${suffixCounts.unresolved ?? 0} noHistoricalObservation=${suffixCounts.noHistoricalObservation ?? 0} noHistory=${suffixCounts.noHistory ?? 0} completed=${suffixCounts.completed ?? 0}`,
);

console.log("Suffix players with 0 displayed candidates:");
suffixPlayers
  .filter((item) => item.candidates.length === 0)
  .forEach((item) => {
    const lookup = item.diagnostics?.reliableHistoricalLookup;
    const pipeline = item.diagnostics?.candidatePipeline;
    console.log(
      `- ${item.currentName ?? item.currentIdentifier} ${item.currentIdentifier}: status=${item.status} origin=${item.diagnostics?.originServerCodes.join(",") || "unknown"} scans=${item.diagnostics?.historicalSnapshotCount ?? 0} lookup=${lookup ? `${lookup.baseName}/${lookup.originServer}/class=${lookup.classId ?? "unknown"}/matches=${lookup.matchingObservationCount}/classMatches=${lookup.compatibleClassObservationCount}` : "none"} initial=${pipeline?.candidatesGeneratedInitially ?? 0} hard=${pipeline?.candidatesAfterHardCompatibility ?? 0} semantic=${pipeline?.candidatesAfterSemanticEvaluation ?? 0} exclusions=${pipeline?.candidatesAfterExclusions ?? 0} reservations=${pipeline?.candidatesAfterReservations ?? 0} final=${pipeline?.finalCandidates ?? 0} reason=${item.reasonCodes.join("|") || "none"}`,
    );
  });

console.log("Visible player diagnostics:");
const visibleMatches = playerItems.filter((item) => WATCH_PLAYERS.has(normalizeName(item.currentName)));
visibleMatches.forEach((item) => {
    const lookup = item.diagnostics?.reliableHistoricalLookup;
    const pipeline = item.diagnostics?.candidatePipeline;
    console.log(
      `- ${item.currentName ?? item.currentIdentifier}: current=${item.currentIdentifier} status=${item.status} originKnown=${Boolean(item.diagnostics?.originServerCodes.length)} origin=${item.diagnostics?.originServerCodes.join(",") || "unknown"} scans=${item.diagnostics?.historicalSnapshotCount ?? 0} reliableLookup=${lookup ? "yes" : "no"} lookupMatches=${lookup?.matchingObservationCount ?? 0} lookupClassMatches=${lookup?.compatibleClassObservationCount ?? 0} initial=${pipeline?.candidatesGeneratedInitially ?? 0} hard=${pipeline?.candidatesAfterHardCompatibility ?? 0} semantic=${pipeline?.candidatesAfterSemanticEvaluation ?? 0} exclusions=${pipeline?.candidatesAfterExclusions ?? 0} reservations=${pipeline?.candidatesAfterReservations ?? 0} final=${pipeline?.finalCandidates ?? 0} reason=${item.reasonCodes.join("|") || "none"}`,
    );
  });
const visibleFound = new Set(visibleMatches.map((item) => normalizeName(item.currentName)));
[...WATCH_PLAYERS].filter((name) => !visibleFound.has(name)).forEach((name) => {
  console.log(`- ${name}: not present in this scan pool`);
});

await playerStore.close();
await guildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
