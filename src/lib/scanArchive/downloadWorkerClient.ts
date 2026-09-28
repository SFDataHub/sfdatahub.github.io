import type {
  ScanArchiveDownloadProgress,
  ScanArchiveDownloadRequest,
  ScanArchiveDownloadResponse,
} from "./downloadWorkerTypes";
import type { ScanArchiveEntry } from "./types";

export class ScanArchiveDownloadCancelledError extends Error {
  constructor() {
    super("scan_archive_download_cancelled");
    this.name = "ScanArchiveDownloadCancelledError";
  }
}

export type ScanArchiveDownloadWorkerLike = {
  postMessage(message: ScanArchiveDownloadRequest): void;
  terminate(): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveDownloadResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveDownloadResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
};

export type ScanArchiveDownloadRun = {
  requestId: string;
  promise: Promise<{ content: string; playerCount: number; groupCount: number }>;
  cancel(): void;
};

const createRequestId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `scan-archive-download-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const createScanArchiveDownloadWorker = (): ScanArchiveDownloadWorkerLike =>
  new Worker(new URL("../../workers/scanArchiveDownload.worker.ts", import.meta.url), { type: "module" });

export function startScanArchiveDownloadWorkerRun(options: {
  entry: ScanArchiveEntry;
  requestId?: string;
  workerFactory?: () => ScanArchiveDownloadWorkerLike;
  onProgress?: (progress: ScanArchiveDownloadProgress) => void;
}): ScanArchiveDownloadRun {
  const requestId = options.requestId ?? createRequestId();
  const worker = (options.workerFactory ?? createScanArchiveDownloadWorker)();
  let settled = false;
  let rejectRun: (reason?: unknown) => void = () => undefined;
  let handleMessage: (event: MessageEvent<ScanArchiveDownloadResponse>) => void = () => undefined;
  let handleError: (event: ErrorEvent) => void = () => undefined;

  const cleanup = () => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
  };

  const promise = new Promise<{ content: string; playerCount: number; groupCount: number }>((resolve, reject) => {
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
        resolve({ content: message.content, playerCount: message.playerCount, groupCount: message.groupCount });
        return;
      }
      if (message.type === "cancelled") {
        reject(new ScanArchiveDownloadCancelledError());
        return;
      }
      reject(new Error(message.message));
    };

    handleError = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      reject(new Error(event.message || "Scanarchiv-Download fehlgeschlagen."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage({ type: "download", requestId, entry: options.entry });
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
      rejectRun(new ScanArchiveDownloadCancelledError());
    },
  };
}
