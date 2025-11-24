// src/components/ContentRegions/Center.tsx
import React from "react";
import { COLORS } from "../ContentFrame/Decor";

type Props = {
  children: React.ReactNode;
  framed?: boolean; // eigene Kachel (Border+BG). Default: true
};
export default function Center({ children, framed = true }: Props) {
  if (!framed) return <main className="min-w-0">{children}</main>;
  return (
    <main className="rounded-2xl border p-3 md:p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.tile }}>
      {children}
    </main>
  );
}
