import { profileClassLabel, profileRoleLabel } from "../../lib/i18n/profilePresentation";
import { hubText, hubLocale, hubNumber, hubPercent, hubMessage } from "../../lib/i18n/dataHubPresentation";
import { uploadViewEvents, scanViewEvents, trackLocalEvent, useAnalyticsView } from "../../lib/analytics/localEvents";
import { useRuntimeAuditCommit } from "../../lib/data-hub/useRuntimeAuditCommit";
import { auditBegin, auditEnter, auditValue, auditReturn, auditError, auditLeave, auditCaught, auditAccept, auditFinish, auditCount, auditObserveInputs } from "../../lib/data-hub/runtimeAudit";
import React from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";

import { useBackClose, hasBackCloseLayer } from "../../hooks/useBackClose";
import {
  deleteSfDataHubLocalScans,
  deriveGuildHubLogicalScanSnapshots,
  getSfDataHubLocalScan,
  getSfDataHubArchiveSearchIndexCache,
  importSfDataHubLocalScanRecords,
  listSfDataHubScanSummaries,
  renameSfDataHubScanSlot,
  subscribeToSfDataHubLocalScanChanges,
  updateSfDataHubLocalScan,
  type GuildHubScanMergeMode,
  type GuildHubScanSummary,
  type SfDataHubLocalScan,
  type GuildHubScanPreviewStatistics,
} from "../../lib/guilds/localScanLibrary";
import {
  loadScanArchiveEntries,
} from "../../lib/scanArchive/client";
import {
  startScanArchiveDownloadWorkerRun,
  prepareLocalScanImportInWorker,
  type ScanArchiveDownloadRun,
} from "../../lib/scanArchive/downloadWorkerClient";
import type { ScanArchiveDownloadProgress } from "../../lib/scanArchive/downloadWorkerTypes";
import { acquireExplicitLocalFirstArchiveScans } from "../../lib/scanArchive/localFirstScanAcquisition";
import { loadScanArchiveSearchIndexSet, ScanArchiveSearchIndexSet } from "../../lib/scanArchive/searchIndexService";
import { archiveGroupLocalIds, findArchiveOverviewLocal, getArchiveOverviewStatus, groupArchiveOverviewDays, type ArchiveOverviewDay } from "./scanArchiveOverview";
import { validateScanArchiveSearchIndexPayload } from "../../lib/scanArchive/validation";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import type { GuildSnapshotCoverageStatus } from "../../lib/guilds/guildCoverage";
import { normalizeGuildScanServer, normalizeGuildSegmentForScan } from "../../lib/guilds/guildScanNormalizer";
import {
  importFightTrackerTransferStates,
  readFightTrackerSummaries,
  readFightTrackerTransferState,
  type FightTrackerSummary,
} from "../../pages/GuildHub/fightTrackingStore";
import {
  createSfDataFileName,
  createSfDataHubTransferEnvelope,
  parseSfDataHubTransferEnvelope,
  stringifySfDataHubTransfer,
  type SfDataHubAnyTransferEnvelope,
} from "../../lib/transfer/sfDataHubTransfer";
import { getDataJobProgress, useDataJobs, type DataJob } from "../../context/DataJobsContext";
import { DataHubLoadingState } from "../ui/shared/DataHubLoadingState";
import styles from "./ScanManagementOverlay.module.css";
import {
  buildScanExplorerData,
  formatCoverageStatus as rawCoverageStatus,
  getScanExplorerGuildDetail,
  getLimitedScanExplorerResults,
  linkScanExplorerPlayerToGuildMember,
  normalizeScanExplorerPlayer,
  SCAN_EXPLORER_MAX_VISIBLE_RESULTS,
  type ScanExplorerData,
  type ScanExplorerGuildEntity,
  type ScanExplorerGuildGroup,
  type ScanExplorerPlayerEntity,
} from "./scanExplorer";
import {
  formatScanExplorerCompactEntryValue,
  formatScanExplorerPrimitiveValue,
  getVisibleScanExplorerMetrics,
  toScanExplorerTimestampDate,
} from "./scanExplorerFormatting";
import type { NormalizedPlayer } from "../../lib/parsing/normalizedPlayer";
import type { NormalizedGuild, NormalizedGuildMember, NormalizedPlayerGuildMemberLink } from "../../lib/parsing/normalizedGuild";

function formatCoverageStatus(status: GuildSnapshotCoverageStatus) {
  const raw = rawCoverageStatus(status);
  const labelKey = status === "complete" ? "coverage" : status === "overcount" ? "coverageOvercount" : status === "unknown" ? "unknown" : "coverageIncomplete";
  return { ...raw, label: hubText("dataHubI18n." + labelKey) };
}

type ScanManagementOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ImportFeedback = {
  imported: string[];
  duplicates: string[];
  updated: string[];
  deleted: number;
  errors: Array<{ filename: string; message: string }>;
};

type DataManagementTab = "scans" | "archive" | "fightTracker";

type PendingTransferImport = {
  kind: "transfer";
  id: string;
  filename: string;
  envelope: SfDataHubAnyTransferEnvelope;
};

type PendingScanJsonImport = {
  kind: "scanJson";
  id: string;
  filename: string;
  file: File;
  scan: SfDataHubLocalScan;
  statistics: GuildHubScanPreviewStatistics;
};

type PendingScanMergeImport = {
  kind: "scanMerge";
  id: string;
  filename: string;
  mode: GuildHubScanMergeMode;
  displayName: string;
  sourceIds: string[];
  summaries: GuildHubScanSummary[];
};

type PendingImport = PendingTransferImport | PendingScanJsonImport | PendingScanMergeImport;

type ScanDetailsData = ScanExplorerData;

type ArchiveTableRow = {
  id: string;
  entry: ScanArchiveEntry | null;
  localSummary: GuildHubScanSummary | null;
};

type ArchiveTableGroup = {
  id: string;
  label: string;
  rows: ArchiveOverviewDay[];
};

const EMPTY_FEEDBACK: ImportFeedback = {
  imported: [],
  duplicates: [],
  updated: [],
  deleted: 0,
  errors: [],
};

function createEmptyFeedback(): ImportFeedback {
  return {
    imported: [],
    duplicates: [],
    updated: [],
    deleted: 0,
    errors: [],
  };
}

function hasFeedback(feedback: ImportFeedback | null) {
  return Boolean(
    feedback &&
      (feedback.imported.length ||
        feedback.duplicates.length ||
        feedback.updated.length ||
        feedback.deleted ||
        feedback.errors.length),
  );
}

