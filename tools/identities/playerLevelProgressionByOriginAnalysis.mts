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
  selectPlayerFusionReadyCandidates,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";

type JsonRecord = Record<string, unknown>;

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

type FalseSample = ProgressionSample & {
  managementStatus: string;
};

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

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const REPORT_PATH = path.resolve("tools/identities/player-level-progression-by-origin.latest.txt");
const ORIGIN_SERVER_CODES = ["EU1", "EU2", "EU3", "EU4"];
const ORIGIN_SERVER_CODE_SET = new Set(ORIGIN_SERVER_CODES);
const TARGET_SERVER_CODE = "F28";
const HARDIY_CURRENT_IDENTIFIER = "f28_net_p4809";
const HARDIY_FOCUS = new Set(["hardiydk", "darth monk", "matti", "rover", "svenner1986"]);
const MIN_REFERENCE_N = 10;

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

const BUCKETS = ["1-99", "100-199", "200-299", "300-392", "393-449", "450-499", "500-549", "550-599", "600+"];

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

const percentileRank = (values: number[], value: number | null) => {
  if (value == null || !values.length) return null;
  return (values.filter((entry) => entry <= value).length / values.length) * 100;
};

const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null ? "n/a" : value.toFixed(digits);

const formatDate = (value: number | null | undefined) =>
  value == null ? "missing" : new Date(value).toISOString();

const formatStats = (stats: Stats, digits = 2) =>
  `n=${stats.count} min=${formatNumber(stats.min, digits)} median=${formatNumber(stats.median, digits)} p75=${formatNumber(stats.p75, digits)} p90=${formatNumber(stats.p90, digits)} p95=${formatNumber(stats.p95, digits)} p99=${formatNumber(stats.p99, digits)} max=${formatNumber(stats.max, digits)}`;

const values = (samples: ProgressionSample[], selector: (sample: ProgressionSample) => number | null) =>
  samples.map(selector).filter((value): value is number => value != null);

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
  const pre = [...(historicalBeforePost.length ? historicalBeforePost : historicalObservations)]
    .filter(isReliableLevel)
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const elapsedDays =
    pre && post ? Math.max(0, (post.timestamp - pre.timestamp) / (24 * 60 * 60 * 1000)) : null;
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

const sampleLine = (sample: ProgressionSample) =>
  `${sample.currentName ?? sample.currentIdentifier} <= ${sample.historicalName ?? sample.historicalIdentifier} ` +
  `origin=${sample.origin} bucket=${sample.bucket} pre=${sample.preLevel}@${formatDate(sample.preTimestamp)} ` +
  `post=${sample.postLevel}@${formatDate(sample.postTimestamp)} days=${formatNumber(sample.elapsedDays)} ` +
  `gain=${sample.gain} gainDay=${formatNumber(sample.gainPerDay, 3)} gain30=${formatNumber(sample.gain30, 2)}`;

const resultByCurrent = (results: PlayerFusionPlayerResult[]) =>
  new Map(results.map((result) => [normalizeKey(result.newIdentifier), result]));

const itemByCurrent = (items: FusionIdentityManagementItem[]) =>
  new Map(items.map((item) => [normalizeKey(item.currentIdentifier), item]));

const groupSamples = (samples: ProgressionSample[], keyFor: (sample: ProgressionSample) => string) => {
  const grouped = new Map<string, ProgressionSample[]>();
  samples.forEach((sample) => grouped.set(keyFor(sample), [...(grouped.get(keyFor(sample)) ?? []), sample]));
  return grouped;
};

const classificationFor = (sample: ProgressionSample, references: ProgressionSample[]) => {
  if (!references.length) return "unavailable";
  if (references.length < MIN_REFERENCE_N) return "insufficient sample";
  const gainStats = statsFor(values(references, (entry) => entry.gain));
  const rateStats = statsFor(values(references, (entry) => entry.gainPerDay));
  if ((sample.gain ?? 0) > (gainStats.max ?? Number.POSITIVE_INFINITY) || (sample.gainPerDay ?? 0) > (rateStats.max ?? Number.POSITIVE_INFINITY)) {
    return "extreme progression contradiction";
  }
  if ((sample.gain ?? 0) <= (gainStats.p95 ?? Number.NEGATIVE_INFINITY) && (sample.gainPerDay ?? 0) <= (rateStats.p95 ?? Number.NEGATIVE_INFINITY)) {
    return "normal progression";
  }
  return "plausible burst";
};

