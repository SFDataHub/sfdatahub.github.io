const DEFAULT_COMPARISON_DAYS = 30;
const DAY_MS = 86_400_000;

export type ComparisonScanTimestampOption = {
  timestamp: number;
};

/** Guild dashboard preference: latest >= minimum age, then oldest earlier stand.
 * Eligibility and equal-time identity/source ties remain the caller's responsibility. */
export function compareComparisonScanAge(left: number, right: number, current: number, days = 28) {
  const leftOld = current - left >= days * DAY_MS;
  const rightOld = current - right >= days * DAY_MS;
  return leftOld !== rightOld ? leftOld ? -1 : 1 : leftOld ? right - left : left - right;
}

export function resolveDefaultComparisonTimestamp<TOption extends ComparisonScanTimestampOption>(
  options: readonly TOption[],
  currentTimestamp: number | null,
  comparisonDays = DEFAULT_COMPARISON_DAYS,
) {
  if (!options.length) return null;
  if (currentTimestamp == null) return options[options.length - 1]?.timestamp ?? null;

  const preferred = options.filter(option => currentTimestamp - option.timestamp >= comparisonDays * DAY_MS).sort((left, right) =>
    compareComparisonScanAge(left.timestamp, right.timestamp, currentTimestamp, comparisonDays),
  )[0];
  return preferred?.timestamp ?? options[options.length - 1]?.timestamp ?? null;
}

export function resolveSelectedComparisonTimestamp<TOption extends ComparisonScanTimestampOption>(
  options: readonly TOption[],
  currentTimestamp: number | null,
  requestedTimestamp?: number | null,
  comparisonDays = DEFAULT_COMPARISON_DAYS,
) {
  if (!options.length) return null;
  if (requestedTimestamp != null && options.some((option) => option.timestamp === requestedTimestamp)) {
    return requestedTimestamp;
  }
  return resolveDefaultComparisonTimestamp(options, currentTimestamp, comparisonDays);
}
