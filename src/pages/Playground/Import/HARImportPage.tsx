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

export default function HARImportPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>HAR Import Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>HAR Import Demo</div>
            <div
              style={{
                border: `1px dashed ${Palette.line}`,
                borderRadius: 12,
                padding: 24,
                textAlign: "center",
                background: Palette.tileAlt,
              }}
            >
              Drop .har file here or{" "}
              <button style={{ padding: "6px 10px" }}>Browse</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
              Validation, progress, and logs would appear here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
