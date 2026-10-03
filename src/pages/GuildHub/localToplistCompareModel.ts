import type { ToplistGuildRow, ToplistPlayerRow } from "../../lib/toplists/toplistContracts";
import { collectScanArchiveEntriesFromToplistSelections } from "../../lib/scanArchive/searchIndexService";
import {
  resolveScanArchiveCurrentToplistScans,
  resolveScanArchiveMonthlyToplistScans,
  type ScanArchiveToplistSelectionResult,
} from "../../lib/scanArchive/toplistSelection";
import type { ScanArchiveEntry, ScanArchiveManifest } from "../../lib/scanArchive/types";
import { resolveServer } from "../../lib/servers/serverResolver";
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
  selectedServers: readonly string[];
  progressSinceMonth: string;
  compareFromMonth: string;
  compareToMonth: string;
  manifests: readonly ScanArchiveManifest[];
  manifestUrlsByYear: Readonly<Record<number, string>>;
};

const normalizeServerCode = (value: unknown) =>
  resolveServer(String(value ?? ""))?.code ?? String(value ?? "").trim().toUpperCase();

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

  const previousSelections = resolveScanArchiveMonthlyToplistScans(input.manifests, requestedServers, previousMonth);
  const currentSelections = input.mode === "progress"
    ? resolveScanArchiveCurrentToplistScans(input.manifests, requestedServers)
    : resolveScanArchiveMonthlyToplistScans(input.manifests, requestedServers, requestedCurrentMonth);
  const previousByServer = selectedSelectionByServer(previousSelections);
  const currentByServer = selectedSelectionByServer(currentSelections);
  const missingPreviousServers = requestedServers.filter((server) => !previousByServer.has(server));
  const missingCurrentServers = requestedServers.filter((server) => !currentByServer.has(server));
  const commonServers = requestedServers.filter((server) => previousByServer.has(server) && currentByServer.has(server));

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

  if (!commonServers.length) {
    const issue = { code: "no-common-servers" as const, message: "No selected server exists on both comparison sides." };
    issues.push(issue);
    noticeMessages.push(issue.message);
  }

  const previousEntries = entriesFromSelections(commonServers.flatMap((server) => {
    const selection = previousByServer.get(server);
    return selection ? [selection] : [];
  }), input.manifestUrlsByYear);
  const currentEntries = entriesFromSelections(commonServers.flatMap((server) => {
    const selection = currentByServer.get(server);
    return selection ? [selection] : [];
  }), input.manifestUrlsByYear);
  const currentMonth = input.mode === "months" ? requestedCurrentMonth : maxEntryMonth(currentEntries);
  const previousDatasetId = localToplistDatasetId(previousEntries);
  const currentDatasetId = localToplistDatasetId(currentEntries);
  const status: LocalToplistCompareAvailability = !commonServers.length
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
    previousEntries,
    currentEntries,
    previousDatasetId,
    currentDatasetId,
    loadKey: [
      "compare",
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

export const buildLocalToplistComparisonSnapshotSet = (
  month: string,
  result: LocalToplistLoadResult,
): LocalToplistComparisonSnapshotSet => ({
  month,
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

export function enrichLocalPlayerCompareRows(input: {
  rows: readonly (ToplistPlayerRow & { __localRow?: LocalPlayerToplistRow; tableRank?: number })[];
  comparisonRows: readonly LocalPlayerToplistComparisonRow[];
  playerAvgMode: "base" | "total";
}) {
  const byIdentifier = new Map<string, LocalPlayerToplistComparisonRow>();
  input.comparisonRows.forEach((row) => {
    const currentIdentifier = row.current?.identifier;
    const previousIdentifier = row.previous?.identifier;
    const server = row.current?.server ?? row.previous?.server ?? "";
    const identifier = currentIdentifier ?? previousIdentifier;
    if (!identifier) return;
    byIdentifier.set(`${normalizeServerCode(server)}\u0000${identifier.toLowerCase()}`, row);
  });

  return input.rows.map((row) => {
    const local = row.__localRow;
    const key = local ? `${normalizeServerCode(local.server)}\u0000${local.identifier.toLowerCase()}` : "";
    const comparison = key ? byIdentifier.get(key) : null;
    const compareMissing = !comparison || comparison.status !== "matched";
    const baseStats = comparison ? statsPerDay(comparison.current, comparison.previous, "sum") : { days: null, perDay: null };
    const totalStats = comparison ? statsPerDay(comparison.current, comparison.previous, "sumTotal") : { days: null, perDay: null };
    return {
      ...row,
      _rank: comparison?.currentTableRank ?? row.tableRank,
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
      _rank: comparison?.currentTableRank ?? row.tableRank,
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