const referenceFor = (sample: ProgressionSample, positives: ProgressionSample[]) => {
  const exact = positives.filter((entry) => entry.origin === sample.origin && entry.bucket === sample.bucket);
  if (exact.length >= MIN_REFERENCE_N) return { label: `${sample.origin}/${sample.bucket}`, samples: exact };
  const bucket = positives.filter((entry) => entry.bucket === sample.bucket);
  if (bucket.length >= MIN_REFERENCE_N) return { label: `all origins/${sample.bucket}`, samples: bucket };
  const origin = positives.filter((entry) => entry.origin === sample.origin);
  if (origin.length >= MIN_REFERENCE_N) return { label: `${sample.origin}/all buckets`, samples: origin };
  return { label: "global", samples: positives };
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
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
const playerDb = `player-progression-origin-${suffix}`;
const guildDb = `guild-progression-origin-${suffix}`;
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });
const playerItems = report.items.filter((item) => item.entityType === "player");
const itemByIdentifier = itemByCurrent(playerItems);

const positiveControls = playerItems.flatMap((item) => {
  if (item.status !== "ready" || item.reasonCodes.length || !item.readyCandidateIdentifier) return [];
  const result = resultByIdentifier.get(normalizeKey(item.currentIdentifier));
  const candidate = result?.candidates.find((entry) => normalizeKey(entry.oldIdentifier) === normalizeKey(item.readyCandidateIdentifier));
  if (!result || !candidate) return [];
  const sample = makeSample(item, result, candidate, historicalByIdentifier, currentByIdentifier);
  return sample ? [sample] : [];
});

const falseControls: FalseSample[] = playerItems.flatMap((item) => {
  if (item.status !== "review") return [];
  const result = resultByIdentifier.get(normalizeKey(item.currentIdentifier));
  if (!result) return [];
  const readyCandidate = selectPlayerFusionReadyCandidates(result)[0] ?? null;
  return result.candidates.flatMap((candidate) => {
    if (candidate.rejected || candidate.evidence.originMatches !== true || candidate.evidence.sameClass !== true || candidate.evidence.levelConsistent !== true) {
      return [];
    }
    if (readyCandidate && normalizeKey(readyCandidate.oldIdentifier) === normalizeKey(candidate.oldIdentifier)) return [];
    const sample = makeSample(item, result, candidate, historicalByIdentifier, currentByIdentifier);
    return sample ? [{ ...sample, managementStatus: item.status }] : [];
  });
});

const origins = ORIGIN_SERVER_CODES;
const originGroups = groupSamples(positiveControls, (sample) => sample.origin);
const bucketGroups = groupSamples(positiveControls, (sample) => sample.bucket);
const originBucketGroups = groupSamples(positiveControls, (sample) => `${sample.origin}|${sample.bucket}`);
const falseOriginBucketGroups = groupSamples(falseControls, (sample) => `${sample.origin}|${sample.bucket}`);

line("# Player Level Progression By Origin Analysis");
line(`Report generated: ${new Date().toISOString()}`);
line("");
line("## A. Dataset");
line(`scans=${snapshots.length}`);
line(`historicalPlayerObservations=${historicalPlayerObservations.length}`);
line(`currentPlayerObservations=${currentPlayerObservations.length}`);
line(`playerItems=${playerItems.length}`);
line(`positiveControls=${positiveControls.length}`);
line(`falseControls=${falseControls.length}`);
line(`comparison=latest reliable pre-fusion level -> earliest reliable post-fusion level`);
line(`levelAvailability=available numeric levels only; missing/unsupported/invalid pairs excluded`);

line("");
line("## B. Origin Distribution");
origins.forEach((origin) => {
  const samples = originGroups.get(origin) ?? [];
  line(`${origin} gain ${formatStats(statsFor(values(samples, (sample) => sample.gain)), 0)}`);
  line(`${origin} gain/day ${formatStats(statsFor(values(samples, (sample) => sample.gainPerDay)), 3)}`);
});

