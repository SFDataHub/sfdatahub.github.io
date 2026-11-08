import { auditCurrent, auditSpan, auditSpanEnd, auditEvent, auditFields, auditError, auditWorkerEnvelope, auditMergeWorker, type AuditRun, type AuditEnvelope, type AuditReport, auditId } from "../data-hub/runtimeAudit";
import type { ExecutionWorkMetrics } from "./executionWork";
import { profileAbortError } from "./contract";
export const ANALYTICS_TRANSPORT_VERSION = 26;
export const ANALYTICS_RESPONSE_BUDGET_MS = 30000;
export type ExecutionEnvelope = { version: number; requestId: string; generation: number; key: string; payload: unknown; audit?: AuditEnvelope };
export const ANALYTICS_WORKER_PHASES = ["source-code-verified", "analytics-write-lock-acquired", "analytics-transaction-started", "analytics-existing-rows-deleted", "analytics-member-writes-started", "analytics-first-member-batch-complete", "analytics-half-member-batches-complete", "analytics-member-requests-issued", "analytics-member-requests-complete", "analytics-transaction-committed", "source-db-and-cache", "raw-source-read", "raw-source-loaded", "checking-analytics-cache", "rebuilding-analytics-data", "normalizing-historical-data", "saving-derived-analytics", "loading-derived-analytics", "source-derived-committed", "projection"] as const;
export type AnalyticsWorkerPhase = typeof ANALYTICS_WORKER_PHASES[number];
export type AnalyticsExecutionCodeProof = { moduleUrl: string; store: string; snapshots: string; values: string };
export type ExecutionReply = Omit<ExecutionEnvelope, "payload"> & { type?: "started" | "progress"; phase?: AnalyticsWorkerPhase; codeProof?: AnalyticsExecutionCodeProof; workerElapsedMs?: number; value?: unknown; error?: string; metrics?: ExecutionWorkMetrics; auditReport?: AuditReport };
export type AnalyticsWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
export type AnalyticsWorkerFactory = (renew: boolean, signal: AbortSignal) => AnalyticsWorker | Promise<AnalyticsWorker>;

