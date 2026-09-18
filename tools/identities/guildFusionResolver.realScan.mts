import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import { resolvePlayerFusions } from "../../src/lib/identities/playerFusionResolver.ts";
import {
  resolveGuildFusions,
  type GuildFusionPlayerMatch,
  type GuildFusionStatus,
} from "../../src/lib/identities/guildFusionResolver.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const TARGET_DATES = new Set(["2026-02-21", "2026-04-03", "2026-09-05"]);
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_FUSION_SERVER = "F28";
const CASES = [
  { label: "Magic Mushrooms", oldId: "eu1_g8", newId: "f28_g6" },
  { label: "Dead End / Erben im Wandel", oldId: "eu4_g14", newId: "f28_g14265" },
  { label: "Die Legion / Legion Z", oldId: "eu3_g4877", newId: "f28_g15060" },
  { label: "GenerationZ / Legion Z", oldId: "eu4_g1352", newId: "f28_g15060" },
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

const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

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

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const countStatuses = (statuses: GuildFusionStatus[]) => {
  const counts = new Map<GuildFusionStatus, number>();
  statuses.forEach((status) => counts.set(status, (counts.get(status) ?? 0) + 1));
  return counts;
};

const formatCounts = (counts: Map<GuildFusionStatus, number>) =>
  ["autoEligible", "reviewRequired", "split", "convergence", "unresolved", "noHistoricalData"]
    .map((status) => `${status}: ${counts.get(status as GuildFusionStatus) ?? 0}`)
    .join(", ");

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
const postSnapshots = snapshots.filter((snapshot) => TARGET_DATES.has(dateKey(snapshot.timestampMs)));

assert.equal(postSnapshots.length, 3, "expected February, April, and September 2026 post-fusion scans");

postSnapshots.forEach((postSnapshot) => {
  const historicalSnapshots = snapshots.filter((snapshot) => snapshot.timestampMs < postSnapshot.timestampMs);
  const historicalPlayerObservations = historicalSnapshots
    .flatMap(createFusionIdentityObservations)
    .filter((observation) => {
      const code = resolveServerCode(observation.server);
      return Boolean(code && ORIGIN_SERVER_CODES.has(code));
    });
  const newPlayerObservations = createFusionIdentityObservations(postSnapshot).filter(
    (observation) => resolveServerCode(observation.server) === TARGET_FUSION_SERVER,
  );
  const playerResult = resolvePlayerFusions({
    historicalObservations: historicalPlayerObservations,
    newObservations: newPlayerObservations,
  });
  const newObservationByIdentifier = new Map(
    newPlayerObservations.map((observation) => [observation.identifier.toLowerCase(), observation]),
  );
  const highConfidencePlayerMatches: GuildFusionPlayerMatch[] = playerResult.results.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = result.candidates.find(
      (entry) => !entry.rejected && (entry.evidence.exactName || entry.evidence.fusionBaseName),
    );
    const newObservation = newObservationByIdentifier.get(result.newIdentifier.toLowerCase());
    if (!candidate || !newObservation) return [];
    return [
      {
        oldIdentifier: candidate.oldIdentifier,
        oldName: candidate.oldName,
        newIdentifier: result.newIdentifier,
        newName: newObservation.name,
      },
    ];
  });
  const historicalGuildObservations = historicalSnapshots
    .flatMap(createFusionIdentityGuildObservations)
    .filter((guild) => Boolean(guild.serverCode && ORIGIN_SERVER_CODES.has(guild.serverCode)));
  const newGuildObservations = createFusionIdentityGuildObservations(postSnapshot).filter(
    (guild) => guild.serverCode === TARGET_FUSION_SERVER,
  );
  const guildResult = resolveGuildFusions({
    historicalGuildObservations,
    newGuildObservations,
    highConfidencePlayerMatches,
  });
  const statusCounts = countStatuses(guildResult.results.map((result) => result.status));
  const migrationEdges = guildResult.results.flatMap((result) => result.memberMigrationEdges);
  const identityCandidates = guildResult.results.flatMap((result) => result.identityCandidates);
  const topMemberEvidence = identityCandidates
    .sort((left, right) => right.matchedMemberCount - left.matchedMemberCount)
    .slice(0, 5);

  console.log(`\n${dateKey(postSnapshot.timestampMs)} ${postSnapshot.sourceScanFilename}`);
  console.log(`Total F28 Guilds: ${newGuildObservations.length}`);
  console.log(formatCounts(statusCounts));
  console.log(`Migration Edges: ${migrationEdges.length}`);
  console.log(`Split: ${guildResult.results.filter((result) => result.splitCandidate).length}`);
  console.log(`Convergence: ${guildResult.results.filter((result) => result.convergenceCandidate).length}`);
  console.log("top matched-player identity candidates:");
  topMemberEvidence.forEach((candidate) => {
    console.log(
      `- ${candidate.oldName ?? candidate.oldGuildIdentifier} -> ${candidate.newName ?? candidate.newGuildIdentifier}: ${candidate.matchedMemberCount} auto=${candidate.autoEligible} review=${candidate.reviewRequired} mutual=${candidate.mutualDominant}`,
    );
  });
  console.log("ground-truth checks:");
  CASES.forEach((item) => {
    const result = guildResult.results.find((entry) => normalizeKey(entry.newGuild.guildIdentifier) === normalizeKey(item.newId));
    const candidate = result?.identityCandidates.find(
      (entry) => normalizeKey(entry.oldGuildIdentifier) === normalizeKey(item.oldId),
    );
    const migration = result?.memberMigrationEdges.find(
      (entry) => normalizeKey(entry.oldGuildIdentifier) === normalizeKey(item.oldId),
    );
    console.log(
      `- ${item.label}: result=${result?.status ?? "missing"} candidate=${candidate ? "yes" : "no"} migration=${migration ? "yes" : "no"} matched=${candidate?.matchedMemberCount ?? migration?.matchedMemberCount ?? 0} auto=${candidate?.autoEligible ?? false} review=${candidate?.reviewRequired ?? false} exactName=${candidate?.exactName ?? false} sameCoA=${candidate?.sameCoA ?? false} mutual=${candidate?.mutualDominant ?? false}`,
    );
  });
});

console.log("\nguildFusionResolver V2 real scan analysis passed");
