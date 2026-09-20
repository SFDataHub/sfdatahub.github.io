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
import { createFusionIdentityGuildObservations, createFusionIdentityObservations } from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import {
  resolvePlayerFusions,
  type PlayerFusionCandidate,
  type PlayerFusionObservation,
  type PlayerFusionPlayerResult,
} from "../../src/lib/identities/playerFusionResolver.ts";
import {
  resolveGuildFusions,
  type GuildFusionGuildResult,
  type GuildFusionPlayerMatch,
} from "../../src/lib/identities/guildFusionResolver.ts";
import { createGuildIdentityStore } from "../../src/lib/identities/guildIdentityStore.ts";
import { createPlayerIdentityStore } from "../../src/lib/identities/playerIdentityStore.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import { normalizeSfPlayerCharacterCore, type NormalizedPlayer } from "../../src/lib/parsing/normalizedPlayer.ts";
import {
  createNormalizedGuildIndexes,
  linkNormalizedPlayerToGuildMember,
  normalizeSfGuildsFromScan,
} from "../../src/lib/parsing/normalizedGuild.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const TARGET_PLAYER = "f28_net_p209891";
const ORIGIN_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_CODE = "F28";
const GUILD_CASES = ["Magic Mushrooms", "Hangover", "Erben im Wandel", "Legion Z"];

