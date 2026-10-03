import {
  acquireExplicitLocalFirstArchiveScans,
  type ExplicitLocalFirstArchiveScanResult,
  type ExplicitLocalFirstArchiveScansResult,
} from "../scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../scanArchive/types";
import {
  getSfDataHubLocalScan,
  type GuildHubLocalToplistSnapshotRecord,
  type GuildHubLocalScan,
} from "../guilds/localScanLibrary";
import { normalizeServerKeyFromInput } from "../players/identifier";
import { composeMonthlySet } from "../scanArchive/monthlySetComposition";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistConfirmation,
  LocalToplistIssue,
  LocalToplistSnapshotMeta,
} from "./localToplistTypes";
import {
  LOCAL_TOPLIST_DERIVATION_VERSION,
  cacheIssueToToplistIssue,
  getLocalToplistSnapshot,
  localToplistSnapshotCacheKey,
  putLocalToplistSnapshot,
  type LocalToplistSnapshotCacheExpectation,
} from "./localToplistStore";
import {
  LocalToplistDerivationCancelledError,
  startLocalToplistDerivationWorkerRun,
} from "./localToplistWorkerClient";
import type {
  LocalToplistDerivationWorkerSource,
  LocalToplistDerivedSnapshotPayload,
} from "./localToplistWorkerTypes";

export type LocalToplistServiceStatus = "complete" | "partial" | "empty";

export type LocalToplistReadySelection = {
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  manifestYear: number;
  scanTimestamp: number;
  localScanId: string;
  cacheKey: string;
  source: "cache" | "derived";
};

export type LocalToplistFailedSelection = {
  archiveScanId: string;
  archiveSha256: string;
  server: string;
  manifestYear: number;
  scanTimestamp: number;
  errorCode: "acquisition-error" | "local-scan-missing" | "unconfirmed-source" | "worker-error" | "aborted" | "unknown-error";
  message: string;
};

export type LocalToplistLoadResult = {
  status: LocalToplistServiceStatus;
  snapshots: LocalToplistSnapshotMeta[];
  playerRows: LocalPlayerToplistRow[];
  guildRows: LocalGuildToplistRow[];
  readySelections: LocalToplistReadySelection[];
  failedSelections: LocalToplistFailedSelection[];
  cacheHits: string[];
  cacheMisses: string[];
  derivedSelections: string[];
  networkAccessed: boolean;
  workerRan: boolean;
  issues: LocalToplistIssue[];
};

export type LocalToplistServiceDependencies = {
  acquireEntries: typeof acquireExplicitLocalFirstArchiveScans;
  getLocalScan: typeof getSfDataHubLocalScan;
  deriveInWorker: (sources: LocalToplistDerivationWorkerSource[], signal?: AbortSignal) => Promise<LocalToplistDerivedSnapshotPayload[]>;
};

export type LocalToplistLoadOptions = {
  signal?: AbortSignal;
  derivationVersion?: number;
  dependencies?: Partial<LocalToplistServiceDependencies>;
  acquisitionOptions?: Parameters<typeof acquireExplicitLocalFirstArchiveScans>[1];
  sortKey?: string;
  page?: number;
  query?: string;
};

type LoadedSnapshot = {
  entry: ScanArchiveEntry;
  cacheKey: string;
  payload: LocalToplistDerivedSnapshotPayload;
  source: "cache" | "derived";
};

const MAX_TOPLIST_DERIVATION_CONCURRENCY = 2;
const inFlightDerivedSnapshots = new Map<string, Promise<LoadedSnapshot>>();

const normalizeSha = (value: string) => value.trim().toLowerCase();

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const archiveEntryKey = (entry: Pick<ScanArchiveEntry, "id" | "sha256">) =>
  `${entry.id}:${normalizeSha(entry.sha256)}`;

const toplistSetKey = (entry: ScanArchiveEntry) => entry.toplistSetKey ?? archiveEntryKey(entry);

