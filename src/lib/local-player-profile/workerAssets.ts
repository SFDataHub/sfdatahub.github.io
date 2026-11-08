import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditCurrent, auditLink, auditPromiseId, auditEvent } from "../data-hub/runtimeAudit";
const ASSET_UPDATE_BUDGET_MS = 10000;
let pending: Promise<void> | undefined;
let preparedController: ServiceWorker | null | undefined;
const stats = { updates: 0, joins: 0, failures: 0 };

function waitFor(test: () => boolean, target: EventTarget, event: string, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => { target.removeEventListener(event, check); signal.removeEventListener("abort", abort); };
        const check = () => { if (test()) { cleanup(); resolve(); } };
        const abort = () => { cleanup(); reject(signal.reason); };
        target.addEventListener(event, check);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort(); else check();
    });
}
function callerWait<T>(job: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return job;
    return new Promise<T>((resolve, reject) => {
        const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        job.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}

/** Update the existing controller; never register another scope, clear data, or
 * reload a page. Concurrent consumers share the update, not their cancellation. */
export function prepareAnalyticsWorkerAssets(renew = false, signal?: AbortSignal): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return Promise.resolve();
    const sw = navigator.serviceWorker;
    if (pending) { stats.joins++; auditLink(auditCurrent(), auditPromiseId(pending), "in-flight-join"); auditEvent(auditCurrent(), "worker-assets-join"); return callerWait(pending, signal); }
    if (!renew && preparedController !== undefined && preparedController === sw.controller) { auditEvent(auditCurrent(), "worker-assets-completed-reuse"); return Promise.resolve(); }
    const controller = new AbortController();
    let phase = "registration lookup";
    let observedRegistration: ServiceWorkerRegistration | undefined;
    const details = () => JSON.stringify({ phase, controller: sw.controller?.scriptURL ?? null, scope: observedRegistration?.scope,
        installing: observedRegistration?.installing?.state, waiting: observedRegistration?.waiting?.state,
        active: observedRegistration?.active?.state, activeScript: observedRegistration?.active?.scriptURL });
    const timer = setTimeout(() => controller.abort(new Error(`Analytics worker asset update budget exceeded ${details()}`)), ASSET_UPDATE_BUDGET_MS);
    const job = (async () => {
    const __audit1 = auditBegin("S09", "@callback");
    try {
        let registration = await (auditValue(__audit1, auditEnter(__audit1, "callerWait"), (callerWait(sw.getRegistration(), controller.signal))));
        observedRegistration = registration;
        if (!registration) {
            if (sw.controller) throw Error("Analytics worker controller has no updatable registration");
            preparedController = null;
            return auditReturn(__audit1, undefined);
        }
        stats.updates++;
        // Legacy PWA registrations used /sw.js. That removed endpoint now
        // returns the SPA HTML, so update() cannot replace its old controller.
        // Replace only that known root registration, in the SAME scope, with
        // the existing canonical script. No unregister or cache/data clear.
        const root = new URL("/", location.href).href;
        const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL;
        if (registration.scope === root && script === new URL("/sw.js", root).href) {
            phase = "canonical registration";
            registration = await (auditValue(__audit1, auditEnter(__audit1, "callerWait"), (callerWait(sw.register("/service-worker.js", { scope: "/", updateViaCache: "none" }), controller.signal))));
            observedRegistration = registration;
        } else {
            phase = "script update";
            await (auditValue(__audit1, auditEnter(__audit1, "callerWait"), (callerWait(registration.update().then(() => {}), controller.signal))));
        }
        const next = registration.installing ?? registration.waiting ?? registration.active;
        if (next) {
            phase = "activation";
            await (auditValue(__audit1, auditEnter(__audit1, "waitFor"), (waitFor(() => next.state === "activated" || next.state === "redundant", next, "statechange", controller.signal))));
            if (next.state === "redundant") throw Error("Analytics worker asset controller update failed");
            phase = "controller takeover";
            // An uncontrolled document already fetches its modules from the
            // network. Its matching registration is now activated as well;
            // there is no stale document controller to replace. Only a document
            // still controlled by the old instance needs to await takeover.
            await (auditValue(__audit1, auditEnter(__audit1, "waitFor"), (waitFor(() => sw.controller === null || sw.controller === registration.active, sw, "controllerchange", controller.signal))));
        }
        preparedController = sw.controller;

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
})().catch(error => {
        stats.failures++;
        preparedController = undefined;
        throw new Error(`Analytics worker assets unavailable: ${String(error)}`);
    }).finally(() => {
        clearTimeout(timer);
        if (pending === job) pending = undefined;
    });
    pending = job;
    return callerWait(job, signal);
}
export const inspectAnalyticsWorkerAssets = () => ({ ...stats, pending: Boolean(pending) });
