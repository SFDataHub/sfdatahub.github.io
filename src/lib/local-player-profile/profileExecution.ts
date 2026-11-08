import { collectPlayerPerformanceTargetHistory, dedupeSnapshots } from "../../pages/Playground/playerPerformanceModel";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { projectLocalPlayerAnalytics } from "../../components/local-player-profile/localPlayerAnalyticsModel";
import { buildCurrentScanInsights, buildPersonalBests, calculateHighestNonNegativeXpPerDay } from "../../components/local-player-profile/localPlayerInsightsModel";
import { LocalProfileEntryError, resolveLocalProfileEntry, type LocalProfileEntry } from "../data-hub/localProfileEntry";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, resolveGuildIdentity } from "../identities/identityResolution";
import { getGuildHubLocalScan, listGuildHubScanSummaries, isGuildHubScanAnalyticsEnabled, readGuildHubLocalScanSourceValidity, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { ensureGuildAnalyticsProfileDataFromSummaries, readGuildAnalyticsResetCertificate } from "../guilds/localGuildAnalyticsStore";
import { captureLocalDataDependencies, createAnalyticsScopeMatcher, revalidateLocalDataDependencies } from "../local-data/localDataDependencies";
import { sharedAnalyticsPreparation, sourcePreparationKey, renewAnalyticsSourceSummaries, type AnalyticsPreparationLease } from "./sharedPreparation";
import { matchesLocalSourceValidity } from "../guilds/localSourceValidity";
import { checkProfileWork, protectProfileBasis, type LocalPlayerHistoryBasis, type LocalProfileEvidence } from "./contract";
import { prepareLocalPlayerHistory, isLocalProfileEvidenceCurrent, localProfileHistoryContextKey, emptyProfileBuildCounters, type LocalProfileHistoryTarget } from "./historyBasis";
import { buildPrimaryAttributeRadar, selectPrimaryRadarPlayer, withPrimaryRadarPlayer, type PrimaryRadarComparison, type PrimaryRadarBasis } from "./primaryAttributeRadar";
import { buildPlayerViewCharts, hasPreparedBaseChartValues, hasPreparedPlayerViewChartValues } from "./playerViewChartsProjection";
import type { PlayerChartRange, PlayerContentView } from "./viewCharts";
import { prepareProfileSumHistory, type ProfileHistoryData } from "./profileSumHistory";
import { resolveLocalPlayerCurrentSeed, type LocalPlayerObservation } from "../../pages/GuildHub/localPlayerCurrentSeed";
import { buildLocalPlayerProfileModel } from "../../pages/GuildHub/localPlayerProfileAdapter";
import type { AttributeSumMode } from "../settings/preferences";

/** Only this receipt crosses back to the UI. Large source populations and their
 * indexes stay with the existing preparation owner in the analytics worker. */
export type PreparedProfileHistory = {
  extent: "all-player-history";
  evidence: LocalProfileEvidence;
  coverage: LocalPlayerHistoryBasis["coverage"];
  snapshotCount: number;
};
export type ProfileWork = { kind: "profile-validity"; sourceId: string; validity: import("../guilds/localSourceValidity").LocalSourceValidity;
  contentHash: string; updatedAt: string; dependencies: import("../local-data/localDataDependencies").LocalDependencyReceipt; dependenciesChecked: boolean } |
  { kind: "profile-current"; target: LocalPlayerObservation; includeInsights?: boolean } | { kind: "profile-entry"; entry: LocalProfileEntry; includeInsights?: boolean } |
  { kind: "profile-history"; profile: LocalProfileHistoryTarget } |
  { kind: "profile-analytics"; profile: LocalProfileHistoryTarget; history: PreparedProfileHistory; comparison?: number | null; range?: PlayerChartRange; view?: PlayerContentView; sumMode?: AttributeSumMode } |
  { kind: "profile-bests"; profile: LocalProfileHistoryTarget; history: PreparedProfileHistory } |
  { kind: "profile-radar"; profile: LocalProfileHistoryTarget; referenceServer: string; monthlyIds: string[]; month: string; mode: AttributeSumMode; comparison: PrimaryRadarComparison; comparisonPlayer?: LocalProfileHistoryTarget };

type HistoryEntry = { lease: AnalyticsPreparationLease; promise: Promise<LocalPlayerHistoryBasis> };
const histories = new Map<string, HistoryEntry>();
const historyProofs = new WeakMap<LocalPlayerHistoryBasis, Promise<string>>();
function historyProof(basis: LocalPlayerHistoryBasis) {
  let proof = historyProofs.get(basis);
  if (!proof) {
    proof = crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis.evidence.key)).then(buffer =>
      "profile-history-v3:" + [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, "0")).join(""));
    historyProofs.set(basis, proof);
  }
  return proof;
}
// Comparison charts need per-metric observations, without a guild-average pool.
// Their cache receipt must count that same admissible timeline, not the separate
// performance model's complete-guild pairs.
function historySnapshotCount(profile: LocalProfileHistoryTarget, basis: LocalPlayerHistoryBasis) {
  return profile.playerChartsOnly ? dedupeSnapshots(collectPlayerPerformanceTargetHistory(basis.analyticsData, basis.identityResolutionSnapshot,
    { name: profile.analytics.playerName, server: profile.analytics.server, memberRef: profile.analytics.memberRef })).length : basis.performance.snapshots.length;
}
// These are derived preparation leases, never Raw scans. Their lifetime is also
// bounded by the existing worker's active scopes and retirement.
async function history(profile: LocalProfileHistoryTarget, signal: AbortSignal, refreshIncomplete = false) {
  const key = localProfileHistoryContextKey(profile);
  let entry = histories.get(key);
  if (entry) {
    const basis = await entry.promise;
    checkProfileWork(signal);
    if (!(refreshIncomplete && (basis.coverage !== "complete" || !historySnapshotCount(profile, basis))) &&
      await isLocalProfileEvidenceCurrent(basis.evidence)) return basis;
    entry.lease.release(); histories.delete(key); entry = undefined;
  }
  if (!entry) {
    const lease = sharedAnalyticsPreparation.acquire("visible");
    entry = { lease, promise: prepareLocalPlayerHistory(profile, signal, emptyProfileBuildCounters(), () => {}, () => {}, lease) };
    histories.set(key, entry);
    const own = entry;
    void own.promise.catch(() => { if (histories.get(key) === own) { histories.delete(key); lease.release(); } });
    // A small number of addressed profiles can coexist (page plus overlay).
    if (histories.size > 4) {
      const oldest = histories.entries().next().value!;
      histories.delete(oldest[0]); oldest[1].lease.release();
    }
  }
  const basis = await entry.promise;
  checkProfileWork(signal);
  return basis;
}

