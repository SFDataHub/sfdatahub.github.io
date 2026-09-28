import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import type { ProgressRadarBuildResult } from "./progressRadarModel";

export type ProgressRadarProgressPhase = "loading-scans" | "building-radar" | "done";

export type ProgressRadarProgress = {
  phase: ProgressRadarProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type ProgressRadarWorkerRequest =
  | {
      type: "build-radar";
      requestId: string;
      summaries: GuildHubScanSummary[];
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type ProgressRadarWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: ProgressRadarProgress;
    }
  | {
      type: "complete";
      requestId: string;
      result: ProgressRadarBuildResult;
    }
  | {
      type: "error";
      requestId: string;
      phase?: ProgressRadarProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };

export class ProgressRadarWorkerCancelledError extends Error {
  constructor() {
    super("progress_radar_worker_cancelled");
    this.name = "ProgressRadarWorkerCancelledError";
  }
}

export type ProgressRadarWorkerLike = {
  postMessage(message: ProgressRadarWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ProgressRadarWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ProgressRadarWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type ProgressRadarWorkerRun = {
  requestId: string;
  promise: Promise<ProgressRadarBuildResult>;
  cancel(): void;
};

type StartProgressRadarWorkerRunOptions = {
  requestId?: string;
  summaries: GuildHubScanSummary[];
  workerFactory?: () => ProgressRadarWorkerLike;
  onProgress?: (progress: ProgressRadarProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `progress-radar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createProgressRadarWorker = (): ProgressRadarWorkerLike =>
  new Worker(new URL("./progressRadar.worker.ts", import.meta.url), { type: "module" });

export const startProgressRadarWorkerRun = (
  options: StartProgressRadarWorkerRunOptions,
): ProgressRadarWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createProgressRadarWorker)();
  let settled = false;
  let handleMessage: (event: MessageEvent<ProgressRadarWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;
  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<ProgressRadarBuildResult>((resolve, reject) => {
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
      worker.terminate();

      if (message.type === "complete") {
        resolve(message.result);
        return;
      }

      if (message.type === "cancelled") {
        reject(new ProgressRadarWorkerCancelledError());
        return;
      }

      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Progress radar worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ type: "build-radar", requestId, summaries: options.summaries });
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
      } finally {
        worker.terminate();
        rejectRun(new ProgressRadarWorkerCancelledError());
      }
    },
  };
};
