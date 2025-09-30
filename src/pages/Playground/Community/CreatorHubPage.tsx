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

export default function CreatorHubPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Creator Hub Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Creator Hub</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
                gap: 8,
                marginTop: 8,
              }}
            >
              {["YT: ArcMage", "Twitch: DemonHunterPro"].map((c) => (
                <div
                  key={c}
                  style={{
                    background: Palette.tileAlt,
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <b style={{ color: Palette.title }}>{c}</b>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    clicks / subs / language…
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
