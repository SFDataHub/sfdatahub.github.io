import React from "react";

export default function DashboardProgression() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Dashboard – Progression</h1>
      <p style={{ opacity: 0.8 }}>
        Persönliche Ziele & Fortschritt (Platzhalter).
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Goal title="Scrapbook 100%" progress={72} />
        <Goal title="Fortress Ausbaustufe" progress={48} />
        <Goal title="Underworld Boss" progress={35} />
      </div>
    </section>
  );
}

function Goal({ title, progress }: { title: string; progress: number }) {
  return (
    <div
      style={{
        background: "var(--tile)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--title)", marginBottom: 8 }}>{title}</div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #2D89FF, #7EC8FF)",
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-soft)" }}>{progress}%</div>
    </div>
  );
}
