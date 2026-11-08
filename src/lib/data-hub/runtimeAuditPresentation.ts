import type { AuditReport, AuditStatus } from "./runtimeAudit";

/** Names describe the measured work, never an inferred click or opened overlay. */
export const AUDIT_NAMES: Record<string, readonly [string, string]> = {
  F01: ["Data Hub", "Favoritenbestand"], F02: ["Data Hub", "Favoritenansicht"],
  F03: ["Hubsuche", "Lokale Suchvorbereitung"], F04: ["Hubsuche", "Archivsuchvorbereitung"],
  F05: ["Hubsuche", "Suche"], F06: ["Hubsuche", "Zielauflösung"], F07: ["Data Hub", "Datenbestand"],
  F08: ["Gildenübersicht", "Aktuelle Daten"], F09: ["Gildenübersicht", "Historischer Vergleich"],
  F10: ["Gildenübersicht", "Mitgliederwerte und Vergleich"], F11: ["Gildenübersicht", "Gildentrend"],
  F12: ["Gildenanalyse", "Datenbestand"], F13: ["Gildenanalyse", "Ansicht"], F14: ["Kampftracking", "Verläufe"],
  F15: ["Gildensuche", "Cloudsuche"], F16: ["Spielerprofil", "Einstieg"], F17: ["Spielerprofil", "Aktuelle Daten"],
  F18: ["Spielerprofil", "Analytics"], F19: ["Topliste", "Metadaten"], F20: ["Topliste", "Datenbestand"],
  F21: ["Topliste", "Ansicht"], F22: ["Topliste", "Suche"], F23: ["Topliste", "Zielauflösung"],
  F24: ["Topliste", "Vergleich"], F25: ["PNG-Export", "Bild erstellen"], F26: ["Kampftracking", "Datenbestand"],
  F27: ["Kampftracking", "Trackerdetails"], F28: ["Kampftracking", "Mitgliederabgleich"],
  F29: ["Kampftracking", "Änderung"], F30: ["Kampftracking", "Texterkennung"], F31: ["Kampftracking", "Teilnahmeansicht"],
  F32: ["Fusionsplanung", "Mitgliederverteilung"], F33: ["Scanverwaltung", "Lokaler Bestand"],
  F34: ["Scanverwaltung", "Archivansicht"], F35: ["Scanverwaltung", "Scandetails"], F36: ["Scanverwaltung", "Scanoperation"],
  F37: ["Gildenübersicht", "Progress"],
  S01: ["Data Hub", "Archivquellenauswahl"], S02: ["Data Hub", "Archivquelle bereitstellen"],
  S03: ["Data Hub", "Analytics-Quellenvorbereitung"], S04: ["Spielerprofil", "Historienvorbereitung"],
  S05: ["Data Hub", "Archivsuchvorbereitung"], S06: ["Data Hub", "Lokale Datenbereitschaft"],
  S07: ["Data Hub", "Identitätsvorbereitung"], S08: ["Topliste", "Quellenvorbereitung"], S09: ["Data Hub", "Service-Worker-/Auslieferungsstand prüfen"],
};
const variants: Record<string, string> = {
  "F37:progress-history": "Progress-Historie laden (Chart ausstehend)",
  "F37:guild-comparison": "Server-Gildendurchschnitte aufbereiten",
  "F37:graph-geometry": "Progress darstellen",
  "F18:currentInsights": "Aktuelle Einblicke", "F18:history": "Historie", "F18:bests": "Persönliche Bestwerte", "F18:career": "Karriereverlauf",
  "F18:comparison": "Historischer Vergleich", "F05:query-debounce": "Suche vorbereiten",
  "F07:refreshLocal": "Lokaler Datenbestand", "F07:refreshArchive": "Archivbestand",
  "F13:playerComparison": "Spielervergleich", "F13:report": "Bericht", "F13:scanChart": "Scanverlauf", "F13:series": "Verläufe",
  "F22:search-session-dataset-init": "Lokale Suchvorbereitung", "F28:loadSyncPlan": "Abgleichvorschau",
  "F28:applyMemberMergePlan": "Mitglieder übernehmen", "F29:createManualTracker": "Tracker anlegen",
  "S05:loadSearchIndex": "Einzelindex bereitstellen",
  "F01:@callback": "Favoriten wiederherstellen", "F01:mutate": "Favoriten ändern",
  "F08:main:buildGuildOverviewKpis": "Kennzahlenprojektion", "F08:main:buildDashboardGuildCardKpis": "Gildenkarte projizieren",
  "F08:main:buildClassDistribution": "Klassenverteilung projizieren", "F10:dashboard-member-values-comparison": "Mitgliedervergleich berechnen",
  "F10:buildDashboardStaticPlayerCardItems": "Mitgliederkarten projizieren", "F13:averageMembers": "Mitgliederdurchschnitt",
  "F13:graph-geometry": "Graphdarstellung", "F11:graph-geometry": "Gildentrend darstellen", "F18:graph-geometry": "Graphdarstellung",
  "F01:refresh": "Favoritenbestand prüfen",
  "F22:results": "Suchergebnisse projizieren", "F23:search-target-click": "Suchziel öffnen", "F23:hub-command-target": "Suchziel übernehmen",
  "F24:comparisonResult": "Vergleich projizieren", "F25:handlePreviewParticipationExport": "Exportvorschau",
  "F25:handleExportParticipation": "Teilnahmebild exportieren", "F25:downloadPngUrl": "Bild herunterladen",
  "F25:renderExportNodeToPngBlob": "Teilnahmebild erstellen", "F26:readFightTrackerSummaries": "Trackerbestand",
  "F29:createTrackerFromGuildSource": "Tracker aus Gilde anlegen", "F29:saveTrackerRename": "Tracker umbenennen",
  "F29:confirmTrackerDelete": "Tracker löschen", "F29:addMember": "Mitglied ergänzen", "F29:handleMemberActiveChange": "Mitglied aktivieren/deaktivieren",
  "F29:handleMemberDelete": "Mitglied entfernen", "F29:handleFightDelete": "Kampf entfernen", "F29:handleFightOpponentGuildChange": "Gegnergilde ändern",
  "F29:saveFightInDailySlot": "Kampf speichern", "F29:handleApplyImportReview": "Importprüfung übernehmen",
  "F29:applyParticipationStatusDrafts": "Teilnahmeänderungen übernehmen", "F29:handleSetMemberFightStatus": "Teilnahme ändern",
  "F31:deriveParticipationRows": "Teilnahme projizieren", "F31:sortParticipationRows": "Teilnahme sortieren",
  "F32:classDistribution": "Klassenverteilung projizieren", "F32:scenario-allocation-render": "Szenario projizieren",
  "F34:archive-day-counts": "Archivmengen projizieren", "F34:archiveGroups": "Archivgruppen projizieren",
  "F34:archiveManifestEntries": "Archiveinträge projizieren", "F34:archiveRows": "Archivansicht projizieren",
  "F35:buildScanExplorerData": "Scandetails vorbereiten", "F35:getLimitedScanExplorerResults": "Scandetails filtern",
  "F35:getScanExplorerGuildDetail": "Gildendetails", "F35:linkScanExplorerPlayerToGuildMember": "Mitglied zuordnen",
  "F35:normalizeScanExplorerPlayer": "Spieler aufbereiten", "F36:confirmRenameSlot": "Scanslot umbenennen",
  "F36:confirmTransferImport": "Übertragung importieren", "F36:deleteScans": "Scans entfernen", "F36:deleteSelectedScans": "Ausgewählte Scans entfernen",
  "F36:exportSelectedFightTrackers": "Tracker exportieren", "F36:exportSelectedScans": "Scans exportieren",
  "F36:handleFilesSelected": "Importdateien vorbereiten", "F36:handleImportFiles": "Dateien importieren",
  "F36:handleUpdateInputChange": "Scanaktualisierung vorbereiten", "F36:runScanMergeJob": "Scans zusammenführen",
  "F36:runSfToolsImportJob": "Scans importieren", "F36:saveArchiveEntries": "Archivquellen speichern", "F36:startMergePreview": "Zusammenführung vorbereiten",
  "S06:ensureLegacyScanMigration": "Lokale Datenmigration", "S06:listGuildHubScanSummaries": "Lokale Scanübersichten",
  "S06:readDataHubLocalScanMetadata": "Lokale Metadaten", "S07:revalidateIdentityResolutionSnapshot": "Identitäten prüfen",
};
const statuses: Record<AuditStatus, string> = {
  completed: "abgeschlossen", missing: "kein Bestand", partial: "Teilbestand", failed: "fehlgeschlagen",
  aborted: "abgebrochen", superseded: "abgelöst", "stale-discarded": "veraltet verworfen",
  timeout: "Zeitlimit", "recording-stopped": "Aufzeichnung beendet",
};
export function auditDisplayName(report: AuditReport) {
  const [defaultArea, defaultTask] = AUDIT_NAMES[report.family] ?? ["Data Hub", report.family === "worker" ? "Workerauftrag" : "Diagnosephase"];
  const area = typeof report.fields.consumerArea === "string" ? report.fields.consumerArea : defaultArea;
  const variant = report.family === "F18" ? report.fields.area : report.action;
  const task = report.action === "shared-queue-job" ? "Geteilte Analytics-Vorbereitung" : report.family === "S05" && report.action === "loadScanArchiveSearchIndexSet" && area !== "Data Hub"
    ? "Suchvorbereitung" : variants[`${report.family}:${variant}`] ?? defaultTask;
  return `${area} · ${task}`;
}

