import {
  resolveLocalFirstScanPlan,
  resolveLocalFirstScanSegments,
  type LocalFirstScanCompleteness,
  type LocalFirstScanDataKind,
  type LocalFirstScanPlan,
  type LocalFirstScanRequest,
  type LocalFirstScanResolvedSegment,
  type LocalFirstScanResolvedSegmentInput,
  type LocalFirstScanTarget,
} from "../guilds/localFirstScanResolver";
import {
  listSfDataHubScanSummaries,
  type GuildHubFusionInventorySlice,
  type GuildHubScanSummary,
} from "../guilds/localScanLibrary";
import { resolveServer } from "../servers/serverResolver";
import { loadScanArchiveCatalog } from "./client";
import {
  acquireLocalFirstScans,
  type LocalFirstScanAcquiredArchive,
  type LocalFirstScanAcquisitionOptions,
  type LocalFirstScanFailedArchive,
  type LocalFirstScanManifestFailure,
  type LocalFirstScanSkippedArchive,
} from "./localFirstScanAcquisition";
import type { ScanArchiveCatalog, ScanArchiveCatalogEntry, ScanArchiveEntry } from "./types";
import { toScanArchiveEntries, validateScanArchiveManifest } from "./validation";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type LocalFirstFeatureTimeRequirement =
  | { kind: "latest" }
  | { kind: "exact"; timestamp: number }
  | { kind: "interval"; from: number; to: number }
  | { kind: "all" }
  | { kind: "relative"; durationMs?: number; months?: number };

export type LocalFirstFeatureRequest = {
  target: LocalFirstScanTarget;
  segments?: LocalFirstScanResolvedSegmentInput[];
  time: LocalFirstFeatureTimeRequirement;
  dataKind: LocalFirstScanDataKind;
  completeness: LocalFirstScanCompleteness;
};

export type LocalFirstFeatureManifestLoadResult = {
  entries: ScanArchiveEntry[];
  loadedYears: number[];
  failures: LocalFirstScanManifestFailure[];
};

export type LocalFirstFeatureAcquisitionDependencies = {
  listLocalScanSummaries: () => Promise<GuildHubScanSummary[]>;
  acquireLocalFirstScans: typeof acquireLocalFirstScans;
  loadScanArchiveCatalog: (signal?: AbortSignal) => Promise<ScanArchiveCatalog>;
  loadManifestEntriesForArchives: (
    archives: readonly ScanArchiveCatalogEntry[],
    signal?: AbortSignal,
  ) => Promise<LocalFirstFeatureManifestLoadResult>;
};

export type LocalFirstFeaturePrepareOptions = {
  signal?: AbortSignal;
  localScanSummaries?: readonly GuildHubScanSummary[];
  dependencies?: Partial<LocalFirstFeatureAcquisitionDependencies>;
  fetcher?: FetchLike;
  catalogUrl?: string;
};

export type LocalFirstFeatureAcquisitionOptions = LocalFirstFeaturePrepareOptions & {
  acquisitionOptions?: Omit<LocalFirstScanAcquisitionOptions, "archiveEntries" | "availableManifestYears" | "signal">;
  shouldAcquirePreparedRequest?: (prepared: LocalFirstFeaturePreparedAcquisition) => boolean;
};

export type LocalFirstFeaturePreparedAcquisition = {
  key: string;
  featureRequest: LocalFirstFeatureRequest;
  request: LocalFirstScanRequest;
  segments: LocalFirstScanResolvedSegment[];
  localScanSummaries: readonly GuildHubScanSummary[];
  archiveEntries: readonly ScanArchiveEntry[];
  availableManifestYears: readonly number[];
  manifestFailures: readonly LocalFirstScanManifestFailure[];
  manifestStatus: "complete" | "partial" | "offline";
  localPlan: LocalFirstScanPlan;
};

export type LocalFirstFeatureAcquisitionResult = {
  key: string;
  preparedRequest: LocalFirstFeaturePreparedAcquisition;
  status: LocalFirstScanPlan["status"];
  localScanIds: string[];
  plan: LocalFirstScanPlan;
  acquiredArchives: LocalFirstScanAcquiredArchive[];
  skippedArchives: LocalFirstScanSkippedArchive[];
  failedArchives: LocalFirstScanFailedArchive[];
  loadedManifestYears: number[];
  manifestFailures: LocalFirstScanManifestFailure[];
  manifestStatus: LocalFirstFeaturePreparedAcquisition["manifestStatus"];
  networkAccessed: boolean;
  storedScanCount: number;
  shouldReloadLocalScanPool: boolean;
  skippedReason?: "duplicate-or-failed";
};

