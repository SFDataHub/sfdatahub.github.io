import assert from "node:assert/strict";

import {
  loadScanArchiveBuilderCatalogManifest,
  parseScanArchiveBuilderManifestOverride,
} from "../../src/lib/scanArchive/scanArchiveBuilderManifest.ts";
import type { ScanArchiveManifest } from "../../src/lib/scanArchive/types.ts";

const YEAR = 2026;

const manifest = (overrides: Partial<ScanArchiveManifest> = {}): ScanArchiveManifest => ({
  schemaVersion: 1,
  archiveYear: YEAR,
  revision: 7,
  updatedAt: "2026-09-20T00:00:00.000Z",
  scanCount: 0,
  serverCount: 0,
  scans: [],
  ...overrides,
});

const jsonResponse = (value: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => value,
  }) as Response;

{
  const manifestUrl = "https://example.test/scan-archive-2026/manifest.json";
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/catalog.json")) {
      return jsonResponse({
        schemaVersion: 1,
        archives: [{ year: YEAR, active: true, manifestUrl }],
      });
    }
    assert.equal(url, manifestUrl);
    return jsonResponse(manifest());
  };

  const result = await loadScanArchiveBuilderCatalogManifest({
    year: YEAR,
    catalogUrl: "https://example.test/catalog.json",
    fetcher,
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.manifest.archiveYear, YEAR);
    assert.deepEqual(result.source, {
      kind: "catalog",
      manifestUrl,
      year: YEAR,
      scanCount: 0,
    });
  }
  assert.deepEqual(calls, ["https://example.test/catalog.json", manifestUrl]);
}

{
  const result = await loadScanArchiveBuilderCatalogManifest({
    year: YEAR,
    catalogUrl: "https://example.test/catalog.json",
    fetcher: async () => jsonResponse({ schemaVersion: 1, archives: [{ year: 2025, active: true, manifestUrl: "https://example.test/2025.json" }] }),
  });
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.blocker.code, "catalog_year_missing");
}

{
  const result = parseScanArchiveBuilderManifestOverride({
    content: JSON.stringify(manifest({ revision: 11 })),
    filename: "manifest.override.json",
    year: YEAR,
  });
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.manifest.revision, 11);
    assert.deepEqual(result.source, {
      kind: "override",
      filename: "manifest.override.json",
      year: YEAR,
      scanCount: 0,
    });
  }
}

{
  const result = parseScanArchiveBuilderManifestOverride({
    content: JSON.stringify(manifest({ archiveYear: 2025 })),
    filename: "wrong-year.json",
    year: YEAR,
  });
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.blocker.code, "override_manifest_invalid");
}

console.log("scanArchiveBuilderManifest.test: ok");
