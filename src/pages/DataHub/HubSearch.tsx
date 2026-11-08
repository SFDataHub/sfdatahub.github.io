import { trackLocalEvent, useAnalyticsView } from "../../lib/analytics/localEvents";
import { auditResultId, auditRecordedEvent } from "../../lib/data-hub/runtimeAudit";
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHubSearch } from "../../lib/data-hub/useHubSearch";
import { HUB_SEARCH_MIN_QUERY, HUB_SEARCH_LIMIT, validHubSearchScope, parseHubSearchText, type HubSearchHit, type HubSearchOccurrence, type HubSearchQuery } from "../../lib/data-hub/hubSearchService";
import { resolveHubSearchTarget, HubTargetError, type HubResolvedTarget } from "../../lib/data-hub/hubTargetResolver";
import type { FavoriteReference } from "../../lib/data-hub/hubFavoritesContract";
import styles from "./HubSearch.module.css";
import HubSearchDropdown from "./HubSearchDropdown";
import { useHubSearchRecents } from "../../lib/data-hub/useHubSearchRecents";
import { hubRecentKey, recentFromHubHit, type HubSearchRecent, type HubRecentEntity } from "../../lib/data-hub/hubSearchRecents";

export type HubPlayerSelection = { reference: FavoriteReference; target: HubResolvedTarget; prepared?: import("../GuildHub/localPlayerCurrentSeed").LocalPlayerCurrentSeed } & (
  { hit: HubSearchHit; occurrence?: HubSearchOccurrence; favorite?: never } |
  { favorite: import("../../lib/data-hub/hubFavoritesContract").HubFavorite; hit?: never; occurrence?: never }
);
type Props = { entityKind?: "guild" | "player"; variant?: "legacy" | "dashboard" | "topbar" | "player-overview" | "guild-overview"; onPlayerSelect?: never }
  | { entityKind: "player"; variant: "player-comparison"; onPlayerSelect: (selection: HubPlayerSelection) => void };

