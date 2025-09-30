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

export default function RescanWidgetPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Rescan Widget Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b style={{ color: Palette.title }}>Rescan (auto)</b>
              <span style={{ fontSize: 12, opacity: 0.8 }}>removes entry after fresh scan</span>
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {["NightRaven", "ManaFox", "StormVale"].map((n) => (
                <div
                  key={n}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                    padding: "8px 10px",
                  }}
                >
                  <span>{n}</span>
                  <button style={{ padding: "6px 10px" }}>Trigger</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
