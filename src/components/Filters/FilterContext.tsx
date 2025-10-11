// src/components/Filters/FilterContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

// bleibt wie gehabt – wird von deiner Seite importiert
export { SERVERS } from "../../data/servers";

/** Zeitfenster */
export type DaysFilter = 3 | 7 | 14 | 30 | 90 | "all";

/** UI-Zustände für die Toplists-Ansicht */
export type FilterMode = "hud" | "sheet";
export type ListView = "cards" | "buttons" | "table";

/** Persistenter Filter-State */
type FiltersState = {
  // Daten-Filter
  servers: string[];
  classes: string[];
  days: DaysFilter;        // interne Quelle
  sortBy: string;          // "level" | "main" | "constitution" | "sum" | "lastScan" | "name" ...
  favoritesOnly: boolean;
  activeOnly: boolean;

  // UI-Filter (was deine Seite benötigt)
  filterMode: FilterMode;          // "hud" | "sheet"
  listView: ListView;              // "cards" | "buttons" | "table"
  bottomFilterOpen: boolean;
  serverSheetOpen: boolean;
};

/** Öffentliche API des Contexts */
type FiltersContextValue = {
  // Daten-Filter (lesen)
  servers: string[];
  classes: string[];
  days: DaysFilter;
  /** Backwards-Compat: gleicher Wert wie `days` */
  range: DaysFilter;
  sortBy: string;
  favoritesOnly: boolean;
  activeOnly: boolean;

  // UI-Filter (lesen)
  filterMode: FilterMode;
  listView: ListView;
  bottomFilterOpen: boolean;
  serverSheetOpen: boolean;

  // Mutationen (Server)
  setServers: (list: string[]) => void;
  toggleServer: (sv: string) => void;
  clearServers: () => void;

  // Mutationen (Klassen)
  setClasses: (list: string[]) => void;
  toggleClass: (cls: string) => void;
  clearClasses: () => void;

  // Mutationen (Zeit/Sort/Flags)
  setDays: (d: DaysFilter) => void;
  /** Backwards-Compat: Alias zu setDays */
  setRange: (d: DaysFilter) => void;
  setSortBy: (s: string) => void;
  setFavoritesOnly: (b: boolean) => void;
  setActiveOnly: (b: boolean) => void;

  // Mutationen (UI)
  setFilterMode: (m: FilterMode) => void;
  setListView: (v: ListView) => void;
  setBottomFilterOpen: (b: boolean) => void;
  setServerSheetOpen: (b: boolean) => void;

  // Reset
  resetFilters: () => void;
};

const LS_KEY = "TL_FILTERS_V2";

// Default-Werte (inkl. UI-State)
const DEFAULT_STATE: FiltersState = {
  servers: [],
  classes: [],
  days: "all",
  sortBy: "level",
  favoritesOnly: false,
  activeOnly: false,

  filterMode: "hud",
  listView: "table",
  bottomFilterOpen: false,
  serverSheetOpen: false,
};

function loadFromStorage(): FiltersState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) ?? {};

    const normDays: DaysFilter =
      (["all", 3, 7, 14, 30, 90] as any[]).includes(parsed.days) ? parsed.days : DEFAULT_STATE.days;

    const normListView: ListView =
      (["cards", "buttons", "table"] as const).includes(parsed.listView)
        ? parsed.listView
        : DEFAULT_STATE.listView;

    const normFilterMode: FilterMode =
      (["hud", "sheet"] as const).includes(parsed.filterMode)
        ? parsed.filterMode
        : DEFAULT_STATE.filterMode;

    return {
      ...DEFAULT_STATE,
      ...parsed,
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      favoritesOnly: !!parsed.favoritesOnly,
      activeOnly: !!parsed.activeOnly,
      days: normDays,
      listView: normListView,
      filterMode: normFilterMode,
      bottomFilterOpen: !!parsed.bottomFilterOpen,
      serverSheetOpen: !!parsed.serverSheetOpen,
      sortBy: typeof parsed.sortBy === "string" ? parsed.sortBy : DEFAULT_STATE.sortBy,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveToStorage(state: FiltersState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore persistence errors */
  }
}

