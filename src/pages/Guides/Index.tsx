import React from "react";
import { Link } from "react-router-dom";

export default function GuidesIndex() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Guides</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Tile to="/guides/fortress" title="Fortress" desc="Bau- und Ressourcenpfade" />
        <Tile to="/guides/underworld" title="Underworld" desc="Dämonen, Folterkeller, Gegner" />
        <Tile to="/guides/arena-am" title="Arena/AM" desc="AM-Routen & Strider-Setups" />
        <Tile to="/guides/dungeons" title="Dungeons" desc="Dungeons, Epics, Hotkeys" />
        <Tile to="/guides/hellevator" title="Hellevator" desc="Etagen & Belohnungen" />
        <Tile to="/guides/legendary-dungeon" title="Legendary Dungeon" desc="Mechaniken & Tipps" />
        <Tile to="/guides/events" title="Events" desc="Kalender, Event-Zyklen" />
        <Tile to="/guides/calculators" title="Calculators" desc="Stats, Gems, Fortress, …" />
        <Tile to="/guides/infographics" title="Infografiken" desc="Cheatsheets & Übersichten" />
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
