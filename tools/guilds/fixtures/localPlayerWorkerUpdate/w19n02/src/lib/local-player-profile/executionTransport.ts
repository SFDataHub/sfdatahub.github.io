import type { ExecutionWorkMetrics } from "./executionWork";
import { profileAbortError } from "./contract";
// v2 adds readiness and dispatch-start messages, and explicit incompatibility.
export const ANALYTICS_TRANSPORT_VERSION = 2;
// A liveness budget, not a CPU/clone claim. Each dispatch is one source or one
// requested projection. Cold 325-row fixture takes ~1.1s across six sources;
// allow 30s per dispatch for storage contention, then terminal error + explicit retry.
export const ANALYTICS_RESPONSE_BUDGET_MS = 30000;
export type ExecutionEnvelope = {
    version: number;
    requestId: string;
    generation: number;
    key: string;
    payload: unknown;
};
export type ExecutionReply = Omit<ExecutionEnvelope, "payload"> & {
    type?: "started";
    value?: unknown;
    error?: string;
    metrics?: ExecutionWorkMetrics;
};
export type AnalyticsWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
export function createAnalyticsTransport(factory: () => AnalyticsWorker, budgetMs = ANALYTICS_RESPONSE_BUDGET_MS, onMetrics: (metrics: ExecutionWorkMetrics) => void = () => { }) {
    let worker: AnalyticsWorker | undefined, generation = 0, sequence = 0;
    let ready = false;
    let lastDispatch: { requestId: string; key: string; startedAt: number; sentAt?: number; workerStartedAt?: number; settledAt?: number; phase: string; error?: string } | undefined;
    const timings = { starts: 0, startCallMs: 0, sendCallMs: 0, responseElapsedMs: 0, releases: 0, cleanupMs: 0 };
    const pending = new Map<string, {
        envelope: ExecutionEnvelope;
        resolve: (value: unknown) => void;
        reject: (error: unknown) => void;
        cleanup: () => void;
        sentAt: number;
    }>();
    function stop(error: unknown) {
        const at = performance.now();
        if (pending.size && lastDispatch) {
            lastDispatch.settledAt = at;
            lastDispatch.error = String(error);
        }
        if (worker)
            timings.releases++;
        const old = worker;
        worker = undefined;
        ready = false;
        generation++;
        old?.removeEventListener("message", message);
        old?.removeEventListener("error", failure);
        old?.removeEventListener("messageerror", unreadable);
        old?.terminate();
        for (const entry of pending.values()) {
            entry.cleanup();
            entry.reject(error);
        }
        pending.clear();
        timings.cleanupMs += performance.now() - at;
    }
    const failure = (event: Event) => stop(new Error((event as ErrorEvent).message || "Analytics worker failed"));
    const unreadable = () => stop(new Error("Analytics worker messageerror"));
    function message(event: Event) {
        const reply = (event as MessageEvent<ExecutionReply>).data;
        if ((reply as unknown as { type?: string })?.type === "ready") {
            if (reply.version !== ANALYTICS_TRANSPORT_VERSION) {
                stop(new Error(`Analytics worker contract mismatch: expected ${ANALYTICS_TRANSPORT_VERSION}, actual ${reply.version}`));
                return;
            }
            ready = true;
            if (lastDispatch?.phase === "awaiting-ready")
                lastDispatch.phase = "awaiting-start";
            return;
        }
        if (!reply || typeof reply.requestId !== "string") {
            stop(new Error("Invalid analytics worker response"));
            return;
        }
        const entry = pending.get(reply.requestId);
        if (!entry)
            return; // duplicate / old generation
        const expected = entry.envelope;
        if (reply.version !== expected.version || reply.generation !== expected.generation || reply.key !== expected.key || !(reply.type === "started" || "value" in reply || typeof reply.error === "string")) {
            stop(new Error(`Analytics worker response binding mismatch: expected contract ${expected.version}, actual ${reply.version}`));
            return;
        }
        if (reply.type === "started") {
            if (lastDispatch?.requestId === reply.requestId) {
                lastDispatch.workerStartedAt = performance.now();
                lastDispatch.phase = "executing";
            }
            return;
        }
        if (lastDispatch?.requestId === reply.requestId) {
            lastDispatch.settledAt = performance.now();
            lastDispatch.phase = reply.error ? "error" : "completed";
            lastDispatch.error = reply.error;
        }
        timings.responseElapsedMs += performance.now() - entry.sentAt;
        try {
            if (reply.metrics)
                onMetrics(reply.metrics);
        }
        catch {
            stop(new Error("Invalid analytics worker metrics"));
            return;
        }
        pending.delete(reply.requestId);
        entry.cleanup();
        if (reply.error)
            entry.reject(new Error(reply.error));
        else
            entry.resolve(reply.value);
    }
    function run<T>(key: string, payload: unknown, signal: AbortSignal): Promise<T> {
        if (signal.aborted)
            return Promise.reject(profileAbortError());
        try {
            if (!worker) {
                const at = performance.now();
                worker = factory();
                timings.starts++;
                timings.startCallMs += performance.now() - at;
                worker.addEventListener("message", message);
                worker.addEventListener("error", failure);
                worker.addEventListener("messageerror", unreadable);
            }
        }
        catch (error) {
            stop(error);
            return Promise.reject(error);
        }
        const envelope: ExecutionEnvelope = { version: ANALYTICS_TRANSPORT_VERSION, requestId: `analytics-${generation}-${++sequence}`, generation, key, payload };
        lastDispatch = { requestId: envelope.requestId, key, startedAt: performance.now(), phase: ready ? "sending" : "awaiting-ready" };
        return new Promise<T>((resolve, reject) => {
            const abort = () => stop(profileAbortError()); // single serial physical dispatch
            const timer = setTimeout(() => {
                const phase = lastDispatch?.phase;
                stop(new Error(`Analytics worker response budget exceeded (${phase}; request ${envelope.requestId})`));
            }, budgetMs);
            const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
            pending.set(envelope.requestId, { envelope, sentAt: performance.now(), resolve: value => resolve(value as T), reject, cleanup });
            signal.addEventListener("abort", abort, { once: true });
            try {
                const at = performance.now();
                worker!.postMessage(envelope);
                if (lastDispatch?.requestId === envelope.requestId)
                    lastDispatch.sentAt = performance.now();
                timings.sendCallMs += performance.now() - at;
            }
            catch (error) {
                stop(error);
            }
        });
    }
    return { run, dispose: () => stop(profileAbortError()), inspect: () => ({ ...timings, workers: worker ? 1 : 0, awaits: pending.size, generation, ready, lastDispatch: lastDispatch ? { ...lastDispatch } : undefined }) };
}
