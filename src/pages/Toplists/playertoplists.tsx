import React, { useEffect } from "react";
import { NavLink } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useFilters, SERVERS, type DaysFilter } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";

import { ToplistsProvider, useToplistsData } from "../../context/ToplistsDataContext";

type RegionKey = "EU" | "US" | "INT" | "Fusion";

const SERVERS_BY_REGION: Record<RegionKey, string[]> = (() => {
  const grouped: Record<RegionKey, string[]> = {
    EU: [],
    US: [],
    INT: [],
    Fusion: [],
  };

  const push = (region: RegionKey, value: string) => {
    if (!grouped[region].includes(value)) {
      grouped[region].push(value);
    }
  };

  SERVERS.forEach((server) => {
    const id = server.id ?? "";
    const upper = id.toUpperCase();
    if (upper.startsWith("EU")) push("EU", id);
    else if (upper.startsWith("US") || upper.startsWith("NA") || upper.startsWith("AM")) push("US", id);
    else if (upper.startsWith("F")) push("Fusion", id);
    else push("INT", id);
  });

  (Object.keys(grouped) as RegionKey[]).forEach((key) => {
    grouped[key].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
  });

  return grouped;
})();

// HUD -> Provider Sort mapping
function mapSort(
  sortBy: string
): { field: "Level" | "Base" | "Constitution" | "Sum Base Stats" | "Last Scan" | "Name"; dir: "asc" | "desc" } {
  switch (sortBy) {
    case "level":        return { field: "Level",           dir: "desc" };
    case "main":         return { field: "Base",            dir: "desc" };
    case "constitution": return { field: "Constitution",    dir: "desc" };
    case "sum":          return { field: "Sum Base Stats",  dir: "desc" };
    case "lastActivity": // solange nicht vorhanden → Last Scan
    case "lastScan":     return { field: "Last Scan",       dir: "desc" };
    case "name":         return { field: "Name",            dir: "asc" };
    default:             return { field: "Level",           dir: "desc" };
  }
}

export default function PlayerToplistsPage() {
  const f = useFilters(); // MUSS innerhalb FilterProvider laufen
  const {
    filterMode, setFilterMode,
    listView, setListView,
    bottomFilterOpen, setBottomFilterOpen,
    serverSheetOpen, setServerSheetOpen,
    servers, setServers,
    classes,
    range,
    sortBy,
  } = f;

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
        <ListSwitcher />

        {listView === "table" && (
          <ToplistsProvider>
            <TableDataView
              servers={servers ?? []}
              classes={classes ?? []}
              range={(range ?? "all") as any}
              sortKey={sortBy ?? "level"}
            />
          </ToplistsProvider>
        )}
      </ContentShell>

      <ServerSheet
        mode="modal"
        open={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        serversByRegion={SERVERS_BY_REGION}
        selected={servers}
        onToggle={(s: string) =>
          setServers((prev: string[]) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
        }
        onSelectAllInRegion={(region: RegionKey) => setServers(SERVERS_BY_REGION[region])}
        onClearAll={() => setServers([])}
      />

      <BottomFilterSheet
        open={filterMode === "sheet" && bottomFilterOpen}
        onClose={() => setBottomFilterOpen(false)}
      />
    </>
  );
}

function TableDataView({
  servers, classes, range, sortKey
}: {
  servers: string[];
  classes: string[];
  range: DaysFilter;
  sortKey: string;
}) {
  const { state, setFilters, setSort } = useToplistsData();
  const { loading, error, data, lastUpdated } = state;

  // HUD-Filter -> Provider
  useEffect(() => {
    const providerRange =
      range === "all" ? "all" : range === 60 ? "30d" : `${range}d`;
    setFilters({
      servers,
      classes,
      timeRange: providerRange as any,
    });
  }, [servers, classes, range, setFilters]);

  useEffect(() => {
    const s = mapSort(sortKey);
    setSort(s);
  }, [sortKey, setSort]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{loading ? "Loading…" : error ? "Error" : "Ready"} • {data.length} rows</div>
        <div>{lastUpdated ? `Updated: ${new Date((lastUpdated as number) * 1000).toLocaleString()}` : null}</div>
      </div>

      {error && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
              <th style={{ padding: "8px 6px" }}>#</th>
              <th style={{ padding: "8px 6px" }}>Δ Rank</th>
              <th style={{ padding: "8px 6px" }}>Server</th>
              <th style={{ padding: "8px 6px" }}>Name</th>
              <th style={{ padding: "8px 6px" }}>Class</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
              <th style={{ padding: "8px 6px" }}>Guild</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Main</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Con</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Sum Base Stats</th>
              <th style={{ padding: "8px 6px" }}>Ratio</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Mine</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Treasury</th>
              <th style={{ padding: "8px 6px" }}>Last Scan</th>
              <th style={{ padding: "8px 6px" }}>Stats+</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={`${r.Name}-${r.Server}-${i}`} style={{ borderBottom: "1px solid #2C4A73" }}>
                <td style={{ padding: "8px 6px" }}>{r["#"]}</td>
                <td style={{ padding: "8px 6px" }}>{r["Δ Rank"]}</td>
                <td style={{ padding: "8px 6px" }}>{r.Server}</td>
                <td style={{ padding: "8px 6px" }}>{r.Name}</td>
                <td style={{ padding: "8px 6px" }}>{r.Class}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.Level)}</td>
                <td style={{ padding: "8px 6px" }}>{r.Guild ?? ""}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.Main)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.Con)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r["Sum Base Stats"])}</td>
                <td style={{ padding: "8px 6px" }}>{r.Ratio ?? ""}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.Mine)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.Treasury)}</td>
                <td style={{ padding: "8px 6px" }}>{r["Last Scan"] ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{r["Stats+"]}</td>
              </tr>
            ))}
            {loading && data.length === 0 && (
              <tr><td colSpan={15} style={{ padding: 12 }}>Loading…</td></tr>
            )}
            {!loading && !error && data.length === 0 && (
              <tr><td colSpan={15} style={{ padding: 12 }}>No results</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
        <button aria-pressed={filterMode === "hud"} onClick={() => setFilterMode("hud")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={filterMode === "hud" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          HUD
        </button>
        <button aria-pressed={filterMode === "sheet"} onClick={() => setFilterMode("sheet")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={filterMode === "sheet" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Bottom Sheet
        </button>
        <button onClick={() => setBottomFilterOpen(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-white"
          style={{ border: "1px solid #2B4C73", background: "#14273E" }}
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
        <button aria-pressed={listView === "cards"} onClick={() => setListView("cards")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={listView === "cards" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Cards
        </button>
        <button aria-pressed={listView === "buttons"} onClick={() => setListView("buttons")}
          className="rounded-lg px-3 py-1.5 text-sm text-white border border-transparent"
          style={listView === "buttons" ? { background: "#25456B", borderColor: "#5C8BC6" } : {}}
        >
          Buttons
        </button>
        <button aria-pressed={listView === "table"} onClick={() => setListView("table")}
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
