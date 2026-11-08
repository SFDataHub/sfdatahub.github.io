import React from "react";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
import { useFilters } from "../../../../src/components/Filters/FilterContext";
export const None = () => null;
export const Shell = ({ children, subheader }: { children?: React.ReactNode; subheader?: React.ReactNode }) => <div>{subheader}{children}</div>;
export const ExportController = React.forwardRef(() => null);
export const Forbidden = () => { (globalThis as any).w08.publicCalls++; throw new Error("Public profile/provider reached from local toplist"); };
export const getPlayerToplistSnapshotByDocIdCached = Forbidden;
export const useAuth = () => ({ user: { favorites: { players: {}, guilds: {} } } });
export const useGuildHubSelection = () => ({ activeGuild: { id: "f8_net_g1", guildId: "g1", server: "f8_net", name: "Proof Guild" }, activeGuildId: "f8_net_g1", isLoading: false });
export function HudFilters(props: { searchSlot?: React.ReactNode; onCompareModeChange: (mode: "off" | "months" | "progress") => void; onProgressSinceMonthChange: (month: string) => void; onCompareFromMonthChange: (month: string) => void; onCompareToMonthChange: (month: string) => void }) {
  const filters = useFilters();
  (globalThis as any).w08.filters = { ...filters, setServers: (servers: string[]) => { pageContextStore.selectServers(servers); filters.setServers(servers); } };
  return <div>{props.searchSlot}<button data-proof="compare" onClick={() => props.onCompareModeChange("months")}>Compare</button><button data-proof="from" onClick={() => props.onCompareFromMonthChange("2026-08")}>August</button><button data-proof="to" onClick={() => props.onCompareToMonthChange("2026-09")}>September</button><button data-proof="normal" onClick={() => props.onCompareModeChange("off")}>Normal</button><button data-proof="progress" onClick={() => props.onCompareModeChange("progress")}>Progress</button><button data-proof="since" onClick={() => props.onProgressSinceMonthChange("2026-08")}>Since August</button></div>;
}

export const Hero = ({ data }: { data: { playerName: string } }) => <div data-proof="hero">{data.playerName}</div>;
