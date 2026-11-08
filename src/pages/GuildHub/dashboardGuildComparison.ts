import { projectProfileSumHistory, type ProfileHistoryMember } from "../../lib/local-player-profile/profileSumHistory";
import { guildAverageCoverage } from "../../lib/guilds/guildAverageCoverage";
import type { AttributeSumMode } from "../../lib/settings/preferences";
import { selectMonthlyGuildRow } from "../../lib/scanArchive/monthlySetComposition";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { parseServerFromGuildIdentifier } from "../../lib/guilds/localScanLibrary";
import { normalizeGuildSegmentForScan } from "../../lib/guilds/guildScanNormalizer";
import { resolveTargetGuildIdentifier, buildGuildTrendTargetIdentifierCandidates } from "../Playground/playerPerformanceModel";
import { auditBegin, auditFields, auditObserveInputs, auditReturn, auditError, auditLeave, auditPrepareGraph, auditResultId, associateAuditResultId, auditFinish } from "../../lib/data-hub/runtimeAudit";
import { buildGuildSnapshotCompletenessReports } from "../../lib/guilds/guildSnapshotCompleteness";
import type { GuildTrendHistory } from "../../lib/local-player-profile/cardTrendExecution";
import type { GuildAnalyticsGuildSnapshot } from "../../lib/guilds/localGuildAnalyticsStore";
import { resolveGuildIdentity, resolvePlayerIdentity } from "../../lib/identities/identityResolution";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import { DASHBOARD_TREND_METRICS, dashboardHistoryValue, dashboardModeMetrics, type DashboardHistoryMetric } from "./dashboardHistory";
import type { DashboardMemberMode } from "./localGuildRanking";
import type { AnchoredLineChartSeries } from "../../components/ui/charts/AnchoredLineChart";
export type GuildHofObservation = { rank: number | null; at: number; server: string; identifier: string };
export type DashboardHistorySeries = AnchoredLineChartSeries & { ownerKey: string; metric: DashboardHistoryMetric };
export type DashboardProgressCoverage = { found: number; declared: number | null; used: number; partial: boolean; reason?: "unknown" | "empty" | "conflict" | "excess" | "missing" | null };
export type DashboardProgressValue = { value: number | null; coverage: DashboardProgressCoverage };
export type GuildComparisonStand = { guild: GuildAnalyticsGuildSnapshot; members: ProfileHistoryMember[]; declared: number | null; found: number; complete: boolean; membershipConflict: boolean; playerHofAverage: number | null; values: Record<DashboardHistoryMetric, number | null>; progress: Record<DashboardHistoryMetric, DashboardProgressValue> };
export type GuildComparisonRow = { key: string; name: string; byTime: Map<number, GuildComparisonStand> };
export const guildComparisonSnapshotKey = (row: { sourceScanId: string; snapshotId: string }) => JSON.stringify([row.sourceScanId, row.snapshotId]);
export type DashboardGuildComparison = ReturnType<typeof buildDashboardGuildComparison>;
const METRICS: readonly DashboardHistoryMetric[] = DASHBOARD_TREND_METRICS;

// StrictMode may evaluate a React memo twice. Keep this prepared comparison
// owned by the immutable validated history, rather than repeating aggregation.
const comparisons = new WeakMap<GuildTrendHistory, Map<string, ReturnType<typeof computeDashboardGuildComparison>>>();
export function buildDashboardGuildComparison(input: GuildTrendHistory | undefined, server: string, currentGuild: string, anchorMs: number, currentSourceId?: string, sumMode: AttributeSumMode = "main-con") {
  if (!input) return computeDashboardGuildComparison(input, server, currentGuild, anchorMs, currentSourceId, sumMode);
  const candidates = buildGuildTrendTargetIdentifierCandidates({ logoIdentifier: currentGuild, server });
  const resolved = input.identity ? candidates.map(ref => resolveGuildIdentity(input.identity, ref)).find(value => value.resolved) : null;
  const key = JSON.stringify([serverComparisonKey(server) ?? server,
    resolved?.identityId ?? normalizeGuildSegmentForScan(currentGuild) ?? currentGuild.toLowerCase(), anchorMs, currentSourceId, sumMode]);
  let entries = comparisons.get(input); if (!entries) { entries = new Map(); comparisons.set(input, entries); }
  const existing = entries.get(key); if (existing) return existing;
  const value = computeDashboardGuildComparison({ ...input, data: projectProfileSumHistory(input.data, sumMode) }, server, currentGuild, anchorMs, currentSourceId, sumMode); entries.set(key, value); return value;
}

