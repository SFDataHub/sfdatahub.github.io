import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { extractGuildCoaString } from "../../src/lib/guilds/guildCoa.ts";
import {
  normalizeGuildScanMembers,
  normalizeGuildScanServer,
  normalizeGuildSegmentForScan,
} from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import { resolveGuildFusions, type GuildFusionObservation } from "../../src/lib/identities/guildFusionResolver.ts";
import { resolvePlayerFusions } from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

type RawGuildObservation = {
  snapshot: GuildHubLogicalScanSnapshot;
  record: JsonRecord;
  guildIdentifier: string;
  serverCode: string | null;
  server: string | null;
  segment: string | null;
  numericId: string | null;
  name: string | null;
  memberCount: number | null;
  coa: string | null;
  save: unknown[];
};

type FieldStats = {
  path: string;
  available: number;
  distinct: Set<string>;
  trueStableFirst: number;
  trueStableSep: number;
  negativeStableFirst: number;
  collisionFirst: number;
  examples: string[];
};

const DEFAULT_SCAN_ROOTS = [
  "D:/SFDataHub/Guild Analytics/public/scans",
  "/mnt/d/SFDataHub/Guild Analytics/public/scans",
];
const TARGET_DATES = new Set(["2026-02-21", "2026-04-03", "2026-09-05"]);
const FIRST_POST_DATE = "2026-02-21";
const SEP_POST_DATE = "2026-09-05";
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_FUSION_SERVER = "F28";

const TRUE_PAIRS = [
  { key: "magic", label: "EU1 Magic Mushrooms -> F28 Magic Mushrooms", oldId: "eu1_g8", newId: "f28_g6" },
  { key: "kneipos", label: "EU2 Los Kneipos -> F28 Los Kneipos", oldId: "eu2_g469", newId: "f28_g5741" },
  { key: "lotus", label: "EU3 Der weisse Lotus -> F28 Der weisse Lotus", oldId: "eu3_g2087", newId: "f28_g10394" },
  { key: "dead-end", label: "EU4 Dead End -> F28 Erben im Wandel", oldId: "eu4_g14", newId: "f28_g14265" },
  { key: "legion", label: "EU3 Die Legion -> F28 Legion Z", oldId: "eu3_g4877", newId: "f28_g15060" },
] as const;

const NEGATIVE_PAIRS = [
  { label: "EU4 GenerationZ -> F28 Erben im Wandel", oldId: "eu4_g1352", newId: "f28_g14265" },
  { label: "EU4 GenerationZ -> F28 Legion Z", oldId: "eu4_g1352", newId: "f28_g15060" },
  { label: "EU4 Dead End -> F28 Legion Z", oldId: "eu4_g14", newId: "f28_g15060" },
  { label: "EU3 Die Legion -> F28 Erben im Wandel", oldId: "eu3_g4877", newId: "f28_g14265" },
] as const;

const FIELD_PATHS = [
  "identifier",
  "server",
  "segment",
  "numericId",
  "name",
  "memberCount",
  "coa",
] as const;

const KNOWN_MAIN_REPO_SAVE_INDICES = new Set([
  1, // CoA in guildCoa.ts
  3, // guildCoverage.ts
  ...Array.from({ length: 50 }, (_, index) => 14 + index), // member player IDs for role lookup
  ...Array.from({ length: 50 }, (_, index) => 314 + index), // member role codes for role lookup
]);
const FOCUS_SAVE_RANGE = Array.from({ length: 50 }, (_, index) => 164 + index);

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeName = (value: unknown) =>
  String(value ?? "")
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

const readString = (record: JsonRecord | null, keys: readonly string[]) => {
  if (!record) return null;
  const canonical = new Map<string, string>();
  Object.keys(record).forEach((key) => canonical.set(key.toLowerCase().replace(/[^a-z0-9]/g, ""), key));

  for (const key of keys) {
    const direct = Object.prototype.hasOwnProperty.call(record, key) ? key : null;
    const resolved = direct ?? canonical.get(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (!resolved) continue;
    const value = record[resolved];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
};

const valueKey = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? `n:${value}` : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? `s:${trimmed}` : null;
  }
  if (typeof value === "boolean") return `b:${value}`;
  return null;
};

const displayValue = (value: unknown) => {
  const key = valueKey(value);
  if (!key) return "-";
  return key.slice(2);
};

const listJsonFiles = (root: string): string[] =>
  fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") && entry.name !== "manifest.json" ? [fullPath] : [];
  });

