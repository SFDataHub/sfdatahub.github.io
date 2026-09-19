import React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
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

import { useBackClose } from "../../hooks/useBackClose";
import {
  createSfDataHubLocalScanImportPreview,
  deleteSfDataHubLocalScans,
  deriveGuildHubLogicalScanSnapshots,
  getSfDataHubLocalScan,
  importSfDataHubLocalScanRecords,
  listSfDataHubScanSummaries,
  renameSfDataHubScanSlot,
  subscribeToSfDataHubLocalScanChanges,
  updateSfDataHubLocalScan,
  type GuildHubScanMergeMode,
  type GuildHubScanSummary,
  type SfDataHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
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
import { getDataJobDetail, getDataJobProgress, useDataJobs, type DataJob } from "../../context/DataJobsContext";
import styles from "./ScanManagementOverlay.module.css";
import {
  buildScanExplorerData,
  formatCoverageStatus,
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

type DataManagementTab = "scans" | "fightTracker";

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
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unbekannt";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatScanDateShort(value: string | null | undefined) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unbekannt";

  return new Intl.DateTimeFormat("de-DE", {
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
    label: `${summary.logicalScanCount} Scans / ${formatScanDateShort(
      isoFromSummaryTimestamp(summary.firstSnapshotTimestamp),
    )} - ${formatScanDateShort(isoFromSummaryTimestamp(summary.lastSnapshotTimestamp))}`,
    title: summary.snapshotTimestamps.map((timestamp) => formatScanDate(new Date(timestamp).toISOString())).join("\n"),
  };
}

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unbekannt";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatServerList(scan: Pick<SfDataHubLocalScan, "servers"> | Pick<GuildHubScanSummary, "servers">) {
  return scan.servers.length ? scan.servers.join(", ") : "Unbekannt";
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
  return `${count} ausgewählt`;
}

function formatCompactNames(names: string[], limit = 5) {
  const visible = names.slice(0, limit).join(", ");
  const remaining = names.length - limit;
  return remaining > 0 ? `${visible} +${remaining} weitere` : visible || "Unbekannt";
}

function normalizeMergeFilenameInput(filename: string) {
  const trimmed = filename.trim();
  if (!trimmed) throw new Error("Dateiname darf nicht leer sein.");
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(trimmed)) {
    throw new Error("Dateiname enthält ungültige Zeichen.");
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
    return `${server} - Historie`;
  }
  return "Neuer Scan-Slot";
}

function normalizeScanSlotNameInput(displayName: string) {
  const normalized = displayName.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error("Scan-Slot-Name darf nicht leer sein.");
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
  return `${sourceCount.toLocaleString("de-DE")} Quelldateien · ${scan.logicalScanCount.toLocaleString("de-DE")} Scans`;
}

function formatCount(value: number) {
  return value.toLocaleString("de-DE");
}

function getScanSourceTypeLabel(scan: Pick<GuildHubScanSummary, "isScanSlot" | "isMergedBundle">) {
  if (scan.isScanSlot) return "Slot";
  if (scan.isMergedBundle) return "Bundle";
  return "Scan";
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
    { label: "Name", value: getScanDisplayName(summary) },
    { label: "Datei", value: summary.filename },
    { label: "Typ", value: getScanSourceTypeLabel(summary) },
    { label: "Logical Scans", value: formatCount(data?.snapshots.length ?? summary.logicalScanCount) },
    { label: "Erster Timestamp", value: formatScanDate(isoFromSummaryTimestamp(firstTimestamp)) },
    { label: "Letzter Timestamp", value: formatScanDate(isoFromSummaryTimestamp(lastTimestamp)) },
    { label: "Server", value: servers.length ? servers.join(", ") : "Unbekannt" },
    { label: "Player", value: formatCount(data?.players.length ?? summary.playerCount) },
    { label: "Guilds", value: formatCount(data?.guilds.length ?? summary.guildCount) },
  ];
}