type ManifestYearLoad = {
  year: number;
  entries: ScanArchiveEntry[];
  loaded: boolean;
  failure?: LocalFirstScanManifestFailure;
};

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

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown_error"));

const classifyManifestError = (error: unknown) => {
  if (isAbortError(error)) return "aborted";
  return /fetch_failed|Failed to fetch|network/i.test(errorMessage(error)) ? "network-error" : "manifest-error";
};

const fetchJson = async (fetcher: FetchLike, url: string) => {
  const response = await fetcher(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`fetch_failed:${response.status}`);
  return response.json() as Promise<unknown>;
};

const manifestInflight = new Map<string, Promise<ManifestYearLoad>>();

const loadManifestYear = (
  archive: ScanArchiveCatalogEntry,
  fetcher: FetchLike,
) => {
  const key = `${archive.year}:${archive.manifestUrl}`;
  const existing = manifestInflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<ManifestYearLoad> => {
    try {
      const manifest = validateScanArchiveManifest(await fetchJson(fetcher, archive.manifestUrl), archive.year);
      return {
        year: archive.year,
        entries: toScanArchiveEntries(manifest, archive.manifestUrl),
        loaded: true,
      };
    } catch (error) {
      return {
        year: archive.year,
        entries: [],
        loaded: false,
        failure: { year: archive.year, errorCode: classifyManifestError(error), message: errorMessage(error) },
      };
    }
  })().finally(() => {
    manifestInflight.delete(key);
  });
  manifestInflight.set(key, promise);
  return promise;
};

const createDefaultManifestArchiveLoader = (options: { fetcher?: FetchLike } = {}) =>
  async (
    archives: readonly ScanArchiveCatalogEntry[],
    signal?: AbortSignal,
  ): Promise<LocalFirstFeatureManifestLoadResult> => {
    const fetcher = options.fetcher ?? fetch.bind(globalThis);
    throwIfAborted(signal);
    const loads = await Promise.all(archives.map((archive) => loadManifestYear(archive, fetcher)));
    throwIfAborted(signal);
    return {
      entries: mergeArchiveEntries(...loads.map((load) => load.entries)),
      loadedYears: uniqueSortedNumbers(loads.filter((load) => load.loaded).map((load) => load.year)),
      failures: loads.map((load) => load.failure).filter((failure): failure is LocalFirstScanManifestFailure => Boolean(failure)),
    };
  };

const defaultDependencies = (
  options: LocalFirstFeaturePrepareOptions,
): LocalFirstFeatureAcquisitionDependencies => ({
  listLocalScanSummaries: () => listSfDataHubScanSummaries(),
  acquireLocalFirstScans,
  loadScanArchiveCatalog: () => loadScanArchiveCatalog({ fetcher: options.fetcher, catalogUrl: options.catalogUrl }),
  loadManifestEntriesForArchives: createDefaultManifestArchiveLoader({ fetcher: options.fetcher }),
});

const createDependencies = (options: LocalFirstFeaturePrepareOptions) => ({
  ...defaultDependencies(options),
  ...options.dependencies,
});

const normalizeServerCode = (value: unknown) => resolveServer(String(value ?? ""))?.code ?? null;

const yearFromTimestamp = (timestamp: number) => new Date(timestamp).getUTCFullYear();

const yearsForInterval = (from: number, to: number) => {
  const years: number[] = [];
  for (let year = yearFromTimestamp(from); year <= yearFromTimestamp(to); year += 1) years.push(year);
  return years;
};

const subtractMonths = (timestamp: number, months: number) => {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() - months);
  while (date.getUTCDate() !== day) date.setUTCDate(date.getUTCDate() - 1);
  return date.getTime();
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
};

const dataAvailable = (input: { playerCount: number; groupCount?: number; guildCount?: number }, kind: LocalFirstScanDataKind) => {
  const hasPlayers = input.playerCount > 0;
  const hasGuilds = (input.groupCount ?? input.guildCount ?? 0) > 0;
  return kind === "players" ? hasPlayers : kind === "guilds" ? hasGuilds : hasPlayers && hasGuilds;
};

