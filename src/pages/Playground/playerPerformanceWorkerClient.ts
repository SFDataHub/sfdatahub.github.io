import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import type { GuildTrendBuildResult } from "./playerPerformanceModel";

export type PlayerPerformanceProgressPhase = "loading-analytics" | "loading-scans" | "building-performance" | "done";

export type PlayerPerformanceProgress = {
  phase: PlayerPerformanceProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type PlayerPerformanceWorkerRequest =
  | {
      type: "build-performance";
      requestId: string;
      summaries: GuildHubScanSummary[];
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type PlayerPerformanceWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: PlayerPerformanceProgress;
    }
  | {
      type: "complete";
      requestId: string;
      result: GuildTrendBuildResult;
    }
  | {
      type: "error";
      requestId: string;
      phase?: PlayerPerformanceProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };

export class PlayerPerformanceWorkerCancelledError extends Error {
  constructor() {
    super("player_performance_worker_cancelled");
    this.name = "PlayerPerformanceWorkerCancelledError";
  }
}

export type PlayerPerformanceWorkerLike = {
  postMessage(message: PlayerPerformanceWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<PlayerPerformanceWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<PlayerPerformanceWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type PlayerPerformanceWorkerRun = {
  requestId: string;
  promise: Promise<GuildTrendBuildResult>;
  cancel(): void;
};

type StartPlayerPerformanceWorkerRunOptions = {
  requestId?: string;
  summaries: GuildHubScanSummary[];
  workerFactory?: () => PlayerPerformanceWorkerLike;
  onProgress?: (progress: PlayerPerformanceProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `player-performance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createPlayerPerformanceWorker = (): PlayerPerformanceWorkerLike =>
  new Worker(new URL("./playerPerformance.worker.ts", import.meta.url), { type: "module" });

export const startPlayerPerformanceWorkerRun = (
  options: StartPlayerPerformanceWorkerRunOptions,
): PlayerPerformanceWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createPlayerPerformanceWorker)();
  let settled = false;
  let handleMessage: (event: MessageEvent<PlayerPerformanceWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;
  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<GuildTrendBuildResult>((resolve, reject) => {
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
        reject(new PlayerPerformanceWorkerCancelledError());
        return;
      }

      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Player performance worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ type: "build-performance", requestId, summaries: options.summaries });
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
        rejectRun(new PlayerPerformanceWorkerCancelledError());
      }
    },
  };
};
