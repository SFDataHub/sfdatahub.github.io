import { profileLocale, profileDateTime } from "../../../lib/i18n/profilePresentation";
import { useProfileTranslation as useTranslation } from "../../../lib/i18n/useProfileTranslation";
import { auditGraphBegin, auditResultId, auditCall, auditReturn, auditLeave, associateAuditResultId, auditFields, auditLink, auditEnabled, auditDependencyId, type AuditFields } from "../../../lib/data-hub/runtimeAudit";
import { useRuntimeAuditGraphCommit } from "../../../lib/data-hub/useRuntimeAuditGraphCommit";
import React, { useMemo, useId } from "react";
import { projectChartGaps, type GapChartScanPoint } from "./anchoredLineChartGaps";
export type { GapChartScanPoint } from "./anchoredLineChartGaps";

export type AnchoredLineChartSeries = {
  key: string;
  label: string;
  points: number[];
  timePoints?: AnchoredLineChartTimePoint[];
  color?: string;
  prominent?: boolean;
};

export type AnchoredLineChartTimePoint = {
  timestampMs: number;
  observationKey?: string;
  partial?: boolean;
  note?: string;
  value: number | null;
  tooltipIndex?: number;
  color?: string;
};

export type AnchoredLineChartTimeDomain = {
  startMs: number;
  endMs: number;
};

export type AnchoredLineChartTimeTick = {
  timestampMs: number;
  label: string;
};

export type AnchoredLineChartVerticalMarker = {
  hint?: React.ReactNode;
  key: string;
  timestampMs: number;
  label?: string;
  description?: string;
  tooltipIndex?: number;
};

type AnchoredLineChartProps = {
  progressStyle?: boolean;
  showMissingObservations?: boolean;
  rankAxis?: boolean;
  initialSize?: { width: number; height: number };
  showMissingConnections?: boolean;
  showScanPoints?: boolean;
  connectMissingValues?: boolean;
  hideMissingScanPoints?: boolean;
  onHoverScanPointChange?: (point: GapChartScanPoint | null) => void;
  onScanPointSelect?: (point: GapChartScanPoint) => void;
  scanPointLabel?: (point: GapChartScanPoint) => string;
  isPartialScanPoint?: (point: GapChartScanPoint) => boolean;
  auditContext?: AuditFields;
  auditInput?: object;
  auditArea?: string;
  auditFamily?: import("../../../lib/data-hub/runtimeAudit").AuditFamily;
  points: number[];
  series?: AnchoredLineChartSeries[];
  timeDomain?: AnchoredLineChartTimeDomain | null;
  timeTicks?: AnchoredLineChartTimeTick[];
  verticalMarkers?: AnchoredLineChartVerticalMarker[];
  avgValue?: number | null;
  showAvg?: boolean;
  showFill?: boolean;
  showDots?: boolean;
  showXLabels?: boolean;
  className?: string;
  dotTooltips?: React.ReactNode[];
  xLabels?: string[];
  yValueFormatter?: (value: number) => string;
  semanticKey?: string;
  highlightedSeriesKeys?: readonly string[];
  emphasizedSeriesKeys?: readonly string[];
  onHoverSeriesKeyChange?: (seriesKey: string | null) => void;
};

const FALLBACK_CHART_WIDTH = 600;
const FALLBACK_CHART_HEIGHT = 300;

const PLOT_LEFT = 68;
const PLOT_RIGHT_PADDING = 40;
const PLOT_TOP = 40;
const PLOT_BOTTOM_PADDING = 40;
const DEFAULT_LINE_COLOR = "#55dba6";
const HIT_RADIUS_PX = 16;
const CLUSTER_RADIUS_PX = 10;
const CHART_ANIMATION_DURATION_MS = 750;
const DOT_REVEAL_FADE_DISTANCE_PX = 18;

type YDomain = {
  min: number;
  max: number;
};

type AnchoredLineGradient = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  startColor: string;
  endColor: string;
};

type AnchoredLinePath = {
  key: string;
  seriesKey: string;
  path: string;
  color: string;
  prominent: boolean;
  opacity: number;
  drawProgress: number;
  partial?: boolean;
  gradient?: AnchoredLineGradient;
};

type AnchoredLineSegment = {
  path: string;
  color: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  segmentStartDistance: number;
  segmentLength: number;
  runTotalLength: number;
  partial?: boolean;
  gradient?: AnchoredLineGradient;
};

type AnchoredLineChartGeometry = {
  seriesGeometries: AnchoredLineSeriesGeometry[];
  areaPath: string;
  dots: ProjectedChartPoint[];
  avgY: number | null;
  labels: { x: number; text: string }[];
  gridX: number[];
  yTicks: { value: number; y: number; label: string }[];
  verticalMarkers: ProjectedVerticalMarker[];
};

type AnchoredLineSeriesGeometry = {
  key: string;
  renderKey: string;
  color: string;
  prominent: boolean;
  coords: ProjectedChartCoord[];
  opacity: number;
  drawProgress: number;
};

type ProjectedChartPoint = {
  pointKey: string;
  timestampMs?: number;
  observationKey?: string;
  partial?: boolean;
  note?: string;
  x: number;
  y: number;
  value: number;
  color: string;
  tooltipIndex: number;
  seriesKey: string;
  seriesLabel: string;
  prominent: boolean;
  opacity: number;
};

type ProjectedChartCoord =
  | ProjectedChartPoint
  | { pointKey: string; timestampMs?: number; observationKey?: string; seriesLabel?: string; partial?: boolean; note?: string; x: number; y: null; color: string; opacity: number };

type HoverState = {
  x: number;
  y: number;
  points: ProjectedChartPoint[];
  tooltipIndexes: number[];
};

