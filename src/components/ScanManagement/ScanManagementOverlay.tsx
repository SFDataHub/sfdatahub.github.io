import React from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Trash2, Upload, X } from "lucide-react";

import { useBackClose } from "../../hooks/useBackClose";
import {
  deleteSfDataHubLocalScans,
  importSfDataHubLocalScan,
  listSfDataHubLocalScans,
  subscribeToSfDataHubLocalScanChanges,
  updateSfDataHubLocalScan,
  type SfDataHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
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

function formatServerList(scan: SfDataHubLocalScan) {
  return scan.servers.length ? scan.servers.join(", ") : "Unbekannt";
}

function getScanGuildCount(scan: SfDataHubLocalScan) {
  return typeof scan.guildCount === "number" ? scan.guildCount : scan.groupCount;
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

  useBackClose(isOpen, onClose);

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

  React.useEffect(() => {
    if (!isOpen) return;
    void loadScans();
    return subscribeToSfDataHubLocalScanChanges(() => {
      void loadScans();
    });
  }, [isOpen, loadScans]);

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

    const nextFeedback = createEmptyFeedback();

    for (const file of files) {
      try {
        const content = await file.text();
        const result = await importSfDataHubLocalScan(file.name, content);
        if (result.status === "duplicate") {
          nextFeedback.duplicates.push(file.name);
        } else {
          nextFeedback.imported.push(file.name);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Datei konnte nicht importiert werden.";
        nextFeedback.errors.push({ filename: file.name, message });
      }
    }

    setFeedback(nextFeedback);
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

  const allVisibleSelected = scans.length > 0 && scans.every((scan) => selectedIds.has(scan.id));

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-management-title"
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h2 id="scan-management-title" className={styles.title}>
              Scanverwaltung
            </h2>
            <p className={styles.subtitle}>Lokale SFTools-Scans für den SFDataHub verwalten</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Scanverwaltung schließen">
            <X size={18} aria-hidden />
            <span>Schließen</span>
          </button>
        </header>

        <div className={styles.body}>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
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

          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => importInputRef.current?.click()}
              disabled={busy}
            >
              <Upload size={16} aria-hidden />
              <span>{busy ? "Verarbeite..." : "Scan importieren"}</span>
            </button>
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

          {storageError ? <div className={styles.errorBox}>{storageError}</div> : null}
          {hasFeedback(feedback) ? <FeedbackBox feedback={feedback!} /> : null}

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
      </div>
    </div>,
    document.body,
  );
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
