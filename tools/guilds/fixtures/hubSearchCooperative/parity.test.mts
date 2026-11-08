import { gzipSync, gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { inputs, scanFor } from './inputs.ts';
import * as projections from '../../../../src/lib/data-hub/hubSearchProjection.ts';
import * as scans from '../../../../src/lib/guilds/localScanLibrary.ts';
import { aggregateHubSearchHits, defaultHubSearchQuery } from '../../../../src/lib/data-hub/hubSearchService.ts';
const expectedFile = 'tools/guilds/fixtures/hubSearchCooperative/parity-reference.json.gz';
const values = inputs.map((raw, i) => {
  const scan = scanFor(raw, i);
  const projection = projections.buildHubSearchProjection(scan, scans.readGuildHubSearchRows(scan), '[7]');
  return { projection, queries: ['Player', 'f8_net_p1', 'Unknown', 'Guild', 'Contradictory'].map(text =>
    aggregateHubSearchHits(projection.documents.map(local => ({ ...local, local })), undefined, { ...defaultHubSearchQuery, text }, 2, 3)) };
});
if (process.argv.includes('--capture')) {
  await writeFile(expectedFile, gzipSync(JSON.stringify(values) + '\n'));
  console.log('PASS captured original synchronous reference: six inputs, complete 10k projection and five queries each');
} else {
  const historical = JSON.parse(gunzipSync(await readFile(expectedFile)).toString('utf8'));
  // W24 adds only appearance and advances the central projection version.
  // Keep the original v1 reference byte-for-byte and compare every legacy field.
  const legacy = JSON.parse(JSON.stringify(values, (key, value) => key === 'appearance' ? undefined : value));
  for (const entry of legacy) entry.projection.version = 1;
  assert.deepEqual(legacy, historical);
  assert(values.every(entry => entry.projection.version === 2 && entry.projection.documents.every(d => d.appearance)));
  for (let i = 0; i < inputs.length; i++) {
    const scan = scanFor(inputs[i], i);
    const projection = await projections.buildHubSearchProjectionCooperatively(scan, scans.iterateGuildHubSearchRows(scan), '[7]');
    assert.deepEqual(projection, values[i].projection);
  }
  console.log('PASS original reference, synchronous/cooperative parity: six inputs, all documents/order/locators/certificates and 30 query results');
}
