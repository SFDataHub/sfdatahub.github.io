import React from "react";
export default function Placeholder({ title = "Coming soon" }: { title?: string }) {
  return <div style={{ padding: 16, opacity: 0.8 }}>{title}</div>;
}
