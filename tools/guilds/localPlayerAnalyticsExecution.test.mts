import { outputPath } from '../codex/workspace.mjs';
import { dataHubRuntimeAudit } from "../../src/lib/data-hub/runtimeAudit";
import "fake-indexeddb/auto";
import { openDB } from "idb";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createAnalyticsExecutionQueue } from "../../src/lib/local-player-profile/executionQueue.ts";
import { ANALYTICS_TRANSPORT_VERSION, createAnalyticsTransport, type AnalyticsWorker, type ExecutionEnvelope } from "../../src/lib/local-player-profile/executionTransport.ts";
import { sharedAnalyticsPreparation, createSharedAnalyticsPreparation } from "../../src/lib/local-player-profile/sharedPreparation.ts";
import { startSharedPlayerCardsRun, startSharedGuildTrendRun } from "../../src/lib/local-player-profile/cardTrendExecution.ts";
import { acquireLocalPlayerProfile } from "../../src/lib/local-player-profile/coordinator.ts";
import { resolveLocalPlayerCurrentSeed } from "../../src/pages/GuildHub/localPlayerCurrentSeed.ts";
import { buildLocalPlayerProfileModel } from "../../src/pages/GuildHub/localPlayerProfileAdapter.ts";
import { buildDashboardPlayerCardItems, buildDashboardStaticPlayerCardItems } from "../../src/pages/GuildHub/dashboardPlayerCards.ts";
import { seedLocalSourceValidityFixture } from "./localSourceValidityFixture.mts";
import { executionInputs, anchor } from "./fixtures/localPlayerAnalyticsExecution/inputs.ts";
import { listGuildHubScanSummaries, updateGuildHubLocalScan, importGuildHubLocalScan, deleteGuildHubLocalScans } from "../../src/lib/guilds/localScanLibrary.ts";
import { linkGuildAliases } from "../../src/lib/identities/guildIdentityStore.ts";
import { linkPlayerIdentifiers } from "../../src/lib/identities/playerIdentityStore.ts";
import { resetGuildAnalyticsDerivedData } from "../../src/lib/guilds/localGuildAnalyticsStore.ts";
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => resolve = r); return { promise, resolve }; };
const pause = () => new Promise(r => setTimeout(r, 5));
async function until(test: () => boolean) { const end = Date.now() + 15000; while (!test()) {
    if (Date.now() > end)
        throw Error("Timed out");
    await pause();
} }
{
    const queue = createAnalyticsExecutionQueue(), gate = deferred(), order: string[] = [];
    const blocking = queue.acquire("running", Symbol(), "visible", () => gate.promise);
    await pause();
    const background = queue.acquire("shared", Symbol(), "visible", async () => { order.push("shared"); return 1; });
    const other = queue.acquire("other", Symbol(), "visible", async () => { order.push("other"); return 2; });
    const profile = queue.acquire("shared", Symbol(), "profile", async () => { throw Error("duplicate"); });
    assert.equal(profile.joined, true);
    assert.equal(queue.inspect().waiting.find(j => j.key === "shared")?.priority, "profile");
    gate.resolve();
    await Promise.all([blocking.promise, background.promise, other.promise, profile.promise]);
    assert.deepEqual(order, ["shared", "other"]);
    profile.release();
    background.release();
    other.release();
    blocking.release();
    const blocker = deferred();
    const held = queue.acquire("block", Symbol(), "visible", () => blocker.promise);
    await pause();
    const low = queue.acquire("promoted", Symbol(), "visible", async () => { }), high = queue.acquire("promoted", Symbol(), "profile", async () => { });
    high.release();
    assert.equal(queue.inspect().waiting.find(j => j.key === "promoted")?.priority, "visible");
    blocker.resolve();
    await Promise.all([held.promise, low.promise]);
    held.release();
    low.release();
    const cancelled = queue.acquire("cancelled", Symbol(), "visible", async () => { throw Error("must not dispatch"); });
    cancelled.release();
    await assert.rejects(cancelled.promise, { name: "AbortError" });
    const retry = queue.acquire("cancelled", Symbol(), "profile", async () => 7);
    assert.equal(await retry.promise, 7);
    retry.release();
    await pause();
    assert.equal(queue.inspect().jobs, 0);
    const fairGate = deferred(), fairOrder: string[] = [];
    const running = queue.acquire("fair-block", Symbol(), "visible", () => fairGate.promise);
    await pause();
    const old = queue.acquire("old-background", Symbol(), "visible", async () => { fairOrder.push("background"); });
    const foreground = [0, 1, 2, 3].map(i => queue.acquire(`fg-${i}`, Symbol(), "profile", async () => { fairOrder.push(`fg-${i}`); }));
    fairGate.resolve();
    await Promise.all([running.promise, old.promise, ...foreground.map(j => j.promise)]);
    assert.ok(fairOrder.indexOf("background") <= 2);
    running.release();
    old.release();
    foreground.forEach(j => j.release());
    console.log("PASS queue join/promotion/demotion, independent leases, queued cancel/retry, two-dispatch starvation bound");
}
class FakeWorker extends EventTarget {
    addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
        super.addEventListener(type, callback, options);
        if (type === "message") this.dispatchEvent(new MessageEvent("message", { data: { type: "ready", version: ANALYTICS_TRANSPORT_VERSION } }));
    }
    sent: ExecutionEnvelope[] = [];
    terminated = false;
    failSend = false;
    postMessage(value: ExecutionEnvelope) { if (this.failSend)
        throw Error("send failure"); this.sent.push(value); }
    terminate() { this.terminated = true; }
    reply(envelope = this.sent[this.sent.length - 1], extra: Record<string, unknown> = {}) { this.dispatchEvent(new MessageEvent("message", { data: { ...envelope, payload: undefined, value: 9, ...extra } })); }
}
for (const mode of ["start", "send", "error", "messageerror", "invalid", "generation", "timeout", "abort", "dispose", "business", "late"]) {
    let worker = new FakeWorker();
    const transport = createAnalyticsTransport(() => { if (mode === "start")
        throw Error("start failure"); worker = new FakeWorker(); worker.failSend = mode === "send"; return worker as unknown as AnalyticsWorker; }, 20);
    const controller = new AbortController();
    const promise = transport.run<number>("basis/version/reset/project", { kind: "fixture" }, controller.signal);
    if (mode === "error" || mode === "messageerror")
        worker.dispatchEvent(new Event(mode));
    if (mode === "invalid")
        worker.reply(undefined, { value: undefined, version: 99 });
    if (mode === "generation")
        worker.reply(undefined, { generation: 999 });
    if (mode === "abort")
        controller.abort();
    if (mode === "dispose")
        transport.dispose();
    if (mode === "business")
        worker.reply(undefined, { error: "controlled projection failure" });
    if (mode === "late") {
        const stale = { ...worker.sent[0], requestId: "stale" };
        worker.reply(stale);
        worker.reply();
        assert.equal(await promise, 9);
        worker.reply();
    }
    else
        await assert.rejects(promise);
    assert.equal(transport.inspect().awaits, 0);
    if (mode !== "start" && mode !== "business" && mode !== "late")
        assert.equal(worker.terminated, true);
    const old = worker;
    transport.dispose();
    old.reply();
    const retry = transport.run<number>("basis/version/reset/project", {}, new AbortController().signal);
    if (mode === "start")
        await assert.rejects(retry);
    else if (mode === "send")
        await assert.rejects(retry);
    else {
        worker.reply();
        assert.equal(await retry, 9);
    }
    transport.dispose();
    assert.equal(transport.inspect().workers, 0);
}
console.log("PASS worker start/send/error/messageerror/binding/generation/noresponse/cancel/terminate/business/late/duplicate/retry terminal paths");
{
    // Checkpoints neither settle work nor renew its response budget.
    const worker = new FakeWorker(), transport = createAnalyticsTransport(() => worker, 40);
    const pending = transport.run("checkpoint-timeout", {}, new AbortController().signal);
    const binding = worker.sent[0];
    worker.reply(binding, { type: "started" });
    worker.reply(binding, { type: "progress", phase: "saving-derived-analytics", workerElapsedMs: 2 });
    const heartbeat = setInterval(() => worker.reply(binding, { type: "progress", phase: "saving-derived-analytics", workerElapsedMs: 3 }), 5);
    try {
        await assert.rejects(pending, /response budget exceeded.*last worker phase saving-derived-analytics/);
    } finally { clearInterval(heartbeat); transport.dispose(); }
    assert.equal(worker.terminated, true);
    assert.equal(transport.inspect().awaits, 0);
    assert.equal(transport.inspect().workers, 0);
    for (const extra of [
        { phase: "unknown", workerElapsedMs: 1 },
        { phase: "raw-source-read", workerElapsedMs: -1 },
        { phase: "raw-source-read", workerElapsedMs: NaN },
        { phase: "raw-source-read", workerElapsedMs: 1, generation: 999 },
        { phase: "source-code-verified", workerElapsedMs: 1, codeProof: { moduleUrl: "source.ts", store: "invalid", snapshots: "0".repeat(64), values: "0".repeat(64) } },
        { phase: "source-code-verified", workerElapsedMs: 1, codeProof: null },
        { phase: "source-code-verified", workerElapsedMs: 1, codeProof: false },
    ]) {
        const candidate = new FakeWorker(), owner = createAnalyticsTransport(() => candidate, 100);
        const result = owner.run("invalid-checkpoint", {}, new AbortController().signal);
        candidate.reply(undefined, { type: "progress", ...extra });
        await assert.rejects(result, /progress|binding mismatch|code proof/);
        assert.equal(candidate.terminated, true);
        assert.equal(owner.inspect().awaits, 0);
    }
    const successWorker = new FakeWorker(), successOwner = createAnalyticsTransport(() => successWorker, 100);
    const result = successOwner.run<number>("checkpoint-success", {}, new AbortController().signal);
    successWorker.reply(undefined, { type: "progress", phase: "source-code-verified", workerElapsedMs: 1, codeProof: { moduleUrl: "source.ts", store: "0".repeat(64), snapshots: "1".repeat(64), values: "2".repeat(64) } });
    successWorker.reply(undefined, { type: "progress", phase: "analytics-transaction-committed", workerElapsedMs: 2 });
    successWorker.reply();
    assert.equal(await result, 9);
    successOwner.dispose();
}
console.log("PASS bound worker checkpoints preserve timeout details without settling/rebudgeting; invalid checkpoints fail and valid results survive");
{
    const worker = new FakeWorker();
    const transport = createAnalyticsTransport(() => worker, 100, () => { throw Error("unreadable metrics"); });
    const first = transport.run("first", {}, new AbortController().signal);
    const second = transport.run("second", {}, new AbortController().signal);
    worker.reply(worker.sent[0], { metrics: {} });
    await Promise.all([assert.rejects(first, /metrics/), assert.rejects(second, /metrics/)]);
    assert.equal(transport.inspect().awaits, 0);
    assert.equal(transport.inspect().workers, 0);
}
console.log("PASS invalid metrics terminally settle every affected transport await");
const samples = [];
for (const size of [2, 50] as const) {
    if (size === 50)
        await deleteGuildHubLocalScans(executionInputs(2).map(s => s.id));
    const rows = executionInputs(size);
    for (const input of rows)
        await seedLocalSourceValidityFixture({ ...input, filename: input.id + ".json", contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length });
    const summaries = (await listGuildHubScanSummaries()).filter(s => s.sourceScanId.startsWith(`baseline-${size}-`));
    const observation = { sourceScanId: `baseline-${size}-w06-current`, sourcePlayerKey: "f8_net_p1", sourceMemberRef: "f8_net_p1", scannedAtMs: anchor, scannedAtIso: new Date(anchor).toISOString(), guild: { name: "Fixture Guild", identifier: "f8_net_g1", server: "f8_net" } };
    const seed = await resolveLocalPlayerCurrentSeed(observation);
    assert.ok(seed);
    const profile = buildLocalPlayerProfileModel({ ...observation, rawPlayer: seed.rawPlayer, currentSeed: seed });
    const before = sharedAnalyticsPreparation.inspect(), started = performance.now();
    const cards = startSharedPlayerCardsRun({ summaries, serverFilter: null });
    const trend = startSharedGuildTrendRun({ summaries, guildTarget: { logoIdentifier: "f8_net_g1", server: "f8_net" } });
    const lease = acquireLocalPlayerProfile(profile);
    const [index, result, analytics] = await Promise.all([cards.promise, trend.promise, lease.request("analytics")]);
    assert.equal(analytics.status, "ready", analytics.reason);
    if (size === 2) {
        const refs = JSON.parse(await readFile("tools/guilds/fixtures/localPlayerAnalyticsExecution/references.json", "utf8"));
        assert.deepEqual(JSON.parse(JSON.stringify(index.index)), refs.index);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), refs.trend);
    }
    const history=await lease.request("history");assert.equal(history.value?.evidence.sourceIds.length,5,"profile reuses only its proven five-source coverage, not the broader six-source Card population");
    const active = sharedAnalyticsPreparation.inspect();
    assert.equal(active.sourceJobs - before.sourceJobs, 6, "source once, not per member/consumer");
    assert.equal(active.indexSourceBuilds - before.indexSourceBuilds, 6);
    assert.ok(active.sourceJoins - before.sourceJoins > 0);
    const jobsBeforeHit=sharedAnalyticsPreparation.inspect().dispatches;
    const second = startSharedPlayerCardsRun({ summaries, serverFilter: null });
    assert.equal((await second.promise).index, index.index, "active finished projection reused");
    assert.equal(sharedAnalyticsPreparation.inspect().dispatches,jobsBeforeHit,"finished Card reuse starts no Source or normalization work");
    second.cancel();
    cards.cancel();
    assert.ok(sharedAnalyticsPreparation.inspect().sources > 0, "other leases retain foundation");
    trend.cancel();
    lease.release();
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);
    assert.equal(sharedAnalyticsPreparation.inspect().projections, 0);
    assert.equal(sharedAnalyticsPreparation.inspect().queue.jobs, 0);
    samples.push({ size, elapsedMs: performance.now() - started, delta: Object.fromEntries(Object.entries(active).filter(([, v]) => typeof v === "number").map(([key, v]) => [key, (v as number) - (before as any)[key]])), afterRelease: sharedAnalyticsPreparation.inspect() });
}
console.log("PASS complete Card/Trend starting references, shared six sources/completeness builds, partial overlap profile, active result hit and final cleanup");
{
    const restored = executionInputs(2);
    for (const input of restored)
        await seedLocalSourceValidityFixture({ ...input, filename: input.id + ".json", contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length });
    await deleteGuildHubLocalScans(executionInputs(50).map(s=>s.id));
    const summaries = (await listGuildHubScanSummaries()).filter(s => s.sourceScanId.startsWith("baseline-2-"));
    let refreshes = 0;
    const run = startSharedPlayerCardsRun({ summaries, serverFilter: "f8_net", targetPlayerRefs: ["f8_net_p1"], includeCards: false, onRefresh: () => { refreshes++; } });
    await run.promise;
    const before = sharedAnalyticsPreparation.inspect().sourceJobs;
    await importGuildHubLocalScan("unrelated.json", JSON.stringify({ players: [{ identifier: "f8_net_p999", prefix: "f8_net", timestamp: anchor, name: "Unrelated", guildIdentifier: "f8_net_g999" }], groups: [{ identifier: "f8_net_g999", prefix: "f8_net", timestamp: anchor, name: "Unrelated", memberCount: 1 }] }));
    await run.revalidate();
    assert.equal(sharedAnalyticsPreparation.inspect().sourceJobs, before);
    assert.equal(refreshes, 0);
    const current = executionInputs(2).find(s => s.id.endsWith("w06-current"))!;
    await updateGuildHubLocalScan(current.id, "same-source.json", JSON.stringify(current.rawData));
    await until(() => refreshes > 0);
    run.cancel();
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);
}
console.log("PASS relevant generation refresh, unrelated same-server import has no preparation/recompute");