export default function ScanManagementOverlay({ isOpen, onClose }: ScanManagementOverlayProps) {
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateTargetIdRef = React.useRef<string | null>(null);
  const [scans, setScans] = React.useState<GuildHubScanSummary[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<ImportFeedback | null>(null);
  const [storageError, setStorageError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<DataManagementTab>("scans");
  const [trackerSummaries, setTrackerSummaries] = React.useState<FightTrackerSummary[]>([]);
  const [selectedTrackerIds, setSelectedTrackerIds] = React.useState<Set<string>>(() => new Set());
  const [trackersLoading, setTrackersLoading] = React.useState(false);
  const [trackersError, setTrackersError] = React.useState<string | null>(null);
  const [pendingImport, setPendingImport] = React.useState<PendingImport | null>(null);
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

  useBackClose(isOpen, onClose);

  const closeScanDetails = React.useCallback(() => {
    detailsRequestIdRef.current += 1;
    setDetailsSummary(null);
    setDetailsData(null);
    setDetailsLoading(false);
    setDetailsError(null);
  }, []);

  React.useEffect(() => {
    if (isOpen) setActiveTab("scans");
    else {
      setPendingImport(null);
      closeScanDetails();
    }
  }, [closeScanDetails, isOpen]);

  const loadScans = React.useCallback(async () => {
    setStorageError(null);
    setLoading(true);
    try {
      const rows = await listSfDataHubScanSummaries();
      setScans(rows);
      const visibleIds = new Set(rows.filter((scan) => !scan.containedInScanSlotId).map((scan) => scan.sourceScanId));
      setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
    } catch (error) {
      console.error("[ScanManagement] failed to load scans", error);
      setStorageError("Lokale Scans konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
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
      setTrackersError("Fight Tracker konnten nicht geladen werden.");
    } finally {
      setTrackersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    void loadScans();
    return subscribeToSfDataHubLocalScanChanges(() => {
      void loadScans();
    });
  }, [isOpen, loadScans]);

  React.useEffect(() => {
    if (!isOpen || activeTab !== "fightTracker") return;
    void loadFightTrackers();
  }, [activeTab, isOpen, loadFightTrackers]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailsSummary) {
        closeScanDetails();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeScanDetails, detailsSummary, isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const visibleScans = React.useMemo(() => scans.filter((scan) => !scan.containedInScanSlotId), [scans]);

  const handleImportFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setStorageError(null);
    setPendingImport(null);

    const nextFeedback = createEmptyFeedback();
    let nextPendingImport: PendingImport | null = null;

    for (const file of files) {
      try {
        if (getFileExtension(file.name) === ".sfdata") {
          const content = await file.text();
          if (nextPendingImport) {
            nextFeedback.errors.push({
              filename: file.name,
              message: "Bitte Transferdateien einzeln importieren.",
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

        const content = await file.text();
        if (nextPendingImport) {
          nextFeedback.errors.push({
            filename: file.name,
            message: "Bitte Importdateien einzeln bestätigen.",
          });
          continue;
        }

        nextPendingImport = {
          kind: "scanJson",
          id: createImportPreviewId(),
          filename: file.name,
          file,
          scan: await createSfDataHubLocalScanImportPreview(file.name, content),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Datei konnte nicht importiert werden.";
        nextFeedback.errors.push({ filename: file.name, message });
      }
    }

    setFeedback(nextFeedback);
    setPendingImport(nextPendingImport);
    if (nextPendingImport?.kind === "transfer") {
      setActiveTab(getDataManagementTabForTransferType(nextPendingImport.envelope.type));
    } else if (nextPendingImport?.kind === "scanJson") {
      setActiveTab("scans");
    }
    await loadScans();
    setBusy(false);
  };

  const handleImportInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await handleImportFiles(files);
  };

  const handleUpdateInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    const scanId = updateTargetIdRef.current;
    updateTargetIdRef.current = null;
    if (!file || !scanId) return;

    setBusy(true);
    setStorageError(null);
    const nextFeedback = createEmptyFeedback();
    try {
      const content = await file.text();
      await updateSfDataHubLocalScan(scanId, file.name, content);
      nextFeedback.updated.push(file.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan konnte nicht aktualisiert werden.";
      nextFeedback.errors.push({ filename: file.name, message });
    }
    setFeedback(nextFeedback);
    await loadScans();
    setBusy(false);
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
      if (visibleScans.length > 0 && visibleScans.every((scan) => current.has(scan.sourceScanId))) return new Set();
      return new Set(visibleScans.map((scan) => scan.sourceScanId));
    });
  };

  const deleteScans = async (ids: string[]) => {
    if (!ids.length) return;
    const selectedScans = visibleScans.filter((scan) => ids.includes(scan.sourceScanId));
    const slotCount = selectedScans.filter((scan) => scan.isScanSlot).length;
    if (
      slotCount > 0 &&
      !window.confirm(
        slotCount === 1
          ? "Scan-Slot auflösen? Die enthaltenen Originalscans werden wieder sichtbar und aktiv."
          : "Scan-Slots auflösen? Die enthaltenen Originalscans werden wieder sichtbar und aktiv.",
      )
    ) {
      return;
    }
    setBusy(true);
    setStorageError(null);
    try {
      await deleteSfDataHubLocalScans(ids);
      setFeedback(mergeFeedback(EMPTY_FEEDBACK, { deleted: ids.length }));
      setSelectedIds(new Set());
      await loadScans();
    } catch (error) {
      console.error("[ScanManagement] failed to delete scans", error);
      setStorageError("Scans konnten nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
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
      try {
        const scan = await getSfDataHubLocalScan(summary.sourceScanId);
        if (!scan) throw new Error("Scan wurde nicht gefunden.");
        const data = buildScanDetailsData(scan);
        if (detailsRequestIdRef.current === requestId) setDetailsData(data);
      } catch (error) {
        console.error("[ScanManagement] failed to load scan details", error);
        if (detailsRequestIdRef.current === requestId) {
          setDetailsError("Scan-Details konnten nicht geladen werden.");
        }
      } finally {
        if (detailsRequestIdRef.current === requestId) setDetailsLoading(false);
      }
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
    const selectedScans = visibleScans.filter((scan) => selectedIds.has(scan.sourceScanId));
    if (!selectedScans.length) return;
    setBusy(true);
    setStorageError(null);
    try {
      const rawScans = (await Promise.all(selectedScans.map((scan) => getSfDataHubLocalScan(scan.sourceScanId)))).filter(
        (scan): scan is SfDataHubLocalScan => Boolean(scan),
      );
      if (rawScans.length !== selectedScans.length) {
        setStorageError("Mindestens ein ausgewählter Scan wurde nicht gefunden.");
        return;
      }

      if (rawScans.length === 1) {
        if (rawScans[0].isMergedBundle) {
          downloadJsonFile(getScanExportFilename(selectedScans[0]), rawScans[0].rawData);
          return;
        }
        const envelope = createSfDataHubTransferEnvelope("scan", rawScans[0]);
        downloadSfDataFile(
          createSfDataFileName("scan", null, dateFromOptionalTimestamp(rawScans[0].scannedAt ?? rawScans[0].importedAt)),
          envelope,
        );
        return;
      }

      const envelope = createSfDataHubTransferEnvelope("scanpack", { scans: rawScans });
      downloadSfDataFile(createSfDataFileName("scanpack"), envelope);
    } catch (error) {
      console.error("[ScanManagement] failed to export scans", error);
      setStorageError("Scans konnten nicht exportiert werden.");
    } finally {
      setBusy(false);
    }
  };

  const startMergePreview = () => {
    const selectedScans = visibleScans.filter((scan) => selectedIds.has(scan.sourceScanId));
    if (selectedScans.length < 2) return;
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
  };

  const exportSelectedFightTrackers = async () => {
    const selectedSummaries = trackerSummaries.filter((summary) => selectedTrackerIds.has(summary.tracker.id));
    if (!selectedSummaries.length) return;
    setBusy(true);
    setTrackersError(null);
    try {
      const states = await Promise.all(selectedSummaries.map((summary) => readFightTrackerTransferState(summary.tracker.id)));
      if (states.some((state) => !state)) {
        setTrackersError("Fight Tracker wurde nicht gefunden.");
        return;
      }
      const transferStates = states.filter((state): state is NonNullable<typeof state> => Boolean(state));
      if (transferStates.length === 1) {
        const envelope = createSfDataHubTransferEnvelope("fighttracker", transferStates[0]);
        downloadSfDataFile(createSfDataFileName("fighttracker", transferStates[0].tracker.name), envelope);
        return;
      }
      const envelope = createSfDataHubTransferEnvelope("fighttrackerpack", { trackers: transferStates });
      downloadSfDataFile(createSfDataFileName("fighttrackerpack"), envelope);
    } catch (error) {
      console.error("[DataManagement] failed to export fight tracker", error);
      setTrackersError("Fight Tracker konnte nicht exportiert werden.");
    } finally {
      setBusy(false);
    }
  };

  const confirmTransferImport = async () => {
    if (!pendingImport) return;
    setBusy(true);
    setStorageError(null);
    setTrackersError(null);

    const nextFeedback = createEmptyFeedback();
    const { filename } = pendingImport;
    try {
      if (pendingImport.kind === "scanJson") {
        await startSfToolsImportJob(pendingImport.file);
        setActiveTab("scans");
        setPendingImport(null);
        return;
      }

      if (pendingImport.kind === "scanMerge") {
        if (pendingImport.mode === "scan-slot") {
          const displayName = normalizeScanSlotNameInput(pendingImport.displayName);
          const filename = createScanSlotTechnicalFilename(displayName, scans);
          await startScanMergeJob({ sourceScanIds: pendingImport.sourceIds, filename, mode: "scan-slot", displayName });
        } else {
          const filename = normalizeMergeFilenameInput(pendingImport.filename);
          await startScanMergeJob({ sourceScanIds: pendingImport.sourceIds, filename, mode: "merged-file" });
        }
        setSelectedIds(new Set());
        setActiveTab("scans");
        setPendingImport(null);
        return;
      }

      const { envelope } = pendingImport;
      if (envelope.type === "scan") {
        const result = await importSfDataHubLocalScanRecords([envelope.payload]);
        nextFeedback.imported.push(...result.imported.map((scan) => scan.filename));
        nextFeedback.duplicates.push(...result.duplicates.map((scan) => scan.filename));
        setActiveTab("scans");
        await loadScans();
      } else if (envelope.type === "scanpack") {
        const result = await importSfDataHubLocalScanRecords(envelope.payload.scans);
        nextFeedback.imported.push(...result.imported.map((scan) => scan.filename));
        nextFeedback.duplicates.push(...result.duplicates.map((scan) => scan.filename));
        setActiveTab("scans");
        await loadScans();
      } else if (envelope.type === "fighttracker") {
        const [state] = await importFightTrackerTransferStates([envelope.payload]);
        nextFeedback.imported.push(`Fight Tracker: ${state.tracker?.name ?? filename}`);
        setActiveTab("fightTracker");
        await loadFightTrackers();
      } else {
        const states = await importFightTrackerTransferStates(envelope.payload.trackers);
        nextFeedback.imported.push(...states.map((state) => `Fight Tracker: ${state.tracker?.name ?? filename}`));
        setActiveTab("fightTracker");
        await loadFightTrackers();
      }
      setPendingImport(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transferdatei konnte nicht importiert werden.";
      nextFeedback.errors.push({ filename, message });
    } finally {
      setFeedback(nextFeedback);
      setBusy(false);
    }
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
    if (!renamingSlot) return;
    setBusy(true);
    setStorageError(null);
    const nextFeedback = createEmptyFeedback();
    try {
      const displayName = normalizeScanSlotNameInput(renameSlotValue);
      await renameSfDataHubScanSlot(renamingSlot.sourceScanId, displayName);
      nextFeedback.updated.push(displayName);
      setRenamingSlot(null);
      await loadScans();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan-Slot konnte nicht umbenannt werden.";
      nextFeedback.errors.push({ filename: getScanDisplayName(renamingSlot), message });
    } finally {
      setFeedback(nextFeedback);
      setBusy(false);
    }
  };

  const selectedVisibleCount = visibleScans.filter((scan) => selectedIds.has(scan.sourceScanId)).length;
  const allVisibleSelected = visibleScans.length > 0 && visibleScans.every((scan) => selectedIds.has(scan.sourceScanId));
  const allTrackersSelected = trackerSummaries.length > 0 && trackerSummaries.every((summary) => selectedTrackerIds.has(summary.tracker.id));
  const selectedTrackerCount = trackerSummaries.filter((summary) => selectedTrackerIds.has(summary.tracker.id)).length;
  const activeDataJob = runningSfToolsImportJob ?? runningScanMergeJob;
  const importDisabled = busy || !dataJobsReady || Boolean(activeDataJob);
  const canMergeSelectedScans = selectedVisibleCount >= 2 && !importDisabled;

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-management-title"
        onClick={(event) => {
          if (event.currentTarget === event.target) onClose();
        }}
      >
        <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id="data-management-title" className={styles.title}>
              Datenverwaltung
            </h2>
            <p className={styles.subtitle}>Lokale Daten des SF Data Hub verwalten</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Datenverwaltung schließen">
            <X size={18} aria-hidden />
            <span>Schließen</span>
          </button>
        </header>

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
            <div className={styles.inlineDialog} role="dialog" aria-modal="true" aria-label="Scan-Slot umbenennen">
              <div className={styles.inlineDialogPanel}>
                <div className={styles.inlineDialogHeader}>
                  <h3>Scan-Slot umbenennen</h3>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setRenamingSlot(null)}
                    disabled={busy}
                    aria-label="Dialog schließen"
                    title="Schließen"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
                <label className={styles.filenameField}>
                  <span>Name</span>
                  <input value={renameSlotValue} onChange={(event) => setRenameSlotValue(event.target.value)} autoFocus />
                </label>
                <p className={styles.dialogHint}>Die technische JSON-Datei bleibt {renamingSlot.filename}.</p>
                <div className={styles.previewActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setRenamingSlot(null)} disabled={busy}>
                    <X size={15} aria-hidden />
                    <span>Abbrechen</span>
                  </button>
                  <button type="button" className={styles.primaryButton} onClick={() => void confirmRenameSlot()} disabled={busy}>
                    <Check size={15} aria-hidden />
                    <span>{busy ? "Speichert..." : "Speichern"}</span>
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
              <span>{activeDataJob ? "Job läuft..." : busy ? "Verarbeite..." : "Importieren"}</span>
            </button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Datentypen">
            <button
              id="data-management-scans-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "scans"}
              aria-controls="data-management-scans-panel"
              className={`${styles.tabButton} ${activeTab === "scans" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("scans")}
            >
              <Database size={15} aria-hidden />
              <span>SFtools-Scans</span>
            </button>
            <button
              id="data-management-fight-trackers-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === "fightTracker"}
              aria-controls="data-management-fight-trackers-panel"
              className={`${styles.tabButton} ${activeTab === "fightTracker" ? styles.tabButtonActive : ""}`}
              onClick={() => setActiveTab("fightTracker")}
            >
              <Swords size={15} aria-hidden />
              <span>Fight Tracker</span>
            </button>
          </div>

          <div className={styles.contentScroll}>
            {storageError ? <div className={styles.errorBox}>{storageError}</div> : null}
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
              <div id="data-management-scans-panel" role="tabpanel" aria-labelledby="data-management-scans-tab">
                <div className={styles.toolbar}>
                  {selectedVisibleCount > 0 ? (
                    <button type="button" className={styles.primaryButton} onClick={() => void exportSelectedScans()} disabled={busy}>
                      <Download size={16} aria-hidden />
                      <span>{selectedVisibleCount === 1 ? "Scan exportieren" : "Scanpack exportieren"}</span>
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
                      <span>Zusammenführen</span>
                    </button>
                  ) : null}
                  {selectedVisibleCount > 0 ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void deleteScans(visibleScans.filter((scan) => selectedIds.has(scan.sourceScanId)).map((scan) => scan.sourceScanId))}
                      disabled={busy}
                    >
                      <Trash2 size={15} aria-hidden />
                      <span>Ausgewählte löschen</span>
                    </button>
                  ) : null}
                </div>

                <section className={styles.scanSection} aria-label="Vorhandene Scans">
                  <div className={styles.sectionHeader}>
                    <h3>Vorhandene Scans</h3>
                    <span>{loading ? "Lädt..." : `${visibleScans.length} gespeichert`}</span>
                  </div>

                  {loading ? (
                    <div className={styles.emptyState}>Lokale Scans werden geladen.</div>
                  ) : visibleScans.length ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.checkCell}>
                              <input
                                type="checkbox"
                                aria-label="Alle sichtbaren Scans auswählen"
                                checked={allVisibleSelected}
                                onChange={toggleAllVisible}
                              />
                            </th>
                            <th>Scanzeit</th>
                            <th>Server</th>
                            <th className={styles.numericCell}>Spieler</th>
                            <th className={styles.numericCell}>Gilden</th>
                            <th>Datei</th>
                            <th className={styles.actionCell}>Aktion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleScans.map((scan) => {
                            const scanTimeCell = formatScanSnapshotCell(scan);
                            const displayName = getScanDisplayName(scan);
                            const slotInfo = getScanSlotSourceInfo(scan);
                            return (
                              <tr key={scan.sourceScanId}>
                                <td className={styles.checkCell}>
                                  <input
                                    type="checkbox"
                                    aria-label={`${displayName} auswählen`}
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
                                <td className={styles.numericCell}>{scan.playerCount}</td>
                                <td className={styles.numericCell}>{getScanGuildCount(scan)}</td>
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
                                    <span className={`${styles.bundleBadge} ${styles.slotBadge}`}>Slot</span>
                                  ) : scan.isMergedBundle ? (
                                    <span className={styles.bundleBadge}>Bundle</span>
                                  ) : null}
                                </td>
                                <td className={styles.actionCell}>
                                  <div className={styles.rowActions}>
                                    <button
                                      type="button"
                                      className={`${styles.iconButton} ${styles.detailsButton}`}
                                      onClick={() => openScanDetails(scan)}
                                      disabled={busy}
                                      aria-label={`${displayName} Details anzeigen`}
                                      title="Scan-Details anzeigen"
                                    >
                                      <Eye size={15} aria-hidden />
                                      <span>Details</span>
                                    </button>
                                    {scan.isScanSlot ? (
                                      <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => startRenameSlot(scan)}
                                        disabled={busy}
                                        aria-label={`${displayName} umbenennen`}
                                        title="Scan-Slot umbenennen"
                                      >
                                        <Pencil size={15} aria-hidden />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => startUpdate(scan.sourceScanId)}
                                        disabled={busy}
                                        aria-label={`${displayName} aktualisieren`}
                                        title="Scan aktualisieren"
                                      >
                                        <RefreshCw size={15} aria-hidden />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                      onClick={() => void deleteScans([scan.sourceScanId])}
                                      disabled={busy}
                                      aria-label={`${displayName} löschen`}
                                      title={scan.isScanSlot ? "Scan-Slot auflösen" : "Scan löschen"}
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
                    <div className={styles.emptyState}>Noch keine Scans importiert.</div>
                  )}
                </section>
              </div>
            ) : (
              <FightTrackerOverview
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
        </div>
      </div>
      {detailsSummary ? (
        <ScanDetailsOverlay
          summary={detailsSummary}
          data={detailsData}
          loading={detailsLoading}
          error={detailsError}
          onClose={closeScanDetails}
        />
      ) : null}
    </>,
    document.body,
  );
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
              Scan Details
            </h2>
            <p className={styles.subtitle}>{displayName}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Scan-Details schließen">
            <X size={18} aria-hidden />
            <span>Schließen</span>
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
              <span>Scan-Details werden geladen.</span>
            </div>
          ) : error ? (
            <div className={styles.errorBox}>{error}</div>
          ) : data ? (
            <>
              <dl className={styles.detailsKpiGrid}>
                <ScanDetailsKpi label="Player" value={data.players.length} />
                <ScanDetailsKpi label="Guilds" value={data.guilds.length} />
                <ScanDetailsKpi label="Vertretene Gilden" value={coverage.uniqueGuildCount} />
                <ScanDetailsKpi label="Vollständig gescannte Gilden" value={coverage.completeUniqueGuildCount} />
                <ScanDetailsKpi label="Guild-Snapshots" value={coverage.guildSnapshotCount} />
                <ScanDetailsKpi label="Vollständige Guild-Snapshots" value={coverage.completeGuildSnapshotCount} />
                <ScanDetailsKpi label="Server" value={coverage.byServer.length} />
                {coverage.incompleteGuildSnapshotCount ? (
                  <ScanDetailsKpi label="Incomplete" value={coverage.incompleteGuildSnapshotCount} />
                ) : null}
                {coverage.overcountGuildSnapshotCount ? (
                  <ScanDetailsKpi label="Overcount" value={coverage.overcountGuildSnapshotCount} />
                ) : null}
                {coverage.unknownGuildSnapshotCount ? (
                  <ScanDetailsKpi label="Unknown" value={coverage.unknownGuildSnapshotCount} />
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
                <div className={styles.emptyState}>Der ausgewählte Eintrag ist in diesem Scan nicht mehr verfügbar.</div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const PLAYER_CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Mage",
  3: "Scout",
  4: "Assassin",
  5: "Battle Mage",
  6: "Berserker",
  7: "Demon Hunter",
  8: "Druid",
  9: "Bard",
  10: "Necromancer",
  11: "Paladin",
  12: "Demon Warrior",
};

const ATTRIBUTE_LABELS = [
  ["strength", "Strength"],
  ["dexterity", "Dexterity"],
  ["intelligence", "Intelligence"],
  ["constitution", "Constitution"],
  ["luck", "Luck"],
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
  return formatOptionalValue(value) ?? "Unavailable";
}

function formatPercentValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(value * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`;
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
  return value == null ? null : PLAYER_CLASS_NAMES[value] ?? `Class ${value}`;
}

function formatGuildRole(value: NormalizedGuildMember["role"]["name"]) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}

function formatSourceStatus(normalized: NormalizedPlayer, path: string, value: unknown) {
  const formatted = formatOptionalValue(value);
  if (formatted != null) return formatted;
  const status = normalized.metadata.fields[path]?.status;
  return status === "invalid" ? "Unavailable" : null;
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
  return formatScanExplorerCompactEntryValue(value, { formatNumber: formatCount, formatLabel: formatCamelLabel });
}

function formatCamelLabel(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
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
          placeholder="Search players or guilds..."
        />
      </label>

      {hasResults ? (
        <div className={styles.entityGroups}>
          <section className={styles.detailsSection} aria-label="Players">
            <h3>Players ({formatCount(result.playerTotal)})</h3>
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
                          player.level == null ? null : `Level ${formatCount(player.level)}`,
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
              <div className={styles.emptyState}>Keine Player gefunden.</div>
            )}
          </section>

          <section className={styles.detailsSection} aria-label="Guilds">
            <h3>Guilds ({formatCount(result.guildTotal)})</h3>
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
                          : `${formatCount(guild.group.rows[0].declaredMemberCount)} Members`,
                      ]
                        .filter(Boolean)
                        .join(" - ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>Keine Guilds gefunden.</div>
            )}
          </section>
        </div>
      ) : (
        <div className={styles.emptyState}>
          Keine Treffer in {formatCount(data.players.length)} Playern und {formatCount(data.guilds.length)} Guilds.
        </div>
      )}
    </>
  );
}

function ScanExplorerResultLimitNote({
  kind,
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
      {capped
        ? `Showing first ${formatCount(visible)} of ${formatCount(total)} ${searching ? "matches" : kind}.`
        : `Showing ${formatCount(visible)} of ${formatCount(total)} ${searching ? "matches" : kind}.`}
      {!searching && total > limit ? " Use search to narrow the list." : ""}
    </p>
  );
}

function ScanExplorerBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className={styles.detailBackButton} onClick={onBack}>
      <ChevronLeft size={16} aria-hidden />
      <span>Back</span>
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
      <section className={styles.entityDetailHeader} aria-label="Player">
        <User size={18} aria-hidden />
        <div>
          <h3>{player.name}</h3>
          <p>
            {[
              normalized.progression.level == null ? null : `Level ${formatCount(normalized.progression.level)}`,
              className,
              player.server,
              player.guildName,
            ]
              .filter(Boolean)
              .join(" - ")}
          </p>
        </div>
      </section>

      <ScanDetailSection title="Overview">
        <MetricGrid
          items={[
            { label: "Identifier", value: normalized.identity.identifier },
            { label: "Player ID", value: normalized.identity.id },
            { label: "Name", value: normalized.identity.name },
            { label: "Server", value: normalized.identity.server ?? player.server },
            { label: "Level", value: normalized.progression.level },
            { label: "XP", value: normalized.progression.xp },
            { label: "XP Next", value: normalized.progression.xpNext },
            { label: "Honor", value: normalized.progression.honor },
            { label: "Rank", value: normalized.progression.rank },
            { label: "Class", value: className },
          ]}
        />
      </ScanDetailSection>

      {guildLink?.linked ? (
        <ScanExplorerPlayerGuildMemberSection guildLink={guildLink} />
      ) : guildLink?.ambiguous ? (
        <ScanDetailSection title="Guild Member">
          <div className={styles.unsupportedNote}>Guild member data is ambiguous for this player identifier in this scan.</div>
        </ScanDetailSection>
      ) : guildLink?.guildReference ? (
        <ScanDetailSection title="Guild Member">
          <MetricGrid
            items={[
              { label: "Guild", value: guildLink.guildReference.name },
              { label: "Guild Identifier", value: guildLink.guildReference.identifier },
              { label: "Server", value: guildLink.guildReference.server },
            ]}
          />
          <div className={styles.unsupportedNote}>No matching GuildMember entry is available in this scan.</div>
        </ScanDetailSection>
      ) : null}

      <ScanDetailSection title="Attributes">
        <div className={styles.attributeGrid}>
          {ATTRIBUTE_LABELS.map(([key, label]) => {
            const attribute = normalized.attributes[key];
            const details = compactEntries(attribute as unknown as Record<string, unknown>, 12).filter(
              (entry) => entry.label !== "Total" && entry.label !== "Base",
            );
            return (
              <div className={styles.attributeCard} key={key}>
                <div className={styles.attributeTop}>
                  <strong>{label}</strong>
                  <span>{formatValueOrUnavailable(attribute.total)}</span>
                </div>
                <span>Base {formatValueOrUnavailable(attribute.base)}</span>
                {details.length ? (
                  <details className={styles.compactDetails}>
                    <summary>Components</summary>
                    <MetricGrid items={details} compact />
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      </ScanDetailSection>

      <ScanDetailSection title="Combat">
        <MetricGrid
          items={[
            { label: "Armor", value: formatSourceStatus(normalized, "combat.armor", normalized.combat.armor) },
            { label: "Damage", value: formatDamageRange(normalized.combat.damage) },
            { label: "Secondary Damage", value: formatDamageRange(normalized.combat.damage.secondary) },
            { label: "Health", value: formatSourceStatus(normalized, "combat.health", normalized.combat.health) },
          ]}
        />
      </ScanDetailSection>

      <ScanDetailSection title="Progression / Bonuses">
        <MetricGrid
          items={[
            { label: "Scrapbook", value: formatValueWithMaximum(normalized.progressionStatus.scrapbook.count, normalized.progressionStatus.scrapbook.maximum) },
            { label: "Scrapbook %", value: formatPercentValue(normalized.progressionStatus.scrapbook.percentage) },
            { label: "Achievements", value: formatValueWithMaximum(normalized.progressionStatus.achievements.count, normalized.progressionStatus.achievements.maximum) },
            { label: "Mount Type", value: normalized.progressionStatus.mount.type },
            { label: "Mount Bonus", value: normalized.progressionStatus.mount.bonus == null ? null : `${formatCount(normalized.progressionStatus.mount.bonus)}%` },
            { label: "Mount Expires", value: formatTimestampMs(normalized.progressionStatus.mount.expiresAt) },
            { label: "Portal Health", value: normalized.progressionStatus.portalBonuses.health },
            { label: "Portal Damage", value: normalized.progressionStatus.portalBonuses.damage },
            ...(showLegacyGuildBonuses
              ? [
                  { label: "Guild Treasure", value: guildLink?.guildBonuses.treasure ?? normalized.progressionStatus.guildBonuses.treasure },
                  { label: "Guild Instructor", value: guildLink?.guildBonuses.instructor ?? normalized.progressionStatus.guildBonuses.instructor },
                  { label: "Guild Pet", value: guildLink?.guildBonuses.pet ?? normalized.progressionStatus.guildBonuses.pet },
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
    <ScanDetailSection title="Guild Member">
      <MetricGrid
        items={[
          { label: "Guild", value: guildLink.guildReference?.name },
          { label: "Guild Identifier", value: guildLink.guildReference?.identifier },
          { label: "Server", value: guildLink.guildReference?.server },
          { label: "Role", value: formatGuildRole(guildLink.role) },
          { label: "Last Active", value: formatTimestampMs(guildLink.lastActive) },
          { label: "Ready Attack", value: guildLink.readyAttack },
          { label: "Ready Defense", value: guildLink.readyDefense },
          { label: "Hydra Action", value: guildLink.actions.hydra },
          { label: "Attack Action", value: guildLink.actions.attack },
          { label: "Defense Action", value: guildLink.actions.defense },
          { label: "Raid Action", value: guildLink.actions.raid },
          { label: "Guild Treasure", value: guildLink.guildBonuses.treasure },
          { label: "Guild Instructor", value: guildLink.guildBonuses.instructor },
          { label: "Guild Pet", value: guildLink.guildBonuses.pet },
          { label: "Knights Contribution", value: guildLink.knightsContribution },
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
    <ScanDetailSection title="Fortress">
      {hasAnyFortressValue ? (
        <>
          <MetricGrid
            items={[
              { label: "Upgrades", value: fortress.upgrades },
              { label: "Rank", value: fortress.rank },
              { label: "Honor", value: fortress.honor },
              { label: "Raid Honor", value: fortress.raidHonor },
              { label: "Gladiator", value: fortress.gladiator },
              { label: "Knights", value: fortress.knights },
              { label: "Current Building", value: fortress.currentBuilding.building },
              { label: "Upgrade Active", value: fortress.currentBuilding.active },
              ...(fortress.currentBuilding.active
                ? [
                    { label: "Starts", value: formatTimestampMs(fortress.currentBuilding.startsAt) },
                    { label: "Finishes", value: formatTimestampMs(fortress.currentBuilding.finishesAt) },
                  ]
                : []),
            ]}
          />
          {buildings.length ? <MetricGrid items={buildings} compact /> : null}
        </>
      ) : (
        <div className={styles.unsupportedNote}>Fortress data is not available for this player in this scan.</div>
      )}
    </ScanDetailSection>
  );
}

function ScanExplorerDungeonsSection({ normalized }: { normalized: NormalizedPlayer }) {
  const dungeons = normalized.dungeons;
  return (
    <ScanDetailSection title="Dungeons">
      <MetricGrid
        items={[
          { label: "Normal Total", value: dungeons.totals.normal },
          { label: "Normal Unlocked", value: dungeons.totals.normalUnlocked },
          { label: "Shadow Total", value: dungeons.totals.shadow },
          { label: "Shadow Unlocked", value: dungeons.totals.shadowUnlocked },
          { label: "Class Total", value: dungeons.totals.class },
          { label: "Class Unlocked", value: dungeons.totals.classUnlocked },
          { label: "Tower", value: dungeons.tower.displayProgress },
          { label: "Twister", value: dungeons.twister.displayProgress },
          { label: "Raid", value: dungeons.raid.displayProgress },
          { label: "Player Portal", value: dungeons.portals.player.displayProgress },
          { label: "Guild Portal", value: dungeons.portals.guild.displayProgress },
        ]}
      />
      <MetricGrid
        items={[
          { label: "Normal Entries", value: dungeons.normal.count },
          { label: "Normal Progress", value: dungeons.normal.totalProgress },
          { label: "Shadow Entries", value: dungeons.shadow.count },
          { label: "Shadow Progress", value: dungeons.shadow.totalProgress },
          { label: "Class Entries", value: dungeons.class.count },
          { label: "Class Progress", value: dungeons.class.totalProgress },
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
        item?.type == null ? null : `Type ${item.type}`,
        item?.armor == null ? null : `Armor ${formatCount(item.armor)}`,
        formatDamageRange(item?.damage),
      ]
        .filter(Boolean)
        .join(" - "),
    }))
    .filter((entry) => entry.value);
  const potionEntries =
    normalized.potions?.slots
      .map((slot) => ({
        label: `Slot ${slot.slot + 1}`,
        value: [
          slot.attribute ? formatCamelLabel(slot.attribute) : null,
          slot.size == null ? null : `${slot.size}%`,
          slot.expires == null ? null : formatTimestampMs(slot.expires),
        ]
          .filter(Boolean)
          .join(" - "),
      }))
      .filter((entry) => entry.value) ?? [];
  const pets = normalized.pets;
  const extended = normalized.extended;
  const resourceGroups = [
    compactEntries(normalized.resources.currencies as unknown as Record<string, unknown>, 8),
    compactEntries(normalized.resources.fortress as unknown as Record<string, unknown>, 8),
    compactEntries(normalized.resources.smithy as unknown as Record<string, unknown>, 8),
    compactEntries(normalized.resources.underworld as unknown as Record<string, unknown>, 8),
  ].filter((group) => group.length > 0);
  const underworldGroups = [
    compactEntries(normalized.underworld.buildings as unknown as Record<string, unknown>, 12),
    compactEntries(normalized.underworld.units as unknown as Record<string, unknown>, 8),
    compactEntries(normalized.underworld.resources as unknown as Record<string, unknown>, 12),
  ].filter((group) => group.length > 0);

  return (
    <details className={styles.advancedDetails}>
      <summary>Advanced</summary>
      <div className={styles.advancedStack}>
        <ScanDetailSection title="Items">
          {itemEntries.length ? <MetricGrid items={itemEntries} compact /> : <div className={styles.unsupportedNote}>Equipped items are not available.</div>}
        </ScanDetailSection>
        <ScanDetailSection title="Potions">
          <MetricGrid
            items={[
              { label: "Life Active", value: normalized.potions?.life.active },
              { label: "Life Size", value: normalized.potions?.life.size },
              ...potionEntries,
            ]}
            compact
          />
        </ScanDetailSection>
        <ScanDetailSection title="Pets">
          {pets ? (
            <>
              <MetricGrid
                items={[
                  { label: "Rank", value: pets.rank },
                  { label: "Honor", value: pets.honor },
                  { label: "Total Count", value: pets.own?.totalCount ?? pets.collection?.totalPets },
                  { label: "Total Level", value: pets.own?.totalLevel },
                ]}
                compact
              />
              <MetricGrid items={compactEntries(pets.bonuses as unknown as Record<string, unknown>, 8)} compact />
              <MetricGrid items={compactEntries(pets.foods as unknown as Record<string, unknown>, 8)} compact />
            </>
          ) : (
            <div className={styles.unsupportedNote}>Pet data is not available.</div>
          )}
        </ScanDetailSection>
        <ScanDetailSection title="Runes">
          <MetricGrid
            items={[
              { label: "Gold", value: normalized.runes.gold },
              { label: "XP", value: normalized.runes.xp },
              { label: "Epic Chance", value: normalized.runes.epicChance },
              { label: "Item Quality", value: normalized.runes.itemQuality },
              { label: "Health", value: normalized.runes.health },
              { label: "Damage", value: normalized.runes.damage.total },
              { label: "Resistance", value: normalized.runes.resistance.total },
            ]}
            compact
          />
        </ScanDetailSection>
        <ScanDetailSection title="Resources">
          {resourceGroups.length ? (
            resourceGroups.map((items, index) => <MetricGrid items={items} compact key={`resources:${index}`} />)
          ) : (
            <div className={styles.unsupportedNote}>Resource data is not available.</div>
          )}
        </ScanDetailSection>
        <ScanDetailSection title="Underworld">
          {underworldGroups.length ? (
            underworldGroups.map((items, index) => <MetricGrid items={items} compact key={`underworld:${index}`} />)
          ) : (
            <div className={styles.unsupportedNote}>Underworld data is not available.</div>
          )}
        </ScanDetailSection>
        <ScanDetailSection title="Witch">
          <ScanExplorerWitchDetail witch={extended.witch} />
        </ScanDetailSection>
        <ScanDetailSection title="Idle">
          <ScanExplorerIdleDetail idle={extended.idle} />
        </ScanDetailSection>
        <ScanDetailSection title="Toilet">
          <MetricGrid items={compactEntries(extended.toilet as unknown as Record<string, unknown>, 8)} compact />
        </ScanDetailSection>
        <ScanDetailSection title="Extras">
          <MetricGrid items={compactEntries(extended.extras as unknown as Record<string, unknown>, 8)} compact />
        </ScanDetailSection>
      </div>
    </details>
  );
}

function ScanExplorerWitchDetail({ witch }: { witch: NormalizedPlayer["extended"]["witch"] }) {
  const ownedScrolls = witch.scrolls.filter((scroll) => scroll.owned === true).length;
  const knownScrolls = witch.scrolls.filter((scroll) => scroll.owned != null || scroll.type != null || scroll.picIndex != null).length;
  const scrollItems = witch.scrolls
    .filter((scroll) => scroll.owned != null || scroll.type != null || scroll.picIndex != null || scroll.date != null)
    .map((scroll) => ({
      label: `Scroll ${scroll.index + 1}`,
      value: [
        scroll.type == null ? null : `Type ${formatCount(scroll.type)}`,
        scroll.owned == null ? null : scroll.owned ? "Owned" : "Open",
        formatTimestampMs(scroll.date),
      ]
        .filter(Boolean)
        .join(" - "),
    }))
    .filter((entry) => entry.value);

  const summaryItems: ScanMetric[] = [
    { label: "Stage", value: witch.stage },
    { label: "Items", value: formatValueWithMaximum(witch.items, witch.itemsNext) },
    { label: "Item", value: witch.item },
    { label: "Finish", value: formatTimestampMs(witch.finish) },
    ...(knownScrolls ? [{ label: "Scrolls", value: `${formatCount(ownedScrolls)} / ${formatCount(knownScrolls)} owned` }] : []),
  ];

  return (
    <>
      <MetricGrid items={summaryItems} compact />
      {scrollItems.length ? <MetricGrid items={scrollItems} compact /> : null}
      {!summaryItems.some((item) => item.value != null) && !scrollItems.length ? (
        <div className={styles.unsupportedNote}>Witch data is not available.</div>
      ) : null}
    </>
  );
}

function summarizeNumericArray(values: number[], label: string) {
  if (!values.length) return null;
  const active = values.filter((value) => value > 0).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  return `${formatCount(values.length)} ${label}${active ? ` - ${formatCount(active)} active` : ""}${total ? ` - total ${formatCount(total)}` : ""}`;
}

function ScanExplorerIdleDetail({ idle }: { idle: NormalizedPlayer["extended"]["idle"] }) {
  const items: ScanMetric[] = [
    { label: "Sacrifices", value: idle.sacrifices },
    { label: "Buildings", value: summarizeNumericArray(idle.buildings, "buildings") },
    { label: "Money", value: idle.money },
    { label: "Ready Runes", value: idle.readyRunes },
    { label: "Runes", value: idle.runes },
    { label: "Speed Upgrades", value: summarizeNumericArray(idle.upgrades.speed, "upgrades") },
    { label: "Money Upgrades", value: summarizeNumericArray(idle.upgrades.money, "upgrades") },
    { label: "Upgrade Total", value: idle.upgrades.total },
  ];

  return items.some((item) => item.value != null && item.value !== "") ? (
    <MetricGrid items={items} compact />
  ) : (
    <div className={styles.unsupportedNote}>Idle data is not available.</div>
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
      <section className={styles.entityDetailHeader} aria-label="Guild">
        <Shield size={18} aria-hidden />
        <div>
          <h3>{displayName}</h3>
          <p>{[displayServer, displayIdentifier].filter(Boolean).join(" - ")}</p>
        </div>
      </section>

      <ScanDetailSection title="Overview">
        <MetricGrid
          items={[
            { label: "Name", value: displayName },
            { label: "Identifier", value: displayIdentifier },
            { label: "Server", value: displayServer },
            { label: "CoA", value: coa },
            { label: "Rank", value: normalizedGuild?.progression.rank },
            { label: "Honor", value: normalizedGuild?.progression.honor },
            { label: "Snapshots", value: group.rows.length },
            { label: "Complete Snapshots", value: group.completeSnapshotCount },
            { label: "Members", value: normalizedGuild?.totals.membersTotal ?? group.rows[0]?.declaredMemberCount ?? members.length },
            { label: "Description", value: normalizedGuild?.identity.description },
          ]}
        />
      </ScanDetailSection>

      {normalizedGuild ? <ScanExplorerGuildNormalizedSections guild={normalizedGuild} /> : null}

      <ScanDetailSection title="Coverage">
        {group.rows.length ? (
          <div className={styles.detailsGuildList}>
            <ScanDetailsGuildRow group={group} />
          </div>
        ) : (
          <div className={styles.emptyState}>Keine Guild-Coverage gefunden.</div>
        )}
      </ScanDetailSection>

      <ScanDetailSection title={`Members (${formatCount(members.length)})`}>
        {members.length ? (
          <div className={styles.memberList}>
            {members.map((member) => (
              <ScanExplorerGuildMemberRow member={member} key={member.identity.playerIdentifier ?? `slot:${member.identity.slot}`} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>Keine Memberliste aus der NormalizedGuild-Semantik verfügbar.</div>
        )}
      </ScanDetailSection>
    </>
  );
}

function ScanExplorerGuildNormalizedSections({ guild }: { guild: NormalizedGuild }) {
  return (
    <>
      <ScanDetailSection title="Bonuses / Totals">
        <MetricGrid
          items={[
            { label: "Total Treasure", value: guild.bonuses.totalTreasure },
            { label: "Total Instructor", value: guild.bonuses.totalInstructor },
            { label: "Total Knights", value: guild.totals.totalKnights },
            { label: "Total Knights 15", value: guild.totals.totalKnights15 },
            { label: "Guild Pet ID", value: guild.combatProgress.pet.id },
            { label: "Guild Pet Level", value: guild.combatProgress.pet.level },
            { label: "Guild Pet Class", value: guild.combatProgress.pet.class },
          ]}
        />
      </ScanDetailSection>
      <ScanDetailSection title="Combat Progress">
        <MetricGrid
          items={[
            { label: "Raid", value: guild.combatProgress.raid },
            { label: "Portal Floor", value: guild.combatProgress.portal.floor },
            { label: "Portal Life", value: guild.combatProgress.portal.life },
            { label: "Portal Percent", value: guild.combatProgress.portal.percent },
            { label: "Hydra Level", value: guild.combatProgress.hydra.level },
            { label: "Hydra Max", value: guild.combatProgress.hydra.max },
            { label: "Under Attack", value: guild.combatProgress.combatState.isUnderAttack },
            { label: "Under Attack ID", value: guild.combatProgress.combatState.underAttackId },
            { label: "Attacking", value: guild.combatProgress.combatState.isAttacking },
            { label: "Attacking ID", value: guild.combatProgress.combatState.attackingId },
          ]}
        />
      </ScanDetailSection>
      {guild.tournament ? (
        <ScanDetailSection title="Tournament">
          <MetricGrid
            items={[
              { label: "Rank", value: guild.tournament.rank },
              { label: "Tokens", value: guild.tournament.tokens },
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
      <strong>{member.identity.name ?? member.identity.playerIdentifier ?? `Slot ${member.identity.slot + 1}`}</strong>
      <span>
        {[
          formatGuildRole(member.role.name),
          member.identity.level == null ? null : `Level ${formatCount(member.identity.level)}`,
          member.identity.playerIdentifier,
        ]
          .filter(Boolean)
          .join(" - ")}
      </span>
      <span>
        {[
          formatTimestampMs(member.activity.lastActive),
          member.readyAttack == null ? null : `Attack ${formatOptionalValue(member.readyAttack)}`,
          member.readyDefense == null ? null : `Defense ${formatOptionalValue(member.readyDefense)}`,
        ]
          .filter(Boolean)
          .join(" - ")}
      </span>
      <details className={styles.compactDetails}>
        <summary>Member details</summary>
        <MetricGrid
          items={[
            { label: "Slot", value: member.identity.slot + 1 },
            { label: "Player ID", value: member.identity.playerId },
            { label: "Player Identifier", value: member.identity.playerIdentifier },
            { label: "State", value: member.activity.state },
            { label: "Last Active", value: formatTimestampMs(member.activity.lastActive) },
            { label: "Hydra Action", value: member.actions.hydra },
            { label: "Attack Action", value: member.actions.attack },
            { label: "Defense Action", value: member.actions.defense },
            { label: "Raid Action", value: member.actions.raid },
            { label: "Guild Treasure", value: member.bonuses.treasure },
            { label: "Guild Instructor", value: member.bonuses.instructor },
            { label: "Guild Pet", value: member.bonuses.pet },
            { label: "Knights Contribution", value: member.contributions.knights },
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
          <dt>{item.label}</dt>
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
        <span>1 Scan</span>
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
        <span>{formatCount(group.rows.length)} Scans</span>
        <span>{formatCount(group.completeSnapshotCount)} vollständig</span>
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
    <div id="data-management-fight-trackers-panel" role="tabpanel" aria-labelledby="data-management-fight-trackers-tab">
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <section className={styles.scanSection} aria-label="Fight Tracker">
        <div className={styles.sectionHeader}>
          <h3>Fight Tracker</h3>
          <div className={styles.sectionHeaderActions}>
            <span>{loading ? "Lädt..." : `${summaries.length} gespeichert`}</span>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefresh}
              disabled={loading}
              aria-label="Fight Tracker aktualisieren"
              title="Fight Tracker aktualisieren"
            >
              <RefreshCw size={15} aria-hidden />
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Fight Tracker werden geladen.</div>
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
                <span>{selectedTrackerCount === 1 ? "Fight Tracker exportieren" : "Fight-Tracker-Pack exportieren"}</span>
              </button>
            </div>
            <div className={`${styles.tableWrap} ${styles.trackerTableWrap}`}>
              <table className={`${styles.table} ${styles.trackerTable}`}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}>
                      <input
                        type="checkbox"
                        aria-label="Alle Fight Tracker auswählen"
                        checked={allTrackersSelected}
                        onChange={onToggleAll}
                      />
                    </th>
                    <th>Tracker/Gilde</th>
                    <th>Server</th>
                    <th className={styles.numericCell}>Member</th>
                    <th className={styles.numericCell}>Aktiv</th>
                    <th className={styles.numericCell}>Fights</th>
                    <th>Stand</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((summary) => (
                    <tr key={summary.tracker.id}>
                      <td className={styles.checkCell}>
                        <input
                          type="checkbox"
                          aria-label={`${summary.tracker.name} auswählen`}
                          checked={selectedTrackerIds.has(summary.tracker.id)}
                          onChange={() => onToggleTracker(summary.tracker.id)}
                        />
                      </td>
                      <td>
                        <div className={styles.trackerNameCell}>
                          <span className={styles.truncate} title={summary.tracker.name}>
                            {summary.tracker.name}
                          </span>
                          {summary.tracker.importedAt ? <span className={styles.importBadge}>Importiert</span> : null}
                        </div>
                      </td>
                      <td>{summary.tracker.server || "Unbekannt"}</td>
                      <td className={styles.numericCell}>{summary.memberCount}</td>
                      <td className={styles.numericCell}>{summary.activeMemberCount}</td>
                      <td className={styles.numericCell}>{summary.fightCount}</td>
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
                        aria-label={`${summary.tracker.name} auswählen`}
                        checked={selectedTrackerIds.has(summary.tracker.id)}
                        onChange={() => onToggleTracker(summary.tracker.id)}
                      />
                      <strong>{summary.tracker.name}</strong>
                    </label>
                    <span>{summary.tracker.server || "Unbekannt"}</span>
                  </div>
                  {summary.tracker.importedAt ? <span className={styles.importBadge}>Importiert</span> : null}
                  <dl className={styles.trackerStats}>
                    <div>
                      <dt>Member</dt>
                      <dd>{summary.memberCount}</dd>
                    </div>
                    <div>
                      <dt>Aktiv</dt>
                      <dd>{summary.activeMemberCount}</dd>
                    </div>
                    <div>
                      <dt>Fights</dt>
                      <dd>{summary.fightCount}</dd>
                    </div>
                    <div>
                      <dt>Stand</dt>
                      <dd>{formatOptionalDate(summary.tracker.lastSyncedScanAt ?? summary.tracker.updatedAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>Noch keine Fight Tracker vorhanden.</div>
        )}
      </section>
    </div>
  );
}

function DataJobStatusBox({ job }: { job: DataJob }) {
  const progress = getDataJobProgress(job);
  const detail = getDataJobDetail(job);
  const percent =
    progress && progress.total > 0 ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : null;

  return (
    <section className={styles.jobStatusBox} aria-label="Laufender Import">
      <div className={styles.jobStatusHeader}>
        <span className={styles.jobStatusIcon} aria-hidden>
          <Loader2 size={16} />
        </span>
        <div>
          <h3>{job.title}</h3>
          <p>{detail}</p>
        </div>
        {progress ? (
          <span className={styles.jobStatusCount}>
            {progress.current}/{progress.total}
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
  const confirmLabel = pending.kind === "scanMerge" ? "Zusammenführen" : pending.kind === "scanJson" ? "Importieren" : "Import bestätigen";
  const selectedContainsSlot = pending.kind === "scanMerge" && pending.summaries.some((summary) => summary.isScanSlot);

  return (
    <section className={styles.previewBox} aria-label="Import-Vorschau">
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
            <legend>Art der Zusammenführung</legend>
            <label className={styles.mergeModeOption}>
              <input
                type="radio"
                name={`scan-merge-mode-${pending.id}`}
                value="merged-file"
                checked={pending.mode === "merged-file"}
                onChange={() => onMergeModeChange?.("merged-file")}
              />
              <span>
                <strong>Zusammengeführte Datei</strong>
                <small>Erstellt eine zusätzliche JSON. Die ausgewählten Scans bleiben einzeln erhalten.</small>
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
                <strong>Neuer Scan-Slot</strong>
                <small>Bündelt die ausgewählten Scans unter einem gemeinsamen Namen.</small>
              </span>
            </label>
          </fieldset>
          {pending.mode === "scan-slot" ? (
            <label className={styles.filenameField}>
              <span>Scan-Slot-Name</span>
              <input value={pending.displayName} onChange={(event) => onDisplayNameChange?.(event.target.value)} />
            </label>
          ) : (
            <label className={styles.filenameField}>
              <span>Dateiname</span>
              <input value={pending.filename} onChange={(event) => onFilenameChange?.(event.target.value)} />
            </label>
          )}
        </>
      ) : null}
      <div className={styles.previewActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>
          <X size={15} aria-hidden />
          <span>Abbrechen</span>
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
  if (pending.kind === "scanJson") return "SFtools-Scan importieren";
  if (pending.kind === "scanMerge") return "Scans zusammenführen";
  if (pending.envelope.type === "scan") return "SFtools-Scan importieren";
  if (pending.envelope.type === "scanpack") return "Scanpack importieren";
  if (pending.envelope.type === "fighttrackerpack") return "Fight-Tracker-Pack importieren";
  return "Fight Tracker importieren";
}

function buildImportPreviewRows(pending: PendingImport): Array<{ label: string; value: string }> {
  if (pending.kind === "scanJson") {
    return buildScanPreviewRows(pending.scan);
  }
  if (pending.kind === "scanMerge") {
    return buildMergePreviewRows(pending);
  }

  const { envelope } = pending;
  if (envelope.type === "scan") {
    return buildScanPreviewRows(envelope.payload);
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
        : "Unbekannt";

    return [
      { label: "Scans", value: scans.length.toLocaleString("de-DE") },
      { label: "Server", value: servers.size ? [...servers].join(", ") : "Unbekannt" },
      { label: "Zeitraum", value: period },
    ];
  }

  if (envelope.type === "fighttrackerpack") {
    const trackers = envelope.payload.trackers;
    const totalMembers = trackers.reduce((sum, tracker) => sum + tracker.members.length, 0);
    const totalFights = trackers.reduce((sum, tracker) => sum + tracker.fights.length, 0);
    return [
      { label: "Tracker", value: trackers.length.toLocaleString("de-DE") },
      { label: "Member gesamt", value: totalMembers.toLocaleString("de-DE") },
      { label: "Fights gesamt", value: totalFights.toLocaleString("de-DE") },
      { label: "Namen", value: formatCompactNames(trackers.map((tracker) => tracker.tracker.name)) },
      { label: "Exportzeit", value: formatOptionalDate(envelope.createdAt) },
    ];
  }

  return [
    { label: "Tracker/Gilde", value: envelope.payload.tracker.name },
    { label: "Server", value: envelope.payload.tracker.server || "Unbekannt" },
    { label: "Member", value: envelope.payload.members.length.toLocaleString("de-DE") },
    { label: "Fights", value: envelope.payload.fights.length.toLocaleString("de-DE") },
    { label: "Exportzeit", value: formatOptionalDate(envelope.createdAt) },
  ];
}

function buildMergePreviewRows(pending: PendingScanMergeImport): Array<{ label: string; value: string }> {
  const snapshotTimes = pending.summaries.flatMap((summary) => summary.snapshotTimestamps).filter((value) => Number.isFinite(value));
  const servers = new Set(pending.summaries.flatMap((scan) => scan.servers));
  const period =
    snapshotTimes.length > 0
      ? `${formatOptionalDate(new Date(Math.min(...snapshotTimes)).toISOString())} - ${formatOptionalDate(
          new Date(Math.max(...snapshotTimes)).toISOString(),
        )}`
      : "Unbekannt";
  const logicalScanCount = pending.summaries.reduce((sum, summary) => sum + summary.logicalScanCount, 0);
  const playerCount = pending.summaries.reduce((sum, summary) => sum + summary.playerCount, 0);
  const guildCount = pending.summaries.reduce((sum, summary) => sum + summary.guildCount, 0);

  return [
    { label: "Modus", value: pending.mode === "scan-slot" ? "Neuer Scan-Slot" : "Zusammengeführte Datei" },
    ...(pending.mode === "scan-slot" ? [{ label: "Name", value: pending.displayName || "Unbenannt" }] : []),
    { label: "Dateien", value: `${pending.summaries.length.toLocaleString("de-DE")} ausgewählt` },
    { label: "Zeitraum", value: period },
    { label: "Server", value: servers.size ? [...servers].join(", ") : "Unbekannt" },
    { label: "Enthaltene Scans", value: `${logicalScanCount.toLocaleString("de-DE")} Scans` },
    { label: "Spieler", value: playerCount.toLocaleString("de-DE") },
    { label: "Gilden", value: guildCount.toLocaleString("de-DE") },
    { label: "Quellen", value: formatCompactNames(pending.summaries.map((scan) => scan.filename), 6) },
  ];
}

function buildScanPreviewRows(scan: SfDataHubLocalScan): Array<{ label: string; value: string }> {
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  if (snapshots.length > 1) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const playerCount = snapshots.reduce((sum, snapshot) => sum + snapshot.playerCount, 0);
    const guildCount = snapshots.reduce((sum, snapshot) => sum + snapshot.guildCount, 0);
    return [
      { label: "Datei", value: scan.filename || "Unbekannt" },
      { label: "Erkannte Scans", value: `${snapshots.length.toLocaleString("de-DE")} Scans` },
      { label: "Datumsbereich", value: `${formatOptionalDate(first.timestamp)} - ${formatOptionalDate(last.timestamp)}` },
      { label: "Server", value: formatServerList(scan) },
      { label: "Spieler", value: playerCount.toLocaleString("de-DE") },
      { label: "Gilden", value: guildCount.toLocaleString("de-DE") },
    ];
  }

  return [
    { label: "Datei", value: scan.filename || "Unbekannt" },
    { label: "Scanzeit", value: formatOptionalDate(scan.scannedAt) },
    { label: "Server", value: formatServerList(scan) },
    { label: "Spieler", value: scan.playerCount.toLocaleString("de-DE") },
    { label: "Gilden", value: getScanGuildCount(scan).toLocaleString("de-DE") },
  ];
}

function FeedbackBox({ feedback }: { feedback: ImportFeedback }) {
  return (
    <div className={styles.feedbackBox}>
      {feedback.imported.length ? <p>Importiert: {feedback.imported.join(", ")}</p> : null}
      {feedback.updated.length ? <p>Aktualisiert: {feedback.updated.join(", ")}</p> : null}
      {feedback.deleted ? <p>Gelöscht: {feedback.deleted}</p> : null}
      {feedback.duplicates.length ? <p>Bereits vorhanden: {feedback.duplicates.join(", ")}</p> : null}
      {feedback.errors.map((entry) => (
        <p className={styles.feedbackError} key={`${entry.filename}:${entry.message}`}>
          {entry.filename}: {entry.message}
        </p>
      ))}
    </div>
  );
}