const triggers: Record<string, string> = {
  "consumer-first-record": "erster verfügbarer Favoritenrecord",
  "consumer-effect-setup-unchanged-record": "erneutes Effectsetup, Record unverändert",
  "favorites-record-reference-and-revision-changed": "Favoritenrecord und Revision geändert",
  "favorites-record-value-changed-same-revision": "Favoritenwerte geändert, Revision gleich",
  "favorites-record-reference-changed": "Favoritenreferenz geändert, Wertänderung unbekannt",
  "first-subscriber": "erster Storeabonnent", "favorites-broadcast": "Favoritenhinweis aus anderem Tab",
  visibilitychange: "Sichtbarkeit", focus: "Fensterfokus", pageshow: "Seitenrückkehr", resume: "Dokument fortgesetzt",
  "tracker-first-effect-setup": "erstes Quellen-Effectsetup",
  "tracker-effect-setup-unchanged-selection": "erneutes Effectsetup, Auswahlreferenz unverändert",
  "tracker-selection-reference-changed": "Auswahlreferenz geändert",
  "tracker-list-return": "Rückkehr zur Trackerliste", "tracker-created-from-guild": "Tracker aus Gilde angelegt",
  "tracker-created-manually": "Tracker manuell angelegt", "tracker-deleted": "Tracker gelöscht",
  "tracker-manual-refresh": "manuelle Quellenaktualisierung", "unknown": "unbekannt", "unbekannt": "unbekannt",
};

