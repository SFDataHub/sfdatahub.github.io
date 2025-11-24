import React from "react";
import { Member } from "./types";
import { THEME, mergeTheme } from "./utils";
import { CLASSES } from "../../../../data/classes";
import { toDriveThumbProxy } from "../../../../lib/urls";

function strip(s?: string | null) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function iconUrlForClass(cls?: string | null, size = 40): string | undefined {
  if (!cls) return undefined;
  const t = strip(cls);
  let c =
    CLASSES.find((cl) => strip(cl.label) === t || strip(cl.key) === t) ||
    CLASSES.find(
      (cl) =>
        strip(cl.label).startsWith(t) ||
        t.startsWith(strip(cl.label)) ||
        strip(cl.key).startsWith(t) ||
        t.startsWith(strip(cl.key))
    );
  return c ? toDriveThumbProxy(c.iconUrl, size) : undefined;
}

export default function MemberCardGrid({
  rows,
  selId,
  onSelect,
  footer,
  theme: patch,
}: {
  rows: Member[];
  selId?: string;
  onSelect: (id: string) => void;
  footer: (m: Member) => React.ReactNode;
  theme?: Partial<typeof THEME>;
}) {
  const theme = mergeTheme(THEME, patch);
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {rows.map((m) => {
        const mm: any = m;
        const initials = m.name.slice(0, 2).toUpperCase();
        const iconUrl = iconUrlForClass(mm.class ?? mm.values?.Class ?? null, 40);

        const level =
          typeof mm.level === "number" ? mm.level : (typeof mm.values?.Level === "number" ? mm.values.Level : "—");
        const scrapbook =
          typeof mm.scrapbook === "number"
            ? `${mm.scrapbook}%`
            : (typeof mm.values?.Scrapbook === "number" ? `${mm.values.Scrapbook}%` : null);

        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            aria-pressed={m.id === selId}
            className={
              "group text-left rounded-2xl border p-4 transition-transform duration-150 hover:-translate-y-1 focus:-translate-y-1 outline-none" +
              (m.id === selId ? " ring-1" : "")
            }
            style={{
              borderColor: theme.border,
              background: `linear-gradient(180deg, ${theme.tile} 0%, ${theme.tableBg} 100%)`,
              boxShadow: m.id === selId ? `0 12px 30px -12px ${theme.glow}` : "none",
            }}
          >
            <div className="flex items-center gap-3">
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

              <div className="min-w-0">
                <div className="font-semibold truncate" style={{ color: theme.title }}>
                  {m.name}
                </div>
                <div className="text-xs" style={{ color: theme.sub }}>
                  {mm.class ?? mm.values?.Class ?? "—"}
                  {mm.server ? ` • ${mm.server}` : ""}
                </div>
              </div>
              <div
                className="ml-auto text-xs px-2 py-0.5 rounded-full border"
                style={{ borderColor: theme.border }}
              >
                {mm.role ?? "—"}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] uppercase opacity-70">Level</div>
                <div className="font-semibold" style={{ color: theme.title }}>
                  {level}
                </div>
              </div>
              {scrapbook && (
                <div>
                  <div className="text-[11px] uppercase opacity-70">Book</div>
                  <div className="font-semibold" style={{ color: theme.title }}>
                    {scrapbook}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3">{footer(m)}</div>
          </button>
        );
      })}
    </div>
  );
}
