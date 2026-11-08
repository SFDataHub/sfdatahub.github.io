import { profileLocale, profileDateTime } from "../../lib/i18n/profilePresentation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import ComparisonIdentityBatch from "./ComparisonIdentityBatch";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useBackClose } from "../../hooks/useBackClose";
import { getSfDataHubArchiveSearchIndexCache, type GuildHubScanSummary } from "../../lib/guilds/localScanLibrary";
import { type IdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import type { ScanArchiveEntry } from "../../lib/scanArchive/types";
import { validateScanArchiveSearchIndexPayload } from "../../lib/scanArchive/validation";
import { buildDashboardLocalFirstFeatureRequest } from "./dashboardLocalFirst";
import { buildGuildScanDetails, buildScanDetailsGuildScope, scanDetailIdentityContexts, type CachedGuildScanIndex, type ScanDetailsGuild, type ScanDetailsStand } from "./dashboardScanDetails";
import type { ScanIdentityContext } from "./dashboardScanIdentity";
import type { DashboardGuildCardKpi } from "./DashboardGuildCard";
import dialog from "../../components/guilds/LocalGuildRankingOverlay.module.css";
import styles from "./GuildScanDetailsOverlay.module.css";

export default function GuildScanDetailsOverlay({ guild, summaries, identities, identityContexts = [], consumerStatus, archiveEntries, current, currentGuild, comparisons, kpis, onClose, trigger, collectComparisonDiagnostic }: {
  collectComparisonDiagnostic?: () => Promise<{ text: string; coherent: boolean; isCurrent: () => boolean }>;
  guild: ScanDetailsGuild; summaries: GuildHubScanSummary[]; identities: IdentityResolutionSnapshot | null;
  archiveEntries: readonly ScanArchiveEntry[]; current: ScanDetailsStand;
  currentGuild: { name: string; server: string; memberCount: number | null; hofRank: number | null };
  comparisons: readonly (ScanDetailsStand & { label: string })[]; kpis: DashboardGuildCardKpi[];
  identityContexts?: readonly ScanIdentityContext[];
  consumerStatus?: { transfer: ScanIdentityContext["status"]; ranking: ScanIdentityContext["status"] };
  onClose: () => void; trigger: HTMLElement | null;
}) {
  const { t } = useTranslation();
  useAnalyticsView("datahub/guild/scan-details");
  const titleId = useId(), panel = useRef<HTMLDivElement>(null);
  const [cached, setCached] = useState<{ entries: typeof archiveEntries; indexes: CachedGuildScanIndex[]; loading: boolean; failed: boolean }>({ entries: archiveEntries, indexes: [], loading: true, failed: false });
  useBackClose(true, onClose);
  useFocusTrap(panel, true);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [onClose, trigger]);
  useEffect(() => {
    let cancelled = false;
    setCached({ entries: archiveEntries, indexes: [], loading: true, failed: false });
    // Only existing, contract-matching search metadata. No downloader, worker,
    // analytics preparation or raw-scan reader belongs to this disclosure.
    void (async () => {
      const indexes: CachedGuildScanIndex[] = [];
      let failed = false;
      for (const entry of archiveEntries) {
        if (cancelled) return;
        try {
          const record = await getSfDataHubArchiveSearchIndexCache(entry);
          if (cancelled) return;
          if (record) indexes.push({ entry, payload: validateScanArchiveSearchIndexPayload(record.payload, entry) });
        } catch { failed = true; }
      }
      if (!cancelled) setCached({ entries: archiveEntries, indexes, loading: false, failed });
    })();
    return () => { cancelled = true; };
  }, [archiveEntries, summaries]);
  const indexes = cached.entries === archiveEntries ? cached.indexes : [];
  const snapshot = identities;
  const scope = buildScanDetailsGuildScope(guild, snapshot);
  const request = buildDashboardLocalFirstFeatureRequest(guild);
  const archiveScope = request?.target.kind === "fusion-scope" ? request.target.scope.label : guild.server;
  const rows = buildGuildScanDetails({ guild, summaries, identities: snapshot, cachedIndexes: indexes, current, currentGuild, comparisons });
  const detailKpis = kpis.filter(kpi => ["scanstand", "members", "user-scans", "archive-scans"].includes(kpi.key)).map(kpi =>
    kpi.key === "user-scans" ? { ...kpi, label: t("guildScanDetails.dashboardUserScans"), hint: t("guildScanDetails.dashboardUserScope", { server: guild.server }) }
    : kpi.key === "archive-scans" ? { ...kpi, label: t("guildScanDetails.archiveFiles"), hint: `${archiveScope} · ${kpi.hint ?? ""}` } : kpi);
  const number = (value: number | null) => value == null ? "—" : value.toLocaleString(profileLocale());
  return createPortal(<div className={dialog.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={dialog.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} data-guild-scan-details>
      <div className={dialog.header}><h2 id={titleId}>{t("guildScanDetails.title")} · {guild.name}</h2><button type="button" onClick={onClose} aria-label={t("localProfileRoute.close")}><X size={20} aria-hidden /></button></div>
      <div className={dialog.scroll} tabIndex={0} aria-label={t("guildScanDetails.list")}>
        <dl className={styles.summary}>{detailKpis.map(kpi => <div key={kpi.key}><dt>{kpi.label}</dt><dd>{kpi.value}</dd>{kpi.hint && <small>{kpi.hint}</small>}</div>)}</dl>
        {import.meta.env.DEV && collectComparisonDiagnostic && <><ComparisonDiagnosticCopy collect={collectComparisonDiagnostic} /><ComparisonIdentityBatch collect={collectComparisonDiagnostic} /></>}
        <p className={styles.note}>{t("guildScanDetails.inventoryHint")}</p>
        <p className={styles.note} data-scan-identity-scope><strong>{t("guildScanDetails.identityScope")}:</strong> {scope.references.map(ref => `${ref.identifier} (${ref.serverNamespace.toUpperCase()})`).join(" · ")}</p>
        <h3 className={styles.heading}>{t("guildScanDetails.listCount", { count: rows.length })}</h3>
        <p className={styles.note}>{t("guildScanDetails.matching.explanation")}</p>
        {consumerStatus && <p className={styles.note} role="status">{(["transfer", "ranking"] as const).map(role => <span key={role} className={styles.consumerStatus}>{t(`guildScanDetails.matching.roles.${role}`)}: {t(`guildScanDetails.matching.status.${consumerStatus[role]}`)}</span>)}</p>}
        <p className={styles.note} role="status">{t(cached.loading || cached.entries !== archiveEntries ? "guildScanDetails.loading" : cached.failed ? "guildScanDetails.failed" : "guildScanDetails.knownOnly")}</p>
        {rows.length === 0 && <p className={styles.note}>{t("guildScanDetails.empty")}</p>}
        <ol className={styles.list}>{rows.map(row => <li key={row.key} className={styles.row} data-scan-detail-row data-source-id={row.sourceScanId ?? ""} data-scan-at={row.at ?? ""} data-current={row.current}>
          <div className={styles.rowHeader}><strong>{profileDateTime(row.at)}</strong><div className={styles.badges}>{row.current && <span>{t("guildScanDetails.current")}</span>}{row.comparisons.map(label => <span key={label} data-scan-comparison>{label}</span>)}</div></div>
          <p className={styles.origin}>{t(row.local ? "guildScanDetails.local" : "guildScanDetails.archiveOnly")}{row.archiveIds.length > 0 ? ` · ${t("guildScanDetails.archive")}` : ""}{row.userScan ? ` · ${t("guildScanDetails.userScan")}` : ""}{row.local && !row.enabled ? ` · ${t("guildScanDetails.inactive")}` : ""}</p>
          <dl className={styles.details}>
            <div><dt>{t("guildScanDetails.guild")}</dt><dd>{row.guildName} · {row.server}{row.guildIdentifier ? ` · ${row.guildIdentifier}` : ""}</dd></div>
            <div><dt>{t("guildScanDetails.file")}</dt><dd>{row.filename ?? "—"}</dd></div>
            {row.sourceScanId && <div><dt>{t("guildScanDetails.source")}</dt><dd>{row.sourceScanId}</dd></div>}
            {row.archiveIds.length > 0 && <div><dt>{t("guildScanDetails.archiveId")}</dt><dd>{row.archiveIds.join(", ")}</dd></div>}
            <div><dt>{t("guildScanDetails.imported")}</dt><dd>{profileDateTime(row.importedAt)}</dd></div>
            <div><dt>{t("guildScanDetails.membersRank")}</dt><dd>{number(row.memberCount)} / {row.hofRank == null ? "—" : `#${number(row.hofRank)}`}</dd></div>
            <div><dt>{t("guildScanDetails.fileInventory")}</dt><dd>{number(row.filePlayers)} / {number(row.fileGuilds)} / {number(row.snapshots)}</dd></div>
          </dl>
          <ScanIdentityDetails contexts={scanDetailIdentityContexts(row, identityContexts, summaries, identities?.revisions)} />
        </li>)}</ol>
      </div>
    </div>
  </div>, document.body);
}

function ScanIdentityDetails({ contexts }: { contexts: ReturnType<typeof scanDetailIdentityContexts> }) {
  const { t } = useTranslation();
  if (!contexts.length) return <p className={styles.note} data-scan-identity-status="not-checked">{t("guildScanDetails.matching.status.not-checked")}</p>;
  return <>{contexts.map(({ context, roles }, index) => {
    const summary = context.status === "ready" ? context.summary : undefined;
    return <section className={styles.identity} key={index} data-scan-identity-status={context.status}>
      <p className={styles.note}>{roles.map(role => t(`guildScanDetails.matching.roles.${role}`)).join(" · ")}</p>
      {summary ? <>
        <dl className={styles.details}>
          <div><dt>{t("guildScanDetails.matching.coverage")}</dt><dd>{t("guildScanDetails.matching.coverageCount", { observed: summary.observed, total: summary.declared ?? t("guildScanDetails.matching.unknown") })}</dd></div>
          <div><dt>{t("guildScanDetails.matching.guild")}</dt><dd>{t(`guildScanDetails.matching.guildStatus.${summary.guild}`)}</dd></div>
          <div><dt>{t("guildScanDetails.matching.players")}</dt><dd data-scan-player-identities>{t("guildScanDetails.matching.playerCount", { confirmed: summary.confirmed, observed: summary.observed })}<br />{t("guildScanDetails.matching.issueCount", { unresolved: summary.unresolved, conflicts: summary.conflicts })}</dd></div>
        </dl>
        <p className={styles.note} data-scan-identity-overall={summary.overall}><strong>{t(`guildScanDetails.matching.overall.${summary.overall}`)}</strong></p>
        {context.revisions && <p className={styles.revision}>{t("guildScanDetails.matching.revisions", context.revisions)}</p>}
        {summary.issues.length > 0 && <details><summary>{t("guildScanDetails.matching.issues", { count: summary.issues.length })}</summary><ul className={styles.issues}>{summary.issues.map(issue => <li key={issue.key}>
          {issue.names.length > 0 && <strong>{issue.names.join(" / ")} · </strong>}<code>{issue.references.join(" / ")}</code><br />{t(`guildScanDetails.matching.reason.${issue.reason}`)}
        </li>)}</ul></details>}
      </> : <p role="status" className={styles.note}>{t(`guildScanDetails.matching.status.${context.status}`)}</p>}
    </section>;
  })}</>;
}

function ComparisonDiagnosticCopy({ collect }: { collect: () => Promise<{ text: string; coherent: boolean; isCurrent: () => boolean }> }) {
  const { t } = useTranslation();
  const basis = useRef(collect);
  basis.current = collect;
  const alive = useRef(true);
  const [state, setState] = useState<{ basis: typeof collect; status: "idle" | "loading" | "copied" | "incoherent" | "fallback" | "error"; text?: string }>({ basis: collect, status: "idle" });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const status = state.basis === collect ? state.status : "idle";
  const copy = async () => {
    const request = collect;
    const current = () => alive.current && basis.current === request;
    setState({ basis: request, status: "loading" });
    try {
      const result = await request();
      if (!current() || !result.isCurrent()) return;
      try {
        await navigator.clipboard.writeText(result.text);
        if (current() && result.isCurrent()) setState({ basis: request, status: result.coherent ? "copied" : "incoherent" });
      } catch {
        if (current() && result.isCurrent()) setState({ basis: request, status: "fallback", text: result.text });
      }
    } catch {
      if (current()) setState({ basis: request, status: "error" });
    }
  };
  return <section data-comparison-diagnostic>
    <button type="button" disabled={status === "loading"} onClick={() => void copy()}>{t("guildScanDetails.diagnostic.copy")}</button>
    <p role="status">{t(`guildScanDetails.diagnostic.${status}`)}</p>
    {status === "fallback" && <textarea aria-label={t("guildScanDetails.diagnostic.output")} readOnly value={state.text ?? ""} rows={8} style={{ width: "100%" }} onFocus={event => event.currentTarget.select()} />}
  </section>;
}
