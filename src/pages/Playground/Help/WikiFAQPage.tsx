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

export default function WikiFAQPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Wiki & FAQ Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Wiki / FAQ</div>
            <input
              placeholder="Search…"
              style={{
                marginTop: 8,
                padding: "8px 10px",
                background: "#152A42",
                border: `1px solid ${Palette.line}`,
                borderRadius: 10,
              }}
            />
            <ul style={{ marginTop: 8 }}>
              <li>How to import HAR?</li>
              <li>What data is stored?</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
