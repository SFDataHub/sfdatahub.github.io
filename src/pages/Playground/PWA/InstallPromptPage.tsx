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

export default function InstallPromptPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>PWA Install Prompt Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Install Prompt</div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginTop: 8 }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  background: "#0A1728",
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 20,
                }}
              />
              <div>
                <b style={{ color: Palette.title }}>Install SFDataHub</b>
                <p style={{ opacity: 0.85 }}>Faster access, offline read-only, notifications…</p>
                <button style={{ padding: "8px 12px" }}>Install</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
