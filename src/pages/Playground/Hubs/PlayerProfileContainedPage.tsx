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

export default function PlayerProfileContainedPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>
          Player Profile (Contained) Page
        </h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "#1A2F4A",
                  border: `1px solid ${Palette.line}`,
                }}
              />
              <div>
                <h3 style={{ margin: "4px 0", color: Palette.title }}>
                  NightRaven
                </h3>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Demon Hunter · Guild: Ravens · EU1
                </div>
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginTop: 12,
              }}
            >
              {[
                "Level 487",
                "Scrapbook 93%",
                "Total 12.4M",
                "Scanned 2d ago",
              ].map((k) => (
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
