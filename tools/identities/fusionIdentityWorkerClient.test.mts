import assert from "node:assert/strict";

import {
  FusionIdentityWorkerCancelledError,
  startFusionIdentityWorkerRun,
  type FusionIdentityWorkerLike,
} from "../../src/lib/identities/fusionIdentityWorkerClient.ts";
import type {
  FusionIdentityWorkerRequest,
  FusionIdentityWorkerResponse,
} from "../../src/lib/identities/fusionIdentityWorkerTypes.ts";

const emptyReport = {
  scope: {
    label: "EU1-EU4 -> F28",
    originServerCodes: ["EU1", "EU2", "EU3", "EU4"],
    targetServerCode: "F28",
    allSnapshotCount: 0,
    historicalSnapshotCount: 0,
    postFusionSnapshotCount: 0,
    firstHistoricalTimestamp: null,
    lastHistoricalTimestamp: null,
    firstPostFusionTimestamp: null,
    lastPostFusionTimestamp: null,
    playerObservationCount: 0,
    guildObservationCount: 0,
  },
  summary: { total: 0, ready: 0, review: 0, unresolved: 0, noHistoricalObservation: 0, noHistory: 0, completed: 0, players: 0, guilds: 0 },
  items: [],
  currentAliases: [],
  historicalAliases: [],
};

class FakeWorker implements FusionIdentityWorkerLike {
  messages: FusionIdentityWorkerRequest[] = [];
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent<FusionIdentityWorkerResponse>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  postMessage(message: FusionIdentityWorkerRequest) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  addEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<FusionIdentityWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<FusionIdentityWorkerResponse>) => void);
    else this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: "message", listener: (event: MessageEvent<FusionIdentityWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<FusionIdentityWorkerResponse>) => void) | ((event: ErrorEvent) => void)) {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<FusionIdentityWorkerResponse>) => void);
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  emit(message: FusionIdentityWorkerResponse) {
    this.messageListeners.forEach((listener) => listener({ data: message } as MessageEvent<FusionIdentityWorkerResponse>));
  }

  emitError(message: string) {
    this.errorListeners.forEach((listener) => listener({ message } as ErrorEvent));
  }
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "a", workerFactory: () => worker });
  assert.deepEqual(worker.messages, [{ type: "build-report", requestId: "a" }]);
  worker.emit({ type: "complete", requestId: "a", report: emptyReport, timings: [{ phase: "total", durationMs: 42 }] });
  const result = await run.promise;
  assert.equal(result.report.summary.total, 0);
  assert.equal(result.timings[0]?.durationMs, 42);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const progressMessages: string[] = [];
  const run = startFusionIdentityWorkerRun({
    requestId: "b",
    workerFactory: () => worker,
    onProgress: (progress) => progressMessages.push(progress.message),
  });
  worker.emit({ type: "progress", requestId: "b", progress: { phase: "loading", message: "Loading local scans" } });
  worker.emit({ type: "complete", requestId: "b", report: emptyReport, timings: [] });
  await run.promise;
  assert.deepEqual(progressMessages, ["Loading local scans"]);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "c", workerFactory: () => worker });
  worker.emit({ type: "complete", requestId: "stale", report: { ...emptyReport, summary: { ...emptyReport.summary, total: 99 } }, timings: [] });
  worker.emit({ type: "complete", requestId: "c", report: emptyReport, timings: [] });
  const result = await run.promise;
  assert.equal(result.report.summary.total, 0);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "d", workerFactory: () => worker });
  worker.emit({ type: "error", requestId: "d", phase: "report", message: "boom" });
  await assert.rejects(run.promise, /boom/);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const run = startFusionIdentityWorkerRun({ requestId: "e", workerFactory: () => worker });
  run.cancel();
  await assert.rejects(run.promise, FusionIdentityWorkerCancelledError);
  assert.equal(worker.terminated, true);
  assert.deepEqual(worker.messages.at(-1), { type: "cancel", requestId: "e" });
}

console.log("fusionIdentityWorkerClient test passed");
