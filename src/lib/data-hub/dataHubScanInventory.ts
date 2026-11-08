import { auditBegin, auditPhaseBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditFields, auditDiscard } from "./runtimeAudit";
import { confirmGuildHubArchiveReadiness, readDataHubLocalScanMetadata } from "../guilds/localScanLibrary";
import { readCompatibleScanProvenance } from "../guilds/localScanProvenance";
import { loadScanArchiveCatalog, loadScanArchiveManifestEntries } from "../scanArchive/client";
import type { ScanArchiveEntry } from "../scanArchive/types";
import { archiveExpectation, archivePhysicalKey, isArchiveReadinessCurrent } from "./archiveReadiness";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../local-data/localDataDependencies";

export type ScanInventoryValue = { value: number | null; status: "complete" | "partial" | "unknown" | "error"; loading: boolean };
export type ScanArchiveInventoryBasis = {
  entries: ScanArchiveEntry[]; activeYears: number[]; loadedYears: number[];
  failedYears: number[]; conflicts: number; checkedAt: string; manifestUpdatedAt: string[];
};
export type DataHubScanInventory = {
  available: ScanInventoryValue; ready: ScanInventoryValue; personal: ScanInventoryValue;
  activeYears: number[]; checkedAt?: string; lastKnown: boolean;
  uncheckedCandidates: number; failedCandidates: number; unknownOrigins: number; missingSummaries: number;
};
const emptyValue = (): ScanInventoryValue => ({ value: null, status: "unknown", loading: true });
export const emptyScanInventory = (): DataHubScanInventory => ({ available: emptyValue(), ready: emptyValue(), personal: emptyValue(),
  activeYears: [], lastKnown: false, uncheckedCandidates: 0, failedCandidates: 0, unknownOrigins: 0, missingSummaries: 0 });

/** Current/monthly selections are references, never additional physical files.
 * Unresolved ID/version/expectation contradictions exclude the entire ID. */
export function buildScanArchiveInventoryBasis(entries: readonly ScanArchiveEntry[], context: Omit<ScanArchiveInventoryBasis, "entries" | "conflicts">): ScanArchiveInventoryBasis {
  const byId = new Map<string, Map<string, ScanArchiveEntry>>(), conflictIds = new Set<string>();
  for (const entry of entries) {
    const versions = byId.get(entry.id) ?? new Map<string, ScanArchiveEntry>();
    const key = archivePhysicalKey(entry), previous = versions.get(key);
    if (previous && archiveExpectation(previous) !== archiveExpectation(entry)) conflictIds.add(entry.id);
    versions.set(key, entry); byId.set(entry.id, versions);
    if (versions.size > 1) conflictIds.add(entry.id);
  }
  return { ...context, conflicts: conflictIds.size, entries: [...byId].flatMap(([id, versions]) => conflictIds.has(id) ? [] : [...versions.values()]) };
}
export async function loadDataHubArchiveBasis(options: Parameters<typeof loadScanArchiveCatalog>[0] = {}): Promise<ScanArchiveInventoryBasis> {
    const __audit1 = auditPhaseBegin("loadDataHubArchiveBasis", undefined, "async-container");
    try {
  const catalog = await (auditValue(__audit1, auditEnter(__audit1, "loadScanArchiveCatalog"), (loadScanArchiveCatalog(options))));
  const active = catalog.archives.filter(year => year.active);
  const results = await (auditValue(__audit1, auditEnter(__audit1, "Promise.allSettled"), (Promise.allSettled(active.map(year => loadScanArchiveManifestEntries(year, options))))));
  const loadedYears: number[] = [], failedYears: number[] = [], entries: ScanArchiveEntry[] = [], manifestUpdatedAt: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") { loadedYears.push(active[index].year); entries.push(...result.value.entries); manifestUpdatedAt.push(result.value.updatedAt); }
    else failedYears.push(active[index].year);
  });
  if (options.signal?.aborted) throw new DOMException("aborted", "AbortError");
  return auditReturn(__audit1, (auditValue(__audit1, auditEnter(__audit1, "buildScanArchiveInventoryBasis", "sync-elapsed"), (buildScanArchiveInventoryBasis(entries, { activeYears: active.map(year => year.year).sort(), loadedYears,
    failedYears, checkedAt: new Date().toISOString(), manifestUpdatedAt })))));

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}

