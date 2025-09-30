import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CLASSES } from "../../data/classes";

/** UI-Modi / Views */
export type FilterMode = "hud" | "sheet";
export type ListView = "cards" | "buttons" | "table";
export type RangeKey = "3d" | "7d" | "14d" | "30d" | "90d" | "all";

/** Demo-Datentyp (kannst du später durch echte Typen/Data ersetzen) */
export type Player = {
  id: number; name: string; server: string; region: string; class: string;
  active: boolean; favorite: boolean; level: number; scrapbook: number; lastScanDays: number;
};

/** Server-Katalog (export für Seiten/Sheets) */
export const SERVERS: Record<string, string[]> = {
  EU: ["EU1","EU2","EU3","EU4","EU5","EU6"],
  US: ["US1","US2","US3"],
  INT: ["INT1","INT2"],
  Fusion: ["FUS1","FUS2"],
};

/** Demo-Daten (Mock) */
const MOCK_PLAYERS: Player[] = Array.from({ length: 120 }, (_, i) => {
  const regs = Object.keys(SERVERS) as (keyof typeof SERVERS)[];
  const region = regs[i % regs.length];
  const server = SERVERS[region][i % SERVERS[region].length];
  const klass = CLASSES[i % CLASSES.length].key;
  const active = i % 3 !== 0;
  const favorite = i % 7 === 0;
  const level = 200 + ((i * 7) % 100);
  const scrapbook = 500 + ((i * 13) % 300);
  const lastScanDays = (i * 5) % 31;
  return { id: i+1, name: `Player_${i+1}`, server, region, class: klass, active, favorite, level, scrapbook, lastScanDays };
});

type SortKey = "level" | "scrapbook" | "activity" | "lastScan";
/** Seiten-spezifische „Scope“-Tabs – Nutzung optional (Hex-Tabs o.ä. pro Seite) */
type HexTab = "all" | "eu" | "fusion" | "favorites" | "activeToday";

/** Context-Shape */
type Ctx = {
  // UI
  filterMode: FilterMode; setFilterMode: (m:FilterMode)=>void;
  listView: ListView; setListView: (v:ListView)=>void;

  // Bottom-Filter (nur für den allgemeinen Filter-Sheet)
  bottomFilterOpen: boolean; setBottomFilterOpen:(b:boolean)=>void;

  // Server-Picker (eigener, separater State – verhindert Collision)
  serverSheetOpen: boolean; setServerSheetOpen:(b:boolean)=>void;

  // Filter
  servers: string[]; setServers: React.Dispatch<React.SetStateAction<string[]>>;
  classes: string[]; setClasses: React.Dispatch<React.SetStateAction<string[]>>;
  range: RangeKey; setRange: (r:RangeKey)=>void;
  sortBy: SortKey; setSortBy: (s:SortKey)=>void;
  quickFav: boolean; setQuickFav: (b:boolean)=>void;
  quickActive: boolean; setQuickActive: (b:boolean)=>void;

  // Optionaler Seiten-Scope
  hexTab: HexTab; setHexTab: (h:HexTab)=>void;

  // Daten (Demo)
  list: Player[];
  filtered: Player[];

  // helpers
  resetAll: ()=>void;
};

const FilterContext = createContext<Ctx | null>(null);
export const useFilters = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within <FilterProvider/>");
  return ctx;
};

const SETTINGS_KEY = "sfhub_settings_v1";

/** Provider – keine feste Topbar/Hexbar; Seiten rendern ihre Extras über die ContentShell-Slots. */
export function FilterProvider({ children }: { children: React.ReactNode }) {
  // UI
  const [filterMode, setFilterMode] = useState<FilterMode>("hud");
  const [listView, setListView] = useState<ListView>("cards");

  // Separat halten:
  // - bottomFilterOpen   → dein allgemeiner Bottom-Filter
  // - serverSheetOpen    → NUR Server-Picker (modal/sheet), unabhängig vom oberen
  const [bottomFilterOpen, setBottomFilterOpen] = useState(false);
  const [serverSheetOpen, setServerSheetOpen] = useState(false);

  // Filter
  const [servers, setServers] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [range, setRange] = useState<RangeKey>("30d");
  const [sortBy, setSortBy] = useState<SortKey>("level");
  const [quickFav, setQuickFav] = useState(false);
  const [quickActive, setQuickActive] = useState(false);

  // Optionaler Seiten-Scope
  const [hexTab, setHexTab] = useState<HexTab>("all");

  // (Optionale) UI-Persistenz
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.filterMode) setFilterMode(p.filterMode);
        if (p.listView) setListView(p.listView);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ filterMode, listView }));
    } catch {}
  }, [filterMode, listView]);

  // Demo-Liste
  const list = MOCK_PLAYERS;

  // Ableitung
  const filtered = useMemo(() => {
    let out = [...list];

    // Seitenspezifischer Scope
    if (hexTab === "eu") out = out.filter(p => p.region === "EU");
    if (hexTab === "fusion") out = out.filter(p => p.region === "Fusion");
    if (hexTab === "favorites") out = out.filter(p => p.favorite);
    if (hexTab === "activeToday") out = out.filter(p => p.lastScanDays === 0);

    // Filter
    if (servers.length) out = out.filter(p => servers.includes(p.server));
    if (classes.length) out = out.filter(p => classes.includes(p.class));
    if (quickFav) out = out.filter(p => p.favorite);
    if (quickActive) out = out.filter(p => p.active);

    // Range
    const rangeDays =
      range === "3d" ? 3 :
      range === "7d" ? 7 :
      range === "14d" ? 14 :
      range === "30d" ? 30 :
      range === "90d" ? 90 : Infinity;

    out = out.filter(p => p.lastScanDays <= rangeDays);

    // Sortierung
    out.sort((a,b)=>{
      if (sortBy === "level") return b.level - a.level;
      if (sortBy === "scrapbook") return b.scrapbook - a.scrapbook;
      if (sortBy === "activity") return a.active === b.active ? 0 : a.active ? -1 : 1;
      if (sortBy === "lastScan") return a.lastScanDays - b.lastScanDays;
      return 0;
    });
    return out;
  }, [list, servers, classes, quickFav, quickActive, range, sortBy, hexTab]);

  const resetAll = () => {
    setServers([]); setClasses([]); setRange("30d"); setSortBy("level");
    setQuickFav(false); setQuickActive(false); setHexTab("all");
  };

  const value: Ctx = {
    filterMode, setFilterMode,
    listView, setListView,

    bottomFilterOpen, setBottomFilterOpen,
    serverSheetOpen, setServerSheetOpen,

    servers, setServers,
    classes, setClasses,
    range, setRange,
    sortBy, setSortBy,
    quickFav, setQuickFav,
    quickActive, setQuickActive,

    hexTab, setHexTab,

    list, filtered,
    resetAll,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}
