/** Known legacy messages: translate only when displayed; preserve unknown diagnostics. */
export const dataHubMessageAliases: Record<string, string> = {
  "OCR wird lokal vorbereitet...": "fightTrackerI18n.ocrPreparing",
  "Screenshot lokal gescannt.": "fightTrackerI18n.ocrComplete",
  "OCR konnte nicht ausgefuehrt werden.": "fightTrackerI18n.ocrFailed",
  "loading tesseract core": "fightTrackerI18n.ocrCore",
  "initializing tesseract": "fightTrackerI18n.ocrInit",
  "loading language traineddata": "fightTrackerI18n.ocrLanguage",
  "initializing api": "fightTrackerI18n.ocrApi",
  "recognizing text": "fightTrackerI18n.ocrRecognizing",
  "loading tesseract core completed": "fightTrackerI18n.ocrCore",
  "loaded tesseract core": "fightTrackerI18n.ocrCore",
  "initialized tesseract": "fightTrackerI18n.ocrInit",
  "loaded language traineddata": "fightTrackerI18n.ocrLanguage",
  "initialized api": "fightTrackerI18n.ocrApi",
  "loading tesseract worker": "fightTrackerI18n.ocrWorker",
  "Defense-Report erkannt - aktuell noch nicht unterstuetzt.": "fightTrackerI18n.ocrDefense",
  "Gegnergilde konnte nicht sicher erkannt werden.": "fightTrackerI18n.ocrOpponent",
  "Abschnitt mit fehlenden Mitgliedern wurde nicht erkannt.": "fightTrackerI18n.ocrMissingSection",
  "Ende des Missing-Abschnitts wurde nicht sicher erkannt.": "fightTrackerI18n.ocrMissingEnd",
  "Keine verwertbaren fehlenden Mitglieder erkannt.": "fightTrackerI18n.ocrNoMissing",
  "Scan-Quellen konnten nicht geladen werden.": "fightTrackerI18n.scanSourcesFailed",
  "Fight-Tracker-Daten konnten nicht geladen werden.": "fightTrackerI18n.trackerDataFailed",
  "Fight Tracker konnte nicht geoeffnet werden.": "fightTrackerI18n.trackerOpenFailed",
  "Fight-Tracker-Auswahl konnte nicht aktualisiert werden.": "fightTrackerI18n.trackerSelectionFailed",
  "Scan-Synchronisierung konnte nicht vorbereitet werden.": "fightTrackerI18n.syncFailed",
  "Mindestens ein gespeicherter Fight hat keine gueltige Erstellzeit.": "fightTrackerI18n.missingCreatedAt",
  "Mehrere gespeicherte Fights teilen sich dieselbe neueste Erstellzeit.": "fightTrackerI18n.duplicateCreatedAt",
  "Keine neuen Mitglieder gefunden": "fightTrackerI18n.noNewMembers",
  "Der Report ist fuer einen einzelnen PNG-Export zu gross. Inhalte wurden nicht gekuerzt.": "fightTrackerI18n.exportTooLarge",
  "PNG konnte nicht erzeugt werden.": "fightTrackerI18n.pngFailed",
  "PNG-Vorschau konnte nicht erzeugt werden.": "fightTrackerI18n.previewFailed",
  "Export-Vorschau konnte nicht vorbereitet werden.": "fightTrackerI18n.preparePreviewFailed",
  "Schliessen": "dataHubI18n.close",
  "Search players or guilds...": "dataHubI18n.searchPlayersOrGuilds",
  "Guild Identifier": "dataHubI18n.guildIdentifier",
  "Player Identifier": "dataHubI18n.playerIdentifier",
  "XP Next": "dataHubI18n.xpToNextLevel",
  "Secondary Damage": "dataHubI18n.secondaryDamage",
  "Progression / Bonuses": "dataHubI18n.progressBonuses",
  "Mount Type": "dataHubI18n.mountType",
  "Mount Bonus": "dataHubI18n.mountBonus",
  "Mount Expires": "dataHubI18n.mountExpires",
  "Portal Health": "dataHubI18n.portalHealth",
  "Portal Damage": "dataHubI18n.portalDamage",
  "Guild Treasure": "dataHubI18n.guildTreasure",
  "Guild Instructor": "dataHubI18n.guildInstructor",
  "Guild Pet": "dataHubI18n.guildPet",
  "Guild Member": "dataHubI18n.guildMember",
  "Last Active": "dataHubI18n.lastActive",
  "Ready Attack": "dataHubI18n.readyForAttack",
  "Ready Defense": "dataHubI18n.readyForDefense",
  "Hydra Action": "dataHubI18n.hydraAction",
  "Attack Action": "dataHubI18n.attackAction",
  "Defense Action": "dataHubI18n.defenseAction",
  "Raid Action": "dataHubI18n.raidAction",
  "Knights Contribution": "dataHubI18n.knightsContributed",
  "Raid Honor": "dataHubI18n.raidHonor",
  "Current Building": "dataHubI18n.currentBuilding",
  "Upgrade Active": "dataHubI18n.upgradeActive",
  "Normal Total": "dataHubI18n.normalTotal",
  "Normal Unlocked": "dataHubI18n.normalUnlocked",
  "Shadow Total": "dataHubI18n.shadowTotal",
  "Shadow Unlocked": "dataHubI18n.shadowUnlocked",
  "Class Total": "dataHubI18n.classTotal",
  "Class Unlocked": "dataHubI18n.classUnlocked",
  "Player Portal": "dataHubI18n.playerPortal",
  "Guild Portal": "dataHubI18n.guildPortal",
  "Normal Entries": "dataHubI18n.normalEntries",
  "Normal Progress": "dataHubI18n.normalProgress",
  "Shadow Entries": "dataHubI18n.shadowEntries",
  "Shadow Progress": "dataHubI18n.shadowProgress",
  "Class Entries": "dataHubI18n.classEntries",
  "Class Progress": "dataHubI18n.classProgress",
  "Life Active": "dataHubI18n.lifePotionActive",
  "Life Size": "dataHubI18n.lifePotionSize",
  "Total Count": "dataHubI18n.totalCount",
  "Total Level": "dataHubI18n.totalLevel",
  "Epic Chance": "dataHubI18n.epicChance",
  "Item Quality": "dataHubI18n.itemQuality",
  "CoA": "dataHubI18n.coatOfArms",
  "Complete Snapshots": "dataHubI18n.completeSnapshots",
  "Bonuses / Totals": "dataHubI18n.bonusesTotals",
  "Total Treasure": "dataHubI18n.totalTreasure",
  "Total Instructor": "dataHubI18n.totalInstructor",
  "Total Knights": "dataHubI18n.totalKnights",
  "Total Knights 15": "dataHubI18n.totalKnights15",
  "Guild Pet ID": "dataHubI18n.guildPetId",
  "Guild Pet Level": "dataHubI18n.guildPetLevel",
  "Guild Pet Class": "dataHubI18n.guildPetClass",
  "Combat Progress": "dataHubI18n.combatProgress",
  "Portal Floor": "dataHubI18n.portalFloor",
  "Portal Life": "dataHubI18n.portalLife",
  "Portal Percent": "dataHubI18n.portalPercent",
  "Hydra Level": "dataHubI18n.hydraLevel",
  "Hydra Max": "dataHubI18n.hydraMaximum",
  "Under Attack": "dataHubI18n.underAttack",
  "Under Attack ID": "dataHubI18n.attackerId",
  "Attacking ID": "dataHubI18n.attackTargetId",
  "Scan Details": "dataHubI18n.scanDetails",
  "Job läuft...": "dataHubI18n.jobRunning",
  "Verarbeite...": "dataHubI18n.processing",
  "Lädt...": "dataHubI18n.loading",
  "Lade...": "dataHubI18n.loading",
  "lokal gespeichert": "dataHubI18n.savedLocally",
  "online verfügbar": "dataHubI18n.availableOnline",
  "Vollständige Guild-Snapshots": "dataHubI18n.completeGuildSnapshots",
  "Keine Player gefunden.": "dataHubI18n.noPlayersFound",
  "Keine Guilds gefunden.": "dataHubI18n.noGuildsFound",
  "No matching GuildMember entry is available in this scan.": "dataHubI18n.noMatchingGuildMemberEntryIsAvailableInThisScan",
  "Keine Guild-Coverage gefunden.": "dataHubI18n.noGuildCoverageFound",
  "Keine Memberliste aus der NormalizedGuild-Semantik verfügbar.": "dataHubI18n.noMemberListIsAvailableFromNormalizedGuildData",
  "Tracker/Gilde": "dataHubI18n.trackerGuild",
  "Erstellt eine zusätzliche JSON. Die ausgewählten Scans bleiben einzeln erhalten.": "dataHubI18n.createsAnAdditionalJsonFileTheSelectedScansAreKeptIndividually",
  "Member gesamt": "dataHubI18n.totalMembers",
  "Fights gesamt": "dataHubI18n.totalFights",
  "Logical Scans": "dataHubI18n.logicalScans",
  "Erster Timestamp": "dataHubI18n.firstTimestamp",
  "Letzter Timestamp": "dataHubI18n.lastTimestamp",
  "Uebersicht": "dataHubI18n.overview",
  "Woechentlich": "dataHubI18n.weekly",
  "Analytics-Daten werden aktualisiert": "dataHubI18n.updatingAnalyticsData",
  "Nach einem SF Data Hub-Update werden deine lokalen Scans einmalig neu eingelesen. Das kann je nach Anzahl deiner Scans etwas laenger dauern.": "dataHubI18n.afterAnSfDataHubUpdateYourLocalScansAreReadAgain",
  "Materializing historical player and guild observations.": "dataHubI18n.preparingHistoricalPlayerAndGuildObservations",
  "Reading materialized snapshots, members, and guilds.": "dataHubI18n.readingPreparedSnapshotsMembersAndGuilds",
  "Analytics-Bereiche": "dataHubI18n.analyticsSections",
  "Lokale Analytics-Daten konnten nicht geladen werden.": "dataHubI18n.localAnalyticsDataCouldNotBeLoaded",
  "Waehle im Guild Hub eine Gilde aus.": "dataHubI18n.selectAGuildInGuildHub",
  "Keine lokalen Scandaten fuer diese Gilde gefunden.": "dataHubI18n.noLocalScanDataFoundForThisGuild",
  "Im gewaehlten Zeitraum liegen keine lokalen Scans vor.": "dataHubI18n.noLocalScansInTheSelectedPeriod",
  "Guild Average": "dataHubI18n.guildAverage",
  "Guild Development Zusammenfassung": "dataHubI18n.guildDevelopmentSummary",
  "Fuer eine Entwicklung werden mindestens zwei lokale Scans benoetigt.": "dataHubI18n.developmentRequiresAtLeastTwoLocalScans",
  "Guild Development": "dataHubI18n.guildDevelopment",
  "Metrik": "dataHubI18n.metric",
  "Fight-Daten konnten nicht geladen werden.": "dataHubI18n.fightDataCouldNotBeLoaded",
  "Server Fusion": "dataHubI18n.serverFusion",
  "Chart Legende": "dataHubI18n.chartLegend",
  "keine Spieler": "dataHubI18n.noPlayers",
  "Ausgewaehlte Spieler": "dataHubI18n.selectedPlayers",
  "Fight-Daten werden geladen": "dataHubI18n.loadingFightData",
  "Kein verknuepfter Fight Tracker fuer diese Gilde vorhanden.": "dataHubI18n.noLinkedFightTrackerForThisGuild",
  "Im verknuepften Fight Tracker sind noch keine Attack-Fights gespeichert.": "dataHubI18n.noAttackFightsAreSavedInTheLinkedFightTrackerYet",
  "Keine Fight-Daten im ausgewaehlten Zeitraum.": "dataHubI18n.noFightDataInTheSelectedPeriod",
  "Fight Participation Zusammenfassung": "dataHubI18n.fightParticipationSummary",
  "Letzter Fight": "dataHubI18n.lastFight",
  "Ø Participants": "dataHubI18n.averageParticipants",
  "Keine lokalen Scandaten fuer Fortschritt verfuegbar.": "dataHubI18n.noLocalScanDataAvailableForProgress",
  "Mindestens zwei Scans werden fuer eine Fortschrittsauswertung benoetigt.": "dataHubI18n.progressAnalysisRequiresAtLeastTwoScans",
  "Guild Fortschritt": "dataHubI18n.guildProgress",
  "Guild Progress": "dataHubI18n.guildProgress",
  "tatsaechlicher Abstand:": "dataHubI18n.actualInterval",
  "Snapshot-Vergleich": "dataHubI18n.snapshotComparison",
  "Durchschnitt Level": "dataHubI18n.averageLevel",
  "Durchschnitt Basiswerte": "dataHubI18n.averageBaseStats",
  "Durchschnitt Gesamtwerte": "dataHubI18n.averageTotalStats",
  "Level Delta": "dataHubI18n.levelChange",
  "Basis Delta": "dataHubI18n.baseChange",
  "Gesamt Delta": "dataHubI18n.totalChange",
  "Veraenderung": "dataHubI18n.change",
  "Durchschnitt Mitglieder": "dataHubI18n.averageMembers",
  "Delta Mitglieder:": "dataHubI18n.memberDifference",
  "Waehle zwei Gilden aus, um den direkten Vergleich zu starten.": "dataHubI18n.selectTwoGuildsToStartADirectComparison",
  "Waehlen": "dataHubI18n.select",
  "Mitglieder - Durchschnittslevel": "dataHubI18n.membersAverageLevel",
  "Naechstes Update": "dataHubI18n.nextUpdate",
  "Audit der Rollenabdeckung (Tank/Heal/Support)": "dataHubI18n.reviewRoleCoverageTankHealSupport",
  "Kommunikationskanaele zusammenfuehren": "dataHubI18n.combineCommunicationChannels",
  "Server-Transfers und Namenskonflikte pruefen": "dataHubI18n.checkServerTransfersAndNameConflicts",
  "Vor dem Vergleich pruefen": "dataHubI18n.checkBeforeComparing",
  "Transfers-Diff": "dataHubI18n.transferDifferences",
  "Hier erscheint spaeter die Auswertung aus": "dataHubI18n.thisWillShowTheAnalysisFrom",
  ". Aktuell nur eine Info-Box, damit der Slot sichtbar bleibt.": "dataHubI18n.currentlyAnInformationBoxToKeepTheSlotVisible",
  "Bereite schon jetzt deine Kriterien vor, damit die spaetere Automatik direkt Daten aufnehmen kann.": "dataHubI18n.prepareYourCriteriaNowSoFutureAutomationCanUseTheDataDirectly",
  "Guild Member Count": "dataHubI18n.guildMemberCount",
  "Fight Participation": "dataHubI18n.fightParticipation",
  "Needs Review": "dataHubI18n.needsReview",
  "No Historical Observation": "dataHubI18n.noHistoricalObservation",
  "No Historical Data": "dataHubI18n.noHistoricalData",
  "unknown scope": "dataHubI18n.unknownScope",
  "Scan Coverage": "dataHubI18n.scanCoverage",
  "All Matches": "dataHubI18n.allMatches",
  "Preparing Fusion Dashboard": "dataHubI18n.preparingFusionDashboard",
  "Select a cached analysis or run Analyze from the Fusion Dashboard.": "dataHubI18n.selectACachedAnalysisOrRunAnalyzeFromTheFusionDashboard",
  "Fusion Dashboard": "dataHubI18n.fusionDashboard",
  "Same CoA": "dataHubI18n.sameCoa",
  "Raw-Container wird gespeichert.": "dataHubI18n.savingRawDataContainer",
  "Snapshots / Member verarbeiten": "dataHubI18n.processSnapshotsMembers",
  "Analytics-Daten aktualisieren": "dataHubI18n.updateAnalyticsData",
  "Raw-Daten speichern": "dataHubI18n.saveRawData",
  "Keine gültige SF-Tools-Struktur erkannt.": "dataHubI18n.noValidSftoolsStructureDetected",
  "Keine gültige SF-Tools-Struktur: players[] oder groups[] erwartet.": "dataHubI18n.invalidSftoolsStructureExpectedPlayersOrGroups",
  "Pruefsumme wird berechnet.": "dataHubI18n.computingChecksum",
  "Rohdaten werden geprueft.": "dataHubI18n.validatingRawData",
  "Archivscan wurde geprueft.": "dataHubI18n.archiveScanVerified",
  "Downloadgroesse stimmt nicht mit dem Manifest ueberein.": "dataHubI18n.downloadSizeDoesNotMatchTheManifest",
  "SHA-256-Pruefsumme stimmt nicht mit dem Manifest ueberein.": "dataHubI18n.sha256ChecksumDoesNotMatchTheManifest",
  "Entpackte Groesse stimmt nicht mit dem Manifest ueberein.": "dataHubI18n.decompressedSizeDoesNotMatchTheManifest",
  "Guild Overview": "dataHubI18n.guildOverview",
  "Player Overview": "dataHubI18n.playerOverview",
  "Items Base": "dataHubI18n.itemBase",
  "Class Bonus": "dataHubI18n.classBonus",
  "Hand": "dataHubI18n.hands",
  "Gem Mine": "dataHubI18n.gemMine",
  "Archery Guild": "dataHubI18n.archeryGuild",
  "Mage Tower": "dataHubI18n.mageTower",
  "numeric origin equals current server; no historical fusion predecessor expected": "dataHubI18n.numericOriginEqualsCurrentServerNoHistoricalFusionPredecessorExpected",
  "origin could not be resolved": "dataHubI18n.originCouldNotBeResolved",
  "likely historical guild found, but reliable guild/member continuity is insufficient for automatic linking": "dataHubI18n.likelyHistoricalGuildFoundButReliableGuildMemberContinuityIsInsufficientFor",
  "likely historical player found, but identity evidence is insufficient for automatic linking": "dataHubI18n.likelyHistoricalPlayerFoundButIdentityEvidenceIsInsufficientForAutomaticLinking",
  "multiple relevant historical guild candidates require review": "dataHubI18n.multipleRelevantHistoricalGuildCandidatesRequireReview",
  "multiple relevant historical player candidates require review": "dataHubI18n.multipleRelevantHistoricalPlayerCandidatesRequireReview",
  "only weak compatibility matches were found; no candidate has enough identity evidence for review": "dataHubI18n.onlyWeakCompatibilityMatchesWereFoundNoCandidateHasEnoughIdentityEvidence",
  "no matching historical player observation in covered origin scans": "dataHubI18n.noMatchingHistoricalPlayerObservationInCoveredOriginScans",
  "no viable identity remained after compensation-adjusted level progression checks": "dataHubI18n.noViableIdentityRemainedAfterCompensationAdjustedLevelProgressionChecks",
  "no historical guild observations": "dataHubI18n.noHistoricalGuildObservations",
  "only weak guild relations were found": "dataHubI18n.onlyWeakGuildRelationsWereFound",
  "member migrations found, but no continuity evidence": "dataHubI18n.memberMigrationsFoundButNoContinuityEvidence",
  "no plausible identity continuity evidence": "dataHubI18n.noPlausibleIdentityContinuityEvidence",
  "dominant anchored historical guild identity": "dataHubI18n.dominantAnchoredHistoricalGuildIdentity",
  "single strong structural guild continuity after competitor filtering": "dataHubI18n.singleStrongStructuralGuildContinuityAfterCompetitorFiltering",
  "single strong historical guild identity after competitor filtering": "dataHubI18n.singleStrongHistoricalGuildIdentityAfterCompetitorFiltering",
  "multiple equally relevant historical guild identities": "dataHubI18n.multipleEquallyRelevantHistoricalGuildIdentities",
  "a historical guild has multiple relevant post-fusion destinations": "dataHubI18n.aHistoricalGuildHasMultipleRelevantPostFusionDestinations",
  "historical guild identity is claimed by multiple current guilds": "dataHubI18n.historicalGuildIdentityIsClaimedByMultipleCurrentGuilds",
  "multiple anchored historical guild identities remain": "dataHubI18n.multipleAnchoredHistoricalGuildIdentitiesRemain",
  "multiple strong historical guild identities remain": "dataHubI18n.multipleStrongHistoricalGuildIdentitiesRemain",
  "historical guild identity found, but direct continuity is insufficient for automatic linking": "dataHubI18n.historicalGuildIdentityFoundButDirectContinuityIsInsufficientForAutomaticLinking",
  "plausible continuity requires review": "dataHubI18n.plausibleContinuityRequiresReview",
  "one historical identifier is a high-confidence candidate for multiple new players": "dataHubI18n.oneHistoricalIdentifierIsAHighConfidenceCandidateForMultipleNewPlayers",
  "Misc": "dataHubI18n.misc",
  "historical identity is claimed by multiple current identities": "dataHubI18n.identityClaimed",
  "one or more candidate identities are reserved by other ready assignments": "dataHubI18n.reservedIdentities",
  "Transferdatei ist kein gültiges JSON.": "dataHubI18n.errorTransferJson",
  "Transferdatei muss ein JSON-Objekt sein.": "dataHubI18n.errorTransferObject",
  "Unbekanntes Transferformat.": "dataHubI18n.errorTransferFormat",
  "Diese Transferformat-Version wird nicht unterstützt.": "dataHubI18n.errorTransferVersion",
  "Unbekannter Transfer-Datentyp.": "dataHubI18n.errorTransferType",
  "Transferdatei enthält kein gültiges Erstellungsdatum.": "dataHubI18n.errorTransferDate",
  "Transferdatei enthält keine gültige Quelle.": "dataHubI18n.errorTransferSource",
  "Scanpack-Payload muss scans[] enthalten.": "dataHubI18n.errorScanpackPayload",
  "Fight-Tracker-Pack-Payload muss trackers[] enthalten.": "dataHubI18n.errorTrackerpackPayload",
  "Fight-Tracker-Pack enthält keine Tracker.": "dataHubI18n.errorTrackerpackEmpty",
  "Scan-Payload muss ein Objekt sein.": "dataHubI18n.errorScanPayloadObject",
  "Scan-Payload enthält keine rawData.": "dataHubI18n.errorScanPayloadRaw",
  "Fight-Tracker-Payload muss ein Objekt sein.": "dataHubI18n.errorTrackerPayloadObject",
  "Fight-Tracker-Payload enthält keinen Tracker.": "dataHubI18n.errorTrackerPayloadMissing",
  "Fight-Tracker-Payload muss members[] und fights[] enthalten.": "dataHubI18n.errorTrackerPayloadLists",
  "Fight-Tracker-Member muss ein Objekt sein.": "dataHubI18n.errorTrackerMemberObject",
  "Fight-Tracker-Member verweist auf einen anderen Tracker.": "dataHubI18n.errorTrackerMemberRef",
  "Fight-Tracker-Fight muss ein Objekt sein.": "dataHubI18n.errorTrackerFightObject",
  "Fight-Tracker-Fight verweist auf einen anderen Tracker.": "dataHubI18n.errorTrackerFightRef",
  "Archivscan enthaelt keine gueltigen players/groups-Daten.": "dataHubI18n.errorArchiveRawMissing",
  "Archivscan-Zaehler stimmen nicht mit dem Manifest ueberein.": "dataHubI18n.errorArchiveCounts",
  "Archivkatalog ist kein Objekt.": "dataHubI18n.errorCatalogObject",
  "Archivkatalog-Version wird nicht unterstuetzt.": "dataHubI18n.errorCatalogVersion",
  "Archivkatalog enthaelt keine Archive.": "dataHubI18n.errorCatalogEmpty",
  "Manifest-Scan ist kein Objekt.": "dataHubI18n.errorManifestScanObject",
  "Manifest-Scan ohne ID.": "dataHubI18n.errorManifestScanId",
  "Archivmanifest ist kein Objekt.": "dataHubI18n.errorManifestObject",
  "Archivmanifest-Version wird nicht unterstuetzt.": "dataHubI18n.errorManifestVersion",
  "Archivmanifest gehoert nicht zum erwarteten Jahr.": "dataHubI18n.errorManifestYear",
  "Archivmanifest enthaelt keine Scans.": "dataHubI18n.errorManifestEmpty",
  "Manifest scanCount stimmt nicht.": "dataHubI18n.errorManifestScanCount",
  "Manifest serverCount stimmt nicht.": "dataHubI18n.errorManifestServerCount",
  "Failed to fetch": "dataHubI18n.errorNetworkFetch",
  "Scan-Slot-Summary wurde nicht gefunden.": "dataHubI18n.errorSlotSummary",
  "Scan-Slot-Recovery conflicts with another slot.": "dataHubI18n.errorSlotRecovery",
  "Local source inventory is incomplete: legacy scan migration is pending.": "dataHubI18n.errorSourceInventoryPending",
  "manifest_year_not_in_catalog": "dataHubI18n.errorManifestYearMissing",
  "conflicting_archive_selection_sha": "dataHubI18n.errorConflictingArchiveSelection"
};
export const dataHubMessagePatterns = [
  {
    "pattern": "^(\\d+) Scans und (\\d+) Spieler erkannt\\.$",
    "key": "dataHubI18n.jobDetectedCounts"
  },
  {
    "pattern": "^(\\d+)/(\\d+) Spieler verarbeitet\\.$",
    "key": "dataHubI18n.jobProcessedPlayers"
  },
  {
    "pattern": "^(\\d+)/(\\d+) Scans verarbeitet\\.$",
    "key": "dataHubI18n.jobProcessedScans"
  },
  {
    "pattern": "^(\\d+) Quellen werden für den Scan-Slot vorbereitet\\.$",
    "key": "dataHubI18n.jobPreparingSlotSources"
  },
  {
    "pattern": "^(\\d+) Quellen werden vorbereitet\\.$",
    "key": "dataHubI18n.jobPreparingSources"
  },
  {
    "pattern": "^(.+) wird vorbereitet\\.$",
    "key": "dataHubI18n.jobPreparingFile"
  },
  {
    "pattern": "^(.+) wurde importiert\\.$",
    "key": "dataHubI18n.jobFileImported"
  },
  {
    "pattern": "^(.+) ist bereits vorhanden\\.$",
    "key": "dataHubI18n.jobFileExists"
  },
  {
    "pattern": "^(.+) wurde erstellt\\.$",
    "key": "dataHubI18n.jobFileCreated"
  },
  {
    "pattern": "^(.+) wurde erstellt\\. Die Quelldateien wurden beibehalten\\.$",
    "key": "dataHubI18n.jobFileCreatedSourcesKept"
  },
  {
    "pattern": "^(.+): (\\d+) Scans gebündelt\\.$",
    "key": "dataHubI18n.jobScansGrouped"
  },
  {
    "pattern": "^(.+): (\\d+) Scans zusammengeführt\\. Die Quelldateien wurden beibehalten\\.$",
    "key": "dataHubI18n.jobScansMerged"
  },
  {
    "pattern": "^(.+) konnte nicht vollständig verarbeitet werden\\. Bitte importiere die Datei erneut\\.$",
    "key": "dataHubI18n.jobFileInterrupted"
  },
  {
    "pattern": "^Download fehlgeschlagen \\((\\d+)\\)\\.$",
    "key": "dataHubI18n.jobDownloadFailed"
  },
  {
    "pattern": "^Ausgewählte Scans wurden nicht gefunden: (.+)$",
    "key": "dataHubI18n.jobMissingSelectedScans"
  },
  {
    "pattern": "^Ein identisches Bundle ist bereits vorhanden: (.+)$",
    "key": "dataHubI18n.jobDuplicateBundle"
  },
  {
    "pattern": "^Scan-ID ist mehrfach in der Transferdatei enthalten: (.+)$",
    "key": "dataHubI18n.jobDuplicateTransferId"
  },
  {
    "pattern": "^Scan-ID-Konflikt: (.+)$",
    "key": "dataHubI18n.jobConflictingScanId"
  },
  {
    "pattern": "^Zusammenführung nicht möglich: Für (.+) Datensätze wurden widersprüchliche Inhalte mit identischer Scanzeit und Identität gefunden\\.$",
    "key": "dataHubI18n.jobConflictingMergeRecords"
  },
  {
    "pattern": "^(\\d+) matched players$",
    "key": "dataHubI18n.jobMatchedPlayers"
  },
  {
    "pattern": "^(\\d+) continued officers$",
    "key": "dataHubI18n.jobContinuedOfficers"
  },
  {
    "pattern": "^(\\d+) leadership core overlap$",
    "key": "dataHubI18n.jobLeadershipOverlap"
  },
  {
    "pattern": "^numeric origin resolved to (.+) from player history$",
    "key": "dataHubI18n.jobNumericOriginFromHistory"
  },
  {
    "pattern": "^numeric origin resolved to (.+)$",
    "key": "dataHubI18n.jobNumericOrigin"
  },
  {
    "pattern": "^fusion name suffix resolved to (.+) from player history$",
    "key": "dataHubI18n.jobSuffixOriginFromHistory"
  },
  {
    "pattern": "^fusion name suffix resolved to (.+)$",
    "key": "dataHubI18n.jobSuffixOrigin"
  },
  {
    "pattern": "^fusion lineage produced (.+)$",
    "key": "dataHubI18n.jobLineageOrigins"
  },
  {
    "pattern": "^(.+): Pflichtfeld (.+) fehlt oder ist ungültig\\.$",
    "key": "dataHubI18n.errorRequiredField"
  },
  {
    "pattern": "^(.+): Feld (.+) ist ungültig\\.$",
    "key": "dataHubI18n.errorInvalidField"
  },
  {
    "pattern": "^(.+): Feld (.+) muss eine Liste sein\\.$",
    "key": "dataHubI18n.errorArrayField"
  },
  {
    "pattern": "^(.+) ist keine gueltige Zahl\\.$",
    "key": "dataHubI18n.errorValidNumber"
  },
  {
    "pattern": "^(.+) ist keine nicht-negative Ganzzahl\\.$",
    "key": "dataHubI18n.errorNonnegativeInteger"
  },
  {
    "pattern": "^(.+) ist keine positive Ganzzahl\\.$",
    "key": "dataHubI18n.errorPositiveInteger"
  },
  {
    "pattern": "^Archivkatalog-Eintrag (\\d+) ist ungueltig\\.$",
    "key": "dataHubI18n.errorCatalogEntry"
  },
  {
    "pattern": "^Archivjahr (\\d{4}) ist mehrfach im Katalog enthalten\\.$",
    "key": "dataHubI18n.errorCatalogDuplicateYear"
  },
  {
    "pattern": "^Archivjahr (\\d{4}) hat keinen Aktivstatus\\.$",
    "key": "dataHubI18n.errorCatalogYearStatus"
  },
  {
    "pattern": "^Archivjahr (\\d{4}) hat keine Manifest-URL\\.$",
    "key": "dataHubI18n.errorCatalogYearUrl"
  },
  {
    "pattern": "^Archivjahr (\\d{4}) verwendet keine HTTP\\(S\\)-Manifest-URL\\.$",
    "key": "dataHubI18n.errorCatalogYearHttp"
  },
  {
    "pattern": "^Ungueltiger Server-Prefix: (.+)$",
    "key": "dataHubI18n.errorServerPrefix"
  },
  {
    "pattern": "^Ungueltiger Scan-Timestamp fuer (.+)\\.$",
    "key": "dataHubI18n.errorScanTimestamp"
  },
  {
    "pattern": "^Unsicherer Manifestpfad: (.+)$",
    "key": "dataHubI18n.errorManifestPath"
  },
  {
    "pattern": "^Ungueltiges Archivformat fuer (.+)\\.$",
    "key": "dataHubI18n.errorArchiveFormat"
  },
  {
    "pattern": "^Ungueltige Kompression fuer (.+)\\.$",
    "key": "dataHubI18n.errorArchiveCompression"
  },
  {
    "pattern": "^Ungueltige SHA-256-Pruefsumme fuer (.+)\\.$",
    "key": "dataHubI18n.errorArchiveSha"
  },
  {
    "pattern": "^Archivscan-ID ist mehrfach enthalten: (.+)$",
    "key": "dataHubI18n.errorArchiveDuplicateId"
  },
  {
    "pattern": "^Archivpfad ist mehrfach enthalten: (.+)$",
    "key": "dataHubI18n.errorArchiveDuplicatePath"
  },
  {
    "pattern": "^(.+\\[\\d+\\]) ist kein Objekt\\.$",
    "key": "dataHubI18n.errorArchiveRowObject"
  },
  {
    "pattern": "^(.+\\[\\d+\\]) gehoert nicht zu (.+)\\.$",
    "key": "dataHubI18n.errorArchiveRowServer"
  },
  {
    "pattern": "^(.+\\[\\d+\\]) hat einen abweichenden Timestamp\\.$",
    "key": "dataHubI18n.errorArchiveRowTime"
  },
  {
    "pattern": "^Abruf fehlgeschlagen \\((\\d+)\\): (.+)$",
    "key": "dataHubI18n.errorFetchStatusUrl"
  },
  {
    "pattern": "^fetch_failed:(\\d+)$",
    "key": "dataHubI18n.errorFetchStatus"
  },
  {
    "pattern": "^Source changed before library commit: (.+)$",
    "key": "dataHubI18n.errorSourceChangedCommit"
  },
  {
    "pattern": "^Source changed before readiness commit: (.+)$",
    "key": "dataHubI18n.errorSourceChangedReady"
  },
  {
    "pattern": "^Archivscan (.+) hat keinen Suchindex\\.$",
    "key": "dataHubI18n.errorArchiveMissingIndex"
  },
  {
    "pattern": "^Lokaler Scan wurde nicht gefunden: (.+)$",
    "key": "dataHubI18n.errorLocalScanMissing"
  },
  {
    "pattern": "^Lokaler Scan passt nicht zum Archivscan (.+)\\.$",
    "key": "dataHubI18n.errorLocalArchiveMismatch"
  },
  {
    "pattern": "^PNG konnte nicht in Originalgroesse erzeugt werden \\((\\d+)x(\\d+) statt (\\d+)x(\\d+)\\)\\. Inhalte wurden nicht verkleinert\\.$",
    "key": "fightTrackerI18n.pngSize"
  }
].map(entry => ({ ...entry, regex: new RegExp(entry.pattern) }));