/** Only known render call sites are observations; no equality/time based deduplication. */
export function auditIsRenderObservation(family: string, action: string) {
  return family === "F08" && action.startsWith("main:") ||
    family === "F10" && ["TrendSparkline", "buildDashboardPlayerCardItems", "buildDashboardStaticPlayerCardItems"].includes(action) ||
    family === "F11" && action === "guild-trend-chart-projection" ||
    family === "F13" && ["averageMembers", "playerComparison", "report", "scanChart", "series"].includes(action) ||
    family === "F22" && action === "results" || family === "F24" && action === "comparisonResult" ||
    family === "F31" || family === "F32" && action !== "loadMembers" ||
    family === "F34" && action !== "loadArchiveEntries" ||
    family === "F36" && ["buildImportPreviewRows", "buildMergePreviewRows", "buildScanPreviewRows"].includes(action);
}
/** These memo outputs are independent views; publish only the accepted render.
 * Other projections are details of a load/query, including passive F22 results. */
export function auditIsCommittedView(family: string, action: string) {
  return family === "F13" && ["playerComparison", "report"].includes(action) ||
    family === "F31" && action === "sortParticipationRows" ||
    family === "F32" && action === "{ takeMembers, benchMembers, dropMembers, undecidedMembers }" ||
    family === "F34" && action === "archiveRows";
}

