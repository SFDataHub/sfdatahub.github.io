// src/components/Filters/FilterContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { CLASSES } from "../../data/classes";
import { excludeHiddenPickerServers, isHiddenPickerServer } from "./serverPickerModel";

// bleibt wie gehabt – wird von deiner Seite importiert
export { SERVERS } from "../../data/servers";

/** Zeitfenster */
export type DaysFilter = 3 | 7 | 14 | 30 | 60 | 90 | "all";

/** UI-Zustände für die Toplists-Ansicht */
export type FilterMode = "hud" | "sheet";
export type ListView = "cards" | "buttons" | "table";

type StringArrayUpdater = string[] | ((prev: string[]) => string[]);
type BooleanUpdater = boolean | ((prev: boolean) => boolean);

export type LocalTableFilters = {
  searchMode: "search" | "filter";
  guildSort: { metricKey: string; direction: "asc" | "desc" };
  playerDirection: "asc" | "desc";
  playerValueMode: "base" | "total";
  guildValueMode: "base" | "total";
  compareMode: "off" | "progress" | "months";
  progressSinceMonth: string; compareFromMonth: string; compareToMonth: string;
};
export const DEFAULT_LOCAL_TABLE: LocalTableFilters = { searchMode: "search", guildSort: { metricKey: "guildAvgLevel", direction: "desc" }, playerDirection: "desc", playerValueMode: "base", guildValueMode: "base", compareMode: "off", progressSinceMonth: "", compareFromMonth: "", compareToMonth: "" };
function normalizeLocalTable(value: Partial<LocalTableFilters> = {}): LocalTableFilters {
  const result = { ...DEFAULT_LOCAL_TABLE };
  for (const key of ["searchMode", "playerDirection", "playerValueMode", "guildValueMode", "compareMode"] as const) {
    const allowed = { searchMode: ["search", "filter"], playerDirection: ["asc", "desc"], playerValueMode: ["base", "total"], guildValueMode: ["base", "total"], compareMode: ["off", "progress", "months"] };
    if (allowed[key].includes(value[key] ?? "")) Object.assign(result, { [key]: value[key] });
  }
  for (const key of ["progressSinceMonth", "compareFromMonth", "compareToMonth"] as const) if (typeof value[key] === "string" && /^(?:\d{4}-\d{2})?$/.test(value[key])) result[key] = value[key];
  if (value.guildSort && typeof value.guildSort.metricKey === "string" && ["asc", "desc"].includes(value.guildSort.direction)) result.guildSort = value.guildSort;
  return result;
}
/** Persistenter Filter-State */
type FiltersState = {
  localTable?: LocalTableFilters;
  // Daten-Filter
  servers: string[];
  classes: string[];
  localClassSelectionVersion?: 1;
  localClassSelectionMask?: number;
  guilds: string[];
  days: DaysFilter;        // interne Quelle
  sortBy: string;          // "level" | "main" | "constitution" | "sum" | "lastScan" | "name" ...
  favoritesOnly: boolean;
  activeOnly: boolean;
  searchText: string;
  quickFav: boolean;
  quickActive: boolean;

  // UI-Filter (was deine Seite benötigt)
  filterMode: FilterMode;          // "hud" | "sheet"
  listView: ListView;              // "cards" | "buttons" | "table"
  bottomFilterOpen: boolean;
  serverSheetOpen: boolean;
};