export const buildLocalFirstFeatureRequestKey = (request: LocalFirstFeatureRequest) =>
  `local-first-feature:v1:${JSON.stringify(stableValue(request))}`;

const concreteRequest = (
  request: LocalFirstFeatureRequest,
  time: LocalFirstScanRequest["time"],
): LocalFirstScanRequest => ({
  target: request.target,
  ...(request.segments ? { segments: request.segments } : {}),
  time,
  dataKind: request.dataKind,
  completeness: request.completeness,
});

const latestRequest = (request: LocalFirstFeatureRequest) => concreteRequest(request, { kind: "latest" });

const sliceMatchesSegments = (
  slice: GuildHubFusionInventorySlice,
  segments: readonly LocalFirstScanResolvedSegment[],
  dataKind: LocalFirstScanDataKind,
) => {
  const serverCode = normalizeServerCode(slice.server);
  if (!serverCode || !Number.isFinite(slice.timestampMs)) return false;
  if (!dataAvailable({ playerCount: slice.playerCount, guildCount: slice.guildCount }, dataKind)) return false;
  return segments.some((segment) => {
    if (segment.serverCode !== serverCode) return false;
    if (segment.from != null && slice.timestampMs < segment.from) return false;
    if (segment.to != null && slice.timestampMs > segment.to) return false;
    return true;
  });
};

export const collectLocalFirstFeatureTimestamps = (
  summaries: readonly GuildHubScanSummary[],
  segments: readonly LocalFirstScanResolvedSegment[],
  dataKind: LocalFirstScanDataKind,
) => {
  const timestamps = new Set<number>();
  summaries.forEach((summary) => {
    const slices = summary.fusionInventorySlices ?? [];
    if (slices.length) {
      slices.forEach((slice) => {
        if (sliceMatchesSegments(slice, segments, dataKind)) timestamps.add(slice.timestampMs);
      });
      return;
    }
    summary.snapshotTimestamps.forEach((timestamp) => {
      if (!Number.isFinite(timestamp)) return;
      if (!dataAvailable({ playerCount: summary.playerCount, groupCount: summary.groupCount }, dataKind)) return;
      const matchesServer = summary.servers.some((server) => {
        const serverCode = normalizeServerCode(server);
        return Boolean(serverCode && segments.some((segment) => segment.serverCode === serverCode));
      });
      if (matchesServer) timestamps.add(timestamp);
    });
  });
  return [...timestamps].sort((left, right) => left - right);
};

const entryMatchesSegments = (
  entry: ScanArchiveEntry,
  segments: readonly LocalFirstScanResolvedSegment[],
  dataKind: LocalFirstScanDataKind,
) => {
  const serverCode = normalizeServerCode(entry.server);
  if (!serverCode || !dataAvailable(entry, dataKind)) return false;
  return segments.some((segment) => {
    if (segment.serverCode !== serverCode) return false;
    if (segment.from != null && entry.timestamp < segment.from) return false;
    if (segment.to != null && entry.timestamp > segment.to) return false;
    return true;
  });
};

export const filterLocalFirstFeatureArchiveEntries = (
  entries: readonly ScanArchiveEntry[],
  request: LocalFirstScanRequest,
) => {
  const segments = resolveLocalFirstScanSegments(request);
  return entries.filter((entry) => entryMatchesSegments(entry, segments, request.dataKind));
};

const localPlanFrom = (
  request: LocalFirstScanRequest,
  localScanSummaries: readonly GuildHubScanSummary[],
  archiveEntries: readonly ScanArchiveEntry[],
  availableManifestYears: readonly number[],
) =>
  resolveLocalFirstScanPlan({
    request,
    localScanSummaries,
    archiveEntries,
    availableManifestYears,
  });

