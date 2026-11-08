import { openDB } from "idb";
import { measure, pool } from "./fixture";
import * as scans from "../../../../src/lib/guilds/localScanLibrary";
import { ensureGuildAnalyticsDerivedDataFromSummaries } from "../../../../src/lib/guilds/localGuildAnalyticsStore";
import { ANALYTICS_TRANSPORT_VERSION } from "../../../../src/lib/local-player-profile/executionTransport";
import { HubFavoritesPersistence } from "../../../../src/lib/data-hub/hubFavoritesStore";
import { guildFavorite } from "../../../../src/lib/data-hub/hubFavoritesContract";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
const state = (globalThis as any).w07;
const assert = (v: unknown, why: string) => { if (!v) throw Error(why); };
const workerURLs: string[] = [];
const NativeWorker = globalThis.Worker;
globalThis.Worker = class extends NativeWorker {
  constructor(url: string | URL, options?: WorkerOptions) { workerURLs.push(String(url)); super(url, options); }
};
async function proof() {
  const analytics = await openDB('sfdatahub-guild-analytics');
  const hashes: Record<string, string> = {};
  for (const store of analytics.objectStoreNames) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(await analytics.getAll(store))));
    hashes[store] = [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  analytics.close();
  return { sources: (await scans.listGuildHubScanSummaries()).map(s => [s.sourceScanId, s.sourceGeneration, s.contentHash]), hashes,
    favorites: await new HubFavoritesPersistence().restore(), context: sessionStorage.getItem('sfdatahub:page-context:v1:local-toplist') };
}
state.productionSeed = async () => {
  await scans.ensureSfDataHubLocalDataReady();
  const db = await openDB('sfdatahub-local-data');
  for (const input of pool) {
    await db.put('scans', scans.normalizeGuildHubLocalScanForDerivation({ ...input, filename: input.id + '.json', contentHash: input.id, importedAt: '2026-08-05T12:00:00.000Z', scannedAt: '2026-08-05T12:00:00.000Z', servers: [], playerCount: input.rawData.players.length, groupCount: input.rawData.groups.length }));
    await scans.getGuildHubLocalScan(input.id);
  }
  db.close();
  const summaries = await scans.listGuildHubScanSummaries();
  await ensureGuildAnalyticsDerivedDataFromSummaries(summaries, { readSourceIds: summaries.map(s => s.sourceScanId), loadSourceById: scans.getGuildHubLocalScan });
  const favorites = new HubFavoritesPersistence(), before = await favorites.restore();
  await favorites.mutate({ type: 'save', favorite: guildFavorite({ id: 'f28_net_g1', guildId: 'g1', logoIdentifier: 'f28_net_g1', name: 'Fixture Guild', server: 'f28_net', memberCount: 50 }, 0, null, false), activateGuild: false }, before.record.recordRevision);
  pageContextStore.selectServers(['F28']);
  sessionStorage.setItem('w19n02-production-proof', JSON.stringify(await proof()));
  await navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  return { version: ANALYTICS_TRANSPORT_VERSION, controller: navigator.serviceWorker.controller?.scriptURL };
};
state.productionRun = async () => {
  const before = sessionStorage.getItem('w19n02-production-proof');
  assert(before === JSON.stringify(await proof()), 'previous source/favorite/context/Derived state retained before consumer execution');
  const rows = [await measure('dashboard', 'production ordinary start'), await measure('playgrounds', 'production remount')];
  assert(before === JSON.stringify(await proof()), 'all previously persisted bytes retained after consumers');
  return { version: ANALYTICS_TRANSPORT_VERSION, rows, workerURLs, controller: navigator.serviceWorker.controller?.scriptURL, durable: await proof() };
};
state.productionReady = true;
