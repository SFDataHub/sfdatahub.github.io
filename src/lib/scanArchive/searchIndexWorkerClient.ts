import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "./types";
import type {
  ScanArchiveSearchIndexProgress,
  ScanArchiveSearchIndexWorkerRequest,
  ScanArchiveSearchIndexWorkerResponse,
} from "./searchIndexWorkerTypes";

export class ScanArchiveSearchIndexCancelledError extends Error {
  constructor() {
    super("scan_archive_search_index_cancelled");
    this.name = "ScanArchiveSearchIndexCancelledError";
  }
}

export type ScanArchiveSearchIndexWorkerLike = {
  postMessage(message: ScanArchiveSearchIndexWorkerRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveSearchIndexWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveSearchIndexWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type ScanArchiveSearchIndexWorkerRun = {
  requestId: string;
  promise: Promise<ScanArchiveSearchIndexPayload>;
  cancel(): void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `scan-archive-search-index-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createScanArchiveSearchIndexWorker = (): ScanArchiveSearchIndexWorkerLike =>
  new Worker(new URL("../../workers/scanArchiveSearchIndex.worker.ts", import.meta.url), { type: "module" });

export function startScanArchiveSearchIndexWorkerRun(options: {
  entry: ScanArchiveEntry;
  requestId?: string;
  workerFactory?: () => ScanArchiveSearchIndexWorkerLike;
  onProgress?: (progress: ScanArchiveSearchIndexProgress) => void;
}): ScanArchiveSearchIndexWorkerRun {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createScanArchiveSearchIndexWorker)();
  let settled = false;
  let rejectRun: (reason?: unknown) => void = () => undefined;
  let handleMessage: (event: MessageEvent<ScanArchiveSearchIndexWorkerResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<ScanArchiveSearchIndexPayload>((resolve, reject) => {
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
        resolve(message.payload);
        return;
      }
      if (message.type === "cancelled") {
        reject(new ScanArchiveSearchIndexCancelledError());
        return;
      }
      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Scanarchiv-Suchindex-Download fehlgeschlagen."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ type: "download-search-index", requestId, entry: options.entry });
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
      rejectRun(new ScanArchiveSearchIndexCancelledError());
    },
  };
}
