import { auditSpan, auditSpanEnd, auditEvent, auditCall, auditLink, auditPromiseId, auditBegin, auditBindPromise, auditFinish, auditError, auditFields, type AuditRun } from "../data-hub/runtimeAudit";
import { profileAbortError } from "./contract";
export type AnalyticsPriority = "profile" | "visible";
type Job<T> = {
    key: string;
    order: number;
    users: Map<symbol, AnalyticsPriority>;
    controller: AbortController;
    work: (signal: AbortSignal) => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    promise: Promise<T>;
    started: boolean;
    enqueuedAt: number;
    audit?: AuditRun | null;
    queueSpan?: ReturnType<typeof auditSpan>;
};
/** One physical operation, with starvation protection after two foreground dispatches.
 * Synchronous work is never preempted. Source jobs are the cooperative boundary. */
export function createAnalyticsExecutionQueue() {
    const jobs = new Map<string, Job<unknown>>();
    let order = 0, running: Job<unknown> | undefined, foreground = 0, scheduled = false;
    const timings = { dispatches: 0, queueWaitMs: 0, dispatchElapsedMs: 0 };
    const priority = (job: Job<unknown>) => [...job.users.values()].includes("profile");
    function pump() {
        scheduled = false;
        if (running)
            return;
        const waiting = [...jobs.values()].filter(job => !job.started && job.users.size);
        const background = waiting.filter(job => !priority(job)).sort((a, b) => a.order - b.order);
        const job = foreground >= 2 && background.length ? background[0] : waiting.sort((a, b) => Number(priority(b)) - Number(priority(a)) || a.order - b.order)[0];
        if (!job)
            return;
        auditSpanEnd(job.audit ?? null, job.queueSpan ?? null);
        auditEvent(job.audit ?? null, "queue-selected");
        running = job;
        job.started = true;
        const startedAt = performance.now();
        timings.dispatches++;
        timings.queueWaitMs += startedAt - job.enqueuedAt;
        foreground = priority(job) ? foreground + 1 : 0;
        Promise.resolve().then(() => { if (job.controller.signal.aborted)
            throw profileAbortError(); const dispatched = job.audit ? auditCall(job.audit, "queued-physical-dispatch", () => job.work(job.controller.signal), "async-container") : job.work(job.controller.signal);
            return dispatched; }).then(value => { auditFinish(job.audit ?? null); job.resolve(value); }, error => { auditError(job.audit ?? null, error); auditFinish(job.audit ?? null); job.reject(error); }).finally(() => {
            timings.dispatchElapsedMs += performance.now() - startedAt;
            job.work = async () => { throw new Error("Completed analytics job cannot restart"); };
            if (jobs.get(job.key) === job)
                jobs.delete(job.key);
            if (running === job)
                running = undefined;
            schedule();
        });
    }
    function schedule() { if (!scheduled) {
        scheduled = true;
        queueMicrotask(pump);
    } }
    function acquire<T>(key: string, consumer: symbol, consumerPriority: AnalyticsPriority, work: (signal: AbortSignal) => Promise<T>, audit?: AuditRun | null) {
        let job = jobs.get(key) as Job<T> | undefined;
        const joined = Boolean(job);
        if (!job) {
            let resolve!: (value: T) => void, reject!: (error: unknown) => void;
            const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
            // Identity is available before deferred dispatch, so early consumers
            // refer to the same physical job even if its first consumer leaves.
            const preparation = audit ? auditBegin("phase", "shared-queue-job", audit) : null;
            auditFields(preparation, { trigger: "analytics-queue-acquire", physicalJob: true });
            auditBindPromise(preparation, promise);
            job = { audit: preparation, queueSpan: auditSpan(preparation, "queue-wait", "queue-wait"), key, order: ++order, users: new Map(), controller: new AbortController(), work, resolve, reject, promise, started: false, enqueuedAt: performance.now() };
            jobs.set(key, job as Job<unknown>);
        }
        if (joined) { auditLink(audit ?? null, auditPromiseId(job.promise), "in-flight-join"); auditEvent(audit ?? null, "queue-existing-job-join"); }
        job.users.set(consumer, consumerPriority);
        schedule();
        let released = false;
        return { promise: job.promise, joined, release() {
                if (released)
                    return;
                released = true;
                auditEvent(audit ?? null, "queue-consumer-release");
                job!.users.delete(consumer);
                if (!job!.users.size) {
                    if (!job!.started) auditFinish(job!.audit ?? null, "aborted", { reason: "no-consumers-before-dispatch" });
                    job!.controller.abort();
                    job!.reject(profileAbortError());
                    if (jobs.get(key) === job)
                        jobs.delete(key);
                }
                schedule();
            }, setPriority(value: AnalyticsPriority) { if (!released)
                job!.users.set(consumer, value); }, };
    }
    return { acquire, inspect: () => ({ ...timings, running: running ? running.key : null, waiting: [...jobs.values()].filter(j => !j.started).map(j => ({ key: j.key, priority: priority(j) ? "profile" : "visible", users: j.users.size })), jobs: jobs.size }) };
}
