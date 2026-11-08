import { profileLocale, profileNumber, profileText } from "../../lib/i18n/profilePresentation";
import { auditGraphBegin, auditResultId, auditEnter, auditValue, auditAssociate, auditCount, auditFinish, auditObserveInputs } from "../../lib/data-hub/runtimeAudit";
import { useRuntimeAuditGraphCommit } from "../../lib/data-hub/useRuntimeAuditGraphCommit";
import React from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import type { DashboardProgressCoverage } from "../../pages/GuildHub/dashboardGuildComparison";
import { createPortal } from "react-dom";
import type { GuildTrendInterval, GuildTrendMetric } from "../../pages/Playground/playerPerformanceModel";
import type { GuildAnalyticsFusionMarker } from "../../lib/guilds/guildAnalyticsFusionMarkers";
import GuildFusionMarkerHint from "./GuildFusionMarkerHint";
import { guildTrendFusionPosition } from "./guildTrendFusionPosition";
import styles from "./GuildTrendChart.module.css";

export type GuildTrendChartMetric = "xp" | "base" | "baseMain" | "conBase" | "attrTotal" | "conTotal" | "total" | "mine" | "treasury";
type ChartMetrics<T> = Record<"xp" | "base", T> & Partial<Record<Exclude<GuildTrendChartMetric, "xp" | "base">, T>>;

export type GuildTrendChartInterval = Pick<GuildTrendInterval, "elapsedDays" | "fullDays"> & {
  start: Pick<GuildTrendInterval["start"], "snapshotId" | "scannedAtMs">;
  end: Pick<GuildTrendInterval["end"], "snapshotId" | "scannedAtMs">;
  xp: GuildTrendMetric | null; base: GuildTrendMetric | null;
} & Partial<Record<Exclude<GuildTrendChartMetric, "xp" | "base">, GuildTrendMetric | null>> & {
  observations?: ChartMetrics< { start: number | null; end: number | null }>;
  archiveSupplements?: readonly { observedAt: number; memberAt: number }[];
  coverage?: ChartMetrics< { start: DashboardProgressCoverage; end: DashboardProgressCoverage }>;
};