const syntheticResult = (
  prepared: LocalFirstFeaturePreparedAcquisition,
  skippedReason?: LocalFirstFeatureAcquisitionResult["skippedReason"],
): LocalFirstFeatureAcquisitionResult => ({
  key: prepared.key,
  preparedRequest: prepared,
  status: prepared.localPlan.status,
  localScanIds: prepared.localPlan.localScanIds,
  plan: prepared.localPlan,
  acquiredArchives: [],
  skippedArchives: [],
  failedArchives: [],
  loadedManifestYears: [...prepared.availableManifestYears],
  manifestFailures: [...prepared.manifestFailures],
  manifestStatus: prepared.manifestStatus,
  networkAccessed: prepared.availableManifestYears.length > 0,
  storedScanCount: 0,
  shouldReloadLocalScanPool: false,
  ...(skippedReason ? { skippedReason } : {}),
});

const manifestStatusFor = (loadedYears: readonly number[], failures: readonly LocalFirstScanManifestFailure[]) => {
  if (failures.length && !loadedYears.length) return "offline" as const;
  if (failures.length) return "partial" as const;
  return "complete" as const;
};

const loadEntriesForYears = async (
  years: readonly number[],
  catalog: ScanArchiveCatalog,
  dependencies: LocalFirstFeatureAcquisitionDependencies,
  signal?: AbortSignal,
): Promise<LocalFirstFeatureManifestLoadResult> => {
  const uniqueYears = uniqueSortedNumbers(years);
  if (!uniqueYears.length) return { entries: [], loadedYears: [], failures: [] };
  const activeByYear = new Map(catalog.archives.filter((archive) => archive.active).map((archive) => [archive.year, archive]));
  const missingFailures = uniqueYears
    .filter((year) => !activeByYear.has(year))
    .map((year) => ({ year, errorCode: "manifest-error" as const, message: "manifest_year_not_in_catalog" }));
  const archives = uniqueYears.map((year) => activeByYear.get(year)).filter((archive): archive is ScanArchiveCatalogEntry => Boolean(archive));
  const loaded = await dependencies.loadManifestEntriesForArchives(archives, signal);
  return {
    entries: loaded.entries,
    loadedYears: loaded.loadedYears,
    failures: [...missingFailures, ...loaded.failures],
  };
};

const loadNewestRelevantEntries = async (
  catalog: ScanArchiveCatalog,
  featureRequest: LocalFirstFeatureRequest,
  dependencies: LocalFirstFeatureAcquisitionDependencies,
  signal?: AbortSignal,
) => {
  const activeYears = uniqueSortedNumbers(catalog.archives.filter((archive) => archive.active).map((archive) => archive.year)).reverse();
  const loadedEntries: ScanArchiveEntry[] = [];
  const loadedYears: number[] = [];
  const failures: LocalFirstScanManifestFailure[] = [];
  for (const year of activeYears) {
    const loaded = await loadEntriesForYears([year], catalog, dependencies, signal);
    loadedEntries.push(...loaded.entries);
    loadedYears.push(...loaded.loadedYears);
    failures.push(...loaded.failures);
    const request = latestRequest(featureRequest);
    if (filterLocalFirstFeatureArchiveEntries(loaded.entries, request).length) break;
  }
  return {
    entries: mergeArchiveEntries(loadedEntries),
    loadedYears: uniqueSortedNumbers(loadedYears),
    failures,
  };
};

