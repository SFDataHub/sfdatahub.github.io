import assert from 'node:assert/strict';
import { resizeToplistColumn, normalizeColumnView, activeColumnWidths } from '../../../../src/lib/toplists/toplistColumns';
import { createPreferencesStore } from '../../../../src/lib/settings/preferences';

const initial = normalizeColumnView(undefined, 'players');
const rendered = Object.fromEntries(initial.columns.map((key, i) => [key, 45.25 + i * 17]));
for (const end of [rendered.level, rendered.level + 0.4, NaN, Infinity]) {
  assert.equal(resizeToplistColumn(initial, 'players', 'level', end, rendered, 'Copy'), initial);
}
assert.equal(resizeToplistColumn(initial, 'players', 'unknown', 90, rendered, 'Copy'), initial);
const changed = resizeToplistColumn(initial, 'players', 'level', rendered.level + 80, rendered, 'Copy');
assert.equal(initial.views.length, 0);
assert.equal(changed.views.length, 1);
assert.deepEqual(activeColumnWidths(changed), { ...rendered, level: rendered.level + 80 });
const second = resizeToplistColumn(changed, 'players', 'name', -100, activeColumnWidths(changed)!, 'Copy');
assert.equal(second.views.length, 1);
assert.equal(second.activeId, changed.activeId);
assert.equal(second.views[0].name, changed.views[0].name);
assert.deepEqual(second.columns, changed.columns);
assert.deepEqual(activeColumnWidths(second), { ...activeColumnWidths(changed), name: 32 });
let raw: string | null = null, writes = 0, fail = false;
const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { if (fail) throw Error('controlled write failure'); raw = value; writes++; } };
const store = createPreferencesStore(() => storage);
const basis = store.getSnapshot();
assert.equal(store.savePreferences({ toplistViews: { ...basis.toplistViews, players: second } }, basis).status, 'saved');
assert.equal(writes, 1);
assert.deepEqual(createPreferencesStore(() => storage).getSnapshot().toplistViews.players, second);
assert.equal(store.getSnapshot().toplistViews.guilds.activeId, 'default');
const saved = raw;
fail = true;
const retryBasis = store.getSnapshot();
const third = resizeToplistColumn(second, 'players', 'level', 400, activeColumnWidths(second)!, 'Copy');
assert.equal(store.savePreferences({ toplistViews: { ...retryBasis.toplistViews, players: third } }, retryBasis).status, 'write-error');
assert.equal(raw, saved);
assert.deepEqual(store.getSnapshot().toplistViews.players, second);
fail = false;
assert.equal(store.savePreferences({ toplistViews: { ...retryBasis.toplistViews, players: third } }, retryBasis).status, 'saved');
assert.equal(store.getSnapshot().toplistViews.players.views.length, 1);
console.log('PASS resize contracts: valid minimum, rendered no-op, exact Default geometry and one copy, Custom identity/other widths, one write/reload, list separation, write failure/retry');
