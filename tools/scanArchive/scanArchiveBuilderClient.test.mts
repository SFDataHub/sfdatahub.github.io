import assert from "node:assert/strict";

import {
  ScanArchiveBuilderCancelledError,
  ScanArchiveBuilderSession,
  type ScanArchiveBuilderWorkerLike,
} from "../../src/lib/scanArchive/scanArchiveBuilderClient.ts";
import type {
  ScanArchiveBuilderRequest,
  ScanArchiveBuilderResponse,
} from "../../src/lib/scanArchive/scanArchiveBuilderTypes.ts";
import { ScanArchiveBuilderValidationError } from "../../src/lib/scanArchive/scanArchiveBuilderErrors.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

class FakeWorker implements ScanArchiveBuilderWorkerLike {
  readonly messages: ScanArchiveBuilderRequest[] = [];
  terminated = false;
  private messageListeners = new Set<(event: MessageEvent<ScanArchiveBuilderResponse>) => void>();
  private errorListeners = new Set<(event: ErrorEvent) => void>();

  postMessage(message: ScanArchiveBuilderRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: "message" | "error", listener: ((event: MessageEvent<ScanArchiveBuilderResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent<ScanArchiveBuilderResponse>) => void);
    else this.errorListeners.add(listener as (event: ErrorEvent) => void);
  }

  removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<ScanArchiveBuilderResponse>) => void) | ((event: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent<ScanArchiveBuilderResponse>) => void);
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void);
  }

  emit(message: ScanArchiveBuilderResponse) {
    const event = { data: message } as MessageEvent<ScanArchiveBuilderResponse>;
    for (const listener of this.messageListeners) listener(event);
  }
}

const manifest: ScanArchiveManifest = {
  schemaVersion: 1,
  archiveYear: 2026,
  revision: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  scanCount: 0,
  serverCount: 0,
  scans: [],
};

