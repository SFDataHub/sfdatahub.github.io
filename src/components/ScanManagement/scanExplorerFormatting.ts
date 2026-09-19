export type ScanExplorerMetric = {
  label: string;
  value: unknown;
  title?: string;
};

const DEBUG_METRIC_KEYS = new Set(["layout", "metadata", "source", "provenance", "fields", "own"]);

export function isScanExplorerDebugMetricKey(value: string) {
  return DEBUG_METRIC_KEYS.has(value.toLowerCase());
}

export function formatScanExplorerPrimitiveValue(value: unknown, formatNumber: (value: number) => string = String) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : null;
  if (typeof value === "string") return value;
  return null;
}

export function toScanExplorerTimestampDate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatScanExplorerArraySummary(
  value: unknown[],
  formatNumber: (value: number) => string = String,
) {
  const primitiveValues = value
    .map((entry) => formatScanExplorerPrimitiveValue(entry, formatNumber))
    .filter((entry): entry is string => entry != null);
  if (!primitiveValues.length || primitiveValues.length !== value.length) return null;
  if (primitiveValues.length > 6) {
    const positiveCount = value.filter((entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0).length;
    return `${formatNumber(value.length)} values${positiveCount ? ` - ${formatNumber(positiveCount)} active` : ""}`;
  }
  return primitiveValues.join(" - ");
}

export function formatScanExplorerCompactEntryValue(
  value: unknown,
  options: {
    formatNumber?: (value: number) => string;
    formatLabel?: (value: string) => string;
  } = {},
) {
  const formatNumber = options.formatNumber ?? String;
  const formatLabel = options.formatLabel ?? ((label: string) => label);
  const formatted = formatScanExplorerPrimitiveValue(value, formatNumber);
  if (formatted != null) return formatted;
  if (Array.isArray(value)) return formatScanExplorerArraySummary(value, formatNumber);
  if (!value || typeof value !== "object") return null;

  const parts = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !isScanExplorerDebugMetricKey(key))
    .map(([key, nestedValue]) => {
      const nestedFormatted = formatScanExplorerPrimitiveValue(nestedValue, formatNumber);
      return nestedFormatted == null ? null : `${formatLabel(key)} ${nestedFormatted}`;
    })
    .filter(Boolean)
    .slice(0, 3);
  return parts.length ? parts.join(" - ") : null;
}

export function getVisibleScanExplorerMetrics(items: ScanExplorerMetric[]) {
  return items.filter((item) => {
    if (isScanExplorerDebugMetricKey(item.label)) return false;
    return item.value !== null && item.value !== undefined && item.value !== "";
  });
}
