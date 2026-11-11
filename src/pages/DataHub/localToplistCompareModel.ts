import { compareLocalToplists, type LocalToplistComparisonResult } from "../../lib/toplists/localToplistComparison";
import type { IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { getFusionEventForTarget } from "../../lib/servers/serverResolver";
import { LOCAL_SERVER_FUSION_EVENTS } from "../../data/serverFusions";
import { localToplistResultRevision } from "../../lib/toplists/localToplistDatasetRevision";
import type { ToplistGuildRow, ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import { collectScanArchiveEntriesFromToplistSelections } from "../../lib/scanArchive/searchIndexService";
import {
  resolveScanArchiveCurrentToplistScans,
  resolveScanArchiveMonthlyToplistScans,
  type ScanArchiveToplistSelectionResult,
} from "../../lib/scanArchive/toplistSelection";
import type { ScanArchiveEntry, ScanArchiveManifest } from "../../lib/scanArchive/types";
import { normalizeToplistServerSelection } from "./localToplistPageModel";
import type { LocalToplistLoadResult } from "../../lib/toplists/localToplistService";
import { localToplistDatasetId } from "../../lib/toplists/localToplistStore";
import type {
  LocalGuildToplistRow,
  LocalPlayerToplistRow,
  LocalToplistSnapshotMeta,
} from "../../lib/toplists/localToplistTypes";
import type {
  LocalGuildToplistComparisonRow,
  LocalPlayerToplistComparisonRow,
  LocalToplistComparisonSnapshotSet,
} from "../../lib/toplists/localToplistComparison";

export type LocalToplistCompareMode = "off" | "progress" | "months";
export type LocalToplistCompareAvailability = "inactive" | "complete" | "partial" | "unavailable";

export type LocalToplistCompareIssue = {
  code:
    | "compare-off"
    | "missing-baseline-month"
    | "missing-target-month"
    | "missing-previous-server"
    | "missing-current-server"
    | "no-common-servers";
  message: string;
  server?: string;
  month?: string;
};

export type LocalToplistCompareEntryPlan = {
  active: boolean;
  status: LocalToplistCompareAvailability;
  mode: Exclude<LocalToplistCompareMode, "off"> | null;
  previousMonth: string;
  currentMonth: string;
  missingPreviousServers: string[];
  missingCurrentServers: string[];
  commonServers: string[];
  previousServers: string[];
  currentServers: string[];
  previousEntries: ScanArchiveEntry[];
  currentEntries: ScanArchiveEntry[];
  previousDatasetId: string;
  currentDatasetId: string;
  loadKey: string;
  issues: LocalToplistCompareIssue[];
  noticeMessages: string[];
};

type ResolveCompareEntriesInput = {
  mode: LocalToplistCompareMode;
  /** Player opt-in; guild and legacy consumers retain direct-server selection. */
  resolveFusionSources?: boolean;
  selectedServers: readonly string[];
  progressSinceMonth: string;
  compareFromMonth: string;
  compareToMonth: string;
  manifests: readonly ScanArchiveManifest[];
  manifestUrlsByYear: Readonly<Record<number, string>>;
};

const normalizeServerCode = (value: unknown) =>
  normalizeToplistServerSelection([String(value ?? "")])[0] ?? "";

const normalizeServers = (servers: readonly string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  servers.forEach((server) => {
    const code = normalizeServerCode(server);
    if (!code || seen.has(code)) return;
    seen.add(code);
    normalized.push(code);
  });
  return normalized;
};

const formatServerList = (servers: readonly string[]) => {
  if (servers.length <= 2) return servers.join(" and ");
  return `${servers.slice(0, -1).join(", ")} and ${servers[servers.length - 1]}`;
};

const formatMissingServersMessage = (
  servers: readonly string[],
  side: "previous" | "current",
  month: string,
  mode: Exclude<LocalToplistCompareMode, "off">,
) => {
  const serverList = formatServerList(servers);
  const subject = servers.length === 1 ? `Server ${serverList}` : `Servers ${serverList}`;
  const verb = servers.length === 1 ? "has" : "have";
  if (side === "previous") return `${subject} ${verb} no comparison baseline for ${month}.`;
  if (mode === "progress") return `${subject} ${verb} no current comparison target.`;
  return `${subject} ${verb} no comparison target for ${month}.`;
};

// Resolve each side against its own keys; UI aliases must never become archive keys.
const selectedArchiveServerKeys = (
  manifests: readonly ScanArchiveManifest[],
  selectedServers: readonly string[],
  month?: string,
) => {
  const selected = new Set(selectedServers);
  const keys = manifests.flatMap((manifest) => Object.keys(
    month == null ? manifest.toplists?.current ?? {} : manifest.toplists?.monthly?.[month] ?? {},
  ));
  return [...new Set(keys)].filter((key) => selected.has(normalizeServerCode(key)));
};

const selectedSelectionByServer = (selections: Readonly<Record<string, ScanArchiveToplistSelectionResult>>) => {
  const map = new Map<string, Extract<ScanArchiveToplistSelectionResult, { status: "selected" }>>();
  Object.values(selections).forEach((selection) => {
    if (selection.status !== "selected") return;
    const server = normalizeServerCode(selection.server);
    if (server) map.set(server, selection);
  });
  return map;
};

const entriesFromSelections = (
  selections: readonly Extract<ScanArchiveToplistSelectionResult, { status: "selected" }>[],
  manifestUrlsByYear: Readonly<Record<number, string>>,
) => collectScanArchiveEntriesFromToplistSelections(selections, manifestUrlsByYear);

const monthFromTimestamp = (timestampMs: number | null) => {
  if (timestampMs == null || !Number.isFinite(timestampMs)) return "";
  const date = new Date(timestampMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const maxEntryMonth = (entries: readonly ScanArchiveEntry[]) => {
  const latest = Math.max(0, ...entries.map((entry) => entry.timestamp));
  return latest > 0 ? monthFromTimestamp(latest) : "";
};

const inactivePlan = (
  issues: LocalToplistCompareIssue[] = [],
  noticeMessages: string[] = issues.map((issue) => issue.message),
): LocalToplistCompareEntryPlan => ({
  active: false,
  status: "inactive",
  mode: null,
  previousMonth: "",
  currentMonth: "",
  missingPreviousServers: [],
  missingCurrentServers: [],
  commonServers: [],
  previousServers: [],
  currentServers: [],
  previousEntries: [],
  currentEntries: [],
  previousDatasetId: localToplistDatasetId([]),
  currentDatasetId: localToplistDatasetId([]),
  loadKey: "compare:off",
  issues,
  noticeMessages,
});

export function resolveLocalToplistCompareEntryPlan(input: ResolveCompareEntriesInput): LocalToplistCompareEntryPlan {
  if (input.mode === "off") return inactivePlan([{ code: "compare-off", message: "Compare is disabled." }]);

  const requestedServers = normalizeServers(input.selectedServers);
  if (!requestedServers.length) {
    return { ...inactivePlan([{ code: "no-common-servers", message: "No server selected for comparison." }]), status: "unavailable" };
  }

  const previousMonth = input.mode === "progress" ? input.progressSinceMonth.trim() : input.compareFromMonth.trim();
  const requestedCurrentMonth = input.mode === "months" ? input.compareToMonth.trim() : "";
  const issues: LocalToplistCompareIssue[] = [];

  if (!previousMonth) {
    issues.push({ code: "missing-baseline-month", message: "No comparison baseline month selected." });
  }
  if (input.mode === "months" && !requestedCurrentMonth) {
    issues.push({ code: "missing-target-month", message: "No comparison target month selected." });
  }
  if (issues.length) {
    return { ...inactivePlan(issues), status: "unavailable" };
  }

  const resolveSide = (month?: string) => {
    type Selection = Extract<ScanArchiveToplistSelectionResult, { status: "selected" }>;
    const cache = new Map<string, Selection | undefined>();
    const direct = (server: string) => {
      if (cache.has(server)) return cache.get(server);
      const keys = selectedArchiveServerKeys(input.manifests, [server], month);
      const selections = month == null
        ? resolveScanArchiveCurrentToplistScans(input.manifests, keys)
        : resolveScanArchiveMonthlyToplistScans(input.manifests, keys, month);
      const selected = selectedSelectionByServer(selections).get(server);
      cache.set(server, selected);
      return selected;
    };
    const resolve = (server: string, before = Infinity, visited = new Set<string>()): { selections: Selection[]; missing: string[] } => {
      if (visited.has(server)) return { selections: [], missing: [server] };
      const event = getFusionEventForTarget(server);
      const start = event?.effectiveDate ? Date.parse(`${event.effectiveDate}T00:00:00Z`) : null;
      const selected = direct(server);
      // Keep the established direct selection and its complete monthly set.
      // A predecessor must also belong to the requested month and life span.
      if (selected && (before === Infinity || selected.scans.every(scan =>
        scan.timestamp < before && (start == null || scan.timestamp >= start) &&
        monthFromTimestamp(scan.timestamp) === month))) {
        return { selections: [selected], missing: [] };
      }
      if (!input.resolveFusionSources || !month || start == null ||
          !Number.isFinite(start) || Date.parse(`${month}-01T00:00:00Z`) >= start) {
        return { selections: [], missing: [server] };
      }
      const path = new Set([...visited, server]);
      const origins = event!.origins.map(origin => resolve(origin, Math.min(before, start), path));
      return { selections: origins.flatMap(value => value.selections), missing: origins.flatMap(value => value.missing) };
    };
    return new Map(requestedServers.map(server => [server, resolve(server)]));
  };
  const previousByServer = resolveSide(previousMonth);
  const currentByServer = resolveSide(input.mode === "progress" ? undefined : requestedCurrentMonth);
  const missingPreviousServers = [...new Set([...previousByServer.values()].flatMap(value => value.missing))];
  const missingCurrentServers = [...new Set([...currentByServer.values()].flatMap(value => value.missing))];
  const commonServers = requestedServers.filter(server =>
    previousByServer.get(server)!.selections.length && currentByServer.get(server)!.selections.length);

  missingPreviousServers.forEach((server) => {
    issues.push({
      code: "missing-previous-server",
      server,
      month: previousMonth,
      message: `Server ${server} has no comparison baseline for ${previousMonth}.`,
    });
  });
  missingCurrentServers.forEach((server) => {
    issues.push({
      code: "missing-current-server",
      server,
      month: requestedCurrentMonth,
      message: input.mode === "progress"
        ? `Server ${server} has no current comparison target.`
        : `Server ${server} has no comparison target for ${requestedCurrentMonth}.`,
    });
  });

  const noticeMessages = [
    ...(missingPreviousServers.length
      ? [formatMissingServersMessage(missingPreviousServers, "previous", previousMonth, input.mode)]
      : []),
    ...(missingCurrentServers.length
      ? [formatMissingServersMessage(missingCurrentServers, "current", requestedCurrentMonth, input.mode)]
      : []),
  ];

  const hasComparisonSources = input.resolveFusionSources
    ? [...previousByServer.values()].some(value => value.selections.length) && [...currentByServer.values()].some(value => value.selections.length)
    : commonServers.length > 0;
  if (!hasComparisonSources) {
    const issue = { code: "no-common-servers" as const, message: "No selected server exists on both comparison sides." };
    issues.push(issue);
    noticeMessages.push(issue.message);
  }

  // A physical source may be reached through several selected fusion paths.
  const selectionsFor = (side: ReturnType<typeof resolveSide>) => [...new Map(
    (input.resolveFusionSources && hasComparisonSources ? requestedServers : commonServers).flatMap(server => side.get(server)!.selections)
      .map(selection => [selection.server, selection] as const),
  ).values()];
  const previousSelections = selectionsFor(previousByServer);
  const currentSelections = selectionsFor(currentByServer);
  const previousServers = normalizeServers(previousSelections.map(selection => selection.server));
  const currentServers = normalizeServers(currentSelections.map(selection => selection.server));
  const previousEntries = entriesFromSelections(previousSelections, input.manifestUrlsByYear);
  const currentEntries = entriesFromSelections(currentSelections, input.manifestUrlsByYear);
  const currentMonth = input.mode === "months" ? requestedCurrentMonth : maxEntryMonth(currentEntries);
  const previousDatasetId = localToplistDatasetId(previousEntries);
  const currentDatasetId = localToplistDatasetId(currentEntries);
  const status: LocalToplistCompareAvailability = !hasComparisonSources
    ? "unavailable"
    : issues.length
      ? "partial"
      : "complete";

  return {
    active: true,
    status,
    mode: input.mode,
    previousMonth,
    currentMonth,
    missingPreviousServers,
    missingCurrentServers,
    commonServers,
    previousServers,
    currentServers,
    previousEntries,
    currentEntries,
    previousDatasetId,
    currentDatasetId,
    loadKey: [
      "compare-v2",
      JSON.stringify(LOCAL_SERVER_FUSION_EVENTS),
      input.resolveFusionSources ? "fusion" : "direct",
      requestedServers.join(","),
      input.mode,
      previousMonth,
      currentMonth,
      commonServers.join(","),
      previousDatasetId,
      currentDatasetId,
    ].join("|"),
    issues,
    noticeMessages,
  };
}

/** Continue the selected calendar-month interval: C -> B has the same span as B -> A. */
export function resolveHistoricalStatsDayEntryPlan(
  comparison: LocalToplistCompareEntryPlan,
  input: Pick<ResolveCompareEntriesInput, "selectedServers" | "manifests" | "manifestUrlsByYear">,
): LocalToplistCompareEntryPlan {
  const index = (month: string) => {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : NaN;
  };
  const from = index(comparison.previousMonth), span = index(comparison.currentMonth) - from;
  if (!comparison.active || !Number.isInteger(span) || span < 1 || from - span < 12) return inactivePlan();
  const earlier = from - span;
  const month = `${String(Math.floor(earlier / 12)).padStart(4, "0")}-${String(earlier % 12 + 1).padStart(2, "0")}`;
  return resolveLocalToplistCompareEntryPlan({ ...input, mode: "months", resolveFusionSources: true,
    progressSinceMonth: "", compareFromMonth: month, compareToMonth: comparison.previousMonth });
}

/** Use the same observed times, rounding and confirmed identities as the current daily values. */
export function buildHistoricalPlayerStatsDayValues(
  plan: LocalToplistCompareEntryPlan, earlier: LocalToplistLoadResult, baseline: LocalToplistLoadResult,
  identities: IdentityResolutionSnapshot,
): LocalToplistComparisonResult["playerStatsDayValues"] {
  return compareLocalToplists(
    buildLocalToplistComparisonSnapshotSet(plan.previousMonth, earlier),
    buildLocalToplistComparisonSnapshotSet(plan.currentMonth, baseline),
    { playerSources: plan, playerIdentities: identities },
  ).playerStatsDayValues;
}

export const buildLocalToplistComparisonSnapshotSet = (
  month: string,
  result: LocalToplistLoadResult,
): LocalToplistComparisonSnapshotSet => ({
  month,
  contentRevision: localToplistResultRevision(result),
  snapshots: result.snapshots,
  players: result.playerRows,
  guilds: result.guildRows,
  issues: result.issues,
});

const rowScanSec = (row: { latestScanAtSec?: number | null; scanTimestamp?: number }) => {
  if (typeof row.latestScanAtSec === "number" && Number.isFinite(row.latestScanAtSec)) return row.latestScanAtSec;
  if (typeof row.scanTimestamp === "number" && Number.isFinite(row.scanTimestamp)) return Math.floor(row.scanTimestamp / 1000);
  return null;
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const statsPerDay = (
  current: LocalPlayerToplistRow | null,
  previous: LocalPlayerToplistRow | null,
  field: "sum" | "sumTotal",
) => {
  if (!current || !previous) return { days: null as number | null, perDay: null as number | null };
  const currentSec = rowScanSec(current);
  const previousSec = rowScanSec(previous);
  const currentValue = toNumber(current[field]);
  const previousValue = toNumber(previous[field]);
  if (currentSec == null || previousSec == null || !(currentSec > previousSec) || currentValue == null || previousValue == null) {
    return { days: null, perDay: null };
  }
  const days = Math.max(1, Math.round(((currentSec - previousSec) * 1000) / 86_400_000));
  return { days, perDay: Math.round((currentValue - previousValue) / days) };
};

export function summarizeLocalPlayerCompareRows(rows: readonly LocalPlayerToplistComparisonRow[], mode: "base" | "total", includes: (row: LocalPlayerToplistRow) => boolean) {
  const target = rows.filter(row => row.current && row.currentTableRank != null && includes(row.current)).sort((a, b) => (a.currentTableRank ?? Infinity) - (b.currentTableRank ?? Infinity));
  let sum = 0, count = 0, max: number | null = null;
  target.forEach((row, index) => {
    const value = statsPerDay(row.current, row.previous, mode === "total" ? "sumTotal" : "sum").perDay;
    if (value == null) return;
    if (index < 100) { sum += value; count++; }
    if (max == null || value > max) max = value;
  });
  return { average: count ? sum / count : null, max };
}

const playerCompareIndexes = new WeakMap<readonly LocalPlayerToplistComparisonRow[], Map<string, LocalPlayerToplistComparisonRow>>();

export function enrichLocalPlayerCompareRows(input: {
  rows: readonly (ToplistPlayerRow & { __localRow?: LocalPlayerToplistRow; tableRank?: number })[];
  comparisonRows: readonly LocalPlayerToplistComparisonRow[];
  playerAvgMode: "base" | "total";
}) {
  let byIdentifier = playerCompareIndexes.get(input.comparisonRows);
  if (!byIdentifier) {
    byIdentifier = new Map<string, LocalPlayerToplistComparisonRow>();
    input.comparisonRows.forEach((row) => {
      const currentIdentifier = row.current?.identifier;
      const previousIdentifier = row.previous?.identifier;
      const server = row.current?.server ?? row.previous?.server ?? "";
      const identifier = currentIdentifier ?? previousIdentifier;
      if (!identifier) return;
      byIdentifier!.set(`${normalizeServerCode(server)}\u0000${identifier.toLowerCase()}`, row);
    });
    playerCompareIndexes.set(input.comparisonRows, byIdentifier);
  }

  return input.rows.map((row) => {
    const local = row.__localRow;
    const key = local ? `${normalizeServerCode(local.server)}\u0000${local.identifier.toLowerCase()}` : "";
    const comparison = key ? byIdentifier.get(key) : null;
    const compareMissing = !comparison || comparison.status !== "matched";
    const baseStats = comparison ? statsPerDay(comparison.current, comparison.previous, "sum") : { days: null, perDay: null };
    const totalStats = comparison ? statsPerDay(comparison.current, comparison.previous, "sumTotal") : { days: null, perDay: null };
    return {
      ...row,
      _rank: row.tableRank ?? comparison?.currentTableRank,
      rankings: comparison?.rankings ?? row.rankings,
      _rankDelta: comparison?.rankDelta ?? null,
      _compareMissing: compareMissing,
      _statsPerDay: input.playerAvgMode === "total" ? totalStats.perDay : baseStats.perDay,
      _statsDays: input.playerAvgMode === "total" ? totalStats.days : baseStats.days,
      _statsPerDayBase: baseStats.perDay,
      _statsDaysBase: baseStats.days,
      _statsPerDayTotal: totalStats.perDay,
      _statsDaysTotal: totalStats.days,
      _delta: comparison?.deltas ?? {
        level: null,
        main: null,
        con: null,
        sum: null,
        ratio: null,
        mainTotal: null,
        conTotal: null,
        sumTotal: null,
        xpProgress: null,
        xpTotal: null,
        mine: null,
        treasury: null,
      },
    };
  });
}

export function enrichLocalGuildCompareRows(input: {
  rows: readonly (ToplistGuildRow & { __localRow?: LocalGuildToplistRow; tableRank?: number })[];
  comparisonRows: readonly LocalGuildToplistComparisonRow[];
}) {
  const byIdentifier = new Map<string, LocalGuildToplistComparisonRow>();
  input.comparisonRows.forEach((row) => {
    const currentIdentifier = row.current?.guildIdentifier;
    const previousIdentifier = row.previous?.guildIdentifier;
    const server = row.current?.server ?? row.previous?.server ?? "";
    const identifier = currentIdentifier ?? previousIdentifier;
    if (!identifier) return;
    byIdentifier.set(`${normalizeServerCode(server)}\u0000${identifier.toLowerCase()}`, row);
  });

  return input.rows.map((row) => {
    const local = row.__localRow;
    const key = local ? `${normalizeServerCode(local.server)}\u0000${local.guildIdentifier.toLowerCase()}` : "";
    const comparison = key ? byIdentifier.get(key) : null;
    return {
      ...row,
      _rank: row.tableRank ?? comparison?.currentTableRank,
      rankings: comparison?.rankings ?? row.rankings,
      _rankDelta: comparison?.rankDelta ?? null,
      _compareMissing: !comparison || comparison.status !== "matched",
      _delta: comparison?.deltas ?? {},
    };
  });
}

export const latestCompareUpdatedAt = (snapshots: readonly LocalToplistSnapshotMeta[]) => {
  const latest = Math.max(0, ...snapshots.map((snapshot) => Math.floor(snapshot.scanTimestamp / 1000)));
  return latest > 0 ? latest * 1000 : null;
};
