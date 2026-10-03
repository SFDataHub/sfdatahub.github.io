import type {
  ScanArchiveBuilderInspection,
  ScanArchiveBuilderManifestSource,
  ScanArchiveBuilderProgress,
  ScanArchiveBuilderRequest,
  ScanArchiveBuilderResponse,
  ScanArchiveBuilderResult,
  ScanArchiveBuilderUsageMode,
} from "./scanArchiveBuilderTypes";
import type { ScanArchiveManifest } from "./types";

export class ScanArchiveBuilderCancelledError extends Error {
  constructor() {
    super("scan_archive_builder_cancelled");
    this.name = "ScanArchiveBuilderCancelledError";
  }
}

export type ScanArchiveBuilderWorkerLike = {
  postMessage(message: ScanArchiveBuilderRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveBuilderResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveBuilderResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type ScanArchiveBuilderRun<T> = {
  requestId: string;
  promise: Promise<T>;
  cancel(): void;
};

type PendingRun<T> = {
  resolve(value: T): void;
  reject(reason?: unknown): void;
  onProgress?: (progress: ScanArchiveBuilderProgress) => void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `scan-archive-builder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createScanArchiveBuilderWorker = (): ScanArchiveBuilderWorkerLike =>
  new Worker(new URL("../../workers/scanArchiveBuilder.worker.ts", import.meta.url), { type: "module" });

export class ScanArchiveBuilderSession {
  private worker: ScanArchiveBuilderWorkerLike;
  private pending = new Map<string, PendingRun<unknown>>();
  private closed = false;

  constructor(workerFactory: () => ScanArchiveBuilderWorkerLike = createScanArchiveBuilderWorker) {
    this.worker = workerFactory();
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleError);
  }

  inspect(options: {
    inputFile: File;
    requestId?: string;
    onProgress?: (progress: ScanArchiveBuilderProgress) => void;
  }): ScanArchiveBuilderRun<ScanArchiveBuilderInspection> {
    const requestId = options.requestId ?? createRequestId();
    const promise = this.register<ScanArchiveBuilderInspection>(requestId, options.onProgress);
    this.worker.postMessage({ type: "inspect", requestId, inputFile: options.inputFile });
    return {
      requestId,
      promise,
      cancel: () => this.cancel(requestId),
    };
  }

  build(options: {
    inspectionId: string;
    manifest: ScanArchiveManifest;
    manifestSource: ScanArchiveBuilderManifestSource;
    usageMode: ScanArchiveBuilderUsageMode;
    replaceMonthly?: boolean;
    allowCurrentRollback?: boolean;
    requestId?: string;
    onProgress?: (progress: ScanArchiveBuilderProgress) => void;
  }): ScanArchiveBuilderRun<ScanArchiveBuilderResult> {
    const requestId = options.requestId ?? createRequestId();
    const promise = this.register<ScanArchiveBuilderResult>(requestId, options.onProgress);
    this.worker.postMessage({
      type: "build",
      requestId,
      inspectionId: options.inspectionId,
      manifest: options.manifest,
      manifestSource: options.manifestSource,
      usageMode: options.usageMode,
      replaceMonthly: options.replaceMonthly,
      allowCurrentRollback: options.allowCurrentRollback,
    });
    return {
      requestId,
      promise,
      cancel: () => this.cancel(requestId),
    };
  }

  cancel(requestId: string) {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    try {
      this.worker.postMessage({ type: "cancel", requestId });
    } catch {
      // Worker may already be gone.
    }
    this.terminate();
  }

  terminate() {
    if (this.closed) return;
    this.closed = true;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleError);
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new ScanArchiveBuilderCancelledError());
    this.pending.clear();
  }

  private register<T>(requestId: string, onProgress?: (progress: ScanArchiveBuilderProgress) => void) {
    if (this.closed) return Promise.reject(new ScanArchiveBuilderCancelledError());
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as PendingRun<unknown>["resolve"], reject, onProgress });
    });
  }

  private handleMessage = (event: MessageEvent<ScanArchiveBuilderResponse>) => {
    const message = event.data;
    const pending = this.pending.get(message.requestId);
    if (!pending) return;

    if (message.type === "progress") {
      pending.onProgress?.(message.progress);
      return;
    }

    this.pending.delete(message.requestId);
    if (message.type === "inspected") {
      pending.resolve(message.inspection);
      return;
    }
    if (message.type === "complete") {
      pending.resolve(message.result);
      return;
    }
    if (message.type === "cancelled") {
      pending.reject(new ScanArchiveBuilderCancelledError());
      return;
    }
    pending.reject(new Error(message.message));
  };

  private handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || "Scan archive builder worker failed.");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.terminate();
  };
}
