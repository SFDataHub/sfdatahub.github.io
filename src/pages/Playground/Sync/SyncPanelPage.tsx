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

export default function SyncPanelPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Sync Panel Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: Palette.tileAlt, border: `1px solid ${Palette.line}`, borderRadius: 10, padding: 10 }}>
                <b style={{ color: Palette.title }}>Sync Mode</b>
                <div><label><input type="radio" name="sync" defaultChecked /> Auto (30 min)</label></div>
                <div><label><input type="radio" name="sync" /> Manual</label></div>
              </div>
              <div style={{ background: Palette.tileAlt, border: `1px solid ${Palette.line}`, borderRadius: 10, padding: 10 }}>
                <b style={{ color: Palette.title }}>Queue</b>
                <div style={{ fontSize: 28 }}>12</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>uploads waiting since last sync</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
