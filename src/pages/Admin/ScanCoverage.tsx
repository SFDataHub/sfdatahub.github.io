import React from "react";
import { AlertTriangle, CheckCircle2, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import {
  getSfDataHubLocalScan,
  listSfDataHubScanSummaries,
  subscribeToSfDataHubLocalScanChanges,
} from "../../lib/guilds/localScanLibrary";
import {
  formatServerIdentifier,
  toFiniteInteger,
  type ScanCoverageProgress,
  type ScanCoverageRankEntry,
  type ScanCoverageResult,
  type ScanCoverageScanOption,
  type ScanCoverageSelectionAnalysis,
} from "../../lib/guilds/scanCoverageAnalysis";
import {
  ScanCoverageWorkerCancelledError,
  startScanCoverageWorkerRun,
  type ScanCoverageWorkerRun,
} from "../../lib/guilds/scanCoverageWorkerClient";

const surfaceStyle: React.CSSProperties = {
  background: "#152A42",
  borderColor: "#2B4C73",
};

const insetSurfaceStyle: React.CSSProperties = {
  background: "#1A2F4A",
  borderColor: "#2B4C73",
};

const missingStyle: React.CSSProperties = {
  background: "rgba(255, 107, 107, 0.16)",
  borderColor: "rgba(255, 107, 107, 0.38)",
};

const LIMIT_STORAGE_PREFIX = "sfdatahub:scan-coverage:rankLimit:v1:";
const DEFAULT_LIMIT = 100;

const getStoredLimit = (server: string | null, fallback: number) => {
  if (typeof window === "undefined" || !server) return fallback;
  const raw = window.localStorage.getItem(`${LIMIT_STORAGE_PREFIX}${server.toLowerCase()}`);
  const parsed = toFiniteInteger(raw);
  return parsed != null && parsed > 0 ? parsed : fallback;
};

const storeLimit = (server: string | null, value: number) => {
  if (typeof window === "undefined" || !server || !Number.isFinite(value) || value < 1) return;
  window.localStorage.setItem(`${LIMIT_STORAGE_PREFIX}${server.toLowerCase()}`, String(Math.trunc(value)));
};

function QuickInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[145px] items-baseline gap-2">
      <span className="text-xs uppercase text-[#8AA5C4]">{label}</span>
      <span className="text-base font-semibold text-white">{value}</span>
    </div>
  );
}

function PlayerContext({ entry }: { entry: ScanCoverageRankEntry | null }) {
  if (!entry) return <span className="text-[#6F88A8]">-</span>;
  return (
    <span>
      <span className="font-semibold text-[#F5F9FF]">#{entry.rank}</span>
      <span className="ml-2 text-[#F5F9FF]">{entry.name}</span>
      <span className="ml-2 text-[#8AA5C4]">{entry.guildName || "ohne Gilde"}</span>
    </span>
  );
}

