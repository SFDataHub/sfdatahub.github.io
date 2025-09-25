import React from "react";
import { Link } from "react-router-dom";

export default function Discover() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Discover</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Tile to="/players" title="Players" desc="Browse, Rankings, Stats, Profile" />
        <Tile to="/guilds" title="Guilds" desc="Browse, Rankings, Stats" />
        <Tile to="/servers" title="Servers" desc="Rankings & Statistiken" />
        <Tile to="/scans" title="Scans" desc="Neueste & Archiv" />
        <Tile to="/guides" title="Guides" desc="Fortress, Underworld, Dungeons…" />
        <Tile to="/community" title="Community" desc="News, Scans, Predictions, Creators" />
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
