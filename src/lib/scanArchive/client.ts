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

async function fetchJson(fetcher: FetchLike, url: string) {
  const response = await fetcher(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Abruf fehlgeschlagen (${response.status}): ${url}`);
  }
  return response.json() as Promise<unknown>;
}

export async function loadScanArchiveCatalog(
  options: { fetcher?: FetchLike; catalogUrl?: string } = {},
): Promise<ScanArchiveCatalog> {
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const catalogUrl = options.catalogUrl ?? getScanArchiveCatalogUrl();
  return validateScanArchiveCatalog(await fetchJson(fetcher, catalogUrl));
}

export async function loadScanArchiveEntries(
  options: { fetcher?: FetchLike; catalogUrl?: string } = {},
): Promise<ScanArchiveEntry[]> {
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl: options.catalogUrl });
  const manifests = await Promise.all(
    catalog.archives
      .filter((archive) => archive.active)
      .map(async (archive) => {
        const manifest = validateScanArchiveManifest(
          await fetchJson(fetcher, archive.manifestUrl),
          archive.year,
        );
        return toScanArchiveEntries(manifest, archive.manifestUrl);
      }),
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
