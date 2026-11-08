import { openDB } from 'idb';
import {
  commitSfDataHubLocalScanPreview, createSfDataHubLocalScanImportPreview,
  deleteSfDataHubLocalScans, findSfDataHubLocalScanByArchiveScanId,
  type GuildHubLocalScan,
} from '../../../../src/lib/guilds/localScanLibrary';
import { acquireExplicitLocalFirstArchiveScans } from '../../../../src/lib/scanArchive/localFirstScanAcquisition';
import type { ScanArchiveEntry } from '../../../../src/lib/scanArchive/types';
import { createScanArchiveSourceMetadata } from '../../../../src/lib/scanArchive/client';

function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
const timestamp = Date.UTC(2026, 8, 19);
const entry: ScanArchiveEntry = {
  id: 'lookup-archive', server: 'f8_net', timestamp, timestampUtc: new Date(timestamp).toISOString(),
  path: 'lookup.json.gz', format: 'sftools.raw.v1', compression: 'gzip', sha256: 'a'.repeat(64),
  compressedBytes: 1, uncompressedBytes: 1, playerCount: 1, groupCount: 1,
  archiveYear: 2026, manifestRevision: 1, manifestUrl: 'https://example.test/manifest.json', fileUrl: 'https://example.test/lookup.json.gz',
};
const content = (name: string) => JSON.stringify({
  players: [{ identifier: 'f8_net_p1', prefix: 'f8_net', timestamp, name, class: 1, level: 100, guildIdentifier: 'f8_net_g1', guildName: 'Lookup Guild' }],
  groups: [{ identifier: 'f8_net_g1', prefix: 'f8_net', timestamp, name: 'Lookup Guild', memberCount: 1 }],
});

