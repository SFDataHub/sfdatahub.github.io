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

export default function RankingsViewsPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Rankings Views Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {["Compact", "Master–Detail", "Cards"].map((m) => (
                <button
                  key={m}
                  style={{
                    padding: "6px 10px",
                    background: "#152A42",
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <div style={{ border: `1px solid ${Palette.line}`, borderRadius: 12, overflow: "hidden" }}>
              {[
                { id: "p1", name: "NightRaven", delta: "+2", lvl: 487 },
                { id: "p2", name: "ManaFox", delta: "-1", lvl: 472 },
              ].map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 60px",
                    gap: 8,
                    padding: "10px 12px",
                    background: i % 2 ? "#14273E" : "#152A42",
                  }}
                >
                  <b style={{ color: Palette.title }}>{r.name}</b>
                  <span>{r.delta}</span>
                  <span>Lvl {r.lvl}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
