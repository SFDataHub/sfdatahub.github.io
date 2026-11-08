import { executeAnalyticsWork, type AnalyticsWork, type ExecutionWorkMetrics } from "../lib/local-player-profile/executionWork";
import { ANALYTICS_TRANSPORT_VERSION, type ExecutionEnvelope, type ExecutionReply } from "../lib/local-player-profile/executionTransport";
// Main owns the active preparation registry and serial queue. This worker owns
// only its current source read / projection; no second coordinator or Rawpool.
globalThis.addEventListener("message", async (event: MessageEvent<ExecutionEnvelope>) => {
    const request = event.data;
    if (request?.version !== ANALYTICS_TRANSPORT_VERSION)
        return;
    const binding = { version: request.version, requestId: request.requestId, generation: request.generation, key: request.key };
    try {
        let metrics: ExecutionWorkMetrics | undefined;
        const value = await executeAnalyticsWork(request.payload as AnalyticsWork, new AbortController().signal, value => { metrics = value; });
        globalThis.postMessage({ ...binding, value, metrics } satisfies ExecutionReply);
    }
    catch (error) {
        globalThis.postMessage({ ...binding, error: String(error) } satisfies ExecutionReply);
    }
});
