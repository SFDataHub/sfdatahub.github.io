// src/context/ToplistsDataContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type TimeRange = "all" | "3d" | "7d" | "14d" | "30d" | "60d" | "90d";
type SortField = "Level" | "Base" | "Constitution" | "Sum Base Stats" | "Last Scan" | "Name";
type SortDir = "asc" | "desc";

export type Filters = {
  servers: string[];
  classes: string[];
  timeRange: TimeRange;
};

export type SortSpec = { field: SortField; dir: SortDir };

export type Row = Record<string, any>;

type DataState = {
  loading: boolean;
  error: string | null;
  data: Row[];
  lastUpdated: number | null;
};

type Ctx = {
  state: DataState;
  filters: Filters;
  sort: SortSpec;
  setFilters: (next: Partial<Filters> | ((prev: Filters) => Filters)) => void;
  setSort: (next: SortSpec | ((prev: SortSpec) => SortSpec)) => void;
};

const ToplistsCtx = createContext<Ctx | null>(null);

// ---- helpers ---------------------------------------------------------------

const arrEq = (a: any[], b: any[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function filtersEqual(a: Filters, b: Filters) {
  return (
    a.timeRange === b.timeRange &&
    arrEq(a.servers, b.servers) &&
    arrEq(a.classes, b.classes)
  );
}

function sortEqual(a: SortSpec, b: SortSpec) {
  return a.field === b.field && a.dir === b.dir;
}

// ---- provider --------------------------------------------------------------

export function ToplistsProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<Filters>({
    servers: [],
    classes: [],
    timeRange: "all",
  });

  const [sort, setSortState] = useState<SortSpec>({
    field: "Level",
    dir: "desc",
  });

  const [state, setState] = useState<DataState>({
    loading: false,
    error: null,
    data: [],
    lastUpdated: null,
  });

  // Setter nur updaten, wenn sich wirklich etwas ändert
  const setFilters = useCallback(
    (next: Partial<Filters> | ((prev: Filters) => Filters)) => {
      setFiltersState((prev) => {
        const merged =
          typeof next === "function" ? (next as any)(prev) : { ...prev, ...next };
        return filtersEqual(prev, merged) ? prev : merged;
      });
    },
    []
  );

  const setSort = useCallback((next: SortSpec | ((prev: SortSpec) => SortSpec)) => {
    setSortState((prev) => {
      const nextVal = typeof next === "function" ? (next as any)(prev) : next;
      return sortEqual(prev, nextVal) ? prev : nextVal;
    });
  }, []);

  // Stabiles Query-Key; nur primitive Dependencies
  const queryKey = useMemo(
    () =>
      JSON.stringify({
        s: sort.field + ":" + sort.dir,
        t: filters.timeRange,
        srv: filters.servers.join(","),
        cls: filters.classes.join(","),
      }),
    [filters.timeRange, filters.servers, filters.classes, sort.field, sort.dir]
  );

  // Daten laden (Platzhalter) – hier NICHTS fetchen, um Reads zu verhindern
  useEffect(() => {
    let cancelled = false;

    // Wenn du später Firestore reaktivierst: erst hier setState(loading: true)
    // und nach erfolgreichem Fetch wieder auf false. Aber bitte *nur einmal*
    // je Änderung von queryKey.

    // Platzhalter – zeigt "Ready • 0 rows", ohne irgendwas zu fetchen.
    if (!cancelled) {
      setState((prev) =>
        prev.loading || prev.error || prev.data.length
          ? { ...prev, loading: false, error: null }
          : prev
      );
    }

    return () => {
      cancelled = true;
    };
  }, [queryKey]);

  // Context-Value MEMOISIEREN, sonst re-rendert alles unnötig
  const value = useMemo<Ctx>(
    () => ({
      state,
      filters,
      sort,
      setFilters,
      setSort,
    }),
    [state, filters, sort, setFilters, setSort]
  );

  return <ToplistsCtx.Provider value={value}>{children}</ToplistsCtx.Provider>;
}

// ---- hook ------------------------------------------------------------------

export function useToplistsData(): Ctx {
  const ctx = useContext(ToplistsCtx);
  if (!ctx) {
    throw new Error("useToplistsData() must be used inside <ToplistsProvider>.");
  }
  return ctx;
}
