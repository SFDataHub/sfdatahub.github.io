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
  resolveGuildFusions,
  type GuildFusionCandidate,
  type GuildFusionGuildResult,
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
  type PlayerFusionObservation,
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

type ControlPair = {
  key: string;
  label: string;
  kind: "positive" | "negative";
  oldId?: string;
  newId?: string;
  oldName?: string;
  oldServer?: string;
  newName?: string;
};

type LeadershipEvidence = {
  oldLeader: string | null;
  newLeader: string | null;
  oldLeaderResolved: boolean;
  newLeaderResolved: boolean;
  sameLogicalLeader: boolean | null;
  oldOfficerCount: number;
  newOfficerCount: number;
  oldOfficerResolvedCount: number;
  newOfficerResolvedCount: number;
  continuedOfficers: number;
  leadershipCoreOverlap: number;
};

type SimulatedGuildClassification = "anchored" | "strong" | "plausible" | "weak" | "rejected";

type GuildCoverage = {
  total: number;
  resolved: number;
  leaderTotal: number;
  leaderResolved: number;
  officerTotal: number;
  officerResolved: number;
  memberTotal: number;
  memberResolved: number;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/guild-evidence-v3-analysis.latest.txt");
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const PROGRESSION_FIELDS = [
  "treasure",
  "instructor",
  "knights",
  "raid",
  "portalFloor",
  "hydra",
  "guildPet",
  "honor",
  "rank",
] as const;

const CONTROL_PAIRS: ControlPair[] = [
  { key: "magic", label: "Magic Mushrooms", kind: "positive", oldId: "eu1_g8", newId: "f28_g6" },
  { key: "hangover", label: "Hangover", kind: "positive", oldId: "eu1_g43", newId: "f28_g32" },
  { key: "armia", label: "ARMIA POLSKA", kind: "positive", oldName: "ARMIA POLSKA", oldServer: "EU3", newName: "ARMIA POLSKA" },
  { key: "dead-end", label: "Dead End -> Erben im Wandel", kind: "positive", oldId: "eu4_g14", newId: "f28_g14265" },
  { key: "legion", label: "Die Legion -> Legion Z", kind: "positive", oldId: "eu3_g4877", newId: "f28_g15060" },
  { key: "kneipos", label: "Los Kneipos", kind: "positive", oldId: "eu2_g469", newId: "f28_g5741" },
  { key: "lotus", label: "Der weiße Lotus", kind: "positive", oldId: "eu3_g2087", newId: "f28_g10394" },
  { key: "genz-legion", label: "GenerationZ -> Legion Z", kind: "negative", oldId: "eu4_g1352", newId: "f28_g15060" },
  { key: "genz-erben", label: "GenerationZ -> Erben im Wandel", kind: "negative", oldId: "eu4_g1352", newId: "f28_g14265" },
  { key: "dead-legion", label: "Dead End -> Legion Z", kind: "negative", oldId: "eu4_g14", newId: "f28_g15060" },
];

const lines: string[] = [];
const line = (value = "") => lines.push(value);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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
  const raw = String(identifier ?? "").trim().toLowerCase();
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
  const raw = String(identifier ?? "").trim().toLowerCase();
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

const sameGuildIdentifier = (left: string | null | undefined, right: string | null | undefined) => {
  const rightAliases = new Set(guildIdentifierAliases(right));
  return guildIdentifierAliases(left).some((alias) => rightAliases.has(alias));
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
    const key = normalizeKey(observation.guildIdentifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const findGuildObservationById = (
  groups: Map<string, GuildFusionObservation[]>,
  identifier: string | null | undefined,
  mode: "first" | "latest",
) => {
  const observations = guildIdentifierAliases(identifier).flatMap((alias) => groups.get(alias) ?? []);
  return mode === "first" ? firstByTimestamp(observations) : latestByTimestamp(observations);
};

const findGuildObservationByName = (
  observations: GuildFusionObservation[],
  name: string | null | undefined,
  serverCode: string | null | undefined,
  mode: "first" | "latest",
) => {
  const nameKey = normalizeName(name);
  const matches = observations.filter(
    (observation) =>
      normalizeName(observation.name) === nameKey &&
      (!serverCode || resolveServerCode(observation.serverCode) === serverCode),
  );
  return mode === "first" ? firstByTimestamp(matches) : latestByTimestamp(matches);
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
      playerIdentifierAliases(item.currentIdentifier).forEach((alias) => logicalPlayerByIdentifier.set(normalizeKey(alias), logical));
      if (item.readyCandidateIdentifier) {
        playerIdentifierAliases(item.readyCandidateIdentifier).forEach((alias) => logicalPlayerByIdentifier.set(normalizeKey(alias), logical));
      }
      item.completedAliases.forEach((alias) =>
        playerIdentifierAliases(alias).forEach((resolvedAlias) => logicalPlayerByIdentifier.set(normalizeKey(resolvedAlias), logical)),
      );
    });
  return logicalPlayerByIdentifier;
};

const memberLogicalId = (member: NormalizedGuildMember | null | undefined, logicalPlayerByIdentifier: Map<string, string>) =>
  member?.identity.playerIdentifier
    ? playerIdentifierAliases(member.identity.playerIdentifier)
        .map((alias) => logicalPlayerByIdentifier.get(normalizeKey(alias)) ?? null)
        .find((value): value is string => Boolean(value)) ?? null
    : null;

const memberLabel = (member: NormalizedGuildMember | null | undefined) =>
  member?.identity.name ?? member?.identity.playerIdentifier ?? null;

const evaluateLeadership = (
  oldGuild: NormalizedGuild | null,
  newGuild: NormalizedGuild | null,
  logicalPlayerByIdentifier: Map<string, string>,
): LeadershipEvidence => {
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
    oldLeaderResolved: Boolean(oldLeaderLogical),
    newLeaderResolved: Boolean(newLeaderLogical),
    sameLogicalLeader: oldLeaderLogical && newLeaderLogical ? oldLeaderLogical === newLeaderLogical : null,
    oldOfficerCount: (oldGuild?.members ?? []).filter((member) => member.role.name === "officer").length,
    newOfficerCount: (newGuild?.members ?? []).filter((member) => member.role.name === "officer").length,
    oldOfficerResolvedCount: oldOfficerLogical.size,
    newOfficerResolvedCount: newOfficerLogical.size,
    continuedOfficers: [...oldOfficerLogical].filter((officer) => newOfficerLogical.has(officer)).length,
    leadershipCoreOverlap: [...oldCore].filter((entry) => newCore.has(entry)).length,
  };
};

