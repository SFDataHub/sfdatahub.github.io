import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityCandidate,
  type FusionIdentityManagementItem,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import {
  getGuildFusionClassificationRank,
  resolveGuildFusions,
  type GuildFusionCandidate,
  type GuildFusionEvidenceEntry,
  type GuildFusionGuildResult,
  type GuildFusionMigrationEdge,
  type GuildFusionObservation,
  type GuildFusionPlayerMatch,
} from "../../src/lib/identities/guildFusionResolver.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  selectPlayerFusionReadyCandidates,
} from "../../src/lib/identities/playerFusionResolver.ts";
import {
  normalizeSfGuildsFromScan,
  type NormalizedGuild,
  type NormalizedGuildMember,
} from "../../src/lib/parsing/normalizedGuild.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

type ScanBundle = {
  snapshot: GuildHubLogicalScanSnapshot;
  normalizedGuilds: NormalizedGuild[];
  normalizedGuildByIdentifier: Map<string, NormalizedGuild>;
};

type LeadershipSummary = {
  oldLeader: string | null;
  newLeader: string | null;
  sameLogicalLeader: boolean | null;
  oldOfficerResolvedCount: number;
  newOfficerResolvedCount: number;
  continuedOfficers: number;
  leadershipCoreOverlap: number;
};

type RelationRow = {
  kind: "identity candidate" | "migration edge";
  oldGuildIdentifier: string;
  oldName: string | null;
  oldServer: string | null;
  classification: string;
  exactName: boolean;
  fusionBaseName: boolean;
  sameCoA: boolean;
  matchedMemberCount: number;
  oldShare: number;
  newShare: number;
  isOldTopDestination: boolean;
  isNewTopSource: boolean;
  mutualDominant: boolean;
  oldTopDestination: string;
  newTopSource: string;
  continuedOfficers: number;
  leadershipCoreOverlap: number;
  leader: string;
  reservedByReadyAssignment: boolean;
  assignmentConflict: boolean;
  evidenceEntries: GuildFusionEvidenceEntry[];
  raw: GuildFusionCandidate | GuildFusionMigrationEdge;
  occurrenceCount: number;
};

