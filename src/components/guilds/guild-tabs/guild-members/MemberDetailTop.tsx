// src/components/guilds/guild-tabs/guild-members/MemberDetailTop.tsx
import React from "react";
import { Member } from "./types";
import { THEME, mergeTheme } from "./utils";
import { CLASSES } from "../../../../data/classes";
import { toDriveThumbProxy } from "../../../../lib/urls";

function strip(s?: string | null) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Klassenicon via Label/Key → proxied Drive-Thumbnail */
function iconUrlForClass(cls?: string | null, size = 56): string | undefined {
  if (!cls) return undefined;
  const t = strip(cls);
  const hit =
    CLASSES.find((cl) => strip(cl.label) === t || strip(cl.key) === t) ||
    CLASSES.find(
      (cl) =>
        strip(cl.label).startsWith(t) ||
        t.startsWith(strip(cl.label)) ||
        strip(cl.key).startsWith(t) ||
        t.startsWith(strip(cl.key))
    );
  return hit ? toDriveThumbProxy(hit.iconUrl, size) : undefined;
}

function Avatar({
  name,
  memberClass,
  online,
  theme = THEME,
}: {
  name: string;
  memberClass?: string | null;
  online?: boolean;
  theme?: typeof THEME;
}) {
  const initials = name.split("_").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const iconUrl = iconUrlForClass(memberClass, 56);

  return (
    <div className="relative">
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          className="h-10 w-10 rounded-2xl border object-contain"
          style={{
            borderColor: theme.border,
            background: "transparent",
            filter:
              "drop-shadow(0 2px 3px rgba(0,0,0,.45)) drop-shadow(0 6px 10px rgba(0,0,0,.28))",
          }}
          onError={(ev) => {
            const p = ev.currentTarget.parentElement;
            if (p) {
              p.innerHTML = `<div class="grid place-items-center h-10 w-10 rounded-2xl border text-sm font-bold" style="background:${theme.tile};color:${theme.title};border-color:${theme.border}">${initials}</div>`;
            }
          }}
        />
      ) : (
        <div
          className="grid place-items-center h-10 w-10 rounded-2xl border text-sm font-bold"
          style={{ background: theme.tile, color: theme.title, borderColor: theme.border }}
        >
          {initials}
        </div>
      )}
      {online && (
        <span
          className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full"
          style={{ background: "#22c55e", boxShadow: `0 0 0 2px ${theme.bg}` }}
        />
      )}
    </div>
  );
}

const roleClass: Record<string, string> = {
  "Guild Master": "bg-amber-600/30 text-amber-200 border-amber-500/50",
  Officer: "bg-cyan-600/30 text-cyan-200 border-cyan-500/50",
  Member: "bg-emerald-600/30 text-emerald-200 border-emerald-500/50",
  Recruit: "bg-slate-600/30 text-slate-200 border-slate-500/50",
};

const RolePill = ({ role }: { role: string }) => (
  <span
    className={
      "px-2 py-0.5 rounded-full text-xs font-semibold border " + (roleClass[role] || "")
    }
  >
    {role}
  </span>
);

/** Datum/Uhrzeit anzeigen – bevorzugt Original-String, sonst ms → lokal */
function labelFrom(label?: string | null, ms?: number | null) {
  const txt = (label ?? "").trim();
  if (txt) return txt;
  if (typeof ms === "number") {
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("de-DE");
  }
  return "—";
}

/** Sum Base strikt aus sumBaseTotal oder (main + con) oder "—" */
function sumBaseFrom(member: any): string {
  const sbt = typeof member?.sumBaseTotal === "number" ? member.sumBaseTotal : null;
  const baseMain = typeof member?.baseMain === "number" ? member.baseMain : null;
  const conBase = typeof member?.conBase === "number" ? member.conBase : null;

  const val = sbt != null ? sbt : baseMain != null && conBase != null ? baseMain + conBase : null;
  return val != null ? val.toLocaleString("de-DE") : "—";
}

function KPI({
  label,
  value,
  theme = THEME,
}: {
  label: string;
  value: React.ReactNode;
  theme?: typeof THEME;
}) {
  return (
    <div
      className="rounded-XL border p-3 rounded-xl"
      style={{ borderColor: theme.border, background: theme.tile }}
    >
      <div className="text-[11px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-lg font-semibold" style={{ color: theme.title }}>
        {value}
      </div>
    </div>
  );
}

export default function MemberDetailTop({
  member,
  theme: patch,
  actions,
  extraKPIs,
}: {
  member?: Member;
  theme?: Partial<typeof THEME>;
  actions?: React.ReactNode;
  extraKPIs?: React.ReactNode;
}) {
  if (!member) return null;
  const theme = mergeTheme(THEME, patch);

  const m: any = member;

  const joinedLabel = labelFrom(m.guildJoined ?? m.joinedAt ?? null, m.guildJoinedMs ?? null);
  const lastLabel = labelFrom(
    m.lastActivity ?? null,
    m.lastActivityMs ?? (typeof m.lastOnline === "number" ? m.lastOnline : null)
  );

  const sumBaseLabel = sumBaseFrom(m);
  const totalStatsLabel =
    typeof m.totalStats === "number" ? m.totalStats.toLocaleString("de-DE") : "—";

  return (
    <div
      className="rounded-2xl border p-5 mb-4 relative overflow-hidden"
      style={{
        borderColor: theme.border,
        background: `linear-gradient(180deg, ${theme.tile} 0%, ${theme.tableBg} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 0 1px ${theme.border}, 0 0 160px 16px ${theme.glow}`,
        }}
      />
      <div className="relative z-10 flex items-start gap-4">
        <div className="shrink-0">
          <Avatar
            name={member.name}
            memberClass={m.class ?? m.values?.Class ?? null}
            online={m.online}
            theme={theme}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xl font-semibold truncate" style={{ color: theme.title }}>
              {member.name}
            </div>
            {m.role && <RolePill role={m.role} />}
          </div>
          <div className="text-sm mt-0.5" style={{ color: theme.sub }}>
            {m.class || "—"}
            {m.server ? ` • ${m.server}` : ""} • Joined {joinedLabel} • Last {lastLabel}
          </div>
        </div>
        <div className="ml-auto">{actions}</div>
      </div>

      <div className="relative z-10 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Level" value={m.level ?? "—"} theme={theme} />
        {typeof m.scrapbook === "number" && (
          <KPI label="Scrapbook" value={`${m.scrapbook}%`} theme={theme} />
        )}
        <KPI label="Sum Base" value={sumBaseLabel} theme={theme} />
        <KPI label="Total Stats" value={totalStatsLabel} theme={theme} />
        {extraKPIs}
      </div>
    </div>
  );
}
