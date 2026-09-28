import React from "react";
import {
  buildLocalPlayerAnalytics,
  type LocalAnalyticsSeries,
  type LocalComparisonScanOption,
  type LocalPlayerAnalyticsResult,
} from "./localPlayerAnalyticsModel";
import type { LocalPlayerProfileModel } from "./types";

type AxisInterval = {
  unit: "day" | "month" | "year";
  step: number;
};

type AxisTick = {
  timestamp: number;
  label: string;
  endpoint?: "start" | "end";
};

type AnalyticsState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: LocalPlayerAnalyticsResult; error: null }
  | { status: "error"; data: null; error: string };

type LocalPlayerAnalyticsProps = {
  profile: LocalPlayerProfileModel;
};

export default function LocalPlayerAnalytics({ profile }: LocalPlayerAnalyticsProps) {
  const [state, setState] = React.useState<AnalyticsState>({ status: "loading", data: null, error: null });
  const [selectedComparisonTimestamp, setSelectedComparisonTimestamp] = React.useState<number | null>(null);
  const profileKey = `${profile.sourceScanId}:${profile.sourcePlayerKey}:${profile.analytics.memberRef ?? ""}:${profile.analytics.scannedAtMs}`;
  const requestKey = `${profileKey}:${selectedComparisonTimestamp ?? "default"}`;

  React.useEffect(() => {
    setSelectedComparisonTimestamp(null);
  }, [profileKey]);

  React.useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, error: null });

    buildLocalPlayerAnalytics(profile, selectedComparisonTimestamp)
      .then((data) => {
        if (active) setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        console.error("[LocalPlayerAnalytics] failed to build local player analytics", error);
        if (active) setState({ status: "error", data: null, error: "Analytics unavailable" });
      });

    return () => {
      active = false;
    };
  }, [profile, requestKey, selectedComparisonTimestamp]);

  if (state.status === "loading") {
    return (
      <>
        <AnalyticsShell area="xp" title="XP PER DAY" subtitle="Loading">
          <ChartFrame>
            <AnalyticsMessage text="Loading analytics" />
          </ChartFrame>
        </AnalyticsShell>
        <AnalyticsShell area="stats-dev" title="BASE STATS GROWTH" subtitle="Loading">
          <ChartFrame>
            <AnalyticsMessage text="Loading analytics" />
          </ChartFrame>
        </AnalyticsShell>
        <AnalyticsShell area="career" title="CAREER TIMELINE" subtitle="Loading">
          <AnalyticsMessage text="Loading analytics" />
        </AnalyticsShell>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <AnalyticsShell area="xp" title="XP PER DAY" subtitle="Error">
          <ChartFrame>
            <AnalyticsMessage text={state.error} />
          </ChartFrame>
        </AnalyticsShell>
        <AnalyticsShell area="stats-dev" title="BASE STATS GROWTH" subtitle="Error">
          <ChartFrame>
            <AnalyticsMessage text={state.error} />
          </ChartFrame>
        </AnalyticsShell>
        <AnalyticsShell area="career" title="CAREER TIMELINE" subtitle="Error">
          <AnalyticsMessage text={state.error} />
        </AnalyticsShell>
      </>
    );
  }

  const data = state.data;
  const selectedValue = data.comparison.selectedTimestamp == null ? "" : String(data.comparison.selectedTimestamp);
  const chartAnimationKey = `${data.comparison.selectedTimestamp ?? "full"}:${data.comparison.currentTimestamp ?? "current"}`;

  return (
    <>
      <AnalyticsShell area="xp" title="XP PER DAY" subtitle={data.periodLabel}>
        <ComparisonSelect
          options={data.comparison.options}
          selectedValue={selectedValue}
          emptyReason={data.comparison.emptyReason}
          currentLabel={data.comparison.currentLabel}
          onChange={setSelectedComparisonTimestamp}
        />
        {data.xp.series[0]?.points.length >= 2 ? (
          <>
            <SeriesLegend series={data.xp.series} />
            <ChartFrame>
              <LineChart series={data.xp.series} animationKey={`xp:${chartAnimationKey}`} />
            </ChartFrame>
          </>
        ) : (
          <ChartFrame>
            <AnalyticsMessage
              text={
                data.comparison.options.length && !data.comparison.selectedPlayerAtStart
                  ? "Player unavailable at selected comparison scan"
                  : "Not enough scan history"
              }
            />
          </ChartFrame>
        )}
      </AnalyticsShell>

      <AnalyticsShell area="stats-dev" title="BASE STATS GROWTH" subtitle={data.periodLabel}>
        {data.stats.series[0]?.points.length >= 2 ? (
          <>
            <SeriesLegend series={data.stats.series} />
            <ChartFrame>
              <LineChart series={data.stats.series} animationKey={`stats:${chartAnimationKey}`} />
            </ChartFrame>
          </>
        ) : (
          <ChartFrame>
            <AnalyticsMessage
              text={
                data.comparison.options.length && !data.comparison.selectedPlayerAtStart
                  ? "Player unavailable at selected comparison scan"
                  : "Not enough scan history"
              }
            />
          </ChartFrame>
        )}
      </AnalyticsShell>

      <AnalyticsShell area="career" title={data.career.title} subtitle={`${data.snapshotCount} snapshots`}>
        {data.career.events.length ? (
          <ol className="local-player-analytics__timeline" aria-label={data.career.title}>
            {data.career.events.map((event) => (
              <li key={event.id} className={`local-player-analytics__timeline-node local-player-analytics__timeline-node--${event.tone}`}>
                <span className="local-player-analytics__timeline-dot" aria-hidden="true" />
                <strong>{event.label}</strong>
                <span>{event.dateLabel}</span>
              </li>
            ))}
          </ol>
        ) : (
          <AnalyticsMessage text={data.career.emptyReason ?? "No confirmed fusion events in player history"} />
        )}
      </AnalyticsShell>
    </>
  );
}

