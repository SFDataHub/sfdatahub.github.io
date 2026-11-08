import { openDB } from "idb";
import { measure, mount, waitEmpty, pool, relevant } from "./fixture";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { sharedAnalyticsPreparation } from "../../../../src/lib/local-player-profile/sharedPreparation";
import { createAnalyticsTransport, ANALYTICS_TRANSPORT_VERSION } from "../../../../src/lib/local-player-profile/executionTransport";
import { prepareAnalyticsWorkerAssets, inspectAnalyticsWorkerAssets } from "../../../../src/lib/local-player-profile/workerAssets";
import { createAnalyticsExecutionQueue } from "../../../../src/lib/local-player-profile/executionQueue";
import { startSharedPlayerCardsRun } from "../../../../src/lib/local-player-profile/cardTrendExecution";
import { ensureGuildAnalyticsDerivedDataFromSummaries } from "../../../../src/lib/guilds/localGuildAnalyticsStore";
import { HubFavoritesPersistence } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { guildFavorite } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
const state = (globalThis as any).w07;
const assert = (v: unknown, text: string) => { if (!v) throw Error(text); };
const url = `/src/workers/playerAnalytics.worker.ts?worker_file&type=module&analytics-contract=${ANALYTICS_TRANSPORT_VERSION}`;
async function durableProof() {
  const inventory = await scans.listGuildHubScanSummaries();
  const analytics = await openDB('sfdatahub-guild-analytics');
  const hashes: Record<string, string> = {};
  for (const store of analytics.objectStoreNames) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(await analytics.getAll(store))));
    hashes[store] = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  analytics.close();
  const favorites = await new HubFavoritesPersistence().restore();
  return { sources: inventory.map(s => [s.sourceScanId, s.sourceGeneration, s.contentHash]), hashes, favorites, context: sessionStorage.getItem('sfdatahub:page-context:v1:local-toplist') };
}
state.seedUpdate = async (legacyRegistration = false) => {
  await scans.ensureSfDataHubLocalDataReady();
  const db = await openDB('sfdatahub-local-data');
  for (const input of pool) {
    await db.put('scans', scans.normalizeGuildHubLocalScanForDerivation({ ...input, filename: input.id + '.json', contentHash: input.id, importedAt: '2026-08-05T12:00:00.000Z', scannedAt: '2026-08-05T12:00:00.000Z', servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length }));
    await scans.getGuildHubLocalScan(input.id);
  }
  db.close();
  const persistence = new HubFavoritesPersistence(), favorites = await persistence.restore();
  await persistence.mutate({ type: 'save', favorite: guildFavorite({ id: 'f28_net_g1', guildId: 'g1', logoIdentifier: 'f28_net_g1', name: 'Fixture Guild', server: 'f28_net', memberCount: 50 }, 0, null, false), activateGuild: false }, favorites.record.recordRevision);
  pageContextStore.selectServers(['F28']);
  const summaries = await scans.listGuildHubScanSummaries();
  await ensureGuildAnalyticsDerivedDataFromSummaries(summaries, { readSourceIds: summaries.map(s => s.sourceScanId), loadSourceById: scans.getGuildHubLocalScan });
  sessionStorage.setItem('w19n02-durable-proof', JSON.stringify(await durableProof()));
  const registration = await ServiceWorkerContainer.prototype.register.call(navigator.serviceWorker, legacyRegistration ? '/sw.js' : '/service-worker.js', { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  const cache = await caches.open('sfdatahub-cache-v2');
  const put = async (key: string, kind: string) => cache.put(key, new Response(await (await fetch('/__w07bytes?kind=' + kind)).text(), { headers: { 'Content-Type': 'text/javascript' } }));
  await put('/src/lib/local-player-profile/executionTransport.ts', 'old-module');
  await put(url, 'current-worker');
  await put('/src/workers/playerAnalytics.worker.ts?worker_file&type=module', 'old-worker');
  await put('/src/main.tsx', 'old-main');
  return { controller: navigator.serviceWorker.controller?.scriptURL, cache: await cache.keys().then(keys => keys.map(k => k.url)), active: registration.active?.state };
};
state.beforeUpdate = async () => {
  const transport = createAnalyticsTransport(() => new Worker(url, { type: 'module' }));
  let error = '';
  try { await transport.run('mixed-module-proof', { kind: 'trend' }, new AbortController().signal); } catch (e) { error = String(e); }
  assert(error.includes(`contract mismatch: expected ${ANALYTICS_TRANSPORT_VERSION}, actual 1`), 'actual current Worker + cached historical contract must reproduce mismatch: ' + error);
  const result = { error, transport: transport.inspect() };
  transport.dispose();
  return result;
};
state.afterUpdate = async () => {
  const before = JSON.parse(sessionStorage.getItem('w19n02-durable-proof')!);
  assert(JSON.stringify(await durableProof()) === JSON.stringify(before), 'real Favorites, PageContext, Source generations and all existing Derived stores retained');
  const inventory = await scans.listGuildHubScanSummaries();
  assert(inventory.length === 64, '64 existing Sources retained on normal reload');
  const rows = [await measure('dashboard', 'updated normal app start'), await measure('playgrounds', 'updated remount')];
  await mount('empty'); await waitEmpty();
  assert(JSON.stringify(await durableProof()) === JSON.stringify(before), 'successful consumers preserve all durable source and derived bytes');
  assert(typeof sharedAnalyticsPreparation.inspect().transport.renewals === 'number', 'current transport supports bounded worker renewal after replacing the historical module');
  return { rows, sources: inventory.map(s => [s.sourceScanId, s.sourceGeneration, s.contentHash]), durable: await durableProof(), assets: inspectAnalyticsWorkerAssets(), cleanup: sharedAnalyticsPreparation.inspect() };
};
state.seedCompatible = async () => {
  const bytes = await (await fetch('/__w07bytes?kind=compatible-module')).text();
  assert(bytes.includes(`ANALYTICS_TRANSPORT_VERSION = ${ANALYTICS_TRANSPORT_VERSION}`) && !bytes.includes('renewalUsed'), 'historical no-renewal implementation with only its contract tag adapted');
  const cache = await caches.open('sfdatahub-cache-v2');
  await cache.put('/src/lib/local-player-profile/executionTransport.ts', new Response(bytes, { headers: { 'Content-Type': 'text/javascript' } }));
  return { version: ANALYTICS_TRANSPORT_VERSION, historicalImplementationVersion: 2, syntheticContractTagOnly: true, cachedEarlierCompatibleModule: true };
};
state.seedHistoricalV2 = async () => {
  const bytes = await (await fetch('/__w07bytes?kind=historical-v2-module')).text();
  assert(bytes.includes('ANALYTICS_TRANSPORT_VERSION = 2') && !bytes.includes('renewalUsed'), 'actual archived v2 module without version adaptation');
  const cache = await caches.open('sfdatahub-cache-v2');
  await cache.put('/src/lib/local-player-profile/executionTransport.ts', new Response(bytes, { headers: { 'Content-Type': 'text/javascript' } }));
  return { version: 2, actualHistoricalBytes: true };
};
state.faultUpdate = async () => {
  await fetch('/__w07unavailable');
  const summaries = (await scans.listGuildHubScanSummaries()).filter(s => relevant.some(r => r.id === s.sourceScanId));
  const run = startSharedPlayerCardsRun({ summaries, serverFilter: 'f28_net' });
  let error = ''; try { await run.promise; } catch (e) { error = String(e); }
  assert(Boolean(error), 'unavailable matching Worker is terminal');
  const attempts = sharedAnalyticsPreparation.inspect().dispatches;
  await run.revalidate(); await run.revalidate();
  assert(sharedAnalyticsPreparation.inspect().dispatches === attempts, 'no unchanged automatic retry');
  run.cancel(); await waitEmpty();
  await fetch('/__w07available');
  const retry = startSharedPlayerCardsRun({ summaries, serverFilter: 'f28_net' });
  const result = await retry.promise; assert(result.index.players.some(p => p.name === 'Darth Monk'), 'explicit demand works when Worker is available again');
  retry.cancel(); await waitEmpty();
  return { error, attempts, explicitRetryPlayers: result.index.players.length, cleanup: sharedAnalyticsPreparation.inspect() };
};
state.renewShared = async () => {
  const oldModule = URL.createObjectURL(new Blob([(await (await fetch('/__w07bytes?kind=old-module')).text()).replaceAll('"/src/', '"' + location.origin + '/src/')], { type: 'text/javascript' }));
  const oldEntry = (await (await fetch('/__w07bytes?kind=current-worker')).text()).replace('/src/lib/local-player-profile/executionTransport.ts', oldModule).replaceAll('"/src/', '"' + location.origin + '/src/');
  const oldWorker = URL.createObjectURL(new Blob([oldEntry], { type: 'text/javascript' }));
  let release!: () => void, renewing!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { renewing = resolve; });
  const flags: boolean[] = [];
  const transport = createAnalyticsTransport(async (renew, signal) => {
    flags.push(renew);
    if (!renew) return new Worker(oldWorker, { type: 'module' });
    renewing(); await held; await prepareAnalyticsWorkerAssets(true, signal);
    return new Worker(url, { type: 'module' });
  }, 5000);
  const queue = createAnalyticsExecutionQueue();
  const summary = (await scans.listGuildHubScanSummaries())[0];
  const first = queue.acquire('shared-renewal', Symbol(), 'visible', signal => transport.run('native-source', { kind: 'source', summary }, signal));
  const second = queue.acquire('shared-renewal', Symbol(), 'profile', () => { throw Error('duplicate'); });
  await started; first.release(); release();
  const value = await second.promise as { data: { snapshots: unknown[] } };
  assert(value.data.snapshots.length > 0 && second.joined, 'remaining independent consumer survives native Worker renewal');
  assert(flags.join(',') === 'false,true', 'exactly one bounded native renewal');
  second.release(); transport.dispose();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(queue.inspect().jobs === 0 && queue.inspect().running === null, 'native renewal queue cleanup');
  URL.revokeObjectURL(oldModule); URL.revokeObjectURL(oldWorker);
  return { flags, transport: transport.inspect(), queue: queue.inspect() };
};
state.updateReady = true;
