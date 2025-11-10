import React from "react";
import type {
  ComparisonRow,
  ProgressTrack,
  StatsTabModel,
  TimelineEntry,
  TrendSeries,
} from "./types";

export function StatsTab({ data }: { data: StatsTabModel }) {
  return (
    <div className="player-profile__tab-panel">
      <div className="player-profile__grid">
        {data.summary.map((metric) => (
          <article key={metric.label} className="player-profile__card">
            <div className="player-profile__card-label">{metric.label}</div>
            <div className="player-profile__card-value">{metric.value}</div>
            {metric.hint && <div className="player-profile__card-hint">{metric.hint}</div>}
          </article>
        ))}
      </div>

      <div className="player-profile__section">
        <header className="player-profile__section-head">
          <h3>Attribute</h3>
          <span>Basis vs. Gesamt</span>
        </header>
        <div className="player-profile__attr-grid">
          {data.attributes.map((attr) => (
            <div key={attr.label} className="player-profile__attr-card">
              <div>
                <div className="player-profile__attr-label">{attr.label}</div>
                <div className="player-profile__attr-base">{attr.baseLabel}</div>
              </div>
              {attr.totalLabel && <div className="player-profile__attr-total">{attr.totalLabel}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="player-profile__split">
        <div className="player-profile__section">
          <header className="player-profile__section-head">
            <h3>Resistenzen</h3>
          </header>
          <ul className="player-profile__list">
            {data.resistances.map((res) => (
              <li key={res.label}>
                <span>{res.label}</span>
                <strong>{res.value}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="player-profile__section">
          <header className="player-profile__section-head">
            <h3>Ökonomie</h3>
          </header>
          <ul className="player-profile__list">
            {data.resources.map((res) => (
              <li key={res.label}>
                <span>{res.label}</span>
                <strong>{res.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ProgressTab({ items }: { items: ProgressTrack[] }) {
  return (
    <div className="player-profile__tab-panel player-profile__grid">
      {items.map((item) => (
        <article
          key={item.label}
          className={`player-profile__progress ${item.emphasis ? "player-profile__progress--emphasis" : ""}`}
        >
          <div className="player-profile__progress-head">
            <div>
              <div className="player-profile__card-label">{item.label}</div>
              <div className="player-profile__card-hint">{item.description}</div>
            </div>
            <div className="player-profile__card-value">{item.targetLabel}</div>
          </div>
          <div className="player-profile__progress-bar" aria-label={`${item.label} Fortschritt`}>
            <div style={{ width: `${Math.min(100, Math.max(0, item.progress * 100))}%` }} />
          </div>
          {item.meta && <div className="player-profile__card-hint">{item.meta}</div>}
        </article>
      ))}
    </div>
  );
}

export function ChartsTab({ series }: { series: TrendSeries[] }) {
  return (
    <div className="player-profile__tab-panel player-profile__grid">
      {series.map((trend) => (
        <article key={trend.label} className="player-profile__trend-card">
          <div className="player-profile__trend-head">
            <div>
              <div className="player-profile__card-label">{trend.label}</div>
              {trend.subLabel && <div className="player-profile__card-hint">{trend.subLabel}</div>}
            </div>
            <div className="player-profile__card-value">
              {trend.points[trend.points.length - 1]?.toLocaleString("de-DE")}
              {trend.unit || ""}
            </div>
          </div>
          <MiniTrend points={trend.points} />
        </article>
      ))}
    </div>
  );
}

export function ComparisonTab({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="player-profile__tab-panel">
      <div className="player-profile__section-head">
        <h3>Serververgleich</h3>
      </div>
      <div className="player-profile__comparison-wrapper">
        <table className="player-profile__comparison">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Spieler</th>
              <th>Cluster</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.playerValue}</td>
                <td>{row.benchmark}</td>
                <td className={`player-profile__trend-${row.trend}`}>{row.diffLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HistoryTab({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="player-profile__tab-panel">
      <ol className="player-profile__timeline">
        {entries.map((entry) => (
          <li key={`${entry.dateLabel}-${entry.title}`}>
            <div className="player-profile__timeline-date">{entry.dateLabel}</div>
            <div className="player-profile__timeline-card">
              <div className="player-profile__timeline-tag">{entry.tag}</div>
              <div className="player-profile__timeline-title">{entry.title}</div>
              <div className="player-profile__timeline-desc">{entry.description}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MiniTrend({ points }: { points: number[] }) {
  if (!points.length) {
    return <div className="player-profile__trend-chart player-profile__trend-chart--empty" />;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min || 1);
  const normalized = points.map((value, idx) => {
    const x = points.length > 1 ? (idx / (points.length - 1)) * 100 : 0;
    const y = 100 - ((value - min) / span) * 100;
    return `${idx === 0 ? "M" : "L"}${x},${y}`;
  });
  const path = normalized.join(" ");

  return (
    <div className="player-profile__trend-chart">
      <svg viewBox="0 0 100 100" role="img" aria-label="Verlauf">
        <path d={path} />
      </svg>
    </div>
  );
}
