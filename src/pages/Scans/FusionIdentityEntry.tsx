import { hubMessage } from "../../lib/i18n/dataHubPresentation";
import React from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useLocation, useNavigate } from "react-router-dom";
import { DATA_HUB } from "../../lib/data-hub/routes";
import { listSfDataHubScanSummaries, subscribeToSfDataHubLocalScanChanges, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import type { FusionIdentityScopeInventory } from "../../lib/identities/fusionDashboardInventory";
import { fastLoadEntryServerCode, getFusionIdentityFastLoadOptions, getFusionIdentityFastLoadScanCounts, getFusionIdentityFastLoadMissingBasis, selectFusionIdentityFastLoadEntries } from "../../lib/identities/fusionIdentityFastLoad";
import { listFusionIdentityAnalysisScopes } from "../../lib/identities/fusionIdentityScopes";
import { loadScanArchiveEntries } from "../../lib/scanArchive/client";
import { acquireExplicitLocalFirstArchiveScans } from "../../lib/scanArchive/localFirstScanAcquisition";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import { findArchiveOverviewLocal } from "../../components/ScanManagement/scanArchiveOverview";
import styles from "./FusionIdentity.module.css";

export default function FusionIdentityEntry({ scanCount, scopes, needed, server, inventoryLoading }: {
  scanCount: number | null; scopes: readonly FusionIdentityScopeInventory[]; needed: boolean;
  server: string; inventoryLoading: boolean;
}) {
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const [entries, setEntries] = React.useState<ScanArchiveEntry[]>([]);
  const [summaries, setSummaries] = React.useState<GuildHubScanSummary[]>([]);
  const [metadataLoading, setMetadataLoading] = React.useState(true);
  const [metadataError, setMetadataError] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const [yearSelection, setYearSelection] = React.useState({ server: "", year: 0 });
  const [jobTarget, setJobTarget] = React.useState<{ server: string; year: number } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState({ total: 0, succeeded: 0, failed: 0 });
  const [outcome, setOutcome] = React.useState<"complete" | "cancelled" | "failed" | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const controllerRef = React.useRef<AbortController | null>(null);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controllerRef.current?.abort(); };
  }, []);
  React.useEffect(() => {
    let current = true;
    setMetadataLoading(true); setMetadataError(null);
    void loadScanArchiveEntries().then(rows => { if (current) setEntries(rows); })
      .catch(error => { if (current) setMetadataError(String(error instanceof Error ? error.message : error)); })
      .finally(() => { if (current) setMetadataLoading(false); });
    return () => { current = false; };
  }, [retry]);
  React.useEffect(() => {
    let current = true, request = 0;
    const read = async () => {
      const id = ++request;
      try {
        const rows = await listSfDataHubScanSummaries();
        if (current && id === request) { setSummaries(rows); setLocalError(null); }
      } catch (error) {
        if (current && id === request) setLocalError(String(error instanceof Error ? error.message : error));
      }
    };
    void read();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(() => { void read(); });
    return () => { current = false; unsubscribe(); };
  }, [retry]);
  const definitions = React.useMemo(() => listFusionIdentityAnalysisScopes(), []);
  const options = React.useMemo(() => getFusionIdentityFastLoadOptions(entries, definitions), [entries, definitions]);
  const selected = options.find(row => row.server === server);
  const selectedYear = yearSelection.server === server && selected?.years.includes(yearSelection.year)
    ? yearSelection.year : selected?.years[0] ?? 0;
  const selection = React.useMemo(() => selected ? selectFusionIdentityFastLoadEntries(entries, selected.server, selectedYear, definitions) : [], [entries, selected, selectedYear, definitions]);
  const scanCounts = getFusionIdentityFastLoadScanCounts(selection, entry => !!findArchiveOverviewLocal(entry, summaries));
  const groups = [...new Set([...(server ? [server] : []), ...selection.map(fastLoadEntryServerCode)])];
  const predecessorServers = groups.filter(code => code !== selected?.server);
  const definition = definitions.find(row => row.targetServerCode === selected?.server);
  const inventory = scopes.find(row => row.scope.targetServerCode === selected?.server);
  const missingBasis = definition ? getFusionIdentityFastLoadMissingBasis(inventory) : null;
  const goToManagement = (archive: boolean) => navigate(`${DATA_HUB}/scan-management${archive ? "?tab=archive" : ""}`, {
    state: { returnTo: location.pathname + location.search, profileReturnState: location.state },
  });
  const load = async () => {
    if (controllerRef.current || !selection.length) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setJobTarget({ server, year: selectedYear });
    setRunning(true); setOutcome(null); setErrors([]);
    setProgress({ total: selection.length, succeeded: 0, failed: 0 });
    try {
      const result = await acquireExplicitLocalFirstArchiveScans(selection, {
        signal: controller.signal,
        onProgress: next => { if (mounted.current) setProgress(next); },
      });
      if (mounted.current) {
        setOutcome(controller.signal.aborted ? "cancelled" : result.failedArchives.length ? "failed" : "complete");
        setErrors(result.failedArchives.filter(row => row.errorCode !== "aborted").map(row => `${row.archiveScanId}: ${row.message}`));
      }
    } catch (error) {
      if (mounted.current) {
        setOutcome(controller.signal.aborted ? "cancelled" : "failed");
        if (!controller.signal.aborted) setErrors([String(error instanceof Error ? error.message : error)]);
      }
    } finally {
      if (mounted.current) {
        try { setSummaries(await listSfDataHubScanSummaries()); setLocalError(null); }
        catch (error) { setLocalError(String(error instanceof Error ? error.message : error)); }
        if (mounted.current) setRunning(false);
      }
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };
  if (scanCount === null || inventoryLoading || (!needed && !running)) return null;
  return <div className={styles.entry} data-identity-entry>
    {needed && <p className={styles.entryLead}>{t(scanCount === 0 ? "identityEntry.empty" : "identityEntry.noComparison", { server })}</p>}
    <section className={styles.entryLoad} aria-labelledby="identity-fast-load-title">
      <h2 id="identity-fast-load-title">{t("identityEntry.fastLoad")}</h2>
      <div className={styles.toolbar}>
        <label className={styles.fieldLabel}>{t("identityEntry.year")}
          <select className={styles.select} value={selectedYear || ""} disabled={metadataLoading || !selected?.years.length} onChange={event => { setYearSelection({ server, year: Number(event.target.value) }); if (!running) { setOutcome(null); setErrors([]); } }}>
            {selected?.years.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <p>{t("identityEntry.loadHint")}</p>
      {metadataLoading ? <p role="status">{t("identityEntry.reading")}</p> : metadataError ? <div role="alert" className={styles.errorState}>
        <span>{t("identityEntry.metadataError")}</span><span>{hubMessage(metadataError)}</span>
        <button type="button" className={styles.closeButton} onClick={() => setRetry(value => value + 1)}>{t("identityEntry.retry")}</button>
      </div> : <>{!selection.length && <p>{t("identityEntry.noArchive")}</p>}<div data-fast-load-preview>
        <p role="heading" aria-level={3}>{t("identityEntry.preview", { server: selected?.server, year: String(selectedYear) })}</p>
        <p>{t("identityEntry.predecessors", { servers: predecessorServers.join(", ") || t("identityEntry.none") })}</p>
        <ul>{groups.map(code => {
          const rows = selection.filter(entry => fastLoadEntryServerCode(entry) === code);
          const counts = getFusionIdentityFastLoadScanCounts(rows, entry => !!findArchiveOverviewLocal(entry, summaries));
          return <li key={code}>{t("identityEntry.serverPreview", { server: code, ...counts })}</li>;
        })}</ul>
        <p>{t("identityEntry.totalPreview", scanCounts)}</p>
      </div></>}
      {localError && <div role="alert" className={styles.errorState}>{t("identityEntry.localError")} {hubMessage(localError)}
        <button type="button" className={styles.closeButton} onClick={() => setRetry(value => value + 1)}>{t("identityEntry.retry")}</button>
      </div>}
      <div className={styles.rowActions}>
        <button type="button" className={styles.closeButton} disabled={running || metadataLoading || !!metadataError || !!localError || !selection.length} onClick={() => { void load(); }}>{t("identityEntry.load")}</button>
        {running && <button type="button" className={styles.closeButton} onClick={() => controllerRef.current?.abort()}>{t("identityEntry.cancel")}</button>}
      </div>
      {(running || (outcome && jobTarget?.server === server && jobTarget.year === selectedYear)) && <div role={outcome === "failed" ? "alert" : "status"} className={outcome === "failed" ? styles.errorState : styles.entryResult}>
        <p>{t("identityEntry.jobTarget", jobTarget ? { ...jobTarget, year: String(jobTarget.year) } : {})}</p>
        <p>{t(`identityEntry.${running ? "progress" : outcome}`, { current: progress.succeeded + progress.failed, total: progress.total, failed: progress.failed })}</p>
        {running && <progress max={Math.max(1, progress.total)} value={progress.succeeded + progress.failed} />}
        {errors.length > 0 && <ul>{errors.map((error, index) => <li key={index}>{hubMessage(error)}</li>)}</ul>}
      </div>}
    </section>
    {missingBasis && <aside className={styles.entryHelp}>
      <p>{t(`identityEntry.${missingBasis}`, { server: selected?.server })}</p>
    </aside>}
    {needed && <div className={styles.entryHelp}>
      <p>{t("identityEntry.explanation")}</p>
      <p>{t("identityEntry.comparisonHint")}</p>
      <button type="button" className={styles.closeButton} onClick={() => goToManagement(true)}>{t("identityEntry.toArchive")}</button>
      <button type="button" className={styles.closeButton} onClick={() => goToManagement(false)}>{t("identityEntry.toManagement")}</button>
    </div>}
  </div>;
}
