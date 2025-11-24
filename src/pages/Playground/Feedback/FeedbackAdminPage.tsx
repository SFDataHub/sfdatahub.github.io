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

export default function FeedbackAdminPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Feedback Admin Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Feedback Admin</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {["Improve HUD", "Fix CSV import"].map((msg) => (
                <div
                  key={msg}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: `1px solid ${Palette.line}`,
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <span>{msg}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ padding: "6px 10px" }}>Approve</button>
                    <button style={{ padding: "6px 10px" }}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
