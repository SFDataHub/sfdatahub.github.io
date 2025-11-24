// src/pages/GuildHub/Index.tsx
import React from "react";
import { Link, NavLink } from "react-router-dom";
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
            Waehle links einen Bereich (Planner, Fusion, Waitlist, etc.) oder nutze unten die Kacheln.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/guild-hub/fusion-planner"
              className="rounded-xl px-3 py-2 text-xs font-semibold no-underline"
              style={{
                background: "linear-gradient(135deg, rgba(43, 109, 224, 0.22), rgba(43, 109, 224, 0.08))",
                border: "1px solid #2B6DE0",
                color: "#F5F9FF",
              }}
            >
              Zum Fusion Planner
            </Link>
            <Link
              to="/guild-hub/planner"
              className="rounded-xl px-3 py-2 text-xs font-semibold no-underline"
              style={{
                background: "#152A42",
                border: "1px solid #2B4C73",
                color: "#F5F9FF",
              }}
            >
              Guild Planner oeffnen
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Tile to="/guild-hub/planner" title="Planner" desc="Raids, Events, Aufgaben" />
          <Tile to="/guild-hub/fusion-planner" title="Fusion Planner" desc="Setups & Szenarien" />
          <Tile to="/guild-hub/compare-guilds" title="Gildenvergleich" desc="Kennzahlen nebeneinander legen" />
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
      <RailLink to="/guild-hub/fusion-planner">Fusion Planner</RailLink>
      <RailLink to="/guild-hub/compare-guilds">Gildenvergleich</RailLink>
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
        Rollen & Rechte werden spaeter hier gesteuert.
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
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-lg border px-3 py-2 no-underline ${isActive ? "font-semibold" : ""}`
      }
      style={({ isActive }) => ({
        borderColor: isActive ? "#2B6DE0" : "#2B4C73",
        background: isActive ? "#1C3554" : "#152A42",
        color: "#FFFFFF",
        boxShadow: isActive ? "0 0 0 1px rgba(43, 109, 224, 0.4)" : undefined,
      })}
    >
      {children}
    </NavLink>
  );
}
