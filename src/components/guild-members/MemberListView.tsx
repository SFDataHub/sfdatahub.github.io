import React from "react";
import { Member } from "./types";
import { THEME, mergeTheme } from "./utils";

function Avatar({ name, online, theme = THEME }:{
  name: string; online?: boolean; theme?: typeof THEME;
}) {
  const initials = name.split("_").map(s => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <div className="grid place-items-center h-10 w-10 rounded-2xl border text-sm font-bold"
           style={{ background: theme.tile, color: theme.title, borderColor: theme.border }}>
        {initials}
      </div>
      {online && <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full"
                      style={{ background: "#22c55e", boxShadow: `0 0 0 2px ${theme.bg}` }} />}
    </div>
  );
}

const RolePill = ({ role }:{ role: string }) => {
  const m: Record<string, string> = {
    "Guild Master":"bg-amber-600/30 text-amber-200 border-amber-500/50",
    "Officer":"bg-cyan-600/30 text-cyan-200 border-cyan-500/50",
    "Member":"bg-emerald-600/30 text-emerald-200 border-emerald-500/50",
    "Recruit":"bg-slate-600/30 text-slate-200 border-slate-500/50",
  };
  return <span className={"px-2 py-0.5 rounded-full text-xs font-semibold border " + (m[role] || "")}>{role}</span>;
};

export default function MemberListView({
  rows, selId, onSelect, rightCols, theme: patch,
}:{
  rows: Member[];
  selId?: string;
  onSelect: (id: string) => void;
  rightCols: (m: Member) => React.ReactNode; // Spalten rechts von Name/Meta
  theme?: Partial<typeof THEME>;
}) {
  const theme = mergeTheme(THEME, patch);
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.border }}>
      <style>{`.no-scrollbar::-webkit-scrollbar{width:0;height:0}.no-scrollbar{scrollbar-width:none;-ms-overflow-style:none}`}</style>
      <div className="max-h=[520px] max-h-[520px] overflow-auto no-scrollbar" style={{ background: theme.tableBg }}>
        <div className="h-8 sticky top-0" style={{ background: theme.header }} />
        {rows.map((m, i) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            aria-pressed={m.id === selId}
            className={("w-full text-left px-3 py-3 grid items-center gap-3 transition " + (i % 2 ? "bg-slate-800/10" : "")) +
                       (m.id === selId ? " bg-slate-800/40" : " hover:bg-slate-800/20")}
            style={{ gridTemplateColumns: "auto 1fr auto auto auto auto" }}
          >
            <Avatar name={m.name} online={m.online} theme={theme} />
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: theme.title }}>{m.name}</div>
              <div className="text-xs truncate" style={{ color: theme.sub }}>
                {m.class}{m.server ? ` • ${m.server}` : ""}
              </div>
            </div>
            <div className="justify-self-end"><RolePill role={m.role} /></div>
            {rightCols(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
