import React, { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toPng } from "html-to-image";

import ContentShell from "../../components/ContentShell";
import { useFilters, type DaysFilter } from "../../components/Filters/FilterContext";
import HudFilters from "../../components/Filters/HudFilters";
import ServerSheet from "../../components/Filters/ServerSheet";
import BottomFilterSheet from "../../components/Filters/BottomFilterSheet";
import ListSwitcher from "../../components/Filters/ListSwitcher";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";

import { ToplistsProvider, useToplistsData, type Filters, type SortSpec } from "../../context/ToplistsDataContext";
import GuildToplists from "./guildtoplists";
import type { RegionKey } from "../../components/Filters/serverGroups";
import {
  getPlayerToplistSnapshotByDocIdCached,
  type FirestoreLatestToplistSnapshot,
  type FirestoreToplistPlayerRow,
  type FirestoreLatestToplistResult,
} from "../../lib/api/toplistsFirestore";

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

const normalizeCompareServerKey = (value: string) => {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "";
  const hostMatch = raw.match(/^S(\d+)(?:\.EU)?$/);
  if (hostMatch) return `EU${hostMatch[1]}`;
  const euMatch = raw.match(/^EU(\d+)$/);
  if (euMatch) return `EU${euMatch[1]}`;
  return raw;
};

const buildCompareDocId = (serverKey: string, month: string) =>
  `${normalizeCompareServerKey(serverKey)}__${month}`;
type CompareSnapshotScope = "players" | "guilds";
type CompareSnapshotState = {
  rows: FirestoreToplistPlayerRow[];
  baselineServers: string[];
  missingServers: string[];
  error: string | null;
};

const COMPARE_SNAPSHOT_CACHE_PREFIX = "sf_compare_snapshot";

const normalizeCompareSnapshotServers = (servers: string[]) => {
  const set = new Set<string>();
  servers.forEach((server) => {
    const normalized = normalizeCompareServerKey(server).trim().toLowerCase();
    if (normalized) set.add(normalized);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
};

const buildCompareSnapshotCacheKey = ({
  scope,
  servers,
  month,
  mode,
}: {
  scope: CompareSnapshotScope;
  servers: string[];
  month: string;
  mode?: string;
}) => {
  const monthKey = String(month ?? "").trim();
  const serversKey = normalizeCompareSnapshotServers(servers).join("+");
  const modeKey = String(mode ?? "").trim();
  const modeSuffix = modeKey ? `__${modeKey.toLowerCase()}` : "";
  return `${COMPARE_SNAPSHOT_CACHE_PREFIX}__${scope}__${serversKey}__${monthKey}${modeSuffix}`;
};

const readCompareSnapshotCache = (key: string): CompareSnapshotState | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = parsed as Partial<CompareSnapshotState>;
    if (!Array.isArray(maybe.rows)) return null;
    if (!Array.isArray(maybe.baselineServers)) return null;
    if (!Array.isArray(maybe.missingServers)) return null;
    if (maybe.error != null && typeof maybe.error !== "string") return null;
    return {
      rows: maybe.rows as FirestoreToplistPlayerRow[],
      baselineServers: maybe.baselineServers.map((server) => String(server || "").trim()).filter(Boolean),
      missingServers: maybe.missingServers.map((server) => String(server || "").trim()).filter(Boolean),
      error: maybe.error ?? null,
    };
  } catch {
    return null;
  }
};

const writeCompareSnapshotCache = (key: string, value: CompareSnapshotState) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage write errors (quota/privacy mode)
  }
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

const normalizeGuildKey = (value: string | null | undefined) =>
  (value ?? "").toString().trim().toLowerCase();

const listEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const formatMonth = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;

