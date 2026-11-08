import { serverComparisonKey } from "../servers/serverResolver";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave } from "../data-hub/runtimeAudit";
import { getGuildHubLocalScan, listGuildHubScanSummaries, isGuildHubScanAnalyticsEnabled, readGuildHubLocalScanSourceValidity, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { DERIVED_ANALYTICS_VERSION, ensureGuildAnalyticsDerivedDataFromSummaries, ensureGuildAnalyticsProfileDataFromSummaries, readGuildAnalyticsResetCertificate, type GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import { localSourceValidityKey } from "../guilds/localSourceValidity";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, resolveGuildIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";
import { parsePlayerIdentifier } from "../players/identifier";
import { captureLocalDataDependencies, revalidateLocalDataDependencies } from "../local-data/localDataDependencies";
import type { LocalDataDependencies } from "../local-data/localDataChanges";
import { buildAnalyticsIndexes, buildPlayerPerformanceModel, collectPlayerPerformanceTargetHistory, normalizePerformanceTarget } from "../../pages/Playground/playerPerformanceModel";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { checkProfileWork, protectProfileBasis, type LocalPlayerHistoryBasis, type LocalProfileEvidence } from "./contract";

import type { AnalyticsPreparationLease } from "./sharedPreparation";
import { renewAnalyticsSourceSummaries } from "./sharedPreparation";

export const LOCAL_PROFILE_BASIS_VERSION = 3;
export const LOCAL_PROFILE_PROJECTION_VERSION = 6;
const server = (value: unknown) => serverComparisonKey(value)?.toLowerCase() ?? String(value ?? "").toLowerCase();
const guildServer = (identifier: string) => server(identifier.replace(/_g[^_]+$/i, ""));
const playerServer = (identifier: string) => server(parsePlayerIdentifier(identifier)?.serverKey) || server(identifier.replace(/_p[^_]+$/i, ""));
const unique = (values: Iterable<string>) => [...new Set(values)].sort();

export function localProfileContextKey(profile: LocalPlayerProfileModel) {
  return JSON.stringify([profile.sourceScanId, profile.sourcePlayerKey, profile.analytics]);
}
export type LocalProfileHistoryTarget = Pick<LocalPlayerProfileModel, "sourceScanId" | "sourcePlayerKey" | "analytics"> & { playerChartsOnly?: boolean };
export function localProfileHistoryContextKey(profile: LocalProfileHistoryTarget) {
  const { scannedAtMs: _anchor, ...target } = profile.analytics;
  return JSON.stringify([profile.sourceScanId, profile.sourcePlayerKey, target, ...(profile.playerChartsOnly ? ["player-charts-only"] : [])]);
}
function performanceTarget(profile: LocalProfileHistoryTarget) {
  return normalizePerformanceTarget({ name: profile.analytics.playerName, server: profile.analytics.server, memberRef: profile.analytics.memberRef });
}
export function initialProfileNeed(profile: LocalProfileHistoryTarget): LocalDataDependencies {
  return { sourceIds: [profile.sourceScanId], servers: [server(performanceTarget(profile).server)],
    playerAliases: [profile.analytics.memberRef ?? profile.sourcePlayerKey],
    guildAliases: !profile.playerChartsOnly && profile.analytics.guildIdentifier ? [profile.analytics.guildIdentifier] : [] };
}

function relevantIdentity(identity: IdentityResolutionSnapshot, players: Set<string>, guilds: Set<string>) {
  return [unique(players).map(ref => [ref, resolvePlayerIdentity(identity, ref)]),
    unique(guilds).map(ref => [ref, resolveGuildIdentity(identity, ref)])];
}

export type ProfileBuildCounters = {
  preparation: number; sourceBuilds: number; indexBuilds: number; completenessBuilds: number; performanceBuilds: number;
  analyticsProjections: number; currentProjections: number; bestsProjections: number;
  currentRawReads: number; historicalRawReads: number; basisJoins: number; projectionJoins: number;
  basisHits: number; projectionHits: number;
  metadataElapsedMs:number; historicalReadElapsedMs:number; indexCpuMs:number; performanceCpuMs:number; analyticsCpuMs:number; bestsElapsedMs:number;
};
export const emptyProfileBuildCounters = (): ProfileBuildCounters => ({ preparation: 0, sourceBuilds: 0, indexBuilds: 0, completenessBuilds: 0, performanceBuilds: 0,
  analyticsProjections: 0, currentProjections: 0, bestsProjections: 0, currentRawReads: 0, historicalRawReads: 0,
  basisJoins: 0, projectionJoins: 0, basisHits: 0, projectionHits: 0, metadataElapsedMs:0,historicalReadElapsedMs:0,indexCpuMs:0,performanceCpuMs:0,analyticsCpuMs:0,bestsElapsedMs:0 });

/** Discover the entire player's history through indexed references and confirmed
 * guild populations. Only unreferenced legacy data uses the existing full-source
 * fallback; Comparison and bests retain the entire admissible player timeline. */
export async function prepareLocalPlayerHistory(
  profile: LocalProfileHistoryTarget, signal: AbortSignal, counters: ProfileBuildCounters,
  onNeed: (need: LocalDataDependencies) => void,
  onBinding: (key: string) => void = () => {},
  preparation?: AnalyticsPreparationLease,
): Promise<LocalPlayerHistoryBasis> {
    const __audit1 = auditBegin("S04", "prepareLocalPlayerHistory");
    try {
  counters.preparation++; const metadataAt=globalThis.performance.now();
  const captured = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ allSources: true, allIdentities: true }))));
  checkProfileWork(signal);
  const [summaries, identity] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([listGuildHubScanSummaries(), loadIdentityResolutionSnapshot()]))));
  checkProfileWork(signal);
  counters.metadataElapsedMs+=globalThis.performance.now()-metadataAt;
  const target = performanceTarget(profile);
  const players = new Set<string>([profile.sourcePlayerKey, profile.analytics.memberRef ?? profile.sourcePlayerKey]);
  const referencePlayers = new Set<string>();
  const guilds = new Set<string>(!profile.playerChartsOnly && profile.analytics.guildIdentifier ? [profile.analytics.guildIdentifier] : []);
  const servers = new Set<string>([server(target.server)]);
  const requested = new Map<string, GuildHubScanSummary>();
  let analyticsData: GuildAnalyticsDerivedData = { snapshots: [], members: [], guilds: [] };
  let resetCertificate = await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsResetCertificate"), (readGuildAnalyticsResetCertificate([]))));
  let allowNameFallback = !target.memberRef;
  if (profile.playerChartsOnly && !target.memberRef) throw Error("Comparison requires a stable player reference");
  let loadedScope = "";
  let expanded = true;
  while (expanded) {
    checkProfileWork(signal);
    for (const ref of players) for (const alias of resolvePlayerIdentity(identity, ref).aliasIdentifiers) players.add(alias);
    for (const ref of guilds) for (const alias of resolveGuildIdentity(identity, ref).aliasIdentifiers) guilds.add(alias);
    for (const ref of players) servers.add(playerServer(ref));
    for (const ref of guilds) servers.add(guildServer(ref));
    const playerKeys = new Set([...players].map(ref => ref.toLowerCase()));
    const guildKeys = new Set([...guilds].map(ref => ref.toLowerCase()));
    const hasLiteralInventory = summaries.some(summary => summary.fusionInventorySlices?.some(slice =>
      slice.playerIdentifiers?.some(ref => playerKeys.has(ref.toLowerCase()))));
    if (!hasLiteralInventory && !profile.playerChartsOnly) allowNameFallback = true;
    const selected = summaries.filter(summary => {
      if (!isGuildHubScanAnalyticsEnabled(summary)) return false;
      if (summary.sourceScanId === profile.sourceScanId) return true;
      if (summary.guilds.some(guild => guild.guildIdentifier && guildKeys.has(guild.guildIdentifier.toLowerCase()))) return true;
      const slices = summary.fusionInventorySlices;
      if (slices?.some(slice => slice.playerIdentifiers?.some(ref => playerKeys.has(ref.toLowerCase())))) return true;
      // Summary inventory cannot prove names. Preserve the established fallback
      // when no literal target is known, and conservatively keep unknown inventories.
      const knownInventory = Boolean(slices?.length && slices.every(slice => Array.isArray(slice.playerIdentifiers)));
      return (!knownInventory || allowNameFallback) && (!summary.servers.length || summary.servers.some(value => servers.has(server(value))));
    });
    const added = selected.filter(summary => !requested.has(summary.sourceScanId));
    const scope = JSON.stringify([unique(players), unique(guilds), allowNameFallback]);
    expanded = added.length > 0 || scope !== loadedScope;
    if (!expanded) break;
    if (await (auditValue(__audit1, auditEnter(__audit1, "renewAnalyticsSourceSummaries"), (renewAnalyticsSourceSummaries(added, signal))))) {
      // Discard this acquisition and capture a fresh receipt/proof. Previously
      // prepared Source jobs remain subject to their original final guards.
      return auditReturn(__audit1, prepareLocalPlayerHistory(profile, signal, counters, onNeed, onBinding, preparation));
    }
    added.forEach(summary => requested.set(summary.sourceScanId, summary));
    // Certificate is captured before Ensure. Never silently renew a reset during a build.
    const before = await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsResetCertificate"), (readGuildAnalyticsResetCertificate(unique(requested.keys())))));
    const previousIds = unique([...requested.keys()].filter(id => !added.some(s => s.sourceScanId === id)));
    if (previousIds.length && resetCertificate !== await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsResetCertificate"), (readGuildAnalyticsResetCertificate(previousIds))))) throw Error("History reset changed during demand discovery");
    resetCertificate = before;
    const need: LocalDataDependencies = { sourceIds: unique(requested.keys()), sourceScope: { players: unique(players), guilds: unique(guilds), ...(allowNameFallback ? { servers: unique(servers) } : {}) }, playerAliases: unique([...players, ...referencePlayers]), guildAliases: unique(guilds) };
    onNeed(need);
    if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies({ ...captured, need }))))).current) {
      checkProfileWork(signal);
      return auditReturn(__audit1, prepareLocalPlayerHistory(profile, signal, counters, onNeed, onBinding, preparation));
    }
    onBinding((auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify([LOCAL_PROFILE_BASIS_VERSION, DERIVED_ANALYTICS_VERSION, target,
      profile.sourceScanId, profile.sourcePlayerKey, ["all-player-history", Boolean(profile.playerChartsOnly), allowNameFallback, unique(players), unique(guilds)], relevantIdentity(identity, new Set([...players, ...referencePlayers]), guilds),
      [...requested.values()].map(summary => [summary.sourceScanId, localSourceValidityKey(summary), summary.contentHash,
        summary.updatedAtIso ?? summary.importedAtIso, summary.analyticsEnabled, summary.snapshotTimestamps]), resetCertificate])))));
    const readAt=globalThis.performance.now();
    const options = {
      readSourceIds: unique(requested.keys()),
      loadSourceById: async (id: string) => { checkProfileWork(signal); counters.historicalRawReads++; const scan = await getGuildHubLocalScan(id); checkProfileWork(signal); return scan; },
      onSourceDiagnostic: () => { counters.sourceBuilds++; },
    };
    analyticsData = allowNameFallback
      ? preparation ? await preparation.ensure([...requested.values()], signal, counters)
        : await ensureGuildAnalyticsDerivedDataFromSummaries([...requested.values()], options)
      : await ensureGuildAnalyticsProfileDataFromSummaries([...requested.values()],
        { selectedPlayerRefs: unique(players), guildIdentifiers: unique(guilds) }, options);
    loadedScope = scope;
    counters.historicalReadElapsedMs+=globalThis.performance.now()-readAt;
    checkProfileWork(signal);
    if (!profile.playerChartsOnly && target.memberRef && !analyticsData.members.some(member => playerKeys.has(member.memberRef.toLowerCase()))) allowNameFallback = true;
    for (const observation of collectPlayerPerformanceTargetHistory(analyticsData, identity, target)) {
      if (observation.memberRef) players.add(observation.memberRef);
      if (!profile.playerChartsOnly && observation.guildIdentifier) guilds.add(observation.guildIdentifier);
    }
  }
  // Peer identities affect paired guild references even when the target identity did not change.
  for (const ref of guilds) for (const alias of resolveGuildIdentity(identity, ref).aliasIdentifiers) guilds.add(alias);
  for (const member of analyticsData.members) if (member.guildIdentifier && guilds.has(member.guildIdentifier)) {
    referencePlayers.add(member.memberRef);
    for (const alias of resolvePlayerIdentity(identity, member.memberRef).aliasIdentifiers) referencePlayers.add(alias);
  }
  const need: LocalDataDependencies = { sourceIds: unique(requested.keys()), sourceScope: { players: unique(players), guilds: unique(guilds), ...(allowNameFallback ? { servers: unique(servers) } : {}) }, playerAliases: unique([...players, ...referencePlayers]), guildAliases: unique(guilds) };
  onNeed(need);
  const dependencies = { ...captured, need };
  const sourceIds = unique(requested.keys());
  const live = await (auditValue(__audit1, auditEnter(__audit1, "readGuildHubLocalScanSourceValidity"), (readGuildHubLocalScanSourceValidity(sourceIds))));
  const fingerprints = sourceIds.map(id => {
    const summary = requested.get(id)!;
    return [id, localSourceValidityKey(summary), summary.contentHash, summary.updatedAtIso ?? summary.importedAtIso, summary.analyticsEnabled, summary.snapshotTimestamps];
  });
  if (sourceIds.some(id => { const summary = requested.get(id)!; const now = live.get(id); return !now || localSourceValidityKey(now) !== localSourceValidityKey(summary) || now.contentHash !== summary.contentHash || (now.updatedAtIso ?? now.importedAtIso) !== (summary.updatedAtIso ?? summary.importedAtIso); })) throw Error("History source changed during preparation");
  const evidence: LocalProfileEvidence = { key: (auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify([LOCAL_PROFILE_BASIS_VERSION, DERIVED_ANALYTICS_VERSION,
    target, profile.sourceScanId, profile.sourcePlayerKey, ["all-player-history", Boolean(profile.playerChartsOnly), allowNameFallback, unique(players), unique(guilds)], relevantIdentity(identity, new Set([...players, ...referencePlayers]), guilds), fingerprints, resetCertificate])))), dependencies, sourceIds, resetCertificate };
  onBinding(evidence.key);
  if (!await (auditValue(__audit1, auditEnter(__audit1, "isLocalProfileEvidenceCurrent"), (isLocalProfileEvidenceCurrent(evidence))))) throw Error("History dependencies changed during preparation");
  checkProfileWork(signal);
  counters.indexBuilds++; counters.completenessBuilds++;
  const indexAt=globalThis.performance.now();
  const indexes = allowNameFallback && preparation ? preparation.indexes(analyticsData) : (auditValue(__audit1, auditEnter(__audit1, "buildAnalyticsIndexes", "sync-elapsed"), (buildAnalyticsIndexes(analyticsData))));
  counters.indexCpuMs+=globalThis.performance.now()-indexAt;
  counters.performanceBuilds++;const performanceAt=globalThis.performance.now();
  const performance = (auditValue(__audit1, auditEnter(__audit1, "buildPlayerPerformanceModel", "sync-elapsed"), (buildPlayerPerformanceModel([], { analyticsData, identityResolutionSnapshot: identity, target, preparedIndexes: indexes }))));
  counters.performanceCpuMs+=globalThis.performance.now()-performanceAt;
  // A read omitting a requested source is valid partial data, never a completed hit.
  const observed = new Set(analyticsData.snapshots.map(snapshot => snapshot.sourceScanId));
  const coverage = sourceIds.every(id => observed.has(id)) ? "complete" : "partial";
  return auditReturn(__audit1, protectProfileBasis({ analyticsData, identityResolutionSnapshot: identity, indexes, performance, evidence, coverage }));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

export async function isLocalProfileEvidenceCurrent(evidence: LocalProfileEvidence, diagnosticContext?: import("../data-hub/runtimeAudit").AuditFields) {
  const [dependency, resets] = await Promise.all([revalidateLocalDataDependencies(evidence.dependencies, diagnosticContext), evidence.resetCertificate === null ? Promise.resolve(null) : readGuildAnalyticsResetCertificate(evidence.sourceIds)]);
  return dependency.current && resets === evidence.resetCertificate;
}
