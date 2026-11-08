import { startLocalPlayerIndexWorkerRun } from "../../../../src/lib/player-search/localPlayerIndexClient";
import { startPlayerPerformanceWorkerRun } from "../../../../src/pages/Playground/playerPerformanceWorkerClient";
import { prepareLocalPlayerHistory, emptyProfileBuildCounters } from "../../../../src/lib/local-player-profile/historyBasis";
import { resolveLocalPlayerCurrentSeed } from "../../../../src/pages/GuildHub/localPlayerCurrentSeed";
import { buildLocalPlayerProfileModel } from "../../../../src/pages/GuildHub/localPlayerProfileAdapter";
import { projectLocalPlayerAnalytics } from "../../../../src/components/local-player-profile/localPlayerAnalyticsModel";
import { acquireLocalPlayerProfile } from "../../../../src/lib/local-player-profile/coordinator";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { RouteFrame, routing } from "../profileBrowserGuards/RouteFrame";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import Dashboard from "../../../../src/pages/GuildHub/Dashboard";
import PlayerCardsPage from "../../../../src/pages/Playground/PlayerCardsPage";
import PlayerPerformancePage from "../../../../src/pages/Playground/PlayerPerformancePage";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { openDB } from "idb";
import { executionInputs, anchor } from "./inputs";
import { startSharedPlayerCardsRun, startSharedGuildTrendRun } from "../../../../src/lib/local-player-profile/cardTrendExecution";
import { sharedAnalyticsPreparation } from "../../../../src/lib/local-player-profile/sharedPreparation";
import { resetGuildAnalyticsDerivedData } from "../../../../src/lib/guilds/localGuildAnalyticsStore";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
void i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });
const w07 = { ready: true, uiWrites: 0, cardWrites: 0, trendWrites: 0, failRanks: false, noresponseBudget: undefined as number | undefined, unhandled: [] as string[], run: undefined as undefined | (() => Promise<string[]>), rankGate: undefined as undefined | {
        promise: Promise<void>;
        entered: () => void;
        release: () => void;
    }, result: undefined as unknown };
