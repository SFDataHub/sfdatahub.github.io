import { getScanArchiveCatalogUrl, loadScanArchiveCatalog } from "./client";
import type { ScanArchiveBuilderBlocker, ScanArchiveBuilderManifestSource } from "./scanArchiveBuilderTypes";
import type { ScanArchiveManifest } from "./types";
import { validateScanArchiveManifest } from "./validation";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ScanArchiveBuilderManifestResult =
  | { status: "ready"; manifest: ScanArchiveManifest; source: ScanArchiveBuilderManifestSource }
  | { status: "error"; blocker: ScanArchiveBuilderBlocker };

const blocker = (code: string, cause: string, remedy: string): ScanArchiveBuilderBlocker => ({ code, cause, remedy });

export async function loadScanArchiveBuilderCatalogManifest(options: {
  year: number;
  fetcher?: FetchLike;
  catalogUrl?: string;
}): Promise<ScanArchiveBuilderManifestResult> {
  try {
    const fetcher = options.fetcher ?? fetch.bind(globalThis);
    const catalogUrl = options.catalogUrl ?? getScanArchiveCatalogUrl();
    const catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl });
    const archive = catalog.archives.find((entry) => entry.active && entry.year === options.year);
    if (!archive) {
      return {
        status: "error",
        blocker: blocker(
          "catalog_year_missing",
          `No active scan archive manifest for ${options.year} is listed in the catalog.`,
          "Update the scan archive catalog or upload a matching manifest override.",
        ),
      };
    }
    const response = await fetcher(archive.manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Manifest request failed with HTTP ${response.status}.`);
    const manifest = validateScanArchiveManifest(await response.json(), options.year);
    return {
      status: "ready",
      manifest,
      source: {
        kind: "catalog",
        manifestUrl: archive.manifestUrl,
        year: options.year,
        scanCount: manifest.scanCount,
      },
    };
  } catch (caught) {
    return {
      status: "error",
      blocker: blocker(
        "catalog_manifest_load_failed",
        caught instanceof Error ? caught.message : "Catalog or manifest could not be loaded.",
        "Check network access, catalog validity, or use a manual manifest override.",
      ),
    };
  }
}

export function parseScanArchiveBuilderManifestOverride(options: {
  content: string;
  filename: string;
  year: number;
}): ScanArchiveBuilderManifestResult {
  try {
    const manifest = validateScanArchiveManifest(JSON.parse(options.content) as unknown, options.year);
    return {
      status: "ready",
      manifest,
      source: { kind: "override", filename: options.filename, year: options.year, scanCount: manifest.scanCount },
    };
  } catch (caught) {
    return {
      status: "error",
      blocker: blocker(
        "override_manifest_invalid",
        caught instanceof Error ? caught.message : "The override manifest is invalid.",
        "Upload a manifest.json for the same archive year as the input file.",
      ),
    };
  }
}