function computeDashboardGuildComparison(input: GuildTrendHistory | undefined, server: string, currentGuild: string, anchorMs: number, currentSourceId?: string, sumMode: AttributeSumMode = "main-con") {
  const progressAudit = input ? auditBegin("F37", "guild-comparison", null) : null;
  auditObserveInputs(progressAudit, [input]);
  auditFields(progressAudit, { stage: "comparison", server, endpoint: "complete-roster-comparison; chart-pending" });
  auditPrepareGraph(progressAudit);
  try {
  // These lookups live only for this immutable history computation. Their
  // source/identity/anchor lifetime is already owned by the outer cache key.
  const serverKeys = new Map<unknown, string | null>();
  const serverKeyOf = (value: unknown) => {
    if (!serverKeys.has(value)) serverKeys.set(value, serverComparisonKey(value));
    return serverKeys.get(value)!;
  };
  const guildIdentities = new Map<string, ReturnType<typeof resolveGuildIdentity>>();
  const guildIdentity = (ref: string) => {
    if (!input?.identity) return null;
    let value = guildIdentities.get(ref);
    if (!value) { value = resolveGuildIdentity(input.identity, ref); guildIdentities.set(ref, value); }
    return value;
  };
  const serverKey = serverKeyOf(server);
  const guildKeys = new Map<string, Map<string | null | undefined, Map<string | null | undefined, string>>>();
  const guildKey = (ref: string, rowServer?: string | null, segment?: string | null) => {
    let byServer = guildKeys.get(ref); if (!byServer) { byServer = new Map(); guildKeys.set(ref, byServer); }
    let bySegment = byServer.get(rowServer); if (!bySegment) { bySegment = new Map(); byServer.set(rowServer, bySegment); }
    const previous = bySegment.get(segment); if (previous !== undefined) return previous;
    const resolved = guildIdentity(ref);
    const key = resolved?.resolved ? 'identity:' + resolved.identityId
      : (serverKeyOf(rowServer ?? ref.replace(/_g[^_]+$/i, ''))?.toLowerCase() ?? '') + '_g' + (segment ?? ref.match(/_g([^_]+)$/i)?.[1] ?? ref).replace(/^g/i, '');
    bySegment.set(segment, key); return key;
  };
  const allGuilds = input?.data.guilds.filter(row => row.snapshotTimestamp <= anchorMs) ?? [];
  const currentServerGuilds = allGuilds.filter(row => serverKeyOf(row.server) === serverKey);
  const cohortKeys = new Set(currentServerGuilds.flatMap(row => row.guildIdentifier ? [guildKey(row.guildIdentifier, row.server, row.guildSegment)] : []));
  for (const row of allGuilds) {
    if (!row.guildIdentifier || !input?.identity) continue;
    const aliases = guildIdentity(row.guildIdentifier)!.aliasIdentifiers;
    if (aliases.some(ref => serverKeyOf(ref.replace(/_g[^_]+$/i, "")) === serverKey))
      cohortKeys.add(guildKey(row.guildIdentifier, row.server, row.guildSegment));
  }
  // A current server cohort includes its confirmed historical guild identities.
  // Unlinked guilds on origin servers remain excluded.
  const belongs = (row: { server: string | null; guildIdentifier: string | null; guildSegment: string | null }) =>
    serverKeyOf(row.server) === serverKey || Boolean(row.guildIdentifier && cohortKeys.has(guildKey(row.guildIdentifier, row.server, row.guildSegment)));
  const guilds = allGuilds.filter(belongs);
  const snapshotIds = new Set(guilds.map(row => row.snapshotId));
  for (const row of input?.data.members ?? []) if (row.snapshotTimestamp <= anchorMs && belongs(row)) snapshotIds.add(row.snapshotId);
  const times = [...new Set([...(input?.data.snapshots.filter(row => row.snapshotTimestamp <= anchorMs && snapshotIds.has(row.id)).map(row => row.snapshotTimestamp) ?? []), ...guilds.map(row => row.snapshotTimestamp)])].filter(at => at >= (input?.visibleStartMs ?? -Infinity)).sort((a, b) => a - b);
  const roster = new Map<string, ProfileHistoryMember[]>();
  for (const row of input?.data.members ?? []) {
    if (!row.guildIdentifier || row.snapshotTimestamp > anchorMs || !belongs(row)) continue;
    const key = row.snapshotId + ':' + guildKey(row.guildIdentifier, row.server, row.guildSegment ?? row.groupSegment);
    const rows = roster.get(key) ?? []; rows.push(row); roster.set(key, rows);
  }
  // Conflicting membership is evaluated at the actual source-bound snapshot.
  const assignments = new Map<string, Set<string>>();
  const playerKeys = new Map<string, string>();
  const playerKey = (row: ProfileHistoryMember) => {
    const previous = playerKeys.get(row.memberRef); if (previous !== undefined) return previous;
    const resolved = input?.identity ? resolvePlayerIdentity(input.identity, row.memberRef) : null;
    const key = resolved?.resolved ? resolved.identityId! : row.memberRef.toLowerCase();
    playerKeys.set(row.memberRef, key); return key;
  };
  for (const row of input?.data.members ?? []) {
    if (!row.guildIdentifier) continue;
    const key = row.snapshotId + ':' + playerKey(row);
    const keys = assignments.get(key) ?? new Set<string>();
    keys.add(guildKey(row.guildIdentifier, row.server, row.guildSegment ?? row.groupSegment));
    assignments.set(key, keys);
  }
  const completeness = new Map(buildGuildSnapshotCompletenessReports(input?.data).map(report => [report.snapshotId + ':' + report.guildIdentifier?.toLowerCase(), report]));
  const byGuild = new Map<string, GuildComparisonRow>();
  // Keep source-bound observations for the member chart independently of the
  // existing Compare display's timestamp selection. A file can contain many scans.
  const observationStands = new Map<string, Map<string, GuildComparisonStand>>();
  const snapshotTimes = new Map<string, number | null>();
  for (const snapshot of input?.data.snapshots ?? []) {
    const key = guildComparisonSnapshotKey({ sourceScanId: snapshot.sourceScanId, snapshotId: snapshot.id });
    const previous = snapshotTimes.get(key);
    snapshotTimes.set(key, previous === undefined || previous === snapshot.snapshotTimestamp ? snapshot.snapshotTimestamp : null);
  }
  for (const guild of guilds.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    if (!guild.guildIdentifier) continue;
    const key = guildKey(guild.guildIdentifier, guild.server, guild.guildSegment);
    const unique = new Map<string, ProfileHistoryMember>();
    for (const row of roster.get(guild.snapshotId + ':' + key) ?? []) {
      const memberKey = playerKey(row);
      const previous = unique.get(memberKey);
      if (!previous || METRICS.filter(metric => dashboardHistoryValue(row, metric) != null).length > METRICS.filter(metric => dashboardHistoryValue(previous, metric) != null).length) unique.set(memberKey, row);
    }
    const members = [...unique.values()];
    const conflict = members.some(row => (assignments.get(row.snapshotId + ':' + playerKey(row))?.size ?? 0) > 1);
    // A count inferred from available rows is never proof of a declared roster.
    const declared = typeof guild.declaredMemberCount === 'number' && Number.isInteger(guild.declaredMemberCount) && guild.declaredMemberCount > 0 ? guild.declaredMemberCount : null;
    const report = completeness.get(guild.snapshotId + ':' + guild.guildIdentifier.toLowerCase());
    const found = report?.foundUniqueMemberCount ?? members.length;
    const complete = declared != null && found === declared && members.length === declared;
    // Aggregate every metric once. Modes and scan detail reads only select it.
    const values = Object.fromEntries(METRICS.map(metric => {
      const observed = members.map(row => dashboardHistoryValue(row, metric));
      return [metric, complete && observed.length && observed.every(value => value != null)
        ? (observed as number[]).reduce((sum, value) => sum + value, 0) / observed.length : null];
    })) as Record<DashboardHistoryMetric, number | null>;
    // Dashboard display only. Strict values above and prepared source rows stay intact.
    const progress = Object.fromEntries(METRICS.map(metric => {
      // A sum uses the same members for both components and the stored sum.
      const required: DashboardHistoryMetric[] = sumMode === "all-five" ? [metric] : metric === "base" ? ["baseMain", "conBase", "base"]
        : metric === "total" ? ["attrTotal", "conTotal", "total"] : [metric];
      const valid = members.filter(row => required.every(field => dashboardHistoryValue(row, field) != null));
      const used = valid.length;
      const coverage = guildAverageCoverage(members.length, declared, used, conflict);
      const value = coverage.reason == null ? valid.reduce((sum, row) => sum + dashboardHistoryValue(row, metric)!, 0) / used : null;
      return [metric, { value, coverage }];
    })) as Record<DashboardHistoryMetric, DashboardProgressValue>;
    const hofValues = members.map(row => dashboardHistoryValue(row, "hof"));
    const playerHofAverage = complete && !conflict && hofValues.length > 0 && hofValues.every(value => value != null)
      ? (hofValues as number[]).reduce((a, b) => a + b, 0) / hofValues.length : null;
    const stand: GuildComparisonStand = { playerHofAverage, guild, members, declared, found, complete, membershipConflict: conflict, values, progress };
    const item = byGuild.get(key) ?? { key, name: guild.guildName ?? guild.guildIdentifier, byTime: new Map<number, GuildComparisonStand>() };
    const previous = item.byTime.get(guild.snapshotTimestamp);
    const score = (value: GuildComparisonStand) => Number(value.complete) * 100 + METRICS.filter(metric => guildComparisonValue(value, metric) != null).length;
    const observations = observationStands.get(key) ?? new Map<string, GuildComparisonStand>();
    const snapshotKey = guildComparisonSnapshotKey(guild), oldObservation = observations.get(snapshotKey);
    if (!oldObservation || score(stand) >= score(oldObservation)) observations.set(snapshotKey, stand);
    observationStands.set(key, observations);
    if (!previous || score(stand) >= score(previous)) item.byTime.set(guild.snapshotTimestamp, stand);
    if (!previous || guild.snapshotTimestamp >= Math.max(...item.byTime.keys())) item.name = guild.guildName ?? guild.guildIdentifier;
    byGuild.set(key, item);
  }
  const currentRef = resolveTargetGuildIdentifier(allGuilds, input?.identity ?? null, { logoIdentifier: currentGuild, server }) ?? currentGuild;
  const currentGuildKey = guildKey(currentRef, server);
  const rows = [...byGuild.values()].filter(row => [...row.byTime.values()].some(stand => stand.complete)).sort((a, b) => Number(b.key === currentGuildKey) - Number(a.key === currentGuildKey) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  // Rank the visible cohort by its latest known current-server HoF placement
  // at the anchor. Historical origin-server ranks never become current ranks.
  const hofGuilds = new Map(byGuild);
  const hof = new Map<string, Map<number, GuildHofObservation>>();
  const ranks = new Map<string, { rank: number | null; at: number }>();
  for (const observation of input?.guildRankings ?? []) {
    if (!observation.guildIdentifier ||
        !Number.isFinite(observation.timestampMs) || observation.timestampMs > anchorMs) continue;
    // Summary metadata keeps raw identifiers (f28_net_g...), while confirmed
    // identities may only contain the existing canonical form (f28_g...).
    const candidates = buildGuildTrendTargetIdentifierCandidates({ logoIdentifier: observation.guildIdentifier, server: observation.server });
    const identifier = input?.identity ? candidates.find(ref => resolveGuildIdentity(input.identity, ref).resolved) ?? observation.guildIdentifier : observation.guildIdentifier;
    const key = guildKey(identifier, observation.server), previous = ranks.get(key);
    if (!hofGuilds.has(key)) {
      if (serverKeyOf(observation.server) !== serverKey && key !== currentGuildKey) continue;
      hofGuilds.set(key, { key, name: observation.guildIdentifier, byTime: new Map() });
    }
    const rank = Number.isInteger(observation.hofRank) && observation.hofRank! > 0 ? observation.hofRank : null;
    const observations = hof.get(key) ?? new Map<number, GuildHofObservation>();
    const old = observations.get(observation.timestampMs);
    observations.set(observation.timestampMs, { rank: old && old.rank !== rank ? null : rank,
      at: observation.timestampMs, server: observation.server, identifier: observation.guildIdentifier });
    hof.set(key, observations);
    // The picker still uses only current-server placement; historical origin
    // observations remain in the graph with their actual server and timestamp.
    if (serverKeyOf(observation.server) !== serverKey) continue;
    if (!previous || observation.timestampMs >= previous.at) ranks.set(key, {
      rank: Number.isInteger(observation.hofRank) && observation.hofRank! > 0 ? observation.hofRank : null,
      at: observation.timestampMs,
    });
  }
  // Additive strict Current-scan selection for the member chart. Never inherit
  // the Compare picker's latest-known historical placement.
  const currentHofRanks = new Map<string, number | null>();
  for (const observation of input?.guildRankings ?? []) {
    if (observation.timestampMs !== anchorMs || serverKeyOf(observation.server) !== serverKey ||
        currentSourceId && observation.sourceScanId !== currentSourceId || !observation.guildIdentifier) continue;
    const candidates = buildGuildTrendTargetIdentifierCandidates({ logoIdentifier: observation.guildIdentifier, server: observation.server });
    const identifier = input?.identity ? candidates.find(ref => resolveGuildIdentity(input.identity, ref).resolved) ?? observation.guildIdentifier : observation.guildIdentifier;
    const key = guildKey(identifier, observation.server);
    const rank = Number.isInteger(observation.hofRank) && observation.hofRank! > 0 ? observation.hofRank : null;
    currentHofRanks.set(key, currentHofRanks.has(key) && currentHofRanks.get(key) !== rank ? null : rank);
  }
  const progressRows = [...byGuild.values()];
  const topRows = progressRows.filter(row => (ranks.get(row.key)?.rank ?? Infinity) <= 15)
    .sort((a, b) => (ranks.get(a.key)?.rank ?? Infinity) - (ranks.get(b.key)?.rank ?? Infinity) || a.key.localeCompare(b.key))
    .slice(0, 15);
  const primary = progressRows.find(row => row.key === currentGuildKey);
  const displayRows = primary && !topRows.includes(primary) ? [...topRows, primary] : topRows;
  const hofTopRows = [...hofGuilds.values()].filter(row => (ranks.get(row.key)?.rank ?? Infinity) <= 15)
    .sort((a, b) => (ranks.get(a.key)?.rank ?? Infinity) - (ranks.get(b.key)?.rank ?? Infinity) || a.key.localeCompare(b.key)).slice(0, 15);
  const hofPrimary = hofGuilds.get(currentGuildKey);
  const hofDisplayRows = hofPrimary && !hofTopRows.includes(hofPrimary) ? [...hofTopRows, hofPrimary] : hofTopRows;
  const stands = [...byGuild.values()].flatMap(row => [...row.byTime.values()]);
  const diagnostics = { loadedGuildScans: guilds.length, serverScanTimes: times.length,
    declaredGuildScans: stands.filter(stand => stand.declared != null).length,
    completeGuildScans: stands.filter(stand => stand.complete).length, guildCount: rows.length, displayedGuildCount: displayRows.length, hofRankCutoff: 15, rankedGuildCount: rows.filter(row => ranks.get(row.key)?.rank != null).length,
    ...Object.fromEntries(METRICS.map(metric => [metric + "Values", stands.filter(stand => stand.values[metric] != null).length])) };
  auditFields(progressAudit, { ...diagnostics, scanCount: times.length, comparisonReady: displayRows.length > 0 });
  if (!displayRows.length) auditFinish(progressAudit, "missing", { reason: "No selected server guild scans; chart not built" });
  const fusionServersByGuild = new Map([...hofGuilds.values()].map(row => [row.key, [...new Set([
    ...[...row.byTime.values()].flatMap(stand => [stand.guild.server, parseServerFromGuildIdentifier(stand.guild.guildIdentifier)]),
    ...[...(hof.get(row.key)?.values() ?? [])].flatMap(observation => [observation.server, parseServerFromGuildIdentifier(observation.identifier)]),
  ].filter((value): value is string => Boolean(value)))]]));
  const hofTimes = [...new Set([...hof.values()].flatMap(rows => [...rows.keys()]))].filter(at => at >= (input?.visibleStartMs ?? -Infinity)).sort((a, b) => a - b);
  return auditReturn(progressAudit, { visibleStartMs: input?.visibleStartMs, observationStands, snapshotTimes, allRows: progressRows, currentHofRanks, rows, displayRows, hofDisplayRows, times, hof, hofTimes, fusionServersByGuild, diagnostics, currentGuildKey, timeDomain: times.length ? { startMs: times[0], endMs: times[times.length - 1] } : null });
  } catch(error) { auditError(progressAudit, error); throw error; } finally { auditLeave(progressAudit); }
}

export function guildComparisonValue(stand: GuildComparisonStand | undefined, metric: DashboardHistoryMetric): number | null {
  return metric === "hof" ? null : stand?.values[metric] ?? null;
}

export function dashboardSeriesColor(ownerIndex: number, metricIndex: number, metricCount: number) {
  return 'hsl(' + ownerIndex * 137.508 % 360 + ' 65% ' + (metricCount === 1 ? 65 : [72, 48, 88][metricIndex]) + '%)';
}
const seriesCache = new WeakMap<DashboardGuildComparison, Map<string, DashboardHistorySeries[]>>();
export function guildComparisonSeries(history: DashboardGuildComparison, mode: DashboardMemberMode, metricLabel: (metric: DashboardHistoryMetric) => string): DashboardHistorySeries[] {
  const metrics = dashboardModeMetrics(mode);
  const cacheKey = JSON.stringify([mode, ...metrics.map(metricLabel)]);
  let cache = seriesCache.get(history); if (!cache) { cache = new Map(); seriesCache.set(history, cache); }
  const existing = cache.get(cacheKey); if (existing) return existing;
  const audit = auditBegin("F37", "progress-series", null);
  auditObserveInputs(audit, [history]);
  const series = (mode === "general" ? history.hofDisplayRows : history.displayRows).flatMap((row, index) => metrics.map((metric, metricIndex) => ({ key: row.key + '::' + metric, ownerKey: row.key, metric, label: row.name + ' · ' + metricLabel(metric), points: [], color: dashboardSeriesColor(index, metricIndex, metrics.length), prominent: row.key === history.currentGuildKey,
    timePoints: (metric === "hof" ? history.hofTimes : history.times).map(timestampMs => ({ timestampMs, value: metric === "hof" ? history.hof.get(row.key)?.get(timestampMs)?.rank ?? null : row.byTime.get(timestampMs)?.progress[metric].value ?? null })) })));
  const dataPoints = series.reduce((count, row) => count + row.timePoints.length, 0);
  const observedPoints = series.reduce((count, row) => count + row.timePoints.filter(point => point.value != null).length, 0);
  auditFields(audit, { mode, seriesCount: series.length, dataPoints, observedPoints, endpoint: "series-ready; chart-pending" });
  if (!observedPoints) auditFinish(audit, "missing", { reason: "No observed metric values; chart not built" });
  auditReturn(audit, series); auditLeave(audit);
  associateAuditResultId(series, auditResultId(history)); cache.set(cacheKey, series);
  return series;
}

// Immutable chart preparation reuses the metric-specific aggregates above.
// Explicit archive additions use their monthly set's physical guild source;
// independent observations and the strict performance model stay intact.
export type DashboardTrendArchiveContext = { entries: readonly ScanArchiveEntry[]; summaries: readonly GuildHubScanSummary[] };
type ChartInterval = import("../../components/guild-trend/GuildTrendChart").GuildTrendChartInterval;
const trendCache = new WeakMap<DashboardGuildComparison, Map<DashboardTrendArchiveContext | undefined, ChartInterval[]>>();
export function buildDashboardGuildTrendIntervals(history: DashboardGuildComparison, archive?: DashboardTrendArchiveContext): ChartInterval[] {
  let cached = trendCache.get(history); if (!cached) { cached = new Map(); trendCache.set(history, cached); }
  const existing = cached.get(archive); if (existing) return existing;
  const allStands = [...(history.displayRows.find(row => row.key === history.currentGuildKey)?.byTime.values() ?? [])]
    .sort((a, b) => a.guild.snapshotTimestamp - b.guild.snapshotTimestamp);
  const summaries = new Map(archive?.summaries.map(summary => [summary.sourceScanId, summary]) ?? []);
  type ArchiveMember = Pick<ScanArchiveEntry, "id" | "sha256" | "manifestUrl" | "timestamp" | "server" | "playerCount" | "groupCount" | "monthlySets">;
  const entries = new Map<string, ArchiveMember>(archive?.entries.map(entry => [entry.id, entry]) ?? []);
  // The existing feature request filters out guild-only files. Their compact
  // manifest descriptors still travel with the explicitly selected set.
  for (const entry of archive?.entries ?? []) for (const set of entry.monthlySets ?? []) {
    for (const member of set.members) if (!entries.has(member.id)) entries.set(member.id, { ...member, manifestUrl: entry.manifestUrl, monthlySets: [set] });
  }
  const boundEntries = (stand: GuildComparisonStand) => {
    const summary = summaries.get(stand.guild.sourceScanId);
    if (!summary?.contentHash || stand.guild.sourceGeneration && summary.sourceGeneration !== stand.guild.sourceGeneration) return [];
    return (summary.archiveBindings ?? []).flatMap(binding => {
      const entry = entries.get(binding.archiveScanId);
      return entry && binding.localScanId === summary.sourceScanId && binding.localContentHash === summary.contentHash
        && binding.sha256.toLowerCase() === entry.sha256.toLowerCase() && binding.manifestUrl === entry.manifestUrl
        && binding.timestamp === entry.timestamp && entry.timestamp === stand.guild.snapshotTimestamp
        && serverComparisonKey(entry.server) === serverComparisonKey(stand.guild.server) ? [entry] : [];
    });
  };
  const bound = new Map(allStands.map(stand => [stand, boundEntries(stand)]));
  const supplements: { observedAt: number; memberAt: number }[] = [];
  const stands = allStands.filter(stand => {
    // An explicitly bound addition can contain guild metadata without players,
    // or only missing players without a guild observation. The latter can yield
    // an inferred partial guild row; it is not another monthly guild source.
    // Keep every source row, but use the set's complete physical guild roster
    // at its own time instead of inserting an artificial interval boundary.
    if (stand.complete || stand.membershipConflict) return true;
    for (const entry of bound.get(stand) ?? []) {
      const guildOnly = entry.playerCount === 0 && entry.groupCount > 0 && !stand.members.length && stand.declared != null;
      const playersOnly = entry.playerCount > 0 && entry.groupCount === 0 && stand.members.length > 0;
      if (!guildOnly && !playersOnly) continue;
      for (const set of entry.monthlySets ?? []) {
        const candidates = allStands.filter(candidate => candidate.guild.snapshotTimestamp < stand.guild.snapshotTimestamp
          && (stand.declared == null || candidate.declared === stand.declared) && candidate.complete && !candidate.membershipConflict
          && (!playersOnly || stand.members.every(member => candidate.members.some(source => source.memberRef === member.memberRef)))
          && (bound.get(candidate) ?? []).some(source => set.scanIds.includes(source.id) && source.monthlySets?.some(other => other.key === set.key)));
        const choices = candidates.map(candidate => ({ candidate, server: candidate.guild.server ?? "", guildIdentifier: candidate.guild.guildIdentifier!,
          memberBasisStatus: "complete" as const, scanTimestamp: candidate.guild.snapshotTimestamp, archiveScanId: candidate.guild.sourceScanId }));
        const selected = choices.reduce<typeof choices[number] | undefined>((previous, candidate) => previous ? selectMonthlyGuildRow(previous, candidate) : candidate, undefined);
        if (selected) { supplements.push({ observedAt: stand.guild.snapshotTimestamp, memberAt: selected.candidate.guild.snapshotTimestamp }); return false; }
      }
    }
    return true;
  });
  const endpoint = (stand: GuildComparisonStand) => ({ snapshotId: stand.guild.snapshotId, scannedAtMs: stand.guild.snapshotTimestamp });
  const intervals = stands.slice(1).map((end, index) => {
    const start = stands[index], elapsedDays = (end.guild.snapshotTimestamp - start.guild.snapshotTimestamp) / 86400000;
    const metric = (key: typeof DASHBOARD_TREND_METRICS[number]) => {
      const a = start.progress[key].value, b = end.progress[key].value;
      return a == null || b == null ? null : { startAverage: a, endAverage: b, absoluteGrowth: b - a, perDay: (b - a) / elapsedDays, trendPerDay: null as number | null };
    };
    const values = Object.fromEntries(DASHBOARD_TREND_METRICS.map(key => [key, metric(key)])) as Record<typeof DASHBOARD_TREND_METRICS[number], ReturnType<typeof metric>>;
    const observations = Object.fromEntries(DASHBOARD_TREND_METRICS.map(key => [key, { start: start.progress[key].value, end: end.progress[key].value }])) as NonNullable<ChartInterval["observations"]>;
    const coverage = Object.fromEntries(DASHBOARD_TREND_METRICS.map(key => [key, { start: start.progress[key].coverage, end: end.progress[key].coverage }])) as NonNullable<ChartInterval["coverage"]>;
    return { start: endpoint(start), end: endpoint(end), elapsedDays, fullDays: Math.floor(elapsedDays), ...values, observations, coverage,
      archiveSupplements: supplements.filter(supplement => supplement.observedAt > start.guild.snapshotTimestamp && supplement.observedAt < end.guild.snapshotTimestamp) };
  }).filter(interval => interval.elapsedDays > 0);
  intervals.forEach((interval, index) => {
    for (const key of DASHBOARD_TREND_METRICS) {
      const value = interval[key]; if (!value) continue;
      const indexes = index === 0 ? [index, index + 1] : index === intervals.length - 1 ? [index - 1, index] : [index - 1, index, index + 1];
      let delta = 0, days = 0;
      for (const i of indexes) { const neighbor = intervals[i]; if (neighbor?.[key]) { delta += neighbor[key]!.absoluteGrowth; days += neighbor.elapsedDays; } }
      value.trendPerDay = days > 0 ? delta / days : null;
    }
  });
  const visible = intervals.filter(interval => interval.end.scannedAtMs >= (history.visibleStartMs ?? -Infinity));
  cached.set(archive, visible); return visible;
}
