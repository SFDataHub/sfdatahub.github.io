import React from "react";

export default function DashboardKPIs() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Dashboard – KPIs</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Card label="Letzter Scan" value="—" hint="Zeitpunkt des letzten Uploads" />
        <Card label="Tracked Spieler" value="—" hint="Gesamtzahl deiner getrackten Chars" />
        <Card label="Gilden-Tasks" value="—" hint="Offene Aufgaben im GuildHub" />
      </div>
    </section>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: "var(--tile)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-soft)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--title)" }}>{value}</div>
      {hint ? <div style={{ opacity: 0.75, marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}
