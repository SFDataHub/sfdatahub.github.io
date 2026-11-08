import { guildAnalyticsExecutionCode } from "../lib/guilds/localGuildAnalyticsStore";
import { auditAcceptWorker, auditAwait, auditError, auditWorkerResult, auditEvent } from "../lib/data-hub/runtimeAudit";
import { executeAnalyticsWork, type AnalyticsWork, type ExecutionWorkMetrics } from "../lib/local-player-profile/executionWork";
import { ANALYTICS_TRANSPORT_VERSION, type ExecutionEnvelope, type ExecutionReply } from "../lib/local-player-profile/executionTransport";
const controllers = new Map<string, AbortController>();
let sourceCodeProof: Promise<import("../lib/local-player-profile/executionTransport").AnalyticsExecutionCodeProof> | undefined;
function readSourceCodeProof() {
    return sourceCodeProof ??= (async () => {
        const code = guildAnalyticsExecutionCode();
        const digest = async (source: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)))].map(value => value.toString(16).padStart(2, "0")).join("");
        const [store, snapshots, values] = await Promise.all([digest(code.store), digest(code.snapshots), digest(code.values)]);
        return { moduleUrl: code.moduleUrl, store, snapshots, values };
    })();
}
// Main owns the active preparation registry and serial queue. This worker owns
// only its current source read / projection; no second coordinator or Rawpool.
globalThis.postMessage({ type: "ready", version: ANALYTICS_TRANSPORT_VERSION });
globalThis.addEventListener("message", async (event: MessageEvent<ExecutionEnvelope>) => {
    const request = event.data;
    if (!request || typeof request.requestId !== "string")
        return;
    if ((request as unknown as { type?: string }).type === "cancel") { controllers.get(request.requestId)?.abort(); return; }
    const controller = new AbortController();
    controllers.set(request.requestId, controller);
    const audit = auditAcceptWorker(request.audit);
    auditEvent(audit, "worker-receive");
    const binding = { version: ANALYTICS_TRANSPORT_VERSION, requestId: request.requestId, generation: request.generation, key: request.key };
    if (request.version !== ANALYTICS_TRANSPORT_VERSION) {
        globalThis.postMessage({ ...binding, error: `Analytics worker contract mismatch: expected ${ANALYTICS_TRANSPORT_VERSION}, actual ${request.version}`, ...(audit ? { auditReport: auditWorkerResult(audit, "failed") } : undefined) } satisfies ExecutionReply);
        return;
    }
    globalThis.postMessage({ ...binding, type: "started" } satisfies ExecutionReply);
    const checkpointStart = performance.now();
    let checkpointCount = 0, previousCheckpoint: string | undefined;
    const checkpoint = (phase: import("../lib/local-player-profile/executionTransport").AnalyticsWorkerPhase, codeProof?: import("../lib/local-player-profile/executionTransport").AnalyticsExecutionCodeProof) => { if(!audit || phase === previousCheckpoint || checkpointCount >= 16) return; previousCheckpoint = phase; checkpointCount++; globalThis.postMessage({ ...binding, type: "progress", phase, ...(codeProof ? { codeProof } : {}), workerElapsedMs: performance.now()-checkpointStart } satisfies ExecutionReply); };
    try {
        if (audit && (request.payload as AnalyticsWork).kind === "source") checkpoint("source-code-verified", await readSourceCodeProof());
        let metrics: ExecutionWorkMetrics | undefined;
        const value = await (audit ? auditAwait(audit, "worker-processing-elapsed", () => executeAnalyticsWork(request.payload as AnalyticsWork, controller.signal, value => { metrics = value; }, checkpoint)) : executeAnalyticsWork(request.payload as AnalyticsWork, controller.signal, value => { metrics = value; }, checkpoint));
        globalThis.postMessage({ ...binding, value, metrics, ...(audit ? { auditReport: auditWorkerResult(audit) } : undefined) } satisfies ExecutionReply);
    }
    catch (error) {
        auditError(audit, error);
        globalThis.postMessage({ ...binding, error: String(error), ...(audit ? { auditReport: auditWorkerResult(audit, "failed") } : undefined) } satisfies ExecutionReply);
    }
    finally { controllers.delete(request.requestId); }
});
