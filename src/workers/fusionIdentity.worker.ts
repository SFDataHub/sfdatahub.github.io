import { loadFusionIdentityManagementReport } from "../lib/identities/fusionIdentityManagement";
import type {
  FusionIdentityProgress,
  FusionIdentityProgressPhase,
  FusionIdentityWorkerRequest,
  FusionIdentityWorkerResponse,
  FusionIdentityWorkerTiming,
} from "../lib/identities/fusionIdentityWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: FusionIdentityWorkerResponse) => {
  globalThis.postMessage(message);
};

const createTimingTracker = () => {
  const totalStartedAt = performance.now();
  let activePhase: FusionIdentityProgressPhase | null = null;
  let activePhaseStartedAt = totalStartedAt;
  const durations = new Map<FusionIdentityProgressPhase | "total", number>();

  const addDuration = (phase: FusionIdentityProgressPhase | "total", durationMs: number) => {
    durations.set(phase, (durations.get(phase) ?? 0) + durationMs);
  };

  return {
    mark(progress: FusionIdentityProgress) {
      const now = performance.now();
      if (activePhase && activePhase !== progress.phase) {
        addDuration(activePhase, now - activePhaseStartedAt);
        activePhaseStartedAt = now;
      }
      activePhase = progress.phase;
    },
    finish(): FusionIdentityWorkerTiming[] {
      const now = performance.now();
      if (activePhase) addDuration(activePhase, now - activePhaseStartedAt);
      addDuration("total", now - totalStartedAt);
      return [...durations.entries()].map(([phase, durationMs]) => ({ phase, durationMs }));
    },
  };
};

const serializeError = (error: unknown) => (error instanceof Error ? error.message : "Could not build fusion identity report.");

const runBuildReport = async (requestId: string) => {
  activeRequestId = requestId;
  cancelledRequests.delete(requestId);
  const timings = createTimingTracker();
  let currentPhase: FusionIdentityProgressPhase | undefined;

  const emitProgress = (progress: FusionIdentityProgress) => {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) return;
    currentPhase = progress.phase;
    timings.mark(progress);
    postWorkerMessage({ type: "progress", requestId, progress });
  };

  try {
    const report = await loadFusionIdentityManagementReport({}, { onProgress: emitProgress });
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    emitProgress({ phase: "done", message: "Fusion identity report ready" });
    postWorkerMessage({ type: "complete", requestId, report, timings: timings.finish() });
  } catch (error) {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    postWorkerMessage({ type: "error", requestId, phase: currentPhase, message: serializeError(error) });
  } finally {
    if (activeRequestId === requestId) activeRequestId = null;
    cancelledRequests.delete(requestId);
  }
};

globalThis.addEventListener("message", (event: MessageEvent<FusionIdentityWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.requestId);
    if (activeRequestId === request.requestId) activeRequestId = null;
    postWorkerMessage({ type: "cancelled", requestId: request.requestId });
    return;
  }

  if (activeRequestId && activeRequestId !== request.requestId) {
    cancelledRequests.add(activeRequestId);
  }

  void runBuildReport(request.requestId);
});