const calculateGuildCoverage = (
  guild: NormalizedGuild | null,
  logicalPlayerByIdentifier: Map<string, string>,
): GuildCoverage => {
  const members = guild?.members ?? [];
  const resolvedMembers = members.filter((member) => Boolean(memberLogicalId(member, logicalPlayerByIdentifier)));
  const leaders = members.filter((member) => member.role.name === "leader");
  const officers = members.filter((member) => member.role.name === "officer");
  const normalMembers = members.filter((member) => member.role.name === "member");
  return {
    total: members.length,
    resolved: resolvedMembers.length,
    leaderTotal: leaders.length,
    leaderResolved: leaders.filter((member) => Boolean(memberLogicalId(member, logicalPlayerByIdentifier))).length,
    officerTotal: officers.length,
    officerResolved: officers.filter((member) => Boolean(memberLogicalId(member, logicalPlayerByIdentifier))).length,
    memberTotal: normalMembers.length,
    memberResolved: normalMembers.filter((member) => Boolean(memberLogicalId(member, logicalPlayerByIdentifier))).length,
  };
};

const aggregateCoverage = (coverages: GuildCoverage[]): GuildCoverage =>
  coverages.reduce(
    (sum, coverage) => ({
      total: sum.total + coverage.total,
      resolved: sum.resolved + coverage.resolved,
      leaderTotal: sum.leaderTotal + coverage.leaderTotal,
      leaderResolved: sum.leaderResolved + coverage.leaderResolved,
      officerTotal: sum.officerTotal + coverage.officerTotal,
      officerResolved: sum.officerResolved + coverage.officerResolved,
      memberTotal: sum.memberTotal + coverage.memberTotal,
      memberResolved: sum.memberResolved + coverage.memberResolved,
    }),
    { total: 0, resolved: 0, leaderTotal: 0, leaderResolved: 0, officerTotal: 0, officerResolved: 0, memberTotal: 0, memberResolved: 0 },
  );

const formatCoverage = (coverage: GuildCoverage) =>
  `members=${coverage.resolved}/${coverage.total} (${pct(coverage.total ? coverage.resolved / coverage.total : null)}) leaders=${coverage.leaderResolved}/${coverage.leaderTotal} officers=${coverage.officerResolved}/${coverage.officerTotal} normal=${coverage.memberResolved}/${coverage.memberTotal}`;

const guildProgressionSummary = (guild: NormalizedGuild | null) => {
  if (!guild) return null;
  return {
    treasure: guild.bonuses.totalTreasure,
    instructor: guild.bonuses.totalInstructor,
    knights: guild.totals.totalKnights,
    raid: guild.combatProgress.raid,
    portalFloor: guild.combatProgress.portal.floor,
    hydra: guild.combatProgress.hydra.level,
    guildPet: guild.combatProgress.pet.level,
    honor: guild.progression.honor,
    rank: guild.progression.rank,
  } satisfies Record<(typeof PROGRESSION_FIELDS)[number], number | null>;
};

const progressionAvailability = (guilds: NormalizedGuild[]) => {
  const rows = PROGRESSION_FIELDS.map((field) => {
    const values = guilds.map((guild) => guildProgressionSummary(guild)?.[field] ?? null).filter((value): value is number => value != null);
    const distinct = new Set(values.map(String));
    const mostCommon = [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<number, number>())]
      .sort((left, right) => right[1] - left[1])[0] ?? null;
    return {
      field,
      available: values.length,
      distinct: distinct.size,
      mostCommon: mostCommon ? `${mostCommon[0]} (${mostCommon[1]})` : "n/a",
    };
  });
  return rows;
};

const compareProgression = (oldGuild: NormalizedGuild | null, newGuild: NormalizedGuild | null) => {
  const oldProgress = guildProgressionSummary(oldGuild);
  const newProgress = guildProgressionSummary(newGuild);
  const stableOrNonDecreasing = PROGRESSION_FIELDS.filter((field) => {
    const oldValue = oldProgress?.[field] ?? null;
    const newValue = newProgress?.[field] ?? null;
    return oldValue != null && newValue != null && newValue >= oldValue;
  });
  const regressions = PROGRESSION_FIELDS.filter((field) => {
    const oldValue = oldProgress?.[field] ?? null;
    const newValue = newProgress?.[field] ?? null;
    return oldValue != null && newValue != null && newValue < oldValue;
  });
  return { oldProgress, newProgress, stableOrNonDecreasing, regressions };
};

const simulateGuildClassification = (
  candidate: GuildFusionCandidate | null,
  leadership: LeadershipEvidence,
): SimulatedGuildClassification => {
  if (!candidate) return "rejected";
  const hasDirectIdentity = candidate.exactName || candidate.sameCoA || leadership.sameLogicalLeader === true || leadership.leadershipCoreOverlap > 0;
  const strongFlow = candidate.mutualDominant && candidate.matchedMemberCount >= 3;
  if (candidate.exactName && candidate.sameCoA && strongFlow) return "anchored";
  if (candidate.exactName && strongFlow) return "strong";
  if (candidate.sameCoA && (strongFlow || leadership.leadershipCoreOverlap > 0)) return "strong";
  if (leadership.sameLogicalLeader === true || leadership.continuedOfficers >= 2) return "strong";
  if (hasDirectIdentity || strongFlow) return "plausible";
  if (candidate.matchedMemberCount > 0) return "weak";
  return "rejected";
};

