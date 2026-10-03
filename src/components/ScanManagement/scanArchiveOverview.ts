import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { normalizeServerKeyFromInput } from "../../lib/players/identifier";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";

export type ArchiveOverviewMember = { id: string; entry: ScanArchiveEntry | null; localSummary: GuildHubScanSummary | null };
export type ArchiveOverviewDay = {
  id: string; month: string; server: string; firstTimestamp: number; lastTimestamp: number; members: ArchiveOverviewMember[];
};

export function archiveDisplayDay(timestamp: number, timeZone?: string) {
  if (!Number.isFinite(timestamp)) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(timestamp);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupArchiveOverviewDays(rows: readonly ArchiveOverviewMember[], timeZone?: string): ArchiveOverviewDay[] {
  const groups = new Map<string, ArchiveOverviewDay>();
  for (const row of rows) {
    const timestamp = row.entry?.timestamp ?? row.localSummary?.archiveSource?.timestamp ?? row.localSummary?.lastSnapshotTimestamp ?? NaN;
    const inputServer = row.entry?.server ?? row.localSummary?.archiveSource?.server ?? row.localSummary?.servers.join(", ") ?? "";
    const server = normalizeServerKeyFromInput(inputServer) ?? inputServer.trim().toLowerCase();
    const day = archiveDisplayDay(timestamp, timeZone);
    const id = `${server}|${day}`;
    const group = groups.get(id);
    if (group) {
      group.members.push(row);
      group.firstTimestamp = Math.min(group.firstTimestamp, timestamp);
      group.lastTimestamp = Math.max(group.lastTimestamp, timestamp);
    } else groups.set(id, { id, server, month: day === "unknown" ? day : day.slice(0, 7), firstTimestamp: timestamp, lastTimestamp: timestamp, members: [row] });
  }
  return [...groups.values()].sort((a, b) => b.lastTimestamp - a.lastTimestamp || a.id.localeCompare(b.id));
}

export const archiveGroupLocalIds = (members: readonly ArchiveOverviewMember[]) =>
  [...new Set(members.flatMap(row => row.localSummary ? [row.localSummary.sourceScanId] : []))];

// Match the same confirmed source/binding contracts as explicit local-first acquisition.
export function findArchiveOverviewLocal(entry: ScanArchiveEntry, summaries: readonly GuildHubScanSummary[]) {
  return summaries.find(scan => {
    if (scan.archiveSource?.archiveScanId === entry.id && scan.archiveSource.sha256 === entry.sha256) return true;
    return scan.archiveBindings?.some(binding => binding.archiveScanId === entry.id &&
      binding.sha256.toLowerCase() === entry.sha256.toLowerCase() && binding.archiveYear === entry.archiveYear &&
      binding.server === entry.server && binding.timestamp === entry.timestamp &&
      binding.localScanId === scan.sourceScanId && binding.localContentHash === scan.contentHash);
  }) ?? null;
}