{
    const summaries = (await listGuildHubScanSummaries()).filter(s => s.sourceScanId.startsWith("baseline-2-"));
    let cardRefreshes = 0, trendRefreshes = 0;
    let latestCardIndex: unknown;
    const cards = startSharedPlayerCardsRun({ summaries, serverFilter: "f8_net", targetPlayerRefs: ["f8_net_p1"], includeCards: false, onRefresh: value => { latestCardIndex = value.index; cardRefreshes++; } });
    const trend = startSharedGuildTrendRun({ summaries, guildTarget: { logoIdentifier: "f8_net_g1", server: "f8_net" }, sourceScope: "dashboard-guild", onRefresh: () => { trendRefreshes++; } });
    await Promise.all([cards.promise, trend.promise]);
    await linkPlayerIdentifiers("f8_net_p2", "f7_net_p2", { source: "manual" });
    await until(() => cardRefreshes > 0 && trendRefreshes > 0);
    let previous = [cardRefreshes, trendRefreshes];
    await resetGuildAnalyticsDerivedData();
    await until(() => cardRefreshes > previous[0] && trendRefreshes > previous[1]);
    // Persist a change without live delivery, as another paused realm can do.
    const db = await openDB("sfdatahub-local-data");
    await db.add("localChanges", { owner: "sources", kinds: ["content"], sourceIds: ["baseline-2-w06-current"], removedSourceIds: [], servers: ["f8_net"], unknownImpact: false, committedAt: new Date().toISOString() });
    previous = [cardRefreshes, trendRefreshes];
    // The old active cache must not be reused by a new consumer with a fresh receipt.
    const joiner = startSharedPlayerCardsRun({ summaries, serverFilter: "f8_net", targetPlayerRefs: ["f8_net_p1"], includeCards: false });
    const joined = await joiner.promise;
    assert.notEqual(joined.index, latestCardIndex, "old active finished result must be rebuilt after a missed change");
    await Promise.all([cards.revalidate(), trend.revalidate()]);
    await until(() => cardRefreshes > previous[0] && trendRefreshes > previous[1]);
    joiner.cancel();
    previous = [cardRefreshes, trendRefreshes];
    await deleteGuildHubLocalScans(["baseline-2-w06-mid"]);
    await until(() => cardRefreshes > previous[0] && trendRefreshes > previous[1]);
    cards.cancel();
    trend.cancel();
    db.close();
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);
    assert.equal(sharedAnalyticsPreparation.inspect().projections, 0);
}
console.log("PASS active Card/Trend peer Identity, reset, missed journal, stale finished-hit veto, deletion and cleanup");

