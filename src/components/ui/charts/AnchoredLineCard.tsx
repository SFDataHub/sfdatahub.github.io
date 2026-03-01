import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AnchoredLineChart from "./AnchoredLineChart";
import type { TrendSeries } from "../../player-profile/types";

type AnchoredLineCardProps = {
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  series: TrendSeries;
  className?: string;
  latestLabel?: string;
  startLabel?: string;
};

const formatNumber = (value?: number | null) =>
  value == null ? "-" : value.toLocaleString("de-DE");

export default function AnchoredLineCard({
  title,
  subtitle,
  badgeLabel,
  series,
  className,
  latestLabel,
  startLabel,
}: AnchoredLineCardProps) {
  const { t } = useTranslation();
  const scanLabel = t("playerProfile.chartsTab.labels.scanAt", { defaultValue: "Scan" });
  const showAvgMarker = Boolean(series.showAvgMarker && series.avgValue != null);
  const resolvedBadgeLabel = badgeLabel ?? (showAvgMarker ? "Line + Avg marker" : undefined);

  const { latest, start, delta, deltaPct, avg } = useMemo(() => {
    const pts = Array.isArray(series.points) ? series.points : [];
    const latestVal = pts.length ? pts[pts.length - 1] : null;
    const startVal = pts.length ? pts[0] : null;
    const deltaVal = latestVal != null && startVal != null ? latestVal - startVal : null;
    const deltaPctVal =
      deltaVal != null && startVal && Math.abs(startVal) > 0
        ? (deltaVal / startVal) * 100
        : null;
    const avgVal = showAvgMarker ? series.avgValue ?? null : null;
    return { latest: latestVal, start: startVal, delta: deltaVal, deltaPct: deltaPctVal, avg: avgVal };
  }, [series.avgValue, series.points, showAvgMarker]);

  const deltaLabel =
    deltaPct != null
      ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`
      : delta != null
        ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("de-DE")}`
        : "-";
  const pillLabel = delta != null ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("de-DE")}` : "-";
  const latestText = latestLabel ?? series.latestLabel ?? "Base Stats (latest)";
  const startText = startLabel ?? series.startLabel ?? "Server average";
  const locale =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().locale || undefined
      : undefined;
  const dotTooltips = useMemo(() => {
    const points = Array.isArray(series.points) ? series.points : [];
    if (!points.length) return undefined;
    return points.map((value, idx) => {
      const baseTooltip = series.tooltips?.[idx] ?? value.toLocaleString(locale);
      const meta = series.pointMeta?.[idx];
      const scanAtSec = typeof meta?.scanAtSec === "number" ? meta.scanAtSec : null;
      const scanAtRaw = typeof meta?.scanAtRaw === "string" ? meta.scanAtRaw.trim() : "";
      if (scanAtSec != null && Number.isFinite(scanAtSec)) {
        const dt = new Date(scanAtSec * 1000);
        if (!Number.isNaN(dt.getTime())) {
          return `${baseTooltip} | ${scanLabel}: ${dt.toLocaleString(locale)}`;
        }
      }
      if (scanAtRaw) return `${baseTooltip} | ${scanLabel}: ${scanAtRaw}`;
      return baseTooltip;
    });
  }, [locale, scanLabel, series.pointMeta, series.points, series.tooltips]);

  return (
    <article className={`anchored-card ${className ?? ""}`.trim()}>
      <header className="anchored-card__header">
        <div>
          <div className="anchored-card__title">
            {title}
            {resolvedBadgeLabel && <span className="anchored-card__badge">{resolvedBadgeLabel}</span>}
          </div>
          {subtitle && <div className="anchored-card__subtitle">{subtitle}</div>}
        </div>
        <div className="anchored-card__delta anchored-card__delta--up" aria-label="Delta">
          {"\u25B2"} {deltaLabel}
        </div>
      </header>

      <div className="anchored-card__chart">
        <AnchoredLineChart
          points={series.points}
          dotTooltips={dotTooltips}
          avgValue={avg}
          showAvg={showAvgMarker}
          showDots
          showFill
          showXLabels
        />
      </div>

      <footer className="anchored-card__footer">
        <div className="anchored-card__kpis">
          <div className="anchored-card__kpi">
            <strong>{formatNumber(latest)}</strong>
            <span>{latestText}</span>
          </div>
          <div className="anchored-card__kpi">
            <strong>{formatNumber(start)}</strong>
            <span>{startText}</span>
          </div>
          <div className="anchored-card__pill anchored-card__pill--up">{"\u25B2"} {pillLabel}</div>
        </div>
        {showAvgMarker ? (
          <div className="anchored-card__legend">
            <span><span className="anchored-card__dot" /> Player</span>
            <span><span className="anchored-card__dot anchored-card__dot--muted" /> Average marker</span>
          </div>
        ) : null}
      </footer>
    </article>
  );
}
