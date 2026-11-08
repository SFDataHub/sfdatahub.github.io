import { prepareProfileSumHistory } from "./profileSumHistory";
import type { GuildHubLocalScan } from "../guilds/localScanLibrary";
import type { AnalyticsWorkerPhase } from "./executionTransport";
import { auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave } from "../data-hub/runtimeAudit";
import { getGuildHubLocalScan, type GuildHubScanSummary } from "../guilds/localScanLibrary";
import { ensureGuildAnalyticsDerivedDataFromSummaries, readGuildAnalyticsDerivedSource, type GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import type { IdentityResolutionSnapshot } from "../identities/identityResolution";
import { createLocalPlayerIndexBuilder, type LocalPlayerIndexEntry } from "../player-search/localPlayerIndex";
import { buildAnalyticsIndexes, buildGuildTrendModel, type AnalyticsIndexes, type GuildTrendTarget } from "../../pages/Playground/playerPerformanceModel";
import { checkProfileWork } from "./contract";
export type IndexesDTO = {
    completenessReports: AnalyticsIndexes["completenessReports"];
    membersBySnapshotId: Array<[
        string,
        string[]
    ]>;
    membersBySourceTimeRef: Array<[
        string,
        string
    ]>;
    guildCompletenessBySnapshotGuild: Array<[
        string,
        number
    ]>;
};
export const indexesToDTO = (indexes: AnalyticsIndexes): IndexesDTO => ({
    completenessReports: indexes.completenessReports,
    membersBySnapshotId: [...indexes.membersBySnapshotId].map(([key, rows]) => [key, rows.map(row => row.id)]),
    membersBySourceTimeRef: [...indexes.membersBySourceTimeRef].map(([key, row]) => [key, row.id]),
    guildCompletenessBySnapshotGuild: [...indexes.guildCompletenessBySnapshotGuild].map(([key, report]) => [key, indexes.completenessReports.indexOf(report)]),
});
function indexesFromDTO(dto: IndexesDTO, data: GuildAnalyticsDerivedData): AnalyticsIndexes {
    const members = new Map(data.members.map(row => [row.id, row]));
    const member = (id: string) => { const row = members.get(id); if (!row)
        throw Error("Unknown transported analytics member"); return row; };
    return { completenessReports: dto.completenessReports, membersBySnapshotId: new Map(dto.membersBySnapshotId.map(([key, ids]) => [key, ids.map(member)])), membersBySourceTimeRef: new Map(dto.membersBySourceTimeRef.map(([key, id]) => [key, member(id)])), guildCompletenessBySnapshotGuild: new Map(dto.guildCompletenessBySnapshotGuild.map(([key, index]) => { const report = dto.completenessReports[index]; if (!report)
            throw Error("Unknown transported completeness report"); return [key, report]; })) };
}
export type ExecutionWorkMetrics = {
    kind: AnalyticsWork["kind"];
    cpuMs: number;
    readElapsedMs: number;
    sourceElapsedMs: number;
    writeElapsedMs: number;
    memberBuildElapsedMs: number;
    sources: number;
    rows: number;
    resultRows: number;
};
export type SourceWorkResult = {
    indexes: AnalyticsIndexes;
    data: GuildAnalyticsDerivedData;
    rawReads: number;
    builds: number;
    elapsedMs: number;
};
export type AnalyticsWork = import("./profileExecution").ProfileWork | {
    kind: "source";
    summary: GuildHubScanSummary;
    readOnly?: boolean;
    includeProgressValues?: boolean;
    profileScope?: import("./profileSumHistory").ProfileSumScope;
} | {
    kind: "card-source";
    summary: GuildHubScanSummary;
    serverFilter: string | null;
    targetPlayerRefs?: string[] | null;
    targetPlayerNames?: string[] | null;
    includeCards?: boolean;
    identity: IdentityResolutionSnapshot;
} | {
    kind: "cards";
    entries?: Array<{
        entries: LocalPlayerIndexEntry[];
        loaded: boolean;
    }>;
    summaries: GuildHubScanSummary[];
    serverFilter: string | null;
    targetPlayerRefs?: string[] | null;
    targetPlayerNames?: string[] | null;
    includeCards?: boolean;
    data: GuildAnalyticsDerivedData;
    identity: IdentityResolutionSnapshot;
    indexes: IndexesDTO;
} | {
    kind: "trend";
    guildTarget?: GuildTrendTarget | null;
    data: GuildAnalyticsDerivedData;
    identity: IdentityResolutionSnapshot;
    indexes: IndexesDTO;
};
/** Same production projections in worker and non-browser test fallback. Raw is
 * read in the owning realm, one source at a time, and never retained or sent. */
export async function executeAnalyticsWork(work: AnalyticsWork, signal: AbortSignal, onMetrics: (metrics: ExecutionWorkMetrics) => void = () => { }, onPhase: (phase: AnalyticsWorkerPhase) => void = () => {}): Promise<unknown> {
    const __audit1 = auditPhaseBegin("executeAnalyticsWork", undefined, "async-container");
    try {
    checkProfileWork(signal);
    if (work.kind.startsWith("profile-")) {
        const { executeProfileWork } = await import("./profileExecution");
        return executeProfileWork(work as import("./profileExecution").ProfileWork, signal);
    }
    const task = work as Exclude<AnalyticsWork, import("./profileExecution").ProfileWork>;
    return executeSourceWork(task, signal, onMetrics, onPhase);
    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
async function executeSourceWork(work: Exclude<AnalyticsWork, import("./profileExecution").ProfileWork>, signal: AbortSignal, onMetrics: (metrics: ExecutionWorkMetrics) => void, onPhase: (phase: AnalyticsWorkerPhase) => void): Promise<unknown> {
    const __audit1 = auditPhaseBegin("executeSourceWork", undefined, "async-container");
    try {
    const started = performance.now();
    const metrics: ExecutionWorkMetrics = { kind: work.kind, cpuMs: 0, readElapsedMs: 0, sourceElapsedMs: 0, writeElapsedMs: 0, memberBuildElapsedMs: 0, sources: 0, rows: 0, resultRows: 0 };
    if (work.kind === "source") {
        let rawReads = 0, builds = 0;
        let profileScan: GuildHubLocalScan | null = null;
        let data = work.readOnly ? await (auditValue(__audit1, auditEnter(__audit1, "readGuildAnalyticsDerivedSource"), (readGuildAnalyticsDerivedSource(work.summary.sourceScanId)))) : await (auditValue(__audit1, auditEnter(__audit1, "ensureGuildAnalyticsDerivedDataFromSummaries"), (ensureGuildAnalyticsDerivedDataFromSummaries([work.summary], { readSourceIds: [work.summary.sourceScanId], includeProgressValues: work.includeProgressValues,
            loadSourceById: async (id) => { checkProfileWork(signal); rawReads++; const at = performance.now(); onPhase("raw-source-read"); const scan = await getGuildHubLocalScan(id); onPhase("raw-source-loaded"); metrics.readElapsedMs += performance.now() - at; checkProfileWork(signal); profileScan = scan; return scan; }, onCommitPhase: onPhase, onPhase: entry => { if(entry.phase !== "loading-local-scan-data" && entry.phase !== "rebuilding-analytics-data") onPhase(entry.phase); }, onSourceDiagnostic: entry => { builds++; metrics.cpuMs += entry.snapshotBuildMs + entry.guildObservationBuildMs; metrics.memberBuildElapsedMs += entry.memberObservationBuildMs; metrics.writeElapsedMs += entry.writeMs; } }))));
        if (work.includeProgressValues && !work.readOnly) {
            if (!profileScan) { rawReads++; const at = performance.now(); profileScan = await getGuildHubLocalScan(work.summary.sourceScanId); metrics.readElapsedMs += performance.now() - at; }
            checkProfileWork(signal);
            if (!profileScan) throw Error("Missing bound profile sum source");
            data = prepareProfileSumHistory(data, profileScan, work.summary, work.profileScope);
        }
        metrics.sourceElapsedMs = performance.now() - started;
        metrics.sources = 1;
        metrics.rows = data.members.length;
        metrics.resultRows = data.members.length;
        onMetrics(metrics);
        checkProfileWork(signal);
        return auditReturn(__audit1, { data, indexes: buildAnalyticsIndexes(data), rawReads, builds, elapsedMs: performance.now() - started } satisfies SourceWorkResult);
    }
    if (work.kind === "card-source") {
        const at = performance.now();
        const scan = await (auditValue(__audit1, auditEnter(__audit1, "getGuildHubLocalScan"), (getGuildHubLocalScan(work.summary.sourceScanId))));
        metrics.readElapsedMs += performance.now() - at;
        checkProfileWork(signal);
        const builder = createLocalPlayerIndexBuilder({ serverFilter: work.serverFilter, targetPlayerRefs: work.targetPlayerRefs, targetPlayerNames: work.targetPlayerNames, includeCards: work.includeCards, identityResolutionSnapshot: work.identity });
        const cpuAt = performance.now();
        if (scan)
            builder.addScan({ scan, summary: work.summary });
        metrics.cpuMs += performance.now() - cpuAt;
        metrics.sources = 1;
        metrics.rows = scan?.playerCount ?? 0;
        metrics.resultRows = builder.entries().length;
        onMetrics(metrics);
        return auditReturn(__audit1, { entries: builder.entries(), loaded: Boolean(scan) });
    }
    onPhase("projection");
    const preparedIndexes = indexesFromDTO(work.indexes, work.data);
    if (work.kind === "trend") {
        const at = performance.now();
        const result = (auditValue(__audit1, auditEnter(__audit1, "buildGuildTrendModel", "sync-elapsed"), (buildGuildTrendModel({ analyticsData: work.data, identityResolutionSnapshot: work.identity, guildTarget: work.guildTarget, preparedIndexes }))));
        metrics.cpuMs += performance.now() - at;
        metrics.sources = new Set(work.data.snapshots.map(s => s.sourceScanId)).size;
        metrics.rows = work.data.members.length;
        metrics.resultRows = result.snapshots.length;
        onMetrics(metrics);
        return auditReturn(__audit1, result);
    }
    const builder = createLocalPlayerIndexBuilder({ serverFilter: work.serverFilter, targetPlayerRefs: work.targetPlayerRefs, targetPlayerNames: work.targetPlayerNames, includeCards: work.includeCards, analyticsData: work.data, identityResolutionSnapshot: work.identity, preparedCompleteness: preparedIndexes.completenessReports });
    let rawReads = 0;
    if (work.entries)
        for (const part of work.entries)
            builder.addPreparedEntries(part.entries, part.loaded);
    else
        for (const summary of work.summaries) {
            checkProfileWork(signal);
            rawReads++;
            const at = performance.now();
            const scan = await (auditValue(__audit1, auditEnter(__audit1, "getGuildHubLocalScan"), (getGuildHubLocalScan(summary.sourceScanId))));
            metrics.readElapsedMs += performance.now() - at;
            checkProfileWork(signal);
            if (scan) {
                const cpuAt = performance.now();
                builder.addScan({ scan, summary });
                metrics.cpuMs += performance.now() - cpuAt;
                metrics.rows += scan.playerCount;
            }
        }
    const cpuAt = performance.now();
    const index = builder.finish();
    metrics.cpuMs += performance.now() - cpuAt;
    metrics.sources = work.summaries.length;
    metrics.resultRows = index.players.length;
    onMetrics(metrics);
    checkProfileWork(signal);
    return auditReturn(__audit1, { index, stats: index.stats, timings: [{ phase: "total", durationMs: performance.now() - started, count: 1 }], rawReads });

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
