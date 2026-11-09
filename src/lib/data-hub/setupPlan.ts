import { LOCAL_SERVER_REGISTRY } from "../../data/serverRegistry";
import { getFusionEventForTarget, isFusionEventEffective, resolveServer } from "../servers/serverResolver";
import { loadScanArchiveCatalog, loadScanArchiveManifestEntries } from "../scanArchive/client";
import { groupScanArchiveEntries } from "../scanArchive/logicalScanGroups";
import { resolveScanArchiveCurrentToplistScan, scanArchiveMonthlyOptions } from "../scanArchive/toplistSelection";
import { collectScanArchiveEntriesFromToplistSelections } from "../scanArchive/searchIndexService";
import type { ScanArchiveEntry, ScanArchiveManifest } from "../scanArchive/types";
import { compareComparisonScanAge } from "../player-progress/comparisonScanSelection";
import { resolveLocalToplistCompareEntryPlan } from "../../pages/DataHub/localToplistCompareModel";
import { loadOrBuildLocalToplistSnapshots, type LocalToplistLoadProgress } from "../toplists/localToplistService";
import {
  getSfDataHubLocalScan, readHubSearchProjectionInventory, prepareGuildHubSearchProjection, putHubSearchProjection,
  listSfDataHubScanSummaries, type GuildHubScanSummary,
} from "../guilds/localScanLibrary";
import { findArchiveOverviewLocal } from "../../components/ScanManagement/scanArchiveOverview";
import { archivePhysicalKey } from "./archiveReadiness";
import type { DataHubSetupPreference } from "../settings/preferences";
import { isHubSearchProjectionCurrent } from "./hubSearchProjection";

export const normalizeSetupServers = (values: readonly string[]) => [...new Set(values.flatMap(value => {
  const server = resolveServer(value);
  return server ? [server.code] : [];
}))];

/** One contiguous named group; numbered groups retain their numeric ordering. */
export const setupServerGroups = () => {
  const groups = new Map<string, Array<{ code: string; label: string }>>();
  for (const server of LOCAL_SERVER_REGISTRY) {
    if (!server.active || server.code === "SPEED") continue;
    const key = server.type === "named" ? "named" : server.code.replace(/\d+$/, "");
    const rows = groups.get(key) ?? [];
    rows.push({ code: server.code, label: server.displayName }); groups.set(key, rows);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, rows]) => ({ key,
    servers: rows.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" })),
  }));
};

export type SetupArchive = {
  manifests: ScanArchiveManifest[];
  entries: ScanArchiveEntry[];
  urls: Record<number, string>;
  years: number[];
  failedYears: number[];
};
export async function loadSetupArchive(signal: AbortSignal): Promise<SetupArchive> {
  const catalog = await loadScanArchiveCatalog({ signal });
  const archives = catalog.archives.filter(archive => archive.active);
  const loaded = await Promise.allSettled(archives.map(async archive => ({
    ...await loadScanArchiveManifestEntries(archive, { signal }), url: archive.manifestUrl,
  })));
  signal.throwIfAborted();
  return {
    manifests: loaded.flatMap(row => row.status === "fulfilled" ? [row.value.manifest] : []),
    entries: loaded.flatMap(row => row.status === "fulfilled" ? row.value.entries : []),
    urls: Object.fromEntries(loaded.flatMap(row => row.status === "fulfilled" ? [[row.value.manifest.archiveYear, row.value.url]] : [])),
    years: archives.map(archive => archive.year).sort((a, b) => b - a),
    failedYears: archives.flatMap((archive, i) => loaded[i].status === "rejected" ? [archive.year] : []),
  };
}

export type SetupPlan = {
  entries: ScanArchiveEntry[];
  scans: ReturnType<typeof groupScanArchiveEntries>;
  local: number;
  predecessors: string[];
  missing: string[];
  failedYears: number[];
};

/** Central fusion dates bound each historical source to its actual server life. */
function historySegments(server: string, before = Infinity, visited = new Set<string>()): Array<{ server: string; from: number; to: number }> {
  if (visited.has(server)) return [];
  const event = getFusionEventForTarget(server);
  const start = event && isFusionEventEffective(event) && event.effectiveDate ? Date.parse(`${event.effectiveDate}T00:00:00Z`) : 0;
  const own = { server, from: start, to: before };
  return [own, ...(start ? event!.origins.flatMap(origin => historySegments(origin, Math.min(start, before), new Set([...visited, server]))) : [])];
}

