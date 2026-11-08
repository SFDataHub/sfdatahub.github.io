import { act } from "react";
import { createRoot } from "react-dom/client";
import { openDB } from "idb";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import { RouteFrame } from "../profileBrowserGuards/RouteFrame";
import Dashboard from "../../../../src/pages/GuildHub/Dashboard";
import PlayerCardsPage from "../../../../src/pages/Playground/PlayerCardsPage";
import PlayerPerformancePage from "../../../../src/pages/Playground/PlayerPerformancePage";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { sharedAnalyticsPreparation } from "../../../../src/lib/local-player-profile/sharedPreparation";
import { startSharedPlayerCardsRun } from "../../../../src/lib/local-player-profile/cardTrendExecution";
import { DERIVED_ANALYTICS_VERSION } from "../../../../src/lib/guilds/localGuildAnalyticsStore";
import { executionInputs, anchor } from "../localPlayerAnalyticsExecution/inputs";
import { player, group, DAY } from "../localPlayerAnalyticsCoordinator/inputs";
import { createAnalyticsTransport, ANALYTICS_TRANSPORT_VERSION } from "../../../../src/lib/local-player-profile/executionTransport";
import type { LocalPlayerIndexWorkerRunResult } from "../../../../src/lib/player-search/localPlayerIndexClient";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
void i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, initImmediate: false });
const w07 = { ready: true, noresponseBudget: undefined as number | undefined, uiWrites: 0, run: undefined as undefined | (() => Promise<unknown>) };
(globalThis as any).w07 = w07;
const root = createRoot(document.getElementById("root")!);
const assert = (value: unknown, message: string) => { if (!value) throw Error(message); };
const frame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
// React's act is development-only. Production asset proofs wait for actual
// browser frames; existing development regressions retain their act boundary.
const fixtureAct = import.meta.env.PROD ? async (work: () => void | Promise<void>) => { await work(); await frame(); } : act;
async function until(test: () => boolean, message: string) {
  const end = performance.now() + 55000;
  while (!test()) { if (performance.now() > end) throw Error(`${message}; ${document.body.innerText}; ${JSON.stringify(sharedAnalyticsPreparation.inspect())}`); await fixtureAct(async () => { await frame(); }); }
}
let generation = 0;
async function mount(mode: "dashboard" | "playgrounds" | "empty") {
  await fixtureAct(async () => root.render(<RouteFrame key={++generation} kind="dashboard">{mode === "dashboard" ? <div id="dashboard"><Dashboard /></div> : mode === "playgrounds" ? <><div id="cards"><PlayerCardsPage /></div><div id="trend"><PlayerPerformancePage /></div></> : null}</RouteFrame>));
}
const txt = (selector: string) => document.querySelector(selector)?.textContent ?? "";
const relevant = executionInputs(50).map(input => ({ ...input, rawData: {
  players: input.rawData.players.map(p => ({ ...p, identifier: p.identifier.replace(/f[78]_net/g, "f28_net"), prefix: "f28_net", guildIdentifier: "f28_net_g1", name: p.identifier.endsWith("_p1") ? "Darth Monk" : p.name })),
  groups: input.rawData.groups.map(g => ({ ...g, identifier: "f28_net_g1", prefix: "f28_net" })),
} }));
const large = relevant.find(s => s.id.endsWith("w06-current"))!;
large.rawData.players = Array.from({ length: 25 }, (_, i) => Array.from({ length: 50 }, (_, j) => ({ ...player(anchor + (i - 4) * DAY, j + 1, "f28_net", 1000 + i * 100 + j, 100 + i, 50 - i), name: j === 0 ? "Darth Monk" : `Peer ${j + 1}` }))).flat();
large.rawData.groups = Array.from({ length: 25 }, (_, i) => ({ ...group(anchor + (i - 4) * DAY, "f28_net", 50), memberCount: 50 as const }));
// A real server file also contains players outside the selected guild: 1,050
// distinct players in its latest time, including the 50 target-guild members.
for (let i = 0; i < 20; i++) {
  const guildIdentifier = `f28_net_g${100 + i}`, guildName = `Other Guild ${i}`;
  large.rawData.groups.push({ ...group(anchor + 20 * DAY, 'f28_net', 50), identifier: guildIdentifier, name: guildName, memberCount: 50 });
  for (let j = 0; j < 50; j++) large.rawData.players.push({ ...player(anchor + 20 * DAY, 10001 + i * 50 + j, 'f28_net'), guildIdentifier, guildName, name: `Outsider ${i * 50 + j}` });
}
const foreign = Array.from({ length: 58 }, (_, i) => ({ id: `w19-foreign-${i}`, rawData: { players: Array.from({ length: 80 }, (_, j) => player(anchor - i * DAY, j + 1, `s${i + 10}_net`)), groups: [group(anchor - i * DAY, `s${i + 10}_net`, 80)] } }));
const pool = [...relevant, ...foreign];
(globalThis as any).w07.proofMismatch = async () => {
  await scans.ensureSfDataHubLocalDataReady();
  const db = await openDB('sfdatahub-local-data');
  await db.put('scans', scans.normalizeGuildHubLocalScanForDerivation({ ...large, filename: 'large.json', contentHash: large.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: large.rawData.players.length, groupCount: large.rawData.groups.length }));
  await scans.getGuildHubLocalScan(large.id); db.close();
  const actual = (await scans.listGuildHubScanSummaries())[0];
  const expected = { ...actual, snapshotTimestamps: [anchor] };
  const run = startSharedPlayerCardsRun({ summaries: [expected], serverFilter: 'f28_net' });
  let error: string | undefined, playerCount: number | undefined;
  try { playerCount = (await run.promise).index.players.length; } catch (e) { error = String(e); }
  finally { run.cancel(); }
  return { error, playerCount, sourceId: actual.sourceScanId, generation: actual.sourceGeneration, hash: actual.contentHash, normalizer: actual.normalizerVersion, core: actual.coreNormalizerVersion, expectedTimes: expected.snapshotTimestamps, actualTimes: actual.snapshotTimestamps };
};
const longtasks: { start: number; duration: number }[] = [];
new PerformanceObserver(list => { for (const e of list.getEntries()) longtasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: "longtask", buffered: true });
async function waitEmpty() { await until(() => sharedAnalyticsPreparation.inspect().scopes === 0 && sharedAnalyticsPreparation.inspect().queue.jobs === 0, "independent cleanup"); }
async function measure(mode: "dashboard" | "playgrounds", state: string) {
  const before = sharedAnalyticsPreparation.inspect(), at = performance.now();
  const startedWallMs = Date.now();
  await mount(mode);
  let currentMs: number | undefined, cardsMs: number | undefined, trendMs: number | undefined;
  await until(() => {
    if (mode === "dashboard") {
      if (currentMs === undefined && document.querySelector('#dashboard [data-member-card="f28_net_p1"] [data-member-profile]')) currentMs = performance.now() - at;
      if (cardsMs === undefined && currentMs !== undefined && document.querySelectorAll('#dashboard [data-member-card]').length === 50 && document.querySelector('#dashboard [data-member-card="f28_net_p1"] [data-member-delta][data-direction="unchanged"]')) cardsMs = performance.now() - at;
      if (trendMs === undefined && document.querySelector(`#dashboard [data-guild-trend] svg[role="img"] [data-scan-at="${anchor + 20 * DAY}"]`) && !txt('#dashboard').includes('Gildentrend konnte nicht')) trendMs = performance.now() - at;
    } else {
      if (cardsMs === undefined && document.querySelector('#cards [role="listbox"] button') && document.querySelector('#cards [aria-label="Entwicklung"]')) cardsMs = performance.now() - at;
      if (trendMs === undefined && txt('#trend').includes('Vollständige Snapshots') && txt('#trend').includes('Fixture Guild')) trendMs = performance.now() - at;
    }
    return cardsMs !== undefined && trendMs !== undefined && sharedAnalyticsPreparation.inspect().queue.jobs === 0;
  }, `${state} ${mode} valid Cards and Trend`);
  assert(!/konnte nicht|konnten nicht/.test(txt(mode === 'dashboard' ? '#dashboard' : '#cards') + txt('#trend')), "no terminal load error");
  if (mode === "playgrounds") {
    assert(document.querySelector<HTMLInputElement>('#cards input')?.value === 'Darth Monk F28' && document.querySelector('#cards article[aria-label="Darth Monk Player Card"]'), "existing F28 search and selected Darth Monk Card");
    const latestDate = new Date(anchor + 20 * DAY).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    assert(txt('#trend').includes('f28_g1') && txt('#trend').includes(latestDate), `existing canonical default target and latest individual observation (${latestDate}); ${txt('#trend').slice(0, 1200)}`);
  }
  const after = sharedAnalyticsPreparation.inspect();
  const dashboardDom = mode === 'dashboard' ? {
    memberCards: document.querySelectorAll('#dashboard [data-member-card]').length,
    player: document.querySelector('#dashboard [data-member-card="f28_net_p1"]')?.textContent,
    values: [...document.querySelectorAll('#dashboard [data-member-card="f28_net_p1"] [data-member-value]')].map(e => e.textContent),
    trendTimes: [...document.querySelectorAll('#dashboard [data-guild-trend] [data-scan-at]')].map(e => e.getAttribute('data-scan-at')),
  } : undefined;
  if (dashboardDom) {
    assert(dashboardDom.memberCards === 50 && dashboardDom.player?.includes('Darth Monk'), 'actual current roster cards after update');
    assert(dashboardDom.values.includes('100'), 'actual fixture player level after update');
    assert(dashboardDom.trendTimes.includes(String(anchor + 20 * DAY)), 'actual latest individual guild observation plotted');
  }
  const result = { state, mode, currentMs, cardsMs, trendMs, dashboardDom, elapsedMs: performance.now() - at,
    startedWallMs, completedWallMs: Date.now(),
    sourceJobs: after.sourceJobs - before.sourceJobs, sourceBuilds: after.sourceBuilds - before.sourceBuilds, rawReads: after.rawReads - before.rawReads,
    normalizationRawReads: after.normalizationRawReads - before.normalizationRawReads, normalizationRenewals: after.normalizationRenewals - before.normalizationRenewals, normalizationJoins: after.normalizationJoins - before.normalizationJoins,
    dispatches: after.dispatches - before.dispatches, sourceJoins: after.sourceJoins - before.sourceJoins,
    queueWaitMs: after.queue.queueWaitMs - before.queue.queueWaitMs, dispatchElapsedMs: after.queue.dispatchElapsedMs - before.queue.dispatchElapsedMs,
    roundtripMs: after.roundtripMs - before.roundtripMs, inputBytes: after.inputJsonBytes - before.inputJsonBytes,
    longtasks: longtasks.filter(e => e.start >= at), transport: after.transport };
  await mount('empty'); await waitEmpty();
  return result;
}
export { measure, mount, waitEmpty, pool, relevant, large };
w07.run = async () => {
  const legacyWorkerUrl = '/src/workers/playerAnalytics.worker.ts?worker_file&type=module';
  const cache = await caches.open('w19-isolated-legacy');
  await cache.put(legacyWorkerUrl, new Response(await (await fetch('/__w19legacy.js')).text(), { headers: { 'Content-Type': 'text/javascript' } }));
  await navigator.serviceWorker.register('/__w19sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  await until(() => Boolean(navigator.serviceWorker.controller), 'isolated legacy worker cache controller');
  const stale = createAnalyticsTransport(() => new Worker(legacyWorkerUrl, { type: 'module' }), 1000);
  let staleError = '';
  try { await stale.run('stale-contract', { kind: 'trend' }, new AbortController().signal); } catch (e) { staleError = String(e); }
  assert(staleError.includes('awaiting-ready') && stale.inspect().workers === 0, 'historical cached worker ignores v2 request, terminal no response');
  await scans.ensureSfDataHubLocalDataReady();
  const db = await openDB('sfdatahub-local-data');
  for (const input of pool) {
    await db.put('scans', scans.normalizeGuildHubLocalScanForDerivation({ ...input, filename: input.id + '.json', contentHash: input.id, importedAt: new Date(anchor).toISOString(), scannedAt: new Date(anchor).toISOString(), servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length }));
    await scans.getGuildHubLocalScan(input.id);
  }
  db.close();
  const results = [];
  results.push(await measure('dashboard', 'cold'));
  results.push(await measure('playgrounds', 'warm'));
  results.push(await measure('dashboard', 'warm'));
  const analytics = await openDB('sfdatahub-guild-analytics');
  const stores = [...analytics.objectStoreNames];
  const sourceStore = stores.find(s => s.toLowerCase().includes('source'))!;
  const beforeSources = await analytics.getAll(sourceStore);
  const foreignBefore = JSON.stringify(beforeSources.filter(s => foreign.some(f => f.id === s.sourceScanId)));
  for (const s of beforeSources.filter(s => relevant.some(r => r.id === s.sourceScanId))) await analytics.put(sourceStore, { ...s, derivedVersion: DERIVED_ANALYTICS_VERSION - 1 });
  analytics.close();
  const local = await openDB('sfdatahub-local-data');
  for (const r of relevant) {
    const s = await local.get('scans', r.id), summary = await local.get('scanSummaries', r.id);
    await local.put('scans', { ...s, normalizerVersion: 8, coreNormalizerVersion: 0 });
    await local.put('scanSummaries', { ...summary, normalizerVersion: 8, coreNormalizerVersion: 0 });
  }
  local.close();
  results.push(await measure('playgrounds', 'older normalizers and derived'));
  results.push(await measure('dashboard', 'renewed warm'));
  const agedAnalytics = await openDB('sfdatahub-guild-analytics');
  const agedLibrary = await openDB('sfdatahub-local-data');
  for (const [i, r] of relevant.entries()) {
    await agedAnalytics.put(sourceStore, { ...(await agedAnalytics.get(sourceStore, r.id)), derivedVersion: DERIVED_ANALYTICS_VERSION - 1 });
    await agedLibrary.put('scans', { ...(await agedLibrary.get('scans', r.id)), normalizerVersion: 8, coreNormalizerVersion: 0 });
    await agedLibrary.put('scanSummaries', { ...(await agedLibrary.get('scanSummaries', r.id)), normalizerVersion: 8, coreNormalizerVersion: 0, ...(i === 0 ? { summaryVersion: 4 } : {}) });
  }
  agedAnalytics.close(); agedLibrary.close();
  results.push(await measure('dashboard', 'older mixed Summary, normalizers and derived'));
  const inventory = await scans.listGuildHubScanSummaries();
  assert(inventory.length === 64 && foreign.every(f => inventory.some(s => s.sourceScanId === f.id)), 'all independent foreign Sources retained');
  // Actual historical worker, frozen to its former transport version, is served
  // by the isolated runner. This short budget is a fault test, never a cost run.
  const native = new Worker(new URL('../../../../src/workers/playerAnalytics.worker.ts', import.meta.url).href + `&analytics-contract=${ANALYTICS_TRANSPORT_VERSION}`, { type: 'module' });
  const mismatch = await new Promise<any>(resolve => { native.addEventListener('message', event => { if (event.data.requestId === 'old-client') resolve(event.data); }); native.postMessage({ version: ANALYTICS_TRANSPORT_VERSION - 1, requestId: 'old-client', generation: 0, key: 'contract', payload: {} }); });
  native.terminate(); assert(mismatch.error?.includes('contract mismatch'), 'current worker explicitly rejects old client');
  await fetch('/__w07arm?kind=cards');
  let delivered = 0, refreshed: unknown, failed: unknown;
  const run = startSharedPlayerCardsRun({ summaries: inventory.filter(s => relevant.some(r => r.id === s.sourceScanId)), serverFilter: 'f28_net', onRefresh: value => { delivered++; refreshed = value; }, onError: e => { failed = e; } });
  let firstResult: unknown, firstError: unknown;
  void run.promise.then(v => { delivered++; firstResult = v; }, e => { firstError = e; });
  await until(() => sharedAnalyticsPreparation.inspect().transport.lastDispatch?.phase === 'executing' && sharedAnalyticsPreparation.inspect().queue.running?.includes('"cards"') === true, 'held real cards projection');
  const heldProof = sharedAnalyticsPreparation.inspect().transport.lastDispatch;
  await scans.updateGuildHubLocalScan(large.id, 'updated.json', JSON.stringify({ ...large.rawData, players: large.rawData.players.map(p => ({ ...p, level: 101 })) }));
  await fetch('/__w07release?kind=cards');
  await until(() => Boolean(firstResult || refreshed || failed || firstError) && sharedAnalyticsPreparation.inspect().queue.jobs === 0, 'new valid Source response after update');
  assert(!failed && !firstError && delivered === 1, 'old held result rejected, exactly one current publication');
  const updatedPlayer = ((firstResult ?? refreshed) as LocalPlayerIndexWorkerRunResult).index.players.find(p => p.name === 'Darth Monk');
  assert(updatedPlayer?.sourceScanId === large.id && updatedPlayer.scannedAtMs === anchor + 20 * DAY && updatedPlayer.card.level === 101, 'new publication contains the changed level at the original latest observation');
  run.cancel(); await waitEmpty();
  const NativeWorker = globalThis.Worker;
  const crashUrl = URL.createObjectURL(new Blob(['throw Error("controlled W19 native worker failure")'], { type: 'text/javascript' }));
  (globalThis as any).Worker = class extends NativeWorker { constructor(_url: string | URL, options?: WorkerOptions) { super(crashUrl, options); } };
  const errorRun = startSharedPlayerCardsRun({ summaries: await scans.listGuildHubScanSummaries(), serverFilter: 'f28_net' });
  let workerError = '';
  try { await errorRun.promise; } catch (e) { workerError = String(e); }
  assert(workerError.includes('controlled W19 native worker failure'), 'actual worker error is terminal');
  const afterError = sharedAnalyticsPreparation.inspect().dispatches;
  await errorRun.revalidate(); await errorRun.revalidate();
  assert(sharedAnalyticsPreparation.inspect().dispatches === afterError, 'unchanged failure has no automatic retry or fallback');
  errorRun.cancel(); await waitEmpty();
  (globalThis as any).Worker = NativeWorker;
  URL.revokeObjectURL(crashUrl);
  const retry = startSharedPlayerCardsRun({ summaries: (await scans.listGuildHubScanSummaries()).filter(s => relevant.some(r => r.id === s.sourceScanId)), serverFilter: 'f28_net' });
  assert((await retry.promise).index.players.length > 0, 'explicit new demand gets a fresh matching worker');
  retry.cancel(); await waitEmpty();
  const finalAnalytics = await openDB('sfdatahub-guild-analytics');
  const foreignAfter = JSON.stringify((await finalAnalytics.getAll(sourceStore)).filter(s => foreign.some(f => f.id === s.sourceScanId)));
  finalAnalytics.close();
  assert(foreignAfter === foreignBefore, 'unrelated persisted materializations are unchanged by version repairs, warm requests, fault tests and retry');
  await act(async () => root.unmount());
  return { pool: { physicalSources: pool.length, relevantSources: relevant.length, foreignSources: foreign.length, observations: pool.reduce((n, p) => n + p.rawData.players.length, 0), largeSource: large.id, largeObservations: large.rawData.players.length, targetMembersPerSnapshot: 50, additionalCurrentPlayers: 1000, physicalLatestPlayers: 1050, physicalLatestGuilds: 21, largeTimes: 25, foreignObservations: foreign.reduce((n, p) => n + p.rawData.players.length, 0), analyticsSourceStore: sourceStore, initialMaterializations: beforeSources.length }, results, staleError, staleTransport: stale.inspect(), mismatch, heldProof, delivered, updatedObservation: { sourceScanId: updatedPlayer?.sourceScanId, scannedAtMs: updatedPlayer?.scannedAtMs, level: updatedPlayer?.card.level }, workerError, noAutomaticRetry: sharedAnalyticsPreparation.inspect().transport.awaits === 0, cleanup: sharedAnalyticsPreparation.inspect() };
};