const logicalCacheKey = (entries: readonly ScanArchiveEntry[], derivationVersion: number) =>
  `logical:${derivationVersion}:${entries.map(archiveEntryKey).join("|")}`;

const groupEntriesByToplistSet = (entries: readonly ScanArchiveEntry[]) => {
  const groups = new Map<string, ScanArchiveEntry[]>();
  for (const entry of entries) {
    const key = toplistSetKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.entries()].map(([key, groupEntries]) => ({
    key,
    entries: groupEntries.sort((left, right) => left.timestamp - right.timestamp || compareText(left.id, right.id)),
  }));
};

const mergeLogicalToplistPayload = (
  loaded: readonly LoadedSnapshot[],
  groupEntries: readonly ScanArchiveEntry[],
): LocalToplistDerivedSnapshotPayload => {
  if (loaded.length === 1) return loaded[0].payload;

  const payloads = loaded
    .map((item) => item.payload)
    .sort((left, right) => left.scanTimestamp - right.scanTimestamp || compareText(left.archiveScanId, right.archiveScanId));
  const latest = payloads[payloads.length - 1];
  const { playerRows, guildRows } = composeMonthlySet(payloads);
  const issues = payloads.flatMap((payload) => payload.issues);
  const scanTimestamp = Math.max(...payloads.map((payload) => payload.scanTimestamp));
  const archiveScanId = groupEntries.map((entry) => entry.id).join("+");
  const archiveSha256 = groupEntries.map((entry) => normalizeSha(entry.sha256)).join("+");
  const localScanId = payloads.map((payload) => payload.localScanId).join("+");

  return {
    manifestYear: latest.manifestYear,
    archiveScanId,
    archiveSha256,
    server: latest.server,
    scanTimestamp,
    localScanId,
    localContentHash: payloads.map((payload) => payload.localContentHash).join("+"),
    playerRows,
    guildRows,
    snapshotMeta: {
      ...latest.snapshotMeta,
      archiveScanId,
      archiveSha256,
      scanTimestamp,
      manifestYear: latest.manifestYear,
      localScanId,
      playerCount: playerRows.length,
      guildCount: guildRows.length,
      issues,
    },
    issues,
  };
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown_error"));

const isAbortError = (error: unknown) =>
  error instanceof LocalToplistDerivationCancelledError ||
  (error instanceof DOMException && error.name === "AbortError");

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const defaultDeriveInWorker: LocalToplistServiceDependencies["deriveInWorker"] = async (sources, signal) => {
  throwIfAborted(signal);
  const run = startLocalToplistDerivationWorkerRun({ sources });
  const abortListener = () => run.cancel();
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const snapshots = await run.promise;
    throwIfAborted(signal);
    return snapshots;
  } finally {
    signal?.removeEventListener("abort", abortListener);
  }
};

const defaultDependencies: LocalToplistServiceDependencies = {
  acquireEntries: acquireExplicitLocalFirstArchiveScans,
  getLocalScan: getSfDataHubLocalScan,
  deriveInWorker: defaultDeriveInWorker,
};

const createDependencies = (options: LocalToplistLoadOptions = {}): LocalToplistServiceDependencies => ({
  ...defaultDependencies,
  ...options.dependencies,
});

const uniqueEntries = (entries: readonly ScanArchiveEntry[], derivationVersion: number) => {
  const byKey = new Map<string, ScanArchiveEntry>();
  for (const entry of entries) {
    const key = localToplistSnapshotCacheKey({
      archiveScanId: entry.id,
      archiveSha256: entry.sha256,
      derivationVersion,
    });
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()].sort(
    (left, right) => left.timestamp - right.timestamp || compareText(left.server, right.server) || compareText(left.id, right.id),
  );
};

