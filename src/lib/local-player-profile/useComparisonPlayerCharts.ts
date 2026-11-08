import { acquireProfileArchiveHistory } from "../scanArchive/profileHistoryAcquisition";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HubPlayerSelection } from "../../pages/DataHub/HubSearch";
import type { LocalPlayerProfileModel } from "../../components/local-player-profile/types";
import type { LocalPlayerAnalyticsResult } from "../../components/local-player-profile/localPlayerAnalyticsModel";
import { resolveLocalProfileEntry } from "../data-hub/localProfileEntry";
import { parseObservation } from "../data-hub/routes";
import { acquireLocalPlayerProfile, type LocalProfileLease } from "./coordinator";
import type { LocalProfilePart } from "./contract";
import type { PlayerChartRange, PlayerContentView } from "./viewCharts";
import type { AttributeSumMode } from "../settings/preferences";

/** Resolve only the selected target, retaining entry, source and late-delivery checks. */
export function useComparisonPlayerTarget(selection: HubPlayerSelection | undefined) {
  const [target, setTarget] = useState<{ selection: HubPlayerSelection; profile?: LocalPlayerProfileModel; error?: boolean }>();
  const [attempt, retry] = useState(0);
  const retryPart = useCallback(() => retry(value => value + 1), []);
  useEffect(() => {
    if (!selection) return;
    let active = true;
    const observation = parseObservation(new URL(selection.target.path, "https://local.invalid").search);
    void resolveLocalProfileEntry({ entity: selection.reference, observation }, selection.prepared, () => active, undefined, undefined, false)
      .then(profile => { if (active) setTarget({ selection, profile }); })
      .catch(() => { if (active) setTarget({ selection, error: true }); });
    return () => { active = false; };
  }, [selection, attempt]);
  const profile = target?.selection === selection ? target?.profile : undefined;
  return { profile, targetStatus: profile ? "ready" : target?.selection === selection && target?.error ? "error" : "loading", retry: retryPart, attempt };
}

/** A selected search target uses the existing entry/identity checks, then only
 * watches visible charts. No Current, radar, bests or overlay subscriptions. */
export function useComparisonPlayerCharts(selection: HubPlayerSelection | undefined, range: PlayerChartRange | null,
  view: PlayerContentView, mode: AttributeSumMode) {
  const { profile, targetStatus, retry: retryPart, attempt } = useComparisonPlayerTarget(selection);
  const lease = useRef<LocalProfileLease>();
  const key = JSON.stringify([selection?.reference, selection?.target.path, range, view, mode, attempt]);
  const [state, setState] = useState<{ key: string; part: LocalProfilePart<LocalPlayerAnalyticsResult> }>();
  useEffect(() => {
    if (!profile) return;
    const own = acquireLocalPlayerProfile(profile, undefined, true);
    lease.current = own;
    return () => { own.release(); if (lease.current === own) lease.current = undefined; };
  }, [profile]);
  useEffect(() => {
    if (!profile || !range) return;
    return lease.current!.watch(`charts:${view}:${mode}`, range, part => setState({ key, part }));
  }, [profile, key]);
  useEffect(() => {
    if (!profile || !range || !selection) return;
    const controller = new AbortController();
    void acquireProfileArchiveHistory(selection.reference, profile.analytics.scannedAtMs, {
      signal: controller.signal, from: range.min, selectedAt: range.min, consumer: "player-vs-charts",
    }).catch(error => { if (!controller.signal.aborted) console.error("Comparison history acquisition failed", error); });
    return () => controller.abort();
  }, [profile, selection, range?.min, range?.max]);
  const part: LocalProfilePart<LocalPlayerAnalyticsResult> = !selection || !range ? { status: "not-requested", value: null }
    : targetStatus === "error" ? { status: "error", value: null }
    : state?.key === key ? state.part : { status: "loading", value: null };
  return { ...part, profile, targetStatus, retry: retryPart };
}
