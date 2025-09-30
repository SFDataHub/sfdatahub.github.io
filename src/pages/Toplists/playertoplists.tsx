import React, { useMemo } from "react";
import { NavLink } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useFilters, SERVERS } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";

// Daten-Provider & Hook (Apps Script API)
import { ToplistsDataProvider, useToplistsData } from "../../context/ToplistsDataContext";

/** Mapping von deinem sortBy → API-Sortkey */
function mapSortKey(
  sortBy: "sum" | "main" | "constitution" | "level" | "delta" | "lastActivity"
): { sort: "sum" | "main" | "constitution" | "level" | "delta" | "last_activity"; order: "asc" | "desc" } {
  switch (sortBy) {
    case "sum":
      return { sort: "sum", order: "desc" };
    case "main":
      return { sort: "main", order: "desc" };
    case "constitution":
      return { sort: "constitution", order: "desc" };
    case "level":
      return { sort: "level", order: "desc" };
    case "delta":
      return { sort: "delta", order: "desc" };
    case "lastActivity":
      return { sort: "last_activity", order: "desc" };
    default:
      return { sort: "sum", order: "desc" };
  }
}

export default function PlayerToplistsPage() {
  const {
    // UI variants
    filterMode, setFilterMode,
    listView, setListView,

    // Bottom filter
    bottomFilterOpen, setBottomFilterOpen,

    // Server picker
    serverSheetOpen, setServerSheetOpen,

    // Filter-Keys
    servers, setServers,
    classes,
    searchText,
    range,          // "3d" | "7d" | "14d" | "30d" | "60d" | "90d" | "all"
    sortBy         // "sum" | "main" | "constitution" | "level" | "delta" | "lastActivity"
  } = useFilters();

  // API-Parameter aus deinem Context ableiten
  const apiServers = useMemo(() => servers ?? [], [servers]);
  const apiClasses = useMemo(() => classes ?? [], [classes]);
  const apiSearch  = useMemo(() => (searchText ?? "").trim() || null, [searchText]);
  const apiRange   = (range ?? "all") as "3d" | "7d" | "14d" | "30d" | "60d" | "90d" | "all";
  const { sort, order } = useMemo(() => mapSortKey(sortBy ?? "sum"), [sortBy]);

  return (
    <>
      <ContentShell
        mode="card"
        title="Top Lists"
        actions={<TopActions />}
        leftWidth={0}
        rightWidth={0}
        subheader={filterMode === "hud" ? <HudFilters /> : null}
        centerFramed={false}
        stickyTopbar
        stickySubheader
        topbarHeight={56}
      >
        {/* Tabs: Cards / Buttons / Table */}
        <ListSwitcher />

        {/* NUR im "Table"-View die API-Tabelle rendern */}
        {listView === "table" && (
          <ToplistsDataProvider
            servers={apiServers}
            classes={apiClasses}
            search={apiSearch}
            range={apiRange}
            sort={sort}
            order={order}
            pageSize={120}
          >
            <TableDataView />
          </ToplistsDataProvider>
        )}

        {/* In "cards" und "buttons" rendert diese Seite bewusst nichts.
            Du kannst dort eigene Komponenten einbinden, ohne dass die Tabelle doppelt erscheint. */}
      </ContentShell>

      {/* Server Picker (controlled, separat) */}
      <ServerSheet
        mode="modal"
        open={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        serversByRegion={SERVERS as any}
        selected={servers}
        onToggle={(s: string) =>
          setServers((prev: string[]) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
        }
        onSelectAllInRegion={(r: keyof typeof SERVERS) => setServers(SERVERS[r])}
        onClearAll={() => setServers([])}
      />

      {/* Bottom-Sheet (zeigt 1:1 die HUD-Leiste) */}
      <BottomFilterSheet
        open={filterMode === "sheet" && bottomFilterOpen}
        onClose={() => setBottomFilterOpen(false)}
      />
    </>
  );
}

/* ---------- Nur für den Table-Tab: Daten-Ansicht ---------- */
function TableDataView() {
  const { status, error, items, total, pageIndex, pageSize, setPageIndex, generatedAt, reload } = useToplistsData();

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtISO = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
  };

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      {/* Status */}
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{status === "loading" ? "Loading…" : status === "error" ? "Error" : "Ready"} • {total} rows</div>
        <div>{generatedAt ? `Updated: ${fmtISO(generatedAt)}` : null}</div>
      </div>

      {/* Fehler */}
      {status === "error" && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div>{error}</div>
          <button onClick={reload} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      {/* Tabelle */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
              <th style={{ padding: "8px 6px" }}>#</th>
              <th style={{ padding: "8px 6px" }}>Name</th>
              <th style={{ padding: "8px 6px" }}>Server</th>
              <th style={{ padding: "8px 6px" }}>Class</th>
              <th style={{ padding: "8px 6px" }}>Guild</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Base Sum</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Constitution</th>
              <th style={{ padding: "8px 6px" }}>Main</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Δ Rank</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Stats+</th>
              <th style={{ padding: "8px 6px" }}>Last Scan</th>
              <th style={{ padding: "8px 6px" }}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const rowNo = pageIndex * pageSize + i + 1; // 1..n in der Ansicht
              return (
                <tr key={it.playerId} style={{ borderBottom: "1px solid #2C4A73" }}>
                  <td style={{ padding: "8px 6px" }}>{rowNo}</td>
                  <td style={{ padding: "8px 6px" }}>{it.name}</td>
                  <td style={{ padding: "8px 6px" }}>{it.server}</td>
                  <td style={{ padding: "8px 6px" }}>{it.class}</td>
                  <td style={{ padding: "8px 6px" }}>{it.guild ?? ""}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(it.level)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(it.baseStatsSum)}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(it.constitution)}</td>
                  <td style={{ padding: "8px 6px" }}>{it.main}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{it.delta ?? ""}</td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(it.statsPlus)}</td>
                  <td style={{ padding: "8px 6px" }}>{fmtISO(it.lastScan)}</td>
                  <td style={{ padding: "8px 6px" }}>{fmtISO(it.lastActivity)}</td>
                </tr>
              );
            })}
            {status === "loading" && items.length === 0 && (
              <tr><td colSpan={13} style={{ padding: 12 }}>Loading…</td></tr>
            )}
            {status === "success" && items.length === 0 && (
              <tr><td colSpan={13} style={{ padding: 12 }}>No results</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paging (120/Seite) */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
        <button
          onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
          disabled={pageIndex === 0 || status === "loading"}
        >
          Prev
        </button>
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Page {pageIndex + 1} / {Math.max(1, Math.ceil(total / pageSize))}
        </div>
        <button
          onClick={() => {
            const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
            setPageIndex(Math.min(maxPage, pageIndex + 1));
          }}
          disabled={status === "loading" || (pageIndex + 1) * pageSize >= total}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ---------- Topbar Actions ---------- */
function TopActions() {
  const {
    filterMode, setFilterMode,
    listView, setListView,
    setBottomFilterOpen,
    setServerSheetOpen,
  } = useFilters();

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <nav
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        aria-label="Toplist Tabs"
      >
        <TopTab to="/toplists/players" label="Players" />
        <TopTab to="/toplists/guilds" label="Guilds" />
      </nav>

      <span className="hidden md:inline-block w-px h-6" style={{ background: "#2B4C73" }} />

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
        <button
          onClick={() => setBottomFilterOpen(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-white"
          style={{ border: "1px solid #2B4C73" }}
          title="Open Filters"
        >
          Open
        </button>
      </div>

      <button
        onClick={() => setServerSheetOpen(true)}
        className="rounded-lg px-3 py-1.5 text-sm text-white"
        style={{ border: "1px solid #2B4C73", background: "#14273E" }}
        title="Open Server Picker"
      >
        🌐 Servers
      </button>

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
          style={listView === "table" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
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