const selectedByArchiveKey = (acquisition: ExplicitLocalFirstArchiveScansResult) =>
  new Map(acquisition.selectedArchives.map((item) => [`${item.archiveScanId}:${normalizeSha(item.archiveSha256)}`, item] as const));

const failureForEntry = (entry: ScanArchiveEntry, message: string, errorCode: LocalToplistFailedSelection["errorCode"]): LocalToplistFailedSelection => ({
  archiveScanId: entry.id,
  archiveSha256: entry.sha256,
  server: entry.server,
  manifestYear: entry.archiveYear,
  scanTimestamp: entry.timestamp,
  errorCode,
  message,
});

const confirmationFor = (
  entry: ScanArchiveEntry,
  scan: GuildHubLocalScan,
  acquired: ExplicitLocalFirstArchiveScanResult,
): LocalToplistConfirmation | null => {
  if (
    scan.archiveSource?.archiveScanId === entry.id &&
    normalizeSha(scan.archiveSource.sha256) === normalizeSha(entry.sha256)
  ) {
    return { kind: "archiveSource", archiveScanId: entry.id, archiveSha256: entry.sha256 };
  }
  if (
    acquired.status === "sidecar-local" ||
    acquired.status === "race-sidecar-local" ||
    acquired.status === "bound-duplicate"
  ) {
    return {
      kind: "archiveBinding",
      archiveScanId: entry.id,
      archiveSha256: entry.sha256,
      localContentHash: scan.contentHash,
    };
  }
  return null;
};

const payloadFromRecord = (record: GuildHubLocalToplistSnapshotRecord): LocalToplistDerivedSnapshotPayload => ({
  manifestYear: record.manifestYear,
  archiveScanId: record.archiveScanId,
  archiveSha256: record.archiveSha256,
  server: record.server,
  scanTimestamp: record.scanTimestamp,
  localScanId: record.localScanId,
  localContentHash: record.localContentHash,
  playerRows: record.playerRows,
  guildRows: record.guildRows,
  snapshotMeta: record.snapshotMeta,
  issues: record.issues,
});

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

async function loadOrDeriveSnapshot(input: {
  entry: ScanArchiveEntry;
  acquired: ExplicitLocalFirstArchiveScanResult;
  derivationVersion: number;
  dependencies: LocalToplistServiceDependencies;
  signal?: AbortSignal;
  cacheMisses: string[];
  cacheHits: string[];
  derivedSelections: string[];
  issues: LocalToplistIssue[];
  workerRanFlag: { value: boolean };
}): Promise<LoadedSnapshot> {
  const { entry, acquired, derivationVersion, dependencies, signal } = input;
  const cacheKey = localToplistSnapshotCacheKey({
    archiveScanId: entry.id,
    archiveSha256: entry.sha256,
    derivationVersion,
  });
  const existing = inFlightDerivedSnapshots.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<LoadedSnapshot> => {
    throwIfAborted(signal);
    const scan = await dependencies.getLocalScan(acquired.localScanId);
    if (!scan) throw new Error(`Lokaler Scan wurde nicht gefunden: ${acquired.localScanId}`);
    const confirmation = confirmationFor(entry, scan, acquired);
    if (!confirmation) throw new Error(`Lokaler Scan ist nicht als Archivquelle bestaetigt: ${entry.id}`);
    const canonicalServer = normalizeServerKeyFromInput(entry.server) ?? entry.server;
    const expectation: LocalToplistSnapshotCacheExpectation = {
      derivationVersion,
      manifestYear: entry.archiveYear,
      archiveScanId: entry.id,
      archiveSha256: entry.sha256,
      server: canonicalServer,
      scanTimestamp: entry.timestamp,
      localScanId: acquired.localScanId,
      localContentHash: scan.contentHash,
    };
    const cached = await getLocalToplistSnapshot(expectation);
    if (cached.status === "hit") {
      input.cacheHits.push(cacheKey);
      return { entry, cacheKey, payload: payloadFromRecord(cached.record), source: "cache" };
    }
    input.cacheMisses.push(cacheKey);
    input.issues.push(cacheIssueToToplistIssue(expectation, cached.reason));

    const source: LocalToplistDerivationWorkerSource = {
      manifestYear: entry.archiveYear,
      archiveScanId: entry.id,
      archiveSha256: entry.sha256,
      server: entry.server,
      scanTimestamp: entry.timestamp,
      localScanId: acquired.localScanId,
      localContentHash: scan.contentHash,
      confirmation,
    };
    input.workerRanFlag.value = true;
    const snapshots = await dependencies.deriveInWorker([source], signal);
    const payload = snapshots[0];
    if (!payload) throw new Error(`Worker lieferte keinen Derived Snapshot fuer ${entry.id}.`);
    const saved = await putLocalToplistSnapshot(payload, { derivationVersion });
    input.derivedSelections.push(cacheKey);
    return { entry, cacheKey, payload: payloadFromRecord(saved), source: "derived" };
  })().finally(() => {
    inFlightDerivedSnapshots.delete(cacheKey);
  });

  inFlightDerivedSnapshots.set(cacheKey, promise);
  return promise;
}