{
 const summary=(await listGuildHubScanSummaries()).find(s=>s.sourceScanId==="baseline-2-w06-current")!;
 const NativeWorker=globalThis.Worker;
 for(const mode of ["malformed","error","messageerror","send"]){
  let fail=true;
  (globalThis as any).Worker=class extends EventTarget {
   constructor(){super();setTimeout(()=>this.dispatchEvent(new MessageEvent("message",{data:{type:"ready",version:ANALYTICS_TRANSPORT_VERSION}})),0);}
   postMessage(envelope:ExecutionEnvelope){
    if(fail){fail=false;if(mode==="send")throw Error("source send failure");queueMicrotask(()=>this.dispatchEvent(mode==="error"||mode==="messageerror"?new Event(mode):new MessageEvent("message",{data:{...envelope,value:{data:"invalid"}}})));return;}
    void import("../../src/lib/local-player-profile/executionWork.ts").then(async({executeAnalyticsWork})=>{const value=await executeAnalyticsWork(envelope.payload as any,new AbortController().signal);this.dispatchEvent(new MessageEvent("message",{data:{...envelope,value}}));});
   }
   terminate(){}
  };
  const owner=createSharedAnalyticsPreparation(),scope=owner.acquire("visible");
  await assert.rejects(scope.ensure([summary],new AbortController().signal));
  assert.equal((await scope.ensure([summary],new AbortController().signal)).snapshots.length,2,"same Source/version demand retries after fatal/malformed transport");scope.release();await pause();assert.equal(owner.inspect().sources,0);assert.equal(owner.inspect().queue.jobs,0);assert.equal(owner.inspect().transport.awaits,0);
 }
 (globalThis as any).Worker=NativeWorker;
}
console.log("PASS physical Source malformed/error/messageerror/send failures: same-key retry, no registry/await leak");
{
    const summary = (await listGuildHubScanSummaries()).find(s => s.sourceScanId === "baseline-2-w06-current")!;
    const NativeWorker = globalThis.Worker;
    const db = await openDB("sfdatahub-local-data");
    const stored = await db.get("scanSummaries", summary.sourceScanId);
    let alterBeforeReply = true;
    (globalThis as any).Worker = class extends EventTarget {
        constructor(){super();setTimeout(()=>this.dispatchEvent(new MessageEvent("message",{data:{type:"ready",version:ANALYTICS_TRANSPORT_VERSION}})),0);}
        postMessage(envelope: ExecutionEnvelope) {
            void import("../../src/lib/local-player-profile/executionWork.ts").then(async ({ executeAnalyticsWork }) => {
                const value = await executeAnalyticsWork(envelope.payload as any, new AbortController().signal);
                if (alterBeforeReply) {
                    alterBeforeReply = false;
                    await db.put("scanSummaries", { ...stored, normalizerVersion: (stored.normalizerVersion ?? 9) - 1 });
                }
                this.dispatchEvent(new MessageEvent("message", { data: { ...envelope, value } }));
            });
        }
        terminate() { }
    };
    const owner = createSharedAnalyticsPreparation(), scope = owner.acquire("visible");
    await assert.rejects(scope.ensure([summary], new AbortController().signal), /generation changed/);
    await db.put("scanSummaries", stored);
    await scope.ensure([summary], new AbortController().signal);
    await db.put("scanSummaries", { ...stored, coreNormalizerVersion: (stored.coreNormalizerVersion ?? 1) + 1 });
    await assert.rejects(scope.ensure([summary], new AbortController().signal), /changed before preparation reuse/);
    await db.put("scanSummaries", stored);
    scope.release();
    (globalThis as any).Worker = NativeWorker;
    db.close();
    await pause();
    assert.equal(owner.inspect().sources, 0);
    assert.equal(owner.inspect().transport.awaits, 0);
}
console.log("PASS identical Source/hash with changed normalizers vetoes pending worker delivery and finished basis reuse, same-key retry");
const base = buildDashboardStaticPlayerCardItems({ members: [{ key: "missing", name: "Missing", classLabel: null, classMeta: null, level: 100, hofRank: null }], playerLookup: new Map(), developmentStatus: "loading" });
const terminal = buildDashboardPlayerCardItems({ members: base.map(b => b.member), players: [], currentSourceScanId: "absent", currentTimestampMs: anchor, baseItems: base, developmentStatus: "unavailable" });
assert.equal(terminal[0].developmentStatus, "unavailable");
assert.equal(terminal[0].card, base[0].card);
console.log("PASS exact Development mismatch is terminal unavailable, valid static Card retained");
{
    // Same-server independence, persisted readExisting and unknown metadata all
    // exercise the consumer boundary, rather than filtering only hook inputs.
    await deleteGuildHubLocalScans((await listGuildHubScanSummaries()).map(s => s.sourceScanId));
    for (const input of executionInputs(2))
        await seedLocalSourceValidityFixture({ ...input, filename: input.id + ".json", contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length });
    const template = executionInputs(2).find(s => s.id.endsWith("w06-mid"))!;
    for (let i = 0; i < 12; i++) {
        const rawData = {
            players: template.rawData.players.map((p, j) => ({ ...p, identifier: `f8_net_p${900 + i * 2 + j}`, name: `Independent ${i}/${j}`, guildIdentifier: `f8_net_g${900 + i}` })),
            groups: template.rawData.groups.map(g => ({ ...g, identifier: `f8_net_g${900 + i}`, name: `Independent ${i}` })),
        };
        await seedLocalSourceValidityFixture({ id: `scope-independent-${i}`, rawData, filename: "independent.json", contentHash: `independent-${i}`, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: ["f8_net"], playerCount: 2, groupCount: 1 });
    }
    await linkGuildAliases("f7_net_g1", "f8_net_g1", { source: "manual" });
    await linkGuildAliases("f7_g1", "f7_net_g1", { source: "manual" });
    await linkGuildAliases("f8_g1", "f8_net_g1", { source: "manual" });
    const summaries = await listGuildHubScanSummaries(), target = summaries.filter(s => s.sourceScanId.startsWith("baseline-2-"));
    const guildTarget = { logoIdentifier: "f8_net_g1", server: "f8_net" };
    const business = (value: Awaited<ReturnType<typeof startSharedGuildTrendRun>["promise"]>) => {
        const { scanCount, loadedScanCount, ...rest } = value;
        return rest;
    };
    let before = sharedAnalyticsPreparation.inspect();
    const generic = startSharedGuildTrendRun({ summaries, guildTarget });
    const original = await generic.promise;
    assert.equal(sharedAnalyticsPreparation.inspect().sourceJobs - before.sourceJobs, 18, "generic consumer keeps full inventory contract");
    generic.cancel();
    await pause();
    before = sharedAnalyticsPreparation.inspect();
    const scoped = startSharedGuildTrendRun({ summaries: target.filter(s => s.sourceScanId.endsWith("w06-current")), guildTarget, sourceScope: "dashboard-guild" });
    const result = await scoped.promise;
    assert.deepEqual(business(result), business(original), "discovered old guild aliases, complete departed-member populations and partial diagnostics survive");
    assert.equal(result.snapshots.length, 5);
    assert.equal(result.scanCount, 6);
    assert.equal(result.loadedScanCount, 6);
    assert.equal(sharedAnalyticsPreparation.inspect().sourceJobs - before.sourceJobs, 6, "persisted foreign analytics cannot reenter through readExisting");
    before = sharedAnalyticsPreparation.inspect();
    const warm = startSharedGuildTrendRun({ summaries: target.filter(s => s.sourceScanId.endsWith("w06-current")), guildTarget, sourceScope: "dashboard-guild" });
    assert.equal(await warm.promise, result);
    assert.equal(sharedAnalyticsPreparation.inspect().dispatches, before.dispatches);
    scoped.cancel();
    assert.ok(sharedAnalyticsPreparation.inspect().sources > 0, "other consumer retains needed sources");
    warm.cancel();
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);

    const db = await openDB("sfdatahub-local-data");
    const unknown = summaries.find(s => s.sourceScanId === "scope-independent-0")!;
    const historical = target.find(s => s.sourceScanId.endsWith("w06-old"))!;
    const acquire = sharedAnalyticsPreparation.acquire;
    const prepared: string[] = [];
    sharedAnalyticsPreparation.acquire = (...args) => {
        const lease = acquire(...args), ensure = lease.ensure, readExisting = lease.readExisting;
        lease.ensure = (rows, ...rest) => { prepared.push(...rows.map(s => s.sourceScanId)); return ensure(rows, ...rest); };
        lease.readExisting = (rows, ...rest) => { prepared.push(...rows.map(s => s.sourceScanId)); return readExisting(rows, ...rest); };
        return lease;
    };
    for (const metadata of [
        { ...unknown, guilds: [], fusionInventorySlices: undefined },
        { ...unknown, fusionInventorySlices: unknown.fusionInventorySlices?.map(s => ({ ...s, guildIdentifiers: undefined })) },
        { ...unknown, guilds: [], fusionInventorySlices: unknown.fusionInventorySlices?.map(s => ({ ...s, playerIdentifiers: [], guildIdentifiers: [] })) },
        { ...unknown, summaryVersion: unknown.summaryVersion - 1 },
    ]) {
        await db.put("scanSummaries", metadata);
        // A required historical source has no current guild metadata either.
        await db.put("scanSummaries", { ...historical, guilds: [], fusionInventorySlices: undefined });
        before = sharedAnalyticsPreparation.inspect();
        prepared.length = 0;
        const fallback = startSharedGuildTrendRun({ summaries: await listGuildHubScanSummaries({ ensureCurrent: false }), guildTarget, sourceScope: "dashboard-guild" });
        const value = await fallback.promise;
        assert.deepEqual(business(value), business(original));
        assert.ok(prepared.includes(unknown.sourceScanId), "unknown metadata remains a candidate before its sourcewise repair");
        assert.ok(prepared.every(id => id.startsWith("baseline-2-") || id === unknown.sourceScanId), "repair/refresh never widens into known independent sources");
        fallback.cancel();
        await pause();
    }
    sharedAnalyticsPreparation.acquire = acquire;
    await db.put("scanSummaries", unknown);
    await db.put("scanSummaries", historical);
    await db.delete("scanSummaries", historical.sourceScanId);
    const rawOnly = startSharedGuildTrendRun({ summaries: target.filter(s => s.sourceScanId.endsWith("w06-current")), guildTarget, sourceScope: "dashboard-guild" });
    assert.deepEqual(business(await rawOnly.promise), business(original), "raw-only historical source is conservatively discovered and repaired before acquisition");
    rawOnly.cancel();
    await pause();

    let refreshes = 0;
    const active = startSharedGuildTrendRun({ summaries: target, guildTarget, sourceScope: "dashboard-guild", onRefresh: () => { refreshes++; } });
    await active.promise;
    before = sharedAnalyticsPreparation.inspect();
    await importGuildHubLocalScan("new-independent.json", JSON.stringify({ players: [{ ...template.rawData.players[0], identifier: "f8_net_p8888", guildIdentifier: "f8_net_g8888", name: "Independent" }], groups: [{ ...template.rawData.groups[0], identifier: "f8_net_g8888", memberCount: 1 }] }));
    await active.revalidate();
    assert.equal(refreshes, 0);
    assert.equal(sharedAnalyticsPreparation.inspect().sourceJobs, before.sourceJobs, "new independent same-server source never enters refresh preparation");
    const addition = await importGuildHubLocalScan("new-relevant.json", JSON.stringify({ players: template.rawData.players.map(p => ({ ...p, timestamp: anchor - 86400000 })), groups: template.rawData.groups.map(g => ({ ...g, timestamp: anchor - 86400000 })) }));
    await until(() => refreshes > 0);
    const previousRefreshes = refreshes;
    const currentSource = executionInputs(2).find(s => s.id.endsWith("w06-current"))!;
    await updateGuildHubLocalScan(currentSource.id, currentSource.id + ".json", JSON.stringify(currentSource.rawData));
    await until(() => refreshes > previousRefreshes);
    active.cancel();
    await deleteGuildHubLocalScans([addition.scan.id, ...(await listGuildHubScanSummaries()).filter(s => !summaries.some(old => old.sourceScanId === s.sourceScanId)).map(s => s.sourceScanId)]);
    await pause();

    const NativeWorker = globalThis.Worker, gate = deferred();
    let reached = false, deliveries = 0;
    (globalThis as any).Worker = class extends EventTarget {
        constructor() { super(); setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "ready", version: ANALYTICS_TRANSPORT_VERSION } })), 0); }
        postMessage(envelope: ExecutionEnvelope) {
            void import("../../src/lib/local-player-profile/executionWork.ts").then(async ({ executeAnalyticsWork }) => {
                const work = envelope.payload as any;
                const value = await executeAnalyticsWork(work, new AbortController().signal);
                if (work.kind === "trend") { reached = true; await gate.promise; }
                this.dispatchEvent(new MessageEvent("message", { data: { ...envelope, value } }));
            });
        }
        terminate() { }
    };
    const abandoned = startSharedGuildTrendRun({ summaries: target, guildTarget, sourceScope: "dashboard-guild", onRefresh: () => { deliveries++; } });
    await until(() => reached);
    before = sharedAnalyticsPreparation.inspect();
    const survivor = startSharedGuildTrendRun({ summaries: target, guildTarget, sourceScope: "dashboard-guild" });
    await until(() => sharedAnalyticsPreparation.inspect().projectionJoins > before.projectionJoins);
    abandoned.cancel();
    await assert.rejects(abandoned.promise, { name: "AbortError" });
    gate.resolve();
    assert.deepEqual(business(await survivor.promise), business(original), "cancelled consumer's late worker reply remains usable by its surviving peer");
    assert.equal(deliveries, 0, "cancelled consumer never accepts late delivery");
    survivor.cancel();
    (globalThis as any).Worker = NativeWorker;
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);
    assert.equal(sharedAnalyticsPreparation.inspect().transport.awaits, 0);
    before = sharedAnalyticsPreparation.inspect();
    const unaddressed = startSharedGuildTrendRun({ summaries, sourceScope: "dashboard-guild", guildTarget: { server: "f8_net" } });
    await unaddressed.promise;
    assert.equal(sharedAnalyticsPreparation.inspect().sourceJobs - before.sourceJobs, 18, "no explicit guild identifier preserves legacy contract");
    unaddressed.cancel();
    db.close();
    await pause();
    assert.equal(sharedAnalyticsPreparation.inspect().sources, 0);
}
console.log("PASS opt-in guild scope, same-server independence, persisted foreign analytics, historical discovery/population, conservative missing/insufficient/stale metadata, legacy callers and lifetime");
// Diagnostic serialization is opt-in; changing capture cannot change physical results.
{
    const summary = (await listGuildHubScanSummaries()).find(s => s.sourceScanId === "baseline-2-w06-current")!;
    const stringify = JSON.stringify;
    let inputs = 0, outputs = 0;
    JSON.stringify = ((value: any, ...args: any[]) => {
        if (value?.kind === "source" && value.summary?.sourceScanId === summary.sourceScanId) inputs++;
        if (value?.data?.snapshots && typeof value.rawReads === "number") outputs++;
        return (stringify as any)(value, ...args);
    }) as typeof JSON.stringify;
    const captured: any[] = [];
    dataHubRuntimeAudit.console(false);
    try {
        for (const enabled of [false, true, false]) {
            enabled ? dataHubRuntimeAudit.enable() : dataHubRuntimeAudit.disable();
            inputs = outputs = 0;
            const owner = createSharedAnalyticsPreparation(), lease = owner.acquire("visible");
            try {
                const result = await lease.ensure([summary], new AbortController().signal);
                captured.push(result);
                const stats = owner.inspect();
                assert.equal(stats.dispatches, 1);
                assert.equal(stats.rawReads, 0);
                assert.equal(stats.sourceBuilds, 0);
                assert.equal(inputs, enabled ? 1 : 0, "input diagnostic stringify is actually skipped when off");
                assert.equal(outputs, enabled ? 1 : 0, "result diagnostic stringify is actually skipped when off");
                assert.equal(stats.jsonByteMeasurement.coverage, enabled ? "complete" : "not-recorded");
                assert.equal(stats.jsonByteMeasurement.inputSamples, enabled ? 1 : 0);
                assert.equal(stats.jsonByteMeasurement.resultSamples, enabled ? 1 : 0);
                assert.equal(stats.inputJsonBytes > 0, enabled);
                assert.equal(stats.resultJsonBytes > 0, enabled);
            } finally { lease.release(); }
        }
        assert.deepEqual(captured[0], captured[1]);
        assert.deepEqual(captured[1], captured[2]);
        const owner = createSharedAnalyticsPreparation(), lease = owner.acquire("visible");
        try {
            await lease.ensure([summary], new AbortController().signal);
            dataHubRuntimeAudit.enable();
            const other = (await listGuildHubScanSummaries()).find(s => s.sourceScanId !== summary.sourceScanId)!;
            await lease.ensure([other], new AbortController().signal);
            assert.equal(owner.inspect().jsonByteMeasurement.coverage, "partial");
        } finally { lease.release(); }
    } finally {
        JSON.stringify = stringify;
        dataHubRuntimeAudit.disable();
        dataHubRuntimeAudit.console(true);
    }
}
console.log("PASS audit-off/on/off skips diagnostic serialization, sampled byte coverage and physical/value parity");
if (process.env.ANALYTICS_EXECUTION_OUTPUT)
    await writeFile(outputPath(process.env.ANALYTICS_EXECUTION_OUTPUT), JSON.stringify(samples, null, 2) + "\n");
console.log(JSON.stringify(samples));
