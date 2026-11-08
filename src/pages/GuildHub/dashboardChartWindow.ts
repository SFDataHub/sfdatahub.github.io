import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { guildObservationIdentifierCandidates } from "../../lib/identities/guildObservationIdentity";

export type GuildChartRangeSelection = "12months" | "all" | `${number}`;
export type GuildChartRangeControl = {
  value: GuildChartRangeSelection; times: readonly number[];
  onChange: (value: GuildChartRangeSelection) => void;
};
export function guildChartRangeStart(value: GuildChartRangeSelection, endMs: number) {
  if (value === "all") return 0;
  if (value !== "12months") return Number(value);
  const date = new Date(endMs), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCFullYear(date.getUTCFullYear() - 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}

/** Sources have already passed the Dashboard's confirmed guild selection.
 * Slices expose the other observations inside a multi-date own import. */
export function guildChartAvailableTimes(sources: readonly { sourceScanId: string; scannedAtMs: number; guildIdentifier?: string | null; guild: { server?: string | null } }[], summaries: readonly GuildHubScanSummary[], endMs: number) {
  const byId = new Map(summaries.map(summary => [summary.sourceScanId, summary]));
  return [...new Set(sources.flatMap(source => {
    const aliases = new Set(guildObservationIdentifierCandidates(source.guildIdentifier, source.guild.server));
    const times = byId.get(source.sourceScanId)?.fusionInventorySlices?.filter(slice => slice.guildIdentifiers?.some(identifier => aliases.has(identifier.toLowerCase()))).map(slice => slice.timestampMs) ?? [];
    return [source.scannedAtMs, ...times];
  }))].filter(at => Number.isFinite(at) && at < endMs).sort((a, b) => b - a);
}
