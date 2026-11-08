# Codex-Arbeitsdateien

Der produktive Checkout ist dieses Repository. Produktdateien und kleine dauerhafte
Regressionseingaben unter `tools/**/fixtures` weiterhin hier bearbeiten.

Alle neuen temporären Codex-Artefakte extern unter dem repo-spezifischen Arbeitsbereich
`../codex/sfdatahub.github.io` ablegen (Windows: `D:\SFDataHub\codex\sfdatahub.github.io`).
Keine neuen W-Ordner, Repo-Kopien, Browserprofile, Berichte, Logs, Screenshots, Exporte,
Hilfsmodule oder Testcaches im Produktrepo erzeugen. Keine Verknüpfung vom Repo-tmp
zum externen Arbeitsbereich und keine Gitignore-Regel als Ersatz für einen Umzug.

Verbindliche, einzige Arbeitsmappe:
`../codex/sfdatahub.github.io/tmp/data-hub-workbook.md`.
Versioniertes `tmp/data-hub-analysis.md` bleibt das Original; die externe Kopie ist nur Referenz.

Neue Repo-Kopien nach `repo-copies`, Browserprofile nach `browser-profiles`, allgemeine
Testausgaben nach `test-runs`, Taskberichte nach `tmp/wNNN` im externen Arbeitsbereich.
`tools/codex/workspace.mjs` zur Pfadauflösung und Ausgabeprüfung verwenden.
Optionaler Override `SFDATAHUB_CODEX_WORK_DIR` bezeichnet genau diesen repo-spezifischen
Arbeitsbereich. Keine stillen Rückfälle ins Repo-tmp und keine Ausgaben im Produktcheckout.

Tests mit temporären Produkt-/Buildzugriffen über `node tools/codex/run.mjs <script> [args]`
ausführen. Der Starter übernimmt den aktuellen uncommitteten Arbeitsstand in eine externe
Kopie und vererbt den Arbeitsbereich automatisch. Historische Eingaben nie durch aktuellen
Code ersetzen. Vorhandene historische Nachweise und Provenienzangaben unverändert erhalten.

Bearbeitbare Test- und Sicherungskopien müssen unabhängige Dateikopien sein; ihre
Quelldateien nicht per Hardlink teilen. Hardlinks ausschließlich für einen geprüften
Umzug mit anschließender Entfernung des alten Eintrags verwenden. Installierte Pakete
dürfen über Verzeichnisverknüpfungen gelesen werden; Schreibcaches bleiben separat.

Weitere Struktur und Testaufrufe stehen im externen `README.md`. Andere Repositories
werden durch diese repo-spezifische Regel nicht migriert oder verändert.


## Verbindliche Umfangsgrenzen und realitätsnahe Prüfung

### Umfang und bestehende Gestaltung schützen

- Vor Änderungen die konkret erlaubte Änderung und die zu erhaltenden Eigenschaften
  aus Auftrag, Screenshots und aktuellem Code bestimmen. Eine kleine Positions-/Abstandsänderung
  erlaubt keine Neudefinition von Raster, Größen, Komponentenstruktur oder globalen Styles.
  Routineentscheidungen innerhalb des Auftrags selbstständig treffen.
- Wird eine Änderung außerhalb dieses Umfangs für notwendig gehalten, vor ihrer Umsetzung
  die konkrete Notwendigkeit belegen und die offene Entscheidung klären. Den Auftrag nicht
  eigenmächtig erweitern oder eine alternative Gestaltung als Reparatur einführen.
- Vor Bearbeitung den tatsächlichen Anfangsstand der betroffenen Dateien einschließlich
  vorhandener uncommitteter Änderungen gezielt extern sichern. Nur eigene Änderungen
  zurücknehmen; zwischenzeitliche fremde Änderungen erhalten. Ein Rückbau gilt erst nach
  Abgleich mit diesem Anfangsstand als bestätigt. Kein pauschales Git-Reset/Checkout.
