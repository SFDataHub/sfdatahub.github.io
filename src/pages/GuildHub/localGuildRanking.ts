import { getExactClassMeta, type ClassSelection, type GameClassKey } from "../../data/classes";
import { parsePlayerIdentifier, buildPlayerIdentifier } from "../../lib/players/identifier";
import { type MonthlyRankingPayload, type RankingPlayer } from "../../lib/scanArchive/monthlyRanking";
import { toplistRowIdentity } from "../../lib/scanArchive/toplistRowIdentity";
import { resolveDefaultComparisonTimestamp } from "../../lib/player-progress/comparisonScanSelection";
import { resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { normalizePlayerIdentifierKey } from "../../lib/identities/playerIdentityStore";
import type { GuildTrendSnapshot } from "../Playground/playerPerformanceModel";
import type { LocalGuildStatsMember, LocalGuildPlayerStats } from "./localGuildPlayerStats";
import { BUILDINGS } from "../../lib/calculators/fortress/tables";

export type { GuildProfileMode as DashboardMemberMode } from "../../lib/settings/preferences";
import { DEFAULT_GUILD_PROFILE_MODE, type GuildProfileMode as DashboardMemberMode } from "../../lib/settings/preferences";
export const DEFAULT_DASHBOARD_MEMBER_MODE: DashboardMemberMode = DEFAULT_GUILD_PROFILE_MODE;
export type LocalGuildRankingCategory = "main" | "con" | "sum" | "level" | "hof" | "mine" | "treasury";
export const guildModeCategories = (mode: DashboardMemberMode): LocalGuildRankingCategory[] => (mode === "general" || mode === "progress") ? ["level", "hof"] : mode === "fortress" ? ["mine", "treasury"] : ["main", "con", "sum"];
export type LocalGuildRankingRow = {
  key: string; name: string; classLabel: string | null;
  value: number | null; rank: number | null; valueDelta: number | null; rankDelta: number | null; rankStatus: "compared" | "new" | "unavailable";
  classComparison?: {
    rankClass: string | null; valueClass: string | null;
    rankCounts: Partial<Record<GameClassKey, number>>;
  };
};
export type LocalGuildRankingComparison = {
  options?: { sourceScanId: string; scannedAtMs: number; guildIdentifier: string }[];
  valueSources?: { key: string; sourceScanId: string; scannedAtMs: number }[];
  allFive?: Pick<LocalGuildRankingComparison, "rankings" | "groups" | "comparisonValues">;
  comparisonValues?: Partial<Record<import("./dashboardHistory").DashboardHistoryMetric, number | null>>;
  diagnostic?: import("./dashboardComparisonDiagnostic").MemberComparisonDiagnostic;
  execution?: import("./dashboardComparisonDiagnostic").ComparisonExecution;
  status: "idle" | "loading" | "ready" | "empty" | "error";
  timestamp: number | null;
  sourceScanId?: string;
  guildIdentifier?: string;
  coverage?: LocalGuildRankingComparisonCoverage;
  members: readonly LocalGuildStatsMember[];
  players?: readonly LocalGuildStatsMember[];
  identities: IdentityResolutionSnapshot | null;
  identityContexts?: import("./dashboardScanIdentity").ScanIdentityContext[];
  groups?: Partial<Record<DashboardMemberMode, ReturnType<typeof import("./localGuildPlayerStats").summarizeLocalGuildPlayerStats>>>;
  rankings?: Partial<Record<DashboardMemberMode, Partial<Record<LocalGuildRankingCategory, LocalGuildRankingRow[]>>>>;
};

/** Evidence for the used stand, or the first excluded candidate in the existing
 * preference order. An excluded date is never the comparison timestamp. */
export type LocalGuildRankingComparisonCoverage = {
  timestamp: number; sourceScanId: string; guildIdentifier: string;
  declaredMemberCount: number | null; foundMemberCount: number;
  validXpTotalCount: number; validBaseStatsCount: number;
  reason: "unknown-total" | "members" | "values" | null;
};

export function localGuildRankingCoverage(input: Omit<LocalGuildRankingComparisonCoverage, "reason">): LocalGuildRankingComparisonCoverage {
  const declaredMemberCount = input.declaredMemberCount != null && Number.isInteger(input.declaredMemberCount) && input.declaredMemberCount > 0 ? input.declaredMemberCount : null;
  return { ...input, declaredMemberCount, reason: declaredMemberCount == null ? "unknown-total"
    : input.foundMemberCount !== declaredMemberCount ? "members"
    : input.validXpTotalCount !== declaredMemberCount || input.validBaseStatsCount !== declaredMemberCount ? "values" : null };
}

/** Center the selected row where possible, shifting the window at either edge.
 * Missing values retain their full-list order and never acquire a rank. */
export function selectCompactGuildRanking(rows: readonly LocalGuildRankingRow[], selectedKey: string | null) {
  const selected = selectedKey == null ? null : rows.find(row => row.key === selectedKey);
  const ranked = rows.filter(row => row.rank != null);
  if (!selected) return ranked.slice(0, 3);
  // A missing category value keeps its existing position in the full list.
  const population = selected.rank == null ? rows : ranked;
  const index = population.findIndex(row => row.key === selected.key);
  const start = Math.max(0, Math.min(index - 1, population.length - 3));
  return population.slice(start, start + 3);
}

// These snapshots already passed the shared guild-identity/completeness rules
// used by the trend. Keep the profile graphs' ordering and 30-day fallback.
export function selectLocalGuildRankingComparison(snapshots: readonly GuildTrendSnapshot[], currentTimestamp: number) {
  const options = snapshots.filter(snapshot => snapshot.scannedAtMs < currentTimestamp)
    .sort((a, b) => b.scannedAtMs - a.scannedAtMs || b.sourceScanId.localeCompare(a.sourceScanId))
    .map(snapshot => ({ timestamp: snapshot.scannedAtMs, snapshot }));
  const timestamp = resolveDefaultComparisonTimestamp(options, currentTimestamp);
  return options.find(option => option.timestamp === timestamp)?.snapshot ?? null;
}

export function localGuildRankingField(category: LocalGuildRankingCategory, mode: DashboardMemberMode): Exclude<keyof LocalGuildPlayerStats, "profileAllSums"> {
  if (category === "level") return "level";
  if (category === "hof") return "hofRank";
  if (category === "mine" || category === "treasury") return category;
  return (mode === "base"
    ? { main: "baseMain", con: "conBase", sum: "sumBaseTotal" }
    : { main: "attrTotal", con: "conTotal", sum: "totalStats" })[category] as Exclude<keyof LocalGuildPlayerStats, "profileAllSums">;
}

const finite = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function localGuildRankingIdentityKey(member: Pick<LocalGuildStatsMember, "key">, identities: IdentityResolutionSnapshot | null) {
  // Name-based current rows stay visible, but cannot acquire a history delta.
  if (!/^.+_p[^_]+$/i.test(member.key)) return null;
  let literal: string;
  try { literal = normalizePlayerIdentifierKey(member.key); } catch { return null; }
  if (!literal) return null;
  const resolved = identities ? resolvePlayerIdentity(identities, literal) : null;
  return resolved?.resolved ? `identity:${resolved.identityId}` : `literal:${literal}`;
}

export function buildLocalGuildRanking(
  current: readonly LocalGuildStatsMember[], historical: readonly LocalGuildStatsMember[],
  category: LocalGuildRankingCategory, mode: DashboardMemberMode, identities: IdentityResolutionSnapshot | null,
  comparison?: { players: readonly LocalGuildStatsMember[]; rosterComplete: boolean },
): LocalGuildRankingRow[] {
  const field = localGuildRankingField(category, mode);
  const valueFor = (member: LocalGuildStatsMember) => {
    const value = finite(member.playerStats[field]);
    return category === "hof" && value != null && value <= 0 ? null : value;
  };
  const ordered = (members: readonly LocalGuildStatsMember[]) => members.map(member => {
    return { member, value: valueFor(member) };
  }).sort((a, b) => {
    if (a.value == null || b.value == null) return a.value == null ? b.value == null ? 0 : 1 : -1;
    const byValue = category === "hof" ? a.value - b.value : b.value - a.value;
    if (byValue || category !== "level") return byValue;
    const ax = finite(a.member.playerStats.xpTotal), bx = finite(b.member.playerStats.xpTotal);
    // Known cumulative XP sorts ahead of missing XP; remaining ties are stable.
    return ax == null ? bx == null ? 0 : 1 : bx == null ? -1 : bx - ax;
  });
  const history = new Map<string, Array<{ rank: number | null; classLabel: string | null; rankCounts: Partial<Record<GameClassKey, number>> }>>();
  const rankCounts: Partial<Record<GameClassKey, number>> = {};
  ordered(historical).forEach((entry, index) => {
    const meta = getExactClassMeta(entry.member.classLabel);
    if (entry.value != null && meta) rankCounts[meta.key] = (rankCounts[meta.key] ?? 0) + 1;
    const key = localGuildRankingIdentityKey(entry.member, identities);
    if (!key) return;
    const bucket = history.get(key) ?? [];
    bucket.push({ rank: entry.value == null ? null : index + 1, classLabel: entry.member.classLabel, rankCounts: { ...rankCounts } });
    history.set(key, bucket);
  });
  // Attribute history includes matching players from other guilds in the same
  // selected snapshot. Only the target guild's roster contributes rank places.
  const values = new Map<string, Array<{ value: number | null; classLabel: string | null }>>();
  for (const member of comparison?.players ?? historical) {
    const key = localGuildRankingIdentityKey(member, identities);
    if (!key) continue;
    const bucket = values.get(key) ?? [];
    bucket.push({ value: valueFor(member), classLabel: member.classLabel });
    values.set(key, bucket);
  }
  const rosterComplete = comparison?.rosterComplete === true && historical.every(member => localGuildRankingIdentityKey(member, identities) != null);
  return ordered(current).map((entry, index) => {
    const key = localGuildRankingIdentityKey(entry.member, identities);
    const bucket = key ? history.get(key) : null;
    const previous = bucket?.length === 1 ? bucket[0] : null;
    const valueBucket = key ? values.get(key) : null;
    const previousValue = valueBucket?.length === 1 ? valueBucket[0] : null;
    const rank = entry.value == null ? null : index + 1;
    return { key: entry.member.key, name: entry.member.name, classLabel: entry.member.classLabel, value: entry.value, rank,
      valueDelta: entry.value != null && previousValue?.value != null ? (category === "hof" ? previousValue.value - entry.value : entry.value - previousValue.value) : null,
      rankDelta: rank != null && previous?.rank != null ? previous.rank - rank : null,
      classComparison: { rankClass: previous?.classLabel ?? null, valueClass: previousValue?.classLabel ?? null, rankCounts: previous?.rankCounts ?? {} },
      rankStatus: rank != null && previous?.rank != null ? "compared" : rank != null && key && !bucket && rosterComplete ? "new" : "unavailable" };
  });
}

export type DashboardRankingScope = "server" | "global";
export type DashboardArchiveRanks = { month: string | null; server: string; payload: MonthlyRankingPayload | null };
export function indexDashboardArchivePlayers(payload: MonthlyRankingPayload | null, identities: IdentityResolutionSnapshot | null) {
  const index = new Map<string, Set<RankingPlayer>>();
  for (const row of payload?.players ?? []) {
    const parsed = parsePlayerIdentifier(row.identifier); if (!parsed) continue;
    const candidates = [row.identifier, buildPlayerIdentifier(parsed.serverKey, parsed.playerId)!];
    const refs = candidates.flatMap(ref => [ref, ...(identities ? resolvePlayerIdentity(identities, ref).aliasIdentifiers : [])]);
    for (const ref of refs) {
      const identity = parsePlayerIdentifier(ref); if (!identity) continue;
      const key = toplistRowIdentity(identity.serverKey, ref, "players"), entries = index.get(key) ?? new Set<RankingPlayer>();
      entries.add(row); index.set(key, entries);
    }
  }
  return index;
}
export function dashboardArchiveMetric(category: string, sumMode: import("../../lib/settings/preferences").AttributeSumMode = "main-con"): keyof RankingPlayer["ranks"] | null {
  const keys: Record<string, keyof RankingPlayer["ranks"]> = {
    "avg-level": "level", "avg-base": sumMode === "all-five" ? "baseAllSum" : "baseSum", "avg-base-main": "baseMain", "avg-base-con": "baseCon",
    "avg-total": sumMode === "all-five" ? "totalAllSum" : "totalSum", "avg-total-main": "totalMain", "avg-total-con": "totalCon", "avg-mine": "mine", "avg-treasury": "treasury",
  };
  return keys[category] ?? null;
}

/** One identity-only lookup shared by badges and whole-roster summaries. */
export function dashboardArchivePlayer(key: string, index: ReturnType<typeof indexDashboardArchivePlayers>) {
  const parsed = parsePlayerIdentifier(key);
  const candidates = parsed ? index.get(toplistRowIdentity(parsed.serverKey, key, "players")) : null;
  return candidates?.size === 1 ? [...candidates][0] : null;
}

export function prepareDashboardHudMembers(
  members: readonly LocalGuildStatsMember[], identities: IdentityResolutionSnapshot | null,
  archivePlayers: ReturnType<typeof indexDashboardArchivePlayers>,
) {
  const byKey = new Map<string, RankingPlayer | null>();
  const groups = new Map<string, { members: LocalGuildStatsMember[]; player: RankingPlayer | null }>();
  const confirmed = new Map<string, Set<string>>();
  for (const group of identities?.players.byIdentityId.values() ?? []) for (const alias of group.aliases) {
    const parsed = parsePlayerIdentifier(alias.identifier);
    if (!parsed) continue;
    const ref = toplistRowIdentity(parsed.serverKey, alias.identifier, "players");
    const owners = confirmed.get(ref) ?? new Set<string>();
    owners.add(`identity:${group.identityId}`); confirmed.set(ref, owners);
  }
  let unresolved = 0;
  for (const member of members) {
    const player = dashboardArchivePlayer(member.key, archivePlayers);
    byKey.set(member.key, player);
    const parsed = parsePlayerIdentifier(member.key);
    const ref = parsed ? toplistRowIdentity(parsed.serverKey, member.key, "players") : null;
    const owners = ref ? confirmed.get(ref) : null;
    const key = owners?.size === 1 ? [...owners][0] : owners?.size ? null : ref;
    if (!key) { unresolved++; continue; }
    const group = groups.get(key);
    if (group) {
      group.members.push(member);
      if (group.player !== player) group.player = null;
    } else groups.set(key, { members: [member], player });
  }
  return { byKey, groups: [...groups.values()], unresolved };
}

export type DashboardHudMembers = ReturnType<typeof prepareDashboardHudMembers>;
export type DashboardHudCount = { hits: number | null; known: number; total: number | null; partial: boolean };
const hudTotal = (value: number | null) => value != null && Number.isInteger(value) && value >= 0 ? value : null;
function hudCount(hits: number, known: number, total: number | null, unresolved: number): DashboardHudCount {
  const declared = hudTotal(total);
  const partial = declared == null || known !== declared || unresolved > 0;
  return { hits: known > 0 ? hits : null, known, total: declared, partial };
}

export function dashboardRankingCounts(members: DashboardHudMembers, category: string, limit: number, total: number | null, sumMode: import("../../lib/settings/preferences").AttributeSumMode = "main-con") {
  const metric = dashboardArchiveMetric(category, sumMode);
  const count = (scope: keyof RankingPlayer["ranks"]["level"]) => {
    let hits = 0, known = 0;
    const seen = new Set<RankingPlayer>();
    for (const { player } of members.groups) {
      if (!player || !metric || player.statuses[metric] !== "available" || seen.has(player)) continue;
      seen.add(player);
      const rank = player.ranks[metric][scope];
      if (rank == null || !Number.isInteger(rank) || rank <= 0) continue;
      known++;
      if (rank <= limit) hits++;
    }
    return hudCount(hits, known, total, members.unresolved);
  };
  return { server: count("server"), serverClass: count("serverClass"), global: count("global"), globalClass: count("globalClass") };
}

// Building definitions include compact ranges (15-45 and 21-100).
export function dashboardBuildingMax(category: "mine" | "treasury") {
  return Math.max(...BUILDINGS[category === "mine" ? "gemmine" : "treasury"].costs.map(row => Number(String(row.level).split("-").slice(-1)[0])));
}

export function dashboardBuildingCount(members: DashboardHudMembers, category: "mine" | "treasury", total: number | null) {
  const max = dashboardBuildingMax(category);
  let hits = 0, known = 0;
  for (const group of members.groups) {
    const values = group.members.map(member => member.playerStats[category]);
    const level = values[0];
    if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > max || values.some(value => value !== level)) continue;
    known++;
    if (level === max) hits++;
  }
  return { ...hudCount(hits, known, total, members.unresolved), max };
}

