import * as scans from '../../../../src/lib/guilds/localScanLibrary';
import { HubSearchController, defaultHubSearchQuery } from '../../../../src/lib/data-hub/hubSearchService';
import type { GuildHubLocalScan } from '../../../../src/lib/guilds/localScanLibrary';

const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
async function until(test: () => boolean) {
  for (let i = 0; i < 2000; i++) { if (test()) return; await new Promise(r => setTimeout(r, 5)); }
  throw Error('browser source race timeout');
}
function observed(scan: GuildHubLocalScan) {
  const seen = new Set<number>();
  const raw = scan.rawData as { players: Record<string, unknown>[] };
  return { seen, scan: { ...scan, rawData: { ...raw, players: raw.players.map((row, i) => ({ ...row,
    get name() { seen.add(i); return row.name; } })) } } };
}
function gate(seen: Set<number>) {
  const native = globalThis.setTimeout;
  let release!: () => void, held = false;
  globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: any[]) => {
    if (!held && ms === 0 && seen.size >= 128 && new Error().stack?.includes('hubSearchExecution')) {
      held = true; release = () => { globalThis.setTimeout = native; (fn as Function)(...args); }; return 0;
    }
    return native(fn, ms, ...args);
  }) as typeof setTimeout;
  return { wait: () => until(() => held), release: () => release(), restore: () => { globalThis.setTimeout = native; } };
}
export async function run() {
  const results: any[] = [];
  const raw = { players: Array.from({ length: 10000 }, (_, i) => ({ identifier: `f8_net_p${30000 + i}`, prefix: 'f8_net', name: `Race Player ${i}`, timestamp: Date.UTC(2026, 9, 8) })), groups: [] };
  for (const kind of ['unmount', 'reset', 'update', 'delete'] as const) {
    const saved = await scans.importGuildHubLocalScan(`w16-race-${kind}.json`, JSON.stringify({ ...raw, tag: kind }));
    const source = saved.scan.id;
    await scans.resetHubSearchProjections([source]);
    const input = observed(saved.scan), held = gate(input.seen);
    let controller: HubSearchController | undefined;
    let failure: unknown;
    const inventory = await scans.readHubSearchProjectionInventory();
    const work = kind === 'unmount' ? null : scans.prepareGuildHubSearchProjection(input.scan, inventory.resetFor(source)).catch(error => { failure = error; });
    if (kind === 'unmount') {
      controller = new HubSearchController({ loadArchive: async () => ({ entries: [], failed: 0, unknown: 0 }),
        readRaw: async id => id === source ? input.scan : scans.readGuildHubLocalScanForSearch(id) });
      controller.start({ ...defaultHubSearchQuery, text: 'Race Player' });
    }
    try {
      await held.wait();
      const rowsAtGate = input.seen.size;
      check(rowsAtGate > 0 && rowsAtGate < 10000, 'race must be inside document projection');
      check(!(await scans.readHubSearchProjectionInventory()).projections.has(source), 'partial projection leaked');
      if (kind === 'unmount') controller!.dispose();
      if (kind === 'reset') await scans.resetHubSearchProjections([source]);
      if (kind === 'delete') await scans.deleteGuildHubLocalScans([source]);
      if (kind === 'update') await scans.updateGuildHubLocalScan(source, 'w16-new.json', JSON.stringify({ players: [{ ...raw.players[0], name: 'New Browser Source' }], groups: [] }));
      held.release(); await work;
      await new Promise(r => setTimeout(r, 40));
      check(input.seen.size === rowsAtGate, 'old computation advanced after invalidation');
      const persisted = (await scans.readHubSearchProjectionInventory()).projections.get(source);
      if (kind === 'update') check(persisted?.documents[0].name === 'New Browser Source', 'late work replaced new source');
      else check(!persisted, 'aborted source committed');
      if (kind !== 'unmount') check(failure instanceof DOMException && failure.name === 'AbortError', 'source invalidation did not abort');
      else check(controller!.inspect().listeners === 0 && controller!.inspect().localDocuments === 0, 'unmount retained search consumer');
      results.push({ kind, rowsAtGate, rowsAfter: input.seen.size, aborted: kind === 'unmount' ? controller!.inspect().stopped : (failure as DOMException).name,
        persistedDocuments: persisted?.documents.length ?? 0, newerName: persisted?.documents[0].name ?? null });
    } finally { held.restore(); controller?.dispose(); await scans.deleteGuildHubLocalScans([source]); }
  }
  return results;
}