type ProjectedVerticalMarker = {
  hint?: React.ReactNode;
  key: string;
  x: number;
  description?: string;
  tooltipIndex?: number;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const defaultYValueFormatter = (value: number) => {
  const rounded = Math.round(value);
  if (Math.abs(value) >= 100000) return `${new Intl.NumberFormat(profileLocale()).format(Math.round(value / 1000))}k`;
  if (Math.abs(value - rounded) < 0.05) return new Intl.NumberFormat(profileLocale()).format(rounded);
  return new Intl.NumberFormat(profileLocale(), { maximumFractionDigits: 1 }).format(value);
};

export function AnchoredLineChart({
  initialSize, progressStyle = false, showMissingObservations = false, rankAxis = false,
  showMissingConnections = false, showScanPoints = showMissingConnections, connectMissingValues = false, hideMissingScanPoints = false, onScanPointSelect, onHoverScanPointChange, scanPointLabel, isPartialScanPoint,
  points,
  series,
  avgValue = null,
  showAvg = true,
  showFill = true,
  showDots = true,
  showXLabels = true,
  className,
  dotTooltips,
  xLabels,
  timeDomain,
  timeTicks,
  verticalMarkers,
  yValueFormatter = defaultYValueFormatter,
  semanticKey,
  highlightedSeriesKeys,
  emphasizedSeriesKeys,
  onHoverSeriesKeyChange,
  auditInput, auditArea, auditContext, auditFamily = "F13",
}: AnchoredLineChartProps) {
  const { t } = useTranslation();
  const gradientId = useId();
  const lineGradientBaseId = `anchored-line-${sanitizeSvgId(useId())}`;
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const previousMemoDependencies = React.useRef<AuditFields>();
  const [chartSize, setChartSize] = React.useState(initialSize ?? { width: FALLBACK_CHART_WIDTH, height: FALLBACK_CHART_HEIGHT });
  const [hover, setHover] = React.useState<HoverState | null>(null);
  const chartWidth = Math.max(1, chartSize.width);
  const chartHeight = Math.max(1, chartSize.height);
  const plotRight = Math.max(PLOT_LEFT + 1, chartWidth - PLOT_RIGHT_PADDING);
  const plotBottom = Math.max(PLOT_TOP + 1, chartHeight - PLOT_BOTTOM_PADDING);
  const plotWidth = plotRight - PLOT_LEFT;
  const plotHeight = plotBottom - PLOT_TOP;
  const chartSeries = useMemo<AnchoredLineChartSeries[]>(
    () =>
      series?.length
        ? series
        : [{ key: "value", label: t("guildChartDetails.value"), points, color: DEFAULT_LINE_COLOR }],
    [points, series, t],
  );
  const isTimeSeries = Boolean(timeDomain && chartSeries.some((entry) => entry.timePoints?.length));
  const pointCount = Math.max(...chartSeries.map((entry) => (isTimeSeries ? entry.timePoints?.length ?? 0 : entry.points.length)), 0);
  const isMultiSeries = Boolean(series?.length);
  const autoYDomain = useMemo(
    () => buildAutoYDomain(chartSeries, isTimeSeries, showAvg && !isMultiSeries ? avgValue : null),
    [chartSeries, isTimeSeries, showAvg, isMultiSeries, avgValue],
  );
  const currentYDomain = useMemo(() => rankAxis
    ? { min: Math.max(1, Math.floor(autoYDomain.min)), max: Math.max(2, Math.ceil(autoYDomain.max)) }
    : autoYDomain, [autoYDomain, rankAxis]);

  React.useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return undefined;

    const updateSize = (width: number, height: number) => {
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      setChartSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) return current;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateSize(node.clientWidth || FALLBACK_CHART_WIDTH, node.clientHeight || FALLBACK_CHART_HEIGHT);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    setHover(null);
  }, [chartWidth, chartHeight]);

  const targetGeometry = useMemo<AnchoredLineChartGeometry>(() => {
    const graphAudit = auditArea ? auditGraphBegin(auditFamily, auditArea, auditResultId(auditInput)) : null;
    auditFields(graphAudit, { seriesCount: chartSeries.length,
      passedDataPoints: chartSeries.reduce((count, row) => count + (row.timePoints?.length ?? row.points.length), 0),
      observedDataPoints: chartSeries.reduce((count, row) => count + (row.timePoints?.filter(point => point.value != null).length ?? row.points.length), 0) });
    if (graphAudit && auditEnabled()) {
      // Only scalar values and WeakMap identities, never retained chart inputs.
      const dependencies: AuditFields = { pointCount, chartSeries: auditDependencyId(chartSeries), timeDomain: auditDependencyId(timeDomain), timeTicks: auditDependencyId(timeTicks), verticalMarkers: auditDependencyId(verticalMarkers), formatter: auditDependencyId(yValueFormatter), plotWidth, plotHeight, avgValue, showAvg, showDots, xLabels: auditDependencyId(xLabels), yDomain: auditDependencyId(currentYDomain) };
      const changed = previousMemoDependencies.current ? Object.keys(dependencies).filter(key => !Object.is(dependencies[key], previousMemoDependencies.current![key])).join(",") : "first-geometry";
      previousMemoDependencies.current = dependencies;
      auditFields(graphAudit, { ...auditContext, graphInputResultId: auditResultId(auditInput), graphInputDependencyId: auditDependencyId(auditInput), memoChangedDependencies: changed || "other-existing-dependency; unknown", memoFormatterId: dependencies.formatter });
      if (typeof auditContext?.notificationStoreRunId === "string") auditLink(graphAudit, auditContext.notificationStoreRunId, "notification-input");
    }
    try { return auditReturn(graphAudit, auditCall(graphAudit, "graph-geometry", () => {
    const emptyYTicks = buildYTicks(currentYDomain, yValueFormatter, plotBottom, rankAxis);
    const defaultGridX = buildDefaultGridX(plotRight);
    if (!pointCount) {
      return {
        seriesGeometries: [] as AnchoredLineSeriesGeometry[],
        areaPath: "",
        dots: [] as ProjectedChartPoint[],
        avgY: null as number | null,
        labels: [] as { x: number; text: string }[],
        gridX: defaultGridX,
        yTicks: emptyYTicks,
        verticalMarkers: [],
      };
    }

    if (currentYDomain.max <= currentYDomain.min) {
      return {
        seriesGeometries: [] as AnchoredLineSeriesGeometry[],
        areaPath: "",
        dots: [] as ProjectedChartPoint[],
        avgY: null as number | null,
        labels: [] as { x: number; text: string }[],
        gridX: defaultGridX,
        yTicks: emptyYTicks,
        verticalMarkers: [],
      };
    }

    const { min, max } = currentYDomain;
    const range = Math.max(1e-9, max - min);
    const yTicks = buildYTicks(currentYDomain, yValueFormatter, plotBottom, rankAxis);

    const scaleX = (idx: number) =>
      pointCount > 1 ? PLOT_LEFT + (idx / (pointCount - 1)) * plotWidth : PLOT_LEFT;
    const safeDomain = timeDomain && timeDomain.endMs > timeDomain.startMs ? timeDomain : null;
    const scaleTimeX = (timestampMs: number) =>
      safeDomain
        ? PLOT_LEFT + clamp((timestampMs - safeDomain.startMs) / (safeDomain.endMs - safeDomain.startMs), 0, 1) * plotWidth
        : PLOT_LEFT + plotWidth / 2;
    const projectedVerticalMarkers: ProjectedVerticalMarker[] =
      isTimeSeries && safeDomain
        ? (verticalMarkers ?? []).flatMap((marker) => {
            if (
              !Number.isFinite(marker.timestampMs) ||
              marker.timestampMs < safeDomain.startMs ||
              marker.timestampMs > safeDomain.endMs
            ) {
              return [];
            }
            const x = scaleTimeX(marker.timestampMs);
            return [
              {
                key: marker.key,
                hint: marker.hint,
                x,
                description: marker.description,
                tooltipIndex: marker.tooltipIndex,
              },
            ];
          })
        : [];
    const scaleY = (v: number) => clamp(PLOT_TOP + (rankAxis ? (v - min) / range : 1 - (v - min) / range) * plotHeight, PLOT_TOP, plotBottom);
    const projectPoint = (
      x: number,
      value: number | null,
      fallbackTooltipIndex: number,
      entry: AnchoredLineChartSeries,
      pointKey: string,
      color?: string,
    ): ProjectedChartCoord => {
      const pointColor = color ?? entry.color ?? DEFAULT_LINE_COLOR;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return { pointKey, x, y: null, color: pointColor, opacity: 1, seriesLabel: entry.label };
      }
      return {
        pointKey,
        x,
        y: scaleY(value),
        value,
        tooltipIndex: fallbackTooltipIndex,
        color: pointColor,
        seriesKey: entry.key,
        seriesLabel: entry.label,
        prominent: Boolean(entry.prominent),
        opacity: 1,
      };
    };

    if (isTimeSeries) {
      const seriesGeometries = chartSeries.map((entry) => ({
        key: entry.key,
        renderKey: entry.key,
        color: entry.color ?? DEFAULT_LINE_COLOR,
        prominent: Boolean(entry.prominent),
        coords: (entry.timePoints ?? []).map((point, idx): ProjectedChartCoord => ({
          ...projectPoint(scaleTimeX(point.timestampMs), point.value, point.tooltipIndex ?? idx, entry,
            point.observationKey ? JSON.stringify([point.timestampMs, point.observationKey]) : String(point.timestampMs), point.color),
          timestampMs: point.timestampMs, observationKey: point.observationKey, partial: point.partial, note: point.note,
        })),
        opacity: 1,
        drawProgress: 1,
      }));
      const dots = showDots
        ? seriesGeometries.flatMap((entry) =>
            entry.coords
              .filter((coord): coord is ProjectedChartPoint => coord.y != null)
              .map((coord) => ({ ...coord, color: coord.color })),
          )
        : [];
      const avgY = !isMultiSeries && showAvg && avgValue != null ? scaleY(avgValue) : null;
      const labels = (timeTicks ?? []).map((tick) => ({ x: scaleTimeX(tick.timestampMs), text: tick.label }));
      const gridX = labels.length ? labels.map((label) => label.x) : defaultGridX;

      return { seriesGeometries, areaPath: "", dots, avgY, labels, gridX, yTicks, verticalMarkers: projectedVerticalMarkers };
    }

    if (pointCount === 1) {
      const x0 = PLOT_LEFT;
      const x1 = PLOT_LEFT + plotWidth * 0.1;
      const firstSeries = chartSeries[0];
      const y = scaleY(firstSeries.points[0] ?? 0);
      const area = `${[`M${x0},${y}`, `L${x1},${y}`, `L${x1},${chartHeight}`, `L${x0},${chartHeight}`, "Z"].join(" ")}`;
      const seriesGeometries = chartSeries
        .filter((entry) => entry.points.length)
        .map((entry) => ({
          key: entry.key,
          renderKey: entry.key,
          color: entry.color ?? DEFAULT_LINE_COLOR,
          prominent: Boolean(entry.prominent),
          coords: [
            projectPoint(x0, entry.points[0], 0, entry, xLabels?.[0] ?? "0"),
            projectPoint(x1, entry.points[0], 0, entry, `${xLabels?.[0] ?? "0"}:end`),
          ],
          opacity: 1,
          drawProgress: 1,
        }));
      return {
        seriesGeometries,
        areaPath: area,
        dots: showDots
          ? chartSeries
              .filter((entry) => entry.points.length)
              .map((entry) => ({
                pointKey: xLabels?.[0] ?? "0",
                x: (x0 + x1) / 2,
                y: scaleY(entry.points[0]),
                value: entry.points[0],
                color: entry.color ?? DEFAULT_LINE_COLOR,
                tooltipIndex: 0,
                seriesKey: entry.key,
                seriesLabel: entry.label,
                prominent: Boolean(entry.prominent),
                opacity: 1,
              }))
          : [],
        avgY: !isMultiSeries && showAvg && avgValue != null ? scaleY(avgValue) : null,
        labels: [{ x: PLOT_LEFT, text: xLabels?.[0] ?? "t0" }],
        gridX: defaultGridX,
        yTicks,
        verticalMarkers: [],
      };
    }

    const seriesCoords = chartSeries.map((entry) => ({
      key: entry.key,
      renderKey: entry.key,
      color: entry.color ?? DEFAULT_LINE_COLOR,
      prominent: Boolean(entry.prominent),
      coords: entry.points.map((p, idx) => projectPoint(scaleX(idx), p, idx, entry, xLabels?.[idx] ?? String(idx))),
      opacity: 1,
      drawProgress: 1,
    }));
    const firstCoords = (seriesCoords[0]?.coords ?? []).filter((coord): coord is ProjectedChartPoint => coord.y != null);
    const areaPath = firstCoords.length
      ? `${pointsToPath(firstCoords)} L${firstCoords[firstCoords.length - 1].x},${chartHeight} L${firstCoords[0].x},${chartHeight} Z`
      : "";
    const dots = showDots
      ? seriesCoords.flatMap((entry) =>
          entry.coords
            .filter((coord): coord is ProjectedChartPoint => coord.y != null)
            .map((coord, idx) => ({ ...coord, color: entry.color, tooltipIndex: idx })),
        )
      : [];
    const avgY = !isMultiSeries && showAvg && avgValue != null ? scaleY(avgValue) : null;
    const labels = Array.from({ length: pointCount }, (_, idx) => ({ x: scaleX(idx), text: xLabels?.[idx] ?? `t${idx}` }));

    return { seriesGeometries: seriesCoords, areaPath, dots, avgY, labels, gridX: defaultGridX, yTicks, verticalMarkers: [] };
    })); } finally { auditLeave(graphAudit); }
  }, [pointCount, chartSeries, isTimeSeries, timeDomain, timeTicks, verticalMarkers, avgValue, showAvg, showDots, plotWidth, plotHeight, xLabels, isMultiSeries, lineGradientBaseId, currentYDomain, yValueFormatter, plotBottom, plotRight, chartHeight, auditFamily, auditArea, rankAxis]);

  const layoutKey = `${chartWidth}:${chartHeight}:${plotWidth}:${plotHeight}:${plotRight}:${plotBottom}`;
  const visibleGeometry = useAnimatedChartGeometry(targetGeometry, {
    semanticKey: semanticKey ?? "",
    layoutKey, strictSelection: progressStyle,
  });
  const currentSeriesKeys = useMemo(() => new Set(chartSeries.map(row => row.key)), [chartSeries]);
  const drawingGeometry = useMemo(() => progressStyle ? { ...visibleGeometry, seriesGeometries: visibleGeometry.seriesGeometries.filter(row => currentSeriesKeys.has(row.key)) } : visibleGeometry, [visibleGeometry, progressStyle, currentSeriesKeys]);
  const targetRevisionDrawn = auditResultId(visibleGeometry) === auditResultId(targetGeometry) && visibleGeometry.seriesGeometries.some(entry => entry.drawProgress > 0 && entry.opacity > 0 && entry.coords.some(coord => coord.y != null));
  useRuntimeAuditGraphCommit(targetGeometry, pointCount > 0 && targetRevisionDrawn, auditArea ?? "untracked-chart", svgRef);
  const areaOpacity = visibleGeometry.seriesGeometries[0]?.opacity ?? 1;
  const { linePaths, areaPath, dots, avgY, labels, gridX, yTicks, verticalMarkers: projectedVerticalMarkers } = useMemo(
    () => buildRenderableGeometry(drawingGeometry, lineGradientBaseId, chartHeight, connectMissingValues, progressStyle ? undefined : isPartialScanPoint),
    [drawingGeometry, lineGradientBaseId, chartHeight, connectMissingValues, isPartialScanPoint, progressStyle],
  );
  const singlePointSeriesKeys = useMemo(
    () =>
      new Set(
        visibleGeometry.seriesGeometries
          .filter((entry) => entry.coords.filter((coord): coord is ProjectedChartPoint => coord.y != null).length === 1)
          .map((entry) => entry.key),
      ),
    [visibleGeometry.seriesGeometries],
  );
  const idleDots = showDots ? dots : dots.filter((dot) => singlePointSeriesKeys.has(dot.seriesKey));
  const [scanHover, setScanHover] = React.useState<GapChartScanPoint | null>(null);
  const reportScanHover = React.useCallback((point: GapChartScanPoint | null) => {
    if (progressStyle) setScanHover(current => current?.seriesKey === point?.seriesKey && current?.timestampMs === point?.timestampMs ? current : point);
    onHoverScanPointChange?.(point);
  }, [onHoverScanPointChange, progressStyle]);
  React.useEffect(() => { if (progressStyle) { setScanHover(null); setHover(null); } }, [semanticKey, chartSeries, progressStyle]);
  const [focusedScan, setFocusedScan] = React.useState(0);
  const gapProjection = useMemo(() => {
    if (!showScanPoints && !showMissingConnections) return null;
    const projection = projectChartGaps(drawingGeometry.seriesGeometries, new Map(chartSeries.map(row => [row.key, row.label])), plotBottom + 13, progressStyle && !showMissingObservations);
    return hideMissingScanPoints ? { ...projection, markers: projection.markers.filter(marker => marker.point.value != null) } : projection;
  }, [showScanPoints, showMissingConnections, drawingGeometry, chartSeries, plotBottom, progressStyle, showMissingObservations, hideMissingScanPoints]);
  const highlightedSeriesKeySet = useMemo(() => new Set(highlightedSeriesKeys ?? []), [highlightedSeriesKeys]);
  const emphasizedSeriesKeySet = useMemo(() => new Set(emphasizedSeriesKeys ?? []), [emphasizedSeriesKeys]);
  const hasHighlightedSeries = highlightedSeriesKeySet.size > 0;
  const interactiveScanIndices = gapProjection?.markers.flatMap((marker, index) => !hasHighlightedSeries || highlightedSeriesKeySet.has(marker.point.seriesKey) ? [index] : []) ?? [];
  const focusedScanIndex = interactiveScanIndices.includes(focusedScan) ? focusedScan : interactiveScanIndices[0];
  const lineGradients = linePaths.flatMap((line) => (line.gradient ? [line.gradient] : []));
  const hoverTooltipNodes = hover
    ? hover.tooltipIndexes
        .map((tooltipIndex) => dotTooltips?.[tooltipIndex])
        .filter((node): node is React.ReactNode => node != null)
    : [];
  const hoverTooltipStyle = hover
    ? ({
        left: `${(hover.x / chartWidth) * 100}%`,
        top: `${(hover.y / chartHeight) * 100}%`,
      } as React.CSSProperties)
    : undefined;

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<SVGElement>) => {
      const svg = svgRef.current;
      const markerNode = event.target instanceof Element ? event.target.closest('[data-scan-index]') : null;
      const marker = markerNode ? gapProjection?.markers[Number(markerNode.getAttribute('data-scan-index'))]?.point : null;
      if (!svg || !dots.length) {
        setHover(null);
        onHoverSeriesKeyChange?.(null);
        reportScanHover(marker ?? null);
        return;
      }
      const pointer = getSvgPointerPosition(svg, event.clientX, event.clientY, chartWidth, chartHeight);
      if (!pointer || pointer.x < PLOT_LEFT || pointer.x > plotRight || pointer.y < PLOT_TOP || pointer.y > plotBottom) {
        setHover(null);
        onHoverSeriesKeyChange?.(null);
        reportScanHover(marker ?? null);
        return;
      }
      const rect = svg.getBoundingClientRect();
      const scaleX = chartWidth / Math.max(1, rect.width);
      const scaleY = chartHeight / Math.max(1, rect.height);
      const nearest = dots.reduce<{ point: ProjectedChartPoint | null; distance: number }>((current, dot) => {
        const distance = Math.hypot((dot.x - pointer.x) / scaleX, (dot.y - pointer.y) / scaleY);
        return distance < current.distance ? { point: dot, distance } : current;
      }, { point: null, distance: Number.POSITIVE_INFINITY });

      if (!nearest.point || nearest.distance > HIT_RADIUS_PX) {
        setHover(null);
        const targetSeriesKey = readEventTargetSeriesKey(event.target);
        onHoverSeriesKeyChange?.(targetSeriesKey);
        reportScanHover(marker ?? null);
        return;
      }

      const nearestPoint = nearest.point;
      const cluster = dots.filter((dot) => {
        const distance = Math.hypot((dot.x - nearestPoint.x) / scaleX, (dot.y - nearestPoint.y) / scaleY);
        return distance <= CLUSTER_RADIUS_PX;
      });
      const sortedCluster = sortHoverPoints(cluster);
      setHover({ x: nearestPoint.x, y: nearestPoint.y, points: sortedCluster, tooltipIndexes: uniqueTooltipIndexes(sortedCluster) });
      onHoverSeriesKeyChange?.(nearestPoint.seriesKey);
      reportScanHover(marker ?? { seriesKey: nearestPoint.seriesKey, seriesLabel: nearestPoint.seriesLabel, timestampMs: Number(nearestPoint.pointKey), value: nearestPoint.value });
    },
    [dots, chartWidth, chartHeight, plotRight, plotBottom, onHoverSeriesKeyChange, reportScanHover, gapProjection],
  );

  return (
    <div className="player-profile__trend-wrapper" ref={wrapperRef}>
      <svg
        ref={svgRef}
        width={chartWidth}
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className={`player-profile__trend-chart ${className ?? ""}`.trim()}
        role="img"
        aria-label={t("guildChartDetails.trend")}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHover(null);
          onHoverSeriesKeyChange?.(null);
          reportScanHover(null);
        }}
      >
        <g className="player-profile__trend-grid" opacity="0.55" stroke="rgba(43,76,115,0.55)" strokeWidth={1}>
          {gridX.map((x, idx) => (
            <line key={`gv-${idx}`} x1={x} x2={x} y1={PLOT_TOP} y2={plotBottom} />
          ))}
          {yTicks.map((tick) => (
            <line key={`gh-${tick.value}`} x1={PLOT_LEFT} x2={plotRight} y1={tick.y} y2={tick.y} />
          ))}
        </g>

        {projectedVerticalMarkers.length ? (
          <g className="player-profile__trend-vertical-markers" aria-hidden={projectedVerticalMarkers.some(marker => marker.hint) ? undefined : true}>
            {projectedVerticalMarkers.map((marker) => (
              <g key={marker.key} className="player-profile__trend-vertical-marker" data-fusion-marker={marker.hint ? marker.key : undefined}>
                <line x1={marker.x} x2={marker.x} y1={PLOT_TOP} y2={plotBottom} />
                <line
                  className="player-profile__trend-vertical-marker-hitline"
                  x1={marker.x}
                  x2={marker.x}
                  y1={PLOT_TOP}
                  y2={plotBottom}
                  onPointerEnter={(event) => {
                    event.stopPropagation();
                    if (typeof marker.tooltipIndex === "number") {
                      setHover({ x: marker.x, y: PLOT_TOP, points: [], tooltipIndexes: [marker.tooltipIndex] });
                    }
                  }}
                  onPointerMove={(event) => {
                    event.stopPropagation();
                    if (typeof marker.tooltipIndex === "number") {
                      setHover({ x: marker.x, y: PLOT_TOP, points: [], tooltipIndexes: [marker.tooltipIndex] });
                    }
                  }}
                />
                {marker.hint && <foreignObject x={marker.x - 8} y={PLOT_TOP - 20} width={16} height={16} style={{ overflow: "visible" }}>{marker.hint}</foreignObject>}
              </g>
            ))}
          </g>
        ) : null}

        <g className="player-profile__trend-y-axis">
          <line x1={PLOT_LEFT} x2={PLOT_LEFT} y1={PLOT_TOP} y2={plotBottom} />
          {yTicks.map((tick) => (
            <text key={`yl-${tick.value}`} x={PLOT_LEFT - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">
              {tick.label}
            </text>
          ))}
        </g>

        {showAvg && avgY != null && (
          <g className="player-profile__trend-avg">
            <text x={12} y={20} className="player-profile__trend-avg-label">
              Avg
            </text>
            <line x1={0} x2={chartWidth} y1={avgY} y2={avgY} />
          </g>
        )}

        {(showFill && areaPath) || lineGradients.length ? (
          <defs>
            {showFill && areaPath ? (
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(92, 139, 198, 0.28)" />
                <stop offset="100%" stopColor="rgba(92, 139, 198, 0)" />
              </linearGradient>
            ) : null}
            {lineGradients.map((gradient) => (
              <linearGradient
                key={gradient.id}
                id={gradient.id}
                gradientUnits="userSpaceOnUse"
                x1={gradient.x1}
                y1={gradient.y1}
                x2={gradient.x2}
                y2={gradient.y2}
              >
                <stop offset="0%" stopColor={gradient.startColor} />
                <stop offset="100%" stopColor={gradient.endColor} />
              </linearGradient>
            ))}
          </defs>
        ) : null}
        {showFill && areaPath && (
          <path d={areaPath} className="player-profile__trend-area" fill={`url(#${gradientId})`} style={{ opacity: areaOpacity }} />
        )}

        <rect
          className="player-profile__trend-plot-hitarea"
          x={PLOT_LEFT}
          y={PLOT_TOP}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
        />

        {linePaths.map((line) => {
          const isHighlighted = highlightedSeriesKeySet.has(line.seriesKey);
          const isDimmed = hasHighlightedSeries && !isHighlighted;
          const isEmphasized = emphasizedSeriesKeySet.has(line.seriesKey);
          return (
            <path
              key={line.key}
              data-series-key={line.seriesKey}
              d={line.path}
              className="player-profile__trend-line"
              fill="none"
              data-partial-connection={line.partial ? line.seriesKey : undefined}
              pathLength={line.partial ? undefined : 1}
              style={{
                stroke: line.gradient ? `url(#${line.gradient.id})` : line.color,
                strokeWidth: (line.prominent ? 3.4 : 2.4) + (isHighlighted ? 1.2 : 0) + (isEmphasized ? 1 : 0),
                opacity: line.opacity * (line.prominent || isEmphasized ? 1 : 0.86) * (isDimmed ? 0.42 : 1),
                transition: progressStyle ? "opacity var(--progress-emphasis-duration, 180ms) ease, stroke-width var(--progress-emphasis-duration, 180ms) ease" : undefined,
                pointerEvents: "stroke",
                strokeLinecap: line.partial ? "butt" : undefined,
                strokeDasharray: line.partial ? "4 5" : line.drawProgress < 0.999 ? 1 : undefined,
                strokeDashoffset: line.drawProgress < 0.999 ? 1 - line.drawProgress : undefined,
              }}
            />
          );
        })}

        {showMissingConnections && gapProjection?.connections.map(connection => <path key={connection.key} data-gap-connection={connection.seriesKey} d={connection.path} fill="none" stroke={connection.color} strokeWidth={(highlightedSeriesKeySet.has(connection.seriesKey) ? 3.6 : 2.4) + (emphasizedSeriesKeySet.has(connection.seriesKey) ? 1 : 0)} style={{ transition: progressStyle ? "opacity var(--progress-emphasis-duration, 180ms) ease, stroke-width var(--progress-emphasis-duration, 180ms) ease" : undefined }} strokeDasharray="4 5" opacity={connection.opacity * (hasHighlightedSeries && !highlightedSeriesKeySet.has(connection.seriesKey) ? 0.42 : 0.86)} pointerEvents="none" />)}
        {progressStyle && <defs>{chartSeries.map(row => <pattern key={row.key} id={`${lineGradientBaseId}-partial-${sanitizeSvgId(row.key)}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V5" stroke={row.color ?? DEFAULT_LINE_COLOR} strokeWidth="1.4" /></pattern>)}</defs>}
        {gapProjection?.markers.map((marker, index) => {
          const missing = marker.point.value == null;
          const partial = !missing && (marker.point.partial ?? Boolean(isPartialScanPoint?.(marker.point)));
          const interactive = Boolean(onScanPointSelect) && interactiveScanIndices.includes(index);
          const label = scanPointLabel?.(marker.point) ?? `${marker.point.seriesLabel}: ${profileDateTime(marker.point.timestampMs)} · ${missing ? t("guildHistory.unavailable") : yValueFormatter(marker.point.value!)}`;
          return <g key={marker.key} role={interactive ? "button" : undefined} tabIndex={interactive ? index === focusedScanIndex ? 0 : -1 : undefined}
            data-scan-marker={missing ? "missing" : partial ? "partial" : "available"} data-scan-series={marker.point.seriesKey} data-scan-at={marker.point.timestampMs} data-scan-index={index} data-on-rail={marker.onRail || undefined}
            aria-label={label} opacity={marker.opacity * (hasHighlightedSeries && !highlightedSeriesKeySet.has(marker.point.seriesKey) ? 0.42 : 1)}
            onClick={interactive ? () => onScanPointSelect?.(marker.point) : undefined} onFocus={() => { setFocusedScan(index); reportScanHover(marker.point); }} onBlur={() => reportScanHover(null)}
            onKeyDown={interactive ? event => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onScanPointSelect?.(marker.point); }
              else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault(); const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
                const next = interactiveScanIndices[Math.max(0, Math.min(interactiveScanIndices.length - 1, interactiveScanIndices.indexOf(index) + step))]; setFocusedScan(next); svgRef.current?.querySelector<SVGGElement>(`[data-scan-index="${next}"]`)?.focus();
              }
            } : undefined}>
            {interactive && <circle cx={marker.x} cy={marker.y} r={8} fill="transparent" stroke="none" pointerEvents="all" />}
            {progressStyle && !missing && <circle data-measurement cx={marker.x} cy={marker.y} r={2.5} fill={marker.color} pointerEvents="none" />}
            {progressStyle && scanHover?.seriesKey === marker.point.seriesKey && scanHover.timestampMs === marker.point.timestampMs && <circle className="player-profile__trend-hover-dot" data-partial-hover={partial || undefined} cx={marker.x} cy={marker.y} r={7.5} stroke={marker.color} style={{ color: marker.color, fill: partial ? `url(#${lineGradientBaseId}-partial-${sanitizeSvgId(marker.point.seriesKey)})` : "transparent", strokeWidth: 2 }} pointerEvents="none" />}
            {!progressStyle && marker.isolated && !partial && <circle data-isolated-measurement cx={marker.x} cy={marker.y} r={2.5} fill={marker.color} pointerEvents="none" />}
            {!progressStyle && partial && <circle data-partial-marker cx={marker.x} cy={marker.y} r={3} fill="none" stroke="#929cab" strokeWidth={1.4} pointerEvents="none" />}
            {missing && <circle data-gap-marker cx={marker.x} cy={marker.y} r={3} fill="none" stroke="#929cab" strokeWidth={1.4} pointerEvents={interactive ? "all" : "none"} />}
            <title>{label}</title>
          </g>;
        })}

        {(gapProjection ? [] : idleDots).map((dot, idx) => (
              <g key={`dot-${dot.seriesKey}-${dot.pointKey}-${idx}`} className="player-profile__trend-dot-svg-group" style={{ opacity: dot.opacity }}>
                <circle className="player-profile__trend-dot-halo" cx={dot.x} cy={dot.y} r={dot.prominent ? 7.5 : 6.5} fill={dot.color} />
                <circle
                  className="player-profile__trend-dot-svg"
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.prominent ? 4.7 : 4.2}
                  fill={dot.color}
                  stroke={dot.color}
                />
              </g>
            ))}

        {hover && !progressStyle
          ? hover.points.map((dot, idx) => (
              <circle
                key={`hover-${dot.seriesKey}-${dot.pointKey}-${idx}`}
                className="player-profile__trend-hover-dot"
                cx={dot.x}
                cy={dot.y}
                r={dot.prominent ? 8.5 : 7.5}
                stroke={dot.color}
              />
            ))
          : null}

        {showXLabels && (
          <g className="player-profile__trend-xlabels">
            {labels.map((l, idx) => (
              l.text ? (
              <text key={`lbl-${idx}`} x={l.x} y={chartHeight - 8} textAnchor="middle">
                {l.text}
              </text>
              ) : null
            ))}
          </g>
        )}

      </svg>

      {hover && hoverTooltipNodes.length ? (
        <div className="player-profile__trend-hover-tooltip" style={hoverTooltipStyle}>
          {hoverTooltipNodes.length === 1
            ? hoverTooltipNodes[0]
            : hoverTooltipNodes.map((node, index) => (
                <div key={`cluster-tooltip-${index}`} className="player-profile__trend-tooltip-cluster-item">
                  {node}
                </div>
              ))}
        </div>
      ) : null}
    </div>
  );
}

