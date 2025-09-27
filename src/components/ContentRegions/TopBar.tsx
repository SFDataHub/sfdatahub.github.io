// src/components/ContentRegions/TopBar.tsx
import React from "react";
import { COLORS } from "../ContentFrame/Decor";

type Props = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
};
export default function TopBar({ title, subtitle, actions }: Props) {
  if (!title && !subtitle && !actions) return null;
  return (
    <div
      className="relative z-10 mb-3 flex items-center justify-between rounded-2xl border px-5 py-3"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.kachel }}
    >
      <div className="min-w-0">
        {title && <div className="truncate text-sm font-semibold" style={{ color: COLORS.title }}>{title}</div>}
        {subtitle && <div className="truncate text-[11px]" style={{ color: COLORS.textDim }}>{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
