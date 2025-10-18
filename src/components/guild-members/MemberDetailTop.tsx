import React from "react";
import { Member } from "./types";
import { THEME, fmtDate, timeAgo, mergeTheme, sumBaseStats } from "./utils";

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
      {online && (
        <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full"
              style={{ background: "#22c55e", boxShadow: `0 0 0 2px ${theme.bg}` }} />
      )}
    </div>
  );
}

const roleClass: Record<string, string> = {
  "Guild Master": "bg-amber-600/30 text-amber-200 border-amber-500/50",
  "Officer":      "bg-cyan-600/30 text-cyan-200 border-cyan-500/50",
  "Member":       "bg-emerald-600/30 text-emerald-200 border-emerald-500/50",
  "Recruit":      "bg-slate-600/30 text-slate-200 border-slate-500/50",
};

const RolePill = ({ role }:{ role: string }) =>
  <span className={"px-2 py-0.5 rounded-full text-xs font-semibold border " + (roleClass[role] || "")}>{role}</span>;

const KPI = ({ label, value, theme = THEME }:{
  label: string; value: React.ReactNode; theme?: typeof THEME;
}) => (
  <div className="rounded-xl border p-3" style={{ borderColor: theme.border, background: theme.tile }}>
    <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
    <div className="text-lg font-semibold" style={{ color: theme.title }}>{value}</div>
  </div>
);

export default function MemberDetailTop({
  member, theme: patch, actions, extraKPIs,
}:{
  member?: Member;
  theme?: Partial<typeof THEME>;
  actions?: React.ReactNode;
  extraKPIs?: React.ReactNode;
}) {
  if (!member) return null;
  const theme = mergeTheme(THEME, patch);
  return (
    <div className="rounded-2xl border p-5 mb-4 relative overflow-hidden"
         style={{ borderColor: theme.border, background: `linear-gradient(180deg, ${theme.tile} 0%, ${theme.tableBg} 100%)` }}>
      <div className="absolute inset-0 pointer-events-none"
           style={{ boxShadow: `inset 0 0 0 1px ${theme.border}, 0 0 160px 16px ${theme.glow}` }} />
      <div className="relative z-10 flex items-start gap-4">
        <div className="shrink-0"><Avatar name={member.name} online={member.online} theme={theme} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xl font-semibold truncate" style={{ color: theme.title }}>{member.name}</div>
            <RolePill role={member.role} />
          </div>
          <div className="text-sm mt-0.5" style={{ color: theme.sub }}>
            {member.class}{member.server ? ` • ${member.server}` : ""} • Joined {fmtDate(member.joinedAt)} • Last {timeAgo(member.lastOnline)}
          </div>
        </div>
        <div className="ml-auto">{actions}</div>
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Level" value={member.level ?? "—"} theme={theme} />
        {/* Rohwert ohne .toLocaleString() */}
        <KPI label="Power" value={member.power ?? "—"} theme={theme} />
        {typeof member.scrapbook === "number" && <KPI label="Scrapbook" value={`${member.scrapbook}%`} theme={theme} />}
        <KPI label="Sum Base" value={sumBaseStats(member.baseStats)} theme={theme} />
        {typeof member.totalStats === "number" && <KPI label="Total Stats" value={member.totalStats} theme={theme} />}
        {extraKPIs}
      </div>
    </div>
  );
}
