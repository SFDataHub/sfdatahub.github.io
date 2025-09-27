// src/components/ContentRegions/LeftRail.tsx
import React from "react";
import { COLORS } from "../ContentFrame/Decor";

type Props = {
  children?: React.ReactNode;
  sticky?: boolean;        // default: true
  topOffset?: number;      // px, default: 12
};
export default function LeftRail({ children, sticky = true, topOffset = 12 }: Props) {
  if (!children) return <div className="hidden md:block" />; // Platzhalter für Grid
  return (
    <aside
      className="rounded-2xl border p-3 md:p-4"
      style={{
        borderColor: COLORS.border,
        backgroundColor: COLORS.tile,
        position: sticky ? "sticky" as const : "static",
        top: sticky ? `${topOffset}px` : undefined,
        alignSelf: "start",
      }}
    >
      {children}
    </aside>
  );
}
