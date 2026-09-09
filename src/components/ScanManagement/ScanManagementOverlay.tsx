import React from "react";
import { createPortal } from "react-dom";
import { Check, Database, Download, RefreshCw, Swords, Trash2, Upload, X } from "lucide-react";

import { useBackClose } from "../../hooks/useBackClose";
import {
  createSfDataHubLocalScanImportPreview,
  deleteSfDataHubLocalScans,
  importSfDataHubLocalScan,
  importSfDataHubLocalScanRecords,
  listSfDataHubLocalScans,
  subscribeToSfDataHubLocalScanChanges,
  updateSfDataHubLocalScan,
  type SfDataHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
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
  content: string;
  scan: SfDataHubLocalScan;
};

type PendingImport = PendingTransferImport | PendingScanJsonImport;

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

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unbekannt";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatServerList(scan: SfDataHubLocalScan) {
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

function getScanGuildCount(scan: SfDataHubLocalScan) {
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

function mergeFeedback(base: ImportFeedback, patch: Partial<ImportFeedback>): ImportFeedback {
  return {
    imported: patch.imported ?? base.imported,
    duplicates: patch.duplicates ?? base.duplicates,
    updated: patch.updated ?? base.updated,
    deleted: patch.deleted ?? base.deleted,
    errors: patch.errors ?? base.errors,
  };
}

export default function ScanManagementOverlay({ isOpen, onClose }: ScanManagementOverlayProps) {
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateInputRef = React.useRef<HTMLInputElement | null>(null);
  const updateTargetIdRef = React.useRef<string | null>(null);
  const [scans, setScans] = React.useState<SfDataHubLocalScan[]>([]);
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

  useBackClose(isOpen, onClose);

  React.useEffect(() => {
    if (isOpen) setActiveTab("scans");
  }, [isOpen]);

  const loadScans = React.useCallback(async () => {
    setStorageError(null);
    setLoading(true);
    try {
      const rows = await listSfDataHubLocalScans();
      setScans(rows);
      setSelectedIds((current) => new Set(rows.filter((scan) => current.has(scan.id)).map((scan) => scan.id)));
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
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleImportFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setStorageError(null);
    setPendingImport(null);

    const nextFeedback = createEmptyFeedback();
    let nextPendingImport: PendingImport | null = null;

    for (const file of files) {
      try {
        const content = await file.text();
        if (getFileExtension(file.name) === ".sfdata") {
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
          content,
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
      if (scans.length > 0 && scans.every((scan) => current.has(scan.id))) return new Set();
      return new Set(scans.map((scan) => scan.id));
    });
  };

  const deleteScans = async (ids: string[]) => {
    if (!ids.length) return;
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

  const exportSelectedScans = () => {
    const selectedScans = scans.filter((scan) => selectedIds.has(scan.id));
    if (!selectedScans.length) return;
    if (selectedScans.length === 1) {
      const envelope = createSfDataHubTransferEnvelope("scan", selectedScans[0]);
      downloadSfDataFile(createSfDataFileName("scan", null, dateFromOptionalTimestamp(selectedScans[0].scannedAt ?? selectedScans[0].importedAt)), envelope);
      return;
    }

    const envelope = createSfDataHubTransferEnvelope("scanpack", { scans: selectedScans });
    downloadSfDataFile(createSfDataFileName("scanpack"), envelope);
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
        const result = await importSfDataHubLocalScan(pendingImport.filename, pendingImport.content);
        if (result.status === "duplicate") {
          nextFeedback.duplicates.push(result.scan.filename);
        } else {
          nextFeedback.imported.push(result.scan.filename);
        }
        setActiveTab("scans");
        await loadScans();
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

  const allVisibleSelected = scans.length > 0 && scans.every((scan) => selectedIds.has(scan.id));
  const allTrackersSelected = trackerSummaries.length > 0 && trackerSummaries.every((summary) => selectedTrackerIds.has(summary.tracker.id));
  const selectedTrackerCount = trackerSummaries.filter((summary) => selectedTrackerIds.has(summary.tracker.id)).length;

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
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

          <div className={styles.globalToolbar}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              <Upload size={16} aria-hidden />
              <span>{busy ? "Verarbeite..." : "Importieren"}</span>
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
            {pendingImport ? (
              <TransferImportPreview
                pending={pendingImport}
                busy={busy}
                onConfirm={() => void confirmTransferImport()}
                onCancel={() => setPendingImport(null)}
              />
            ) : null}

            {activeTab === "scans" ? (
              <div id="data-management-scans-panel" role="tabpanel" aria-labelledby="data-management-scans-tab">
                <div className={styles.toolbar}>
                  {selectedIds.size > 0 ? (
                    <button type="button" className={styles.primaryButton} onClick={exportSelectedScans} disabled={busy}>
                      <Download size={16} aria-hidden />
                      <span>{selectedIds.size === 1 ? "Scan exportieren" : "Scanpack exportieren"}</span>
                    </button>
                  ) : null}
                  {selectedIds.size > 0 ? (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => void deleteScans([...selectedIds])}
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
                    <span>{loading ? "Lädt..." : `${scans.length} gespeichert`}</span>
                  </div>

                  {loading ? (
                    <div className={styles.emptyState}>Lokale Scans werden geladen.</div>
                  ) : scans.length ? (
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
                          {scans.map((scan) => (
                            <tr key={scan.id}>
                              <td className={styles.checkCell}>
                                <input
                                  type="checkbox"
                                  aria-label={`${scan.filename} auswählen`}
                                  checked={selectedIds.has(scan.id)}
                                  onChange={() => toggleScan(scan.id)}
                                />
                              </td>
                              <td>{formatScanDate(scan.scannedAt)}</td>
                              <td>
                                <span className={styles.truncate} title={formatServerList(scan)}>
                                  {formatServerList(scan)}
                                </span>
                              </td>
                              <td className={styles.numericCell}>{scan.playerCount}</td>
                              <td className={styles.numericCell}>{getScanGuildCount(scan)}</td>
                              <td>
                                <span className={styles.truncate} title={scan.filename}>
                                  {scan.filename}
                                </span>
                              </td>
                              <td className={styles.rowActions}>
                                <button
                                  type="button"
                                  className={styles.iconButton}
                                  onClick={() => startUpdate(scan.id)}
                                  disabled={busy}
                                  aria-label={`${scan.filename} aktualisieren`}
                                  title="Scan aktualisieren"
                                >
                                  <RefreshCw size={15} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                                  onClick={() => void deleteScans([scan.id])}
                                  disabled={busy}
                                  aria-label={`${scan.filename} löschen`}
                                  title="Scan löschen"
                                >
                                  <Trash2 size={15} aria-hidden />
                                </button>
                              </td>
                            </tr>
                          ))}
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
    </div>,
    document.body,
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

function TransferImportPreview({
  pending,
  busy,
  onConfirm,
  onCancel,
}: {
  pending: PendingImport;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const title = getImportPreviewTitle(pending);
  const rows = buildImportPreviewRows(pending);

  return (
    <section className={styles.previewBox} aria-label="Import-Vorschau">
      <div className={styles.previewHeader}>
        <div>
          <h3>{title}</h3>
          <p>{pending.filename}</p>
        </div>
        <span>{pending.kind === "scanJson" ? ".json" : ".sfdata"}</span>
      </div>
      <dl className={styles.previewGrid}>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.previewActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={busy}>
          <X size={15} aria-hidden />
          <span>Abbrechen</span>
        </button>
        <button type="button" className={styles.primaryButton} onClick={onConfirm} disabled={busy}>
          <Check size={15} aria-hidden />
          <span>{busy ? "Importiert..." : "Import bestätigen"}</span>
        </button>
      </div>
    </section>
  );
}

function getImportPreviewTitle(pending: PendingImport) {
  if (pending.kind === "scanJson") return "SFtools-Scan importieren";
  if (pending.envelope.type === "scan") return "SFtools-Scan importieren";
  if (pending.envelope.type === "scanpack") return "Scanpack importieren";
  if (pending.envelope.type === "fighttrackerpack") return "Fight-Tracker-Pack importieren";
  return "Fight Tracker importieren";
}

function buildImportPreviewRows(pending: PendingImport): Array<{ label: string; value: string }> {
  if (pending.kind === "scanJson") {
    return buildScanPreviewRows(pending.scan);
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

function buildScanPreviewRows(scan: SfDataHubLocalScan): Array<{ label: string; value: string }> {
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
