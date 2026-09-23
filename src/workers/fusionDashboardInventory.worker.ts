import {
  loadFusionIdentityDashboardInventory,
  type FusionIdentityDashboardInventoryProgress,
  type FusionIdentityDashboardInventoryTiming,
} from "../lib/identities/fusionDashboardInventory";
import type {
  FusionDashboardInventoryWorkerRequest,
  FusionDashboardInventoryWorkerResponse,
} from "../lib/identities/fusionDashboardInventoryWorkerTypes";

let activeRequestId: string | null = null;
const cancelledRequests = new Set<string>();

const postWorkerMessage = (message: FusionDashboardInventoryWorkerResponse) => {
  globalThis.postMessage(message);
};

const createTimingTracker = () => {
  const totalStartedAt = performance.now();
  const durations = new Map<
    FusionIdentityDashboardInventoryTiming["phase"],
    {
      durationMs: number;
      maxBlockMs: number;
      count: number;
    }
  >();

  const add = (timing: FusionIdentityDashboardInventoryTiming) => {
    const current = durations.get(timing.phase) ?? {
      durationMs: 0,
      maxBlockMs: 0,
      count: 0,
    };
    durations.set(timing.phase, {
      durationMs: current.durationMs + timing.durationMs,
      maxBlockMs: Math.max(current.maxBlockMs, timing.maxBlockMs ?? 0),
      count: current.count + (timing.count ?? 1),
    });
  };

  return {
    add,
    finish(): FusionIdentityDashboardInventoryTiming[] {
      add({
        phase: "total",
        durationMs: performance.now() - totalStartedAt,
        count: 1,
      });
      return [...durations.entries()].map(([phase, timing]) => ({
        phase,
        durationMs: timing.durationMs,
        maxBlockMs: timing.maxBlockMs || undefined,
        count: timing.count,
      }));
    },
  };
};

const serializeError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Could not build fusion dashboard inventory.";

const runBuildInventory = async (requestId: string) => {
  activeRequestId = requestId;
  cancelledRequests.delete(requestId);
  const timings = createTimingTracker();
  let currentPhase: FusionIdentityDashboardInventoryProgress["phase"] | undefined;

  const emitProgress = (progress: FusionIdentityDashboardInventoryProgress) => {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) return;
    currentPhase = progress.phase;
    postWorkerMessage({ type: "progress", requestId, progress });
  };

  try {
    const inventory = await loadFusionIdentityDashboardInventory({
      onProgress: emitProgress,
      onTiming: timings.add,
    });
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    emitProgress({
      phase: "done",
      message: "Fusion dashboard inventory ready",
    });
    postWorkerMessage({
      type: "complete",
      requestId,
      inventory,
      timings: timings.finish(),
    });
  } catch (error) {
    if (cancelledRequests.has(requestId) || activeRequestId !== requestId) {
      postWorkerMessage({ type: "cancelled", requestId });
      return;
    }
    postWorkerMessage({
      type: "error",
      requestId,
      phase: currentPhase,
      message: serializeError(error),
    });
  } finally {
    if (activeRequestId === requestId) activeRequestId = null;
    cancelledRequests.delete(requestId);
  }
};

globalThis.addEventListener(
  "message",
  (event: MessageEvent<FusionDashboardInventoryWorkerRequest>) => {
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

    void runBuildInventory(request.requestId);
  },
);
