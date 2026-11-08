import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditCaught, auditCall, auditEvent } from "../data-hub/runtimeAudit";
import { localToplistContentRevision, localToplistSelectionRevision } from "./localToplistDatasetRevision";
import { captureLocalDataDependencies, type LocalDependencyReceipt } from "../local-data/localDataDependencies";
import { hasCurrentLocalSourceValidity, matchesLocalSourceValidity, localSourceValidityKey } from "../guilds/localSourceValidity";
import {
  acquireExplicitLocalFirstArchiveScans,
  type ExplicitLocalFirstArchiveScanResult,
  type ExplicitLocalFirstArchiveScansResult,
} from "../scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../scanArchive/types";
import {
  getSfDataHubLocalScan,
  readGuildHubLocalScanSourceValidity,
  readLocalToplistResetGeneration,
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
  requestRevision?: string;
  contentRevision?: string;
  dependencies?: LocalDependencyReceipt;
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

/** Phase-local physical-source counts, never an overall completion percentage. */
export type LocalToplistLoadProgress = {
  phase: "acquiring" | "preparing" | "composing";
  total: number;
  succeeded: number;
  failed: number;
};

export type LocalToplistLoadOptions = {
  auditContext?: import("../data-hub/runtimeAudit").AuditFields;
  onProgress?: (progress: LocalToplistLoadProgress) => void;
  signal?: AbortSignal;
  derivationVersion?: number;
  dependencies?: Partial<LocalToplistServiceDependencies>;
  acquisitionOptions?: Parameters<typeof acquireExplicitLocalFirstArchiveScans>[1];
  sortKey?: string;
  page?: number;
  query?: string;
};

type LoadedSnapshot = {
  resetGeneration: string;
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
    const __audit1 = auditPhaseBegin("mergeLogicalToplistPayload", undefined, "sync-elapsed");
    try {
  if (loaded.length === 1) return auditReturn(__audit1, loaded[0].payload);

  const payloads = loaded
    .map((item) => item.payload)
    .sort((left, right) => left.scanTimestamp - right.scanTimestamp || compareText(left.archiveScanId, right.archiveScanId));
  const latest = payloads[payloads.length - 1];
  const { playerRows, guildRows } = (auditValue(__audit1, auditEnter(__audit1, "composeMonthlySet", "sync-elapsed"), (composeMonthlySet(payloads))));
  const issues = payloads.flatMap((payload) => payload.issues);
  const scanTimestamp = Math.max(...payloads.map((payload) => payload.scanTimestamp));
  const archiveScanId = groupEntries.map((entry) => entry.id).join("+");
  const archiveSha256 = groupEntries.map((entry) => normalizeSha(entry.sha256)).join("+");
  const localScanId = payloads.map((payload) => payload.localScanId).join("+");

  return auditReturn(__audit1, {
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
  });

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? "unknown_error"));

const isAbortError = (error: unknown) =>
  error instanceof LocalToplistDerivationCancelledError ||
  (error instanceof DOMException && error.name === "AbortError");

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
};

