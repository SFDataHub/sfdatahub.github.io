import assert from "node:assert/strict";
import { createAnalyticsTransport, ANALYTICS_TRANSPORT_VERSION, type ExecutionEnvelope, type AnalyticsWorker } from "../../src/lib/local-player-profile/executionTransport.ts";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
class HandshakeWorker extends EventTarget {
    sent: ExecutionEnvelope[] = [];
    terminated = false;
    messageListener?: EventListenerOrEventListenerObject | null;
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) { super.addEventListener(type, callback, options); if (type === "message") this.messageListener = callback; }
    postMessage(envelope: ExecutionEnvelope) { this.sent.push(envelope); }
    terminate() { this.terminated = true; }
    ready(version = ANALYTICS_TRANSPORT_VERSION) { this.dispatchEvent(new MessageEvent("message", { data: { type: "ready", version } })); }
    reply(value = 9) { this.dispatchEvent(new MessageEvent("message", { data: { ...this.sent.at(-1), value } })); }
}
{
    const workers: HandshakeWorker[] = [], renew: boolean[] = [];
    const transport = createAnalyticsTransport(fresh => { renew.push(fresh); const worker = new HandshakeWorker(); workers.push(worker); return worker; }, 1000);
    const result = transport.run<number>("same-demand", {}, new AbortController().signal);
    assert.equal(workers[0].sent.length, 0, "no payload before Ready");
    const late = workers[0].messageListener as EventListener;
    workers[0].ready(1);
    assert.deepEqual(renew, [false, true]);
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[1].sent.length, 0);
    late(new MessageEvent("message", { data: { type: "ready", version: 1 } }));
    late(new MessageEvent("message", { data: { type: "ready", version: 2 } }));
    assert.equal(workers[1].sent.length, 0, "retired Ready cannot send replacement work");
    workers[1].ready(); workers[1].reply();
    assert.equal(await result, 9);
    assert.equal(transport.inspect().renewals, 1);
    transport.dispose();
    console.log("PASS Ready before dispatch, one renewal, old instance events cannot alter replacement");
}
{
    const workers: HandshakeWorker[] = [];
    const transport = createAnalyticsTransport(() => { const w = new HandshakeWorker(); workers.push(w); return w; }, 1000);
    const bad = transport.run("unavailable", {}, new AbortController().signal);
    const rejection = assert.rejects(bad, new RegExp(`contract mismatch: expected ${ANALYTICS_TRANSPORT_VERSION}, actual 1`));
    workers[0].ready(1); workers[1].ready(1); await rejection;
    assert.equal(workers.length, 2); assert.ok(workers.every(w => w.terminated));
    assert.equal(transport.inspect().awaits, 0);
    const retry = transport.run("explicit-new-demand", {}, new AbortController().signal);
    workers[2].ready(); workers[2].reply(11); assert.equal(await retry, 11); transport.dispose();
    console.log("PASS repeated incompatibility terminal after two instances; explicit retry succeeds");
}
{
    let release!: (worker: AnalyticsWorker) => void, call = 0;
    const abandoned = new HandshakeWorker(), replacement = new HandshakeWorker();
    const transport = createAnalyticsTransport(() => ++call === 1 ? new Promise(resolve => { release = resolve; }) : replacement, 1000);
    const first = transport.run("abandoned-assets", {}, new AbortController().signal);
    const rejection = assert.rejects(first, { name: "AbortError" });
    transport.dispose(); await rejection;
    const second = transport.run("replacement-assets", {}, new AbortController().signal);
    release(abandoned); await tick();
    assert.equal(abandoned.terminated, true); assert.equal(replacement.terminated, false);
    replacement.ready(); replacement.reply(12); assert.equal(await second, 12); transport.dispose();
    console.log("PASS late async acquisition terminates its own worker without retiring the replacement");
}
{
    const worker = new HandshakeWorker();
    const transport = createAnalyticsTransport(() => worker, 20);
    await assert.rejects(transport.run("no-ready", {}, new AbortController().signal), /awaiting-ready/);
    assert.equal(worker.sent.length, 0); assert.equal(worker.terminated, true); assert.equal(transport.inspect().awaits, 0);
    console.log("PASS missing Ready has no execution and ends within the original request budget");
}
