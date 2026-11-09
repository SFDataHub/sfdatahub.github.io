import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { preferencesStore, type DataHubSetupPreference } from "../../lib/settings/preferences";
import { listSfDataHubScanSummaries, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { buildSetupPlan, loadSetupArchive, normalizeSetupServers, prepareSetupPlan, setupServerGroups,
  type SetupArchive, type SetupPlan, type SetupProgress } from "../../lib/data-hub/setupPlan";
import { hubDate, hubNumber } from "../../lib/i18n/dataHubPresentation";
import { qaQuestionHref } from "../../lib/help/qaCatalog";
import { Archive, Database, GitMerge, Info, CircleCheck, ArrowRight, X } from "lucide-react";
import styles from "./DataHubSetup.module.css";

// Storage refusal keeps this document usable across real dashboard visits.
let sessionPreference: DataHubSetupPreference | undefined;
const initialPreference = () => sessionPreference ?? preferencesStore.getSnapshot().dataHubSetup;
const groups = setupServerGroups();

export default function DataHubSetup() {
  const { t } = useTranslation();
  const location = useLocation();
  const [draft, setDraft] = useState(() => ({ ...initialPreference(), servers: normalizeSetupServers(initialPreference().servers) }));
  // Dashboard mount owns the offer, never locale, focus, metadata or scan updates.
  const [open, setOpen] = useState(() => !initialPreference().hidden && !initialPreference().completed);
  const [step, setStep] = useState(1);
  const [hide, setHide] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [archive, setArchive] = useState<SetupArchive | null>(null);
  const [summaries, setSummaries] = useState<GuildHubScanSummary[]>([]);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState(false);
  const [metadataRetry, setMetadataRetry] = useState(0);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [runError, setRunError] = useState(false);
  const [progress, setProgress] = useState<SetupProgress>({ phase: "acquiring", complete: [], failed: [], total: 0 });
  const [confirmedPlan, setConfirmedPlan] = useState<SetupPlan | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const text = (key: string, options?: Record<string, unknown>) => t(`dataHubSetup.${key}`, options);
  const returnState = { returnTo: location.pathname + location.search, profileReturnState: location.state };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!open || step !== 3) return;
    const pending = new AbortController();
    setPlanning(true); setPlanError(false);
    void Promise.all([loadSetupArchive(pending.signal), listSfDataHubScanSummaries()]).then(([data, local]) => {
      if (pending.signal.aborted) return;
      setArchive(data); setSummaries(local);
      setDraft(previous => ({ ...previous, year: data.years.includes(previous.year ?? -1) ? previous.year : data.years[0] ?? null }));
    }).catch(() => { if (!pending.signal.aborted) setPlanError(true); })
      .finally(() => { if (!pending.signal.aborted) setPlanning(false); });
    return () => pending.abort();
  }, [open, step, metadataRetry]);

  const plan = useMemo(() => archive ? buildSetupPlan(archive, draft, summaries) : null, [archive, draft, summaries]);
  const persist = (value: DataHubSetupPreference) => {
    sessionPreference = value;
    const result = preferencesStore.savePreferences({ dataHubSetup: value }, preferencesStore.refresh());
    const saved = result.status === "saved" || result.status === "unchanged";
    setStorageError(!saved);
    return saved;
  };
  const close = () => {
    controller.current?.abort();
    persist({ ...draft, hidden: draft.hidden || hide });
    setOpen(false);
  };
  const closeRef = useRef(close); closeRef.current = close;
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      const target = previous?.isConnected && previous !== document.body ? previous : trigger.current;
      target?.focus({ preventScroll: true });
    };
  }, [open]);
  useLayoutEffect(() => { if (open) heading.current?.focus({ preventScroll: true }); }, [open, step]);
  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !dialog.current?.contains(document.activeElement)) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const controls = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open]);

  const start = async (retry = false) => {
    if (controller.current || !plan?.scans.length) return;
    const frozen = retry && confirmedPlan ? confirmedPlan : plan;
    const successful = retry ? progress.complete : [];
    const remaining = { ...frozen, scans: frozen.scans.filter(scan => !successful.includes(scan.id)) };
    const pending = new AbortController(); controller.current = pending;
    setConfirmedPlan(frozen); setStep(4); setRunning(true); setStopped(false); setRunError(false);
    setProgress({ phase: "acquiring", complete: successful, failed: [], total: frozen.scans.length });
    persist(draft);
    try {
      const result = await prepareSetupPlan(remaining, pending.signal, value => {
        if (mounted.current && !pending.signal.aborted) setProgress({ ...value, complete: [...successful, ...value.complete], total: frozen.scans.length });
      });
      if (!mounted.current || pending.signal.aborted) return;
      if (!result.failed.length && !frozen.missing.length && !frozen.failedYears.length) {
        const completed = { ...draft, completed: true };
        setDraft(completed); persist(completed); setStep(5);
      }
    } catch {
      if (mounted.current) { if (pending.signal.aborted) setStopped(true); else setRunError(true); }
    } finally {
      if (controller.current === pending) controller.current = null;
      if (mounted.current) setRunning(false);
    }
  };
  const reopen = () => {
    setStep(1); setHide(false); setStopped(false); setRunError(false); setConfirmedPlan(null);
    setProgress({ phase: "acquiring", complete: [], failed: [], total: 0 }); setOpen(true);
  };
  const selected = draft.servers.join(", ");
  const displayedPlan = step === 4 ? confirmedPlan : plan;
  const unresolved = displayedPlan && (displayedPlan.missing.length > 0 || displayedPlan.failedYears.length > 0);
  const helpQuestion = step === 1 ? "local-pool" : step === 2 ? "select-servers" : step === 5 ? "identity-purpose" : "load-archive";
  return <>
    <div className={styles.entry}>
      <button type="button" ref={trigger} onClick={reopen} className={styles.entryButton} data-setup-open>{text("entry")}</button>
      {storageError && !open && <p role="status">{text("storageError")}</p>}
    </div>
    {open && createPortal(<div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.panel} ref={dialog} role="dialog" aria-modal="true" aria-labelledby={id} data-setup-step={step}>
        <header className={styles.header}>
          <div className={styles.hud}>{text("title")}</div>
          <button type="button" className={styles.closeButton} onClick={close} aria-label={text("close")}><X aria-hidden="true" /></button>
          <ol className={styles.steps} aria-label={text("steps")}>
            {[1, 2, 3, 4, 5].map(value => <li key={value} className={styles.step} data-done={value < step} aria-current={step === value ? "step" : undefined}>
              <span aria-hidden="true">{hubNumber(value)}</span><b>{t(["dataHubSetup.step1", "dataHubI18n.server", "toplists.exportDialog.selection", "dataHubI18n.preparing", "dataHubSetup.step5"][value - 1])}</b>
            </li>)}
          </ol>
        </header>
        <div className={styles.body}>
          {step === 5 && <div className={styles.endIcon}><CircleCheck aria-hidden="true" /></div>}
          <div className={styles.eyebrow}>{text(step === 1 || step === 5 ? "title" : step === 2 ? "selected" : step === 3 ? "scope" : "progress")}</div>
          <h2 id={id} ref={heading} tabIndex={-1} className={styles.title}>{text(`step${step}`)}</h2>
          {storageError && <p role="status" className={styles.warning}>{text("storageError")}</p>}
          {step === 1 && <>
            <p>{text("welcome")}</p>
            <div className={styles.explainer}>
              <div className={styles.explainRow}><Archive aria-hidden="true" /><div><h3>{t("help.qa.sections.archive")}</h3><p>{text("pool")}</p></div></div>
              <div className={styles.explainRow}><Database aria-hidden="true" /><div><h3>{t("help.qa.sections.pool")}</h3><p>{text("reuse")}</p></div></div>
              <div className={styles.explainRow}><GitMerge aria-hidden="true" /><div><h3>{text("matching")}</h3><p>{text("identity")}</p></div></div>
            </div>
            <p className={styles.summaryText}>{text("direct")}</p>
          </>}
          {step === 2 && <>
            <p>{text("choose")}</p>
            <div className={styles.serverGroups}>
              {groups.map(group => <fieldset key={group.key} className={styles.serverGroup}>
                <legend>{group.key === "named" ? text("named") : group.key}</legend>
                <div className={styles.serverGrid}>{group.servers.map(server => <label key={server.code} className={styles.server} data-selected={draft.servers.includes(server.code)}>
                  <input type="checkbox" data-setup-server={server.code} checked={draft.servers.includes(server.code)} onChange={() => setDraft(previous => ({ ...previous,
                    servers: previous.servers.includes(server.code) ? previous.servers.filter(code => code !== server.code) : [...previous.servers, server.code],
                  }))} />{server.label}
                </label>)}</div>
              </fieldset>)}
            </div>
            <output className={styles.selectedLabel} data-setup-selection aria-live="polite">{text("selected")}: {selected || text("none")}</output>
            <div className={styles.inlineNote}><Info aria-hidden="true" /><span>{text("fusionHint")}</span></div>
          </>}
          {step === 3 && <>
            <div className={styles.review}>
              <div className={styles.reviewLine}><span>{text("selected")}</span><strong>{selected}</strong></div>
              <div className={styles.reviewLine}>
                <label htmlFor={`${id}-scope`}>{text("scope")}</label>
                <select id={`${id}-scope`} title={text(draft.scope === "year" ? "yearScope" : "comparison")} value={draft.scope} onChange={event => setDraft(previous => ({ ...previous, scope: event.target.value === "year" ? "year" : "comparison" }))}>
                  <option value="comparison">{text("comparison")}</option><option value="year">{text("yearScope")}</option>
                </select>
              </div>
              {draft.scope === "year" && <div className={styles.reviewLine}>
                <label htmlFor={`${id}-year`}>{text("year")}</label>
                <select id={`${id}-year`} value={draft.year ?? ""} onChange={event => setDraft(previous => ({ ...previous, year: Number(event.target.value) }))}>
                  {archive?.years.map(year => <option value={year} key={year}>{hubNumber(year, { useGrouping: false })}</option>)}
                </select>
              </div>}
              {!planning && plan && <>
                <div className={styles.reviewLine}><span>{text("predecessors")}</span><strong>{plan.predecessors.join(", ") || text("none")}</strong></div>
                <div className={styles.reviewLine}><span>{text("total")}</span><strong data-setup-total>{hubNumber(plan.scans.length)}</strong></div>
                <div className={styles.reviewLine}><span>{text("local")}</span><strong>{hubNumber(plan.local)}</strong></div>
                <div className={styles.reviewLine}><span>{text("needed")}</span><strong>{hubNumber(plan.scans.length - plan.local)}</strong></div>
              </>}
            </div>
            {planning && <p role="status">{text("planning")}</p>}
            {planError && <p role="alert" className={styles.warning}>{text("planError")}</p>}
            <p className={styles.small}>{text("comparisonHint")}</p>
            {!planning && !!plan?.entries.length && <p className={styles.small}>{text("period", { from: hubDate(Math.min(...plan.entries.map(entry => entry.timestamp))), to: hubDate(Math.max(...plan.entries.map(entry => entry.timestamp))) })}</p>}
            {(planError || !!plan?.failedYears.length) && <button type="button" className={styles.button} onClick={() => setMetadataRetry(value => value + 1)} disabled={planning}>{text("retryPlan")}</button>}
            <div className={styles.inlineNote}><GitMerge aria-hidden="true" /><span>{text("noConfirmation")}</span></div>
            <p className={styles.summaryText}>{text("imports")}</p><p className={styles.summaryText}>{text("history")}</p>
          </>}
          {(step === 3 || step === 4) && unresolved && <div className={styles.warning} role="status">
            {!!displayedPlan?.missing.length && <p>{text("missing", { servers: displayedPlan.missing.join(", ") })}</p>}
            {!!displayedPlan?.failedYears.length && <p>{text("failedYears", { years: displayedPlan.failedYears.map(year => hubNumber(year, { useGrouping: false })).join(", ") })}</p>}
            <p>{text("archiveLimits")}</p>
            <Link to="/data-hub/scan-management?tab=archive" state={returnState}>{text("archiveLink")}</Link>{" · "}
            <Link to="/data-hub/scan-management" state={returnState}>{text("importLink")}</Link>
          </div>}
          {step === 4 && <>
            <p>{text("selected")}: {selected}</p>
            <div className={styles.progressMeta}>
              <span role="status" aria-live="polite">{text(running ? `phase.${progress.phase}` : stopped ? "stopped" : runError || progress.failed.length ? "failed" : "partial")}</span>
              <span>{hubNumber(progress.complete.length)} / {hubNumber(progress.total)}</span>
            </div>
            <div className={styles.track} role="progressbar" aria-label={text("progress")} aria-valuemin={0} aria-valuemax={Math.max(1, progress.total)} aria-valuenow={progress.complete.length}
              aria-valuetext={text("prepared", { count: progress.complete.length, number: hubNumber(progress.complete.length), total: hubNumber(progress.total) })}>
              <div className={styles.trackFill} style={{ width: `${progress.total ? progress.complete.length / progress.total * 100 : 0}%` }} />
            </div>
            <div className={styles.loadRows}>
              {(["acquiring", "preparing", "composing"] as const).map((phase, index, phases) => <div key={phase} className={styles.loadRow}
                data-active={running && phase === progress.phase} data-done={index < phases.indexOf(progress.phase)}>
                <span className={styles.statusDot} aria-hidden="true" /><span>{text(`phase.${phase}`)}</span>
              </div>)}
            </div>
            <p className={styles.summaryText} data-setup-progress>{text("prepared", { count: progress.complete.length, number: hubNumber(progress.complete.length), total: hubNumber(progress.total) })}</p>
            <p className={styles.summaryText}>{text("keepData")}</p>
            {!!progress.failed.length && <p role="alert" className={styles.warning}>{text("failedScans", { count: progress.failed.length, number: hubNumber(progress.failed.length) })}</p>}
            <div className={styles.actions}>
              {!running && (stopped || runError || progress.complete.length < progress.total) && <button type="button" className={styles.button} onClick={() => void start(true)}>{text("retry")}</button>}
              {!running && <button type="button" className={styles.button} onClick={() => setStep(3)}>{text("changePlan")}</button>}
            </div>
          </>}
          {step === 5 && <>
            <p role="status">{text("success", { servers: selected })}</p><p className={styles.summaryText}>{text("moreData")}</p>
            <div className={styles.destinations}>
              <Link className={styles.destination} to="/data-hub/toplist"><strong>{text("toplist")} <ArrowRight aria-hidden="true" /></strong><span>{t("hubNavigation.toplistHint")}</span></Link>
              <Link className={styles.destination} to="/data-hub/player-hub"><strong>{text("search")} <ArrowRight aria-hidden="true" /></strong><span>{t("hubNavigation.playerHint")}</span></Link>
            </div>
            {!!confirmedPlan?.predecessors.length && <div className={styles.inlineNote}><GitMerge aria-hidden="true" /><div><p>{text("fusionDone")}</p><Link to="/data-hub/identity-matching" state={returnState}>{text("matching")}</Link></div></div>}
          </>}
          <Link className={styles.help} to={qaQuestionHref(helpQuestion)} state={returnState}>{text("help")}</Link>
        </div>
        <footer className={styles.footer}>
          <div className={styles.footerRow}>
            {step < 4 && <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={close}>{text("later")}</button>}
            {step === 4 && running && <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={() => controller.current?.abort()}>{text("cancel")}</button>}
            <div className={styles.actions}>
              {step > 1 && step < 4 && <button type="button" className={styles.button} onClick={() => setStep(value => value - 1)}>{text("back")}</button>}
              {step < 3 && <button type="button" className={`${styles.button} ${styles.primary}`} disabled={step === 2 && !draft.servers.length} onClick={() => { persist(draft); setStep(value => value + 1); }}>{text("next")} <ArrowRight aria-hidden="true" /></button>}
              {step === 3 && <button type="button" className={`${styles.button} ${styles.primary}`} disabled={planning || planError || !plan?.scans.length || !!plan.failedYears.length} onClick={() => void start()}>{text("start")} <ArrowRight aria-hidden="true" /></button>}
              {step >= 4 && <button type="button" className={`${styles.button} ${step === 5 ? styles.primary : ""}`} onClick={close}>{text(step === 5 ? "done" : "leave")}</button>}
            </div>
          </div>
          {step < 4 && <label className={styles.check}><input type="checkbox" checked={hide} onChange={event => setHide(event.target.checked)} />{text("hide")}</label>}
        </footer>
      </div>
    </div>, document.body)}
  </>;
}
