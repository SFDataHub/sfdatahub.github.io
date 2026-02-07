import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

import ContentShell from "../../components/ContentShell";
import { useFilters, type DaysFilter } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";

import { ToplistsProvider, useToplistsData } from "../../context/ToplistsDataContext";
import GuildToplists from "./guildtoplists";
import type { RegionKey } from "../../components/Filters/serverGroups";

const splitListParam = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeServerList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry.trim().toUpperCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const normalizeClassList = (list: string[]) => {
  const set = new Set<string>();
  list.forEach((entry) => {
    const normalized = entry
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-");
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

const listEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// HUD -> Provider Sort mapping
function mapSort(sortBy: string): { key: string; dir: "asc" | "desc" } {
  switch (sortBy) {
    case "level":        return { key: "level",    dir: "desc" };
    case "main":         return { key: "main",     dir: "desc" };
    case "constitution": return { key: "con",      dir: "desc" };
    case "sum":          return { key: "sum",      dir: "desc" };
    case "lastActivity": // solange nicht vorhanden -> Last Scan
    case "lastScan":     return { key: "lastScan", dir: "desc" };
    case "name":         return { key: "name",     dir: "asc" };
    default:              return { key: "level",    dir: "desc" };
  }
}

function deriveGroupFromServers(servers: string[]): string {
  const first = (servers[0] || "").toUpperCase();
  if (first.startsWith("EU")) return "EU";
  if (first.startsWith("US") || first.startsWith("NA") || first.startsWith("AM")) return "US";
  if (first.startsWith("F")) return "FUSION";
  if (first) return "INT";
  return "EU";
}

export default function PlayerToplistsPage() {
  return (
    <ToplistsProvider>
      <PlayerToplistsPageContent />
    </ToplistsProvider>
  );
}

function PlayerToplistsPageContent() {
  const f = useFilters(); // MUSS innerhalb FilterProvider laufen
  const {
    filterMode, setFilterMode,
    listView, setListView,
    bottomFilterOpen, setBottomFilterOpen,
    serverSheetOpen, setServerSheetOpen,
    servers, setServers,
    classes, setClasses,
    range,
    sortBy,
  } = f;
  const { serverGroups } = useToplistsData();
  const [searchParams, setSearchParams] = useSearchParams();
  const serverParam = searchParams.get("server");
  const serversParam = searchParams.get("servers");
  const classParam = searchParams.get("class");
  const classesParam = searchParams.get("classes");
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "guilds" ? "guilds" : "players";
  const normalizedServers = React.useMemo(() => normalizeServerList(servers ?? []), [servers]);
  const normalizedClasses = React.useMemo(() => normalizeClassList(classes ?? []), [classes]);

  const urlServers = React.useMemo(() => {
    const raw = serverParam ?? serversParam;
    return normalizeServerList(splitListParam(raw));
  }, [serverParam, serversParam]);
  const urlClasses = React.useMemo(() => {
    const raw = classParam ?? classesParam;
    return normalizeClassList(splitListParam(raw));
  }, [classParam, classesParam]);

  const urlServersProvided = serverParam != null || serversParam != null;
  const urlClassesProvided = classParam != null || classesParam != null;

  const defaultServer = React.useMemo(() => {
    const fallback =
      serverGroups?.EU?.[0] ||
      Object.values(serverGroups || {}).find((list) => list.length)?.[0] ||
      "";
    return fallback ? fallback.toUpperCase() : "";
  }, [serverGroups]);

  const searchKey = React.useMemo(() => searchParams.toString(), [searchParams]);
  const normalizedServersKey = normalizedServers.join(",");
  const normalizedClassesKey = normalizedClasses.join(",");
  const urlServersKey = urlServers.join(",");
  const urlClassesKey = urlClasses.join(",");

  const normalizedServersRef = React.useRef(normalizedServers);
  const normalizedClassesRef = React.useRef(normalizedClasses);
  const setServersRef = React.useRef(setServers);
  const setClassesRef = React.useRef(setClasses);
  const lastUrlWriteRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    normalizedServersRef.current = normalizedServers;
  }, [normalizedServers]);

  React.useEffect(() => {
    normalizedClassesRef.current = normalizedClasses;
  }, [normalizedClasses]);

  React.useEffect(() => {
    setServersRef.current = setServers;
  }, [setServers]);

  React.useEffect(() => {
    setClassesRef.current = setClasses;
  }, [setClasses]);

  useEffect(() => {
    if (lastUrlWriteRef.current === searchKey) {
      lastUrlWriteRef.current = null;
      return;
    }

    if (urlServersProvided) {
      const nextServers =
        urlServers.length > 0 ? urlServers : defaultServer ? [defaultServer] : [];
      if (!listEqual(normalizedServersRef.current, nextServers)) {
        setServersRef.current(nextServers);
      }
    } else if (!normalizedServersRef.current.length && defaultServer) {
      setServersRef.current([defaultServer]);
    }

    if (urlClassesProvided && !listEqual(normalizedClassesRef.current, urlClasses)) {
      setClassesRef.current(urlClasses);
    }
  }, [
    searchKey,
    urlServersProvided,
    urlClassesProvided,
    defaultServer,
    urlServersKey,
    urlClassesKey,
  ]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    const nextServers = normalizedServersKey;
    const nextClasses = normalizedClassesKey;

    if (nextServers) {
      nextParams.set("server", nextServers);
    } else {
      nextParams.delete("server");
    }
    nextParams.delete("servers");

    if (nextClasses) {
      nextParams.set("class", nextClasses);
    } else {
      nextParams.delete("class");
    }
    nextParams.delete("classes");

    const nextKey = nextParams.toString();
    if (nextKey !== searchKey) {
      lastUrlWriteRef.current = nextKey;
      setSearchParams(nextParams, { replace: true });
    }
  }, [normalizedServersKey, normalizedClassesKey, searchKey, searchParams, setSearchParams]);

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

        {activeTab === "players" && listView === "table" && (
          <TableDataView
            servers={servers ?? []}
            classes={classes ?? []}
            range={(range ?? "all") as any}
            sortKey={sortBy ?? "level"}
          />
        )}
        {activeTab === "guilds" && <GuildToplists serverCodes={servers ?? []} />}
      </ContentShell>

      <ServerSheet
        mode="modal"
        open={serverSheetOpen}
        onClose={() => setServerSheetOpen(false)}
        serversByRegion={serverGroups}
        selected={servers}
        onToggle={(s: string) =>
          setServers((prev: string[]) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
        }
        onSelectAllInRegion={(region: RegionKey) => setServers(serverGroups[region] ?? [])}
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
  const {
    playerRows,
    playerLoading,
    playerError,
    playerLastUpdatedAt,
    playerScopeStatus,
    setFilters,
    setSort,
  } = useToplistsData();

  // HUD-Filter -> Provider
  useEffect(() => {
    const providerRange =
      range === "all" ? "all" : range === 60 ? "30d" : `${range}d`;
    const normalized = normalizeServerList(servers);
    const normalizedCls = normalizeClassList(classes);
    const group = deriveGroupFromServers(normalized);
    setFilters({
      servers: normalized,
      classes: normalizedCls,
      timeRange: providerRange as any,
      group,
    });
  }, [servers, classes, range, setFilters]);

  useEffect(() => {
    const s = mapSort(sortKey);
    setSort(s);
  }, [sortKey, setSort]);

  const fmtNum = (n: number | null | undefined) => (n == null ? "" : new Intl.NumberFormat("en").format(n));
  const fmtDelta = (n: number | null | undefined) => {
    if (n == null) return "";
    const formatted = fmtNum(Math.abs(n));
    if (!formatted) return String(n);
    return n > 0 ? `+${formatted}` : `-${formatted}`;
  };
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString();
  };
  const fmtDateObj = (d: Date | null | undefined) => (d ? d.toLocaleString() : "—");

  const rows = playerRows || [];

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{playerLoading ? "Loading..." : playerError ? "Error" : "Ready"} - {rows.length} rows</div>
        <div>{playerLastUpdatedAt ? `Updated: ${fmtDate(playerLastUpdatedAt)}` : null}</div>
      </div>
      {playerScopeStatus && (
        <div style={{ opacity: 0.75, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>
            Scope {playerScopeStatus.scopeId} • {playerScopeStatus.changesSinceLastRebuild}/{playerScopeStatus.minChanges ?? "?"} changes since last rebuild
          </span>
          <span>
            Auto rebuild at {playerScopeStatus.minChanges ?? "?"} changes or after {playerScopeStatus.maxAgeDays ?? "?"} days
          </span>
          <span>
            Last rebuild: {fmtDateObj(playerScopeStatus.lastRebuildAt)}
          </span>
        </div>
      )}

      {playerError && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{playerError}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="toplists-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
              <th style={{ padding: "8px 6px" }}>#</th>
              <th style={{ padding: "8px 6px" }}>Flag</th>
              <th style={{ padding: "8px 6px" }}>Delta Rank</th>
              <th style={{ padding: "8px 6px" }}>Server</th>
              <th style={{ padding: "8px 6px" }}>Name</th>
              <th style={{ padding: "8px 6px" }}>Class</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
              <th style={{ padding: "8px 6px" }}>Guild</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Main</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Con</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Sum</th>
              <th style={{ padding: "8px 6px" }}>Ratio</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Mine</th>
              <th style={{ padding: "8px 6px", textAlign: "right" }}>Treasury</th>
              <th style={{ padding: "8px 6px" }}>Last Scan</th>
              <th style={{ padding: "8px 6px" }}>Stats+</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.name}__${r.server}__${r.class ?? ""}`}
                className="toplists-row"
                style={{ borderBottom: "1px solid #2C4A73" }}
              >
                <td style={{ padding: "8px 6px" }}>{i + 1}</td>
                <td style={{ padding: "8px 6px" }}>{r.flag ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{fmtDelta(r.deltaRank)}</td>
                <td style={{ padding: "8px 6px" }}>{r.server}</td>
                <td style={{ padding: "8px 6px" }}>{r.name}</td>
                <td style={{ padding: "8px 6px" }}>{r.class}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.level)}</td>
                <td style={{ padding: "8px 6px" }}>{r.guild ?? ""}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.main)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.con)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.sum)}</td>
                <td style={{ padding: "8px 6px" }}>{r.ratio ?? ""}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.mine)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtNum(r.treasury)}</td>
                <td style={{ padding: "8px 6px" }}>{r.lastScan ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{fmtDelta(r.deltaSum)}</td>
              </tr>
            ))}
            {playerLoading && rows.length === 0 && (
              <tr><td colSpan={16} style={{ padding: 12 }}>Loading...</td></tr>
            )}
            {!playerLoading && !playerError && rows.length === 0 && (
              <tr><td colSpan={16} style={{ padding: 12 }}>No results</td></tr>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "guilds" ? "guilds" : "players";

  const setTab = (next: "players" | "guilds") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", next);
    setSearchParams(nextParams);
  };

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <nav
        className="inline-flex gap-1 rounded-xl border p-1"
        style={{ borderColor: "#2B4C73", background: "#14273E" }}
        aria-label="Toplist Tabs"
      >
        <TopTab active={activeTab === "players"} onClick={() => setTab("players")} label="Players" />
        <TopTab active={activeTab === "guilds"} onClick={() => setTab("guilds")} label="Guilds" />
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
        Servers
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

function TopTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-sm text-white border",
        active ? "bg-[#25456B] border-[#5C8BC6]" : "border-transparent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
