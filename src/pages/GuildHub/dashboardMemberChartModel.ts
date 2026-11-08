import { resolvePlayerIdentity } from "../../lib/identities/identityResolution";
import { dashboardHistoryValue, type DashboardHistory, type DashboardHistoryMetric } from "./dashboardHistory";
import type { DashboardHistorySeries } from "./dashboardGuildComparison";

export const toggleMemberSelection = (keys: readonly string[], key: string): string[] =>
  keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key];
export const rankingMemberSelection = (keys: readonly string[]) => keys.length === 1 ? keys[0] : null;
export function memberChartPlayerPoints(history: DashboardHistory, key: string, metric: DashboardHistoryMetric, _times?: readonly number[]) {
  const row = history.rows.find(row => row.member.key === key);
  return [...row?.byTime ?? []].sort(([a], [b]) => a - b).map(([timestampMs, observation]) => ({ timestampMs, value: dashboardHistoryValue(observation, metric) }));
}

// Identity/reference based, independent of selection order and class filters.
export function memberChartColor(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 70% 68%)`;
}

// The existing history has already resolved confirmed identity chains. This
// projection keeps only each player's actual observations, including null values.
export function comparePlayerSeries(history: DashboardHistory, selected: readonly string[], metrics: readonly DashboardHistoryMetric[], label: (metric: DashboardHistoryMetric) => string): (DashboardHistorySeries & { memberKey: string; color: string; timePoints: { timestampMs: number; observationKey: string; value: number | null }[] })[] {
  return history.rows.filter(row => selected.includes(row.member.key)).flatMap(row => {
    const identity = history.identity ? resolvePlayerIdentity(history.identity, row.ref).identityId : null;
    const ownerKey = JSON.stringify(["player", identity ?? row.ref.toLowerCase()]);
    return metrics.map(metric => ({ key: ownerKey + "::" + metric, ownerKey, memberKey: row.member.key, metric,
      label: row.member.name + " · " + label(metric), points: [], color: memberChartColor(ownerKey),
      timePoints: [...row.byTime].sort(([a], [b]) => a - b).map(([timestampMs, observation]) => ({ timestampMs,
        observationKey: JSON.stringify([observation.sourceScanId, observation.snapshotId, observation.memberRef, observation.id]),
        value: dashboardHistoryValue(observation, metric) })) }));
  });
}
