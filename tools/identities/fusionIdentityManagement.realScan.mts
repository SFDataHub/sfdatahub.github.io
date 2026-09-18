import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityManagementStatus,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const CASES = [
  { label: "Magic Mushrooms", currentName: "Magic Mushrooms", historicalId: "eu1_g8" },
  { label: "Dead End -> Erben im Wandel", currentName: "Erben im Wandel", historicalId: "eu4_g14" },
  { label: "Die Legion -> Legion Z", currentName: "Legion Z", historicalId: "eu3_g4877" },
  { label: "GenerationZ -> Legion Z", currentName: "Legion Z", historicalId: "eu4_g1352" },
];

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

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/ß/g, "ss")
    .toLowerCase();

const countByStatus = (statuses: FusionIdentityManagementStatus[]) =>
  statuses.reduce(
    (counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }),
    {} as Record<FusionIdentityManagementStatus, number>,
  );

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `fusion-real-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `fusion-real-guild-${suffix}` });

const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = report.items.filter((item) => item.entityType === "player");
const guildItems = report.items.filter((item) => item.entityType === "guild");
const playerCounts = countByStatus(playerItems.map((item) => item.status));
const guildCounts = countByStatus(guildItems.map((item) => item.status));

console.log("Fusion Identity Management real scan regression");
console.log(`Scans included: ${report.scope.allSnapshotCount}`);
console.log(`History range: ${report.scope.firstHistoricalTimestamp} - ${report.scope.lastHistoricalTimestamp}`);
console.log(`Unique post-fusion players: ${playerItems.length}`);
console.log(`Unique post-fusion guilds: ${guildItems.length}`);
console.log(
  `Players ready=${playerCounts.ready ?? 0} review=${playerCounts.review ?? 0} unresolved=${playerCounts.unresolved ?? 0} noHistory=${playerCounts.noHistory ?? 0} completed=${playerCounts.completed ?? 0}`,
);
console.log(
  `Guilds ready=${guildCounts.ready ?? 0} review=${guildCounts.review ?? 0} unresolved=${guildCounts.unresolved ?? 0} noHistory=${guildCounts.noHistory ?? 0} completed=${guildCounts.completed ?? 0}`,
);
console.log("Ground-truth guild cases:");

CASES.forEach((item) => {
  const matches = guildItems.filter((entry) => normalizeKey(entry.currentName) === normalizeKey(item.currentName));
  const withCandidate = matches.find((entry) =>
    entry.candidates.some((candidate) => normalizeKey(candidate.historicalIdentifier) === normalizeKey(item.historicalId)),
  );
  const withMigration = matches.find((entry) =>
    entry.memberMigrationEdges.some((edge) => normalizeKey(edge.oldGuildIdentifier) === normalizeKey(item.historicalId)),
  );
  const selected = withCandidate ?? withMigration ?? matches[0] ?? null;
  const candidate = selected?.candidates.find(
    (entry) => normalizeKey(entry.historicalIdentifier) === normalizeKey(item.historicalId),
  );
  const migration = selected?.memberMigrationEdges.find(
    (entry) => normalizeKey(entry.oldGuildIdentifier) === normalizeKey(item.historicalId),
  );

  console.log(
    `- ${item.label}: current=${selected?.currentIdentifier ?? "missing"} status=${selected?.status ?? "missing"} candidate=${candidate ? "yes" : "no"} migration=${migration ? "yes" : "no"} ready=${candidate?.ready ?? false} matched=${candidate?.entityType === "guild" ? candidate.evidence.matchedMemberCount : migration?.matchedMemberCount ?? 0}`,
  );
  assert.ok(selected, `${item.label} current guild should be present`);
  assert.ok(candidate || migration, `${item.label} should have identity or migration evidence`);
});

assert.ok(playerItems.length > 0, "expected post-fusion players");
assert.ok(guildItems.length > 0, "expected post-fusion guilds");
assert.ok(guildItems.some((item) => item.currentName === "Magic Mushrooms"), "expected Magic Mushrooms in global guild pool");
assert.ok(guildItems.some((item) => item.currentName === "Erben im Wandel"), "expected Erben im Wandel in global guild pool");
assert.ok(guildItems.some((item) => item.currentName === "Legion Z"), "expected Legion Z in global guild pool");

await playerStore.close();
await guildStore.close();
await deleteDB(`fusion-real-player-${suffix}`);
await deleteDB(`fusion-real-guild-${suffix}`);

console.log("fusionIdentityManagement real scan regression passed");
