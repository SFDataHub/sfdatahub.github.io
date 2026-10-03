import {
  bindSfDataHubLocalScanToArchiveEntry,
  commitSfDataHubLocalScanPreview,
  createSfDataHubLocalScanImportPreview,
  findSfDataHubLocalScanByArchiveBinding,
  findSfDataHubLocalScanByArchiveScanId,
  listSfDataHubScanSummaries,
  type GuildHubImportScanResult,
  type GuildHubLocalScan,
  type GuildHubScanSummary,
} from "../guilds/localScanLibrary";
import {
  resolveLocalFirstScanPlan,
  type LocalFirstScanPlan,
  type LocalFirstScanRequest,
} from "../guilds/localFirstScanResolver";
import { createScanArchiveSourceMetadata, loadScanArchiveCatalog } from "./client";
import {
  ScanArchiveDownloadCancelledError,
  startScanArchiveDownloadWorkerRun,
  type ScanArchiveDownloadRun,
} from "./downloadWorkerClient";
import type { ScanArchiveEntry, ScanArchiveManifest } from "./types";
import { toScanArchiveEntries, validateScanArchiveManifest } from "./validation";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type LocalFirstScanAcquisitionErrorCode =
  | "catalog-error"
  | "manifest-error"
  | "archive-not-available"
  | "network-error"
  | "hash-or-size-error"
  | "gzip-json-or-structure-error"
  | "server-or-timestamp-mismatch"
  | "preview-import-error"
  | "indexeddb-error"
  | "aborted"
  | "unknown-error";

export type LocalFirstScanAcquiredArchive = {
  archiveScanId: string;
  localScanId: string;
  status: "imported" | "duplicate" | "bound-duplicate";
};

export type LocalFirstScanSkippedArchive = {
  archiveScanId: string;
  localScanId: string;
  reason: "sidecar-local" | "already-local" | "race-sidecar-local" | "race-already-local";
};

export type LocalFirstScanFailedArchive = {
  archiveScanId: string;
  errorCode: LocalFirstScanAcquisitionErrorCode;
  message: string;
};

export type LocalFirstScanManifestFailure = {
  year: number;
  errorCode: LocalFirstScanAcquisitionErrorCode;
  message: string;
};

export type LocalFirstScanAcquisitionResult = {
  status: LocalFirstScanPlan["status"];
  localScanIds: string[];
  plan: LocalFirstScanPlan;
  acquiredArchives: LocalFirstScanAcquiredArchive[];
  skippedArchives: LocalFirstScanSkippedArchive[];
  failedArchives: LocalFirstScanFailedArchive[];
  loadedManifestYears: number[];
  manifestFailures: LocalFirstScanManifestFailure[];
  networkAccessed: boolean;
};

export type LocalFirstScanAcquisitionDependencies = {
  listLocalScanSummaries: () => Promise<GuildHubScanSummary[]>;
  findLocalScanByArchiveBinding: (entry: ScanArchiveEntry) => Promise<GuildHubLocalScan | null>;
  findLocalScanByArchiveScanId: (archiveScanId: string) => Promise<GuildHubLocalScan | null>;
  bindLocalScanToArchiveEntry: (entry: ScanArchiveEntry, localScanId: string) => Promise<unknown>;
  createLocalScanImportPreview: typeof createSfDataHubLocalScanImportPreview;
  commitLocalScanPreview: typeof commitSfDataHubLocalScanPreview;
  downloadArchiveEntry: (entry: ScanArchiveEntry, signal?: AbortSignal) => Promise<{ content: string }>;
  loadManifestEntriesForYears: (years: readonly number[], signal?: AbortSignal) => Promise<LoadManifestEntriesResult>;
  loadCandidateManifestEntries: (request: LocalFirstScanRequest, signal?: AbortSignal) => Promise<LoadManifestEntriesResult>;
};

