import React from "react";
import { Member } from "./types";
import { THEME, mergeTheme } from "./utils";

export default function MemberCardGrid({
  rows, selId, onSelect, footer, theme: patch,
}:{
  rows: Member[];
  selId?: string;
  onSelect: (id: string) => void;
  footer: (m: Member) => React.ReactNode;
  theme?: Partial<typeof THEME>;
}) {
  const theme = mergeTheme(THEME, patch);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {rows.map((m) => (
        <button
          key={m.id}
          onClick={() => onSelect(m.id)}
          aria-pressed={m.id === selId}
          className={"group text-left rounded-2xl border p-4 transition-transform duration-150 hover:-translate-y-1 focus:-translate-y-1 outline-none" +
                    (m.id === selId ? " ring-1" : "")}
          style={{
            borderColor: theme.border,
            background: `linear-gradient(180deg, ${theme.tile} 0%, ${theme.tableBg} 100%)`,
            boxShadow: m.id === selId ? `0 12px 30px -12px ${theme.glow}` : "none",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-10 w-10 rounded-2xl border text-sm font-bold"
                 style={{ background: theme.tile, color: theme.title, borderColor: theme.border }}>
              {m.name.slice(0,2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: theme.title }}>{m.name}</div>
              <div className="text-xs" style={{ color: theme.sub }}>
                {m.class}{m.server ? ` • ${m.server}` : ""}
              </div>
            </div>
            <div className="ml-auto text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: theme.border }}>{m.role}</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><div className="text-[11px] uppercase opacity-70">Level</div><div className="font-semibold" style={{ color: theme.title }}>{m.level}</div></div>
            <div><div className="text-[11px] uppercase opacity-70">Power</div><div className="font-semibold" style={{ color: theme.title }}>{m.power.toLocaleString()}</div></div>
            {typeof m.scrapbook === "number" &&
              <div><div className="text-[11px] uppercase opacity-70">Book</div><div className="font-semibold" style={{ color: theme.title }}>{m.scrapbook}%</div></div>}
          </div>
          <div className="mt-3">{footer(m)}</div>
        </button>
      ))}
    </div>
  );
}
