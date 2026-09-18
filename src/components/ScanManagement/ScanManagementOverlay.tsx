import React from "react";
import { createPortal } from "react-dom";
import { Check, Database, Download, Eye, Loader2, Pencil, RefreshCw, Swords, Trash2, Upload, X } from "lucide-react";

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
  type GuildHubLogicalScanSnapshot,
  type GuildHubScanSummary,
  type SfDataHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
import {
  deriveGuildCoverageForLogicalSnapshots,
  summarizeGuildCoverage,
  type GuildCoverageSummary,
  type GuildSnapshotCoverage,
  type GuildSnapshotCoverageStatus,
} from "../../lib/guilds/guildCoverage";
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

type ScanDetailsGuildGroup = {
  key: string;
  server: string;
  guildIdentifier: string;
  guildName: string;
  rows: GuildSnapshotCoverage[];
  completeSnapshotCount: number;
};

type ScanDetailsData = {
  scan: SfDataHubLocalScan;
  snapshots: GuildHubLogicalScanSnapshot[];
  coverageRows: GuildSnapshotCoverage[];
  coverageSummary: GuildCoverageSummary;
  guildGroups: ScanDetailsGuildGroup[];
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

function getCoverageUniqueKey(row: Pick<GuildSnapshotCoverage, "server" | "guildIdentifier">) {
  return `${row.server.toLowerCase()}::${row.guildIdentifier.toLowerCase()}`;
}

function formatCount(value: number) {
  return value.toLocaleString("de-DE");
}

function getScanSourceTypeLabel(scan: Pick<GuildHubScanSummary, "isScanSlot" | "isMergedBundle">) {
  if (scan.isScanSlot) return "Slot";
  if (scan.isMergedBundle) return "Bundle";
  return "Scan";
}

function formatCoverageStatus(status: GuildSnapshotCoverageStatus) {
  if (status === "complete") return { symbol: "✓", label: "complete" };
  if (status === "overcount") return { symbol: "⚠", label: "overcount" };
  if (status === "unknown") return { symbol: "?", label: "unknown" };
  return { symbol: "-", label: "incomplete" };
}

function formatCoverageRatio(row: GuildSnapshotCoverage) {
  return `${formatCount(row.countedMemberCount)} / ${
    row.declaredMemberCount == null ? "?" : formatCount(row.declaredMemberCount)
  }`;
}

function groupGuildCoverageRows(rows: GuildSnapshotCoverage[]): ScanDetailsGuildGroup[] {
  const groups = new Map<string, ScanDetailsGuildGroup>();

  for (const row of rows) {
    const key = getCoverageUniqueKey(row);
    const existing =
      groups.get(key) ??
      ({
        key,
        server: row.server,
        guildIdentifier: row.guildIdentifier,
        guildName: row.guildName?.trim() || "Unknown Guild",
        rows: [],
        completeSnapshotCount: 0,
      } satisfies ScanDetailsGuildGroup);

    if (existing.guildName === "Unknown Guild" && row.guildName?.trim()) {
      existing.guildName = row.guildName.trim();
    }
    existing.rows.push(row);
    if (row.complete) existing.completeSnapshotCount += 1;
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => a.snapshotTimestamp - b.snapshotTimestamp),
    }))
    .sort(
      (a, b) =>
        a.server.localeCompare(b.server, undefined, { numeric: true, sensitivity: "base" }) ||
        a.guildName.localeCompare(b.guildName, undefined, { numeric: true, sensitivity: "base" }) ||
        a.guildIdentifier.localeCompare(b.guildIdentifier, undefined, { numeric: true, sensitivity: "base" }),
    );
}

function buildScanDetailsData(scan: SfDataHubLocalScan): ScanDetailsData {
  const snapshots = deriveGuildHubLogicalScanSnapshots(scan);
  const coverageRows = deriveGuildCoverageForLogicalSnapshots(snapshots);
  return {
    scan,
    snapshots,
    coverageRows,
    coverageSummary: summarizeGuildCoverage(coverageRows),
    guildGroups: groupGuildCoverageRows(coverageRows),
  };
}

function formatGroupStatus(group: ScanDetailsGuildGroup) {
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
    { label: "Server", value: formatCount(servers.length) },
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

        <div className={styles.detailsBody}>
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

              <section className={styles.detailsSection} aria-label="Server-Coverage">
                <h3>Server</h3>
                {coverage.byServer.length ? (
                  <div className={styles.tableWrap}>
                    <table className={`${styles.table} ${styles.detailsTable}`}>
                      <thead>
                        <tr>
                          <th>Server</th>
                          <th className={styles.numericCell}>Gilden</th>
                          <th className={styles.numericCell}>Vollständig</th>
                          <th className={styles.numericCell}>Guild-Snapshots</th>
                          <th className={styles.numericCell}>Vollständig</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.byServer.map((server) => (
                          <tr key={server.server}>
                            <td>{server.server}</td>
                            <td className={styles.numericCell}>{formatCount(server.uniqueGuildCount)}</td>
                            <td className={styles.numericCell}>{formatCount(server.completeUniqueGuildCount)}</td>
                            <td className={styles.numericCell}>{formatCount(server.guildSnapshotCount)}</td>
                            <td className={styles.numericCell}>{formatCount(server.completeGuildSnapshotCount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.emptyState}>Keine Guild-Coverage gefunden.</div>
                )}
              </section>

              <section className={styles.detailsSection} aria-label="Guild-Coverage">
                <h3>Guilds</h3>
                {data.guildGroups.length ? (
                  <div className={styles.detailsGuildList}>
                    {data.guildGroups.map((group) => (
                      <ScanDetailsGuildRow group={group} key={group.key} />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>Keine Guilds mit stabiler Identity gefunden.</div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
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

function ScanDetailsGuildRow({ group }: { group: ScanDetailsGuildGroup }) {
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
