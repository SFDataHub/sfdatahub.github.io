import {
  getSfDataHubArchiveSearchIndexCache,
  putSfDataHubArchiveSearchIndexCache,
  type GuildHubArchiveSearchIndexCacheRecord,
} from "../guilds/localScanLibrary";
import { toplistRowIdentity } from "./toplistRowIdentity";
import { resolveServer } from "../servers/serverResolver";
import {
  ScanArchiveSearchIndexCancelledError,
  startScanArchiveSearchIndexWorkerRun,
} from "./searchIndexWorkerClient";
import type {
  ScanArchiveEntry,
  ScanArchiveSearchIndexGuildEntry,
  ScanArchiveSearchIndexPayload,
  ScanArchiveSearchIndexPlayerEntry,
} from "./types";
import type { ScanArchiveToplistSelectionResult } from "./toplistSelection";
import { validateScanArchiveSearchIndexPayload } from "./validation";

export type ScanArchiveSearchIndexErrorCode =
  | "missing-search-index"
  | "network-error"
  | "hash-or-size-error"
  | "gzip-json-or-structure-error"
  | "server-or-timestamp-mismatch"
  | "indexeddb-error"
  | "aborted"
  | "unknown-error";

export type ScanArchiveSearchIndexLoadSource = "cache" | "download";

export type ScanArchiveSearchIndexLoadedItem = {
  archiveScanId: string;
  archiveSha256: string;
  searchIndexSha256: string;
  server: string;
  manifestYear: number;
  scanTimestamp: number;
  source: ScanArchiveSearchIndexLoadSource;
};

export type ScanArchiveSearchIndexFailure = {
  archiveScanId: string;
  archiveSha256: string;
  searchIndexSha256?: string;
  server: string;
  manifestYear: number;
  errorCode: ScanArchiveSearchIndexErrorCode;
  message: string;
};

export type ScanArchiveSearchIndexLoadStatus = "complete" | "partial" | "empty";

export type ScanArchiveSearchIndexLoadResult = {
  status: ScanArchiveSearchIndexLoadStatus;
  searchSet: ScanArchiveSearchIndexSet;
  loadedIndexes: ScanArchiveSearchIndexLoadedItem[];
  failedIndexes: ScanArchiveSearchIndexFailure[];
  networkAccessed: boolean;
};

export type ScanArchiveSearchKind = "player" | "guild";

export type ScanArchiveSearchHitBase = {
  // A matching physical source, never an authoritative monthly winner.
  // Resolve all explicit set members before deriving a monthly dataset.
  kind: ScanArchiveSearchKind;
  name: string;
  identifier: string;
  server: string;
  archiveScanId: string;
  archiveSha256: string;
  searchIndexSha256: string;
  scanTimestamp: number;
  manifestYear: number;
};

export type ScanArchivePlayerSearchHit = ScanArchiveSearchHitBase & {
  kind: "player";
  guildIdentifier?: string | null;
  guildName?: string | null;
  classId?: string | number | null;
};

export type ScanArchiveGuildSearchHit = ScanArchiveSearchHitBase & {
  kind: "guild";
};

export type ScanArchiveSearchHit = ScanArchivePlayerSearchHit | ScanArchiveGuildSearchHit;

export type ScanArchiveSearchOptions = {
  servers?: readonly string[];
  limit?: number;
};

export type ScanArchiveSearchIndexDependencies = {
  getCache: (entry: ScanArchiveEntry) => Promise<GuildHubArchiveSearchIndexCacheRecord | null>;
  putCache: (entry: ScanArchiveEntry, payload: ScanArchiveSearchIndexPayload) => Promise<GuildHubArchiveSearchIndexCacheRecord>;
  downloadSearchIndex: (entry: ScanArchiveEntry, signal?: AbortSignal) => Promise<ScanArchiveSearchIndexPayload>;
};

export type ScanArchiveSearchIndexLoadOptions = {
  signal?: AbortSignal;
  dependencies?: Partial<ScanArchiveSearchIndexDependencies>;
};

export type ScanArchiveManifestUrlLookup =
  | Readonly<Record<number, string>>
  | ((selection: Extract<ScanArchiveToplistSelectionResult, { status: "selected" }>) => string | null | undefined);

type LoadedSearchIndex = {
  entry: ScanArchiveEntry;
  payload: ScanArchiveSearchIndexPayload;
  source: ScanArchiveSearchIndexLoadSource;
};

