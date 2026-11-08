import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import { createLocalChangesStore, localChangesDb, readLocalDataChanges } from "../../../../src/lib/local-data/localDataChanges";
import { createPreferencesStore, PREFERENCES_KEY, PLAYER_RADAR_MODES } from "../../../../src/lib/settings/preferences";
import { ANALYTICS_TRANSPORT_VERSION, createAnalyticsTransport, type AnalyticsWorker, type ExecutionEnvelope } from "../../../../src/lib/local-player-profile/executionTransport";

let raw: string | null = null;
const storage = { getItem: (key: string) => key === PREFERENCES_KEY ? raw : null, setItem: (_key: string, value: string) => { raw = value; } };
let store = createPreferencesStore(() => storage);
assert.equal(store.getSnapshot().playerRadarMode, "main");
assert.equal(raw, null);
for (const playerRadarMode of PLAYER_RADAR_MODES) {
  store.savePreferences({ playerRadarMode }, store.getSnapshot());
  // A fresh owner has no in-memory state from the previous document/browser.
  store = createPreferencesStore(() => storage);
  assert.equal(store.getSnapshot().playerRadarMode, playerRadarMode);
}
store.savePreferences({ attributeSumMode: "all-five", navigationMode: "sidebar" }, store.getSnapshot());
assert.equal(createPreferencesStore(() => storage).getSnapshot().playerRadarMode, "server");
assert.equal(createPreferencesStore(() => storage).getSnapshot().attributeSumMode, "all-five");
console.log("PASS persisted category, fresh owner and independent existing preferences");

class WorkerFixture extends EventTarget {
  messages: any[] = [];
  terminated = false;
  postMessage(message: unknown) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(envelope: ExecutionEnvelope, value: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: { version: envelope.version, requestId: envelope.requestId,
      generation: envelope.generation, key: envelope.key, value } }));
  }
}
const worker = new WorkerFixture();
const transport = createAnalyticsTransport(() => worker as unknown as AnalyticsWorker, 1000);
const obsolete = new AbortController(), visible = new AbortController();
const first = transport.run("old-profile", { kind: "profile-history" }, obsolete.signal);
const second = transport.run("visible-radar", { kind: "profile-radar" }, visible.signal);
worker.dispatchEvent(new MessageEvent("message", { data: { type: "ready", version: ANALYTICS_TRANSPORT_VERSION } }));
const [a, b] = worker.messages;
const rejected = assert.rejects(first, { name: "AbortError" });
obsolete.abort(); await rejected;
assert.equal(worker.terminated, false);
assert.deepEqual(worker.messages[2], { type: "cancel", requestId: a.requestId });
worker.reply(a, "late obsolete result");
assert.equal(transport.inspect().awaits, 1);
worker.reply(b, "current comparison");
assert.equal(await second, "current comparison");
assert.equal(transport.inspect().awaits, 0);
transport.dispose();
assert.equal(worker.terminated, true);
console.log("PASS independent cancellation, ignored late result and worker lifetime");

const timedWorker = new WorkerFixture();
const timed = createAnalyticsTransport(() => timedWorker as unknown as AnalyticsWorker, 80);
const slow = timed.run("slow-extra", {}, new AbortController().signal);
const timedOut = assert.rejects(slow, /response budget exceeded/);
timedWorker.dispatchEvent(new MessageEvent("message", { data: { type: "ready", version: ANALYTICS_TRANSPORT_VERSION } }));
await new Promise(resolve => setTimeout(resolve, 30));
const independent = timed.run("independent-area", {}, new AbortController().signal);
await timedOut;
assert.equal(timedWorker.terminated, false);
timedWorker.reply(timedWorker.messages[1], "available");
assert.equal(await independent, "available");
timed.dispose();
console.log("PASS a slow supplementary area cannot time out an independent area");

const journal = await openDB("profile-loading-journal", 1, { upgrade: createLocalChangesStore });
await journal.put("localChanges", { sequence: 2, owner: "sources", kinds: ["import"], sourceIds: ["old"] });
await journal.put("localChanges", { sequence: 8, owner: "sources", kinds: ["import"], sourceIds: ["current"] });
const boundary = await readLocalDataChanges(localChangesDb(journal), 0, true);
assert.deepEqual(boundary.map(change => change.sequence), [8]);
await journal.put("localChanges", { sequence: 11, owner: "sources", kinds: ["delete"], sourceIds: ["current"] });
assert.deepEqual((await readLocalDataChanges(localChangesDb(journal), 8)).map(change => change.sequence), [11]);
journal.close();
console.log("PASS bounded journal baseline preserves the complete subsequent catch-up");