type LocalMetadata = Awaited<ReturnType<typeof readDataHubLocalScanMetadata>>;
export function projectPersonalScanInventory(local: LocalMetadata) {
    const __audit2 = auditPhaseBegin("projectPersonalScanInventory", undefined, "sync-elapsed");
    try {
  const byId = new Map(local.summaries.map(summary => [summary.sourceScanId, summary]));
  let value = 0, unknownOrigins = 0, missingSummaries = 0;
  for (const id of local.sourceIds) {
    const summary = byId.get(id);
    if (!summary) { unknownOrigins++; missingSummaries++; continue; }
    if (summary.isMergedBundle || summary.isScanSlot) continue;
    const p = summary.contentHash ? readCompatibleScanProvenance({ ...summary, id, contentHash: summary.contentHash }) : undefined;
    if (p?.role === "synthetic") continue;
    if (p?.role === "original" && p.personalImport) value++;
    else if (!p || p.history === "unknown") unknownOrigins++;
  }
  return auditReturn(__audit2, { personal: { value, status: local.metadataComplete && !unknownOrigins ? "complete" : "partial", loading: false } as ScanInventoryValue,
    unknownOrigins, missingSummaries });

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}
export function projectLocalArchiveInventory(local: LocalMetadata, basis: ScanArchiveInventoryBasis) {
    const __audit3 = auditPhaseBegin("projectLocalArchiveInventory", undefined, "sync-elapsed");
    try {
  const ids = new Set(local.sourceIds), byId = new Map(local.summaries.map(summary => [summary.sourceScanId, summary]));
  const ready = new Set<string>(), candidates = new Map<string, ScanArchiveEntry>();
  const bindings = new Map(local.bindings.map(binding => [archivePhysicalKey({ id: binding.archiveScanId, sha256: binding.sha256 }), binding]));
  for (const entry of basis.entries) {
    const key = archivePhysicalKey(entry), binding = bindings.get(key);
    if (!binding || !ids.has(binding.localScanId)) continue;
    const summary = byId.get(binding.localScanId);
    if (summary?.contentHash && summary.contentHash !== binding.localContentHash) continue;
    if (isArchiveReadinessCurrent(binding, summary, entry, true)) ready.add(key);
    else candidates.set(key, entry);
  }
  return auditReturn(__audit3, { value: ready.size, candidates: [...candidates.values()] });

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
}

export type DataHubScanInventoryDependencies = {
  loadBasis: (signal: AbortSignal) => Promise<ScanArchiveInventoryBasis>;
  readLocal: typeof readDataHubLocalScanMetadata;
  confirm: typeof confirmGuildHubArchiveReadiness;
  capture: typeof captureLocalDataDependencies;
  revalidate: typeof revalidateLocalDataDependencies;
  subscribe: (listener: (cause?: import("../local-data/localDataDependencies").LocalDependencyNotification) => void, onError: (error: unknown) => void) => () => void;
};
const defaults: DataHubScanInventoryDependencies = {
  loadBasis: signal => loadDataHubArchiveBasis({ signal }), readLocal: readDataHubLocalScanMetadata,
  confirm: confirmGuildHubArchiveReadiness, capture: captureLocalDataDependencies, revalidate: revalidateLocalDataDependencies,
  subscribe: (listener, onError) => subscribeToLocalDataDependencies({ scanInventory: true }, listener, onError, { consumer: "data-hub-scan-inventory" }),
};

/** One mount owns its context; late responses cannot publish into a new mount.
 * Local changes reuse validated manifests. Retry/online/focus recheck the catalog.
 * Durable dependency receipts catch missed events; own readiness writes are not
 * inventory invalidations and do not wake Analytics subscribers. */
export class DataHubScanInventoryController {
  private state = emptyScanInventory();
  private readonly dependencies: DataHubScanInventoryDependencies;
  private basis?: ScanArchiveInventoryBasis;
  private localEpoch = 0;
  private archiveEpoch = 0;
  private stopped = false;
  private proofAbort?: AbortController;
  private archiveAbort?: AbortController;
  private unsubscribe?: () => void;
  private listeners = new Set<(state: DataHubScanInventory) => void>();
  constructor(dependencies: Partial<DataHubScanInventoryDependencies> = {}) { this.dependencies = { ...defaults, ...dependencies }; }
  getSnapshot = () => this.state;
  subscribe = (listener: (state: DataHubScanInventory) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<DataHubScanInventory>) {
    const __audit4 = auditPhaseBegin("publish", undefined, "sync-elapsed");
    try {
    if (this.stopped) return auditReturn(__audit4, undefined);
    this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener(this.state));

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
}
  start() {
    this.unsubscribe = this.dependencies.subscribe(cause => { void this.refreshLocal(cause?.trigger ?? "inventory-dependency-change"); }, () => {
      this.publish({ personal: { ...this.state.personal, status: "error", loading: false }, ready: { ...this.state.ready, status: "error", loading: false } });
    });
    void this.refreshLocal(); void this.refreshArchive();
  }
  retry = () => { void this.refreshLocal(); void this.refreshArchive(); };
  async refreshArchive(trigger = "inventory-start-or-explicit-refresh") {
    const __audit5 = auditBegin("F07", "refreshArchive");
    auditFields(__audit5, { trigger, workKind: "metadata-revalidation", consumer: "data-hub-scan-inventory" });
    try {
    const epoch = ++this.archiveEpoch;
    this.archiveAbort?.abort(); this.proofAbort?.abort();
    const abort = this.archiveAbort = new AbortController();
    (auditValue(__audit5, auditEnter(__audit5, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ available: { ...this.state.available, loading: true }, ready: { ...this.state.ready, loading: true } }))));
    try {
      const basis = await (auditValue(__audit5, auditEnter(__audit5, "this.dependencies.loadBasis"), (this.dependencies.loadBasis(abort.signal))));
      if (this.stopped || epoch !== this.archiveEpoch) return auditReturn(__audit5, undefined);
      this.basis = basis;
      const complete = !basis.failedYears.length && !basis.conflicts;
      const known = basis.loadedYears.length > 0 || basis.activeYears.length === 0;
      (auditValue(__audit5, auditEnter(__audit5, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ activeYears: basis.activeYears, checkedAt: basis.checkedAt, lastKnown: false,
        available: { value: known ? basis.entries.length : null, status: complete ? "complete" : known ? "partial" : "error", loading: false } }))));
      await (auditValue(__audit5, auditEnter(__audit5, "this.refreshLocal"), (this.refreshLocal(`archive-refresh:${trigger}`))));
    } catch {
      if (this.stopped || epoch !== this.archiveEpoch) return auditReturn(__audit5, undefined);
      (auditValue(__audit5, auditEnter(__audit5, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ lastKnown: Boolean(this.basis), available: { ...this.state.available, status: this.basis ? "partial" : "error", loading: false },
        ready: { ...this.state.ready, status: this.basis ? "partial" : "unknown", loading: false } }))));
    }

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
}
  async refreshLocal(trigger = "inventory-start-or-dependency-refresh") {
    const __audit6 = auditBegin("F07", "refreshLocal");
    auditFields(__audit6, { trigger, workKind: "local-metadata-and-readiness-validation", consumer: "data-hub-scan-inventory" });
    try {
    if (this.stopped) return auditReturn(__audit6, undefined);
    const epoch = ++this.localEpoch;
    this.proofAbort?.abort(); const abort = this.proofAbort = new AbortController();
    const current = () => !this.stopped && epoch === this.localEpoch;
    (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ personal: { ...this.state.personal, loading: true } }))));
    let personalConfirmed = false;
    try {
      const receipt = await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.capture"), (this.dependencies.capture({ scanInventory: true }))));
      const local = await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.readLocal"), (this.dependencies.readLocal())));
      if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
      if (!(await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.revalidate"), (this.dependencies.revalidate(receipt))))).current) { if (current()) void this.refreshLocal(); return auditReturn(__audit6, undefined); }
      if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
      (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish(projectPersonalScanInventory(local)))));
      personalConfirmed = true;
      if (!this.basis) return auditReturn(__audit6, undefined);
      const archiveEpoch = this.archiveEpoch;
      const proofCurrent = () => current() && archiveEpoch === this.archiveEpoch;
      const initial = projectLocalArchiveInventory(local, this.basis);
      const status = this.state.available.status === "complete" && local.metadataComplete && local.migrationComplete ? "complete" : "partial";
      const known = this.state.available.value !== null;
      (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ uncheckedCandidates: initial.candidates.length, failedCandidates: 0, ready: { value: known ? initial.value : null,
        status: known ? (initial.candidates.length ? "partial" : status) : "unknown", loading: initial.candidates.length > 0 || this.state.available.loading } }))));
      if (!initial.candidates.length) return auditReturn(__audit6, undefined);
      const proof = await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.confirm"), (this.dependencies.confirm(initial.candidates, { signal: abort.signal, expectedBindings: local.bindings }))));
      if (!proofCurrent()) return auditReturn(__audit6, undefined);
      if (!(await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.revalidate"), (this.dependencies.revalidate(receipt))))).current) { if (proofCurrent()) void this.refreshLocal(); return auditReturn(__audit6, undefined); }
      const confirmedLocal = await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.readLocal"), (this.dependencies.readLocal())));
      if (!proofCurrent()) return auditReturn(__audit6, undefined);
      if (!(await (auditValue(__audit6, auditEnter(__audit6, "this.dependencies.revalidate"), (this.dependencies.revalidate(receipt))))).current) { if (proofCurrent()) void this.refreshLocal(); return auditReturn(__audit6, undefined); }
      if (!proofCurrent()) return auditReturn(__audit6, undefined);
      const final = projectLocalArchiveInventory(confirmedLocal, this.basis);
      const failedCandidates = Math.min(final.candidates.length, proof.failed.length);
      (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ uncheckedCandidates: final.candidates.length - failedCandidates, failedCandidates, ready: { value: known ? final.value : null,
        status: known ? (final.candidates.length ? "partial" : status) : "unknown", loading: this.state.available.loading } }))));
    } catch {
      if (!current()) return (__audit6 && auditDiscard(__audit6), auditReturn(__audit6, undefined));
      (auditValue(__audit6, auditEnter(__audit6, "state-enqueue:this.publish", "sync-elapsed"), (this.publish({ personal: personalConfirmed ? this.state.personal : { value: null, status: "error", loading: false },
        ready: { ...this.state.ready, status: this.state.ready.value === null ? "error" : "partial", loading: false } }))));
    }

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
}
  dispose() { this.stopped = true; this.localEpoch++; this.archiveEpoch++; this.proofAbort?.abort(); this.archiveAbort?.abort(); this.unsubscribe?.(); this.listeners.clear(); }
}
