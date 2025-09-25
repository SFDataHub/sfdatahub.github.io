import React from "react";
import { Link } from "react-router-dom";

export default function DashboardIndex() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Dashboard</h1>

      {/* Kachel-Navigation zu den Unterseiten */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Tile to="/dashboard/kpis" title="KPIs" desc="Kennzahlen & Widgets" />
        <Tile to="/dashboard/activity" title="Activity" desc="Letzte Aktionen & Feeds" />
        <Tile to="/dashboard/progression" title="Progression" desc="Fortschritt & Ziele" />
      </div>

      {/* Hinweis: wird später nur bei Login sichtbar (Auth-Guard) */}
      <p style={{ opacity: 0.7, marginTop: 12 }}>
        Hinweis: Das Dashboard ist personalisiert und wird später nur bei Login angezeigt.
      </p>
    </section>
  );
}

function Tile({ to, title, desc }: { to: string; title: string; desc?: string }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: "14px 16px",
        background: "var(--tile)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--text)",
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--title)" }}>{title}</div>
      {desc ? <div style={{ opacity: 0.75, marginTop: 4 }}>{desc}</div> : null}
    </Link>
  );
}