const getScanTimestamp = (raw: JsonRecord): number | null => {
  const players = Array.isArray(raw.players) ? raw.players.map(asRecord).filter(Boolean) : [];
  const fromPlayers = players.map((player) => toFiniteNumber(player?.timestamp)).find((timestamp) => timestamp != null);
  if (fromPlayers != null) return fromPlayers;
  return toFiniteNumber(raw.timestamp) ?? toFiniteNumber(raw.scannedAt);
};

const dateKey = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const buildGuildIdentifier = (server: string | null, segment: string | null, name: string | null) => {
  if (segment) return server ? `${server.toLowerCase()}_${segment}` : segment;
  const nameKey = normalizeName(name).replace(/\s+/g, "-");
  return nameKey ? `${server?.toLowerCase() ?? "unknown"}_name_${nameKey}` : null;
};

const parseNumericGuildId = (identifier: string | null) => {
  const match = String(identifier ?? "").match(/_g(\d+)$/i) ?? String(identifier ?? "").match(/^g(\d+)$/i);
  return match?.[1] ?? null;
};

const readRawGuildObservation = (
  group: unknown,
  snapshot: GuildHubLogicalScanSnapshot,
): RawGuildObservation | null => {
  const record = asRecord(group);
  if (!record) return null;
  const rawIdentifier = readString(record, [
    "guildIdentifier",
    "Guild Identifier",
    "identifier",
    "Identifier",
    "groupIdentifier",
    "Group Identifier",
    "groupId",
    "guildId",
    "id",
  ]);
  const server =
    normalizeGuildScanServer(
      readString(record, ["server", "Server", "prefix", "world", "realm"]) ??
        rawIdentifier?.match(/^(.+)_g[^_]+$/i)?.[1],
    ) ?? null;
  const segment = normalizeGuildSegmentForScan(rawIdentifier);
  const name = readString(record, ["name", "Name", "groupname", "groupName", "guildName", "Guild Name", "guild"]);
  const guildIdentifier = buildGuildIdentifier(server, segment, name);
  if (!guildIdentifier) return null;
  const rawSave = Array.isArray(record.save) ? record.save : Array.isArray(record.groupSave) ? record.groupSave : [];

  return {
    snapshot,
    record,
    guildIdentifier,
    serverCode: resolveServerCode(server),
    server,
    segment,
    numericId: parseNumericGuildId(guildIdentifier),
    name,
    memberCount: toFiniteNumber(
      readString(record, ["guildMemberCount", "Guild Member Count", "memberCount", "members", "count"]),
    ),
    coa: extractGuildCoaString(record),
    save: rawSave,
  };
};

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

const getScanRoot = () => {
  const explicit = process.argv[2];
  if (explicit) return explicit;
  const existing = DEFAULT_SCAN_ROOTS.find((candidate) => fs.existsSync(candidate));
  if (!existing) throw new Error(`No scan root found. Tried: ${DEFAULT_SCAN_ROOTS.join(", ")}`);
  return existing;
};

const findGuild = (observations: RawGuildObservation[], guildIdentifier: string) =>
  observations.find((observation) => normalizeKey(observation.guildIdentifier) === normalizeKey(guildIdentifier)) ?? null;

const latestBefore = (
  observations: RawGuildObservation[],
  guildIdentifier: string,
  beforeTimestamp: number,
): RawGuildObservation | null =>
  observations
    .filter(
      (observation) =>
        normalizeKey(observation.guildIdentifier) === normalizeKey(guildIdentifier) &&
        observation.snapshot.timestampMs < beforeTimestamp,
    )
    .sort((left, right) => right.snapshot.timestampMs - left.snapshot.timestampMs)[0] ?? null;

const fieldValue = (observation: RawGuildObservation, fieldPath: string) => {
  if (fieldPath === "identifier") return observation.guildIdentifier;
  if (fieldPath === "server") return observation.serverCode ?? observation.server;
  if (fieldPath === "segment") return observation.segment;
  if (fieldPath === "numericId") return observation.numericId;
  if (fieldPath === "name") return normalizeName(observation.name);
  if (fieldPath === "memberCount") return observation.memberCount;
  if (fieldPath === "coa") return observation.coa;
  const saveMatch = fieldPath.match(/^save\[(\d+)\]$/);
  if (saveMatch) return observation.save[Number(saveMatch[1])];
  return observation.record[fieldPath];
};

const isKnownSemanticSavePath = (fieldPath: string) => {
  const match = fieldPath.match(/^save\[(\d+)\]$/);
  return Boolean(match && KNOWN_MAIN_REPO_SAVE_INDICES.has(Number(match[1])));
};

const isUnnamedSavePath = (fieldPath: string) => fieldPath.startsWith("save[") && !isKnownSemanticSavePath(fieldPath);