const defaultDeriveInWorker: LocalToplistServiceDependencies["deriveInWorker"] = async (sources, signal) => {
    const __audit2 = auditPhaseBegin("defaultDeriveInWorker", undefined, "async-container");
    try {
  throwIfAborted(signal);
  const run = startLocalToplistDerivationWorkerRun({ sources });
  const abortListener = () => run.cancel();
  signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const snapshots = await (auditValue(__audit2, auditEnter(__audit2, "run.promise"), (run.promise)));
    throwIfAborted(signal);
    return auditReturn(__audit2, snapshots);
  } finally {
    signal?.removeEventListener("abort", abortListener);
  }

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
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
  sourceGeneration: record.sourceGeneration,
  normalizerVersion: record.normalizerVersion,
  coreNormalizerVersion: record.coreNormalizerVersion,
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
    const __audit3 = auditPhaseBegin("loadOrDeriveSnapshot", undefined, "async-container");
    try {
  const { entry, acquired, derivationVersion, dependencies, signal } = input;
  const cacheKey = localToplistSnapshotCacheKey({
    archiveScanId: entry.id,
    archiveSha256: entry.sha256,
    derivationVersion,
  });
  throwIfAborted(signal);
  const sourceDependencies = await (auditValue(__audit3, auditEnter(__audit3, "captureLocalDataDependencies"), (captureLocalDataDependencies({ sourceIds: [acquired.localScanId] }))));
  const resetGeneration = await (auditValue(__audit3, auditEnter(__audit3, "readLocalToplistResetGeneration"), (readLocalToplistResetGeneration(acquired.localScanId))));
  const scan = await (auditValue(__audit3, auditEnter(__audit3, "dependencies.getLocalScan"), (dependencies.getLocalScan(acquired.localScanId))));
  if (!scan) throw new Error(`Lokaler Scan wurde nicht gefunden: ${acquired.localScanId}`);
  if (!hasCurrentLocalSourceValidity(scan)) throw new Error(`Lokaler Scan hat keinen aktuellen Versionsbeleg: ${scan.id}`);
  const confirmation = confirmationFor(entry, scan, acquired);
  if (!confirmation) throw new Error(`Lokaler Scan ist nicht als Archivquelle bestaetigt: ${entry.id}`);
  const flightKey = (auditValue(__audit3, auditEnter(__audit3, "JSON.stringify", "sync-elapsed"), (JSON.stringify([cacheKey, scan.id, scan.contentHash, localSourceValidityKey(scan),
    entry.archiveYear, entry.server, entry.timestamp, resetGeneration]))));
  const existing = inFlightDerivedSnapshots.get(flightKey);
  if (existing) return auditReturn(__audit3, existing);

  const promise = (async (): Promise<LoadedSnapshot> => {
    const __audit4 = auditBegin("S08", "derived-source", __audit3);
    if (__audit4) auditFields(__audit4, { sourceScanId: scan.id, sourceGeneration: scan.sourceGeneration, archiveEntryId: entry.id, resetGeneration });
    try {
    throwIfAborted(signal);
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
      sourceGeneration: scan.sourceGeneration,
      normalizerVersion: scan.normalizerVersion,
      coreNormalizerVersion: scan.coreNormalizerVersion,
    };
    const cached = await (auditValue(__audit4, auditEnter(__audit4, "getLocalToplistSnapshot"), (getLocalToplistSnapshot(expectation))));
    if (cached.status === "hit") {
      auditEvent(__audit4, "persisted-cache-hit");
      input.cacheHits.push(cacheKey);
      return auditReturn(__audit4, { entry, cacheKey, resetGeneration, payload: payloadFromRecord(cached.record), source: "cache" });
    }
    input.cacheMisses.push(cacheKey);
    input.issues.push(cacheIssueToToplistIssue(expectation, cached.reason));

    const source: LocalToplistDerivationWorkerSource = {
      resetGeneration,
      dependencies: sourceDependencies,
      manifestYear: entry.archiveYear,
      archiveScanId: entry.id,
      archiveSha256: entry.sha256,
      server: entry.server,
      scanTimestamp: entry.timestamp,
      localScanId: acquired.localScanId,
      localContentHash: scan.contentHash,
      sourceGeneration: scan.sourceGeneration,
      normalizerVersion: scan.normalizerVersion,
      coreNormalizerVersion: scan.coreNormalizerVersion,
      confirmation,
    };
    auditEvent(__audit4, "new-derived-build");
    input.workerRanFlag.value = true;
    const snapshots = await (auditValue(__audit4, auditEnter(__audit4, "dependencies.deriveInWorker"), (dependencies.deriveInWorker([source], signal))));
    const payload = snapshots[0];
    if (!payload) throw new Error(`Worker lieferte keinen Derived Snapshot fuer ${entry.id}.`);
    if (payload.localScanId !== scan.id || payload.localContentHash !== scan.contentHash ||
        !matchesLocalSourceValidity(payload, scan)) throw new Error(`Worker lieferte veraltete Sourcegeneration fuer ${entry.id}.`);
    const latest = await (auditValue(__audit4, auditEnter(__audit4, "dependencies.getLocalScan"), (dependencies.getLocalScan(scan.id))));
    if (!latest || latest.contentHash !== scan.contentHash || !matchesLocalSourceValidity(scan, latest)) {
      throw new Error(`Sourcegeneration hat sich waehrend der Ableitung geaendert: ${entry.id}`);
    }
    const saved = await (auditValue(__audit4, auditEnter(__audit4, "putLocalToplistSnapshot"), (putLocalToplistSnapshot(payload, { derivationVersion, resetGeneration, dependencies: sourceDependencies }))));
    input.derivedSelections.push(cacheKey);
    return auditReturn(__audit4, { entry, cacheKey, resetGeneration, payload: payloadFromRecord(saved), source: "derived" });

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
})().finally(() => {
    inFlightDerivedSnapshots.delete(flightKey);
  });

  inFlightDerivedSnapshots.set(flightKey, promise);
  return auditReturn(__audit3, promise);

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}

export async function loadOrBuildLocalToplistSnapshots(
  selectedEntries: readonly ScanArchiveEntry[],
  options: LocalToplistLoadOptions = {},
): Promise<LocalToplistLoadResult> {
    const __audit5 = auditBegin("F20", "loadOrBuildLocalToplistSnapshots");
    auditFields(__audit5, options.auditContext ?? { trigger: "toplist-service-call", consumer: "toplist-service-unspecified" });
    try {
  const dependencies = createDependencies(options);
  const derivationVersion = options.derivationVersion ?? LOCAL_TOPLIST_DERIVATION_VERSION;
  const entries = uniqueEntries(selectedEntries, derivationVersion);
  const report = (progress: LocalToplistLoadProgress) => {
    if (options.signal?.aborted) return;
    try { options.onProgress?.(progress); }
    catch { /* Progress observation cannot change the data result. */ }
  };
  report({ phase: "acquiring", total: entries.length, succeeded: 0, failed: 0 });
  const requestRevision = localToplistSelectionRevision(entries, derivationVersion);
  const provide = async (result: LocalToplistLoadResult, physical: LoadedSnapshot[] = []) => {
    const __audit6 = auditPhaseBegin("provide", __audit5, "async-container");
    try {
    const dependencies = await (auditValue(__audit6, auditEnter(__audit6, "captureLocalDataDependencies"), (captureLocalDataDependencies({ servers: result.failedSelections.map(selection => selection.server), sourceIds: physical.map(item => item.payload.localScanId), toplistResets: true }))));
    const live = await (auditValue(__audit6, auditEnter(__audit6, "readGuildHubLocalScanSourceValidity"), (readGuildHubLocalScanSourceValidity(physical.map(item => item.payload.localScanId)))));
    for (const { payload, resetGeneration } of physical) {
      const source = live.get(payload.localScanId);
      if (!source || source.contentHash !== payload.localContentHash || !matchesLocalSourceValidity(payload, source) ||
          resetGeneration !== await (auditValue(__audit6, auditEnter(__audit6, "readLocalToplistResetGeneration"), (readLocalToplistResetGeneration(payload.localScanId))))) throw new Error("local_toplist_dependencies_changed_during_load");
    }
    return auditReturn(__audit6, {
      ...result, dependencies, requestRevision,
      contentRevision: localToplistContentRevision({
        contract: "monthly-set:1;view:1;compare:1", derivationVersion,
        requestRevision,
        status: result.status, snapshots: result.snapshots, playerRows: result.playerRows, guildRows: result.guildRows,
        physical: physical.map(({ payload, resetGeneration }) => ({
          id: payload.archiveScanId, sha: payload.archiveSha256, source: payload.localScanId, hash: payload.localContentHash,
          generation: payload.sourceGeneration, normalizer: payload.normalizerVersion, core: payload.coreNormalizerVersion, resetGeneration,
        })).sort((a,b) => a.id.localeCompare(b.id)),
        ready: result.readySelections.map(({ source: _source, ...selection }) => selection),
        failed: result.failedSelections.map(({ message: _message, ...selection }) => selection),
      }),
    });

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
};
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
    return auditReturn(__audit5, provide({
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
    }));
  }

  let acquisition: ExplicitLocalFirstArchiveScansResult;
  try {
    acquisition = await (auditValue(__audit5, auditEnter(__audit5, "dependencies.acquireEntries"), (dependencies.acquireEntries(entries, {
      ...options.acquisitionOptions,
      signal: options.signal,
      onProgress: (progress) => {
        report({ phase: "acquiring", ...progress });
        try { options.acquisitionOptions?.onProgress?.(progress); } catch { /* Observer only. */ }
      },
    }))));
  } catch (error) { auditCaught(__audit5, error);
    return auditReturn(__audit5, provide({
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
    }));
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

  let prepared = 0;
  const preparationProgress = () => report({ phase: "preparing", total: entries.length, succeeded: prepared, failed: failedSelections.length });
  preparationProgress();
  const loaded = await (auditValue(__audit5, auditEnter(__audit5, "runWithConcurrency"), (runWithConcurrency(work, MAX_TOPLIST_DERIVATION_CONCURRENCY, options.signal, async ({ entry, acquired }) => {
    try {
      const snapshot = await (__audit5 ? auditCall(__audit5, "derived-source-consumer", () => loadOrDeriveSnapshot({
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
      }), "async-container") : loadOrDeriveSnapshot({
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
      }));
      prepared += 1;
      preparationProgress();
      return snapshot;
    } catch (error) {
      failedSelections.push(failureForEntry(entry, errorMessage(error), isAbortError(error) ? "aborted" : "worker-error"));
      preparationProgress();
      return null;
    }
  }))));

  report({ phase: "composing", total: entries.length, succeeded: prepared, failed: failedSelections.length });
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

  return auditReturn(__audit5, provide({
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
  }, loadedSnapshots));

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}

export const __localToplistServiceTestUtils = {
  clearInFlightDerivedSnapshots: () => inFlightDerivedSnapshots.clear(),
};
