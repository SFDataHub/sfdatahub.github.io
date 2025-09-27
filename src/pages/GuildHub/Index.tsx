// src/pages/GuildHub/Index.tsx
import React from "react";
import { Link } from "react-router-dom";
import ContentShell from "../../components/ContentShell"; // <- korrigierter Pfad

export default function GuildHubIndex() {
  return (
    <ContentShell
      title="Guild Hub"
      subtitle="Planner, Fusion, Waitlist & mehr"
      actions={
        <button
          className="rounded-2xl border px-4 py-2 text-sm text-white/90 hover:bg-white/5"
          style={{ borderColor: "#2B4C73" }}
        >
          Neu anlegen
        </button>
      }
      left={<LeftRail />}
      right={<RightRail />}
      centerFramed
      leftWidth={260}
      rightWidth={320}
      stickyRails
    >
      <div className="space-y-4">
        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: "#2B4C73", background: "#152A42", color: "#F5F9FF" }}
        >
          <h2 className="text-sm mb-1">Willkommen im Guild Hub</h2>
          <p className="text-xs" style={{ color: "#B0C4D9" }}>
            Wähle links einen Bereich (Planner, Fusion, Waitlist, …) oder nutze unten die Kacheln.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Tile to="/guild-hub/planner" title="Planner" desc="Raids, Events, Aufgaben" />
          <Tile to="/guild-hub/fusion" title="Fusion" desc="Gildenfusionen planen" />
          <Tile to="/guild-hub/waitlist" title="Waitlist" desc="Bewerber & Slots" />
        </div>
      </div>
    </ContentShell>
  );
}

function LeftRail() {
  return (
    <nav className="space-y-2 text-sm">
      <RailLink to="/guild-hub/planner">Planner</RailLink>
      <RailLink to="/guild-hub/fusion">Fusion</RailLink>
      <RailLink to="/guild-hub/waitlist">Waitlist</RailLink>
      <RailLink to="/guild-hub/settings">Einstellungen</RailLink>
    </nav>
  );
}

function RightRail() {
  return (
    <aside className="space-y-3 text-sm">
      <div className="text-[#F5F9FF]">Hinweis</div>
      <p className="text-xs" style={{ color: "#B0C4D9" }}>
        Rollen & Rechte werden später hier gesteuert.
      </p>
    </aside>
  );
}

function Tile({
  to,
  title,
  desc,
}: {
  to: string;
  title: string;
  desc?: string;
}) {
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

function RailLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="block rounded-lg border px-3 py-2 no-underline"
      style={{ borderColor: "#2B4C73", background: "#152A42", color: "#FFFFFF" }}
    >
      {children}
    </Link>
  );
}
