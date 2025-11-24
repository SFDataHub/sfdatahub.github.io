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

export default function ConnectManualPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Connect Manual Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Connect: Manual (Bookmarklet)
            </div>
            <div
              style={{
                background: Palette.tileAlt,
                border: `1px solid ${Palette.line}`,
                borderRadius: 10,
                padding: 10,
                marginTop: 8,
              }}
            >
              <b style={{ color: Palette.title }}>View source</b>
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {"javascript:(function(){/* … */})();"}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
