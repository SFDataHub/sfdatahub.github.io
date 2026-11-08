import assert from "node:assert/strict";
import { localToplistContentRevision, localToplistSelectionRevision } from "../../src/lib/toplists/localToplistDatasetRevision.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";
import type { LocalToplistViewWorkerRequest } from "../../src/lib/toplists/localToplistViewWorkerTypes.ts";

class ControlledWorker {
  static last: ControlledWorker;
  messages: LocalToplistViewWorkerRequest[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  throws = false;
  terminated = false;
  constructor() { ControlledWorker.last = this; }
  postMessage(message: LocalToplistViewWorkerRequest) { if (this.throws) throw new Error("send failed"); this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(message: LocalToplistViewWorkerRequest, fields: object = {}) {
    this.onmessage?.({ data: { requestId: message.requestId, ok: true, type: message.type,
      datasetId: message.datasetId, contentRevision: message.contentRevision, tab: "players", totalRows: 0,
      page: 1, pageSize: 1000, playerRows: [], guildRows: [], normalizedQuery: "target", results: [], ...fields } } as MessageEvent);
  }
  latest() { return this.messages.at(-1)!; }
}
globalThis.Worker = ControlledWorker as unknown as typeof Worker;
const { LocalToplistViewWorkerSession, LocalToplistViewWorkerCancelledError } = await import("../../src/lib/toplists/localToplistViewWorkerClient.ts");
const session = new LocalToplistViewWorkerSession();
let worker = ControlledWorker.last;
const r1 = session.setData("same-id", [], [], "R1");
const r1Rejected = assert.rejects(r1, LocalToplistViewWorkerCancelledError);
const held = worker.latest();
assert.equal(session.setData("same-id", [], [], "R1"), r1, "same revision joins its own pending init");
const r2 = session.setData("same-id", [], [], "R2");
assert.notEqual(r2, r1);
assert.equal(worker.messages.length, 2);
worker.reply(held); // obsolete response cannot set ready
worker.reply(worker.latest());
const ready = await r2;
await r1Rejected;
assert.equal(await session.setData("same-id", [], [], "R2"), ready, "reuse real acknowledged readiness");
assert.equal(worker.messages.length, 2);
const query = session.requestSearch({ datasetId: "same-id", contentRevision: "R2", query: "target" });
const queryRejected = assert.rejects(query, LocalToplistViewWorkerCancelledError), oldQuery = worker.latest();
const view = session.requestView({ datasetId: "same-id", contentRevision: "R2", tab: "players", filters: {}, sort: { metricKey: "sum" }, page: 1, pageSize: 1000 });
const viewRejected = assert.rejects(view, LocalToplistViewWorkerCancelledError), oldView = worker.latest();
const r3 = session.setData("same-id", [], [], "R3");
worker.reply(worker.latest()); await r3;
worker.reply(oldQuery); worker.reply(oldView);
await Promise.all([queryRejected, viewRejected]);
await assert.rejects(session.requestSearch({ datasetId: "same-id", contentRevision: "R1", query: "target" }), LocalToplistViewWorkerCancelledError);
for (const kind of ["error", "messageerror", "send", "binding"] as const) {
  const revision = `failure-${kind}`;
  if (kind === "send") worker.throws = true;
  const failed = session.setData("same-id", [], [], revision);
  const rejected = assert.rejects(failed);
  if (kind === "error") worker.onerror?.({ message: "worker failed" } as ErrorEvent);
  if (kind === "messageerror") worker.onmessageerror?.();
  if (kind === "binding") worker.reply(worker.latest(), { contentRevision: "stale" });
  await rejected;
  assert.equal(worker.terminated, true, `${kind} terminates the defective worker before retry`);
  const defective = worker; worker.throws = false;
  const retry = session.setData("same-id", [], [], revision); worker = ControlledWorker.last; worker.reply(worker.latest()); await retry;
  assert.notEqual(worker, defective, "retry creates a fresh worker and waits for its actual Ready");
}
let bindingCase = 0, boundRevision = "";
for (const fields of [{ datasetId: "foreign" }, { datasetId: undefined }, { contentRevision: undefined }, { type: "view" }]) {
  boundRevision = `missing-or-foreign-binding-${bindingCase++}`;
  const failed = session.setData("same-id", [], [], boundRevision);
  const rejected = assert.rejects(failed, /response_binding_mismatch/);
  worker.reply(worker.latest(), fields); await rejected;
  assert.equal(worker.terminated, true);
  const fresh = session.setData("same-id", [], [], boundRevision);
  worker = ControlledWorker.last; worker.reply(worker.latest()); await fresh;
}
for (const type of ["view", "search"] as const) {
  const request = type === "view"
    ? session.requestView({ datasetId: "same-id", contentRevision: boundRevision, tab: "players", filters: {}, sort: { metricKey: "sum" }, page: 1, pageSize: 1000 })
    : session.requestSearch({ datasetId: "same-id", contentRevision: boundRevision, query: "target" });
  const rejected = assert.rejects(request, /response_binding_mismatch/);
  worker.reply(worker.latest(), { contentRevision: "obsolete" }); await rejected;
  assert.equal(worker.terminated, true);
  const fresh = session.setData("same-id", [], [], boundRevision);
  worker = ControlledWorker.last; worker.reply(worker.latest()); await fresh;
}
console.log("PASS missing/foreign Ready fields, wrong response type and stale View/Search revisions reject and terminate; fresh real-ACK retry required");
const pending = session.setData("same-id", [], [], "dispose");
const rejected = assert.rejects(pending, LocalToplistViewWorkerCancelledError);
session.dispose(); await rejected;
await assert.rejects(session.setData("same-id", [], [], "dispose"), LocalToplistViewWorkerCancelledError);
assert.equal(localToplistContentRevision({ a: 1, b: [2] }), localToplistContentRevision({ b: [2], a: 1 }));
assert.notEqual(localToplistContentRevision({ a: 1 }), localToplistContentRevision({ a: 2 }));
const selected = { id: "physical", sha256: "a", server: "f8_net", timestamp: 1, archiveYear: 2026 } as ScanArchiveEntry;
assert.equal(localToplistSelectionRevision([selected], 5), localToplistSelectionRevision([{ ...selected, toplistSetKey: "physical:a", toplistSetScanIds: ["physical"] }], 5));
assert.notEqual(localToplistSelectionRevision([selected], 5), localToplistSelectionRevision([{ ...selected, toplistSetScanIds: ["physical", "missing"] }], 5));
const other = { ...selected, id: "other", sha256: "b" };
assert.notEqual(localToplistSelectionRevision([selected, other], 5), localToplistSelectionRevision([selected, other].map(entry => ({ ...entry, toplistSetKey: "joined", toplistSetScanIds: ["physical", "other"] })), 5));
console.log("PASS revision-bound init join/replacement, old Ready/View/Search, acknowledged reuse, error/messageerror/send/binding retry and dispose");

// Actual worker: same ID, same row count, different content replaces indices.
const responses: any[] = [];
(globalThis as any).postMessage = (response: unknown) => responses.push(response);
await import("../../src/workers/localToplistView.worker.ts");
const send = (message: object) => { responses.length = 0; (globalThis as any).onmessage({ data: message }); return responses[0]; };
const row = { rowKey: "a", identifier: "f8_net_p1", server: "F8", sourceServer: "f8_net", name: "Old Target", class: "warrior", sum: 100, main: 70, con: 30, scanTimestamp: 1, localScanId: "source-1", archiveScanId: "physical-1", guild: null };
assert.equal(send({ requestId: 1, type: "init", datasetId: "same", contentRevision: "R1", playerRows: [row], guildRows: [] }).contentRevision, "R1");
assert.equal(send({ requestId: 2, type: "init", datasetId: "same", contentRevision: "R2", playerRows: [{ ...row, name: "New Target", sum: 200, archiveScanId: "physical-2" }], guildRows: [] }).totalRows, 1);
assert.equal(send({ requestId: 3, type: "search", datasetId: "same", contentRevision: "R1", query: "target" }).ok, false);
const search = send({ requestId: 4, type: "search", datasetId: "same", contentRevision: "R2", query: "target" });
assert.equal(search.results[0].label, "New Target");
const actualView = send({ requestId: 5, type: "view", datasetId: "same", contentRevision: "R2", tab: "players", filters: {}, sort: { metricKey: "sum" }, page: 1, pageSize: 1000 });
assert.equal(actualView.playerRows[0].sum, 200);
assert.equal(actualView.playerRows[0].archiveScanId, "physical-2");
console.log("PASS actual worker arrays and search/view indices replace same-count content; stale revision veto");
