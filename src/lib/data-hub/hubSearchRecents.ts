import { favoriteReference, referenceKey, type FavoriteKind } from "./hubFavoritesContract";
import type { HubSearchHit, HubSearchOccurrence } from "./hubSearchService";
import { parseHubSearchAppearance, searchClassId, type HubSearchAppearance } from "./hubSearchAppearance";

export const HUB_SEARCH_RECENTS_KEY = "sfdatahub:hub-search-recents:v1";
export const HUB_SEARCH_RECENTS_MAX = 20;
export type HubRecentAnchor =
  | { kind: "local"; source: string; row: string; at: number | null; hash: string }
  | { kind: "archive"; id: string; hash: string; indexHash: string; at: number };
export type HubRecentEntity = { kind: "entity"; entityKind: FavoriteKind; identifier: string; serverNamespace: string; name: string; anchor: HubRecentAnchor | null; appearance?: HubSearchAppearance };
export type HubSearchRecent = { kind: "query"; text: string } | HubRecentEntity;
const bounded = (value: unknown, limit: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const validAt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;

export function parseHubSearchRecent(value: unknown): HubSearchRecent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.kind === "query") return bounded(v.text, 200) ? { kind: "query", text: v.text.trim() } : null;
  if (v.kind !== "entity" || v.entityKind !== "player" && v.entityKind !== "guild" || !bounded(v.identifier, 160) || !bounded(v.serverNamespace, 40)) return null;
  const ref = favoriteReference(v.entityKind, v.identifier, v.serverNamespace);
  if (!ref || ref.serverNamespace !== v.serverNamespace || !/_([pg])\d+$/i.test(v.identifier)) return null;
  let anchor: HubRecentAnchor | null = null;
  if (v.anchor !== null && v.anchor !== undefined) {
    if (!v.anchor || typeof v.anchor !== "object" || Array.isArray(v.anchor)) return null;
    const a = v.anchor as Record<string, unknown>;
    if (a.kind === "local" && bounded(a.source, 512) && bounded(a.row, 128) && bounded(a.hash, 128) && (a.at === null || validAt(a.at))) {
      anchor = { kind: "local", source: a.source, row: a.row, hash: a.hash, at: a.at };
    } else if (a.kind === "archive" && bounded(a.id, 512) && bounded(a.hash, 128) && bounded(a.indexHash, 128) && validAt(a.at)) {
      anchor = { kind: "archive", id: a.id, hash: a.hash, indexHash: a.indexHash, at: a.at };
    } else return null;
  }
  const appearance = parseHubSearchAppearance(v.appearance);
  return { kind: "entity", entityKind: v.entityKind, identifier: v.identifier, serverNamespace: ref.serverNamespace,
    name: bounded(v.name, 200) ? v.name : v.identifier, anchor, ...(appearance ? { appearance } : {}) };
}

export function hubRecentKey(entry: HubSearchRecent): string {
  if (entry.kind === "query") return "query:" + entry.text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
  const ref = favoriteReference(entry.entityKind, entry.identifier, entry.serverNamespace)!;
  const a = entry.anchor;
  const anchor = !a ? null : a.kind === "local" ? [a.kind, a.source, a.row, a.at, a.hash] : [a.kind, a.id, a.hash, a.indexHash, a.at];
  return `${entry.entityKind}:${referenceKey(ref)}:${JSON.stringify(anchor)}`;
}

export function recentFromHubHit(hit: HubSearchHit, occurrence?: HubSearchOccurrence): HubRecentEntity | null {
  occurrence ??= hit.observationBound ? hit.occurrences[0] : undefined;
  const ref = occurrence?.reference ?? hit.reference;
  if (!ref) return null;
  const display = occurrence ?? hit.occurrences.find(o => o.timeQuality === "observation") ?? hit.occurrences[0];
  const appearance = display?.local?.appearance ?? display?.archive?.appearance ?? { classId: display?.archive?.kind === "player" ? searchClassId(display.archive.classId) : null, portrait: null, coaString: null };
  let anchor: HubRecentAnchor | null = null;
  if (occurrence?.local) {
    const { source, row, at, hash } = occurrence.local;
    anchor = { kind: "local", source, row, at, hash };
  } else if (occurrence?.archive) {
    const a = occurrence.archive;
    anchor = { kind: "archive", id: a.archiveScanId, hash: a.archiveSha256, indexHash: a.searchIndexSha256, at: a.scanTimestamp };
  }
  return parseHubSearchRecent({ kind: "entity", entityKind: hit.kind, identifier: ref.identifier,
    serverNamespace: ref.serverNamespace, name: occurrence?.name || hit.name, anchor, appearance }) as HubRecentEntity | null;
}

type RecentStorage = Pick<Storage, "getItem" | "setItem">;
export class HubSearchRecentsStore {
  private snapshot: { entries: HubSearchRecent[]; error: boolean } | undefined;
  private listeners = new Set<() => void>();
  constructor(private storage: () => RecentStorage | undefined = () => typeof window === "undefined" ? undefined : window.localStorage) {}
  private read() {
    try {
      const raw = this.storage()?.getItem(HUB_SEARCH_RECENTS_KEY);
      if (!raw) return { entries: [], error: false };
      if (raw.length > 64_000) return { entries: [], error: true };
      const record: unknown = JSON.parse(raw);
      if (!record || typeof record !== "object" || !('version' in record) || record.version !== 1 || !('entries' in record) || !Array.isArray(record.entries)) return { entries: [], error: true };
      const seen = new Set<string>(); const entries: HubSearchRecent[] = [];
      for (const value of record.entries.slice(0, 100)) {
        const entry = parseHubSearchRecent(value);
        if (!entry || seen.has(hubRecentKey(entry))) continue;
        entries.push(entry); seen.add(hubRecentKey(entry));
        if (entries.length === HUB_SEARCH_RECENTS_MAX) break;
      }
      return { entries, error: false };
    } catch { return { entries: [], error: true }; }
  }
  getSnapshot = () => this.snapshot ??= this.read();
  private changed = (event: StorageEvent) => {
    if (event.key !== HUB_SEARCH_RECENTS_KEY) return;
    this.snapshot = this.read(); this.listeners.forEach(fn => fn());
  };
  subscribe = (listener: () => void) => {
    if (!this.listeners.size && typeof window !== "undefined") window.addEventListener("storage", this.changed);
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); if (!this.listeners.size && typeof window !== "undefined") window.removeEventListener("storage", this.changed); };
  };
  private commit(entries: HubSearchRecent[]) {
    let error = false;
    try {
      const storage = this.storage();
      if (!storage) error = true;
      else storage.setItem(HUB_SEARCH_RECENTS_KEY, JSON.stringify({ version: 1, entries }));
    } catch { error = true; }
    this.snapshot = { entries, error }; this.listeners.forEach(fn => fn());
  }
  add(value: HubSearchRecent) {
    const entry = parseHubSearchRecent(value); if (!entry) return;
    const key = hubRecentKey(entry);
    this.commit([entry, ...this.getSnapshot().entries.filter(item => hubRecentKey(item) !== key)].slice(0, HUB_SEARCH_RECENTS_MAX));
  }
  remove(key: string) { this.commit(this.getSnapshot().entries.filter(item => hubRecentKey(item) !== key)); }
}
export const hubSearchRecents = new HubSearchRecentsStore();
