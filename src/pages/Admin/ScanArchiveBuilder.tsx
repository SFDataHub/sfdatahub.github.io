import React from "react";
import { AlertTriangle, CheckCircle2, Download, FileArchive, RefreshCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import {
  ScanArchiveBuilderSession,
  ScanArchiveBuilderCancelledError,
  type ScanArchiveBuilderRun,
} from "../../lib/scanArchive/scanArchiveBuilderClient";
import {
  loadScanArchiveBuilderCatalogManifest,
  parseScanArchiveBuilderManifestOverride,
} from "../../lib/scanArchive/scanArchiveBuilderManifest";
import type {
  ScanArchiveBuilderBlocker,
  ScanArchiveBuilderInspection,
  ScanArchiveBuilderManifestSource,
  ScanArchiveBuilderProgress,
  ScanArchiveBuilderResult,
  ScanArchiveBuilderUsageMode,
} from "../../lib/scanArchive/scanArchiveBuilderTypes";
import type { ScanArchiveManifest } from "../../lib/scanArchive/types";
import styles from "./ScanArchiveBuilder.module.css";

type ManifestState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | { status: "ready"; manifest: ScanArchiveManifest; source: ScanArchiveBuilderManifestSource }
  | { status: "error"; blocker: ScanArchiveBuilderBlocker };

const emptyManifestState: ManifestState = { status: "idle" };

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const blocker = (code: string, cause: string, remedy: string): ScanArchiveBuilderBlocker => ({ code, cause, remedy });

function BlockerList({ blockers }: { blockers: ScanArchiveBuilderBlocker[] }) {
  if (!blockers.length) return null;
  return (
    <div className={`${styles.status} ${styles.bad}`} role="alert">
      <div className={styles.row}>
        <AlertTriangle size={16} aria-hidden />
        <strong>Export blocked</strong>
      </div>
      <ul className={styles.list}>
        {blockers.map((item) => (
          <li key={`${item.code}:${item.cause}`}>
            <span>{item.cause}</span>
            <br />
            <span className={styles.small}>{item.remedy}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

export default function AdminScanArchiveBuilderPage() {
  const { t } = useTranslation();
  const [inputFile, setInputFile] = React.useState<File | null>(null);
  const [inspection, setInspection] = React.useState<ScanArchiveBuilderInspection | null>(null);
  const [usageMode, setUsageMode] = React.useState<ScanArchiveBuilderUsageMode | null>(null);
  const [manifestMode, setManifestMode] = React.useState<"catalog" | "override">("catalog");
  const [manifestState, setManifestState] = React.useState<ManifestState>(emptyManifestState);
  const [progress, setProgress] = React.useState<ScanArchiveBuilderProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ScanArchiveBuilderResult | null>(null);
  const [zipUrl, setZipUrl] = React.useState<string | null>(null);
  const sessionRef = React.useRef<ScanArchiveBuilderSession | null>(null);
  const inspectRunRef = React.useRef<ScanArchiveBuilderRun<ScanArchiveBuilderInspection> | null>(null);
  const buildRunRef = React.useRef<ScanArchiveBuilderRun<ScanArchiveBuilderResult> | null>(null);
  const lastZipUrlRef = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      inspectRunRef.current?.cancel();
      buildRunRef.current?.cancel();
      sessionRef.current?.terminate();
      if (lastZipUrlRef.current) URL.revokeObjectURL(lastZipUrlRef.current);
    },
    [],
  );

  const clearZip = React.useCallback(() => {
    setZipUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      lastZipUrlRef.current = null;
      return null;
    });
  }, []);

  const resetResult = React.useCallback(() => {
    clearZip();
    setResult(null);
    setError(null);
  }, [clearZip]);

  const handleFileChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      inspectRunRef.current?.cancel();
      buildRunRef.current?.cancel();
      sessionRef.current?.terminate();
      sessionRef.current = null;
      resetResult();
      setInputFile(file);
      setInspection(null);
      setUsageMode(null);
      setManifestState(emptyManifestState);
      setProgress(null);
      setManifestMode("catalog");
      if (!file) return;

      const session = new ScanArchiveBuilderSession();
      sessionRef.current = session;
      const run = session.inspect({
        inputFile: file,
        onProgress: setProgress,
      });
      inspectRunRef.current = run;
      run.promise
        .then((nextInspection) => {
          if (inspectRunRef.current?.requestId !== run.requestId) return;
          setInspection(nextInspection);
          setProgress(null);
        })
        .catch((caught) => {
          if (caught instanceof ScanArchiveBuilderCancelledError) return;
          setError(caught instanceof Error ? caught.message : String(caught));
          setProgress(null);
        });
    },
    [resetResult],
  );

  React.useEffect(() => {
    if (!inputFile || !inspection || manifestMode !== "catalog") return;
    if (inspection.blockers.length || inspection.years.length !== 1) {
      setManifestState(emptyManifestState);
      return;
    }
    let cancelled = false;
    const year = inspection.years[0];
    setManifestState({ status: "loading", message: "Catalog and year manifest are loading." });
    loadScanArchiveBuilderCatalogManifest({ year })
      .then((manifestResult) => {
        if (cancelled) return;
        setManifestState(manifestResult);
      });
    return () => {
      cancelled = true;
    };
  }, [inputFile, inspection, manifestMode]);

  const handleOverrideChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      resetResult();
      if (!file) {
        setManifestMode("catalog");
        setManifestState(emptyManifestState);
        return;
      }
      setManifestMode("override");
      setManifestState({ status: "loading", message: "Manifest override is being validated." });
      try {
        const year = inspection?.years.length === 1 ? inspection.years[0] : undefined;
        if (!year) {
          throw blocker(
            "override_without_input_year",
            "The input file year must be known before a manifest override can be validated.",
            "Load a valid single-year SFtools JSON first, then choose the override manifest.",
          );
        }
        setManifestState(parseScanArchiveBuilderManifestOverride({ content: await file.text(), filename: file.name, year }));
      } catch (caught) {
        const item =
          typeof caught === "object" && caught != null && "cause" in caught && "remedy" in caught
            ? (caught as ScanArchiveBuilderBlocker)
            : blocker(
                "override_manifest_invalid",
                caught instanceof Error ? caught.message : "The override manifest is invalid.",
                "Upload a manifest.json for the same archive year as the input file.",
              );
        setManifestState({ status: "error", blocker: item });
      }
    },
    [inspection, resetResult],
  );

  const handleUsageModeChange = React.useCallback(
    (mode: ScanArchiveBuilderUsageMode) => {
      setUsageMode(mode);
      resetResult();
    },
    [resetResult],
  );

  const blockers = React.useMemo(() => {
    const items: ScanArchiveBuilderBlocker[] = [];
    if (!inputFile) items.push(blocker("input_missing", "No SFtools JSON file is selected.", "Choose the raw export file first."));
    if (inspection?.blockers.length) items.push(...inspection.blockers);
    if (manifestState.status === "error") items.push(manifestState.blocker);
    if (inspection && !inspection.blockers.length && inspection.years.length === 1 && manifestState.status === "ready" && manifestState.manifest.archiveYear !== inspection.years[0]) {
      items.push(blocker("manifest_year_mismatch", "The manifest year does not match the input file year.", "Load the matching catalog manifest or override."));
    }
    if (inputFile && inspection && !inspection.blockers.length && manifestState.status === "ready" && !usageMode) {
      items.push(blocker(
        "monthly_role_missing",
        "The builder cannot infer whether this import should update monthly toplist references.",
        "Choose whether to use the scans as monthly scans or archive them as DataHub scans only.",
      ));
    }
    return items;
  }, [inputFile, inspection, manifestState, usageMode]);

  const canBuild = Boolean(inputFile && inspection && manifestState.status === "ready" && blockers.length === 0 && !progress);

  const handleBuild = React.useCallback(() => {
    if (!inputFile || !inspection || !usageMode || manifestState.status !== "ready" || !canBuild || !sessionRef.current) return;
    buildRunRef.current?.cancel();
    resetResult();
    const run = sessionRef.current.build({
      inspectionId: inspection.inspectionId,
      manifest: manifestState.manifest,
      manifestSource: manifestState.source,
      usageMode,
      replaceMonthly: true,
      allowCurrentRollback: false,
      onProgress: setProgress,
    });
    buildRunRef.current = run;
    run.promise
      .then((nextResult) => {
        if (buildRunRef.current?.requestId !== run.requestId) return;
        setResult(nextResult);
        if (!nextResult.blockers.length && nextResult.zipBytes.byteLength > 0) {
          const nextUrl = URL.createObjectURL(new Blob([nextResult.zipBytes], { type: "application/zip" }));
          lastZipUrlRef.current = nextUrl;
          setZipUrl(nextUrl);
        }
        setProgress(null);
      })
      .catch((caught) => {
        if (caught instanceof ScanArchiveBuilderCancelledError) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setProgress(null);
      });
  }, [canBuild, inputFile, inspection, manifestState, resetResult, usageMode]);

  const cancelBuild = React.useCallback(() => {
    buildRunRef.current?.cancel();
    inspectRunRef.current?.cancel();
    sessionRef.current?.terminate();
    sessionRef.current = null;
    setInspection(null);
    setUsageMode(null);
    setManifestState(emptyManifestState);
    setProgress(null);
    resetResult();
  }, [resetResult]);

  const manifestDescription =
    manifestState.status === "ready"
      ? manifestState.source.kind === "catalog"
        ? `Catalog manifest ${manifestState.source.year}, ${manifestState.source.scanCount} scans`
        : `Override ${manifestState.source.filename}, ${manifestState.source.scanCount} scans`
      : manifestState.status === "loading"
        ? manifestState.message
        : "Waiting for a valid single-year input.";

  return (
    <ContentShell
      title={t("scanArchiveBuilder.title", "Scan Archive Builder")}
      subtitle={t("scanArchiveBuilder.subtitle", "Build a clean yearly archive ZIP from raw SFtools JSON.")}
      leftWidth={0}
      rightWidth={0}
      centerFramed
    >
      <div className={styles.page}>
        <div className={styles.grid}>
          <section className={`${styles.panel} ${styles.stack}`}>
            <div>
              <h2 className={styles.title}>Input</h2>
              <p className={styles.muted}>Raw SFtools JSON must contain only top-level players[] and groups[] data for one archive year.</p>
            </div>
            <input className={styles.fileInput} type="file" accept="application/json,.json" onChange={handleFileChange} />
            {inputFile ? <span className={styles.small}>{inputFile.name} · {formatBytes(inputFile.size)}</span> : null}
            {inspection ? (
              <div className={`${styles.status} ${inspection.blockers.length ? styles.bad : styles.good}`}>
                <div className={styles.row}>
                  {inspection.blockers.length ? <AlertTriangle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
                  <strong>{inspection.blockers.length ? "Input needs attention" : "Input validated"}</strong>
                </div>
                <div className={styles.small}>
                  Years: {inspection.years.join(", ") || "-"} · Months: {inspection.months.join(", ") || "-"} · Servers: {inspection.servers.join(", ") || "-"} · Batches: {inspection.batchCount}
                </div>
              </div>
            ) : null}
          </section>

          <aside className={`${styles.panel} ${styles.stack}`}>
            <div>
              <h2 className={styles.title}>Manifest</h2>
              <p className={styles.muted}>{manifestDescription}</p>
            </div>
            <label className={styles.checkbox}>
              <input type="radio" checked={manifestMode === "catalog"} onChange={() => setManifestMode("catalog")} />
              Auto-load catalog manifest
            </label>
            <label className={styles.checkbox}>
              <input type="radio" checked={manifestMode === "override"} onChange={() => setManifestMode("override")} />
              Manual override
            </label>
            <input className={styles.fileInput} type="file" accept="application/json,.json" onChange={handleOverrideChange} />
          </aside>
        </div>

        <section className={`${styles.panel} ${styles.stack}`}>
          <h2 className={styles.title}>Toplist changes</h2>
          <div className={styles.optionGrid} role="radiogroup" aria-label="Toplist update role">
            <label className={`${styles.option} ${usageMode === "monthly" ? styles.optionActive : ""}`}>
              <input
                type="radio"
                name="scanArchiveUsageMode"
                checked={usageMode === "monthly"}
                onChange={() => handleUsageModeChange("monthly")}
              />
              <span>
                <strong>Use as monthly scan</strong>
                <span className={styles.small}>
                  Archive scans and update monthly/current references by the existing builder rules.
                </span>
              </span>
            </label>
            <label className={`${styles.option} ${usageMode === "archive-only" ? styles.optionActive : ""}`}>
              <input
                type="radio"
                name="scanArchiveUsageMode"
                checked={usageMode === "archive-only"}
                onChange={() => handleUsageModeChange("archive-only")}
              />
              <span>
                <strong>Archive as DataHub scan only</strong>
                <span className={styles.small}>
                  Add scan and search sidecar files, but leave current and monthly toplist references unchanged.
                </span>
              </span>
            </label>
          </div>
          <p className={styles.muted}>
            {usageMode === "monthly"
              ? "Complete imported scans update monthly and current archive selections by the builder rules."
              : usageMode === "archive-only"
                ? "The scan is archived for DataHub, with no toplist reference changes."
                : "Choose how this import should be used before building the ZIP."}
          </p>
          {inspection?.months.length ? <span className={styles.small}>Input months: {inspection.months.join(", ")}</span> : null}
        </section>

        {progress ? (
          <DataHubLoadingState
            title="Scan archive package"
            message={progress.message}
            current={progress.current}
            total={progress.total}
            progressLabel="batches"
          />
        ) : null}

        {error ? (
          <div className={`${styles.status} ${styles.bad}`} role="alert">
            <strong>{error}</strong>
          </div>
        ) : null}

        <BlockerList blockers={blockers} />
        {result ? <BlockerList blockers={result.blockers} /> : null}

        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={handleBuild} disabled={!canBuild}>
            <FileArchive size={16} aria-hidden />
            Build ZIP
          </button>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={cancelBuild} disabled={!progress}>
            <X size={16} aria-hidden />
            Cancel
          </button>
          <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => window.location.reload()}>
            <RefreshCcw size={16} aria-hidden />
            Reset
          </button>
          {zipUrl && result ? (
            <a className={styles.button} href={zipUrl} download={result.zipFilename}>
              <Download size={16} aria-hidden />
              Download ZIP
            </a>
          ) : (
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled>
              <Download size={16} aria-hidden />
              Download ZIP
            </button>
          )}
        </div>

        {result ? (
          <section className={`${styles.panel} ${styles.stack}`}>
            <h2 className={styles.title}>Result</h2>
            <div className={styles.metrics}>
              <Metric label="New scans" value={result.summary.newScans} />
              <Metric label="Files to write" value={result.summary.filesToWrite} />
              <Metric label="ZIP size" value={formatBytes(result.summary.zipBytes)} />
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Kind</th>
                  <th>Path</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {result.files.map((file) => (
                  <tr key={`${file.kind}:${file.relativePath}`}>
                    <td>{file.action}</td>
                    <td>{file.kind}</td>
                    <td>{file.relativePath}</td>
                    <td>{formatBytes(file.compressedBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <div className={styles.small}>
          ZIP contents are limited to manifest.json plus newly generated .json.gz and .search.json.gz files.
        </div>
      </div>
    </ContentShell>
  );
}
