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
    usageMode: "monthly",
    replaceMonthly: true,
    requestId: "build-1",
  });
  const buildMessage = worker.messages[1];
  assert.equal(buildMessage.type, "build");
  if (buildMessage.type === "build") {
    assert.equal(buildMessage.inspectionId, "inspection-123");
    assert.equal(buildMessage.usageMode, "monthly");
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

console.log("scanArchiveBuilderClient.test: ok");
