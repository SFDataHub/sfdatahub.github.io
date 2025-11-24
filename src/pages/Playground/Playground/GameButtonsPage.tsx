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

export default function GameButtonsPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Game Buttons Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {["Arcade", "Mythic"].map((p) => (
                <button
                  key={p}
                  style={{ padding: "8px 12px", background: "#1E3A5C", border: `1px solid ${Palette.line}`, borderRadius: 12 }}
                >
                  {p}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {["Diamond", "Hex", "Shield", "Shard", "Pill", "Tab", "Icon"].map((t) => (
                <button
                  key={t}
                  style={{
                    padding: "10px 14px",
                    background: "linear-gradient(180deg,#25456B,#1A2F4A)",
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 14,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