export default function HubSearch({ entityKind, variant = "legacy", onPlayerSelect }: Props) {
  const { t, i18n } = useTranslation(); const navigate = useNavigate(), location = useLocation();
  const headingId = React.useId(), resultsId = React.useId();
  const topbar = variant === "topbar";
  const dashboard = (variant === "dashboard" || topbar) && !entityKind;
  const playerOverview = variant === "player-overview" && entityKind === "player";
  const guildOverview = variant === "guild-overview" && entityKind === "guild";
  const overview = playerOverview || guildOverview;
  const comparison = variant === "player-comparison";
  useAnalyticsView(!dashboard && !overview && !comparison ? "datahub/search/open" : null);
  const search = useHubSearch(entityKind, dashboard || comparison, overview || comparison ? "current" : undefined, comparison, topbar ? "topbar" : undefined); const { query, state } = search;
  const [selectionVersion, setSelectionVersion] = React.useState(0);
  const recents = useHubSearchRecents(dashboard);
  const generation = React.useRef(0), mounted = React.useRef(false);
  const pending = React.useRef<{ attempt: number; hit: HubSearchHit; acquisition?: HubSearchOccurrence }>();
  const [action, setAction] = React.useState<{ key: string; status: string }>();
  const [history, setHistory] = React.useState(() => query.scope.kind === "historical" ? query.scope : { kind: "historical" as const, from: `${new Date().getFullYear()}-01`, to: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`, server: "" });
  const route = React.useRef(location); route.current = location;
  React.useLayoutEffect(() => {
    if (!topbar) return;
    // The persistent consumer cancels handoffs and closes UI, retaining its prepared controller.
    generation.current++; pending.current = undefined; setAction(undefined);
    setSelectionVersion(value => value + 1);
  }, [topbar, location.key, location.pathname, location.search, location.hash]);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  React.useEffect(() => {
    const active = pending.current;
    if (!active || active.attempt !== generation.current) return;
    const valid = active.acquisition ? search.controller.current?.isArchiveOccurrenceCurrent(active.acquisition) : search.controller.current?.isHitCurrent(active.hit);
    if (!valid) { generation.current++; pending.current = undefined; setAction({ key: active.hit.key, status: "changed" }); }
  }, [state.revision, state.queryGeneration]);
  const update = (next: HubSearchQuery) => { pending.current = undefined; generation.current++; setAction(undefined); search.setQuery(next); };
  async function open(hit: HubSearchHit, occurrence?: HubSearchOccurrence, month?: string, recent?: HubRecentEntity) {
    const origin = location;
    const attempt = ++generation.current;
    if ((!recent && !search.current) || !search.controller.current?.isHitCurrent(hit)) return;
    trackLocalEvent(hit.kind === "player" ? "datahub/search/player-select" : "datahub/search/guild-select");
    pending.current = { attempt, hit };
    setAction({ key: hit.key, status: "preparingTarget" });
    let acquisition: HubSearchOccurrence | undefined;
    const allowed = () => mounted.current && attempt === generation.current && (!topbar || route.current === origin) &&
      (acquisition ? !!search.controller.current?.isArchiveOccurrenceCurrent(acquisition) : !!search.controller.current?.isHitCurrent(hit));
    try {
      const target = await resolveHubSearchTarget(hit, { mode: query.mode, historical: occurrence, month, allowed,
        // This search opens public local DataHub targets; the resolver keeps its caller-specific access contract.
        accessAllowed: () => true, onAcquire: occurrence => { acquisition = occurrence; if (pending.current?.attempt === attempt) pending.current.acquisition = occurrence; } });
      if (!allowed()) return;
      pending.current = undefined;
      if (comparison && onPlayerSelect && hit.kind === "player" && hit.reference) {
        onPlayerSelect({ reference: hit.reference, target, hit, occurrence });
        setAction(undefined);
        setSelectionVersion(value => value + 1);
        return;
      }
      if (dashboard) {
        const display = recentFromHubHit(hit, occurrence);
        const entry = recent ? { ...recent, name: occurrence?.name || hit.name, appearance: display?.appearance } : display;
        if (entry) recents.add(entry);
      }
      if (topbar) {
        setAction(undefined);
        setSelectionVersion(value => value + 1);
      }
      const auditCauseId = auditResultId(target);
      auditRecordedEvent(auditCauseId, "navigation-handoff", { destination: target.path });
      navigate(target.path, { state: { ...target.state, returnTo: location.pathname + location.search, ...(topbar ? { profileReturnState: location.state, guildReturnState: location.state } : undefined), ...(auditCauseId ? { __sfhAuditCauseId: auditCauseId } : undefined) } });
    } catch (error) {
      if (!allowed()) return;
      pending.current = undefined;
      setAction({ key: hit.key, status: error instanceof HubTargetError ? error.code : error instanceof DOMException && error.name === "AbortError" ? "changed" : "failed" });
    }
  }
  const retry = () => { pending.current = undefined; generation.current++; setAction(undefined); search.retry(); };
  async function openRecent(entry: HubSearchRecent) {
    if (entry.kind === "query") { recents.add(entry); update({ ...query, text: entry.text }); return; }
    const attempt = ++generation.current; pending.current = undefined;
    const key = `recent:${hubRecentKey(entry)}`;
    setAction({ key, status: "preparingTarget" });
    try {
      const controller = await search.ensureController();
      if (!mounted.current || attempt !== generation.current) return;
      const resolved = await controller.resolveRecent(entry);
      if (!mounted.current || attempt !== generation.current) return;
      if (!resolved) { setAction({ key, status: "missing" }); return; }
      await open(resolved.hit, resolved.occurrence, undefined, entry);
    } catch {
      if (mounted.current && attempt === generation.current) setAction({ key, status: "failed" });
    }
  }
  const dropdown = <HubSearchDropdown selectionVersion={comparison || topbar ? selectionVersion : undefined} query={query} state={state} current={search.current} active={!!search.controller.current} action={action}
    showMode={dashboard} showRecents={dashboard} placeholderKey={dashboard ? undefined : `hubNavigation.${entityKind ?? "player"}Search`}
    recents={recents.entries} recentError={recents.error} update={update} activate={search.activate} retry={retry} open={open}
    openRecent={entry => void openRecent(entry)} removeRecent={recents.remove}
    confirmQuery={() => { if (dashboard) recents.add({ kind: "query", text: query.text }); }} />;
  if (dashboard || comparison) return dropdown;
  if (overview) return <section className={styles.overview} aria-labelledby={headingId}>
    <h2 id={headingId}>{t(`hubNavigation.${entityKind}Search`)}</h2>
    {dropdown}
  </section>;
  const date = (at: number | null) => at === null ? t("hubSearch.timeUnknown") : new Date(at).toLocaleString(i18n.language);
  return <section className={styles.search} aria-labelledby={headingId} data-hub-search>
    <h2 id={headingId}>{t(entityKind ? `hubNavigation.${entityKind}Search` : "hubSearch.title")}</h2>
    <p>{t("hubSearch.hint")}</p>
    <div className={styles.controls}>
      <label className={styles.text}>{t("hubSearch.query")}<input type="search" maxLength={200} value={query.text}
        placeholder={t("hubSearch.placeholder")} onChange={event => update({ ...query, text: event.target.value })} aria-controls={resultsId} /></label>
      {!entityKind && <label>{t("hubSearch.mode")}<select value={query.mode} onChange={e => update({ ...query, mode: e.target.value as HubSearchQuery["mode"] })}>
        <option value="profile">{t("hubSearch.profile")}</option><option value="toplist">{t("hubSearch.toplist")}</option></select></label>}
      {!entityKind && <label>{t("hubSearch.kind")}<select value={query.kind} onChange={e => update({ ...query, kind: e.target.value as HubSearchQuery["kind"] })}>
        <option value="both">{t("hubSearch.both")}</option><option value="player">{t("hubSearch.player")}</option><option value="guild">{t("hubSearch.guild")}</option></select></label>}
      <label>{t("hubSearch.scope")}<select value={query.scope.kind} onChange={e => {
        if (e.target.value === "current") update({ ...query, scope: { kind: "current" } });
        else if (validHubSearchScope(history)) update({ ...query, scope: history });
      }}><option value="current">{t("hubSearch.currentScope")}</option><option value="historical">{t("hubSearch.historicalScope")}</option></select></label>
    </div>
    {query.scope.kind === "historical" && <fieldset className={styles.controls}><legend>{t("hubSearch.historyHint")}</legend>
      <label>{t("hubSearch.from")}<input type="month" value={history.from} onChange={e => setHistory({ ...history, from: e.target.value })} /></label>
      <label>{t("hubSearch.to")}<input type="month" value={history.to} onChange={e => setHistory({ ...history, to: e.target.value })} /></label>
      <label>{t("hubSearch.serverOptional")}<input value={history.server} onChange={e => setHistory({ ...history, server: e.target.value })} placeholder="F8" /></label>
      <button type="button" disabled={!validHubSearchScope(history)} onClick={() => update({ ...query, scope: history })}>{t("hubSearch.apply")}</button>
    </fieldset>}
    <div className={styles.coverage} role="status" aria-live="polite">
      {(["local", "archive"] as const).map(kind => <p key={kind} data-search-coverage={kind}>
        <strong>{t(`hubSearch.${kind}`)}</strong>: {t("hubSearch.coverage", { ready: state[kind].ready, total: state[kind].total ?? "?" })}
        {state[kind].preparing && ` · ${t("hubSearch.preparing")}`}
        {state[kind].failed > 0 && ` · ${t("hubSearch.failedCount", { count: state[kind].failed })}`}
        {(state[kind].unknown > 0 || state[kind].total === null) && ` · ${t("hubSearch.partial")}`}
        {(state[kind].unresolved ?? 0) > 0 && ` · ${t("hubSearch.unresolvedEntries")}`}
        {state[kind].error && ` · ${t("hubSearch.preparationError")}`}
      </p>)}
      <button type="button" onClick={() => { pending.current = undefined; generation.current++; setAction(undefined); search.retry(); }}>{t("hubSearch.retry")}</button>
    </div>
    <div id={resultsId} aria-busy={!search.current}>
      {parseHubSearchText(query.text).name.length < HUB_SEARCH_MIN_QUERY ? <p>{t("hubSearch.minQuery", { count: HUB_SEARCH_MIN_QUERY })}</p> : !search.current ? <p role="status">{t("hubSearch.querying")}</p> : <>
        {!state.hits.length && <p role="status">{t("hubSearch.noPreparedMatch")}</p>}
        {(["player", "guild"] as const).map(kind => {
          const hits = state.hits.filter(h => h.kind === kind);
          return hits.length > 0 && <div key={kind}><h3>{t(`hubSearch.${kind}`)}</h3><ul className={styles.results}>
            {hits.map(hit => <li key={hit.key} data-hub-search-hit={hit.reference?.identifier ?? "unresolved"}>
              <div><strong>{hit.name}</strong><span>{hit.reference?.serverNamespace.toUpperCase() ?? t("hubSearch.serverUnknown")} · {hit.reference?.identifier ?? t("hubSearch.unresolved")}</span>
                {hit.names.length > 1 && <span>{t("hubSearch.observedNames")}: {hit.names.join(" · ")}</span>}
                <span>{hit.occurrences.some(o => o.local) ? t("hubSearch.local") : t("hubSearch.archive")} · {t("hubSearch.occurrences", { count: hit.occurrences.length })}</span>
              </div>
              <button type="button" disabled={!hit.reference || action?.key === hit.key && action.status === "preparingTarget"} onClick={() => void open(hit)}>
                {query.mode === "profile" ? t("hubSearch.openProfile") : t("hubSearch.openCurrentToplist", { server: hit.reference?.serverNamespace.toUpperCase() })}</button>
              {action?.key === hit.key && <p role="status">{t(`hubSearch.target.${action.status}`)}</p>}
              <details><summary>{t("hubSearch.observations")}</summary><ul>
                {hit.occurrences.slice(0, 8).map((o, index) => <li key={index}>
                  <span>{o.name || o.identifier} · {o.server?.toUpperCase() ?? "?"} · {date(o.at)} · {t(`hubSearch.time.${o.timeQuality}`)}</span>
                  {query.mode === "profile" && <button type="button" disabled={!o.reference} onClick={() => void open(hit, o)}>{t("hubSearch.openObservation")}</button>}
                  {query.mode === "toplist" && o.archive && query.scope.kind === "historical" && o.months?.map(month => <button key={month} type="button" disabled={!o.reference}
                    onClick={() => void open(hit, o, month)}>{t("hubSearch.openMonthToplist", { server: o.server?.toUpperCase(), month })}</button>)}
                </li>)}
              </ul>{hit.occurrences.length > 8 && <p>{t("hubSearch.occurrenceLimit")}</p>}</details>
            </li>)}
          </ul></div>;
        })}
        {state.limited && <p>{t("hubSearch.resultLimit", { count: HUB_SEARCH_LIMIT })}</p>}
      </>}
    </div>
  </section>;
}