/** Öffentliche API des Contexts */
type FiltersContextValue = {
  persistenceError: string | null;
  localTable: LocalTableFilters;
  setLocalTable: React.Dispatch<React.SetStateAction<LocalTableFilters>>;
  // Daten-Filter (lesen)
  servers: string[];
  classes: string[];
  guilds: string[];
  days: DaysFilter;
  /** Backwards-Compat: gleicher Wert wie `days` */
  range: DaysFilter;
  sortBy: string;
  favoritesOnly: boolean;
  activeOnly: boolean;
  searchText: string;
  quickFav: boolean;
  quickActive: boolean;

  // UI-Filter (lesen)
  filterMode: FilterMode;
  listView: ListView;
  bottomFilterOpen: boolean;
  serverSheetOpen: boolean;

  // Mutationen (Server)
  setServers: (next: StringArrayUpdater) => void;
  toggleServer: (sv: string) => void;
  clearServers: () => void;

  // Mutationen (Klassen)
  setClasses: (next: StringArrayUpdater) => void;
  toggleClass: (cls: string) => void;
  clearClasses: () => void;

  // Mutationen (Gilden)
  setGuilds: (next: StringArrayUpdater) => void;
  toggleGuild: (guild: string) => void;
  clearGuilds: () => void;

  // Mutationen (Zeit/Sort/Flags)
  setDays: (d: DaysFilter) => void;
  /** Backwards-Compat: Alias zu setDays */
  setRange: (d: DaysFilter) => void;
  setSortBy: (s: string) => void;
  setFavoritesOnly: (b: boolean) => void;
  setActiveOnly: (b: boolean) => void;
  setSearchText: (text: string) => void;
  setQuickFav: (next: BooleanUpdater) => void;
  setQuickActive: (next: BooleanUpdater) => void;

  // Mutationen (UI)
  setFilterMode: (m: FilterMode) => void;
  setListView: (v: ListView) => void;
  setBottomFilterOpen: (b: boolean) => void;
  setServerSheetOpen: (b: boolean) => void;

  // Reset
  resetFilters: () => void;
  resetAll: () => void;
};

const LS_KEY = "TL_FILTERS_V2";

// Default-Werte (inkl. UI-State)
const DEFAULT_STATE: FiltersState = {
  servers: [],
  classes: [],
  guilds: [],
  days: "all",
  sortBy: "sum",
  favoritesOnly: false,
  activeOnly: false,
  searchText: "",
  quickFav: false,
  quickActive: false,

  filterMode: "hud",
  listView: "table",
  bottomFilterOpen: false,
  serverSheetOpen: false,
};

/** Keep local filters writable when an origin's shared localStorage is nearly full. */
export function persistLocalFilters(storage: Pick<Storage, "setItem">, storageKey: string, raw: string | null, state: FiltersState): string {
  const { serverSheetOpen: _picker, bottomFilterOpen: _menu, localClassSelectionMask: _mask, ...persistent } = state;
  const next = JSON.stringify(persistent);
  if (raw === next) return next;
  try {
    storage.setItem(storageKey, next);
    return next;
  } catch (error) {
    if (!error || typeof error !== "object" || !("name" in error) || error.name !== "QuotaExceededError") throw error;
    // Omitted fields restore through the same defaults. A class bitmask preserves
    // All, each partial selection and explicit Clear without a growing key list.
    const compact: Record<string, unknown> = { ...persistent };
    for (const key of Object.keys(DEFAULT_STATE) as (keyof FiltersState)[]) {
      if (key !== "classes" && JSON.stringify(compact[key]) === JSON.stringify(DEFAULT_STATE[key])) delete compact[key];
    }
    if (state.classes.every(key => CLASSES.some(c => c.key === key))) {
      delete compact.classes;
      compact.localClassSelectionMask = CLASSES.reduce((mask, c, index) => state.classes.includes(c.key) ? mask | (1 << index) : mask, 0);
    }
    if (state.localTable) {
      const table: Record<string, unknown> = { ...state.localTable };
      for (const key of Object.keys(DEFAULT_LOCAL_TABLE) as (keyof LocalTableFilters)[]) {
        if (JSON.stringify(table[key]) === JSON.stringify(DEFAULT_LOCAL_TABLE[key])) delete table[key];
      }
      if (Object.keys(table).length) compact.localTable = table;
      else delete compact.localTable;
    }
    const fallback = JSON.stringify(compact);
    if (raw !== fallback) storage.setItem(storageKey, fallback);
    return fallback;
  }
}

