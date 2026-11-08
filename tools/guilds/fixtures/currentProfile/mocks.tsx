import React from "react";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { buildLocalPlayerToplistView, buildLocalGuildToplistView } from "../../../../src/lib/toplists/localToplistView";
import type { LocalPlayerToplistRow, LocalGuildToplistRow } from "../../../../src/lib/toplists/localToplistTypes";
import type { LocalToplistViewWorkerViewRequest } from "../../../../src/lib/toplists/localToplistViewWorkerTypes";
import type { PlayerPresetReadOnlyData } from "../../../../src/pages/Toplists/playertoplists";
import type { ToplistPlayerRow } from "../../../../src/lib/toplists/toplistContracts";
import type { LocalHeroPanelData } from "../../../../src/components/local-player-profile/types";
import { w05 } from "./fixture";
export const None = () => null;
export const useGuildEmblemVisual = () => ({ visualEmblemUrl: null, accent: "#ccc" });
export const Shell = ({ children, subheader }: { children?: React.ReactNode; subheader?: React.ReactNode }) => <div>{subheader}{children}</div>;
export const Hero = ({ data }: { data: LocalHeroPanelData }) => <div data-testid="hero">{data.playerName}</div>;
export const FilterProvider = Shell;
export const ToplistsDataStaticProvider = Shell;
export const ExportController = React.forwardRef(() => null);
export const useAuth = () => ({ user: null });
export function useGuildHubSelection() {
  const [, refresh] = React.useState(0);
  React.useEffect(() => { w05.selectionRefresh = () => refresh(v => v + 1); return () => { w05.selectionRefresh = undefined; }; }, []);
  return { activeGuild: w05.guild, activeGuildId: w05.guild.id, isLoading: false };
}
export function useFilters() {
  const [servers, setServers] = React.useState<string[]>(["F8"]);
  const [sortBy, setSortBy] = React.useState("sum");
  const [searchText, setSearchText] = React.useState("");
  const [classes, setClasses] = React.useState<string[]>([]);
  const guilds = React.useMemo<string[]>(() => [], []);
  w05.filters = { setServers: (next: string[]) => { pageContextStore.selectServers(next); setServers(next); }, setSortBy, setClasses, setSearchText };
  return { servers, setServers, sortBy, setSortBy, searchText, setSearchText, classes, guilds,
    favoritesOnly: false, filterMode: "hud", bottomFilterOpen: false, serverSheetOpen: false,
    setBottomFilterOpen: () => {}, setServerSheetOpen: () => {} };
}
export function TableDataView({ presetReadOnlyData, onOpenPlayerProfile }: { presetReadOnlyData?: PlayerPresetReadOnlyData; onOpenPlayerProfile?: (row: ToplistPlayerRow) => void }) {
  return <div>{presetReadOnlyData?.rows.map(row => <button key={row.identifier} data-player={row.name} onClick={() => onOpenPlayerProfile?.(row)}>{row.name}</button>)}</div>;
}
export function HudFilters(props: { onCompareModeChange: (value: "months") => void; onCompareFromMonthChange: (value: string) => void; onCompareToMonthChange: (value: string) => void }) {
  return <>
    <button data-testid="historical-compare" onClick={() => props.onCompareModeChange("months")}>Historical compare</button>
    <button data-testid="compare-from-august" onClick={() => props.onCompareFromMonthChange("2026-08")}>From August</button>
    <button data-testid="compare-to-september" onClick={() => props.onCompareToMonthChange("2026-09")}>To September</button>
  </>;
}
export class LocalToplistViewWorkerCancelledError extends Error {}
export class LocalToplistViewWorkerSession {
  players: LocalPlayerToplistRow[] = [];
  guilds: LocalGuildToplistRow[] = [];
  async setData(_id: string, players: LocalPlayerToplistRow[], guilds: LocalGuildToplistRow[]) { this.players = players; this.guilds = guilds; }
  async requestView(request: LocalToplistViewWorkerViewRequest) {
    const playerView = buildLocalPlayerToplistView(this.players, request);
    const guildView = buildLocalGuildToplistView(this.guilds, request);
    return { requestId: 1, ok: true, type: "view", datasetId: request.datasetId, contentRevision: request.contentRevision, tab: request.tab, totalRows: request.tab === "players" ? playerView.rows.length : guildView.rows.length,
      page: 1, pageSize: request.pageSize, playerRows: playerView.rows, guildRows: guildView.rows };
  }
  async requestSearch() { return { datasetId: "", normalizedQuery: "", results: [] }; }
  terminate() {}
  dispose() {}
}
export class LocalPlayerIndexWorkerCancelledError extends Error {}
export const startLocalPlayerIndexWorkerRun = () => ({ promise: new Promise(() => {}), cancel: () => {} });
export class PlayerPerformanceWorkerCancelledError extends Error {}
export const startPlayerPerformanceWorkerRun = () => ({ promise: new Promise(() => {}), cancel: () => {} });
export const acquireDashboardLocalFirstFeatureScans = async () => ({ status: "cancelled" });

export const startSharedPlayerCardsRun = startLocalPlayerIndexWorkerRun;
export const startSharedGuildTrendRun = startPlayerPerformanceWorkerRun;
export const analyticsSummaryKey = (summaries: unknown) => JSON.stringify(summaries);