line("");
line("## C. Level Bucket Distribution");
BUCKETS.forEach((bucket) => {
  const samples = bucketGroups.get(bucket) ?? [];
  line(`${bucket} gain ${formatStats(statsFor(values(samples, (sample) => sample.gain)), 0)}`);
  line(`${bucket} gain/day ${formatStats(statsFor(values(samples, (sample) => sample.gainPerDay)), 3)}`);
});

line("");
line("## D. Origin x Bucket Matrix");
line("| Origin | Bucket | n | median gain | p90 | p95 | p99 | max | median/day | p95/day | max/day |");
line("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
origins.forEach((origin) => {
  BUCKETS.forEach((bucket) => {
    const samples = originBucketGroups.get(`${origin}|${bucket}`) ?? [];
    const gain = statsFor(values(samples, (sample) => sample.gain));
    const rate = statsFor(values(samples, (sample) => sample.gainPerDay));
    line(`| ${origin} | ${bucket} | ${samples.length} | ${formatNumber(gain.median, 0)} | ${formatNumber(gain.p90, 0)} | ${formatNumber(gain.p95, 0)} | ${formatNumber(gain.p99, 0)} | ${formatNumber(gain.max, 0)} | ${formatNumber(rate.median, 3)} | ${formatNumber(rate.p95, 3)} | ${formatNumber(rate.max, 3)} |`);
  });
});

line("");
line("## E. 520+ Results");
const highLevel = positiveControls.filter((sample) => (sample.preLevel ?? 0) >= 520);
line(`520+ count=${highLevel.length}`);
line(`520+ gain ${formatStats(statsFor(values(highLevel, (sample) => sample.gain)), 0)}`);
line(`520+ gain30 ${formatStats(statsFor(values(highLevel, (sample) => sample.gain30)), 2)}`);
const eu1HighLevel = highLevel.filter((sample) => sample.origin === "EU1");
line(`EU1 520+ count=${eu1HighLevel.length}`);
line(`EU1 520+ gain30 ${formatStats(statsFor(values(eu1HighLevel, (sample) => sample.gain30)), 2)}`);
line("User context check: 3-5 levels/month is broadly near the lower/normal part of EU1 520+; observed outliers exceed it and need burst/compensation caution.");

line("");
line("## F. Empirical Fusion Compensation Signal");
line("Observed offsets are empirical medians only, NOT the official Playa compensation formula.");
["500-549", "550-599", "600+"].forEach((bucket) => {
  const medians = origins.map((origin) => {
    const samples = originBucketGroups.get(`${origin}|${bucket}`) ?? [];
    return { origin, n: samples.length, median: statsFor(values(samples, (sample) => sample.gain)).median };
  });
  const eu1Median = medians.find((entry) => entry.origin === "EU1")?.median ?? null;
  line(
    `${bucket}: ` +
      medians.map((entry) => `${entry.origin} n=${entry.n} median=${formatNumber(entry.median, 0)} offsetVsEU1=${eu1Median == null || entry.median == null ? "n/a" : formatNumber(entry.median - eu1Median, 0)}`).join("; "),
  );
});

line("");
line("## G. Extreme Legitimate Matches");
positiveControls
  .filter((sample) => (sample.preLevel ?? 0) >= 500)
  .sort((left, right) => (right.gain ?? 0) - (left.gain ?? 0) || (right.gainPerDay ?? 0) - (left.gainPerDay ?? 0))
  .slice(0, 20)
  .forEach((sample, index) => {
    line(`${index + 1}. ${sampleLine(sample)} interpretation=data shows a legitimate ready match; cause not inferred`);
  });

line("");
line("## H. False Candidate Separation");
line("| Origin | Bucket | positive n | false n | within p95 | within p99 | above p99 | extreme beyond positive range | insufficient sample |");
line("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
let totalWithinP95 = 0;
let totalWithinP99 = 0;
let totalAboveP99 = 0;
let totalExtreme = 0;
let totalInsufficient = 0;
origins.forEach((origin) => {
  BUCKETS.forEach((bucket) => {
    const positives = originBucketGroups.get(`${origin}|${bucket}`) ?? [];
    const falseSamples = falseOriginBucketGroups.get(`${origin}|${bucket}`) ?? [];
    const gainStats = statsFor(values(positives, (sample) => sample.gain));
    const rateStats = statsFor(values(positives, (sample) => sample.gainPerDay));
    const counts = falseSamples.reduce(
      (entryCounts, sample) => {
        if (positives.length < MIN_REFERENCE_N) {
          entryCounts.insufficient += 1;
        } else if ((sample.gain ?? 0) > (gainStats.max ?? 0) || (sample.gainPerDay ?? 0) > (rateStats.max ?? 0)) {
          entryCounts.extreme += 1;
        } else if ((sample.gain ?? 0) > (gainStats.p99 ?? 0) || (sample.gainPerDay ?? 0) > (rateStats.p99 ?? 0)) {
          entryCounts.aboveP99 += 1;
        } else if ((sample.gain ?? 0) <= (gainStats.p95 ?? 0) && (sample.gainPerDay ?? 0) <= (rateStats.p95 ?? 0)) {
          entryCounts.withinP95 += 1;
        } else {
          entryCounts.withinP99 += 1;
        }
        return entryCounts;
      },
      { withinP95: 0, withinP99: 0, aboveP99: 0, extreme: 0, insufficient: 0 },
    );
    totalWithinP95 += counts.withinP95;
    totalWithinP99 += counts.withinP99;
    totalAboveP99 += counts.aboveP99;
    totalExtreme += counts.extreme;
    totalInsufficient += counts.insufficient;
    line(`| ${origin} | ${bucket} | ${positives.length} | ${falseSamples.length} | ${counts.withinP95} | ${counts.withinP99} | ${counts.aboveP99} | ${counts.extreme} | ${counts.insufficient} |`);
  });
});
line(`Totals: withinP95=${totalWithinP95} withinP99=${totalWithinP99} aboveP99=${totalAboveP99} extreme=${totalExtreme} insufficientSample=${totalInsufficient}`);

line("");
line("## I. Hardiy Candidate Matrix");
const hardiyResult = resultByIdentifier.get(HARDIY_CURRENT_IDENTIFIER);
const hardiyItem = itemByIdentifier.get(HARDIY_CURRENT_IDENTIFIER);
assert.ok(hardiyResult, "expected Hardiy resolver result");
assert.ok(hardiyItem, "expected Hardiy management item");
const hardiyViable = hardiyResult.candidates
  .filter((candidate) => !candidate.rejected)
  .map((candidate) => makeSample(hardiyItem, hardiyResult, candidate, historicalByIdentifier, currentByIdentifier))
  .filter((sample): sample is ProgressionSample => Boolean(sample))
  .sort((left, right) => (left.preLevel ?? 0) - (right.preLevel ?? 0));
const hardiyPost = hardiyViable[0];
line(`Hardiy earliest reliable post=${hardiyPost?.postLevel ?? "n/a"} @ ${formatDate(hardiyPost?.postTimestamp)}`);
line("| Candidate | Origin | Pre Level | Post Level | Days | Gain | Gain/day | Origin bucket | Reference | Positive percentile | Category |");
line("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |");
hardiyViable.forEach((sample) => {
  const reference = referenceFor(sample, positiveControls);
  const referenceGains = values(reference.samples, (entry) => entry.gain);
  const percentile = percentileRank(referenceGains, sample.gain);
  line(`| ${sample.historicalName ?? sample.historicalIdentifier} | ${sample.origin} | ${sample.preLevel} | ${sample.postLevel} | ${formatNumber(sample.elapsedDays)} | ${sample.gain} | ${formatNumber(sample.gainPerDay, 3)} | ${sample.bucket} | ${reference.label} n=${reference.samples.length} | ${formatNumber(percentile, 1)} | ${classificationFor(sample, reference.samples)} |`);
});

line("");
line("## J. HardiyDK");
const hardiyDk = hardiyViable.find((sample) => normalizeText(sample.historicalName) === "hardiydk");
const hardiyDkReference = hardiyDk ? positiveControls.filter((sample) => sample.origin === "EU1" && sample.bucket === "550-599") : [];
if (hardiyDk) {
  line(sampleLine(hardiyDk));
  line(`EU1/550-599 reference ${formatStats(statsFor(values(hardiyDkReference, (sample) => sample.gain)), 0)}`);
  line(`EU1/550-599 gain/day reference ${formatStats(statsFor(values(hardiyDkReference, (sample) => sample.gainPerDay)), 3)}`);
  line(`category=${classificationFor(hardiyDk, hardiyDkReference)} gainPercentile=${formatNumber(percentileRank(values(hardiyDkReference, (sample) => sample.gain), hardiyDk.gain), 1)}`);
}

line("");
line("## K. Darth Monk / Matti / Rover / Svenner1986");
hardiyViable
  .filter((sample) => HARDIY_FOCUS.has(normalizeText(sample.historicalName)))
  .forEach((sample) => {
    const reference = referenceFor(sample, positiveControls);
    line(`${sample.historicalName}: ${sampleLine(sample)} reference=${reference.label} n=${reference.samples.length} category=${classificationFor(sample, reference.samples)} gainPercentile=${formatNumber(percentileRank(values(reference.samples, (entry) => entry.gain), sample.gain), 1)} ratePercentile=${formatNumber(percentileRank(values(reference.samples, (entry) => entry.gainPerDay), sample.gainPerDay), 1)}`);
  });

line("");
line("## L. Counterfactual Review Impact");
const falseExtremeKeys = new Set(
  falseControls
    .filter((sample) => classificationFor(sample, referenceFor(sample, positiveControls).samples) === "extreme progression contradiction")
    .map((sample) => `${normalizeKey(sample.currentIdentifier)}::${normalizeKey(sample.historicalIdentifier)}`),
);
let reviewPlayersAffected = 0;
let exactlyOneRemaining = 0;
let stillAmbiguous = 0;
let zeroRemaining = 0;
playerItems.filter((item) => item.status === "review").forEach((item) => {
  const result = resultByIdentifier.get(normalizeKey(item.currentIdentifier));
  if (!result) return;
  const viable = result.candidates.filter((candidate) => !candidate.rejected && candidate.evidence.originMatches === true && candidate.evidence.sameClass === true && candidate.evidence.levelConsistent === true);
  const remaining = viable.filter((candidate) => !falseExtremeKeys.has(`${normalizeKey(item.currentIdentifier)}::${normalizeKey(candidate.oldIdentifier)}`));
  if (remaining.length === viable.length) return;
  reviewPlayersAffected += 1;
  if (remaining.length === 1) exactlyOneRemaining += 1;
  else if (remaining.length === 0) zeroRemaining += 1;
  else stillAmbiguous += 1;
});
line(`reviewPlayersAffected=${reviewPlayersAffected}`);
line(`reviewsWithExactly1CandidateRemaining=${exactlyOneRemaining}`);
line(`reviewsStillAmbiguous=${stillAmbiguous}`);
line(`reviewsWith0CandidatesRemaining=${zeroRemaining}`);
line("If 0 candidates remain, historical observations still existed; the diagnostic outcome would be unresolved, not No Historical Observation.");

line("");
line("## M. Recommended Resolver Rule");
line("Recommendation: implement levelProgression as bucket-aware evidence first, not as a naive hard max-level rule.");
line("Use same-origin + pre-level bucket positive controls where sample size is sufficient; otherwise mark insufficient sample or fall back only as supporting evidence.");
line("Suggested categories: normal progression, plausible burst, extreme progression contradiction, insufficient sample, unavailable.");
line("For high-level EU1 candidates, extreme progression beyond observed positive range is a strong contradiction signal; HardiyDK is normal, while Darth Monk/Rover/Svenner1986 are extreme under current diagnostics.");
line("Do not implement official compensation adjustment until the Playa fusion compensation formula is provided.");

line("");
line("## N. Open Question");
line("Need official/known Playa fusion compensation formula from user.");
line("Community level curve context: XP curve peaks around Level 393 and declines afterward; gold curve is not relevant for Player Identity Level Progression.");
line("Goldcurve: not relevant for Player Identity Level Progression.");

fs.writeFileSync(REPORT_PATH, `${reportLines.join("\n")}\n`, "utf8");
line("");
line(`Full report written to ${REPORT_PATH}`);

await playerStore.close();
await guildStore.close();
await deleteDB(playerDb);
await deleteDB(guildDb);
