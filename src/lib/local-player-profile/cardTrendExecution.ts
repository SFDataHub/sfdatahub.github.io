import { buildGuildSnapshotCompletenessReports } from "../guilds/guildSnapshotCompleteness";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard, auditAssociate, auditAccept, auditBindPromise, auditCall, auditExpectGraph, auditLink, auditFinish, type AuditFields } from "../data-hub/runtimeAudit";
import { serverComparisonKey } from "../servers/serverResolver";
import type { LocalPlayerIndexEntry } from "../player-search/localPlayerIndex";
import { listGuildHubScanSummaries, readGuildHubLocalScanSourceValidity, readGuildHubLocalScanSourceInventory, getGuildHubLocalScan, isGuildHubScanAnalyticsEnabled, GUILD_HUB_SCAN_SUMMARY_VERSION, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { captureLocalDataDependencies, createAnalyticsScopeMatcher, revalidateLocalDataDependencies, subscribeToLocalDataDependencies, type LocalDependencyReceipt, type LocalDependencySubscription } from "../local-data/localDataDependencies";
import { subscribeToLocalDataChanges, type LocalDataDependencies } from "../local-data/localDataChanges";
import { loadIdentityResolutionSnapshot, resolveGuildIdentity, resolvePlayerIdentity } from "../identities/identityResolution";
import { readGuildAnalyticsResetCertificate } from "../guilds/localGuildAnalyticsStore";
import { sharedAnalyticsPreparation, sourcePreparationKey, renewAnalyticsSourceSummaries, type AnalyticsPreparationLease } from "./sharedPreparation";
import { hasCurrentLocalSourceValidity } from "../guilds/localSourceValidity";
import { indexesToDTO } from "./executionWork";
import { checkProfileWork, profileAbortError } from "./contract";
import type { LocalPlayerIndexWorkerRunResult, LocalPlayerIndexProgress } from "../player-search/localPlayerIndexClient";
import { normalizePerformanceTarget, selectTargetAnalyticsMembers, resolveTargetGuildIdentifier, buildGuildTrendTargetIdentifierCandidates, areSameGuildIdentity, type GuildTrendBuildResult, type GuildTrendTarget, type AnalyticsIndexes } from "../../pages/Playground/playerPerformanceModel";
import type { PlayerPerformanceProgress } from "../../pages/Playground/playerPerformanceWorkerClient";
type WatchOptions<T> = {
    onRefresh?: (value: T) => void;
    onInvalidating?: () => void;
    onError?: (error: unknown) => void;
};
type CardOptions = WatchOptions<LocalPlayerIndexWorkerRunResult> & {
    requestId?: string;
    summaries: GuildHubScanSummary[];
    serverFilter: string | null;
    targetPlayerRefs?: string[] | null;
    targetPlayerNames?: string[] | null;
    includeCards?: boolean;
    anchorMs?: number;
    onProgress?: (progress: LocalPlayerIndexProgress) => void;
};
export type GuildTrendHistory = { visibleStartMs?: number; data: import("./profileSumHistory").ProfileHistoryData; identity: import("../identities/identityResolution").IdentityResolutionSnapshot;
    guildRankings?: { sourceScanId?: string; guildIdentifier: string | null; server: string; hofRank: number | null; timestampMs: number }[] };
type TrendOptions = WatchOptions<GuildTrendBuildResult> & {
    onHistory?: (history: GuildTrendHistory) => void;
    memberRefs?: readonly string[];
    includeServerHistory?: boolean;
    chartWindow?: { startMs: number; endMs: number };
    /** Profile-owned lease retains prepared sources across range extensions. */
    preparation?: AnalyticsPreparationLease;
    requestId?: string;
    summaries: GuildHubScanSummary[];
    guildTarget?: GuildTrendTarget | null;
    /** Limit preparation and diagnostic counts to the addressed Dashboard guild. */
    sourceScope?: "dashboard-guild";
    onProgress?: (progress: PlayerPerformanceProgress) => void;
};
export const analyticsSummaryKey = (summaries: readonly GuildHubScanSummary[]) => JSON.stringify(summaries.map(s => sourcePreparationKey(s, "inventory")).sort());
/** Trend needs the addressed rosters; Progress retains the complete shared
 * server history. Reuse completeness/index records, without rebuilding stats. */
function guildTrendProjection(data: GuildTrendHistory["data"], indexes: AnalyticsIndexes, target: GuildTrendTarget, identity: GuildTrendHistory["identity"]) {
    const identifier = resolveTargetGuildIdentifier(data.guilds, identity, target);
    const addressed = new Set(data.guilds.filter(row => identifier && areSameGuildIdentity(row.guildIdentifier, identifier, identity))
        .map(row => row.snapshotId + ":" + row.guildIdentifier?.toLowerCase()));
    if (!addressed.size) return { data, indexes };
    const members = data.members.filter(row => addressed.has(row.snapshotId + ":" + row.guildIdentifier?.toLowerCase()));
    const ids = new Set(members.map(row => row.id));
    return { data: { ...data, members }, indexes: { ...indexes,
        membersBySnapshotId: new Map([...indexes.membersBySnapshotId].map(([key, rows]) => [key, rows.filter(row => ids.has(row.id))])),
        membersBySourceTimeRef: new Map([...indexes.membersBySourceTimeRef].filter(([, row]) => ids.has(row.id))),
    } };
}

function startRun<T>(options: WatchOptions<T> & {
    requestId?: string;
    summaries: GuildHubScanSummary[];
}, kind: "cards" | "trend", card?: CardOptions, trend?: TrendOptions) {
    const scopedTrend = kind === "trend" && trend?.sourceScope === "dashboard-guild" && Boolean(trend.guildTarget?.logoIdentifier?.trim());
    let disposed = false, generation = 0, lease: AnalyticsPreparationLease | undefined, controller: AbortController | undefined, stop: LocalDependencySubscription | undefined, stopReset: undefined | (() => void), validating = false;
    let proofSummaries: GuildHubScanSummary[] = [...options.summaries];
    let terminalState: string | undefined;
    let receipt: LocalDependencyReceipt | undefined, reset: string | undefined, sourceIds: string[] = options.summaries.filter(isGuildHubScanAnalyticsEnabled).map(s => s.sourceScanId), need: LocalDataDependencies = { allSources: true, allIdentities: true };
    const requestId = options.requestId ?? globalThis.crypto?.randomUUID?.() ?? `analytics-consumer-${Date.now()}-${Math.random()}`;
    let resolveFirst!: (value: T) => void, rejectFirst!: (error: unknown) => void, first = true;
    const promise = new Promise<T>((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
    const dependencyRefresh = (cause?: import("../local-data/localDataDependencies").LocalDependencyNotification, checked?: LocalDependencyReceipt) => {
        // A newer run may already have captured this notification's generation.
        // Its preflight and delivery proofs cover mutations after that capture;
        // genuinely newer receipts still start separate work, even mid-run.
        if (!disposed && (!receipt || !checked || checked.sources > receipt.sources || checked.players > receipt.players || checked.guilds > receipt.guilds))
            void run(true, cause?.trigger);
    };
    async function liveState(context?: AuditFields) {
        const live = await readGuildHubLocalScanSourceValidity(proofSummaries.map(s => s.sourceScanId));
        const dependencies = receipt ? (await revalidateLocalDataDependencies(receipt, context)).current : undefined;
        return JSON.stringify([proofSummaries.map(s => { const current = live.get(s.sourceScanId); return [s.sourceScanId, current ? sourcePreparationKey(current, "terminal") : null]; }), await readGuildAnalyticsResetCertificate(sourceIds), dependencies]);
    }
    async function run(refresh: boolean, trigger = refresh ? "dependency-refresh" : "cards-or-trend-request") {
    const __audit1 = auditBegin(kind === "cards" ? "F10" : "F11", "run");
    auditExpectGraph(__audit1);
    const progressAudit = kind === "trend" && trend?.includeServerHistory ? auditBegin("F37", "progress-history", null) : null;
    let progressHistoryDelivered = false, progressHistoryFailed = false;
    auditFields(progressAudit, { consumer: "dashboard-guild-progress", trigger, requestId, stage: "history", endpoint: "shared-preparation; comparison-and-chart-pending" });
    auditLink(progressAudit, __audit1?.id, "shared-history-preparation");
    try {
        if (disposed)
            return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
        if (__audit1) auditFields(__audit1, { trigger, consumer: kind === "cards" ? "dashboard-member-cards" : "dashboard-guild-trend", startBoundary: "cards-or-trend-run-call", action: refresh ? "dependency-refresh" : "initial-request", requestId, kind });
        const own = ++generation;
        terminalState = undefined;
        controller?.abort();
        if (lease !== trend?.preparation) lease?.release();
        lease = trend?.preparation ?? sharedAnalyticsPreparation.acquire("visible");
        controller = new AbortController();
        const scope = lease, signal = controller.signal;
        if (refresh)
            options.onInvalidating?.();
        try {
            const captured = await (auditValue(__audit1, auditEnter(__audit1, "captureLocalDataDependencies"), (captureLocalDataDependencies({ allSources: true, allIdentities: true }))));
            receipt = captured; // Resume can detect a new stand even if preflight fails.
            const [inventory, identity] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([listGuildHubScanSummaries({ ...(scopedTrend ? { ensureCurrent: false } : {}), auditContext: { consumer: kind === "cards" ? "dashboard-member-cards" : "dashboard-guild-trend", trigger, requestId } }), loadIdentityResolutionSnapshot()]))));
            checkProfileWork(signal);
            if (scopedTrend) {
                // Do not let inventory enumeration renew unrelated summaries.
                // Raw-only sources have no exclusion proof and need the existing
                // sourcewise fallback before a fresh, guarded acquisition.
                const rawInventory = await readGuildHubLocalScanSourceInventory();
                checkProfileWork(signal);
                const known = new Set(inventory.map(s => s.sourceScanId));
                const missing = rawInventory.sourceIds.filter(id => !known.has(id));
                if (missing.length) {
                    for (const id of missing) {
                        checkProfileWork(signal);
                        if (!await getGuildHubLocalScan(id)) throw Error(`Analytics source cannot be renewed: ${id}`);
                    }
                    checkProfileWork(signal);
                    await run(true);
                    return auditReturn(__audit1, undefined);
                }
            }
            const players = new Set(card?.targetPlayerRefs ?? trend?.memberRefs ?? []);
            const defaultTrendTarget = kind === "trend" && !trend?.guildTarget ? normalizePerformanceTarget() : undefined;
            const guilds = new Set<string>();
            if (trend?.guildTarget)
                for (const candidate of buildGuildTrendTargetIdentifierCandidates(trend.guildTarget)) guilds.add(candidate);
            for (const s of options.summaries)
                for (const g of s.guilds)
                    if (g.guildIdentifier && (kind === "cards" || !trend?.guildTarget))
                        guilds.add(g.guildIdentifier);
            for (const ref of players)
                for (const alias of resolvePlayerIdentity(identity, ref.replace(/^identifier:/, "").trim()).aliasIdentifiers)
                    players.add(alias);
            for (const ref of guilds)
                for (const alias of resolveGuildIdentity(identity, ref).aliasIdentifiers)
                    guilds.add(alias);
            const comparisonGuilds = new Set(guilds);
            if (trend?.includeServerHistory && trend.guildTarget?.server) {
                const server = serverComparisonKey(trend.guildTarget.server);
                for (const group of identity.guilds.byIdentityId.values())
                    if (group.aliases.some(alias => serverComparisonKey(alias.identifier.replace(/_g[^_]+$/i, "")) === server))
                        for (const alias of group.aliases) comparisonGuilds.add(alias.identifier);
            }
            // F28 card search keeps its original server scope. Targeted Dashboard work
            // binds original keys and guild populations, not the global inventory.
            const selection = { players: [...players], guilds: [...(trend?.includeServerHistory ? comparisonGuilds : guilds)], ...(trend?.includeServerHistory && trend.guildTarget?.server ? { servers: [trend.guildTarget.server] } : {}), ...(!players.size && kind === "cards" && card?.serverFilter ? { servers: [card.serverFilter] } : defaultTrendTarget?.server ? { servers: [defaultTrendTarget.server] } : {}) };
            // Use the existing identity-aware selection. Absence is only evidence
            // with current, complete identifier metadata; otherwise retain the
            // candidate for sourcewise renewal/preparation, including old servers.
            const selectionMatcher = createAnalyticsScopeMatcher(selection);
            const identityScope = (summary: GuildHubScanSummary, matchesScope = selectionMatcher) =>
                matchesScope(summary) || Boolean(scopedTrend && (
                    !hasCurrentLocalSourceValidity(summary) || summary.summaryVersion !== GUILD_HUB_SCAN_SUMMARY_VERSION ||
                    !summary.fusionInventorySlices?.length || summary.fusionInventorySlices.some(slice =>
                        !Array.isArray(slice.playerIdentifiers) || !Array.isArray(slice.guildIdentifiers) ||
                        slice.playerIdentifiers.length < slice.playerCount || slice.guildIdentifiers.length < slice.guildCount)));
            const window = scopedTrend ? trend?.chartWindow : undefined;
            let rangeIds: Set<string> | undefined, priorBasisMs: number | undefined;
            if (window) {
                const candidates = inventory.filter(summary => isGuildHubScanAnalyticsEnabled(summary) && identityScope(summary));
                rangeIds = new Set(candidates.filter(summary => summary.snapshotTimestamps.some(at => at >= window.startMs && at <= window.endMs)).map(summary => summary.sourceScanId));
                // Inspect older observations in descending time order until the
                // existing completeness rules certify a target-guild basis.
                // No old source is prepared merely to populate a menu.
                const targetMatcher = createAnalyticsScopeMatcher({ guilds: [...guilds] });
                const priorCandidates = candidates.filter(summary => targetMatcher(summary) || !hasCurrentLocalSourceValidity(summary));
                const priorTimes = [...new Set(priorCandidates.flatMap(summary => summary.snapshotTimestamps.filter(at => at < window.startMs)))].sort((a, b) => b - a);
                const priorSources = new Map<string, GuildHubScanSummary>();
                for (const at of priorTimes) {
                    const batch = priorCandidates.filter(summary => summary.snapshotTimestamps.includes(at));
                    batch.forEach(summary => { rangeIds!.add(summary.sourceScanId); priorSources.set(summary.sourceScanId, summary); });
                    if (await renewAnalyticsSourceSummaries(batch, signal)) { await run(true); return auditReturn(__audit1, undefined); }
                    const prior = await scope.ensure([...priorSources.values()], signal, undefined, false, true);
                    const identifier = resolveTargetGuildIdentifier(prior.guilds, identity, trend!.guildTarget!);
                    const declarations = new Map(prior.guilds.map(guild => [guild.snapshotId + ":" + guild.guildIdentifier?.toLowerCase(), guild.declaredMemberCount]));
                    const eligible = buildGuildSnapshotCompletenessReports(prior).filter(report => report.scannedAtMs < window.startMs && report.completeForPerformance &&
                        declarations.get(report.snapshotId + ":" + report.guildIdentifier?.toLowerCase()) === report.foundUniqueMemberCount &&
                        identifier && areSameGuildIdentity(report.guildIdentifier, identifier, identity));
                    if (eligible.length) { priorBasisMs = Math.max(...eligible.map(report => report.scannedAtMs)); break; }
                }
                auditFields(progressAudit, { windowStartMs: window.startMs, windowEndMs: window.endMs, rangeSourceCount: rangeIds.size, priorSourceCount: priorSources.size });
            }
            const inScope = (summary: GuildHubScanSummary, matcher = selectionMatcher) => identityScope(summary, matcher) && (!rangeIds || rangeIds.has(summary.sourceScanId));
            // A new request binds to the live inventory, including completed Summary
            // maintenance. Missing IDs remain visible to the final deletion guards.
            const inventoryById = new Map(inventory.map(s => [s.sourceScanId, s]));
            let summaries = refresh ? inventory : options.summaries.map(s => inventoryById.get(s.sourceScanId) ?? s);
            if (scopedTrend)
                summaries = summaries.filter(s => inScope(s));
            if (refresh && kind === "cards")
                summaries = inventory.filter(s => selectionMatcher(s) && (!card?.anchorMs || s.snapshotTimestamps.some(t => t <= card.anchorMs!)) && (players.size || !card?.serverFilter || [...s.servers, ...s.guilds.map(g => g.server), ...(s.fusionInventorySlices ?? []).map(slice => slice.server)].some(server => serverComparisonKey(server)?.toLowerCase() === serverComparisonKey(card.serverFilter)?.toLowerCase())));
            const relevant = inventory.filter(s => inScope(s));
            if (await (auditValue(__audit1, auditEnter(__audit1, "renewAnalyticsSourceSummaries"), (renewAnalyticsSourceSummaries([...new Map([...summaries, ...relevant].map(s => [s.sourceScanId, s])).values()], signal))))) {
                // Preparation has not started. A fresh acquisition captures the new
                // dependency receipt and Source proof after sourcewise renewal.
                await (auditValue(__audit1, auditEnter(__audit1, "run"), (run(true))));
                return auditReturn(__audit1, undefined);
            }
            const relevantIds = kind === "cards" ? new Set([...summaries.map(s => s.sourceScanId), ...relevant.map(s => s.sourceScanId)]) : new Set(relevant.map(s => s.sourceScanId));
            need = { sourceIds: [...relevantIds], sourceScope: selection, playerAliases: [...players], guildAliases: selection.guilds, ...(trend?.includeServerHistory ? { allIdentities: true } : {}) };
            // Legacy consumers keep inventory-wide trend diagnostics. The opt-in
            // counts only its prepared basis, without foreign readExisting jobs.
            const requestedIds = new Set(summaries.map(s => s.sourceScanId));
            const existingSummaries = inventory.filter(s => !requestedIds.has(s.sourceScanId) && hasCurrentLocalSourceValidity(s) && (kind === "trend" && !scopedTrend || inScope(s)));
            proofSummaries = [...summaries, ...existingSummaries].filter(summary => relevantIds.has(summary.sourceScanId));
            receipt = { ...captured, need };
            sourceIds = proofSummaries.filter(isGuildHubScanAnalyticsEnabled).map(s => s.sourceScanId);
            reset = await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsResetCertificate"), (readGuildAnalyticsResetCertificate(sourceIds))));
            if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current) {
                // Summary maintenance or a real mutation happened after capture,
                // before dispatch. Start new work rather than replace its receipt.
                await (auditValue(__audit1, auditEnter(__audit1, "run"), (run(true))));
                return auditReturn(__audit1, undefined);
            }
            stop?.();
            stop = subscribeToLocalDataDependencies(need, dependencyRefresh, (_error, cause) => void run(true, `dependency-error:${cause?.trigger ?? "baseline"}`), { consumer: kind === "cards" ? "dashboard-member-cards" : "dashboard-guild-trend", requestId });
            stopReset?.();
            stopReset = subscribeToLocalDataChanges(change => { if (change.owner === "analytics" && change.kinds.includes("reset") && (!change.sourceIds.length || change.sourceIds.some(id => relevantIds.has(id))))
                void run(true); });
            const requested = await (auditValue(__audit1, auditEnter(__audit1, "scope.ensure"), (scope.ensure(summaries, signal, undefined, false, Boolean(trend?.includeServerHistory)))));
            const relevantHistory = existingSummaries.filter(s => relevantIds.has(s.sourceScanId));
            const [renewedHistory, foreignHistory] = await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all([
                scope.ensure(relevantHistory, signal, undefined, false, Boolean(trend?.includeServerHistory)),
                scope.readExisting(existingSummaries.filter(s => !relevantIds.has(s.sourceScanId)), signal),
            ]))));
            const existing = { snapshots: [...renewedHistory.snapshots, ...foreignHistory.snapshots], members: [...renewedHistory.members, ...foreignHistory.members], guilds: [...renewedHistory.guilds, ...foreignHistory.guilds] };
            const withinWindow = (at: number) => !window || at <= window.endMs && (at >= window.startMs || at === priorBasisMs);
            const data = { snapshots: [...requested.snapshots, ...existing.snapshots].filter(row => withinWindow(row.snapshotTimestamp)).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)), members: [...requested.members, ...existing.members].filter(row => withinWindow(row.snapshotTimestamp)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), guilds: [...requested.guilds, ...existing.guilds].filter(row => withinWindow(row.snapshotTimestamp)).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)) };
            const indexes = scope.indexes(data);
            checkProfileWork(signal);
            const key = (auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify([kind === "trend" && trend?.includeServerHistory ? 2 : 1, kind, analyticsSummaryKey(summaries), reset, identity, data.snapshots.map(s => s.id), card ? { serverFilter: card.serverFilter, targetPlayerRefs: card.targetPlayerRefs, targetPlayerNames: card.targetPlayerNames, includeCards: card.includeCards } : trend?.guildTarget, ...(scopedTrend ? ["dashboard-guild", trend?.chartWindow] : [])]))));
            const projectionReceipt = receipt, projectionReset = reset, projectionSources = [...sourceIds], projectionProof = [...proofSummaries];
            const validateProjection = async () => {
                await validateSourceProof(projectionProof);
                const [dependencies, currentReset] = await Promise.all([
                    auditCall(__audit1, "projection-dependency-proof", () => revalidateLocalDataDependencies(projectionReceipt), "async-container"), readGuildAnalyticsResetCertificate(projectionSources),
                ]);
                if (!dependencies.current || currentReset !== projectionReset)
                    throw Error(`Analytics dependencies changed before result reuse: ${JSON.stringify({ sourceIds: projectionSources,
                        expected: { sources: projectionReceipt.sources, players: projectionReceipt.players, guilds: projectionReceipt.guilds, reset: projectionReset },
                        actual: { sources: dependencies.receipt.sources, players: dependencies.receipt.players, guilds: dependencies.receipt.guilds, current: dependencies.current, reset: currentReset } })}`);
            };
            const finished = await (auditValue(__audit1, auditEnter(__audit1, "scope.finished"), (scope.finished<T>(key, signal, validateProjection))));
            const entryKeys: string[] = [];
            const entries = kind === "cards" && !finished.hit ? await (auditValue(__audit1, auditEnter(__audit1, "Promise.all"), (Promise.all(summaries.map(summary => { const entryKey = JSON.stringify(["card-source", sourcePreparationKey(summary, projectionReset!), identity, card!.serverFilter, card!.targetPlayerRefs, card!.targetPlayerNames, card!.includeCards]); entryKeys.push(entryKey); return scope.project<{
                entries: LocalPlayerIndexEntry[];
                loaded: boolean;
            }>(entryKey, { kind: "card-source", summary, identity, serverFilter: card!.serverFilter, targetPlayerRefs: card!.targetPlayerRefs, targetPlayerNames: card!.targetPlayerNames, includeCards: card!.includeCards }, signal, validateProjection); }))))) : undefined;
            const trendBasis = !finished.hit && kind === "trend" && trend?.includeServerHistory && trend.guildTarget
                ? guildTrendProjection(data, indexes, trend.guildTarget, identity) : { data, indexes };
            auditFields(__audit1, { historyMemberRows: data.members.length, trendProjectionRows: kind === "trend" ? trendBasis.data.members.length : undefined });
            const value = finished.hit ? finished.value : kind === "cards" ? await (auditValue(__audit1, auditEnter(__audit1, "scope.project"), (scope.project<T>(key, { kind: "cards", entries, summaries, serverFilter: card!.serverFilter, targetPlayerRefs: card!.targetPlayerRefs, targetPlayerNames: card!.targetPlayerNames, includeCards: card!.includeCards, data, identity, indexes: indexesToDTO(indexes) }, signal, validateProjection)))) : await (auditValue(__audit1, auditEnter(__audit1, "scope.project"), (scope.project<T>(key, { kind: "trend", guildTarget: trend?.guildTarget, data: trendBasis.data, identity, indexes: indexesToDTO(trendBasis.indexes) }, signal, validateProjection))));
            entryKeys.forEach(key => scope.forgetProjection(key));
            if (kind === "trend") {
                if (defaultTrendTarget)
                    for (const member of selectTargetAnalyticsMembers(data.members, identity, defaultTrendTarget)) {
                        players.add(member.memberRef);
                        for (const alias of resolvePlayerIdentity(identity, member.memberRef).aliasIdentifiers)
                            players.add(alias);
                    }
                const projected = value as GuildTrendBuildResult;
                if (projected.snapshots.length) {
                    if (!scopedTrend) guilds.clear();
                    for (const snapshot of projected.snapshots)
                        if (snapshot.guildIdentifier)
                            guilds.add(snapshot.guildIdentifier);
                    for (const ref of guilds)
                        for (const alias of resolveGuildIdentity(identity, ref).aliasIdentifiers)
                            guilds.add(alias);
                }
            }
            const identityPlayers = new Set(players);
            for (const member of data.members)
                if (kind === "cards" || member.guildIdentifier && [...guilds].some(ref => [ref, ...resolveGuildIdentity(identity, ref).aliasIdentifiers].includes(member.guildIdentifier!))) {
                    identityPlayers.add(member.memberRef);
                    for (const alias of resolvePlayerIdentity(identity, member.memberRef).aliasIdentifiers)
                        identityPlayers.add(alias);
                }
            const finalScope = { players: [...players], guilds: [...(trend?.includeServerHistory ? comparisonGuilds : guilds)], ...(trend?.includeServerHistory && trend.guildTarget?.server ? { servers: [trend.guildTarget.server] } : {}), ...(!players.size && kind === "cards" && card?.serverFilter ? { servers: [card.serverFilter] } : !players.size && defaultTrendTarget?.server ? { servers: [defaultTrendTarget.server] } : {}) };
            const finalMatcher = createAnalyticsScopeMatcher(finalScope);
            const finalIds = inventory.filter(s => inScope(s, finalMatcher)).map(s => s.sourceScanId);
            need = { sourceIds: kind === "cards" ? [...new Set([...summaries.map(s => s.sourceScanId), ...finalIds])] : finalIds, sourceScope: finalScope, playerAliases: [...identityPlayers], guildAliases: finalScope.guilds, ...(trend?.includeServerHistory ? { allIdentities: true } : {}) };
            receipt = { ...captured, need };
            proofSummaries = proofSummaries.filter(summary => need.sourceIds?.includes(summary.sourceScanId));
            sourceIds = proofSummaries.filter(isGuildHubScanAnalyticsEnabled).map(s => s.sourceScanId);
            reset = (auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify(((auditValue(__audit1, auditEnter(__audit1, "JSON.parse", "sync-elapsed"), (JSON.parse(projectionReset!)))) as Array<[
                string,
                string
            ]>).filter(([id]) => sourceIds.includes(id))))));
            stopReset?.();
            stopReset = subscribeToLocalDataChanges(change => { if (change.owner === "analytics" && change.kinds.includes("reset") && (!change.sourceIds.length || change.sourceIds.some(id => need.sourceIds?.includes(id))))
                void run(true); });
            stop?.();
            stop = subscribeToLocalDataDependencies(need, dependencyRefresh, (_error, cause) => void run(true, `dependency-error:${cause?.trigger ?? "baseline"}`), { consumer: kind === "cards" ? "dashboard-member-cards" : "dashboard-guild-trend", requestId });
            if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current || await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsResetCertificate"), (readGuildAnalyticsResetCertificate(sourceIds)))) !== reset)
                throw Error("Analytics dependencies changed before delivery");
            checkProfileWork(signal);
            if (disposed || generation !== own)
                throw profileAbortError();
            // Separate checks before finished reuse and immediately before UI delivery.
            await (auditValue(__audit1, auditEnter(__audit1, "validateSourceProof"), (validateSourceProof(projectionProof))));
            if (!(await (auditValue(__audit1, auditEnter(__audit1, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current)
                throw Error("Analytics dependencies changed before publication");
            if (disposed || generation !== own)
                throw profileAbortError();
            if (kind === "cards" && __audit1) auditFields(__audit1, { "result:players": (value as LocalPlayerIndexWorkerRunResult).index.players.length });
            // Publish the already prepared history only after all delivery proofs.
            if (kind === "trend") {
                const history: GuildTrendHistory = { data, identity, ...(window ? { visibleStartMs: window.startMs } : {}), ...(trend?.includeServerHistory ? {
                    // Already persisted Summary metadata: no raw scan reads or new stat preparation.
                    guildRankings: proofSummaries.flatMap(summary => summary.guilds.map(guild => ({
                        sourceScanId: summary.sourceScanId, guildIdentifier: guild.guildIdentifier, server: guild.server, hofRank: guild.hofRank,
                        timestampMs: guild.sourceScannedAt ? Date.parse(guild.sourceScannedAt) : summary.lastSnapshotTimestamp ?? NaN,
                    }))),
                } : {}) };
                auditFields(progressAudit, { sourceCount: new Set(data.snapshots.map(row => row.sourceScanId)).size, memberObservations: data.members.length, guildObservations: data.guilds.length, validatedHistoryReady: true });
                auditReturn(progressAudit, history);
                trend?.onHistory?.(history);
                progressHistoryDelivered = true;
            }
            auditAccept(__audit1, value);
            auditAssociate(__audit1, value);
            if (first) {
                auditBindPromise(__audit1, promise);
                first = false;
                resolveFirst(value);
            }
            else
                options.onRefresh?.(value);
        }
        catch (error) { auditError(__audit1, error); auditError(progressAudit, error); progressHistoryFailed = true;
            if (disposed || own !== generation)
                return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined));
            controller?.abort();
            if (scope !== trend?.preparation) scope.release();
            if (lease === scope)
                lease = undefined;
            try { const state = await (auditValue(__audit1, auditEnter(__audit1, "liveState"), (liveState()))); if (disposed || own !== generation) return (__audit1 && auditDiscard(__audit1), auditReturn(__audit1, undefined)); terminalState = state; }
            catch { terminalState = "unreadable"; }
            if (first) {
                first = false;
                rejectFirst(error);
            }
            else
                options.onError?.(error);
        }

    } catch (__auditError) { auditError(__audit1, __auditError); auditError(progressAudit, __auditError); progressHistoryFailed = true; throw __auditError; }
    finally { if (!progressHistoryDelivered && !progressHistoryFailed) auditFinish(progressAudit, "superseded"); auditLeave(progressAudit); auditLeave(__audit1); }
}
    async function revalidate(trigger = "explicit-revalidate", checkDependencies = true) {
        const context = { consumer: kind === "cards" ? "dashboard-member-cards" : "dashboard-guild-trend", trigger, requestId }; if (disposed || validating || !receipt)
        return; validating = true;
        const validationGeneration = generation;
        const audit = auditBegin("S06", "analytics-revalidation", null);
        auditFields(audit, { ...context, dependencyCheckOwner: checkDependencies || !stop?.matches(receipt.need) || terminalState !== undefined ? "self" : "durable-subscription",
          sourceSequence: receipt.sources, playerSequence: receipt.players, guildSequence: receipt.guilds });
        try {
        if (terminalState !== undefined) {
            if (await auditCall(audit, "terminal-evidence-proof", () => liveState(context), "async-container") !== terminalState && !disposed && generation === validationGeneration)
                await run(true, trigger);
            return;
        }
        await auditCall(audit, "named-source-validity-proof", () => validateSourceProof(proofSummaries), "async-container");
        if (disposed || generation !== validationGeneration) return;
        // The active durable subscription owns source/identity catch-up on
        // browser return. Keep the independent named-source and reset proofs.
        if ((checkDependencies || !stop?.matches(receipt.need)) && !(await auditCall(audit, "owned-dependency-proof", () => revalidateLocalDataDependencies(receipt!, context), "async-container")).current || await auditCall(audit, "reset-certificate-proof", () => readGuildAnalyticsResetCertificate(sourceIds), "async-elapsed") !== reset)
            if (!disposed && generation === validationGeneration) await run(true, trigger);
    }
    catch (error) {
        auditError(audit, error);
        if (!disposed && generation === validationGeneration && terminalState === undefined)
            await run(true, trigger);
    }
    finally {
        validating = false;
        auditLeave(audit);
    } }
    const resume = (event: Event) => { if (typeof document === "undefined" || document.visibilityState !== "hidden")
        void revalidate(event.type, false); };
    if (typeof window !== "undefined") {
        window.addEventListener("focus", resume);
        window.addEventListener("pageshow", resume);
        document.addEventListener("visibilitychange", resume);
    }
    void run(false);
    return { requestId, promise, revalidate, cancel() { if (disposed)
            return; disposed = true; generation++; controller?.abort(); lease !== trend?.preparation && lease?.release(); stop?.(); stopReset?.(); if (first) {
            first = false;
            rejectFirst(profileAbortError());
        } if (typeof window !== "undefined") {
            window.removeEventListener("focus", resume);
            window.removeEventListener("pageshow", resume);
            document.removeEventListener("visibilitychange", resume);
        } } };
}
export const startSharedPlayerCardsRun = (options: CardOptions) => startRun(options, "cards", options);
export const startSharedGuildTrendRun = (options: TrendOptions) => startRun(options, "trend", undefined, options);
async function validateSourceProof(summaries: GuildHubScanSummary[]) {
    const live = await readGuildHubLocalScanSourceValidity(summaries.map(s => s.sourceScanId));
    for (const expected of summaries) {
        const current = live.get(expected.sourceScanId);
        if (!current || sourcePreparationKey(current, "proof") !== sourcePreparationKey(expected, "proof"))
            throw Error(`Analytics Source/Generation/Normalizer proof changed: ${JSON.stringify({ sourceId: expected.sourceScanId, expected: sourcePreparationKey(expected, "proof"), actual: current ? sourcePreparationKey(current, "proof") : null })}`);
    }
}