type InFlightSearchIndexResult = LoadedSearchIndex & {
  networkAccessed: boolean;
};

type SearchDocument = {
  kind: ScanArchiveSearchKind;
  hit: ScanArchiveSearchHit;
  fields: string[];
};

const MAX_SEARCH_INDEX_CONCURRENCY = 2;
const inFlightSearchIndexes = new Map<string, Promise<InFlightSearchIndexResult>>();

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const normalizeSearchText = (value: string) =>
  value
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase();

const searchIndexKey = (entry: ScanArchiveEntry) =>
  `${entry.id}:${entry.searchIndex?.sha256.toLowerCase() ?? "missing-search-index"}`;

const archiveEntryKey = (entry: Pick<ScanArchiveEntry, "id" | "sha256">) =>
  `${entry.id}:${entry.sha256.toLowerCase()}`;

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown_error"));

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const classifySearchIndexError = (error: unknown): ScanArchiveSearchIndexErrorCode => {
  if (error instanceof ScanArchiveSearchIndexCancelledError || isAbortError(error)) return "aborted";
  const message = errorMessage(error);
  if (error instanceof TypeError && !message) return "gzip-json-or-structure-error";
  if (/keinen Suchindex|missing-search-index/i.test(message)) return "missing-search-index";
  if (/404|fetch_failed|Download fehlgeschlagen|Failed to fetch|network/i.test(message)) return "network-error";
  if (/SHA-256|Pruefsumme|Groesse|groesse|size|hash/i.test(message)) return "hash-or-size-error";
  if (/Timestamp|Server|gehoert nicht|abweichenden|passt nicht/i.test(message)) return "server-or-timestamp-mismatch";
  if (/gzip|JSON|UTF-8|Suchindex-Payload|Payload|rows|entry|Struktur|entpackt|decompress|inflate|header/i.test(message)) {
    return "gzip-json-or-structure-error";
  }
  if (/IndexedDB|IDB|database|transaction/i.test(message)) return "indexeddb-error";
  return "unknown-error";
};

const defaultDownloadSearchIndex = async (entry: ScanArchiveEntry, signal?: AbortSignal) => {
  throwIfAborted(signal);
  const run = startScanArchiveSearchIndexWorkerRun({ entry });
  const abortListener = () => run.cancel();
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const payload = await run.promise;
    throwIfAborted(signal);
    return payload;
  } finally {
    signal?.removeEventListener("abort", abortListener);
  }
};

const defaultDependencies: ScanArchiveSearchIndexDependencies = {
  getCache: getSfDataHubArchiveSearchIndexCache,
  putCache: putSfDataHubArchiveSearchIndexCache,
  downloadSearchIndex: defaultDownloadSearchIndex,
};

const createDependencies = (options: ScanArchiveSearchIndexLoadOptions = {}): ScanArchiveSearchIndexDependencies => ({
  ...defaultDependencies,
  ...options.dependencies,
});

const uniqueExplicitSearchIndexEntries = (entries: readonly ScanArchiveEntry[]) => {
  const byKey = new Map<string, ScanArchiveEntry>();
  for (const entry of entries) {
    const key = searchIndexKey(entry);
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()].sort(
    (left, right) => left.timestamp - right.timestamp || compareText(left.server, right.server) || compareText(left.id, right.id),
  );
};

const manifestUrlForToplistSelection = (
  selection: Extract<ScanArchiveToplistSelectionResult, { status: "selected" }>,
  lookup: ScanArchiveManifestUrlLookup,
) => (typeof lookup === "function" ? lookup(selection) : lookup[selection.manifest.archiveYear]);

export function createScanArchiveEntryFromToplistSelection(
  selection: ScanArchiveToplistSelectionResult,
  manifestUrlLookup: ScanArchiveManifestUrlLookup,
): ScanArchiveEntry[] {
  if (selection.status !== "selected") return [];
  const manifestUrl = manifestUrlForToplistSelection(selection, manifestUrlLookup);
  if (!manifestUrl) return [];
  const toplistSetScanIds = selection.scans.map((scan) => scan.id);
  const toplistSetKey = selection.scans.map((scan) => `${scan.id}:${scan.sha256.toLowerCase()}`).join("|");
  return selection.scans.map((scan) => ({
    ...scan,
    archiveYear: selection.manifest.archiveYear,
    manifestRevision: selection.manifest.revision,
    manifestUrl,
    fileUrl: new URL(scan.path, manifestUrl).toString(),
    toplistSetKey,
    toplistSetScanIds,
  }));
}