const CLASS_LABELS: Record<string, string> = {
  "1": "Warrior",
  "2": "Mage",
  "3": "Scout",
  "4": "Assassin",
  "5": "Berserker",
  "6": "Battle Mage",
  "7": "Demon Hunter",
  "8": "Druid",
  "9": "Bard",
  "10": "Necromancer",
  "11": "Paladin",
  "12": "Plague Doctor",
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

const normalizeIdentifierKey = (value: unknown) =>
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

const formatDate = (timestamp: number | null | undefined) =>
  timestamp == null ? "missing" : new Date(timestamp).toISOString();

const formatClass = (classId: string | number | null | undefined) => {
  const key = String(classId ?? "").trim();
  return key ? `${CLASS_LABELS[key] ?? `Class ${key}`} (${key})` : "unknown";
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

const latestByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

const firstByTimestamp = <T extends { timestamp: number }>(values: T[]) =>
  [...values].sort((left, right) => left.timestamp - right.timestamp)[0] ?? null;

const groupPlayerObservations = (observations: PlayerFusionObservation[]) => {
  const grouped = new Map<string, PlayerFusionObservation[]>();
  observations.forEach((observation) => {
    const key = normalizeIdentifierKey(observation.identifier);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  });
  return grouped;
};

const rawPlayerByIdentifier = (snapshot: GuildHubLogicalScanSnapshot) => {
  const lookup = new Map<string, JsonRecord>();
  snapshot.players.map(asRecord).forEach((player) => {
    const key = normalizeIdentifierKey(player?.identifier);
    if (key && player) lookup.set(key, player);
  });
  return lookup;
};

const findRawPlayer = (snapshots: GuildHubLogicalScanSnapshot[], observation: PlayerFusionObservation) => {
  const snapshot = snapshots.find((entry) => entry.timestampMs === observation.timestamp);
  if (!snapshot) return null;
  return rawPlayerByIdentifier(snapshot).get(normalizeIdentifierKey(observation.identifier)) ?? null;
};

const normalizeRawPlayer = (
  snapshots: GuildHubLogicalScanSnapshot[],
  observation: PlayerFusionObservation,
): { normalized: NormalizedPlayer | null; link: ReturnType<typeof linkNormalizedPlayerToGuildMember> | null } => {
  const snapshot = snapshots.find((entry) => entry.timestampMs === observation.timestamp);
  const rawPlayer = snapshot ? rawPlayerByIdentifier(snapshot).get(normalizeIdentifierKey(observation.identifier)) ?? null : null;
  if (!snapshot || !rawPlayer) return { normalized: null, link: null };
  const normalized = normalizeSfPlayerCharacterCore(rawPlayer);
  const guilds = normalizeSfGuildsFromScan(snapshot.rawData);
  const link = linkNormalizedPlayerToGuildMember(normalized, createNormalizedGuildIndexes(guilds));
  return { normalized, link };
};

const fieldStatus = (normalized: NormalizedPlayer | null, pathName: string) =>
  normalized?.metadata.fields[pathName]?.status ?? "missing";

const semanticSummary = (normalized: NormalizedPlayer | null) => {
  const paths = [
    "identity.id",
    "identity.name",
    "identity.class",
    "progression.level",
    "guild.identifier",
    "guild.name",
    "attributes.strength.base",
    "attributes.strength.purchased",
    "fortress.buildings.fortress",
    "normal.entries.0.progress",
    "scrapbook.count",
    "resources.currencies.mushrooms.current",
    "underworld.buildings.heart",
    "extras.registeredAt",
  ];
  return paths.map((entry) => `${entry}=${fieldStatus(normalized, entry)}`).join(", ");
};

const describeObservation = (
  observation: PlayerFusionObservation,
  snapshots: GuildHubLogicalScanSnapshot[],
  label = "-",
) => {
  const { normalized, link } = normalizeRawPlayer(snapshots, observation);
  return [
    `${label} ${formatDate(observation.timestamp)} ${observation.identifier}`,
    `  name=${observation.name} server=${resolveServerCode(observation.server) ?? observation.server ?? "unknown"} class=${formatClass(observation.classId)} level=${observation.level ?? "unknown"}`,
    `  guild=${observation.guildName ?? "unknown"} (${observation.guildIdentifier ?? "unknown"}) originNumericId=${observation.originNumericId ?? "none"}`,
    `  normalized: layout=${normalized?.metadata.layout ?? "missing"} id=${normalized?.identity.id ?? "missing"} registeredAt=${normalized?.extended.extras.registeredAt ?? "missing"}`,
    `  availability: ${semanticSummary(normalized)}`,
    `  guild link: linked=${link?.linked ?? false} ambiguous=${link?.ambiguous ?? false} guild=${link?.guildReference?.name ?? "missing"} (${link?.guildReference?.identifier ?? "missing"}) role=${link?.role ?? "missing"}`,
  ].join("\n");
};

const candidateLine = (candidate: PlayerFusionCandidate | null | undefined) => {
  if (!candidate) return "missing";
  const evidence = candidate.evidence;
  return [
    `${candidate.oldIdentifier} name=${candidate.oldName ?? "unknown"} server=${candidate.oldServer ?? "unknown"} class=${formatClass(candidate.oldClassId)} level=${candidate.oldLevel ?? "unknown"}`,
    `rejected=${candidate.rejected} rejectReasons=${candidate.rejectReasons.join(",") || "none"}`,
    `origin=${evidence.originMatches} class=${evidence.sameClass} level=${evidence.levelConsistent} exactName=${evidence.exactName} fusionBaseName=${evidence.fusionBaseName} sameGuild=${evidence.sameGuild}`,
  ].join(" | ");
};

const buildHighConfidencePlayerMatches = (playerResults: PlayerFusionPlayerResult[]): GuildFusionPlayerMatch[] =>
  playerResults.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = result.candidates.find(
      (item) => !item.rejected && (item.evidence.exactName || item.evidence.fusionBaseName),
    );
    if (!candidate) return [];
    return [{ oldIdentifier: candidate.oldIdentifier, oldName: candidate.oldName, newIdentifier: result.newIdentifier, newName: null }];
  });

const runPlayerResolverForCurrent = (
  historicalObservations: PlayerFusionObservation[],
  currentObservation: PlayerFusionObservation,
) => resolvePlayerFusions({ historicalObservations, newObservations: [currentObservation] }).results[0] ?? null;

