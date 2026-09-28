import { getGuildHubLocalScan } from "../../lib/guilds/localScanLibrary";
import { ensureGuildAnalyticsDerivedDataFromSummaries } from "../../lib/guilds/localGuildAnalyticsStore";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { buildGuildTrendModel } from "./playerPerformanceModel";
import type {
  PlayerPerformanceProgress,
  PlayerPerformanceProgressPhase,
  PlayerPerformanceWorkerRequest,
  PlayerPerformanceWorkerResponse,
} from "./playerPerformanceWorkerClient";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: PlayerPerformanceWorkerResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Could not build player performance.";

const isCancelled = (requestId: string) =>
  cancelledRequests.has(requestId) || activeRequestId !== requestId;

const runBuildPerformance = async (request: Extract<PlayerPerformanceWorkerRequest, { type: "build-performance" }>) => {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  let currentPhase: PlayerPerformanceProgressPhase | undefined;

  const emitProgress = (progress: PlayerPerformanceProgress) => {
    if (isCancelled(request.requestId)) return;
    currentPhase = progress.phase;
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  try {
    const scanCache = new Map<string, Awaited<ReturnType<typeof getGuildHubLocalScan>>>();
    const loadScanById = async (sourceScanId: string) => {
      if (scanCache.has(sourceScanId)) return scanCache.get(sourceScanId) ?? null;
      const scan = await getGuildHubLocalScan(sourceScanId);
      scanCache.set(sourceScanId, scan);
      return scan;
    };

    emitProgress({ phase: "loading-analytics", message: "Analytics-Daten werden geprüft" });
    const [analyticsData, identityResolutionSnapshot] = await Promise.all([
      ensureGuildAnalyticsDerivedDataFromSummaries(request.summaries, {
        loadSourceById: loadScanById,
      }),
      loadIdentityResolutionSnapshot().catch(() => null),
    ]);

    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }

    emitProgress({ phase: "building-performance", message: "Gildentrend wird berechnet" });
    const result = buildGuildTrendModel({ analyticsData, identityResolutionSnapshot });
    emitProgress({ phase: "done", message: "Gildentrend bereit" });
    postWorkerMessage({ type: "complete", requestId: request.requestId, result });
  } catch (error) {
    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }
    postWorkerMessage({
      type: "error",
      requestId: request.requestId,
      phase: currentPhase,
      message: serializeError(error),
    });
  } finally {
    if (activeRequestId === request.requestId) activeRequestId = null;
    cancelledRequests.delete(request.requestId);
  }
};

globalThis.addEventListener("message", (event: MessageEvent<PlayerPerformanceWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelledRequests.add(message.requestId);
    if (activeRequestId === message.requestId) activeRequestId = null;
    postWorkerMessage({ type: "cancelled", requestId: message.requestId });
    return;
  }

  void runBuildPerformance(message);
});
