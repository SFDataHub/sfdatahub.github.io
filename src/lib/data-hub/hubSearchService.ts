import { normalizeHubSearchText, parseHubSearchText, matchesHubSearchServer } from "./hubSearchQuery";
export { normalizeHubSearchText, parseHubSearchText } from "./hubSearchQuery";
import { resolveObservedGuildIdentity } from "../identities/guildObservationIdentity";
import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditDiscard, auditCaught, auditAccept, auditCount } from "./runtimeAudit";
import { isHubSearchProjectionCurrent, type HubSearchDocument } from "./hubSearchProjection";
import { readDataHubLocalScanMetadata, readGuildHubLocalScanForSearch, prepareGuildHubSearchProjection,
  readHubSearchProjectionInventory, putHubSearchProjection, readHubSearchArchiveMetadata, putHubSearchArchiveMetadata } from "../guilds/localScanLibrary";
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, type IdentityResolutionSnapshot } from "../identities/identityResolution";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../local-data/localDataDependencies";
import { loadScanArchiveCatalog, loadScanArchiveManifestEntries, subscribeToScanArchiveMetadata } from "../scanArchive/client";
import { loadScanArchiveSearchIndexSet, collectScanArchiveEntriesFromToplistSelections, type ScanArchiveSearchHit } from "../scanArchive/searchIndexService";
import { resolveScanArchiveCurrentToplistScan, resolveScanArchiveMonthlyToplistScan } from "../scanArchive/toplistSelection";
import { validateScanArchiveCatalog, validateScanArchiveManifest } from "../scanArchive/validation";
import type { ScanArchiveEntry, ScanArchiveManifest } from "../scanArchive/types";
import { favoriteReference, referenceKey, type FavoriteKind, type FavoriteReference } from "./hubFavoritesContract";
import { resolveServer } from "../servers/serverResolver";
import type { HubRecentEntity } from "./hubSearchRecents";

export const HUB_SEARCH_MIN_QUERY = 2;
export const HUB_SEARCH_LIMIT = 30;
export const HUB_SEARCH_DEBOUNCE_MS = 180;
export type HubSearchScope = { kind: "current" } | { kind: "historical"; from: string; to: string; server: string };
export type HubSearchQuery = { text: string; kind: FavoriteKind | "both"; mode: "profile" | "toplist"; scope: HubSearchScope };
export const defaultHubSearchQuery: HubSearchQuery = { text: "", kind: "both", mode: "profile", scope: { kind: "current" } };
export type HubSearchOccurrence = { kind: FavoriteKind; name: string; identifier: string | null; reference: FavoriteReference | null;
  server: string | null; at: number | null; timeQuality: "observation" | "file" | "unknown";
  months?: string[]; local?: HubSearchDocument; archive?: ScanArchiveSearchHit; entry?: ScanArchiveEntry };
export type HubSearchHit = { key: string; kind: FavoriteKind; name: string; reference: FavoriteReference | null;
  references: FavoriteReference[]; names: string[]; occurrences: HubSearchOccurrence[];
  observationBound?: boolean;
  identity: "confirmed" | "literal" | "unresolved" | "conflict"; revision: number; queryGeneration: number };
export type HubSearchCoverage = { total: number | null; ready: number; failed: number; unknown: number; unresolved?: number; preparing: boolean; error: boolean };
export type HubSearchState = { revision: number; queryGeneration: number; hits: HubSearchHit[]; limited: boolean;
  local: HubSearchCoverage; archive: HubSearchCoverage; scope: HubSearchScope };
export type HubSearchArchiveBasis = { entries: ScanArchiveEntry[]; failed: number; unknown: number; monthsByEntryId?: Record<string, string[]> };
const coverage = (): HubSearchCoverage => ({ total: null, ready: 0, failed: 0, unknown: 0, preparing: true, error: false });
export const emptyHubSearchState = (): HubSearchState => ({ revision: 0, queryGeneration: 0, hits: [], limited: false,
  local: coverage(), archive: coverage(), scope: { kind: "current" } });
const observationTime = (o: HubSearchOccurrence) => o.timeQuality === "observation" ? o.at ?? 0 : 0;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const monthValid = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function validHubSearchScope(scope: HubSearchScope) {
  return scope.kind === "current" || monthValid(scope.from) && monthValid(scope.to) && scope.from <= scope.to &&
    Number(scope.to.slice(0, 4)) - Number(scope.from.slice(0, 4)) <= 10 && (!scope.server || !!resolveServer(scope.server));
}

/** Metadata only. Failures are isolated by year. Current references are resolved
 * against all successfully loaded active manifests, and every member is retained. */