const Ctx = createContext<FiltersContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FiltersState>(() => loadFromStorage());

  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  // --------- Server ----------
  const setServers = (list: string[]) =>
    setState((s) => ({ ...s, servers: Array.from(new Set(list)) }));

  const toggleServer = (sv: string) =>
    setState((s) => {
      const set = new Set(s.servers);
      set.has(sv) ? set.delete(sv) : set.add(sv);
      return { ...s, servers: Array.from(set) };
    });

  const clearServers = () => setState((s) => ({ ...s, servers: [] }));

  // --------- Klassen ----------
  const setClasses = (list: string[]) =>
    setState((s) => ({ ...s, classes: Array.from(new Set(list)) }));

  const toggleClass = (cls: string) =>
    setState((s) => {
      const set = new Set(s.classes);
      set.has(cls) ? set.delete(cls) : set.add(cls);
      return { ...s, classes: Array.from(set) };
    });

  const clearClasses = () => setState((s) => ({ ...s, classes: [] }));

  // --------- Zeit / Sort / Flags ----------
  const setDays = (d: DaysFilter) => setState((s) => ({ ...s, days: d }));
  const setRange = (d: DaysFilter) => setDays(d); // Alias

  const setSortBy = (srt: string) =>
    setState((s) => ({ ...s, sortBy: srt || "level" }));

  const setFavoritesOnly = (b: boolean) =>
    setState((s) => ({ ...s, favoritesOnly: !!b }));

  const setActiveOnly = (b: boolean) =>
    setState((s) => ({ ...s, activeOnly: !!b }));

  // --------- UI ----------
  const setFilterMode = (m: FilterMode) =>
    setState((s) => ({ ...s, filterMode: m }));

  const setListView = (v: ListView) =>
    setState((s) => ({ ...s, listView: v }));

  const setBottomFilterOpen = (b: boolean) =>
    setState((s) => ({ ...s, bottomFilterOpen: !!b }));

  const setServerSheetOpen = (b: boolean) =>
    setState((s) => ({ ...s, serverSheetOpen: !!b }));

  // --------- Reset ----------
  const resetFilters = () => setState(DEFAULT_STATE);

  const value = useMemo<FiltersContextValue>(
    () => ({
      // Daten-Filter (lesen)
      servers: state.servers,
      classes: state.classes,
      days: state.days,
      range: state.days, // Backwards-Compat
      sortBy: state.sortBy,
      favoritesOnly: state.favoritesOnly,
      activeOnly: state.activeOnly,

      // UI (lesen)
      filterMode: state.filterMode,
      listView: state.listView,
      bottomFilterOpen: state.bottomFilterOpen,
      serverSheetOpen: state.serverSheetOpen,

      // Mutationen
      setServers,
      toggleServer,
      clearServers,
      setClasses,
      toggleClass,
      clearClasses,
      setDays,
      setRange,
      setSortBy,
      setFavoritesOnly,
      setActiveOnly,
      setFilterMode,
      setListView,
      setBottomFilterOpen,
      setServerSheetOpen,

      // Reset
      resetFilters,
    }),
    [state]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook */
export function useFilters(): FiltersContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Falls der Provider fehlt: No-Op-Implementierung zurückgeben,
    // damit die Seite nicht crasht, aber Funktionen vorhanden sind.
    return {
      ...DEFAULT_STATE,
      range: DEFAULT_STATE.days,
      setServers: () => {},
      toggleServer: () => {},
      clearServers: () => {},
      setClasses: () => {},
      toggleClass: () => {},
      clearClasses: () => {},
      setDays: () => {},
      setRange: () => {},
      setSortBy: () => {},
      setFavoritesOnly: () => {},
      setActiveOnly: () => {},
      setFilterMode: () => {},
      setListView: () => {},
      setBottomFilterOpen: () => {},
      setServerSheetOpen: () => {},
      resetFilters: () => {},
    };
  }
  return v;
}
