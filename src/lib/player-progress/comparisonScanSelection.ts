const DEFAULT_COMPARISON_DAYS = 30;
const DAY_MS = 86_400_000;

export type ComparisonScanTimestampOption = {
  timestamp: number;
};

export function resolveDefaultComparisonTimestamp<TOption extends ComparisonScanTimestampOption>(
  options: readonly TOption[],
  currentTimestamp: number | null,
) {
  if (!options.length) return null;
  if (currentTimestamp == null) return options[options.length - 1]?.timestamp ?? null;

  const withDistance = options.map((option) => ({
    option,
    elapsedDays: (currentTimestamp - option.timestamp) / DAY_MS,
  }));
  const atLeastThirty = withDistance
    .filter((entry) => entry.elapsedDays >= DEFAULT_COMPARISON_DAYS)
    .sort((left, right) => left.elapsedDays - right.elapsedDays)[0];
  if (atLeastThirty) return atLeastThirty.option.timestamp;

  return options[options.length - 1]?.timestamp ?? null;
}

export function resolveSelectedComparisonTimestamp<TOption extends ComparisonScanTimestampOption>(
  options: readonly TOption[],
  currentTimestamp: number | null,
  requestedTimestamp?: number | null,
) {
  if (!options.length) return null;
  if (requestedTimestamp != null && options.some((option) => option.timestamp === requestedTimestamp)) {
    return requestedTimestamp;
  }
  return resolveDefaultComparisonTimestamp(options, currentTimestamp);
}
