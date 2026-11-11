import type { LocalToplistRankings, LocalToplistRankKey } from "../../lib/toplists/localToplistView";
import { getToplistRankDeltaDisplay, formatToplistNumberWithSpaceGrouping } from "./toplistCompareDisplay";

export default function ToplistRankingValue({ rankings, rankKey, showCompare }: {
  rankings?: LocalToplistRankings; rankKey: LocalToplistRankKey; showCompare: boolean;
}) {
  const value = rankings?.[rankKey];
  const delta = showCompare ? getToplistRankDeltaDisplay(value?.delta, false) : null;
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
    <span>{value?.rank == null ? "n/a" : formatToplistNumberWithSpaceGrouping(value.rank)}</span>
    {delta && <span className={`rank-delta-chip rank-delta-chip--${delta.variant}`}>{delta.text}</span>}
  </div>;
}
