// src/components/toplists/GuildToplists.tsx
import React from "react";

// (neu) zentrale Daten stehen bereit, falls später nötig
// import { SERVERS } from "../../data/servers";

type Row = { rank: number; name: string; server: string; avgLevel: number; delta24h: number };

const demoRows: Row[] = [
  { rank: 1, name: "Shadow Blades", server: "EU1", avgLevel: 480, delta24h: +1 },
  { rank: 2, name: "Arcane Legion", server: "EU2", avgLevel: 472, delta24h: 0 },
];

export default function GuildToplists() {
  // TODO: später echte Daten + Sidebar-Filter/URL-Params binden
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12 }}>Guilds · snapshot (latest)</div>

      {demoRows.map((g) => (
        <div
          key={g.rank}
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 120px 120px",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #2C4A73",
            background: "#14273E",
            fontSize: 14,
            alignItems: "center",
          }}
        >
          <div>#{g.rank}</div>
          <div>{g.name} — {g.server}</div>
          <div>Avg Lv {g.avgLevel}</div>
          <div>
            Δ {g.delta24h > 0 ? `+${g.delta24h}` : g.delta24h} (24h)
          </div>
        </div>
      ))}
    </div>
  );
}