const generateRecentMonths = (count: number) => {
  const months: string[] = [];
  const cursor = new Date();
  // Only include fully completed months: start from previous month.
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  for (let i = 0; i < count; i++) {
    months.push(formatMonth(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
};

const MIN_COMPARE_MONTH = "2026-01";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const computeLastScanColor = (lastScan: unknown, nowMs: number): string | null => {
  if (!lastScan) return null;
  let ts: number | null = null;
  if (typeof lastScan === "number") {
    ts = lastScan < 1e12 ? lastScan * 1000 : lastScan;
  } else {
    const raw = String(lastScan).trim();
    if (!raw) return null;
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      ts = n < 1e12 ? n * 1000 : n;
    } else {
      ts = parseLastScanString(raw);
    }
  }
  if (ts == null || !Number.isFinite(ts)) return null;
  const days = Math.max(0, Math.floor((nowMs - ts) / MS_PER_DAY));
  if (days <= 0) return "#34d399"; // today
  if (days === 1) return "#4ade80";
  if (days <= 3) return "#a3e635";
  if (days <= 7) return "#facc15";
  if (days <= 14) return "#f97316";
  if (days <= 30) return "#ef4444";
  return "#b91c1c";
};

const toNumberSafe = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const normalizeServerCode = (value: string) => value.trim().toUpperCase();
const normalizeClass = (value: string | null | undefined) =>
  value != null
    ? value
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
    : "";
function parseLastScanString(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+/);
  const datePart = parts[0] ?? "";
  const timePart = parts[1] ?? "";
  const dateBits = datePart.split(".");
  if (dateBits.length !== 3) return null;
  const day = Number(dateBits[0]);
  const month = Number(dateBits[1]);
  const year = Number(dateBits[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  let hours = 0;
  let minutes = 0;
  if (timePart) {
    const timeBits = timePart.split(":");
    if (timeBits.length < 2) return null;
    hours = Number(timeBits[0]);
    minutes = Number(timeBits[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  }
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}
const toMsFromLastScan = (value: string | number | null | undefined): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  return parseLastScanString(raw);
};
const deriveRatioMain = (main: number | null, con: number | null) => {
  const m = typeof main === "number" && Number.isFinite(main) ? main : 0;
  const c = typeof con === "number" && Number.isFinite(con) ? con : 0;
  const total = m + c;
  if (!(total > 0)) return null;
  return Math.round((m / total) * 100);
};
const computeStatsDay = (
  current: FirestoreToplistPlayerRow | null | undefined,
  baseline: FirestoreToplistPlayerRow | null | undefined,
  sumDeltaOverride?: number | null,
) => {
  if (!current || !baseline) return { days: null as number | null, perDay: null as number | null };
  const currentMs = toMsFromLastScan((current as any).lastScan);
  const baselineMs = toMsFromLastScan((baseline as any).lastScan);
  if (currentMs == null || baselineMs == null) {
    return { days: null as number | null, perDay: null as number | null };
  }
  const daysRaw = Math.abs(currentMs - baselineMs) / MS_PER_DAY;
  const days = Math.max(1, Math.round(daysRaw));
  let sumDelta = sumDeltaOverride;
  if (sumDelta == null) {
    const currSum = toNumberSafe((current as any).sum);
    const prevSum = toNumberSafe((baseline as any).sum);
    if (prevSum != null) {
      sumDelta = (currSum ?? 0) - prevSum;
    }
  }
  const perDay = sumDelta != null ? Math.round(sumDelta / days) : null;
  return { days, perDay };
};
const buildTieKey = (row: FirestoreToplistPlayerRow) => {
  const serverKey = normalizeServerCode(String(row.server ?? ""));
  const pid = (row as any).playerId ?? (row as any).id ?? null;
  const idKey = String(pid ?? row.name ?? "").trim();
  const classKey = String(row.class ?? "").trim();
  return `${serverKey}__${idKey}__${classKey}`;
};
const filterToplistRows = (rows: FirestoreToplistPlayerRow[], filters: Filters) => {
  const serverFilter = Array.isArray(filters.servers) ? filters.servers : [];
  const serverSet = serverFilter.length ? new Set(serverFilter.map(normalizeServerCode)) : null;
  const classFilter = Array.isArray(filters.classes) ? filters.classes : [];
  const classSet = classFilter.length ? new Set(classFilter.map(normalizeClass)) : null;
  const rangeDays = filters.timeRange === "all" ? null : Number(String(filters.timeRange).replace("d", ""));
  const cutoffMs = rangeDays && Number.isFinite(rangeDays) ? Date.now() - rangeDays * 86400000 : null;

  return rows.filter((row) => {
    if (serverSet && !serverSet.has(normalizeServerCode(String(row.server ?? "")))) return false;
    if (classSet && !classSet.has(normalizeClass(row.class))) return false;
    if (cutoffMs != null) {
      const lastScanMs = toMsFromLastScan(row.lastScan);
      if (lastScanMs != null && lastScanMs < cutoffMs) return false;
    }
    return true;
  });
};
const sortToplistRows = (rows: FirestoreToplistPlayerRow[], sort: SortSpec) => {
  const compareNumber = (aVal: number | null, bVal: number | null) => {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const diff = aVal - bVal;
    return sort.dir === "asc" ? diff : -diff;
  };
  const compareText = (aVal: string | null, bVal: string | null) => {
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const diff = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? diff : -diff;
  };
  const compareTie = (a: FirestoreToplistPlayerRow, b: FirestoreToplistPlayerRow) => {
    const cmp = buildTieKey(a).localeCompare(buildTieKey(b), undefined, { numeric: true, sensitivity: "base" });
    return sort.dir === "asc" ? cmp : -cmp;
  };

  rows.sort((a, b) => {
    let result = 0;
    switch (sort.key) {
      case "name": {
        const aName = String(a.name ?? "");
        const bName = String(b.name ?? "");
        const cmp = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        result = sort.dir === "asc" ? cmp : -cmp;
        break;
      }
      case "lastScan": {
        const aMs = toMsFromLastScan(a.lastScan);
        const bMs = toMsFromLastScan(b.lastScan);
        result = compareNumber(aMs == null ? null : aMs, bMs == null ? null : bMs);
        break;
      }
      case "main":
        result = compareNumber(a.main, b.main);
        break;
      case "con":
        result = compareNumber(a.con, b.con);
        break;
      case "sum":
        result = compareNumber((a as any)._calculatedSum, (b as any)._calculatedSum);
        break;
      case "statsDay":
        result = compareNumber((a as any)._statsPerDay, (b as any)._statsPerDay);
        break;
      case "ratio":
        result = compareNumber((a as any)._ratioMain, (b as any)._ratioMain);
        break;
      case "mine":
        result = compareNumber(a.mine, b.mine);
        break;
      case "treasury":
        result = compareNumber(a.treasury, b.treasury);
        break;
      case "mainTotal":
        result = compareNumber(a.mainTotal, b.mainTotal);
        break;
      case "conTotal":
        result = compareNumber(a.conTotal, b.conTotal);
        break;
      case "sumTotal":
        result = compareNumber(a.sumTotal, b.sumTotal);
        break;
      case "xpProgress":
        result = compareNumber(a.xpProgress, b.xpProgress);
        break;
      case "xpTotal":
        result = compareNumber(a.xpTotal, b.xpTotal);
        break;
      case "level":
      default:
        result = compareNumber(a.level, b.level);
        break;
    }
    if (result !== 0) return result;
    return compareTie(a, b);
  });

  return rows;
};
type CellDecor = {
  mainRank?: number;
  conRank?: number;
  levelRank?: number;
  mineTier?: 1 | 2 | 3 | 4;
};

const MAIN_RANK_COLORS = ["#f6e7a6", "#f4de89", "#f2d56d", "#f0cc51", "#edc236"];
const CON_RANK_COLORS = ["#ffe4b3", "#ffdda0", "#ffd68d", "#ffcf7a", "#ffc867"];
const LEVEL_RANK_COLORS = ["#9ec5ff", "#8ab7ff", "#76a9ff", "#629bff", "#4e8dff"];
const MINE_TIER_COLORS: Record<number, string> = {
  1: "#d8b4fe",
  2: "#c084fc",
  3: "#a855f7",
  4: "#f472b6",
};
const getRankTone = (rank: number | undefined, palette: string[]) =>
  rank && rank > 0 && rank <= palette.length ? palette[rank - 1] : null;
const getMineTone = (tier: number | undefined) =>
  tier ? MINE_TIER_COLORS[tier] ?? null : null;
const getFrameStyle = (color?: string | null): React.CSSProperties | undefined =>
  color
    ? {
        boxShadow: `inset 0 0 0 1px ${color}`,
        borderRadius: 6,
        padding: "0 4px",
        display: "inline-flex",
        alignItems: "center",
      }
    : undefined;

// HUD -> Provider Sort mapping
function mapSort(sortBy: string): { key: string; dir: "asc" | "desc" } {
  switch (sortBy) {
    case "level":        return { key: "level",    dir: "desc" };
    case "main":         return { key: "main",     dir: "desc" };
    case "constitution": return { key: "con",      dir: "desc" };
    case "sum":          return { key: "sum",      dir: "desc" };
    case "statsDay":     return { key: "statsDay", dir: "desc" };
    case "mine":         return { key: "mine",     dir: "desc" };
    case "mainTotal":    return { key: "mainTotal", dir: "desc" };
    case "conTotal":     return { key: "conTotal",  dir: "desc" };
    case "sumTotal":     return { key: "sumTotal",  dir: "desc" };
    case "xpProgress":   return { key: "xpProgress", dir: "desc" };
    case "xpTotal":      return { key: "xpTotal",   dir: "desc" };
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
    setGuilds,
    range,
    sortBy,
  } = f;
  const { serverGroups, player } = useToplistsData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const serverParam = searchParams.get("server");
  const serversParam = searchParams.get("servers");
  const classParam = searchParams.get("class");
  const classesParam = searchParams.get("classes");
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "guilds" ? "guilds" : "players";
  const [compareMonth, setCompareMonth] = React.useState<string>(searchParams.get("compare") ?? "");
  const monthOptions = React.useMemo(
    () => generateRecentMonths(17).filter((m) => m >= MIN_COMPARE_MONTH),
    [],
  );
  const hasServersSelected = (servers?.length ?? 0) > 0;
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

  const searchKey = React.useMemo(() => searchParams.toString(), [searchParams]);
  const normalizedServersKey = normalizedServers.join(",");
  const normalizedClassesKey = normalizedClasses.join(",");
  const urlServersKey = urlServers.join(",");
  const urlClassesKey = urlClasses.join(",");
  const prevServersKeyRef = React.useRef<string | null>(null);

  const normalizedServersRef = React.useRef(normalizedServers);
  const normalizedClassesRef = React.useRef(normalizedClasses);
  const setServersRef = React.useRef(setServers);
  const setClassesRef = React.useRef(setClasses);
  const lastUrlWriteRef = React.useRef<string | null>(null);
  const tableRef = React.useRef<HTMLDivElement | null>(null);

  const handleExportPng = async () => {
    if (typeof document === "undefined") return;
    const tableRoot = tableRef.current;
    if (!tableRoot) return;

    const resolveExportBackground = () => {
      let node: HTMLElement | null = tableRoot;
      while (node) {
        const color = window.getComputedStyle(node).backgroundColor;
        if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
          return color;
        }
        node = node.parentElement;
      }
      return "#0C1C2E";
    };

    const cloned = tableRoot.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.loading = "eager";
      img.decoding = "sync";
    });

    const tbodyRows = Array.from(cloned.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    if (tbodyRows.length > 50) {
      tbodyRows.slice(50).forEach((row) => row.remove());
    } else if (tbodyRows.length === 0) {
      const roleRows = Array.from(cloned.querySelectorAll<HTMLElement>('[role="row"]'));
      const bodyRows = roleRows.filter((row) => {
        if (row.closest("thead")) return false;
        if (row.querySelector('[role="columnheader"]')) return false;
        return true;
      });
      if (bodyRows.length > 50) {
        bodyRows.slice(50).forEach((row) => row.remove());
      }
    }

    const backgroundColor = resolveExportBackground();
    const temp = document.createElement("div");
    temp.setAttribute("aria-hidden", "true");
    temp.style.position = "fixed";
    temp.style.top = "0";
    temp.style.left = "0";
    temp.style.transform = "translate3d(-10000px, 0, 0)";
    temp.style.pointerEvents = "none";
    temp.style.padding = "0";
    temp.style.background = backgroundColor;
    temp.style.width = `${Math.max(1, tableRoot.offsetWidth)}px`;
    temp.appendChild(cloned);
    document.body.appendChild(temp);

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const dataUrl = await toPng(temp, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor,
      });
      const link = document.createElement("a");
      link.download = "sfdatahub_toplist.png";
      link.href = dataUrl;
      link.click();
    } finally {
      temp.remove();
    }
  };

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

  React.useEffect(() => {
    const prevKey = prevServersKeyRef.current;
    prevServersKeyRef.current = normalizedServersKey;
    if (prevKey != null && prevKey !== normalizedServersKey) {
      setGuilds([]);
    }
  }, [normalizedServersKey, setGuilds]);

  useEffect(() => {
    if (lastUrlWriteRef.current === searchKey) {
      lastUrlWriteRef.current = null;
      return;
    }

    if (urlServersProvided) {
      const nextServers = urlServers;
      if (!listEqual(normalizedServersRef.current, nextServers)) {
        setServersRef.current(nextServers);
      }
    }

    if (urlClassesProvided && !listEqual(normalizedClassesRef.current, urlClasses)) {
      setClassesRef.current(urlClasses);
    }
  }, [
    searchKey,
    urlServersProvided,
    urlClassesProvided,
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

  const guildOptions = React.useMemo(() => {
    const rows = Array.isArray(player?.rows) ? player.rows : [];
    if (!rows.length) return [];
    const map = new Map<string, { value: string; label: string }>();
    rows.forEach((row) => {
      const name = String(row.guild ?? "").trim();
      if (!name) return;
      const key = normalizeGuildKey(name);
      if (!key) return;
      const serverCode =
        (row.server && String(row.server).trim().toUpperCase()) ||
        (normalizedServers.length === 1 ? normalizedServers[0] : "");
      const label = serverCode ? `${name} (${serverCode})` : name;
      if (!map.has(key)) {
        map.set(key, { value: name, label });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }, [player?.rows, normalizedServers]);

  return (
    <>
      <ContentShell
        mode="card"
        title="Top Lists"
        actions={<TopActions />}
        leftWidth={0}
        rightWidth={0}
        subheader={
          filterMode === "hud" ? (
            <HudFilters
              compareMonth={compareMonth}
              setCompareMonth={setCompareMonth}
              monthOptions={monthOptions}
              guildOptions={guildOptions}
              onExportPng={handleExportPng}
              exportDisabled={!hasServersSelected || activeTab !== "players" || listView !== "table"}
            />
          ) : null
        }
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
            compareMonth={compareMonth}
            tableRef={tableRef}
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
  servers, classes, range, sortKey, compareMonth, tableRef,
}: {
  servers: string[];
  classes: string[];
  range: DaysFilter;
  sortKey: string;
  compareMonth: string;
  tableRef: React.RefObject<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const { guilds } = useFilters();
  const {
    player,
    playerRows,
    playerLoading,
    playerError,
    playerLastUpdatedAt,
    playerScopeStatus,
    filters,
    sort,
    setFilters,
    setSort,
  } = useToplistsData();
  const navigate = useNavigate();
  const location = useLocation();

  const hasServers = (servers?.length ?? 0) > 0;
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
  const getRankDeltaDisplay = (value: number | string | null | undefined, compareMissing: boolean) => {
    if (compareMissing) {
      return { text: "n/a", variant: "na" as const };
    }
    if (value == null || value === "") {
      return { text: "n/a", variant: "na" as const };
    }
    let parsed: number | null = null;
    if (typeof value === "number") {
      parsed = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || /^n\/a$/i.test(trimmed)) {
        return { text: "n/a", variant: "na" as const };
      }
      const numeric = Number(trimmed);
      parsed = Number.isFinite(numeric) ? numeric : null;
    }
    if (parsed == null || !Number.isFinite(parsed)) {
      return { text: "n/a", variant: "na" as const };
    }
    if (parsed === 0 || Object.is(parsed, -0)) {
      return { text: "-", variant: "zero" as const };
    }
    const absText = fmtNum(Math.abs(parsed));
    const signedText = parsed > 0 ? `+${absText}` : `-${absText}`;
    return { text: signedText, variant: parsed > 0 ? "pos" as const : "neg" as const };
  };
  const getStatsDayVariant = (value: number | null | undefined, avg: number | null) => {
    if (value == null || avg == null || !Number.isFinite(value) || !Number.isFinite(avg) || avg === 0) return "";
    const ratio = value / avg;
    if (ratio >= 1.25) return "pos2";
    if (ratio >= 1.10) return "pos1";
    if (ratio >= 0.95) return "mid0";
    if (ratio >= 0.80) return "mid1";
    if (ratio >= 0.60) return "neg1";
    if (ratio > 0) return "neg2";
    return "neg3";
  };
  const fmtDate = (ts: number | null | undefined) => {
    if (ts == null) return null;
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleString();
  };
  const fmtDateObj = (d: Date | null | undefined) => (d ? d.toLocaleString() : "�");

  const rows = playerRows || [];
  const selectedGuildSet = React.useMemo(() => {
    const keys = (guilds || []).map(normalizeGuildKey).filter(Boolean);
    return keys.length ? new Set(keys) : null;
  }, [guilds]);
  const hasGuildData = React.useMemo(() => {
    const rawRows = Array.isArray(player?.rows) ? player.rows : [];
    return rawRows.some((row) => Boolean(normalizeGuildKey(row.guild)));
  }, [player?.rows]);

  const filteredRows = React.useMemo(() => {
    if (!selectedGuildSet || !hasGuildData) return rows;
    return rows.filter((row) => {
      const key = normalizeGuildKey(row.guild);
      return key ? selectedGuildSet.has(key) : false;
    });
  }, [rows, selectedGuildSet, hasGuildData]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [compareState, setCompareState] = React.useState<{
    rows: FirestoreToplistPlayerRow[];
    loading: boolean;
    baselineServers: string[];
    missingServers: string[];
    error: string | null;
  }>({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });

  const showCompare = Boolean(compareMonth) && !compareState.loading;

  const compareServersKey = React.useMemo(
    () => normalizeServerList(servers).join(","),
    [servers]
  );
  const compareServers = React.useMemo(
    () => (compareServersKey ? compareServersKey.split(",").filter(Boolean) : []),
    [compareServersKey]
  );
  const baselineServerSet = React.useMemo(() => {
    const normalized = (compareState.baselineServers || [])
      .map((server) => String(server).trim().toUpperCase())
      .filter(Boolean);
    return new Set(normalized);
  }, [compareState.baselineServers]);

  // persist compare selection in URL (optional param)
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (compareMonth) {
      nextParams.set("compare", compareMonth);
    } else {
      nextParams.delete("compare");
    }
    const prev = searchParams.get("compare") ?? "";
    if (prev !== compareMonth) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [compareMonth, searchParams, setSearchParams]);

  // Load monthly snapshot(s) for comparison
  useEffect(() => {
    let cancelled = false;
    const normalizedCompareMonth = String(compareMonth ?? "").trim();
    const compareDisabled =
      !normalizedCompareMonth || normalizedCompareMonth.toLowerCase() === "off";

    if (compareDisabled) {
      setCompareState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    if (!compareServers.length) {
      setCompareState({ rows: [], loading: false, baselineServers: [], missingServers: [], error: null });
      return () => {
        cancelled = true;
      };
    }

    const docIds = compareServers.map((s) => buildCompareDocId(s, normalizedCompareMonth));
    const compareCacheKey = buildCompareSnapshotCacheKey({
      scope: "players",
      servers: compareServers,
      month: normalizedCompareMonth,
    });
    const cachedCompareState = readCompareSnapshotCache(compareCacheKey);
    if (cachedCompareState) {
      setCompareState({
        ...cachedCompareState,
        loading: false,
      });
      return () => {
        cancelled = true;
      };
    }

    const mergeSnapshots = (snapshots: FirestoreLatestToplistSnapshot[]) => {
      const mergedRows: FirestoreToplistPlayerRow[] = [];
      for (const snapshot of snapshots) {
        const players = Array.isArray(snapshot.players) ? snapshot.players : [];
        for (const row of players) mergedRows.push({ ...row, server: snapshot.server || row.server });
      }
      return mergedRows;
    };
    setCompareState((prev) => ({
      ...prev,
      loading: true,
      baselineServers: [],
      missingServers: [],
      error: null,
    }));

    (async () => {
      const results: FirestoreLatestToplistResult[] = await Promise.all(
        docIds.map((docId) => getPlayerToplistSnapshotByDocIdCached(docId))
      );
      if (cancelled) return;

      const snapshots: FirestoreLatestToplistSnapshot[] = [];
      const baselineServers: string[] = [];
      const missingServers: string[] = [];
      let firstErrorCode: string | null = null;
      let firstErrorDetail: string | null = null;

      results.forEach((result: FirestoreLatestToplistResult, idx) => {
        const docId = docIds[idx];
        if (result.ok) {
          const serverKey = (docId.split("__")[0] || "").trim();
          baselineServers.push(serverKey);
          snapshots.push({
            ...result.snapshot,
            server: serverKey || result.snapshot.server,
          });
        } else {
          const err: any = result;
          missingServers.push(docId);
          if (!firstErrorCode) {
            firstErrorCode = err.error ?? null;
            firstErrorDetail = err.detail ?? null;
          }
        }
      });

      const mergedRows = snapshots.length ? mergeSnapshots(snapshots) : [];
      const missingKey = missingServers.length ? missingServers.join(", ") : null;
      const errorMsg = missingServers.length
        ? t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey ?? "" })
        : (firstErrorDetail ?? firstErrorCode ?? null);

      const nextState = {
        rows: mergedRows,
        loading: false,
        baselineServers,
        missingServers,
        error: errorMsg,
      };
      setCompareState(nextState);
      if (!missingServers.length) {
        writeCompareSnapshotCache(compareCacheKey, {
          rows: nextState.rows,
          baselineServers: nextState.baselineServers,
          missingServers: [],
          error: null,
        });
      }
    })().catch((err) => {
      if (cancelled) return;
      const missingKey = docIds.join(", ");
      const msg = t("toplists.compareMissingSnapshot", "Baseline missing for {{key}}.", { key: missingKey });
      setCompareState({
        rows: [],
        loading: false,
        baselineServers: [],
        missingServers: docIds,
        error: msg,
      });
      console.warn("[ToplistsPlayersCompare] snapshot fetch failed", err);
    });

    return () => {
      cancelled = true;
    };
  }, [compareMonth, compareServersKey, t]);

  const buildRowKey = React.useCallback((row: FirestoreToplistPlayerRow) => {
    const pid = (row as any).playerId ?? (row as any).id;
    if (pid) return `id:${pid}`;
    return `${row.server || "ALL"}:${row.name}:${row.class || ""}`;
  }, []);
  const buildCompareKey = React.useCallback((row: FirestoreToplistPlayerRow) => {
    const serverKey = normalizeServerCode(String(row.server ?? ""));
    const pid = (row as any).playerId ?? (row as any).id;
    const pidKey = pid != null ? String(pid).trim() : "";
    if (serverKey && pidKey) return `${serverKey}__${pidKey}`;
    const nameKey = String(row.name ?? "").trim();
    const classKey = String(row.class ?? "").trim();
    if (serverKey || nameKey || classKey) return `${serverKey}__${nameKey}__${classKey}`;
    return buildRowKey(row);
  }, [buildRowKey]);

  const baselineRowByKey = React.useMemo(() => {
    const map = new Map<string, FirestoreToplistPlayerRow>();
    if (!showCompare) return map;
    compareState.rows.forEach((row) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, row);
      }
    });
    return map;
  }, [showCompare, compareState.rows, buildCompareKey]);

  const currentRowsWithCompare = React.useMemo(() => {
    if (!showCompare) return filteredRows;
    return filteredRows.map((row) => {
      const key = buildCompareKey(row);
      const past = baselineRowByKey.get(key);
      const serverKey = normalizeServerCode(String((row as any).server ?? ""));
      const baselineExists = baselineServerSet.has(serverKey);
      const compareMissing = !baselineExists || !past;
      const delta = (field: keyof FirestoreToplistPlayerRow) => {
        if (compareMissing || !past) return null;
        if (field === "ratio") return null;
        const curr = toNumberSafe((row as any)[field]);
        const prev = toNumberSafe((past as any)[field]);
        if (prev == null) return null;
        return (curr ?? 0) - prev;
      };
      const levelDelta = delta("level");
      const mainDelta = delta("main");
      const conDelta = delta("con");
      const sumDelta = delta("sum");
      const mainTotalDelta = delta("mainTotal");
      const conTotalDelta = delta("conTotal");
      const sumTotalDelta = delta("sumTotal");
      const xpProgressDelta = delta("xpProgress");
      const xpTotalDelta = delta("xpTotal");
      const ratioDelta = delta("ratio");
      const mineDelta = delta("mine");
      const treasuryDelta = delta("treasury");
      let statsDays: number | null = null;
      let statsPerDay: number | null = null;
      if (!compareMissing && past) {
        const stats = computeStatsDay(row, past, sumDelta);
        statsDays = stats.days;
        statsPerDay = stats.perDay;
      }
      return {
        ...row,
        _compareMissing: compareMissing,
        _statsPerDay: statsPerDay,
        _statsDays: statsDays,
        _delta: {
          level: levelDelta,
          main: mainDelta,
          con: conDelta,
          sum: sumDelta,
          mainTotal: mainTotalDelta,
          conTotal: conTotalDelta,
          sumTotal: sumTotalDelta,
          xpProgress: xpProgressDelta,
          xpTotal: xpTotalDelta,
          ratio: ratioDelta,
          mine: mineDelta,
          treasury: treasuryDelta,
        },
      };
    });
  }, [showCompare, filteredRows, buildCompareKey, baselineRowByKey, baselineServerSet]);

  const currentRowByKey = React.useMemo(() => {
    const map = new Map<string, FirestoreToplistPlayerRow>();
    currentRowsWithCompare.forEach((row) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, row);
      }
    });
    return map;
  }, [currentRowsWithCompare, buildCompareKey]);

  const baselineRowLimit = React.useMemo(() => {
    if (!showCompare) return null;
    const counts = new Map<string, number>();
    compareState.rows.forEach((row) => {
      const serverKey = normalizeServerCode(String(row.server ?? ""));
      const next = (counts.get(serverKey) || 0) + 1;
      counts.set(serverKey, next);
    });
    let max = 0;
    counts.forEach((value) => {
      if (value > max) max = value;
    });
    return max || null;
  }, [showCompare, compareState.rows]);

  const baselineCombinedRows = React.useMemo(() => {
    if (!showCompare) return [];
    let rows = Array.isArray(compareState.rows) ? [...compareState.rows] : [];
    if (!rows.length) return rows;

    rows = rows.map((row) => {
      const mainRatio = deriveRatioMain(row.main, row.con);
      const currentMatch = currentRowByKey.get(buildCompareKey(row));
      const stats = currentMatch ? computeStatsDay(currentMatch, row) : { days: null, perDay: null };
      const calculatedSum = (row.main ?? 0) + (row.con ?? 0);
      return {
        ...row,
        _ratioMain: mainRatio,
        _statsPerDay: stats.perDay,
        _statsDays: stats.days,
        _calculatedSum: calculatedSum,
      } as any;
    });

    rows = filterToplistRows(rows, filters);

    rows = sortToplistRows(rows, sort);

    if (baselineRowLimit != null && baselineRowLimit > 0 && rows.length > baselineRowLimit) {
      rows = rows.slice(0, baselineRowLimit);
    }

    if (selectedGuildSet && hasGuildData) {
      rows = rows.filter((row) => {
        const key = normalizeGuildKey(row.guild);
        return key ? selectedGuildSet.has(key) : false;
      });
    }

    return rows;
  }, [showCompare, compareState.rows, filters, sort, selectedGuildSet, hasGuildData, baselineRowLimit, currentRowByKey, buildCompareKey]);

  const baselineRankByKey = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!showCompare) return map;
    baselineCombinedRows.forEach((row, idx) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, idx + 1);
      }
    });
    return map;
  }, [showCompare, baselineCombinedRows, buildCompareKey]);

  const currentSortedRows = React.useMemo(() => {
    if (!showCompare || sort.key !== "statsDay") return currentRowsWithCompare;
    const next = [...currentRowsWithCompare];
    sortToplistRows(next, sort);
    return next;
  }, [showCompare, currentRowsWithCompare, sort]);

  const currentRankByKey = React.useMemo(() => {
    const map = new Map<string, number>();
    currentSortedRows.forEach((row, idx) => {
      const key = buildCompareKey(row);
      if (!map.has(key)) {
        map.set(key, idx + 1);
      }
    });
    return map;
  }, [currentSortedRows, buildCompareKey]);

  const enhancedRows = React.useMemo(() => {
    return currentSortedRows.map((row, idx) => {
      if (!showCompare) {
        return { ...row, _rank: idx + 1 };
      }
      const key = buildCompareKey(row);
      const currentRank = currentRankByKey.get(key) ?? (idx + 1);
      const baselineRank = baselineRankByKey.get(key);
      const rankDelta = baselineRank != null && currentRank != null ? baselineRank - currentRank : null;
      return {
        ...row,
        _rank: idx + 1,
        _rankDelta: rankDelta,
      };
    });
  }, [showCompare, currentSortedRows, buildCompareKey, baselineRankByKey, currentRankByKey]);

  const avgTop100StatsPerDay = (() => {
    if (!showCompare) return null;
    const topRows = enhancedRows.slice(0, 100);
    let sum = 0;
    let count = 0;
    topRows.forEach((row) => {
      const value = (row as any)._statsPerDay;
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    });
    return count ? sum / count : null;
  })();
  const maxStatsPerDay = (() => {
    if (!showCompare) return null;
    let max: number | null = null;
    enhancedRows.forEach((row) => {
      const value = (row as any)._statsPerDay;
      if (typeof value === "number" && Number.isFinite(value)) {
        if (max == null || value > max) max = value;
      }
    });
    return max;
  })();

  const decorMap = React.useMemo(() => {
    const map = new Map<string, CellDecor>();
    const rows = enhancedRows;
    const keyFor = (row: FirestoreToplistPlayerRow) =>
      (row as any).playerId ?? (row as any).id ?? buildRowKey(row);

    const ensure = (row: FirestoreToplistPlayerRow) => {
      const key = keyFor(row);
      let entry = map.get(key);
      if (!entry) {
        entry = {};
        map.set(key, entry);
      }
      return entry;
    };

    const rankBy = (
      valueGetter: (row: FirestoreToplistPlayerRow) => number | null,
      field: "mainRank" | "conRank" | "levelRank",
    ) => {
      const ranked = rows
        .map((row, idx) => {
          const value = valueGetter(row);
          if (value == null) return null;
          return { row, value, idx };
        })
        .filter(Boolean) as { row: FirestoreToplistPlayerRow; value: number; idx: number }[];
      ranked.sort((a, b) => b.value - a.value || a.idx - b.idx);
      ranked.slice(0, 5).forEach((entry, i) => {
        ensure(entry.row)[field] = i + 1;
      });
    };

    rankBy((row) => toNumberSafe(row.main), "mainRank");
    rankBy((row) => toNumberSafe(row.con), "conRank");
    rankBy((row) => toNumberSafe(row.level), "levelRank");

    rows.forEach((row) => {
      const mineValue = toNumberSafe(row.mine);
      if (mineValue == null) return;
      const tier =
        mineValue >= 100 ? 4 :
        mineValue >= 80 ? 3 :
        mineValue >= 65 ? 2 :
        mineValue >= 50 ? 1 :
        null;
      if (tier) ensure(row).mineTier = tier as 1 | 2 | 3 | 4;
    });

    return map;
  }, [enhancedRows, buildRowKey]);

  const nowMs = Date.now();
  const statusLabel = !hasServers
    ? "No server selected"
    : playerLoading
      ? "Loading..."
      : playerError
        ? "Error"
        : "Ready";

  const renderToplistTable = (opts: {
    imgLoading: "lazy" | "eager";
  }) => {
    const rows = enhancedRows;
    const resolveIdentifier = (row: FirestoreToplistPlayerRow) => {
      const candidates = [
        (row as any).identifier,
        (row as any).original?.identifier,
        (row as any).value?.identifier,
        (row as any).data?.identifier,
        (row as any).player?.identifier,
        (row as any).value?.player?.identifier,
      ];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }
      return null;
    };
    return (
    <table className="toplists-table" style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #2C4A73" }}>
          <th style={{ padding: "8px 6px" }}>#</th>
          <th style={{ padding: "8px 6px" }}>Δ Rank</th>
          <th style={{ padding: "8px 6px" }}>Server</th>
          <th style={{ padding: "8px 6px" }}>Name</th>
          <th style={{ padding: "8px 6px", textAlign: "center", width: 60 }}>Class</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Level</th>
          <th style={{ padding: "8px 6px" }}>Guild</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Main</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Con</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Sum</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Stats/Day</th>
          <th style={{ padding: "8px 6px" }}>Ratio</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Mine</th>
          <th style={{ padding: "8px 6px", textAlign: "right" }}>Treasury</th>
          <th style={{ padding: "8px 6px" }}>Last Scan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rankDelta = showCompare ? (r as any)._rankDelta : null;
          const deltas = (r as any)._delta || {};
          const compareMissing = showCompare ? Boolean((r as any)._compareMissing) : false;
          const rankDeltaDisplay = showCompare ? getRankDeltaDisplay(rankDelta, compareMissing) : null;
          const statsPerDayValue = showCompare ? (r as any)._statsPerDay : null;
          const statsDaysValue = showCompare ? (r as any)._statsDays : null;
          const statsPerDayText = statsPerDayValue == null ? "-" : fmtNum(statsPerDayValue);
          const statsDaysText = statsDaysValue == null ? "-" : `${statsDaysValue}d`;
          const statsDayVariant = getStatsDayVariant(statsPerDayValue, avgTop100StatsPerDay);
          const isBestStatsDay =
            statsPerDayValue != null &&
            maxStatsPerDay != null &&
            statsPerDayValue === maxStatsPerDay;
          const statsDayClassName = isBestStatsDay
            ? "stats-day-chip stats-day-chip--best"
            : statsDayVariant
              ? `stats-day-chip stats-day-chip--${statsDayVariant}`
              : "stats-day-chip";
          const lastScanDotColor = computeLastScanColor((r as any).lastScan, nowMs);
          const classKey = String(r.class ?? "").trim();
          const classIconUrl = getClassIconUrl(classKey, 48);
          const playerId = (r as any).playerId ?? (r as any).id ?? null;
          const profileIdentifier = resolveIdentifier(r);
          const rowKey = playerId ?? buildRowKey(r);
          const decor = decorMap.get(rowKey);
          const mainTone = getRankTone(decor?.mainRank, MAIN_RANK_COLORS);
          const conTone = getRankTone(decor?.conRank, CON_RANK_COLORS);
          const levelTone = getRankTone(decor?.levelRank, LEVEL_RANK_COLORS);
          const mineTone = getMineTone(decor?.mineTier);
          const calculatedSum = (r as any)._calculatedSum ?? 0;
          const renderDelta = (value: number | null, missing: boolean, hideIfNull = false) => {
            if (!showCompare) return null;
            if (missing) {
              return <div style={{ fontSize: 11, opacity: 0.8 }}>-</div>;
            }
            if (value == null && hideIfNull) return null;
            return (
              <div style={{ fontSize: 11, opacity: 0.8 }}>
                {value == null ? t("toplists.deltaNew", "NEW") : fmtDelta(value)}
              </div>
            );
          };
          const rowOnClick = () => {
            if (!profileIdentifier) return;
            navigate(`/player/${encodeURIComponent(profileIdentifier)}`);
          };

          return (
            <tr
              key={`${r.name}__${r.server}__${r.class ?? ""}`}
              className="toplists-row"
              style={{
                borderBottom: "1px solid #2C4A73",
                cursor: "pointer",
                userSelect: "none",
              }}
              onClick={rowOnClick}
            >
              <td style={{ padding: "8px 6px" }}>{i + 1}</td>
              <td style={{ padding: "8px 6px" }}>
                {rankDeltaDisplay ? (
                  <span className={`rank-delta-chip rank-delta-chip--${rankDeltaDisplay.variant}`}>
                    {rankDeltaDisplay.text}
                  </span>
                ) : ""}
              </td>
              <td style={{ padding: "8px 6px" }}>{r.server}</td>
              <td style={{ padding: "8px 6px" }}>{r.name}</td>
              <td style={{ padding: "8px 6px", textAlign: "center" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  {classIconUrl ? (
                    <img
                      src={classIconUrl}
                      alt={classKey || "class"}
                      loading={opts.imgLoading}
                      className="class-icon-toplist"
                      style={{ display: "block", objectFit: "contain" }}
                    />
                  ) : (
                    <span>{classKey}</span>
                  )}
                </span>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={getFrameStyle(levelTone)}>{fmtNum(r.level)}</span>
                  {renderDelta(deltas.level ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px" }}>{r.guild ?? ""}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={getFrameStyle(mainTone)}>{fmtNum(r.main)}</span>
                  {renderDelta(deltas.main ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={getFrameStyle(conTone)}>{fmtNum(r.con)}</span>
                  {renderDelta(deltas.con ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span>{fmtNum(calculatedSum)}</span>
                  {renderDelta(deltas.sum ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span className={statsDayClassName}>{statsPerDayText}</span>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{statsDaysText}</div>
                </div>
              </td>
              <td style={{ padding: "8px 6px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span>{(r as any)._ratioLabel ?? r.ratio ?? "�"}</span>
                  {renderDelta(deltas.ratio ?? null, compareMissing, true)}
                </div>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={getFrameStyle(mineTone)}>{fmtNum(r.mine)}</span>
                  {renderDelta(deltas.mine ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span>{fmtNum(r.treasury)}</span>
                  {renderDelta(deltas.treasury ?? null, compareMissing)}
                </div>
              </td>
              <td style={{ padding: "8px 6px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span>{r.lastScan ?? ""}</span>
                  {lastScanDotColor && (
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: lastScanDotColor,
                        boxShadow: "0 0 6px rgba(0, 0, 0, 0.35)",
                      }}
                    />
                  )}
                </span>
              </td>
            </tr>
          );
        })}
        {playerLoading && enhancedRows.length === 0 && (
          <tr><td colSpan={15} style={{ padding: 12 }}>Loading...</td></tr>
        )}
        {!playerLoading && !playerError && rows.length === 0 && (
          <tr><td colSpan={15} style={{ padding: 12 }}>No results</td></tr>
        )}
      </tbody>
    </table>
    );
  };
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
      <div style={{ opacity: 0.8, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
        <div>{statusLabel} - {enhancedRows.length} rows</div>
        <div>{playerLastUpdatedAt ? `Updated: ${fmtDate(playerLastUpdatedAt)}` : null}</div>
      </div>
      {compareMonth && compareState.error && (
        <div style={{ fontSize: 12, color: "#ffb347" }}>
          {compareState.error}
        </div>
      )}
      {playerScopeStatus && (
        <div style={{ opacity: 0.75, fontSize: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span>
            Scope {playerScopeStatus.scopeId} � {playerScopeStatus.changesSinceLastRebuild}/{playerScopeStatus.minChanges ?? "?"} changes since last rebuild
          </span>
          <span>
            Auto rebuild at {playerScopeStatus.minChanges ?? "?"} changes or after {playerScopeStatus.maxAgeDays ?? "?"} days
          </span>
          <span>
            Last rebuild: {fmtDateObj(playerScopeStatus.lastRebuildAt)}
          </span>
        </div>
      )}

      {hasServers && playerError && (
        <div style={{ border: "1px solid #2C4A73", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Error</div>
          <div style={{ wordBreak: "break-all" }}>{playerError}</div>
          <button
            onClick={() => navigate(`${location.pathname}${location.search}${location.hash}`)}
            style={{ marginTop: 8 }}
          >
            Retry
          </button>
        </div>
      )}

      {!hasServers ? (
        <div style={{ padding: 12, color: "#B0C4D9" }}>
          Please select at least one server.
        </div>
      ) : (
        <>
          <div ref={tableRef} style={{ overflowX: "auto" }}>
            {renderToplistTable({ imgLoading: "lazy" })}
          </div>
        </>
      )}
    </div>
  );
}

function TopActions() {
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




















