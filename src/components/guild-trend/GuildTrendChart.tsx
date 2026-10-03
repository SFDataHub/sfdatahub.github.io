import React from "react";
import type { GuildTrendInterval, GuildTrendMetric } from "../../pages/Playground/playerPerformanceModel";
import styles from "./GuildTrendChart.module.css";

export type GuildTrendChartMetric = "xp" | "base";

type GuildTrendChartProps = {
  intervals: GuildTrendInterval[];
  metric: GuildTrendChartMetric;
  selectedInterval?: GuildTrendInterval | null;
  title?: string;
  className?: string;
  emptyTitle?: string;
  emptyText?: string;
  showTrendInfo?: boolean;
};

type TrendPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
};

type RateScale = {
  min: number;
  max: number;
  zeroY: number;
  project(value: number): number;
};

const WIDTH = 940;
const HEIGHT = 310;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 238;
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP;
const PLOT_LEFT = 52;
const PLOT_RIGHT = 48;
const BAR_GAP = 10;

export default function GuildTrendChart({
  intervals,
  metric,
  selectedInterval = null,
  title,
  className,
  emptyTitle = "Kein Gildenverlauf verfügbar",
  emptyText = "Es wurden noch keine zwei vollständigen chronologischen Scanzeitpunkte gefunden.",
  showTrendInfo = false,
}: GuildTrendChartProps) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [trendInfoOpen, setTrendInfoOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trendInfoId = React.useId();
  const metricLabels = getMetricLabels(metric);
  const activeInterval = activeIndex == null ? null : intervals[activeIndex] ?? null;
  const hasActiveInterval = activeInterval != null;
  const absoluteValues = intervals.flatMap((interval) => {
    const values = getGuildTrendMetric(interval, metric);
    return [values.startAverage, values.endAverage];
  });
  const dailyValues = intervals
    .flatMap((interval) => {
      const values = getGuildTrendMetric(interval, metric);
      return [values.perDay, values.trendPerDay];
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const absoluteMax = Math.max(1, ...absoluteValues.map((value) => Math.abs(value)));
  const barWidth = intervals.length
    ? Math.max(10, (WIDTH - PLOT_LEFT - PLOT_RIGHT - BAR_GAP * (intervals.length - 1)) / intervals.length)
    : 0;
  const rateScale = buildRateScale(dailyValues, PLOT_TOP, PLOT_BOTTOM);
  const trendPoints = buildTrendPoints(intervals, metric, { barWidth, gap: BAR_GAP, rateScale });
  const activeTooltip = activeInterval
    ? buildTooltip(activeInterval, metric, getIntervalCenterX(activeIndex ?? 0, barWidth), rateScale.project(getGuildTrendMetric(activeInterval, metric).perDay))
    : null;

  const openTrendInfo = React.useCallback(() => {
    setActiveIndex(null);
    setTrendInfoOpen(true);
  }, []);

  const closeTrendInfo = React.useCallback(() => {
    setTrendInfoOpen(false);
  }, []);

  React.useEffect(() => {
    setTrendInfoOpen(false);
  }, [metric]);

  React.useEffect(() => {
    if (!trendInfoOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setTrendInfoOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTrendInfoOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [trendInfoOpen]);

  if (!intervals.length) {
    return (
      <div className={`${styles.chartRoot} ${className ?? ""}`}>
        <div className={styles.emptyState}>
          <strong>{emptyTitle}</strong>
          <span>{emptyText}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.chartRoot} ${className ?? ""}`}
      onMouseLeave={() => setActiveIndex(null)}
    >
      <div className={styles.legend} aria-label="Diagrammlegende">
        <span><i className={styles.legendBar} />Gildenstand</span>
        <span><i className={styles.legendGrowth} />Wachstum / Verlust</span>
        <span><i className={styles.legendPoint} />{metricLabels.rateLegend}</span>
        <span className={styles.legendTrendItem}>
          <i className={styles.legendTrend} />{metricLabels.trendLegend}
          {showTrendInfo ? (
            <button
              type="button"
              className={styles.legendInfoButton}
              aria-label={`${metricLabels.trendLegend} erklaeren`}
              aria-describedby={trendInfoOpen ? trendInfoId : undefined}
              aria-expanded={trendInfoOpen}
              onMouseEnter={openTrendInfo}
              onMouseLeave={closeTrendInfo}
              onFocus={openTrendInfo}
              onBlur={closeTrendInfo}
              onClick={(event) => {
                event.stopPropagation();
                openTrendInfo();
              }}
            >
              i
            </button>
          ) : null}
        </span>
      </div>
      {showTrendInfo && trendInfoOpen ? (
        <div id={trendInfoId} className={styles.infoPopup} role="tooltip">
          <strong>{metricLabels.trendLegend}</strong>
          <p>
            Der gewichtete Trend glaettet die Veraenderung pro Tag ueber benachbarte Scanintervalle.
            Dafuer werden die absoluten Veraenderungen addiert und durch die gesamte tatsaechliche Dauer geteilt.
            Die Linie kann sinken, obwohl der absolute Gildenstand steigt - dann waechst die Gilde weiterhin,
            aber langsamer als zuvor.
          </p>
        </div>
      ) : null}
      <div className={styles.chartWrap}>
        <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title ?? "Gildentrend"}>
          <line className={styles.chartBaseline} x1="48" y1={PLOT_BOTTOM} x2={WIDTH - 48} y2={PLOT_BOTTOM} />
          <line className={styles.chartZeroLine} x1="48" y1={rateScale.zeroY} x2={WIDTH - 48} y2={rateScale.zeroY} />
          <text className={styles.chartScaleLabel} x="48" y="18">Absolut</text>
          <text className={styles.chartScaleLabel} x={WIDTH - 48} y="18" textAnchor="end">{metricLabels.rightAxis}</text>
          {intervals.map((interval, index) => {
            const values = getGuildTrendMetric(interval, metric);
            const x = getIntervalX(index, barWidth);
            const yStart = absoluteY(values.startAverage, absoluteMax, PLOT_TOP, PLOT_HEIGHT);
            const yEnd = absoluteY(values.endAverage, absoluteMax, PLOT_TOP, PLOT_HEIGHT);
            const lower = Math.min(values.startAverage, values.endAverage);
            const upper = Math.max(values.startAverage, values.endAverage);
            const yUpper = absoluteY(upper, absoluteMax, PLOT_TOP, PLOT_HEIGHT);
            const yLower = absoluteY(lower, absoluteMax, PLOT_TOP, PLOT_HEIGHT);
            const selected = selectedInterval ? isIntervalInPeriod(interval, selectedInterval) : false;
            const active = activeIndex === index;
            const dimmed = hasActiveInterval && !active;
            const labelVisible = shouldShowXAxisLabel(index, intervals.length);

            return (
              <g key={`${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`} data-dimmed={dimmed}>
                <rect
                  className={styles.guildStandBar}
                  data-highlighted={selected || active}
                  x={x}
                  y={values.absoluteGrowth < 0 ? yEnd : yStart}
                  width={barWidth}
                  height={Math.max(0, PLOT_BOTTOM - (values.absoluteGrowth < 0 ? yEnd : yStart))}
                  rx="3"
                />
                {values.absoluteGrowth !== 0 ? (
                  <rect
                    className={styles.guildGrowthBar}
                    data-direction={values.absoluteGrowth > 0 ? "positive" : "negative"}
                    data-active={active}
                    x={x}
                    y={yUpper}
                    width={barWidth}
                    height={Math.max(0, yLower - yUpper)}
                  />
                ) : null}
                <line className={styles.guildStartMarker} x1={x} x2={x + barWidth} y1={yStart} y2={yStart} />
                <line className={styles.guildEndMarker} x1={x} x2={x + barWidth} y1={yEnd} y2={yEnd} />
                {labelVisible ? (
                  <text className={styles.chartLabel} x={x + barWidth / 2} y={HEIGHT - 14} textAnchor="middle">
                    {formatAxisDate(interval.end.scannedAtMs)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {buildTrendSegments(trendPoints).map((segment) => {
            const active = activeIndex === segment.from.index || activeIndex === segment.to.index;
            return (
              <path
                key={`guild-trend-${segment.from.index}-${segment.to.index}`}
                className={styles.trendLine}
                data-active={active}
                data-dimmed={hasActiveInterval && !active}
                d={buildTrendSegmentPath(segment.from, segment.to)}
              />
            );
          })}
          {intervals.map((interval, index) => {
            const values = getGuildTrendMetric(interval, metric);
            const x = getIntervalCenterX(index, barWidth);
            const active = activeIndex === index;
            return (
              <circle
                key={`guild-daily-${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`}
                className={styles.guildDailyPoint}
                data-active={active}
                data-dimmed={hasActiveInterval && !active}
                cx={x}
                cy={rateScale.project(values.perDay)}
                r="4"
              />
            );
          })}
          {intervals.map((interval, index) => {
            const x = getIntervalX(index, barWidth);
            return (
              <rect
                key={`guild-hit-${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`}
                className={styles.intervalHitArea}
                x={Math.max(48, x - BAR_GAP / 2)}
                y={PLOT_TOP}
                width={barWidth + BAR_GAP}
                height={PLOT_BOTTOM - PLOT_TOP}
                tabIndex={0}
                role="button"
                aria-label={buildIntervalAriaLabel(interval, metric)}
                onMouseEnter={() => {
                  setTrendInfoOpen(false);
                  setActiveIndex(index);
                }}
                onFocus={() => {
                  setTrendInfoOpen(false);
                  setActiveIndex(index);
                }}
                onClick={() => {
                  setTrendInfoOpen(false);
                  setActiveIndex(index);
                }}
                onBlur={() => setActiveIndex((current) => (current === index ? null : current))}
              />
            );
          })}
        </svg>
        {activeTooltip ? (
          <div
            className={styles.tooltip}
            style={{
              left: `${activeTooltip.leftPercent}%`,
              top: `${activeTooltip.topPercent}%`,
            }}
          >
            <strong>{activeTooltip.title}</strong>
            <dl>
              {activeTooltip.rows.map((row) => (
                <React.Fragment key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function getGuildTrendMetric(interval: GuildTrendInterval, metric: GuildTrendChartMetric): GuildTrendMetric {
  return metric === "xp" ? interval.xp : interval.base;
}

function getMetricLabels(metric: GuildTrendChartMetric) {
  if (metric === "xp") {
    return {
      rateLegend: "XP pro Tag",
      trendLegend: "Gewichteter XP/Tag-Trend",
      rightAxis: "XP / TAG",
    };
  }

  return {
    rateLegend: "Basiswerte pro Tag",
    trendLegend: "Gewichteter Basiswerte/Tag-Trend",
    rightAxis: "BASISWERTE / TAG",
  };
}

function getIntervalX(index: number, barWidth: number) {
  return PLOT_LEFT + index * (barWidth + BAR_GAP);
}

function getIntervalCenterX(index: number, barWidth: number) {
  return getIntervalX(index, barWidth) + barWidth / 2;
}

function buildTrendPoints(
  intervals: GuildTrendInterval[],
  metric: GuildTrendChartMetric,
  scale: { barWidth: number; gap: number; rateScale: RateScale },
) {
  return intervals
    .map((interval, index): TrendPoint | null => {
      const value = getGuildTrendMetric(interval, metric).trendPerDay;
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return {
        index,
        x: PLOT_LEFT + index * (scale.barWidth + scale.gap) + scale.barWidth / 2,
        y: scale.rateScale.project(value),
        value,
      };
    })
    .filter((point): point is TrendPoint => Boolean(point));
}

function buildTrendSegments(points: TrendPoint[]) {
  const segments: Array<{ from: TrendPoint; to: TrendPoint }> = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current.index !== previous.index + 1) continue;
    segments.push({ from: previous, to: current });
  }
  return segments;
}

function buildTrendSegmentPath(from: TrendPoint, to: TrendPoint) {
  const controlX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${to.x} ${to.y}`;
}

function absoluteY(value: number, maxValue: number, top: number, height: number) {
  return top + height - Math.max(0, value) / maxValue * height;
}

function buildRateScale(values: number[], top: number, bottom: number): RateScale {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const rawMin = finiteValues.length ? Math.min(...finiteValues) : 0;
  const rawMax = finiteValues.length ? Math.max(...finiteValues) : 1;
  if (!finiteValues.length || (rawMin === 0 && rawMax === 0)) {
    const project = (value: number) => bottom - value * (bottom - top);
    return {
      min: 0,
      max: 1,
      zeroY: bottom,
      project,
    };
  }
  const rawRange = rawMax - rawMin;
  const padding = Math.max(rawRange * 0.08, Math.abs(rawMax || rawMin) * 0.04, 1);
  const min = rawMin >= 0 ? 0 : rawMin - padding;
  const max = rawMax <= 0 ? 0 : rawMax + padding;
  const domainRange = Math.max(max - min, 1);
  const project = (value: number) => top + (max - value) / domainRange * (bottom - top);

  return {
    min,
    max,
    zeroY: project(0),
    project,
  };
}

function isIntervalInPeriod(interval: GuildTrendInterval, selectedInterval: GuildTrendInterval) {
  return (
    interval.start.scannedAtMs >= selectedInterval.start.scannedAtMs &&
    interval.end.scannedAtMs <= selectedInterval.end.scannedAtMs
  );
}

function shouldShowXAxisLabel(index: number, total: number) {
  if (total <= 12) return true;
  const step = Math.ceil(total / 8);
  return index === total - 1 || index % step === 0;
}

function buildTooltip(interval: GuildTrendInterval, metric: GuildTrendChartMetric, x: number, y: number) {
  const values = getGuildTrendMetric(interval, metric);
  const digits = metric === "xp" ? 0 : 2;
  const valueFormatter = metric === "xp" ? formatCompactSignedAware : (value: number | null | undefined) => formatNumber(value, digits);
  const rateFormatter = metric === "xp" ? formatCompactSignedAware : (value: number | null | undefined) => formatSignedNumber(value, digits);
  return {
    title: `${formatDate(interval.start.scannedAtMs)} - ${formatDate(interval.end.scannedAtMs)}`,
    leftPercent: Math.max(15, Math.min(85, (x / WIDTH) * 100)),
    topPercent: Math.max(8, Math.min(72, (y / HEIGHT) * 100)),
    rows: [
      { key: "period-start", label: "Start", value: formatDateTime(interval.start.scannedAtMs) },
      { key: "period-end", label: "Ende", value: formatDateTime(interval.end.scannedAtMs) },
      { key: "period-duration", label: "Dauer", value: formatDays(interval.elapsedDays) },
      { key: `${metric}-metric-start`, label: "Anfang", value: valueFormatter(values.startAverage) },
      { key: `${metric}-metric-end`, label: "Ende", value: valueFormatter(values.endAverage) },
      { key: `${metric}-metric-growth`, label: "Wachstum", value: metric === "xp" ? formatCompactSignedAware(values.absoluteGrowth, true) : formatSignedNumber(values.absoluteGrowth, digits) },
      { key: `${metric}-rate-per-day`, label: "pro Tag", value: `${rateFormatter(values.perDay)} /Tag` },
      { key: `${metric}-weighted-trend`, label: "Trend", value: `${rateFormatter(values.trendPerDay)} /Tag` },
    ],
  };
}

function buildIntervalAriaLabel(interval: GuildTrendInterval, metric: GuildTrendChartMetric) {
  const values = getGuildTrendMetric(interval, metric);
  return `${formatDate(interval.start.scannedAtMs)} bis ${formatDate(interval.end.scannedAtMs)}, ${formatSignedNumber(values.perDay, metric === "xp" ? 0 : 2)} pro Tag`;
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("de-DE", { maximumFractionDigits });
}

function formatSignedNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("de-DE", { maximumFractionDigits })}`;
}

function formatCompactSignedAware(value: number | null | undefined, forceSign = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = forceSign || value < 0 ? (value > 0 ? "+" : "") : "";
  return `${sign}${new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function formatDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatAxisDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString("de-DE", { month: "2-digit", year: "2-digit" });
}

function formatDateTime(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDays(value: number) {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tage`;
}