// Only completed, bound supplements are reused, within the existing history owner.
// No raw scans or cancelled in-flight work are retained.
const chartSupplements = new WeakMap<LocalPlayerHistoryBasis, Map<string, ProfileHistoryData>>();
async function prepareVisibleChartHistory(work: Extract<ProfileWork, { kind: "profile-analytics" }>,
  basis: LocalPlayerHistoryBasis, snapshots: ReturnType<typeof collectPlayerPerformanceTargetHistory>,
  result: ReturnType<typeof projectLocalPlayerAnalytics>, signal: AbortSignal): Promise<ProfileHistoryData> {
  const inRange = (time: number) => (result.comparison.selectedTimestamp == null || time >= result.comparison.selectedTimestamp) &&
    (result.comparison.currentTimestamp == null || time <= result.comparison.currentTimestamp);
  const selected = snapshots.filter(row => inRange(row.scannedAtMs));
  const refs = [...new Set(selected.flatMap(row => row.memberRef ? [row.memberRef.toLowerCase()] : []))].sort();
  const ids = new Set(selected.map(row => row.scanId));
  const summaries = (await listGuildHubScanSummaries()).filter(row => ids.has(row.sourceScanId));
  const replacements = new Map<string, ProfileHistoryData["members"][number]>();
  const completed = chartSupplements.get(basis) ?? new Map<string, ProfileHistoryData>();
  chartSupplements.set(basis, completed);
  for (const summary of summaries) {
    checkProfileWork(signal);
    const key = JSON.stringify([summary.sourceScanId, refs, result.comparison.selectedTimestamp, result.comparison.currentTimestamp]);
    let data = completed.get(key);
    let scan: Awaited<ReturnType<typeof getGuildHubLocalScan>> = null;
    const load = async (id: string) => { checkProfileWork(signal); scan ??= await getGuildHubLocalScan(id); checkProfileWork(signal); return scan; };
    if (!data) {
      const stored = await ensureGuildAnalyticsProfileDataFromSummaries([summary], { selectedPlayerRefs: refs },
        { loadSourceById: load });
      data = { snapshots: stored.snapshots.filter(row => inRange(row.snapshotTimestamp)), guilds: [],
        members: stored.members.filter(row => inRange(row.snapshotTimestamp)) };
    }
    if (!hasPreparedPlayerViewChartValues(work.view!, work.sumMode ?? "main-con",
        selected.filter(row => row.scanId === summary.sourceScanId), data, result, Boolean(work.range))) {
        const raw = await load(summary.sourceScanId);
        if (!raw) throw Error("Missing bound chart source");
        data = prepareProfileSumHistory(data, raw, summary, { players: refs, guilds: [] }, true);
    }
    checkProfileWork(signal);
    if (!await isLocalProfileEvidenceCurrent(basis.evidence)) throw Error("Chart history changed during projection");
    completed.set(key, protectProfileBasis(data));
    for (const row of data.members) replacements.set(row.id, row);
  }
  return { ...basis.analyticsData, members: basis.analyticsData.members.map(row => replacements.get(row.id) ?? row) };
}

