import React, { useMemo } from "react";
import AnchoredLineChart from "./AnchoredLineChart";
import type { TrendSeries } from "../../player-profile/types";

type AnchoredLineCardProps = {
  title: string;
  subtitle?: string;
  badgeLabel?: string;
  series: TrendSeries;
  className?: string;
};

const formatNumber = (value?: number | null) =>
  value == null ? "-" : value.toLocaleString("de-DE");

export default function AnchoredLineCard({ title, subtitle, badgeLabel = "Line + Avg marker", series, className }: AnchoredLineCardProps) {
  const { latest, start, delta, deltaPct, avg, xLabels } = useMemo(() => {
    const pts = Array.isArray(series.points) ? series.points : [];
    const latestVal = pts.length ? pts[pts.length - 1] : null;
    const startVal = pts.length ? pts[0] : null;
    const deltaVal = latestVal != null && startVal != null ? latestVal - startVal : null;
    const deltaPctVal =
      deltaVal != null && startVal && Math.abs(startVal) > 0
        ? (deltaVal / startVal) * 100
        : null;
    const avgVal = pts.length ? pts.reduce((s, v) => s + v, 0) / pts.length : null;
    const labels = pts.map((_, idx) => `t${idx}`);
    return { latest: latestVal, start: startVal, delta: deltaVal, deltaPct: deltaPctVal, avg: avgVal, xLabels: labels };
  }, [series.points]);

  const deltaLabel =
    deltaPct != null
      ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`
      : delta != null
      ? `${delta >= 0 ? "+" : ""}${delta.toLocaleString("de-DE")}`
      : "+0";

  return (
    <article className={`anchored-card ${className ?? ""}`.trim()}>
      <header className="anchored-card__header">
        <div>
          <div className="anchored-card__title">
            {title}
            {badgeLabel && <span className="anchored-card__badge">{badgeLabel}</span>}
          </div>
          {subtitle && <div className="anchored-card__subtitle">{subtitle}</div>}
        </div>
        <div className="anchored-card__delta anchored-card__delta--up" aria-label="Delta">
          ▲ {deltaLabel}
        </div>
      </header>

      <div className="anchored-card__chart">
        <AnchoredLineChart
          points={series.points}
          avgValue={avg}
          showAvg
          showDots
          showFill
          showXLabels
        />
      </div>

      <footer className="anchored-card__footer">
        <div className="anchored-card__kpis">
          <div className="anchored-card__kpi">
            <strong>{formatNumber(latest)}</strong>
            <span>Base Stats (latest)</span>
          </div>
          <div className="anchored-card__kpi">
            <strong>{formatNumber(start)}</strong>
            <span>Server Ø marker</span>
          </div>
          <div className="anchored-card__pill anchored-card__pill--up">
            ▲ {formatNumber(delta)}
          </div>
        </div>
        <div className="anchored-card__legend">
          <span><span className="anchored-card__dot" /> Player</span>
          <span><span className="anchored-card__dot anchored-card__dot--muted" /> Average marker</span>
        </div>
      </footer>
    </article>
  );
}