function formatScanDate(value: string | null | undefined) {
  if (!value) return hubText("dataHubI18n.unknown");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return hubText("dataHubI18n.unknown");

  return new Intl.DateTimeFormat(hubLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatScanDateShort(value: string | null | undefined) {
  if (!value) return hubText("dataHubI18n.unknown");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return hubText("dataHubI18n.unknown");

  return new Intl.DateTimeFormat(hubLocale(), {
    dateStyle: "medium",
  }).format(date);
}

function isoFromSummaryTimestamp(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function formatScanSnapshotCell(summary: GuildHubScanSummary) {
  if (summary.logicalScanCount <= 1) {
    return {
      label: formatScanDate(isoFromSummaryTimestamp(summary.firstSnapshotTimestamp) ?? summary.scannedAt),
      title: undefined,
    };
  }

  return {
    label: hubText("dataHubI18n.scanRange", { v1: summary.logicalScanCount, v2: formatScanDateShort(
      isoFromSummaryTimestamp(summary.firstSnapshotTimestamp),
    ), v3: formatScanDateShort(isoFromSummaryTimestamp(summary.lastSnapshotTimestamp)) }),
    title: summary.snapshotTimestamps.map((timestamp) => formatScanDate(new Date(timestamp).toISOString())).join("\n"),
  };
}

function formatArchiveScanSnapshotCell(entry: ScanArchiveEntry) {
  return {
    label: formatScanDate(new Date(entry.timestamp).toISOString()),
    title: entry.timestampUtc ?? new Date(entry.timestamp).toISOString(),
  };
}

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return hubText("dataHubI18n.unknown");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return hubText("dataHubI18n.unknown");

  return new Intl.DateTimeFormat(hubLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatServerList(scan: Pick<SfDataHubLocalScan, "servers"> | Pick<GuildHubScanSummary, "servers">) {
  return scan.servers.length ? scan.servers.join(", ") : hubText("dataHubI18n.unknown");
}

function getArchiveDisplayName(entry: ScanArchiveEntry) {
  const filename = entry.path.split("/").pop() ?? entry.id;
  return filename.endsWith(".gz") ? filename.slice(0, -3) : filename;
}

function getScanSortTimestamp(summary: GuildHubScanSummary) {
  return summary.lastSnapshotTimestamp ?? summary.firstSnapshotTimestamp ?? Number.NEGATIVE_INFINITY;
}

function getArchiveRowSortTimestamp(row: ArchiveTableRow) {
  return row.entry?.timestamp ?? row.localSummary?.archiveSource?.timestamp ?? getScanSortTimestamp(row.localSummary!) ?? Number.NEGATIVE_INFINITY;
}

function getArchiveRowServerSortKey(row: ArchiveTableRow) {
  const server = row.entry?.server ?? row.localSummary?.archiveSource?.server ?? row.localSummary?.servers.join(", ") ?? "";
  return server.trim().toLowerCase();
}

function formatArchiveMonthLabel(timestamp: number) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return hubText("dataHubI18n.unknownMonth");
  return new Intl.DateTimeFormat(hubLocale(), {
    month: "long",
    year: "numeric",
  }).format(date);
}

function downloadSfDataFile(filename: string, envelope: SfDataHubAnyTransferEnvelope) {
  const blob = new Blob([stringifySfDataHubTransfer(envelope)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadJsonFile(filename: string, value: unknown) {
  const normalizedFilename = normalizeMergeFilenameInput(filename);
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = normalizedFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getFileExtension(filename: string) {
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function createImportPreviewId() {
  return `transfer-preview:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function dateFromOptionalTimestamp(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : new Date();
}

function getScanGuildCount(scan: Pick<SfDataHubLocalScan, "guildCount" | "groupCount">) {
  return typeof scan.guildCount === "number" ? scan.guildCount : scan.groupCount;
}

function getDataManagementTabForTransferType(type: SfDataHubAnyTransferEnvelope["type"]): DataManagementTab {
  return type === "scan" || type === "scanpack" ? "scans" : "fightTracker";
}

function formatSelectedCount(count: number) {
  return hubText("dataHubI18n.selectedCount", { v1: count });
}

function formatCompactNames(names: string[], limit = 5) {
  const visible = names.slice(0, limit).join(", ");
  const remaining = names.length - limit;
  return remaining > 0 ? hubText("dataHubI18n.moreFiles", { v1: visible, v2: remaining }) : visible || hubText("dataHubI18n.unknown");
}

function normalizeMergeFilenameInput(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) throw new Error(hubText("dataHubI18n.filenameMustNotBeEmpty"));
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) {
    throw new Error(hubText("dataHubI18n.filenameContainsInvalidCharacters"));
  }
  return trimmed.toLowerCase().endsWith(".json") ? trimmed : `${trimmed}.json`;
}

function mergeFeedback(base: ImportFeedback, patch: Partial<ImportFeedback>): ImportFeedback {
  return {
    imported: patch.imported ?? base.imported,
    duplicates: patch.duplicates ?? base.duplicates,
    updated: patch.updated ?? base.updated,
    deleted: patch.deleted ?? base.deleted,
    errors: patch.errors ?? base.errors,
  };
}

function createMergeFilenameSuggestion(scans: Array<Pick<GuildHubScanSummary, "servers">>) {
  const servers = new Set(scans.flatMap((scan) => scan.servers.map((server) => server.trim()).filter(Boolean)));
  if (servers.size === 1) {
    const [server] = [...servers];
    return `${server}_history.json`;
  }
  return "sfdatahub_scan_bundle.json";
}

function createScanSlotNameSuggestion(scans: Array<Pick<GuildHubScanSummary, "servers">>) {
  const servers = new Set(scans.flatMap((scan) => scan.servers.map((server) => server.trim()).filter(Boolean)));
  if (servers.size === 1) {
    const [server] = [...servers];
    return hubText("dataHubI18n.historyName", { v1: server });
  }
  return hubText("dataHubI18n.newScanSlot");
}

function normalizeScanSlotNameInput(displayName: string) {
  const normalized = displayName.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(hubText("dataHubI18n.scanSlotNameMustNotBeEmpty"));
  return normalized;
}

function createScanSlotTechnicalFilename(displayName: string, summaries: GuildHubScanSummary[]) {
  const normalizedBase =
    displayName
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "scan_slot";
  const existingFilenames = new Set(summaries.map((summary) => summary.filename.toLowerCase()));
  let filename = `${normalizedBase}.json`;
  let suffix = 2;
  while (existingFilenames.has(filename.toLowerCase())) {
    filename = `${normalizedBase}_${suffix}.json`;
    suffix += 1;
  }
  return filename;
}

function getScanDisplayName(scan: Pick<GuildHubScanSummary, "displayName" | "filename">) {
  return scan.displayName?.trim() || scan.filename;
}

function getScanExportFilename(scan: Pick<GuildHubScanSummary, "displayName" | "filename" | "isScanSlot">) {
  if (!scan.isScanSlot) return scan.filename;
  return normalizeMergeFilenameInput(getScanDisplayName(scan).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_"));
}

function getScanSlotSourceInfo(scan: Pick<GuildHubScanSummary, "isScanSlot" | "mergedSourceIds" | "logicalScanCount">) {
  if (!scan.isScanSlot) return null;
  const sourceCount = scan.mergedSourceIds?.length ?? 0;
  return hubText("dataHubI18n.slotSourceCounts", { v1: sourceCount, v2: scan.logicalScanCount });
}

function formatCount(value: number) {
  return value.toLocaleString(hubLocale());
}

function getScanSourceTypeLabel(scan: Pick<GuildHubScanSummary, "isScanSlot" | "isMergedBundle">) {
  if (scan.isScanSlot) return hubText("dataHubI18n.slot");
  if (scan.isMergedBundle) return hubText("dataHubI18n.bundle");
  return hubText("dataHubI18n.scanLabel");
}

function formatCoverageRatio(row: ScanExplorerGuildGroup["rows"][number]) {
  return `${formatCount(row.countedMemberCount)} / ${
    row.declaredMemberCount == null ? "?" : formatCount(row.declaredMemberCount)
  }`;
}

function buildScanDetailsData(scan: SfDataHubLocalScan): ScanDetailsData {
  return buildScanExplorerData(scan);
}

function formatGroupStatus(group: ScanExplorerGuildGroup) {
  if (group.rows.length === 1) {
    const status = formatCoverageStatus(group.rows[0].status);
    return `${status.symbol} ${status.label}`;
  }

  const counts = group.rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { complete: 0, incomplete: 0, overcount: 0, unknown: 0 } as Record<GuildSnapshotCoverageStatus, number>,
  );

  return (Object.entries(counts) as Array<[GuildSnapshotCoverageStatus, number]>)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${formatCount(count)} ${formatCoverageStatus(status).symbol}`)
    .join(" · ");
}

function buildScanDetailsMetadata(summary: GuildHubScanSummary, data: ScanDetailsData | null): Array<{ label: string; value: string }> {
  const timestamps = data
    ? data.snapshots.map((snapshot) => snapshot.timestampMs).filter((value) => Number.isFinite(value))
    : summary.snapshotTimestamps;
  const firstTimestamp = timestamps.length ? Math.min(...timestamps) : summary.firstSnapshotTimestamp;
  const lastTimestamp = timestamps.length ? Math.max(...timestamps) : summary.lastSnapshotTimestamp;
  const servers = data?.snapshots.length
    ? [...new Set(data.snapshots.flatMap((snapshot) => snapshot.servers))]
    : summary.servers;

  return [
    { label: hubText("dataHubI18n.name"), value: getScanDisplayName(summary) },
    { label: hubText("dataHubI18n.file"), value: summary.filename },
    { label: hubText("dataHubI18n.type"), value: getScanSourceTypeLabel(summary) },
    { label: hubText("dataHubI18n.logicalScans"), value: formatCount(data?.snapshots.length ?? summary.logicalScanCount) },
    { label: hubText("dataHubI18n.firstTimestamp"), value: formatScanDate(isoFromSummaryTimestamp(firstTimestamp)) },
    { label: hubText("dataHubI18n.lastTimestamp"), value: formatScanDate(isoFromSummaryTimestamp(lastTimestamp)) },
    { label: hubText("dataHubI18n.server"), value: servers.length ? servers.join(", ") : hubText("dataHubI18n.unknown") },
    { label: hubText("dataHubI18n.player"), value: formatCount(data?.players.length ?? summary.playerCount) },
    { label: hubText("dataHubI18n.guilds"), value: formatCount(data?.guilds.length ?? summary.guildCount) },
  ];
}

export default function ScanManagementOverlay(props: ScanManagementOverlayProps) {
  return <ScanManagementContent {...props} overlay />;
}

function ScanManagementFrame({ overlay, onClose, titleId, children }: {
  overlay: boolean; onClose: () => void; titleId: string; children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!overlay) return;
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [overlay]);
  useFocusTrap(ref, overlay, { preventInitialScroll: true });
  if (!overlay) return <div className={styles.pageContent}>{children}</div>;
  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId}
    onClick={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={ref} className={styles.panel} onClick={event => event.stopPropagation()}>{children}</div>
  </div>;
}

const keepPageOpen = () => {};

/** One local management implementation; only the outer presentation is modal. */
export function ScanManagementContent({ isOpen = true, onClose = keepPageOpen, overlay = false, trackViews = true, initialTab = "scans" }: {
  isOpen?: boolean; onClose?: () => void; overlay?: boolean; trackViews?: boolean; initialTab?: DataManagementTab;
}) {
  const { t } = useTranslation();
  const titleId = React.useId();
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateTargetIdRef = React.useRef<string | null>(null);
  const archiveAcquisitionRef = React.useRef<AbortController | null>(null);
  const [expandedArchiveDays, setExpandedArchiveDays] = React.useState<Record<string, boolean>>({});
  const [archiveDayCounts, setArchiveDayCounts] = React.useState<Record<string, { players: number; guilds: number }>>({});
  const [archiveEntryErrors, setArchiveEntryErrors] = React.useState<Record<string, string>>({});
  const archiveDownloadRunsRef = React.useRef(new Map<string, ScanArchiveDownloadRun>());
  const [scans, setScans] = React.useState<GuildHubScanSummary[]>([]);
  const [archiveEntries, setArchiveEntries] = React.useState<ScanArchiveEntry[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(false);
  const [archiveLoading, setArchiveLoading] = React.useState(false);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [downloadingArchiveIds, setDownloadingArchiveIds] = React.useState<Set<string>>(() => new Set());
  const [archiveDownloadProgress, setArchiveDownloadProgress] = React.useState<Record<string, ScanArchiveDownloadProgress>>({});
  const [expandedArchiveMonths, setExpandedArchiveMonths] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<ImportFeedback | null>(null);
  const [storageError, setStorageError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<DataManagementTab>(initialTab);
  useAnalyticsView(isOpen && trackViews ? uploadViewEvents[activeTab] : null);
  const [trackerSummaries, setTrackerSummaries] = React.useState<FightTrackerSummary[]>([]);
  const [selectedTrackerIds, setSelectedTrackerIds] = React.useState<Set<string>>(() => new Set());
  const [trackersLoading, setTrackersLoading] = React.useState(false);
  const [trackersError, setTrackersError] = React.useState<string | null>(null);
  const [pendingImport, setPendingImport] = React.useState<PendingImport | null>(null);
  useAnalyticsView(isOpen && trackViews && pendingImport ? "datahub/uploads/import-preview" : null);
  const previewControllerRef = React.useRef<AbortController | null>(null);
  const [renamingSlot, setRenamingSlot] = React.useState<GuildHubScanSummary | null>(null);
  const [renameSlotValue, setRenameSlotValue] = React.useState("");
  const detailsRequestIdRef = React.useRef(0);
  const [detailsSummary, setDetailsSummary] = React.useState<GuildHubScanSummary | null>(null);
  const [detailsData, setDetailsData] = React.useState<ScanDetailsData | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const {
    isReady: dataJobsReady,
    runningSfToolsImportJob,
    runningScanMergeJob,
    startSfToolsImportJob,
    startScanMergeJob,
  } = useDataJobs();

  useBackClose(isOpen && overlay, onClose);

  const closeScanDetails = React.useCallback(() => {
    detailsRequestIdRef.current += 1;
    setDetailsSummary(null);
    setDetailsData(null);
    setDetailsLoading(false);
    setDetailsError(null);
  }, []);

  React.useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
    else {
      if (previewControllerRef.current) {
        previewControllerRef.current.abort();
        previewControllerRef.current = null;
        setBusy(false);
      }
      setPendingImport(null);
      setExpandedArchiveMonths({});
      closeScanDetails();
    }
  }, [closeScanDetails, isOpen, initialTab]);
  React.useEffect(() => () => { previewControllerRef.current?.abort(); }, []);

  const loadScans = React.useCallback(async () => {
    const __audit1 = auditBegin("F33", "loadScans");
    try {
    setStorageError(null);
    setLoading(true);
    try {
      const rows = await (auditValue(__audit1, auditEnter(__audit1, "listSfDataHubScanSummaries"), (listSfDataHubScanSummaries())));
      auditAccept(__audit1, rows);
      (auditValue(__audit1, auditEnter(__audit1, "state-enqueue:setScans", "sync-elapsed"), (setScans(rows))));
      const visibleIds = new Set(rows.map((scan) => scan.sourceScanId));
      setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
    } catch (error) { auditError(__audit1, error);
      console.error("[ScanManagement] failed to load scans", error);
      setStorageError("dataHubI18n.localScansCouldNotBeLoaded");
    } finally {
      setLoading(false);
    }

    } catch (__auditError) { auditError(__audit1, __auditError); throw __auditError; }
    finally { auditLeave(__audit1); }
}, []);

  const loadArchiveEntries = React.useCallback(async () => {
    const __audit2 = auditBegin("F34", "loadArchiveEntries");
    try {
    setArchiveError(null);
    setArchiveLoading(true);
    try {
      setArchiveEntries(await (auditValue(__audit2, auditEnter(__audit2, "loadScanArchiveEntries"), (loadScanArchiveEntries()))));
    } catch (error) { auditError(__audit2, error);
      console.error("[ScanManagement] failed to load scan archive", error);
      setArchiveEntries([]);
      setArchiveError("dataHubI18n.theScanArchiveCouldNotBeLoadedLocalScansRemainUsable");
    } finally {
      setArchiveLoading(false);
    }

    } catch (__auditError) { auditError(__audit2, __auditError); throw __auditError; }
    finally { auditLeave(__audit2); }
}, []);

  const loadFightTrackers = React.useCallback(async () => {
    setTrackersError(null);
    setTrackersLoading(true);
    try {
      const rows = await readFightTrackerSummaries();
      setTrackerSummaries(rows);
      setSelectedTrackerIds((current) => new Set(rows.filter((summary) => current.has(summary.tracker.id)).map((summary) => summary.tracker.id)));
    } catch (error) {
      console.error("[DataManagement] failed to load fight trackers", error);
      setTrackersError("dataHubI18n.fightTrackersCouldNotBeLoaded");
    } finally {
      setTrackersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    void loadScans();
    void loadArchiveEntries();
    return subscribeToSfDataHubLocalScanChanges(() => {
      void loadScans();
    });
  }, [isOpen, loadArchiveEntries, loadScans]);

  React.useEffect(() => {
    if (isOpen) return;
    archiveAcquisitionRef.current?.abort();
    archiveDownloadRunsRef.current.forEach((run) => run.cancel());
    archiveDownloadRunsRef.current.clear();
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== "fightTracker") return;
    void loadFightTrackers();
  }, [activeTab, isOpen, loadFightTrackers]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (detailsSummary) {
        closeScanDetails();
        return;
      }
      if (overlay && hasBackCloseLayer()) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeScanDetails, detailsSummary, isOpen, onClose, overlay]);

  React.useEffect(() => {
    if (!isOpen || (!overlay && !detailsSummary) || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, overlay, detailsSummary]);

  useRuntimeAuditCommit(scans, isOpen && !loading, "scan-management-inventory");
  const visibleScans = React.useMemo(() => scans.filter((scan) => !scan.containedInScanSlotId), [scans]);
  const ownVisibleScans = React.useMemo(
    () =>
      visibleScans
        .filter((scan) => !scan.archiveSource)
        .sort((left, right) => getScanSortTimestamp(right) - getScanSortTimestamp(left) || left.sourceScanId.localeCompare(right.sourceScanId)),
    [visibleScans],
  );
  const localArchiveScans = React.useMemo(
    () =>
      visibleScans
        .filter((scan) => Boolean(scan.archiveSource?.archiveScanId))
        .sort((left, right) => getScanSortTimestamp(right) - getScanSortTimestamp(left) || left.sourceScanId.localeCompare(right.sourceScanId)),
    [visibleScans],
  );
  const archiveManifestEntries = React.useMemo(() => {
 const __w32Run0=auditBegin("F34","archiveManifestEntries");
 const __w32Sync=auditEnter(__w32Run0,"archiveManifestEntries","sync-elapsed");
 try {
    const byId = new Map<string, ScanArchiveEntry>();
    for (const entry of archiveEntries) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
    return auditReturn(__w32Run0,[...byId.values()].sort((left, right) => right.timestamp - left.timestamp || left.server.localeCompare(right.server) || left.id.localeCompare(right.id)));

} catch (__w32Error) { auditError(__w32Run0,__w32Error); throw __w32Error; } finally {auditValue(__w32Run0,__w32Sync,undefined);auditLeave(__w32Run0);}
}, [archiveEntries]);
  const archiveRows = React.useMemo<ArchiveTableRow[]>(() => {
 const __w32Run1=auditBegin("F34","archiveRows");
 auditObserveInputs(__w32Run1, [archiveManifestEntries, scans]);
 const __w32Sync=auditEnter(__w32Run1,"archiveRows","sync-elapsed");
 try {
    if (archiveManifestEntries.length) {
      return auditReturn(__w32Run1,archiveManifestEntries
        .map((entry) => ({
        id: entry.id,
        entry,
        localSummary: findArchiveOverviewLocal(entry, scans),
        }))
        .sort(
          (left, right) =>
            getArchiveRowSortTimestamp(right) - getArchiveRowSortTimestamp(left) ||
            getArchiveRowServerSortKey(left).localeCompare(getArchiveRowServerSortKey(right), "de-DE", {
              numeric: true,
              sensitivity: "base",
            }) ||
            left.id.localeCompare(right.id),
        ));
    }

    return auditReturn(__w32Run1,localArchiveScans
      .map((scan) => ({
        id: scan.archiveSource?.archiveScanId ?? scan.sourceScanId,
        entry: null,
        localSummary: scan,
      }))
      .sort(
        (left, right) =>
          getArchiveRowSortTimestamp(right) - getArchiveRowSortTimestamp(left) ||
          getArchiveRowServerSortKey(left).localeCompare(getArchiveRowServerSortKey(right), "de-DE", {
            numeric: true,
            sensitivity: "base",
          }) ||
          left.id.localeCompare(right.id),
      ));

} catch (__w32Error) { auditError(__w32Run1,__w32Error); throw __w32Error; } finally {auditValue(__w32Run1,__w32Sync,undefined);auditLeave(__w32Run1);}
}, [archiveManifestEntries, localArchiveScans, scans]);
  useRuntimeAuditCommit(archiveRows, isOpen && activeTab === "archive" && !archiveLoading && !loading, "scan-archive-view");
  const archiveDays = React.useMemo(() => groupArchiveOverviewDays(archiveRows), [archiveRows]);
  const archiveGroups = React.useMemo<ArchiveTableGroup[]>(() => {
 const __w32Run2=auditBegin("F34","archiveGroups");
 const __w32Sync=auditEnter(__w32Run2,"archiveGroups","sync-elapsed");
 try {
    const groups = new Map<string, ArchiveTableGroup>();
    for (const day of archiveDays) {
      const group = groups.get(day.month);
      if (group) group.rows.push(day);
      else groups.set(day.month, { id: day.month, label: formatArchiveMonthLabel(day.firstTimestamp), rows: [day] });
    }
    return auditReturn(__w32Run2,[...groups.values()]);

} catch (__w32Error) { auditError(__w32Run2,__w32Error); throw __w32Error; } finally {auditValue(__w32Run2,__w32Sync,undefined);auditLeave(__w32Run2);}
}, [archiveDays]);
  const archiveDayKey = (day: ArchiveOverviewDay) => JSON.stringify(day.members.map(row => [row.id, row.entry?.sha256, row.entry?.searchIndex?.sha256]));
  React.useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    // Opening the overview reads existing sidecar caches only. Expanding a
    // day may acquire its small indexes; neither path requests raw scans.
    void (async () => {
      const countsAudit = auditBegin("F34", "archive-day-counts");
      try {
      for (const day of archiveDays) {
        const entries = day.members.flatMap(row => row.entry ? [row.entry] : []);
        if (!entries.length || entries.length !== day.members.length) continue;
        let counts: { players: number; guilds: number } | null = null;
        if (expandedArchiveDays[day.id]) {
          const result = await auditValue(countsAudit, auditEnter(countsAudit, "expanded-day-sidecars"), loadScanArchiveSearchIndexSet(entries, { signal: controller.signal }));
          if (result.status === "complete") counts = result.searchSet.getUniqueEntityCounts();
        } else {
          const cached = await Promise.all(entries.map(async entry => {
            try {
              const record = await auditValue(countsAudit, auditEnter(countsAudit, "collapsed-day-cache-only"), getSfDataHubArchiveSearchIndexCache(entry));
              return record ? { entry, payload: validateScanArchiveSearchIndexPayload(record.payload, entry), source: "cache" as const } : null;
            } catch { return null; }
          }));
          const indexes = cached.flatMap(index => index ? [index] : []);
          if (indexes.length === entries.length) counts = new ScanArchiveSearchIndexSet(indexes).getUniqueEntityCounts();
        }
        if (controller.signal.aborted) { auditFinish(countsAudit, "stale-discarded"); return; }
        if (countsAudit) { auditCount(countsAudit, "days", 1); auditCount(countsAudit, "entries", entries.length); }
        if (counts) auditAccept(countsAudit, counts);
        if (counts) setArchiveDayCounts(current => ({ ...current, [archiveDayKey(day)]: counts }));
      }
      } catch (error) { auditError(countsAudit, error); throw error; } finally { auditFinish(countsAudit); }
    })().catch(error => { if (!controller.signal.aborted) console.error("[ScanManagement] archive counts", error); });
    return () => controller.abort();
  }, [archiveDays, expandedArchiveDays, isOpen]);
  React.useEffect(() => {
    if (!isOpen || !archiveGroups.length) return;
    setExpandedArchiveMonths((current) => {
      let changed = false;
      const next = { ...current };
      archiveGroups.forEach((group, index) => {
        if (Object.prototype.hasOwnProperty.call(next, group.id)) return;
        next[group.id] = index === 0;
        changed = true;
      });
      return changed ? next : current;
    });
  }, [archiveGroups, isOpen]);
  const archiveStatuses = React.useMemo(() => new Map(archiveDays.map(day => [day.id, getArchiveOverviewStatus(day, scans)])), [archiveDays, scans]);
  const archiveLocalCount = [...archiveStatuses.values()].filter(status => status.complete).length;
  const archivePartialCount = [...archiveStatuses.values()].filter(status => status.local && !status.complete).length;
  const archiveReadyCount = [...archiveStatuses.values()].filter(status => status.ready).length;
  const selectedVisibleScans = activeTab === "archive"
    ? [...new Map(archiveRows.flatMap(row => row.localSummary ? [[row.localSummary.sourceScanId, row.localSummary] as const] : [])).values()]
    : ownVisibleScans;
  const selectedExportableScans = ownVisibleScans.filter(
    (scan) => selectedIds.has(scan.sourceScanId) && !scan.archiveSource,
  );

  const handleImportFiles = async (files: File[]) => {
    const __audit3 = auditBegin("F36", "handleImportFiles");
    try {
    if (!files.length) return auditReturn(__audit3, undefined);
    if (previewControllerRef.current) return auditReturn(__audit3, undefined);
    const controller = new AbortController();
    previewControllerRef.current = controller;
    try {
    setBusy(true);
    setStorageError(null);
    setPendingImport(null);

    const nextFeedback = createEmptyFeedback();
    let nextPendingImport: PendingImport | null = null;

    for (const file of files) {
      try {
        if (getFileExtension(file.name) === ".sfdata") {
          const content = await (auditValue(__audit3, auditEnter(__audit3, "file.text"), (file.text())));
          if (nextPendingImport) {
            nextFeedback.errors.push({
              filename: file.name,
              message: hubText("dataHubI18n.pleaseImportTransferFilesIndividually"),
            });
            continue;
          }
          nextPendingImport = {
            kind: "transfer",
            id: createImportPreviewId(),
            filename: file.name,
            envelope: parseSfDataHubTransferEnvelope(content),
          };
          continue;
        }

        const content = await (auditValue(__audit3, auditEnter(__audit3, "file.text"), (file.text())));
        if (nextPendingImport) {
          nextFeedback.errors.push({
            filename: file.name,
            message: hubText("dataHubI18n.pleaseConfirmImportFilesIndividually"),
          });
          continue;
        }

        const prepared = await (auditValue(__audit3, auditEnter(__audit3, "prepareLocalScanImportInWorker"), (prepareLocalScanImportInWorker({ filename: file.name, content, signal: controller.signal }))));
        nextPendingImport = {
          kind: "scanJson",
          id: createImportPreviewId(),
          filename: file.name,
          file,
          scan: prepared.scan,
          statistics: prepared.statistics,
        };
      } catch (error) { auditCaught(__audit3, error);
        if (controller.signal.aborted) return auditReturn(__audit3, undefined);
        const message = error instanceof Error ? error.message : hubText("dataHubI18n.theFileCouldNotBeImported");
        nextFeedback.errors.push({ filename: file.name, message });
      }
    }

    if (controller.signal.aborted) return auditReturn(__audit3, undefined);
    setFeedback(nextFeedback);
    setPendingImport(nextPendingImport);
    if (nextPendingImport?.kind === "transfer") {
      setActiveTab(getDataManagementTabForTransferType(nextPendingImport.envelope.type));
    } else if (nextPendingImport?.kind === "scanJson") {
      setActiveTab("scans");
    }
    await (auditValue(__audit3, auditEnter(__audit3, "loadScans"), (loadScans())));
    } finally {
      if (previewControllerRef.current === controller) {
        previewControllerRef.current = null;
        setBusy(false);
      }
    }

    } catch (__auditError) { auditError(__audit3, __auditError); throw __auditError; }
    finally { auditLeave(__audit3); }
};

  const handleImportInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleImportFiles(files);
  };

  const handleUpdateInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const __audit4 = auditBegin("F36", "handleUpdateInputChange");
    try {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    const scanId = updateTargetIdRef.current;
    updateTargetIdRef.current = null;
    if (!file || !scanId) return auditReturn(__audit4, undefined);

    setBusy(true);
    setStorageError(null);
    const nextFeedback = createEmptyFeedback();
    try {
      const content = await (auditValue(__audit4, auditEnter(__audit4, "file.text"), (file.text())));
      await (auditValue(__audit4, auditEnter(__audit4, "updateSfDataHubLocalScan"), (updateSfDataHubLocalScan(scanId, file.name, content))));
      nextFeedback.updated.push(file.name);
      trackLocalEvent("datahub/uploads/update-success");
    } catch (error) { auditError(__audit4, error);
      const message = error instanceof Error ? error.message : hubText("dataHubI18n.theScanCouldNotBeUpdated");
      nextFeedback.errors.push({ filename: file.name, message });
    }
    setFeedback(nextFeedback);
    await (auditValue(__audit4, auditEnter(__audit4, "loadScans"), (loadScans())));
    setBusy(false);

    } catch (__auditError) { auditError(__audit4, __auditError); throw __auditError; }
    finally { auditLeave(__audit4); }
};

  const toggleScan = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const visibleIds = selectedVisibleScans.map((scan) => scan.sourceScanId);
      const next = new Set(current);
      if (visibleIds.length > 0 && visibleIds.every((id) => current.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const deleteScans = async (ids: string[]) => {
    const __audit5 = auditBegin("F36", "deleteScans");
    try {
    if (!ids.length) return auditReturn(__audit5, undefined);
    const selectedScans = visibleScans.filter((scan) => ids.includes(scan.sourceScanId));
    const slotCount = selectedScans.filter((scan) => scan.isScanSlot).length;
    if (
      slotCount > 0 &&
      !window.confirm(
        slotCount === 1
          ? hubText("dataHubI18n.dissolveThisScanSlotTheOriginalScansItContainsWillBecomeVisible")
          : hubText("dataHubI18n.dissolveTheseScanSlotsTheOriginalScansTheyContainWillBecomeVisible"),
      )
    ) {
      return auditReturn(__audit5, undefined);
    }
    setBusy(true);
    setStorageError(null);
    try {
      await (auditValue(__audit5, auditEnter(__audit5, "deleteSfDataHubLocalScans"), (deleteSfDataHubLocalScans(ids))));
      trackLocalEvent("datahub/uploads/delete-success");
      setFeedback(mergeFeedback(EMPTY_FEEDBACK, { deleted: ids.length }));
      setSelectedIds(new Set());
      await (auditValue(__audit5, auditEnter(__audit5, "loadScans"), (loadScans())));
    } catch (error) { auditError(__audit5, error);
      console.error("[ScanManagement] failed to delete scans", error);
      setStorageError("dataHubI18n.scansCouldNotBeDeleted");
    } finally {
      setBusy(false);
    }

    } catch (__auditError) { auditError(__audit5, __auditError); throw __auditError; }
    finally { auditLeave(__audit5); }
};

  const startUpdate = (scanId: string) => {
    updateTargetIdRef.current = scanId;
    updateInputRef.current?.click();
  };

  const openScanDetails = (summary: GuildHubScanSummary) => {
    const requestId = detailsRequestIdRef.current + 1;
    detailsRequestIdRef.current = requestId;
    setDetailsSummary(summary);
    setDetailsData(null);
    setDetailsError(null);
    setDetailsLoading(true);

    void (async () => {
    const __audit6 = auditBegin("F35", "@callback");
    try {
      try {
        const scan = await (auditValue(__audit6, auditEnter(__audit6, "getSfDataHubLocalScan"), (getSfDataHubLocalScan(summary.sourceScanId))));
        if (!scan) throw new Error(hubText("dataHubI18n.scanNotFound"));
        const data = (auditValue(__audit6, auditEnter(__audit6, "buildScanDetailsData", "sync-elapsed"), (buildScanDetailsData(scan))));
        if (detailsRequestIdRef.current === requestId) { auditAccept(__audit6, data); setDetailsData(data); } else auditFinish(__audit6, "stale-discarded");
      } catch (error) { auditError(__audit6, error);
        console.error("[ScanManagement] failed to load scan details", error);
        if (detailsRequestIdRef.current === requestId) {
          setDetailsError("dataHubI18n.scanDetailsCouldNotBeLoaded");
        }
      } finally {
        if (detailsRequestIdRef.current === requestId) setDetailsLoading(false);
      }

    } catch (__auditError) { auditError(__audit6, __auditError); throw __auditError; }
    finally { auditLeave(__audit6); }
})();
  };

  const toggleTracker = (id: string) => {
    setSelectedTrackerIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllTrackers = () => {
    setSelectedTrackerIds((current) => {
      if (trackerSummaries.length > 0 && trackerSummaries.every((summary) => current.has(summary.tracker.id))) return new Set();
      return new Set(trackerSummaries.map((summary) => summary.tracker.id));
    });
  };

  const exportSelectedScans = async () => {
    const __audit7 = auditBegin("F36", "exportSelectedScans");
    try {
    const selectedScans = selectedExportableScans;
    if (!selectedScans.length) return auditReturn(__audit7, undefined);
    setBusy(true);
    setStorageError(null);
    try {
      const scanPairs = await (auditValue(__audit7, auditEnter(__audit7, "Promise.all"), (Promise.all(
        selectedScans.map(async (summary) => ({
          summary,
          scan: await getSfDataHubLocalScan(summary.sourceScanId),
        })),
      ))));
      if (scanPairs.some((pair) => !pair.scan)) {
        setStorageError("dataHubI18n.atLeastOneSelectedScanWasNotFound");
        return auditReturn(__audit7, undefined);
      }

      const exportablePairs = scanPairs.filter(
        (pair): pair is { summary: GuildHubScanSummary; scan: SfDataHubLocalScan } =>
          pair.scan != null && !pair.summary.archiveSource && !pair.scan.archiveSource,
      );
      if (!exportablePairs.length) return auditReturn(__audit7, undefined);

      const rawScans = exportablePairs.map((pair) => pair.scan);
      if (rawScans.length === 1) {
        if (rawScans[0].isMergedBundle) {
          downloadJsonFile(getScanExportFilename(exportablePairs[0].summary), rawScans[0].rawData);
          return auditReturn(__audit7, undefined);
        }
        const envelope = createSfDataHubTransferEnvelope("scan", rawScans[0]);
        downloadSfDataFile(
          createSfDataFileName("scan", null, dateFromOptionalTimestamp(rawScans[0].scannedAt ?? rawScans[0].importedAt)),
          envelope,
        );
        return auditReturn(__audit7, undefined);
      }

      const envelope = createSfDataHubTransferEnvelope("scanpack", { scans: rawScans });
      downloadSfDataFile(createSfDataFileName("scanpack"), envelope);
    } catch (error) { auditError(__audit7, error);
      console.error("[ScanManagement] failed to export scans", error);
      setStorageError("dataHubI18n.scansCouldNotBeExported");
    } finally {
      setBusy(false);
    }

    } catch (__auditError) { auditError(__audit7, __auditError); throw __auditError; }
    finally { auditLeave(__audit7); }
};

  const startMergePreview = () => {
 const __w32Run3=auditBegin("F36","startMergePreview");
 const __w32Sync=auditEnter(__w32Run3,"startMergePreview","sync-elapsed");
 try {
    const selectedScans = ownVisibleScans.filter((scan) => selectedIds.has(scan.sourceScanId));
    if (selectedScans.length < 2) return auditReturn(__w32Run3,undefined);
    setPendingImport({
      kind: "scanMerge",
      id: createImportPreviewId(),
      filename: createMergeFilenameSuggestion(selectedScans),
      mode: "merged-file",
      displayName: createScanSlotNameSuggestion(selectedScans),
      sourceIds: selectedScans.map((scan) => scan.sourceScanId),
      summaries: selectedScans,
    });
    setActiveTab("scans");

} catch (__w32Error) { auditError(__w32Run3,__w32Error); throw __w32Error; } finally {auditValue(__w32Run3,__w32Sync,undefined);auditLeave(__w32Run3);}
};

  const exportSelectedFightTrackers = async () => {
    const __audit8 = auditBegin("F36", "exportSelectedFightTrackers");
    try {
    const selectedSummaries = trackerSummaries.filter((summary) => selectedTrackerIds.has(summary.tracker.id));
    if (!selectedSummaries.length) return auditReturn(__audit8, undefined);
    setBusy(true);
    setTrackersError(null);
    try {
      const states = await (auditValue(__audit8, auditEnter(__audit8, "Promise.all"), (Promise.all(selectedSummaries.map((summary) => readFightTrackerTransferState(summary.tracker.id))))));
      if (states.some((state) => !state)) {
        setTrackersError("dataHubI18n.fightTrackerNotFound");
        return auditReturn(__audit8, undefined);
      }
      const transferStates = states.filter((state): state is NonNullable<typeof state> => Boolean(state));
      if (transferStates.length === 1) {
        const envelope = createSfDataHubTransferEnvelope("fighttracker", transferStates[0]);
        downloadSfDataFile(createSfDataFileName("fighttracker", transferStates[0].tracker.name), envelope);
        return auditReturn(__audit8, undefined);
      }
      const envelope = createSfDataHubTransferEnvelope("fighttrackerpack", { trackers: transferStates });
      downloadSfDataFile(createSfDataFileName("fighttrackerpack"), envelope);
    } catch (error) { auditError(__audit8, error);
      console.error("[DataManagement] failed to export fight tracker", error);
      setTrackersError("dataHubI18n.fightTrackerCouldNotBeExported");
    } finally {
      setBusy(false);
    }

    } catch (__auditError) { auditError(__audit8, __auditError); throw __auditError; }
    finally { auditLeave(__audit8); }
};

  const confirmTransferImport = async () => {
    const __audit9 = auditBegin("F36", "confirmTransferImport");
    try {
    if (!pendingImport) return auditReturn(__audit9, undefined);
    setBusy(true);
    setStorageError(null);
    setTrackersError(null);

    const nextFeedback = createEmptyFeedback();
    const { filename } = pendingImport;
    try {
      if (pendingImport.kind === "scanJson") {
        await (auditValue(__audit9, auditEnter(__audit9, "startSfToolsImportJob"), (startSfToolsImportJob(pendingImport.file, { scan: pendingImport.scan, statistics: pendingImport.statistics }))));
        setActiveTab("scans");
        setPendingImport(null);
        return auditReturn(__audit9, undefined);
      }

      if (pendingImport.kind === "scanMerge") {
        if (pendingImport.mode === "scan-slot") {
          const displayName = normalizeScanSlotNameInput(pendingImport.displayName);
          const filename = createScanSlotTechnicalFilename(displayName, scans);
          await (auditValue(__audit9, auditEnter(__audit9, "startScanMergeJob"), (startScanMergeJob({ sourceScanIds: pendingImport.sourceIds, filename, mode: "scan-slot", displayName }))));
        } else {
          const filename = normalizeMergeFilenameInput(pendingImport.filename);
          await (auditValue(__audit9, auditEnter(__audit9, "startScanMergeJob"), (startScanMergeJob({ sourceScanIds: pendingImport.sourceIds, filename, mode: "merged-file" }))));
        }
        setSelectedIds(new Set());
        setActiveTab("scans");
        setPendingImport(null);
        return auditReturn(__audit9, undefined);
      }

      const { envelope } = pendingImport;
      if (envelope.type === "scan") {
        const result = await (auditValue(__audit9, auditEnter(__audit9, "importSfDataHubLocalScanRecords"), (importSfDataHubLocalScanRecords([envelope.payload]))));
        nextFeedback.imported.push(...result.imported.map((scan) => scan.filename));
        nextFeedback.duplicates.push(...result.duplicates.map((scan) => scan.filename));
        setActiveTab("scans");
        await (auditValue(__audit9, auditEnter(__audit9, "loadScans"), (loadScans())));
      } else if (envelope.type === "scanpack") {
        const result = await (auditValue(__audit9, auditEnter(__audit9, "importSfDataHubLocalScanRecords"), (importSfDataHubLocalScanRecords(envelope.payload.scans))));
        nextFeedback.imported.push(...result.imported.map((scan) => scan.filename));
        nextFeedback.duplicates.push(...result.duplicates.map((scan) => scan.filename));
        setActiveTab("scans");
        await (auditValue(__audit9, auditEnter(__audit9, "loadScans"), (loadScans())));
      } else if (envelope.type === "fighttracker") {
        const [state] = await (auditValue(__audit9, auditEnter(__audit9, "importFightTrackerTransferStates"), (importFightTrackerTransferStates([envelope.payload]))));
        nextFeedback.imported.push(`Fight Tracker: ${state.tracker?.name ?? filename}`);
        setActiveTab("fightTracker");
        await (auditValue(__audit9, auditEnter(__audit9, "loadFightTrackers"), (loadFightTrackers())));
      } else {
        const states = await (auditValue(__audit9, auditEnter(__audit9, "importFightTrackerTransferStates"), (importFightTrackerTransferStates(envelope.payload.trackers))));
        nextFeedback.imported.push(...states.map((state) => `Fight Tracker: ${state.tracker?.name ?? filename}`));
        setActiveTab("fightTracker");
        await (auditValue(__audit9, auditEnter(__audit9, "loadFightTrackers"), (loadFightTrackers())));
      }
      if (nextFeedback.imported.length) trackLocalEvent("datahub/uploads/import-success");
      setPendingImport(null);
    } catch (error) { auditError(__audit9, error);
      const message = error instanceof Error ? error.message : hubText("dataHubI18n.theTransferFileCouldNotBeImported");
      nextFeedback.errors.push({ filename, message });
    } finally {
      setFeedback(nextFeedback);
      setBusy(false);
    }

    } catch (__auditError) { auditError(__audit9, __auditError); throw __auditError; }
    finally { auditLeave(__audit9); }
};

  const updatePendingMergeFilename = (filename: string) => {
    setPendingImport((current) => (current?.kind === "scanMerge" ? { ...current, filename } : current));
  };

  const updatePendingMergeMode = (mode: GuildHubScanMergeMode) => {
    setPendingImport((current) => (current?.kind === "scanMerge" ? { ...current, mode } : current));
  };

  const updatePendingMergeDisplayName = (displayName: string) => {
    setPendingImport((current) => (current?.kind === "scanMerge" ? { ...current, displayName } : current));
  };

  const startRenameSlot = (scan: GuildHubScanSummary) => {
    setRenamingSlot(scan);
    setRenameSlotValue(getScanDisplayName(scan));
  };

  const confirmRenameSlot = async () => {
    const __audit10 = auditBegin("F36", "confirmRenameSlot");
    try {
    if (!renamingSlot) return auditReturn(__audit10, undefined);
    setBusy(true);
    setStorageError(null);
    const nextFeedback = createEmptyFeedback();
    try {
      const displayName = normalizeScanSlotNameInput(renameSlotValue);
      await (auditValue(__audit10, auditEnter(__audit10, "renameSfDataHubScanSlot"), (renameSfDataHubScanSlot(renamingSlot.sourceScanId, displayName))));
      nextFeedback.updated.push(displayName);
      trackLocalEvent("datahub/uploads/update-success");
      setRenamingSlot(null);
      await (auditValue(__audit10, auditEnter(__audit10, "loadScans"), (loadScans())));
    } catch (error) { auditError(__audit10, error);
      const message = error instanceof Error ? error.message : hubText("dataHubI18n.theScanSlotCouldNotBeRenamed");
      nextFeedback.errors.push({ filename: getScanDisplayName(renamingSlot), message });
    } finally {
      setFeedback(nextFeedback);
      setBusy(false);
    }

    } catch (__auditError) { auditError(__audit10, __auditError); throw __auditError; }
    finally { auditLeave(__audit10); }
};

  const saveArchiveEntries = async (entries: ScanArchiveEntry[]) => {
    const __audit11 = auditBegin("F36", "saveArchiveEntries");
    try {
    if (busy || archiveAcquisitionRef.current) return auditReturn(__audit11, undefined);
    const controller = new AbortController();
    archiveAcquisitionRef.current = controller;
    setBusy(true);
    setStorageError(null);
    setArchiveError(null);
    setArchiveEntryErrors(current => {
      const next = { ...current };
      entries.forEach(entry => delete next[entry.id]);
      return next;
    });
    const nextFeedback = createEmptyFeedback();
    try {
      const result = await (auditValue(__audit11, auditEnter(__audit11, "acquireExplicitLocalFirstArchiveScans"), (acquireExplicitLocalFirstArchiveScans(entries, {
        signal: controller.signal,
        dependencies: { downloadArchiveEntry: async (entry, signal) => {
          setDownloadingArchiveIds(current => new Set(current).add(entry.id));
          const run = startScanArchiveDownloadWorkerRun({ entry, onProgress: progress => {
            if (!signal?.aborted) setArchiveDownloadProgress(current => ({ ...current, [entry.id]: progress }));
          } });
          archiveDownloadRunsRef.current.set(entry.id, run);
          const abort = () => run.cancel();
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) run.cancel();
          try { return { content: (await run.promise).content }; }
          finally {
            signal?.removeEventListener("abort", abort);
            archiveDownloadRunsRef.current.delete(entry.id);
            setDownloadingArchiveIds(current => { const next = new Set(current); next.delete(entry.id); return next; });
            setArchiveDownloadProgress(current => { const next = { ...current }; delete next[entry.id]; return next; });
          }
        } },
      }))));
      if (controller.signal.aborted) return auditReturn(__audit11, undefined);
      result.selectedArchives.forEach(item => {
        (item.status === "imported" ? nextFeedback.imported : nextFeedback.duplicates).push(item.archiveScanId);
      });
      if (nextFeedback.imported.length) trackLocalEvent("datahub/uploads/import-success");
      result.failedArchives.forEach(item => nextFeedback.errors.push({ filename: item.archiveScanId, message: item.message }));
      setArchiveEntryErrors(current => ({ ...current, ...Object.fromEntries(result.failedArchives.map(item => [item.archiveScanId, item.message])) }));
      setFeedback(nextFeedback);
      await (auditValue(__audit11, auditEnter(__audit11, "loadScans"), (loadScans())));
    } catch (error) { auditError(__audit11, error);
      if (!controller.signal.aborted) setFeedback({ ...nextFeedback, errors: [{ filename: "Archivgruppe", message: error instanceof Error ? error.message : hubText("dataHubI18n.savingFailed") }] });
    } finally {
      if (archiveAcquisitionRef.current === controller) {
        archiveAcquisitionRef.current = null;
        setBusy(false);
      }
    }

    } catch (__auditError) { auditError(__audit11, __auditError); throw __auditError; }
    finally { auditLeave(__audit11); }
};

  const isArchiveMonthExpanded = (monthId: string, groupIndex: number) =>
    Object.prototype.hasOwnProperty.call(expandedArchiveMonths, monthId) ? expandedArchiveMonths[monthId] : groupIndex === 0;

  const toggleArchiveMonth = (monthId: string, currentlyExpanded: boolean) => {
    setExpandedArchiveMonths((current) => ({
      ...current,
      [monthId]: !currentlyExpanded,
    }));
  };

  const selectedVisibleCount = selectedVisibleScans.filter((scan) => selectedIds.has(scan.sourceScanId)).length;
  const selectedExportableCount = selectedExportableScans.length;
  const allVisibleSelected = selectedVisibleScans.length > 0 && selectedVisibleScans.every((scan) => selectedIds.has(scan.sourceScanId));
  const allTrackersSelected = trackerSummaries.length > 0 && trackerSummaries.every((summary) => selectedTrackerIds.has(summary.tracker.id));
  const selectedTrackerCount = trackerSummaries.filter((summary) => selectedTrackerIds.has(summary.tracker.id)).length;
  const activeDataJob = runningSfToolsImportJob ?? runningScanMergeJob;
  const importDisabled = busy || !dataJobsReady || Boolean(activeDataJob);
  const canMergeSelectedScans = activeTab === "scans" && selectedVisibleCount >= 2 && !importDisabled;

  if (!isOpen || typeof document === "undefined") return null;

  const content = (
    <>
      <ScanManagementFrame overlay={overlay} onClose={onClose} titleId={titleId}>
        {overlay ? <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id={titleId} className={styles.title}>
              {hubText("dataHubI18n.dataManagement")}
            </h2>
            <p className={styles.subtitle}>{t("hubNavigation.scanManagementHint")}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={hubText("dataHubI18n.closeDataManagement")}>
            <X size={18} aria-hidden />
            <span>{hubText("dataHubI18n.close")}</span>
          </button>
        </header> : <p className={styles.subtitle}>{t("hubNavigation.scanManagementHint")}</p>}

        <div className={styles.body}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.sfdata,application/json"
            multiple
            className={styles.hiddenInput}
            onChange={handleImportInputChange}
          />
          <input
            ref={updateInputRef}
            type="file"
            accept=".json,application/json"
            className={styles.hiddenInput}
            onChange={handleUpdateInputChange}
          />
          {renamingSlot ? (
            <div className={styles.inlineDialog} role="dialog" aria-modal="true" aria-label={hubText("dataHubI18n.renameScanSlot")}>
              <div className={styles.inlineDialogPanel}>
                <div className={styles.inlineDialogHeader}>
                  <h3>{hubText("dataHubI18n.renameScanSlot")}</h3>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setRenamingSlot(null)}
                    disabled={busy}
                    aria-label={hubText("dataHubI18n.closeDialog")}
                    title={hubText("dataHubI18n.close")}
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
                <label className={styles.filenameField}>
                  <span>{hubText("dataHubI18n.name")}</span>
                  <input value={renameSlotValue} onChange={(event) => setRenameSlotValue(event.target.value)} autoFocus />
                </label>
                <p className={styles.dialogHint}>{hubText("dataHubI18n.theUnderlyingJsonFileStays")} {renamingSlot.filename}.</p>
                <div className={styles.previewActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setRenamingSlot(null)} disabled={busy}>
                    <X size={15} aria-hidden />
                    <span>{hubText("dataHubI18n.cancel")}</span>
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={() => void confirmRenameSlot()} disabled={busy}>
                    <Check size={15} aria-hidden />
                    <span>{busy ? "Speichert..." : hubText("dataHubI18n.save")}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className={styles.globalToolbar}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => importInputRef.current?.click()}
              disabled={importDisabled}
            >
              <Upload size={16} aria-hidden />
              <span>{activeDataJob ? hubText("dataHubI18n.jobRunning") : busy ? hubText("dataHubI18n.processing") : hubText("dataHubI18n.import")}</span>
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label={hubText("dataHubI18n.dataTypes")}>
            <button
              id={`${titleId}-scans-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === "scans"}
              aria-controls={`${titleId}-scans-panel`}
              className={`${styles.tabButton} ${activeTab === "scans" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("scans")}
            >
              <Database size={15} aria-hidden />
              <span>{hubText("dataHubI18n.sftoolsScans")}</span>
            </button>
            <button
              id={`${titleId}-archive-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === "archive"}
              aria-controls={`${titleId}-archive-panel`}
              className={`${styles.tabButton} ${activeTab === "archive" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("archive")}
            >
              <Download size={15} aria-hidden />
              <span>{hubText("dataHubI18n.scanArchive")}</span>
            </button>
            <button
              id={`${titleId}-fight-trackers-tab`}
              type="button"
              role="tab"
              aria-selected={activeTab === "fightTracker"}
              aria-controls={`${titleId}-fight-trackers-panel`}
              className={`${styles.tabButton} ${activeTab === "fightTracker" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("fightTracker")}
            >
              <Swords size={15} aria-hidden />
              <span>{t("hubNavigation.fightTracking")}</span>
            </button>
          </div>

          <div className={styles.contentScroll}>
            {storageError ? <div className={styles.errorBox}>{hubMessage(storageError)}</div> : null}
            {archiveError ? (
              <div className={styles.errorBox}>
                <span>{hubMessage(archiveError)}</span>
                <button type="button" className={styles.inlineRetryButton} onClick={() => void loadArchiveEntries()}>
                  {hubText("dataHubI18n.retry")}
                </button>
              </div>
            ) : null}
            {hasFeedback(feedback) ? <FeedbackBox feedback={feedback!} /> : null}
            {activeDataJob ? <DataJobStatusBox job={activeDataJob} /> : null}
            {pendingImport ? (
              <TransferImportPreview
                pending={pendingImport}
                busy={busy}
                onConfirm={() => void confirmTransferImport()}
                onCancel={() => setPendingImport(null)}
                onFilenameChange={updatePendingMergeFilename}
                onMergeModeChange={updatePendingMergeMode}
                onDisplayNameChange={updatePendingMergeDisplayName}
              />
            ) : null}

            {activeTab === "scans" ? (
              <div id={`${titleId}-scans-panel`} role="tabpanel" aria-labelledby={`${titleId}-scans-tab`}>
                <div className={styles.toolbar}>
                  {selectedExportableCount > 0 ? (
                    <button type="button" className={styles.primaryButton} onClick={() => void exportSelectedScans()} disabled={busy}>
                      <Download size={16} aria-hidden />
                      <span>{selectedExportableCount === 1 ? hubText("dataHubI18n.exportScan") : hubText("dataHubI18n.exportScanPack")}</span>
                    </button>
                  ) : null}
                  {selectedVisibleCount >= 2 ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={startMergePreview}
                      disabled={!canMergeSelectedScans}
                    >
                      <Database size={15} aria-hidden />
                      <span>{hubText("dataHubI18n.merge")}</span>
                    </button>
                  ) : null}
                  {selectedVisibleCount > 0 ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void deleteScans(selectedVisibleScans.filter((scan) => selectedIds.has(scan.sourceScanId)).map((scan) => scan.sourceScanId))}
                      disabled={busy}
                    >
                      <Trash2 size={15} aria-hidden />
                      <span>{hubText("dataHubI18n.deleteSelected")}</span>
                    </button>
                  ) : null}
                </div>

                <section className={styles.scanSection} aria-label={hubText("dataHubI18n.availableScans")}>
                  <div className={styles.sectionHeader}>
                    <h3>{hubText("dataHubI18n.availableScans")}</h3>
                    <span>{loading ? hubText("dataHubI18n.loading") : hubText("dataHubI18n.localCount", { v1: ownVisibleScans.length })}</span>
                  </div>

                  {loading ? (
                    <DataHubLoadingState title={hubText("dataHubI18n.loadingLocalScans")} message={hubText("dataHubI18n.readingScanMetadata")} />
                  ) : ownVisibleScans.length ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.checkCell}>
                              <input
                                type="checkbox"
                                aria-label={hubText("dataHubI18n.selectAllVisibleScans")}
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                              />
                            </th>
                            <th>{hubText("dataHubI18n.scanTime")}</th>
                            <th>{hubText("dataHubI18n.server")}</th>
                            <th className={styles.numericCell}>{hubText("dataHubI18n.players")}</th>
                            <th className={styles.numericCell}>{hubText("dataHubI18n.guilds")}</th>
                            <th>{hubText("dataHubI18n.file")}</th>
                            <th className={styles.actionCell}>{hubText("dataHubI18n.action")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ownVisibleScans.map((scan) => {
                            const scanTimeCell = formatScanSnapshotCell(scan);
                            const displayName = getScanDisplayName(scan);
                            const slotInfo = getScanSlotSourceInfo(scan);
                            return (
                              <tr key={scan.sourceScanId}>
                                <td className={styles.checkCell}>
                                  <input
                                    type="checkbox"
                                    aria-label={hubText("dataHubI18n.selectName", { v1: displayName })}
                                    checked={selectedIds.has(scan.sourceScanId)}
                                    onChange={() => toggleScan(scan.sourceScanId)}
                                  />
                                </td>
                                <td title={scanTimeCell.title}>{scanTimeCell.label}</td>
                                <td>
                                  <span className={styles.truncate} title={formatServerList(scan)}>
                                    {formatServerList(scan)}
                                  </span>
                                </td>
                                <td className={styles.numericCell}>{formatCount(scan.playerCount)}</td>
                                <td className={styles.numericCell}>{formatCount(getScanGuildCount(scan))}</td>
                                <td>
                                  <span className={styles.truncate} title={displayName}>
                                    {displayName}
                                  </span>
                                  {slotInfo ? <span className={styles.slotMeta}>{slotInfo}</span> : null}
                                  {scan.isScanSlot ? (
                                    <span className={styles.technicalFilename} title={scan.filename}>
                                      {scan.filename}
                                    </span>
                                  ) : null}
                                  {scan.isScanSlot ? (
                                    <span className={`${styles.bundleBadge} ${styles.slotBadge}`}>{hubText("dataHubI18n.slot")}</span>
                                  ) : scan.isMergedBundle ? (
                                    <span className={styles.bundleBadge}>{hubText("dataHubI18n.bundle")}</span>
                                  ) : null}
                                </td>
                                <td className={styles.actionCell}>
                                  <div className={styles.rowActions}>
                                    <button
                                      type="button"
                                      className={`${styles.iconButton} ${styles.detailsButton}`}
                                      onClick={() => openScanDetails(scan)}
                                      disabled={busy}
                                      aria-label={hubText("dataHubI18n.showNameDetails", { v1: displayName })}
                                      title={hubText("dataHubI18n.showScanDetails")}
                                    >
                                      <Eye size={15} aria-hidden />
                                      <span>{hubText("dataHubI18n.details")}</span>
                                    </button>
                                    {scan.isScanSlot ? (
                                      <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => startRenameSlot(scan)}
                                        disabled={busy}
                                        aria-label={hubText("dataHubI18n.renameName", { v1: displayName })}
                                        title={hubText("dataHubI18n.renameScanSlot")}
                                      >
                                        <Pencil size={15} aria-hidden />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => startUpdate(scan.sourceScanId)}
                                        disabled={busy}
                                        aria-label={hubText("dataHubI18n.updateName", { v1: displayName })}
                                        title={hubText("dataHubI18n.updateScan")}
                                      >
                                        <RefreshCw size={15} aria-hidden />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                      onClick={() => void deleteScans([scan.sourceScanId])}
                                      disabled={busy}
                                      aria-label={hubText("dataHubI18n.deleteName", { v1: displayName })}
                                      title={scan.isScanSlot ? hubText("dataHubI18n.dissolveScanSlot") : hubText("dataHubI18n.deleteScan")}
                                    >
                                      <Trash2 size={15} aria-hidden />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyState}>{hubText("dataHubI18n.noScansImportedYet")}</div>
                  )}
                </section>
              </div>
            ) : activeTab === "archive" ? (
              <div id={`${titleId}-archive-panel`} role="tabpanel" aria-labelledby={`${titleId}-archive-tab`}>
                <div className={styles.toolbar}>
                  {selectedVisibleCount > 0 ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void deleteScans(selectedVisibleScans.filter((scan) => selectedIds.has(scan.sourceScanId)).map((scan) => scan.sourceScanId))}
                      disabled={busy}
                    >
                      <Trash2 size={15} aria-hidden />
                      <span>{hubText("dataHubI18n.deleteSelected")}</span>
                    </button>
                  ) : null}
                </div>

                <section className={styles.scanSection} aria-label={hubText("dataHubI18n.scanArchive")}>
                  <div className={styles.sectionHeader}>
                    <h3>{hubText("dataHubI18n.scanArchive")}</h3>
                    <span>
                      {archiveLoading
                        ? hubText("dataHubI18n.loading")
                        : archiveError
                          ? t("scanArchiveOverview.localSummary", { count: archiveLocalCount })
                          : t("scanArchiveOverview.summary", { count: archiveDays.length, local: archiveLocalCount, partial: archivePartialCount, ready: archiveReadyCount })}
                    </span>
                  </div>

                  {loading || archiveLoading ? (
                    <DataHubLoadingState title={hubText("dataHubI18n.loadingScanArchive")} message={hubText("dataHubI18n.readingArchiveAndLocalScanMetadata")} />
                  ) : archiveRows.length ? (
                    <div className={styles.tableWrap}>
                      <table className={`${styles.table} ${styles.archiveTable}`}>
                        <thead>
                          <tr>
                            <th className={styles.checkCell}>
                              <input
                                type="checkbox"
                                aria-label={hubText("dataHubI18n.selectAllLocallySavedArchiveScans")}
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                              />
                            </th>
                            <th>{hubText("dataHubI18n.scanTimedcb3e")}</th>
                            <th>{hubText("dataHubI18n.server")}</th>
                            <th className={styles.numericCell}>{hubText("dataHubI18n.players")}</th>
                            <th className={styles.numericCell}>{hubText("dataHubI18n.guilds")}</th>
                            <th>{hubText("dataHubI18n.status")}</th>
                            <th className={styles.actionCell}>{hubText("dataHubI18n.action")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {archiveGroups.map((group, groupIndex) => {
                            const isExpanded = isArchiveMonthExpanded(group.id, groupIndex);
                            return (
                              <React.Fragment key={group.id}>
                                <tr className={styles.archiveMonthRow}>
                                  <th colSpan={7} scope="colgroup">
                                    <button
                                      type="button"
                                      className={styles.archiveMonthButton}
                                      aria-expanded={isExpanded}
                                      onClick={() => toggleArchiveMonth(group.id, isExpanded)}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown size={15} aria-hidden />
                                      ) : (
                                        <ChevronRight size={15} aria-hidden />
                                      )}
                                      <span>{formatArchiveMonthLabel(group.rows[0].firstTimestamp)}</span>
                                    </button>
                                  </th>
                                </tr>
                                {isExpanded
                                  ? group.rows.map(day => {
                                      const localIds = archiveGroupLocalIds(day.members);
                                      const status = archiveStatuses.get(day.id)!;
                                      const expanded = Boolean(expandedArchiveDays[day.id]);
                                      const counts = archiveDayCounts[archiveDayKey(day)];
                                      const entries = day.members.flatMap(row => row.entry ? [row.entry] : []);
                                      const dayDate = isoFromSummaryTimestamp(day.firstTimestamp);
                                      const label = `${formatScanDateShort(dayDate)} · ${day.server}`;
                                      const time = (timestamp: number) => Number.isFinite(timestamp) ? new Intl.DateTimeFormat(hubLocale(), { timeStyle: "short" }).format(timestamp) : hubText("dataHubI18n.unknown");
                                      return <React.Fragment key={day.id}>
                                        <tr className={styles.archiveDayRow}>
                                          <td className={styles.checkCell}>{localIds.length ? <input type="checkbox" aria-label={hubText("dataHubI18n.selectName", { v1: label })}
                                            checked={localIds.every(id => selectedIds.has(id))}
                                            ref={input => { if (input) input.indeterminate = localIds.some(id => selectedIds.has(id)) && !localIds.every(id => selectedIds.has(id)); }}
                                            onChange={() => setSelectedIds(current => { const next = new Set(current); const remove = localIds.every(id => next.has(id)); localIds.forEach(id => remove ? next.delete(id) : next.add(id)); return next; })} /> : null}</td>
                                          <td>{formatScanDateShort(dayDate)}
                                            <small className={styles.archiveMemberCaption}>{time(day.firstTimestamp)}{day.lastTimestamp !== day.firstTimestamp ? `–${time(day.lastTimestamp)}` : ""}</small></td>
                                          <td>{day.server}</td>
                                          <td className={styles.numericCell} title={hubText("dataHubI18n.uniquePlayersNotYetKnown")}>{counts?.players == null ? "—" : formatCount(counts.players)}</td>
                                          <td className={styles.numericCell} title={hubText("dataHubI18n.uniqueGuildsNotYetKnown")}>{counts?.guilds == null ? "—" : formatCount(counts.guilds)}</td>
                                          <td><span className={styles.statusBadge}>{t(`scanArchiveOverview.${status.complete ? "stored" : status.local ? "partial" : "online"}`)}{status.ready ? ` · ${t("scanArchiveOverview.ready")}` : ""}</span></td>
                                          <td className={styles.actionCell}><div className={styles.rowActions}>
                                            <button type="button" className={`${styles.iconButton} ${styles.archiveTextButton}`} aria-expanded={expanded} aria-label={t("scanArchiveOverview.showSources", { label })}
                                              onClick={() => setExpandedArchiveDays(current => ({ ...current, [day.id]: !expanded }))}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {t("scanArchiveOverview.sources")}</button>
                                            {!status.complete && entries.length ? <button type="button" className={`${styles.iconButton} ${styles.archiveTextButton}`} disabled={busy}
                                              onClick={() => void saveArchiveEntries(entries)} aria-label={t("scanArchiveOverview.saveLocally", { label })}><Download size={15} /> {t("scanArchiveOverview.save")}</button> : null}
                                            {localIds.length ? <button type="button" className={`${styles.iconButton} ${styles.iconButtonDanger}`} disabled={busy}
                                              onClick={() => void deleteScans(localIds)} aria-label={hubText("dataHubI18n.deleteLocalNameScans", { v1: label })}><Trash2 size={15} /></button> : null}
                                          </div></td>
                                        </tr>
                                        {expanded ? day.members.map((row) => {
                                      const scan = row.localSummary;
                                      const entry = row.entry;
                                      const scanTimeCell = entry ? formatArchiveScanSnapshotCell(entry) : formatScanSnapshotCell(scan!);
                                      const displayName = entry ? getArchiveDisplayName(entry) : getScanDisplayName(scan!);
                                      const serverLabel = entry ? entry.server : formatServerList(scan!);
                                      const playerCount = entry ? entry.playerCount : scan!.playerCount;
                                      const groupCount = entry ? entry.groupCount : getScanGuildCount(scan!);
                                      const archiveProgress = entry ? archiveDownloadProgress[entry.id] : null;
                                      const isDownloadingArchive = entry ? downloadingArchiveIds.has(entry.id) : false;
                                      return (
                                        <tr key={row.id}>
                                          <td className={styles.checkCell}>
                                            {scan ? (
                                              <input
                                                type="checkbox"
                                                aria-label={hubText("dataHubI18n.selectName", { v1: displayName })}
                                                checked={selectedIds.has(scan.sourceScanId)}
                                                onChange={() => toggleScan(scan.sourceScanId)}
                                              />
                                            ) : null}
                                          </td>
                                          <td title={scanTimeCell.title}>{scanTimeCell.label}<small className={styles.archiveMemberCaption}>{entry?.path ?? scan?.filename} {hubText("dataHubI18n.rawRows")}</small></td>
                                          <td>
                                            <span className={styles.truncate} title={serverLabel}>
                                              {serverLabel}
                                            </span>
                                          </td>
                                          <td className={styles.numericCell}>{formatCount(playerCount)}</td>
                                          <td className={styles.numericCell}>{formatCount(groupCount)}</td>
                                          <td>
                                            {entry && archiveEntryErrors[entry.id] ? <span className={styles.archiveEntryError}>{hubMessage(archiveEntryErrors[entry.id])}</span> : scan ? (
                                              <span className={styles.statusBadge}>{hubText("dataHubI18n.savedLocally")}</span>
                                            ) : isDownloadingArchive ? (
                                              <span className={styles.statusBadge}>{hubMessage(archiveProgress?.message) || hubText("dataHubI18n.downloading")}</span>
                                            ) : (
                                              <span className={styles.statusBadge}>{hubText("dataHubI18n.availableOnline")}</span>
                                            )}
                                          </td>
                                          <td className={styles.actionCell}>
                                            <div className={styles.rowActions}>
                                              {scan ? (
                                                <>
                                                  <button
                                                    type="button"
                                                    className={`${styles.iconButton} ${styles.detailsButton}`}
                                                    onClick={() => openScanDetails(scan)}
                                                    disabled={busy}
                                                    aria-label={hubText("dataHubI18n.showNameDetails", { v1: displayName })}
                                                    title={hubText("dataHubI18n.showScanDetails")}
                                                  >
                                                    <Eye size={15} aria-hidden />
                                                    <span>{hubText("dataHubI18n.details")}</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                                    onClick={() => void deleteScans([scan.sourceScanId])}
                                                    disabled={busy}
                                                    aria-label={hubText("dataHubI18n.deleteName", { v1: displayName })}
                                                    title={hubText("dataHubI18n.deleteLocalArchiveCopy")}
                                                  >
                                                    <Trash2 size={15} aria-hidden />
                                                  </button>
                                                </>
                                              ) : entry ? (
                                                <button
                                                  type="button"
                                                  className={`${styles.iconButton} ${styles.detailsButton}`}
                                                  onClick={() => void saveArchiveEntries([entry])}
                                                  disabled={busy || isDownloadingArchive}
                                                  aria-label={hubText("dataHubI18n.saveNameLocally", { v1: displayName })}
                                                  title={hubText("dataHubI18n.saveArchiveScanLocally")}
                                                >
                                                  {isDownloadingArchive ? (
                                                    <Loader2 size={15} aria-hidden className={styles.spinIcon} />
                                                  ) : (
                                                    <Download size={15} aria-hidden />
                                                  )}
                                                  <span>{isDownloadingArchive ? hubText("dataHubI18n.loadingdc380") : hubText("dataHubI18n.save")}</span>
                                                </button>
                                              ) : null}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    }) : null}
                                      </React.Fragment>;
                                    })
                                  : null}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyState}>{archiveError ? hubText("dataHubI18n.noLocalArchiveScansFound") : hubText("dataHubI18n.noArchiveEntriesFound")}</div>
                  )}
                </section>
              </div>
            ) : (
              <FightTrackerOverview
                titleId={titleId}
                summaries={trackerSummaries}
                loading={trackersLoading}
                error={trackersError}
                selectedTrackerIds={selectedTrackerIds}
                allTrackersSelected={allTrackersSelected}
                selectedTrackerCount={selectedTrackerCount}
                onRefresh={() => void loadFightTrackers()}
                onToggleTracker={toggleTracker}
                onToggleAll={toggleAllTrackers}
                onExportSelected={() => void exportSelectedFightTrackers()}
                busy={busy}
              />
            )}
          </div>
        </div>
      </ScanManagementFrame>
      {detailsSummary ? createPortal(
        <ScanDetailsOverlay
          summary={detailsSummary}
          data={detailsData}
          loading={detailsLoading}
          error={detailsError}
          onClose={closeScanDetails}
        />, document.body,
      ) : null}
    </>
  );
  return overlay ? createPortal(content, document.body) : content;
}

function ScanDetailsOverlay({
  summary,
  data,
  loading,
  error,
  onClose,
}: {
  summary: GuildHubScanSummary;
  data: ScanDetailsData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const displayName = getScanDisplayName(summary);
  const coverage = data?.coverageSummary ?? summary.guildCoverage;
  const metadata = buildScanDetailsMetadata(summary, data);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const normalizedPlayerCacheRef = React.useRef(new Map<string, NormalizedPlayer>());
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const [view, setView] = React.useState<
    { kind: "results" } | { kind: "player"; playerKey: string } | { kind: "guild"; guildKey: string }
  >({ kind: "results" });
  useAnalyticsView(scanViewEvents[view.kind]);

  React.useEffect(() => {
    setQuery("");
    setView({ kind: "results" });
    normalizedPlayerCacheRef.current.clear();
  }, [summary.sourceScanId]);

  React.useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const limitedResults = React.useMemo(
    () =>
      data
        ? getLimitedScanExplorerResults(data.players, data.guilds, deferredQuery, SCAN_EXPLORER_MAX_VISIBLE_RESULTS)
        : {
            query: "",
            players: [],
            guilds: [],
            playerTotal: 0,
            guildTotal: 0,
            playerVisible: 0,
            guildVisible: 0,
            limit: SCAN_EXPLORER_MAX_VISIBLE_RESULTS,
          },
    [data, deferredQuery],
  );
  useRuntimeAuditCommit(limitedResults, !!data && !loading, "scan-explorer-results");
  useRuntimeAuditCommit(data, !!data && !loading, "scan-details");
  const selectedPlayer = data && view.kind === "player" ? data.playerLookup.get(view.playerKey) ?? null : null;
  const selectedGuild = data && view.kind === "guild" ? data.guildLookup.get(view.guildKey) ?? null : null;
  const selectedNormalizedPlayer = React.useMemo(() => {
    if (!selectedPlayer) return null;
    const cached = normalizedPlayerCacheRef.current.get(selectedPlayer.key);
    if (cached) return cached;
    const normalized = normalizeScanExplorerPlayer(selectedPlayer);
    normalizedPlayerCacheRef.current.set(selectedPlayer.key, normalized);
    return normalized;
  }, [selectedPlayer]);
  useRuntimeAuditCommit(selectedNormalizedPlayer, !!selectedNormalizedPlayer, "scan-explorer-player");
  const selectedPlayerGuildLink = React.useMemo(() => {
    if (!data || !selectedNormalizedPlayer) return null;
    return linkScanExplorerPlayerToGuildMember(data, selectedNormalizedPlayer);
  }, [data, selectedNormalizedPlayer]);

  return (
    <div
      className={`${styles.backdrop} ${styles.detailsBackdrop}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-details-title"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className={styles.detailsPanel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id="scan-details-title" className={styles.title}>
              {hubText("dataHubI18n.scanDetails")}
            </h2>
            <p className={styles.subtitle}>{displayName}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={hubText("dataHubI18n.closeScanDetails")}>
            <X size={18} aria-hidden />
            <span>{hubText("dataHubI18n.close")}</span>
          </button>
        </header>

        <div className={styles.detailsBody} ref={bodyRef}>
          <dl className={styles.detailsMetaGrid}>
            {metadata.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.label}</dt>
                <dd title={entry.value}>{entry.value}</dd>
              </div>
            ))}
          </dl>

          {loading ? (
            <div className={styles.detailsLoading}>
              <Loader2 size={18} aria-hidden />
              <span>{hubText("dataHubI18n.loadingScanDetails")}</span>
            </div>
          ) : error ? (
            <div className={styles.errorBox}>{hubMessage(error)}</div>
          ) : data ? (
            <>
              <dl className={styles.detailsKpiGrid}>
                <ScanDetailsKpi label={hubText("dataHubI18n.player")} value={data.players.length} />
                <ScanDetailsKpi label={hubText("dataHubI18n.guilds")} value={data.guilds.length} />
                <ScanDetailsKpi label={hubText("dataHubI18n.guildsRepresented")} value={coverage.uniqueGuildCount} />
                <ScanDetailsKpi label={hubText("dataHubI18n.fullyScannedGuilds")} value={coverage.completeUniqueGuildCount} />
                <ScanDetailsKpi label={hubText("dataHubI18n.guildSnapshots")} value={coverage.guildSnapshotCount} />
                <ScanDetailsKpi label={hubText("dataHubI18n.completeGuildSnapshots")} value={coverage.completeGuildSnapshotCount} />
                <ScanDetailsKpi label={hubText("dataHubI18n.server")} value={coverage.byServer.length} />
                {coverage.incompleteGuildSnapshotCount ? (
                  <ScanDetailsKpi label={hubText("dataHubI18n.coverageIncomplete")} value={coverage.incompleteGuildSnapshotCount} />
                ) : null}
                {coverage.overcountGuildSnapshotCount ? (
                  <ScanDetailsKpi label={hubText("dataHubI18n.coverageOvercount")} value={coverage.overcountGuildSnapshotCount} />
                ) : null}
                {coverage.unknownGuildSnapshotCount ? (
                  <ScanDetailsKpi label={hubText("dataHubI18n.unknown")} value={coverage.unknownGuildSnapshotCount} />
                ) : null}
              </dl>

              {view.kind === "results" ? (
                <ScanExplorerResults
                  data={data}
                  query={query}
                  result={limitedResults}
                  onQueryChange={setQuery}
                  onOpenPlayer={(player) => setView({ kind: "player", playerKey: player.key })}
                  onOpenGuild={(guild) => setView({ kind: "guild", guildKey: guild.key })}
                />
              ) : selectedPlayer && selectedNormalizedPlayer ? (
                <ScanExplorerPlayerDetail
                  player={selectedPlayer}
                  normalized={selectedNormalizedPlayer}
                  guildLink={selectedPlayerGuildLink}
                  onBack={() => setView({ kind: "results" })}
                />
              ) : selectedGuild ? (
                <ScanExplorerGuildDetail
                  data={data}
                  guild={selectedGuild}
                  summary={summary}
                  onBack={() => setView({ kind: "results" })}
                />
              ) : (
                <div className={styles.emptyState}>{hubText("dataHubI18n.theSelectedEntryIsNoLongerAvailableInThisScan")}</div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const ATTRIBUTE_LABELS = [
  ["strength", hubText("dataHubI18n.strength")],
  ["dexterity", hubText("dataHubI18n.dexterity")],
  ["intelligence", hubText("dataHubI18n.intelligence")],
  ["constitution", hubText("dataHubI18n.constitution")],
  ["luck", hubText("dataHubI18n.luck")],
] as const;

type ScanMetric = {
  label: string;
  value: React.ReactNode;
  title?: string;
};

function isPresent(value: unknown): value is string | number | boolean {
  return value !== null && value !== undefined && value !== "";
}

function formatOptionalValue(value: unknown) {
  return formatScanExplorerPrimitiveValue(value, formatCount);
}

function formatValueOrUnavailable(value: unknown) {
  return formatOptionalValue(value) ?? hubText("dataHubI18n.unavailable");
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return hubPercent(value, 1);
}

function formatTimestampMs(value: number | null | undefined) {
  const date = toScanExplorerTimestampDate(value);
  return date ? formatScanDate(date.toISOString()) : null;
}

function formatDamageRange(range: { min: number | null; max: number | null } | null | undefined) {
  if (!range || range.min == null || range.max == null) return null;
  return `${formatCount(range.min)} - ${formatCount(range.max)}`;
}

function formatClassName(value: number | null) {
  return value == null ? null : profileClassLabel(String(value));
}

function formatGuildRole(value: NormalizedGuildMember["role"]["name"]) {
  return value ? profileRoleLabel(value) : null;
}

function formatSourceStatus(normalized: NormalizedPlayer, path: string, value: unknown) {
  const formatted = formatOptionalValue(value);
  if (formatted != null) return formatted;
  const status = normalized.metadata.fields[path]?.status;
  return status === "invalid" ? hubText("dataHubI18n.unavailable") : null;
}

function compactEntries(record: Record<string, unknown> | null | undefined, limit = 8): ScanMetric[] {
  if (!record) return [];
  return Object.entries(record)
    .map(([label, value]) => ({ label: formatCamelLabel(label), value: formatCompactEntryValue(value) }))
    .filter((entry) => entry.value != null)
    .map((entry) => ({ label: entry.label, value: entry.value as string }))
    .slice(0, limit);
}

function formatCompactEntryValue(value: unknown) {
  return formatScanExplorerCompactEntryValue(value, { formatNumber: formatCount, formatLabel: label => hubMessage(formatCamelLabel(label)) });
}

function formatCamelLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

function ScanExplorerResults({
  data,
  query,
  result,
  onQueryChange,
  onOpenPlayer,
  onOpenGuild,
}: {
  data: ScanExplorerData;
  query: string;
  result: ReturnType<typeof getLimitedScanExplorerResults>;
  onQueryChange: (query: string) => void;
  onOpenPlayer: (player: ScanExplorerPlayerEntity) => void;
  onOpenGuild: (guild: ScanExplorerGuildEntity) => void;
}) {
  const hasResults = result.playerTotal || result.guildTotal;
  const searching = result.query.length > 0;

  return (
    <>
      <label className={styles.detailsSearch}>
        <Search size={16} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={hubText("dataHubI18n.searchPlayersOrGuilds")}
        />
      </label>

      {hasResults ? (
        <div className={styles.entityGroups}>
          <section className={styles.detailsSection} aria-label={hubText("dataHubI18n.players")}>
            <h3>{hubText("dataHubI18n.players")} ({formatCount(result.playerTotal)})</h3>
            <ScanExplorerResultLimitNote
              kind="players"
              total={result.playerTotal}
              visible={result.playerVisible}
              limit={result.limit}
              searching={searching}
            />
            {result.players.length ? (
              <div className={styles.entityList}>
                {result.players.map((player) => (
                  <button type="button" className={styles.entityButton} key={player.key} onClick={() => onOpenPlayer(player)}>
                    <User size={16} aria-hidden />
                    <span className={styles.entityMain}>
                      <strong>{player.name}</strong>
                      <span>
                        {[
                          player.level == null ? null : hubText("dataHubI18n.levelNumber", { v1: player.level }),
                          formatClassName(player.classId),
                        ]
                          .filter(Boolean)
                          .join(" - ")}
                      </span>
                    </span>
                    <span className={styles.entityMeta}>
                      {[player.server, player.guildName].filter(Boolean).join(" - ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>{hubText("dataHubI18n.noPlayersFound")}</div>
            )}
          </section>

          <section className={styles.detailsSection} aria-label={hubText("dataHubI18n.guilds")}>
            <h3>{hubText("dataHubI18n.guilds")} ({formatCount(result.guildTotal)})</h3>
            <ScanExplorerResultLimitNote
              kind="guilds"
              total={result.guildTotal}
              visible={result.guildVisible}
              limit={result.limit}
              searching={searching}
            />
            {result.guilds.length ? (
              <div className={styles.entityList}>
                {result.guilds.map((guild) => (
                  <button type="button" className={styles.entityButton} key={guild.key} onClick={() => onOpenGuild(guild)}>
                    <Users size={16} aria-hidden />
                    <span className={styles.entityMain}>
                      <strong>{guild.group.guildName}</strong>
                      <span>{guild.group.guildIdentifier}</span>
                    </span>
                    <span className={styles.entityMeta}>
                      {[
                        guild.group.server,
                        guild.group.rows[0]?.declaredMemberCount == null
                          ? null
                          : hubText("dataHubI18n.memberCount", { v1: guild.group.rows[0].declaredMemberCount }),
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>{hubText("dataHubI18n.noGuildsFound")}</div>
            )}
          </section>
        </div>
      ) : (
        <div className={styles.emptyState}>
          {hubText("dataHubI18n.noResults", { players: data.players.length, guilds: data.guilds.length })}
        </div>
      )}
    </>
  );
}

function ScanExplorerResultLimitNote({
  kind: _kind,
  total,
  visible,
  limit,
  searching,
}: {
  kind: "players" | "guilds";
  total: number;
  visible: number;
  limit: number;
  searching: boolean;
}) {
  if (!total) return null;
  const capped = total > visible;
  return (
    <p className={styles.resultLimitNote}>
      {hubText(capped ? "dataHubI18n.listLimitFirst" : "dataHubI18n.listLimit", { visible, total })}
      {!searching && total > limit ? " " + hubText("dataHubI18n.useSearchToNarrowTheList") : ""}
    </p>
  );
}

function ScanExplorerBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className={styles.detailBackButton} onClick={onBack}>
      <ChevronLeft size={16} aria-hidden />
      <span>{hubText("dataHubI18n.back")}</span>
    </button>
  );
}

function ScanExplorerPlayerDetail({
  player,
  normalized,
  guildLink,
  onBack,
}: {
  player: ScanExplorerPlayerEntity;
  normalized: NormalizedPlayer;
  guildLink: NormalizedPlayerGuildMemberLink | null;
  onBack: () => void;
}) {
  const className = formatClassName(normalized.identity.class);
  const showLegacyGuildBonuses = !guildLink?.linked;

  return (
    <>
      <div className={styles.detailNav}>
        <ScanExplorerBackButton onBack={onBack} />
      </div>
      <section className={styles.entityDetailHeader} aria-label={hubText("dataHubI18n.player")}>
        <User size={18} aria-hidden />
        <div>
          <h3>{player.name}</h3>
          <p>
            {[
              normalized.progression.level == null ? null : hubText("dataHubI18n.levelNumber", { v1: normalized.progression.level }),
              className,
              player.server,
              player.guildName,
            ]
              .filter(Boolean)
              .join(" - ")}
          </p>
        </div>
      </section>

      <ScanDetailSection title={hubText("dataHubI18n.overview")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.identifier"), value: normalized.identity.identifier },
            { label: hubText("dataHubI18n.playerId"), value: normalized.identity.id },
            { label: hubText("dataHubI18n.name"), value: normalized.identity.name },
            { label: hubText("dataHubI18n.server"), value: normalized.identity.server ?? player.server },
            { label: hubText("dataHubI18n.level"), value: normalized.progression.level },
            { label: hubText("dataHubI18n.xp"), value: normalized.progression.xp },
            { label: hubText("dataHubI18n.xpToNextLevel"), value: normalized.progression.xpNext },
            { label: hubText("dataHubI18n.honor"), value: normalized.progression.honor },
            { label: hubText("dataHubI18n.rank"), value: normalized.progression.rank },
            { label: hubText("dataHubI18n.class"), value: className },
          ]}
        />
      </ScanDetailSection>

      {guildLink?.linked ? (
        <ScanExplorerPlayerGuildMemberSection guildLink={guildLink} />
      ) : guildLink?.ambiguous ? (
        <ScanDetailSection title={hubText("dataHubI18n.guildMember")}>
          <div className={styles.unsupportedNote}>{hubText("dataHubI18n.guildMemberDataIsAmbiguousForThisPlayerIdentifierInThisScan")}</div>
        </ScanDetailSection>
      ) : guildLink?.guildReference ? (
        <ScanDetailSection title={hubText("dataHubI18n.guildMember")}>
          <MetricGrid
            items={[
              { label: hubText("dataHubI18n.guild"), value: guildLink.guildReference.name },
              { label: hubText("dataHubI18n.guildIdentifier"), value: guildLink.guildReference.identifier },
              { label: hubText("dataHubI18n.server"), value: guildLink.guildReference.server },
            ]}
          />
          <div className={styles.unsupportedNote}>{hubText("dataHubI18n.noMatchingGuildMemberEntryIsAvailableInThisScan")}</div>
        </ScanDetailSection>
      ) : null}

      <ScanDetailSection title={hubText("dataHubI18n.attributes")}>
        <div className={styles.attributeGrid}>
          {ATTRIBUTE_LABELS.map(([key, label]) => {
            const attribute = normalized.attributes[key];
            const details = compactEntries(attribute as unknown as Record<string, unknown>, 12).filter(
              (entry) => entry.label !== "Total" && entry.label !== "Base",
            );
            return (
              <div className={styles.attributeCard} key={key}>
                <div className={styles.attributeTop}>
                  <strong>{hubMessage(label)}</strong>
                  <span>{formatValueOrUnavailable(attribute.total)}</span>
                </div>
                <span>{hubText("dataHubI18n.base")} {formatValueOrUnavailable(attribute.base)}</span>
                {details.length ? (
                  <details className={styles.compactDetails}>
                    <summary>{hubText("dataHubI18n.components")}</summary>
                    <MetricGrid items={details} compact />
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScanDetailSection>

      <ScanDetailSection title={hubText("dataHubI18n.combat")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.armor"), value: formatSourceStatus(normalized, "combat.armor", normalized.combat.armor) },
            { label: hubText("dataHubI18n.damage"), value: formatDamageRange(normalized.combat.damage) },
            { label: hubText("dataHubI18n.secondaryDamage"), value: formatDamageRange(normalized.combat.damage.secondary) },
            { label: hubText("dataHubI18n.health"), value: formatSourceStatus(normalized, "combat.health", normalized.combat.health) },
          ]}
        />
      </ScanDetailSection>

      <ScanDetailSection title={hubText("dataHubI18n.progressBonuses")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.scrapbook"), value: formatValueWithMaximum(normalized.progressionStatus.scrapbook.count, normalized.progressionStatus.scrapbook.maximum) },
            { label: hubText("dataHubI18n.scrapbookbf08c"), value: formatPercentValue(normalized.progressionStatus.scrapbook.percentage) },
            { label: hubText("dataHubI18n.achievements"), value: formatValueWithMaximum(normalized.progressionStatus.achievements.count, normalized.progressionStatus.achievements.maximum) },
            { label: hubText("dataHubI18n.mountType"), value: normalized.progressionStatus.mount.type },
            { label: hubText("dataHubI18n.mountBonus"), value: normalized.progressionStatus.mount.bonus == null ? null : hubPercent(normalized.progressionStatus.mount.bonus / 100) },
            { label: hubText("dataHubI18n.mountExpires"), value: formatTimestampMs(normalized.progressionStatus.mount.expiresAt) },
            { label: hubText("dataHubI18n.portalHealth"), value: normalized.progressionStatus.portalBonuses.health },
            { label: hubText("dataHubI18n.portalDamage"), value: normalized.progressionStatus.portalBonuses.damage },
            ...(showLegacyGuildBonuses
              ? [
                  { label: hubText("dataHubI18n.guildTreasure"), value: guildLink?.guildBonuses.treasure ?? normalized.progressionStatus.guildBonuses.treasure },
                  { label: hubText("dataHubI18n.guildInstructor"), value: guildLink?.guildBonuses.instructor ?? normalized.progressionStatus.guildBonuses.instructor },
                  { label: hubText("dataHubI18n.guildPet"), value: guildLink?.guildBonuses.pet ?? normalized.progressionStatus.guildBonuses.pet },
                ]
              : []),
          ]}
        />
      </ScanDetailSection>

      <ScanExplorerFortressSection normalized={normalized} />
      <ScanExplorerDungeonsSection normalized={normalized} />
      <ScanExplorerAdvancedSections normalized={normalized} />
    </>
  );
}

function ScanExplorerPlayerGuildMemberSection({ guildLink }: { guildLink: NormalizedPlayerGuildMemberLink }) {
  return (
    <ScanDetailSection title={hubText("dataHubI18n.guildMember")}>
      <MetricGrid
        items={[
          { label: hubText("dataHubI18n.guild"), value: guildLink.guildReference?.name },
          { label: hubText("dataHubI18n.guildIdentifier"), value: guildLink.guildReference?.identifier },
          { label: hubText("dataHubI18n.server"), value: guildLink.guildReference?.server },
          { label: hubText("dataHubI18n.role"), value: formatGuildRole(guildLink.role) },
          { label: hubText("dataHubI18n.lastActive"), value: formatTimestampMs(guildLink.lastActive) },
          { label: hubText("dataHubI18n.readyForAttack"), value: guildLink.readyAttack },
          { label: hubText("dataHubI18n.readyForDefense"), value: guildLink.readyDefense },
          { label: hubText("dataHubI18n.hydraAction"), value: guildLink.actions.hydra },
          { label: hubText("dataHubI18n.attackAction"), value: guildLink.actions.attack },
          { label: hubText("dataHubI18n.defenseAction"), value: guildLink.actions.defense },
          { label: hubText("dataHubI18n.raidAction"), value: guildLink.actions.raid },
          { label: hubText("dataHubI18n.guildTreasure"), value: guildLink.guildBonuses.treasure },
          { label: hubText("dataHubI18n.guildInstructor"), value: guildLink.guildBonuses.instructor },
          { label: hubText("dataHubI18n.guildPet"), value: guildLink.guildBonuses.pet },
          { label: hubText("dataHubI18n.knightsContributed"), value: guildLink.knightsContribution },
        ]}
      />
    </ScanDetailSection>
  );
}

function formatValueWithMaximum(value: number | null, maximum: number | null) {
  if (value == null) return null;
  return maximum == null ? formatCount(value) : `${formatCount(value)} / ${formatCount(maximum)}`;
}

function ScanExplorerFortressSection({ normalized }: { normalized: NormalizedPlayer }) {
  const fortress = normalized.fortress;
  const buildings = compactEntries(fortress.buildings as unknown as Record<string, unknown>, 20);
  const hasAnyFortressValue =
    isPresent(fortress.rank) ||
    isPresent(fortress.honor) ||
    buildings.length > 0 ||
    isPresent(fortress.currentBuilding.active);

  return (
    <ScanDetailSection title={hubText("dataHubI18n.fortress")}>
      {hasAnyFortressValue ? (
        <>
          <MetricGrid
            items={[
              { label: hubText("dataHubI18n.upgrades"), value: fortress.upgrades },
              { label: hubText("dataHubI18n.rank"), value: fortress.rank },
              { label: hubText("dataHubI18n.honor"), value: fortress.honor },
              { label: hubText("dataHubI18n.raidHonor"), value: fortress.raidHonor },
              { label: hubText("dataHubI18n.gladiator"), value: fortress.gladiator },
              { label: hubText("dataHubI18n.knights"), value: fortress.knights },
              { label: hubText("dataHubI18n.currentBuilding"), value: fortress.currentBuilding.building ? hubMessage(formatCamelLabel(fortress.currentBuilding.building)) : null },
              { label: hubText("dataHubI18n.upgradeActive"), value: fortress.currentBuilding.active },
              ...(fortress.currentBuilding.active
                ? [
                    { label: hubText("dataHubI18n.starts"), value: formatTimestampMs(fortress.currentBuilding.startsAt) },
                    { label: hubText("dataHubI18n.finishes"), value: formatTimestampMs(fortress.currentBuilding.finishesAt) },
                  ]
                : []),
            ]}
          />
          {buildings.length ? <MetricGrid items={buildings} compact /> : null}
        </>
      ) : (
        <div className={styles.unsupportedNote}>{hubText("dataHubI18n.fortressDataIsNotAvailableForThisPlayerInThisScan")}</div>
      )}
    </ScanDetailSection>
  );
}

function ScanExplorerDungeonsSection({ normalized }: { normalized: NormalizedPlayer }) {
  const dungeons = normalized.dungeons;
  return (
    <ScanDetailSection title={hubText("dataHubI18n.dungeons")}>
      <MetricGrid
        items={[
          { label: hubText("dataHubI18n.normalTotal"), value: dungeons.totals.normal },
          { label: hubText("dataHubI18n.normalUnlocked"), value: dungeons.totals.normalUnlocked },
          { label: hubText("dataHubI18n.shadowTotal"), value: dungeons.totals.shadow },
          { label: hubText("dataHubI18n.shadowUnlocked"), value: dungeons.totals.shadowUnlocked },
          { label: hubText("dataHubI18n.classTotal"), value: dungeons.totals.class },
          { label: hubText("dataHubI18n.classUnlocked"), value: dungeons.totals.classUnlocked },
          { label: hubText("dataHubI18n.tower"), value: dungeons.tower.displayProgress },
          { label: hubText("dataHubI18n.twister"), value: dungeons.twister.displayProgress },
          { label: hubText("dataHubI18n.raid"), value: dungeons.raid.displayProgress },
          { label: hubText("dataHubI18n.playerPortal"), value: dungeons.portals.player.displayProgress },
          { label: hubText("dataHubI18n.guildPortal"), value: dungeons.portals.guild.displayProgress },
        ]}
      />
      <MetricGrid
        items={[
          { label: hubText("dataHubI18n.normalEntries"), value: dungeons.normal.count },
          { label: hubText("dataHubI18n.normalProgress"), value: dungeons.normal.totalProgress },
          { label: hubText("dataHubI18n.shadowEntries"), value: dungeons.shadow.count },
          { label: hubText("dataHubI18n.shadowProgress"), value: dungeons.shadow.totalProgress },
          { label: hubText("dataHubI18n.classEntries"), value: dungeons.class.count },
          { label: hubText("dataHubI18n.classProgress"), value: dungeons.class.totalProgress },
        ]}
        compact
      />
    </ScanDetailSection>
  );
}

function ScanExplorerAdvancedSections({ normalized }: { normalized: NormalizedPlayer }) {
  const itemEntries = Object.entries(normalized.items?.equipped?.slots ?? {})
    .map(([slot, item]) => ({
      label: formatCamelLabel(slot),
      value: [
        item?.type == null ? null : hubText("dataHubI18n.itemType", { v1: item.type }),
        item?.armor == null ? null : hubText("dataHubI18n.itemArmor", { v1: item.armor }),
        formatDamageRange(item?.damage),
      ]
        .filter(Boolean)
        .join(" - "),
    }))
    .filter((entry) => entry.value);
  const potionEntries =
    normalized.potions?.slots
      .map((slot) => ({
        label: hubText("dataHubI18n.slotNumber", { v1: slot.slot + 1 }),
        value: [
          slot.attribute ? hubMessage(formatCamelLabel(slot.attribute)) : null,
          slot.size == null ? null : hubPercent(slot.size / 100),
          slot.expires == null ? null : formatTimestampMs(slot.expires),
        ]
          .filter(Boolean)
          .join(" - "),
      }))
      .filter((entry) => entry.value) ?? [];
  const pets = normalized.pets;

  return (
    <details className={styles.advancedDetails}>
      <summary>{hubText("dataHubI18n.advanced")}</summary>
      <div className={styles.advancedStack}>
        <ScanDetailSection title={hubText("dataHubI18n.items")}>
          {itemEntries.length ? <MetricGrid items={itemEntries} compact /> : <div className={styles.unsupportedNote}>{hubText("dataHubI18n.equippedItemsAreNotAvailable")}</div>}
        </ScanDetailSection>
        <ScanDetailSection title={hubText("dataHubI18n.potions")}>
          <MetricGrid
            items={[
              { label: hubText("dataHubI18n.lifePotionActive"), value: normalized.potions?.life.active },
              { label: hubText("dataHubI18n.lifePotionSize"), value: normalized.potions?.life.size },
              ...potionEntries,
            ]}
            compact
          />
        </ScanDetailSection>
        <ScanDetailSection title={hubText("dataHubI18n.pets")}>
          {pets ? (
            <>
              <MetricGrid
                items={[
                  { label: hubText("dataHubI18n.rank"), value: pets.rank },
                  { label: hubText("dataHubI18n.honor"), value: pets.honor },
                  { label: hubText("dataHubI18n.totalCount"), value: pets.own?.totalCount ?? pets.collection?.totalPets },
                  { label: hubText("dataHubI18n.totalLevel"), value: pets.own?.totalLevel },
                ]}
                compact
              />
              <MetricGrid items={compactEntries(pets.bonuses as unknown as Record<string, unknown>, 8)} compact />
              <MetricGrid items={compactEntries(pets.foods as unknown as Record<string, unknown>, 8)} compact />
            </>
          ) : (
            <div className={styles.unsupportedNote}>{hubText("dataHubI18n.petDataIsNotAvailable")}</div>
          )}
        </ScanDetailSection>
        <ScanDetailSection title={hubText("dataHubI18n.runes")}>
          <MetricGrid
            items={[
              { label: hubText("dataHubI18n.gold"), value: normalized.runes.gold },
              { label: hubText("dataHubI18n.xp"), value: normalized.runes.xp },
              { label: hubText("dataHubI18n.epicChance"), value: normalized.runes.epicChance },
              { label: hubText("dataHubI18n.itemQuality"), value: normalized.runes.itemQuality },
              { label: hubText("dataHubI18n.health"), value: normalized.runes.health },
              { label: hubText("dataHubI18n.damage"), value: normalized.runes.damage.total },
              { label: hubText("dataHubI18n.resistance"), value: normalized.runes.resistance.total },
            ]}
            compact
          />
        </ScanDetailSection>
      </div>
    </details>
  );
}

function ScanExplorerGuildDetail({
  data,
  guild,
  summary,
  onBack,
}: {
  data: ScanExplorerData;
  guild: ScanExplorerGuildEntity;
  summary: GuildHubScanSummary;
  onBack: () => void;
}) {
  const group = guild.group;
  const normalizedGuild = getScanExplorerGuildDetail(data, guild);
  const members = normalizedGuild ? sortNormalizedGuildMembers(normalizedGuild.members) : [];
  const summaryGuild = findSummaryGuild(summary, guild);
  const displayName = normalizedGuild?.identity.name ?? group.guildName;
  const displayIdentifier = normalizedGuild?.identity.identifier ?? group.guildIdentifier;
  const displayServer = normalizedGuild?.identity.server ?? group.server;
  const coa = normalizedGuild?.identity.coa ?? summaryGuild?.coaString;

  return (
    <>
      <div className={styles.detailNav}>
        <ScanExplorerBackButton onBack={onBack} />
      </div>
      <section className={styles.entityDetailHeader} aria-label={hubText("dataHubI18n.guild")}>
        <Shield size={18} aria-hidden />
        <div>
          <h3>{displayName}</h3>
          <p>{[displayServer, displayIdentifier].filter(Boolean).join(" - ")}</p>
        </div>
      </section>

      <ScanDetailSection title={hubText("dataHubI18n.overview")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.name"), value: displayName },
            { label: hubText("dataHubI18n.identifier"), value: displayIdentifier },
            { label: hubText("dataHubI18n.server"), value: displayServer },
            { label: hubText("dataHubI18n.coatOfArms"), value: coa },
            { label: hubText("dataHubI18n.rank"), value: normalizedGuild?.progression.rank },
            { label: hubText("dataHubI18n.honor"), value: normalizedGuild?.progression.honor },
            { label: hubText("dataHubI18n.snapshots"), value: group.rows.length },
            { label: hubText("dataHubI18n.completeSnapshots"), value: group.completeSnapshotCount },
            { label: hubText("dataHubI18n.members"), value: normalizedGuild?.totals.membersTotal ?? group.rows[0]?.declaredMemberCount ?? members.length },
            { label: hubText("dataHubI18n.description"), value: normalizedGuild?.identity.description },
          ]}
        />
      </ScanDetailSection>

      {normalizedGuild ? <ScanExplorerGuildNormalizedSections guild={normalizedGuild} /> : null}

      <ScanDetailSection title={hubText("dataHubI18n.coverageLabel")}>
        {group.rows.length ? (
          <div className={styles.detailsGuildList}>
            <ScanDetailsGuildRow group={group} />
          </div>
        ) : (
          <div className={styles.emptyState}>{hubText("dataHubI18n.noGuildCoverageFound")}</div>
        )}
      </ScanDetailSection>

      <ScanDetailSection title={hubText("dataHubI18n.membersHeading", { v1: members.length })}>
        {members.length ? (
          <div className={styles.memberList}>
            {members.map((member) => (
              <ScanExplorerGuildMemberRow member={member} key={member.identity.playerIdentifier ?? `slot:${member.identity.slot}`} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>{hubText("dataHubI18n.noMemberListIsAvailableFromNormalizedGuildData")}</div>
        )}
      </ScanDetailSection>
    </>
  );
}

function ScanExplorerGuildNormalizedSections({ guild }: { guild: NormalizedGuild }) {
  return (
    <>
      <ScanDetailSection title={hubText("dataHubI18n.bonusesTotals")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.totalTreasure"), value: guild.bonuses.totalTreasure },
            { label: hubText("dataHubI18n.totalInstructor"), value: guild.bonuses.totalInstructor },
            { label: hubText("dataHubI18n.totalKnights"), value: guild.totals.totalKnights },
            { label: hubText("dataHubI18n.totalKnights15"), value: guild.totals.totalKnights15 },
            { label: hubText("dataHubI18n.guildPetId"), value: guild.combatProgress.pet.id },
            { label: hubText("dataHubI18n.guildPetLevel"), value: guild.combatProgress.pet.level },
            { label: hubText("dataHubI18n.guildPetClass"), value: guild.combatProgress.pet.class },
          ]}
        />
      </ScanDetailSection>
      <ScanDetailSection title={hubText("dataHubI18n.combatProgress")}>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.raid"), value: guild.combatProgress.raid },
            { label: hubText("dataHubI18n.portalFloor"), value: guild.combatProgress.portal.floor },
            { label: hubText("dataHubI18n.portalLife"), value: guild.combatProgress.portal.life },
            { label: hubText("dataHubI18n.portalPercent"), value: guild.combatProgress.portal.percent },
            { label: hubText("dataHubI18n.hydraLevel"), value: guild.combatProgress.hydra.level },
            { label: hubText("dataHubI18n.hydraMaximum"), value: guild.combatProgress.hydra.max },
            { label: hubText("dataHubI18n.underAttack"), value: guild.combatProgress.combatState.isUnderAttack },
            { label: hubText("dataHubI18n.attackerId"), value: guild.combatProgress.combatState.underAttackId },
            { label: hubText("dataHubI18n.attacking"), value: guild.combatProgress.combatState.isAttacking },
            { label: hubText("dataHubI18n.attackTargetId"), value: guild.combatProgress.combatState.attackingId },
          ]}
        />
      </ScanDetailSection>
      {guild.tournament ? (
        <ScanDetailSection title={hubText("dataHubI18n.tournament")}>
          <MetricGrid
            items={[
              { label: hubText("dataHubI18n.rank"), value: guild.tournament.rank },
              { label: hubText("dataHubI18n.tokens"), value: guild.tournament.tokens },
            ]}
          />
        </ScanDetailSection>
      ) : null}
    </>
  );
}

function ScanExplorerGuildMemberRow({ member }: { member: NormalizedGuildMember }) {
  return (
    <div className={styles.memberRow}>
      <strong>{member.identity.name ?? member.identity.playerIdentifier ?? hubText("dataHubI18n.slotNumber", { v1: member.identity.slot + 1 })}</strong>
      <span>
        {[
          formatGuildRole(member.role.name),
          member.identity.level == null ? null : hubText("dataHubI18n.levelNumber", { v1: member.identity.level }),
          member.identity.playerIdentifier,
        ]
          .filter(Boolean)
          .join(" - ")}
      </span>
      <span>
        {[
          formatTimestampMs(member.activity.lastActive),
          member.readyAttack == null ? null : hubText("dataHubI18n.attackValue", { v1: formatOptionalValue(member.readyAttack) }),
          member.readyDefense == null ? null : hubText("dataHubI18n.defenseValue", { v1: formatOptionalValue(member.readyDefense) }),
        ]
          .filter(Boolean)
          .join(" - ")}
      </span>
      <details className={styles.compactDetails}>
        <summary>{hubText("dataHubI18n.memberDetails")}</summary>
        <MetricGrid
          items={[
            { label: hubText("dataHubI18n.slot"), value: member.identity.slot + 1 },
            { label: hubText("dataHubI18n.playerId"), value: member.identity.playerId },
            { label: hubText("dataHubI18n.playerIdentifier"), value: member.identity.playerIdentifier },
            { label: hubText("dataHubI18n.state"), value: member.activity.state },
            { label: hubText("dataHubI18n.lastActive"), value: formatTimestampMs(member.activity.lastActive) },
            { label: hubText("dataHubI18n.hydraAction"), value: member.actions.hydra },
            { label: hubText("dataHubI18n.attackAction"), value: member.actions.attack },
            { label: hubText("dataHubI18n.defenseAction"), value: member.actions.defense },
            { label: hubText("dataHubI18n.raidAction"), value: member.actions.raid },
            { label: hubText("dataHubI18n.guildTreasure"), value: member.bonuses.treasure },
            { label: hubText("dataHubI18n.guildInstructor"), value: member.bonuses.instructor },
            { label: hubText("dataHubI18n.guildPet"), value: member.bonuses.pet },
            { label: hubText("dataHubI18n.knightsContributed"), value: member.contributions.knights },
          ]}
          compact
        />
      </details>
    </div>
  );
}

function sortNormalizedGuildMembers(members: NormalizedGuildMember[]) {
  return [...members].sort(
    (a, b) =>
      (a.role.id ?? Number.MAX_SAFE_INTEGER) - (b.role.id ?? Number.MAX_SAFE_INTEGER) ||
      (b.identity.level ?? -1) - (a.identity.level ?? -1) ||
      (a.identity.name ?? "").localeCompare(b.identity.name ?? "", undefined, { numeric: true, sensitivity: "base" }) ||
      a.identity.slot - b.identity.slot,
  );
}

function findSummaryGuild(summary: GuildHubScanSummary, guild: ScanExplorerGuildEntity) {
  const targetServer = normalizeGuildScanServer(guild.group.server);
  const targetSegment = normalizeGuildSegmentForScan(guild.group.guildIdentifier);
  return (
    summary.guilds.find(
      (entry) =>
        normalizeGuildScanServer(entry.server) === targetServer &&
        normalizeGuildSegmentForScan(entry.guildIdentifier ?? entry.guildId) === targetSegment,
    ) ?? null
  );
}

function ScanDetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.detailsSection} aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function MetricGrid({ items, compact = false }: { items: ScanMetric[]; compact?: boolean }) {
  const visibleItems = getVisibleScanExplorerMetrics(
    items.map((item) => ({ ...item, value: typeof item.value === "string" ? item.value : formatOptionalValue(item.value) ?? item.value })),
  ).map((item) => ({ ...item, value: item.value as React.ReactNode }));

  if (!visibleItems.length) return null;

  return (
    <dl className={`${styles.metricGrid} ${compact ? styles.metricGridCompact : ""}`}>
      {visibleItems.map((item) => (
        <div key={`${item.label}:${String(item.value)}`} title={item.title}>
          <dt>{hubMessage(item.label)}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ScanDetailsKpi({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{formatCount(value)}</dd>
    </div>
  );
}

function ScanDetailsGuildRow({ group }: { group: ScanExplorerGuildGroup }) {
  const singleRow = group.rows.length === 1 ? group.rows[0] : null;

  if (singleRow) {
    const status = formatCoverageStatus(singleRow.status);
    return (
      <div className={styles.detailsGuildRow}>
        <div className={styles.detailsGuildName}>
          <strong>{group.guildName}</strong>
          <span>{group.guildIdentifier}</span>
        </div>
        <span>{group.server}</span>
        <span>{hubText("dataHubI18n.quantityScans", { count: 1 })}</span>
        <span>{formatCoverageRatio(singleRow)}</span>
        <span title={status.label}>
          {status.symbol} {status.label}
        </span>
      </div>
    );
  }

  return (
    <details className={styles.detailsGuildGroup}>
      <summary className={styles.detailsGuildRow}>
        <div className={styles.detailsGuildName}>
          <strong>{group.guildName}</strong>
          <span>{group.guildIdentifier}</span>
        </div>
        <span>{group.server}</span>
        <span>{hubText("dataHubI18n.quantityScans", { count: group.rows.length })}</span>
        <span>{hubText("dataHubI18n.completeCount", { count: group.completeSnapshotCount })}</span>
        <span>{formatGroupStatus(group)}</span>
      </summary>
      <div className={styles.detailsGuildSnapshots}>
        {group.rows.map((row) => {
          const status = formatCoverageStatus(row.status);
          return (
            <div className={styles.detailsGuildSnapshot} key={`${row.snapshotTimestamp}:${row.server}:${row.guildIdentifier}`}>
              <span>{formatScanDate(new Date(row.snapshotTimestamp).toISOString())}</span>
              <span>{formatCoverageRatio(row)}</span>
              <span title={status.label}>
                {status.symbol} {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}

function FightTrackerOverview({
  titleId,
  summaries,
  loading,
  error,
  selectedTrackerIds,
  allTrackersSelected,
  selectedTrackerCount,
  onRefresh,
  onToggleTracker,
  onToggleAll,
  onExportSelected,
  busy,
}: {
  titleId: string;
  summaries: FightTrackerSummary[];
  loading: boolean;
  error: string | null;
  selectedTrackerIds: Set<string>;
  allTrackersSelected: boolean;
  selectedTrackerCount: number;
  onRefresh: () => void;
  onToggleTracker: (trackerId: string) => void;
  onToggleAll: () => void;
  onExportSelected: () => void;
  busy: boolean;
}) {
  return (
    <div id={`${titleId}-fight-trackers-panel`} role="tabpanel" aria-labelledby={`${titleId}-fight-trackers-tab`}>
      {error ? <div className={styles.errorBox}>{hubMessage(error)}</div> : null}

      <section className={styles.scanSection} aria-label="Fight Tracker">
        <div className={styles.sectionHeader}>
          <h3>Fight Tracker</h3>
          <div className={styles.sectionHeaderActions}>
            <span>{loading ? hubText("dataHubI18n.loading") : hubText("dataHubI18n.savedCount", { v1: summaries.length })}</span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefresh}
              disabled={loading}
              aria-label={hubText("dataHubI18n.refreshFightTrackers")}
              title={hubText("dataHubI18n.refreshFightTrackers")}
            >
              <RefreshCw size={15} aria-hidden />
            </button>
          </div>
        </div>

        {loading ? (
          <DataHubLoadingState
            title={hubText("dataHubI18n.loadingFightTrackers")}
            message={hubText("dataHubI18n.readingLocalTrackerMetadata")}
          />
        ) : summaries.length ? (
          <>
            <div className={styles.selectionToolbar}>
              <span className={styles.selectionCount}>{formatSelectedCount(selectedTrackerCount)}</span>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onExportSelected}
                disabled={busy || selectedTrackerCount === 0}
              >
                <Download size={16} aria-hidden />
                <span>{selectedTrackerCount === 1 ? hubText("dataHubI18n.exportFightTracker") : hubText("dataHubI18n.exportFightTrackerPack")}</span>
              </button>
            </div>
            <div className={`${styles.tableWrap} ${styles.trackerTableWrap}`}>
              <table className={`${styles.table} ${styles.trackerTable}`}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}>
                      <input
                        type="checkbox"
                        aria-label={hubText("dataHubI18n.selectAllFightTrackers")}
                        checked={allTrackersSelected}
                        onChange={onToggleAll}
                      />
                    </th>
                    <th>{hubText("dataHubI18n.trackerGuild")}</th>
                    <th>{hubText("dataHubI18n.server")}</th>
                    <th className={styles.numericCell}>{hubText("dataHubI18n.member")}</th>
                    <th className={styles.numericCell}>{hubText("dataHubI18n.active")}</th>
                    <th className={styles.numericCell}>{hubText("dataHubI18n.fights")}</th>
                    <th>{hubText("dataHubI18n.updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={summary.tracker.id}>
                      <td className={styles.checkCell}>
                        <input
                          type="checkbox"
                          aria-label={hubText("dataHubI18n.selectName", { v1: summary.tracker.name })}
                          checked={selectedTrackerIds.has(summary.tracker.id)}
                          onChange={() => onToggleTracker(summary.tracker.id)}
                        />
                      </td>
                      <td>
                        <div className={styles.trackerNameCell}>
                          <span className={styles.truncate} title={summary.tracker.name}>
                            {summary.tracker.name}
                          </span>
                          {summary.tracker.importedAt ? <span className={styles.importBadge}>{hubText("dataHubI18n.imported")}</span> : null}
                        </div>
                      </td>
                      <td>{summary.tracker.server || hubText("dataHubI18n.unknown")}</td>
                      <td className={styles.numericCell}>{formatCount(summary.memberCount)}</td>
                      <td className={styles.numericCell}>{formatCount(summary.activeMemberCount)}</td>
                      <td className={styles.numericCell}>{formatCount(summary.fightCount)}</td>
                      <td>{formatOptionalDate(summary.tracker.lastSyncedScanAt ?? summary.tracker.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.trackerList}>
              {summaries.map((summary) => (
                <article className={styles.trackerListItem} key={summary.tracker.id}>
                  <div className={styles.trackerListHeader}>
                    <label className={styles.trackerListTitleRow}>
                      <input
                        type="checkbox"
                        aria-label={hubText("dataHubI18n.selectName", { v1: summary.tracker.name })}
                        checked={selectedTrackerIds.has(summary.tracker.id)}
                        onChange={() => onToggleTracker(summary.tracker.id)}
                      />
                      <strong>{summary.tracker.name}</strong>
                    </label>
                    <span>{summary.tracker.server || hubText("dataHubI18n.unknown")}</span>
                  </div>
                  {summary.tracker.importedAt ? <span className={styles.importBadge}>{hubText("dataHubI18n.imported")}</span> : null}
                  <dl className={styles.trackerStats}>
                    <div>
                      <dt>{hubText("dataHubI18n.member")}</dt>
                      <dd>{formatCount(summary.memberCount)}</dd>
                    </div>
                    <div>
                      <dt>{hubText("dataHubI18n.active")}</dt>
                      <dd>{formatCount(summary.activeMemberCount)}</dd>
                    </div>
                    <div>
                      <dt>{hubText("dataHubI18n.fights")}</dt>
                      <dd>{formatCount(summary.fightCount)}</dd>
                    </div>
                    <div>
                      <dt>{hubText("dataHubI18n.updated")}</dt>
                      <dd>{formatOptionalDate(summary.tracker.lastSyncedScanAt ?? summary.tracker.updatedAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>{hubText("dataHubI18n.noFightTrackersAvailableYet")}</div>
        )}
      </section>
    </div>
  );
}

function DataJobStatusBox({ job }: { job: DataJob }) {
  const progress = getDataJobProgress(job);
  const detail = job.message ? hubMessage(job.message) : hubMessage(job.phase) + (
    job.metadata?.detectedMembers && job.metadata.detectedMembers > 0 ? ` - ${hubNumber(job.metadata.processedMembers ?? 0)}/${hubText("dataHubI18n.quantityPlayers", { count: job.metadata.detectedMembers })}` :
    job.metadata?.detectedSnapshots && job.metadata.detectedSnapshots > 0 ? ` - ${hubNumber(job.metadata.processedSnapshots ?? 0)}/${hubText("dataHubI18n.quantityScans", { count: job.metadata.detectedSnapshots })}` : "");
  const percent =
    progress && progress.total > 0 ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : null;

  return (
    <section className={styles.jobStatusBox} aria-label={hubText("dataHubI18n.importInProgress")}>
      <div className={styles.jobStatusHeader}>
        <span className={styles.jobStatusIcon} aria-hidden>
          <Loader2 size={16} />
        </span>
        <div>
          <h3>{hubMessage(job.title)}</h3>
          <p>{hubMessage(detail)}</p>
        </div>
        {progress ? (
          <span className={styles.jobStatusCount}>
            {hubNumber(progress.current)}/{hubNumber(progress.total)}
          </span>
        ) : null}
      </div>
      <div className={styles.jobProgressTrack} aria-hidden>
        {percent == null ? (
          <span className={styles.jobProgressIndeterminate} />
        ) : (
          <span className={styles.jobProgressBar} style={{ width: `${percent}%` }} />
        )}
      </div>
    </section>
  );
}

function TransferImportPreview({
  pending,
  busy,
  onConfirm,
  onCancel,
  onFilenameChange,
  onMergeModeChange,
  onDisplayNameChange,
}: {
  pending: PendingImport;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onFilenameChange?: (filename: string) => void;
  onMergeModeChange?: (mode: GuildHubScanMergeMode) => void;
  onDisplayNameChange?: (displayName: string) => void;
}) {
  const title = getImportPreviewTitle(pending);
  const rows = buildImportPreviewRows(pending);
  const confirmLabel = pending.kind === "scanMerge" ? hubText("dataHubI18n.merge") : pending.kind === "scanJson" ? hubText("dataHubI18n.import") : hubText("dataHubI18n.confirmImport");
  const selectedContainsSlot = pending.kind === "scanMerge" && pending.summaries.some((summary) => summary.isScanSlot);

  return (
    <section className={styles.previewBox} aria-label={hubText("dataHubI18n.importPreview")}>
      <div className={styles.previewHeader}>
        <div>
          <h3>{title}</h3>
          <p>{pending.filename}</p>
        </div>
        <span>{pending.kind === "scanMerge" || pending.kind === "scanJson" ? ".json" : ".sfdata"}</span>
      </div>
      <dl className={styles.previewGrid}>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {pending.kind === "scanMerge" ? (
        <>
          <fieldset className={styles.mergeModeField}>
            <legend>{hubText("dataHubI18n.mergeType")}</legend>
            <label className={styles.mergeModeOption}>
              <input
                type="radio"
                name={`scan-merge-mode-${pending.id}`}
                value="merged-file"
                checked={pending.mode === "merged-file"}
                onChange={() => onMergeModeChange?.("merged-file")}
              />
              <span>
                <strong>{hubText("dataHubI18n.mergedFile")}</strong>
                <small>{hubText("dataHubI18n.createsAnAdditionalJsonFileTheSelectedScansAreKeptIndividually")}</small>
              </span>
            </label>
            <label className={styles.mergeModeOption}>
              <input
                type="radio"
                name={`scan-merge-mode-${pending.id}`}
                value="scan-slot"
                checked={pending.mode === "scan-slot"}
                disabled={selectedContainsSlot}
                onChange={() => onMergeModeChange?.("scan-slot")}
              />
              <span>
                <strong>{hubText("dataHubI18n.newScanSlot")}</strong>
                <small>{hubText("dataHubI18n.groupsTheSelectedScansUnderASharedName")}</small>
              </span>
            </label>
          </fieldset>
          {pending.mode === "scan-slot" ? (
            <label className={styles.filenameField}>
              <span>{hubText("dataHubI18n.scanSlotName")}</span>
              <input value={pending.displayName} onChange={(event) => onDisplayNameChange?.(event.target.value)} />
            </label>
          ) : (
            <label className={styles.filenameField}>
              <span>{hubText("dataHubI18n.filename")}</span>
              <input value={pending.filename} onChange={(event) => onFilenameChange?.(event.target.value)} />
            </label>
          )}
        </>
      ) : null}
      <div className={styles.previewActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>
          <X size={15} aria-hidden />
          <span>{hubText("dataHubI18n.cancel")}</span>
        </button>
        <button type="button" className={styles.primaryButton} onClick={onConfirm} disabled={busy}>
          <Check size={15} aria-hidden />
          <span>{busy ? "Verarbeitet..." : confirmLabel}</span>
        </button>
      </div>
    </section>
  );
}

function getImportPreviewTitle(pending: PendingImport) {
  if (pending.kind === "scanJson") return hubText("dataHubI18n.importSftoolsScan");
  if (pending.kind === "scanMerge") return hubText("dataHubI18n.mergeScans");
  if (pending.envelope.type === "scan") return hubText("dataHubI18n.importSftoolsScan");
  if (pending.envelope.type === "scanpack") return hubText("dataHubI18n.importScanPack");
  if (pending.envelope.type === "fighttrackerpack") return hubText("dataHubI18n.importFightTrackerPack");
  return hubText("dataHubI18n.importFightTracker");
}

function buildImportPreviewRows(pending: PendingImport): Array<{ label: string; value: string }> {
 const __w32Run4=auditBegin("F36","buildImportPreviewRows");
 const __w32Sync=auditEnter(__w32Run4,"buildImportPreviewRows","sync-elapsed");
 try {
  if (pending.kind === "scanJson") {
    return auditReturn(__w32Run4,buildScanPreviewRows(pending.scan, pending.statistics));
  }
  if (pending.kind === "scanMerge") {
    return auditReturn(__w32Run4,buildMergePreviewRows(pending));
  }

  const { envelope } = pending;
  if (envelope.type === "scan") {
    return auditReturn(__w32Run4,buildScanPreviewRows(envelope.payload));
  }

  if (envelope.type === "scanpack") {
    const scans = envelope.payload.scans;
    const servers = new Set(scans.flatMap((scan) => scan.servers));
    const scanTimes = scans
      .map((scan) => (scan.scannedAt ? Date.parse(scan.scannedAt) : NaN))
      .filter((value) => Number.isFinite(value));
    const period =
      scanTimes.length > 0
        ? `${formatOptionalDate(new Date(Math.min(...scanTimes)).toISOString())} - ${formatOptionalDate(
            new Date(Math.max(...scanTimes)).toISOString(),
          )}`
        : hubText("dataHubI18n.unknown");

    return auditReturn(__w32Run4,[
      { label: hubText("dataHubI18n.scans"), value: scans.length.toLocaleString(hubLocale()) },
      { label: hubText("dataHubI18n.server"), value: servers.size ? [...servers].join(", ") : hubText("dataHubI18n.unknown") },
      { label: hubText("dataHubI18n.period"), value: period },
    ]);
  }

  if (envelope.type === "fighttrackerpack") {
    const trackers = envelope.payload.trackers;
    const totalMembers = trackers.reduce((sum, tracker) => sum + tracker.members.length, 0);
    const totalFights = trackers.reduce((sum, tracker) => sum + tracker.fights.length, 0);
    return auditReturn(__w32Run4,[
      { label: hubText("dataHubI18n.tracker"), value: trackers.length.toLocaleString(hubLocale()) },
      { label: hubText("dataHubI18n.totalMembers"), value: totalMembers.toLocaleString(hubLocale()) },
      { label: hubText("dataHubI18n.totalFights"), value: totalFights.toLocaleString(hubLocale()) },
      { label: hubText("dataHubI18n.names"), value: formatCompactNames(trackers.map((tracker) => tracker.tracker.name)) },
      { label: hubText("dataHubI18n.exportTime"), value: formatOptionalDate(envelope.createdAt) },
    ]);
  }

  return auditReturn(__w32Run4,[
    { label: hubText("dataHubI18n.trackerGuild"), value: envelope.payload.tracker.name },
    { label: hubText("dataHubI18n.server"), value: envelope.payload.tracker.server || hubText("dataHubI18n.unknown") },
    { label: hubText("dataHubI18n.member"), value: envelope.payload.members.length.toLocaleString(hubLocale()) },
    { label: hubText("dataHubI18n.fights"), value: envelope.payload.fights.length.toLocaleString(hubLocale()) },
    { label: hubText("dataHubI18n.exportTime"), value: formatOptionalDate(envelope.createdAt) },
  ]);

} catch (__w32Error) { auditError(__w32Run4,__w32Error); throw __w32Error; } finally {auditValue(__w32Run4,__w32Sync,undefined);auditLeave(__w32Run4);}
}

function buildMergePreviewRows(pending: PendingScanMergeImport): Array<{ label: string; value: string }> {
 const __w32Run5=auditBegin("F36","buildMergePreviewRows");
 const __w32Sync=auditEnter(__w32Run5,"buildMergePreviewRows","sync-elapsed");
 try {
  const snapshotTimes = pending.summaries.flatMap((summary) => summary.snapshotTimestamps).filter((value) => Number.isFinite(value));
  const servers = new Set(pending.summaries.flatMap((scan) => scan.servers));
  const period =
    snapshotTimes.length > 0
      ? `${formatOptionalDate(new Date(Math.min(...snapshotTimes)).toISOString())} - ${formatOptionalDate(
          new Date(Math.max(...snapshotTimes)).toISOString(),
        )}`
      : hubText("dataHubI18n.unknown");
  const logicalScanCount = pending.summaries.reduce((sum, summary) => sum + summary.logicalScanCount, 0);
  const playerCount = pending.summaries.reduce((sum, summary) => sum + summary.playerCount, 0);
  const guildCount = pending.summaries.reduce((sum, summary) => sum + summary.guildCount, 0);

  return auditReturn(__w32Run5,[
    { label: hubText("dataHubI18n.mode"), value: pending.mode === "scan-slot" ? hubText("dataHubI18n.newScanSlot") : hubText("dataHubI18n.mergedFile") },
    ...(pending.mode === "scan-slot" ? [{ label: hubText("dataHubI18n.name"), value: pending.displayName || hubText("dataHubI18n.unnamed") }] : []),
    { label: hubText("dataHubI18n.files"), value: hubText("dataHubI18n.selectedCount", { v1: pending.summaries.length }) },
    { label: hubText("dataHubI18n.period"), value: period },
    { label: hubText("dataHubI18n.server"), value: servers.size ? [...servers].join(", ") : hubText("dataHubI18n.unknown") },
    { label: hubText("dataHubI18n.includedScans"), value: hubText("dataHubI18n.scanCountLabel", { v1: logicalScanCount }) },
    { label: hubText("dataHubI18n.players"), value: playerCount.toLocaleString(hubLocale()) },
    { label: hubText("dataHubI18n.guilds"), value: guildCount.toLocaleString(hubLocale()) },
    { label: hubText("dataHubI18n.sources"), value: formatCompactNames(pending.summaries.map((scan) => scan.filename), 6) },
  ]);

} catch (__w32Error) { auditError(__w32Run5,__w32Error); throw __w32Error; } finally {auditValue(__w32Run5,__w32Sync,undefined);auditLeave(__w32Run5);}
}

function buildScanPreviewRows(scan: SfDataHubLocalScan, statistics?: GuildHubScanPreviewStatistics): Array<{ label: string; value: string }> {
 const __w32Run6=auditBegin("F36","buildScanPreviewRows");
 const __w32Sync=auditEnter(__w32Run6,"buildScanPreviewRows","sync-elapsed");
 try {
  const snapshots = statistics?.snapshots ?? deriveGuildHubLogicalScanSnapshots(scan);
  if (snapshots.length > 1) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const playerCount = snapshots.reduce((sum, snapshot) => sum + snapshot.playerCount, 0);
    const guildCount = snapshots.reduce((sum, snapshot) => sum + snapshot.guildCount, 0);
    return auditReturn(__w32Run6,[
      { label: hubText("dataHubI18n.file"), value: scan.filename || hubText("dataHubI18n.unknown") },
      { label: hubText("dataHubI18n.detectedScans"), value: hubText("dataHubI18n.scanCountLabel", { v1: snapshots.length }) },
      { label: hubText("dataHubI18n.dateRange"), value: `${formatOptionalDate(first.timestamp)} - ${formatOptionalDate(last.timestamp)}` },
      { label: hubText("dataHubI18n.server"), value: formatServerList(scan) },
      { label: hubText("dataHubI18n.players"), value: playerCount.toLocaleString(hubLocale()) },
      { label: hubText("dataHubI18n.guilds"), value: guildCount.toLocaleString(hubLocale()) },
    ]);
  }

  return auditReturn(__w32Run6,[
    { label: hubText("dataHubI18n.file"), value: scan.filename || hubText("dataHubI18n.unknown") },
    { label: hubText("dataHubI18n.scanTime"), value: formatOptionalDate(scan.scannedAt) },
    { label: hubText("dataHubI18n.server"), value: formatServerList(scan) },
    { label: hubText("dataHubI18n.players"), value: scan.playerCount.toLocaleString(hubLocale()) },
    { label: hubText("dataHubI18n.guilds"), value: getScanGuildCount(scan).toLocaleString(hubLocale()) },
  ]);

} catch (__w32Error) { auditError(__w32Run6,__w32Error); throw __w32Error; } finally {auditValue(__w32Run6,__w32Sync,undefined);auditLeave(__w32Run6);}
}

function FeedbackBox({ feedback }: { feedback: ImportFeedback }) {
  return (
    <div className={styles.feedbackBox}>
      {feedback.imported.length ? <p>{hubText("dataHubI18n.imported1cf90")} {feedback.imported.join(", ")}</p> : null}
      {feedback.updated.length ? <p>{hubText("dataHubI18n.updated29d00")} {feedback.updated.join(", ")}</p> : null}
      {feedback.deleted ? <p>{hubText("dataHubI18n.deleted")} {formatCount(feedback.deleted)}</p> : null}
      {feedback.duplicates.length ? <p>{hubText("dataHubI18n.alreadyPresent")} {feedback.duplicates.join(", ")}</p> : null}
      {feedback.errors.map((entry) => (
        <p className={styles.feedbackError} key={`${entry.filename}:${entry.message}`}>
          {entry.filename === "Archivgruppe" ? hubText("dataHubI18n.archiveGroup") : entry.filename}: {hubMessage(entry.message)}
        </p>
      ))}
    </div>
  );
}
