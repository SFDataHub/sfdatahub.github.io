import { auditEnabled, auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditCurrent, auditLink, auditPromiseId, auditEvent, auditSpan, auditSpanEnd, auditResultId, associateAuditResultId } from "../data-hub/runtimeAudit";
import { hasCurrentLocalSourceValidity, localSourceValidityKey } from "../guilds/localSourceValidity";
import { readGuildAnalyticsResetCertificate, DERIVED_ANALYTICS_VERSION, PROGRESS_VALUES_VERSION, type GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import type { GuildHubScanSummary } from "../guilds/localScanLibrary";
import { getGuildHubLocalScan, readGuildHubLocalScanSourceValidity } from "../guilds/localScanLibrary";
import { buildAnalyticsIndexes, type AnalyticsIndexes } from "../../pages/Playground/playerPerformanceModel";
import { checkProfileWork, protectProfileBasis, profileAbortError } from "./contract";
import { createAnalyticsExecutionQueue, type AnalyticsPriority } from "./executionQueue";
import { ANALYTICS_TRANSPORT_VERSION, createAnalyticsTransport } from "./executionTransport";
import { prepareAnalyticsWorkerAssets } from "./workerAssets";
import { executeAnalyticsWork, type AnalyticsWork, type SourceWorkResult, type ExecutionWorkMetrics } from "./executionWork";
import type { ProfileWork } from "./profileExecution";
import type { ProfileSumScope } from "./profileSumHistory";
import type { ProfileBuildCounters } from "./historyBasis";
type SourceEntry = {
    users: Set<symbol>;
    data?: GuildAnalyticsDerivedData;
    indexes?: AnalyticsIndexes;
    job: ReturnType<ReturnType<typeof createAnalyticsExecutionQueue>["acquire"]>;
    summary: GuildHubScanSummary;
    reset: string;
    sourceAuditId?: string;
};
const combine = (parts: GuildAnalyticsDerivedData[]): GuildAnalyticsDerivedData => ({
    snapshots: parts.flatMap(p => p.snapshots).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
    members: parts.flatMap(p => p.members).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    guilds: parts.flatMap(p => p.guilds).sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp || a.id.localeCompare(b.id)),
});
export const sourcePreparationKey = (summary: GuildHubScanSummary, reset: string) => JSON.stringify([1, DERIVED_ANALYTICS_VERSION, PROGRESS_VALUES_VERSION, summary.sourceScanId, localSourceValidityKey(summary), summary.contentHash, summary.updatedAtIso ?? summary.importedAtIso, summary.analyticsEnabled, summary.snapshotTimestamps, reset]);
const pendingSourceRenewals = new Map<string, Promise<void>>();
const renewalStats = { normalizationRawReads: 0, normalizationRenewals: 0, normalizationJoins: 0, normalizationElapsedMs: 0 };
/** Repair only demanded older Sources, before any work is bound to their proof.
 * Callers start a new acquisition after a repair; no completed result is recertified. */
