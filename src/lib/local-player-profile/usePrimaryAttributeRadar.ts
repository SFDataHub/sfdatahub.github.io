import { useEffect, useState } from "react";
import { acquireLocalPlayerProfile } from "./coordinator";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import { loadLocalToplistArchiveContext } from "../../pages/DataHub/localToplistPageModel";
import { loadIdentityResolutionSnapshot } from "../identities/identityResolution";
import { readCurrentCompactOriginNumericId } from "../identities/playerOrigin";
import { resolvePrimaryRadarReference } from "./primaryRadarReference";
import { acquireExplicitLocalFirstArchiveScans } from "../scanArchive/localFirstScanAcquisition";
import { captureLocalDataDependencies, revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../local-data/localDataDependencies";
import { serverComparisonKey } from "../servers/serverResolver";
import { useProfileAttributeSumMode } from "../settings/usePreferences";
import { checkProfileWork, protectProfileBasis, type LocalProfilePart } from "./contract";
import { localProfileContextKey } from "./historyBasis";
import { sharedAnalyticsPreparation, type AnalyticsPreparationLease } from "./sharedPreparation";
import { withPrimaryRadarPlayer, type PrimaryRadarComparison, type PrimaryRadarModel } from "./primaryAttributeRadar";
import type { LocalDependencyReceipt } from "../local-data/localDataDependencies";

type Pool = { referenceServer: string; month: string; monthlyIds: string[]; workKey: string; source: AnalyticsPreparationLease; signal: AbortSignal;
  dependencies: LocalDependencyReceipt; projections: Map<string, Promise<PrimaryRadarModel | null>> };
type Entry = { part: LocalProfilePart<Pool>; listeners: Set<() => void>; stop: () => void };
const entries = new Map<string, Entry>();
const radarContextKey = (profile: LocalPlayerProfileModel) => JSON.stringify([localProfileContextKey(profile),
  profile.currentSeed?.rawIdentifier, readCurrentCompactOriginNumericId(profile.currentSeed?.rawPlayer ?? null)]);

function acquire(profile: LocalPlayerProfileModel) {
  const key = radarContextKey(profile);
  let entry = entries.get(key);
  if (!entry) {
    const own: Entry = { part: { status: "loading", value: null }, listeners: new Set(), stop: () => {} };
    entry = own; entries.set(key, own);
    let generation = 0, disposed = false;
    const profileLease = acquireLocalPlayerProfile(profile);
    let controller: AbortController | undefined;
    let preparation: ReturnType<typeof sharedAnalyticsPreparation.acquire> | undefined;
    const publish = (part: LocalProfilePart<Pool>) => { own.part = part; own.listeners.forEach(listener => listener()); };
    let selectionKey: string | undefined;
    let selectedReference: ReturnType<typeof resolvePrimaryRadarReference>;
    let selectionCheck: Promise<boolean> | undefined;
    const checkSelection = () => selectionCheck ??= (async () => {
      const [context, identity] = await Promise.all([loadLocalToplistArchiveContext(), loadIdentityResolutionSnapshot()]);
      const reference = resolvePrimaryRadarReference(context, identity, profile);
      // Ignore unrelated manifest revisions; bind the actual selected server set
      // and its content, including a replacement already present in local IDB.
      const next = JSON.stringify([reference?.server, reference?.month, reference?.entries.map(row => [row.id, row.sha256, row.server, row.timestamp,
        row.fileUrl, row.format, row.compression, row.playerCount, row.groupCount, row.toplistSetScanIds]).sort()]);
      const changed = selectionKey !== undefined && selectionKey !== next;
      selectionKey = next; selectedReference = reference;
      return changed || own.part.status === "error";
    })().finally(() => { selectionCheck = undefined; });
    const reload = () => {
      const current = ++generation;
      controller?.abort(); preparation?.release();
      const abort = controller = new AbortController();
      const source = preparation = sharedAnalyticsPreparation.acquire("profile");
      const signal = abort.signal;
      publish({ status: "loading", value: own.part.value });
      void (async () => {
        if (!serverComparisonKey(profile.analytics.server)) return null;
        const captured = await captureLocalDataDependencies({ allSources: true, allIdentities: true });
        const [currentProfile] = await Promise.all([
          profileLease.request("current"), checkSelection(),
        ]);
        checkProfileWork(signal);
        if (currentProfile.status !== "ready" || !currentProfile.value || currentProfile.value.sourceScanId !== profile.sourceScanId ||
            currentProfile.value.sourcePlayerKey !== profile.sourcePlayerKey || currentProfile.value.analytics.scannedAtMs !== profile.analytics.scannedAtMs ||
            serverComparisonKey(currentProfile.value.analytics.server) !== serverComparisonKey(profile.analytics.server)) return null;
        const reference = selectedReference;
        const referenceKey = selectionKey;
        if (!reference) return null;
        const selected = reference.entries;
        const acquired = await acquireExplicitLocalFirstArchiveScans(selected, { signal });
        checkProfileWork(signal);
        if (acquired.failedArchives.length || acquired.selectedArchives.length !== selected.length) throw Error("Current server source incomplete");
        if (selectionKey !== referenceKey) throw Error("Radar reference changed");
        if (!(await revalidateLocalDataDependencies(captured)).current) throw Error("Radar dependencies changed");
        return { referenceServer: reference.server, month: reference.month, monthlyIds: acquired.localScanIds,
          workKey: JSON.stringify([referenceKey, acquired.localScanIds, captured]), source, signal,
          dependencies: captured, projections: new Map<string, Promise<PrimaryRadarModel | null>>() };

      })().then(pool => {
        if (!disposed && current === generation && !signal.aborted) publish({ status: pool ? "ready" : "empty", value: pool });
      }, error => {
        if (!disposed && current === generation && !signal.aborted) publish({ status: "error", value: own.part.value, reason: String(error) });
      });
    };
    const stop = subscribeToLocalDataDependencies({ allSources: true, allIdentities: true }, reload,
      error => { generation++; controller?.abort(); preparation?.release();
        if (!disposed) publish({ status: "error", value: own.part.value, reason: String(error) }); },
      undefined, checkSelection);
    own.stop = () => { disposed = true; generation++; stop();
      controller?.abort(); preparation?.release(); profileLease.release(); entries.delete(key); };
    reload();
  }
  const own = entry;
  return { get: () => own.part, subscribe: (listener: () => void) => { own.listeners.add(listener); return () => {
    own.listeners.delete(listener); if (!own.listeners.size) own.stop();
  }; } };
}

export function usePrimaryAttributeRadar(profile: LocalPlayerProfileModel, comparison: PrimaryRadarComparison = "main",
  versus?: { id: string; profile?: LocalPlayerProfileModel; failed?: boolean }) {
  const key = radarContextKey(profile);
  const mode = useProfileAttributeSumMode();
  const [state, setState] = useState<{ key: string; part: LocalProfilePart<Pool> }>({ key, part: { status: "loading", value: null } });
  useEffect(() => {
    const lease = acquire(profile);
    const update = () => setState({ key, part: lease.get() });
    const stop = lease.subscribe(update); update(); return stop;
  }, [key]);
  const pool = state.key === key ? state.part.value : null;
  const [projection, setProjection] = useState<{ key: string; pool: Pool; selection: string; model: PrimaryRadarModel | null; loading: boolean }>();
  const peer = versus?.profile;
  const selection = JSON.stringify([mode, versus ? [versus.id, peer ? radarContextKey(peer) : null] : comparison]);
  useEffect(() => {
    if (!pool || versus && !peer) return;
    let stopped = false;
    setProjection(previous => previous?.pool === pool && previous.selection === selection ? previous : { key, pool, selection,
      model: previous?.key === key && previous.model && versus ? withPrimaryRadarPlayer(previous.model, null, mode)
        : previous?.key === key && previous.selection === selection ? previous.model : null, loading: true });
    let job = pool.projections.get(selection);
    if (!job) {
      job = pool.source.runProfile<{ model: PrimaryRadarModel | null; dependencies: LocalDependencyReceipt }>(`${key}:radar:${pool.workKey}:${selection}`,
        { kind: "profile-radar", profile: { sourceScanId: profile.sourceScanId, sourcePlayerKey: profile.sourcePlayerKey, analytics: profile.analytics },
          referenceServer: pool.referenceServer, monthlyIds: pool.monthlyIds, month: pool.month, mode, comparison,
          ...(peer ? { comparisonPlayer: { sourceScanId: peer.sourceScanId, sourcePlayerKey: peer.sourcePlayerKey, analytics: peer.analytics } } : {}) }, pool.signal).then(async result => {
          checkProfileWork(pool.signal);
          if (!(await revalidateLocalDataDependencies(pool.dependencies)).current || !(await revalidateLocalDataDependencies(result.dependencies)).current) throw Error("Radar dependencies changed before delivery");
          return protectProfileBasis(result.model);
        });
      pool.projections.set(selection, job);
      void job.catch(() => { if (pool.projections.get(selection) === job) pool.projections.delete(selection); });
    }
    void job.then(model => { if (!stopped && !pool.signal.aborted) setProjection({ key, pool, selection, model, loading: false }); },
      () => { if (!stopped && !pool.signal.aborted) setProjection({ key, pool, selection, model: null, loading: false }); });
    // Selection changes never cancel the common foundations. Publication is
    // bound to the selected mode; profile/source changes cancel the whole pool.
    return () => { stopped = true; };
  }, [pool, key, selection]);
  const current = projection?.pool === pool && projection.selection === selection ? projection : null;
  // Retain only the same profile/selection while its replacement is prepared.
  // Cancelled pools cannot publish, but their already displayed result can stay.
  const model = current ? current.model : versus && projection?.key === key && projection.model ? withPrimaryRadarPlayer(projection.model, null, mode)
    : projection?.key === key && projection.selection === selection &&
    (pool || state.part.status === "loading" || state.part.status === "error") ? projection.model : null;
  return { model, loading: state.key !== key || state.part.status === "loading" || (versus && !peer ? !versus.failed : Boolean(pool && (!current || current.loading))) };
}