export default function AdminScanCoveragePage() {
  const { t } = useTranslation();
  const [scanOptions, setScanOptions] = React.useState<ScanCoverageScanOption[]>([]);
  const [selectedOptionId, setSelectedOptionId] = React.useState("");
  const [selectedServer, setSelectedServer] = React.useState("");
  const [rankLimit, setRankLimit] = React.useState(DEFAULT_LIMIT);
  const [loadingProgress, setLoadingProgress] = React.useState<ScanCoverageProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selectionAnalysis, setSelectionAnalysis] = React.useState<ScanCoverageSelectionAnalysis | null>(null);
  const [coveragePayload, setCoveragePayload] = React.useState<{
    server: string;
    rankLimit: number;
    coverage: ScanCoverageResult;
  } | null>(null);
  const optionsRunRef = React.useRef<ScanCoverageWorkerRun | null>(null);
  const selectionRunRef = React.useRef<ScanCoverageWorkerRun | null>(null);
  const coverageRunRef = React.useRef<ScanCoverageWorkerRun | null>(null);
  const loadSequenceRef = React.useRef(0);

  const isLoading = Boolean(loadingProgress);

  const getLoadingMessage = React.useCallback(
    (progress: ScanCoverageProgress) =>
      t(`scanCoverage.loading.phases.${progress.phase}`, progress.message),
    [t],
  );

  const cancelWorkerRuns = React.useCallback(() => {
    loadSequenceRef.current += 1;
    optionsRunRef.current?.cancel();
    selectionRunRef.current?.cancel();
    coverageRunRef.current?.cancel();
    optionsRunRef.current = null;
    selectionRunRef.current = null;
    coverageRunRef.current = null;
  }, []);

  const loadSummaries = React.useCallback(async () => {
    const loadSequence = (loadSequenceRef.current += 1);
    optionsRunRef.current?.cancel();
    selectionRunRef.current?.cancel();
    coverageRunRef.current?.cancel();
    setError(null);
    setScanOptions([]);
    setSelectionAnalysis(null);
    setCoveragePayload(null);
    setLoadingProgress({
      phase: "loading-local-scans",
      message: "Lokale Scans werden geladen",
    });
    try {
      const rows = await listSfDataHubScanSummaries();
      if (loadSequenceRef.current !== loadSequence) return;
      const visibleRows = rows.filter((row) => !row.containedInScanSlotId);
      const scans = [];
      for (let index = 0; index < visibleRows.length; index += 1) {
        if (loadSequenceRef.current !== loadSequence) return;
        setLoadingProgress({
          phase: "loading-local-scans",
          current: index,
          total: visibleRows.length,
          message: "Lokale Scans werden geladen",
        });
        scans.push(await getSfDataHubLocalScan(visibleRows[index].sourceScanId));
      }
      if (loadSequenceRef.current !== loadSequence) return;
      setLoadingProgress({
        phase: "loading-local-scans",
        current: visibleRows.length,
        total: visibleRows.length,
        message: "Lokale Scans werden geladen",
      });

      const run = startScanCoverageWorkerRun({
        type: "build-options",
        summaries: visibleRows,
        scans,
        onProgress: setLoadingProgress,
      });
      optionsRunRef.current = run;
      const result = await run.promise;
      if (
        loadSequenceRef.current !== loadSequence ||
        optionsRunRef.current?.requestId !== run.requestId ||
        result.kind !== "options"
      ) {
        return;
      }
      setScanOptions(result.options);
    } catch (err) {
      if (err instanceof ScanCoverageWorkerCancelledError) return;
      console.error("[ScanCoverage] failed to load local scans", err);
      setError(t("scanCoverage.errors.loadScans", "Lokale Scans konnten nicht geladen werden."));
    } finally {
      if (loadSequenceRef.current === loadSequence) {
        setLoadingProgress(null);
        optionsRunRef.current = null;
      }
    }
  }, [t]);

  React.useEffect(() => {
    void loadSummaries();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(() => {
      void loadSummaries();
    });
    return () => {
      unsubscribe();
      cancelWorkerRuns();
    };
  }, [cancelWorkerRuns, loadSummaries]);

  React.useEffect(() => {
    if (!scanOptions.length) {
      setSelectedOptionId("");
      return;
    }
    setSelectedOptionId((current) => (scanOptions.some((option) => option.id === current) ? current : scanOptions[0].id));
  }, [scanOptions]);

  const selectedOption = React.useMemo(
    () => scanOptions.find((option) => option.id === selectedOptionId) ?? null,
    [scanOptions, selectedOptionId],
  );

  React.useEffect(() => {
    let cancelled = false;
    selectionRunRef.current?.cancel();
    coverageRunRef.current?.cancel();
    setSelectionAnalysis(null);
    setCoveragePayload(null);
    if (!selectedOption) {
      setSelectedServer("");
      return;
    }

    setError(null);
    setLoadingProgress({
      phase: "loading-local-scans",
      message: "Lokale Scans werden geladen",
    });

    getSfDataHubLocalScan(selectedOption.scanId)
      .then((loadedScan) => {
        if (cancelled) return null;
        if (!loadedScan) {
          throw new Error("Selected local scan not found.");
        }
        const run = startScanCoverageWorkerRun({
          type: "analyze-selection",
          scan: loadedScan,
          option: selectedOption,
          onProgress: setLoadingProgress,
        });
        selectionRunRef.current = run;
        return run.promise.then((result) => ({ run, result }));
      })
      .then((payload) => {
        if (!payload || cancelled) return;
        const { run, result } = payload;
        if (selectionRunRef.current?.requestId !== run.requestId || result.kind !== "selection") return;
        const { analysis } = result;
        setSelectionAnalysis(analysis);
        setSelectedServer((current) => {
          if (!analysis.serverOptions.length) return "";
          return analysis.serverOptions.includes(current) ? current : analysis.serverOptions[0];
        });
      })
      .catch((err) => {
        if (err instanceof ScanCoverageWorkerCancelledError) return;
        console.error("[ScanCoverage] failed to load selected scan", err);
        if (!cancelled) setError(t("scanCoverage.errors.loadSelectedScan", "Der ausgewählte Scan konnte nicht geladen werden."));
      })
      .finally(() => {
        if (!cancelled) setLoadingProgress(null);
        if (selectionRunRef.current) selectionRunRef.current = null;
      });
    return () => {
      cancelled = true;
      selectionRunRef.current?.cancel();
    };
  }, [selectedOption, t]);

  const serverOptions = selectionAnalysis?.serverOptions ?? [];

  React.useEffect(() => {
    if (!selectedServer) return;
    setRankLimit(getStoredLimit(selectedServer, DEFAULT_LIMIT));
  }, [selectedServer]);

  React.useEffect(() => {
    coverageRunRef.current?.cancel();
    setCoveragePayload(null);
    if (!selectionAnalysis || !selectedServer || rankLimit < 1) return;

    const run = startScanCoverageWorkerRun({
      type: "build-coverage",
      rankedPlayers: selectionAnalysis.rankedPlayers,
      selectedServer,
      rankLimit,
      onProgress: setLoadingProgress,
    });
    coverageRunRef.current = run;
    setLoadingProgress({
      phase: "building-coverage",
      current: 0,
      total: rankLimit,
      message: "Scan-Abdeckung wird erstellt",
    });

    run.promise
      .then((result) => {
        if (coverageRunRef.current?.requestId !== run.requestId || result.kind !== "coverage") return;
        setCoveragePayload({ server: selectedServer, rankLimit, coverage: result.coverage });
      })
      .catch((err) => {
        if (err instanceof ScanCoverageWorkerCancelledError) return;
        console.error("[ScanCoverage] failed to build coverage", err);
        setError(t("scanCoverage.errors.buildCoverage", "Die Scan-Abdeckung konnte nicht erstellt werden."));
      })
      .finally(() => {
        if (coverageRunRef.current?.requestId === run.requestId) {
          coverageRunRef.current = null;
          setLoadingProgress(null);
        }
      });
  }, [rankLimit, selectedServer, selectionAnalysis, t]);

  const handleLimitChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = toFiniteInteger(event.target.value);
    const next = Math.max(1, parsed ?? 1);
    setRankLimit(next);
    storeLimit(selectedServer, next);
  };

  const coverage =
    coveragePayload?.server === selectedServer && coveragePayload.rankLimit === rankLimit
      ? coveragePayload.coverage
      : null;
  const evaluableRanks = coverage?.rankedPlayers.length ?? 0;
  const showNoRanks = Boolean(selectedServer && !isLoading && coverage && evaluableRanks === 0);

  return (
    <ContentShell
      title="Scan-Abdeckung"
      subtitle="Lokale Hall-of-Fame-Ränge in gespeicherten SFtools-Scans prüfen"
      centerFramed={false}
      mode="page"
      actions={
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-[#F5F9FF] disabled:opacity-60"
          style={insetSurfaceStyle}
          onClick={() => void loadSummaries()}
          disabled={isLoading}
        >
          <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          Aktualisieren
        </button>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border p-4" style={surfaceStyle}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)]">
            <label className="block text-sm text-[#B0C4D9]">
              <span className="mb-1 block text-xs uppercase text-[#8AA5C4]">Lokaler Scan</span>
              <select
                className="w-full rounded-lg border bg-[#0F1E33] px-3 py-2 text-sm text-[#F5F9FF] outline-none"
                style={{ borderColor: "#2B4C73" }}
                value={selectedOptionId}
                onChange={(event) => setSelectedOptionId(event.target.value)}
                disabled={isLoading || !scanOptions.length}
              >
                {scanOptions.length ? (
                  scanOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))
                ) : (
                  <option value="">Keine lokalen Scans</option>
                )}
              </select>
            </label>

            <label className="block text-sm text-[#B0C4D9]">
              <span className="mb-1 block text-xs uppercase text-[#8AA5C4]">Server</span>
              <select
                className="w-full rounded-lg border bg-[#0F1E33] px-3 py-2 text-sm text-[#F5F9FF] outline-none"
                style={{ borderColor: "#2B4C73" }}
                value={selectedServer}
                onChange={(event) => setSelectedServer(event.target.value)}
                disabled={!serverOptions.length}
              >
                {serverOptions.length ? (
                  serverOptions.map((server) => (
                    <option key={server} value={server}>
                      {formatServerIdentifier(server)}
                    </option>
                  ))
                ) : (
                  <option value="">Kein Server</option>
                )}
              </select>
            </label>

            <label className="block text-sm text-[#B0C4D9]">
              <span className="mb-1 block text-xs uppercase text-[#8AA5C4]">Hof-Ränge prüfen bis</span>
              <input
                className="w-full rounded-lg border bg-[#0F1E33] px-3 py-2 text-sm text-[#F5F9FF] outline-none"
                style={{ borderColor: "#2B4C73" }}
                type="number"
                min={1}
                step={1}
                value={rankLimit}
                onChange={handleLimitChange}
                disabled={!selectedServer}
              />
            </label>
          </div>
        </section>

        {error ? (
          <section className="rounded-lg border p-4 text-sm text-[#FFD6D6]" style={missingStyle}>
            {error}
          </section>
        ) : null}

        {loadingProgress ? (
          <DataHubLoadingState
            title={t("scanCoverage.loading.title", "Scan-Abdeckung wird vorbereitet")}
            message={getLoadingMessage(loadingProgress)}
            current={loadingProgress.current}
            total={loadingProgress.total}
          />
        ) : !scanOptions.length ? (
          <section className="rounded-lg border p-5 text-sm text-[#B0C4D9]" style={surfaceStyle}>
            Keine lokalen Scans gefunden. Importiere zuerst SFtools-Scans in der lokalen Scanverwaltung.
          </section>
        ) : showNoRanks ? (
          <section className="rounded-lg border p-5" style={missingStyle}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[#FFB86B]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">Keine auswertbaren Hof-Ränge</h2>
                <p className="mt-1 text-sm text-[#FFD6D6]">
                  Im ausgewählten Scan wurden für {selectedServer} keine normalisierten
                  Hall-of-Fame-Ränge gefunden. Deshalb wird keine Vollständigkeit behauptet.
                </p>
              </div>
            </div>
          </section>
        ) : coverage ? (
          <>
            <section
              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-4 py-2"
              style={surfaceStyle}
            >
              <QuickInfoItem
                label={t("scanCoverage.quickInfo.playersInScan", "Spieler im Scan")}
                value={String(coverage.rankedPlayers.length)}
              />
              <QuickInfoItem
                label={t("scanCoverage.quickInfo.playersInRange", "Spieler im Prüfbereich")}
                value={String(coverage.capturedRanksInRange)}
              />
              <QuickInfoItem
                label={t("scanCoverage.quickInfo.missingPlayers", "Fehlende Spieler")}
                value={String(coverage.missingRanks.length)}
              />
              <span className="text-xs text-[#8AA5C4]">
                {t("scanCoverage.quickInfo.rangeMeta", "{{server}} · Prüfbereich 1–{{limit}}", {
                  server: formatServerIdentifier(selectedServer),
                  limit: rankLimit,
                })}
              </span>
            </section>

            <section className="rounded-lg border" style={surfaceStyle}>
              <header className="flex flex-col gap-2 border-b px-4 py-3 md:flex-row md:items-center md:justify-between" style={{ borderColor: "#2B4C73" }}>
                <div>
                  <h2 className="text-sm font-semibold text-[#F5F9FF]">Rangliste</h2>
                  <p className="text-xs text-[#8AA5C4]">
                    {t(
                      "scanCoverage.table.missingExplanation",
                      "Fehlende Spieler werden anhand unbelegter Hof-Rangplätze erkannt.",
                    )}
                  </p>
                </div>
                {coverage.missingRanks.length === 0 ? (
                  <div className="inline-flex items-center gap-2 text-xs text-[#8FE6B2]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Bereich vollständig
                  </div>
                ) : null}
              </header>

              <div className="max-h-[58vh] overflow-auto">
                <table className="w-full min-w-[780px] border-separate border-spacing-0 text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#102139] text-xs uppercase text-[#8AA5C4]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Rang</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Spieler</th>
                      <th className="px-4 py-3 font-semibold">Gilde</th>
                      <th className="px-4 py-3 font-semibold">Kontext</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.rows.map((row) =>
                      row.type === "captured" ? (
                        <tr key={`rank-${row.rank}`} className="border-t" style={{ borderColor: "#2B4C73" }}>
                          <td className="px-4 py-3 font-semibold text-[#F5F9FF]">#{row.rank}</td>
                          <td className="px-4 py-3 text-[#8FE6B2]">erfasst</td>
                          <td className="px-4 py-3 text-[#F5F9FF]">
                            {row.players.map((player) => player.name).join(", ")}
                          </td>
                          <td className="px-4 py-3 text-[#B0C4D9]">
                            {row.players.map((player) => player.guildName || "ohne Gilde").join(", ")}
                          </td>
                          <td className="px-4 py-3 text-[#6F88A8]">-</td>
                        </tr>
                      ) : (
                        <tr key={`missing-${row.rank}`} style={missingStyle}>
                          <td className="px-4 py-3 font-semibold text-[#FFD6D6]">#{row.rank}</td>
                          <td className="px-4 py-3 font-semibold text-[#FF8A8A]">fehlt</td>
                          <td className="px-4 py-3 text-[#FFD6D6]">
                            {t("scanCoverage.table.missingPlayer", "Fehlender Spieler")}
                          </td>
                          <td className="px-4 py-3 text-[#B0C4D9]">-</td>
                          <td className="px-4 py-3 text-xs text-[#B0C4D9]">
                            <div>
                              davor: <PlayerContext entry={row.previous} />
                            </div>
                            <div className="mt-1">
                              danach: <PlayerContext entry={row.next} />
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </ContentShell>
  );
}
