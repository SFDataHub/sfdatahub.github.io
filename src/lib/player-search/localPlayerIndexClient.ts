import type { GuildHubScanSummary } from "../guilds/localScanLibrary";
import type { LocalPlayerIndexBuildStats, LocalPlayerIndexResult } from "./localPlayerIndex";

export type LocalPlayerIndexProgressPhase = "loading-scans" | "indexing-scans" | "done";

export type LocalPlayerIndexProgress = {
  phase: LocalPlayerIndexProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type LocalPlayerIndexTiming = {
  phase: LocalPlayerIndexProgressPhase | "total";
  durationMs: number;
  count?: number;
};

export type LocalPlayerIndexWorkerRequest =
  | {
      type: "build-index";
      requestId: string;
      summaries: GuildHubScanSummary[];
      serverFilter: string | null;
    }
  | {
      type: "cancel";
      requestId: string;
    };

export type LocalPlayerIndexWorkerResponse =
  | {
      type: "progress";
      requestId: string;
      progress: LocalPlayerIndexProgress;
    }
  | {
      type: "complete";
      requestId: string;
      index: LocalPlayerIndexResult;
      stats: LocalPlayerIndexBuildStats;
      timings: LocalPlayerIndexTiming[];
    }
  | {
      type: "error";
      requestId: string;
      phase?: LocalPlayerIndexProgressPhase;
      message: string;
    }
  | {
      type: "cancelled";
      requestId: string;
    };

export class LocalPlayerIndexWorkerCancelledError extends Error {
  constructor() {
    super("local_player_index_worker_cancelled");
    this.name = "LocalPlayerIndexWorkerCancelledError";
  }
}

export type LocalPlayerIndexWorkerLike = {
  postMessage(message: LocalPlayerIndexWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<LocalPlayerIndexWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<LocalPlayerIndexWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type LocalPlayerIndexWorkerRunResult = {
  index: LocalPlayerIndexResult;
  stats: LocalPlayerIndexBuildStats;
  timings: LocalPlayerIndexTiming[];
};

export type LocalPlayerIndexWorkerRun = {
  requestId: string;
  promise: Promise<LocalPlayerIndexWorkerRunResult>;
  cancel(): void;
};

type StartLocalPlayerIndexWorkerRunOptions = {
  requestId?: string;
  summaries: GuildHubScanSummary[];
  serverFilter: string | null;
  workerFactory?: () => LocalPlayerIndexWorkerLike;
  onProgress?: (progress: LocalPlayerIndexProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `local-player-index-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createLocalPlayerIndexWorker = (): LocalPlayerIndexWorkerLike =>
  new Worker(new URL("../../workers/localPlayerIndex.worker.ts", import.meta.url), { type: "module" });

export const startLocalPlayerIndexWorkerRun = (
  options: StartLocalPlayerIndexWorkerRunOptions,
): LocalPlayerIndexWorkerRun => {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createLocalPlayerIndexWorker)();
  let settled = false;
  let handleMessage: (event: MessageEvent<LocalPlayerIndexWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;
  let rejectRun: (reason?: unknown) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<LocalPlayerIndexWorkerRunResult>((resolve, reject) => {
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
        resolve({ index: message.index, stats: message.stats, timings: message.timings });
        worker.terminate();
        return;
      }

      worker.terminate();
      if (message.type === "cancelled") {
        reject(new LocalPlayerIndexWorkerCancelledError());
        return;
      }

      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Local player index worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({
      type: "build-index",
      requestId,
      summaries: options.summaries,
      serverFilter: options.serverFilter,
    });
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
      rejectRun(new LocalPlayerIndexWorkerCancelledError());
    },
  };
};
