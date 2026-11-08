import { useAnalyticsView } from "../../lib/analytics/localEvents";
import SearchArtwork from "./SearchArtwork";
import React from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HUB_SEARCH_MIN_QUERY, HUB_SEARCH_LIMIT, parseHubSearchText, type HubSearchQuery, type HubSearchState, type HubSearchHit, type HubSearchOccurrence } from "../../lib/data-hub/hubSearchService";
import { hubRecentKey, type HubSearchRecent } from "../../lib/data-hub/hubSearchRecents";
import styles from "./HubSearchDropdown.module.css";


function HitArtwork({ hit, occurrence }: { hit: HubSearchHit; occurrence?: HubSearchOccurrence }) {
  const display = occurrence ?? hit.occurrences.find(o => o.timeQuality === "observation") ?? hit.occurrences[0];
  return <SearchArtwork kind={hit.kind} name={display?.name || hit.name} appearance={display?.local?.appearance ?? display?.archive?.appearance}
    archiveClassId={display?.archive?.kind === "player" ? display.archive.classId : undefined} />;
}

type Option = { key: string; label: string; hit?: HubSearchHit; occurrence?: HubSearchOccurrence; recent?: HubSearchRecent; enabled: boolean };
type Props = {
  selectionVersion?: number;
  showMode?: boolean; showRecents?: boolean; placeholderKey?: string;
  query: HubSearchQuery; state: HubSearchState; current: boolean; active: boolean;
  action?: { key: string; status: string };
  recents: HubSearchRecent[]; recentError: boolean;
  update: (query: HubSearchQuery) => void; activate: () => unknown; retry: () => void;
  open: (hit: HubSearchHit, occurrence?: HubSearchOccurrence) => Promise<void>;
  openRecent: (entry: HubSearchRecent) => void; removeRecent: (key: string) => void; confirmQuery: () => void;
};

