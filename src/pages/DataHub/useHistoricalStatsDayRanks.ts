import { useEffect, useMemo, useState } from "react";
import { loadOrBuildLocalToplistSnapshots, type LocalToplistLoadResult } from "../../lib/toplists/localToplistService";
import { localToplistResultRevision } from "../../lib/toplists/localToplistDatasetRevision";
import { revalidateLocalDataDependencies, subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import { revalidateIdentityResolutionSnapshot, type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import type { ScanArchiveManifest } from "../../lib/scanArchive/types";
import { buildHistoricalPlayerStatsDayValues, resolveHistoricalStatsDayEntryPlan, type LocalToplistCompareEntryPlan } from "./localToplistCompareModel";

type Input = {
  enabled: boolean;
  metric: string;
  comparison: LocalToplistCompareEntryPlan;
  selectedServers: readonly string[];
  manifests: readonly ScanArchiveManifest[];
  manifestUrlsByYear: Readonly<Record<number, string>>;
  baseline: LocalToplistLoadResult | null;
  identities: IdentityResolutionSnapshot | null;
  dataRefresh: number;
};
type State = { key: string; result: LocalToplistLoadResult | null; loading: boolean; error: boolean };

/** Independent demand: historical preparation must never own/reset the current table. */
export function useHistoricalStatsDayRanks(input: Input) {
  const { enabled, metric, comparison, selectedServers, manifests, manifestUrlsByYear, baseline, identities, dataRefresh } = input;
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<State>({ key: "", result: null, loading: false, error: false });
  const plan = useMemo(() => enabled ? resolveHistoricalStatsDayEntryPlan(comparison, {
    selectedServers, manifests, manifestUrlsByYear,
  }) : null, [enabled, comparison, selectedServers, manifests, manifestUrlsByYear]);
  const key = plan?.previousEntries.length && baseline && identities
    ? JSON.stringify([comparison.loadKey, plan.loadKey, localToplistResultRevision(baseline), identities.revisions, metric, dataRefresh, refresh]) : "";
  const result = key && state.key === key ? state.result : null;

  useEffect(() => {
    if (!key || !plan) return;
    const controller = new AbortController();
    setState({ key, result: null, loading: true, error: false });
    loadOrBuildLocalToplistSnapshots(plan.previousEntries, { signal: controller.signal,
      auditContext: { consumer: "toplist-historical-stats-day", trigger: "historical-daily-basis" },
    }).then(async next => {
      const checks = await Promise.all([
        next.dependencies ? revalidateLocalDataDependencies(next.dependencies) : null,
        identities ? revalidateIdentityResolutionSnapshot(identities) : null,
      ]);
      if (controller.signal.aborted) return;
      if (checks[0] && !checks[0].current || checks[1] !== identities) {
        setRefresh(value => value + 1);
        return;
      }
      setState({ key, result: next, loading: false, error: next.failedSelections.length > 0 });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ key, result: null, loading: false, error: true });
    });
    return () => controller.abort();
  }, [key, plan, identities]);

  useEffect(() => {
    if (!result?.dependencies) return;
    let stopped = false;
    const refreshBasis = () => { if (!stopped) setRefresh(value => value + 1); };
    const fail = () => { if (!stopped) setState({ key, result: null, loading: false, error: true }); };
    const stop = subscribeToLocalDataDependencies(result.dependencies.need, refreshBasis, fail,
      { consumer: "toplist-historical-stats-day" });
    void revalidateLocalDataDependencies(result.dependencies).then(check => {
      if (!check.current) refreshBasis();
    }).catch(fail);
    return () => { stopped = true; stop(); };
  }, [key, result]);

  const values = useMemo(() => plan && result && baseline && identities
    ? buildHistoricalPlayerStatsDayValues(plan, result, baseline, identities) : null,
  [plan, result, baseline, identities]);
  return {
    values, plan, result,
    loading: Boolean(key && (state.key !== key || state.loading)),
    error: Boolean(key && state.key === key && state.error),
    unavailable: Boolean(enabled && (!plan?.previousEntries.length || plan.status !== "complete")),
  };
}