// Presentation only: retain the prepared order, identities, ranks and deltas.
export function filterGuildRankingClass<T extends { classLabel: string | null }>(rows: readonly T[], selected: ClassSelection): readonly T[] {
  const labels = typeof selected === "string" ? [selected] : selected ?? [];
  if (!labels.length) return rows;
  const keys = new Set(labels.flatMap(label => { const meta = getExactClassMeta(label); return meta ? [meta.key] : []; }));
  return rows.filter(row => { const meta = getExactClassMeta(row.classLabel); return meta != null && keys.has(meta.key); });
}

/** Project both stands from prepared rows. Class changes never sort, read a
 * source or start a worker. Official archive ranks are outside this projection. */
export function selectGuildRankingClass(rows: readonly LocalGuildRankingRow[], selected: ClassSelection): readonly LocalGuildRankingRow[] {
  const filtered = filterGuildRankingClass(rows, selected);
  if (filtered === rows) return rows;
  const labels = typeof selected === "string" ? [selected] : selected ?? [];
  const keys = new Set(labels.flatMap(label => { const meta = getExactClassMeta(label); return meta ? [meta.key] : []; }));
  const included = (label: string | null | undefined) => { const meta = getExactClassMeta(label); return meta != null && keys.has(meta.key); };
  return filtered.map((row, index) => {
    const rank = row.rank == null ? null : index + 1;
    const previous = row.classComparison;
    const previousRank = row.rankDelta != null && included(previous?.rankClass)
      ? [...keys].reduce((sum, key) => sum + (previous?.rankCounts[key] ?? 0), 0) : null;
    return { ...row, rank,
      valueDelta: included(previous?.valueClass) ? row.valueDelta : null,
      rankDelta: rank != null && previousRank != null ? previousRank - rank : null,
      rankStatus: rank != null && previousRank != null ? "compared" : row.rankStatus === "new" ? "new" : "unavailable",
    };
  });
}
