import assert from 'node:assert/strict';
import { defaultToplistColumns, editToplistColumns, normalizeToplistViews, newToplistView, uniqueToplistViewName } from '../../../../src/lib/toplists/toplistColumns';
import { createPreferencesStore, PREFERENCES_KEY } from '../../../../src/lib/settings/preferences';
let checks = 0;
const check = (name: string, test: () => void) => { test(); checks++; console.log('PASS ' + name); };
const initial = normalizeToplistViews(undefined);
const first = editToplistColumns(initial.players, 'players', [...initial.players.columns, 'server'], 'Copy of Default');
check('Default edit creates one active independent view with the change; template unchanged', () => {
 assert.equal(first.views.length, 1); assert.equal(first.activeId, first.views[0].id); assert.equal(first.views[0].name, 'Copy of Default');
 assert.ok(first.columns.includes('server')); assert.deepEqual(initial.players.columns, defaultToplistColumns('players')); assert.equal(initial.players.views.length, 0);
});
check('Further edits reuse ID; no-op and duplicate columns create nothing', () => {
 const next = editToplistColumns(first, 'players', first.columns.filter(k => k !== 'level'), 'Copy of Default');
 assert.equal(next.activeId, first.activeId); assert.equal(next.views.length, 1);
 assert.equal(editToplistColumns(initial.players, 'players', initial.players.columns, 'Copy of Default'), initial.players);
 assert.equal(editToplistColumns(first, 'players', [...first.columns, 'server'], 'Copy of Default'), first);
});
check('Reselected Default creates independent numbered copy; guilds stay separate', () => {
 const back = { ...first, activeId: 'default', mode: 'default' as const, columns: defaultToplistColumns('players') };
 const next = editToplistColumns(back, 'players', back.columns.slice(1), 'Copy of Default');
 assert.equal(next.views.length, 2); assert.notEqual(next.activeId, first.activeId); assert.equal(next.views[1].name, 'Copy of Default (2)');
 assert.equal(initial.guilds.views.length, 0); assert.equal(uniqueToplistViewName(first, 'Copy of Default'), 'Copy of Default (2)');
});
let raw: string | null = JSON.stringify({ schemaVersion: 1, future: { retained: ['a', 'b'] }, dataHub: { profiles: { guildProfileMode: 'total' }, extra: 'unknown', toplists: { future: 42 } } });
let limit = Infinity, blocked = false, silent = false;
const storage = { getItem: () => raw, setItem: (key: string, value: string) => { assert.equal(key, PREFERENCES_KEY); if (blocked || value.length > limit) throw new DOMException('full', 'QuotaExceededError'); if (!silent) raw = value; } };
const store = createPreferencesStore(() => storage);
const original = store.getSnapshot();
let publications = 0; store.subscribe(() => publications++);
check('Bounded quota: full view write fails, compact write rereads and publishes complete state', () => {
 limit = 650;
 const result = store.savePreferences({ toplistViews: { ...original.toplistViews, players: first } }, original);
 assert.equal(result.status, 'saved'); assert.ok(raw!.startsWith('sfh:z2:')); assert.equal(publications, 1);
 assert.deepEqual(createPreferencesStore(() => storage).getSnapshot().toplistViews.players, first);
 assert.equal(result.snapshot.guildProfileMode, 'total');
});
check('Unknown fields and compact concurrency basis survive subsequent edits', () => {
 const current = store.getSnapshot(); limit = Infinity;
 const result = store.savePreferences({ toplistViews: current.toplistViews }, current);
 assert.equal(result.status, 'unchanged');
 const changed = store.savePreferences({ navigationMode: 'sidebar' }, current); assert.equal(changed.status, 'saved');
 const data = JSON.parse(raw!); assert.deepEqual(data.future, { retained: ['a', 'b'] }); assert.equal(data.dataHub.extra, 'unknown'); assert.equal(data.dataHub.toplists.future, 42);
 assert.equal(store.savePreferences({ toplistViews: initial }, original).status, 'conflict');
});
check('Exhausted fallback preserves previous active state; retry creates exactly one view', () => {
 const current = store.getSnapshot(), before = raw, count = publications;
 const next = newToplistView(current.toplistViews.players, 'players', 'Custom', false);
 blocked = true;
 assert.equal(store.savePreferences({ toplistViews: { ...current.toplistViews, players: next } }, current).status, 'write-error');
 assert.equal(raw, before); assert.equal(store.getSnapshot(), current); assert.equal(publications, count);
 blocked = false;
 assert.equal(store.savePreferences({ toplistViews: { ...current.toplistViews, players: next } }, current).status, 'saved');
 assert.equal(store.getSnapshot().toplistViews.players.views.length, 2);
});
check('Silent storage failure is not published as success', () => {
 const current = store.getSnapshot(); silent = true;
 assert.equal(store.savePreferences({ toplistViews: initial }, current).status, 'write-error');
 assert.equal(store.getSnapshot(), current);
});
console.log(`${checks} targeted contracts passed`);
