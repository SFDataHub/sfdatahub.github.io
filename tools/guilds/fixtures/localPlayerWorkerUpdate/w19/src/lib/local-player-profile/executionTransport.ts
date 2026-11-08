import type { ExecutionWorkMetrics } from "./executionWork";
import { profileAbortError } from "./contract";
export const ANALYTICS_TRANSPORT_VERSION = 1;
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
    value?: unknown;
    error?: string;
    metrics?: ExecutionWorkMetrics;
};
export type AnalyticsWorker = Pick<Worker, "postMessage" | "terminate" | "addEventListener" | "removeEventListener">;
export function createAnalyticsTransport(factory: () => AnalyticsWorker, budgetMs = ANALYTICS_RESPONSE_BUDGET_MS, onMetrics: (metrics: ExecutionWorkMetrics) => void = () => { }) {
    let worker: AnalyticsWorker | undefined, generation = 0, sequence = 0;
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
        if (worker)
            timings.releases++;
        const old = worker;
        worker = undefined;
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
        if (!reply || typeof reply.requestId !== "string") {
            stop(new Error("Invalid analytics worker response"));
            return;
        }
        const entry = pending.get(reply.requestId);
        if (!entry)
            return; // duplicate / old generation
        const expected = entry.envelope;
        if (reply.version !== expected.version || reply.generation !== expected.generation || reply.key !== expected.key || !("value" in reply || typeof reply.error === "string")) {
            stop(new Error("Analytics worker response binding mismatch"));
            return;
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
        return new Promise<T>((resolve, reject) => {
            const abort = () => stop(profileAbortError()); // single serial physical dispatch
            const timer = setTimeout(() => stop(new Error("Analytics worker response budget exceeded")), budgetMs);
            const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
            pending.set(envelope.requestId, { envelope, sentAt: performance.now(), resolve: value => resolve(value as T), reject, cleanup });
            signal.addEventListener("abort", abort, { once: true });
            try {
                const at = performance.now();
                worker!.postMessage(envelope);
                timings.sendCallMs += performance.now() - at;
            }
            catch (error) {
                stop(error);
            }
        });
    }
    return { run, dispose: () => stop(profileAbortError()), inspect: () => ({ ...timings, workers: worker ? 1 : 0, awaits: pending.size, generation }) };
}
