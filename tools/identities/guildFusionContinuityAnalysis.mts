import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeGuildScanMembers } from "../../src/lib/guilds/guildScanNormalizer.ts";
import { resolveServer } from "../../src/lib/servers/serverResolver.ts";
import {
  createFusionIdentityGuildObservations,
  createFusionIdentityObservations,
} from "../../src/lib/identities/playerFusionPreviewAdapter.ts";
import { resolveGuildFusions, type GuildFusionObservation } from "../../src/lib/identities/guildFusionResolver.ts";
import { resolvePlayerFusions } from "../../src/lib/identities/playerFusionResolver.ts";
import type { GuildHubLogicalScanSnapshot } from "../../src/lib/guilds/localScanLibrary.ts";

type JsonRecord = Record<string, unknown>;

type PlayerMatch = {
  oldIdentifier: string;
  oldName: string | null;
  newIdentifier: string;
  newName: string | null;
};

type Flow = {
  oldGuild: GuildFusionObservation;
  newGuild: GuildFusionObservation;
  count: number;
  matchedMembers: PlayerMatch[];
  exactName: boolean;
  sameCoA: boolean;
  bothCoAPresent: boolean;
};

type RankedFlow = Flow & {
  totalFromOld: number;
  totalIntoNew: number;
  oldTopCount: number;
  oldSecondCount: number;
  newTopCount: number;
  newSecondCount: number;
  oldTopShare: number;
  newTopShare: number;
};

const DEFAULT_SCAN_ROOT = "D:/SFDataHub/Guild Analytics/public/scans";
const TARGET_DATES = new Set(["2026-02-21", "2026-04-03", "2026-09-05"]);
const ORIGIN_SERVER_CODES = new Set(["EU1", "EU2", "EU3", "EU4"]);
const TARGET_FUSION_SERVER = "F28";

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

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

const guildLabel = (guild: GuildFusionObservation) =>
  `${guild.serverCode ?? "?"} ${guild.name ?? guild.guildIdentifier} (${guild.guildIdentifier})`;

const flowLabel = (flow: Flow) =>
  `${guildLabel(flow.oldGuild)} -> ${guildLabel(flow.newGuild)}: ${flow.count}`;

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

const bucketCount = (count: number) => {
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count === 3) return "3";
  if (count <= 5) return "4-5";
  if (count <= 10) return "6-10";
  return "10+";
};

const topTwoCounts = (flows: Flow[]) => {
  const sorted = [...flows].sort((left, right) => right.count - left.count);
  return {
    top: sorted[0] ?? null,
    second: sorted[1] ?? null,
  };
};

const rankFlows = (flows: Flow[]) => {
  const byOld = new Map<string, Flow[]>();
  const byNew = new Map<string, Flow[]>();
  flows.forEach((flow) => {
    const oldKey = normalizeKey(flow.oldGuild.guildIdentifier);
    const newKey = normalizeKey(flow.newGuild.guildIdentifier);
    byOld.set(oldKey, [...(byOld.get(oldKey) ?? []), flow]);
    byNew.set(newKey, [...(byNew.get(newKey) ?? []), flow]);
  });

  return flows.map((flow): RankedFlow => {
    const oldFlows = byOld.get(normalizeKey(flow.oldGuild.guildIdentifier)) ?? [];
    const newFlows = byNew.get(normalizeKey(flow.newGuild.guildIdentifier)) ?? [];
    const oldTotal = oldFlows.reduce((sum, item) => sum + item.count, 0);
    const newTotal = newFlows.reduce((sum, item) => sum + item.count, 0);
    const oldTopTwo = topTwoCounts(oldFlows);
    const newTopTwo = topTwoCounts(newFlows);

    return {
      ...flow,
      totalFromOld: oldTotal,
      totalIntoNew: newTotal,
      oldTopCount: oldTopTwo.top?.count ?? 0,
      oldSecondCount: oldTopTwo.second?.count ?? 0,
      newTopCount: newTopTwo.top?.count ?? 0,
      newSecondCount: newTopTwo.second?.count ?? 0,
      oldTopShare: oldTotal ? (oldTopTwo.top?.count ?? 0) / oldTotal : 0,
      newTopShare: newTotal ? (newTopTwo.top?.count ?? 0) / newTotal : 0,
    };
  });
};

const printSection = (title: string) => {
  console.log(`\n## ${title}`);
};

const printTopFlows = (flows: RankedFlow[], limit: number) => {
  flows
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .forEach((flow) => {
      console.log(
        `- ${flowLabel(flow)} | oldTop=${flow.oldTopCount}/${flow.totalFromOld} (${pct(flow.oldTopShare)}) second=${flow.oldSecondCount} | newTop=${flow.newTopCount}/${flow.totalIntoNew} (${pct(flow.newTopShare)}) second=${flow.newSecondCount} | name=${flow.exactName ? "yes" : "no"} coa=${flow.sameCoA ? "yes" : "no"}`,
      );
    });
};

