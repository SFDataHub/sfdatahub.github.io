import React, { createContext, useContext } from "react";

import type { ServerGroupsByRegion } from "../components/Filters/serverGroups";
import type { ToplistGuildSnapshot, ToplistPlayerRow } from "../lib/toplists/toplistContracts";

type TimeRange = "all" | "3d" | "7d" | "14d" | "30d" | "60d" | "90d";
type SortDir = "asc" | "desc";

export type Filters = {
  group: string;
  servers: string[];
  classes: string[];
  timeRange: TimeRange;
};

export type SortSpec = { key: string; dir: SortDir };

export type PlayerToplistDataState = {
  rows: ToplistPlayerRow[];
  loading: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  nextUpdateAt: number | null;
  ttlSec: number | null;
  listId: string | null;
  rowLimit: number | null;
};

export type PlayerScopeStatus = {
  scopeId: string;
  lastRebuildAt: Date | null;
  lastChangeAt: Date | null;
  changesSinceLastRebuild: number;
  minChanges: number | null;
  maxAgeDays: number | null;
  progress: number;
  isFresh: boolean;
};

export type ToplistGuildSnapshotResult =
  | { ok: true; snapshot: ToplistGuildSnapshot }
  | { ok: false; error: "not_found" | "decode_error" | "firestore_error"; detail?: string };

export type ToplistsDataContextValue = {
  player: PlayerToplistDataState;
  playerRows: ToplistPlayerRow[];
  playerLoading: boolean;
  playerError: string | null;
  playerLastUpdatedAt: number | null;
  playerNextUpdateAt: number | null;
  playerScopeStatus: PlayerScopeStatus | null;
  serverGroups: ServerGroupsByRegion;
  filters: Filters;
  sort: SortSpec;
  getGuildToplistSnapshotCached: (serverCode: string) => Promise<ToplistGuildSnapshotResult>;
  setFilters: (next: Partial<Filters> | ((prev: Filters) => Filters)) => void;
  setSort: (next: SortSpec | ((prev: SortSpec) => SortSpec)) => void;
};

export const ToplistsDataContext = createContext<ToplistsDataContextValue | null>(null);

export function ToplistsDataStaticProvider({
  value,
  children,
}: {
  value: ToplistsDataContextValue;
  children: React.ReactNode;
}) {
  return <ToplistsDataContext.Provider value={value}>{children}</ToplistsDataContext.Provider>;
}

export function useToplistsData(): ToplistsDataContextValue {
  const ctx = useContext(ToplistsDataContext);
  if (!ctx) {
    throw new Error("useToplistsData() must be used inside <ToplistsProvider>.");
  }
  return ctx;
}
