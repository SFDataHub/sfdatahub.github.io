import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { HubSearchController, defaultHubSearchQuery, type HubSearchOccurrence, type HubSearchQuery, type HubSearchHit, type HubSearchState } from "../../src/lib/data-hub/hubSearchService.ts";
import { favoriteReference, referenceKey } from "../../src/lib/data-hub/hubFavoritesContract.ts";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, resolveGuildIdentity, type IdentityResolutionSnapshot } from "../../src/lib/identities/identityResolution.ts";
import { linkPlayerIdentifiers, unlinkPlayerIdentifier } from "../../src/lib/identities/playerIdentityStore.ts";
import { ScanArchiveSearchIndexSet } from "../../src/lib/scanArchive/searchIndexService.ts";
import type { ScanArchiveEntry } from "../../src/lib/scanArchive/types.ts";

// Independent aggregation oracle, with observation-time ranking added in W198.
// Kept separate from both production paths;
// tmp/w44/initial/hubSearchService.ts records the exact source of this oracle.
function referenceAggregate(occurrences: readonly HubSearchOccurrence[], identities: IdentityResolutionSnapshot | undefined, query: HubSearchQuery, revision: number, queryGeneration: number) {
  const normalize = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const text = normalize(query.text);
  if (text.length < 2) return { hits: [], limited: false };
  const groups = new Map<string, { hit: HubSearchHit; rank: number }>();
  for (const o of occurrences) {
    if (query.kind !== "both" && query.kind !== o.kind) continue;
    const identity = o.reference && identities ? (o.kind === "player" ? resolvePlayerIdentity(identities, o.reference.identifier) : resolveGuildIdentity(identities, o.reference.identifier)) : null;
    const key = o.kind + ":" + (identity?.identityId ?? (o.reference ? referenceKey(o.reference) : JSON.stringify([o.local?.source, o.local?.row, o.entry?.id, o.identifier, o.name])));
    let group = groups.get(key);
    if (!group) {
      group = { hit: { key, kind: o.kind, name: o.name, reference: o.reference, references: [], names: [], occurrences: [], identity: !o.reference ? "unresolved" : identity?.resolved ? "confirmed" : "literal", revision, queryGeneration }, rank: Infinity };
      groups.set(key, group);
    }
    group.hit.occurrences.push(o);
    if (o.reference && !group.hit.references.some(ref => referenceKey(ref) === referenceKey(o.reference!))) group.hit.references.push(o.reference);
    if (o.name && !group.hit.names.includes(o.name)) group.hit.names.push(o.name);
    for (const field of [o.name, o.identifier ?? ""]) { const value = normalize(field); group.rank = Math.min(group.rank, value === text ? 0 : value.startsWith(text) ? 1 : value.includes(text) ? 2 : Infinity); }
  }
  const matches = [...groups.values()].filter(g => Number.isFinite(g.rank));
  for (const { hit } of matches) {
    hit.occurrences.sort((a, b) => (b.timeQuality === "observation" ? b.at ?? 0 : 0) - (a.timeQuality === "observation" ? a.at ?? 0 : 0) || compare(a.identifier ?? "", b.identifier ?? "") || compare(a.local?.source ?? a.entry?.id ?? "", b.local?.source ?? b.entry?.id ?? ""));
    const display = hit.occurrences.find(o => o.timeQuality === "observation") ?? hit.occurrences[0]; hit.name = display.name || display.identifier || ""; hit.reference = display.reference;
  }
  const newest = (hit: HubSearchHit) => Math.max(0, ...hit.occurrences.filter(o => o.timeQuality === "observation").map(o => o.at ?? 0));
  matches.sort((a, b) => a.rank - b.rank || newest(b.hit) - newest(a.hit) || compare(a.hit.name, b.hit.name) || compare(a.hit.key, b.hit.key));
  return { hits: matches.slice(0, 30).map(g => g.hit), limited: matches.length > 30 };
}