const analyzeSnapshot = (snapshots: GuildHubLogicalScanSnapshot[], postSnapshot: GuildHubLogicalScanSnapshot) => {
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
    newPlayerObservations.map((observation) => [normalizeKey(observation.identifier), observation]),
  );
  const highConfidenceMatches: PlayerMatch[] = playerResult.results.flatMap((result) => {
    if (result.status !== "high-confidence") return [];
    const candidate = result.candidates.find(
      (entry) => !entry.rejected && (entry.evidence.exactName || entry.evidence.fusionBaseName),
    );
    const newObservation = newObservationByIdentifier.get(normalizeKey(result.newIdentifier));
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
  const historicalGuilds = historicalSnapshots
    .flatMap(createFusionIdentityGuildObservations)
    .filter((guild) => Boolean(guild.serverCode && ORIGIN_SERVER_CODES.has(guild.serverCode)));
  const newGuilds = createFusionIdentityGuildObservations(postSnapshot).filter(
    (guild) => guild.serverCode === TARGET_FUSION_SERVER,
  );
  const oldMembership = buildMembership(
    historicalGuilds.filter((guild) => guild.timestamp < postSnapshot.timestampMs),
  );
  const newMembership = buildMembership(newGuilds);
  const flowsByKey = new Map<string, Flow>();
  let oldMembershipMissing = 0;
  let newMembershipMissing = 0;
  let usableMatches = 0;

  highConfidenceMatches.forEach((match) => {
    const oldGuild = oldMembership.get(normalizeKey(match.oldIdentifier));
    const newGuild = newMembership.get(normalizeKey(match.newIdentifier));
    if (!oldGuild) oldMembershipMissing += 1;
    if (!newGuild) newMembershipMissing += 1;
    if (!oldGuild || !newGuild) return;
    usableMatches += 1;

    const key = `${normalizeKey(oldGuild.guildIdentifier)}\u0000${normalizeKey(newGuild.guildIdentifier)}`;
    const existing =
      flowsByKey.get(key) ??
      ({
        oldGuild,
        newGuild,
        count: 0,
        matchedMembers: [],
        exactName: Boolean(normalizeName(oldGuild.name) && normalizeName(oldGuild.name) === normalizeName(newGuild.name)),
        sameCoA: Boolean(oldGuild.coa && newGuild.coa && oldGuild.coa === newGuild.coa),
        bothCoAPresent: Boolean(oldGuild.coa && newGuild.coa),
      } satisfies Flow);
    existing.count += 1;
    existing.matchedMembers.push(match);
    flowsByKey.set(key, existing);
  });

  const flows = [...flowsByKey.values()];
  const ranked = rankFlows(flows);
  const guildResult = resolveGuildFusions({
    historicalGuildObservations: historicalGuilds,
    newGuildObservations: newGuilds,
    highConfidencePlayerMatches: highConfidenceMatches,
  });

  return {
    postSnapshot,
    historicalGuilds,
    newGuilds,
    highConfidenceMatches,
    usableMatches,
    oldMembershipMissing,
    newMembershipMissing,
    flows: ranked,
    guildResult,
  };
};

const scanRoot = process.argv[2] ?? DEFAULT_SCAN_ROOT;
const snapshots = listJsonFiles(scanRoot)
  .map(readSnapshot)
  .filter((snapshot): snapshot is GuildHubLogicalScanSnapshot => Boolean(snapshot))
  .sort((left, right) => left.timestampMs - right.timestampMs);
const analyses = snapshots.filter((snapshot) => TARGET_DATES.has(dateKey(snapshot.timestampMs))).map((snapshot) => analyzeSnapshot(snapshots, snapshot));

assert.equal(analyses.length, 3, "expected February, April, and September 2026 post-fusion scans");

console.log("# Guild Fusion Continuity Analysis");

analyses.forEach((analysis) => {
  const date = dateKey(analysis.postSnapshot.timestampMs);
  printSection(`A. Datenbasis ${date}`);
  console.log(`F28 Guilds: ${analysis.newGuilds.length}`);
  console.log(`Historical EU1-EU4 guild observations: ${analysis.historicalGuilds.length}`);
  console.log(`High-confidence player matches: ${analysis.highConfidenceMatches.length}`);
  console.log(`Guild-network usable matches: ${analysis.usableMatches}`);
  console.log(`Missing old membership: ${analysis.oldMembershipMissing}`);
  console.log(`Missing new membership: ${analysis.newMembershipMissing}`);

  printSection(`B. Old Guild -> New Guild Flows ${date}`);
  printTopFlows(analysis.flows, 12);

  printSection(`C. New Guild <- Old Guild Sources ${date}`);
  const topIntoNew = [...analysis.flows]
    .filter((flow) => flow.count === flow.newTopCount)
    .sort((left, right) => right.count - left.count);
  printTopFlows(topIntoNew, 12);

  printSection(`D. Migration-Verteilung ${date}`);
  const buckets = new Map<string, number>();
  analysis.flows.forEach((flow) => buckets.set(bucketCount(flow.count), (buckets.get(bucketCount(flow.count)) ?? 0) + 1));
  ["1", "2", "3", "4-5", "6-10", "10+"].forEach((bucket) => {
    console.log(`${bucket}: ${buckets.get(bucket) ?? 0}`);
  });

  printSection(`E. Dominanzanalyse ${date}`);
  const oldDominance = [...analysis.flows]
    .filter((flow) => flow.count === flow.oldTopCount)
    .sort((left, right) => right.oldSecondCount - left.oldSecondCount || right.count - left.count)
    .slice(0, 10);
  console.log("Old guilds with strongest second destination:");
  printTopFlows(oldDominance, 10);
  const newDominance = [...analysis.flows]
    .filter((flow) => flow.count === flow.newTopCount)
    .sort((left, right) => right.newSecondCount - left.newSecondCount || right.count - left.count)
    .slice(0, 10);
  console.log("F28 guilds with strongest second historical source:");
  printTopFlows(newDominance, 10);

  printSection(`F. Guild Name Evidence ${date}`);
  const exactNameFlows = analysis.flows.filter((flow) => flow.exactName);
  const exactNameWeak = exactNameFlows.filter((flow) => flow.count <= 2);
  const dominantDifferentName = analysis.flows.filter((flow) => flow.count === flow.oldTopCount && !flow.exactName && flow.count >= 10);
  const oldNameCounts = new Map<string, Set<string>>();
  analysis.historicalGuilds.forEach((guild) => {
    const name = normalizeName(guild.name);
    if (!name) return;
    const set = oldNameCounts.get(name) ?? new Set<string>();
    if (guild.serverCode) set.add(guild.serverCode);
    oldNameCounts.set(name, set);
  });
  const repeatedNames = [...oldNameCounts.entries()].filter(([, servers]) => servers.size > 1);
  console.log(`Exact-name relations: ${exactNameFlows.length}`);
  console.log(`Exact-name relations with only 1-2 matched members: ${exactNameWeak.length}`);
  console.log(`Dominant old->new flows with different name and 10+ members: ${dominantDifferentName.length}`);
  console.log(`Guild names present on multiple origin servers: ${repeatedNames.length}`);
  exactNameWeak.slice(0, 5).forEach((flow) => console.log(`- weak exact-name: ${flowLabel(flow)}`));
  dominantDifferentName.slice(0, 5).forEach((flow) => console.log(`- dominant different-name: ${flowLabel(flow)}`));

  printSection(`G. CoA Evidence ${date}`);
  const sameCoAFlows = analysis.flows.filter((flow) => flow.sameCoA);
  const sameCoAWeak = sameCoAFlows.filter((flow) => flow.count <= 2);
  const strongDifferentCoA = analysis.flows.filter(
    (flow) => flow.count === flow.oldTopCount && flow.count >= 10 && flow.bothCoAPresent && !flow.sameCoA,
  );
  const missingCoA = analysis.flows.filter((flow) => !flow.oldGuild.coa || !flow.newGuild.coa);
  const oldCoaCounts = new Map<string, Set<string>>();
  analysis.historicalGuilds.forEach((guild) => {
    if (!guild.coa) return;
    const set = oldCoaCounts.get(guild.coa) ?? new Set<string>();
    set.add(guild.guildIdentifier);
    oldCoaCounts.set(guild.coa, set);
  });
  const repeatedCoa = [...oldCoaCounts.entries()].filter(([, guilds]) => guilds.size > 1);
  console.log(`Same-CoA relations: ${sameCoAFlows.length}`);
  console.log(`Same-CoA relations with only 1-2 matched members: ${sameCoAWeak.length}`);
  console.log(`Strong dominant flows with different CoA: ${strongDifferentCoA.length}`);
  console.log(`Relations missing old or new CoA: ${missingCoA.length}`);
  console.log(`CoA values shared by multiple historical guilds: ${repeatedCoa.length}`);
  sameCoAWeak.slice(0, 5).forEach((flow) => console.log(`- weak same-CoA: ${flowLabel(flow)}`));
  strongDifferentCoA.slice(0, 5).forEach((flow) => console.log(`- strong different-CoA: ${flowLabel(flow)}`));

  printSection(`H. Evidence-Kombinationen ${date}`);
  const comboCounts = new Map<string, number>();
  analysis.flows.forEach((flow) => {
    const dominantCore = flow.count === flow.oldTopCount && flow.count === flow.newTopCount;
    const key =
      flow.count <= 2 && !flow.exactName && !flow.sameCoA
        ? "E: 1-2 migrated members only"
        : `${flow.exactName ? "Exact Name" : "Different Name"} + ${flow.sameCoA ? "Same CoA" : "Different/Missing CoA"} + ${
            dominantCore ? "dominant member core" : "non-dominant member edge"
          }`;
    comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
  });
  [...comboCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .forEach(([key, count]) => console.log(`${key}: ${count}`));

  printSection(`I. Split Cases ${date}`);
  const splitLike = [...analysis.flows]
    .filter((flow) => flow.count === flow.oldTopCount && flow.oldSecondCount >= 5)
    .sort((left, right) => left.oldTopCount - left.oldSecondCount - (right.oldTopCount - right.oldSecondCount))
    .slice(0, 8);
  splitLike.forEach((flow) => console.log(`- possible split: ${flowLabel(flow)} secondDestination=${flow.oldSecondCount}`));
  if (!splitLike.length) console.log("- none with second destination >= 5");

  printSection(`J. Convergence Cases ${date}`);
  const convergenceLike = [...analysis.flows]
    .filter((flow) => flow.count === flow.newTopCount && flow.newSecondCount >= 5)
    .sort((left, right) => left.newTopCount - left.newSecondCount - (right.newTopCount - right.newSecondCount))
    .slice(0, 8);
  convergenceLike.forEach((flow) => console.log(`- possible convergence: ${flowLabel(flow)} secondSource=${flow.newSecondCount}`));
  if (!convergenceLike.length) console.log("- none with second source >= 5");

  printSection(`K. Magic Mushrooms Deep Dive ${date}`);
  const magicNew = analysis.newGuilds.find((guild) => normalizeName(guild.name) === "magic mushrooms");
  if (!magicNew) {
    console.log("F28 Magic Mushrooms not found.");
  } else {
    const magicFlows = analysis.flows
      .filter((flow) => normalizeKey(flow.newGuild.guildIdentifier) === normalizeKey(magicNew.guildIdentifier))
      .sort((left, right) => right.count - left.count);
    magicFlows.forEach((flow) => {
      const oldAlternatives = analysis.flows
        .filter((item) => normalizeKey(item.oldGuild.guildIdentifier) === normalizeKey(flow.oldGuild.guildIdentifier))
        .sort((left, right) => right.count - left.count);
      const newAlternatives = analysis.flows
        .filter((item) => normalizeKey(item.newGuild.guildIdentifier) === normalizeKey(flow.newGuild.guildIdentifier))
        .sort((left, right) => right.count - left.count);
      const oldBestAlternative = oldAlternatives.find(
        (item) => normalizeKey(item.newGuild.guildIdentifier) !== normalizeKey(flow.newGuild.guildIdentifier),
      );
      const newBestAlternative = newAlternatives.find(
        (item) => normalizeKey(item.oldGuild.guildIdentifier) !== normalizeKey(flow.oldGuild.guildIdentifier),
      );
      console.log(
        `- ${flowLabel(flow)} | oldShareToMagic=${pct(flow.count / flow.totalFromOld)} | name=${flow.exactName ? "yes" : "no"} coa=${flow.sameCoA ? "yes" : "no"} | oldAlt=${oldBestAlternative ? flowLabel(oldBestAlternative) : "none"} | newAlt=${newBestAlternative ? flowLabel(newBestAlternative) : "none"}`,
      );
    });
  }

  printSection(`L. Zeitentwicklung ${date}`);
  console.log(`Relations: ${analysis.flows.length}`);
  console.log(`1-2 member migration-like relations: ${analysis.flows.filter((flow) => flow.count <= 2).length}`);
  console.log(`10+ member relations: ${analysis.flows.filter((flow) => flow.count >= 10).length}`);
  console.log(`Same-name relations: ${exactNameFlows.length}`);
  console.log(`Same-CoA relations: ${sameCoAFlows.length}`);
});

printSection("M. Empfehlung fuer GuildResolver V2");
console.log("- Separate relation types: identity continuity candidate, member migration edge, split/convergence candidate.");
console.log("- Treat single-player and tiny member edges as migration evidence unless supported by stronger structural context.");
console.log("- Promote the dominant old->new and new<-old member core to a continuity candidate only after testing dominance/gap hypotheses.");
console.log("- Keep same name and same CoA as positive corroboration, not standalone proof and not hard requirements.");
console.log("- Preserve split/convergence cases when second destination/source is materially large instead of forcing one winner.");
console.log("- Do not feed guild evidence back into PlayerFusionResolver V1; use it later only in a deliberately scoped V2.");

console.log("\nguildFusionContinuityAnalysis completed");