export function buildSetupPlan(archive: SetupArchive, draft: DataHubSetupPreference, summaries: readonly GuildHubScanSummary[]): SetupPlan {
  const servers = normalizeSetupServers(draft.servers), missing = new Set<string>();
  const selected = new Map<string, ScanArchiveEntry>();
  const add = (entries: readonly ScanArchiveEntry[]) => {
    for (const group of groupScanArchiveEntries(entries)) for (const entry of group.requiredEntries) {
      const source = archive.entries.find(candidate => archivePhysicalKey(candidate) === archivePhysicalKey(entry));
      if (source) selected.set(archivePhysicalKey(source), source);
    }
  };
  for (const server of servers) {
    const segments = historySegments(server);
    const historical = archive.entries.filter(entry => segments.some(segment => resolveServer(entry.server)?.code === segment.server &&
      entry.timestamp >= segment.from && entry.timestamp < segment.to));
    if (draft.scope === "year") {
      const entries = historical.filter(entry => entry.archiveYear === draft.year);
      add(entries);
      if (!entries.length) missing.add(server);
      continue;
    }
    const keys = [...new Set(archive.manifests.flatMap(manifest => Object.keys(manifest.toplists?.current ?? {})))];
    const key = keys.find(value => resolveServer(value)?.code === server);
    const current = key ? resolveScanArchiveCurrentToplistScan(archive.manifests, key) : null;
    if (current?.status !== "selected") { missing.add(server); continue; }
    const currentEntries = collectScanArchiveEntriesFromToplistSelections([current], archive.urls);
    add(currentEntries);
    const at = Math.max(...current.scans.map(scan => scan.timestamp));
    const candidates = scanArchiveMonthlyOptions(archive.manifests).map(month => {
      const comparison = resolveLocalToplistCompareEntryPlan({ mode: "progress", resolveFusionSources: true,
        selectedServers: [server], progressSinceMonth: month, compareFromMonth: "", compareToMonth: "",
        manifests: archive.manifests, manifestUrlsByYear: archive.urls,
      });
      return { comparison, at: Math.max(0, ...comparison.previousEntries.map(entry => entry.timestamp)) };
    }).filter(candidate => candidate.at > 0 && candidate.at < at)
      .sort((a, b) => compareComparisonScanAge(a.at, b.at, at));
    const comparison = candidates[0]?.comparison;
    if (!comparison) { missing.add(server); continue; }
    add(comparison.previousEntries);
    comparison.missingPreviousServers.forEach(value => missing.add(value));
    if (!comparison.previousEntries.length) missing.add(server);
  }
  const entries = [...selected.values()], scans = groupScanArchiveEntries(entries);
  return { entries, scans,
    local: scans.filter(scan => scan.requiredEntries.every(entry => findArchiveOverviewLocal(entry, summaries))).length,
    predecessors: [...new Set(entries.flatMap(entry => {
      const code = resolveServer(entry.server)?.code; return code && !servers.includes(code) ? [code] : [];
    }))].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    missing: [...missing], failedYears: draft.scope === "year" ? archive.failedYears.filter(year => year === draft.year) : archive.failedYears,
  };
}

export type SetupProgress = { phase: LocalToplistLoadProgress["phase"]; complete: string[]; failed: string[]; total: number };

/** A logical scan is ready only after all source parts and shared projections.
 * The existing acquisition owns transport sharing/cancellation and atomic imports. */
export async function prepareSetupPlan(plan: SetupPlan, signal: AbortSignal, onProgress: (value: SetupProgress) => void) {
  const complete: string[] = [], failed: string[] = [];
  const report = (phase: SetupProgress["phase"]) => onProgress({ phase, complete: [...complete], failed: [...failed], total: plan.scans.length });
  for (const scan of plan.scans) {
    signal.throwIfAborted();
    try {
      const setEntries = scan.requiredEntries.map(entry => ({ ...entry,
        toplistSetKey: scan.requiredEntries.map(member => archivePhysicalKey(member)).join("|"),
        toplistSetScanIds: scan.requiredEntries.map(member => member.id),
      }));
      const result = await loadOrBuildLocalToplistSnapshots(setEntries, { signal,
        onProgress: progress => report(progress.phase), auditContext: { consumerArea: "DataHub setup", trigger: "explicit-setup" },
      });
      signal.throwIfAborted();
      if (result.status !== "complete" || result.failedSelections.length) throw Error("setup_scan_incomplete");
      report("composing");
      const inventory = await readHubSearchProjectionInventory();
      const summaries = await listSfDataHubScanSummaries();
      // A composed monthly snapshot can have a combined display identifier.
      // Search projections belong to each confirmed physical source instead.
      const sources = scan.requiredEntries.map(entry => findArchiveOverviewLocal(entry, summaries));
      if (sources.some(source => !source)) throw Error("setup_source_missing");
      const sourceIds = [...new Set(sources.map(source => source!.sourceScanId))];
      for (const id of sourceIds) {
        signal.throwIfAborted();
        const source = await getSfDataHubLocalScan(id);
        if (!source) throw Error("setup_source_missing");
        const summary = summaries.find(row => row.sourceScanId === id);
        if (summary && isHubSearchProjectionCurrent(inventory.projections.get(id), summary, source.contentHash, inventory.resetFor(id))) continue;
        const projection = await prepareGuildHubSearchProjection(source, inventory.resetFor(id), { signal });
        signal.throwIfAborted();
        await putHubSearchProjection(projection, { signal });
      }
      complete.push(scan.id);
    } catch (error) {
      signal.throwIfAborted();
      failed.push(scan.id);
    }
    report("composing");
  }
  // Import maintains local summaries; also await their real readable state.
  await listSfDataHubScanSummaries(); signal.throwIfAborted();
  return { complete, failed };
}
