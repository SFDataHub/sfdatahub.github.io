import type { LocalGuildToplistRow, LocalPlayerToplistRow } from "./localToplistTypes";
import type {
  LocalToplistViewWorkerInitRequest,
  LocalToplistViewWorkerRequest,
  LocalToplistViewWorkerResponse,
  LocalToplistViewWorkerSearchRequest,
  LocalToplistViewWorkerSearchSuccess,
  LocalToplistViewWorkerSuccess,
  LocalToplistViewWorkerViewRequest,
} from "./localToplistViewWorkerTypes";

export class LocalToplistViewWorkerCancelledError extends Error {
  constructor() {
    super("local_toplist_view_worker_cancelled");
    this.name = "LocalToplistViewWorkerCancelledError";
  }
}

type PendingRequest = {
  resolve: (response: LocalToplistViewWorkerSuccess | LocalToplistViewWorkerSearchSuccess) => void;
  reject: (reason: unknown) => void;
};

type PendingDatasetInit = {
  datasetId: string;
  promise: Promise<LocalToplistViewWorkerSuccess>;
};

let nextRequestId = 1;

export class LocalToplistViewWorkerSession {
  private readonly worker = new Worker(new URL("../../workers/localToplistView.worker.ts", import.meta.url), { type: "module" });
  private readonly pending = new Map<number, PendingRequest>();
  private initializedDatasetId: string | null = null;
  private pendingDatasetInit: PendingDatasetInit | null = null;
  private disposed = false;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<LocalToplistViewWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      if (response.ok) {
        pending.resolve(response);
      } else {
        pending.reject(new Error(response.error));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "local_toplist_view_worker_error");
      this.rejectAll(error);
    };
  }

  setData(datasetId: string, playerRows: LocalPlayerToplistRow[], guildRows: LocalGuildToplistRow[]) {
    if (this.initializedDatasetId === datasetId) {
      return Promise.resolve(this.initResponse(playerRows.length + guildRows.length));
    }
    if (this.pendingDatasetInit?.datasetId === datasetId) {
      return this.pendingDatasetInit.promise;
    }
    const request: Omit<LocalToplistViewWorkerInitRequest, "requestId"> = {
      type: "init",
      datasetId,
      playerRows,
      guildRows,
    };
    const init: PendingDatasetInit = {
      datasetId,
      promise: this.send(request)
        .then((response) => {
          if (response.type !== "init") throw new Error("local_toplist_view_worker_unexpected_init_response");
          if (this.pendingDatasetInit === init) {
            this.initializedDatasetId = datasetId;
            this.pendingDatasetInit = null;
          }
          return response;
        })
        .catch((error) => {
          if (this.pendingDatasetInit === init) this.pendingDatasetInit = null;
          throw error;
        }),
    };
    this.pendingDatasetInit = init;
    return init.promise;
  }

  requestView(request: Omit<LocalToplistViewWorkerViewRequest, "requestId" | "type">) {
    const message: Omit<LocalToplistViewWorkerViewRequest, "requestId"> = {
      ...request,
      type: "view",
    };
    return this.send(message).then((response) => {
      if (response.type !== "view" && response.type !== "init") throw new Error("local_toplist_view_worker_unexpected_response");
      return response;
    });
  }

  requestSearch(request: Omit<LocalToplistViewWorkerSearchRequest, "requestId" | "type">) {
    const message: Omit<LocalToplistViewWorkerSearchRequest, "requestId"> = {
      ...request,
      type: "search",
    };
    return this.send(message).then((response) => {
      if (response.type !== "search") throw new Error("local_toplist_view_worker_unexpected_search_response");
      return response;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.rejectAll(new LocalToplistViewWorkerCancelledError());
  }

  private send(request: Omit<LocalToplistViewWorkerRequest, "requestId">) {
    if (this.disposed) return Promise.reject(new LocalToplistViewWorkerCancelledError());
    const requestId = nextRequestId;
    nextRequestId += 1;
    const message = { ...request, requestId } as LocalToplistViewWorkerRequest;
    return new Promise<LocalToplistViewWorkerSuccess | LocalToplistViewWorkerSearchSuccess>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage(message);
    });
  }

  private rejectAll(reason: unknown) {
    for (const pending of this.pending.values()) pending.reject(reason);
    this.pending.clear();
    this.pendingDatasetInit = null;
  }

  private initResponse(totalRows: number): LocalToplistViewWorkerSuccess {
    return {
      requestId: 0,
      ok: true,
      type: "init",
      tab: "guilds",
      totalRows,
      page: 1,
      pageSize: 0,
      playerRows: [],
      guildRows: [],
    };
  }
}
