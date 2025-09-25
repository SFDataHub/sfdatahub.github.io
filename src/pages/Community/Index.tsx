import React from "react";
import { Link } from "react-router-dom";

export default function CommunityIndex() {
  return (
    <section style={{ padding: 16 }}>
      <h1>Community</h1>

      {/* kleine Kacheln als Einstieg */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <Link
          to="/community/scans"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Scans</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Community-Uploads</div>
        </Link>

        <Link
          to="/community/predictions"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Predictions</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Tipps, Votes & Prognosen</div>
        </Link>

        <Link
          to="/community/creators"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Creators</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Streams, Videos, Guides</div>
        </Link>

        <Link
          to="/community/news"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>News</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Updates & Ankündigungen</div>
        </Link>

        <Link
          to="/community/feedback"
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
          <div style={{ fontWeight: 700, color: "var(--title)" }}>Feedback</div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Feature-Wünsche & Bugreports</div>
        </Link>
      </div>
    </section>
  );
}
