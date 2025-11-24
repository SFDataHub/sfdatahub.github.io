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

export default function ServersEditorPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Servers Editor Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Servers Editor</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 120px",
                gap: 8,
                marginTop: 8,
              }}
            >
              <input placeholder="Server name (EU4)" style={{ padding: "6px 8px" }} />
              <select><option>Active</option><option>Disabled</option></select>
              <button>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