const relations = new Set(["child", "preparation", "source-flight-consumer", "in-flight-join", "await-existing-promise", "completed-result-reuse", "input-preparation", "render-observation", "input-result", "queue-job", "dependency-trigger"]);
export function auditOperationDetails(root: AuditReport, retained: readonly AuditReport[]) {
  // Temporary indexes over the existing bounded collector, never another history.
  const byId = new Map(retained.map(r => [r.id, r]));
  const ids = [root.id], visited = new Set<string>(), reports: AuditReport[] = [];
  let unavailable = 0;
  while (ids.length) {
    const id = ids.pop()!; if (visited.has(id)) continue; visited.add(id);
    const report = byId.get(id); if (!report) { unavailable++; continue; }
    reports.push(report);
    for (const link of report.links) if (relations.has(link.relation)) ids.push(link.id);
    for (const child of retained) if (child.parentId === id) ids.push(child.id);
  }
  const historicalRelations = new Set(["record-origin", "historical-restore", "historical-store-notification", "store-notification"]);
  const historicalReferences = root.links.filter(link => historicalRelations.has(link.relation))
    .map(link => ({ ...link, details: byId.has(link.id) ? "retained" : "not-retained", report: byId.get(link.id) }));
  return { reports, unavailable, historicalReferences };
}
export function auditConsoleSummary(root: AuditReport, retained: readonly AuditReport[], evicted = 0) {
  const details = auditOperationDetails(root, retained);
  const projection = root.family === "F02" && root.action === "projectHubFavorites";
  const unchanged = root.family === "F01" && ["refresh", "@callback"].includes(root.action) && root.status === "completed" &&
    root.fields.recordReferenceChanged === false && !root.counts.storeNotifications;
  const parts = [auditDisplayName(root), unchanged ? "Bestand geprüft, unverändert" : projection && root.status === "completed" ? "Berechnung abgeschlossen" : statuses[root.status ?? "completed"], `${(root.elapsedMs ?? 0).toFixed(1)} ms`];
  if (["F01", "F02", "F26"].includes(root.family) && typeof root.fields.trigger === "string") parts.push(`Auslöser: ${root.fields.triggerKind === "dependency-callback" ? "Quellen-/Dependencycallback" : triggers[root.fields.trigger] ?? root.fields.trigger}`);
  if (projection && root.fields.awaitConsumerDecision) {
    parts.push(root.fields.consumerDecision === "accepted" ? "vom Consumer angenommen" : root.fields.consumerDecision === "superseded"
      ? "vom Consumer verworfen" : root.fields.consumerDecision === "not-accepted" ? "keine Ergebnisübernahme" : "Ergebnisübernahme ausstehend");
    if (root.fields.consumerDecision === "accepted") parts.push(root.spans.some(s => s.name === "react-commit") ? "React-Commit beobachtet; Pixelpaint unbekannt" : "React-Commit noch nicht beobachtet");
    if (root.fields.consumerObservationDeadline || root.fields.consumerDetailsUnavailable || root.fields.consumerObservationStopped) parts.push("Übernahmebeobachtung begrenzt");
  } else if (projection) parts.push("Ergebnisübernahme unbekannt; kein Consumeranschluss");
  if (projection) {
    if (root.fields.recordOriginDetails === "unknown") parts.push("Recordherkunft unbekannt");
    else if (root.fields.recordOriginDetails === "not-retained") parts.push("Recordherkunft nicht erhalten");
    if (root.fields.notificationDetails === "not-retained") parts.push("Benachrichtigungsnachweis nicht erhalten");
    if (details.historicalReferences.some(link => link.details === "not-retained")) parts.push("Herkunftsdetails nicht erhalten");
  }
  if (typeof root.fields.notificationTrigger === "string") parts.push(`Benachrichtigung: ${root.fields.notificationTrigger}`);
  const graphEvents = root.spans.filter(s => s.name === "graph-commit" || s.name === "graph-render-opportunity");
  const chainComplete = !details.unavailable && !details.reports.some(r => r.droppedFields || r.droppedSpans || r.droppedLinks);
  if (graphEvents.length) {
    // Interval union of explicitly measured graph work; references to prior data
    // are excluded. No addition of overlapping source/worker containers.
    const intervals = details.reports.filter(r => r.id === root.id || r.fields.graphOperationId === root.id).flatMap(r => r.spans)
      .filter(s => s.kind === "sync-elapsed" && /graph-geometry|build.*(?:Chart|Series|Comparison|Report)|TrendSparkline|chart-scale/i.test(s.name) && s.endMs !== undefined)
      .map(s => [s.startMs, s.endMs!]).sort((a,b) => a[0]-b[0]);
    let calculation = 0, end = -Infinity;
    for (const [a,b] of intervals) { calculation += Math.max(0, b-Math.max(a,end)); end = Math.max(end,b); }
    if (intervals.length) parts.push(`Berechnung (beobachtet): ${calculation.toFixed(1)} ms`);
    for (const [event, label] of [["graph-commit", "bis Graphübernahme"], ["graph-render-opportunity", "bis Rendergelegenheit"]]) {
      const observed = graphEvents.filter(s => s.name === event && typeof s.fields?.reactionMs === "number");
      if (chainComplete && observed.length) parts.push(`${label}: ${Math.max(...observed.map(s => Number(s.fields!.reactionMs))).toFixed(1)} ms`);
      else parts.push(`${label}: unbekannt`);
    }
  } else if (root.fields.awaitGraph) parts.push("Graphreaktion: unbekannt");
  // Final output dimensions never sum intermediate phases or input snapshots.
  for (const [key, label] of [["result:players", "Spieler"], ["result:guilds", "Gilden"], ["result:members", "Mitglieder"], ["result:intervals", "Intervalle"], ["result:hits", "Treffer"], ["result:sources", "Quellen"], ["result:entries", "Einträge"], ["result:snapshots", "Snapshots"], ["result:playerRows", "Spielerzeilen"], ["result:guildRows", "Gildenzeilen"], ["resultRows", "Ergebniszeilen"]]) {
    if (typeof root.fields[key] === "number") parts.push(`${root.fields[key]} ${label}`);
  }
  if (typeof root.fields.totalRows === "number") parts.push(`${root.fields.totalRows} Zeilen insgesamt`);
  const byId = new Map(details.reports.map(r => [r.id, r]));
  const belongsToOperation = (report: AuditReport) => {
    let next: AuditReport | undefined = report;
    const seen = new Set<string>();
    while (next && !seen.has(next.id)) {
      if (next.id === root.id) return true;
      seen.add(next.id); next = next.parentId ? byId.get(next.parentId) : undefined;
    }
    return false;
  };
  const sets = details.reports.filter(r => r.family === "S05" && r.action === "loadScanArchiveSearchIndexSet");
  const ownedSets = sets.filter(belongsToOperation), referencedSets = sets.filter(r => !belongsToOperation(r));
  if (referencedSets.length) {
    const known = referencedSets.every(r => r.counts.indexesLoaded !== undefined);
    if (known) parts.push(`${referencedSets.reduce((sum,r) => sum+r.counts.indexesLoaded,0)} vorbereitete Indexergebnisse (referenziert)`);
    else parts.push("Suchbasis referenziert (Menge unbekannt)");
  }
  if (ownedSets.length) {
    const requestedKnown = ownedSets.every(r => r.counts.indexesRequested !== undefined);
    const requested = requestedKnown ? ownedSets.reduce((sum,r) => sum+r.counts.indexesRequested,0) : undefined;
    if (requested !== undefined) parts.push(`${requested} ${ownedSets.length === 1 ? "Indizes" : "Indexzugriffe"}`);
    const ownedIds = new Set(ownedSets.map(r => r.id));
    const physical = details.reports.filter(r => r.family === "S05" && r.action === "loadSearchIndex" &&
      (ownedIds.has(r.parentId ?? "") || ownedSets.some(set => set.links.some(link => link.id === r.id))));
    const owned = physical.filter(belongsToOperation), shared = physical.filter(r => !belongsToOperation(r));
    if (ownedSets.every(r => r.counts.cacheResults !== undefined)) {
      const caches = ownedSets.reduce((sum,r) => sum+r.counts.cacheResults,0);
      parts.push(`${caches} ${ownedSets.length === 1 && !shared.length ? "Cachetreffer" : "Cacheergebnisse (Consumer)"}`);
    }
    if (shared.length) parts.push(`${shared.length} geteilte Quellen (referenziert)`);
    // Every real acquire must reach a retained physical ID. Multiple consumers
    // may reference one job; count that job once, never by adding set/worker sums.
    const acquired = ownedSets.flatMap(r => r.spans.filter(s => s.name === "search-index-consumer-acquire"));
    const complete = requested !== undefined && acquired.length === requested &&
      acquired.every(s => typeof s.fields?.sourceId === "string" && physical.some(r => r.id === s.fields!.sourceId)) &&
      !details.unavailable && !details.reports.some(r => r.droppedLinks || r.droppedFields || r.droppedSpans) &&
      owned.every(r => typeof r.fields.networkAccessed === "boolean");
    if (complete) parts.push(`${owned.filter(r => r.fields.networkAccessed === true).length} ${shared.length ? "eigene Downloads" : "Downloads"}`);
    else {
      const attempts = owned.filter(r => r.fields.downloadRequested === true).length;
      if (attempts) parts.push(`${attempts} Downloadversuche`);
      parts.push("Netzwerkanzahl unbekannt");
    }
    if (ownedSets.every(r => r.counts.indexesFailed !== undefined)) {
      const failed = ownedSets.reduce((sum,r) => sum+r.counts.indexesFailed,0);
      if (failed) parts.push(`${failed} fehlende/fehlerhafte Indizes`);
    }
  } else if (!referencedSets.length) {
    if (root.fields.source === "cache") parts.push("aus Cache");
    if (root.fields.networkAccessed === false) parts.push("kein Netzwerkzugriff");
    else if (root.fields.networkAccessed === true) parts.push("Netzwerkzugriff");
    const shared = root.links.filter(l => l.relation === "in-flight-join" || l.relation === "completed-result-reuse").length;
    if (shared) parts.push(`${shared} geteilte Vorbereitungen (referenziert)`);
  }
  const failed = details.reports.filter(r => r.id !== root.id && ["failed", "timeout"].includes(r.status ?? "")).length;
  const partial = details.reports.some(r => r.id !== root.id && ["partial", "missing"].includes(r.status ?? ""));
  if (failed) parts.push(`${failed} Quellenfehler`);
  if (details.reports.some(r => r.spans.some(s => s.name === "phase-error"))) parts.push("Phasenfehler in Details");
  if (details.reports.some(r => r.spans.some(s => ["failed", "timeout"].includes(String(s.fields?.workerStatus ?? s.fields?.childStatus ?? ""))))) parts.push("Workerfehler in Details");
  if (partial && root.status !== "partial" && root.status !== "missing") parts.push("Teilbestand in Details");
  const lost = details.reports.reduce((sum, r) => sum + r.droppedFields + r.droppedLinks + r.droppedSpans +
    Object.entries(r.counts).filter(([k]) => /(?:Dropped|Unavailable)/.test(k)).reduce((s, [,v]) => s + v, 0), 0);
  if (lost || details.unavailable || evicted || root.fields.parentDetailsUnavailable) parts.push(`Aufzeichnungsdetails begrenzt (${lost} gekürzt · ${details.unavailable} nicht verfügbar · ${evicted} verdrängt)`);
  return { headline: parts.join(" · "), ...details };
}