export async function loadOrBuildLocalToplistSnapshots(
  selectedEntries: readonly ScanArchiveEntry[],
  options: LocalToplistLoadOptions = {},
): Promise<LocalToplistLoadResult> {
  const dependencies = createDependencies(options);
  const derivationVersion = options.derivationVersion ?? LOCAL_TOPLIST_DERIVATION_VERSION;
  const entries = uniqueEntries(selectedEntries, derivationVersion);
  const snapshots: LocalToplistSnapshotMeta[] = [];
  const playerRows: LocalPlayerToplistRow[] = [];
  const guildRows: LocalGuildToplistRow[] = [];
  const readySelections: LocalToplistReadySelection[] = [];
  const failedSelections: LocalToplistFailedSelection[] = [];
  const cacheHits: string[] = [];
  const cacheMisses: string[] = [];
  const derivedSelections: string[] = [];
  const issues: LocalToplistIssue[] = [];
  const workerRanFlag = { value: false };

  if (!entries.length) {
    return {
      status: "empty",
      snapshots,
      playerRows,
      guildRows,
      readySelections,
      failedSelections,
      cacheHits,
      cacheMisses,
      derivedSelections,
      networkAccessed: false,
      workerRan: false,
      issues,
    };
  }

  let acquisition: ExplicitLocalFirstArchiveScansResult;
  try {
    acquisition = await dependencies.acquireEntries(entries, {
      ...options.acquisitionOptions,
      signal: options.signal,
    });
  } catch (error) {
    return {
      status: "empty",
      snapshots,
      playerRows,
      guildRows,
      readySelections,
      failedSelections: entries.map((entry) => failureForEntry(entry, errorMessage(error), isAbortError(error) ? "aborted" : "acquisition-error")),
      cacheHits,
      cacheMisses,
      derivedSelections,
      networkAccessed: false,
      workerRan: false,
      issues,
    };
  }

  acquisition.failedArchives.forEach((failure) => {
    const entry = entries.find((candidate) => candidate.id === failure.archiveScanId && normalizeSha(candidate.sha256) === normalizeSha(failure.archiveSha256));
    if (!entry) return;
    failedSelections.push(failureForEntry(entry, failure.message, "acquisition-error"));
  });

  const selected = selectedByArchiveKey(acquisition);
  const work = entries.flatMap((entry) => {
    const acquired = selected.get(`${entry.id}:${normalizeSha(entry.sha256)}`);
    if (!acquired) {
      if (!failedSelections.some((failure) => failure.archiveScanId === entry.id && normalizeSha(failure.archiveSha256) === normalizeSha(entry.sha256))) {
        failedSelections.push(failureForEntry(entry, "Archivscan wurde nicht lokal bestaetigt.", "unconfirmed-source"));
      }
      return [];
    }
    return [{ entry, acquired }];
  });

  const loaded = await runWithConcurrency(work, MAX_TOPLIST_DERIVATION_CONCURRENCY, options.signal, async ({ entry, acquired }) => {
    try {
      return await loadOrDeriveSnapshot({
        entry,
        acquired,
        derivationVersion,
        dependencies,
        signal: options.signal,
        cacheMisses,
        cacheHits,
        derivedSelections,
        issues,
        workerRanFlag,
      });
    } catch (error) {
      failedSelections.push(failureForEntry(entry, errorMessage(error), isAbortError(error) ? "aborted" : "worker-error"));
      return null;
    }
  });

  const loadedSnapshots = loaded.filter((item): item is LoadedSnapshot => Boolean(item));
  const loadedByArchiveKey = new Map(loadedSnapshots.map((item) => [archiveEntryKey(item.entry), item] as const));
  const failedArchiveKeys = new Set(failedSelections.map((failure) => `${failure.archiveScanId}:${normalizeSha(failure.archiveSha256)}`));

  for (const group of groupEntriesByToplistSet(entries)) {
    const groupLoaded = group.entries.flatMap((entry) => {
      const loadedItem = loadedByArchiveKey.get(archiveEntryKey(entry));
      return loadedItem ? [loadedItem] : [];
    });
    const groupFailed = group.entries.some((entry) => failedArchiveKeys.has(archiveEntryKey(entry)));
    if (groupFailed || groupLoaded.length !== group.entries.length) {
      for (const entry of group.entries) {
        const key = archiveEntryKey(entry);
        if (loadedByArchiveKey.has(key) || failedArchiveKeys.has(key)) continue;
        failedSelections.push(failureForEntry(entry, "Toplisten-Set ist nicht vollstaendig lokal verfuegbar.", "unconfirmed-source"));
        failedArchiveKeys.add(key);
      }
      continue;
    }

    const payload = mergeLogicalToplistPayload(groupLoaded, group.entries);
    const cacheKey = groupLoaded.length === 1 ? groupLoaded[0].cacheKey : logicalCacheKey(group.entries, derivationVersion);
    const source = groupLoaded.some((item) => item.source === "derived") ? "derived" : "cache";
    snapshots.push(payload.snapshotMeta);
    playerRows.push(...payload.playerRows);
    guildRows.push(...payload.guildRows);
    issues.push(...payload.issues);
    readySelections.push({
      archiveScanId: payload.archiveScanId,
      archiveSha256: payload.archiveSha256,
      server: payload.server,
      manifestYear: payload.manifestYear,
      scanTimestamp: payload.scanTimestamp,
      localScanId: payload.localScanId,
      cacheKey,
      source,
    });
  }

  return {
    status: failedSelections.length ? (readySelections.length ? "partial" : "empty") : readySelections.length ? "complete" : "empty",
    snapshots: snapshots.sort((left, right) => left.scanTimestamp - right.scanTimestamp || compareText(left.server, right.server)),
    playerRows: playerRows.sort((left, right) => compareText(left.server, right.server) || compareText(left.identifier, right.identifier)),
    guildRows: guildRows.sort((left, right) => compareText(left.server, right.server) || compareText(left.guildIdentifier, right.guildIdentifier)),
    readySelections: readySelections.sort((left, right) => left.scanTimestamp - right.scanTimestamp || compareText(left.server, right.server)),
    failedSelections: failedSelections.sort((left, right) => left.scanTimestamp - right.scanTimestamp || compareText(left.server, right.server)),
    cacheHits,
    cacheMisses,
    derivedSelections,
    networkAccessed: acquisition.networkAccessed,
    workerRan: workerRanFlag.value,
    issues,
  };
}

export const __localToplistServiceTestUtils = {
  clearInFlightDerivedSnapshots: () => inFlightDerivedSnapshots.clear(),
};