export type LocalFirstScanAcquisitionOptions = {
  archiveEntries?: readonly ScanArchiveEntry[];
  availableManifestYears?: readonly number[];
  signal?: AbortSignal;
  dependencies?: Partial<LocalFirstScanAcquisitionDependencies>;
  fetcher?: FetchLike;
  catalogUrl?: string;
};

type LoadManifestEntriesResult = {
  entries: ScanArchiveEntry[];
  loadedYears: number[];
  failures: LocalFirstScanManifestFailure[];
};

export type ExplicitLocalFirstArchiveScanStatus =
  | "sidecar-local"
  | "already-local"
  | "race-sidecar-local"
  | "race-already-local"
  | "imported"
  | "duplicate"
  | "bound-duplicate";

export type ExplicitLocalFirstArchiveScanResult = {
  archiveScanId: string;
  archiveSha256: string;
  localScanId: string;
  status: ExplicitLocalFirstArchiveScanStatus;
};

export type ExplicitLocalFirstArchiveScanFailure = {
  archiveScanId: string;
  archiveSha256: string;
  errorCode: LocalFirstScanAcquisitionErrorCode;
  message: string;
};

export type ExplicitLocalFirstArchiveScansResult = {
  status: LocalFirstScanPlan["status"];
  localScanIds: string[];
  selectedArchives: ExplicitLocalFirstArchiveScanResult[];
  failedArchives: ExplicitLocalFirstArchiveScanFailure[];
  networkAccessed: boolean;
};

type InFlightArchiveResult =
  | { status: "imported"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "duplicate"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "bound-duplicate"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "sidecar-local"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "already-local"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "race-sidecar-local"; archiveScanId: string; localScanId: string; networkAccessed: boolean }
  | { status: "race-already-local"; archiveScanId: string; localScanId: string; networkAccessed: boolean };

const MAX_DOWNLOAD_CONCURRENCY = 2;
const inFlightArchiveImports = new Map<string, Promise<InFlightArchiveResult>>();

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const uniqueSortedNumbers = (values: Iterable<number>) =>
  [...new Set([...values].filter((value) => Number.isInteger(value)))].sort((left, right) => left - right);

const mergeArchiveEntries = (...groups: Array<readonly ScanArchiveEntry[]>) => {
  const byId = new Map<string, ScanArchiveEntry>();
  groups.flat().forEach((entry) => {
    if (!byId.has(entry.id)) byId.set(entry.id, entry);
  });
  return [...byId.values()].sort(
    (left, right) => left.timestamp - right.timestamp || compareText(left.server, right.server) || compareText(left.id, right.id),
  );
};

const defaultDownloadArchiveEntry = async (entry: ScanArchiveEntry, signal?: AbortSignal) => {
  throwIfAborted(signal);
  const run = startScanArchiveDownloadWorkerRun({ entry });
  const abortListener = () => run.cancel();
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const result = await run.promise;
    throwIfAborted(signal);
    return { content: result.content };
  } finally {
    signal?.removeEventListener("abort", abortListener);
  }
};

const fetchJson = async (fetcher: FetchLike, url: string, signal?: AbortSignal) => {
  const response = await fetcher(url, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`fetch_failed:${response.status}`);
  return response.json() as Promise<unknown>;
};

const createDefaultManifestLoader = (options: { fetcher?: FetchLike; catalogUrl?: string } = {}) =>
  async (years: readonly number[], signal?: AbortSignal): Promise<LoadManifestEntriesResult> => {
    if (!years.length) return { entries: [], loadedYears: [], failures: [] };
    const fetcher = options.fetcher ?? fetch.bind(globalThis);
    const wantedYears = new Set(years);
    const entries: ScanArchiveEntry[] = [];
    const loadedYears: number[] = [];
    const failures: LocalFirstScanManifestFailure[] = [];

    try {
      throwIfAborted(signal);
      const catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl: options.catalogUrl });
      const archives = catalog.archives.filter((archive) => archive.active && wantedYears.has(archive.year));
      for (const year of years) {
        const archive = archives.find((candidate) => candidate.year === year);
        if (!archive) {
          failures.push({ year, errorCode: "manifest-error", message: "manifest_year_not_in_catalog" });
          continue;
        }
        try {
          throwIfAborted(signal);
          const manifest = validateScanArchiveManifest(await fetchJson(fetcher, archive.manifestUrl, signal), archive.year);
          entries.push(...toScanArchiveEntries(manifest, archive.manifestUrl));
          loadedYears.push(archive.year);
        } catch (error) {
          failures.push({ year, errorCode: classifyManifestError(error), message: errorMessage(error) });
        }
      }
    } catch (error) {
      years.forEach((year) => failures.push({ year, errorCode: classifyManifestError(error), message: errorMessage(error) }));
    }

    return { entries, loadedYears: uniqueSortedNumbers(loadedYears), failures };
  };

