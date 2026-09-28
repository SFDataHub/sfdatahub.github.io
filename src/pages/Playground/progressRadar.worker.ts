import { getGuildHubLocalScan } from "../../lib/guilds/localScanLibrary";
import { buildProgressRadarModel } from "./progressRadarModel";
import type {
  ProgressRadarProgress,
  ProgressRadarProgressPhase,
  ProgressRadarWorkerRequest,
  ProgressRadarWorkerResponse,
} from "./progressRadarWorkerClient";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: ProgressRadarWorkerResponse) => {
  globalThis.postMessage(message);
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "Could not build progress radar.";

const isCancelled = (requestId: string) =>
  cancelledRequests.has(requestId) || activeRequestId !== requestId;

const runBuildRadar = async (request: Extract<ProgressRadarWorkerRequest, { type: "build-radar" }>) => {
  activeRequestId = request.requestId;
  cancelledRequests.delete(request.requestId);
  let currentPhase: ProgressRadarProgressPhase | undefined;

  const emitProgress = (progress: ProgressRadarProgress) => {
    if (isCancelled(request.requestId)) return;
    currentPhase = progress.phase;
    postWorkerMessage({ type: "progress", requestId: request.requestId, progress });
  };

  try {
    const total = request.summaries.length;
    const scans = [];

    emitProgress({ phase: "loading-scans", current: 0, total, message: "Lokale F28-Scans werden geladen" });

    for (let index = 0; index < request.summaries.length; index += 1) {
      if (isCancelled(request.requestId)) {
        postWorkerMessage({ type: "cancelled", requestId: request.requestId });
        return;
      }

      const summary = request.summaries[index];
      const scan = await getGuildHubLocalScan(summary.sourceScanId);
      if (scan) scans.push({ scan, summary });

      emitProgress({
        phase: "loading-scans",
        current: index + 1,
        total,
        message: "Lokale F28-Scans werden geladen",
      });
    }

    if (isCancelled(request.requestId)) {
      postWorkerMessage({ type: "cancelled", requestId: request.requestId });
      return;
    }

    emitProgress({ phase: "building-radar", message: "Gildenradar wird berechnet" });
    const result = buildProgressRadarModel(scans);
    emitProgress({ phase: "done", message: "Gildenradar bereit" });
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

globalThis.addEventListener("message", (event: MessageEvent<ProgressRadarWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelledRequests.add(message.requestId);
    if (activeRequestId === message.requestId) activeRequestId = null;
    postWorkerMessage({ type: "cancelled", requestId: message.requestId });
    return;
  }

  void runBuildRadar(message);
});