const isUsefulRawValue = (value: unknown) => {
  const key = valueKey(value);
  if (!key) return false;
  const raw = key.slice(2);
  return raw !== "0" && raw !== "-1" && raw !== "null" && raw !== "undefined";
};

const formatPct = (part: number, total: number) => (total ? `${((part / total) * 100).toFixed(1)}%` : "0.0%");

const buildMembership = (guilds: GuildFusionObservation[]) => {
  const membership = new Map<string, GuildFusionObservation>();
  guilds.forEach((guild) => {
    guild.memberIdentifiers.forEach((identifier) => {
      const key = normalizeKey(identifier);
      if (!key) return;
      const existing = membership.get(key);
      if (!existing || existing.timestamp < guild.timestamp) membership.set(key, guild);
    });
  });
  return membership;
};

const computeFlowsForSnapshot = (snapshots: GuildHubLogicalScanSnapshot[], postSnapshot: GuildHubLogicalScanSnapshot) => {
  const historicalSnapshots = snapshots.filter((snapshot) => snapshot.timestampMs < postSnapshot.timestampMs);
  const historicalPlayers = historicalSnapshots
    .flatMap(createFusionIdentityObservations)
    .filter((observation) => {
      const code = resolveServerCode(observation.server);
      return Boolean(code && ORIGIN_SERVER_CODES.has(code));
    });
  const newPlayers = createFusionIdentityObservations(postSnapshot).filter(
    (observation) => resolveServerCode(observation.server) === TARGET_FUSION_SERVER,
  );
  const playerResult = resolvePlayerFusions({
    historicalObservations: historicalPlayers,
    newObservations: newPlayers,
  });
  const newPlayerByIdentifier = new Map(newPlayers.map((observation) => [normalizeKey(observation.identifier), observation]));
  const highConfidenceMatches = playerResult.results.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = result.candidates.find(
      (entry) => !entry.rejected && (entry.evidence.exactName || entry.evidence.fusionBaseName),
    );
    const newObservation = newPlayerByIdentifier.get(normalizeKey(result.newIdentifier));
    if (!candidate || !newObservation) return [];
    return [{ oldIdentifier: candidate.oldIdentifier, newIdentifier: result.newIdentifier }];
  });
  const oldGuilds = historicalSnapshots
    .flatMap(createFusionIdentityGuildObservations)
    .filter((guild) => Boolean(guild.serverCode && ORIGIN_SERVER_CODES.has(guild.serverCode)));
  const newGuilds = createFusionIdentityGuildObservations(postSnapshot).filter(
    (guild) => guild.serverCode === TARGET_FUSION_SERVER,
  );
  const oldMembership = buildMembership(oldGuilds);
  const newMembership = buildMembership(newGuilds);
  const counts = new Map<string, number>();

  highConfidenceMatches.forEach((match) => {
    const oldGuild = oldMembership.get(normalizeKey(match.oldIdentifier));
    const newGuild = newMembership.get(normalizeKey(match.newIdentifier));
    if (!oldGuild || !newGuild) return;
    const key = `${normalizeKey(oldGuild.guildIdentifier)}\u0000${normalizeKey(newGuild.guildIdentifier)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const resolverResult = resolveGuildFusions({
    historicalGuildObservations: oldGuilds,
    newGuildObservations: newGuilds,
    highConfidencePlayerMatches: highConfidenceMatches.map((match) => ({
      oldIdentifier: match.oldIdentifier,
      oldName: null,
      newIdentifier: match.newIdentifier,
      newName: null,
    })),
  });

  return { counts, resolverResult };
};

const summarizeTopLevel = (observations: RawGuildObservation[]) => {
  const fields = new Map<string, { count: number; types: Map<string, number>; examples: string[] }>();
  observations.forEach((observation) => {
    Object.entries(observation.record).forEach(([key, value]) => {
      const stats = fields.get(key) ?? { count: 0, types: new Map<string, number>(), examples: [] };
      stats.count += 1;
      const type = Array.isArray(value) ? `array(${value.length})` : value == null ? "null" : typeof value;
      stats.types.set(type, (stats.types.get(type) ?? 0) + 1);
      if (stats.examples.length < 3 && valueKey(value)) stats.examples.push(displayValue(value));
      fields.set(key, stats);
    });
  });
  return [...fields.entries()].sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]));
};

const buildFieldStats = (
  observations: RawGuildObservation[],
  firstPost: GuildHubLogicalScanSnapshot,
  sepPost: GuildHubLogicalScanSnapshot,
) => {
  const maxSaveLength = observations.reduce((max, observation) => Math.max(max, observation.save.length), 0);
  const paths = [...FIELD_PATHS, ...Array.from({ length: maxSaveLength }, (_, index) => `save[${index}]`)];
  const preFirstGuilds = observations.filter(
    (observation) =>
      observation.snapshot.timestampMs < firstPost.timestampMs &&
      Boolean(observation.serverCode && ORIGIN_SERVER_CODES.has(observation.serverCode)),
  );

  return paths
    .map((fieldPath): FieldStats => {
      const distinct = new Set<string>();
      const examples: string[] = [];
      let available = 0;
      observations.forEach((observation) => {
        const value = fieldValue(observation, fieldPath);
        const key = valueKey(value);
        if (!key) return;
        available += 1;
        distinct.add(key);
        if (examples.length < 4 && isUsefulRawValue(value)) examples.push(displayValue(value));
      });

      let trueStableFirst = 0;
      let trueStableSep = 0;
      let negativeStableFirst = 0;
      let collisionFirst = 0;

      for (const pair of TRUE_PAIRS) {
        const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
        const firstObs = findGuild(firstPost.groups.map((group) => readRawGuildObservation(group, firstPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
        const sepObs = findGuild(sepPost.groups.map((group) => readRawGuildObservation(group, sepPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
        const oldKey = oldObs ? valueKey(fieldValue(oldObs, fieldPath)) : null;
        const firstKey = firstObs ? valueKey(fieldValue(firstObs, fieldPath)) : null;
        const sepKey = sepObs ? valueKey(fieldValue(sepObs, fieldPath)) : null;
        if (oldKey && firstKey && oldKey === firstKey) trueStableFirst += 1;
        if (oldKey && sepKey && oldKey === sepKey) trueStableSep += 1;
        if (firstKey) {
          collisionFirst += preFirstGuilds.filter(
            (candidate) => normalizeKey(candidate.guildIdentifier) !== normalizeKey(pair.oldId) &&
              valueKey(fieldValue(candidate, fieldPath)) === firstKey,
          ).length;
        }
      }

      for (const pair of NEGATIVE_PAIRS) {
        const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
        const newObs = findGuild(firstPost.groups.map((group) => readRawGuildObservation(group, firstPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
        const oldKey = oldObs ? valueKey(fieldValue(oldObs, fieldPath)) : null;
        const newKey = newObs ? valueKey(fieldValue(newObs, fieldPath)) : null;
        if (oldKey && newKey && oldKey === newKey) negativeStableFirst += 1;
      }

      return {
        path: fieldPath,
        available,
        distinct,
        trueStableFirst,
        trueStableSep,
        negativeStableFirst,
        collisionFirst,
        examples,
      };
    })
    .filter((stats) => stats.available > 0)
    .sort(
      (left, right) =>
        right.trueStableFirst - left.trueStableFirst ||
        right.trueStableSep - left.trueStableSep ||
        left.negativeStableFirst - right.negativeStableFirst ||
        left.collisionFirst - right.collisionFirst ||
        right.distinct.size - left.distinct.size,
    );
};

const getRawGuildsForSnapshot = (snapshot: GuildHubLogicalScanSnapshot) =>
  snapshot.groups.map((group) => readRawGuildObservation(group, snapshot)).filter(Boolean) as RawGuildObservation[];

const getPostObservation = (snapshotsByDate: Map<string, RawGuildObservation[]>, date: string, guildIdentifier: string) =>
  findGuild(snapshotsByDate.get(date) ?? [], guildIdentifier);

const isNonDecreasing = (values: unknown[]) => {
  const numeric = values.map(toFiniteNumber);
  if (numeric.some((value) => value == null)) return false;
  for (let index = 1; index < numeric.length; index += 1) {
    if ((numeric[index] ?? 0) < (numeric[index - 1] ?? 0)) return false;
  }
  return true;
};

const tupleKey = (observation: RawGuildObservation | null, indexes: readonly number[]) => {
  if (!observation) return null;
  const parts = indexes.map((index) => valueKey(observation.save[index]));
  if (parts.some((part) => !part)) return null;
  return parts.join("|");
};

const countTupleCollisions = (
  candidates: RawGuildObservation[],
  targetTuple: string | null,
  indexes: readonly number[],
  excludeGuildIdentifier: string,
) => {
  if (!targetTuple) return 0;
  return candidates.filter(
    (candidate) =>
      normalizeKey(candidate.guildIdentifier) !== normalizeKey(excludeGuildIdentifier) &&
      tupleKey(candidate, indexes) === targetTuple,
  ).length;
};

const combinations = <T>(items: readonly T[], size: number): T[][] => {
  if (size <= 0) return [[]];
  if (items.length < size) return [];
  if (size === 1) return items.map((item) => [item]);
  return items.flatMap((item, index) => combinations(items.slice(index + 1), size - 1).map((tail) => [item, ...tail]));
};

const printFocusedSaveIndexAnalysis = (
  observations: RawGuildObservation[],
  fieldStats: FieldStats[],
  snapshotsByDate: Map<string, RawGuildObservation[]>,
  firstPost: GuildHubLogicalScanSnapshot,
) => {
  const statsByPath = new Map(fieldStats.map((stats) => [stats.path, stats]));
  const preFirstGuilds = observations.filter(
    (observation) =>
      observation.snapshot.timestampMs < firstPost.timestampMs &&
      Boolean(observation.serverCode && ORIGIN_SERVER_CODES.has(observation.serverCode)),
  );

  printSection("I. Unnamed Save Indices 164..213");
  FOCUS_SAVE_RANGE.forEach((index) => {
    const stats = statsByPath.get(`save[${index}]`);
    if (!stats) return;
    let monotone = 0;
    TRUE_PAIRS.forEach((pair) => {
      const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
      const postValues = [FIRST_POST_DATE, "2026-04-03", SEP_POST_DATE]
        .map((date) => getPostObservation(snapshotsByDate, date, pair.newId))
        .filter(Boolean) as RawGuildObservation[];
      const values = [oldObs, ...postValues].map((observation) => observation?.save[index]);
      if (isNonDecreasing(values)) monotone += 1;
    });
    const valuesForTruePairs = TRUE_PAIRS.map((pair) => {
      const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
      const firstObs = getPostObservation(snapshotsByDate, FIRST_POST_DATE, pair.newId);
      return `${pair.key}:${displayValue(oldObs?.save[index])}->${displayValue(firstObs?.save[index])}`;
    }).join("; ");
    console.log(
      `- save[${index}]: exactFirst=${stats.trueStableFirst}/${TRUE_PAIRS.length}, exactSep=${stats.trueStableSep}/${TRUE_PAIRS.length}, monotone=${monotone}/${TRUE_PAIRS.length}, negatives=${stats.negativeStableFirst}/${NEGATIVE_PAIRS.length}, collisions=${stats.collisionFirst}, distinct=${stats.distinct.size} | ${valuesForTruePairs}`,
    );
  });

  printSection("J. Per-Pair Unnamed Save Stability");
  TRUE_PAIRS.forEach((pair) => {
    const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
    const firstObs = getPostObservation(snapshotsByDate, FIRST_POST_DATE, pair.newId);
    const aprObs = getPostObservation(snapshotsByDate, "2026-04-03", pair.newId);
    const sepObs = getPostObservation(snapshotsByDate, SEP_POST_DATE, pair.newId);
    const stableFocus = FOCUS_SAVE_RANGE.filter((index) => {
      const oldKey = valueKey(oldObs?.save[index]);
      const firstKey = valueKey(firstObs?.save[index]);
      return Boolean(oldKey && firstKey && oldKey === firstKey && isUsefulRawValue(oldObs?.save[index]));
    });
    const changedFocus = FOCUS_SAVE_RANGE.filter((index) => {
      const oldKey = valueKey(oldObs?.save[index]);
      const firstKey = valueKey(firstObs?.save[index]);
      return Boolean(oldKey && firstKey && oldKey !== firstKey);
    });
    const monotoneFocus = FOCUS_SAVE_RANGE.filter((index) => isNonDecreasing([oldObs?.save[index], firstObs?.save[index], aprObs?.save[index], sepObs?.save[index]]));
    const tupleCollisionCount = stableFocus.length
      ? countTupleCollisions(preFirstGuilds, tupleKey(firstObs, stableFocus), stableFocus, pair.oldId)
      : null;
    console.log(`- ${pair.label}`);
    console.log(
      `  exact stable in 164..213: ${stableFocus.length ? stableFocus.map((index) => `save[${index}]`).join(", ") : "none"}`,
    );
    console.log(
      `  changed in 164..213: ${changedFocus.length ? changedFocus.slice(0, 20).map((index) => `save[${index}]`).join(", ") : "none"}${changedFocus.length > 20 ? " ..." : ""}`,
    );
    console.log(
      `  non-decreasing old->Feb->Apr->Sep: ${monotoneFocus.length ? monotoneFocus.map((index) => `save[${index}]`).join(", ") : "none"}`,
    );
    console.log(
      tupleCollisionCount == null
        ? "  no exact-stable 164..213 tuple exists for this pair."
        : `  hindsight tuple of stable 164..213 slots collides with ${tupleCollisionCount} other pre-fusion guild(s); not usable as a predefined identity key.`,
    );
  });

  printSection("K. Unnamed Save Combination Search");
  const candidateIndexes = fieldStats
    .filter((stats) => {
      const match = stats.path.match(/^save\[(\d+)\]$/);
      if (!match) return false;
      const index = Number(match[1]);
      return (
        isUnnamedSavePath(stats.path) &&
        index >= 0 &&
        index < 502 &&
        stats.trueStableFirst >= 2 &&
        stats.distinct.size > 3 &&
        stats.collisionFirst < 2000
      );
    })
    .slice(0, 16)
    .map((stats) => Number(stats.path.match(/\d+/)?.[0]));

  const scoreCombo = (indexes: readonly number[]) => {
    let trueStable = 0;
    let negativeStable = 0;
    let collisions = 0;
    TRUE_PAIRS.forEach((pair) => {
      const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
      const firstObs = getPostObservation(snapshotsByDate, FIRST_POST_DATE, pair.newId);
      const oldTuple = tupleKey(oldObs, indexes);
      const firstTuple = tupleKey(firstObs, indexes);
      if (oldTuple && firstTuple && oldTuple === firstTuple) {
        trueStable += 1;
        collisions += countTupleCollisions(preFirstGuilds, firstTuple, indexes, pair.oldId);
      }
    });
    NEGATIVE_PAIRS.forEach((pair) => {
      const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
      const firstObs = getPostObservation(snapshotsByDate, FIRST_POST_DATE, pair.newId);
      const oldTuple = tupleKey(oldObs, indexes);
      const firstTuple = tupleKey(firstObs, indexes);
      if (oldTuple && firstTuple && oldTuple === firstTuple) negativeStable += 1;
    });
    return { indexes, trueStable, negativeStable, collisions };
  };

  const comboScores = [1, 2, 3]
    .flatMap((size) => combinations(candidateIndexes, size).map(scoreCombo))
    .filter((score) => score.trueStable > 0)
    .sort(
      (left, right) =>
        right.trueStable - left.trueStable ||
        left.negativeStable - right.negativeStable ||
        left.collisions - right.collisions ||
        left.indexes.length - right.indexes.length,
    )
    .slice(0, 20);

  if (!comboScores.length) {
    console.log("- no unnamed-save tuple produced stable true-pair evidence under the conservative filters.");
  } else {
    comboScores.forEach((score) => {
      console.log(
        `- ${score.indexes.map((index) => `save[${index}]`).join(" + ")}: trueStable=${score.trueStable}/${TRUE_PAIRS.length}, negatives=${score.negativeStable}/${NEGATIVE_PAIRS.length}, collisions=${score.collisions}`,
      );
    });
  }

  printSection("L. Other Unnamed Save Gaps");
  fieldStats
    .filter((stats) => isUnnamedSavePath(stats.path))
    .filter((stats) => !FOCUS_SAVE_RANGE.some((index) => stats.path === `save[${index}]`))
    .slice(0, 35)
    .forEach((stats) => {
      console.log(
        `- ${stats.path}: exactFirst=${stats.trueStableFirst}/${TRUE_PAIRS.length}, exactSep=${stats.trueStableSep}/${TRUE_PAIRS.length}, negatives=${stats.negativeStableFirst}/${NEGATIVE_PAIRS.length}, collisions=${stats.collisionFirst}, distinct=${stats.distinct.size}`,
      );
    });
};

const printSection = (title: string) => {
  console.log(`\n## ${title}`);
};

const printPairFieldMatrix = (
  observations: RawGuildObservation[],
  firstPost: GuildHubLogicalScanSnapshot,
  sepPost: GuildHubLogicalScanSnapshot,
  flowCounts: Map<string, number>,
) => {
  for (const pair of TRUE_PAIRS) {
    const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
    const firstObs = findGuild(firstPost.groups.map((group) => readRawGuildObservation(group, firstPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
    const sepObs = findGuild(sepPost.groups.map((group) => readRawGuildObservation(group, sepPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
    const flowKey = `${normalizeKey(pair.oldId)}\u0000${normalizeKey(pair.newId)}`;
    console.log(`\n- ${pair.label}`);
    console.log(`  ids: ${oldObs?.guildIdentifier ?? "missing"} -> ${firstObs?.guildIdentifier ?? "missing"}`);
    console.log(
      `  numeric guild id: ${oldObs?.numericId ?? "-"} -> ${firstObs?.numericId ?? "-"}; server: ${oldObs?.serverCode ?? "-"} -> ${firstObs?.serverCode ?? "-"}`,
    );
    console.log(
      `  name stable=${normalizeName(oldObs?.name) === normalizeName(firstObs?.name)}; coa stable=${Boolean(oldObs?.coa && oldObs.coa === firstObs?.coa)}; member-flow=${flowCounts.get(flowKey) ?? 0}`,
    );
    const stableInterestingSave = Array.from({ length: Math.max(oldObs?.save.length ?? 0, firstObs?.save.length ?? 0) }, (_, index) => index)
      .filter((index) => {
        if (!oldObs || !firstObs) return false;
        if ((index >= 14 && index <= 63) || (index >= 314 && index <= 363)) return false;
        const oldKey = valueKey(oldObs.save[index]);
        const firstKey = valueKey(firstObs.save[index]);
        return Boolean(oldKey && firstKey && oldKey === firstKey && isUsefulRawValue(oldObs.save[index]));
      })
      .slice(0, 12)
      .map((index) => `save[${index}]=${displayValue(oldObs?.save[index])}`);
    console.log(`  stable non-member save slots old->first: ${stableInterestingSave.join(", ") || "none"}`);
    if (sepObs) {
      const firstSepSame = [
        `name=${normalizeName(firstObs?.name) === normalizeName(sepObs.name)}`,
        `coa=${Boolean(firstObs?.coa && firstObs.coa === sepObs.coa)}`,
        `memberCount=${displayValue(firstObs?.memberCount)}->${displayValue(sepObs.memberCount)}`,
      ];
      console.log(`  first->Sep F28 state: ${firstSepSame.join(", ")}`);
    }
  }
};

const printNegativeControls = (
  observations: RawGuildObservation[],
  firstPost: GuildHubLogicalScanSnapshot,
  flowCounts: Map<string, number>,
) => {
  const firstGuilds = firstPost.groups.map((group) => readRawGuildObservation(group, firstPost)).filter(Boolean) as RawGuildObservation[];
  for (const pair of NEGATIVE_PAIRS) {
    const oldObs = latestBefore(observations, pair.oldId, firstPost.timestampMs);
    const newObs = findGuild(firstGuilds, pair.newId);
    const flowKey = `${normalizeKey(pair.oldId)}\u0000${normalizeKey(pair.newId)}`;
    console.log(
      `- ${pair.label}: name=${normalizeName(oldObs?.name) === normalizeName(newObs?.name)}, coa=${Boolean(oldObs?.coa && oldObs.coa === newObs?.coa)}, numericId=${oldObs?.numericId === newObs?.numericId}, member-flow=${flowCounts.get(flowKey) ?? 0}`,
    );
  }
};

const scanRoot = getScanRoot();
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
const targetSnapshots = snapshots.filter((snapshot) => TARGET_DATES.has(dateKey(snapshot.timestampMs)));
const firstPost = targetSnapshots.find((snapshot) => dateKey(snapshot.timestampMs) === FIRST_POST_DATE);
const sepPost = targetSnapshots.find((snapshot) => dateKey(snapshot.timestampMs) === SEP_POST_DATE);
assert(firstPost, "expected February 2026 post-fusion scan");
assert(sepPost, "expected September 2026 post-fusion scan");

const rawGuildObservations = snapshots.flatMap((snapshot) =>
  snapshot.groups.map((group) => readRawGuildObservation(group, snapshot)).filter(Boolean),
) as RawGuildObservation[];
const flowAnalysis = computeFlowsForSnapshot(snapshots, firstPost);
const fieldStats = buildFieldStats(rawGuildObservations, firstPost, sepPost);
const snapshotsByDate = new Map(targetSnapshots.map((snapshot) => [dateKey(snapshot.timestampMs), getRawGuildsForSnapshot(snapshot)]));

console.log("# Guild Identity Raw Field Analysis");
console.log(`scanRoot: ${scanRoot}`);
console.log(`snapshots: ${snapshots.length}`);
console.log(`raw guild observations: ${rawGuildObservations.length}`);
console.log(`target snapshots: ${targetSnapshots.map((snapshot) => `${dateKey(snapshot.timestampMs)}:${snapshot.sourceScanFilename}`).join(", ")}`);

printSection("A. Guild Raw Data Model");
console.log("Top-level group fields:");
summarizeTopLevel(rawGuildObservations).forEach(([field, stats]) => {
  const types = [...stats.types.entries()].map(([type, count]) => `${type}=${count}`).join(", ");
  console.log(`- ${field}: count=${stats.count}, types=[${types}], examples=[${stats.examples.join(" | ")}]`);
});
const saveLengths = new Map<number, number>();
rawGuildObservations.forEach((observation) => saveLengths.set(observation.save.length, (saveLengths.get(observation.save.length) ?? 0) + 1));
console.log(`save lengths: ${[...saveLengths.entries()].sort((a, b) => a[0] - b[0]).map(([length, count]) => `${length}=${count}`).join(", ")}`);

printSection("B. Main-Repo Parsing Coverage");
console.log("- identifier/groupIdentifier/guildId/id -> guild segment / public guildIdentifier");
console.log("- server/prefix/world/realm or identifier prefix -> normalized server");
console.log("- name/groupName/guildName -> display name");
console.log("- guildMemberCount/memberCount/members/count -> member count");
console.log("- save[1] plus coa*/emblem* keys -> CoA string");
console.log("- save[14..63] -> member player IDs for guild role lookup");
console.log("- save[314..363] -> role codes 1 leader, 2 officer, 3 member");
console.log("- players[] -> normalized members, guild segment/name, player-level identity and member-flow evidence");
console.log("- other group save slots are not materialized by the current main parser/normalizer.");

printSection("C. Persistent Guild IDs / Origin Server Search");
const originLikeKeys = summarizeTopLevel(rawGuildObservations)
  .map(([field]) => field)
  .filter((field) => /origin|original|old|source|home|server|prefix|world|realm|identifier|guild|group|id/i.test(field));
console.log(`origin/id-like top-level keys found: ${originLikeKeys.join(", ") || "none"}`);
TRUE_PAIRS.forEach((pair) => {
  const oldObs = latestBefore(rawGuildObservations, pair.oldId, firstPost.timestampMs);
  const newObs = findGuild(firstPost.groups.map((group) => readRawGuildObservation(group, firstPost)).filter(Boolean) as RawGuildObservation[], pair.newId);
  console.log(
    `- ${pair.label}: public id ${oldObs?.guildIdentifier ?? "missing"} -> ${newObs?.guildIdentifier ?? "missing"}; numeric ${oldObs?.numericId ?? "-"} -> ${newObs?.numericId ?? "-"}; server ${oldObs?.serverCode ?? "-"} -> ${newObs?.serverCode ?? "-"}`,
  );
});

printSection("D. Candidate Identity Signals");
console.log("Top raw/direct fields by true-pair stability, then low negative/collision counts:");
fieldStats.slice(0, 35).forEach((stats) => {
  console.log(
    `- ${stats.path}: trueFirst=${stats.trueStableFirst}/${TRUE_PAIRS.length}, trueSep=${stats.trueStableSep}/${TRUE_PAIRS.length}, negatives=${stats.negativeStableFirst}/${NEGATIVE_PAIRS.length}, firstCollisions=${stats.collisionFirst}, available=${stats.available}, distinct=${stats.distinct.size}, examples=[${stats.examples.slice(0, 3).join(" | ")}]`,
  );
});

printSection("E. Known Continuity Pair Matrix");
printPairFieldMatrix(rawGuildObservations, firstPost, sepPost, flowAnalysis.counts);

printSection("F. Negative Controls");
printNegativeControls(rawGuildObservations, firstPost, flowAnalysis.counts);

printSection("G. Collision / Degenerate Raw Values");
const collisionHeavy = fieldStats
  .filter((stats) => stats.trueStableFirst > 0 && stats.collisionFirst > 0)
  .slice(0, 20);
collisionHeavy.forEach((stats) => {
  console.log(
    `- ${stats.path}: trueFirst=${stats.trueStableFirst}, collisions=${stats.collisionFirst}, distinct=${stats.distinct.size}, available=${stats.available}`,
  );
});
const exactZeroLike = fieldStats
  .filter((stats) => stats.available === rawGuildObservations.length && stats.distinct.size <= 3)
  .slice(0, 12);
console.log(`low-entropy always-present fields: ${exactZeroLike.map((stats) => `${stats.path}(distinct=${stats.distinct.size})`).join(", ") || "none"}`);

printSection("H. Resolver Baseline");
console.log(`February resolver guild results: ${flowAnalysis.resolverResult.results.length}`);
flowAnalysis.resolverResult.results
  .filter((result) => TRUE_PAIRS.some((pair) => normalizeKey(pair.newId) === normalizeKey(result.newGuild.guildIdentifier)))
  .forEach((result) => {
    const top = result.candidates.slice(0, 5).map((candidate) => `${candidate.oldGuildIdentifier}:${candidate.matchedMemberCount}`);
    console.log(`- ${result.newGuild.guildIdentifier} ${result.newGuild.name}: status=${result.status}, candidates=${top.join(", ")}`);
  });

printFocusedSaveIndexAnalysis(rawGuildObservations, fieldStats, snapshotsByDate, firstPost);

console.log("\nguildIdentityFieldAnalysis completed");