export function printAuditOperation(root: AuditReport, retained: readonly AuditReport[], evicted: number) {
  const { headline, reports, unavailable, historicalReferences } = auditConsoleSummary(root, retained, evicted);
  console.groupCollapsed(headline);
  try {
    console.log("Auftrag und Kontext", { id: root.id, family: root.family, action: root.action, parentId: root.parentId,
      route: root.route, trigger: root.fields.trigger ?? "unbekannt", links: root.links, unavailable, evictedReports: evicted,
      historicalReferences, executionStartMs: root.startMs, executionEndMs: root.endMs, executionElapsedMs: root.elapsedMs,
      consumerDecision: root.fields.consumerDecision, consumerDecisionMs: root.fields.consumerDecisionMs });
    console.table(reports.map(r => ({ Vorgang: auditDisplayName(r), ID: r.id, Parent: r.parentId, Status: r.status ?? "läuft",
      DauerMs: r.elapsedMs, Quelle: r.fields.archiveScanId ?? r.fields.sourceScanId, Indexversion: r.fields.searchIndexSha256,
      Entscheidung: r.fields.source ?? r.fields.decision, Netzwerk: r.fields.networkAccessed ?? "unbekannt", Fehler: r.fields.errorCode ?? r.fields.errorClass,
      VerloreneDetails: r.droppedFields + r.droppedLinks + r.droppedSpans })));
    for (const report of reports) {
      console.groupCollapsed(`${auditDisplayName(report)} · ${report.id}`);
      try { console.log("Zuordnung, Mengen, Phasen und Commitbeobachtungen", report); }
      finally { console.groupEnd(); }
    }
  } finally { console.groupEnd(); }
}
