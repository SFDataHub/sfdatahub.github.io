import 'fake-indexeddb/auto';
import { withLocalDataWrite } from '../../../../src/lib/local-data/localDataCoordination.ts';
import assert from 'node:assert/strict';
import { openDB } from 'idb';
import { inputs, scanFor } from './inputs.ts';
import { seedLocalSourceValidityFixture } from '../../localSourceValidityFixture.mts';
import { HubSearchController, defaultHubSearchQuery } from '../../../../src/lib/data-hub/hubSearchService.ts';
import * as scans from '../../../../src/lib/guilds/localScanLibrary.ts';
import { buildHubSearchProjection, hubSearchFingerprint } from '../../../../src/lib/data-hub/hubSearchProjection.ts';

const pause = () => new Promise<void>(r => setTimeout(r, 5));
async function until(check: () => boolean) { for (let i = 0; i < 3000; i++) { if (check()) return; await pause(); } throw Error('cooperative timeout'); }
const { scan } = await seedLocalSourceValidityFixture(scanFor(inputs[5], 5));
const db = await openDB('sfdatahub-local-data');
const archive = async () => ({ entries: [], failed: 0, unknown: 0 });

function observed(source = scan) {
  const seen = new Set<number>();
  const raw = source.rawData as { players: Record<string, unknown>[]; groups: unknown[] };
  return { seen, scan: { ...source, rawData: { ...raw, players: raw.players.map((p, i) => ({ ...p,
    get name() { seen.add(i); return p.name; } })) } } };
}
// Gates are used only for races. The cost browser windows use real timer tasks.
function gate(seen: Set<number>) {
  const native = globalThis.setTimeout;
  let release!: () => void;
  let held = false;
  globalThis.setTimeout = ((callback: (...args: any[]) => void, ms?: number, ...args: any[]) => {
    if (!held && ms === 0 && seen.size >= 128 && new Error().stack?.includes('hubSearchExecution')) {
      held = true;
      release = () => { globalThis.setTimeout = native; callback(...args); };
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return native(callback, ms, ...args);
  }) as typeof setTimeout;
  return { wait: () => until(() => held), release: () => release(), restore: () => { globalThis.setTimeout = native; } };
}
async function absent() { assert.equal((await scans.readHubSearchProjectionInventory()).projections.has(scan.id), false); }
const query = { ...defaultHubSearchQuery, text: 'Player' };

await scans.resetHubSearchProjections([scan.id]);
{
  const input = observed(), held = gate(input.seen);
  const controller = new HubSearchController({ loadArchive: archive, readRaw: async () => input.scan });
  try {
    controller.start(query); await held.wait();
    assert(input.seen.size > 0 && input.seen.size < 10000);
    await absent(); assert.equal(controller.getSnapshot().local.ready, 0);
    controller.dispose(); held.release(); await pause();
    await absent(); assert.deepEqual(controller.inspect(), { localDocuments: 0, archiveDocuments: 0, listeners: 0, stopped: true });
    const stoppedAt = input.seen.size; await pause(); assert.equal(input.seen.size, stoppedAt);
  } finally { held.restore(); controller.dispose(); }
}
console.log('PASS last local consumer/unmount inside a large source: partial rows reached, no commit/coverage, processing and listeners stop');

{
  const input = observed(), held = gate(input.seen);
  const one = new HubSearchController({ loadArchive: archive, readRaw: async () => input.scan });
  const two = new HubSearchController({ loadArchive: archive });
  try {
    one.start(query); await held.wait(); two.start(query); one.dispose();
    await until(() => two.getSnapshot().local.ready === 1 && !two.getSnapshot().local.preparing);
    held.release(); await pause();
    assert.equal(two.getSnapshot().hits.length, 30);
    assert((await scans.readHubSearchProjectionInventory()).projections.has(scan.id));
  } finally { held.restore(); one.dispose(); two.dispose(); }
}
console.log('PASS independent existing controllers: one cancellation preserves the other consumer and its complete persisted source');

await scans.resetHubSearchProjections([scan.id]);
{
  const input = observed(), held = gate(input.seen);
  const controller = new HubSearchController({ loadArchive: archive, readRaw: async () => input.scan });
  try {
    controller.start(query); await held.wait();
    controller.setQuery({ ...query, scope: { kind: 'historical', from: '2026-09', to: '2026-09', server: '' } });
    held.release(); await until(() => !controller.getSnapshot().local.preparing && !controller.getSnapshot().archive.preparing);
    assert.equal(controller.getSnapshot().local.ready, 1);
    assert.equal(controller.getSnapshot().scope.kind, 'historical');
    assert.equal(controller.getSnapshot().hits[0].queryGeneration, controller.getSnapshot().queryGeneration);
  } finally { held.restore(); controller.dispose(); }
}
console.log('PASS scope switch inside source retains scope-independent local work, replaces archive generation and uses the current query generation');

for (const mutation of ['reset', 'update', 'delete'] as const) {
  // Reinstall the same valid source between cases, outside the held work.
  await db.put('scans', scan); await scans.resetHubSearchProjections([scan.id]);
  const inventory = await scans.readHubSearchProjectionInventory();
  const input = observed(), held = gate(input.seen);
  const pending = scans.prepareGuildHubSearchProjection(input.scan, inventory.resetFor(scan.id));
  // Attach rejection before releasing an aborted work item.
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  try {
    await held.wait(); await absent(); assert(input.seen.size > 0 && input.seen.size < 10000);
    if (mutation === 'reset') await scans.resetHubSearchProjections([scan.id]);
    if (mutation === 'delete') await scans.deleteGuildHubLocalScans([scan.id]);
    if (mutation === 'update') {
      await scans.updateGuildHubLocalScan(scan.id, 'updated.json', JSON.stringify({ players: [{ identifier: 'f8_net_p1', prefix: 'f8_net', name: 'New valid source', timestamp: Date.UTC(2026, 9, 7) }], groups: [] }));
      assert.equal((await scans.readHubSearchProjectionInventory()).projections.get(scan.id)!.documents[0].name, 'New valid source');
    }
    const stoppedAt = input.seen.size; held.release(); await rejected;
    assert.equal(input.seen.size, stoppedAt);
    if (mutation !== 'update') await absent();
    else assert.equal((await scans.readHubSearchProjectionInventory()).projections.get(scan.id)!.documents[0].name, 'New valid source');
  } finally { held.restore(); }
  console.log(`PASS ${mutation} after document processing began: abort before next slice, no partial marker; newer valid update survives late old work`);
}

await db.put('scans', scan);
const inventory = await scans.readHubSearchProjectionInventory();
const stale = buildHubSearchProjection(scan, scans.readGuildHubSearchRows(scan), inventory.resetFor(scan.id));
await db.put('scans', { ...scan, sourceGeneration: 'opaque-a' });
assert.notEqual(hubSearchFingerprint(scan), hubSearchFingerprint({ ...scan, sourceGeneration: 'opaque-a' }));
await assert.rejects(scans.putHubSearchProjection(stale), /changed before commit/);
await absent();
await db.put('scans', scan); await scans.resetHubSearchProjections([scan.id]);
await assert.rejects(scans.putHubSearchProjection(stale), /changed before commit/);
await absent();
await assert.rejects(scans.putHubSearchProjection(stale, { allowed: () => false }), { name: 'AbortError' });
// Cancellation after computation while waiting for the existing writer lease.
let lockHeld = false, releaseLock!: () => void, allowed = true;
const blocker = withLocalDataWrite(async () => { lockHeld = true; await new Promise<void>(r => { releaseLock = r; }); });
await until(() => lockHeld);
const freshInventory = await scans.readHubSearchProjectionInventory();
const fresh = buildHubSearchProjection(scan, scans.readGuildHubSearchRows(scan), freshInventory.resetFor(scan.id));
const waitingCommit = scans.putHubSearchProjection(fresh, { allowed: () => allowed });
const cancelledCommit = assert.rejects(waitingCommit, { name: 'AbortError' });
await pause(); allowed = false; releaseLock(); await blocker; await cancelledCommit; await absent();
console.log('PASS consumer cancellation while queued on W04 writer lease: transaction check prevents payload and successful journal marker');
console.log('PASS commit still rejects opaque generation inequality, original reset mismatch and cancelled writer; no successful marker');
await scans.deleteGuildHubLocalScans([scan.id]); db.close();
