import {
  toScanArchiveEntries,
  validateScanArchiveCatalog,
  validateScanArchiveManifest,
} from "./validation";
import type { ScanArchiveCatalog, ScanArchiveEntry } from "./types";

const CATALOG_PATH = "data/scan-archive/catalog.json";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function getScanArchiveCatalogUrl() {
  const base = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
  return new URL(CATALOG_PATH, base).toString();
}

// Share only concurrent metadata requests, not a stale lifetime cache. A caller
// cancelling its wait does not abort another consumer's transport.
const metadataRequests = new WeakMap<FetchLike, Map<string, Promise<unknown>>>();
const defaultFetcher: FetchLike = (input, init) => fetch(input, init);
const metadataVersions = new Map<string, string>();
const metadataListeners = new Set<() => void>();
export function subscribeToScanArchiveMetadata(listener: () => void) {
  metadataListeners.add(listener);
  return () => { metadataListeners.delete(listener); };
}
function noteMetadata(url: string, value: unknown) {
  const version = JSON.stringify(value), previous = metadataVersions.get(url);
  metadataVersions.set(url, version);
  if (previous !== undefined && previous !== version) {
    for (const listener of metadataListeners) { try { listener(); } catch (error) { console.error(error); } }
  }
}
async function fetchJson(fetcher: FetchLike, url: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let requests = metadataRequests.get(fetcher);
  if (!requests) metadataRequests.set(fetcher, requests = new Map());
  let pending = requests.get(url);
  if (!pending) {
    pending = (async () => {
      const response = await fetcher(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Abruf fehlgeschlagen (${response.status}): ${url}`);
      return response.json() as Promise<unknown>;
    })();
    requests.set(url, pending);
    const clear = () => { if (requests!.get(url) === pending) requests!.delete(url); };
    void pending.then(clear, clear);
  }
  if (!signal) return pending;
  return new Promise<unknown>((resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    void pending!.then(value => { signal.removeEventListener("abort", abort); if (!signal.aborted) resolve(value); }, error => {
      signal.removeEventListener("abort", abort); reject(error);
    });
  });
}

export async function loadScanArchiveCatalog(
  options: { fetcher?: FetchLike; catalogUrl?: string; signal?: AbortSignal } = {},
): Promise<ScanArchiveCatalog> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const catalogUrl = options.catalogUrl ?? getScanArchiveCatalogUrl();
  const catalog = validateScanArchiveCatalog(await fetchJson(fetcher, catalogUrl, options.signal));
  noteMetadata(catalogUrl, catalog);
  return catalog;
}

export async function loadScanArchiveManifestEntries(archive: ScanArchiveCatalog["archives"][number],
  options: { fetcher?: FetchLike; signal?: AbortSignal } = {}) {
  const manifest = validateScanArchiveManifest(await fetchJson(options.fetcher ?? defaultFetcher, archive.manifestUrl, options.signal), archive.year);
  noteMetadata(archive.manifestUrl, manifest);
  return { manifest, entries: toScanArchiveEntries(manifest, archive.manifestUrl), updatedAt: manifest.updatedAt };
}

export async function loadScanArchiveEntries(
  options: { fetcher?: FetchLike; catalogUrl?: string } = {},
): Promise<ScanArchiveEntry[]> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl: options.catalogUrl });
  const manifests = await Promise.all(
    catalog.archives
      .filter((archive) => archive.active)
      .map(async (archive) => (await loadScanArchiveManifestEntries(archive, { fetcher })).entries),
  );
  return manifests.flat().sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));
}

export function createScanArchiveSourceMetadata(entry: ScanArchiveEntry) {
  return {
    provider: "scan-archive" as const,
    archiveScanId: entry.id,
    archiveYear: entry.archiveYear,
    manifestRevision: entry.manifestRevision,
    manifestUrl: entry.manifestUrl,
    path: entry.path,
    sha256: entry.sha256,
    server: entry.server,
    timestamp: entry.timestamp,
  };
}

// Content-addressed, validated ranking payloads are shared by all consumers.
// Failed downloads are retryable; no raw scans or derived player stores are touched.
const rankingPayloads = new Map<string, Promise<import("./monthlyRanking").MonthlyRankingPayload>>();
export async function loadScanArchiveMonthlyRanking(
  manifest: import("./types").ScanArchiveManifest, manifestUrl: string, month: string, server: string,
  options: { fetcher?: FetchLike } = {},
) {
  const metadata = manifest.rankings?.[month]?.[server];
  if (!metadata) return null;
  const { rankingPoolForMonth, validateMonthlyRanking } = await import("./monthlyRanking");
  const { sha256Hex, gunzipArrayBuffer } = await import("./compressedJson");
  const pool = rankingPoolForMonth(manifest, month);
  const url = new URL(metadata.path, manifestUrl); url.searchParams.set("sha256", metadata.sha256.toLowerCase());
  const key = JSON.stringify([url.toString(), metadata, pool]);
  let pending = rankingPayloads.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await (options.fetcher ?? defaultFetcher)(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Ranking download failed (${response.status}): ${url}`);
      const compressed = await response.arrayBuffer();
      if (compressed.byteLength !== metadata.compressedBytes || await sha256Hex(compressed) !== metadata.sha256.toLowerCase()) throw new Error("Ranking compressed size/hash mismatch");
      const raw = await gunzipArrayBuffer(compressed);
      if (raw.byteLength !== metadata.uncompressedBytes) throw new Error("Ranking uncompressed size mismatch");
      return validateMonthlyRanking(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)), { month, server, pool, metadata });
    })();
    rankingPayloads.set(key, pending);
    void pending.catch(() => { if (rankingPayloads.get(key) === pending) rankingPayloads.delete(key); });
  }
  return pending;
}

/** Use the existing official current selection, then its explicit UTC month.
 * Missing monthly data never silently selects another month. */
export async function loadScanArchiveCurrentRanking(server: string, options: { fetcher?: FetchLike; catalogUrl?: string } = {}) {
  const { serverComparisonKey } = await import("../servers/serverResolver");
  const { resolveScanArchiveCurrentToplistScan, resolveScanArchiveMonthlyToplistScan } = await import("./toplistSelection");
  const catalog = await loadScanArchiveCatalog(options);
  const loaded = await Promise.all(catalog.archives.filter(archive => archive.active).map(async archive => ({
    ...await loadScanArchiveManifestEntries(archive, options), manifestUrl: archive.manifestUrl,
  })));
  const manifests = loaded.map(row => row.manifest);
  const servers = [...new Set(manifests.flatMap(manifest => Object.keys(manifest.toplists?.current ?? {})))];
  const matches = servers.filter(key => serverComparisonKey(key) === serverComparisonKey(server));
  if (matches.length !== 1) return { month: null, server, payload: null };
  const archiveServer = matches[0];
  const current = resolveScanArchiveCurrentToplistScan(manifests, archiveServer);
  if (current.status !== "selected") return { month: null, server: archiveServer, payload: null };
  const month = new Date(Math.max(...current.scans.map(scan => scan.timestamp))).toISOString().slice(0, 7);
  const monthly = resolveScanArchiveMonthlyToplistScan(manifests, archiveServer, month);
  if (monthly.status !== "selected") return { month, server: archiveServer, payload: null };
  const manifestUrl = loaded.find(row => row.manifest === monthly.manifest)!.manifestUrl;
  return { month, server: archiveServer, payload: await loadScanArchiveMonthlyRanking(monthly.manifest, manifestUrl, month, archiveServer, options) };
}
