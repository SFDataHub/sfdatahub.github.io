import React from "react";
import { Link } from "react-router-dom";

export default function GuildsIndex() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Guilds</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Tile to="/guilds/rankings" title="Rankings" desc="Gildenrangliste & Trends" />
        <Tile to="/guilds/stats" title="Stats" desc="Aktivität, Beitritte, Meilensteine" />
      </div>
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
