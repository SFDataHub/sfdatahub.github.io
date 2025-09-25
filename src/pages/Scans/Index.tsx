import React from "react";
import { Link } from "react-router-dom";

export default function ScansIndex() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Scans</h1>

      {/* kleine Navi-Kacheln (Button-Optik, lokal gestylt) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Link
          to="/scans/latest"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Letzter Scan</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Neueste hochgeladene Daten</div>
        </Link>

        <Link
          to="/scans/archive"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Archiv</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Ältere Scans & Verlauf</div>
        </Link>
      </div>
    </section>
  );
}
