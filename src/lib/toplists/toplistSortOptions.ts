import { LOCAL_TOPLIST_METRICS } from "./localToplistMetrics";
import { playerColumnSortMatches, playerColumnSortMetric, toplistColumnDefinition, type ToplistKind } from "./toplistColumns";

export type VisibleToplistSortOption = { columnKey: string; metricKey: string; defaultDirection: "asc" | "desc" };

/** The active column owner supplies order and visibility; catalog entries supply only contracts. */
export function visibleToplistSortOptions(kind: ToplistKind, columns: readonly string[], mode: "base" | "total" = "base"): VisibleToplistSortOption[] {
  const seen = new Set<string>();
  return columns.flatMap(columnKey => {
    const column = toplistColumnDefinition(kind, columnKey);
    if (!column?.metric) return [];
    const metricKey = kind === "players" ? playerColumnSortMetric(column.metric, mode) : column.metric;
    const metric = LOCAL_TOPLIST_METRICS.find(entry => entry.metricKey === metricKey);
    if (!metric || seen.has(metricKey)) return [];
    seen.add(metricKey);
    return [{ columnKey, metricKey, defaultDirection: metric.defaultDirection }];
  });
}

export function resolveVisibleToplistSort(kind: ToplistKind, options: readonly VisibleToplistSortOption[], metricKey: string, direction: "asc" | "desc", preferred: string) {
  const matches = (option: VisibleToplistSortOption, key: string) => option.metricKey === key || kind === "players" &&
    ["main", "con", "sum", "statsPerDay"].includes(option.columnKey) &&
    playerColumnSortMatches(toplistColumnDefinition(kind, option.columnKey)!.metric!, key, "total");
  const current = options.find(option => matches(option, metricKey));
  if (current) return { metricKey: current.metricKey, direction };
  // Normalized views always retain the sortable Name column.
  const fallback = options.find(option => matches(option, preferred)) ?? options[0];
  if (!fallback) throw new Error("A toplist view needs a visible sortable column");
  return { metricKey: fallback.metricKey, direction: fallback.defaultDirection };
}