/** Shared presentation only. Local controller and target actions own all data work. */
export default function HubSearchDropdown(props: Props) {
  const { query, state, current, action } = props;
  const { t, i18n } = useTranslation();
  const root = React.useRef<HTMLDivElement>(null), input = React.useRef<HTMLInputElement>(null);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const resultsId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false), [active, setActive] = React.useState<string>(), [expanded, setExpanded] = React.useState<string>();
  useAnalyticsView(isOpen ? "datahub/search/open" : null);
  const textReady = parseHubSearchText(query.text).name.length >= HUB_SEARCH_MIN_QUERY;
  const preparing = state.local.preparing || state.archive.preparing;
  const busy = props.active && query.text.length > 0 && (preparing || textReady && !current);
  const complete = props.active && !preparing && [state.local, state.archive].every(c => c.total !== null && c.ready >= c.total && !c.error && !c.failed && !c.unknown);
  const partial = [state.local, state.archive].some(c => !c.preparing && (c.error || c.failed > 0 || c.unknown > 0 || c.total === null));
  const unresolved = (state.local.unresolved ?? 0) + (state.archive.unresolved ?? 0);
  const hits = current && textReady ? state.hits : [];
  const options: Option[] = !textReady ? (props.showRecents === false ? [] : props.recents).map(recent => ({ key: `recent:${hubRecentKey(recent)}`,
    label: recent.kind === "query" ? recent.text : recent.name, recent, enabled: true })) : hits.flatMap(hit => {
    const enabled = !!hit.reference && hit.identity !== "conflict" && !(action?.key === hit.key && action.status === "preparingTarget");
    return [{ key: hit.key, label: hit.name, hit, enabled }, ...(expanded === hit.key ? hit.occurrences.slice(0, 8).map((occurrence, i) => ({
      key: `${hit.key}:observation:${i}`, label: occurrence.name || hit.name, hit, occurrence, enabled: enabled && !!occurrence.reference,
    })) : [])];
  });
  const selectable = options.filter(option => option.enabled);
  const optionId = (option: Option) => `${resultsId}-${options.indexOf(option)}`;
  const close = () => { setIsOpen(false); setActive(undefined); };
  React.useEffect(() => { if (props.selectionVersion) close(); }, [props.selectionVersion]);
  React.useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setIsOpen(false); setActive(undefined); } };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  React.useEffect(() => { setActive(undefined); setExpanded(undefined); }, [query.text, query.mode, state.queryGeneration]);
  React.useEffect(() => { if (active) nodes.current.get(active)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const choose = (option: Option) => {
    if (!option.enabled) return;
    if (option.recent) { props.openRecent(option.recent); input.current?.focus(); }
    else if (option.hit) void props.open(option.hit, option.occurrence);
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setIsOpen(true);
      if (!selectable.length) return;
      const index = selectable.findIndex(option => option.key === active);
      const next = event.key === "ArrowDown" ? (index + 1) % selectable.length : index < 0 ? selectable.length - 1 : (index - 1 + selectable.length) % selectable.length;
      setActive(selectable[next].key);
    } else if (event.key === "Enter") {
      event.preventDefault(); setIsOpen(true);
      const option = isOpen ? selectable.find(item => item.key === active) : undefined;
      if (option) choose(option); else if (textReady) props.confirmQuery();
    }
  };
  const activeOption = options.find(option => option.key === active && option.enabled);
  return <div ref={root} className={styles.wrap} data-hub-search data-dashboard-search={props.showMode !== false ? true : undefined} onFocusCapture={props.activate} onKeyDown={event => {
    if (event.key === "Escape" && isOpen) { event.preventDefault(); if (props.selectionVersion !== undefined) event.stopPropagation(); input.current?.focus(); close(); }
  }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(); }}>
    <div className={styles.field} onClick={() => { props.activate(); setIsOpen(true); }}>
      <span className={styles.glyph} aria-hidden>{busy ? <Loader2 size={18} className={styles.spinner} data-search-loading /> : <Search size={18} />}</span>
      <input ref={input} type="search" role="combobox" autoComplete="off" maxLength={200} value={query.text}
        placeholder={t(props.placeholderKey ?? "hubSearch.dashboard.placeholder")} aria-label={t(props.placeholderKey ?? "hubSearch.dashboard.placeholder")}
        aria-controls={resultsId} aria-expanded={isOpen} aria-autocomplete="list" aria-activedescendant={isOpen && activeOption ? optionId(activeOption) : undefined}
        onChange={event => { props.activate(); setIsOpen(true); props.update({ ...query, text: event.target.value }); }} onFocus={() => { props.activate(); setIsOpen(true); }} onKeyDown={keyDown} />
      {props.showMode !== false && <label className={styles.mode}><span>{t("hubSearch.dashboard.openIn")}</span><select value={query.mode} aria-label={t("hubSearch.dashboard.openIn")}
        onChange={event => props.update({ ...query, mode: event.target.value as HubSearchQuery["mode"] })}>
        <option value="profile">{t("hubSearch.dashboard.profile")}</option><option value="toplist">{t("hubSearch.dashboard.toplist")}</option>
      </select></label>}
    </div>
    {isOpen && <div className={styles.dropdown} data-search-dropdown>
      {partial && textReady && <div className={styles.notice} role="status">{t("hubSearch.dashboard.partial")} <button type="button" onClick={props.retry}>{t("hubSearch.dashboard.retry")}</button></div>}
      {props.recentError && !textReady && props.showRecents !== false && <p className={styles.hint}>{t("hubSearch.dashboard.recentStorage")}</p>}
      <div id={resultsId} role="listbox" aria-label={t(!textReady && props.showRecents !== false ? "hubSearch.dashboard.recents" : props.placeholderKey ?? "hubSearch.title")} aria-busy={busy}>
        {!textReady && props.showRecents !== false && <div className={styles.section}>{t("hubSearch.dashboard.recents")}</div>}
        {options.map(option => <div key={option.key} className={`${styles.entry} ${option.occurrence ? styles.observation : ""}`} role="presentation" data-hub-search-hit={option.hit?.reference?.identifier}>
          <button ref={node => { if (node) nodes.current.set(option.key, node); else nodes.current.delete(option.key); }} type="button" role="option"
            id={optionId(option)} data-search-option={option.key} aria-selected={active === option.key} disabled={!option.enabled}
            className={`${styles.item} ${active === option.key ? styles.active : ""}`} onMouseEnter={() => option.enabled && setActive(option.key)} onClick={() => choose(option)}>
            {option.hit ? <HitArtwork hit={option.hit} occurrence={option.occurrence} /> : option.recent?.kind === "entity"
              ? <SearchArtwork kind={option.recent.entityKind} name={option.recent.name} appearance={option.recent.appearance} />
              : <span className={styles.artwork} aria-hidden><Search size={20} /></span>}
            <span className={styles.meta}><span className={styles.line1}><strong>{option.label}</strong>{option.recent && <span className={styles.badge}>{t("hubSearch.dashboard.recent")}</span>}</span>
              {option.hit && <span className={styles.line2}>{option.occurrence?.reference?.serverNamespace.toUpperCase() ?? option.hit.reference?.serverNamespace.toUpperCase() ?? t("hubSearch.serverUnknown")} · {t(`hubSearch.${option.hit.kind}`)}
                {option.occurrence && <> · {option.occurrence.at === null ? t("hubSearch.timeUnknown") : new Date(option.occurrence.at).toLocaleString(i18n.language)} · {t(`hubSearch.time.${option.occurrence.timeQuality}`)}</>}
              </span>}
              {option.recent?.kind === "entity" && <span className={styles.line2}>{option.recent.serverNamespace.toUpperCase()} · {t(`hubSearch.${option.recent.entityKind}`)}</span>}
            </span>
          </button>
          {option.recent && <button className={styles.remove} type="button" aria-label={t("hubSearch.dashboard.removeRecent", { name: option.label })} onClick={() => props.removeRecent(hubRecentKey(option.recent!))}><X size={14} /></button>}
          {option.hit && !option.occurrence && <button type="button" className={styles.disclose} aria-label={t("hubSearch.observations")} aria-expanded={expanded === option.hit.key}
            onClick={() => { setActive(undefined); setExpanded(expanded === option.hit!.key ? undefined : option.hit!.key); }}><ChevronDown size={14} /></button>}
        </div>)}
      </div>
      {!textReady && !options.length && <p className={styles.hint}>{t("hubSearch.minQuery", { count: HUB_SEARCH_MIN_QUERY })}</p>}
      {unresolved > 0 && textReady && !preparing && <p className={styles.notice} role="status">{t("hubSearch.unresolvedEntries")}</p>}
      {textReady && !options.length && <p className={styles.hint} role="status">{t(busy ? "hubSearch.dashboard.searching" : complete ? "hubSearch.dashboard.noResults" : "hubSearch.dashboard.noResultsYet")}</p>}
      {current && textReady && state.limited && <p className={styles.hint}>{t("hubSearch.resultLimit", { count: HUB_SEARCH_LIMIT })}</p>}
      {expanded && (hits.find(hit => hit.key === expanded)?.occurrences.length ?? 0) > 8 && <p className={styles.hint}>{t("hubSearch.occurrenceLimit")}</p>}
      {action && <p className={styles.notice} role="status" data-search-action={action.status}>{t(`hubSearch.target.${action.status}`)}</p>}
    </div>}
  </div>;
}
