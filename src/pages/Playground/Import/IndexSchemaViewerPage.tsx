import React from "react";
import { Palette } from "../_shared/palette";

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: Palette.page,
  color: Palette.text,
  padding: "24px 16px",
};

const card: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
};

const tile: React.CSSProperties = {
  background: Palette.tile,
  border: `1px solid ${Palette.line}`,
  borderRadius: 12,
  padding: 12,
};

export default function IndexSchemaViewerPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Index Schema Viewer Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Index Schema Viewer</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
              }}
            >
              {["players", "groups", "trackers", "metadata"].map((s) => (
                <div
                  key={s}
                  style={{
                    background: Palette.tileAlt,
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <b style={{ color: Palette.title }}>{s}</b>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>fields…</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
