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

export default function SettingsPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Settings Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <label>Language<select style={{ marginLeft: 8 }}><option>EN</option><option>DE</option></select></label>
              <label>Theme<select style={{ marginLeft: 8 }}><option>Dark</option><option>Custom</option></select></label>
              <label>Notifications<input type="checkbox" defaultChecked style={{ marginLeft: 8 }} /></label>
              <label>Privacy<input type="checkbox" style={{ marginLeft: 8 }} /></label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