const formatLeadership = (leadership: LeadershipEvidence) =>
  `leader=${leadership.sameLogicalLeader == null ? "n/a" : leadership.sameLogicalLeader ? "same" : "different"} oldLeader=${leadership.oldLeader ?? "n/a"} newLeader=${leadership.newLeader ?? "n/a"} officers=${leadership.continuedOfficers}/${leadership.oldOfficerResolvedCount}->${leadership.newOfficerResolvedCount} coreOverlap=${leadership.leadershipCoreOverlap}`;

const formatCandidate = (candidate: GuildFusionCandidate | null) => {
  if (!candidate) return "candidate=missing";
  return [
    `candidate=${candidate.oldGuildIdentifier}`,
    `oldName=${candidate.oldName ?? "n/a"}`,
    `matched=${candidate.matchedMemberCount}`,
    `oldShare=${pct(candidate.oldShare)}`,
    `newShare=${pct(candidate.newShare)}`,
    `exact=${candidate.exactName}`,
    `coa=${candidate.sameCoA}`,
    `mutual=${candidate.mutualDominant}`,
    `auto=${candidate.autoEligible}`,
    `review=${candidate.reviewRequired}`,
    `split=${candidate.splitEvidence.relevant}`,
    `convergence=${candidate.convergenceEvidence.relevant}`,
  ].join(" ");
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
assert.ok(snapshots.length > 0, "expected real scan snapshots");

const suffix = Date.now();
const playerStore = createPlayerIdentityStore({ dbName: `guild-v3-player-${suffix}` });
const guildStore = createGuildIdentityStore({ dbName: `guild-v3-guild-${suffix}` });

try {
  const bundles = snapshots.map(createScanBundle);
  const allGuilds = bundles.flatMap((bundle) => bundle.normalizedGuilds);
  const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
  const logicalPlayerByIdentifier = createLogicalPlayerMap(report.items);
  const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
  const historicalPlayerObservations = allPlayerObservations.filter((observation) => ORIGIN_CODES.has(resolveServerCode(observation.server) ?? ""));
  const currentPlayerObservations = allPlayerObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
  const playerResult = resolvePlayerFusions({ historicalObservations: historicalPlayerObservations, newObservations: currentPlayerObservations });
  const currentPlayerById = new Map(currentPlayerObservations.map((observation) => [normalizeKey(observation.identifier), observation]));
  const highConfidencePlayerMatches: GuildFusionPlayerMatch[] = playerResult.results.flatMap((result) => {
    const candidate = selectPlayerFusionReadyCandidates(result)[0] ?? null;
    const newObservation = currentPlayerById.get(normalizeKey(result.newIdentifier)) ?? null;
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
  const guildResult = resolveGuildFusions({
    historicalGuildObservations,
    newGuildObservations: currentGuildObservations,
    highConfidencePlayerMatches,
  });
  const guildResultsByNewId = new Map<string, GuildFusionGuildResult>();
  guildResult.results.forEach((result) => {
    guildIdentifierAliases(result.newGuild.guildIdentifier).forEach((alias) => guildResultsByNewId.set(normalizeKey(alias), result));
  });
  const findGuildResultByHistoricalId = (historicalIdentifier: string | null | undefined) => {
    if (!historicalIdentifier) return null;
    return (
      guildResult.results
        .filter((result) =>
          result.identityCandidates.some((candidate) => sameGuildIdentifier(candidate.oldGuildIdentifier, historicalIdentifier)),
        )
        .sort((left, right) => {
          const leftCandidate = left.identityCandidates.find((candidate) => sameGuildIdentifier(candidate.oldGuildIdentifier, historicalIdentifier));
          const rightCandidate = right.identityCandidates.find((candidate) => sameGuildIdentifier(candidate.oldGuildIdentifier, historicalIdentifier));
          return (
            Number(rightCandidate?.autoEligible ?? false) - Number(leftCandidate?.autoEligible ?? false) ||
            (rightCandidate?.matchedMemberCount ?? 0) - (leftCandidate?.matchedMemberCount ?? 0) ||
            left.newGuild.guildIdentifier.localeCompare(right.newGuild.guildIdentifier, undefined, { numeric: true, sensitivity: "base" })
          );
        })[0] ?? null
    );
  };
  const guildItems = report.items.filter((item) => item.entityType === "guild");
  const reviewGuilds = guildItems.filter((item) => item.status === "review");
  const readyGuilds = guildItems.filter((item) => item.status === "ready");
  const statusCounts = guildItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  const firstPostTimestamp = Math.min(...currentGuildObservations.map((guild) => guild.timestamp).filter(Number.isFinite));
  const latestHistoricalGuilds = [...historicalGuildGroups.values()]
    .map((observations) => latestByTimestamp(observations.filter((observation) => observation.timestamp < firstPostTimestamp)))
    .filter((observation): observation is GuildFusionObservation => Boolean(observation));
  const firstCurrentGuilds = [...currentGuildGroups.values()]
    .map((observations) => firstByTimestamp(observations))
    .filter((observation): observation is GuildFusionObservation => Boolean(observation));
  const historicalNameCounts = latestHistoricalGuilds.reduce((map, guild) => {
    const key = normalizeName(guild.name);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const currentExactNameHits = firstCurrentGuilds
    .map((guild) => historicalNameCounts.get(normalizeName(guild.name)) ?? 0)
    .filter((count) => count > 0);
  const historicalCoaCounts = latestHistoricalGuilds.reduce((map, guild) => {
    const key = normalizeKey(guild.coa);
    if (key) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const currentCoaHits = firstCurrentGuilds
    .map((guild) => historicalCoaCounts.get(normalizeKey(guild.coa)) ?? 0)
    .filter((count) => count > 0);
  const historicalNameCoaCounts = latestHistoricalGuilds.reduce((map, guild) => {
    const key = `${normalizeName(guild.name)}::${normalizeKey(guild.coa)}`;
    if (!key.startsWith("::") && !key.endsWith("::")) map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
  const currentNameCoaHits = firstCurrentGuilds
    .map((guild) => historicalNameCoaCounts.get(`${normalizeName(guild.name)}::${normalizeKey(guild.coa)}`) ?? 0)
    .filter((count) => count > 0);
  const latestHistoricalNormalizedGuilds = latestHistoricalGuilds
    .map((guild) => findNormalizedGuildAcrossBundles(bundles, guild.guildIdentifier, { before: firstPostTimestamp, latest: true }))
    .filter((guild): guild is NormalizedGuild => Boolean(guild));
  const firstCurrentNormalizedGuilds = firstCurrentGuilds
    .map((guild) => findNormalizedGuildAcrossBundles(bundles, guild.guildIdentifier, { after: guild.timestamp, latest: false }))
    .filter((guild): guild is NormalizedGuild => Boolean(guild));
  const historicalCoverage = aggregateCoverage(latestHistoricalNormalizedGuilds.map((guild) => calculateGuildCoverage(guild, logicalPlayerByIdentifier)));
  const currentCoverage = aggregateCoverage(firstCurrentNormalizedGuilds.map((guild) => calculateGuildCoverage(guild, logicalPlayerByIdentifier)));

  const pairRows = CONTROL_PAIRS.map((pair) => {
    const historicalObservation =
      findGuildObservationById(historicalGuildGroups, pair.oldId, "latest") ??
      findGuildObservationByName(historicalGuildObservations, pair.oldName ?? pair.label, pair.oldServer ?? null, "latest");
    const fallbackResult = findGuildResultByHistoricalId(historicalObservation?.guildIdentifier);
    const currentObservation =
      findGuildObservationById(currentGuildGroups, pair.newId, "first") ??
      findGuildObservationByName(currentGuildObservations, pair.newName ?? pair.label, TARGET_CODE, "first") ??
      fallbackResult?.newGuild ??
      null;
    const result = currentObservation ? guildResultsByNewId.get(normalizeKey(currentObservation.guildIdentifier)) ?? fallbackResult : fallbackResult;
    const candidate = result?.identityCandidates.find((entry) =>
      historicalObservation ? sameGuildIdentifier(entry.oldGuildIdentifier, historicalObservation.guildIdentifier) : false,
    ) ?? null;
    const migration = result?.memberMigrationEdges.find((entry) =>
      historicalObservation ? sameGuildIdentifier(entry.oldGuildIdentifier, historicalObservation.guildIdentifier) : false,
    ) ?? null;
    const currentGuild = currentObservation
      ? findNormalizedGuildAcrossBundles(bundles, currentObservation.guildIdentifier, { after: currentObservation.timestamp, latest: false })
      : null;
    const historicalGuild = historicalObservation && currentObservation
      ? findNormalizedGuildAcrossBundles(bundles, historicalObservation.guildIdentifier, { before: currentObservation.timestamp, latest: true })
      : null;
    const leadership = evaluateLeadership(historicalGuild, currentGuild, logicalPlayerByIdentifier);
    const progression = compareProgression(historicalGuild, currentGuild);
    const classification = simulateGuildClassification(candidate, leadership);
    const managementItem = currentObservation
      ? guildItems.find((item) => normalizeKey(item.currentIdentifier) === normalizeKey(currentObservation.guildIdentifier)) ?? null
      : null;
    return { pair, currentObservation, historicalObservation, result, candidate, migration, leadership, progression, classification, managementItem };
  });
  const positiveRows = pairRows.filter((row) => row.pair.kind === "positive");
  const negativeRows = pairRows.filter((row) => row.pair.kind === "negative");
  const countRows = (rows: typeof pairRows, predicate: (row: (typeof pairRows)[number]) => boolean) => rows.filter(predicate).length;
  const directIdentityRows = pairRows.filter((row) => row.candidate);
  const migrationOnlyRows = pairRows.filter((row) => !row.candidate && row.migration);

  const armia = pairRows.find((row) => row.pair.key === "armia") ?? null;
  const armiaMigrationEdges = armia?.historicalObservation
    ? guildResult.results
        .flatMap((result) =>
          result.memberMigrationEdges
            .filter((edge) => sameGuildIdentifier(edge.oldGuildIdentifier, armia.historicalObservation?.guildIdentifier))
            .map((edge) => ({ result, edge })),
        )
        .sort((left, right) => right.edge.matchedMemberCount - left.edge.matchedMemberCount)
    : [];
  const historicalCandidateClaimCounts = guildResult.results
    .flatMap((result) => result.identityCandidates)
    .reduce((map, candidate) => {
      const key = normalizeKey(candidate.oldGuildIdentifier);
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>());
  const duplicatedHistoricalClaims = [...historicalCandidateClaimCounts.entries()].filter(([, count]) => count > 1);
  const reviewSimulation = reviewGuilds.map((item) => {
    const result = guildResultsByNewId.get(normalizeKey(item.currentIdentifier)) ?? null;
    const candidateAnalyses = item.candidates
      .filter((candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> => candidate.entityType === "guild")
      .map((candidate) => {
        const evidence = candidate.evidence;
        const currentGuild = findNormalizedGuildAcrossBundles(bundles, evidence.newGuildIdentifier, { after: item.firstSeen, latest: false });
        const oldGuild = findNormalizedGuildAcrossBundles(bundles, evidence.oldGuildIdentifier, { before: item.firstSeen, latest: true });
        const leadership = evaluateLeadership(oldGuild, currentGuild, logicalPlayerByIdentifier);
        const classification = simulateGuildClassification(evidence, leadership);
        return { candidate, leadership, classification, currentCoverage: calculateGuildCoverage(currentGuild, logicalPlayerByIdentifier), oldCoverage: calculateGuildCoverage(oldGuild, logicalPlayerByIdentifier) };
      });
    const classifications = candidateAnalyses.map((entry) => entry.classification);
    return { item, result, candidateAnalyses, classifications };
  });
  const reviewGroups = reviewSimulation.reduce<Record<string, number>>((counts, entry) => {
    const anchoredCount = entry.classifications.filter((value) => value === "anchored").length;
    const strongCount = entry.classifications.filter((value) => value === "anchored" || value === "strong").length;
    const plausibleCount = entry.classifications.filter((value) => value === "plausible").length;
    const weakCount = entry.classifications.filter((value) => value === "weak").length;
    const assignmentConflict = Boolean(entry.result?.splitCandidate || entry.result?.convergenceCandidate || entry.item.reasonCodes.includes("assignment-conflict"));
    const group =
      assignmentConflict
        ? "assignment conflict"
        : anchoredCount > 1
          ? "multiple anchored"
          : strongCount > 1
            ? "multiple strong"
            : strongCount === 1
              ? "single strong"
              : plausibleCount > 0
                ? "only plausible"
                : weakCount > 0
                  ? "only weak"
                  : "rejected";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
  const candidateClassCounts = guildItems
    .flatMap((item) =>
      item.candidates
        .filter((candidate): candidate is Extract<FusionIdentityCandidate, { entityType: "guild" }> => candidate.entityType === "guild")
        .map((candidate) => {
          const currentGuild = findNormalizedGuildAcrossBundles(bundles, candidate.evidence.newGuildIdentifier, { after: item.firstSeen, latest: false });
          const oldGuild = findNormalizedGuildAcrossBundles(bundles, candidate.evidence.oldGuildIdentifier, { before: item.firstSeen, latest: true });
          return simulateGuildClassification(candidate.evidence, evaluateLeadership(oldGuild, currentGuild, logicalPlayerByIdentifier));
        }),
    )
    .reduce<Record<SimulatedGuildClassification, number>>(
      (counts, classification) => {
        counts[classification] = (counts[classification] ?? 0) + 1;
        return counts;
      },
      { anchored: 0, strong: 0, plausible: 0, weak: 0, rejected: 0 },
    );
  const simulatedPromotable = reviewSimulation.filter(
    (entry) =>
      entry.classifications.filter((value) => value === "anchored" || value === "strong").length === 1 &&
      entry.item.candidates.length === 1 &&
      !entry.result?.splitCandidate &&
      !entry.result?.convergenceCandidate,
  );

  line("# Guild Evidence V3 Analysis");
  line("");
  line(`Generated: ${new Date().toISOString()}`);
  line("");

  line("## A. Dataset");
  line(`Scans loaded: ${snapshots.length}`);
  line(`Scope: ${report.scope.label}`);
  line(`Historical snapshots: ${report.scope.historicalSnapshotCount}, post-fusion snapshots: ${report.scope.postFusionSnapshotCount}`);
  line(`Fusion boundary used by V2 fallback: latest historical < earliest post-fusion observation; earliest post-fusion guild timestamp=${formatDate(firstPostTimestamp)}`);
  line(`Current F28 guilds: ${firstCurrentGuilds.length}`);
  line(`Historical latest-pre-fusion guilds: ${latestHistoricalGuilds.length}`);
  line(`Guild management status: ready=${statusCounts.ready ?? 0} review=${statusCounts.review ?? 0} unresolved=${statusCounts.unresolved ?? 0} noHistoricalObservation=${statusCounts.noHistoricalObservation ?? 0} noHistory=${statusCounts.noHistory ?? 0} completed=${statusCounts.completed ?? 0}`);
  line(`High-confidence player matches passed to Guild V2 resolver: ${highConfidencePlayerMatches.length}`);
  line("");

  line("## B. Player Identity Coverage");
  line(`Ready/completed logical player IDs usable for guild evidence: ${logicalPlayerByIdentifier.size}`);
  line(`Latest historical guild coverage: ${formatCoverage(historicalCoverage)}`);
  line(`Earliest current guild coverage: ${formatCoverage(currentCoverage)}`);
  line("Only Ready/Completed player identities are counted. Plausible/weak player candidates are intentionally excluded from guild evidence.");
  line("");

  line("## C. Current Guild-V2 Pipeline");
  line("1. Current and historical guild observations are grouped by physical guild identifier.");
  line("2. V2 selects the latest historical observation before the earliest post-fusion guild timestamp and current F28 observations.");
  line("3. High-confidence Player identities build old-member -> new-member flow edges.");
  line("4. Identity candidates are created when exact name, same CoA, or sufficiently large mutual-dominant member flow exists.");
  line("5. Other member flows remain memberMigrationEdges.");
  line("6. split/convergence are derived from old/new top-flow conflicts.");
  line("7. autoEligible requires exact name + same CoA + mutual dominant flow + at least 3 matched players + no assignment conflict.");
  line("8. Management ready is currently equivalent to one active autoEligible guild identity; otherwise active identity candidates become review.");
  line("9. Management does recompute after reservation cleanup, but it only promotes candidates whose existing `ready` flag is true. For guilds, that flag is still the strict V2 autoEligible predicate, not a V3 evidence classification.");
  line("");

  line("## D. Exact Guild Name");
  line(`Current guilds with historical exact-name hit: ${currentExactNameHits.length}/${firstCurrentGuilds.length}`);
  line(`Current guilds with multiple historical exact-name hits: ${currentExactNameHits.filter((count) => count > 1).length}`);
  line(`Positive controls with exact-name candidate evidence: ${countRows(positiveRows, (row) => Boolean(row.candidate?.exactName))}/${positiveRows.length}`);
  line(`Negative controls with exact-name candidate evidence: ${countRows(negativeRows, (row) => Boolean(row.candidate?.exactName))}/${negativeRows.length}`);
  line("Recommendation: exact guild name is support/strongSupport when paired with flow or CoA, but not a standalone identity anchor.");
  line("");

  line("## E. CoA");
  line(`Current guilds with historical same-CoA hit: ${currentCoaHits.length}/${firstCurrentGuilds.length}`);
  line(`Current guilds with multiple historical same-CoA hits: ${currentCoaHits.filter((count) => count > 1).length}`);
  line(`Current guilds with historical exact-name + same-CoA hit: ${currentNameCoaHits.length}/${firstCurrentGuilds.length}`);
  line(`Current guilds with multiple exact-name + same-CoA hits: ${currentNameCoaHits.filter((count) => count > 1).length}`);
  line(`Positive controls with same-CoA candidate evidence: ${countRows(positiveRows, (row) => Boolean(row.candidate?.sameCoA))}/${positiveRows.length}`);
  line(`Negative controls with same-CoA candidate evidence: ${countRows(negativeRows, (row) => Boolean(row.candidate?.sameCoA))}/${negativeRows.length}`);
  line("Recommendation: same CoA is support only. CoA changes exist in positive controls, and CoA collision/borrowed continuity can occur.");
  line("");

  line("## F. Leader Continuity");
  line(`Positive controls with same resolved leader: ${countRows(positiveRows, (row) => row.leadership.sameLogicalLeader === true)}/${positiveRows.length}`);
  line(`Positive controls with unresolved leader comparison: ${countRows(positiveRows, (row) => row.leadership.sameLogicalLeader == null)}/${positiveRows.length}`);
  line(`Negative controls with same resolved leader: ${countRows(negativeRows, (row) => row.leadership.sameLogicalLeader === true)}/${negativeRows.length}`);
  line("Leader continuity is high-value strongSupport when resolved. Different leader should remain warning/neutral, not hard reject, because leadership can change and migration can move officers without preserving guild identity.");
  line("");

  line("## G. Officer / Leadership Core");
  line(`Positive controls with officer/core overlap: ${countRows(positiveRows, (row) => row.leadership.leadershipCoreOverlap > 0)}/${positiveRows.length}`);
  line(`Negative controls with officer/core overlap: ${countRows(negativeRows, (row) => row.leadership.leadershipCoreOverlap > 0)}/${negativeRows.length}`);
  line("Officer/core continuity should be support/strongSupport by overlap size, but not a standalone Ready gate: one negative migration control also carries officer/core overlap.");
  line("");

  line("## H. Member Flow");
  line(`Ground-truth rows with identity candidate: ${directIdentityRows.length}/${pairRows.length}`);
  line(`Ground-truth rows represented only as migration edge: ${migrationOnlyRows.length}/${pairRows.length}`);
  line(`Positive controls with mutual dominant candidate flow: ${countRows(positiveRows, (row) => Boolean(row.candidate?.mutualDominant))}/${positiveRows.length}`);
  line(`Negative controls with migration flow but no identity candidate: ${countRows(negativeRows, (row) => !row.candidate && Boolean(row.migration))}/${negativeRows.length}`);
  line("Member flow is necessary evidence for many cases, but it must remain separate from identity. Dead End and GenerationZ demonstrate that largest or large flow is not the same as guild identity.");
  line("");

  line("## I. Guild Progression");
  progressionAvailability(allGuilds).forEach((row) => {
    line(`- ${row.field}: available=${row.available}/${allGuilds.length} distinct=${row.distinct} mostCommon=${row.mostCommon}`);
  });
  line("Recommendation: guild progression is weakSupport/support only. Bonuses, portal, and knights are heavily maxed/colliding; honor, rank, hydra, pet level are useful sanity context but not hard requirements.");
  line("");

  line("## J. Ground Truth Matrix");
  line("| Pair | Kind | Current | Historical | V2 result | V2 relation | Sim V3 | Exact | CoA | Leader | Officers | Core | Members | Mutual | Progression |");
  line("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |");
  pairRows.forEach((row) => {
    const relation = row.candidate ? "identityCandidate" : row.migration ? "migrationEdge" : "none";
    line(
      `| ${row.pair.label} | ${row.pair.kind} | ${row.currentObservation?.guildIdentifier ?? "missing"} | ${row.historicalObservation?.guildIdentifier ?? "missing"} | ${row.managementItem?.status ?? row.result?.status ?? "missing"} | ${relation} | ${row.classification} | ${row.candidate?.exactName ?? false} | ${row.candidate?.sameCoA ?? false} | ${row.leadership.sameLogicalLeader == null ? "n/a" : row.leadership.sameLogicalLeader ? "same" : "different"} | ${row.leadership.continuedOfficers}/${row.leadership.oldOfficerResolvedCount} | ${row.leadership.leadershipCoreOverlap} | ${row.candidate?.matchedMemberCount ?? row.migration?.matchedMemberCount ?? 0} | ${row.candidate?.mutualDominant ?? row.migration?.mutualDominant ?? false} | ok=${row.progression.stableOrNonDecreasing.length} regress=${row.progression.regressions.length} |`,
    );
  });
  line("");

  line("## K. ARMIA POLSKA");
  if (armia) {
    const rawCandidateCount = armia.result?.identityCandidates.length ?? 0;
    const visibleCandidates = armia.managementItem?.candidates.length ?? 0;
    const migrationEdges = armia.result?.memberMigrationEdges.length ?? 0;
    const pipeline = armia.managementItem?.diagnostics?.candidatePipeline ?? null;
    line(`Current: ${armia.currentObservation?.guildIdentifier ?? "missing"} ${armia.currentObservation?.name ?? "missing"} first=${formatDate(armia.currentObservation?.timestamp)}`);
    line(`Historical: ${armia.historicalObservation?.guildIdentifier ?? "missing"} ${armia.historicalObservation?.name ?? "missing"} latest=${formatDate(armia.historicalObservation?.timestamp)}`);
    line(`Generated identity candidates=${rawCandidateCount}, visible candidates after management filtering/reservation=${visibleCandidates}, migrationEdges=${migrationEdges}`);
    line(`Pipeline counts: initial=${pipeline?.candidatesGeneratedInitially ?? "n/a"} afterExclusions=${pipeline?.candidatesAfterExclusions ?? "n/a"} afterReservations=${pipeline?.candidatesAfterReservations ?? "n/a"} final=${pipeline?.finalCandidates ?? "n/a"}`);
    line(`Resolver status=${armia.result?.status ?? "missing"}, management status=${armia.managementItem?.status ?? "missing"}, reason=${armia.managementItem?.reasons.join(" | ") || armia.result?.reasons.join(" | ") || "none"}`);
    line(formatCandidate(armia.candidate));
    line(formatLeadership(armia.leadership));
    line(`progression old=${JSON.stringify(armia.progression.oldProgress)} new=${JSON.stringify(armia.progression.newProgress)} nonDecreasing=${armia.progression.stableOrNonDecreasing.join(",") || "none"} regressions=${armia.progression.regressions.join(",") || "none"}`);
    line(`Simulated V3 classification=${armia.classification}; simulated ready=${armia.classification === "strong" || armia.classification === "anchored" ? "yes, if assignment-free and sole strong/anchored candidate" : "no"}`);
    line(`Migration edges from historical ARMIA in loaded scans: ${armiaMigrationEdges.length ? armiaMigrationEdges.map(({ result, edge }) => `${result.newGuild.name ?? result.newGuild.guildIdentifier}:${edge.matchedMemberCount}:mutual=${edge.mutualDominant}`).join(", ") : "none"}`);
    if (!armia.currentObservation) {
      line("Finding: the loaded local scan root contains historical EU3 ARMIA POLSKA, but no current F28 guild observation named ARMIA POLSKA. The UI-reported ARMIA Review state cannot be fully reproduced from these snapshots alone.");
      line("Code-level root-cause for the described UI case: if a guild has exact name + mutual dominant flow + 3 matched players but no same CoA, V2 keeps it Review because guild autoEligible still requires same CoA; management recompute then reuses that strict ready flag.");
    } else {
      line("Root cause: ARMIA remains V2 Review because the strict autoEligible predicate is not met. Exact name + mutual dominant flow + 3 matched players is strong V3 evidence, but V2 still requires same CoA for Ready. This is not a stale UI-only flag; management recompute reuses the strict candidate.ready/autoEligible flag.");
    }
  } else {
    line("ARMIA POLSKA was not found in the loaded scans.");
  }
  line("");

  const deadEnd = pairRows.find((row) => row.pair.key === "dead-end");
  line("## L. Dead End -> Erben im Wandel");
  if (deadEnd) {
    line(`Relation: ${formatCandidate(deadEnd.candidate)}; ${formatLeadership(deadEnd.leadership)}; progression regressions=${deadEnd.progression.regressions.join(",") || "none"}`);
    line(`Incoming member sources: ${deadEnd.result?.flowSummary.sources.map((source) => `${source.name ?? source.guildIdentifier}:${source.matchedMemberCount}`).join(", ") || "none"}`);
    line("Finding: Dead End is the guardrail against using largest member source as identity definition. Same CoA and historical/first-post structure can carry identity even when another source contributes more members.");
  }
  line("");

  const legion = pairRows.find((row) => row.pair.key === "legion");
  const genzLegion = pairRows.find((row) => row.pair.key === "genz-legion");
  line("## M. Die Legion -> Legion Z vs GenerationZ -> Legion Z");
  if (legion && genzLegion) {
    line(`Die Legion: ${formatCandidate(legion.candidate)}; relation=${legion.candidate ? "identityCandidate" : legion.migration ? "migrationEdge" : "none"}; class=${legion.classification}; ${formatLeadership(legion.leadership)}`);
    line(`GenerationZ false control: ${genzLegion.candidate ? formatCandidate(genzLegion.candidate) : `migration matched=${genzLegion.migration?.matchedMemberCount ?? 0} mutual=${genzLegion.migration?.mutualDominant ?? false}`}; relation=${genzLegion.candidate ? "identityCandidate" : genzLegion.migration ? "migrationEdge" : "none"}; class=${genzLegion.classification}; ${formatLeadership(genzLegion.leadership)}`);
    line("Finding: Legion Z has a valid Die Legion identity candidate while GenerationZ remains migration evidence. This is the clearest separation of large member movement from guild identity.");
  }
  line("");

  line("## N. Guild Evidence Strength Recommendation");
  line("| Signal | Availability / Observation | Positive controls | False controls | Recommended strength |");
  line("| --- | --- | --- | --- | --- |");
  line("| Exact guild name | Useful but not globally unique | Magic, Hangover, ARMIA, Kneipos, Lotus | can appear in noisy candidate pools | support; strongSupport with flow |");
  line("| Same CoA | Useful continuity artifact but not mandatory | Magic, Hangover, Dead End | CoA can collide/change | support |");
  line("| Exact name + CoA | Lower collision than either alone | Magic, Hangover, Kneipos | still must pass assignment checks | strongSupport/anchored with mutual flow |");
  line("| Mutual dominant member flow | Strong for stable continuations | Magic, Hangover, ARMIA, Lotus | majority flow can still be migration | strongSupport only with direct identity signal |");
  line("| Leader continuity | High value when resolved | not reliably measurable here | leader can change | strongSupport, never hard reject |");
  line("| Officer/core continuity | Potentially robust structural signal | limited by current player coverage | migration can include officers | support/strongSupport by overlap |");
  line("| Normal member flow | Explains movement | all controls contextualize it | GenerationZ -> Legion Z | weakSupport/support; migration edge if no direct identity signal |");
  line("| Guild progression | Broad availability, many collisions | sanity check | maxed values collide heavily | weakSupport/support only |");
  line("");

  line("## O. Candidate Classification Recommendation");
  line("anchored: exact name + same CoA + mutual dominant flow + minimum matched core, then pass assignment/reservation.");
  line("strong: exact name + mutual dominant flow, same CoA + strong flow, or resolved leadership/officer continuity.");
  line("plausible: direct identity signal without enough strength for automatic assignment.");
  line("weak: member movement or weak compatibility without real identity continuity; do not show as normal Review identity candidate.");
  line("rejected: no actionable identity evidence or contradicted/reserved/rejected relation.");
  line(`Candidate class totals in current guild pool: anchored=${candidateClassCounts.anchored} strong=${candidateClassCounts.strong} plausible=${candidateClassCounts.plausible} weak=${candidateClassCounts.weak} rejected=${candidateClassCounts.rejected}`);
  line("");

  line("## P. Review Pool Breakdown");
  Object.entries(reviewGroups)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .forEach(([group, count]) => line(`- ${group}: ${count}`));
  line("");
  reviewSimulation.forEach((entry) => {
    const conflict = Boolean(entry.result?.splitCandidate || entry.result?.convergenceCandidate || entry.item.reasonCodes.includes("assignment-conflict"));
    const candidates = entry.candidateAnalyses
      .map((analysis) => `${analysis.candidate.historicalName ?? analysis.candidate.historicalIdentifier}:${analysis.classification}:matched=${analysis.candidate.evidence.matchedMemberCount}:exact=${analysis.candidate.evidence.exactName}:coa=${analysis.candidate.evidence.sameCoA}:mutual=${analysis.candidate.evidence.mutualDominant}`)
      .join("; ") || "none";
    line(`- ${entry.item.currentName ?? entry.item.currentIdentifier} (${entry.item.currentIdentifier}): candidates=${entry.item.candidates.length}, migrations=${entry.item.memberMigrationEdges.length}, conflict=${conflict}, classes=${entry.classifications.join(",") || "none"}, coverage=${formatCoverage(entry.candidateAnalyses[0]?.currentCoverage ?? { total: 0, resolved: 0, leaderTotal: 0, leaderResolved: 0, officerTotal: 0, officerResolved: 0, memberTotal: 0, memberResolved: 0 })}, details=${candidates}`);
  });
  line("");

  line("## Q. Potential Safe Promotions");
  line(`Potentially auto-resolvable under simulated strong/anchored one-to-one rule: ${simulatedPromotable.length}/${reviewGuilds.length}`);
  simulatedPromotable.forEach((entry) => {
    line(`- ${entry.item.currentName ?? entry.item.currentIdentifier}: candidate=${entry.item.candidates[0]?.historicalName ?? entry.item.candidates[0]?.historicalIdentifier ?? "missing"} classes=${entry.classifications.join(",")}`);
  });
  if (!simulatedPromotable.length) line("None under the conservative no-conflict rule. Strong-but-not-auto cases still inform V3 classification and UI review semantics.");
  line("");

  line("## R. Assignment / Reservation Design");
  line(`Historical guilds claimed by multiple current identity candidates: ${duplicatedHistoricalClaims.length}`);
  duplicatedHistoricalClaims.slice(0, 20).forEach(([oldId, count]) => line(`- ${oldId}: ${count} current candidates`));
  line("Design: reserve a historical guild only after an assignment-free strong/anchored decision. Remove/rescore weaker claims against that historical guild as migration edges. If two current guilds have similarly strong identity claims, mark assignment conflict and keep Review.");
  line("");

  line("## S. Circular Evidence Guard");
  line("Pass 1 should resolve Player identities from independent player evidence only. Pass 2 may use Ready/Completed players as guild evidence. Pass 3 may confirm Guild identities. A later optional Player refinement pass may use confirmed Guild identity, but those refined players must not be fed back into the same Guild pass.");
  line("");

  line("## T. Guild Resolver V3 Specification");
  line("1. Model guild evidence as ordinal entries: neutral, weakSupport, support, strongSupport, anchor, warning.");
  line("2. Build identity candidates only from direct identity evidence; keep migration edges separate.");
  line("3. Classify candidates as rejected, weak, plausible, strong, anchored.");
  line("4. Apply one-to-one historical reservation after classification, not before evidence is visible.");
  line("5. Recompute final status from the final candidate pool: Ready for exactly one assignment-free strong/anchored candidate; Review for multiple/actionable conflict; Unresolved when historical data exists but no actionable identity remains; No Historical Data only when coverage is absent.");
  line("6. Keep leader/officer continuity optional and non-blocking until coverage is demonstrably reliable.");
  line("7. Treat first post-fusion observations as primary identity evidence and later observations as migration/rename/context evidence.");

  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${REPORT_PATH}`);
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(`guild-v3-player-${suffix}`);
  await deleteDB(`guild-v3-guild-${suffix}`);
}