export function loadFromStorage(storageKey = LS_KEY, migrateFrom?: string, localClassSelection = false): { state: FiltersState; writable: boolean } {
  const defaults = localClassSelection ? { ...DEFAULT_STATE, classes: CLASSES.map(c => c.key), localClassSelectionVersion: 1 as const } : DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(storageKey) ?? (migrateFrom ? localStorage.getItem(migrateFrom) : null);
    if (!raw) return { state: defaults, writable: true };
    const parsed = JSON.parse(raw) ?? {};
    if (storageKey !== LS_KEY && (typeof parsed !== "object" || Array.isArray(parsed) || ["servers", "classes", "guilds"].some(key => parsed[key] !== undefined && (!Array.isArray(parsed[key]) || parsed[key].some((value: unknown) => typeof value !== "string"))))) throw Error("Invalid local filter restore");

    const normDays: DaysFilter =
      (["all", 3, 7, 14, 30, 60, 90] as any[]).includes(parsed.days) ? parsed.days : DEFAULT_STATE.days;

    const normListView: ListView =
      (["cards", "buttons", "table"] as const).includes(parsed.listView)
        ? parsed.listView
        : DEFAULT_STATE.listView;

    const normFilterMode: FilterMode =
      (["hud", "sheet"] as const).includes(parsed.filterMode)
        ? parsed.filterMode
        : DEFAULT_STATE.filterMode;

    const parsedQuickFav =
      typeof parsed.quickFav === "boolean"
        ? parsed.quickFav
        : !!parsed.favoritesOnly;
    const parsedQuickActive =
      typeof parsed.quickActive === "boolean"
        ? parsed.quickActive
        : !!parsed.activeOnly;

    return { writable: true, state: {
      ...DEFAULT_STATE,
      ...parsed,
      ...(storageKey === LS_KEY ? parsed : Object.fromEntries(Object.keys(DEFAULT_STATE).map(key => [key, parsed[key] ?? DEFAULT_STATE[key as keyof FiltersState]]))),
      localTable: localClassSelection ? normalizeLocalTable(parsed.localTable ?? {}) : undefined,
      servers: Array.isArray(parsed.servers) ? excludeHiddenPickerServers(parsed.servers) : [],
      classes: localClassSelection
        ? (parsed.classes === undefined && parsed.localClassSelectionVersion === 1 && Number.isInteger(parsed.localClassSelectionMask) && parsed.localClassSelectionMask >= 0 && parsed.localClassSelectionMask < (1 << CLASSES.length)
          ? CLASSES.filter((_, index) => (parsed.localClassSelectionMask & (1 << index)) !== 0).map(c => c.key)
          : Array.isArray(parsed.classes) && (parsed.classes.length === 0 ? parsed.localClassSelectionVersion === 1 : parsed.classes.some((key: string) => CLASSES.some(c => c.key === key))) ? CLASSES.filter(c => parsed.classes.includes(c.key)).map(c => c.key) : defaults.classes)
        : Array.isArray(parsed.classes) ? parsed.classes : [],
      localClassSelectionVersion: localClassSelection ? 1 : undefined,
      guilds: Array.isArray(parsed.guilds) ? parsed.guilds : [],
      favoritesOnly: typeof parsed.favoritesOnly === "boolean" ? parsed.favoritesOnly : parsedQuickFav,
      activeOnly: typeof parsed.activeOnly === "boolean" ? parsed.activeOnly : parsedQuickActive,
      quickFav: parsedQuickFav,
      quickActive: parsedQuickActive,
      days: normDays,
      listView: normListView,
      filterMode: normFilterMode,
      bottomFilterOpen: !!parsed.bottomFilterOpen,
      serverSheetOpen: false,
      sortBy: typeof parsed.sortBy === "string" ? parsed.sortBy : DEFAULT_STATE.sortBy,
      searchText: typeof parsed.searchText === "string" ? parsed.searchText : DEFAULT_STATE.searchText,
    } };
  } catch {
    return { state: defaults, writable: storageKey === LS_KEY };
  }
}

