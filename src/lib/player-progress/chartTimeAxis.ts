type AxisInterval = {
  unit: "day" | "month" | "year";
  step: number;
};

type AxisTick = {
  timestamp: number;
  label: string;
  endpoint?: "start" | "end";
};

const DAY_MS = 24 * 60 * 60 * 1000;
const AXIS_INTERVALS: AxisInterval[] = [
  { unit: "day", step: 1 },
  { unit: "day", step: 2 },
  { unit: "day", step: 7 },
  { unit: "day", step: 14 },
  { unit: "month", step: 1 },
  { unit: "month", step: 2 },
  { unit: "month", step: 3 },
  { unit: "month", step: 6 },
  { unit: "year", step: 1 },
];

export function buildTimeAxisTicks(minTime: number, maxTime: number, plotWidth: number, locale = "en-GB"): AxisTick[] {
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime >= maxTime) {
    return [{ timestamp: minTime, label: formatAxisDate(minTime, minTime, maxTime, undefined, locale) }];
  }

  const maxTickCount = Math.max(3, Math.min(9, Math.floor(plotWidth / 72) + 1));
  const minTickDistance = plotWidth / Math.max(1, maxTickCount - 1) * 0.58;

  const chosen =
    AXIS_INTERVALS.find((interval) => {
      const ticks = filterInteriorTicks(buildCalendarTicks(minTime, maxTime, interval), minTime, maxTime, plotWidth, minTickDistance);
      return ticks.length + 2 <= maxTickCount;
    }) ?? AXIS_INTERVALS[AXIS_INTERVALS.length - 1];

  const interiorTicks = filterInteriorTicks(buildCalendarTicks(minTime, maxTime, chosen), minTime, maxTime, plotWidth, minTickDistance);
  const ticks: AxisTick[] = [
    { timestamp: minTime, label: formatAxisDate(minTime, minTime, maxTime, chosen, locale), endpoint: "start" },
    ...interiorTicks.map((timestamp) => ({ timestamp, label: formatAxisDate(timestamp, minTime, maxTime, chosen, locale) })),
    { timestamp: maxTime, label: formatAxisDate(maxTime, minTime, maxTime, chosen, locale), endpoint: "end" },
  ];

  return dedupeTicks(ticks);
}

function filterInteriorTicks(
  ticks: number[],
  minTime: number,
  maxTime: number,
  plotWidth: number,
  minTickDistance: number,
) {
  const x = (timestamp: number) => ((timestamp - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
  return ticks.filter((timestamp) => {
    if (timestamp <= minTime || timestamp >= maxTime) return false;
    const px = x(timestamp);
    return px >= minTickDistance && plotWidth - px >= minTickDistance;
  });
}

function buildCalendarTicks(minTime: number, maxTime: number, interval: AxisInterval) {
  const ticks: number[] = [];
  let cursor =
    interval.unit === "day"
      ? addUtcDays(startOfUtcDay(minTime), interval.step)
      : interval.unit === "month"
        ? addUtcMonths(startOfUtcMonth(minTime), interval.step)
        : addUtcYears(startOfUtcYear(minTime), interval.step);

  while (cursor < maxTime && ticks.length < 80) {
    if (cursor > minTime) ticks.push(cursor);
    cursor =
      interval.unit === "day"
        ? addUtcDays(cursor, interval.step)
        : interval.unit === "month"
          ? addUtcMonths(cursor, interval.step)
          : addUtcYears(cursor, interval.step);
  }

  return ticks;
}

function dedupeTicks(ticks: AxisTick[]) {
  const seen = new Set<number>();
  const seenLabels = new Set<string>();
  const endpointLabels = new Set(ticks.filter((tick) => tick.endpoint).map((tick) => tick.label));
  return ticks.filter((tick) => {
    if (seen.has(tick.timestamp)) return false;
    if (!tick.endpoint && endpointLabels.has(tick.label)) return false;
    if (seenLabels.has(tick.label)) return false;
    seen.add(tick.timestamp);
    seenLabels.add(tick.label);
    return true;
  });
}

function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcMonth(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function startOfUtcYear(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), 0, 1);
}

function addUtcDays(timestamp: number, days: number) {
  return timestamp + days * DAY_MS;
}

function addUtcMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
}

function addUtcYears(timestamp: number, years: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear() + years, 0, 1);
}

function formatAxisDate(timestamp: number, minTime: number, maxTime: number, interval?: AxisInterval, locale = "en-GB") {
  const durationDays = (maxTime - minTime) / DAY_MS;
  const date = new Date(timestamp);
  if (durationDays <= 62) {
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date);
  }
  if (durationDays > 1095 && interval?.unit === "year") {
    return new Intl.DateTimeFormat(locale, { year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(date);
}
