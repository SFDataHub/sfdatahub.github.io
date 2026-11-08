import { getExactClassMeta, type ClassMeta } from "../../data/classes";
import { observationReferenceKey, serverComparisonKey } from "../servers/serverResolver";
import type { AttributeSumMode } from "../settings/preferences";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import type { ProfileHistoryMember } from "./profileSumHistory";
import { buildDashboardGuildComparison } from "../../pages/GuildHub/dashboardGuildComparison";
import { guildAverageCoverage } from "../guilds/guildAverageCoverage";
import type { ProfileHistoryData } from "./profileSumHistory";
import type { GuildHubScanSummary } from "../guilds/localScanLibrary";
import { resolveGuildIdentity, resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";

export const PRIMARY_RADAR_AXES = ["base", "total", "level", "mine", "treasury"] as const;
export type PrimaryRadarAxis = typeof PRIMARY_RADAR_AXES[number];
/** Building scales are fixed; the other axes retain monthly server maxima. */
export const PRIMARY_RADAR_FIXED_MAXIMA: Readonly<Partial<Record<PrimaryRadarAxis, number>>> = Object.freeze({ mine: 100, treasury: 45 });
export const PRIMARY_RADAR_COMPARISONS = ["main", "class", "guild", "server"] as const;
export type PrimaryRadarComparison = typeof PRIMARY_RADAR_COMPARISONS[number];
export type PrimaryRadarScan = { sourceScanId: string; timestamp: number; filename: string; name?: string; server?: string | null; memberRef?: string; guildIdentifier?: string | null };
export type PrimaryRadarModel = {
  referenceServer: string;
  month: string;
  primary: ClassMeta["primaryAttribute"];
  playerClass?: ClassMeta["key"];
  playerGuild?: string | null;
  comparisonPlayer?: PrimaryRadarScan | null;
  comparison: PrimaryRadarComparison;
  playerScan: PrimaryRadarScan;
  comparisonScan: PrimaryRadarScan | null;
  comparisonSources: string[];
  comparisonAvailable: boolean;
  population: number;
  groupSize: number;
  axes: { key: PrimaryRadarAxis; player: number | null; average: number | null; maximum: number | null; count: number }[];
};
type RadarSource = Pick<GuildHubScanSummary, "sourceScanId" | "sourceGeneration" | "contentHash" | "snapshotTimestamps">;
export type PrimaryRadarBasis = {
  identity: Pick<IdentityResolutionSnapshot, "players"> & Partial<Pick<IdentityResolutionSnapshot, "guilds">>;
  sources: readonly RadarSource[];
  /** Independently validated local history, including User/SF-Tools imports. */
  local?: { data: ProfileHistoryData; sources: readonly RadarSource[] };
};
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const server = (value: unknown) => serverComparisonKey(value)?.toLowerCase();
export function primaryRadarFraction(value: number | null, maximum: number | null) {
  return valid(value) && valid(maximum) && maximum > 0 ? Math.min(1, value / maximum) : null;
}

const playerIdentityKey = (identity: PrimaryRadarBasis["identity"], reference: string) => {
  const resolved = resolvePlayerIdentity(identity, reference);
  return resolved.status === "conflict" ? null : resolved.resolved
    ? `identity:${resolved.identityId}` : `physical:${observationReferenceKey(reference)}`;
};
function sourceBound(row: Pick<ProfileHistoryMember, "sourceScanId" | "sourceGeneration" | "snapshotId" | "snapshotTimestamp">, sources: Map<string, RadarSource>) {
  const source = sources.get(row.sourceScanId);
  return Boolean(source?.contentHash && source.sourceGeneration && row.sourceGeneration === source.sourceGeneration &&
    row.snapshotId === `${row.sourceScanId}::${row.snapshotTimestamp}` && source.snapshotTimestamps.includes(row.snapshotTimestamp));
}
function sameObservation(a: ProfileHistoryMember, b: ProfileHistoryMember, mode: AttributeSumMode) {
  return a.classId === b.classId && JSON.stringify(values(a, mode)) === JSON.stringify(values(b, mode)) &&
    (a.guildIdentifier ?? null) === (b.guildIdentifier ?? null);
}
/** The player is selected independently of comparison mode and physical server.
 * Only confirmed identities cross physical references; missing fields stay missing. */
export function selectPrimaryRadarPlayer(rows: readonly ProfileHistoryMember[], profile: LocalPlayerProfileModel,
  basis: PrimaryRadarBasis, mode: AttributeSumMode): ProfileHistoryMember | null {
  const target = playerIdentityKey(basis.identity, profile.analytics.memberRef ?? profile.sourcePlayerKey);
  if (!target || target !== playerIdentityKey(basis.identity, profile.sourcePlayerKey)) return null;
  const sources = new Map((basis.local?.sources ?? basis.sources).map(source => [source.sourceScanId, source]));
  let latest: ProfileHistoryMember | null = null, ambiguous = false;
  for (const row of rows) {
    if (!row.memberRef || playerIdentityKey(basis.identity, row.memberRef) !== target || !Number.isSafeInteger(row.snapshotTimestamp) ||
        Math.abs(row.snapshotTimestamp) > 8640000000000000) continue;
    if (!sourceBound(row, sources)) return null;
    if (!latest || row.snapshotTimestamp > latest.snapshotTimestamp) { latest = row; ambiguous = false; }
    else if (row.snapshotTimestamp === latest.snapshotTimestamp && !sameObservation(row, latest, mode)) ambiguous = true;
  }
  return ambiguous ? null : latest;
}
const scanInfo = (row: ProfileHistoryMember): PrimaryRadarScan => ({ sourceScanId: row.sourceScanId, timestamp: row.snapshotTimestamp,
  filename: row.sourceScanFilename, name: row.name, server: row.server, memberRef: row.memberRef, guildIdentifier: row.guildIdentifier });

/** Monthly maxima/comparisons stay on one physical server/month. Building
 * maxima are fixed; player and guild observations never enlarge either scale. */
export function buildPrimaryAttributeRadar(
  rows: readonly ProfileHistoryMember[], profile: LocalPlayerProfileModel, month: string, mode: AttributeSumMode,
  basis: PrimaryRadarBasis, comparison: PrimaryRadarComparison = "main", referenceServer = profile.analytics.server,
): PrimaryRadarModel | null {
  const targetServer = server(referenceServer);
  if (!targetServer || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const sources = new Map(basis.sources.map(source => [source.sourceScanId, source]));
  if (sources.size !== basis.sources.length) return null;
  const byPlayer = new Map<string, ProfileHistoryMember>();
  for (const row of rows) {
    if (!row.memberRef || server(row.server) !== targetServer || !Number.isSafeInteger(row.snapshotTimestamp) || Math.abs(row.snapshotTimestamp) > 8640000000000000 ||
        new Date(row.snapshotTimestamp).toISOString().slice(0, 7) !== month) continue;
    if (!sourceBound(row, sources)) return null;
    const key = playerIdentityKey(basis.identity, row.memberRef);
    if (!key) return null;
    const previous = byPlayer.get(key);
    if (!previous || row.snapshotTimestamp > previous.snapshotTimestamp) byPlayer.set(key, row);
    else if (row.snapshotTimestamp === previous.snapshotTimestamp && !sameObservation(row, previous, mode)) return null;
  }
  if (!byPlayer.size) return null;
  const player = selectPrimaryRadarPlayer(basis.local?.data.members ?? [...byPlayer.values()], profile, basis, mode);
  if (!player) return null;
  const playerClass = getExactClassMeta(player.classId), primary = playerClass?.primaryAttribute;
  if (!primary) return null;
  const playerValues = values(player, mode);
  const axes = PRIMARY_RADAR_AXES.map((key, index) => ({ key, player: playerValues[index], average: null as number | null,
    maximum: PRIMARY_RADAR_FIXED_MAXIMA[key] ?? null, count: 0 }));
  for (const row of byPlayer.values()) values(row, mode).forEach((value, index) => {
    if (PRIMARY_RADAR_FIXED_MAXIMA[axes[index].key] === undefined && valid(value))
      axes[index].maximum = axes[index].maximum === null ? value : Math.max(axes[index].maximum!, value);
  });
  let groupSize = 0, comparisonScan: PrimaryRadarScan | null = null;
  let comparisonSources: string[] = [];
  if (comparison === "guild") {
    const stand = selectRadarGuildStand(basis, player, mode);
    if (stand) {
      groupSize = stand.members.length;
      comparisonScan = { sourceScanId: stand.guild.sourceScanId, timestamp: stand.guild.snapshotTimestamp,
        filename: stand.guild.sourceScanFilename, server: stand.guild.server, name: stand.guild.guildName ?? undefined, guildIdentifier: stand.guild.guildIdentifier };
      comparisonSources = [stand.guild.sourceScanId];
      axes.forEach(axis => {
        if (axis.key === "level") {
          const observed = stand.members.map(row => row.level).filter(valid);
          const coverage = guildAverageCoverage(stand.members.length, stand.declared, observed.length, stand.membershipConflict);
          axis.count = observed.length;
          axis.average = coverage.reason == null ? observed.reduce((a, b) => a + b, 0) / observed.length : null;
        } else {
          const progress = stand.progress[axis.key];
          axis.count = progress.coverage.used;
          axis.average = progress.value;
        }
      });
    }
  } else {
    const sums = axes.map(() => 0);
    const group = [...byPlayer.values()].filter(row => comparison === "server" || (comparison === "class"
      ? getExactClassMeta(row.classId)?.id === playerClass.id : getExactClassMeta(row.classId)?.primaryAttribute === primary));
    groupSize = group.length;
    comparisonSources = [...new Set(group.map(row => row.sourceScanId))];
    for (const row of group) values(row, mode).forEach((value, index) => {
      if (valid(value)) { sums[index] += value; axes[index].count++; }
    });
    axes.forEach((axis, index) => { axis.average = axis.count && valid(sums[index]) ? sums[index] / axis.count : null; });
  }
  return { referenceServer: serverComparisonKey(referenceServer)!, month, primary, playerClass: playerClass.key, playerGuild: player.guildName, comparison, playerScan: scanInfo(player), comparisonScan, comparisonSources,
    comparisonAvailable: groupSize > 0, population: byPlayer.size, groupSize, axes };
}

/** Compare on the opened profile's maxima, never the peer's own scale. */
export function withPrimaryRadarPlayer(model: PrimaryRadarModel, player: ProfileHistoryMember | null, mode: AttributeSumMode): PrimaryRadarModel {
  const observed = player ? values(player, mode) : [];
  return { ...model, comparisonPlayer: player ? scanInfo(player) : null, comparisonScan: null,
    comparisonAvailable: player !== null, comparisonSources: player ? [player.sourceScanId] : [], groupSize: 0,
    axes: model.axes.map((axis, index) => ({ ...axis, average: observed[index] ?? null, count: 0 })) };
}

function selectRadarGuildStand(basis: PrimaryRadarBasis, player: ProfileHistoryMember, mode: AttributeSumMode) {
  const local = basis.local, guilds = basis.identity.guilds;
  if (!local || !guilds || !player.guildIdentifier) return null;
  const identity = { players: basis.identity.players, guilds };
  const target = resolveGuildIdentity(identity, player.guildIdentifier);
  if (target.status === "conflict") return null;
  const guildKey = (ref: string) => {
    const resolved = resolveGuildIdentity(identity, ref);
    return resolved.status === "conflict" ? null : resolved.resolved ? `identity:${resolved.identityId}` : observationReferenceKey(ref);
  };
  const key = guildKey(player.guildIdentifier);
  const selected = local.data.guilds.filter(row => row.guildIdentifier && guildKey(row.guildIdentifier) === key);
  const snapshots = new Set(selected.map(row => row.snapshotId));
  const sources = new Map(local.sources.map(source => [source.sourceScanId, source]));
  // Preserve other membership assignments in the same source snapshot so the
  // shared guild logic can detect contradictory memberships of confirmed peers.
  const members = local.data.members.filter(row => snapshots.has(row.snapshotId));
  if (members.some(row => !sourceBound(row, sources) || !playerIdentityKey(identity, row.memberRef)) ||
      selected.some(row => !sourceBound(row, sources))) return null;
  if (!selected.length) return null;
  const comparison = buildDashboardGuildComparison({ data: { ...local.data, guilds: selected, members }, identity },
    player.server ?? "", player.guildIdentifier, Math.max(...selected.map(row => row.snapshotTimestamp)), undefined, mode);
  const stands = [...comparison.observationStands.values()].flatMap(rows => [...rows.values()]);
  return stands.filter(stand => guildAverageCoverage(stand.members.length, stand.declared, stand.members.length,
    stand.membershipConflict).reason == null).sort((a, b) => b.guild.snapshotTimestamp - a.guild.snapshotTimestamp ||
      a.guild.sourceScanFilename.localeCompare(b.guild.sourceScanFilename, undefined, { sensitivity: "base" }) ||
      a.guild.sourceScanId.localeCompare(b.guild.sourceScanId))[0] ?? null;
}
function values(row: ProfileHistoryMember, mode: AttributeSumMode): (number | null)[] {
  return [row.profileSums?.[mode]?.base, row.profileSums?.[mode]?.total, row.level, row.mine, row.treasury]
    .map(value => valid(value) ? value : null);
}
