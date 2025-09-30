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

export default function ToSPrivacyPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>ToS & Privacy Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>ToS & Privacy</div>
            <div
              style={{
                height: 180,
                overflow: "auto",
                border: `1px solid ${Palette.line}`,
                borderRadius: 10,
                padding: 10,
                marginTop: 8,
              }}
            >
              <p>
                Allgemeines… Registrierung… Rollen… Verarbeitung… Transparenz… Sicherheit… Haftung…
                Änderungen… Kontakt…
              </p>
            </div>
            <label style={{ marginTop: 8 }}>
              <input type="checkbox" /> I agree
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
