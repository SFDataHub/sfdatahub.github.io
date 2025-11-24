import React from "react";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div style={{
      padding: "16px 12px 24px",
      background: "var(--tableBg, #14273E)",
      border: "1px solid var(--line, #2C4A73)",
      borderRadius: 12
    }}>
      <h2 style={{ margin: 0, color: "var(--title, #F5F9FF)" }}>{title}</h2>
      <p style={{ margin: "6px 0 0", color: "var(--sub, #B0C4D9)" }}>
        Coming soon…
      </p>
    </div>
  );
}