const createDefaultCandidateManifestLoader = (options: { fetcher?: FetchLike; catalogUrl?: string } = {}) =>
  async (request: LocalFirstScanRequest, signal?: AbortSignal): Promise<LoadManifestEntriesResult> => {
    if (request.time.kind !== "latest") return { entries: [], loadedYears: [], failures: [] };
    const fetcher = options.fetcher ?? fetch.bind(globalThis);
    try {
      throwIfAborted(signal);
      const catalog = await loadScanArchiveCatalog({ fetcher, catalogUrl: options.catalogUrl });
      return createDefaultManifestLoader({ fetcher, catalogUrl: options.catalogUrl })(
        catalog.archives.filter((archive) => archive.active).map((archive) => archive.year),
        signal,
      );
    } catch (error) {
      return {
        entries: [],
        loadedYears: [],
        failures: [{ year: 0, errorCode: classifyManifestError(error), message: errorMessage(error) }],
      };
    }
  };

const defaultDependencies = (options: LocalFirstScanAcquisitionOptions): LocalFirstScanAcquisitionDependencies => ({
  listLocalScanSummaries: () => listSfDataHubScanSummaries(),
  findLocalScanByArchiveBinding: findSfDataHubLocalScanByArchiveBinding,
  findLocalScanByArchiveScanId: findSfDataHubLocalScanByArchiveScanId,
  bindLocalScanToArchiveEntry: bindSfDataHubLocalScanToArchiveEntry,
  createLocalScanImportPreview: createSfDataHubLocalScanImportPreview,
  commitLocalScanPreview: commitSfDataHubLocalScanPreview,
  downloadArchiveEntry: defaultDownloadArchiveEntry,
  loadManifestEntriesForYears: createDefaultManifestLoader({ fetcher: options.fetcher, catalogUrl: options.catalogUrl }),
  loadCandidateManifestEntries: createDefaultCandidateManifestLoader({ fetcher: options.fetcher, catalogUrl: options.catalogUrl }),
});

const createDependencies = (options: LocalFirstScanAcquisitionOptions) => ({
  ...defaultDependencies(options),
  ...options.dependencies,
});

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown_error"));

const classifyManifestError = (error: unknown): LocalFirstScanAcquisitionErrorCode => {
  if (isAbortError(error)) return "aborted";
  const message = errorMessage(error);
  if (/fetch_failed|Failed to fetch|network/i.test(message)) return "network-error";
  return "manifest-error";
};

