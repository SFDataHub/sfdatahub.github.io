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

export default function CommunityScansPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Community Scans Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Community Scans</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                marginTop: 8,
              }}
            >
              {["Weekly Podium", "Top Scanners", "Past Winners"].map((k) => (
                <div
                  key={k}
                  style={{
                    background: Palette.tileAlt,
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  {k}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
