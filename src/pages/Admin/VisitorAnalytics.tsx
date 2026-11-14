import React from "react";
import { Navigate } from "react-router-dom";
import { Activity, ArrowRight, BarChart3, BookOpen, CalendarDays, ClipboardList, Copy, Database, Globe2, Info, Layers, LockKeyhole, RefreshCcw, Settings, Star, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { canReadVisitorAnalytics } from "../../lib/analytics/visitorAccess";
import { useVisitorSnapshot } from "./useVisitorSnapshot";
import VisitorSettingsOverlay from "./VisitorSettingsOverlay";
import { sizeDistribution, type ScreenSizes, type SizeDistribution, counterNote, formatDate, formatNumber, pageLabel, periodLabel, sourceNote, toolLabel, websiteNote, type ContentKey, type Counter, type DetailData, type Source, type ToolClicks, type TopEntry, type VisitorSnapshot, type WindowKey } from "./visitorAnalyticsModel";
import styles from "./VisitorAnalytics.module.css";

type Tab = "overview" | "contents" | "usage" | "collection" | "basis";
const tabs = [
  { id: "overview", label: "Übersicht", icon: BarChart3 },
  { id: "contents", label: "Inhalte", icon: ClipboardList },
  { id: "usage", label: "Nutzung", icon: Layers },
  { id: "collection", label: "Dons Collection", icon: Star },
  { id: "basis", label: "Datenbasis", icon: Database },
] as const;
const contentOptions = [
  { id: "topPages", label: "Seiten", icon: Copy },
  { id: "topPlayers", label: "Spielerprofile", icon: UserRound },
  { id: "topGuilds", label: "Gildenprofile", icon: UsersRound },
  { id: "topGuides", label: "Guides", icon: BookOpen },
] as const;

function MetricCard({ label, value, hint, icon: Icon }: {
  label: string; value: unknown; hint: string; icon: typeof UsersRound;
}) {
  return <article className={styles.metric}>
    <Icon className={styles.metricIcon} size={29} aria-hidden />
    <div><h2>{label}</h2><strong className={styles.metricValue}>{formatNumber(value, 1)}</strong><p>{hint}</p></div>
  </article>;
}
function TextLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={styles.textLink} onClick={onClick}>{children}<ArrowRight size={16} aria-hidden /></button>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className={styles.empty} role="status">{children}</p>; }
function SizeBreakdown({ value, sizes, windowKey }: { value: SizeDistribution | undefined; sizes: ScreenSizes | undefined; windowKey: WindowKey }) {
  const measured = sizeDistribution(value);
  if (!measured || sizes?.classes?.unit !== "screen_css_pixels" || sizes.classes.basis !== "per_path_sessions_provider_days") return <Empty>Noch keine Messdaten zur Bildschirmgröße.</Empty>;
  const total = measured.total!, counts = measured.counts!;
  const classes = [["small", "Klein", `bis ${formatNumber(sizes.classes.smallMax)} px`], ["medium", "Mittel", `${formatNumber(sizes.classes.smallMax + 1)}–${formatNumber(sizes.classes.mediumMax)} px`], ["large", "Groß", `über ${formatNumber(sizes.classes.mediumMax)} px`], ["unknown", "Unbekannt", "Breite nicht erfasst"]] as const;
  return <div className={styles.sizeBreakdown}>
    <p className={styles.muted}>{periodLabel(sizes[windowKey])} · Stand {formatDate(sizes.asOf)}{measured.state === "partial" ? " · Größenangaben nur für einen Teil der Pfade verfügbar" : " · Erfassungsabdeckung unbekannt"}</p>
    <ul className={styles.sizeBars}>{classes.map(([key, label, boundary]) => <li key={key}>
      <div><strong>{label}</strong><small>{boundary}</small><span>{formatNumber(counts[key])} · {total > 0 ? `${formatNumber(counts[key] / total * 100, 1)} %` : "—"}</span></div>
      <div className={styles.sizeTrack} aria-hidden><div style={{ width: `${total > 0 ? counts[key] / total * 100 : 0}%` }} /></div>
    </li>)}</ul>
    <p className={styles.muted}>Prozentbasis: {formatNumber(total)} erfasste Seitenbesuche mit Größenstatistik, einschließlich unbekannter Breite. Bisherige Seitenzählung: {formatNumber(measured.pageVisits)}.{total === 0 ? " Keine Größenbesuche in diesem Zeitraum erfasst; kein Prozentanteil berechenbar." : ""}</p>
    <details className={styles.sizeHelp}><summary>Messgröße & Zählbasis</summary><p>Bildschirmbreite in CSS-Pixeln, kein sicher erkannter Gerätetyp und keine Browserfensterbreite. Ganze Providerbereiche werden zusammengefasst. Die Größenstatistik verwendet Kalendertage nach der Provider-Zeitzone; Seitenranglisten verwenden den angefragten Zeitraum bis zum Datenstand. Aufbewahrung und Erfassung können abweichen. Deshalb beziehen sich die Anteile ausschließlich auf die Größenstatistik. Unbekannt stammt aus der erfassten Unknown-Klasse; fehlende Daten werden nicht ergänzt. Die übrigen Ranglisten werden durch diese Ansicht nicht gefiltert.</p></details>
  </div>;
}
function Ranking({ rows, compact = false, unavailable = false, sizes, windowKey }: { rows: TopEntry[] | undefined; compact?: boolean; unavailable?: boolean; sizes?: ScreenSizes; windowKey?: WindowKey }) {
  if (!rows) return <Empty>Noch keine Messdaten für diese Rangliste.</Empty>;
  if (!rows.length) return <Empty>{unavailable ? "Noch keine Messdaten für diese Rangliste." : "Keine Seitenbesuche in diesem Zeitraum erfasst."}</Empty>;
  const max = Math.max(0, ...rows.map(row => row.count));
  return <ol className={styles.ranking}>
    {(compact ? rows.slice(0, 6) : rows).map((row, index) => <li key={row.path}>
      <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span>
      <div className={styles.rankBody}>
        <div className={styles.rankLine}><strong>{pageLabel(row)}</strong><b>{formatNumber(row.count)}</b></div>
        {!compact && <div className={styles.path}>{row.path}{row.identifier ? ` · Kennung: ${row.identifier}` : ""}</div>}
        <div className={styles.barTrack}><div className={styles.bar} style={{ width: `${max > 0 ? row.count / max * 100 : 0}%` }} /></div>
        {!compact && windowKey && <details className={styles.sizeDetails} key={windowKey + row.path}><summary>Bildschirmgrößen für {pageLabel(row)}</summary><SizeBreakdown value={sizes?.[windowKey]?.byPath?.[row.path]} sizes={sizes} windowKey={windowKey} /></details>}
      </div>
    </li>)}
  </ol>;
}
function TargetList({ clicks, compact = false }: { clicks: ToolClicks | undefined; compact?: boolean }) {
  if (!clicks || clicks.state === "not_recorded") return <Empty>Noch keine Messdaten zu Tool-Klicks.</Empty>;
  if (!clicks.targets.length) return <Empty>Keine Tool-Klicks in diesem Zeitraum erfasst.</Empty>;
  return <ol className={styles.targets}>
    {(compact ? clicks.targets.slice(0, 3) : clicks.targets).map((target, index) => <li key={target.id}>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <div><strong>{toolLabel(target.target, target.toolName)}</strong>{!compact && <small>{target.target}</small>}</div>
      <b>{formatNumber(target.count)}</b>
    </li>)}
  </ol>;
}
function CounterValue({ counter, label }: { counter: Counter | undefined; label: string }) {
  return <div><strong className={styles.collectionValue}>{formatNumber(counter?.count)}</strong><span>{label}</span></div>;
}
function CollectionPanel({ details, windowKey, full = false, onOpen }: {
  details: DetailData | null | undefined; windowKey: WindowKey; full?: boolean; onOpen?: () => void;
}) {
  const displays = details?.schemaVersion === 2 ? details.collectionDisplays?.[windowKey] : undefined;
  const clicks = details?.schemaVersion === 2 ? details.toolClicks?.[windowKey] : undefined;
  const targets = clicks?.targets;
  const top = targets?.length ? targets.reduce((a, b) => b.count > a.count ? b : a) : null;
  return <article className={styles.panel}>
    <header className={styles.panelHeader}><div><p className={styles.kicker}>Community Tools</p><h2>Dons SF Collection</h2>{full && <p>{periodLabel(clicks ?? displays ?? details?.totals?.[windowKey])}</p>}</div></header>
    <div className={styles.collectionMetrics}><CounterValue counter={displays} label="Collection angezeigt" /><CounterValue counter={clicks} label="Klicks zu Tools" /></div>
    <div className={styles.collectionNotes}><p>{counterNote(displays)}</p>{counterNote(clicks) !== counterNote(displays) && <p>Tool-Klicks: {counterNote(clicks)}</p>}</div>
    <div className={styles.topTarget}><span>Häufigstes Ziel</span><strong>{top ? toolLabel(top.target, top.toolName) : "—"}</strong></div>
    <TargetList clicks={clicks} compact={!full} />
    {full ? <div className={styles.explanation}>
      <p>Unterschiedliche angeklickte Ziele: <strong>{clicks && clicks.state !== "not_recorded" ? formatNumber(new Set(targets?.map(target => target.target)).size) : "—"}</strong></p>
      <p>Eine erfolgreiche Collection-Anzeige wird beim ersten gültigen Höhenkontakt pro tatsächlichem Besuch erfasst. Allgemeine Aufrufe der Collection-Seite sind eine andere Zählung.</p>
      <p>Tool-Klicks zählen Aktivierungen. Sie bestätigen keine Betrachtung des neuen Tabs. Mehrere Klicks pro Collection-Anzeige sind möglich.</p>
    </div> : <footer className={styles.panelFooter}><TextLink onClick={onOpen!}>Collection im Detail</TextLink></footer>}
  </article>;
}
function Basis({ snapshot, windowKey }: { snapshot: VisitorSnapshot | null; windowKey: WindowKey }) {
  const website = snapshot?.website.data, details = snapshot?.details.data;
  const range = details?.ranges?.[windowKey] ?? details?.totals?.[windowKey];
  return <article className={styles.panel}>
    <header className={styles.panelHeader}><h2>Datenbasis & Zählweise</h2></header>
    <dl className={styles.definitions}>
      <div><dt>Website-Besucher</dt><dd>Besuche der gesamten Website auf Basis der bestehenden Sitzungszählung. Ein Besucher kann mehrere Seiten besuchen; daraus entstehen mehrere Seitenbesuche.</dd></div>
      <div><dt>Heute</dt><dd>{website ? `${formatDate(website.today, false)} · Europe/Berlin bis ${formatDate(snapshot?.website.asOf)}` : "Noch keine Messdaten"}</dd></div>
      <div><dt>Gesamt</dt><dd>{website?.effectiveStartDate ? `Seit ${formatDate(website.effectiveStartDate, false)} bis ${formatDate(snapshot?.website.asOf)}` : websiteNote(website)}</dd></div>
      <div><dt>Ø Website-Besucher / Tag</dt><dd>{website?.state === "ready" ? `Durchschnitt über ${formatNumber(website.dayCount)} Kalendertage bis ${formatDate(website.today, false)}, höchstens 30 Tage, begrenzt durch den Auswertungsbeginn. Nulltage und der laufende Tag sind enthalten.` : websiteNote(website)} Die 7-/30-Tage-Auswahl verändert die drei Website-Kennzahlen nicht.</dd></div>
      <div><dt>Seitenbesuche & Ranglisten</dt><dd>{periodLabel(range)} · Europe/Berlin, einschließlich laufendem Tag{range?.endDateTime ? ` bis ${formatDate(range.endDateTime)}` : ""}. Pro Pfad sitzungsbezogene Seitenbesuche, keine Website-Unikate. Jede Rangliste zeigt höchstens {formatNumber(snapshot?.limits.topLists ?? 25)} Einträge. Ihre Summe ist keine vollständige Nutzungszahl; Profilpfade werden nicht künstlich zusammengefasst.</dd></div>
      <div><dt>Website-Datenstand</dt><dd>{sourceNote(snapshot?.website)}. Öffentliche Website-Statistiken werden stündlich gespeichert.</dd></div>
      <div><dt>Detail-Datenstand</dt><dd>{sourceNote(snapshot?.details)}. Details werden stündlich gespeichert. Die Verarbeitung kann einige Minuten nach der vollen Stunde dauern; große Auswertungen werden über mehrere automatische Etappen fortgesetzt. Zusätzlich kann ein Admin bewusst aktualisieren. Das geöffnete Dashboard liest neue Stundenstände automatisch nach; ein Leseabruf erzeugt keine neue Messung.{details?.lastRefresh?.state === "error" ? ` Letzter Aktualisierungsversuch fehlgeschlagen${details.lastRefresh.attemptedAt ? ` · ${formatDate(details.lastRefresh.attemptedAt)}` : ""}.` : ""}</dd></div>
      <div><dt>Nutzung</dt><dd>Gespeicherte interne Ansichten und Aktionen werden als Ereignisse gezählt, nicht als Besucher. Erfassungsbeginn, historische Lücken und Aufbewahrungsabdeckung können unbekannt sein. Neuere Seitenaufrufereignisse bleiben von der bisherigen Seitenbesuchszählung getrennt und werden nicht dazu addiert.</dd></div>
      <div><dt>Collection & Tools</dt><dd>{counterNote(details?.schemaVersion === 2 ? details.collectionDisplays?.[windowKey] : undefined)}. {counterNote(details?.schemaVersion === 2 ? details.toolClicks?.[windowKey] : undefined)}. Teilweise erfasste Zeiträume decken nur den bestätigten Erfassungsbeginn bis zum Datenstand ab. Beobachtete Ereignisse bei unbekanntem Beginn belegen keine vollständige Abdeckung.</dd></div>
      <div><dt>Fehlende und ältere Daten</dt><dd>„Noch keine Messdaten“ bedeutet keine verfügbare Messung. Eine gemessene 0 wird als 0 angezeigt. Ältere Statistikstände enthalten gegebenenfalls nur Seitenranglisten und keine neuen Nutzungs- oder Collection-Zähler. Bei Fehlern werden vorhandene Werte als letzter gültiger Stand samt ursprünglichem Datum erhalten. Blocker und Erfassungslücken können die Abdeckung begrenzen.</dd></div>
    </dl>
  </article>;
}
function Usage({ details, windowKey }: { details: DetailData | null | undefined; windowKey: WindowKey }) {
  const usage = details?.schemaVersion === 2 ? details.eventUsage?.[windowKey] : undefined;
  if (!usage) return <article className={styles.panel}><h2>Nutzung</h2><Empty>Noch keine Messdaten zu internen Nutzungsereignissen. Ältere Statistikstände enthalten diese Auswertung nicht.</Empty></article>;
  const categories = [...usage.categories];
  for (const event of usage.events) if (!categories.some(category => category.id === event.category)) categories.push({ id: event.category, label: event.category, count: usage.events.filter(item => item.category === event.category).reduce((sum, item) => sum + item.count, 0) });
  return <article className={styles.panel}>
    <header className={styles.panelHeader}><div><h2>Ansichten & Aktionen</h2><p>{formatNumber(usage.count)} Nutzungen · {periodLabel(usage)}</p></div><Activity size={24} aria-hidden /></header>
    <p className={styles.muted}>Ereignisse, keine Besucher · Erfassungsabdeckung unbekannt</p>
    {!categories.length && <Empty>Keine internen Nutzungsereignisse in diesem Zeitraum erfasst.</Empty>}
    <div className={styles.usageGroups}>{categories.map(category => <details key={category.id} open>
      <summary><span>{category.label}</span><strong>{formatNumber(category.count)} Nutzungen</strong></summary>
      <ul>{usage.events.filter(event => event.category === category.id).map(event => <li key={event.id}><div><strong>{event.label}</strong><small>{event.id}</small></div><b>{formatNumber(event.count)}</b></li>)}</ul>
    </details>)}</div>
  </article>;
}
function SourceStatus({ label, source }: { label: string; source: Source<unknown> | undefined }) {
  return <span className={source?.state === "error" ? styles.sourceError : undefined}>{label}: {sourceNote(source)}</span>;
}