export function createAnalyticsTransport(factory: AnalyticsWorkerFactory, budgetMs = ANALYTICS_RESPONSE_BUDGET_MS, onMetrics: (metrics: ExecutionWorkMetrics) => void = () => {}) {
    let worker: AnalyticsWorker | undefined, generation = 0, sequence = 0, starting = false, ready = false, renewalUsed = false;
    let instanceController: AbortController | undefined, detach: (() => void) | undefined;
    let lastDispatch: { requestId: string; key: string; startedAt: number; workerCreatedAt?: number; readyAt?: number; sentAt?: number; workerStartedAt?: number; settledAt?: number; phase: string; error?: string } | undefined;
    const timings = { starts: 0, renewals: 0, startCallMs: 0, assetPrepareMs: 0, sendCallMs: 0, responseElapsedMs: 0, releases: 0, cleanupMs: 0 };
    type Pending = { envelope: ExecutionEnvelope; resolve: (value: unknown) => void; reject: (error: unknown) => void; cleanup: () => void; sentAt?: number; lastProgress?: { phase: AnalyticsWorkerPhase; workerElapsedMs: number }; audit?: AuditRun | null; roundtrip?: ReturnType<typeof auditSpan> };
    const pending = new Map<string, Pending>();
    let auditInstance: string | undefined;

    function retire() {
        const old = worker;
        worker = undefined; auditInstance = undefined; ready = false; starting = false; generation++;
        instanceController?.abort(); instanceController = undefined;
        detach?.(); detach = undefined;
        if (old) { timings.releases++; old.terminate(); }
    }
    function stop(error: unknown) {
        const at = performance.now();
        if (pending.size && lastDispatch) { lastDispatch.settledAt = at; lastDispatch.error = String(error); }
        retire();
        for (const entry of pending.values()) { auditError(entry.audit ?? null, error); auditSpanEnd(entry.audit ?? null, entry.roundtrip ?? null); entry.cleanup(); entry.reject(error); }
        pending.clear(); timings.cleanupMs += performance.now() - at;
    }
    function send(entry: Pending) {
        if (!worker || !ready || entry.sentAt !== undefined) return;
        try {
            const at = performance.now(); entry.sentAt = at;
            if (lastDispatch?.requestId === entry.envelope.requestId) lastDispatch.phase = "awaiting-start";
            const sendAudit = auditSpan(entry.audit ?? null, "postMessage-call", "sync-elapsed");
            try { worker.postMessage(entry.envelope); } finally { auditSpanEnd(entry.audit ?? null, sendAudit); }
            if (lastDispatch?.requestId === entry.envelope.requestId) lastDispatch.sentAt = performance.now();
            timings.sendCallMs += performance.now() - at;
        } catch (error) { stop(error); }
    }
    function mismatch(actual: unknown) {
        const error = new Error(`Analytics worker contract mismatch: expected ${ANALYTICS_TRANSPORT_VERSION}, actual ${actual}`);
        // Only renew before any payload is sent. No replay of executed work and
        // no recertification of results. Keep the original request budget.
        if (ready || renewalUsed || [...pending.values()].some(entry => entry.sentAt !== undefined)) { stop(error); return; }
        renewalUsed = true; timings.renewals++; retire();
        const entries = [...pending.values()]; pending.clear();
        for (const entry of entries) {
            const oldId = entry.envelope.requestId;
            entry.envelope = { ...entry.envelope, requestId: `analytics-${generation}-${++sequence}`, generation };
            pending.set(entry.envelope.requestId, entry);
            if (lastDispatch?.requestId === oldId) { lastDispatch.requestId = entry.envelope.requestId; lastDispatch.phase = "renewing-assets"; }
        }
        start(true);
    }
    function start(renew: boolean) {
        const own = generation, control = new AbortController(), at = performance.now();
        instanceController = control; starting = true;
        const adopt = (candidate: AnalyticsWorker) => {
            if (own !== generation || control.signal.aborted || !pending.size) { candidate.terminate(); return; }
            worker = candidate; starting = false; timings.starts++;
            timings.assetPrepareMs += performance.now() - at;
            if (lastDispatch) { lastDispatch.phase = "awaiting-ready"; lastDispatch.workerCreatedAt = performance.now(); }
            const current = () => worker === candidate && own === generation;
            const failure = (event: Event) => { if (current()) stop(new Error((event as ErrorEvent).message || "Analytics worker failed")); };
            const unreadable = () => { if (current()) stop(new Error("Analytics worker messageerror")); };
            const message = (event: Event) => {
                if (!current()) return;
                const reply = (event as MessageEvent<ExecutionReply>).data;
                if ((reply as unknown as { type?: string })?.type === "ready") {
                    if (reply.version !== ANALYTICS_TRANSPORT_VERSION) { mismatch(reply.version); return; }
                    ready = true;
                    for (const entry of pending.values()) if (entry.audit) auditEvent(entry.audit, "worker-ready-observed", { generation });
                    if (lastDispatch) lastDispatch.readyAt = performance.now();
                    for (const entry of pending.values()) send(entry);
                    return;
                }
                if (!reply || typeof reply.requestId !== "string") { stop(new Error("Invalid analytics worker response")); return; }
                const entry = pending.get(reply.requestId);
                if (!entry) return;
                const expected = entry.envelope;
                if (!ready || entry.sentAt === undefined || reply.version !== expected.version || reply.generation !== expected.generation || reply.key !== expected.key || !(reply.type === "started" || reply.type === "progress" || "value" in reply || typeof reply.error === "string")) {
                    stop(new Error(`Analytics worker response binding mismatch: expected contract ${expected.version}, actual ${reply.version}`)); return;
                }
                if (reply.type === "progress") {
                    if (!ANALYTICS_WORKER_PHASES.includes(reply.phase!) || !Number.isFinite(reply.workerElapsedMs) || reply.workerElapsedMs! < 0) { stop(new Error("Invalid analytics worker progress")); return; }
                    if (reply.codeProof !== undefined) {
                        const proof = reply.codeProof;
                        if (!proof || typeof proof !== "object" || typeof proof.moduleUrl !== "string" || proof.moduleUrl.length > 500 || [proof.store, proof.snapshots, proof.values].some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) { stop(new Error("Invalid analytics worker code proof")); return; }
                        auditFields(entry.audit ?? null, { workerModuleUrl: proof.moduleUrl, workerStoreCodeHash: proof.store, workerSnapshotCodeHash: proof.snapshots, workerValueCodeHash: proof.values });
                    }
                    entry.lastProgress = { phase: reply.phase!, workerElapsedMs: reply.workerElapsedMs! };
                    auditEvent(entry.audit ?? null, "worker-progress-receipt", { phase: reply.phase!, workerElapsedMs: reply.workerElapsedMs! });
                    return;
                }
                if (reply.type === "started") {
                    auditEvent(entry.audit ?? null, "worker-started-receipt");
                    if (lastDispatch?.requestId === reply.requestId) { lastDispatch.workerStartedAt = performance.now(); lastDispatch.phase = "executing"; }
                    return;
                }
                if (lastDispatch?.requestId === reply.requestId) { lastDispatch.settledAt = performance.now(); lastDispatch.phase = reply.error ? "error" : "completed"; lastDispatch.error = reply.error; }
                timings.responseElapsedMs += performance.now() - entry.sentAt;
                try { if (reply.metrics) onMetrics(reply.metrics); } catch { stop(new Error("Invalid analytics worker metrics")); return; }
                auditMergeWorker(entry.audit ?? null, reply.auditReport);
                auditSpanEnd(entry.audit ?? null, entry.roundtrip ?? null);
                auditEvent(entry.audit ?? null, "worker-response-receipt");
                pending.delete(reply.requestId); entry.cleanup();
                if (reply.error) entry.reject(new Error(reply.error)); else entry.resolve(reply.value);
            };
            detach = () => { candidate.removeEventListener("message", message); candidate.removeEventListener("error", failure); candidate.removeEventListener("messageerror", unreadable); };
            candidate.addEventListener("error", failure); candidate.addEventListener("messageerror", unreadable); candidate.addEventListener("message", message);
        };
        try {
            const candidate = factory(renew, control.signal);
            timings.startCallMs += performance.now() - at;
            if ("then" in candidate) void candidate.then(adopt, error => { if (own === generation) stop(error); });
            else adopt(candidate);
        } catch (error) { if (own === generation) stop(error); }
    }
    function run<T>(key: string, payload: unknown, signal: AbortSignal): Promise<T> {
        if (signal.aborted) return Promise.reject(profileAbortError());
        const audit = auditCurrent();
        const envelope: ExecutionEnvelope = { version: ANALYTICS_TRANSPORT_VERSION, requestId: `analytics-${generation}-${++sequence}`, generation, key, payload };
        if (audit) { auditInstance ??= auditId("analytics-worker"); envelope.audit = auditWorkerEnvelope(audit, auditInstance!, envelope.requestId); }
        lastDispatch = { requestId: envelope.requestId, key, startedAt: performance.now(), phase: ready ? "sending" : "preparing-assets" };
        return new Promise<T>((resolve, reject) => {
            const abort = () => {
                const error = profileAbortError();
                auditError(entry.audit ?? null, error); auditSpanEnd(entry.audit ?? null, entry.roundtrip ?? null);
                pending.delete(entry.envelope.requestId); entry.cleanup(); entry.reject(error);
                // Cancel this consumer only. Other profile areas may already be
                // running against the same worker and source preparation.
                if (worker && ready && entry.sentAt !== undefined) worker.postMessage({ type: "cancel", requestId: entry.envelope.requestId });
                if (!pending.size) retire();
            };
            const timer = setTimeout(() => {
                const phase = lastDispatch?.phase;
                if (entry.lastProgress) auditFields(entry.audit ?? null, { lastWorkerPhase: entry.lastProgress.phase, lastWorkerElapsedMs: entry.lastProgress.workerElapsedMs });
                const error = new Error(`Analytics worker response budget exceeded (${phase}; request ${entry.envelope.requestId}${entry.lastProgress ? `; last worker phase ${entry.lastProgress.phase} at ${entry.lastProgress.workerElapsedMs.toFixed(1)} ms` : ""})`);
                auditError(entry.audit ?? null, error); auditSpanEnd(entry.audit ?? null, entry.roundtrip ?? null);
                pending.delete(entry.envelope.requestId); entry.cleanup(); entry.reject(error);
                if (worker && ready && entry.sentAt !== undefined) worker.postMessage({ type: "cancel", requestId: entry.envelope.requestId });
                if (!pending.size) retire();
            }, budgetMs);
            const entry: Pending = { audit, roundtrip: auditSpan(audit, "worker-request-roundtrip"), envelope, resolve: value => resolve(value as T), reject, cleanup: () => { clearTimeout(timer); signal.removeEventListener("abort", abort); } };
            pending.set(envelope.requestId, entry); signal.addEventListener("abort", abort, { once: true });
            if (worker && ready) send(entry);
            else if (!worker && !starting) { renewalUsed = false; start(false); }
        });
    }
    return { run, dispose: () => stop(profileAbortError()), inspect: () => ({ ...timings, workers: worker ? 1 : 0, awaits: pending.size, generation, ready, lastDispatch: lastDispatch ? { ...lastDispatch } : undefined }) };
}