type SimulationVariant = {
  key: string;
  label: string;
  promoted: RelationRow[];
  simulatedStatus: "ready" | "review" | "unresolved";
  winner: RelationRow | null;
  reason: string;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/guild-evidence-v31-calibration.latest.txt");
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const MEANINGFUL_MEMBER_CORE_MIN = 1;
const SUBSTANTIAL_MEMBER_CORE_MIN = 10;
const STRUCTURAL_MEMBER_CORE_MIN = 10;
const STRUCTURAL_SHARE_MIN = 0.29;
const STRUCTURAL_ADVANTAGE_RATIO_MIN = 2;
const STRUCTURAL_ADVANTAGE_DELTA_MIN = 8;
const CONTROL_NAMES = [
  "Glücksbärchies",
  "Sladký domov",
  "Die Legion",
  "Magic Mushrooms",
  "Hangover",
  "ARMIA POLSKA",
  "CZSK Elite",
  "Der weiße Lotus",
];

const lines: string[] = [];
const line = (value = "") => lines.push(value);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const normalizeIdentifierKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeExactNameKey = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFC")
    .toLowerCase();

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null ? "missing" : new Date(timestamp).toISOString();

const pct = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "n/a" : `${Math.round(value * 100)}%`;

const bool = (value: boolean | null | undefined) => (value ? "yes" : "no");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

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

const guildIdentifierAliases = (identifier: string | null | undefined) => {
  const raw = normalizeIdentifierKey(identifier);
  if (!raw) return [];
  const aliases = new Set([raw]);
  const serverAliases: Array<[RegExp, string]> = [
    [/^s1_eu_/, "eu1_"],
    [/^s2_eu_/, "eu2_"],
    [/^s3_eu_/, "eu3_"],
    [/^s4_eu_/, "eu4_"],
    [/^f28_net_/, "f28_"],
    [/^eu1_/, "s1_eu_"],
    [/^eu2_/, "s2_eu_"],
    [/^eu3_/, "s3_eu_"],
    [/^eu4_/, "s4_eu_"],
    [/^f28_/, "f28_net_"],
  ];
  serverAliases.forEach(([pattern, replacement]) => {
    if (pattern.test(raw)) aliases.add(raw.replace(pattern, replacement));
  });
  return [...aliases];
};

const playerIdentifierAliases = (identifier: string | null | undefined) => {
  const raw = normalizeIdentifierKey(identifier);
  if (!raw) return [];
  const aliases = new Set([raw]);
  const serverAliases: Array<[RegExp, string]> = [
    [/^s1_eu_/, "eu1_"],
    [/^s2_eu_/, "eu2_"],
    [/^s3_eu_/, "eu3_"],
    [/^s4_eu_/, "eu4_"],
    [/^f28_net_/, "f28_"],
    [/^eu1_/, "s1_eu_"],
    [/^eu2_/, "s2_eu_"],
    [/^eu3_/, "s3_eu_"],
    [/^eu4_/, "s4_eu_"],
    [/^f28_/, "f28_net_"],
  ];
  serverAliases.forEach(([pattern, replacement]) => {
    if (pattern.test(raw)) aliases.add(raw.replace(pattern, replacement));
  });
  return [...aliases];
};

const createScanBundle = (snapshot: GuildHubLogicalScanSnapshot): ScanBundle => {
  const normalizedGuilds = normalizeSfGuildsFromScan(snapshot.rawData);
  const normalizedGuildByIdentifier = new Map<string, NormalizedGuild>();
  normalizedGuilds.forEach((guild) => {
    guildIdentifierAliases(guild.identity.identifier).forEach((key) => normalizedGuildByIdentifier.set(key, guild));
  });
  return { snapshot, normalizedGuilds, normalizedGuildByIdentifier };
};

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp)[0] ?? null;

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const groupGuildObservations = (observations: GuildFusionObservation[]) => {
  const grouped = new Map<string, GuildFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.guildIdentifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const sameGuildIdentifier = (left: string | null | undefined, right: string | null | undefined) => {
  const rightAliases = new Set(guildIdentifierAliases(right));
  return guildIdentifierAliases(left).some((alias) => rightAliases.has(alias));
};

const findNormalizedGuildAcrossBundles = (
  bundles: ScanBundle[],
  guildIdentifier: string,
  options: { before?: number; after?: number; latest?: boolean } = {},
) => {
  const matches = bundles.flatMap((bundle) => {
    const guild = guildIdentifierAliases(guildIdentifier)
      .map((alias) => bundle.normalizedGuildByIdentifier.get(alias))
      .find(Boolean);
    if (!guild) return [];
    if (options.before != null && bundle.snapshot.timestampMs >= options.before) return [];
    if (options.after != null && bundle.snapshot.timestampMs < options.after) return [];
    return [{ timestamp: bundle.snapshot.timestampMs, guild }];
  });
  return matches.sort((left, right) => (options.latest ? right.timestamp - left.timestamp : left.timestamp - right.timestamp))[0]?.guild ?? null;
};

const createLogicalPlayerMap = (items: FusionIdentityManagementItem[]) => {
  const logicalPlayerByIdentifier = new Map<string, string>();
  items
    .filter((item) => item.entityType === "player" && (item.status === "ready" || item.status === "completed"))
    .forEach((item) => {
      const logical = item.completedEntityId ?? item.id;
      playerIdentifierAliases(item.currentIdentifier).forEach((alias) => logicalPlayerByIdentifier.set(normalizeIdentifierKey(alias), logical));
      if (item.readyCandidateIdentifier) {
        playerIdentifierAliases(item.readyCandidateIdentifier).forEach((alias) => logicalPlayerByIdentifier.set(normalizeIdentifierKey(alias), logical));
      }
      item.completedAliases.forEach((alias) =>
        playerIdentifierAliases(alias).forEach((resolvedAlias) => logicalPlayerByIdentifier.set(normalizeIdentifierKey(resolvedAlias), logical)),
      );
    });
  return logicalPlayerByIdentifier;
};

const memberLogicalId = (member: NormalizedGuildMember | null | undefined, logicalPlayerByIdentifier: Map<string, string>) =>
  member?.identity.playerIdentifier
    ? playerIdentifierAliases(member.identity.playerIdentifier)
        .map((alias) => logicalPlayerByIdentifier.get(normalizeIdentifierKey(alias)) ?? null)
        .find((value): value is string => Boolean(value)) ?? null
    : null;

const memberLabel = (member: NormalizedGuildMember | null | undefined) =>
  member?.identity.name ?? member?.identity.playerIdentifier ?? null;

const evaluateLeadership = (
  oldGuild: NormalizedGuild | null,
  newGuild: NormalizedGuild | null,
  logicalPlayerByIdentifier: Map<string, string>,
): LeadershipSummary => {
  const oldLeader = oldGuild?.members.find((member) => member.role.name === "leader") ?? null;
  const newLeader = newGuild?.members.find((member) => member.role.name === "leader") ?? null;
  const oldLeaderLogical = memberLogicalId(oldLeader, logicalPlayerByIdentifier);
  const newLeaderLogical = memberLogicalId(newLeader, logicalPlayerByIdentifier);
  const oldOfficerLogical = new Set(
    (oldGuild?.members ?? [])
      .filter((member) => member.role.name === "officer")
      .map((member) => memberLogicalId(member, logicalPlayerByIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const newOfficerLogical = new Set(
    (newGuild?.members ?? [])
      .filter((member) => member.role.name === "officer")
      .map((member) => memberLogicalId(member, logicalPlayerByIdentifier))
      .filter((value): value is string => Boolean(value)),
  );
  const oldCore = new Set([oldLeaderLogical, ...oldOfficerLogical].filter((value): value is string => Boolean(value)));
  const newCore = new Set([newLeaderLogical, ...newOfficerLogical].filter((value): value is string => Boolean(value)));

  return {
    oldLeader: memberLabel(oldLeader),
    newLeader: memberLabel(newLeader),
    sameLogicalLeader: oldLeaderLogical && newLeaderLogical ? oldLeaderLogical === newLeaderLogical : null,
    oldOfficerResolvedCount: oldOfficerLogical.size,
    newOfficerResolvedCount: newOfficerLogical.size,
    continuedOfficers: [...oldOfficerLogical].filter((officer) => newOfficerLogical.has(officer)).length,
    leadershipCoreOverlap: [...oldCore].filter((entry) => newCore.has(entry)).length,
  };
};

const relationFamilySet = (row: RelationRow) => {
  const families = new Set<string>();
  if (row.exactName || row.fusionBaseName) families.add("Name");
  if (row.sameCoA) families.add("CoA");
  if (row.matchedMemberCount > 0 || row.mutualDominant) families.add("Member Structure");
  if (row.continuedOfficers > 0 || row.leadershipCoreOverlap > 0 || row.leader === "same") families.add("Leadership");
  if (row.evidenceEntries.some((entry) => entry.type === "guild-progression")) families.add("Progression");
  if (row.fusionBaseName) families.add("Fusion Base Name");
  return families;
};

const familySummary = (row: RelationRow) => [...relationFamilySet(row)].join("+") || "none";

const rowHasDirectGuildEvidence = (row: RelationRow) =>
  row.exactName || row.fusionBaseName || row.sameCoA || row.leader === "same" || row.continuedOfficers >= 2 || row.leadershipCoreOverlap > 0;

const formatPeer = (peer: { name: string | null; guildIdentifier: string; matchedMemberCount: number } | null) =>
  peer ? `${peer.name ?? peer.guildIdentifier}:${peer.matchedMemberCount}` : "none";

const relationSortValue = (row: RelationRow) =>
  (row.kind === "identity candidate" ? 1000 : 0) +
  getGuildFusionClassificationRank(row.classification as GuildFusionCandidate["classification"]) * 100 +
  row.matchedMemberCount;

const buildRelationRows = (
  item: FusionIdentityManagementItem,
  results: GuildFusionGuildResult[],
  bundles: ScanBundle[],
  logicalPlayerByIdentifier: Map<string, string>,
): RelationRow[] => {
  const candidateRows = item.candidates
    .filter((candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> => candidate.entityType === "guild")
    .map((candidate): RelationRow => {
      const evidence = candidate.evidence;
      const leadership = evidence.leadership;
      return {
        kind: "identity candidate",
        oldGuildIdentifier: evidence.oldGuildIdentifier,
        oldName: evidence.oldName,
        oldServer: evidence.oldServer,
        classification: evidence.classification,
        exactName: evidence.exactName,
        fusionBaseName: evidence.fusionBaseName,
        sameCoA: evidence.sameCoA,
        matchedMemberCount: evidence.matchedMemberCount,
        oldShare: evidence.oldShare,
        newShare: evidence.newShare,
        isOldTopDestination: evidence.isOldTopDestination,
        isNewTopSource: evidence.isNewTopSource,
        mutualDominant: evidence.mutualDominant,
        oldTopDestination: formatPeer(evidence.oldTopDestination),
        newTopSource: formatPeer(evidence.newTopSource),
        continuedOfficers: leadership.continuedOfficers,
        leadershipCoreOverlap: leadership.leadershipCoreOverlap,
        leader: leadership.sameLogicalLeader == null ? "unavailable" : leadership.sameLogicalLeader ? "same" : "different",
        reservedByReadyAssignment: evidence.reservedByReadyAssignment,
        assignmentConflict: evidence.assignmentConflict,
        evidenceEntries: evidence.evidenceEntries,
        raw: evidence,
        occurrenceCount: 1,
      };
    });
  const migrationRows = results.flatMap((result) => result.memberMigrationEdges).map((edge): RelationRow => {
    const oldGuild = findNormalizedGuildAcrossBundles(bundles, edge.oldGuildIdentifier, { before: item.firstSeen, latest: true });
    const newGuild = findNormalizedGuildAcrossBundles(bundles, edge.newGuildIdentifier, { after: item.firstSeen, latest: false });
    const leadership = evaluateLeadership(oldGuild, newGuild, logicalPlayerByIdentifier);
    return {
      kind: "migration edge",
      oldGuildIdentifier: edge.oldGuildIdentifier,
      oldName: edge.oldName,
      oldServer: edge.oldServer,
      classification: "migration",
      exactName: normalizeExactNameKey(edge.oldName) === normalizeExactNameKey(edge.newName),
      fusionBaseName: false,
      sameCoA: Boolean(oldGuild?.identity.coa && newGuild?.identity.coa && oldGuild.identity.coa === newGuild.identity.coa),
      matchedMemberCount: edge.matchedMemberCount,
      oldShare: edge.oldShare,
      newShare: edge.newShare,
      isOldTopDestination: edge.isOldTopDestination,
      isNewTopSource: edge.isNewTopSource,
      mutualDominant: edge.mutualDominant,
      oldTopDestination: formatPeer(edge.oldTopDestination),
      newTopSource: formatPeer(edge.newTopSource),
      continuedOfficers: leadership.continuedOfficers,
      leadershipCoreOverlap: leadership.leadershipCoreOverlap,
      leader: leadership.sameLogicalLeader == null ? "unavailable" : leadership.sameLogicalLeader ? "same" : "different",
      reservedByReadyAssignment: false,
      assignmentConflict: false,
      evidenceEntries: [],
      raw: edge,
      occurrenceCount: 1,
    };
  });
  return [...candidateRows, ...migrationRows].sort((left, right) => relationSortValue(right) - relationSortValue(left));
};

const dedupeRelationRows = (rows: RelationRow[]) => {
  const byRelation = new Map<string, RelationRow>();
  rows.forEach((row) => {
    const key = `${row.kind}:${normalizeIdentifierKey(row.oldGuildIdentifier)}:${row.classification}`;
    const existing = byRelation.get(key);
    if (!existing || relationSortValue(row) > relationSortValue(existing)) {
      byRelation.set(key, { ...row, occurrenceCount: (existing?.occurrenceCount ?? 0) + row.occurrenceCount });
    } else {
      byRelation.set(key, { ...existing, occurrenceCount: existing.occurrenceCount + row.occurrenceCount });
    }
  });
  return [...byRelation.values()].sort((left, right) => relationSortValue(right) - relationSortValue(left));
};

const exactHistoricalEntityCounts = (latestHistoricalGuilds: GuildFusionObservation[]) => {
  const counts = new Map<string, Set<string>>();
  latestHistoricalGuilds.forEach((guild) => {
    const nameKey = normalizeExactNameKey(guild.name);
    if (!nameKey) return;
    const identifiers = counts.get(nameKey) ?? new Set<string>();
    identifiers.add(normalizeIdentifierKey(guild.guildIdentifier));
    counts.set(nameKey, identifiers);
  });
  return counts;
};

const exactCountForName = (counts: Map<string, Set<string>>, name: string | null | undefined) =>
  counts.get(normalizeExactNameKey(name))?.size ?? 0;

const strongestRows = (rows: RelationRow[]) =>
  rows.filter((row) => row.kind === "identity candidate" && ["anchored", "strong"].includes(row.classification));

const activeIdentityRows = (rows: RelationRow[]) => rows.filter((row) => row.kind === "identity candidate");

const topCandidate = (rows: RelationRow[]) =>
  [...rows].sort(
    (left, right) =>
      getGuildFusionClassificationRank(right.classification as GuildFusionCandidate["classification"]) -
        getGuildFusionClassificationRank(left.classification as GuildFusionCandidate["classification"]) ||
      right.matchedMemberCount - left.matchedMemberCount,
  )[0] ?? null;

const simulateVariant = (
  key: string,
  label: string,
  rows: RelationRow[],
  promote: (row: RelationRow) => boolean,
  readyRule: (promoted: RelationRow[], rows: RelationRow[]) => { winner: RelationRow | null; reason: string },
): SimulationVariant => {
  const promoted = rows.filter(promote);
  const { winner, reason } = readyRule(promoted, rows);
  const simulatedStatus = winner ? "ready" : activeIdentityRows(rows).length || promoted.length ? "review" : "unresolved";
  return { key, label, promoted, simulatedStatus, winner, reason };
};

const singlePromotedWinner = (promoted: RelationRow[], rows: RelationRow[]) => {
  if (promoted.length !== 1) return { winner: null, reason: `promoted candidates=${promoted.length}` };
  const competitor = activeIdentityRows(rows).find(
    (row) =>
      row.oldGuildIdentifier !== promoted[0]?.oldGuildIdentifier &&
      ["anchored", "strong"].includes(row.classification),
  );
  if (competitor) return { winner: null, reason: `blocked by ${competitor.classification} competitor ${competitor.oldName ?? competitor.oldGuildIdentifier}` };
  return { winner: promoted[0] ?? null, reason: "single promoted candidate without strong/anchored competitor" };
};

const dominanceWinner = (rows: RelationRow[]) => {
  const candidates = activeIdentityRows(rows);
  const winner = topCandidate(candidates);
  if (!winner) return { winner: null, reason: "no identity candidate" };
  const winnerRank = getGuildFusionClassificationRank(winner.classification as GuildFusionCandidate["classification"]);
  const peer = candidates.find(
    (candidate) =>
      candidate.oldGuildIdentifier !== winner.oldGuildIdentifier &&
      getGuildFusionClassificationRank(candidate.classification as GuildFusionCandidate["classification"]) >= winnerRank,
  );
  if (peer) return { winner: null, reason: `same-or-higher class competitor ${peer.oldName ?? peer.oldGuildIdentifier}` };
  if (!["anchored", "strong"].includes(winner.classification)) return { winner: null, reason: `top class ${winner.classification} remains below strong` };
  return { winner, reason: "single top class candidate under class hierarchy" };
};

const sourceAdvantage = (row: RelationRow) => {
  const second = "newSecondSource" in row.raw ? row.raw.newSecondSource?.matchedMemberCount ?? 0 : 0;
  const ratio = second > 0 ? row.matchedMemberCount / second : Number.POSITIVE_INFINITY;
  const delta = row.matchedMemberCount - second;
  return { second, ratio, delta };
};

const evidenceText = (entries: GuildFusionEvidenceEntry[]) =>
  entries.map((entry) => `${entry.type}:${entry.strength}:${entry.label}${entry.details ? ` (${entry.details})` : ""}`).join("; ") || "none";

const relationLine = (row: RelationRow) => {
  const advantage = sourceAdvantage(row);
  return [
    `- ${row.kind}: ${row.oldName ?? row.oldGuildIdentifier} (${row.oldGuildIdentifier}, ${row.oldServer ?? "?"})`,
    `class=${row.classification}`,
    `exact=${bool(row.exactName)}`,
    `fusionBase=${bool(row.fusionBaseName)}`,
    `coa=${bool(row.sameCoA)}`,
    `matched=${row.matchedMemberCount}`,
    `oldShare=${pct(row.oldShare)}`,
    `newShare=${pct(row.newShare)}`,
    `oldTop=${bool(row.isOldTopDestination)}`,
    `newTop=${bool(row.isNewTopSource)}`,
    `mutual=${bool(row.mutualDominant)}`,
    `secondSource=${advantage.second}`,
    `sourceRatio=${Number.isFinite(advantage.ratio) ? advantage.ratio.toFixed(2) : "inf"}`,
    `leader=${row.leader}`,
    `officers=${row.continuedOfficers}`,
    `core=${row.leadershipCoreOverlap}`,
    `reserved=${bool(row.reservedByReadyAssignment)}`,
    `assignmentConflict=${bool(row.assignmentConflict)}`,
    `occurrences=${row.occurrenceCount}`,
    `families=${familySummary(row)}`,
    `evidence=[${evidenceText(row.evidenceEntries)}]`,
  ].join(" ");
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
assert.ok(snapshots.length > 0, "expected real scan snapshots");

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `guild-v31-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `guild-v31-guild-${suffix}` });

try {
  const bundles = snapshots.map(createScanBundle);
  const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
  const logicalPlayerByIdentifier = createLogicalPlayerMap(report.items);
  const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
  const historicalPlayerObservations = allPlayerObservations.filter((observation) => ORIGIN_CODES.has(resolveServerCode(observation.server) ?? ""));
  const currentPlayerObservations = allPlayerObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
  const playerResult = resolvePlayerFusions({ historicalObservations: historicalPlayerObservations, newObservations: currentPlayerObservations });
  const currentPlayerById = new Map(currentPlayerObservations.map((observation) => [normalizeIdentifierKey(observation.identifier), observation]));
  const highConfidencePlayerMatches: GuildFusionPlayerMatch[] = playerResult.results.flatMap((result) => {
    const candidate = selectPlayerFusionReadyCandidates(result)[0] ?? null;
    const newObservation = currentPlayerById.get(normalizeIdentifierKey(result.newIdentifier)) ?? null;
    if (!candidate || !newObservation) return [];
    return [{
      oldIdentifier: candidate.oldIdentifier,
      oldName: candidate.oldName,
      newIdentifier: result.newIdentifier,
      newName: newObservation.name,
    }];
  });

  const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
  const historicalGuildObservations = allGuildObservations.filter((guild) => ORIGIN_CODES.has(resolveServerCode(guild.serverCode) ?? ""));
  const currentGuildObservations = allGuildObservations.filter((guild) => resolveServerCode(guild.serverCode) === TARGET_CODE);
  const historicalGuildGroups = groupGuildObservations(historicalGuildObservations);
  const currentGuildGroups = groupGuildObservations(currentGuildObservations);
  const firstPostTimestamp = Math.min(...currentGuildObservations.map((guild) => guild.timestamp).filter(Number.isFinite));
  const latestHistoricalGuilds = [...historicalGuildGroups.values()]
    .map((observations) => latestByTimestamp(observations.filter((observation) => observation.timestamp < firstPostTimestamp)))
    .filter((observation): observation is GuildFusionObservation => Boolean(observation));
  const exactCounts = exactHistoricalEntityCounts(latestHistoricalGuilds);

  const guildResult = resolveGuildFusions({
    historicalGuildObservations,
    newGuildObservations: currentGuildObservations,
    highConfidencePlayerMatches,
  });
  const guildResultsByNewId = new Map<string, GuildFusionGuildResult[]>();
  guildResult.results.forEach((result) => {
    guildIdentifierAliases(result.newGuild.guildIdentifier).forEach((alias) => {
      const key = normalizeIdentifierKey(alias);
      guildResultsByNewId.set(key, [...(guildResultsByNewId.get(key) ?? []), result]);
    });
  });

  const guildItems = report.items.filter((item) => item.entityType === "guild");
  const nonReadyGuilds = guildItems
    .filter((item) => item.status === "review" || item.status === "unresolved")
    .sort((left, right) => (left.currentName ?? left.currentIdentifier).localeCompare(right.currentName ?? right.currentIdentifier));
  const statusCounts = guildItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  const analyses = nonReadyGuilds.map((item) => {
    const results = guildResultsByNewId.get(normalizeIdentifierKey(item.currentIdentifier)) ?? [];
    const rawRows = buildRelationRows(item, results, bundles, logicalPlayerByIdentifier);
    const rows = dedupeRelationRows(rawRows);
    const exactNameCount = exactCountForName(exactCounts, item.currentName);
    const variants: SimulationVariant[] = [
      simulateVariant(
        "A",
        "Unique exact name + no strong/anchored competitor",
        rows,
        (row) => row.kind === "identity candidate" && row.exactName && exactNameCount === 1,
        singlePromotedWinner,
      ),
      simulateVariant(
        "B",
        "Exact name + meaningful member continuity",
        rows,
        (row) => row.kind === "identity candidate" && row.exactName && row.matchedMemberCount >= MEANINGFUL_MEMBER_CORE_MIN,
        singlePromotedWinner,
      ),
      simulateVariant(
        "C",
        "Rename via CoA + substantial member continuity",
        rows,
        (row) =>
          row.kind === "identity candidate" &&
          !row.exactName &&
          row.sameCoA &&
          row.matchedMemberCount >= SUBSTANTIAL_MEMBER_CORE_MIN &&
          !rows.some((competitor) => competitor.oldGuildIdentifier !== row.oldGuildIdentifier && competitor.exactName),
        singlePromotedWinner,
      ),
      simulateVariant(
        "D",
        "Structural rename without name/CoA",
        rows,
        (row) => {
          const advantage = sourceAdvantage(row);
          return (
            !row.exactName &&
            !row.sameCoA &&
            row.matchedMemberCount >= STRUCTURAL_MEMBER_CORE_MIN &&
            row.oldShare >= STRUCTURAL_SHARE_MIN &&
            row.newShare >= STRUCTURAL_SHARE_MIN &&
            row.mutualDominant &&
            advantage.ratio >= STRUCTURAL_ADVANTAGE_RATIO_MIN &&
            advantage.delta >= STRUCTURAL_ADVANTAGE_DELTA_MIN
          );
        },
        (promoted, allRows) => {
          const directCandidates = activeIdentityRows(allRows);
          if (directCandidates.length) {
            return { winner: null, reason: `direct identity candidates present=${directCandidates.length}` };
          }
          return promoted.length === 1
            ? { winner: promoted[0] ?? null, reason: "single structural dominant flow candidate without direct identity candidate" }
            : { winner: null, reason: `structural candidates=${promoted.length}` };
        },
      ),
      {
        key: "E",
        label: "Candidate-class dominance hierarchy",
        promoted: [],
        simulatedStatus: dominanceWinner(rows).winner ? "ready" : activeIdentityRows(rows).length ? "review" : "unresolved",
        winner: dominanceWinner(rows).winner,
        reason: dominanceWinner(rows).reason,
      },
    ];
    return { item, results, rows, rawRows, exactNameCount, variants };
  });

  const allRows = analyses.flatMap((analysis) => analysis.rows);
  const candidateRows = allRows.filter((row) => row.kind === "identity candidate");
  const migrationRows = allRows.filter((row) => row.kind === "migration edge");
  const bigMigrationRows = migrationRows.filter(
    (row) => row.matchedMemberCount >= 5 && row.oldShare >= 0.2 && row.newShare >= 0.2,
  );
  const differentLeaderCandidates = candidateRows.filter((row) => row.leader === "different");
  const readyCandidateRows = guildItems
    .filter((item) => item.status === "ready")
    .flatMap((item) => {
      const results = guildResultsByNewId.get(normalizeIdentifierKey(item.currentIdentifier)) ?? [];
      return buildRelationRows(item, results, bundles, logicalPlayerByIdentifier).filter((row) => row.kind === "identity candidate");
    });
  const readyDifferentLeader = readyCandidateRows.filter((row) => row.leader === "different");
  const strongOneFamily = candidateRows.filter((row) => ["strong", "anchored"].includes(row.classification) && relationFamilySet(row).size <= 1);
  const plausibleMultiFamily = candidateRows.filter((row) => row.classification === "plausible" && relationFamilySet(row).size >= 2);
  const legionZItems = guildItems.filter((item) => normalizeExactNameKey(item.currentName) === normalizeExactNameKey("Legion Z"));
  const legionZRows = legionZItems.flatMap((item) => {
    const results = guildResultsByNewId.get(normalizeIdentifierKey(item.currentIdentifier)) ?? [];
    return dedupeRelationRows(buildRelationRows(item, results, bundles, logicalPlayerByIdentifier)).map((row) => ({ item, row }));
  });
  const anchoredWeakCompetitors = analyses.filter(
    (analysis) =>
      analysis.rows.some((row) => row.classification === "anchored") &&
      analysis.rows.some((row) => row.kind === "identity candidate" && row.classification !== "anchored"),
  );

  const exactNameStats = guildItems
    .map((item) => ({
      item,
      exactNameCount: exactCountForName(exactCounts, item.currentName),
      exactCandidates: item.candidates.filter(
        (candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> =>
          candidate.entityType === "guild" && candidate.evidence.exactName,
      ),
    }))
    .filter((row) => row.exactNameCount > 0);
  const uniqueExactRows = exactNameStats.filter((row) => row.exactNameCount === 1);
  const duplicatedExactRows = exactNameStats.filter((row) => row.exactNameCount > 1);
  const uniqueExactWithMembers = uniqueExactRows.filter((row) =>
    row.exactCandidates.some((candidate) => candidate.evidence.matchedMemberCount > 0),
  );
  const uniqueExactWithoutMembers = uniqueExactRows.filter((row) =>
    row.exactCandidates.every((candidate) => candidate.evidence.matchedMemberCount === 0),
  );

  line("# Guild Evidence V3.1 Calibration");
  line("");
  line(`Generated: ${new Date().toISOString()}`);
  line(`Scan root: ${scanRoot}`);
  line("");

  line("## A. Non-Ready Inventory");
  line(`Guild status counts: ready=${statusCounts.ready ?? 0} review=${statusCounts.review ?? 0} unresolved=${statusCounts.unresolved ?? 0} noHistoricalObservation=${statusCounts.noHistoricalObservation ?? 0} noHistory=${statusCounts.noHistory ?? 0} completed=${statusCounts.completed ?? 0}`);
  line(`Non-ready analyzed from current report: ${nonReadyGuilds.length} (review=${nonReadyGuilds.filter((item) => item.status === "review").length}, unresolved=${nonReadyGuilds.filter((item) => item.status === "unresolved").length})`);
  if (nonReadyGuilds.length !== 8) line(`Note: expected task baseline was 8; current scan/report produced ${nonReadyGuilds.length}.`);
  line("");

  analyses.forEach((analysis, index) => {
    const { item, results, rows, exactNameCount, variants } = analysis;
    const primaryResult = results[0] ?? null;
    line(`### ${index + 1}. ${item.currentName ?? item.currentIdentifier}`);
    line(`current=${item.currentIdentifier} server=${item.currentServer ?? "?"} firstSeen=${formatDate(item.firstSeen)} observations=${item.observations.length}`);
    line(`status=${item.status} reasonCodes=${item.reasonCodes.join("|") || "none"} reasons=${item.reasons.join(" | ") || results.flatMap((result) => result.reasons).join(" | ") || "none"}`);
    line(`resolverStatuses=${results.map((result) => result.status).join(",") || "missing"} exactHistoricalEntitiesInLineage=${exactNameCount}`);
    line(`flowSources=${primaryResult?.flowSummary.sources.map((source) => `${source.name ?? source.guildIdentifier}:${source.matchedMemberCount}`).join(", ") || "none"}`);
    line(`flowDestinations=${primaryResult?.flowSummary.destinations.map((destination) => `${destination.name ?? destination.guildIdentifier}:${destination.matchedMemberCount}`).join(", ") || "none"}`);
    line("Relations:");
    rows.forEach((row) => line(relationLine(row)));
    if (!rows.length) line("- none");
    line("Simulations:");
    variants.forEach((variant) => {
      line(`- ${variant.key}. ${variant.label}: ${variant.simulatedStatus}; winner=${variant.winner?.oldName ?? variant.winner?.oldGuildIdentifier ?? "none"}; reason=${variant.reason}`);
    });
    line("");
  });

  line("## B. Duplicate Relation Rows");
  analyses.forEach(({ item, rawRows }) => {
    const byDisplay = rawRows.reduce((map, row) => {
      const key = normalizeExactNameKey(row.oldName);
      if (!key) return map;
      map.set(key, [...(map.get(key) ?? []), row]);
      return map;
    }, new Map<string, RelationRow[]>());
    const duplicates = [...byDisplay.values()].filter((entries) => entries.length > 1);
    line(`- ${item.currentName ?? item.currentIdentifier}: duplicate display groups=${duplicates.length}`);
    duplicates.forEach((entries) => {
      const ids = entries.map((entry) => `${entry.oldName ?? entry.oldGuildIdentifier}/${entry.oldGuildIdentifier}/${entry.kind}/matched=${entry.matchedMemberCount}`);
      const samePhysical = new Set(entries.map((entry) => normalizeIdentifierKey(entry.oldGuildIdentifier))).size === 1;
      line(`  ${entries[0]?.oldName ?? "unknown"}: samePhysical=${bool(samePhysical)} rows=${ids.join("; ")}`);
    });
  });
  line("Finding: duplicate-looking rows must be interpreted by historical guild identifier. Same display name does not automatically mean duplicated flow; this report exposes whether the physical identifier is identical.");
  line("");

  line("## C. Exact Name Calibration");
  line(`Current guilds with exact historical entity count > 0: ${exactNameStats.length}`);
  line(`Unique exact historical entity: ${uniqueExactRows.length}`);
  line(`Duplicated exact historical entities: ${duplicatedExactRows.length}`);
  line(`Unique exact + member continuity: ${uniqueExactWithMembers.length}`);
  line(`Unique exact without member continuity: ${uniqueExactWithoutMembers.length}`);
  CONTROL_NAMES.forEach((name) => {
    const controls = guildItems.filter((item) => normalizeExactNameKey(item.currentName) === normalizeExactNameKey(name));
    if (!controls.length) {
      line(`- ${name}: current guild not present in report`);
      return;
    }
    controls.forEach((item) => {
      const row = exactNameStats.find((entry) => entry.item.currentIdentifier === item.currentIdentifier);
      const candidates = item.candidates
        .filter((candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> => candidate.entityType === "guild")
        .map((candidate) => `${candidate.historicalName ?? candidate.historicalIdentifier}:${candidate.evidence.classification}:matched=${candidate.evidence.matchedMemberCount}:exact=${bool(candidate.evidence.exactName)}`)
        .join("; ") || "none";
      line(`- ${name}: status=${item.status} exactHistoricalEntities=${row?.exactNameCount ?? 0} candidates=${candidates}`);
    });
  });
  line("Recommendation: unique exact name is materially stronger than generic exact name, but should be promoted only when it has member continuity or no stronger competing direct-evidence family.");
  line("");

  line("## D. Exact Name + Member Continuity");
  ["Glücksbärchies", "Sladký domov", "Die Legion"].forEach((name) => {
    analyses
      .filter((analysis) => normalizeExactNameKey(analysis.item.currentName) === normalizeExactNameKey(name))
      .forEach((analysis) => {
        const exactRows = analysis.rows.filter((row) => row.exactName);
        line(`- ${name}: exactRows=${exactRows.length} ${exactRows.map((row) => `${row.oldName}:${row.classification}:matched=${row.matchedMemberCount}:families=${familySummary(row)}`).join("; ") || "none"}`);
      });
  });
  line("Recommendation: exact name + any resolved member core looks reliable for the listed review cases, but exact-only with zero members is a weaker collision class.");
  line("");

  line("## E. Same CoA + Rename");
  analyses
    .filter((analysis) => analysis.rows.some((row) => !row.exactName && row.sameCoA))
    .forEach((analysis) => {
      line(`- ${analysis.item.currentName ?? analysis.item.currentIdentifier}: ${analysis.rows.filter((row) => !row.exactName && row.sameCoA).map((row) => `${row.oldName}:${row.classification}:matched=${row.matchedMemberCount}:oldShare=${pct(row.oldShare)}:newShare=${pct(row.newShare)}:largestSource=${analysis.results[0]?.flowSummary.sources[0]?.name ?? "n/a"}`).join("; ")}`);
    });
  line("Recommendation: same CoA alone remains insufficient. Same CoA + substantial core is useful rename evidence, especially when the chosen identity is not the largest member source.");
  line("");

  line("## F. Leader Difference");
  line(`Candidate relations with different resolved leader in non-ready pool: ${differentLeaderCandidates.length}`);
  differentLeaderCandidates.forEach((row) => line(`- ${row.oldName ?? row.oldGuildIdentifier} -> ${row.raw.newName ?? "current"}: class=${row.classification} matched=${row.matchedMemberCount} families=${familySummary(row)}`));
  line(`Ready candidate relations with different resolved leader: ${readyDifferentLeader.length}`);
  line("Finding: Different leader is emitted as warning evidence. It does not directly hard-reject or cap classification; the positive evidence thresholds determine whether a candidate reaches strong/anchored.");
  line("");

  line("## G. Leadership Positive Evidence");
  candidateRows
    .filter((row) => row.leader === "same" || row.continuedOfficers > 0 || row.leadershipCoreOverlap > 0)
    .forEach((row) => line(`- ${row.oldName ?? row.oldGuildIdentifier}: class=${row.classification} leader=${row.leader} officers=${row.continuedOfficers} core=${row.leadershipCoreOverlap} matched=${row.matchedMemberCount} directGuildEvidence=${bool(rowHasDirectGuildEvidence(row))}`));
  line("Recommendation: leader continuity should remain positive strong evidence, but leader/officer movement without name/CoA/member dominance can still be migration noise.");
  line("");

  line("## H. Candidate-Class Dominance");
  line(`Anchored candidates with weaker competitors in non-ready pool: ${anchoredWeakCompetitors.length}`);
  anchoredWeakCompetitors.forEach((analysis) => {
    const candidates = analysis.rows.filter((row) => row.kind === "identity candidate").map((row) => `${row.oldName ?? row.oldGuildIdentifier}:${row.classification}:matched=${row.matchedMemberCount}:families=${familySummary(row)}`);
    line(`- ${analysis.item.currentName ?? analysis.item.currentIdentifier}: ${candidates.join("; ")}`);
  });
  line("Finding: current status logic treats any remaining actionable identity candidate as convergence (`identityCandidates.length > 1`), so lower-class competitors block an anchored candidate.");
  line("Recommendation: simulate a class hierarchy for final winner selection. Same-class competitors should still block; lower-class competitors should block only when they carry independent strong evidence families or assignment conflict.");
  line("");

  line("## I. Structural Continuity Without Name/CoA");
  analyses.forEach((analysis) => {
    const structuralRows = analysis.rows.filter((row) => !row.exactName && !row.sameCoA && row.matchedMemberCount > 0);
    if (!structuralRows.length) return;
    line(`- ${analysis.item.currentName ?? analysis.item.currentIdentifier}: ${structuralRows.map((row) => {
      const advantage = sourceAdvantage(row);
      return `${row.oldName ?? row.oldGuildIdentifier}:${row.kind}:matched=${row.matchedMemberCount}:oldShare=${pct(row.oldShare)}:newShare=${pct(row.newShare)}:mutual=${bool(row.mutualDominant)}:second=${advantage.second}:ratio=${Number.isFinite(advantage.ratio) ? advantage.ratio.toFixed(2) : "inf"}:delta=${advantage.delta}`;
    }).join("; ")}`);
  });
  line("Recommendation: structural rename evidence should require bidirectional dominance, substantial absolute core, both shares around or above 30%, and a clear runner-up gap. It should only fire when no direct identity candidate exists, so largest-source evidence does not override name/CoA continuity.");
  line("");

  line("## J. GenerationZ Negative Control");
  analyses
    .filter((analysis) => normalizeExactNameKey(analysis.item.currentName).includes("seelen im wandel"))
    .forEach((analysis) => {
      analysis.rows
        .filter((row) => normalizeExactNameKey(row.oldName).includes("exil"))
        .forEach((row) => line(`- current=${analysis.item.currentName} old=${row.oldName} relation=${row.kind} class=${row.classification} matched=${row.matchedMemberCount} oldShare=${pct(row.oldShare)} newShare=${pct(row.newShare)} oldTop=${bool(row.isOldTopDestination)} newTop=${bool(row.isNewTopSource)} mutual=${bool(row.mutualDominant)} leader=${row.leader} officers=${row.continuedOfficers} coa=${bool(row.sameCoA)} exact=${bool(row.exactName)}`));
    });
  analyses
    .filter((analysis) => normalizeExactNameKey(analysis.item.currentName).includes("legion"))
    .forEach((analysis) => {
      analysis.rows
        .filter((row) => normalizeExactNameKey(row.oldName).includes("generationz") || normalizeExactNameKey(row.oldName).includes("die legion"))
        .forEach((row) => line(`- current=${analysis.item.currentName} old=${row.oldName} relation=${row.kind} class=${row.classification} matched=${row.matchedMemberCount} oldShare=${pct(row.oldShare)} newShare=${pct(row.newShare)} oldTop=${bool(row.isOldTopDestination)} newTop=${bool(row.isNewTopSource)} mutual=${bool(row.mutualDominant)} leader=${row.leader} officers=${row.continuedOfficers} coa=${bool(row.sameCoA)} exact=${bool(row.exactName)}`));
    });
  legionZRows
    .filter(({ row }) => normalizeExactNameKey(row.oldName).includes("generationz") || normalizeExactNameKey(row.oldName).includes("die legion"))
    .forEach(({ item, row }) => line(`- current=${item.currentName} status=${item.status} old=${row.oldName} relation=${row.kind} class=${row.classification} matched=${row.matchedMemberCount} oldShare=${pct(row.oldShare)} newShare=${pct(row.newShare)} oldTop=${bool(row.isOldTopDestination)} newTop=${bool(row.isNewTopSource)} mutual=${bool(row.mutualDominant)} leader=${row.leader} officers=${row.continuedOfficers} coa=${bool(row.sameCoA)} exact=${bool(row.exactName)}`));
  line("Target distinction: GenerationZ should remain migration unless it also meets the strict structural rename gate; direct evidence from Die Legion must outrank larger unrelated member movement.");
  line("");

  line("## K. Large Migration-Only Relations");
  bigMigrationRows
    .sort((left, right) => right.matchedMemberCount - left.matchedMemberCount)
    .forEach((row) => line(`- ${row.oldName ?? row.oldGuildIdentifier} -> ${row.raw.newName ?? "current"}: matched=${row.matchedMemberCount} oldShare=${pct(row.oldShare)} newShare=${pct(row.newShare)} mutual=${bool(row.mutualDominant)} exact=${bool(row.exactName)} coa=${bool(row.sameCoA)} leader=${row.leader} families=${familySummary(row)}`));
  if (!bigMigrationRows.length) line("- none");
  line("");

  line("## L. Evidence Family Audit");
  line(`Plausible candidates with 2+ independent families: ${plausibleMultiFamily.length}`);
  plausibleMultiFamily.forEach((row) => line(`- ${row.oldName ?? row.oldGuildIdentifier}: matched=${row.matchedMemberCount} families=${familySummary(row)} evidence=[${evidenceText(row.evidenceEntries)}]`));
  line(`Strong/anchored candidates with only 1 family: ${strongOneFamily.length}`);
  strongOneFamily.forEach((row) => line(`- ${row.oldName ?? row.oldGuildIdentifier}: class=${row.classification} families=${familySummary(row)} evidence=[${evidenceText(row.evidenceEntries)}]`));
  line("");

  line("## M. Variant Summary");
  ["A", "B", "C", "D", "E"].forEach((key) => {
    const ready = analyses.filter((analysis) => analysis.variants.find((variant) => variant.key === key)?.simulatedStatus === "ready");
    line(`Variant ${key}: simulated ready=${ready.length}/${analyses.length} -> ${ready.map((analysis) => `${analysis.item.currentName ?? analysis.item.currentIdentifier}:${analysis.variants.find((variant) => variant.key === key)?.winner?.oldName ?? "none"}`).join(", ") || "none"}`);
  });
  line("Ready-control check: all variants are evaluated only on current non-ready guilds here; they do not alter the existing 19 ready records. A production change should still include a full ready-regression assertion.");
  line("");

  line("## N. V3.1 Recommendations");
  line("1. Do not use largest member source as identity. Dead End -> Erben im Wandel remains the guardrail.");
  line("2. Add a relevant-competitor concept before final status: lower-class candidates should not automatically block anchored winners.");
  line("3. Consider upgrading unique exact name + member continuity to strong when there is no same/equal-class competitor.");
  line("4. Consider same CoA + substantial member core as strong rename evidence when no direct-name competitor exists.");
  line("5. Add structural rename as a narrow gate: substantial absolute core, both shares around 30%+, mutual dominance, clear runner-up gap, and no direct identity candidate on the current guild.");
  line("6. Keep Different resolved leader as warning/neutral; it should not cap otherwise strong Guild continuity.");
  line("7. Keep leader continuity positive, but audit leader-only strong candidates against migration false controls before auto-ready.");

  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${REPORT_PATH}`);
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(`guild-v31-player-${suffix}`);
  await deleteDB(`guild-v31-guild-${suffix}`);
}
