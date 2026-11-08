import type { GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { serverComparisonKey } from "../../lib/servers/serverResolver";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import { groupScanArchiveEntries } from "../../lib/scanArchive/logicalScanGroups";
import { isArchiveReadinessCurrent } from "../../lib/data-hub/archiveReadiness";

/** Summaries here come from the management library's complete Raw-backed list.
 * Stored/annotated rows remain usable for management; readiness requires the
 * same versioned confirmation as the Data Hub. */
export function findArchiveOverviewReady(entry: ScanArchiveEntry, summaries: readonly GuildHubScanSummary[]) {
  return summaries.find(summary => summary.archiveBindings?.some(binding => isArchiveReadinessCurrent(binding, summary, entry, true))) ?? null;
}

export type ArchiveOverviewMember = { id: string; entry: ScanArchiveEntry | null; localSummary: GuildHubScanSummary | null };
export type ArchiveOverviewDay = {
  id: string; month: string; server: string; firstTimestamp: number; lastTimestamp: number; members: ArchiveOverviewMember[]; requiredEntries: readonly ScanArchiveEntry[];
};

export function archiveDisplayDay(timestamp: number, timeZone?: string) {
  if (!Number.isFinite(timestamp)) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(timestamp);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupArchiveOverviewDays(rows: readonly ArchiveOverviewMember[], timeZone?: string): ArchiveOverviewDay[] {
  const byEntry = new Map(rows.flatMap(row => row.entry ? [[row.entry, row] as const] : []));
  const groups = groupScanArchiveEntries([...byEntry.keys()]).map(scan => ({
    id: scan.id, members: scan.entries.map(entry => byEntry.get(entry)!), requiredEntries: scan.requiredEntries,
  }));
  for (const row of rows) {
    if (!row.entry) groups.push({ id: `local:${row.id}`, members: [row], requiredEntries: [] });
  }
  return groups.map(group => {
    const timestamps = group.members.map(row => row.entry?.timestamp ?? row.localSummary?.archiveSource?.timestamp ?? row.localSummary?.lastSnapshotTimestamp ?? NaN);
    const firstTimestamp = Math.min(...timestamps), lastTimestamp = Math.max(...timestamps);
    const row = group.members[0];
    const inputServer = row.entry?.server ?? row.localSummary?.archiveSource?.server ?? row.localSummary?.servers.join(", ") ?? "";
    const server = serverComparisonKey(inputServer) ?? inputServer.trim().toLowerCase();
    const day = archiveDisplayDay(firstTimestamp, timeZone);
    return { ...group, server, month: day === "unknown" ? day : day.slice(0, 7), firstTimestamp, lastTimestamp };
  }).sort((a, b) => b.lastTimestamp - a.lastTimestamp || a.id.localeCompare(b.id));
}

export function getArchiveOverviewStatus(group: ArchiveOverviewDay, summaries: readonly GuildHubScanSummary[]) {
  const local = group.requiredEntries.length
    ? group.requiredEntries.map(entry => Boolean(findArchiveOverviewLocal(entry, summaries)))
    : group.members.map(row => Boolean(row.localSummary));
  return {
    local: local.some(Boolean),
    complete: local.length > 0 && local.every(Boolean),
    ready: group.requiredEntries.length > 0 && group.requiredEntries.every(entry => Boolean(findArchiveOverviewReady(entry, summaries))),
  };
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
