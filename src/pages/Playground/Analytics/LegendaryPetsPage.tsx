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

export default function LegendaryPetsPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Legendary & Pets Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div
                style={{
                  background: Palette.tileAlt,
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <b style={{ color: Palette.title }}>Legendary Tracker</b>
                <ul>
                  <li>Shadow Bow ✓</li>
                  <li>Mythic Ring ✗</li>
                </ul>
              </div>
              <div
                style={{
                  background: Palette.tileAlt,
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <b style={{ color: Palette.title }}>Pets</b>
                <ul>
                  <li>Firewolf 4/5</li>
                  <li>Sandwyrm 2/5</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
