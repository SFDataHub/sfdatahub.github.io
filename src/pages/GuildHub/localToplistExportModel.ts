import type { ToplistGuildRow, ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import type { GuildToplistsPresetData } from "../Toplists/guildtoplists";
import type { PlayerPresetReadOnlyData } from "../Toplists/playertoplists";

export type LocalToplistExportTab = "players" | "guilds";
export type LocalToplistExportValueMode = "base" | "total";
export type LocalToplistExportSort = {
  metricKey: string;
  direction: "asc" | "desc";
};

export type LocalToplistExportBlockedReason =
  | "exporting"
  | "no_servers"
  | "not_table_view"
  | "loading"
  | "error"
  | "no_current_entries"
  | "unavailable"
  | "empty";

export type LocalPlayerToplistExportSnapshot = {
  kind: "players";
  selectedServers: string[];
  selectedClasses: string[];
  sort: LocalToplistExportSort;
  valueMode: LocalToplistExportValueMode;
  updatedAt: number | null;
  rowCount: number;
  presetReadOnlyData: PlayerPresetReadOnlyData;
};

export type LocalGuildToplistExportSnapshot = {
  kind: "guilds";
  selectedServers: string[];
  sort: LocalToplistExportSort;
  valueMode: LocalToplistExportValueMode;
  updatedAt: number | null;
  rowCount: number;
  presetReadOnlyData: GuildToplistsPresetData;
};

export type LocalToplistExportSnapshot =
  | LocalPlayerToplistExportSnapshot
  | LocalGuildToplistExportSnapshot;

export type LocalToplistExportModel =
  | { canExport: true; snapshot: LocalToplistExportSnapshot; blockedReason: null }
  | { canExport: false; snapshot: null; blockedReason: LocalToplistExportBlockedReason };

export type BuildLocalToplistExportModelOptions = {
  tab: LocalToplistExportTab;
  selectedServers: readonly string[];
  selectedClasses: readonly string[];
  listView: string;
  contextLoading: boolean;
  dataLoading: boolean;
  viewLoading: boolean;
  contextError: string | null;
  dataError: string | null;
  viewError: string | null;
  hasCurrentEntries: boolean;
  isFullyUnavailable: boolean;
  isExporting: boolean;
  playerRows: readonly ToplistPlayerRow[] | null;
  visiblePlayerRows: readonly ToplistPlayerRow[] | null;
  guildRows: readonly ToplistGuildRow[] | null;
  playerSort: LocalToplistExportSort;
  guildSort: LocalToplistExportSort;
  playerValueMode: LocalToplistExportValueMode;
  guildValueMode: LocalToplistExportValueMode;
  playerUpdatedAt: number | null;
  guildUpdatedAt: number | null;
  playerError: string | null;
  guildError: string | null;
  playerCompareLoading?: boolean;
  playerCompareExpected?: boolean;
  playerShowCompare?: boolean;
  playerCompareError?: string | null;
  guildCompareLoading?: boolean;
  guildCompareExpected?: boolean;
  guildShowCompare?: boolean;
  guildCompareError?: string | null;
};

const copyServers = (servers: readonly string[]) => servers.map((server) => String(server));
const copyClasses = (classes: readonly string[]) => classes.map((playerClass) => String(playerClass));

export const buildLocalToplistExportModel = (options: BuildLocalToplistExportModelOptions): LocalToplistExportModel => {
  if (options.isExporting) return { canExport: false, snapshot: null, blockedReason: "exporting" };
  if (options.selectedServers.length === 0) return { canExport: false, snapshot: null, blockedReason: "no_servers" };
  if (options.tab === "players" && options.listView !== "table") {
    return { canExport: false, snapshot: null, blockedReason: "not_table_view" };
  }
  if (options.contextLoading || options.dataLoading || options.viewLoading) {
    return { canExport: false, snapshot: null, blockedReason: "loading" };
  }
  if (options.contextError || options.dataError || options.viewError) {
    return { canExport: false, snapshot: null, blockedReason: "error" };
  }
  if (!options.hasCurrentEntries) return { canExport: false, snapshot: null, blockedReason: "no_current_entries" };
  if (options.isFullyUnavailable) return { canExport: false, snapshot: null, blockedReason: "unavailable" };

  if (options.tab === "players") {
    const rows = [...(options.playerRows ?? [])];
    if (!rows.length) return { canExport: false, snapshot: null, blockedReason: "empty" };
    const selectedServers = copyServers(options.selectedServers);
    const selectedClasses = copyClasses(options.selectedClasses);
    return {
      canExport: true,
      blockedReason: null,
      snapshot: {
        kind: "players",
        selectedServers,
        selectedClasses,
        sort: { ...options.playerSort },
        valueMode: options.playerValueMode,
        updatedAt: options.playerUpdatedAt,
        rowCount: rows.length,
        presetReadOnlyData: {
          rows,
          allRows: rows,
          tableLoading: false,
          compareLoading: options.playerCompareLoading ?? false,
          compareExpected: options.playerCompareExpected ?? false,
          showCompare: options.playerShowCompare ?? false,
          compareError: options.playerCompareError ?? null,
          playerError: options.playerError,
          playerLastUpdatedAt: options.playerUpdatedAt,
          playerScopeStatus: null,
          playerAvgMode: options.playerValueMode,
        },
      },
    };
  }

  const rows = [...(options.guildRows ?? [])];
  if (!rows.length) return { canExport: false, snapshot: null, blockedReason: "empty" };
  const selectedServers = copyServers(options.selectedServers);
  return {
    canExport: true,
    blockedReason: null,
    snapshot: {
      kind: "guilds",
      selectedServers,
      sort: { ...options.guildSort },
      valueMode: options.guildValueMode,
      updatedAt: options.guildUpdatedAt,
      rowCount: rows.length,
      presetReadOnlyData: {
        rows,
        loading: false,
        error: options.guildError,
        updatedAt: options.guildUpdatedAt,
        avgMode: options.guildValueMode,
        compareLoading: options.guildCompareLoading ?? false,
        compareExpected: options.guildCompareExpected ?? false,
        showCompare: options.guildShowCompare ?? false,
        compareError: options.guildCompareError ?? null,
      },
    },
  };
};
