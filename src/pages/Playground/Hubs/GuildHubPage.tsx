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

export default function GuildHubPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Guild Hub Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Guild Hub</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px",
                  gap: 8,
                }}
              >
                <b style={{ color: Palette.title }}>Ravens</b>
                <span>Avg Lvl 465</span>
                <span>Fresh scans 82%</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px",
                  gap: 8,
                }}
              >
                <b style={{ color: Palette.title }}>Arcana</b>
                <span>Avg Lvl 458</span>
                <span>Fresh scans 76%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
