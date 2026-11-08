import type { GuildAnalyticsDerivedData } from "../guilds/localGuildAnalyticsStore";
import type { ProfileHistoryMember } from "./profileSumHistory";
import type { AttributeSumMode } from "../settings/preferences";
import type { PlayerPerformanceSnapshot } from "../../pages/Playground/playerPerformanceModel";
import type { LocalPlayerAnalyticsResult, LocalAnalyticsSeries } from "../../components/local-player-profile/localPlayerAnalyticsModel";
import { PLAYER_VIEW_CHARTS, type PlayerContentView, type PlayerChartMetric } from "./viewCharts";

/** Use the same physical duplicate and time range for coverage and projection. */
function selectChartObservations(snapshots: PlayerPerformanceSnapshot[], data: GuildAnalyticsDerivedData,
  result: LocalPlayerAnalyticsResult) {
  const key = (source: string, time: number, ref: string | null) => JSON.stringify([source, time, ref?.toLowerCase()]);
  const rows = new Map<string, ProfileHistoryMember[]>();
  for (const row of data.members) {
    const id = key(row.sourceScanId, row.snapshotTimestamp, row.memberRef);
    const matches = rows.get(id) ?? [];
    matches.push(row); rows.set(id, matches);
  }
  return snapshots.filter(snapshot =>
    (result.comparison.selectedTimestamp == null || snapshot.scannedAtMs >= result.comparison.selectedTimestamp) &&
    (result.comparison.currentTimestamp == null || snapshot.scannedAtMs <= result.comparison.currentTimestamp)
  ).map(snapshot => ({ time: snapshot.scannedAtMs, observationKey: key(snapshot.scanId, snapshot.scannedAtMs, snapshot.memberRef), row: (rows.get(key(snapshot.scanId, snapshot.scannedAtMs, snapshot.memberRef)) ?? [])
    .filter(row => row.xpTotal === snapshot.xpTotal && row.focusedBaseStats === snapshot.baseStats).at(-1) }));
}

function isChartValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Versions and unrelated fields do not prove coverage of the chosen rows. */
export function hasPreparedBaseChartValues(snapshots: PlayerPerformanceSnapshot[], data: GuildAnalyticsDerivedData,
  result: LocalPlayerAnalyticsResult): boolean {
  return hasPreparedPlayerViewChartValues("base", "main-con", snapshots, data, result);
}

function readChartValue(row: ProfileHistoryMember, metric: PlayerChartMetric, mode: AttributeSumMode): number | null | undefined {
    switch (metric) {
      case "hof": return row.hofRank;
      case "baseSum": return mode === "all-five" ? row.profileSums?.[mode].base : row.focusedBaseStats;
      case "totalSum": return mode === "all-five" ? row.profileSums?.[mode].total : row.focusedTotalStats;
      case "baseMain": return row.baseMain;
      case "baseCon": return row.conBase;
      case "totalMain": return row.attrTotal;
      case "totalCon": return row.conTotal;
      case "mine": return row.mine;
      case "treasury": return row.treasury;
      default: return null;
    }
}

export function hasPreparedPlayerViewChartValues(view: PlayerContentView, mode: AttributeSumMode,
  snapshots: PlayerPerformanceSnapshot[], data: GuildAnalyticsDerivedData, result: LocalPlayerAnalyticsResult, allowZeroRank = false): boolean {
  return selectChartObservations(snapshots, data, result).every(({ row }) => row != null && PLAYER_VIEW_CHARTS[view].every(metric => {
    if (metric === "xp") return true;
    const value = readChartValue(row, metric, mode);
    return isChartValue(value) && (allowZeroRank || metric !== "hof" || value > 0);
  }));
}

/** Use the observations already chosen by the shared identity and duplicate rules.
 * Join their physical source/time/reference; never infer rank from list order. */
export function buildPlayerViewCharts(view: PlayerContentView, mode: AttributeSumMode, snapshots: PlayerPerformanceSnapshot[],
  data: GuildAnalyticsDerivedData, result: LocalPlayerAnalyticsResult, allowZeroRank = false): NonNullable<LocalPlayerAnalyticsResult["charts"]> {
  const observations = selectChartObservations(snapshots, data, result);
  return PLAYER_VIEW_CHARTS[view].map(metric => {
    if (metric === "xp") return { metric, series: result.xp.series };
    const series: LocalAnalyticsSeries<number | null> = { id: `view-${metric}`, label: metric, color: "#5c8bc6", points: [] };
    const points = new Map<number, LocalAnalyticsSeries<number | null>["points"][number]>();
    for (const { time, observationKey, row } of observations) {
      const raw = row ? readChartValue(row, metric, mode) : null;
      const building = metric === "mine" || metric === "treasury";
      const value = isChartValue(raw) && (!building || raw > 0) ? raw : null;
      // The selected physical snapshot proves presence independently of this field.
      // Keep missing building measurements only in the fortress chart contract.
      if (!building && (value == null || !allowZeroRank && metric === "hof" && value === 0)) continue;
      const label = new Date(time).toLocaleDateString("en-GB");
      points.set(time, { timestamp: time, ...(building ? { observationKey } : {}), label, value, rawValue: value, detail: value == null ? label : `${label}: ${value}` });
    }
    series.points = [...points.values()].sort((a, b) => a.timestamp - b.timestamp);
    return { metric, series: [series] };
  });
}
