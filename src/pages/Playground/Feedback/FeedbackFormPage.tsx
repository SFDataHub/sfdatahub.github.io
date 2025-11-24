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

export default function FeedbackFormPage() {
  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: Palette.title, marginTop: 0 }}>Feedback Form Page</h1>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={tile}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Feedback</div>
            <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <span>Category</span>
              <select
                style={{
                  background: "#152A42",
                  color: Palette.text,
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 8,
                  padding: "6px 8px",
                }}
              >
                <option>UI</option>
                <option>Data</option>
                <option>Bug</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
              <span>Message</span>
              <textarea
                rows={4}
                style={{
                  background: "#152A42",
                  color: Palette.text,
                  border: `1px solid ${Palette.line}`,
                  borderRadius: 8,
                  padding: "6px 8px",
                }}
              />
            </label>
            <button
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "#1E3A5C",
                border: `1px solid ${Palette.line}`,
                borderRadius: 10,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
