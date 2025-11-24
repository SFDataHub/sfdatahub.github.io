import React from "react";
import { Link } from "react-router-dom";
import ContentShell from "../../components/ContentShell";

export default function DashboardIndex() {
  return (
    <ContentShell
      hex={<div className="text-[#F5F9FF]">Hex-Nav (soon)</div>}
      title="Dashboard"
      subtitle="Überblick & aktuelle Aktivitäten"
      actions={
        <button
          className="rounded-2xl border px-4 py-2 text-sm text-white/90 hover:bg-white/5"
          style={{ borderColor: "#2B4C73" }}
        >
          Export
        </button>
      }
      left={<LeftRail />}
      right={<RightRail />}
      centerFramed={true}
      leftWidth={280}
      rightWidth={320}
      stickyRails
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tile to="/dashboard/kpis" title="KPIs" desc="Kennzahlen & Widgets" />
        <Tile to="/dashboard/activity" title="Activity" desc="Letzte Aktionen & Feeds" />
        <Tile to="/dashboard/progression" title="Progression" desc="Fortschritt & Ziele" />
      </div>
    </ContentShell>
  );
}

/* ----- Sidebars ----- */

function LeftRail() {
  return (
    <div className="space-y-3 text-sm">
      <div className="text-[#F5F9FF]">Schnellzugriff</div>
      <div className="flex flex-wrap gap-2">
        <Chip to="/dashboard/kpis">KPIs</Chip>
        <Chip to="/dashboard/activity">Activity</Chip>
        <Chip to="/dashboard/progression">Progression</Chip>
      </div>
    </div>
  );
}

function RightRail() {
  return (
    <div className="space-y-3 text-sm">
      <div className="text-[#F5F9FF]">Hinweis</div>
      <p className="text-xs text-[#B0C4D9]">
        Dieses Dashboard ist personalisiert und wird später nur bei Login angezeigt.
      </p>
      <div className="text-[#F5F9FF]">Disclaimer</div>
      <p className="text-xs text-[#B0C4D9]">
        Alle Marken- und Bildrechte liegen bei den jeweiligen Inhabern.
      </p>
    </div>
  );
}

/* ----- Bausteine ----- */

function Tile({ to, title, desc }: { to: string; title: string; desc?: string }) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border p-4 no-underline"
      style={{ background: "#152A42", borderColor: "#2B4C73", color: "#FFFFFF" }}
    >
      <div className="font-semibold text-[#F5F9FF]">{title}</div>
      {desc ? <div className="mt-1 text-sm opacity-75">{desc}</div> : null}
    </Link>
  );
}

function Chip({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-xl border px-3 py-1 text-xs no-underline"
      style={{ borderColor: "#2B4C73", background: "#1A2F4A", color: "#F5F9FF" }}
    >
      {children}
    </Link>
  );
}