const classifyArchiveError = (error: unknown): LocalFirstScanAcquisitionErrorCode => {
  if (error instanceof ScanArchiveDownloadCancelledError || isAbortError(error)) return "aborted";
  const message = errorMessage(error);
  if (/404|fetch_failed|Download fehlgeschlagen|Failed to fetch|network/i.test(message)) return "network-error";
  if (/SHA-256|Pruefsumme|Groesse|groesse|size|hash/i.test(message)) return "hash-or-size-error";
  if (/gzip|JSON|UTF-8|players\/groups|Struktur|Rohdaten/i.test(message)) return "gzip-json-or-structure-error";
  if (/Timestamp|Server|gehoert nicht|abweichenden/i.test(message)) return "server-or-timestamp-mismatch";
  if (/IndexedDB|IDB|database|transaction/i.test(message)) return "indexeddb-error";
  return "unknown-error";
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const archiveInflightKey = (entry: Pick<ScanArchiveEntry, "id" | "sha256">) => `${entry.id}:${entry.sha256.toLowerCase()}`;

const archiveImportFilename = (entry: ScanArchiveEntry) => {
  const filename = entry.path.split("/").pop() ?? entry.id;
  const displayName = filename.endsWith(".gz") ? filename.slice(0, -3) : filename;
  return displayName.toLowerCase().endsWith(".json") ? displayName : `${displayName}.json`;
};

const importArchiveEntry = async (
  entry: ScanArchiveEntry,
  dependencies: LocalFirstScanAcquisitionDependencies,
  signal?: AbortSignal,
): Promise<InFlightArchiveResult> => {
  const boundBeforeDownload = await dependencies.findLocalScanByArchiveBinding(entry);
  if (boundBeforeDownload) {
    return { status: "sidecar-local", archiveScanId: entry.id, localScanId: boundBeforeDownload.id, networkAccessed: false };
  }

  const beforeDownload = await dependencies.findLocalScanByArchiveScanId(entry.id);
  if (beforeDownload?.archiveSource?.sha256 === entry.sha256) {
    return { status: "already-local", archiveScanId: entry.id, localScanId: beforeDownload.id, networkAccessed: false };
  }

  throwIfAborted(signal);
  const downloaded = await dependencies.downloadArchiveEntry(entry, signal);
  throwIfAborted(signal);

  const boundBeforeCommit = await dependencies.findLocalScanByArchiveBinding(entry);
  if (boundBeforeCommit) {
    return { status: "race-sidecar-local", archiveScanId: entry.id, localScanId: boundBeforeCommit.id, networkAccessed: true };
  }

  const beforeCommit = await dependencies.findLocalScanByArchiveScanId(entry.id);
  if (beforeCommit?.archiveSource?.sha256 === entry.sha256) {
    return { status: "race-already-local", archiveScanId: entry.id, localScanId: beforeCommit.id, networkAccessed: true };
  }

  try {
    const preview = await dependencies.createLocalScanImportPreview(archiveImportFilename(entry), downloaded.content, {
      archiveSource: createScanArchiveSourceMetadata(entry),
    });
    const committed: GuildHubImportScanResult = await dependencies.commitLocalScanPreview(preview);
    await dependencies.bindLocalScanToArchiveEntry(entry, committed.scan.id);
    const duplicateIsArchiveCopy =
      committed.status === "duplicate" &&
      committed.scan.archiveSource?.archiveScanId === entry.id &&
      committed.scan.archiveSource.sha256 === entry.sha256;
    return {
      status: committed.status === "duplicate" && !duplicateIsArchiveCopy ? "bound-duplicate" : committed.status,
      archiveScanId: entry.id,
      localScanId: committed.scan.id,
      networkAccessed: true,
    };
  } catch (error) {
    if (/IndexedDB|IDB|database|transaction/i.test(errorMessage(error))) throw error;
    const wrapped = new Error(errorMessage(error));
    wrapped.name = "LocalFirstScanPreviewImportError";
    throw wrapped;
  }
};

const acquireArchiveEntry = (
  entry: ScanArchiveEntry,
  dependencies: LocalFirstScanAcquisitionDependencies,
  signal?: AbortSignal,
) => {
  const key = archiveInflightKey(entry);
  const existing = inFlightArchiveImports.get(key);
  if (existing) return existing;

  const promise = importArchiveEntry(entry, dependencies, signal).finally(() => {
    inFlightArchiveImports.delete(key);
  });
  inFlightArchiveImports.set(key, promise);
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

const planWith = (
  request: LocalFirstScanRequest,
  localScanSummaries: readonly GuildHubScanSummary[],
  archiveEntries: readonly ScanArchiveEntry[],
  availableManifestYears?: readonly number[],
) =>
  resolveLocalFirstScanPlan({
    request,
    localScanSummaries,
    archiveEntries,
    ...(availableManifestYears ? { availableManifestYears } : {}),
  });

const collectCandidateEntries = (plan: LocalFirstScanPlan) =>
  plan.archiveCandidates
    .map((candidate) => candidate.entry)
    .sort((left, right) => left.timestamp - right.timestamp || compareText(left.server, right.server) || compareText(left.id, right.id));

const uniqueExplicitEntries = (entries: readonly ScanArchiveEntry[]) => {
  const byKey = new Map<string, ScanArchiveEntry>();
  const failures: ExplicitLocalFirstArchiveScanFailure[] = [];
  const seenShaById = new Map<string, string>();
  for (const entry of entries) {
    const previousSha = seenShaById.get(entry.id);
    if (previousSha && previousSha !== entry.sha256) {
      failures.push({
        archiveScanId: entry.id,
        archiveSha256: entry.sha256,
        errorCode: "manifest-error",
        message: "conflicting_archive_selection_sha",
      });
      continue;
    }
    seenShaById.set(entry.id, entry.sha256);
    const key = archiveInflightKey(entry);
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return { entries: [...byKey.values()], failures };
};

export async function acquireExplicitLocalFirstArchiveScans(
  selectedEntries: readonly ScanArchiveEntry[],
  options: Omit<LocalFirstScanAcquisitionOptions, "archiveEntries" | "availableManifestYears"> = {},
): Promise<ExplicitLocalFirstArchiveScansResult> {
  const dependencies = createDependencies(options);
  const { entries, failures } = uniqueExplicitEntries(selectedEntries);
  const selectedArchives: ExplicitLocalFirstArchiveScanResult[] = [];
  let networkAccessed = false;

  const results = await runWithConcurrency(
    entries,
    MAX_DOWNLOAD_CONCURRENCY,
    options.signal,
    async (entry): Promise<InFlightArchiveResult | ExplicitLocalFirstArchiveScanFailure> => {
      try {
        return await acquireArchiveEntry(entry, dependencies, options.signal);
      } catch (error) {
        return {
          archiveScanId: entry.id,
          archiveSha256: entry.sha256,
          errorCode: error instanceof Error && error.name === "LocalFirstScanPreviewImportError" ? "preview-import-error" : classifyArchiveError(error),
          message: errorMessage(error),
        };
      }
    },
  );

  for (const result of results) {
    if ("errorCode" in result) {
      failures.push(result);
      continue;
    }
    selectedArchives.push({
      archiveScanId: result.archiveScanId,
      archiveSha256: entries.find((entry) => entry.id === result.archiveScanId)?.sha256 ?? "",
      localScanId: result.localScanId,
      status: result.status,
    });
    if (result.networkAccessed) networkAccessed = true;
  }

  const localScanIds = [...new Set(selectedArchives.map((entry) => entry.localScanId))].sort(compareText);
  return {
    status: failures.length ? (selectedArchives.length ? "partial" : "empty") : "complete",
    localScanIds,
    selectedArchives: selectedArchives.sort((left, right) => compareText(left.archiveScanId, right.archiveScanId)),
    failedArchives: failures.sort((left, right) => compareText(left.archiveScanId, right.archiveScanId)),
    networkAccessed,
  };
}

export async function acquireLocalFirstScans(
  request: LocalFirstScanRequest,
  options: LocalFirstScanAcquisitionOptions = {},
): Promise<LocalFirstScanAcquisitionResult> {
  const dependencies = createDependencies(options);
  const signal = options.signal;
  const acquiredArchives: LocalFirstScanAcquiredArchive[] = [];
  const skippedArchives: LocalFirstScanSkippedArchive[] = [];
  const failedArchives: LocalFirstScanFailedArchive[] = [];
  const manifestFailures: LocalFirstScanManifestFailure[] = [];
  const loadedManifestYears = new Set<number>();
  let networkAccessed = false;
  let archiveEntries = mergeArchiveEntries(options.archiveEntries ?? []);
  let availableManifestYears = options.availableManifestYears
    ? uniqueSortedNumbers(options.availableManifestYears)
    : uniqueSortedNumbers(archiveEntries.map((entry) => entry.archiveYear));

  let localScanSummaries = await dependencies.listLocalScanSummaries();
  let plan = planWith(request, localScanSummaries, archiveEntries);
  if (plan.status === "complete") {
    return {
      status: plan.status,
      localScanIds: plan.localScanIds,
      plan,
      acquiredArchives,
      skippedArchives,
      failedArchives,
      loadedManifestYears: [],
      manifestFailures,
      networkAccessed,
    };
  }

  throwIfAborted(signal);
  plan = planWith(request, localScanSummaries, archiveEntries, availableManifestYears);
  const missingYears = plan.missingManifestYears;
  if (missingYears.length) {
    networkAccessed = true;
    const loaded = await dependencies.loadManifestEntriesForYears(missingYears, signal);
    archiveEntries = mergeArchiveEntries(archiveEntries, loaded.entries);
    loaded.loadedYears.forEach((year) => loadedManifestYears.add(year));
    manifestFailures.push(...loaded.failures);
    availableManifestYears = uniqueSortedNumbers([...availableManifestYears, ...loaded.loadedYears]);
    plan = planWith(request, localScanSummaries, archiveEntries, availableManifestYears);
  } else if (!archiveEntries.length || request.time.kind === "latest") {
    networkAccessed = true;
    const loaded = await dependencies.loadCandidateManifestEntries(request, signal);
    archiveEntries = mergeArchiveEntries(archiveEntries, loaded.entries);
    loaded.loadedYears.forEach((year) => loadedManifestYears.add(year));
    manifestFailures.push(...loaded.failures);
    availableManifestYears = uniqueSortedNumbers([...availableManifestYears, ...loaded.loadedYears]);
    plan = planWith(request, localScanSummaries, archiveEntries, availableManifestYears);
  }

  const candidates = collectCandidateEntries(plan);
  const candidateResults = await runWithConcurrency(
    candidates,
    MAX_DOWNLOAD_CONCURRENCY,
    signal,
    async (entry): Promise<InFlightArchiveResult | LocalFirstScanFailedArchive> => {
      try {
        return await acquireArchiveEntry(entry, dependencies, signal);
      } catch (error) {
        return {
          archiveScanId: entry.id,
          errorCode: error instanceof Error && error.name === "LocalFirstScanPreviewImportError" ? "preview-import-error" : classifyArchiveError(error),
          message: errorMessage(error),
        };
      }
    },
  );

  for (const result of candidateResults) {
    if ("errorCode" in result) {
      failedArchives.push(result);
    } else if (
      result.status === "sidecar-local" ||
      result.status === "already-local" ||
      result.status === "race-sidecar-local" ||
      result.status === "race-already-local"
    ) {
      skippedArchives.push({ archiveScanId: result.archiveScanId, localScanId: result.localScanId, reason: result.status });
    } else {
      acquiredArchives.push({ archiveScanId: result.archiveScanId, localScanId: result.localScanId, status: result.status });
    }
    if (!("errorCode" in result) && result.networkAccessed) networkAccessed = true;
  }

  localScanSummaries = await dependencies.listLocalScanSummaries();
  plan = planWith(request, localScanSummaries, archiveEntries, availableManifestYears);

  return {
    status: plan.status,
    localScanIds: plan.localScanIds,
    plan,
    acquiredArchives,
    skippedArchives,
    failedArchives,
    loadedManifestYears: uniqueSortedNumbers(loadedManifestYears),
    manifestFailures,
    networkAccessed,
  };
}

export const __localFirstScanAcquisitionTestUtils = {
  archiveInflightKey,
  clearInFlightArchiveImports: () => inFlightArchiveImports.clear(),
};
