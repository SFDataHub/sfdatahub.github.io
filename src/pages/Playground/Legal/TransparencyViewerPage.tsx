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

export default function TransparencyViewerPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Transparency Viewer Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Live Payload Viewer</div>
            <div
              style={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                background: "#0A1728",
                border: `1px solid ${Palette.line}`,
                borderRadius: 10,
                padding: 10,
                marginTop: 8,
              }}
            >
              {"{\n  \"user_id\": \"abc\",\n  \"player_id\": \"p123\",\n  \"server\": \"EU1\",\n  \"verified_at\": \"2025-09-27T18:00:00Z\"\n}"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