function AnalyticsShell({
  area,
  title,
  subtitle,
  children,
}: {
  area: "xp" | "stats-dev" | "career";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`local-player-analytics local-player-analytics--${area}`}>
      <header className="local-player-analytics__header">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </header>
      <div className="local-player-analytics__body">{children}</div>
    </section>
  );
}

function AnalyticsMessage({ text }: { text: string }) {
  return <div className="local-player-analytics__message">{text}</div>;
}

function ComparisonSelect({
  options,
  selectedValue,
  emptyReason,
  currentLabel,
  onChange,
}: {
  options: LocalComparisonScanOption[];
  selectedValue: string;
  emptyReason: string | null;
  currentLabel: string;
  onChange: (timestamp: number | null) => void;
}) {
  return (
    <label className="local-player-analytics__range-select">
      <span>Comparison scan</span>
      <select
        value={selectedValue}
        disabled={!options.length}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : null);
        }}
      >
        {options.length ? (
          options.map((option) => (
            <option key={`${option.sourceScanId}-${option.snapshotId}-${option.timestamp}`} value={option.timestamp}>
              {option.label} · {option.distanceLabel}
            </option>
          ))
        ) : (
          <option value="">{emptyReason ?? "No complete comparison scan available"}</option>
        )}
      </select>
      <small>End: {currentLabel}</small>
    </label>
  );
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="local-player-analytics__chart-frame">{children}</div>;
}

