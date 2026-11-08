import { projectProfileSumHistory, type ProfileHistoryMember } from "../../lib/local-player-profile/profileSumHistory";
import type { AttributeSumMode } from "../../lib/settings/preferences";
import type { GuildTrendHistory } from "../../lib/local-player-profile/cardTrendExecution";
import { resolveGuildIdentity, resolvePlayerIdentity } from "../../lib/identities/identityResolution";
import type { AnchoredLineChartSeries } from "../../components/ui/charts/AnchoredLineChart";
import { buildAnalyticsIndexes, buildPlayerPerformanceModel } from "../Playground/playerPerformanceModel";
import type { GuildTrendChartMetric } from "../../components/guild-trend/GuildTrendChart";

export type DashboardHistoryMetric = "hof" | "xp" | "baseMain" | "conBase" | "base" | "attrTotal" | "conTotal" | "total" | "mine" | "treasury";
export const DASHBOARD_TREND_METRICS = ["xp", "baseMain", "conBase", "base", "attrTotal", "conTotal", "total", "mine", "treasury"] as const;
export const dashboardModeMetrics = (mode: import("./localGuildRanking").DashboardMemberMode): DashboardHistoryMetric[] => mode === "general" ? ["hof"] : mode === "progress" ? ["xp"] : mode === "base" ? ["baseMain", "conBase", "base"] : mode === "total" ? ["attrTotal", "conTotal", "total"] : ["mine", "treasury"];
export const dashboardHistoryValue = (row: ProfileHistoryMember | undefined, metric: DashboardHistoryMetric): number | null => {
  if (metric === "hof") return typeof row?.hofRank === "number" && Number.isFinite(row.hofRank) && row.hofRank > 0 ? row.hofRank : null;
  let value: unknown;
  if (metric === "base") value = row && "profileBaseStats" in row ? row.profileBaseStats : row?.focusedBaseStats;
  else if (metric === "total") value = row && "profileTotalStats" in row ? row.profileTotalStats : row?.focusedTotalStats;
  else value = metric === "xp" ? row?.xpTotal : row?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export type DashboardHistoryMember = { key: string; name: string; classLabel: string | null; classMeta?: import("../../data/classes").ClassMeta | null; localRef?: { identifier: string | null } };
export type DashboardHistory = ReturnType<typeof buildDashboardHistory>;

// Reuse validated, prepared analytics from the existing guild job; no extra reads.
export function buildDashboardHistory(input: GuildTrendHistory | undefined, members: readonly DashboardHistoryMember[], guildRef: string, anchorMs: number, sumMode: AttributeSumMode = "main-con") {
  if (input) input = { ...input, data: projectProfileSumHistory(input.data, sumMode) };
  const identity = input?.identity;
  const guildAliases = new Set([guildRef, ...(identity ? resolveGuildIdentity(identity, guildRef).aliasIdentifiers : [])].map(ref => ref.toLowerCase()));
  const rosterAliases = new Set(members.flatMap(member => {
    const ref = member.localRef?.identifier ?? member.key;
    return [ref, ...(identity ? resolvePlayerIdentity(identity, ref).aliasIdentifiers : [])].map(value => value.toLowerCase());
  }));
  const observations = input?.data.members.filter(row => row.snapshotTimestamp <= anchorMs && rosterAliases.has(row.memberRef.toLowerCase())) ?? [];
  // Keep complete supporting guild rosters for the existing rate calculation,
  // while only current members become visible series or picker entries.
  const supportingGuilds = new Set([...guildAliases, ...observations.flatMap(row => row.guildIdentifier ? [row.guildIdentifier.toLowerCase()] : [])]);
  const relevantSnapshots = new Set([...observations.map(row => row.snapshotId), ...input?.data.guilds.filter(row => row.snapshotTimestamp <= anchorMs && guildAliases.has(row.guildIdentifier?.toLowerCase() ?? "")).map(row => row.snapshotId) ?? []]);
  const data = input ? {
    ...input.data,
    guilds: input.data.guilds.filter(row => row.snapshotTimestamp <= anchorMs && supportingGuilds.has(row.guildIdentifier?.toLowerCase() ?? "")),
    members: input.data.members.filter(row => row.snapshotTimestamp <= anchorMs && (rosterAliases.has(row.memberRef.toLowerCase()) || supportingGuilds.has(row.guildIdentifier?.toLowerCase() ?? ""))),
    snapshots: input.data.snapshots.filter(row => row.snapshotTimestamp <= anchorMs && relevantSnapshots.has(row.id)),
  } : { members: [], guilds: [], snapshots: [] };
  const basisTimes = [...new Set([...data.snapshots.map(row => row.snapshotTimestamp), ...observations.map(row => row.snapshotTimestamp), ...data.guilds.filter(row => guildAliases.has(row.guildIdentifier?.toLowerCase() ?? "")).map(row => row.snapshotTimestamp)])].sort((a, b) => a - b);
  const times = basisTimes.filter(at => at >= (input?.visibleStartMs ?? -Infinity));
  // Index once in this validated history/anchor context. Alias unions retain
  // source order, including stable ties used by the existing row selection.
  const membersByRef = new Map<string, { row: typeof data.members[number]; index: number }[]>();
  data.members.forEach((row, index) => {
    const key = row.memberRef.toLowerCase();
    const rows = membersByRef.get(key) ?? [];
    rows.push({ row, index }); membersByRef.set(key, rows);
  });
  const rows = members.map((member, index) => {
    const ref = member.localRef?.identifier ?? member.key;
    const aliases = new Set([ref, ...(identity ? resolvePlayerIdentity(identity, ref).aliasIdentifiers : [])].map(value => value.toLowerCase()));
    const observations = [...aliases].flatMap(alias => membersByRef.get(alias) ?? [])
      .sort((left, right) => left.index - right.index).map(entry => entry.row);
    const byTime = new Map<number, typeof data.members[number]>();
    // Stable tie-break, favor the current reference when observations overlap.
    for (const row of observations.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      const previous = byTime.get(row.snapshotTimestamp);
      if (!previous || row.memberRef.toLowerCase() === ref.toLowerCase() || previous.memberRef.toLowerCase() !== ref.toLowerCase()) byTime.set(row.snapshotTimestamp, row);
    }
    return { member, ref, byTime, observations, color: "hsl(" + index * 137.508 % 360 + " 65% 65%)" };
  });
  const series = (metric: DashboardHistoryMetric): AnchoredLineChartSeries[] => rows.map(row => ({
    key: row.member.key, label: row.member.name, points: [], color: row.color,
    timePoints: times.map(timestampMs => {
      const value = dashboardHistoryValue(row.byTime.get(timestampMs), metric);
      return { timestampMs, value: typeof value === "number" && Number.isFinite(value) ? value : null };
    }),
  }));
  return { data, identity, times, basisTimes, rows, xp: series("xp"), base: series("base"), total: series("total"), mine: series("mine"), treasury: series("treasury"), timeDomain: times.length ? { startMs: times[0], endMs: times[times.length - 1] } : null };
}

type DashboardMemberTrendPair = {
  start: { scannedAtMs: number }; end: { scannedAtMs: number };
  endValue: number | null; growth: number | null; perDay: number | null;
  xpDelta?: number | null; xpPerDay?: number | null;
};
const memberTrends = new WeakMap<DashboardHistory, Map<GuildTrendChartMetric, ReturnType<typeof computeDashboardMemberTrends>>>();
export function buildDashboardMemberTrends(history: DashboardHistory, metric: GuildTrendChartMetric) {
  let entries = memberTrends.get(history); if (!entries) { entries = new Map(); memberTrends.set(history, entries); }
  const existing = entries.get(metric); if (existing) return existing;
  const value = computeDashboardMemberTrends(history, metric); entries.set(metric, value); return value;
}
function computeDashboardMemberTrends(history: DashboardHistory, metric: GuildTrendChartMetric) {
  const legacy = metric === "xp" || metric === "base";
  const indexes = legacy ? buildAnalyticsIndexes(history.data) : null;
  return history.rows.map(row => {
    const pairs: DashboardMemberTrendPair[] = legacy ? buildPlayerPerformanceModel([], {
      analyticsData: history.data, identityResolutionSnapshot: history.identity, preparedIndexes: indexes!,
      target: { memberRef: row.ref, name: row.member.name },
    }).segments.map(pair => {
      if (metric === "xp") return { ...pair, endValue: pair.end.xpTotal, growth: pair.xpDelta, perDay: pair.xpPerDay };
      const a = dashboardHistoryValue(row.byTime.get(pair.start.scannedAtMs), "base"), b = dashboardHistoryValue(row.byTime.get(pair.end.scannedAtMs), "base");
      const growth = a == null || b == null ? null : b - a, days = (pair.end.scannedAtMs - pair.start.scannedAtMs) / 86400000;
      return { ...pair, endValue: b, growth, perDay: growth == null || days <= 0 ? null : growth / days };
    })
      : history.basisTimes.slice(1).map((at, index) => {
        const startAt = history.basisTimes[index], days = (at - startAt) / 86400000;
        const a = dashboardHistoryValue(row.byTime.get(startAt), metric), b = dashboardHistoryValue(row.byTime.get(at), metric);
        const growth = a == null || b == null ? null : b - a;
        return { start: { scannedAtMs: startAt }, end: { scannedAtMs: at }, endValue: b, growth, perDay: growth == null || days <= 0 ? null : growth / days };
      });
    const visiblePairs = pairs.filter(pair => history.times.includes(pair.end.scannedAtMs));
    const values = new Map(visiblePairs.map(pair => [pair.end.scannedAtMs, pair.perDay]));
    return { key: row.member.key, label: row.member.name, color: row.color, points: [],
      timePoints: history.times.map(timestampMs => ({ timestampMs, value: values.get(timestampMs) ?? null })), pairs: visiblePairs };
  });
}
