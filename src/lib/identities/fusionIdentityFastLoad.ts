import type { ScanArchiveEntry } from "../scanArchive/types";
import { groupScanArchiveEntries } from "../scanArchive/logicalScanGroups";
import { resolveServer } from "../servers/serverResolver";
import { listFusionIdentityAnalysisScopes, type FusionIdentityAnalysisScope } from "./fusionIdentityScopes";

const codeOf = (server: string) => resolveServer(server)?.code ?? server;
const dateOf = (date?: string) => date ? Date.parse(`${date}T00:00:00Z`) : NaN;
const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => {
  const aNamed = resolveServer(a)?.type === "named";
  const bNamed = resolveServer(b)?.type === "named";
  return Number(bNamed) - Number(aNamed) || a.localeCompare(b, undefined, { numeric: !aNamed });
});

/** Archive selection only. Matching and local import validation keep their existing owners. */
export function selectFusionIdentityFastLoadEntries(
  entries: readonly ScanArchiveEntry[], server: string, year: number,
  scopes: readonly FusionIdentityAnalysisScope[] = listFusionIdentityAnalysisScopes(),
) {
  const target = codeOf(server);
  const scope = scopes.find(row => row.targetServerCode === target);
  const windows = new Map<string, { from: number; until: number }>();
  const visit = (code: string, until: number, path: Set<string>) => {
    if (path.has(code)) return;
    const event = scope?.ancestorEvents.find(row => row.targetServerCode === code);
    const start = dateOf(event?.effectiveDate ?? (code === target ? scope?.effectiveDate : undefined));
    windows.set(code, { from: Number.isFinite(start) ? start : -Infinity, until });
    const nextPath = new Set(path).add(code);
    const origins = event?.originServerCodes ?? (code === target ? scope?.directOriginServerCodes : []);
    for (const origin of origins ?? []) visit(origin, Number.isFinite(start) ? Math.min(start, until) : until, nextPath);
  };
  visit(target, Infinity, new Set());
  return entries.filter(entry => {
    const window = windows.get(codeOf(entry.server));
    return entry.archiveYear === year && window && entry.timestamp >= window.from && entry.timestamp < window.until;
  }).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function getFusionIdentityFastLoadOptions(entries: readonly ScanArchiveEntry[], scopes = listFusionIdentityAnalysisScopes()) {
  const candidates = sorted(scopes.filter(scope => scope.isCurrentTerminalTarget).map(scope => scope.targetServerCode));
  const years = [...new Set(entries.map(entry => entry.archiveYear))].sort((a, b) => b - a);
  return candidates.map(server => {
    const availableYears = years.filter(year => selectFusionIdentityFastLoadEntries(entries, server, year, scopes).length);
    return { server, years: availableYears };
  });
}

export const fastLoadEntryServerCode = (entry: ScanArchiveEntry) => codeOf(entry.server);

/** Display counts only: explicit manifest sets are one scan; acquisition keeps every raw entry. */
export function getFusionIdentityFastLoadScanCounts(
  entries: readonly ScanArchiveEntry[], isLocal: (entry: ScanArchiveEntry) => boolean,
) {
  const scans = groupScanArchiveEntries(entries);
  const count = scans.length;
  const local = scans.filter(scan => scan.requiredEntries.every(isLocal)).length;
  return { count, local, pending: count - local };
}

/** Explain the existing local inventory flags, independently of archive availability. */
export function getFusionIdentityFastLoadMissingBasis(inventory?: {
  hasHistoricalObservations: boolean; hasCurrentTargetObservations: boolean;
}) {
  if (!inventory?.hasHistoricalObservations) {
    return inventory?.hasCurrentTargetObservations ? "missingHistory" : "missingBoth";
  }
  return inventory.hasCurrentTargetObservations ? null : "missingCurrent";
}
