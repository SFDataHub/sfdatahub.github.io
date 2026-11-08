import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToLocalDataDependencies, revalidateLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import { isLocalPlayerSourceContextValid, type LocalPlayerSourceContext } from "./localPlayerCurrentSeed";
import { startDashboardMemberComparison } from "./dashboardMemberComparisonClient";
import type { DashboardMemberComparisonRequest } from "./dashboardMemberComparison";
import type { LocalGuildRankingComparison } from "./localGuildRanking";
import { auditBegin, auditFields, auditLeave, auditAccept, auditError, associateAuditResultId } from "../../lib/data-hub/runtimeAudit";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
const empty: LocalGuildRankingComparison = { status: "idle", timestamp: null, members: [], identities: null };
export function useDashboardMemberComparison(input: DashboardMemberComparisonRequest | null, context: LocalPlayerSourceContext | null, sumMode: import("../../lib/settings/preferences").AttributeSumMode = "main-con", acquisitionPending = false, identityKey?: string | null, acquisitionError = false) {
  const generation = useRef(0);
  const targetKey = input ? JSON.stringify([input.guild, identityKey, input.currentSourceId, input.currentTimestamp, input.selectedComparison]) : "";
  const accepted = useRef<{ key: string; comparison: LocalGuildRankingComparison }>();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ input: typeof input; revision: number; comparison: LocalGuildRankingComparison }>({ input: null, revision: 0, comparison: empty });
  useEffect(() => {
    if (!input || !context) return;
    let cancelled = false;
    const audit = auditBegin("F10", "dashboard-member-values-comparison");

    const stop = subscribeToLocalDataDependencies({ allIdentities: true, sourceIds: [input.currentSourceId, ...input.summaries.map(s => s.sourceScanId)] }, () => setRevision(v => v + 1), undefined, { consumer: "dashboard-member-values" });
    const run = startDashboardMemberComparison(input);
    const execution = { jobId: run.id ?? `failed-${generation.current + 1}`, generation: ++generation.current, status: "loading" };
    setState({ input, revision, comparison: accepted.current?.key === targetKey
      ? accepted.current.comparison : { ...empty, status: "loading", execution } });
    run.promise.then(async result => {
      if (cancelled) return;
      if (!await isLocalPlayerSourceContextValid(context) || !(await revalidateLocalDataDependencies(result.dependencies)).current) throw Error("Current member source changed");
      if (cancelled) return;
      result.comparison.execution = { ...execution, status: result.comparison.status, dependencies: result.dependencies };
      auditFields(audit, result.work); auditAccept(audit, result.comparison); associateAuditResultId(result.comparison, audit?.id);
      if (result.comparison.status === "ready") accepted.current = { key: targetKey, comparison: result.comparison };
      setState({ input, revision, comparison: result.comparison });
    }).catch(error => {
      if (!cancelled) { auditError(audit, error); setState({ input, revision, comparison: { ...empty, status: "error", execution: { ...execution, status: "error" } } }); }
    }).finally(() => auditLeave(audit));
    return () => { cancelled = true; run.cancel(); stop(); };
  }, [input, context, revision, identityKey]);
  const current = state.input === input && state.revision === revision ? state.comparison
    : accepted.current?.key === targetKey ? accepted.current.comparison : { ...empty, status: input ? "loading" as const : "idle" as const };
  const comparison = current.status === "empty" && acquisitionPending ? { ...current, status: "loading" as const }
    : current.status === "empty" && acquisitionError ? { ...current, status: "error" as const } : current;
  useRuntimeAuditCommit(comparison, comparison.status === "ready" || comparison.status === "empty", "guild-member-values-and-deltas");
  return useMemo(() => sumMode === "all-five" ? { ...comparison, rankings: comparison.allFive?.rankings, groups: comparison.allFive?.groups, comparisonValues: comparison.allFive?.comparisonValues } : comparison, [comparison, sumMode]);
}
