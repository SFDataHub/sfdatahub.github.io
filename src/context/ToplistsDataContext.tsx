// src/context/ToplistsDataContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchToplists, ToplistItem, ToplistResponse } from "../lib/api/toplists";

// WICHTIG: Deine Apps-Script Web-App URL (ohne Query)
const APPS_SCRIPT_BASE_URL =
  "https://script.google.com/macros/s/AKfycbwZJqFk8bZqTKe6Qk66HY3xblBSlSqf5U8dMh5gux-8FMpZsbUd7WQSIGLFZl0-U-_e/exec";

type Status = "idle" | "loading" | "success" | "error";

export type ToplistsState = {
  status: Status;
  error: string | null;
  items: ToplistItem[];
  total: number;
  generatedAt: string | null;
  // Paging
  pageSize: number;
  pageIndex: number;
  setPageIndex: (i: number) => void;
  // Steuerung
  reload: () => void;
};

const ToplistsDataContext = createContext<ToplistsState | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  // Filter/Steuerdaten kommen von deinem bestehenden UI/Context:
  servers: string[];
  classes: string[];
  search: string | null;
  range: "3d" | "7d" | "14d" | "30d" | "60d" | "90d" | "all";
  sort: "sum" | "main" | "constitution" | "level" | "delta" | "last_activity" | "rank";
  order: "asc" | "desc";
  pageSize?: number; // Default 120
};

export function ToplistsDataProvider({
  children,
  servers,
  classes,
  search,
  range,
  sort,
  order,
  pageSize = 120
}: ProviderProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ToplistItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // Bei Filterwechsel auf Seite 0 zurück
  useEffect(() => {
    setPageIndex(0);
  }, [servers.join(","), classes.join(","), search || "", range, sort, order]);

  const abortRef = useRef<AbortController | null>(null);

  const load = async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("loading");
    setError(null);

    try {
      const resp = await fetchToplists({
        baseUrl: APPS_SCRIPT_BASE_URL,
        servers,
        classes,
        search,
        range,
        sort,
        order,
        limit: pageSize,
        offset: pageIndex * pageSize,
        signal: ctrl.signal
      });

      if (!resp.ok) {
        const msg = (resp as Extract<ToplistResponse, { ok: false }>).error || "Unknown error";
        throw new Error(msg);
      }

      const ok = resp as Extract<ToplistResponse, { ok: true }>;
      setItems(ok.items);
      setTotal(ok.count);
      setGeneratedAt(ok.meta.generatedAt || null);
      setStatus("success");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setStatus("error");
      setError(String(err?.message || err));
      setItems([]);
      setTotal(0);
      setGeneratedAt(null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.join(","), classes.join(","), search || "", range, sort, order, pageIndex, pageSize]);

  const value = useMemo<ToplistsState>(
    () => ({
      status,
      error,
      items,
      total,
      generatedAt,
      pageSize,
      pageIndex,
      setPageIndex,
      reload: load
    }),
    [status, error, items, total, generatedAt, pageSize, pageIndex]
  );

  return <ToplistsDataContext.Provider value={value}>{children}</ToplistsDataContext.Provider>;
}

export function useToplistsData() {
  const ctx = useContext(ToplistsDataContext);
  if (!ctx) throw new Error("useToplistsData must be used within ToplistsDataProvider");
  return ctx;
}
