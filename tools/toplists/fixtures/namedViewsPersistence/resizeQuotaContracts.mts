import assert from 'node:assert/strict';
import { strToU8, strFromU8, zlibSync, unzlibSync } from 'fflate';
import { createPreferencesStore, PREFERENCES_KEY } from '../../../../src/lib/settings/preferences';
import { resizeToplistColumn, activeColumnWidths } from '../../../../src/lib/toplists/toplistColumns';

const legacy = (json: string) => 'sfh:z1:' + Buffer.from(zlibSync(strToU8(json))).toString('base64');
function unpack(raw: string) {
  const separator = raw.indexOf(':', 7), length = parseInt(raw.slice(7, separator), 36);
  const bits = [...raw.slice(separator + 1)].map(c => (c.charCodeAt(0) - 32).toString(2).padStart(15, '0')).join('');
  return JSON.parse(strFromU8(unzlibSync(Uint8Array.from({ length }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)))));
}

// The real browser had only 138 UTF-16 characters of free origin quota, with
// preferences already in z1 format. Both JSON and the old Base64 fallback failed.
const original = { schemaVersion: 1, unknown: { unicode: 'Ä漢字🙂\u0000', values: Array.from({ length: 180 }, (_, i) => (i * 7919).toString(36)) }, general: { navigationMode: 'sidebar', untouched: true } };
let raw = legacy(JSON.stringify(original)), blocked = false;
const before = raw, limit = raw.length + 138, attempts: string[] = [];
const storage = {
  getItem: () => raw,
  setItem(key: string, value: string) {
    assert.equal(key, PREFERENCES_KEY);
    attempts.push(value);
    if (blocked || value.length > limit) throw new DOMException('Origin quota exhausted', 'QuotaExceededError');
    raw = value;
  },
};
const store = createPreferencesStore(() => storage), basis = store.getSnapshot();
assert.equal(basis.status, 'ready', 'old z1 remains readable');
const initial = basis.toplistViews.players;
const rendered = Object.fromEntries(initial.columns.map((key, i) => [key, 70.25 + i * 17]));
const players = resizeToplistColumn(initial, 'players', 'level', rendered.level + 40, rendered, 'Copy of Default');
const changes = { toplistViews: { ...basis.toplistViews, players } };
assert.equal(store.savePreferences(changes, basis).status, 'saved');
assert.equal(attempts.length, 2, 'only normal write and denser quota fallback');
assert.ok(attempts[0].length > limit);
assert.ok(legacy(attempts[0]).length > limit, 'old fallback also genuinely exceeds the same quota');
assert.ok(raw.startsWith('sfh:z2:'));
assert.ok(raw.length <= limit);
assert.deepEqual(unpack(raw), JSON.parse(attempts[0]), 'encoding preserves the entire JSON, including unknown fields');
assert.deepEqual(unpack(raw).unknown, original.unknown);
assert.equal(unpack(raw).general.untouched, true);
assert.notEqual(raw, before);
const reload = createPreferencesStore(() => storage).getSnapshot();
assert.deepEqual(reload.toplistViews.players, players);
assert.equal(reload.navigationMode, 'sidebar');
assert.equal(reload.toplistViews.guilds.activeId, 'default');

const saved = raw, nextBasis = store.getSnapshot();
const changed = resizeToplistColumn(players, 'players', 'level', rendered.level + 60, activeColumnWidths(players)!, 'Copy');
blocked = true;
assert.equal(store.savePreferences({ toplistViews: { ...nextBasis.toplistViews, players: changed } }, nextBasis).status, 'write-error');
assert.equal(raw, saved);
assert.deepEqual(store.getSnapshot().toplistViews.players, players);
blocked = false;
assert.equal(store.savePreferences({ toplistViews: { ...nextBasis.toplistViews, players: changed } }, nextBasis).status, 'saved');
assert.equal(store.getSnapshot().toplistViews.players.views.length, 1);
assert.equal(store.getSnapshot().toplistViews.players.activeId, players.activeId);
assert.equal(store.getSnapshot().toplistViews.players.views[0].name, players.views[0].name);

// Exercise byte packing and padding across many compressed lengths and Unicode.
for (let length = 0; length < 32; length++) {
  let encoded: string | null = JSON.stringify({ schemaVersion: 1, unknown: { text: '🙂漢字Ä\u0000'.repeat(length) } });
  const adapter = { getItem: () => encoded, setItem: (_key: string, value: string) => { if (!value.startsWith('sfh:z2:')) throw new DOMException('full', 'QuotaExceededError'); encoded = value; } };
  const subject = createPreferencesStore(() => adapter), start = subject.getSnapshot();
  assert.equal(subject.savePreferences({ toplistViews: changes.toplistViews }, start).status, 'saved');
  assert.deepEqual(unpack(encoded!).unknown, { text: '🙂漢字Ä\u0000'.repeat(length) });
  assert.deepEqual(createPreferencesStore(() => adapter).getSnapshot().toplistViews, changes.toplistViews);
}
console.log('PASS actual quota shape: JSON and z1 exceed remaining space, z2 saves losslessly; old format, readback/reload, identity, failure/recovery, Unicode/padding');