type Probe = { localDocuments: HubSearchOccurrence[]; archiveDocuments: HubSearchOccurrence[]; identities?: IdentityResolutionSnapshot; publish(patch: Partial<HubSearchState>, changed?: boolean): void };
const probe = (c: HubSearchController) => c as unknown as Probe;
let checks = 0;
function check(c: HubSearchController, query: HubSearchQuery) {
  const p = probe(c), state = c.getSnapshot();
  assert.deepEqual({ hits: state.hits, limited: state.limited }, referenceAggregate([...p.localDocuments, ...p.archiveDocuments], p.identities, query, state.revision, state.queryGeneration)); checks++;
}
function occurrence(id: string, name: string, source: string, at: number, kind: "player" | "guild" = "player", local = true): HubSearchOccurrence {
  const reference = favoriteReference(kind, id);
  return { kind, name, identifier: id || null, reference, server: reference?.serverNamespace ?? null, at, timeQuality: local ? "observation" : "file",
    ...(local ? { local: { source, row: id || source } as HubSearchOccurrence["local"] } : { entry: { id: source } as ScanArchiveEntry }) };
}
const at = Date.UTC(2026, 9, 6);
await linkPlayerIdentifiers("f8_net_p1", "f9_net_p1", { source: "manual" });
const identities = await loadIdentityResolutionSnapshot();
const local = [occurrence("f8_net_p1", "Needle Older", "z-local", at), occurrence("f8_net_p1", "Needle Newer", "a-local", at + 1), occurrence("", "Needle Unresolved", "unresolved", at), occurrence("f8_net_g1", "Needle Guild", "guild", at, "guild"), occurrence("f8_net_p2", "Other Name", "other", at)];
const batches = [
  [occurrence("f9_net_p1", "Needle Archive Alias", "archive-a", at + 100, "player", false), occurrence("f8_net_p2", "Needle", "archive-b", at, "player", false)],
  [occurrence("f8_net_p1", "Needle Tie", "a-local", at + 1), occurrence("", "Needle Unresolved", "unresolved", at), occurrence("f8_net_g1", "Other Guild", "archive-g", at + 1, "guild", false)],
  Array.from({ length: 40 }, (_, i) => occurrence(`f8_net_p${i + 10}`, i % 2 ? "Needle Same" : "Prefix Needle", `archive-${i}`, at, "player", false)),
];
for (const kind of ["both", "player", "guild"] as const) for (const initial of [[], local]) {
  const c = new HubSearchController(), p = probe(c); let query: HubSearchQuery = { ...defaultHubSearchQuery, text: "Needle", kind };
  p.localDocuments = initial.slice(); p.identities = identities; c.setQuery(query); check(c, query);
  const previous: { state: HubSearchState; serialized: string }[] = [];
  for (const batch of batches) {
    const oldCost = c.costs.aggregationOccurrences;
    p.archiveDocuments.push(...batch); p.publish({ archive: { total: 6, ready: p.archiveDocuments.length, failed: 0, unknown: 0, preparing: true, error: false } }, true); check(c, query);
    assert.equal(c.costs.aggregationOccurrences - oldCost, batch.filter(o => kind === "both" || o.kind === kind).length);
    const held = c.getSnapshot(); previous.push({ state: held, serialized: JSON.stringify(held) });
    for (const hit of held.hits) { Object.freeze(hit.references); Object.freeze(hit.names); Object.freeze(hit.occurrences); Object.freeze(hit); }
    const cost = c.costs.aggregationOccurrences; const builds = c.costs.aggregationBuilds;
    p.publish({}, true); check(c, query); c.setQuery({ ...query }); check(c, query);
    c.setQuery({ kind: query.kind, scope: query.scope, mode: query.mode, text: query.text }); check(c, query);
    assert.equal(c.costs.aggregationOccurrences, cost); assert.equal(c.costs.aggregationBuilds, builds);
    for (const old of previous) assert.equal(JSON.stringify(old.state), old.serialized);
  }
  for (const text of ["", "N", "Ｎｅｅｄｌｅ", "Needle Same", "f9_net_p1", "no match"]) { query = { ...query, text }; c.setQuery(query); check(c, query); }
  query = { ...query, text: "Needle", mode: "toplist" }; c.setQuery(query); check(c, query);
  p.localDocuments = [occurrence("f8_net_p2", "Needle Replaced", "replacement", at + 200)]; p.publish({}, true); check(c, query);
  p.localDocuments = []; p.publish({}, true); check(c, query);
  p.archiveDocuments = []; p.publish({}, true); check(c, query);
  p.archiveDocuments.push(...batches[0]); p.publish({}, true); check(c, query);
  c.dispose(); assert.deepEqual(c.inspect(), { localDocuments: 0, archiveDocuments: 0, listeners: 0, stopped: true });
}
// Identity replacement must regroup aliases even when both document arrays survive.
const changed = new HubSearchController(), cp = probe(changed), q = { ...defaultHubSearchQuery, text: "Needle" };
cp.localDocuments = local.slice(); cp.archiveDocuments = batches[0].slice(); cp.identities = identities; changed.setQuery(q); check(changed, q);
await unlinkPlayerIdentifier("f9_net_p1"); cp.identities = await loadIdentityResolutionSnapshot(); cp.publish({}, true); check(changed, q); changed.dispose();

