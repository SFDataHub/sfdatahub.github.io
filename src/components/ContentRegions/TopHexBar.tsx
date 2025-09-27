// src/components/ContentRegions/TopHexBar.tsx
import React from "react";
import { COLORS } from "../ContentFrame/Decor";

type Props = { children?: React.ReactNode };
export default function TopHexBar({ children }: Props) {
  if (!children) return null;
  return (
    <div
      className="relative z-10 mb-3 rounded-2xl border px-4 py-2"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.kachel }}
    >
      {children /* später: Hex-Navigation einfügen */}
    </div>
  );
}