type RadarPool = { data: ProfileHistoryData; basis: PrimaryRadarBasis; monthlyIds: Set<string>; guild: boolean };
type RadarEntry = { lease: AnalyticsPreparationLease; pool?: RadarPool; pending?: Promise<RadarPool>; guildPool?: RadarPool; guildPending?: Promise<RadarPool> };
const radars = new Map<string, RadarEntry>();
async function radar(work: Extract<ProfileWork, { kind: "profile-radar" }>, signal: AbortSignal) {
  const { profile } = work;
  const captured = await captureLocalDataDependencies({ allSources: true, allIdentities: true });
  // Revisions are part of the cache binding; an old pool can never be recertified.
  const key = JSON.stringify([localProfileHistoryContextKey(profile), work.referenceServer, work.month, work.monthlyIds, captured]);
  let entry = radars.get(key);
  if (!entry) {
    entry = { lease: sharedAnalyticsPreparation.acquire("profile") }; radars.set(key, entry);
    if (radars.size > 4) { const oldest = radars.entries().next().value!; radars.delete(oldest[0]); oldest[1].lease.release(); }
  }
  const own = entry;
  if (own.pending) await own.pending;
  checkProfileWork(signal);
  if (!own.pool) {
    const job = prepareRadarPool(profile, work.monthlyIds, false, own.lease, signal);
    own.pending = job;
    try { own.pool = await job; } finally { if (own.pending === job) own.pending = undefined; }
  }
  if (!work.comparisonPlayer && work.comparison === "guild" && !own.guildPool) {
    const job = own.guildPending ??= prepareRadarPool(profile, work.monthlyIds, true, own.lease, signal);
    try { own.guildPool = await job; } finally { if (own.guildPending === job) own.guildPending = undefined; }
  }
  const pool = !work.comparisonPlayer && work.comparison === "guild" ? own.guildPool! : own.pool;
  checkProfileWork(signal);
  if (!(await revalidateLocalDataDependencies(captured)).current) throw Error("Radar dependencies changed");
  let model = buildPrimaryAttributeRadar(pool.data.members.filter(row => pool.monthlyIds.has(row.sourceScanId)),
    profile as LocalPlayerProfileModel, work.month, work.mode, pool.basis, work.comparisonPlayer ? "main" : work.comparison, work.referenceServer);
  if (model && work.comparisonPlayer) {
    const peer = await prepareRadarPool(work.comparisonPlayer, [], false, own.lease, signal);
    checkProfileWork(signal);
    const player = selectPrimaryRadarPlayer(peer.data.members, work.comparisonPlayer as LocalPlayerProfileModel, peer.basis, work.mode);
    model = withPrimaryRadarPlayer(model, player, work.mode);
  }
  checkProfileWork(signal);
  if (!(await revalidateLocalDataDependencies(captured)).current) throw Error("Radar dependencies changed before delivery");
  return { model, dependencies: captured };
}

