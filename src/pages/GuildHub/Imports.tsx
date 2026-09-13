import React from "react";
import { Trash2, Upload } from "lucide-react";
import ContentShell from "../../components/ContentShell";
import GuildContextBar from "../../components/guilds/GuildContextBar";
import {
  deleteGuildHubLocalScans,
  importGuildHubLocalScan,
  listGuildHubLocalScans,
  subscribeToSfDataHubLocalScanChanges,
  type GuildHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
import { useGuildHubParams } from "./hooks/useGuildHubParams";

type ImportFeedback = {
  imported: string[];
  duplicates: string[];
  errors: Array<{ filename: string; message: string }>;
};

export default function GuildHubImports() {
  useGuildHubParams();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [scans, setScans] = React.useState<GuildHubLocalScan[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<ImportFeedback | null>(null);
  const [storageError, setStorageError] = React.useState<string | null>(null);

  const loadScans = React.useCallback(async () => {
    setStorageError(null);
    try {
      const rows = await listGuildHubLocalScans();
      setScans(rows);
      setSelectedIds((current) => new Set(rows.filter((scan) => current.has(scan.id)).map((scan) => scan.id)));
    } catch (error) {
      console.error("[GuildHubImport] failed to load local scans", error);
      setStorageError("Lokale Scans konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadScans();
    return subscribeToSfDataHubLocalScanChanges(() => {
      void loadScans();
    });
  }, [loadScans]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    setImporting(true);
    setStorageError(null);

    const nextFeedback: ImportFeedback = { imported: [], duplicates: [], errors: [] };

    for (const file of files) {
      try {
        const content = await file.text();
        const result = await importGuildHubLocalScan(file.name, content);
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
    setImporting(false);
  };

  const toggleScan = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      if (scans.length > 0 && scans.every((scan) => current.has(scan.id))) {
        return new Set();
      }

      return new Set(scans.map((scan) => scan.id));
    });
  };

  const deleteSelectedScans = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    setDeleting(true);
    setStorageError(null);
    try {
      await deleteGuildHubLocalScans(ids);
      setSelectedIds(new Set());
      setFeedback(null);
      await loadScans();
    } catch (error) {
      console.error("[GuildHubImport] failed to delete local scans", error);
      setStorageError("Ausgewählte Scans konnten nicht gelöscht werden.");
    } finally {
      setDeleting(false);
    }
  };

  const allVisibleSelected = scans.length > 0 && scans.every((scan) => selectedIds.has(scan.id));

  return (
    <ContentShell
      title="Import"
      subtitle="SF-Tools-Scans lokal importieren und verwalten."
      actions={
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: "#2B6DE0", background: "#1C3554" }}
          onClick={handleImportClick}
          disabled={importing || deleting}
        >
          <Upload size={16} aria-hidden />
          {importing ? "Importiere..." : "SF-Tools JSON importieren"}
        </button>
      }
      centerFramed={false}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      <div className="space-y-4">
        <GuildContextBar />
        <FeedbackPanel feedback={feedback} storageError={storageError} />

        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: "#2B4C73", background: "#152A42", color: "#F5F9FF" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Lokale Scans</h2>
            {selectedIds.size > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: "#5D3650", color: "#F6B8CA" }}
                onClick={deleteSelectedScans}
                disabled={deleting || importing}
              >
                <Trash2 size={14} aria-hidden />
                {deleting ? "Lösche..." : "Ausgewählte löschen"}
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="text-xs" style={{ color: "#B0C4D9" }}>
              Lokale Scans werden geladen.
            </p>
          ) : scans.length ? (
            <ScanTable
              scans={scans}
              selectedIds={selectedIds}
              allVisibleSelected={allVisibleSelected}
              onToggleScan={toggleScan}
              onToggleAllVisible={toggleAllVisible}
            />
          ) : (
            <p className="text-xs" style={{ color: "#B0C4D9" }}>
              Noch keine Scans importiert.
            </p>
          )}
        </section>
      </div>
    </ContentShell>
  );
}

function FeedbackPanel({
  feedback,
  storageError,
}: {
  feedback: ImportFeedback | null;
  storageError: string | null;
}) {
  if (!feedback && !storageError) return null;

  return (
    <section
      className="rounded-2xl border p-4 text-xs"
      style={{ borderColor: storageError ? "#5D3650" : "#2B4C73", background: "#102238", color: "#B0C4D9" }}
    >
      {storageError ? <p style={{ color: "#F6B8CA" }}>{storageError}</p> : null}
      {feedback?.imported.length ? (
        <p style={{ color: "#B7D4FF" }}>
          Importiert: {feedback.imported.join(", ")}
        </p>
      ) : null}
      {feedback?.duplicates.length ? (
        <p className="mt-1">
          Bereits importiert: {feedback.duplicates.join(", ")}
        </p>
      ) : null}
      {feedback?.errors.length ? (
        <div className="mt-1 space-y-1" style={{ color: "#F6B8CA" }}>
          {feedback.errors.map((entry) => (
            <p key={`${entry.filename}:${entry.message}`}>
              {entry.filename}: {entry.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ScanTable({
  scans,
  selectedIds,
  allVisibleSelected,
  onToggleScan,
  onToggleAllVisible,
}: {
  scans: GuildHubLocalScan[];
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  onToggleScan: (id: string) => void;
  onToggleAllVisible: () => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#2B4C73" }}>
      <table className="min-w-full border-collapse text-left text-xs">
        <thead style={{ background: "#102238", color: "#B0C4D9" }}>
          <tr>
            <th className="w-12 px-3 py-3">
              <input
                type="checkbox"
                aria-label="Alle sichtbaren Scans auswählen"
                checked={allVisibleSelected}
                onChange={onToggleAllVisible}
              />
            </th>
            <th className="px-3 py-3 font-semibold">Zeitpunkt</th>
            <th className="px-3 py-3 font-semibold">Server</th>
            <th className="px-3 py-3 text-right font-semibold">Spieler</th>
            <th className="px-3 py-3 text-right font-semibold">Gilden</th>
            <th className="px-3 py-3 font-semibold">Datei</th>
          </tr>
        </thead>
        <tbody>
          {scans.map((scan) => (
            <tr key={scan.id} className="border-t" style={{ borderColor: "#2B4C73" }}>
              <td className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={`${scan.filename} auswählen`}
                  checked={selectedIds.has(scan.id)}
                  onChange={() => onToggleScan(scan.id)}
                />
              </td>
              <td className="whitespace-nowrap px-3 py-3" style={{ color: "#F5F9FF" }}>
                {formatScanDate(scan.scannedAt)}
              </td>
              <td className="max-w-[220px] px-3 py-3" style={{ color: "#B0C4D9" }}>
                <span className="block truncate" title={scan.servers.join(", ") || "Unbekannt"}>
                  {scan.servers.length ? scan.servers.join(", ") : "Unbekannt"}
                </span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#F5F9FF" }}>
                {scan.playerCount}
              </td>
              <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#F5F9FF" }}>
                {typeof scan.guildCount === "number" ? scan.guildCount : scan.groupCount}
              </td>
              <td className="max-w-[260px] px-3 py-3" style={{ color: "#B0C4D9" }}>
                <span className="block truncate" title={scan.filename}>
                  {scan.filename}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatScanDate(value: string | null) {
  if (!value) return "Unbekannt";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unbekannt";

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