export default AnchoredLineChart;

function useAnimatedChartGeometry(
  targetGeometry: AnchoredLineChartGeometry,
  options: { semanticKey: string; layoutKey: string; strictSelection: boolean },
) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [visibleGeometry, setVisibleGeometry] = React.useState<AnchoredLineChartGeometry>(() =>
    ({ ...targetGeometry, seriesGeometries: [], dots: [] }),
  );
  const visibleGeometryRef = React.useRef(visibleGeometry);
  const frameRef = React.useRef<number | null>(null);
  const previousKeysRef = React.useRef<{ semanticKey: string; layoutKey: string } | null>(null);

  React.useEffect(() => {
    visibleGeometryRef.current = visibleGeometry;
  }, [visibleGeometry]);

  React.useEffect(() => {
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  React.useLayoutEffect(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const previousKeys = previousKeysRef.current;
    const layoutChanged = Boolean(previousKeys && previousKeys.layoutKey !== options.layoutKey);
    const semanticChanged = Boolean(previousKeys && previousKeys.semanticKey !== options.semanticKey);
    previousKeysRef.current = options;

    const entering = targetGeometry.seriesGeometries.some(row => !visibleGeometryRef.current.seriesGeometries.some(old => old.key === row.key));
    const building = visibleGeometryRef.current.seriesGeometries.some(row => row.drawProgress < 1);
    if (prefersReducedMotion || (layoutChanged && (!options.strictSelection || (!semanticChanged && !entering && !building)))) {
      visibleGeometryRef.current = targetGeometry;
      setVisibleGeometry(targetGeometry);
      return undefined;
    }

    const startGeometry = options.strictSelection && semanticChanged ? { ...targetGeometry, seriesGeometries: [], dots: [] } : visibleGeometryRef.current;
    const startTime = performance.now();

    const tick = (now: number) => {
      const rawProgress = clamp((now - startTime) / CHART_ANIMATION_DURATION_MS, 0, 1);
      const progress = easeInOut(rawProgress);
      const nextGeometry = interpolateChartGeometry(startGeometry, targetGeometry, progress, semanticChanged, options.strictSelection);
      if (options.strictSelection) {
        const keys = new Set(targetGeometry.seriesGeometries.map(row => row.key));
        nextGeometry.seriesGeometries = nextGeometry.seriesGeometries.filter(row => keys.has(row.key));
      }
      associateAuditResultId(nextGeometry, auditResultId(targetGeometry));
      visibleGeometryRef.current = nextGeometry;
      setVisibleGeometry(nextGeometry);

      if (rawProgress < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      frameRef.current = null;
      visibleGeometryRef.current = targetGeometry;
      setVisibleGeometry(targetGeometry);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [targetGeometry, options.semanticKey, options.layoutKey, options.strictSelection, prefersReducedMotion]);

  return visibleGeometry;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setPrefersReducedMotion(query.matches);
    handleChange();
    query.addEventListener?.("change", handleChange);
    return () => query.removeEventListener?.("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

function easeInOut(value: number) {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function interpolateChartGeometry(
  start: AnchoredLineChartGeometry,
  target: AnchoredLineChartGeometry,
  progress: number,
  semanticChanged: boolean,
  strictSelection: boolean,
): AnchoredLineChartGeometry {
  const targetKeys = new Set(target.seriesGeometries.map((series) => series.key));
  const targetSeries: AnchoredLineSeriesGeometry[] = [];
  const startByKey = new Map<string, AnchoredLineSeriesGeometry>();

  for (const series of start.seriesGeometries) {
    const existing = startByKey.get(series.key);
    if (!existing || series.opacity > existing.opacity) {
      startByKey.set(series.key, series);
    }
  }

  for (const series of target.seriesGeometries) {
    const startSeries = startByKey.get(series.key);
    if (!startSeries) {
      targetSeries.push(withSingleSeriesAnimationState(series, progress, progress));
      continue;
    }

    if (strictSelection && !semanticChanged) {
      // Existing Progress rows keep their reveal when other guilds/metrics add
      // timestamps or change the scale. Only genuinely new keys start at zero.
      targetSeries.push(interpolateSeriesGeometry(startSeries, series, progress, true));
      continue;
    }
    if (semanticChanged || !isSeriesTopologyCompatible(startSeries, series)) {
      targetSeries.push(
        withSingleSeriesAnimationState(
          { ...startSeries, renderKey: `${startSeries.renderKey}-exit-${series.key}` },
          startSeries.opacity * (1 - progress),
          startSeries.drawProgress,
        ),
      );
      targetSeries.push(withSingleSeriesAnimationState({ ...series, renderKey: `${series.renderKey}-enter` }, progress, progress));
      continue;
    }

    targetSeries.push(interpolateSeriesGeometry(startSeries, series, progress));
  }

  for (const series of start.seriesGeometries) {
    if (targetKeys.has(series.key)) continue;
    const opacity = series.opacity * (1 - progress);
    if (opacity > 0.001) {
      targetSeries.push(withSingleSeriesAnimationState(series, opacity, series.drawProgress));
    }
  }

  return {
    ...target,
    seriesGeometries: targetSeries.filter((series) => series.opacity > 0.001),
    areaPath: target.areaPath,
    dots: [],
    avgY: interpolateOptionalNumber(start.avgY, target.avgY, progress, semanticChanged),
  };
}

function interpolateSeriesGeometry(
  start: AnchoredLineSeriesGeometry,
  target: AnchoredLineSeriesGeometry,
  progress: number,
  matchPoints = false,
): AnchoredLineSeriesGeometry {
  const byKey = matchPoints ? new Map(start.coords.map(coord => [coord.pointKey, coord])) : null;
  return {
    ...target,
    opacity: lerp(start.opacity, target.opacity, progress),
    drawProgress: matchPoints ? lerp(start.drawProgress, target.drawProgress, progress) : 1,
    coords: target.coords.map((targetCoord, index) => interpolateCoord(byKey?.get(targetCoord.pointKey) ?? (matchPoints ? targetCoord : start.coords[index]), targetCoord, progress)),
  };
}

function interpolateCoord(start: ProjectedChartCoord, target: ProjectedChartCoord, progress: number): ProjectedChartCoord {
  if (start.y == null || target.y == null) {
    return {
      ...target,
      x: lerp(start.x, target.x, progress),
      opacity: lerp(start.opacity, target.opacity, progress),
    };
  }

  return {
    ...target,
    x: lerp(start.x, target.x, progress),
    y: lerp(start.y, target.y, progress),
    opacity: lerp(start.opacity, target.opacity, progress),
  };
}

function interpolateOptionalNumber(
  start: number | null,
  target: number | null,
  progress: number,
  semanticChanged: boolean,
) {
  if (semanticChanged || start == null || target == null) return target;
  return lerp(start, target, progress);
}

function isSeriesTopologyCompatible(start: AnchoredLineSeriesGeometry, target: AnchoredLineSeriesGeometry) {
  if (start.coords.length !== target.coords.length) return false;
  if (start.prominent !== target.prominent) return false;
  return start.coords.every((coord, index) => {
    const targetCoord = target.coords[index];
    return (
      coord.pointKey === targetCoord.pointKey &&
      coord.color === targetCoord.color &&
      (coord.y == null) === (targetCoord.y == null)
    );
  });
}

function withSingleSeriesAnimationState(
  series: AnchoredLineSeriesGeometry,
  opacity: number,
  drawProgress: number,
): AnchoredLineSeriesGeometry {
  return {
    ...series,
    opacity,
    drawProgress,
  };
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function buildRenderableGeometry(
  geometry: AnchoredLineChartGeometry,
  lineGradientBaseId: string,
  chartHeight: number,
  connectMissingValues: boolean,
  isPartialScanPoint?: (point: GapChartScanPoint) => boolean,
): AnchoredLineChartGeometry & { linePaths: AnchoredLinePath[] } {
  const linePaths = geometry.seriesGeometries.flatMap((series) =>
    // Connect observed endpoints for this view only; keep null scan records for details.
    buildSegmentedLinePaths((connectMissingValues ? series.coords.filter(coord => coord.y != null) : series.coords).map(coord => isPartialScanPoint && coord.y != null
      ? { ...coord, partial: coord.partial ?? isPartialScanPoint({ seriesKey: series.key, seriesLabel: coord.seriesLabel, timestampMs: coord.timestampMs ?? Number(coord.pointKey), value: coord.value, observationKey: coord.observationKey }) } : coord), `${lineGradientBaseId}-${sanitizeSvgId(series.renderKey)}`).flatMap((segment, index) => {
      const revealedSegment = revealSegment(segment, series.drawProgress);
      if (!revealedSegment) return [];
      return [
        {
          key: `${series.renderKey}-${index}`,
          seriesKey: series.key,
          color: segment.color,
          prominent: series.prominent,
          path: revealedSegment.path,
          opacity: series.opacity,
          drawProgress: 1,
          gradient: revealedSegment.gradient,
          partial: segment.partial,
        },
      ];
    }),
  );
  const dots = geometry.seriesGeometries.flatMap((series) =>
    applyDotReveal(series.coords, series.drawProgress)
      .map((coord) => ({ ...coord, opacity: coord.opacity * series.opacity }))
      .filter((coord) => coord.opacity > 0.03),
  );
  const firstCoords = geometry.seriesGeometries[0]?.coords.filter((coord): coord is ProjectedChartPoint => coord.y != null) ?? [];
  const areaPath =
    geometry.areaPath && firstCoords.length
      ? `${pointsToPath(firstCoords)} L${firstCoords[firstCoords.length - 1].x},${chartHeight} L${firstCoords[0].x},${chartHeight} Z`
      : "";

  return {
    ...geometry,
    linePaths,
    areaPath,
    dots,
  };
}

function revealSegment(segment: AnchoredLineSegment, drawProgress: number) {
  if (drawProgress >= 0.999 || segment.runTotalLength <= 0 || segment.segmentLength <= 0) {
    return { path: segment.path, gradient: segment.gradient };
  }

  const drawDistance = clamp(drawProgress, 0, 1) * segment.runTotalLength;
  if (drawDistance <= segment.segmentStartDistance) return null;

  const localProgress = clamp((drawDistance - segment.segmentStartDistance) / segment.segmentLength, 0, 1);
  if (localProgress >= 0.999) return { path: segment.path, gradient: segment.gradient };

  const visibleEnd = {
    x: lerp(segment.start.x, segment.end.x, localProgress),
    y: lerp(segment.start.y, segment.end.y, localProgress),
  };

  return {
    path: `M${segment.start.x},${segment.start.y} L${visibleEnd.x},${visibleEnd.y}`,
    gradient: segment.gradient,
  };
}

function applyDotReveal(coords: ProjectedChartCoord[], drawProgress: number) {
  const revealedDots: ProjectedChartPoint[] = [];
  let run: ProjectedChartPoint[] = [];

  const flushRun = () => {
    if (!run.length) return;
    const pointDistances = buildRunPointDistances(run);
    const runTotalLength = pointDistances[pointDistances.length - 1] ?? 0;
    const drawDistance = clamp(drawProgress, 0, 1) * runTotalLength;

    run.forEach((point, index) => {
      const pointDistance = pointDistances[index] ?? 0;
      const revealOpacity =
        index === 0 || drawProgress >= 0.999 || runTotalLength <= 0
          ? 1
          : clamp((drawDistance - pointDistance) / DOT_REVEAL_FADE_DISTANCE_PX, 0, 1);
      if (revealOpacity > 0) {
        revealedDots.push({ ...point, opacity: point.opacity * revealOpacity });
      }
    });
    run = [];
  };

  coords.forEach((coord) => {
    if (coord.y == null) {
      flushRun();
      return;
    }
    run.push(coord);
  });
  flushRun();

  return revealedDots;
}

function buildRunPointDistances(points: Array<{ x: number; y: number }>) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    distances.push(distances[index - 1] + distanceBetween(previous, current));
  }
  return distances;
}

function pointsToPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
}

function buildAutoYDomain(series: AnchoredLineChartSeries[], isTimeSeries: boolean, avgValue: number | null): YDomain {
  const values = series
    .flatMap((entry) => (isTimeSeries ? entry.timePoints?.map((point) => point.value) ?? [] : entry.points))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (avgValue != null && Number.isFinite(avgValue)) values.push(avgValue);
  if (!values.length) return { min: 0, max: 1 };

  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const observedSpan = observedMax - observedMin;
  const fallbackSpan = Math.max(1, Math.abs(observedMax || observedMin) * 0.02);
  const span = observedSpan > 0 ? observedSpan : fallbackSpan;
  const padding = Math.max(span * 0.12, fallbackSpan * 0.35);
  return { min: observedMin - padding, max: observedMax + padding };
}

function buildYTicks(domain: YDomain, formatter: (value: number) => string, plotBottom: number, rankAxis = false) {
  const span = Math.max(1e-9, domain.max - domain.min);
  const step = rankAxis ? Math.max(1, Math.ceil(niceStep(span / 5))) : niceStep(span / 5);
  const start = Math.ceil(domain.min / step) * step;
  const ticks: Array<{ value: number; y: number; label: string }> = [];

  for (let value = start; value <= domain.max + step * 0.5; value += step) {
    const rounded = roundToStep(value, step);
    if (rounded < domain.min - step * 0.25 || rounded > domain.max + step * 0.25) continue;
    ticks.push({
      value: rounded,
      y: PLOT_TOP + (rankAxis ? (rounded - domain.min) / span : 1 - (rounded - domain.min) / span) * (plotBottom - PLOT_TOP),
      label: formatter(rounded),
    });
  }

  if (ticks.length >= 2) return ticks;
  return [domain.min, domain.max].map((value) => ({
    value,
    y: PLOT_TOP + (rankAxis ? (value - domain.min) / span : 1 - (value - domain.min) / span) * (plotBottom - PLOT_TOP),
    label: formatter(value),
  }));
}

function niceStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function roundToStep(value: number, step: number) {
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 2);
  return Number(value.toFixed(precision));
}

function buildDefaultGridX(plotRight: number) {
  return [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((fraction) => PLOT_LEFT + (plotRight - PLOT_LEFT) * fraction);
}

function getSvgPointerPosition(svg: SVGSVGElement, clientX: number, clientY: number, chartWidth: number, chartHeight: number) {
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * chartWidth,
    y: ((clientY - rect.top) / rect.height) * chartHeight,
  };
}

function readEventTargetSeriesKey(target: EventTarget) {
  return target instanceof SVGElement ? target.dataset.seriesKey ?? null : null;
}

function uniqueTooltipIndexes(points: ProjectedChartPoint[]) {
  return [...new Set(points.map((point) => point.tooltipIndex))];
}

function sortHoverPoints(points: ProjectedChartPoint[]) {
  return [...points].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.seriesLabel.localeCompare(b.seriesLabel);
  });
}

function distanceBetween(start: { x: number; y: number }, end: { x: number; y: number }) {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function buildSegmentedLinePaths(coords: Array<{ x: number; y: number | null; color: string; partial?: boolean }>, gradientIdPrefix: string) {
  const segments: AnchoredLineSegment[] = [];
  let run: Array<{ x: number; y: number; color: string; partial?: boolean }> = [];

  const flushRun = () => {
    if (!run.length) return;

    const runDistances = buildRunPointDistances(run);
    const runTotalLength = runDistances[runDistances.length - 1] ?? 0;

    if (run.length === 1) {
      const coord = run[0];
      segments.push({
        path: `M${coord.x},${coord.y} L${coord.x},${coord.y}`,
        color: coord.color,
        start: { x: coord.x, y: coord.y },
        end: { x: coord.x, y: coord.y },
        segmentStartDistance: 0,
        segmentLength: 0,
        runTotalLength,
      });
      run = [];
      return;
    }

    for (let index = 1; index < run.length; index += 1) {
      const previousCoord = run[index - 1];
      const coord = run[index];
      const segmentLength = distanceBetween(previousCoord, coord);
      const path = `M${previousCoord.x},${previousCoord.y} L${coord.x},${coord.y}`;
      const gradient =
        previousCoord.color === coord.color
          ? undefined
          : {
              id: `${gradientIdPrefix}-${segments.length}`,
              x1: previousCoord.x,
              y1: previousCoord.y,
              x2: coord.x,
              y2: coord.y,
              startColor: previousCoord.color,
              endColor: coord.color,
            };

      segments.push({
        path,
        color: previousCoord.color,
        partial: previousCoord.partial || coord.partial,
        start: { x: previousCoord.x, y: previousCoord.y },
        end: { x: coord.x, y: coord.y },
        segmentStartDistance: runDistances[index - 1] ?? 0,
        segmentLength,
        runTotalLength,
        gradient,
      });
    }

    run = [];
  };

  coords.forEach((coord) => {
    if (coord.y == null) {
      flushRun();
      return;
    }

    run.push({ x: coord.x, y: coord.y, color: coord.color, partial: coord.partial });
  });
  flushRun();

  return segments;
}

function sanitizeSvgId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}