async function prepareRadarPool(profile: LocalProfileHistoryTarget, ids: string[], includeGuild: boolean,
  source: AnalyticsPreparationLease, signal: AbortSignal): Promise<RadarPool> {
  const identity = await loadIdentityResolutionSnapshot();
  const monthlyIds = new Set(ids);
  const players = new Set([profile.sourcePlayerKey, profile.analytics.memberRef ?? profile.sourcePlayerKey]);
  for (const ref of players) for (const alias of resolvePlayerIdentity(identity, ref).aliasIdentifiers) players.add(alias);
  const guilds = new Set(includeGuild && profile.analytics.guildIdentifier ? [profile.analytics.guildIdentifier] : []);
  const summariesById = new Map<string, GuildHubScanSummary>();
  let data: ProfileHistoryData = { snapshots: [], members: [], guilds: [] }, reset = "";
  while (true) {
    checkProfileWork(signal);
    for (const ref of guilds) for (const alias of resolveGuildIdentity(identity, ref).aliasIdentifiers) guilds.add(alias);
    // Player-only preparation needs the latest observation, not guild history.
    const includes = createAnalyticsScopeMatcher({ players: [...players], guilds: [...guilds] });
    const inventory = await listGuildHubScanSummaries();
    const selected = inventory.filter(row => monthlyIds.has(row.sourceScanId) || isGuildHubScanAnalyticsEnabled(row) &&
      (row.sourceScanId === profile.sourceScanId || includes(row)));
    if ([...monthlyIds].some(id => !selected.some(row => row.sourceScanId === id))) throw Error("Current server source missing");
    if (await renewAnalyticsSourceSummaries(selected, signal)) continue;
    const added = selected.filter(row => !summariesById.has(row.sourceScanId));
    if (!added.length) break;
    if (summariesById.size && await readGuildAnalyticsResetCertificate([...summariesById.keys()]) !== reset) throw Error("Radar history reset changed");
    added.forEach(row => summariesById.set(row.sourceScanId, row));
    const summaries = [...summariesById.values()];
    reset = await readGuildAnalyticsResetCertificate([...summariesById.keys()]);
    const monthly = await source.ensure(summaries.filter(row => monthlyIds.has(row.sourceScanId)), signal, undefined, false, true);
    const local = await source.ensure(summaries.filter(row => !monthlyIds.has(row.sourceScanId)), signal, undefined, false, true,
      { players: [...players].sort(), guilds: [...guilds].sort() });
    data = { snapshots: [...monthly.snapshots, ...local.snapshots], guilds: [...monthly.guilds, ...local.guilds], members: [...monthly.members, ...local.members] } as ProfileHistoryData;
    if (includeGuild) {
      const latest = selectPrimaryRadarPlayer(data.members, profile as LocalPlayerProfileModel, { identity, sources: [], local: { data, sources: summaries } }, "main-con");
      if (latest?.guildIdentifier) guilds.add(latest.guildIdentifier);
    }
  }
  const summaries = [...summariesById.values()];
  const live = await readGuildHubLocalScanSourceValidity([...summariesById.keys()]);
  if (summaries.some(row => !live.get(row.sourceScanId) || sourcePreparationKey(row, reset) !== sourcePreparationKey(live.get(row.sourceScanId)!, reset)) ||
    await readGuildAnalyticsResetCertificate([...summariesById.keys()]) !== reset) throw Error("Radar source changed");
  return { data, monthlyIds, guild: includeGuild, basis: { identity, sources: summaries.filter(row => monthlyIds.has(row.sourceScanId)), local: { data, sources: summaries } } };
}

