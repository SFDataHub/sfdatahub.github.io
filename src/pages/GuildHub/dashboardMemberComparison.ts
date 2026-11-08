import { compareComparisonScanAge } from "../../lib/player-progress/comparisonScanSelection";
import { confirmedGuildObservationsMatch, guildObservationIdentifierCandidates } from "../../lib/identities/guildObservationIdentity";
import { getGuildHubLocalScan, selectGuildHubRawSnapshot, isGuildHubScanAnalyticsEnabled, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { readGuildAnalyticsScopedData, readGroupAnalyticsInfo } from "../../lib/guilds/localGuildAnalyticsStore";
import { buildGuildSnapshotCompletenessReports } from "../../lib/guilds/guildSnapshotCompleteness";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity } from "../../lib/identities/identityResolution";
import { normalizeGuildIdentifierKey } from "../../lib/identities/guildIdentityStore";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, type LocalDependencyReceipt } from "../../lib/local-data/localDataDependencies";
import { matchesLocalSourceValidity } from "../../lib/guilds/localSourceValidity";
import { normalizeGuildSegmentForScan } from "../../lib/guilds/guildScanNormalizer";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import { buildLocalGuildRanking, guildModeCategories, localGuildRankingIdentityKey, localGuildRankingCoverage, type DashboardMemberMode, type LocalGuildRankingComparison, type LocalGuildRankingComparisonCoverage } from "./localGuildRanking";
import { readLocalGuildRankingComparisonMembers, readLocalGuildRankingValueMembers, LocalGuildRankingRosterError } from "./useLocalGuildRankingComparison";
import { projectLocalGuildMembers, summarizeLocalGuildPlayerStats, type LocalGuildStatsMember } from "./localGuildPlayerStats";
import { summarizeScanIdentities } from "./dashboardScanIdentity";

import { comparisonRosterTrace, COMPARISON_DIAGNOSTIC_VERSION } from "./dashboardComparisonDiagnostic";

export type DashboardMemberComparisonRequest = {
  diagnostic?: boolean;
  selectedComparison?: { sourceScanId: string; scannedAtMs: number; guildIdentifier: string } | null;
  summaries: GuildHubScanSummary[]; currentSourceId: string; currentTimestamp: number;
  guild: { name: string; server: string; logoIdentifier: string }; members: LocalGuildStatsMember[];
  currentGuildIdentifier?: string | null; currentDeclaredMemberCount?: number | null;
};
export type DashboardMemberComparisonResult = {
  dependencies: LocalDependencyReceipt; comparison: LocalGuildRankingComparison;
  work: { rawReads: number; normalizedPlayers: number; derivedSelectionRows: number; projections: number; elapsedMs: number };
};

/** Existing 28-day fallback, evaluated in preference order so missing derived
 * evidence needs only the first complete eligible observation, never a history build. */
export function orderMemberComparisonCandidates<T extends { scannedAtMs: number; sourceScanId: string; guildIdentifier: string }>(
  candidates: T[], currentTimestamp: number, preferredIdentifier: string,
) {
  const older = candidates.filter(c => c.scannedAtMs < currentTimestamp);
  const tie = (a: T, b: T) => Number(b.guildIdentifier.toLowerCase() === preferredIdentifier.toLowerCase()) - Number(a.guildIdentifier.toLowerCase() === preferredIdentifier.toLowerCase()) || b.sourceScanId.localeCompare(a.sourceScanId);
  return older.sort((a, b) => compareComparisonScanAge(a.scannedAtMs, b.scannedAtMs, currentTimestamp) || tie(a, b));
}


/** Manual values use the chosen observation as the temporal ceiling. Keep the
 * existing older-first eligibility; never substitute the current 28-day stand. */
export function orderMemberValueCandidates<T extends { scannedAtMs: number; sourceScanId: string; guildIdentifier: string }>(
  candidates: T[], currentTimestamp: number, preferredIdentifier: string, selectedAt: number | null,
) {
  if (selectedAt == null) return orderMemberComparisonCandidates(candidates, currentTimestamp, preferredIdentifier);
  return orderMemberComparisonCandidates(candidates.filter(candidate => candidate.scannedAtMs <= selectedAt), selectedAt + 1, preferredIdentifier)
    .sort((a, b) => b.scannedAtMs - a.scannedAtMs); // stable existing identity/source ties
}

