import type { FusionIdentityManagementReport } from "./fusionIdentityManagement";
import type { FusionIdentityScopeInventory } from "./fusionDashboardInventory";
import type { FusionIdentityAnalysisScope } from "./fusionIdentityScopes";
import { FusionIdentityScopeNotLocallyMatchableError } from "./fusionScopeMatchability";
import type {
  FusionIdentityProgress,
  FusionIdentityWorkerRequest,
  FusionIdentityWorkerResponse,
  FusionIdentityWorkerTiming,
} from "./fusionIdentityWorkerTypes";

export class FusionIdentityWorkerCancelledError extends Error {
  constructor() {
    super("fusion_identity_worker_cancelled");
    this.name = "FusionIdentityWorkerCancelledError";
  }
}

export type FusionIdentityWorkerLike = {
  postMessage(message: FusionIdentityWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type FusionIdentityWorkerRunResult = {
  report: FusionIdentityManagementReport;
  timings: FusionIdentityWorkerTiming[];
};

export type FusionIdentityWorkerRun = {
  requestId: string;
  promise: Promise<FusionIdentityWorkerRunResult>;
  cancel(): void;
};

type StartFusionIdentityWorkerRunOptions = {
  requestId?: string;
  scope?: FusionIdentityAnalysisScope;
  scopeInventory?: FusionIdentityScopeInventory;
  workerFactory?: () => FusionIdentityWorkerLike;
  onProgress?: (progress: FusionIdentityProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `fusion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createFusionIdentityWorker = (): FusionIdentityWorkerLike =>
  new Worker(new URL("../../workers/fusionIdentity.worker.ts", import.meta.url), { type: "module" });

export const startFusionIdentityWorkerRun = (
  options: StartFusionIdentityWorkerRunOptions = {},
): FusionIdentityWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const scope = options.scopeInventory?.scope ?? options.scope;
  if (options.scopeInventory && !options.scopeInventory.isLocallyMatchable) {
    const error = new FusionIdentityScopeNotLocallyMatchableError(
      options.scopeInventory.scope.targetServerCode,
    );
    return {
      requestId,
      promise: Promise.reject(error),
      cancel() {
        // No worker was started.
      },
    };
  }

  const worker = (options.workerFactory ?? createFusionIdentityWorker)();
  let settled = false;
  let handleMessage: (event: MessageEvent<FusionIdentityWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;

  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<FusionIdentityWorkerRunResult>((resolve, reject) => {
    rejectRun = reject;
    const requestStartedAt = performance.now();

    handleMessage = (event: MessageEvent<FusionIdentityWorkerResponse>) => {
      const messageReceivedAt = performance.now();
      const message = event.data;
      if (message.requestId !== requestId || settled) return;

      if (message.type === "progress") {
        options.onProgress?.(message.progress);
        return;
      }

      settled = true;
      cleanup();

      if (message.type === "complete") {
        const workerComputeMs =
          message.timings.find((timing) => timing.phase === "worker:compute")?.durationMs ??
          message.timings.find((timing) => timing.phase === "total")?.durationMs ??
          0;
        const workerRoundTripMs = messageReceivedAt - requestStartedAt;
        const responseAcceptedStartedAt = performance.now();
        const timings = [
          ...message.timings,
          {
            phase: "client:worker-roundtrip",
            durationMs: workerRoundTripMs,
            count: 1,
          },
          {
            phase: "client:transfer-and-queue",
            durationMs: Math.max(0, workerRoundTripMs - workerComputeMs),
            count: 1,
          },
          {
            phase: "client:response-accepted",
            durationMs: performance.now() - responseAcceptedStartedAt,
            count: 1,
          },
        ];
        resolve({ report: message.report, timings });
        worker.terminate();
        return;
      }

      worker.terminate();
      if (message.type === "cancelled") {
        reject(new FusionIdentityWorkerCancelledError());
        return;
      }

      reject(new Error(message.message));
    };

    handleError = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Fusion identity worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage(
      scope
        ? { type: "build-report", requestId, scope }
        : { type: "build-report", requestId },
    );
  });

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
      rejectRun(new FusionIdentityWorkerCancelledError());
    },
  };
};