export async function executeProfileWork(work: ProfileWork, signal: AbortSignal): Promise<unknown> {
  checkProfileWork(signal);
  if (work.kind === "profile-validity") {
    const [sources, dependencies] = await Promise.all([readGuildHubLocalScanSourceValidity([work.sourceId]),
      work.dependenciesChecked ? Promise.resolve({ current: true }) : revalidateLocalDataDependencies(work.dependencies)]);
    const source = sources.get(work.sourceId);
    return { valid: dependencies.current && matchesLocalSourceValidity(work.validity, source) && source?.contentHash === work.contentHash &&
      (source.updatedAtIso ?? source.importedAtIso) === work.updatedAt };
  }
  if (work.kind === "profile-current") {
    const seed = await resolveLocalPlayerCurrentSeed(work.target, undefined, () => !signal.aborted);
    if (seed && work.includeInsights !== false) seed.preparedInsights = buildCurrentScanInsights(buildLocalPlayerProfileModel({ ...seed, rawPlayer: seed.rawPlayer, currentSeed: seed }), seed);
    return { seed: seed ? { ...seed, guildPlayers: [], guildGroups: [], coreLookup: undefined } : null };
  }
  if (work.kind === "profile-entry") {
    try {
      const profile = await resolveLocalProfileEntry(work.entry, undefined, () => !signal.aborted, undefined, undefined, work.includeInsights);
      if (profile.currentSeed && work.includeInsights !== false) profile.currentSeed.preparedInsights = buildCurrentScanInsights(profile, profile.currentSeed);
      // Requested current fields are complete. Only the selected Raw row is needed by
      // the existing adapter/validity contract on the UI side.
      if (profile.currentSeed) profile.currentSeed = { ...profile.currentSeed, guildPlayers: [], guildGroups: [], coreLookup: undefined };
      return { profile };
    } catch (error) {
      if (error instanceof LocalProfileEntryError) return { error: error.code };
      throw error;
    }
  }
  if (work.kind === "profile-radar") return radar(work, signal);
  const basis = await history(work.profile, signal, work.kind === "profile-history");
  const proof = await historyProof(basis);
  if (work.kind === "profile-history") return protectProfileBasis({ extent: "all-player-history", evidence: { ...basis.evidence, key: proof }, coverage: basis.coverage,
    snapshotCount: historySnapshotCount(work.profile, basis) } satisfies PreparedProfileHistory);
  if (work.history.extent !== "all-player-history" || proof !== work.history.evidence.key || !await isLocalProfileEvidenceCurrent(basis.evidence)) throw Error("Profile history changed before projection");
  checkProfileWork(signal);
  if (work.kind === "profile-analytics") {
    const result = projectLocalPlayerAnalytics(work.profile as LocalPlayerProfileModel, basis, work.comparison, work.view, work.range);
    if (!work.view) return result;
    let data = basis.analyticsData;
    let chartSnapshots = work.view === "progress" && !work.range ? basis.performance.snapshots : null;
    let preparedBase = false;
    if (work.view === "base" && (work.sumMode ?? "main-con") === "main-con") {
      chartSnapshots = dedupeSnapshots(collectPlayerPerformanceTargetHistory(data, basis.identityResolutionSnapshot,
        { name: work.profile.analytics.playerName, server: work.profile.analytics.server, memberRef: work.profile.analytics.memberRef }));
      preparedBase = hasPreparedBaseChartValues(chartSnapshots, data, result);
    }
    if (work.view !== "progress" && !preparedBase) {
      chartSnapshots ??= dedupeSnapshots(collectPlayerPerformanceTargetHistory(data, basis.identityResolutionSnapshot,
        { name: work.profile.analytics.playerName, server: work.profile.analytics.server, memberRef: work.profile.analytics.memberRef }));
      if (!hasPreparedPlayerViewChartValues(work.view, work.sumMode ?? "main-con", chartSnapshots, data, result, Boolean(work.range)))
        data = await prepareVisibleChartHistory(work, basis, chartSnapshots, result, signal);
      checkProfileWork(signal);
      if (!await isLocalProfileEvidenceCurrent(basis.evidence)) throw Error("Chart history changed during projection");
      chartSnapshots = null;
    }
    chartSnapshots ??= dedupeSnapshots(collectPlayerPerformanceTargetHistory(data, basis.identityResolutionSnapshot,
      { name: work.profile.analytics.playerName, server: work.profile.analytics.server, memberRef: work.profile.analytics.memberRef }));
    return { ...result, snapshotCount: chartSnapshots.length, view: work.view, charts: buildPlayerViewCharts(work.view, work.sumMode ?? "main-con", chartSnapshots, data, result, Boolean(work.range)) };
  }
  let value, reason: string | undefined;
  try { value = await buildPersonalBests(basis.performance.snapshots, () => checkProfileWork(signal)); }
  catch (error) {
    checkProfileWork(signal);
    value = { highestXpPerDay: calculateHighestNonNegativeXpPerDay(basis.performance.snapshots), highestDungeon: null,
      bestServerRank: null, historyAvailable: basis.performance.snapshots.length > 0 };
    reason = `Historical ranks unavailable: ${String(error)}`;
  }
  return { value, reason };
}
