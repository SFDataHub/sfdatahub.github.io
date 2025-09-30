import React from "react";
import { NavLink } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useFilters } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";

export default function PlayerToplistsPage() {
  return (
    <>
      <ContentShell
        mode="card"
        title="Top Lists"
        actions={<TopActions />}   // Controls rechts in der Shell-Topbar

        /* volle Breite (keine Rails reservieren) */
        leftWidth={0}
        rightWidth={0}

        /* Filter fix direkt unter der Topbar */
        subheader={<HudFilters />}

        /* Center ohne extra Shell-Card (deine eigenen Cards bleiben) */
        centerFramed={false}

        /* Sticky innerhalb der Shell (fix, nicht scrollbar) */
        stickyTopbar
        stickySubheader
        topbarHeight={56}          // ggf. anpassen an reale Shell-Topbar-Höhe
      >
        {/* EINZIGER Scrollbereich mit unsichtbarem Scrollbar */}
        <ListSwitcher />
      </ContentShell>

      {/* Overlay (global) */}
      <ServerSheet />
    </>
  );
}

/* ---------- Topbar Actions (rechtsbündig) ---------- */
function TopActions() {
  const { filterMode, setFilterMode, listView, setListView, setBottomFilterOpen } = useFilters();

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {/* Tabs */}
      <nav
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        aria-label="Toplist Tabs"
      >
        <TopTab to="/toplists/players" label="Players" />
        <TopTab to="/toplists/guilds" label="Guilds" />
      </nav>

      <span className="hidden md:inline-block w-px h-6" style={{ background: "#2B4C73" }} />

      {/* Filter-UI Umschalter */}
      <div
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        role="group" aria-label="Filter UI"
      >
        <button
          aria-pressed={filterMode === "hud"}
          onClick={() => setFilterMode("hud")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={filterMode === "hud" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          HUD
        </button>
        <button
          aria-pressed={filterMode === "sheet"}
          onClick={() => setFilterMode("sheet")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={filterMode === "sheet" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Bottom Sheet
        </button>
        {filterMode === "sheet" && (
          <button
            onClick={() => setBottomFilterOpen(true)}
            className="rounded-lg px-3 py-1.5 text-sm text-white"
            style={{ border: "1px solid #2B4C73" }}
            title="Open Filters"
          >
            Open
          </button>
        )}
      </div>

      {/* List-View Umschalter */}
      <div
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        role="group" aria-label="List View"
      >
        <button
          aria-pressed={listView === "cards"}
          onClick={() => setListView("cards")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={listView === "cards" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Cards
        </button>
        <button
          aria-pressed={listView === "buttons"}
          onClick={() => setListView("buttons")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={listView === "buttons" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Buttons
        </button>
        <button
          aria-pressed={listView === "table"}
          onClick={() => setListView("table")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={{ ...(listView === "table" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}) }}
        >
          Table
        </button>
      </div>
    </div>
  );
}

function TopTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "rounded-lg px-3 py-1.5 text-sm text-white border",
          isActive ? "bg-[#25456B] border-[#5C8BC6]" : "border-transparent",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}