function SeriesLegend({ series }: { series: LocalAnalyticsSeries[] }) {
  return (
    <div className="local-player-analytics__legend">
      {series.map((entry) => (
        <span key={entry.id}>
          <i style={{ background: entry.color }} aria-hidden="true" />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

function LineChart({ series, animationKey }: { series: LocalAnalyticsSeries[]; animationKey: string }) {
  const validPoints = series.flatMap((entry) => entry.points);
  const minTime = Math.min(...validPoints.map((point) => point.timestamp));
  const maxTime = Math.max(...validPoints.map((point) => point.timestamp));
  const minValue = Math.min(...validPoints.map((point) => point.value));
  const maxValue = Math.max(...validPoints.map((point) => point.value));
  const width = 640;
  const height = 210;
  const chart = { left: 46, right: 16, top: 18, bottom: 34 };
  const xRange = Math.max(1, maxTime - minTime);
  const yPadding = Math.max(1, (maxValue - minValue) * 0.12);
  const yMin = minValue - yPadding;
  const yMax = maxValue + yPadding;
  const yRange = Math.max(1, yMax - yMin);
  const x = (timestamp: number) => chart.left + ((timestamp - minTime) / xRange) * (width - chart.left - chart.right);
  const y = (value: number) => chart.top + (1 - (value - yMin) / yRange) * (height - chart.top - chart.bottom);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const plotWidth = width - chart.left - chart.right;
  const xTicks = buildTimeAxisTicks(minTime, maxTime, plotWidth);

  return (
    <svg
      key={animationKey}
      className="local-player-analytics__chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
    >
      <title>{series.map((entry) => entry.label).join(", ")}</title>
      {gridLines.map((ratio) => {
        const lineY = chart.top + ratio * (height - chart.top - chart.bottom);
        const value = yMax - ratio * yRange;
        return (
          <g key={ratio}>
            <line x1={chart.left} x2={width - chart.right} y1={lineY} y2={lineY} className="local-player-analytics__grid-line" />
            <text x={chart.left - 8} y={lineY + 4} className="local-player-analytics__axis-label" textAnchor="end">
              {formatCompact(value)}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => (
        <g key={`${tick.endpoint ?? "tick"}-${tick.timestamp}`}>
          <line
            x1={x(tick.timestamp)}
            x2={x(tick.timestamp)}
            y1={chart.top}
            y2={height - chart.bottom}
            className="local-player-analytics__grid-line local-player-analytics__grid-line--x"
          />
          <text
            x={x(tick.timestamp)}
            y={height - 8}
            className="local-player-analytics__axis-label"
            textAnchor={tick.endpoint === "start" ? "start" : tick.endpoint === "end" ? "end" : "middle"}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {series.map((entry) => {
        const path = entry.points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.timestamp)} ${y(point.value)}`).join(" ");
        return (
          <g key={entry.id}>
            {entry.points.length >= 2 && (
              <path d={path} fill="none" stroke={entry.color} pathLength={1} className="local-player-analytics__line" />
            )}
            {entry.points.map((point) => (
              <circle
                key={`${entry.id}-${point.timestamp}-${point.value}`}
                cx={x(point.timestamp)}
                cy={y(point.value)}
                r="4"
                fill={entry.color}
                tabIndex={0}
                className="local-player-analytics__point"
              >
                <title>{`${entry.label}: ${point.detail}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

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

function buildTimeAxisTicks(minTime: number, maxTime: number, plotWidth: number): AxisTick[] {
  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime >= maxTime) {
    return [{ timestamp: minTime, label: formatAxisDate(minTime, minTime, maxTime) }];
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
    { timestamp: minTime, label: formatAxisDate(minTime, minTime, maxTime, chosen), endpoint: "start" },
    ...interiorTicks.map((timestamp) => ({ timestamp, label: formatAxisDate(timestamp, minTime, maxTime, chosen) })),
    { timestamp: maxTime, label: formatAxisDate(maxTime, minTime, maxTime, chosen), endpoint: "end" },
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
  return ticks.filter((tick) => {
    if (seen.has(tick.timestamp)) return false;
    seen.add(tick.timestamp);
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

function formatAxisDate(timestamp: number, minTime: number, maxTime: number, interval?: AxisInterval) {
  const durationDays = (maxTime - minTime) / DAY_MS;
  const date = new Date(timestamp);
  if (durationDays <= 62) {
    return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
  }
  if (durationDays > 1095 && interval?.unit === "year") {
    return new Intl.DateTimeFormat("en-GB", { year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(date);
}