export async function prepareLocalFirstFeatureAcquisition(
  featureRequest: LocalFirstFeatureRequest,
  options: LocalFirstFeaturePrepareOptions = {},
): Promise<LocalFirstFeaturePreparedAcquisition> {
  const dependencies = createDependencies(options);
  const localScanSummaries = options.localScanSummaries
    ? [...options.localScanSummaries]
    : await dependencies.listLocalScanSummaries();
  throwIfAborted(options.signal);

  const unboundedRequest = latestRequest(featureRequest);
  const unboundedSegments = resolveLocalFirstScanSegments(unboundedRequest);
  const localTimestamps = collectLocalFirstFeatureTimestamps(localScanSummaries, unboundedSegments, featureRequest.dataKind);
  let archiveEntries: ScanArchiveEntry[] = [];
  let availableManifestYears: number[] = [];
  let manifestFailures: LocalFirstScanManifestFailure[] = [];
  let manifestStatus: LocalFirstFeaturePreparedAcquisition["manifestStatus"] = "complete";
  let catalog: ScanArchiveCatalog | null = null;

  try {
    catalog = await dependencies.loadScanArchiveCatalog(options.signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    manifestFailures = [{ year: 0, errorCode: classifyManifestError(error), message: errorMessage(error) }];
    manifestStatus = "offline";
  }
  throwIfAborted(options.signal);

  const activeYears = catalog
    ? uniqueSortedNumbers(catalog.archives.filter((archive) => archive.active).map((archive) => archive.year))
    : [];
  const addLoaded = (loaded: LocalFirstFeatureManifestLoadResult) => {
    archiveEntries = mergeArchiveEntries(archiveEntries, loaded.entries);
    availableManifestYears = uniqueSortedNumbers([...availableManifestYears, ...loaded.loadedYears]);
    manifestFailures = [...manifestFailures, ...loaded.failures];
    manifestStatus = manifestStatusFor(availableManifestYears, manifestFailures);
  };

  let concreteTime: LocalFirstScanRequest["time"] = { kind: "latest" };

  if (catalog) {
    if (featureRequest.time.kind === "exact") {
      concreteTime = { kind: "exact", timestamp: featureRequest.time.timestamp };
      addLoaded(await loadEntriesForYears([yearFromTimestamp(featureRequest.time.timestamp)], catalog, dependencies, options.signal));
    } else if (featureRequest.time.kind === "interval") {
      concreteTime = { kind: "interval", from: featureRequest.time.from, to: featureRequest.time.to };
      addLoaded(await loadEntriesForYears(yearsForInterval(featureRequest.time.from, featureRequest.time.to), catalog, dependencies, options.signal));
    } else if (featureRequest.time.kind === "all") {
      addLoaded(await loadEntriesForYears(activeYears, catalog, dependencies, options.signal));
      const scopedArchiveEntries = filterLocalFirstFeatureArchiveEntries(archiveEntries, unboundedRequest);
      const timestamps = [...localTimestamps, ...scopedArchiveEntries.map((entry) => entry.timestamp)];
      concreteTime = timestamps.length
        ? { kind: "interval", from: Math.min(...timestamps), to: Math.max(...timestamps) }
        : { kind: "latest" };
    } else if (featureRequest.time.kind === "relative") {
      addLoaded(await loadNewestRelevantEntries(catalog, featureRequest, dependencies, options.signal));
      const scopedArchiveEntries = filterLocalFirstFeatureArchiveEntries(archiveEntries, unboundedRequest);
      const archiveLatest = scopedArchiveEntries.length ? Math.max(...scopedArchiveEntries.map((entry) => entry.timestamp)) : null;
      const localLatest = localTimestamps.length ? Math.max(...localTimestamps) : null;
      const latest = Math.max(...[archiveLatest, localLatest].filter((value): value is number => Number.isFinite(value)));
      if (Number.isFinite(latest)) {
        const from = featureRequest.time.months
          ? subtractMonths(latest, featureRequest.time.months)
          : latest - (featureRequest.time.durationMs ?? 0);
        concreteTime = { kind: "interval", from, to: latest };
        const missingYears = yearsForInterval(from, latest).filter((year) => !availableManifestYears.includes(year));
        if (missingYears.length) addLoaded(await loadEntriesForYears(missingYears, catalog, dependencies, options.signal));
      }
    } else {
      addLoaded(await loadNewestRelevantEntries(catalog, featureRequest, dependencies, options.signal));
      concreteTime = { kind: "latest" };
    }
  } else if (featureRequest.time.kind === "exact") {
    concreteTime = { kind: "exact", timestamp: featureRequest.time.timestamp };
  } else if (featureRequest.time.kind === "interval") {
    concreteTime = { kind: "interval", from: featureRequest.time.from, to: featureRequest.time.to };
  } else if (featureRequest.time.kind === "all" && localTimestamps.length) {
    concreteTime = { kind: "interval", from: Math.min(...localTimestamps), to: Math.max(...localTimestamps) };
  } else if (featureRequest.time.kind === "relative" && localTimestamps.length) {
    const latest = Math.max(...localTimestamps);
    const from = featureRequest.time.months
      ? subtractMonths(latest, featureRequest.time.months)
      : latest - (featureRequest.time.durationMs ?? 0);
    concreteTime = { kind: "interval", from, to: latest };
  }

  const request = concreteRequest(featureRequest, concreteTime);
  const segments = resolveLocalFirstScanSegments(request);
  const filteredEntries = filterLocalFirstFeatureArchiveEntries(archiveEntries, request);
  const localPlan = localPlanFrom(request, localScanSummaries, filteredEntries, availableManifestYears);
  return {
    key: buildLocalFirstFeatureRequestKey({ ...featureRequest, time: concreteTime }),
    featureRequest,
    request,
    segments,
    localScanSummaries,
    archiveEntries: filteredEntries,
    availableManifestYears,
    manifestFailures,
    manifestStatus,
    localPlan,
  };
}

export async function acquirePreparedLocalFirstFeatureScans(
  prepared: LocalFirstFeaturePreparedAcquisition,
  options: Omit<LocalFirstFeatureAcquisitionOptions, "localScanSummaries"> = {},
): Promise<LocalFirstFeatureAcquisitionResult> {
  if (options.shouldAcquirePreparedRequest?.(prepared) === false) {
    return syntheticResult(prepared, "duplicate-or-failed");
  }
  if (prepared.manifestStatus === "offline") return syntheticResult(prepared);

  const dependencies = createDependencies(options);
  const acquisition = await dependencies.acquireLocalFirstScans(prepared.request, {
    ...options.acquisitionOptions,
    archiveEntries: prepared.archiveEntries,
    availableManifestYears: prepared.availableManifestYears,
  });
  const storedScanCount = acquisition.acquiredArchives.filter((entry) => entry.status === "imported").length;
  return {
    key: prepared.key,
    preparedRequest: prepared,
    status: acquisition.status,
    localScanIds: acquisition.localScanIds,
    plan: acquisition.plan,
    acquiredArchives: acquisition.acquiredArchives,
    skippedArchives: acquisition.skippedArchives,
    failedArchives: acquisition.failedArchives,
    loadedManifestYears: acquisition.loadedManifestYears,
    manifestFailures: [...prepared.manifestFailures, ...acquisition.manifestFailures],
    manifestStatus: prepared.manifestStatus,
    networkAccessed: acquisition.networkAccessed || prepared.availableManifestYears.length > 0,
    storedScanCount,
    shouldReloadLocalScanPool:
      storedScanCount > 0 || acquisition.skippedArchives.some((entry) => entry.reason === "race-already-local"),
  };
}

export async function acquireLocalFirstFeatureScans(
  request: LocalFirstFeatureRequest,
  options: LocalFirstFeatureAcquisitionOptions = {},
): Promise<LocalFirstFeatureAcquisitionResult> {
  const prepared = await prepareLocalFirstFeatureAcquisition(request, options);
  return acquirePreparedLocalFirstFeatureScans(prepared, options);
}

export type LocalFirstFeatureCoordinatorState =
  | { status: "idle"; key: null }
  | { status: "running"; key: string }
  | { status: "success"; key: string; result: LocalFirstFeatureAcquisitionResult }
  | { status: "error"; key: string; error: unknown };

export function createLocalFirstFeatureAcquisitionCoordinator() {
  let sequence = 0;
  let state: LocalFirstFeatureCoordinatorState = { status: "idle", key: null };
  const inFlight = new Map<string, Promise<LocalFirstFeatureAcquisitionResult>>();
  const controllers = new Map<string, AbortController>();

  return {
    getState: () => state,
    abort: (key?: string) => {
      if (key) controllers.get(key)?.abort();
      else controllers.forEach((controller) => controller.abort());
    },
    run: (request: LocalFirstFeatureRequest, options: LocalFirstFeatureAcquisitionOptions = {}) => {
      const requestKey = buildLocalFirstFeatureRequestKey(request);
      const existing = inFlight.get(requestKey);
      if (existing) return existing;

      const controller = new AbortController();
      const runSequence = ++sequence;
      controllers.set(requestKey, controller);
      state = { status: "running", key: requestKey };
      const promise = acquireLocalFirstFeatureScans(request, {
        ...options,
        signal: controller.signal,
      })
        .then((result) => {
          if (runSequence === sequence) state = { status: "success", key: requestKey, result };
          return result;
        })
        .catch((error) => {
          if (runSequence === sequence) state = { status: "error", key: requestKey, error };
          throw error;
        })
        .finally(() => {
          inFlight.delete(requestKey);
          controllers.delete(requestKey);
        });
      inFlight.set(requestKey, promise);
      return promise;
    },
  };
}

export const __localFirstFeatureAcquisitionTestUtils = {
  clearManifestInflight: () => manifestInflight.clear(),
};