export async function runLookupChecks() {
  await findSfDataHubLocalScanByArchiveScanId('init');
  const db = await openDB('sfdatahub-local-data');
  const reads: { method: string; store: string; key?: string }[] = [];
  const originals = new Map<string, (...args: any[]) => IDBRequest>();
  for (const method of ['get', 'getAll', 'getAllKeys']) {
    const original = (IDBObjectStore.prototype as any)[method]; originals.set(method, original);
    (IDBObjectStore.prototype as any)[method] = function (...args: any[]) {
      reads.push({ method, store: this.name, key: typeof args[0] === 'string' ? args[0] : undefined });
      return original.apply(this, args);
    };
  }
  const cases: { name: string; reads: typeof reads; result?: unknown; ms?: number }[] = [];
  const clear = async () => {
    const tx = db.transaction(['scans', 'scanSummaries', 'archiveScanBindings', 'localToplistSnapshots'], 'readwrite');
    await Promise.all([...tx.objectStoreNames].map(store => tx.objectStore(store).clear())); await tx.done;
  };
  const importScan = async (name: string) => {
    const preview = await createSfDataHubLocalScanImportPreview(`${name}.json`, content(name), { archiveSource: createScanArchiveSourceMetadata(entry) });
    return (await commitSfDataHubLocalScanPreview(preview)).scan;
  };
  const seed = async (key: string, scan: GuildHubLocalScan, summary = true) => {
    const tx = db.transaction(['scans', 'scanSummaries'], 'readwrite');
    await tx.objectStore('scans').put({ ...scan, id: key });
    if (summary) {
      const saved = await tx.objectStore('scanSummaries').get(scan.id);
      // Template is captured before clearing the fixture stores.
      await tx.objectStore('scanSummaries').put({ ...(saved ?? templates.get(scan.id)), sourceScanId: key });
    }
    await tx.done;
  };
  const templates = new Map<string, any>();
  const check = async (name: string, expected: string | null, full: boolean) => {
    reads.length = 0;
    const start = performance.now();
    const result = await findSfDataHubLocalScanByArchiveScanId('  lookup-archive  ');
    equal(result?.id ?? null, expected, name);
    equal(reads.some(r => r.method === 'getAll' && r.store === 'scans'), full, `${name}: full inventory access`);
    cases.push({ name, reads: [...reads], result: result?.id ?? null, ms: performance.now() - start });
  };
  try {
    await clear(); const a = await importScan('A'), b = await importScan('B'), c = await importScan('C');
    for (const scan of [a, b, c]) templates.set(scan.id, await db.get('scanSummaries', scan.id));
    await clear(); await seed('10', a); await seed('2', b);
    await check('current metadata, key order differs from numeric/locale order', '10', false);
    equal(cases.at(-1)!.reads.filter(r => r.store === 'scans' && r.method === 'get').map(r => r.key), ['10'], 'earliest candidate read once');
    await clear(); await seed('10', { ...a, archiveSource: undefined }, false);
    await seed('11', { ...c, archiveSource: undefined }, false); await seed('2', b);
    await check('last-key candidate streams its authoritative prefix', '2', false);
    equal(cases.at(-1)!.reads.filter(r => r.store === 'scans' && r.method === 'get').map(r => r.key), ['2', '10', '11'], 'candidate then prefix in exact key order');
    await clear(); await seed('10', a);
    await db.put('scanSummaries', { ...templates.get(a.id), sourceScanId: '10', summaryVersion: 0 });
    await check('legacy summary version remains a candidate, selected raw uses existing repair', '10', false);
    await clear(); await seed('10', a, false);
    await check('raw without summary', '10', true);
    await clear(); await seed('10', a);
    const summary = await db.get('scanSummaries', '10');
    await db.put('scanSummaries', { ...summary, archiveSource: { ...summary.archiveSource, archiveScanId: 'stale-id' } });
    await check('stale archive metadata does not hide raw', '10', true);
    await clear(); await seed('10', a); await db.delete('scans', '10');
    await check('orphan summary is not a positive hit', null, true);
    await clear(); await seed('10', { ...a, archiveSource: undefined }); await seed('2', b);
    await db.put('scanSummaries', { ...templates.get(a.id), sourceScanId: '10' });
    await check('wrong raw candidate falls back to later authoritative hit', '2', true);
    await clear(); await seed('10', a, false); await seed('11', { ...c, archiveSource: undefined }, false); await seed('2', b);
    await check('earlier unrepresented duplicate wins', '10', false);
    equal(cases.at(-1)!.reads.some(r => r.store === 'scans' && r.key === '11'), false, 'prefix stops at first authoritative match');
    await clear(); await seed('10', a); await seed('2', b);
    await db.put('scanSummaries', { ...templates.get(a.id), sourceScanId: '10', archiveSource: undefined });
    await check('earlier duplicate with apparently current but wrong summary wins', '10', false);
    await clear(); await check('negative before import', null, true);
    const imported = await importScan('AfterMiss'); await check('positive after normal import', imported.id, false);
    await deleteSfDataHubLocalScans([imported.id]); await check('normal deletion removes reusable scan', null, true);
    await clear(); await seed('10', a);
    let replacement: Promise<void> | undefined;
    const replacementGetAll = (IDBObjectStore.prototype as any).getAll;
    (IDBObjectStore.prototype as any).getAll = function (...args: any[]) {
      const request = replacementGetAll.apply(this, args);
      if (this.name === 'scanSummaries') request.addEventListener('success', () => {
        const tx = db.transaction(['scans', 'scanSummaries'], 'readwrite');
        void tx.objectStore('scans').put({ ...b, id: '10' });
        void tx.objectStore('scanSummaries').put({ ...templates.get(b.id), sourceScanId: '10' });
        replacement = tx.done;
      }, { once: true });
      return request;
    };
    reads.length = 0;
    const replaced = await findSfDataHubLocalScanByArchiveScanId(entry.id);
    (IDBObjectStore.prototype as any).getAll = replacementGetAll;
    await replacement;
    equal(replaced?.contentHash, b.contentHash, 'normalization retries the new generation after a competing replacement');
    equal((await db.get('scans', '10')).contentHash, b.contentHash, 'older selected raw never overwrites newer content');
    cases.push({ name: 'competing replacement preserves latest generation', reads: [...reads], result: replaced?.id });
    await clear(); await seed('10', a);
    let deletion: Promise<void> | undefined;
    const nativeGetAll = (IDBObjectStore.prototype as any).getAll;
    (IDBObjectStore.prototype as any).getAll = function (...args: any[]) {
      const request = nativeGetAll.apply(this, args);
      if (this.name === 'scanSummaries') request.addEventListener('success', () => {
        // A competing write queued after metadata enumeration cannot run
        // between the metadata and raw reads of the readonly snapshot.
        const tx = db.transaction(['scans', 'scanSummaries'], 'readwrite');
        void tx.objectStore('scans').delete('10'); void tx.objectStore('scanSummaries').delete('10'); deletion = tx.done;
      }, { once: true });
      return request;
    };
    const concurrent = await findSfDataHubLocalScanByArchiveScanId(entry.id);
    (IDBObjectStore.prototype as any).getAll = nativeGetAll;
    await deletion;
    equal(concurrent, null, 'deletion before normalization does not resurrect a scan');
    await check('lookup after concurrent deletion', null, true);
    await clear(); await seed('10', a);
    let downloads = 0;
    let result = await acquireExplicitLocalFirstArchiveScans([entry], { dependencies: {
      downloadArchiveEntry: async () => { downloads++; return { content: content('Acquired') }; },
    } });
    equal(result.localScanIds, ['10'], 'acquisition reuses authoritative candidate'); equal(downloads, 0, 'no duplicate download');
    await clear();
    result = await acquireExplicitLocalFirstArchiveScans([entry], { dependencies: {
      downloadArchiveEntry: async () => { downloads++; return { content: content('Acquired') }; },
    } });
    equal(result.selectedArchives[0]?.status, 'imported', 'missing scan is normally imported'); equal(downloads, 1, 'missing scan downloaded once');
    const changedHash = { ...entry, sha256: 'b'.repeat(64) };
    result = await acquireExplicitLocalFirstArchiveScans([changedHash], { dependencies: {
      downloadArchiveEntry: async () => { downloads++; throw Error('SHA-256 mismatch'); },
    } });
    equal(downloads, 2, 'archive ID alone cannot bypass hash validation');
    equal(result.failedArchives[0]?.errorCode, 'hash-or-size-error', 'hash check remains at caller');
    cases.push({ name: 'acquisition reuse/import/hash enforcement', reads: [], result: { downloads, failed: result.failedArchives } });
    reads.length = 0; equal(await findSfDataHubLocalScanByArchiveScanId('   '), null, 'empty ID'); equal(reads, [], 'empty ID has no DB reads');
    return { cases, passed: true, nativeIndexedDB: typeof window !== 'undefined' };
  } finally {
    for (const [method, original] of originals) (IDBObjectStore.prototype as any)[method] = original;
    db.close();
  }
}