{
  const worker = new FakeWorker();
  const session = new ScanArchiveBuilderSession(() => worker);
  const inputFile = new File(["{}"], "raw.json", { type: "application/json" });
  const inspect = session.inspect({ inputFile, requestId: "inspect-1" });
  assert.deepEqual(worker.messages[0], { type: "inspect", requestId: "inspect-1", inputFile });
  worker.emit({
    type: "inspected",
    requestId: "inspect-1",
    inspection: {
      inspectionId: "inspection-123",
      years: [2026],
      months: ["2026-09"],
      servers: ["f8_net"],
      batchCount: 1,
      blockers: [],
    },
  });
  const inspection = await inspect.promise;
  assert.equal(inspection.inspectionId, "inspection-123");

  const build = session.build({
    inspectionId: inspection.inspectionId,
    manifest,
    manifestSource: { kind: "catalog", manifestUrl: "https://example.test/manifest.json", year: 2026, scanCount: 0 },
    usageMode: "create-monthly",
    requestId: "build-1",
  });
  const buildMessage = worker.messages[1];
  assert.equal(buildMessage.type, "build");
  if (buildMessage.type === "build") {
    assert.equal(buildMessage.inspectionId, "inspection-123");
    assert.equal(buildMessage.usageMode, "create-monthly");
    assert.equal(Object.prototype.hasOwnProperty.call(buildMessage, "inputFile"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(buildMessage, "inputBatches"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(buildMessage, "setImportedAsCurrent"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(buildMessage, "setImportedAsMonthly"), false);
  }
  build.cancel();
  await assert.rejects(build.promise, ScanArchiveBuilderCancelledError);
  assert.equal(worker.terminated, true);
  assert.deepEqual(worker.messages.at(-1), { type: "cancel", requestId: "build-1" });
}

{
  const worker = new FakeWorker();
  const session = new ScanArchiveBuilderSession(() => worker);
  const run = session.inspect({ inputFile: new File(["{}"], "raw.json"), requestId: "inspect-2" });
  session.terminate();
  await assert.rejects(run.promise, ScanArchiveBuilderCancelledError);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const session = new ScanArchiveBuilderSession(() => worker);
  let progresses = 0;
  const first = session.build({
    inspectionId: "preserved-inspection", manifest,
    manifestSource: { kind: "catalog", manifestUrl: "https://example.test/manifest.json", year: 2026, scanCount: 0 },
    usageMode: "add-monthly", requestId: "discarded", onProgress: () => progresses++,
  });
  session.discardBuild(first.requestId);
  await assert.rejects(first.promise, ScanArchiveBuilderCancelledError);
  assert.equal(worker.terminated, false);
  const second = session.build({
    inspectionId: "preserved-inspection", manifest,
    manifestSource: { kind: "catalog", manifestUrl: "https://example.test/manifest.json", year: 2026, scanCount: 0 },
    usageMode: "create-monthly", requestId: "fresh",
  });
  worker.emit({ type: "progress", requestId: "discarded", progress: { phase: "ready", message: "stale" } });
  worker.emit({ type: "error", requestId: "discarded", message: "stale failure" });
  assert.equal(progresses, 0);
  assert.equal(worker.messages.filter((message) => message.type === "inspect").length, 0);
  const message = worker.messages.at(-1);
  assert.equal(message?.type, "build");
  if (message?.type === "build") {
    assert.equal(message.inspectionId, "preserved-inspection");
    assert.equal(message.usageMode, "create-monthly");
    assert.equal("inputBatches" in message, false);
    assert.equal("players" in message, false);
    assert.equal("groups" in message, false);
  }
  second.cancel();
  await assert.rejects(second.promise, ScanArchiveBuilderCancelledError);
  assert.equal(worker.terminated, true);
}

{
  const worker = new FakeWorker();
  const session = new ScanArchiveBuilderSession(() => worker);
  const run = session.inspect({ inputFile: new File(["{}"], "invalid.json"), requestId: "invalid-input" });
  const blocker = { code: "server_resolution_failed", cause: "players[0]: Server unknown_net", remedy: "Pruefe die Server-/Aliaszuordnung." };
  worker.emit({ type: "error", requestId: run.requestId, message: "legacy combined message", blocker });
  await assert.rejects(run.promise, (error: unknown) => {
    assert(error instanceof ScanArchiveBuilderValidationError);
    assert.deepEqual(error.blocker, blocker);
    assert.equal(error.message, blocker.cause);
    return true;
  });
  session.terminate();
}

{
  // Replacing a file/reset terminates its session; late errors and successes
  // cannot update the fresh file's inspection or its progress.
  const oldWorker = new FakeWorker();
  const oldSession = new ScanArchiveBuilderSession(() => oldWorker);
  let staleProgress = 0;
  const oldRun = oldSession.inspect({ inputFile: new File(["{}"], "old.json"), requestId: "old-file", onProgress: () => staleProgress++ });
  oldSession.terminate();
  await assert.rejects(oldRun.promise, ScanArchiveBuilderCancelledError);
  const freshWorker = new FakeWorker();
  const freshSession = new ScanArchiveBuilderSession(() => freshWorker);
  const freshRun = freshSession.inspect({ inputFile: new File(["{}"], "new.json"), requestId: "new-file" });
  const inspection = { inspectionId: "fresh-inspection", years: [2026], months: ["2026-09"], servers: ["am1_net"], batchCount: 1, blockers: [] };
  oldWorker.emit({ type: "error", requestId: "old-file", message: "stale input error" });
  oldWorker.emit({ type: "progress", requestId: "old-file", progress: { phase: "validating", message: "stale progress" } });
  oldWorker.emit({ type: "inspected", requestId: "old-file", inspection: { ...inspection, inspectionId: "stale" } });
  freshWorker.emit({ type: "inspected", requestId: freshRun.requestId, inspection });
  assert.deepEqual(await freshRun.promise, inspection);
  assert.equal(staleProgress, 0);
  assert.equal(freshWorker.messages.filter(message => message.type === "inspect").length, 1);
  freshSession.terminate();
}

console.log("scanArchiveBuilderClient.test: ok");
