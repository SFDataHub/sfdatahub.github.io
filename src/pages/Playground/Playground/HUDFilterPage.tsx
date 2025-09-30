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

export default function HUDFilterPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>HUD Filter Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  style={{
                    background: "#152A42",
                    color: Palette.text,
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                  }}
                >
                  {["EU1", "EU2", "EU3", "INT1", "US1"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Warrior", "Mage", "Scout", "Assassin", "Bard", "Demon Hunter"].map((c) => (
                    <button
                      key={c}
                      style={{ padding: "6px 10px", border: `1px solid ${Palette.line}`, borderRadius: 999, background: "#1E3A5C" }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, opacity: 0.8 }}>Range 7d</span>
                  <input type="range" min={1} max={30} defaultValue={7} />
                </label>
                <select
                  style={{
                    background: "#152A42",
                    color: Palette.text,
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                  }}
                >
                  <option>Level</option>
                  <option>Scrapbook</option>
                  <option>Power</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