export function collectScanArchiveEntriesFromToplistSelections(
  selections: readonly ScanArchiveToplistSelectionResult[] | Readonly<Record<string, ScanArchiveToplistSelectionResult>>,
  manifestUrlLookup: ScanArchiveManifestUrlLookup,
) {
  const list = Array.isArray(selections) ? selections : Object.values(selections);
  return list.flatMap((selection) => {
    return createScanArchiveEntryFromToplistSelection(selection, manifestUrlLookup);
  });
}

const loadSearchIndex = async (
  entry: ScanArchiveEntry,
  dependencies: ScanArchiveSearchIndexDependencies,
  signal?: AbortSignal,
): Promise<InFlightSearchIndexResult> => {
  if (!entry.searchIndex) throw new Error(`Archivscan ${entry.id} hat keinen Suchindex.`);

  const cached = await dependencies.getCache(entry);
  if (cached) {
    return { entry, payload: cached.payload, source: "cache", networkAccessed: false };
  }

  throwIfAborted(signal);
  const payload = validateScanArchiveSearchIndexPayload(await dependencies.downloadSearchIndex(entry, signal), entry);
  throwIfAborted(signal);
  await dependencies.putCache(entry, payload);
  return { entry, payload, source: "download", networkAccessed: true };
};

const acquireSearchIndex = (
  entry: ScanArchiveEntry,
  dependencies: ScanArchiveSearchIndexDependencies,
  signal?: AbortSignal,
) => {
  const key = searchIndexKey(entry);
  const existing = inFlightSearchIndexes.get(key);
  if (existing) return existing;

  const promise = loadSearchIndex(entry, dependencies, signal).finally(() => {
    inFlightSearchIndexes.delete(key);
  });
  inFlightSearchIndexes.set(key, promise);
  return promise;
};

const runWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal | undefined,
  worker: (item: T, index: number) => Promise<R>,
) => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    while (nextIndex < items.length) {
      throwIfAborted(signal);
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
  return results;
};

const createFailure = (entry: ScanArchiveEntry, error: unknown): ScanArchiveSearchIndexFailure => ({
  archiveScanId: entry.id,
  archiveSha256: entry.sha256,
  searchIndexSha256: entry.searchIndex?.sha256,
  server: entry.server,
  manifestYear: entry.archiveYear,
  errorCode: classifySearchIndexError(error),
  message: errorMessage(error),
});

export async function loadScanArchiveSearchIndexSet(
  selectedEntries: readonly ScanArchiveEntry[],
  options: ScanArchiveSearchIndexLoadOptions = {},
): Promise<ScanArchiveSearchIndexLoadResult> {
  const dependencies = createDependencies(options);
  const entries = uniqueExplicitSearchIndexEntries(selectedEntries);
  const failedIndexes: ScanArchiveSearchIndexFailure[] = [];
  let networkAccessed = false;

  const results = await runWithConcurrency(
    entries,
    MAX_SEARCH_INDEX_CONCURRENCY,
    options.signal,
    async (entry): Promise<InFlightSearchIndexResult | ScanArchiveSearchIndexFailure> => {
      try {
        return await acquireSearchIndex(entry, dependencies, options.signal);
      } catch (error) {
        return createFailure(entry, error);
      }
    },
  );

  const loaded: LoadedSearchIndex[] = [];
  const loadedIndexes: ScanArchiveSearchIndexLoadedItem[] = [];
  for (const result of results) {
    if ("errorCode" in result) {
      failedIndexes.push(result);
      continue;
    }
    loaded.push(result);
    loadedIndexes.push({
      archiveScanId: result.entry.id,
      archiveSha256: result.entry.sha256,
      searchIndexSha256: result.entry.searchIndex?.sha256 ?? "",
      server: result.entry.server,
      manifestYear: result.entry.archiveYear,
      scanTimestamp: result.entry.timestamp,
      source: result.source,
    });
    if (result.networkAccessed) networkAccessed = true;
  }

  return {
    status: failedIndexes.length ? (loaded.length ? "partial" : "empty") : "complete",
    searchSet: new ScanArchiveSearchIndexSet(loaded),
    loadedIndexes: loadedIndexes.sort((left, right) => compareText(left.archiveScanId, right.archiveScanId)),
    failedIndexes: failedIndexes.sort((left, right) => compareText(left.archiveScanId, right.archiveScanId)),
    networkAccessed,
  };
}