export async function loadHubSearchArchiveBasis(scope: HubSearchScope, signal: AbortSignal, options: Parameters<typeof loadScanArchiveCatalog>[0] = {}): Promise<HubSearchArchiveBasis> {
    const __audit1 = auditPhaseBegin("loadHubSearchArchiveBasis", undefined, "async-container");
    try {
  if (!validHubSearchScope(scope)) throw Error("Invalid search scope");
  const key = (auditValue(__audit1, auditEnter(__audit1, "JSON.stringify", "sync-elapsed"), (JSON.stringify(scope))));
  let cached: { catalog: ReturnType<typeof validateScanArchiveCatalog>; manifests: ScanArchiveManifest[]; urls: Record<number, string> } | undefined;
  try {
    const value = await (auditValue(__audit1, auditEnter(__audit1, "readHubSearchArchiveMetadata"), (readHubSearchArchiveMetadata(key)))) as { version?: number; catalog?: unknown; manifests?: unknown[]; urls?: Record<number, string> } | undefined;
    if (value?.version === 1 && value.manifests && value.urls) {
      const catalog = validateScanArchiveCatalog(value.catalog);
      const manifests = value.manifests.map(m => validateScanArchiveManifest(m, Number((m as { archiveYear?: number }).archiveYear)));
      if (manifests.every(m => catalog.archives.some(a => a.year === m.archiveYear && a.manifestUrl === value.urls![m.archiveYear]))) cached = { catalog, manifests, urls: value.urls };
    }
  } catch { /* Corrupt expectations do not certify arbitrary cached sidecars. */ }
  let catalog;
  try { catalog = await (auditValue(__audit1, auditEnter(__audit1, "loadScanArchiveCatalog"), (loadScanArchiveCatalog({ ...options, signal })))); }
  catch (error) { auditCaught(__audit1, error);
    if (signal.aborted) throw error;
    if (!cached) throw error;
    const basis = selectHubSearchArchiveBasis(scope, cached.manifests, cached.urls, 1);
    return auditReturn(__audit1, { ...basis, unknown: basis.unknown + 1 });
  }
  const years = catalog.archives.filter(a => scope.kind === "current" ? a.active : a.year >= Number(scope.from.slice(0, 4)) && a.year <= Number(scope.to.slice(0, 4)));
  const manifests: ScanArchiveManifest[] = [], urls: Record<number, string> = {};
  let failed = 0;
  // Bound metadata transport as well as sidecar transport.
  for (let i = 0; i < years.length; i += 2) {
    const chunk = years.slice(i, i + 2);
    const results = await (auditValue(__audit1, auditEnter(__audit1, "Promise.allSettled"), (Promise.allSettled(chunk.map(a => loadScanArchiveManifestEntries(a, { signal, fetcher: options.fetcher }))))));
    results.forEach((r, index) => { if (r.status === "fulfilled") { manifests.push(r.value.manifest); urls[chunk[index].year] = chunk[index].manifestUrl; } else failed++; });
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
  }
  if (!failed) {
    try { await (auditValue(__audit1, auditEnter(__audit1, "putHubSearchArchiveMetadata"), (putHubSearchArchiveMetadata(key, { version: 1, catalog, manifests, urls })))); } catch { /* Network expectations remain usable in this consumer. */ }
  }
  return auditReturn(__audit1, selectHubSearchArchiveBasis(scope, manifests, urls, failed));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}
export function selectHubSearchArchiveBasis(scope: HubSearchScope, manifests: readonly ScanArchiveManifest[], urls: Record<number, string>, failed = 0): HubSearchArchiveBasis {
  const selections = [];
  if (scope.kind === "current") {
    const servers = [...new Set(manifests.flatMap(m => Object.keys(m.toplists?.current ?? {})))].sort();
    for (const server of servers) selections.push(resolveScanArchiveCurrentToplistScan(manifests, server));
  } else {
    const server = scope.server ? favoriteReference("player", "1", scope.server)?.serverNamespace : null;
    for (const manifest of manifests) for (const month of Object.keys(manifest.toplists?.monthly ?? {}).sort()) {
      if (month < scope.from || month > scope.to) continue;
      for (const declared of Object.keys(manifest.toplists!.monthly![month]).sort()) {
        if (server && favoriteReference("player", "1", declared)?.serverNamespace !== server) continue;
        selections.push(resolveScanArchiveMonthlyToplistScan(manifests, declared, month));
      }
    }
  }
  // The same physical payload may belong to multiple logical sets.
  const entries = collectScanArchiveEntriesFromToplistSelections(selections, urls);
  const byId = new Map<string, ScanArchiveEntry[]>();
  for (const entry of entries) byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  let unknown = selections.filter(s => s.status !== "selected").length + (scope.kind === "current" ? manifests.filter(m => m.scans.length && !Object.keys(m.toplists?.current ?? {}).length).length : 0);
  const unique: ScanArchiveEntry[] = [];
  for (const versions of byId.values()) {
    const contracts = new Set(versions.map(e => JSON.stringify([e.sha256, e.searchIndex, e.server, e.timestamp, e.manifestUrl, e.manifestRevision])));
    if (contracts.size !== 1) { unknown++; continue; }
    unique.push(versions[0]);
  }
  const monthsByEntryId: Record<string, string[]> = {};
  for (const selection of selections) if (selection.status === "selected" && selection.role === "monthly" && selection.month) {
    for (const scan of selection.scans) monthsByEntryId[scan.id] = [...new Set([...(monthsByEntryId[scan.id] ?? []), selection.month])].sort();
  }
  return { entries: unique, failed, unknown, monthsByEntryId };
}

export function aggregateHubSearchHits(occurrences: readonly HubSearchOccurrence[], identities: IdentityResolutionSnapshot | undefined,
  query: HubSearchQuery, revision: number, queryGeneration: number) {
    const __audit2 = auditPhaseBegin("aggregateHubSearchHits", undefined, "sync-elapsed");
    try {
  const parsed = parseHubSearchText(query.text), text = parsed.name;
  if (text.length < HUB_SEARCH_MIN_QUERY) return auditReturn(__audit2, { hits: [], limited: false });
  const groups = new Map<string, { hit: HubSearchHit; rank: number }>();
  for (const o of occurrences) {
    if (query.kind !== "both" && query.kind !== o.kind || !matchesHubSearchServer(parsed, o.reference?.serverNamespace ?? o.server)) continue;
    const identity = o.reference && identities ? (o.kind === "player" ? resolvePlayerIdentity(identities, o.reference.identifier) : resolveObservedGuildIdentity(identities, o.reference.identifier)) : null;
    const key = o.kind + ":" + (identity?.identityId ?? (o.reference ? referenceKey(o.reference) : (auditValue(__audit2, auditEnter(__audit2, "JSON.stringify", "sync-elapsed"), (JSON.stringify([o.local?.source, o.local?.row, o.entry?.id, o.identifier, o.name]))))));
    let group = groups.get(key);
    if (!group) {
      group = { hit: { key, kind: o.kind, name: o.name, reference: o.reference, references: [], names: [], occurrences: [],
        identity: !o.reference ? "unresolved" : identity?.resolved ? "confirmed" : "literal", ...(parsed.server ? { observationBound: true } : {}), revision, queryGeneration }, rank: Infinity };
      groups.set(key, group);
    }
    group.hit.occurrences.push(o);
    if (o.reference && !group.hit.references.some(ref => referenceKey(ref) === referenceKey(o.reference!))) group.hit.references.push(o.reference);
    if (o.name && !group.hit.names.includes(o.name)) group.hit.names.push(o.name);
    // Match names and full original identifiers within the selected servers.
    for (const field of [o.name, o.identifier ?? ""]) {
      const normalized = normalizeHubSearchText(field);
      group.rank = Math.min(group.rank, normalized === text ? 0 : normalized.startsWith(text) ? 1 : normalized.includes(text) ? 2 : Infinity);
    }
  }
  const matches = [...groups.values()].filter(g => Number.isFinite(g.rank));
  for (const { hit } of matches) {
    hit.occurrences.sort((a, b) => (b.timeQuality === "observation" ? b.at ?? 0 : 0) - (a.timeQuality === "observation" ? a.at ?? 0 : 0) ||
      compare(a.identifier ?? "", b.identifier ?? "") || compare(a.local?.source ?? a.entry?.id ?? "", b.local?.source ?? b.entry?.id ?? ""));
    // A newer displayed name needs actual observation evidence. A sidecar clock
    // or identity link is not an authoritative current-alias statement.
    const display = hit.occurrences.find(o => o.timeQuality === "observation") ?? hit.occurrences[0];
    hit.name = display.name || display.identifier || ""; hit.reference = display.reference;
  }
  matches.sort((a, b) => a.rank - b.rank || observationTime(b.hit.occurrences[0]) - observationTime(a.hit.occurrences[0]) || compare(a.hit.name, b.hit.name) || compare(a.hit.key, b.hit.key));
  return auditReturn(__audit2, { hits: matches.slice(0, HUB_SEARCH_LIMIT).map(g => g.hit), limited: matches.length > HUB_SEARCH_LIMIT });

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}

type AccumulatedHubSearchGroup = {
  key: string; kind: FavoriteKind; identity: HubSearchHit["identity"]; rank: number;
  references: FavoriteReference[]; referenceKeys: Set<string>; names: string[]; nameSet: Set<string>;
  occurrences: HubSearchOccurrence[]; ordered?: HubSearchOccurrence[]; display?: HubSearchOccurrence;
};

/** Owned by one controller. Local replacement rebuilds local-before-archive
 * order; an unchanged basis only admits the new archive suffix. Published
 * arrays are copies, so later additions cannot change an accepted result. */
class HubSearchHitAccumulator {
  private groups = new Map<string, AccumulatedHubSearchGroup>();
  private matches = new Set<AccumulatedHubSearchGroup>();
  private local?: readonly HubSearchOccurrence[]; private localLength = 0;
  private archive?: readonly HubSearchOccurrence[]; private archiveLength = 0;
  private identities?: IdentityResolutionSnapshot; private queryKey?: string;
  builds = 0; occurrencesProcessed = 0;

  clear() {
    this.groups.clear(); this.matches.clear(); this.local = this.archive = undefined;
    this.localLength = this.archiveLength = 0; this.identities = undefined; this.queryKey = undefined;
  }

  aggregate(local: readonly HubSearchOccurrence[], archive: readonly HubSearchOccurrence[],
    identities: IdentityResolutionSnapshot | undefined, query: HubSearchQuery, revision: number, queryGeneration: number) {
    const audit = auditPhaseBegin("aggregateHubSearchHits", undefined, "sync-elapsed");
    try {
      const parsed = parseHubSearchText(query.text), text = parsed.name, key = JSON.stringify([query.text, query.kind, query.mode,
        query.scope.kind, ...(query.scope.kind === "historical" ? [query.scope.from, query.scope.to, query.scope.server] : [])]);
      const rebuild = this.queryKey !== key || this.identities !== identities || this.local !== local ||
        this.localLength !== local.length || this.archive !== archive || this.archiveLength > archive.length;
      const before = this.occurrencesProcessed;
      if (rebuild) {
        this.clear(); this.queryKey = key; this.identities = identities;
        this.local = local; this.localLength = local.length; this.archive = archive;
        this.builds++; auditCount(audit, "aggregationBuilds");
      }
      if (text.length >= HUB_SEARCH_MIN_QUERY) {
        if (rebuild) this.add(local, 0, identities, query, parsed, audit);
        this.add(archive, this.archiveLength, identities, query, parsed, audit);
      }
      this.archiveLength = archive.length;
      auditCount(audit, "aggregationOccurrences", this.occurrencesProcessed - before);
      const matches = [...this.matches].map(group => {
        const ordered = group.ordered ??= group.occurrences.slice().sort((a, b) =>
          (b.timeQuality === "observation" ? b.at ?? 0 : 0) - (a.timeQuality === "observation" ? a.at ?? 0 : 0) ||
          compare(a.identifier ?? "", b.identifier ?? "") || compare(a.local?.source ?? a.entry?.id ?? "", b.local?.source ?? b.entry?.id ?? ""));
        const display = group.display ??= ordered.find(o => o.timeQuality === "observation") ?? ordered[0];
        return { group, ordered, display, name: display.name || display.identifier || "" };
      });
      matches.sort((a, b) => a.group.rank - b.group.rank || observationTime(b.display) - observationTime(a.display) || compare(a.name, b.name) || compare(a.group.key, b.group.key));
      const hits: HubSearchHit[] = matches.slice(0, HUB_SEARCH_LIMIT).map(({ group, ordered, display, name }) => ({
        key: group.key, kind: group.kind, name, reference: display.reference, references: group.references.slice(),
        names: group.names.slice(), occurrences: ordered.slice(), ...(parsed.server ? { observationBound: true } : {}), identity: group.identity, revision, queryGeneration,
      }));
      return auditReturn(audit, { hits, limited: matches.length > HUB_SEARCH_LIMIT });
    } catch (error) { auditError(audit, error); throw error; }
    finally { auditLeave(audit); }
  }

  private add(occurrences: readonly HubSearchOccurrence[], from: number, identities: IdentityResolutionSnapshot | undefined,
    query: HubSearchQuery, parsed: ReturnType<typeof parseHubSearchText>, audit: ReturnType<typeof auditPhaseBegin>) {
    const text = parsed.name;
    for (let i = from; i < occurrences.length; i++) {
      const o = occurrences[i];
      if (query.kind !== "both" && query.kind !== o.kind || !matchesHubSearchServer(parsed, o.reference?.serverNamespace ?? o.server)) continue;
      this.occurrencesProcessed++;
      const identity = o.reference && identities ? (o.kind === "player" ? resolvePlayerIdentity(identities, o.reference.identifier) : resolveObservedGuildIdentity(identities, o.reference.identifier)) : null;
      const key = o.kind + ":" + (identity?.identityId ?? (o.reference ? referenceKey(o.reference) :
        auditValue(audit, auditEnter(audit, "JSON.stringify", "sync-elapsed"), JSON.stringify([o.local?.source, o.local?.row, o.entry?.id, o.identifier, o.name]))));
      let group = this.groups.get(key);
      if (!group) {
        group = { key, kind: o.kind, identity: !o.reference ? "unresolved" : identity?.resolved ? "confirmed" : "literal", rank: Infinity,
          references: [], referenceKeys: new Set(), names: [], nameSet: new Set(), occurrences: [] };
        this.groups.set(key, group);
      }
      group.occurrences.push(o); group.ordered = undefined; group.display = undefined;
      if (o.reference) {
        const reference = referenceKey(o.reference);
        if (!group.referenceKeys.has(reference)) { group.referenceKeys.add(reference); group.references.push(o.reference); }
      }
      if (o.name && !group.nameSet.has(o.name)) { group.nameSet.add(o.name); group.names.push(o.name); }
      for (const field of [o.name, o.identifier ?? ""]) {
        const normalized = normalizeHubSearchText(field);
        group.rank = Math.min(group.rank, normalized === text ? 0 : normalized.startsWith(text) ? 1 : normalized.includes(text) ? 2 : Infinity);
      }
      if (Number.isFinite(group.rank)) this.matches.add(group);
    }
  }
}

export type HubSearchDependencies = {
  readLocal: typeof readDataHubLocalScanMetadata; readProjections: typeof readHubSearchProjectionInventory;
  readRaw: typeof readGuildHubLocalScanForSearch; putProjection: typeof putHubSearchProjection;
  loadArchive: typeof loadHubSearchArchiveBasis; loadIndexes: typeof loadScanArchiveSearchIndexSet;
  identities: typeof loadIdentityResolutionSnapshot;
};
const defaults: HubSearchDependencies = { readLocal: readDataHubLocalScanMetadata, readProjections: readHubSearchProjectionInventory,
  readRaw: readGuildHubLocalScanForSearch, putProjection: putHubSearchProjection, loadArchive: loadHubSearchArchiveBasis,
  loadIndexes: loadScanArchiveSearchIndexSet, identities: loadIdentityResolutionSnapshot };

/** Preparation has its own generations. Typing only queries retained slim
 * documents. Raw objects leave the one-source loop before the next source. */
export class HubSearchController {
  private state = emptyHubSearchState();
  private query: HubSearchQuery = defaultHubSearchQuery;
  private localDocuments: HubSearchOccurrence[] = [];
  private archiveDocuments: HubSearchOccurrence[] = [];
  private identities?: IdentityResolutionSnapshot;
  private listeners = new Set<() => void>();
  private localGeneration = 0; private archiveGeneration = 0; private stopped = false;
  private archiveAbort?: AbortController; private unsubscribe?: () => void; private unsubscribeSearch?: () => void; private unsubscribeArchive?: () => void;
  private dependencies: HubSearchDependencies;
  private referenceHits = new WeakSet<HubSearchHit>();
  private aggregation = new HubSearchHitAccumulator();
  readonly costs = { coldRawReads: 0, projectionBytes: 0, preparationMs: 0, archivePreparationMs: 0, queries: 0, queryMs: 0,
    aggregationBuilds: 0, aggregationOccurrences: 0 };
  constructor(dependencies: Partial<HubSearchDependencies> = {}) { this.dependencies = { ...defaults, ...dependencies }; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<HubSearchState>, changed = false) {
    const __audit3 = auditPhaseBegin("publish", undefined, "sync-elapsed");
    try {
    if (this.stopped) return auditReturn(__audit3, undefined);
    this.state = { ...this.state, ...patch, revision: this.state.revision + (changed ? 1 : 0) };
    const start = performance.now();
    const result = this.aggregation.aggregate(this.localDocuments, this.archiveDocuments, this.identities, this.query, this.state.revision, this.state.queryGeneration);
    this.costs.aggregationBuilds = this.aggregation.builds; this.costs.aggregationOccurrences = this.aggregation.occurrencesProcessed;
    this.costs.queries++; this.costs.queryMs += performance.now() - start;
    this.state = { ...this.state, ...result }; auditAccept(__audit3, this.state); this.listeners.forEach(l => l());

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}
  setQuery(query: HubSearchQuery) {
    const __audit4 = auditBegin("F05", "setQuery");
    try {
    const scopeChanged = (auditValue(__audit4, auditEnter(__audit4, "JSON.stringify", "sync-elapsed"), (JSON.stringify(query.scope)))) !== (auditValue(__audit4, auditEnter(__audit4, "JSON.stringify", "sync-elapsed"), (JSON.stringify(this.query.scope))));
    this.query = query; (auditValue(__audit4, auditEnter(__audit4, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ queryGeneration: this.state.queryGeneration + 1, scope: query.scope }))));
    if (scopeChanged) void this.refreshArchive();

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}
  start(query: HubSearchQuery) {
    this.query = query; this.state = { ...this.state, scope: query.scope };
    this.unsubscribe = subscribeToLocalDataDependencies({ allSources: true, allIdentities: true }, () => {
      // Remove obsolete results immediately, before any asynchronous read.
      this.localDocuments = []; this.identities = undefined; this.publish({}, true); void this.refreshLocal();
    }, () => { this.localDocuments = []; this.publish({ local: { ...this.state.local, error: true } }, true); }, { consumer: "hub-search-local" });
    this.unsubscribeSearch = subscribeToLocalDataDependencies({ hubSearchResets: true }, () => {
      this.localDocuments = []; this.archiveDocuments = []; this.publish({}, true); void this.refreshLocal(); void this.refreshArchive();
    }, undefined, { consumer: "hub-search-resets" });
    this.unsubscribeArchive = subscribeToScanArchiveMetadata(() => { void this.refreshArchive(); });
    void this.refreshLocal(); void this.refreshArchive();
  }
  retry = () => { void this.refreshLocal(); void this.refreshArchive(); };
  isHitCurrent(hit: HubSearchHit) { return !this.stopped && hit.revision === this.state.revision && hit.queryGeneration === this.state.queryGeneration && (this.state.hits.includes(hit) || this.referenceHits.has(hit)); }
  isArchiveOccurrenceCurrent(occurrence: HubSearchOccurrence) { return !this.stopped && this.archiveDocuments.some(o => o.entry === occurrence.entry && o.identifier === occurrence.identifier); }
  /** Explicit Recent action only: fresh metadata evidence, independent of query/name/limit. */
  async resolveRecent(recent: HubRecentEntity): Promise<{ hit: HubSearchHit; occurrence?: HubSearchOccurrence } | null> {
    const __audit5 = auditPhaseBegin("resolveRecent", undefined, "async-container");
    try {
    const revision = this.state.revision, queryGeneration = this.state.queryGeneration;
    const localGeneration = this.localGeneration, archiveGeneration = this.archiveGeneration;
    const current = () => !this.stopped && revision === this.state.revision && queryGeneration === this.state.queryGeneration &&
      localGeneration === this.localGeneration && archiveGeneration === this.archiveGeneration;
    const ref = favoriteReference(recent.entityKind, recent.identifier, recent.serverNamespace);
    if (!ref || ref.serverNamespace !== recent.serverNamespace || !current()) return (__audit5 && auditDiscard(__audit5), auditReturn(__audit5, null));
    const receipt = await (auditValue(__audit5, auditEnter(__audit5, "captureLocalDataDependencies"), (captureLocalDataDependencies({ allSources: true, allIdentities: true }))));
    const [metadata, inventory, identities] = await (auditValue(__audit5, auditEnter(__audit5, "Promise.all"), (Promise.all([this.dependencies.readLocal({ includeContentHashes: true }), this.dependencies.readProjections(), this.dependencies.identities()]))));
    if (!current()) return (__audit5 && auditDiscard(__audit5), auditReturn(__audit5, null));
    const identity = recent.entityKind === "player" ? resolvePlayerIdentity(identities, ref.identifier) : resolveObservedGuildIdentity(identities, ref.identifier);
    const refs = [ref, ...identity.aliasIdentifiers.map(id => favoriteReference(recent.entityKind, id)).filter((r): r is FavoriteReference => !!r)];
    const localCurrent = (o: HubSearchOccurrence) => {
      const d = o.local!; const p = inventory.projections.get(d.source);
      if (!p || !p.enabled || !metadata.sourceIds.includes(d.source)) return false;
      let source = metadata.summaries.find(s => s.sourceScanId === d.source);
      if (!source) {
        if (inventory.sourceChanges.some(c => (c.sequence ?? 0) > p.sourceSequence && (c.unknownImpact ||
          c.kinds.some(kind => ["content", "normalization", "release", "maintenance", "reset"].includes(kind)) && [...c.sourceIds, ...c.removedSourceIds].includes(d.source)))) return false;
        try {
          const evidence: unknown = JSON.parse(p.fingerprint);
          if (!Array.isArray(evidence) || evidence.length !== 4 || typeof evidence[0] !== "string" ||
            evidence[1] !== null && typeof evidence[1] !== "string" || evidence[2] !== null && typeof evidence[2] !== "number" || evidence[3] !== null && typeof evidence[3] !== "number") return false;
          source = { sourceScanId: d.source, contentHash: evidence[0], sourceGeneration: evidence[1], normalizerVersion: evidence[2], coreNormalizerVersion: evidence[3] } as Parameters<typeof isHubSearchProjectionCurrent>[1];
        } catch { return false; }
      }
      return !!source && source.analyticsEnabled !== false && isHubSearchProjectionCurrent(p, source, metadata.sourceContentHashes?.get(d.source), inventory.resetFor(d.source)) &&
        p.documents.some(next => next.kind === d.kind && next.row === d.row && next.at === d.at && next.hash === d.hash && next.identifier === d.identifier);
    };
    const candidates = [...this.localDocuments, ...this.archiveDocuments].filter(o => {
      if (o.kind !== recent.entityKind || !o.reference || !refs.some(r => referenceKey(r) === referenceKey(o.reference!))) return false;
      if (o.local && !localCurrent(o)) return false;
      const a = recent.anchor;
      if (!a) return true;
      return a.kind === "local" ? !!o.local && o.local.source === a.source && o.local.row === a.row && o.local.hash === a.hash && o.local.at === a.at
        : !!o.archive && o.archive.archiveScanId === a.id && o.archive.archiveSha256 === a.hash && o.archive.searchIndexSha256 === a.indexHash && o.archive.scanTimestamp === a.at;
    });
    if (!candidates.length || !(await (auditValue(__audit5, auditEnter(__audit5, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current || !current()) return (__audit5 && auditDiscard(__audit5), auditReturn(__audit5, null));
    const result = aggregateHubSearchHits(candidates, identities, { ...defaultHubSearchQuery, text: candidates[0].identifier! }, revision, queryGeneration);
    if (result.hits.length !== 1 || recent.anchor && candidates.length !== 1) return auditReturn(__audit5, null);
    const hit = result.hits[0]; this.referenceHits.add(hit);
    return auditReturn(__audit5, { hit, ...(recent.anchor ? { occurrence: candidates[0] } : {}) });

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}
  async refreshLocal() {
    const __audit6 = auditBegin("F03", "refreshLocal");
    try {
    const generation = ++this.localGeneration;
    const current = () => !this.stopped && generation === this.localGeneration;
    this.localDocuments = []; (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ local: coverage() }, true))));
    const started = performance.now();
    try {
      const receipt = await (auditValue(__audit6, auditEnter(__audit6, "captureLocalDataDependencies"), (captureLocalDataDependencies({ allSources: true, allIdentities: true }))));
      const [metadata, inventory, identities] = await (auditValue(__audit6, auditEnter(__audit6, "Promise.all"), (Promise.all([this.dependencies.readLocal({ includeContentHashes: true }), this.dependencies.readProjections(), this.dependencies.identities()]))));
      if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
      this.identities = identities;
      const summaries = metadata.summaries.filter(s => s.analyticsEnabled !== false);
      // Slots retain usable locators; identity aggregation removes their copies.
      summaries.sort((a, b) => (b.lastSnapshotTimestamp ?? 0) - (a.lastSnapshotTimestamp ?? 0) || compare(a.sourceScanId, b.sourceScanId));
      const missing: { sourceScanId: string }[] = [];
      let ready = 0, failed = 0, unresolved = 0, unknown = metadata.sourceIds.length - metadata.summaries.length;
      const add = (documents: HubSearchDocument[]) => {
        this.localDocuments.push(...documents.map(local => ({ kind: local.kind, name: local.name, identifier: local.identifier,
          reference: local.reference, server: local.server, at: local.at, timeQuality: local.timeQuality, local })));
        unresolved += documents.filter(d => !d.reference).length;
      };
      for (const summary of summaries) {
        const projection = inventory.projections.get(summary.sourceScanId);
        if (isHubSearchProjectionCurrent(projection, summary, metadata.sourceContentHashes?.get(summary.sourceScanId), inventory.resetFor(summary.sourceScanId))) { add(projection!.documents); unresolved += projection!.unsearchableRows; ready++; }
        else missing.push(summary);
      }
      const summaryIds = new Set(metadata.summaries.map(s => s.sourceScanId));
      for (const id of metadata.sourceIds.filter(id => !summaryIds.has(id))) {
        const p = inventory.projections.get(id);
        const hash = metadata.sourceContentHashes?.get(id);
        // Missing summaries are not deletions. The atomic projection certificate
        // plus the durable source journal can prove an unchanged literal input.
        const unchanged = p && Number.isSafeInteger(p.sourceSequence) && !inventory.sourceChanges.some(c => (c.sequence ?? 0) > p.sourceSequence &&
          (c.unknownImpact || c.kinds.some(kind => ["content", "normalization", "release", "maintenance", "reset"].includes(kind)) && [...c.sourceIds, ...c.removedSourceIds].includes(id)));
        let evidence: [string, string | null, number | null, number | null] | null = null;
        try { const value: unknown = p && (auditValue(__audit6, auditEnter(__audit6, "JSON.parse", "sync-elapsed"), (JSON.parse(p.fingerprint)))); if (Array.isArray(value) && value.length === 4 && typeof value[0] === "string" && (value[1] === null || typeof value[1] === "string") && (value[2] === null || typeof value[2] === "number") && (value[3] === null || typeof value[3] === "number")) evidence = value as [string, string | null, number | null, number | null]; } catch { /* Invalid certificate is rebuilt sourcewise. */ }
        const fallback = p && evidence && { sourceScanId: id, contentHash: evidence[0], sourceGeneration: evidence[1], normalizerVersion: evidence[2], coreNormalizerVersion: evidence[3] };
        if (unchanged && fallback && isHubSearchProjectionCurrent(p, fallback as Parameters<typeof isHubSearchProjectionCurrent>[1], hash, inventory.resetFor(id))) {
          if (p.enabled) { add(p.documents); unresolved += p.unsearchableRows; ready++; }
        } else missing.push({ sourceScanId: id });
      }
      if (!(await (auditValue(__audit6, auditEnter(__audit6, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current) { if (current()) void this.refreshLocal(); return auditReturn(__audit6, undefined); }
      if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
      (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ local: { total: metadata.metadataComplete ? summaries.length : null, ready, failed, unknown, unresolved, preparing: !!missing.length, error: false } }, true))));
      for (const summary of missing) {
        if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
        try {
          this.costs.coldRawReads++;
          const scan = await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.readRaw"), (this.dependencies.readRaw(summary.sourceScanId))));
          if (!scan) throw Error("Missing search source");
          const projection = await (auditValue(__audit6, auditEnter(__audit6, "prepareGuildHubSearchProjection"), (prepareGuildHubSearchProjection(scan, inventory.resetFor(scan.id), { allowed: current }))));
          if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
          await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.putProjection"), (this.dependencies.putProjection(projection, { allowed: current }))));
          if (!(await (auditValue(__audit6, auditEnter(__audit6, "revalidateLocalDataDependencies"), (revalidateLocalDataDependencies(receipt))))).current) { if (current()) void this.refreshLocal(); return auditReturn(__audit6, undefined); }
          if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
          if (projection.enabled) { add(projection.documents); unresolved += projection.unsearchableRows; ready++; }
          this.costs.projectionBytes += new TextEncoder().encode((auditValue(__audit6, auditEnter(__audit6, "JSON.stringify", "sync-elapsed"), (JSON.stringify(projection))))).byteLength;
        } catch (error) { auditCaught(__audit6, error);
          if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
          if (error instanceof DOMException && error.name === "AbortError") { void this.refreshLocal(); return auditReturn(__audit6, undefined); }
          failed++;
        }
        (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ local: { total: metadata.metadataComplete ? summaries.length : null, ready, failed, unknown, unresolved, preparing: summary.sourceScanId !== missing[missing.length - 1]?.sourceScanId, error: false } }, true))));
        await (auditValue(__audit6, auditEnter(__audit6, "new Promise<void>(resolve => setTimeout(resolve, 0))"), (new Promise<void>(resolve => setTimeout(resolve, 0)))));
      }
      if (current()) this.costs.preparationMs += performance.now() - started;
    } catch { if (current()) { this.localDocuments = []; (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ local: { ...this.state.local, preparing: false, error: true } }, true)))); } }

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}
  async refreshArchive() {
    const __audit7 = auditBegin("F04", "refreshArchive");
    try {
    const generation = ++this.archiveGeneration;
    this.archiveAbort?.abort(); const abort = this.archiveAbort = new AbortController();
    const current = () => !this.stopped && generation === this.archiveGeneration;
    this.archiveDocuments = []; (auditValue(__audit7, auditEnter(__audit7, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ archive: coverage() }, true))));
    const started = performance.now();
    try {
      const basis = await (auditValue(__audit7, auditEnter(__audit7, "this.dependencies.loadArchive"), (this.dependencies.loadArchive(this.query.scope, abort.signal))));
      if (!current()) return (__audit7 && auditDiscard(__audit7), auditReturn(__audit7, undefined));
      let ready = 0, failed = basis.failed, unresolved = 0;
      const total = basis.failed || basis.unknown ? null : basis.entries.length;
      (auditValue(__audit7, auditEnter(__audit7, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ archive: { total, ready, failed, unknown: basis.unknown, unresolved, preparing: !!basis.entries.length, error: false } }, true))));
      for (let i = 0; i < basis.entries.length; i += 2) {
        const loaded = await (auditValue(__audit7, auditEnter(__audit7, "this.dependencies.loadIndexes"), (this.dependencies.loadIndexes(basis.entries.slice(i, i + 2), { signal: abort.signal }))));
        if (!current()) return (__audit7 && auditDiscard(__audit7), auditReturn(__audit7, undefined));
        for (const archive of loaded.searchSet.getOccurrences()) {
          const entry = loaded.searchSet.getArchiveEntryForResult(archive)!;
          const reference = favoriteReference(archive.kind, archive.identifier, archive.server);
          const declared = favoriteReference(archive.kind, "1", archive.server);
          if (!reference || reference.serverNamespace !== declared?.serverNamespace) unresolved++;
          this.archiveDocuments.push({ kind: archive.kind, name: archive.name, identifier: archive.identifier,
            reference: reference && reference.serverNamespace === declared?.serverNamespace ? reference : null,
            server: reference?.serverNamespace ?? archive.server, at: archive.scanTimestamp, timeQuality: "file", months: basis.monthsByEntryId?.[entry.id], archive, entry });
        }
        ready += loaded.loadedIndexes.length; failed += loaded.failedIndexes.length;
        (auditValue(__audit7, auditEnter(__audit7, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ archive: { total, ready, failed, unknown: basis.unknown, unresolved, preparing: i + 2 < basis.entries.length, error: false } }, true))));
      }
    } catch { if (current()) (auditValue(__audit7, auditEnter(__audit7, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ archive: { ...this.state.archive, preparing: false, error: true } }, true)))); }
    finally { if (current()) this.costs.archivePreparationMs += performance.now() - started; }

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
}
  inspect() { return { localDocuments: this.localDocuments.length, archiveDocuments: this.archiveDocuments.length, listeners: this.listeners.size, stopped: this.stopped }; }
  dispose() { this.stopped = true; this.localGeneration++; this.archiveGeneration++; this.archiveAbort?.abort(); this.unsubscribe?.(); this.unsubscribeSearch?.(); this.unsubscribeArchive?.();
    this.localDocuments = []; this.archiveDocuments = []; this.identities = undefined; this.aggregation.clear(); this.state = { ...this.state, hits: [] }; this.listeners.clear(); }
}