// Exercise the actual archive loop, error coverage, query/local changes between
// held batches, newer scope generations and disposal while replies are pending.
const entries = Array.from({ length: 6 }, (_, i) => ({ id: `entry-${i}`, server: "f8_net", timestamp: at + i, archiveYear: 2026, sha256: "a".repeat(64), searchIndex: { sha256: "b".repeat(64) } } as ScanArchiveEntry));
const pending: { selected: readonly ScanArchiveEntry[]; resolve: (v: Awaited<ReturnType<HubSearchController["refreshArchive"]>> | any) => void }[] = [];
const loop = new HubSearchController({ loadArchive: async () => ({ entries, failed: 0, unknown: 0 }), loadIndexes: (selected) => new Promise(resolve => pending.push({ selected, resolve })) });
const lp = probe(loop); let query = { ...defaultHubSearchQuery, text: "Needle" }; lp.localDocuments = local.slice(); loop.setQuery(query);
loop.subscribe(() => check(loop, query));
const tick = () => new Promise(r => setTimeout(r, 0));
async function waitPending() { for (let i = 0; i < 100 && !pending.length; i++) await tick(); assert.ok(pending.length); return pending.shift()!; }
function resolveBatch(job: typeof pending[number], failed = false) {
  const loaded = job.selected.filter((_, i) => !failed || i !== 0).map(entry => ({ entry, payload: { schemaVersion: 1 as const, archiveScanId: entry.id, sourceSha256: entry.sha256, server: entry.server, timestamp: entry.timestamp, players: [{ identifier: "f8_net_p1", name: `Needle ${entry.id}` }], guilds: [] }, source: "cache" as const }));
  job.resolve({ status: failed ? "partial" : "complete", searchSet: new ScanArchiveSearchIndexSet(loaded), loadedIndexes: loaded.map(({ entry }) => ({ archiveScanId: entry.id })), failedIndexes: failed ? [{ archiveScanId: job.selected[0].id, errorCode: "hash-or-size-error" }] : [], networkAccessed: false });
}
const running = loop.refreshArchive(); resolveBatch(await waitPending()); await tick();
query = { ...query, text: "entry" }; loop.setQuery(query);
lp.localDocuments = [occurrence("f8_net_p1", "Needle Local Changed", "new-local", at + 100)]; lp.identities = identities; lp.publish({}, true);
resolveBatch(await waitPending(), true); await tick(); resolveBatch(await waitPending()); await running;
assert.equal(loop.getSnapshot().archive.ready, 5); assert.equal(loop.getSnapshot().archive.failed, 1); assert.equal(loop.getSnapshot().archive.preparing, false);
const stale = loop.refreshArchive(), old = await waitPending(); const fresh = loop.refreshArchive(); const next = await waitPending();
resolveBatch(old); await stale; assert.equal(loop.getSnapshot().archive.ready, 0);
resolveBatch(next); await tick(); resolveBatch(await waitPending()); await tick(); resolveBatch(await waitPending()); await fresh; assert.equal(loop.getSnapshot().archive.ready, 6);
query = { ...query, scope: { kind: "historical" as const, from: "2026-09", to: "2026-09", server: "" } }; loop.setQuery(query); const disposed = await waitPending(); loop.dispose(); resolveBatch(disposed); await tick(); assert.equal(loop.getSnapshot().hits.length, 0);
console.log(`PASS ${checks} independent intermediate states: local/archive/mixed, identity/unresolved, kinds/queries/limits, immutable outputs, no suffix regrouping, local replacement, partial/retry/generation/dispose`);
