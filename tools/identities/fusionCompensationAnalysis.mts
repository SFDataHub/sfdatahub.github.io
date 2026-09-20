import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";
import {
  buildFusionIdentityManagementReportFromSnapshots,
  type FusionIdentityManagementItem,
} from "../../src/lib/identities/fusionIdentityManagement.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

type Stats = {
  count: number;
  min: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
};

type Boundary = {
  preTimestamp: number | null;
  preLevel: number | null;
  postTimestamp: number | null;
  postLevel: number | null;
  elapsedDays: number | null;
  gain: number | null;
  gainPerDay: number | null;
  gain30: number | null;
};

type ProgressionSample = Boundary & {
  currentIdentifier: string;
  currentName: string | null;
  historicalIdentifier: string;
  historicalName: string | null;
  origin: string;
  bucket: string;
};

type GaCompensationSource = {
  relativePath: string;
  compFactor: number | null;
  compDivisor: number | null;
  serverMonths: Map<string, number>;
  hasCompBonusFormula: boolean;
  hasMathFloor: boolean;
  hasLaunchDateText: boolean;
  lineNumbers: {
    compFactor: number | null;
    compDivisor: number | null;
    serverMonths: number | null;
    compBonus: number | null;
  };
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const GUILD_ANALYTICS_ROOT = "D:/SFDataHub/Guild Analytics";
const REPORT_PATH = path.resolve("tools/identities/fusion-compensation-analysis.latest.txt");
const GA_SOURCE_FILES = [
  "src/routes/Ranking.tsx",
  "src/routes/Dashboard.tsx",
  "src/ui/tables/RankingTable.tsx",
];
const MAIN_REPO_SERVER_FILES = ["src/data/serverRegistry.ts", "src/data/serverFusions.ts"];
const ORIGIN_SERVER_CODES = ["EU1", "EU2", "EU3", "EU4"] as const;
const ORIGIN_SERVER_CODE_SET = new Set<string>(ORIGIN_SERVER_CODES);
const TARGET_SERVER_CODE = "F28";
const HARDIY_CURRENT_IDENTIFIER = "f28_net_p4809";
const HARDIY_FOCUS = new Set(["hardiydk", "darth monk", "matti", "rover", "svenner1986"]);
const OBSERVED_HIGH_LEVEL_MEDIANS = [
  { bucket: "500-549", EU1: 3, EU2: 6, EU3: 10, EU4: 13 },
  { bucket: "550-599", EU1: 4, EU2: 8, EU3: 11, EU4: 15 },
] satisfies Array<{ bucket: string } & Record<(typeof ORIGIN_SERVER_CODES)[number], number>>;

const reportLines: string[] = [];
const line = (value = "") => {
  reportLines.push(value);
  console.log(value);
};

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

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const resolveServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const lineNumberFor = (source: string, needle: string) => {
  const index = source.indexOf(needle);
  return index < 0 ? null : source.slice(0, index).split("\n").length;
};

const extractNumberConstant = (source: string, name: string) => {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)`).exec(source);
  return match ? Number(match[1]) : null;
};

const extractServerMonths = (source: string) => {
  const block = /const\s+SERVER_MONTHS:[\s\S]*?=\s*\{([\s\S]*?)\}/.exec(source)?.[1] ?? "";
  return new Map([...block.matchAll(/'([^']+)':\s*([0-9.]+)/g)].map((match) => [match[1] ?? "", Number(match[2])]));
};

const readGaCompensationSource = (relativePath: string): GaCompensationSource => {
  const source = fs.readFileSync(path.join(GUILD_ANALYTICS_ROOT, relativePath), "utf8");
  return {
    relativePath,
    compFactor: extractNumberConstant(source, "COMP_FACTOR"),
    compDivisor: extractNumberConstant(source, "COMP_DIVISOR"),
    serverMonths: extractServerMonths(source),
    hasCompBonusFormula: /Math\.floor\(\(gold\(level\)\s*\/\s*COMP_DIVISOR\)\s*\*\s*COMP_FACTOR\s*\*\s*month\)/.test(source),
    hasMathFloor: source.includes("Math.floor"),
    hasLaunchDateText: /launch\s*date|launchDate|serverLaunch|releasedAt/i.test(source),
    lineNumbers: {
      compFactor: lineNumberFor(source, "const COMP_FACTOR"),
      compDivisor: lineNumberFor(source, "const COMP_DIVISOR"),
      serverMonths: lineNumberFor(source, "const SERVER_MONTHS"),
      compBonus: lineNumberFor(source, "const compBonus"),
    },
  };
};

const mainRepoServerMetadataSummary = () =>
  MAIN_REPO_SERVER_FILES.map((relativePath) => {
    const source = fs.readFileSync(path.resolve(relativePath), "utf8");
    return {
      relativePath,
      hasLaunchDateText: /launch\s*date|launchDate|serverLaunch|releasedAt/i.test(source),
      mentionsTarget: /F28|f28_net/.test(source),
      mentionsOrigins: ORIGIN_SERVER_CODES.every((origin) => source.includes(origin)),
    };
  });

const canonicalMonthForOrigin = (serverMonths: Map<string, number>, origin: string) => {
  const numeric = origin.replace("EU", "");
  return serverMonths.get(`s${numeric}_eu`) ?? serverMonths.get(`s${numeric}.sfgame.eu`) ?? null;
};

const floorHalfMonth = (rawMonths: number) => Math.floor(rawMonths * 2) / 2;
const inferredLevelCompensation = (adjustedMonths: number) => adjustedMonths * 2;

const roundingExamples = [0.24, 0.49, 0.5, 0.74, 0.99, 1.01, 1.49, 1.51, 5.8].map((rawMonths) => ({
  rawMonths,
  adjustedMonths: floorHalfMonth(rawMonths),
  levels: Math.floor(rawMonths * 2),
}));

const quantile = (values: number[], percentile: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
};

const statsFor = (values: number[]): Stats => ({
  count: values.length,
  min: values.length ? Math.min(...values) : null,
  median: quantile(values, 50),
  p75: quantile(values, 75),
  p90: quantile(values, 90),
  p95: quantile(values, 95),
  p99: quantile(values, 99),
  max: values.length ? Math.max(...values) : null,
});

const values = (samples: ProgressionSample[], selector: (sample: ProgressionSample) => number | null) =>
  samples.map(selector).filter((value): value is number => value != null);

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null ? "n/a" : value.toFixed(digits);

const formatDate = (value: number | null | undefined) =>
  value == null ? "missing" : new Date(value).toISOString();

const formatStats = (stats: Stats, digits = 2) =>
  `n=${stats.count} min=${formatNumber(stats.min, digits)} median=${formatNumber(stats.median, digits)} p75=${formatNumber(stats.p75, digits)} p90=${formatNumber(stats.p90, digits)} p95=${formatNumber(stats.p95, digits)} p99=${formatNumber(stats.p99, digits)} max=${formatNumber(stats.max, digits)}`;

const bucketForLevel = (level: number | null) => {
  if (level == null) return "unknown";
  if (level <= 99) return "1-99";
  if (level <= 199) return "100-199";
  if (level <= 299) return "200-299";
  if (level <= 392) return "300-392";
  if (level <= 449) return "393-449";
  if (level <= 499) return "450-499";
  if (level <= 549) return "500-549";
  if (level <= 599) return "550-599";
  return "600+";
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

const groupByIdentifier = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const isReliableLevel = (observation: PlayerFusionObservation) =>
  typeof observation.level === "number" &&
  Number.isFinite(observation.level) &&
  observation.level > 0 &&
  (observation.levelAvailability == null || observation.levelAvailability === "available");

const boundaryFor = (
  candidate: PlayerFusionCandidate,
  result: PlayerFusionPlayerResult,
  historicalByIdentifier: Map<string, PlayerFusionObservation[]>,
  currentByIdentifier: Map<string, PlayerFusionObservation[]>,
): Boundary => {
  const currentObservations = currentByIdentifier.get(normalizeKey(result.newIdentifier)) ?? [];
  const post = [...currentObservations].sort((left, right) => left.timestamp - right.timestamp).find(isReliableLevel) ?? null;
  const historicalObservations = historicalByIdentifier.get(normalizeKey(candidate.oldIdentifier)) ?? [];
  const historicalBeforePost = post
    ? historicalObservations.filter((observation) => observation.timestamp < post.timestamp)
    : historicalObservations;
  const pre =
    [...(historicalBeforePost.length ? historicalBeforePost : historicalObservations)]
      .filter(isReliableLevel)
      .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const elapsedDays = pre && post ? Math.max(0, (post.timestamp - pre.timestamp) / (24 * 60 * 60 * 1000)) : null;
  const gain = pre?.level != null && post?.level != null ? post.level - pre.level : null;
  const gainPerDay = gain != null && elapsedDays != null && elapsedDays > 0 ? gain / elapsedDays : null;

  return {
    preTimestamp: pre?.timestamp ?? null,
    preLevel: pre?.level ?? null,
    postTimestamp: post?.timestamp ?? null,
    postLevel: post?.level ?? null,
    elapsedDays,
    gain,
    gainPerDay,
    gain30: gainPerDay == null ? null : gainPerDay * 30,
  };
};

const makeSample = (
  item: FusionIdentityManagementItem,
  result: PlayerFusionPlayerResult,
  candidate: PlayerFusionCandidate,
  historicalByIdentifier: Map<string, PlayerFusionObservation[]>,
  currentByIdentifier: Map<string, PlayerFusionObservation[]>,
): ProgressionSample | null => {
  const boundary = boundaryFor(candidate, result, historicalByIdentifier, currentByIdentifier);
  const origin = resolveServerCode(candidate.oldServer) ?? "unknown";
  if (
    !ORIGIN_SERVER_CODE_SET.has(origin) ||
    boundary.preLevel == null ||
    boundary.postLevel == null ||
    boundary.elapsedDays == null ||
    boundary.gain == null ||
    boundary.gainPerDay == null
  ) {
    return null;
  }

  return {
    ...boundary,
    currentIdentifier: item.currentIdentifier,
    currentName: item.currentName,
    historicalIdentifier: candidate.oldIdentifier,
    historicalName: candidate.oldName,
    origin,
    bucket: bucketForLevel(boundary.preLevel),
  };
};

const resultByCurrent = (results: PlayerFusionPlayerResult[]) =>
  new Map(results.map((result) => [normalizeKey(result.newIdentifier), result]));

const itemByCurrent = (items: FusionIdentityManagementItem[]) =>
  new Map(items.map((item) => [normalizeKey(item.currentIdentifier), item]));

const groupSamples = (samples: ProgressionSample[], keyFor: (sample: ProgressionSample) => string) => {
  const grouped = new Map<string, ProgressionSample[]>();
  samples.forEach((sample) => {
    const key = keyFor(sample);
    grouped.set(key, [...(grouped.get(key) ?? []), sample]);
  });
  return grouped;
};

const sampleLine = (sample: ProgressionSample, compensationLevels: Record<string, number>) => {
  const compensation = compensationLevels[sample.origin] ?? 0;
  const adjustedGain = sample.gain == null ? null : sample.gain - compensation;
  const adjustedGainPerDay =
    adjustedGain != null && sample.elapsedDays != null && sample.elapsedDays > 0 ? adjustedGain / sample.elapsedDays : null;
  return `${sample.historicalName ?? sample.historicalIdentifier} origin=${sample.origin} pre=${sample.preLevel}@${formatDate(sample.preTimestamp)} post=${sample.postLevel}@${formatDate(sample.postTimestamp)} days=${formatNumber(sample.elapsedDays)} rawGain=${sample.gain} comp=${compensation} adjustedGain=${adjustedGain ?? "n/a"} adjustedGain/day=${formatNumber(adjustedGainPerDay, 3)}`;
};

const adjustedGain = (sample: ProgressionSample, compensationLevels: Record<string, number>) =>
  sample.gain == null ? null : sample.gain - (compensationLevels[sample.origin] ?? 0);

const adjustedGain30 = (sample: ProgressionSample, compensationLevels: Record<string, number>) => {
  const gain = adjustedGain(sample, compensationLevels);
  return gain != null && sample.elapsedDays != null && sample.elapsedDays > 0 ? (gain / sample.elapsedDays) * 30 : null;
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const gaSources = GA_SOURCE_FILES.map(readGaCompensationSource);
const representativeSource = gaSources[0];
assert.ok(representativeSource, "expected at least one Guild Analytics source");
const canonicalMonths = Object.fromEntries(
  ORIGIN_SERVER_CODES.map((origin) => [origin, canonicalMonthForOrigin(representativeSource.serverMonths, origin)]),
) as Record<string, number | null>;
const compensationLevels = Object.fromEntries(
  ORIGIN_SERVER_CODES.map((origin) => [origin, canonicalMonths[origin] == null ? 0 : inferredLevelCompensation(canonicalMonths[origin])]),
) as Record<string, number>;

const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
  ORIGIN_SERVER_CODE_SET.has(resolveServerCode(observation.server) ?? ""),
);
const currentPlayerObservations = allPlayerObservations.filter(
  (observation) => resolveServerCode(observation.server) === TARGET_SERVER_CODE,
);
const historicalByIdentifier = groupByIdentifier(historicalPlayerObservations);
const currentByIdentifier = groupByIdentifier(currentPlayerObservations);
const resolverResults = resolvePlayerFusions({
  historicalObservations: historicalPlayerObservations,
  newObservations: currentPlayerObservations,
}).results;
const resultByIdentifier = resultByCurrent(resolverResults);

const suffix = Date.now();
const playerDb = `fusion-compensation-player-${suffix}`;
const guildDb = `fusion-compensation-guild-${suffix}`;
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const managementReport = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = managementReport.items.filter((item) => item.entityType === "player");
const itemByIdentifier = itemByCurrent(playerItems);

const positiveControls = playerItems.flatMap((item) => {
  if (item.status !== "ready" || item.reasonCodes.length || !item.readyCandidateIdentifier) return [];
  const result = resultByIdentifier.get(normalizeKey(item.currentIdentifier));
  const candidate = result?.candidates.find(
    (entry) => normalizeKey(entry.oldIdentifier) === normalizeKey(item.readyCandidateIdentifier),
  );
  if (!result || !candidate) return [];
  const sample = makeSample(item, result, candidate, historicalByIdentifier, currentByIdentifier);
  return sample ? [sample] : [];
});

const originGroups = groupSamples(positiveControls, (sample) => sample.origin);
const originBucketGroups = groupSamples(positiveControls, (sample) => `${sample.origin}|${sample.bucket}`);
const highLevel520 = positiveControls.filter((sample) => (sample.preLevel ?? 0) >= 520);
const highLevel520ByOrigin = groupSamples(highLevel520, (sample) => sample.origin);

const hardiyResult = resultByIdentifier.get(HARDIY_CURRENT_IDENTIFIER);
const hardiyItem = itemByIdentifier.get(HARDIY_CURRENT_IDENTIFIER);
assert.ok(hardiyResult, "expected Hardiy resolver result");
assert.ok(hardiyItem, "expected Hardiy management item");
const hardiyViable = hardiyResult.candidates
  .filter((candidate) => !candidate.rejected)
  .map((candidate) => makeSample(hardiyItem, hardiyResult, candidate, historicalByIdentifier, currentByIdentifier))
  .filter((sample): sample is ProgressionSample => Boolean(sample))
  .sort((left, right) => (left.preLevel ?? 0) - (right.preLevel ?? 0));

line("# Fusion Compensation Analysis");
line(`Report generated: ${new Date().toISOString()}`);
line("");
line("## A. Source And Scope");
line(`Guild Analytics root=${GUILD_ANALYTICS_ROOT}`);
line(`Scan root=${scanRoot}`);
line(`Main repo checked=${MAIN_REPO_SERVER_FILES.join(", ")}`);
line("This report is read-only analysis. No product resolver, registry, UI, raw scan, or Firestore data was changed.");

line("");
line("## B. Existing Guild Analytics Compensation Code");
gaSources.forEach((source) => {
  line(
    `${source.relativePath}: COMP_FACTOR=${source.compFactor} line=${source.lineNumbers.compFactor}; COMP_DIVISOR=${source.compDivisor} line=${source.lineNumbers.compDivisor}; SERVER_MONTHS line=${source.lineNumbers.serverMonths}; compBonus line=${source.lineNumbers.compBonus}; formulaFound=${source.hasCompBonusFormula}; mathFloorFound=${source.hasMathFloor}; launchDateTextFound=${source.hasLaunchDateText}`,
  );
});
line("Formula implemented in those files: compBonus = Math.floor((gold(level) / COMP_DIVISOR) * COMP_FACTOR * month).");
line("This is a gold/base-stats compensation display calculation. It is not a player level compensation helper.");

line("");
line("## C. Launch Data And Month Values");
line("| Origin | Guild Analytics SERVER_MONTHS alias | Guild Analytics adjusted months | Inferred producer-note levels |");
line("| --- | --- | ---: | ---: |");
ORIGIN_SERVER_CODES.forEach((origin) => {
  const numeric = origin.replace("EU", "");
  const alias = `s${numeric}_eu`;
  const months = canonicalMonths[origin];
  line(`| ${origin} | ${alias} | ${formatNumber(months, 1)} | ${months == null ? "n/a" : formatNumber(compensationLevels[origin], 0)} |`);
});
line("Guild Analytics does not calculate these months from launch dates in the inspected source files; the half-month values are hardcoded.");
line("Main repo serverRegistry/serverFusions currently contains the EU1-EU4 -> F28 relationship but no launchDate metadata.");
mainRepoServerMetadataSummary().forEach((entry) => {
  line(`${entry.relativePath}: mentionsOrigins=${entry.mentionsOrigins} mentionsTarget=${entry.mentionsTarget} launchDateTextFound=${entry.hasLaunchDateText}`);
});

line("");
line("## D. Month Rounding Behavior");
line("Guild Analytics only floors the gold/base-stat compensation after multiplying by month; it does not contain a raw-month rounding helper.");
line("Producer/user floor-half interpretation: adjustedMonths = Math.floor(rawMonths * 2) / 2; levels = Math.floor(rawMonths * 2).");
roundingExamples.forEach((example) => {
  line(`rawMonths=${formatNumber(example.rawMonths, 2)} -> adjustedMonths=${formatNumber(example.adjustedMonths, 1)} -> levels=${example.levels}`);
});

line("");
line("## E. EU1-EU4 -> F28 Level Compensation Inference");
line("Using the hardcoded Guild Analytics adjusted month table and the producer note 'rounded half months x2 = levels':");
ORIGIN_SERVER_CODES.forEach((origin) => {
  line(`${origin}: adjustedMonths=${formatNumber(canonicalMonths[origin], 1)} -> inferredLevels=${formatNumber(compensationLevels[origin], 0)}`);
});

line("");
line("## F. Empirical High-Level Medians Adjusted By Inferred Compensation");
line("| Bucket | Origin | Observed median gain | Inferred compensation | Adjusted median gain |");
line("| --- | --- | ---: | ---: | ---: |");
OBSERVED_HIGH_LEVEL_MEDIANS.forEach((row) => {
  ORIGIN_SERVER_CODES.forEach((origin) => {
    const observed = row[origin];
    const compensation = compensationLevels[origin] ?? 0;
    line(`| ${row.bucket} | ${origin} | ${observed} | ${compensation} | ${observed - compensation} |`);
  });
  const rawValues = ORIGIN_SERVER_CODES.map((origin) => row[origin]);
  const adjustedValues = ORIGIN_SERVER_CODES.map((origin) => row[origin] - (compensationLevels[origin] ?? 0));
  line(
    `${row.bucket} spread: raw=${Math.max(...rawValues) - Math.min(...rawValues)} adjusted=${Math.max(...adjustedValues) - Math.min(...adjustedValues)}`,
  );
});

line("");
line("## G. Positive-Control Dataset");
line(`snapshots=${snapshots.length}`);
line(`historicalPlayerObservations=${historicalPlayerObservations.length}`);
line(`currentPlayerObservations=${currentPlayerObservations.length}`);
line(`playerItems=${playerItems.length}`);
line(`positiveControls=${positiveControls.length}`);
line("Comparison remains latest reliable pre-fusion level -> earliest reliable post-fusion level.");
ORIGIN_SERVER_CODES.forEach((origin) => {
  const samples = originGroups.get(origin) ?? [];
  line(`${origin} raw gain ${formatStats(statsFor(values(samples, (sample) => sample.gain)), 0)}`);
  line(`${origin} adjusted gain ${formatStats(statsFor(values(samples, (sample) => adjustedGain(sample, compensationLevels))), 0)}`);
});

line("");
line("## H. 520+ Adjusted Values");
line(`520+ count=${highLevel520.length}`);
line(`520+ raw gain ${formatStats(statsFor(values(highLevel520, (sample) => sample.gain)), 0)}`);
line(`520+ adjusted gain ${formatStats(statsFor(values(highLevel520, (sample) => adjustedGain(sample, compensationLevels))), 0)}`);
line(`520+ raw gain30 ${formatStats(statsFor(values(highLevel520, (sample) => sample.gain30)), 2)}`);
line(`520+ adjusted gain30 ${formatStats(statsFor(values(highLevel520, (sample) => adjustedGain30(sample, compensationLevels))), 2)}`);
ORIGIN_SERVER_CODES.forEach((origin) => {
  const samples = highLevel520ByOrigin.get(origin) ?? [];
  line(`${origin} 520+ count=${samples.length} adjusted gain ${formatStats(statsFor(values(samples, (sample) => adjustedGain(sample, compensationLevels))), 0)}`);
  line(`${origin} 520+ adjusted gain30 ${formatStats(statsFor(values(samples, (sample) => adjustedGain30(sample, compensationLevels))), 2)}`);
});

line("");
line("## I. Origin x High-Level Bucket Validation From Current Positive Controls");
line("| Origin | Bucket | n | raw median | compensation | adjusted median |");
line("| --- | --- | ---: | ---: | ---: | ---: |");
["500-549", "550-599", "600+"].forEach((bucket) => {
  ORIGIN_SERVER_CODES.forEach((origin) => {
    const samples = originBucketGroups.get(`${origin}|${bucket}`) ?? [];
    const raw = statsFor(values(samples, (sample) => sample.gain));
    const adjusted = statsFor(values(samples, (sample) => adjustedGain(sample, compensationLevels)));
    line(`| ${origin} | ${bucket} | ${samples.length} | ${formatNumber(raw.median, 0)} | ${formatNumber(compensationLevels[origin], 0)} | ${formatNumber(adjusted.median, 0)} |`);
  });
});

line("");
line("## J. Hardiy Candidate Matrix With Compensation");
line("| Candidate | Origin | Pre | Post | Days | Raw gain | Compensation | Adjusted gain | Adjusted gain/day |");
line("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
hardiyViable.forEach((sample) => {
  const compensation = compensationLevels[sample.origin] ?? 0;
  const sampleAdjustedGain = adjustedGain(sample, compensationLevels);
  const sampleAdjustedRate =
    sampleAdjustedGain != null && sample.elapsedDays != null && sample.elapsedDays > 0
      ? sampleAdjustedGain / sample.elapsedDays
      : null;
  line(
    `| ${sample.historicalName ?? sample.historicalIdentifier} | ${sample.origin} | ${sample.preLevel} | ${sample.postLevel} | ${formatNumber(sample.elapsedDays)} | ${sample.gain} | ${compensation} | ${sampleAdjustedGain ?? "n/a"} | ${formatNumber(sampleAdjustedRate, 3)} |`,
  );
});

line("");
line("## K. Hardiy Focus Cases");
hardiyViable
  .filter((sample) => HARDIY_FOCUS.has(normalizeText(sample.historicalName)))
  .forEach((sample) => line(sampleLine(sample, compensationLevels)));
line("HardiyDK/f28_net_p4809 is EU1, so inferred compensation is 0: 586 -> 589 remains rawGain=3 and adjustedGain=3.");

line("");
line("## L. Gold Compensation Relevance");
line("The discovered Guild Analytics compensation is based on gold(level), COMP_DIVISOR, COMP_FACTOR, and SERVER_MONTHS.");
line("It adjusts displayed base-stat/gold-equivalent values, not player identity level progression. It should not be imported into the identity resolver as-is.");

line("");
line("## M. Recommendation");
line("Add explicit launchDate/effectiveAt metadata in the main repo before implementing official level compensation.");
line("A safe future helper can derive oldest origin launch date for a fusion target, compute raw month difference, floor to half-months, then convert to level compensation as Math.floor(rawMonths * 2).");
line("Until official Playa level compensation details are confirmed, use the inferred 0/3/6/9 levels only as analysis evidence, not as production resolver behavior.");

fs.writeFileSync(REPORT_PATH, `${reportLines.join("\n")}\n`, "utf8");
line("");
line(`Full report written to ${REPORT_PATH}`);

await playerStore.close();
await guildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
