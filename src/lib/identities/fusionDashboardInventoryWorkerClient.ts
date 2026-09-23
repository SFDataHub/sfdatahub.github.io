import type {
  FusionIdentityDashboardInventory,
  FusionIdentityDashboardInventoryProgress,
  FusionIdentityDashboardInventoryTiming,
} from "./fusionDashboardInventory";
import type {
  FusionDashboardInventoryWorkerRequest,
  FusionDashboardInventoryWorkerResponse,
} from "./fusionDashboardInventoryWorkerTypes";

export class FusionDashboardInventoryWorkerCancelledError extends Error {
  constructor() {
    super("fusion_dashboard_inventory_worker_cancelled");
    this.name = "FusionDashboardInventoryWorkerCancelledError";
  }
}

export type FusionDashboardInventoryWorkerLike = {
  postMessage(message: FusionDashboardInventoryWorkerRequest): void;
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<FusionDashboardInventoryWorkerResponse>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<FusionDashboardInventoryWorkerResponse>) => void,
  ): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type FusionDashboardInventoryWorkerRunResult = {
  inventory: FusionIdentityDashboardInventory;
  timings: FusionIdentityDashboardInventoryTiming[];
};

export type FusionDashboardInventoryWorkerRun = {
  requestId: string;
  promise: Promise<FusionDashboardInventoryWorkerRunResult>;
  cancel(): void;
};

type StartFusionDashboardInventoryWorkerRunOptions = {
  requestId?: string;
  workerFactory?: () => FusionDashboardInventoryWorkerLike;
  onProgress?: (progress: FusionIdentityDashboardInventoryProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `fusion-dashboard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createFusionDashboardInventoryWorker =
  (): FusionDashboardInventoryWorkerLike =>
    new Worker(
      new URL("../../workers/fusionDashboardInventory.worker.ts", import.meta.url),
      { type: "module" },
    );

export const startFusionDashboardInventoryWorkerRun = (
  options: StartFusionDashboardInventoryWorkerRunOptions = {},
): FusionDashboardInventoryWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createFusionDashboardInventoryWorker)();
  let settled = false;
  let handleMessage: (
    event: MessageEvent<FusionDashboardInventoryWorkerResponse>,
  ) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;
  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<FusionDashboardInventoryWorkerRunResult>(
    (resolve, reject) => {
      rejectRun = reject;

      handleMessage = (event) => {
        const message = event.data;
        if (message.requestId !== requestId || settled) return;

        if (message.type === "progress") {
          options.onProgress?.(message.progress);
          return;
        }

        settled = true;
        cleanup();

        if (message.type === "complete") {
          resolve({ inventory: message.inventory, timings: message.timings });
          worker.terminate();
          return;
        }

        worker.terminate();
        if (message.type === "cancelled") {
          reject(new FusionDashboardInventoryWorkerCancelledError());
          return;
        }

        reject(new Error(message.message));
      };

      handleError = (event) => {
        if (settled) return;
        settled = true;
        cleanup();
        worker.terminate();
        reject(new Error(event.message || "Fusion dashboard inventory worker failed."));
      };

      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.postMessage({ type: "build-inventory", requestId });
    },
  );

  return {
    requestId,
    promise,
    cancel() {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        worker.postMessage({ type: "cancel", requestId });
      } catch {
        // Worker may already be gone.
      }
      worker.terminate();
      rejectRun(new FusionDashboardInventoryWorkerCancelledError());
    },
  };
};