type GuildTrendChartProps = {
  intervals: GuildTrendChartInterval[];
  metric: GuildTrendChartMetric;
  selectedInterval?: GuildTrendChartInterval | null;
  title?: string;
  className?: string;
  emptyTitle?: string;
  emptyText?: string;
  showTrendInfo?: boolean;
  trendInfoTarget?: HTMLElement | null;
  legendInChart?: boolean;
  fitContainer?: boolean;
  animateBuild?: boolean;
  informationTarget?: HTMLElement | null;
  averageLabels?: boolean;
  fusionMarkers?: readonly GuildAnalyticsFusionMarker[];
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
const PLOT_LEFT = 52;
const PLOT_RIGHT = 48;
const BAR_GAP = 10;

export default function GuildTrendChart({
  intervals,
  metric,
  selectedInterval = null,
  title,
  className,
  emptyTitle,
  emptyText,
  showTrendInfo = false, trendInfoTarget,
  legendInChart = false,
  fitContainer = false,
  animateBuild = false,
  informationTarget, averageLabels = false, fusionMarkers,
}: GuildTrendChartProps) {
  const { t, i18n } = useTranslation();
  const hatchId = "guild-trend-partial-" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const faintHatchId = hatchId + "-faint";
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const [trendInfoOpen, setTrendInfoOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const chartWrapRef = React.useRef<HTMLDivElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ width: WIDTH, height: HEIGHT });
  const buildAnimations = React.useRef<Animation[]>([]);
  const previousContent = React.useRef<{ metric: GuildTrendChartMetric; fields: (number | null)[][] } | null>(null);
  const buildSequence = React.useRef(0);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!animateBuild || !root || !intervals.length) return;
    // Snapshot only the scalar fields actually drawn, never the scan/result
    // objects or publication IDs. Equal data in a new object stays still.
    const fields = intervals.map(interval => {
      const values = getGuildTrendMetric(interval, metric);
      return [interval.start.scannedAtMs, interval.end.scannedAtMs, values?.startAverage ?? null,
        values?.endAverage ?? null, values?.absoluteGrowth ?? null, values?.perDay ?? null, values?.trendPerDay ?? null];
    });
    const previous = previousContent.current;
    if (previous?.metric === metric && previous.fields.length === fields.length
      && fields.every((row, index) => row.every((value, field) => Object.is(value, previous.fields[index][field])))) return;
    previousContent.current = { metric, fields };
    buildAnimations.current.forEach(animation => animation.cancel());
    buildAnimations.current = [];
    root.dataset.guildChartBuild = String(++buildSequence.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Reuse the existing comparison chart's 750ms/ease-in-out timing.
    // All bars finish inside this one window, even with many intervals.
    const duration = 750;
    const staggerWindow = Math.min(150, Math.max(0, intervals.length - 1) * 50);
    const bars = root.querySelectorAll<SVGRectElement>("[data-guild-build-bar]");
    bars.forEach(bar => {
      const index = Number(bar.dataset.guildBuildBar);
      const delay = intervals.length > 1 ? index / (intervals.length - 1) * staggerWindow : 0;
      buildAnimations.current.push(bar.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
        { duration: duration - staggerWindow, delay, easing: "ease-in-out", fill: "both" }));
    });
    const paths = Array.from(root.querySelectorAll<SVGPathElement>("[data-guild-build-line]"));
    const lengths = paths.map(path => path.getTotalLength());
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let offset = 0;
    paths.forEach((path, index) => {
      const fraction = total ? lengths[index] / total : 1 / paths.length;
      buildAnimations.current.push(path.animate([
        { strokeDasharray: "1 1", strokeDashoffset: "1" },
        { strokeDasharray: "1 1", strokeDashoffset: "0" },
      ], { delay: offset * duration, duration: fraction * duration, easing: "linear", fill: "both" }));
      offset += fraction;
    });
  }, [animateBuild, intervals, metric]);
  React.useLayoutEffect(() => () => {
    buildAnimations.current.forEach(animation => animation.cancel());
  }, []);

  const hasIntervals = intervals.length > 0;
  const hasChartCoverage = intervals.some(interval => interval.coverage != null);
  React.useLayoutEffect(() => {
    const wrap = chartWrapRef.current;
    if ((!fitContainer && !hasChartCoverage) || !wrap || !hasIntervals) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width * 10) / 10;
      const height = Math.round(entry.contentRect.height * 10) / 10;
      if (width > 0 && height > 0) {
        setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      }
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [fitContainer, hasIntervals, hasChartCoverage]);
  // Matching the viewBox to the available area removes SVG letterboxing.
  const width = fitContainer ? size.width : WIDTH;
  const height = fitContainer ? size.height : HEIGHT;
  const plotTop = fitContainer ? 24 : PLOT_TOP;
  const plotBottom = fitContainer ? height - 26 : PLOT_BOTTOM;
  const plotHeight = plotBottom - plotTop;
  const plotLeft = fitContainer ? 12 : PLOT_LEFT;
  const plotRight = fitContainer ? 12 : PLOT_RIGHT;
  const axisLeft = fitContainer ? plotLeft : 48;
  const barGap = fitContainer ? Math.min(BAR_GAP, (width - plotLeft - plotRight) / Math.max(1, intervals.length * 3)) : BAR_GAP;
  const getIntervalX = (index: number, barWidth: number) => plotLeft + index * (barWidth + barGap);
  const getIntervalCenterX = (index: number, barWidth: number) => getIntervalX(index, barWidth) + barWidth / 2;
  const trendInfoId = React.useId();
  const metricName = t("dashboardTrend.metrics." + metric);
  const labels = { rateLegend: t("dashboardTrend.rateLegend", { metric: metricName }),
    trendLegend: t("dashboardTrend.trendLegend", { metric: metricName }),
    rightAxis: t("dashboardTrend.rateAxis", { metric: metricName }) };
  const metricLabels = averageLabels ? { rateLegend: "Ø " + labels.rateLegend, trendLegend: "Ø " + labels.trendLegend, rightAxis: "Ø " + labels.rightAxis } : labels;
  const activeInterval = activeIndex == null ? null : intervals[activeIndex] ?? null;
  const activeCoverage = activeInterval?.coverage?.[metric];
  const coverageNote = (interval: GuildTrendChartInterval) => {
    const pair = interval.coverage?.[metric];
    const hatching = getTrendHatching(interval, metric);
    return pair ? (["start", "end"] as const).map(end => t("dashboardTrend.coverage", {
      end: t("dashboardTrend." + end), date: formatDateTime(interval[end].scannedAtMs), used: pair[end].used, declared: pair[end].declared ?? "—",
    }) + (pair[end].reason ? " · " + t("dashboardCompare.excluded." + pair[end].reason, { used: pair[end].used, declared: pair[end].declared ?? "—", found: pair[end].found }) : pair[end].partial ? " · " + t("dashboardTrend.partial") : "")).join(" · ") + (hatching === "none" ? "" : " · " + t("dashboardTrend.hatchingDescription." + hatching)) + (interval.archiveSupplements?.map(supplement => " · " + t("dashboardTrend.archiveSupplement", {
      observed: formatDateTime(supplement.observedAt), members: formatDateTime(supplement.memberAt),
    })).join("") ?? "") : "";
  };
  const hasActiveInterval = activeInterval != null;
  const chartAudit = React.useMemo(() => intervals.length ? auditGraphBegin("F11", `guild-trend:${metric}`, auditResultId(intervals)) : null, [intervals, metric]);
  auditObserveInputs(chartAudit, [intervals]);
  const chartSpan = auditEnter(chartAudit, "chart-scale-points-tooltip", "sync-elapsed");
  const absoluteValues = intervals.flatMap((interval) => {
    const values = getGuildTrendMetric(interval, metric);
    return values ? [values.startAverage, values.endAverage] : [];
  });
  const dailyValues = intervals
    .flatMap((interval) => {
      const values = getGuildTrendMetric(interval, metric);
      return values ? [values.perDay, values.trendPerDay] : [];
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const absoluteMax = Math.max(1, ...absoluteValues.map((value) => Math.abs(value)));
  const barWidth = intervals.length
    ? Math.max(fitContainer ? 0 : 10, (width - plotLeft - plotRight - barGap * (intervals.length - 1)) / intervals.length)
    : 0;
  const rateScale = buildRateScale(dailyValues, plotTop, plotBottom);
  const trendPoints = buildTrendPoints(intervals, metric, { barWidth, gap: barGap, left: plotLeft, rateScale });
  const activeTooltip = activeInterval && getGuildTrendMetric(activeInterval, metric)
    ? buildTooltip(activeInterval, metric, getIntervalCenterX(activeIndex ?? 0, barWidth), rateScale.project(getGuildTrendMetric(activeInterval, metric)!.perDay), fitContainer ? { width, height } : undefined)
    : activeInterval ? { title: `${formatDate(activeInterval.start.scannedAtMs)} – ${formatDate(activeInterval.end.scannedAtMs)}`,
      leftPercent: 50, topPercent: 8, rows: [{ key: "interval-status", label: t("dashboardTrend.status"), value: t("dashboardTrend.excludedInterval") },
        ...(activeInterval.observations ? (["start", "end"] as const).map(end => ({ key: "observation-" + end, label: t(end === "start" ? "dashboardTrend.observedStart" : "dashboardTrend.observedEnd"), value: formatNumber(activeInterval.observations?.[metric]?.[end], metric === "xp" ? 0 : 2) })) : [])] } : null;


  React.useLayoutEffect(() => {
    const node = tooltipRef.current, wrap = chartWrapRef.current;
    if (!hasChartCoverage || informationTarget || !activeTooltip || !node || !wrap) return;
    // Fixed coverage hints cannot add scrollbars to a detail's scroll area.
    const position = () => {
      const bounds = wrap.getBoundingClientRect();
      node.style.maxWidth = `${Math.max(0, Math.min(bounds.width - 24, window.innerWidth - 16))}px`;
      const lower = Math.max(8, bounds.left + 12);
      const upper = Math.min(window.innerWidth - node.offsetWidth - 8, bounds.right - node.offsetWidth - 12);
      const anchor = bounds.left + bounds.width * activeTooltip.leftPercent / 100;
      node.style.left = `${Math.max(8, Math.min(upper, Math.max(lower, anchor - node.offsetWidth / 2)))}px`;
      node.style.top = `${Math.max(8, Math.min(window.innerHeight - node.offsetHeight - 8,
        bounds.top + bounds.height * activeTooltip.topPercent / 100 - 12))}px`;
    };
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [hasChartCoverage, informationTarget, activeTooltip]);

  auditValue(chartAudit, chartSpan, undefined);
  if (chartAudit) { auditAssociate(chartAudit, trendPoints); auditCount(chartAudit, "intervals", intervals.length); auditFinish(chartAudit); }
  useRuntimeAuditGraphCommit(intervals, intervals.length > 0, `guild-trend-geometry:${metric}`, rootRef, chartAudit?.id);
  const openTrendInfo = React.useCallback(() => {
    setActiveIndex(null);
    setTrendInfoOpen(true);
  }, []);

  const closeTrendInfo = React.useCallback(() => {
    setTrendInfoOpen(false);
  }, []);

  const scrollTrendInfo = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const popup = hasChartCoverage && trendInfoOpen ? document.getElementById(trendInfoId) : null;
    if (!popup || popup.scrollHeight <= popup.clientHeight) return;
    const step = event.key === "ArrowDown" ? 40 : event.key === "ArrowUp" ? -40
      : event.key === "PageDown" ? popup.clientHeight * .8 : event.key === "PageUp" ? -popup.clientHeight * .8 : null;
    if (step == null) return;
    event.preventDefault();
    popup.scrollTop += step;
  };

  React.useEffect(() => {
    setTrendInfoOpen(false);
    setActiveIndex(null);
  }, [metric]);

  React.useEffect(() => {
    if (!trendInfoOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && (rootRef.current?.contains(event.target) || trendInfoTarget?.contains(event.target))) return;
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
  }, [trendInfoOpen, trendInfoTarget]);

  if (!intervals.length) {
    return (
      <div className={`${styles.chartRoot} ${fitContainer ? styles.fitContainer : ""} ${className ?? ""}`}>
        <div className={styles.emptyState}>
          <strong>{emptyTitle ?? t("profileI18n.noGuildHistory")}</strong>
          <span>{emptyText ?? t("profileI18n.twoScansNeeded")}</span>
        </div>
      </div>
    );
  }

  const tooltip = activeTooltip ? (
    <div
      ref={tooltipRef}
      className={informationTarget ? styles.separateInformation : styles.tooltip}
      data-trend-values
      style={informationTarget ? undefined : {
        position: hasChartCoverage ? "fixed" : undefined,
        transform: hasChartCoverage ? "none" : undefined,
        // Coverage text uses the rendered width, including a narrow detail view.
        left: `${hasChartCoverage ? Math.max((Math.min(260, size.width - 24) / 2 + 12) / size.width * 100,
          Math.min(100 - (Math.min(260, size.width - 24) / 2 + 12) / size.width * 100, activeTooltip.leftPercent)) : activeTooltip.leftPercent}%`,
        boxSizing: hasChartCoverage ? "border-box" : undefined,
        top: `${activeTooltip.topPercent}%`,
      }}
    >
      <strong>{activeTooltip.title}</strong>
      <dl>
        {activeTooltip.rows.map((row) => (
          <React.Fragment key={row.key}>
            <dt>{averageLabels && row.key.startsWith(metric + "-") ? "Ø " : ""}{t("dashboardTrend.fields." + row.key.replace(metric + "-", ""), { defaultValue: row.label })}</dt>
            <dd>{row.value.replace("/Tag", t("dashboardTrend.perDayUnit")).replace("Tage", t("dashboardTrend.daysUnit"))}</dd>
          </React.Fragment>
        ))}
      </dl>
      {activeCoverage && <p data-trend-coverage>{coverageNote(activeInterval!)}</p>}
    </div>
  ) : null;

  const legendInfoButton = <button type="button" className={styles.legendInfoButton}
        aria-label={t("dashboardTrend.legendTitle", { metric: metricName })}
        aria-expanded={trendInfoOpen} aria-controls={trendInfoOpen ? trendInfoId : undefined}
        onClick={() => { setActiveIndex(null); setTrendInfoOpen(open => !open); }}
        onKeyDown={scrollTrendInfo}
        onBlur={closeTrendInfo}>i</button>;

  return (
    <div
      ref={rootRef}
      className={`${styles.chartRoot} ${fitContainer ? styles.fitContainer : ""} ${legendInChart ? styles.inChartLegend : ""} ${className ?? ""}`}
      onMouseLeave={() => setActiveIndex(null)}
    >
      {!legendInChart && <div className={styles.legend} aria-label={t("guildHistory.legend")}>
        <span><i className={styles.legendBar} />{t("dashboardTrend.guildStand")}</span>
        <span><i className={styles.legendGrowth} />{t("dashboardTrend.growthLoss")}</span>
        <span><i className={styles.legendPoint} />{metricLabels.rateLegend}</span>
        <span className={styles.legendTrendItem}>
          <i className={styles.legendTrend} />{metricLabels.trendLegend}
          {showTrendInfo ? (
            <button
              type="button"
              className={styles.legendInfoButton}
              aria-label={t("dashboardTrend.legendTitle", { metric: metricName })}
              aria-describedby={trendInfoOpen ? trendInfoId : undefined}
              aria-expanded={trendInfoOpen}
              onMouseEnter={openTrendInfo}
              onMouseLeave={closeTrendInfo}
              onFocus={openTrendInfo}
              onKeyDown={scrollTrendInfo}
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
      </div>}
      {legendInChart && (trendInfoTarget ? createPortal(legendInfoButton, trendInfoTarget) : legendInfoButton)}
      {(showTrendInfo || legendInChart) && trendInfoOpen ? (
        <div id={trendInfoId} className={styles.infoPopup} role={legendInChart ? "region" : "tooltip"} aria-label={legendInChart ? t("guildHistory.legend") : undefined}>
          {legendInChart && <>
            <div className={styles.legend}>
              <span><i className={styles.legendBar} />{t("dashboardTrend.guildStand")}</span>
              <span><i className={styles.legendGrowth} />{t("dashboardTrend.growthLoss")}</span>
              <span><i className={styles.legendPoint} />{metricLabels.rateLegend}</span>
              <span><i className={styles.legendTrend} />{metricLabels.trendLegend}</span>
            </div>
            <p>{t("dashboardTrend.metricHelp", { metric: metricName })}</p>
          </>}
          {hasChartCoverage && <div className={styles.coverageHelp} data-trend-coverage-help>
            {(["normal", "faint", "none"] as const).map(state => <div key={state} className={styles.coverageLegendItem} data-trend-legend-state={state}>
              <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
                <rect className={styles.guildStandBar} width="28" height="20" rx="3" />
                {state !== "none" && <rect width="28" height="20" rx="3" fill={`url(#${state === "normal" ? hatchId : faintHatchId})`} />}
              </svg>
              <p><strong>{t("dashboardTrend.hatchingLabel." + state)}</strong>{t("dashboardTrend.hatchingDescription." + state)}</p>
            </div>)}
            <p>{t("dashboardTrend.hatching")}</p>
          </div>}
          {intervals.some(interval => interval.archiveSupplements?.length) && <p data-trend-archive-help>{t("dashboardTrend.archiveSupplementHelp")}</p>}
          <strong>{metricLabels.trendLegend}</strong>
          <p>{t("dashboardTrend.weightedHelp")}</p>
        </div>
      ) : null}
      <div ref={chartWrapRef} className={styles.chartWrap}>
        <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? t("guildChartDetails.trend")}>
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V6" stroke="#e5f3ff" strokeOpacity=".75" strokeWidth="1.5" /></pattern>
            <pattern id={faintHatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V6" stroke="#e5f3ff" strokeOpacity=".24" strokeWidth="1.5" /></pattern>
          </defs>
          <line className={styles.chartBaseline} x1={axisLeft} y1={plotBottom} x2={width - plotRight} y2={plotBottom} />
          <line className={styles.chartZeroLine} x1={axisLeft} y1={rateScale.zeroY} x2={width - plotRight} y2={rateScale.zeroY} />
          <text className={styles.chartScaleLabel} x={axisLeft} y="18">{t("profileI18n.absolute")}</text>
          <text className={styles.chartScaleLabel} x={width - plotRight - (legendInChart ? 30 : 0)} y="18" textAnchor="end">{metricLabels.rightAxis}</text>
          {intervals.map((interval, index) => {
            const values = getGuildTrendMetric(interval, metric);
            if (!values) return null;
            const x = getIntervalX(index, barWidth);
            const yStart = absoluteY(values.startAverage, absoluteMax, plotTop, plotHeight);
            const yEnd = absoluteY(values.endAverage, absoluteMax, plotTop, plotHeight);
            const lower = Math.min(values.startAverage, values.endAverage);
            const upper = Math.max(values.startAverage, values.endAverage);
            const yUpper = absoluteY(upper, absoluteMax, plotTop, plotHeight);
            const yLower = absoluteY(lower, absoluteMax, plotTop, plotHeight);
            const hatching = getTrendHatching(interval, metric);
            const partial = hatching !== "none";
            const intervalHatchId = hatching === "faint" ? faintHatchId : hatchId;
            const selected = selectedInterval ? isIntervalInPeriod(interval, selectedInterval) : false;
            const active = activeIndex === index;
            const dimmed = hasActiveInterval && !active;


            return (
              <g key={`${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`} data-dimmed={dimmed} data-trend-interval={index} data-trend-partial={partial || undefined} data-trend-hatch-state={hatching}>
                <rect
                  className={styles.guildStandBar}
                  data-guild-build-bar={animateBuild ? index : undefined}
                  style={animateBuild ? { transformOrigin: `0px ${plotBottom}px`, transformBox: "view-box" } : undefined}
                  data-highlighted={selected || active}
                  x={x}
                  y={values.absoluteGrowth < 0 ? yEnd : yStart}
                  width={barWidth}
                  height={Math.max(0, plotBottom - (values.absoluteGrowth < 0 ? yEnd : yStart))}
                  rx="3"
                />
                {partial && <rect data-trend-hatching="stand" data-guild-build-bar={animateBuild ? index : undefined}
                  style={animateBuild ? { transformOrigin: `0px ${plotBottom}px`, transformBox: "view-box" } : undefined}
                  x={x} y={values.absoluteGrowth < 0 ? yEnd : yStart} width={barWidth}
                  height={Math.max(0, plotBottom - (values.absoluteGrowth < 0 ? yEnd : yStart))} rx="3" fill={`url(#${intervalHatchId})`} pointerEvents="none" />}
                {values.absoluteGrowth !== 0 ? (
                  <rect
                    className={styles.guildGrowthBar}
                    data-guild-build-bar={animateBuild ? index : undefined}
                    style={animateBuild ? { transformOrigin: `0px ${yStart}px`, transformBox: "view-box" } : undefined}
                    data-direction={values.absoluteGrowth > 0 ? "positive" : "negative"}
                    data-active={active}
                    x={x}
                    y={yUpper}
                    width={barWidth}
                    height={Math.max(0, yLower - yUpper)}
                  />
                ) : null}
                {partial && values.absoluteGrowth !== 0 && <rect data-trend-hatching="growth" data-guild-build-bar={animateBuild ? index : undefined}
                  style={animateBuild ? { transformOrigin: `0px ${yStart}px`, transformBox: "view-box" } : undefined}
                  x={x} y={yUpper} width={barWidth} height={Math.max(0, yLower - yUpper)} fill={`url(#${intervalHatchId})`} pointerEvents="none" />}
                <line className={styles.guildStartMarker} x1={x} x2={x + barWidth} y1={yStart} y2={yStart} />
                <line className={styles.guildEndMarker} x1={x} x2={x + barWidth} y1={yEnd} y2={yEnd} />

              </g>
            );
          })}
          {intervals.map((interval, index) => {
            // A rejected pair keeps its real dated slot. Its label opens coverage
            // information only; no bar, measurement point or plot hit is created.
            const datedCoverage = Boolean(interval.coverage);
            const visible = shouldShowXAxisLabel(index, intervals.length, fitContainer
              ? Math.max(2, Math.floor((width - plotLeft - plotRight) / (datedCoverage ? 45 : 58))) : undefined);
            if (!visible) return null;
            const missing = !getGuildTrendMetric(interval, metric);
            const label = datedCoverage ? new Date(interval.end.scannedAtMs).toLocaleDateString(i18n.resolvedLanguage ?? "en", { day: "2-digit", month: "2-digit" }) : formatAxisDate(interval.end.scannedAtMs);
            const select = () => { setTrendInfoOpen(false); setActiveIndex(index); };
            return <text key={`guild-date-${index}`} className={styles.chartLabel} data-trend-date={interval.end.scannedAtMs}
              data-interval-available={!missing} x={fitContainer ? Math.max(plotLeft + 20, Math.min(width - plotRight - 20, getIntervalCenterX(index, barWidth))) : getIntervalCenterX(index, barWidth)}
              y={height - (fitContainer ? 10 : 14)} textAnchor="middle" tabIndex={missing ? 0 : undefined} role={missing ? "button" : undefined}
              aria-label={missing ? label + " · " + t("dashboardTrend.excludedInterval") + " · " + coverageNote(interval) : undefined}
              onMouseEnter={missing ? select : undefined} onFocus={missing ? select : undefined} onClick={missing ? select : undefined}
              onKeyDown={missing ? event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } } : undefined}
              onBlur={missing ? () => setActiveIndex(null) : undefined}>
              {label}{missing && <title>{t("dashboardTrend.excludedInterval") + " · " + coverageNote(interval)}</title>}
            </text>;
          })}
          {buildTrendSegments(trendPoints).map((segment) => {
            const active = activeIndex === segment.from.index || activeIndex === segment.to.index;
            return (
              <path
                key={`guild-trend-${segment.from.index}-${segment.to.index}`}
                className={styles.trendLine}
                data-guild-build-line={animateBuild || undefined}
                pathLength={animateBuild ? 1 : undefined}
                data-active={active}
                data-dimmed={hasActiveInterval && !active}
                d={buildTrendSegmentPath(segment.from, segment.to)}
              />
            );
          })}
          {intervals.map((interval, index) => {
            const values = getGuildTrendMetric(interval, metric);
            if (!values) return null;
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
          {fusionMarkers?.map(marker => {
            const x = guildTrendFusionPosition(intervals, marker.timestampMs, plotLeft, barWidth, barGap);
            return x == null ? null : <g key={marker.key} data-fusion-marker={marker.eventId}>
              <line className={styles.fusionLine} x1={x} x2={x} y1={plotTop} y2={plotBottom} />
              <foreignObject x={x - 8} y={plotTop - 20} width={16} height={16} style={{ overflow: "visible" }}><GuildFusionMarkerHint marker={marker} /></foreignObject>
            </g>;
          })}
          {intervals.map((interval, index) => {
            if (!getGuildTrendMetric(interval, metric)) return null;
            const x = getIntervalX(index, barWidth);
            return (
              <rect
                key={`guild-hit-${interval.start.snapshotId}-${interval.end.snapshotId}-${index}`}
                className={styles.intervalHitArea}
                x={Math.max(axisLeft, x - barGap / 2)}
                y={plotTop}
                width={fitContainer ? Math.min(width - plotRight - Math.max(axisLeft, x - barGap / 2), barWidth + barGap) : barWidth + barGap}
                height={plotBottom - plotTop}
                tabIndex={0}
                role="button"
                aria-label={buildIntervalAriaLabel(interval, metric) + " · " + coverageNote(interval)}
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
        {tooltip && (informationTarget ? createPortal(tooltip, informationTarget) : tooltip)}
      </div>
    </div>
  );
}

// Building averages grow slowly; retain small positive daily gains as such.
export const guildTrendRateDigits = (metric: GuildTrendChartMetric) => metric === "mine" || metric === "treasury" ? 6 : 2;

export function getGuildTrendMetric(interval: GuildTrendChartInterval, metric: GuildTrendChartMetric): GuildTrendMetric | null {
  return interval[metric] ?? null;
}

// Coverage belongs to the actual metric endpoints, never the preceding bar.
function getTrendHatching(interval: GuildTrendChartInterval, metric: GuildTrendChartMetric): "normal" | "faint" | "none" {
  if (!getGuildTrendMetric(interval, metric)) return "none";
  const pair = interval.coverage?.[metric];
  return pair?.end.partial ? "normal" : pair?.start.partial ? "faint" : "none";
}

function buildTrendPoints(
  intervals: GuildTrendChartInterval[],
  metric: GuildTrendChartMetric,
  scale: { barWidth: number; gap: number; left: number; rateScale: RateScale },
) {
  return intervals
    .map((interval, index): TrendPoint | null => {
      const value = getGuildTrendMetric(interval, metric)?.trendPerDay;
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return {
        index,
        x: scale.left + index * (scale.barWidth + scale.gap) + scale.barWidth / 2,
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

function isIntervalInPeriod(interval: GuildTrendChartInterval, selectedInterval: GuildTrendChartInterval) {
  return (
    interval.start.scannedAtMs >= selectedInterval.start.scannedAtMs &&
    interval.end.scannedAtMs <= selectedInterval.end.scannedAtMs
  );
}

function shouldShowXAxisLabel(index: number, total: number, visibleCount?: number) {
  if (visibleCount != null) {
    if (total <= visibleCount) return true;
    return Array.from({ length: visibleCount }, (_, slot) => Math.round(slot * (total - 1) / (visibleCount - 1))).includes(index);
  }
  if (total <= 12) return true;
  const step = Math.ceil(total / 8);
  return index === total - 1 || index % step === 0;
}

function buildTooltip(interval: GuildTrendChartInterval, metric: GuildTrendChartMetric, x: number, y: number, size?: { width: number; height: number }) {
  const width = size?.width ?? WIDTH;
  const height = size?.height ?? HEIGHT;
  const tooltipHalfWidth = Math.min(130, width / 2);
  const values = getGuildTrendMetric(interval, metric);
  if (!values) return null;
  const digits = metric === "xp" ? 0 : 2;
  const valueFormatter = metric === "xp" ? formatCompactSignedAware : (value: number | null | undefined) => formatNumber(value, digits);
  const rateFormatter = metric === "xp" ? formatCompactSignedAware : (value: number | null | undefined) => formatSignedNumber(value, guildTrendRateDigits(metric));
  return {
    title: `${formatDate(interval.start.scannedAtMs)} - ${formatDate(interval.end.scannedAtMs)}`,
    leftPercent: size ? Math.max(tooltipHalfWidth / width * 100, Math.min(100 - tooltipHalfWidth / width * 100, (x / width) * 100)) : Math.max(15, Math.min(85, (x / WIDTH) * 100)),
    topPercent: Math.max(8, Math.min(72, (y / height) * 100)),
    rows: [
      { key: "period-start", label: profileText("dashboardTrend.fields.period-start"), value: formatDateTime(interval.start.scannedAtMs) },
      { key: "period-end", label: profileText("dashboardTrend.fields.period-end"), value: formatDateTime(interval.end.scannedAtMs) },
      { key: "period-duration", label: profileText("dashboardTrend.fields.period-duration"), value: formatDays(interval.elapsedDays) },
      { key: `${metric}-metric-start`, label: profileText("dashboardTrend.fields.metric-start"), value: valueFormatter(values.startAverage) },
      { key: `${metric}-metric-end`, label: profileText("dashboardTrend.fields.metric-end"), value: valueFormatter(values.endAverage) },
      { key: `${metric}-metric-growth`, label: profileText("dashboardTrend.fields.metric-growth"), value: metric === "xp" ? formatCompactSignedAware(values.absoluteGrowth, true) : formatSignedNumber(values.absoluteGrowth, digits) },
      { key: `${metric}-rate-per-day`, label: profileText("dashboardTrend.fields.rate-per-day"), value: `${rateFormatter(values.perDay)} ${profileText("dashboardTrend.perDayUnit")}` },
      { key: `${metric}-weighted-trend`, label: profileText("dashboardTrend.fields.weighted-trend"), value: `${rateFormatter(values.trendPerDay)} ${profileText("dashboardTrend.perDayUnit")}` },
    ],
  };
}

function buildIntervalAriaLabel(interval: GuildTrendChartInterval, metric: GuildTrendChartMetric) {
  const values = getGuildTrendMetric(interval, metric);
  return `${formatDate(interval.start.scannedAtMs)} – ${formatDate(interval.end.scannedAtMs)}, ${formatSignedNumber(values?.perDay, metric === "xp" ? 0 : guildTrendRateDigits(metric))} ${profileText("dashboardTrend.perDayUnit")}`;
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString(profileLocale(), { maximumFractionDigits });
}

function formatSignedNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(profileLocale(), { maximumFractionDigits })}`;
}

function formatCompactSignedAware(value: number | null | undefined, forceSign = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = forceSign || value < 0 ? (value > 0 ? "+" : "") : "";
  return `${sign}${new Intl.NumberFormat(profileLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

function formatDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString(profileLocale(), { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatAxisDate(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString(profileLocale(), { month: "2-digit", year: "2-digit" });
}

function formatDateTime(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return new Date(value).toLocaleString(profileLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDays(value: number) {
  return profileNumber(value, { style: "unit", unit: "day", unitDisplay: "long", maximumFractionDigits: 1 });
}