const entryMetadata = (entry: ScanArchiveEntry) => ({
  server: entry.server,
  archiveScanId: entry.id,
  archiveSha256: entry.sha256,
  searchIndexSha256: entry.searchIndex?.sha256 ?? "",
  scanTimestamp: entry.timestamp,
  manifestYear: entry.archiveYear,
});

const playerDocumentKey = (entry: ScanArchiveEntry, player: ScanArchiveSearchIndexPlayerEntry) =>
  [
    entry.id,
    player.identifier,
    player.name,
    player.guildIdentifier ?? "",
    player.guildName ?? "",
    player.classId ?? "",
  ].join("\u0000");

const guildDocumentKey = (entry: ScanArchiveEntry, guild: ScanArchiveSearchIndexGuildEntry) =>
  [entry.id, guild.identifier, guild.name].join("\u0000");

const createDocuments = (indexes: readonly LoadedSearchIndex[]) => {
  const documents: SearchDocument[] = [];

  indexes.forEach(({ entry, payload }) => {
    const seenPlayers = new Set<string>();
    payload.players.forEach((player) => {
      const key = playerDocumentKey(entry, player);
      if (seenPlayers.has(key)) return;
      seenPlayers.add(key);
      const hit: ScanArchivePlayerSearchHit = {
        kind: "player",
        name: player.name,
        identifier: player.identifier,
        ...(Object.prototype.hasOwnProperty.call(player, "guildIdentifier") ? { guildIdentifier: player.guildIdentifier } : {}),
        ...(Object.prototype.hasOwnProperty.call(player, "guildName") ? { guildName: player.guildName } : {}),
        ...(Object.prototype.hasOwnProperty.call(player, "classId") ? { classId: player.classId } : {}),
        ...entryMetadata(entry),
      };
      documents.push({
        kind: "player",
        hit,
        fields: [player.name, player.identifier, player.guildName ?? "", player.guildIdentifier ?? ""]
          .map(normalizeSearchText)
          .filter(Boolean),
      });
    });

    const seenGuilds = new Set<string>();
    payload.guilds.forEach((guild) => {
      const key = guildDocumentKey(entry, guild);
      if (seenGuilds.has(key)) return;
      seenGuilds.add(key);
      const hit: ScanArchiveGuildSearchHit = {
        kind: "guild",
        name: guild.name,
        identifier: guild.identifier,
        ...entryMetadata(entry),
      };
      documents.push({
        kind: "guild",
        hit,
        fields: [guild.name, guild.identifier].map(normalizeSearchText).filter(Boolean),
      });
    });
  });

  return documents;
};

const normalizeServerKey = (server: string) => resolveServer(server)?.code ?? server.trim().toLowerCase();

const normalizeServerFilter = (servers: readonly string[] | undefined) => {
  if (!servers?.length) return null;
  return new Set(
    servers
      .map(normalizeServerKey)
      .filter(Boolean),
  );
};

const documentMatchRank = (document: SearchDocument, query: string) => {
  let best = Number.POSITIVE_INFINITY;
  for (const field of document.fields) {
    if (field === query) best = Math.min(best, 0);
    else if (field.startsWith(query)) best = Math.min(best, 1);
    else if (field.includes(query)) best = Math.min(best, 2);
  }
  return best;
};

const compareSearchHits = (
  left: { hit: ScanArchiveSearchHit; rank: number },
  right: { hit: ScanArchiveSearchHit; rank: number },
) =>
  left.rank - right.rank ||
  compareText(left.hit.name, right.hit.name) ||
  compareText(left.hit.server, right.hit.server) ||
  compareText(left.hit.identifier, right.hit.identifier) ||
  compareText(left.hit.archiveScanId, right.hit.archiveScanId) ||
  left.hit.kind.localeCompare(right.hit.kind);

const logicalSearchHitKey = (hit: ScanArchiveSearchHit) =>
  [normalizeServerKey(hit.server), hit.kind, hit.identifier.toLowerCase()].join("\u0000");

const newestSearchHit = <T extends { hit: ScanArchiveSearchHit; rank: number }>(left: T, right: T) => {
  if (left.hit.scanTimestamp !== right.hit.scanTimestamp) return left.hit.scanTimestamp > right.hit.scanTimestamp ? left : right;
  return compareText(left.hit.archiveScanId, right.hit.archiveScanId) >= 0 ? left : right;
};