export async function renewAnalyticsSourceSummaries(summaries: readonly GuildHubScanSummary[], signal: AbortSignal) {
    let renewed = false;
    for (const summary of summaries) {
        checkProfileWork(signal);
        if (hasCurrentLocalSourceValidity(summary))
            continue;
        const live = (await readGuildHubLocalScanSourceValidity([summary.sourceScanId])).get(summary.sourceScanId);
        checkProfileWork(signal);
        if (live) {
            renewed = true;
            continue; // Another acquisition already completed this repair.
        }
        const key = sourcePreparationKey(summary, "renewal");
        let job = pendingSourceRenewals.get(key);
        if (!job) {
            job = (async () => {
                const at = performance.now();
                renewalStats.normalizationRawReads++;
                const scan = await getGuildHubLocalScan(summary.sourceScanId);
                const current = (await readGuildHubLocalScanSourceValidity([summary.sourceScanId])).get(summary.sourceScanId);
                if (!scan || !current)
                    throw Error(`Analytics source cannot be renewed: ${summary.sourceScanId}`);
                renewalStats.normalizationRenewals++;
                renewalStats.normalizationElapsedMs += performance.now() - at;
            })();
            pendingSourceRenewals.set(key, job);
            const own = job;
            void job.finally(() => { if (pendingSourceRenewals.get(key) === own) pendingSourceRenewals.delete(key); }).catch(() => {});
        } else {
            renewalStats.normalizationJoins++;
        }
        await abortable(job, signal);
        checkProfileWork(signal);
        renewed = true;
    }
    return renewed;
}
export function createSharedAnalyticsPreparation() {
    const queue = createAnalyticsExecutionQueue();
    const sources = new Map<string, SourceEntry>();
    const transport = createAnalyticsTransport(async (renew, signal) => {
        const audit = auditCurrent();
        await prepareAnalyticsWorkerAssets(renew, signal);
        checkProfileWork(signal);
        const constructorSpan = auditSpan(audit, "worker-constructor-call", "sync-elapsed");
        try { return new Worker(new URL("../../workers/playerAnalytics.worker.ts", import.meta.url).href +
        (import.meta.env?.DEV ? `&analytics-contract=${ANALYTICS_TRANSPORT_VERSION}` : ""), { type: "module" }); } finally { auditSpanEnd(audit, constructorSpan); }
    }, undefined, recordMetrics);
    const stats = { sourceJobs: 0, sourceJoins: 0, sourceHits: 0, indexSourceBuilds: 0, completenessSourceBuilds: 0, rawReads: 0, sourceBuilds: 0, projectionJobs: 0, projectionJoins: 0, projectionHits: 0, scopes: 0, sourceElapsedMs: 0, indexCpuMs: 0, dispatches: 0, roundtripMs: 0, inputJsonBytes: 0, resultJsonBytes: 0, sourceCpuMs: 0, cardCpuMs: 0, trendCpuMs: 0, rawReadElapsedMs: 0, writeElapsedMs: 0, memberBuildElapsedMs: 0, processedSources: 0, processedRows: 0, resultRows: 0, inputSourceDescriptors: 0, inputDerivedRows: 0, inputIndexEntries: 0 };
    // Logical JSON/UTF-8 samples for diagnostics, never transport byte counts.
    const jsonByteSamples = { input: 0, result: 0 };
    function recordMetrics(metrics: ExecutionWorkMetrics) {
        if (!metrics || !["source", "cards", "card-source", "trend"].includes(metrics.kind) ||
            [metrics.cpuMs, metrics.readElapsedMs, metrics.writeElapsedMs, metrics.memberBuildElapsedMs, metrics.sources, metrics.rows, metrics.resultRows].some(value => !Number.isFinite(value) || value < 0))
            throw Error("Invalid analytics work metrics");
        if (metrics.kind === "source")
            stats.sourceCpuMs += metrics.cpuMs;
        else if (metrics.kind === "cards" || metrics.kind === "card-source")
            stats.cardCpuMs += metrics.cpuMs;
        else
            stats.trendCpuMs += metrics.cpuMs;
        stats.rawReadElapsedMs += metrics.readElapsedMs;
        stats.writeElapsedMs += metrics.writeElapsedMs;
        stats.memberBuildElapsedMs += metrics.memberBuildElapsedMs;
        stats.processedSources += metrics.sources;
        stats.processedRows += metrics.rows;
        stats.resultRows += metrics.resultRows;
    }
    const projections = new Map<string, {
        users: Set<symbol>;
        value?: unknown;
        job: ReturnType<typeof queue.acquire>;
        validate: () => Promise<void>;
    }>();
    async function physical<T>(key: string, work: AnalyticsWork, signal: AbortSignal): Promise<T> {
    const __audit1 = work.kind === "source" ? auditBegin("S03", "physical-source-preparation") : auditPhaseBegin("physical", undefined, "async-container");
        if (__audit1) auditFields(__audit1, { sourceScanId: work.kind === "source" || work.kind === "card-source" ? work.summary.sourceScanId : undefined, sourceFirstSnapshotTimestamp: work.kind === "source" ? work.summary.firstSnapshotTimestamp : undefined, sourceLastSnapshotTimestamp: work.kind === "source" ? work.summary.lastSnapshotTimestamp : undefined, sourceFilename: work.kind === "source" ? work.summary.filename : undefined, sourceContentHash: work.kind === "source" ? work.summary.contentHash : undefined, sourceGeneration: work.kind === "source" ? work.summary.sourceGeneration : undefined, sourceNormalizerVersion: work.kind === "source" ? work.summary.normalizerVersion : undefined, sourceCoreNormalizerVersion: work.kind === "source" ? work.summary.coreNormalizerVersion : undefined, workKind: work.kind, executionRealm: typeof Worker === "undefined" ? "main-fallback" : "worker" });
    try {
        const at = performance.now();
        stats.dispatches++;
        stats.inputSourceDescriptors += work.kind === "source" || work.kind === "card-source" ? 1 : work.kind === "cards" ? work.summaries.length : work.kind === "trend" ? new Set(work.data.snapshots.map(s => s.sourceScanId)).size : 0;
        stats.inputDerivedRows += work.kind === "cards" || work.kind === "trend" ? work.data.members.length : 0;
        stats.inputIndexEntries += work.kind === "cards" ? work.entries?.reduce((n, p) => n + p.entries.length, 0) ?? 0 : 0;
        if (auditEnabled()) {
            stats.inputJsonBytes += new TextEncoder().encode((auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify(work))))).length;
            jsonByteSamples.input++;
        }
        const result = (typeof document === "undefined" || typeof Worker === "undefined") ? await (auditValue(__audit1, auditEnter(__audit1, "executeAnalyticsWork"), (executeAnalyticsWork(work, signal, recordMetrics)))) : await (auditValue(__audit1, auditEnter(__audit1, "transport.run"), (transport.run<T>(key, work, signal))));
        checkProfileWork(signal);
        validateWorkResult(work, result);
        stats.roundtripMs += performance.now() - at;
        if (auditEnabled()) {
            stats.resultJsonBytes += new TextEncoder().encode((auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify(result))))).length;
            jsonByteSamples.result++;
        }
        return auditReturn(__audit1, result as T);

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
    function acquire(priority: AnalyticsPriority) {
        const consumer = Symbol("active analytics preparation");
        const held = new Map<string, SourceEntry>();
        const heldProjections = new Map<string, typeof projections extends Map<string, infer V> ? V : never>();
        const heldJobs = new Map<string, {
            release: () => void;
        }>();
        let released = false;
        stats.scopes++;
        const live = () => { if (released)
            throw profileAbortError(); };
        async function ensure(summaries: GuildHubScanSummary[], signal: AbortSignal, counters?: ProfileBuildCounters, readOnly = false, includeProgressValues = false, profileScope?: ProfileSumScope): Promise<GuildAnalyticsDerivedData> {
    const __audit2 = auditPhaseBegin("ensure", undefined, "async-container");
    try {
            live();
            checkProfileWork(signal);
            const parts = await (auditValue(__audit2, auditEnter(__audit2, "Promise.all"), (Promise.all(summaries.filter(s => s.analyticsEnabled !== false).map(async (summary) => {
                const reset = await readGuildAnalyticsResetCertificate([summary.sourceScanId]);
                live();
                checkProfileWork(signal);
                const baseKey = sourcePreparationKey(summary, reset);
                const preparedKey = includeProgressValues ? `${baseKey}:progress:profile-sums-v3${profileScope ? ":scope:" + JSON.stringify(profileScope) : ""}` : baseKey;
                const key = readOnly && !sources.has(preparedKey) ? `${preparedKey}:existing` : preparedKey;
                let entry = sources.get(key);
                if (entry?.data) {
                    const validity = await readGuildHubLocalScanSourceValidity([summary.sourceScanId]);
                    live();
                    checkProfileWork(signal);
                    const current = validity.get(summary.sourceScanId);
                    if (!current || sourcePreparationKey(current, reset) !== baseKey)
                        throw Error(`Source changed before preparation reuse: ${JSON.stringify({ sourceId: summary.sourceScanId, expected: baseKey, actual: current ? sourcePreparationKey(current, reset) : null })}`);
                    stats.sourceHits++; auditLink(__audit2, entry.sourceAuditId, "completed-result-reuse"); auditEvent(__audit2, "source-completed-result-reuse");
                }
                if (!entry) {
                    stats.sourceJobs++;
                    const job = queue.acquire(key, consumer, priority, async (workSignal) => {
                        const result = await physical<SourceWorkResult>(key, { kind: "source", summary, readOnly, includeProgressValues, profileScope }, workSignal);
                        const currentReset = await readGuildAnalyticsResetCertificate([summary.sourceScanId]);
                        if (currentReset !== reset)
                            throw Error(`Source reset changed during preparation: ${JSON.stringify({ sourceId: summary.sourceScanId, expected: reset, actual: currentReset })}`);
                        const validity = await readGuildHubLocalScanSourceValidity([summary.sourceScanId]);
                        const current = validity.get(summary.sourceScanId);
                        if (!current || sourcePreparationKey(current, reset) !== baseKey)
                            throw Error(`Source generation changed during preparation: ${JSON.stringify({ sourceId: summary.sourceScanId, expected: baseKey, actual: current ? sourcePreparationKey(current, reset) : null })}`);
                        checkProfileWork(workSignal);
                        stats.rawReads += result.rawReads;
                        stats.sourceBuilds += result.builds;
                        stats.sourceElapsedMs += result.elapsedMs;
                        if (counters) {
                            counters.historicalRawReads += result.rawReads;
                            counters.sourceBuilds += result.builds;
                        }
                        const at = performance.now();
                        const indexes = result.indexes;
                        stats.indexCpuMs += performance.now() - at;
                        stats.indexSourceBuilds++;
                        stats.completenessSourceBuilds++;
                        const own = sources.get(key);
                        if (own && own === entry && own.users.size) {
                            own.sourceAuditId = auditResultId(result);
                            own.data = protectProfileBasis(result.data);
                            associateAuditResultId(own.data, own.sourceAuditId);
                            own.indexes = protectProfileBasis(indexes);
                        }
                        return result.data;
                    }, __audit2);
                    entry = { users: new Set(), job, summary, reset };
                    sources.set(key, entry);
                    heldJobs.set(key, job);
                    void job.promise.catch(() => { if (sources.get(key) === entry)
                        sources.delete(key); });
                }
                else if (!entry.data) {
                    stats.sourceJoins++; auditLink(__audit2, auditPromiseId(entry.job.promise), "in-flight-join"); auditEvent(__audit2, "source-in-flight-join");
                    heldJobs.set(key, queue.acquire(key, consumer, priority, async () => { throw Error("Unexpected duplicate preparation"); }, __audit2));
                }
                entry.users.add(consumer);
                held.set(key, entry);
                const data = entry.data ?? await abortable(entry.job.promise as Promise<GuildAnalyticsDerivedData>, signal);
                live();
                checkProfileWork(signal);
                return data;
            })))));
            live();
            checkProfileWork(signal);
            return auditReturn(__audit2, protectProfileBasis(combine(parts)));

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}
        function indexes(data: GuildAnalyticsDerivedData): AnalyticsIndexes {
    const __audit3 = auditPhaseBegin("indexes", undefined, "sync-elapsed");
    try {
            live();
            const ids = new Set(data.snapshots.map(s => s.sourceScanId));
            const parts = [...held.values()].filter(entry => entry.data && entry.indexes && entry.data.snapshots.some(s => ids.has(s.sourceScanId)));
            if (parts.length !== ids.size)
                return auditReturn(__audit3, protectProfileBasis((auditValue(__audit3, auditEnter(__audit3, "buildAnalyticsIndexes", "sync-elapsed"), (buildAnalyticsIndexes(data))))));
            const membersBySnapshotId = new Map<string, AnalyticsIndexes["membersBySnapshotId"] extends Map<string, infer V> ? V : never>();
            const membersBySourceTimeRef = new Map<string, AnalyticsIndexes["membersBySourceTimeRef"] extends Map<string, infer V> ? V : never>();
            const guildCompletenessBySnapshotGuild = new Map<string, AnalyticsIndexes["guildCompletenessBySnapshotGuild"] extends Map<string, infer V> ? V : never>();
            for (const entry of parts) {
                for (const [k, v] of entry.indexes!.membersBySnapshotId)
                    membersBySnapshotId.set(k, v);
                for (const [k, v] of entry.indexes!.membersBySourceTimeRef)
                    membersBySourceTimeRef.set(k, v);
                for (const [k, v] of entry.indexes!.guildCompletenessBySnapshotGuild)
                    guildCompletenessBySnapshotGuild.set(k, v);
            }
            // Reuse each source's prepared reports in linear time, retaining the
            // first matching source/row used by the previous find/findIndex path.
            const reportsBySource = new Map<string, Map<string, AnalyticsIndexes["completenessReports"][number]>>();
            for (const entry of parts) {
                if (reportsBySource.has(entry.summary.sourceScanId)) continue;
                const reports = new Map<string, AnalyticsIndexes["completenessReports"][number]>();
                entry.data!.guilds.forEach((guild, index) => {
                    if (!reports.has(guild.id)) reports.set(guild.id, entry.indexes!.completenessReports[index]);
                });
                reportsBySource.set(entry.summary.sourceScanId, reports);
            }
            return auditReturn(__audit3, protectProfileBasis({ completenessReports: data.guilds.map(guild => reportsBySource.get(guild.sourceScanId)!.get(guild.id)!), membersBySnapshotId, membersBySourceTimeRef, guildCompletenessBySnapshotGuild }));

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}
        async function finished<T>(key: string, signal: AbortSignal, validate: () => Promise<void>) {
    const __audit4 = auditPhaseBegin("finished", undefined, "async-container");
    try {
            live();
            checkProfileWork(signal);
            const entry = projections.get(key);
            if (entry?.value === undefined)
                return auditReturn(__audit4, { hit: false as const });
            try {
                await (auditValue(__audit4, auditEnter(__audit4, "entry.validate"), (entry.validate())));
            }
            catch {
                if (projections.get(key) === entry)
                    projections.delete(key);
                return auditReturn(__audit4, { hit: false as const });
            }
            await (auditValue(__audit4, auditEnter(__audit4, "validate"), (validate())));
            live();
            checkProfileWork(signal);
            if (projections.get(key) !== entry)
                return auditReturn(__audit4, { hit: false as const });
            stats.projectionHits++; auditEvent(__audit4, "projection-completed-result-reuse");
            entry.users.add(consumer);
            heldProjections.set(key, entry);
            return auditReturn(__audit4, { hit: true as const, value: entry.value as T });

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}
        async function project<T>(key: string, work: AnalyticsWork, signal: AbortSignal, validate: () => Promise<void> = async () => { }): Promise<T> {
    const __audit5 = auditPhaseBegin("project", undefined, "async-container");
    try {
            live();
            checkProfileWork(signal);
            let entry = projections.get(key);
            if (entry?.value !== undefined) {
                try {
                    await (auditValue(__audit5, auditEnter(__audit5, "entry.validate"), (entry.validate())));
                }
                catch {
                    if (projections.get(key) === entry)
                        projections.delete(key);
                    entry = undefined;
                }
                if (entry)
                    stats.projectionHits++; auditEvent(__audit5, "projection-completed-result-reuse");
            }
            if (!entry) {
                stats.projectionJobs++;
                const job = queue.acquire(key, consumer, priority, async (s) => { const value = await physical<T>(key, work, s); await validate(); checkProfileWork(s); return value; }, __audit5);
                entry = { users: new Set(), job, validate };
                projections.set(key, entry);
                heldJobs.set(key, job);
                const own = entry;
                void job.promise.then(value => { if (projections.get(key) === own && own.users.size)
                    own.value = protectProfileBasis(value); }, () => { if (projections.get(key) === own)
                    projections.delete(key); });
            }
            else if (entry.value === undefined) {
                stats.projectionJoins++; auditEvent(__audit5, "projection-in-flight-join");
                heldJobs.set(key, queue.acquire(key, consumer, priority, async () => { throw Error("Unexpected projection duplicate"); }));
            }
            entry.users.add(consumer);
            heldProjections.set(key, entry);
            const value = entry.value ?? await (auditValue(__audit5, auditEnter(__audit5, "abortable"), (abortable(entry.job.promise, signal))));
            live();
            checkProfileWork(signal);
            await (auditValue(__audit5, auditEnter(__audit5, "validate"), (validate())));
            live();
            checkProfileWork(signal);
            return auditReturn(__audit5, value as T);

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}
        function release() {
            if (released)
                return;
            released = true;
            stats.scopes--;
            for (const [key, entry] of held) {
                entry.users.delete(consumer);
                if (!entry.users.size && sources.get(key) === entry)
                    sources.delete(key);
            }
            held.clear();
            for (const [key, entry] of heldProjections) {
                entry.users.delete(consumer);
                if (!entry.users.size && projections.get(key) === entry)
                    projections.delete(key);
            }
            heldProjections.clear();
            for (const job of heldJobs.values())
                job.release();
            heldJobs.clear();
            if (!stats.scopes)
                transport.dispose();
        }
        function forgetProjection(key: string) { const entry = heldProjections.get(key); if (!entry)
            return; entry.users.delete(consumer); heldProjections.delete(key); heldJobs.get(key)?.release(); heldJobs.delete(key); if (!entry.users.size && projections.get(key) === entry)
            projections.delete(key); }
        return { runProfile: <T>(key: string, work: ProfileWork, signal: AbortSignal) => { live(); return physical<T>(key, work, signal); }, ensure, finished, forgetProjection, readExisting: (summaries: GuildHubScanSummary[], signal: AbortSignal) => ensure(summaries, signal, undefined, true), indexes, project, release };
    }
    return { acquire, inspect: () => ({ ...stats, jsonByteMeasurement: { meaning: "logical-json-utf8", inputSamples: jsonByteSamples.input, resultSamples: jsonByteSamples.result, coverage: stats.dispatches === 0 || jsonByteSamples.input === 0 && jsonByteSamples.result === 0 ? "not-recorded" : jsonByteSamples.input === stats.dispatches && jsonByteSamples.result === stats.dispatches ? "complete" : "partial" }, ...renewalStats, pendingSourceRenewals: pendingSourceRenewals.size, sources: sources.size, projections: projections.size, queue: queue.inspect(), transport: transport.inspect() }) };
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted)
        return Promise.reject(profileAbortError());
    return new Promise((resolve, reject) => { const abort = () => { signal.removeEventListener("abort", abort); reject(profileAbortError()); }; signal.addEventListener("abort", abort, { once: true }); promise.then(value => { signal.removeEventListener("abort", abort); if (signal.aborted)
        reject(profileAbortError());
    else
        resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); }); });
}
export const sharedAnalyticsPreparation = createSharedAnalyticsPreparation();
export type AnalyticsPreparationLease = ReturnType<typeof sharedAnalyticsPreparation.acquire>;

function validateWorkResult(work:AnalyticsWork,value:unknown) {
 const record=value as Record<string,any>|null;
 if(!record || typeof record!=="object")throw Error("Invalid analytics worker result");
 if(work.kind.startsWith("profile-")) return;
 if(work.kind==="source"){
  const data=record.data;
  if(!data || ![data.snapshots,data.members,data.guilds].every(Array.isArray) || ![record.rawReads,record.builds,record.elapsedMs].every(Number.isFinite) || [...data.snapshots,...data.members,...data.guilds].some(row=>row.sourceScanId!==work.summary.sourceScanId))throw Error("Invalid analytics source result");
 }else if(work.kind==="card-source"){
  if(typeof record.loaded!=="boolean" || !Array.isArray(record.entries) || record.entries.some((row:any)=>typeof row.key!=="string" || row.sourceScanId!==work.summary.sourceScanId || !row.developmentSource))throw Error("Invalid card source result");
 }else if(work.kind==="cards"){
  if(!record.index || !Array.isArray(record.index.players) || !record.index.stats || !Array.isArray(record.timings))throw Error("Invalid cards result");
 }else if(!Array.isArray(record.snapshots) || !record.periods || typeof record.status!=="string")throw Error("Invalid trend result");
}