- Meldet Danny eine Regression, weitere Schreibänderungen stoppen und zunächst Iststand,
  Taskdiff und Befund lesend abgleichen. Keine zweite Lösungsvariante hinterherschreiben.
  Ein beauftragter Rückbau und ein neuer Reparaturversuch sind getrennte Arbeitsschritte;
  nach einem beauftragten Rückbau nicht ungefragt erneut implementieren.

### Passende Bestandsdaten gehören zur ursprünglichen Task

- Vor Umsetzung bestimmen, welche Daten und Zustände den beauftragten Anwendungsfall
  tatsächlich beeinflussen: betroffene Spieler/Gilden/Server und Scans sowie bei Bedarf
  Präferenzen, bestätigte Identitäten, Quellenbindungen, Ableitungs-/Cacheversionen und
  bereits geladener Zustand. Nur den jeweils benötigten Umfang übernehmen.
- Die gezielte Bereitstellung dieser Daten im externen Prüfbereich und ihre Prüfung gehören
  zur ursprünglichen Implementierungs-/Fix-Task. Nicht erst nach einer Fehlermeldung eine
  zusätzliche Task mit repräsentativem Bestand verlangen. Bereits geeignete externe
  Eingaben wiederverwenden; ihre Eignung für den aktuellen Fall und Datenstand prüfen.
- Bestehende Freigaben für benötigte Browser-/Anwendungsdaten in ihrem konkreten Umfang
  berücksichtigen und nicht erneut erfragen. Begrenzte frühere Freigaben sind keine pauschale
  Erlaubnis für weitere persönliche Datenzugriffe. Fehlt eine notwendige Freigabe oder Quelle,
  den konkreten Bedarf früh innerhalb derselben Task benennen und nur davon unabhängige
  Arbeiten fortsetzen. Den persönlichen Browser nicht ungefragt bedienen.
- Mit den relevanten übernommenen Daten den tatsächlichen betroffenen Bedienweg prüfen,
  etwa Overview -> Profil im bereits laufenden Zustand. Ein direkter Kaltstart ersetzt keinen
  warmen Navigationsfall. Regulären App-Einstieg, Styles und Datenpfade verwenden; nötige
  Testersetzungen und dadurch nicht geprüfte Übergänge ausdrücklich offenlegen.
- Synthetische Daten dürfen gezielte Randfälle ergänzen. Bei bestands-/zustandsabhängigen
  Problemen sind sie allein kein Nachweis, dass Dannys konkreter Fehler behoben ist.
  Auch echte Daten allein ersetzen nicht den passenden Einstieg und Laufzeitzustand.

### Begrenzter Nachweis und ehrlicher Abschluss

- Ausschließlich unabhängige externe Kopie, privater Headless-Browser im Hintergrund und
  dieselbe Testkopie verwenden. Ein begrenzter gezielter Durchgang; danach nur tatsächlich
  fehlgeschlagene/offene Punkte nach notwendiger Korrektur erneut prüfen. Keine Wiederholung
  bestandener Abschnitte, Browserstarterserien, zusätzlichen Sicherheitsrunden, Builds,
  Vollhashläufe oder Archivkampagnen ohne entsprechenden Auftrag.
- Vorher/Nachher auch die ausdrücklich zu erhaltenden Eigenschaften vergleichen und den
  Diff gegen den tatsächlichen Anfangsstand auf Umfang prüfen. Eine erfüllte Zielposition
  bei beschädigter übriger Formatierung ist kein erfolgreicher Abschluss.
- Im Abschluss Datenbasis, Bedienweg, tatsächlich geprüften Codezustand und wesentliche
  Grenzen nennen. Fehlt der relevante Bestand oder Bedienweg, bleibt der konkrete Fall
  unverifiziert und darf nicht als behoben/fertig bestätigt werden. Fehlende Nachweise nicht
  als persönliche Abnahmeaufgabe verstecken; persönliche Abnahme bleibt davon getrennt.
- Bestandene isolierte Prüfungen widerlegen Dannys beobachtete Regression nicht. Ursache,
  Rückbau und Behebung nur mit konkretem Beleg behaupten; keine Cache-/Browsererklärung
  oder andere Ursache aus einem Screenshot allein erfinden.
