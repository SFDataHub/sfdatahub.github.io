import React from "react";
import ActualHudFilters from "../../../../src/components/Filters/HudFilters";
import { useFilters } from "../../../../src/components/Filters/FilterContext";
import { pageContextStore } from "../../../../src/lib/data-hub/pageContextStore";
export { None, Shell, ExportController, Forbidden, useAuth, useGuildHubSelection, Hero, getPlayerToplistSnapshotByDocIdCached } from "../localToplistRevision/mocks";

export function HudFilters(props: React.ComponentProps<typeof ActualHudFilters>) {
  const filters = useFilters();
  (globalThis as any).w29.filters = { ...filters, setServers: (servers: string[]) => { pageContextStore.selectServers(servers); filters.setServers(servers); } };
  return <><ActualHudFilters {...props} /><div hidden>
    <button data-proof="compare" onClick={() => props.onCompareModeChange("months")}>Compare</button>
    <button data-proof="from" onClick={() => props.onCompareFromMonthChange("2026-08")}>August</button>
    <button data-proof="to" onClick={() => props.onCompareToMonthChange("2026-09")}>September</button>
    <button data-proof="normal" onClick={() => props.onCompareModeChange("off")}>Normal</button>
  </div></>;
}
