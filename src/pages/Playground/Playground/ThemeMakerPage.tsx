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

export default function ThemeMakerPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Theme Maker Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
              <div
                style={{
                  background: Palette.tileAlt,
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.8 }}>Controls</div>
                <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <span>Noise</span>
                  <input type="range" min={0} max={1} step={0.01} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Radius</span>
                  <input type="range" min={0} max={24} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Border</span>
                  <input type="color" defaultValue={Palette.line} />
                </label>
              </div>
              <div style={{ position: "relative", border: `1px solid ${Palette.line}`, borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Preview</div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button style={{ padding: "8px 12px", background: "#1E3A5C", border: `1px solid ${Palette.line}`, borderRadius: 10 }}>
                    Primary
                  </button>
                  <button style={{ padding: "8px 12px", background: "#152A42", border: `1px dashed ${Palette.line}`, borderRadius: 10 }}>
                    Secondary
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