function VisitorDashboard({ isAdmin }: { isAdmin: boolean }) {
  const { snapshot, busy, error, refresh } = useVisitorSnapshot(isAdmin);
  const [tab, setTab] = React.useState<Tab>("overview");
  const [windowKey, setWindow] = React.useState<WindowKey>("last30d");
  const [content, setContent] = React.useState<ContentKey>("topPages");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsButton = React.useRef<HTMLButtonElement>(null);
  const closeSettings = React.useCallback(() => setSettingsOpen(false), []);
  const website = snapshot?.website.data;
  const details = snapshot?.details.data;
  const websiteValues = website?.state === "ready" ? website.website : null;
  const days = windowKey === "last7d" ? 7 : 30;
  const openContents = (key: ContentKey = "topPages") => { setContent(key); setTab("contents"); };
  const limit = snapshot?.limits.topLists ?? 25;
  const sourceError = snapshot?.website.state === "error" || snapshot?.details.state === "error";
  return <main className={styles.page} data-visitor-analytics>
    <div className={styles.breadcrumb}>SF Data Hub <span>/</span> Besucher & Nutzung</div>
    <section className={styles.dashboard} aria-label="Besucher & Nutzung">
      <header className={styles.header}>
        <div><p className={styles.kicker}>Website Analytics</p><h1>Besucher & Nutzung</h1><p className={styles.subtitle}>Welche Inhalte werden aufgerufen und welche Angebote genutzt?</p></div>
        <div className={styles.actions}>
          <span className={styles.access}><LockKeyhole size={17} aria-hidden />Admins & Don</span>
          {isAdmin && <button type="button" ref={settingsButton} aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}><Settings size={18} aria-hidden />Einstellungen</button>}
          <button type="button" className={styles.refresh} onClick={refresh} disabled={busy}><RefreshCcw size={18} aria-hidden />{busy ? "Wird geladen…" : "Aktualisieren"}</button>
        </div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Statistikbereiche">
        {tabs.map(({ id, label, icon: Icon }, index) => <button type="button" key={id} id={`visitor-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="visitor-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`visitor-tab-${tabs[next].id}`)?.focus(); }
        }}><Icon size={21} aria-hidden />{label}</button>)}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.period}><strong>Listen & Seitenbesuche</strong><div className={styles.segment} aria-label="Zeitraum">{(["last7d", "last30d"] as const).map(key => <button type="button" key={key} aria-pressed={key === windowKey} onClick={() => setWindow(key)}>{key === "last7d" ? "7 Tage" : "30 Tage"}</button>)}</div></div>
        <div className={styles.dataDates} aria-live="polite"><SourceStatus label="Website" source={snapshot?.website} /><SourceStatus label="Details" source={snapshot?.details} /><span>Europe/Berlin</span></div>
      </div>
      {(error || sourceError) && <div className={styles.error} role="alert">{error || "Eine Datenquelle konnte nicht aktualisiert oder gelesen werden. Vorhandene Werte zeigen den letzten gültigen Stand."}</div>}
      {busy && snapshot && <span role="status" className={styles.muted}>Gespeicherter Statistikstand wird nachgeladen…</span>}
      {busy && !snapshot && <p className={styles.muted} role="status">Gespeicherte Statistik wird geladen…</p>}
      <div id="visitor-panel" role="tabpanel" aria-labelledby={`visitor-tab-${tab}`} className={styles.tabPanel} tabIndex={0}>
        {tab === "overview" && <>
          <section className={styles.metrics} aria-label="Kennzahlen">
            <MetricCard label="Website-Besucher heute" value={websiteValues?.today} icon={UsersRound} hint={website?.state === "ready" ? `${formatDate(website.today, false)} · Europe/Berlin` : websiteNote(website)} />
            <MetricCard label="Website-Besucher gesamt" value={websiteValues?.total} icon={Globe2} hint={website?.state === "ready" ? `Seit ${formatDate(website.effectiveStartDate, false)}` : websiteNote(website)} />
            <MetricCard label="Ø Website-Besucher / Tag" value={websiteValues?.dailyAverage} icon={CalendarDays} hint={website?.state === "ready" ? `${formatNumber(website.dayCount)} Kalendertage · höchstens 30 Tage` : websiteNote(website)} />
            <MetricCard label="Seitenbesuche" value={details?.totals?.[windowKey]?.visits} icon={Copy} hint={`Letzte ${days} Tage · bisherige Zählung`} />
          </section>
          <div className={styles.overviewGrid}>
            <article className={`${styles.panel} ${styles.pagesPanel}`}>
              <header className={styles.panelHeader}><div><h2>Meistbesuchte Seiten</h2><p>Seitenbesuche · {days} Tage</p></div><span className={styles.badge}>Top {limit}</span></header>
              <Ranking rows={details?.topPages?.[windowKey]} compact unavailable={!details} />
              <footer className={styles.panelFooter}><span>Ein Besucher kann mehrere Seiten besuchen.</span><TextLink onClick={() => openContents()}>Seiten & Profile ansehen</TextLink></footer>
            </article>
            <div className={styles.rightColumn}>
              <CollectionPanel details={details} windowKey={windowKey} onOpen={() => setTab("collection")} />
              <article className={styles.panel}>
                <header className={styles.panelHeader}><h2>Profile & Guides</h2><span className={styles.badge}>Top {limit}</span></header>
                <div className={styles.profileLinks}>{contentOptions.slice(1).map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => openContents(id)}><Icon size={22} aria-hidden /><span><strong>{label}</strong> — Top {limit}</span><ArrowRight size={16} aria-hidden /></button>)}</div>
                <footer className={styles.panelFooter}><TextLink onClick={() => openContents("topPlayers")}>Ranglisten öffnen</TextLink></footer>
              </article>
            </div>
          </div>
          <article className={`${styles.panel} ${styles.sizesPanel}`}>
            <header className={styles.panelHeader}><h2>Seitenbesuche nach Bildschirmgröße</h2></header>
            <SizeBreakdown value={details?.screenSizes?.[windowKey]?.overall} sizes={details?.screenSizes} windowKey={windowKey} />
          </article>
          <div className={styles.notice}><Info size={22} aria-hidden /><span>Besucher und Seitenbesuche sind unterschiedliche Kennzahlen.</span><TextLink onClick={() => setTab("basis")}>Datenbasis ansehen</TextLink></div>
        </>}
        {tab === "contents" && <article className={styles.panel}>
          <header className={styles.panelHeader}><div><h2>Inhalte</h2><p>Seitenbesuche · {days} Tage · {periodLabel(details?.totals?.[windowKey])}</p></div><span className={styles.badge}>Höchstens {limit} je Rangliste</span></header>
          <div className={styles.contentSwitch} aria-label="Inhaltsart">{contentOptions.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-pressed={content === id} onClick={() => setContent(id)}><Icon size={18} aria-hidden />{label}</button>)}</div>
          <h3 className={styles.listTitle}>{contentOptions.find(option => option.id === content)?.label}</h3>
          <Ranking rows={details?.[content]?.[windowKey]} unavailable={!details} sizes={details?.screenSizes} windowKey={windowKey} />
          <p className={styles.muted}>Höchstens {limit} Einträge; keine vollständige Nutzungszahl. Kennungen und Pfade werden ohne zusätzliche Namensabfragen angezeigt.</p>
        </article>}
        {tab === "usage" && <Usage details={details} windowKey={windowKey} />}
        {tab === "collection" && <CollectionPanel details={details} windowKey={windowKey} full />}
        {tab === "basis" && <Basis snapshot={snapshot} windowKey={windowKey} />}
      </div>
    </section>
    {isAdmin && settingsOpen && <VisitorSettingsOverlay onClose={closeSettings} trigger={settingsButton.current} />}
  </main>;
}
export default function AdminVisitorAnalyticsPage() {
  const { status, user } = useAuth();
  if (status === "idle" || status === "loading") return null;
  if (!canReadVisitorAnalytics(status, user)) return <Navigate to="/" replace />;
  const isAdmin = user!.roles.includes("admin");
  return <VisitorDashboard key={`${user!.id}:${isAdmin}`} isAdmin={isAdmin} />;
}