const Ctx = createContext<FiltersContextValue | null>(null);

const uniqueList = (list: string[]) => Array.from(new Set(list));
function resolveNext<T>(next: T | ((prev: T) => T), prev: T): T {
  return typeof next === "function" ? (next as (prevValue: T) => T)(prev) : next;
}

export function FilterProvider({ children, storageKey = LS_KEY, migrateFrom, localClassSelection = false }: { children: React.ReactNode; storageKey?: string; migrateFrom?: string; localClassSelection?: boolean }) {
  const [restored] = useState(() => loadFromStorage(storageKey, migrateFrom, localClassSelection));
  const [state, setState] = useState<FiltersState>(restored.state);
  const [persistenceError, setPersistenceError] = useState<string | null>(restored.writable ? null : "read-error");
  const storageBasis = useRef<string | null | undefined>(undefined);
  const latestState = useRef(state);
  latestState.current = state;
  // Keep the established persistence lifecycle of other filter consumers.
  useEffect(() => () => {
    if (localClassSelection || !latestState.current.serverSheetOpen) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ ...latestState.current, serverSheetOpen: false })); } catch { /* legacy consumer */ }
  }, [storageKey, localClassSelection]);
  // Capture the persisted basis before the first write. React StrictMode can replay
  // effects; compare against our last successful write rather than stale state.
  useEffect(() => {
    if (!localClassSelection) {
      try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* legacy consumer */ }
      return;
    }
    if (!restored.writable && state === restored.state) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (storageBasis.current !== undefined && raw !== storageBasis.current) { setPersistenceError("conflict"); return; }
      storageBasis.current = raw;
      const next = persistLocalFilters(localStorage, storageKey, raw, state);
      storageBasis.current = next;
      setPersistenceError(null);
    } catch { setPersistenceError("write-error"); }
  }, [state, restored, storageKey, localClassSelection]);
  const setLocalTable = useCallback<React.Dispatch<React.SetStateAction<LocalTableFilters>>>(next => {
    setState(s => ({ ...s, localTable: resolveNext(next, s.localTable ?? DEFAULT_LOCAL_TABLE) }));
  }, []);

  // --------- Server ----------
  const setServers = (next: StringArrayUpdater) =>
    setState((s) => ({
      ...s,
      servers: uniqueList(excludeHiddenPickerServers(resolveNext(next, s.servers))),
    }));

  const toggleServer = (sv: string) =>
    setState((s) => {
      if (isHiddenPickerServer(sv)) return s;
      const set = new Set(s.servers);
      set.has(sv) ? set.delete(sv) : set.add(sv);
      return { ...s, servers: Array.from(set) };
    });

  const clearServers = () => setState((s) => ({ ...s, servers: [] }));

  // --------- Klassen ----------
  const setClasses = (next: StringArrayUpdater) =>
    setState((s) => ({
      ...s,
      classes: uniqueList(resolveNext(next, s.classes)),
    }));

  const toggleClass = (cls: string) =>
    setState((s) => {
      const set = new Set(s.classes);
      set.has(cls) ? set.delete(cls) : set.add(cls);
      return { ...s, classes: Array.from(set) };
    });

  const clearClasses = () => setState((s) => ({ ...s, classes: [] }));

  // --------- Gilden ----------
  const setGuilds = (next: StringArrayUpdater) =>
    setState((s) => ({
      ...s,
      guilds: uniqueList(resolveNext(next, s.guilds)),
    }));

  const toggleGuild = (guild: string) =>
    setState((s) => {
      const set = new Set(s.guilds);
      set.has(guild) ? set.delete(guild) : set.add(guild);
      return { ...s, guilds: Array.from(set) };
    });

  const clearGuilds = () => setState((s) => ({ ...s, guilds: [] }));

  // --------- Zeit / Sort / Flags ----------
  const setDays = (d: DaysFilter) => setState((s) => ({ ...s, days: d }));
  const setRange = (d: DaysFilter) => setDays(d); // Alias

  const setSortBy = (srt: string) =>
    setState((s) => ({ ...s, sortBy: srt || "level" }));

  const setFavoritesOnly = (b: boolean) =>
    setState((s) => ({ ...s, favoritesOnly: !!b, quickFav: !!b }));

  const setActiveOnly = (b: boolean) =>
    setState((s) => ({ ...s, activeOnly: !!b, quickActive: !!b }));

  const setSearchText = (text: string) =>
    setState((s) => ({ ...s, searchText: text }));

  const setQuickFav = (next: BooleanUpdater) =>
    setState((s) => {
      const value = resolveNext(next, s.quickFav);
      return { ...s, quickFav: value, favoritesOnly: value };
    });

  const setQuickActive = (next: BooleanUpdater) =>
    setState((s) => {
      const value = resolveNext(next, s.quickActive);
      return { ...s, quickActive: value, activeOnly: value };
    });

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
  const resetFilters = () => setState(localClassSelection ? { ...DEFAULT_STATE, classes: CLASSES.map(c => c.key), localClassSelectionVersion: 1 } : DEFAULT_STATE);
  const resetAll = () => resetFilters();

  const value = useMemo<FiltersContextValue>(
    () => ({
      persistenceError, localTable: state.localTable ?? DEFAULT_LOCAL_TABLE, setLocalTable,
      // Daten-Filter (lesen)
      servers: state.servers,
      classes: state.classes,
      guilds: state.guilds,
      days: state.days,
      range: state.days, // Backwards-Compat
      sortBy: state.sortBy,
      favoritesOnly: state.favoritesOnly,
      activeOnly: state.activeOnly,
      searchText: state.searchText,
      quickFav: state.quickFav,
      quickActive: state.quickActive,

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
      setGuilds,
      toggleGuild,
      clearGuilds,
      setDays,
      setRange,
      setSortBy,
      setFavoritesOnly,
      setActiveOnly,
      setSearchText,
      setQuickFav,
      setQuickActive,
      setFilterMode,
      setListView,
      setBottomFilterOpen,
      setServerSheetOpen,

      // Reset
      resetFilters,
      resetAll,
    }),
    [state, persistenceError, setLocalTable]
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
      persistenceError: null, localTable: DEFAULT_LOCAL_TABLE, setLocalTable: () => {},
      guilds: DEFAULT_STATE.guilds,
      range: DEFAULT_STATE.days,
      searchText: DEFAULT_STATE.searchText,
      quickFav: DEFAULT_STATE.quickFav,
      quickActive: DEFAULT_STATE.quickActive,
      setServers: () => {},
      toggleServer: () => {},
      clearServers: () => {},
      setClasses: () => {},
      toggleClass: () => {},
      clearClasses: () => {},
      setGuilds: () => {},
      toggleGuild: () => {},
      clearGuilds: () => {},
      setDays: () => {},
      setRange: () => {},
      setSortBy: () => {},
      setFavoritesOnly: () => {},
      setActiveOnly: () => {},
      setSearchText: () => {},
      setQuickFav: () => {},
      setQuickActive: () => {},
      setFilterMode: () => {},
      setListView: () => {},
      setBottomFilterOpen: () => {},
      setServerSheetOpen: () => {},
      resetFilters: () => {},
      resetAll: () => {},
    };
  }
  return v;
}

/** One owner for durable local filter fields; functional patches preserve peers. */
export function useLocalToplistSetting<K extends keyof LocalTableFilters>(key: K): [LocalTableFilters[K], React.Dispatch<React.SetStateAction<LocalTableFilters[K]>>] {
  const { localTable, setLocalTable } = useFilters();
  const set = useCallback<React.Dispatch<React.SetStateAction<LocalTableFilters[K]>>>(next => setLocalTable(previous => ({ ...previous, [key]: resolveNext(next, previous[key]) })), [key, setLocalTable]);
  return [localTable[key], set];
}