const statusCounts = (items: FusionIdentityManagementItem[]) =>
  items.reduce(
    (counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

const hasGuildChange = (observations: PlayerFusionObservation[]) =>
  new Set(observations.map((entry) => normalizeText(entry.guildIdentifier ?? entry.guildName))).size > 1;

const hasNameChange = (observations: PlayerFusionObservation[]) =>
  new Set(observations.map((entry) => normalizeText(entry.name))).size > 1;

const hasSameGuildCandidate = (result: PlayerFusionPlayerResult | null) =>
  Boolean(result?.candidates.some((candidate) => !candidate.rejected && candidate.evidence.sameGuild === true));

const printSection = (title: string) => {
  console.log(`\n## ${title}`);
};

const scanRootArg = process.argv.find((arg) => arg.startsWith("--scanRoot="));
const positionalScanRoot = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const scanRoot = scanRootArg?.slice("--scanRoot=".length) || positionalScanRoot || DEFAULT_SCAN_ROOT;
const targetPlayerArg = process.argv.find((arg) => arg.startsWith("--player="));
const targetPlayer = normalizeIdentifierKey(targetPlayerArg?.slice("--player=".length) || TARGET_PLAYER);

const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);

assert.ok(snapshots.length > 0, "expected real scan snapshots");

const allPlayerObservations = snapshots.flatMap(createFusionIdentityObservations);
const historicalPlayerObservations = allPlayerObservations.filter((observation) =>
  ORIGIN_CODES.has(resolveServerCode(observation.server) ?? ""),
);
const currentPlayerObservations = allPlayerObservations.filter((observation) => resolveServerCode(observation.server) === TARGET_CODE);
const currentGroups = groupPlayerObservations(currentPlayerObservations);
const representativeCurrentObservations = [...currentGroups.values()].map((observations) => latestByTimestamp(observations) ?? observations[0]);
const playerResults = resolvePlayerFusions({
  historicalObservations: historicalPlayerObservations,
  newObservations: representativeCurrentObservations,
}).results;
const resultByCurrent = new Map(playerResults.map((result) => [normalizeIdentifierKey(result.newIdentifier), result]));

const dbSuffix = Date.now();
const playerDb = `fusion-observation-history-player-${dbSuffix}`;
const guildDb = `fusion-observation-history-guild-${dbSuffix}`;
await deleteDB(playerDb);
await deleteDB(guildDb);
const playerStore = createPlayerIdentityStore({ dbName: playerDb });
const guildStore = createGuildIdentityStore({ dbName: guildDb });
const report = await buildFusionIdentityManagementReportFromSnapshots({ snapshots, playerStore, guildStore });

try {
  const targetObservations = [...(currentGroups.get(targetPlayer) ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  assert.ok(targetObservations.length > 0, `expected observations for ${targetPlayer}`);
  const firstPost = firstByTimestamp(targetObservations);
  const latestPost = latestByTimestamp(targetObservations);
  assert.ok(firstPost && latestPost);

  const makioHistorical = historicalPlayerObservations
    .filter(
      (observation) =>
        normalizeText(observation.name) === "makiohs" ||
        (normalizeText(observation.name).includes("makio") && normalizeText(observation.guildName) === "welten im wandel"),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  const makioHs =
    [...makioHistorical]
      .filter(
        (observation) =>
          normalizeText(observation.name) === "makiohs" &&
          resolveServerCode(observation.server) === "EU3" &&
          observation.timestamp < firstPost.timestamp,
      )
      .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;

  const latestResult = resultByCurrent.get(targetPlayer) ?? null;
  const firstResult = runPlayerResolverForCurrent(historicalPlayerObservations, firstPost);
  const latestSingleResult = runPlayerResolverForCurrent(historicalPlayerObservations, latestPost);
  const makioHsLatestCandidate = makioHs
    ? latestResult?.candidates.find((candidate) => normalizeIdentifierKey(candidate.oldIdentifier) === normalizeIdentifierKey(makioHs.identifier))
    : null;
  const makioHsFirstCandidate = makioHs
    ? firstResult?.candidates.find((candidate) => normalizeIdentifierKey(candidate.oldIdentifier) === normalizeIdentifierKey(makioHs.identifier))
    : null;
  const managementItem = report.items.find(
    (item) => item.entityType === "player" && normalizeIdentifierKey(item.currentIdentifier) === targetPlayer,
  );

  printSection("Pipeline Code Path");
  console.log("fusionIdentityManagement.ts groups all current observations, then calls resolvePlayerFusions with latestByTimestamp(observations) per current identifier.");
  console.log("Management item observations[] are retained for UI/metadata, but PlayerFusionResolver receives one representative current observation per current identifier.");
  console.log(`Current player resolver inputs: ${representativeCurrentObservations.length}; current observation rows collected: ${currentPlayerObservations.length}`);

  printSection("Makio Timeline");
  console.log(`Current identifier: ${targetPlayer}`);
  console.log(`Post-fusion observations: ${targetObservations.length}`);
  targetObservations.forEach((observation, index) => console.log(describeObservation(observation, snapshots, `${index + 1}.`)));

  printSection("Historical MakioHS");
  console.log(`Historical Makio-like observations: ${makioHistorical.length}`);
  makioHistorical.forEach((observation, index) => console.log(describeObservation(observation, snapshots, `${index + 1}.`)));
  console.log(`Selected MakioHS identifier: ${makioHs?.identifier ?? "missing"}`);

  printSection("Candidate Decision Trace");
  console.log(`Management status: ${managementItem?.status ?? "missing"} readyCandidate=${managementItem?.readyCandidateIdentifier ?? "none"}`);
  console.log(`Latest representative observation used by management resolver: ${formatDate(latestPost.timestamp)} guild=${latestPost.guildName ?? "unknown"} (${latestPost.guildIdentifier ?? "unknown"})`);
  console.log(`Latest-result status=${latestResult?.status ?? "missing"} originSource=${latestResult?.originSource ?? "missing"} origins=${latestResult?.resolvedOriginServers.join(",") || "none"}`);
  console.log(`MakioHS in historical pool: ${makioHs ? "yes" : "no"}`);
  console.log(`MakioHS passes origin filter for latest representative: ${makioHs && latestResult?.resolvedOriginServers.includes(resolveServerCode(makioHs.server) ?? "") ? "yes" : "no"}`);
  console.log(`MakioHS candidate in latest management resolver result: ${makioHsLatestCandidate ? "yes" : "no"}`);
  console.log(`Latest candidate detail: ${candidateLine(makioHsLatestCandidate)}`);
  console.log(`MakioHS candidate using first post-fusion observation only: ${makioHsFirstCandidate ? "yes" : "no"}`);
  console.log(`First-observation candidate detail: ${candidateLine(makioHsFirstCandidate)}`);
  console.log(`Latest-only direct rerun detail: ${candidateLine(makioHs ? latestSingleResult?.candidates.find((candidate) => normalizeIdentifierKey(candidate.oldIdentifier) === normalizeIdentifierKey(makioHs.identifier)) : null)}`);

  printSection("First vs Latest Observation");
  console.log(`First post-fusion: ${formatDate(firstPost.timestamp)} name=${firstPost.name} guild=${firstPost.guildName} level=${firstPost.level} origin=${firstPost.originNumericId ?? "none"}`);
  console.log(`Latest post-fusion: ${formatDate(latestPost.timestamp)} name=${latestPost.name} guild=${latestPost.guildName} level=${latestPost.level} origin=${latestPost.originNumericId ?? "none"}`);
  console.log(`Name changed across current observations: ${hasNameChange(targetObservations) ? "yes" : "no"}`);
  console.log(`Guild changed across current observations: ${hasGuildChange(targetObservations) ? "yes" : "no"}`);
  console.log(`Existing name evidence MakioHS -> Makio: exact=${makioHsFirstCandidate?.evidence.exactName ?? false}, fusionBase=${makioHsFirstCandidate?.evidence.fusionBaseName ?? false}`);
  console.log(`Hard filters with first observation: origin=${makioHsFirstCandidate?.evidence.originMatches ?? "missing"} class=${makioHsFirstCandidate?.evidence.sameClass ?? "missing"} level=${makioHsFirstCandidate?.evidence.levelConsistent ?? "missing"}`);

  printSection("Negative Control");
  const sameGuildDruids = historicalPlayerObservations.filter(
    (observation) =>
      resolveServerCode(observation.server) === "EU3" &&
      normalizeIdentifierKey(observation.classId) === normalizeIdentifierKey(firstPost.classId) &&
      normalizeText(observation.guildName) === "welten im wandel" &&
      (observation.level == null || firstPost.level == null || firstPost.level >= observation.level),
  );
  console.log(`EU3 Druid historical players in Welten im Wandel with level <= first Makio level: ${sameGuildDruids.length}`);
  sameGuildDruids.slice(0, 12).forEach((observation) => {
    console.log(`- ${observation.identifier} ${observation.name} level=${observation.level ?? "unknown"} ts=${formatDate(observation.timestamp)}`);
  });

  printSection("Review/Unresolved Pool Observation History");
  const playerItems = report.items.filter((item) => item.entityType === "player");
  const reviewUnresolved = playerItems.filter((item) => item.status === "review" || item.status === "unresolved");
  const poolStats = {
    total: reviewUnresolved.length,
    multiplePostObservations: 0,
    guildChanged: 0,
    nameChanged: 0,
    earliestAddsSameGuildCandidate: 0,
  };
  const examples: string[] = [];
  for (const item of reviewUnresolved) {
    const observations = [...(currentGroups.get(normalizeIdentifierKey(item.currentIdentifier)) ?? [])].sort((left, right) => left.timestamp - right.timestamp);
    if (observations.length > 1) poolStats.multiplePostObservations += 1;
    if (hasGuildChange(observations)) poolStats.guildChanged += 1;
    if (hasNameChange(observations)) poolStats.nameChanged += 1;
    const first = firstByTimestamp(observations);
    const latest = latestByTimestamp(observations);
    if (!first || !latest) continue;
    const firstRun = runPlayerResolverForCurrent(historicalPlayerObservations, first);
    const latestRun = resultByCurrent.get(normalizeIdentifierKey(item.currentIdentifier)) ?? null;
    const earliestAddsSameGuild = hasSameGuildCandidate(firstRun) && !hasSameGuildCandidate(latestRun);
    if (earliestAddsSameGuild) {
      poolStats.earliestAddsSameGuildCandidate += 1;
      if (examples.length < 8) {
        examples.push(
          `${item.currentIdentifier} ${item.currentName ?? ""} status=${item.status} obs=${observations.length} firstGuild=${first.guildName ?? "unknown"} latestGuild=${latest.guildName ?? "unknown"} firstStatus=${firstRun?.status ?? "missing"} latestStatus=${latestRun?.status ?? "missing"}`,
        );
      }
    }
  }
  console.log(`Review/Unresolved players: ${poolStats.total}`);
  console.log(`multiple post observations=${poolStats.multiplePostObservations}, guild changed=${poolStats.guildChanged}, name changed=${poolStats.nameChanged}`);
  console.log(`earliest observation adds sameGuild viable candidate under existing V1 evidence=${poolStats.earliestAddsSameGuildCandidate}`);
  examples.forEach((entry) => console.log(`- ${entry}`));

  printSection("Guild-Side Observation History");
  const allGuildObservations = snapshots.flatMap(createFusionIdentityGuildObservations);
  const historicalGuildObservations = allGuildObservations.filter((observation) => ORIGIN_CODES.has(observation.serverCode ?? ""));
  const currentGuildObservations = allGuildObservations.filter((observation) => observation.serverCode === TARGET_CODE);
  const highConfidencePlayerMatches = buildHighConfidencePlayerMatches(playerResults);
  const guildResultsBySnapshot = new Map<number, GuildFusionGuildResult[]>();
  snapshots.forEach((snapshot) => {
    const newGuildObservations = createFusionIdentityGuildObservations(snapshot).filter((observation) => observation.serverCode === TARGET_CODE);
    if (!newGuildObservations.length) return;
    guildResultsBySnapshot.set(
      snapshot.timestampMs,
      resolveGuildFusions({
        historicalGuildObservations: historicalGuildObservations.filter((observation) => observation.timestamp < snapshot.timestampMs),
        newGuildObservations,
        highConfidencePlayerMatches,
      }).results,
    );
  });
  GUILD_CASES.forEach((name) => {
    const observations = currentGuildObservations
      .filter((observation) => normalizeText(observation.name) === normalizeText(name))
      .sort((left, right) => left.timestamp - right.timestamp);
    const first = observations[0];
    const latest = observations[observations.length - 1];
    const firstResult = first
      ? guildResultsBySnapshot
          .get(first.timestamp)
          ?.find((result) => normalizeIdentifierKey(result.newGuild.guildIdentifier) === normalizeIdentifierKey(first.guildIdentifier))
      : null;
    const latestResult = latest
      ? guildResultsBySnapshot
          .get(latest.timestamp)
          ?.find((result) => normalizeIdentifierKey(result.newGuild.guildIdentifier) === normalizeIdentifierKey(latest.guildIdentifier))
      : null;
    console.log(
      `- ${name}: observations=${observations.length} first=${formatDate(first?.timestamp)} status=${firstResult?.status ?? "missing"} candidates=${firstResult?.identityCandidates.length ?? 0} latest=${formatDate(latest?.timestamp)} status=${latestResult?.status ?? "missing"} candidates=${latestResult?.identityCandidates.length ?? 0}`,
    );
  });
  console.log("Guild V2 is run once per post-fusion snapshot with that snapshot's guild observations, then management aggregates results by current guild identifier.");

  printSection("Direct Answers");
  console.log(`1. Multiple Makio post-fusion observations: ${targetObservations.length > 1 ? "yes" : "no"} (${targetObservations.length})`);
  console.log(`2. Earliest F28 observation in Welten im Wandel: ${normalizeText(firstPost.guildName) === "welten im wandel" ? "yes" : "no"} (${firstPost.guildName})`);
  console.log(`3. MakioHS pre-fusion in Welten im Wandel: ${normalizeText(makioHs?.guildName) === "welten im wandel" ? "yes" : "no"} (${makioHs?.guildName ?? "missing"})`);
  console.log(`4. Class and origin match: class=${makioHsFirstCandidate?.evidence.sameClass ?? "missing"} origin=${makioHsFirstCandidate?.evidence.originMatches ?? "missing"}`);
  console.log(`5. Level plausible: ${makioHsFirstCandidate?.evidence.levelConsistent ?? "missing"}`);
  console.log(`6. MakioHS currently candidate in management latest result: ${makioHsLatestCandidate ? "yes" : "no"}`);
  console.log(`7. Removal/filter reason: ${makioHsLatestCandidate ? `candidate exists, rejected=${makioHsLatestCandidate.rejected}, reasons=${makioHsLatestCandidate.rejectReasons.join(",") || "none"}` : "not generated for latest representative or not matching selected historical identifier"}`);
  console.log(`8. Later loss point: ${makioHsFirstCandidate && !makioHsLatestCandidate ? "lost before/inside latest-only resolver candidate evidence" : "not lost after resolver by management in this trace"}`);
  console.log(`9. Resolver uses earliest F28 observation in management path: no`);
  console.log(`10. Resolver uses all F28 observations in management path: no`);
  console.log(`11. Observation history would improve evidence: ${makioHsFirstCandidate && !makioHsFirstCandidate.rejected ? "yes, first observation has existing hard-filter-compatible candidate evidence" : "not proven"}`);
  console.log(`12. New normalized semantics additional evidence: available diagnostically; see availability and guild link lines above`);
  console.log(`13. Diagnosis: observation aggregation limitation plus existing resolver limitation for MakioHS -> Makio name evidence; not a management-store write issue`);

  printSection("Report Summary");
  console.log(`All scans=${snapshots.length}`);
  console.log(`Management player status counts=${JSON.stringify(statusCounts(playerItems))}`);
  console.log(`Management guild status counts=${JSON.stringify(statusCounts(report.items.filter((item) => item.entityType === "guild")))}`);
  console.log("Recommended fix scope: player resolver input/model should accept historical observation arrays and current observation arrays per identifier; management should pass grouped histories instead of latest representatives. Guild resolver already samples each post-fusion snapshot, but management still aggregates by current identifier afterward.");
} finally {
  await playerStore.close();
  await guildStore.close();
  await deleteDB(playerDb);
  await deleteDB(guildDb);
}