(globalThis as any).w07 = w07;
window.addEventListener("unhandledrejection", event => w07.unhandled.push(String(event.reason)));
(globalThis as any).w07AfterRaw = async (_id: string, stack: string) => { if (stack.includes("readRanksFromMatchedSnapshots")) {
    if (w07.rankGate) {
        w07.rankGate.entered();
        await w07.rankGate.promise;
    }
    if (w07.failRanks)
        throw Error("controlled historical ranks failure");
} };
const assert = (value: unknown, message: string) => { if (!value)
    throw Error(message); };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function until(test: () => boolean, message: string) { const end = Date.now() + 20000; while (!test()) {
    if (Date.now() > end)
        throw Error(`${message}; ${document.body.innerText}; ${JSON.stringify(sharedAnalyticsPreparation.inspect())}`);
    await act(async () => { await frame(); });
} }
async function control(action: string, kind = "source") { return (await fetch(`/__w07${action}?kind=${kind}`)).json(); }
const root = createRoot(document.getElementById("root")!);
let generation = 0;
async function mount(mode: "dashboard" | "playgrounds" | "empty") { await act(async () => root.render(<RouteFrame key={++generation} kind="dashboard">{mode === "dashboard" ? <Dashboard /> : mode === "playgrounds" ? <><div id="cards"><PlayerCardsPage /></div><div id="trend"><PlayerPerformancePage /></div></> : null}</RouteFrame>)); }
async function click(selector: string) { const button = document.querySelector<HTMLElement>(selector); assert(button, selector); await act(async () => button!.click()); }
const text = (selector: string) => document.querySelector(selector)?.textContent ?? "";
const rows = executionInputs(2).map(input => ({ ...input, rawData: { players: input.rawData.players.map(p => ({ ...p, identifier: p.identifier.replace(/f[78]_net/g, "f28_net"), prefix: "f28_net", guildIdentifier: "f28_net_g1", name: p.identifier.endsWith("_p1") ? "Darth Monk" : p.name })), groups: input.rawData.groups.map(g => ({ ...g, identifier: "f28_net_g1", prefix: "f28_net" })) } }));
w07.run = async () => {
    const passed: string[] = [];
    await scans.ensureSfDataHubLocalDataReady();
    const db = await openDB("sfdatahub-local-data");
    for (const input of rows) {
        await db.put("scans", scans.normalizeGuildHubLocalScanForDerivation({ ...input, filename: input.id + ".json", contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length }));
        await scans.getGuildHubLocalScan(input.id);
    }
    db.close();
    await control("arm");
    const started = performance.now();
    await mount("dashboard");
    await until(() => Boolean(document.querySelector('[aria-label="Darth Monk lokales Spielerprofil öffnen"]')), "actual Dashboard early static Card");
    const currentMs = performance.now() - started;
    await until(() => sharedAnalyticsPreparation.inspect().queue.running !== null, "real worker running");
    await until(() => sharedAnalyticsPreparation.inspect().queue.waiting.length > 0, "visible source work queued");
    const before = sharedAnalyticsPreparation.inspect();
    assert(before.transport.workers === 1, "one actual module Worker");
    assert(before.indexSourceBuilds === 0, "source held before index/completeness");
    await click('[aria-label="Darth Monk lokales Spielerprofil öffnen"]');
    await until(() => text('.player-profile__player-name').includes("Darth Monk"), "actual selected Current early");
    assert(routing.location?.pathname.endsWith("/f28/f28_net_p1") && new URLSearchParams(routing.location.search).get("at")===String(anchor+20*86400000), "routed current keeps latest individual observation in multi-time source");
    await until(() => sharedAnalyticsPreparation.inspect().queue.waiting.some(j => j.priority === "profile"), "profile promotes joined queued sources");
    const promoted = sharedAnalyticsPreparation.inspect();
    assert(promoted.sourceJobs === before.sourceJobs, "profile click joins source jobs without duplicate physical jobs");
    assert(promoted.sourceJoins > before.sourceJoins, "actual preparation joins");
    await click('[aria-label="Peer lokales Spielerprofil öffnen"]');await until(()=>text('.player-profile__player-name').includes("Peer"),"new selected player while prior history pending");assert(sharedAnalyticsPreparation.inspect().sourceJobs===before.sourceJobs,"new selected player reuses pending source preparation");
    await click('.profile-overlay__close');await click('[aria-label="Darth Monk lokales Spielerprofil öffnen"]');await until(()=>text('.player-profile__player-name').includes("Darth Monk"),"selected player reopen retains independent Dashboard work");
    let enter!: () => void, release!: () => void;
    const rankStarted = new Promise<void>(r => enter = r), rankPromise = new Promise<void>(r => release = r);
    w07.rankGate = { entered: enter, promise: rankPromise, release };
    await control("release");
    await rankStarted;
    await until(() => Boolean(document.querySelector('.local-player-analytics__range-select select')), "real profile Analytics before ranks");
    const select = document.querySelector<HTMLSelectElement>('.local-player-analytics__range-select select')!;
    if (select.options.length > 1) {
        await act(async () => { select.value = select.options[select.options.length - 1].value; select.dispatchEvent(new Event("change", { bubbles: true })); });
        await until(() => Boolean(document.querySelector('.local-player-analytics__range-select select')), "comparison change");
    }
    w07.failRanks = true;
    await act(async () => release());
    await until(() => text('.local-player-insights--personal-bests').includes("Some historical data"), "historical failure is partial");
    assert(text('.player-profile__player-name').includes("Darth Monk"), "historical failure keeps valid Current");
    w07.rankGate = undefined;
    w07.failRanks = false;
    await until(() => sharedAnalyticsPreparation.inspect().queue.jobs === 0, "actual card/trend/background terminal");
    assert(sharedAnalyticsPreparation.inspect().sourceJobs === 6, "six physical preparations across actual Dashboard Cards/Trend/Profile");
    assert(sharedAnalyticsPreparation.inspect().indexSourceBuilds === 6, "source indexes/completeness once");
    await click('.profile-overlay__close');
    const writes = w07.uiWrites;
    await act(async () => { await frame(); });
    assert(w07.uiWrites === writes, "no late profile writes after Close");
    assert(sharedAnalyticsPreparation.inspect().sources > 0, "Dashboard retains preparation after profile Close");
    passed.push(`actual Dashboard static Current before held worker (${currentMs.toFixed(1)} ms), competing Cards/Trend, profile source join/promotion, comparison, rank partial, independent Close`);
    const active = sharedAnalyticsPreparation.inspect();
    await mount("playgrounds");
    await until(() => text('#cards').includes("Darth Monk") && text('#trend').includes("Gildentrend") && sharedAnalyticsPreparation.inspect().queue.jobs === 0, "actual Playground cards and trend completed");
    assert(document.querySelector('#cards input')?.getAttribute("value") === "Darth Monk F28", "original standard query");
    assert(document.querySelector('#cards [role=listbox] button'), "original actual results");
    const jobsBeforeForeign = sharedAnalyticsPreparation.inspect().sourceJobs;
    await scans.importGuildHubLocalScan("unrelated.json", JSON.stringify({ players: [{ identifier: "s99_net_p1", prefix: "s99_net", name: "Unrelated", timestamp: anchor }], groups: [] }));
    await act(async () => { await frame(); });
    window.dispatchEvent(new Event("focus"));
    await act(async () => { await frame(); });
    assert(sharedAnalyticsPreparation.inspect().sourceJobs === jobsBeforeForeign, "foreign scope does not rebuild visible Playground");
    passed.push("actual F28 Playground standard search/selection/results and Gildentrend, foreign scope no rebuild");
    const moved = rows.find(source => source.id.endsWith("w06-current"))!.rawData;
    await scans.importGuildHubLocalScan("default-target-guild-move.json", JSON.stringify({
        players: moved.players.filter(player => player.timestamp === anchor).map(player => ({ ...player, timestamp: anchor + 30 * 86400000, guildIdentifier: "f28_net_g2", guildName: "Next Guild" })),
        groups: moved.groups.filter(group => group.timestamp === anchor).map(group => ({ ...group, timestamp: anchor + 30 * 86400000, identifier: "f28_net_g2", name: "Next Guild" })),
    }));
    await until(() => text('#trend').includes("Next Guild") && sharedAnalyticsPreparation.inspect().queue.jobs === 0, "default F28 target changes guild using the original selector");
    passed.push("actual default F28 GuildTrend follows Darth Monk into a newly imported guild using target-player dependencies");
    await mount("empty");
    await until(() => sharedAnalyticsPreparation.inspect().sources === 0 && sharedAnalyticsPreparation.inspect().queue.jobs === 0, "last release cleanup");
    assert(sharedAnalyticsPreparation.inspect().transport.workers === 0, "last release terminates worker");
    await resetGuildAnalyticsDerivedData();
    await control("arm");
    await mount("dashboard");
    await until(() => Boolean(document.querySelector('[aria-label="Darth Monk lokales Spielerprofil öffnen"]')), "reopen actual Dashboard Current");
    await click('[aria-label="Darth Monk lokales Spielerprofil öffnen"]');
    await until(() => sharedAnalyticsPreparation.inspect().queue.waiting.some(j => j.priority === "profile"), "pending reopened profile");
    await click('.profile-overlay__close');
    const pendingWrites = w07.uiWrites;
    await control("release");
    await until(() => sharedAnalyticsPreparation.inspect().queue.jobs === 0, "remaining visible jobs survive pending profile Close");
    assert(w07.uiWrites === pendingWrites, "no late UIwrites from pending closed profile");
    await mount("empty");
    await until(() => sharedAnalyticsPreparation.inspect().sources === 0 && sharedAnalyticsPreparation.inspect().queue.jobs === 0, "cancel/unmount final registry empty");
    await control("arm", "cards");
    w07.noresponseBudget = 1000;
    await mount("dashboard");
    await until(() => Boolean(document.querySelector('[aria-label="Darth Monk lokales Spielerprofil öffnen"]')), "static Card before noresponse");
    await until(() => document.body.innerText.includes("Player Cards konnten nicht berechnet werden"), "real Worker noresponse terminal Card error");
    assert(document.querySelector('[aria-label="Darth Monk lokales Spielerprofil öffnen"]'), "historical noresponse keeps static Card");
    await control("release", "cards");
    await mount("empty");
    await until(() => sharedAnalyticsPreparation.inspect().queue.jobs === 0 && sharedAnalyticsPreparation.inspect().sources === 0, "noresponse and Unmount release");
    w07.noresponseBudget = undefined;
    passed.push("actual Worker stalled Card dispatch: finite watchdog error, static Current retained, late reply ignored, final Unmount cleanup (test budget 1000 ms; production 30000 ms)");
    assert(w07.unhandled.length === 0, `no unhandled errors ${w07.unhandled}`);
    await act(async () => root.unmount());
    passed.push(`real browser IDB/Worker: source jobs ${active.sourceJobs}, source indexes ${active.indexSourceBuilds}, joins ${active.sourceJoins}, DTO input/result ${active.inputJsonBytes}/${active.resultJsonBytes} bytes, worker roundtrips ${active.roundtripMs.toFixed(1)} ms; after last release sources/projections/worker/awaits all zero; pending Close no late writes`);
    return passed;
};
(globalThis as any).w07.measure = async (mode: "before" | "after", size: 2 | 50) => {
    await scans.ensureSfDataHubLocalDataReady();
    const db = await openDB("sfdatahub-local-data");
    const inputs = executionInputs(size);
    for (const input of inputs) {
        await db.put("scans", scans.normalizeGuildHubLocalScanForDerivation({ ...input, filename: input.id + ".json", contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length }));
        await scans.getGuildHubLocalScan(input.id);
    }
    db.close();
    const started = performance.now();
    const summaries = await scans.listGuildHubScanSummaries();
    const observation = { sourceScanId: `baseline-${size}-w06-current`, sourcePlayerKey: "f8_net_p1", sourceMemberRef: "f8_net_p1", scannedAtMs: anchor, scannedAtIso: new Date(anchor).toISOString(), guild: { name: "Fixture Guild", identifier: "f8_net_g1", server: "f8_net" } };
    const seed = await resolveLocalPlayerCurrentSeed(observation);
    assert(seed, "measurement exact Current");
    const profile = buildLocalPlayerProfileModel({ ...observation, rawPlayer: seed!.rawPlayer, currentSeed: seed! });
    const currentUsableMs = performance.now() - started;
    const workerStats = { starts: 0, startCallMs: 0, sendCallMs: 0, live: 0, peak: 0, releases: 0, releaseCallMs: 0 };
    const NativeWorker = globalThis.Worker;
    (globalThis as any).Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) { const at = performance.now(); super(url, options); workerStats.starts++; workerStats.startCallMs += performance.now() - at; workerStats.live++; workerStats.peak = Math.max(workerStats.peak, workerStats.live); }
        postMessage(message: any, options?: any) { const at = performance.now(); super.postMessage(message, options); workerStats.sendCallMs += performance.now() - at; }
        terminate() { const at = performance.now(); super.terminate(); workerStats.live--; workerStats.releases++; workerStats.releaseCallMs += performance.now() - at; }
    };
    await control("resetmetrics");
    const workAt = performance.now();
    let outputs: unknown, counters: unknown, profileUsableMs = 0;
    if (mode === "before") {
        const cards = startLocalPlayerIndexWorkerRun({ summaries, serverFilter: null });
        const trend = startPlayerPerformanceWorkerRun({ summaries, guildTarget: { logoIdentifier: "f8_net_g1", server: "f8_net" } });
        const profileCounters = emptyProfileBuildCounters();
        const historical = (async () => { const basis = await prepareLocalPlayerHistory(profile, new AbortController().signal, profileCounters, () => { }); const at = performance.now(); const analytics = projectLocalPlayerAnalytics(profile, basis); profileCounters.analyticsCpuMs += performance.now() - at; profileUsableMs = performance.now() - workAt; return analytics; })();
        const [index, guild, analytics] = await Promise.all([cards.promise, trend.promise, historical]);
        outputs = { index: index.index, trend: guild, analytics };
        counters = profileCounters;
        cards.cancel();
        trend.cancel();
    }
    else {
        const cards = startSharedPlayerCardsRun({ summaries, serverFilter: null });
        const trend = startSharedGuildTrendRun({ summaries, guildTarget: { logoIdentifier: "f8_net_g1", server: "f8_net" } });
        const lease = acquireLocalPlayerProfile(profile);
        const historical = lease.request("analytics").then(part => { profileUsableMs = performance.now() - workAt; assert(part.value, part.reason ?? "historical model"); return part.value; });
        const [index, guild, analytics] = await Promise.all([cards.promise, trend.promise, historical]);
        outputs = { index: index.index, trend: guild, analytics };
        counters = { execution: sharedAnalyticsPreparation.inspect(), profile: { ...lease.counters } };
        cards.cancel();
        trend.cancel();
        lease.release();
    }
    const elapsedMs = performance.now() - workAt;
    await frame();
    const events = await control("state");
    (globalThis as any).Worker = NativeWorker;
    return { mode, size, sources: summaries.length, rows: inputs.reduce((n, s) => n + s.rawData.players.length, 0), currentUsableMs, profileUsableMs, elapsedMs, workerStats, counters, events, afterRelease: sharedAnalyticsPreparation.inspect(), outputs: JSON.parse(JSON.stringify(outputs)) };
};