const dedupeSearchMatches = <T extends { hit: ScanArchiveSearchHit; rank: number }>(matches: readonly T[]) => {
  const byKey = new Map<string, T>();
  matches.forEach((match) => {
    const key = logicalSearchHitKey(match.hit);
    const existing = byKey.get(key);
    byKey.set(key, existing ? newestSearchHit(existing, match) : match);
  });
  return [...byKey.values()];
};

export class ScanArchiveSearchIndexSet {
  readonly entries: readonly ScanArchiveEntry[];
  private readonly documents: readonly SearchDocument[];
  private readonly entriesByArchiveKey: ReadonlyMap<string, ScanArchiveEntry>;

  constructor(indexes: readonly LoadedSearchIndex[]) {
    this.entries = [...indexes.map((index) => index.entry)];
    this.documents = createDocuments(indexes);
    this.entriesByArchiveKey = new Map(this.entries.map((entry) => [archiveEntryKey(entry), entry] as const));
  }

  getUniqueEntityCounts() {
    const players = new Set<string>();
    const guilds = new Set<string>();
    for (const { hit } of this.documents) (hit.kind === "player" ? players : guilds).add(toplistRowIdentity(hit.server, hit.identifier, hit.kind === "player" ? "players" : "groups"));
    return { players: players.size, guilds: guilds.size };
  }

  searchPlayers(query: string, options: ScanArchiveSearchOptions = {}) {
    return this.searchByKind(query, "player", options) as ScanArchivePlayerSearchHit[];
  }

  searchGuilds(query: string, options: ScanArchiveSearchOptions = {}) {
    return this.searchByKind(query, "guild", options) as ScanArchiveGuildSearchHit[];
  }

  search(query: string, options: ScanArchiveSearchOptions = {}) {
    return this.searchByKind(query, null, options);
  }

  collectArchiveEntriesForResults(results: readonly ScanArchiveSearchHit[]) {
    return collectArchiveEntriesForSearchResults(results, this.entries);
  }

  private searchByKind(
    query: string,
    kind: ScanArchiveSearchKind | null,
    options: ScanArchiveSearchOptions,
  ): ScanArchiveSearchHit[] {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return [];

    const serverFilter = normalizeServerFilter(options.servers);
    const matches = this.documents.flatMap((document) => {
      if (kind && document.kind !== kind) return [];
      if (serverFilter && !serverFilter.has(normalizeServerKey(document.hit.server))) return [];
      const rank = documentMatchRank(document, normalizedQuery);
      return Number.isFinite(rank) ? [{ hit: document.hit, rank }] : [];
    });
    const sorted = dedupeSearchMatches(matches)
      .sort(compareSearchHits)
      .map((match) => match.hit);
    return typeof options.limit === "number" && options.limit >= 0 ? sorted.slice(0, options.limit) : sorted;
  }

  getArchiveEntryForResult(result: ScanArchiveSearchHit) {
    return this.entriesByArchiveKey.get(`${result.archiveScanId}:${result.archiveSha256.toLowerCase()}`) ?? null;
  }
}

export function collectArchiveEntriesForSearchResults(
  results: readonly ScanArchiveSearchHit[],
  selectedEntries: readonly ScanArchiveEntry[],
) {
  const entryByKey = new Map(selectedEntries.map((entry) => [archiveEntryKey(entry), entry] as const));
  const selectedKeys = new Set(results.flatMap((result) => {
    const sourceKey = `${result.archiveScanId}:${result.archiveSha256.toLowerCase()}`;
    const source = entryByKey.get(sourceKey);
    if (!source?.toplistSetScanIds) return [sourceKey];
    return selectedEntries.filter(entry => source.toplistSetScanIds!.includes(entry.id) && entry.toplistSetKey === source.toplistSetKey).map(archiveEntryKey);
  }));
  return [...selectedKeys]
    .flatMap((key) => {
      const entry = entryByKey.get(key);
      return entry ? [entry] : [];
    })
    .sort((left, right) => left.timestamp - right.timestamp || compareText(left.server, right.server) || compareText(left.id, right.id));
}

export const __scanArchiveSearchIndexServiceTestUtils = {
  clearInFlightSearchIndexes: () => inFlightSearchIndexes.clear(),
  classifySearchIndexError,
  normalizeSearchText,
};