export function memberComparisonObservationKey(stand: { sourceScanId: string; scannedAtMs: number; guildIdentifier: string }) {
  return JSON.stringify([stand.sourceScanId, stand.scannedAtMs, serverComparisonKey(stand.guildIdentifier.replace(/_g[^_]+$/i, "")), normalizeGuildSegmentForScan(stand.guildIdentifier)]);
}

export async function loadDashboardMemberComparison(input: DashboardMemberComparisonRequest): Promise<DashboardMemberComparisonResult> {
  const start = performance.now();
  const work = { rawReads: 0, normalizedPlayers: 0, derivedSelectionRows: 0, projections: 0, elapsedMs: 0 };
  const summaries = input.summaries.filter(isGuildHubScanAnalyticsEnabled);
  const need = { allIdentities: true, sourceIds: [...new Set([input.currentSourceId, ...summaries.map(s => s.sourceScanId)])] };
  const receipt = await captureLocalDataDependencies(need);
  const identities = await loadIdentityResolutionSnapshot();
  const target = normalizeGuildIdentifierKey(input.guild.logoIdentifier);
  const targetValid = guildObservationIdentifierCandidates(target, input.guild.server).length > 0;
  const sameGuild = (identifier: string) => {
    if (!targetValid || !guildObservationIdentifierCandidates(identifier).length) return false;
    let literal: string; try { literal = normalizeGuildIdentifierKey(identifier); } catch { return false; }
    if (literal === target) return true;
    return confirmedGuildObservationsMatch(identities, literal, target, undefined, input.guild.server);
  };
  // Read only existing, version/source-valid prepared guild rows to select the
  // stand. This does not ensure/materialize any source or start a projection.
  const data = await readGuildAnalyticsScopedData({ guild: input.guild, identitySnapshot: identities });
  const reports = buildGuildSnapshotCompletenessReports(data).filter(r => r.guildIdentifier && sameGuild(r.guildIdentifier));
  work.derivedSelectionRows = data.guilds.length + data.members.length;
  const summaryById = new Map(summaries.map(s => [s.sourceScanId, s]));
  // A preparation owns its reads. Guild selection and supplemental namespaces
  // share the same source bytes, including when one file contains several dates.
  const scans = new Map<string, Promise<NonNullable<Awaited<ReturnType<typeof getGuildHubLocalScan>>>>>();
  const readScan = (sourceScanId: string) => {
    let pending = scans.get(sourceScanId);
    if (!pending) {
      work.rawReads++;
      pending = getGuildHubLocalScan(sourceScanId).then(scan => {
        const summary = summaryById.get(sourceScanId);
        if (!scan || !summary || !matchesLocalSourceValidity(scan, summary) || scan.contentHash !== summary.contentHash) throw Error("Member comparison source changed");
        return scan;
      });
      scans.set(sourceScanId, pending);
    }
    return pending;
  };
  const guildBySnapshot = new Map(data.guilds.map(g => [g.snapshotId + ':' + g.guildIdentifier?.toLowerCase(), g]));
  const candidates: Array<{ scannedAtMs: number; sourceScanId: string; guildIdentifier: string; count: number | null; complete: boolean | null; coverage?: LocalGuildRankingComparisonCoverage }> = [];
  for (const report of reports) if (summaryById.has(report.sourceScanId)) {
    const declared = guildBySnapshot.get(report.snapshotId + ':' + report.guildIdentifier?.toLowerCase())?.declaredMemberCount;
    const coverage = localGuildRankingCoverage({ timestamp: report.scannedAtMs, sourceScanId: report.sourceScanId,
      guildIdentifier: report.guildIdentifier!, declaredMemberCount: declared ?? null,
      foundMemberCount: report.foundUniqueMemberCount, validXpTotalCount: report.validXpTotalCount, validBaseStatsCount: report.validFocusedBaseStatsCount });
    // Missing legacy metadata still uses the existing bounded Raw recheck;
    // an explicit null already proves that no total was declared.
    candidates.push({ scannedAtMs: report.scannedAtMs, sourceScanId: report.sourceScanId, guildIdentifier: report.guildIdentifier!, count: report.foundUniqueMemberCount,
      complete: declared === undefined ? null : report.completeForPerformance && coverage.reason == null,
      coverage: declared === undefined ? undefined : coverage });
  }
  // Legacy/reset/missing prepared data: inspect the selected named observation
  // in preference order. Never prepare all sources or write analytics results.
  for (const summary of summaries) for (const guild of summary.guilds) {
    if (!guild.guildIdentifier || !sameGuild(guild.guildIdentifier)) continue;
    const at = Date.parse(guild.sourceScannedAt ?? "") || summary.lastSnapshotTimestamp;
    if (at == null || candidates.some(c => memberComparisonObservationKey(c) === memberComparisonObservationKey({ sourceScanId: summary.sourceScanId, scannedAtMs: at, guildIdentifier: guild.guildIdentifier! }))) continue;
    candidates.push({ scannedAtMs: at, sourceScanId: summary.sourceScanId, guildIdentifier: guild.guildIdentifier, count: guild.memberCount, complete: null });
  }
  // A saved/confirmed guild alias can predate the current observation. Use
  // the guild identifier of that observation for equal-time source preference,
  // just as the existing guild trend resolves its latest target identifier.
  const currentCandidates = candidates.filter(c => c.sourceScanId === input.currentSourceId && c.scannedAtMs === input.currentTimestamp)
    .sort((a, b) => Number(b.guildIdentifier.toLowerCase() === target) - Number(a.guildIdentifier.toLowerCase() === target) || b.guildIdentifier.localeCompare(a.guildIdentifier));
  const preferredIdentifier = currentCandidates[0]?.guildIdentifier ?? target;
  let comparison: LocalGuildRankingComparison = { status: "empty", timestamp: null, members: [], identities: null };
  const exclude = (coverage: LocalGuildRankingComparisonCoverage) => { comparison.coverage ??= coverage; };
  const unique = [...new Map(candidates.map(candidate => [memberComparisonObservationKey(candidate), candidate])).values()];
  const ordered = orderMemberComparisonCandidates(unique, input.currentTimestamp, preferredIdentifier);
  const options = ordered.filter(candidate => candidate.complete !== false).map(({ sourceScanId, scannedAtMs, guildIdentifier }) => ({ sourceScanId, scannedAtMs, guildIdentifier }));
  const selected = input.selectedComparison;
  for (const candidate of ordered.filter(candidate => !selected || memberComparisonObservationKey(candidate) === memberComparisonObservationKey(selected))) {
    if (candidate.complete === false) { if (candidate.coverage) exclude(candidate.coverage); continue; }
    const summary = summaryById.get(candidate.sourceScanId)!;
    const scan = await readScan(candidate.sourceScanId);
    const snapshot = selectGuildHubRawSnapshot(scan, candidate.scannedAtMs);
    if (!snapshot) throw Error("Member comparison observation unavailable");
    // Legacy fallback uses only this exact observation's group declaration.
    // A summary count inferred from player rows cannot certify completeness.
    const declared = candidate.coverage?.declaredMemberCount ?? (() => {
      const counts = snapshot.groups.flatMap(raw => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const group = readGroupAnalyticsInfo(raw as Record<string, unknown>);
        return group.guildSegment === normalizeGuildSegmentForScan(candidate.guildIdentifier) &&
          serverComparisonKey(group.server) === serverComparisonKey(candidate.guildIdentifier.replace(/_g[^_]+$/i, "")) ? [group.declaredMemberCount] : [];
      });
      return counts.length && counts.every(count => count === counts[0]) ? counts[0] : null;
    })();
    // Recheck the exact complete roster even when the prepared selection was valid.
    let history: ReturnType<typeof readLocalGuildRankingComparisonMembers>;
    try { history = readLocalGuildRankingComparisonMembers(snapshot.players, { ...candidate, foundUniqueMemberCount: candidate.count ?? declared ?? -1 }, input.members, identities); }
    catch (error) {
      if (candidate.complete == null) {
        if (error instanceof LocalGuildRankingRosterError) exclude(localGuildRankingCoverage({ timestamp: candidate.scannedAtMs, sourceScanId: candidate.sourceScanId, guildIdentifier: candidate.guildIdentifier,
          declaredMemberCount: declared, foundMemberCount: error.foundMemberCount, validXpTotalCount: error.validXpTotalCount, validBaseStatsCount: error.validBaseStatsCount }));
        continue;
      }
      throw error;
    }
    work.normalizedPlayers += history.players.length;
    const coverage = candidate.coverage ?? localGuildRankingCoverage({ timestamp: candidate.scannedAtMs, sourceScanId: candidate.sourceScanId, guildIdentifier: candidate.guildIdentifier,
      declaredMemberCount: declared, foundMemberCount: new Set(history.members.map(m => m.key)).size,
      validXpTotalCount: new Set(history.members.filter(m => m.playerStats.xpTotal != null).map(m => m.key)).size,
      validBaseStatsCount: new Set(history.members.filter(m => m.playerStats.sumBaseTotal != null).map(m => m.key)).size });
    if (coverage.reason) { exclude(coverage); continue; }
    const valueSources = history.players.map(member => ({ key: member.key, sourceScanId: candidate.sourceScanId, scannedAtMs: candidate.scannedAtMs }));
    // Existing observations (including ambiguous or missing-valued rows) remain
    // authoritative. Never hunt a different scan per metric to fill its holes.
    const present = new Set(history.players.map(member => localGuildRankingIdentityKey(member, identities)));
    const pending = new Map<string, Set<string>>();
    for (const member of input.members) {
      const resolved = resolvePlayerIdentity(identities, member.key);
      const key = localGuildRankingIdentityKey(member, identities);
      if (!resolved.resolved || !key || present.has(key)) continue;
      pending.set(key, new Set(resolved.aliasIdentifiers.flatMap(ref => {
        const server = serverComparisonKey(ref.replace(/_p[^_]+$/i, ""));
        return server ? [server] : [];
      })));
    }
    // Summary slices bind a namespace to its actual observation time. Older
    // summaries conservatively use their logical timestamps/server metadata.
    const valueCandidates = summaries.flatMap(source => {
      const slices = source.fusionInventorySlices;
      const stands = slices?.length ? slices.map(slice => ({ server: slice.server, at: slice.timestampMs }))
        : source.snapshotTimestamps.flatMap(at => source.servers.map(server => ({ server, at })));
      return stands.flatMap(stand => {
        const namespace = serverComparisonKey(stand.server);
        return namespace && [...pending.values()].some(servers => servers.has(namespace))
          ? [{ sourceScanId: source.sourceScanId, scannedAtMs: stand.at, guildIdentifier: namespace }] : [];
      });
    });
    const inspected = new Set<string>();
    for (const stand of orderMemberValueCandidates(valueCandidates, input.currentTimestamp, serverComparisonKey(input.guild.server) ?? input.guild.server, selected ? candidate.scannedAtMs : null)) {
      const wanted = new Set([...pending].filter(([, servers]) => servers.has(stand.guildIdentifier)).map(([key]) => key));
      if (!wanted.size) continue;
      const observationKey = JSON.stringify([stand.sourceScanId, stand.scannedAtMs]);
      if (inspected.has(observationKey)) continue;
      inspected.add(observationKey);
      const valueScan = await readScan(stand.sourceScanId);
      const valueSnapshot = selectGuildHubRawSnapshot(valueScan, stand.scannedAtMs);
      if (!valueSnapshot) throw Error("Member value comparison observation unavailable");
      // Include all relevant aliases physically in this stand, retaining every
      // duplicate/conflict for the existing unique-identity bucket rules.
      const selected = readLocalGuildRankingValueMembers(valueSnapshot.players, wanted, identities);
      work.normalizedPlayers += selected.length;
      for (const member of selected) {
        history.players.push(member);
        valueSources.push({ key: member.key, sourceScanId: stand.sourceScanId, scannedAtMs: stand.scannedAtMs });
      }
      for (const member of selected) pending.delete(localGuildRankingIdentityKey(member, identities)!);
      if (!pending.size) break;
    }
    const prepare = (allFive: boolean) => {
      const current = allFive ? projectLocalGuildMembers(input.members, "all-five") : input.members;
      const historical = allFive ? projectLocalGuildMembers(history.members, "all-five") : history.members;
      const players = allFive ? projectLocalGuildMembers(history.players, "all-five") : history.players;
      const groups: NonNullable<LocalGuildRankingComparison["groups"]> = {};
      const rankings: NonNullable<LocalGuildRankingComparison["rankings"]> = {};
      for (const mode of ["general", "base", "total", "fortress"] as DashboardMemberMode[]) {
        groups[mode] = summarizeLocalGuildPlayerStats(current, mode);
        rankings[mode] = {};
        for (const category of guildModeCategories(mode)) rankings[mode]![category] = buildLocalGuildRanking(current, historical, category, mode, identities, { players, rosterComplete: true });
      }
      groups.progress = groups.general; rankings.progress = rankings.general;
      const fields = { xp: "xpTotal", baseMain: "baseMain", conBase: "conBase", base: "sumBaseTotal", attrTotal: "attrTotal", conTotal: "conTotal", total: "totalStats", mine: "mine", treasury: "treasury" } as const;
      const comparisonValues = Object.fromEntries(Object.entries(fields).map(([metric, field]) => {
        const values = historical.map(member => member.playerStats[field]);
        return [metric, values.length && values.every(value => typeof value === "number" && Number.isFinite(value)) ? (values as number[]).reduce((a, b) => a + b, 0) / values.length : null];
      }));
      return { groups, rankings, comparisonValues };
    };
    const { groups, rankings, comparisonValues } = prepare(false);
    const allFive = prepare(true);
    work.projections++;
    // Only compact values/rankings cross the Worker boundary; identities and raw
    // records stay in this worker. The UI uses the already computed rankings.
    comparison = { options, valueSources, status: "ready", timestamp: candidate.scannedAtMs, sourceScanId: candidate.sourceScanId, guildIdentifier: candidate.guildIdentifier, coverage, members: [], identities: null, rankings, groups, comparisonValues, allFive,
      identityContexts: [
        { stand: { sourceScanId: input.currentSourceId, scannedAtMs: input.currentTimestamp, guildIdentifier: input.currentGuildIdentifier ?? input.guild.logoIdentifier },
          role: "ranking", status: "ready", summary: summarizeScanIdentities(input.members, identities, input.currentGuildIdentifier ?? input.guild.logoIdentifier, input.currentDeclaredMemberCount),
          revisions: identities.revisions, contentHash: summaryById.get(input.currentSourceId)?.contentHash, dependencies: receipt },
        { stand: candidate, role: "ranking", status: "ready", summary: summarizeScanIdentities(history.members, identities, candidate.guildIdentifier, declared),
          revisions: identities.revisions, contentHash: summary.contentHash, dependencies: receipt },
      ] };
    if (input.diagnostic) comparison.diagnostic = {
      code: COMPARISON_DIAGNOSTIC_VERSION, module: import.meta.url, revisions: identities.revisions, dependencies: receipt,
      current: comparisonRosterTrace(input.members, identities, "worker"), historical: comparisonRosterTrace(history.members, identities, "worker"),
      valueObservations: comparisonRosterTrace(history.players, identities, "worker"),
      valueSources,
      candidates: candidates.map(({ sourceScanId, scannedAtMs, guildIdentifier, complete }) => ({ sourceScanId, scannedAtMs, guildIdentifier, complete })),
    };
    break;
  }
  comparison.options = options;
  if (input.diagnostic) comparison.diagnostic ??= {
    code: COMPARISON_DIAGNOSTIC_VERSION, module: import.meta.url, revisions: identities.revisions, dependencies: receipt,
    current: comparisonRosterTrace(input.members, identities, "worker"), historical: [], valueObservations: [],
    candidates: candidates.map(({ sourceScanId, scannedAtMs, guildIdentifier, complete }) => ({ sourceScanId, scannedAtMs, guildIdentifier, complete })),
  };
  if (!(await revalidateLocalDataDependencies(receipt)).current) throw Error("Member comparison evidence changed");
  work.elapsedMs = performance.now() - start;
  return { dependencies: receipt, comparison, work };
}
