import type {
  ScanArchiveCatalog,
  ScanArchiveCatalogEntry,
  ScanArchiveEntry,
  ScanArchiveManifest,
  ScanArchiveManifestScan,
  ScanArchiveSearchIndexGuildEntry,
  ScanArchiveSearchIndexMetadata,
  ScanArchiveSearchIndexPayload,
  ScanArchiveSearchIndexPlayerEntry,
  ScanArchiveToplistReference,
  ScanArchiveToplistsManifest,
} from "./types";

const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_SEARCH_INDEX_SCHEMA_VERSION = 1;
const SUPPORTED_FORMAT = "sftools.raw.v1";
const SERVER_PREFIX_PATTERN = /^[a-z0-9_]+$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export type ScanArchiveValidationErrorCode =
  | "catalog_not_object"
  | "catalog_version"
  | "catalog_archives"
  | "catalog_entry"
  | "catalog_duplicate_year"
  | "catalog_manifest_url"
  | "manifest_not_object"
  | "manifest_version"
  | "manifest_year"
  | "manifest_scans"
  | "manifest_scan_not_object"
  | "manifest_scan_id"
  | "manifest_server"
  | "manifest_timestamp"
  | "manifest_path"
  | "manifest_format"
  | "manifest_compression"
  | "manifest_sha256"
  | "manifest_duplicate_scan_id"
  | "manifest_duplicate_path"
  | "manifest_scan_count"
  | "manifest_server_count"
  | "manifest_number"
  | "manifest_integer"
  | "toplists_not_object"
  | "toplists_version"
  | "toplists_current"
  | "toplists_monthly"
  | "toplists_month_key"
  | "toplists_server"
  | "toplists_unknown_server"
  | "toplists_unknown_scan"
  | "toplists_wrong_server"
  | "toplists_wrong_year"
  | "toplists_wrong_month"
  | "toplists_empty_set"
  | "toplists_duplicate_scan"
  | "toplists_missing_data"
  | "toplists_missing_search_index"
  | "search_index_not_object"
  | "search_index_version"
  | "search_index_path"
  | "search_index_sha256"
  | "search_index_size"
  | "search_index_count"
  | "search_index_count_mismatch"
  | "search_payload_not_object"
  | "search_payload_version"
  | "search_payload_source"
  | "search_payload_rows"
  | "search_payload_entry"
  | "search_payload_count_mismatch";

export class ScanArchiveValidationError extends Error {
  readonly code: ScanArchiveValidationErrorCode;

  constructor(code: ScanArchiveValidationErrorCode, message: string) {
    super(message);
    this.name = "ScanArchiveValidationError";
    this.code = code;
  }
}

const validationError = (code: ScanArchiveValidationErrorCode, message: string) =>
  new ScanArchiveValidationError(code, message);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isSafeRelativePath = (path: string) => {
  if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return !path.split("/").some((segment) => !segment || segment === "." || segment === "..");
};

const assertFiniteNumber = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw validationError("manifest_number", `${label} ist keine gueltige Zahl.`);
  }
  return value;
};

const assertNonNegativeInteger = (value: unknown, label: string) => {
  const parsed = assertFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw validationError("manifest_integer", `${label} ist keine nicht-negative Ganzzahl.`);
  }
  return parsed;
};

const assertPositiveInteger = (value: unknown, label: string) => {
  const parsed = assertFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw validationError("search_index_size", `${label} ist keine positive Ganzzahl.`);
  }
  return parsed;
};

const assertSearchIndexNonNegativeInteger = (value: unknown, label: string) => {
  const parsed = assertFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw validationError("search_index_count", `${label} ist keine nicht-negative Ganzzahl.`);
  }
  return parsed;
};

export function validateScanArchiveCatalog(value: unknown): ScanArchiveCatalog {
  if (!isRecord(value)) throw validationError("catalog_not_object", "Archivkatalog ist kein Objekt.");
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw validationError("catalog_version", "Archivkatalog-Version wird nicht unterstuetzt.");
  }
  if (!Array.isArray(value.archives)) {
    throw validationError("catalog_archives", "Archivkatalog enthaelt keine Archive.");
  }

  const seenYears = new Set<number>();
  const archives = value.archives.map((entry, index): ScanArchiveCatalogEntry => {
    if (!isRecord(entry)) throw validationError("catalog_entry", `Archivkatalog-Eintrag ${index + 1} ist ungueltig.`);
    const year = assertNonNegativeInteger(entry.year, "Archivjahr");
    if (seenYears.has(year)) throw validationError("catalog_duplicate_year", `Archivjahr ${year} ist mehrfach im Katalog enthalten.`);
    seenYears.add(year);
    if (typeof entry.active !== "boolean") throw validationError("catalog_entry", `Archivjahr ${year} hat keinen Aktivstatus.`);
    if (typeof entry.manifestUrl !== "string" || !entry.manifestUrl.trim()) {
      throw validationError("catalog_manifest_url", `Archivjahr ${year} hat keine Manifest-URL.`);
    }
    const manifestUrl = new URL(entry.manifestUrl);
    if (!["https:", "http:"].includes(manifestUrl.protocol)) {
      throw validationError("catalog_manifest_url", `Archivjahr ${year} verwendet keine HTTP(S)-Manifest-URL.`);
    }
    return { year, active: entry.active, manifestUrl: manifestUrl.toString() };
  });

  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, archives };
}

function validateManifestScan(value: unknown, archiveYear: number): ScanArchiveManifestScan {
  if (!isRecord(value)) throw validationError("manifest_scan_not_object", "Manifest-Scan ist kein Objekt.");
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const server = typeof value.server === "string" ? value.server.trim() : "";
  const path = typeof value.path === "string" ? value.path.trim() : "";
  const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
  const timestamp = assertFiniteNumber(value.timestamp, "Scan-Timestamp");
  const timestampDate = new Date(timestamp);

  if (!id) throw validationError("manifest_scan_id", "Manifest-Scan ohne ID.");
  if (!server || !SERVER_PREFIX_PATTERN.test(server)) throw validationError("manifest_server", `Ungueltiger Server-Prefix: ${server}`);
  if (!Number.isInteger(timestamp) || timestamp <= 0 || timestampDate.getUTCFullYear() !== archiveYear) {
    throw validationError("manifest_timestamp", `Ungueltiger Scan-Timestamp fuer ${id}.`);
  }
  if (!isSafeRelativePath(path)) throw validationError("manifest_path", `Unsicherer Manifestpfad: ${path}`);
  if (value.format !== SUPPORTED_FORMAT) throw validationError("manifest_format", `Ungueltiges Archivformat fuer ${id}.`);
  if (value.compression !== "gzip") throw validationError("manifest_compression", `Ungueltige Kompression fuer ${id}.`);
  if (!SHA256_PATTERN.test(sha256)) throw validationError("manifest_sha256", `Ungueltige SHA-256-Pruefsumme fuer ${id}.`);

  return {
    id,
    server,
    timestamp,
    ...(typeof value.timestampUtc === "string" ? { timestampUtc: value.timestampUtc } : {}),
    path,
    format: SUPPORTED_FORMAT,
    compression: "gzip",
    sha256,
    compressedBytes: assertNonNegativeInteger(value.compressedBytes, "Komprimierte Groesse"),
    uncompressedBytes: assertNonNegativeInteger(value.uncompressedBytes, "Unkomprimierte Groesse"),
    playerCount: assertNonNegativeInteger(value.playerCount, "Spieleranzahl"),
    groupCount: assertNonNegativeInteger(value.groupCount, "Gildenanzahl"),
    ...(Object.prototype.hasOwnProperty.call(value, "searchIndex")
      ? { searchIndex: validateSearchIndexMetadata(value.searchIndex, id, value.playerCount, value.groupCount) }
      : {}),
  };
}

function validateSearchIndexMetadata(
  value: unknown,
  scanId: string,
  scanPlayerCount: unknown,
  scanGroupCount: unknown,
): ScanArchiveSearchIndexMetadata {
  if (!isRecord(value)) throw validationError("search_index_not_object", `Suchindex fuer ${scanId} ist kein Objekt.`);
  if (value.schemaVersion !== SUPPORTED_SEARCH_INDEX_SCHEMA_VERSION) {
    throw validationError("search_index_version", `Suchindex-Version fuer ${scanId} wird nicht unterstuetzt.`);
  }
  const path = typeof value.path === "string" ? value.path.trim() : "";
  const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
  if (!isSafeRelativePath(path) || !path.endsWith(".json.gz")) {
    throw validationError("search_index_path", `Unsicherer Suchindexpfad fuer ${scanId}: ${path}`);
  }
  if (!SHA256_PATTERN.test(sha256)) {
    throw validationError("search_index_sha256", `Ungueltige Suchindex-SHA-256-Pruefsumme fuer ${scanId}.`);
  }
  const compressedBytes = assertPositiveInteger(value.compressedBytes, "Suchindex komprimierte Groesse");
  const uncompressedBytes = assertPositiveInteger(value.uncompressedBytes, "Suchindex unkomprimierte Groesse");
  const playerCount = assertSearchIndexNonNegativeInteger(value.playerCount, "Suchindex Spieleranzahl");
  const groupCount = assertSearchIndexNonNegativeInteger(value.groupCount, "Suchindex Gildenanzahl");
  if (playerCount !== scanPlayerCount || groupCount !== scanGroupCount) {
    throw validationError("search_index_count_mismatch", `Suchindex-Zaehler fuer ${scanId} stimmen nicht mit dem Scan ueberein.`);
  }
  return {
    schemaVersion: SUPPORTED_SEARCH_INDEX_SCHEMA_VERSION,
    path,
    sha256,
    compressedBytes,
    uncompressedBytes,
    playerCount,
    groupCount,
  };
}

export function validateScanArchiveManifest(
  value: unknown,
  archiveYear: number,
): ScanArchiveManifest {
  if (!isRecord(value)) throw validationError("manifest_not_object", "Archivmanifest ist kein Objekt.");
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw validationError("manifest_version", "Archivmanifest-Version wird nicht unterstuetzt.");
  }
  if (value.archiveYear !== archiveYear) {
    throw validationError("manifest_year", "Archivmanifest gehoert nicht zum erwarteten Jahr.");
  }
  if (!Array.isArray(value.scans)) throw validationError("manifest_scans", "Archivmanifest enthaelt keine Scans.");

  const revision = assertNonNegativeInteger(value.revision, "Manifest-Revision");
  const scans = value.scans.map((scan) => validateManifestScan(scan, archiveYear));
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const scan of scans) {
    if (ids.has(scan.id)) throw validationError("manifest_duplicate_scan_id", `Archivscan-ID ist mehrfach enthalten: ${scan.id}`);
    if (paths.has(scan.path)) throw validationError("manifest_duplicate_path", `Archivpfad ist mehrfach enthalten: ${scan.path}`);
    ids.add(scan.id);
    paths.add(scan.path);
  }
  if (value.scanCount !== scans.length) throw validationError("manifest_scan_count", "Manifest scanCount stimmt nicht.");
  if (value.serverCount !== new Set(scans.map((scan) => scan.server)).size) {
    throw validationError("manifest_server_count", "Manifest serverCount stimmt nicht.");
  }

  const toplists = Object.prototype.hasOwnProperty.call(value, "toplists")
    ? validateToplistsManifest(value.toplists, archiveYear, scans)
    : undefined;

  scans.sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    archiveYear,
    revision,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    scanCount: scans.length,
    serverCount: new Set(scans.map((scan) => scan.server)).size,
    scans,
    ...(toplists ? { toplists } : {}),
  };
}

function validateToplistsManifest(
  value: unknown,
  archiveYear: number,
  scans: readonly ScanArchiveManifestScan[],
): ScanArchiveToplistsManifest {
  if (!isRecord(value)) throw validationError("toplists_not_object", "Toplistenbereich ist kein Objekt.");
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw validationError("toplists_version", "Toplistenbereich-Version wird nicht unterstuetzt.");
  }

  const scanById = new Map(scans.map((scan) => [scan.id, scan] as const));
  const manifestServers = new Set(scans.map((scan) => scan.server));
  const current = Object.prototype.hasOwnProperty.call(value, "current")
    ? validateToplistServerSelectionMap(value.current, "current", archiveYear, null, scanById, manifestServers)
    : undefined;

  let monthly: Record<string, Record<string, ScanArchiveToplistReference>> | undefined;
  if (Object.prototype.hasOwnProperty.call(value, "monthly")) {
    if (!isRecord(value.monthly)) throw validationError("toplists_monthly", "Toplisten-Monatsauswahl ist kein Objekt.");
    monthly = {};
    for (const [monthKey, selection] of Object.entries(value.monthly)) {
      const month = validateMonthKey(monthKey, archiveYear);
      monthly[monthKey] = validateToplistServerSelectionMap(
        selection,
        "monthly",
        archiveYear,
        month,
        scanById,
        manifestServers,
      );
    }
  }

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    ...(current ? { current } : {}),
    ...(monthly ? { monthly } : {}),
  };
}

function validateMonthKey(monthKey: string, archiveYear: number) {
  const match = monthKey.match(MONTH_KEY_PATTERN);
  if (!match) throw validationError("toplists_month_key", `Ungueltiger Toplisten-Monat: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year !== archiveYear || month < 1 || month > 12) {
    throw validationError("toplists_month_key", `Toplisten-Monat gehoert nicht zum Manifestjahr: ${monthKey}`);
  }
  return { year, month };
}

function validateToplistServerSelectionMap(
  value: unknown,
  role: "current" | "monthly",
  archiveYear: number,
  month: { year: number; month: number } | null,
  scanById: ReadonlyMap<string, ScanArchiveManifestScan>,
  manifestServers: ReadonlySet<string>,
) {
  if (!isRecord(value)) {
    throw validationError(role === "current" ? "toplists_current" : "toplists_monthly", `Toplisten-${role}-Auswahl ist kein Objekt.`);
  }

  const result: Record<string, ScanArchiveToplistReference> = {};
  for (const [server, scanIdValue] of Object.entries(value)) {
    if (!server || !SERVER_PREFIX_PATTERN.test(server)) {
      throw validationError("toplists_server", `Ungueltiger Toplisten-Serverkey: ${server}`);
    }
    if (!manifestServers.has(server)) {
      throw validationError("toplists_unknown_server", `Toplisten-Server ist nicht im Manifest enthalten: ${server}`);
    }
    result[server] = validateToplistReference(scanIdValue, {
      role,
      server,
      archiveYear,
      month,
      scanById,
    });
  }
  return result;
}

type ToplistReferenceValidationContext = {
  role: "current" | "monthly";
  server: string;
  archiveYear: number;
  month: { year: number; month: number } | null;
  scanById: ReadonlyMap<string, ScanArchiveManifestScan>;
};

export type NormalizedScanArchiveToplistReference = {
  kind: "legacy" | "set";
  scanIds: string[];
};

const readToplistReferenceIds = (value: unknown, server: string): { kind: "legacy" | "set"; scanIds: string[] } => {
  if (typeof value === "string") {
    const scanId = value.trim();
    if (!scanId) throw validationError("toplists_unknown_scan", `Toplisten-Auswahl fuer ${server} enthaelt keine Scan-ID.`);
    return { kind: "legacy", scanIds: [scanId] };
  }
  if (!isRecord(value) || !Array.isArray(value.scanIds)) {
    throw validationError("toplists_unknown_scan", `Toplisten-Auswahl fuer ${server} enthaelt keine Scan-ID oder scanIds-Liste.`);
  }
  const scanIds = value.scanIds.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (!scanIds.length || scanIds.some((entry) => !entry)) {
    throw validationError("toplists_empty_set", `Toplisten-Set fuer ${server} enthaelt keine gueltigen Scan-IDs.`);
  }
  if (new Set(scanIds).size !== scanIds.length) {
    throw validationError("toplists_duplicate_scan", `Toplisten-Set fuer ${server} enthaelt doppelte Scan-IDs.`);
  }
  return { kind: "set", scanIds };
};

export function normalizeScanArchiveToplistReference(
  value: unknown,
  scanById: ReadonlyMap<string, ScanArchiveManifestScan>,
): NormalizedScanArchiveToplistReference {
  const raw = readToplistReferenceIds(value, "unknown");
  const scans = raw.scanIds.map((scanId) => {
    const scan = scanById.get(scanId);
    if (!scan) throw validationError("toplists_unknown_scan", `Toplisten-Scan-ID ist nicht im Manifest enthalten: ${scanId}`);
    return scan;
  });
  return {
    kind: raw.kind,
    scanIds: [...scans]
      .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
      .map((scan) => scan.id),
  };
}

function validateToplistReference(
  value: unknown,
  context: ToplistReferenceValidationContext,
): ScanArchiveToplistReference {
  const raw = readToplistReferenceIds(value, context.server);
  const scans = raw.scanIds.map((scanId) => {
    const scan = context.scanById.get(scanId);
    if (!scan) throw validationError("toplists_unknown_scan", `Toplisten-Scan-ID ist nicht im Manifest enthalten: ${scanId}`);
    if (scan.server !== context.server) {
      throw validationError("toplists_wrong_server", `Toplisten-Scan ${scanId} gehoert nicht zu ${context.server}.`);
    }
    if (new Date(scan.timestamp).getUTCFullYear() !== context.archiveYear) {
      throw validationError("toplists_wrong_year", `Toplisten-Scan ${scanId} gehoert nicht zum Manifestjahr.`);
    }
    if (context.month && !isTimestampInUtcMonth(scan.timestamp, context.month.year, context.month.month)) {
      throw validationError("toplists_wrong_month", `Toplisten-Scan ${scanId} liegt nicht im Monat ${context.month.year}-${String(context.month.month).padStart(2, "0")}.`);
    }
    if (!scan.searchIndex) {
      throw validationError("toplists_missing_search_index", `Toplisten-Scan ${scanId} hat keinen Suchindex.`);
    }
    return scan;
  });

  const hasPlayers = scans.some((scan) => scan.playerCount > 0);
  const hasGuilds = scans.some((scan) => scan.groupCount > 0);
  if (raw.kind === "set") {
    const utcMonths = new Set(scans.map((scan) => utcMonthKey(scan.timestamp)));
    if (utcMonths.size > 1) {
      throw validationError("toplists_wrong_month", `Toplisten-Set fuer ${context.server} enthaelt Scans aus unterschiedlichen UTC-Monaten.`);
    }
  }
  if (raw.kind === "legacy") {
    if (scans[0].playerCount <= 0 || scans[0].groupCount <= 0) {
      throw validationError("toplists_missing_data", `Toplisten-Scan ${scans[0].id} enthaelt keine Player- und Guild-Daten.`);
    }
    return scans[0].id;
  }
  if (!hasPlayers || !hasGuilds) {
    throw validationError("toplists_missing_data", `Toplisten-Set fuer ${context.server} enthaelt insgesamt keine Player- und Guild-Daten.`);
  }
  const scanIds = [...scans]
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
    .map((scan) => scan.id);
  return { scanIds };
}

function utcMonthKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isTimestampInUtcMonth(timestamp: number, year: number, month: number) {
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  return timestamp >= start && timestamp < end;
}

export function toScanArchiveEntries(manifest: ScanArchiveManifest, manifestUrl: string): ScanArchiveEntry[] {
  return manifest.scans.map((scan) => ({
    ...scan,
    archiveYear: manifest.archiveYear,
    manifestRevision: manifest.revision,
    manifestUrl,
    fileUrl: new URL(scan.path, manifestUrl).toString(),
  }));
}

export function validateScanArchivePayload(payload: unknown, entry: Pick<ScanArchiveEntry, "server" | "timestamp" | "playerCount" | "groupCount">) {
  if (!isRecord(payload) || !Array.isArray(payload.players) || !Array.isArray(payload.groups)) {
    throw new Error("Archivscan enthaelt keine gueltigen players/groups-Daten.");
  }

  const validateRows = (rows: unknown[], kind: "players" | "groups") => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!isRecord(row)) throw new Error(`${kind}[${index}] ist kein Objekt.`);
      const rowServer = row.prefix ?? row.server;
      if (rowServer !== entry.server) throw new Error(`${kind}[${index}] gehoert nicht zu ${entry.server}.`);
      if (row.timestamp !== entry.timestamp) throw new Error(`${kind}[${index}] hat einen abweichenden Timestamp.`);
    }
  };

  validateRows(payload.players, "players");
  validateRows(payload.groups, "groups");
  if (payload.players.length !== entry.playerCount || payload.groups.length !== entry.groupCount) {
    throw new Error("Archivscan-Zaehler stimmen nicht mit dem Manifest ueberein.");
  }
  return payload as { players: unknown[]; groups: unknown[] };
}

export function validateScanArchiveSearchIndexPayload(
  payload: unknown,
  entry: Pick<ScanArchiveEntry, "id" | "sha256" | "server" | "timestamp" | "playerCount" | "groupCount">,
): ScanArchiveSearchIndexPayload {
  if (!isRecord(payload)) throw validationError("search_payload_not_object", "Suchindex-Payload ist kein Objekt.");
  if (payload.schemaVersion !== SUPPORTED_SEARCH_INDEX_SCHEMA_VERSION) {
    throw validationError("search_payload_version", "Suchindex-Payload-Version wird nicht unterstuetzt.");
  }
  if (
    payload.archiveScanId !== entry.id ||
    payload.sourceSha256 !== entry.sha256 ||
    payload.server !== entry.server ||
    payload.timestamp !== entry.timestamp
  ) {
    throw validationError("search_payload_source", "Suchindex-Payload passt nicht zum Manifest-Scan.");
  }
  if (!Array.isArray(payload.players) || !Array.isArray(payload.guilds)) {
    throw validationError("search_payload_rows", "Suchindex-Payload enthaelt keine gueltigen Player-/Guild-Listen.");
  }

  const players = payload.players.map((row, index) => validateSearchIndexPlayerEntry(row, index));
  const guilds = payload.guilds.map((row, index) => validateSearchIndexGuildEntry(row, index));
  if (players.length !== entry.playerCount || guilds.length !== entry.groupCount) {
    throw validationError("search_payload_count_mismatch", "Suchindex-Payload-Zaehler stimmen nicht mit dem Manifest ueberein.");
  }

  return {
    schemaVersion: SUPPORTED_SEARCH_INDEX_SCHEMA_VERSION,
    archiveScanId: payload.archiveScanId,
    sourceSha256: payload.sourceSha256,
    server: payload.server,
    timestamp: payload.timestamp,
    players,
    guilds,
  };
}

function validateSearchIndexPlayerEntry(value: unknown, index: number): ScanArchiveSearchIndexPlayerEntry {
  if (!isRecord(value)) throw validationError("search_payload_entry", `players[${index}] ist kein Objekt.`);
  const entry: ScanArchiveSearchIndexPlayerEntry = {
    identifier: assertCleanString(value.identifier, `players[${index}].identifier`),
    name: assertCleanString(value.name, `players[${index}].name`),
  };
  if (Object.prototype.hasOwnProperty.call(value, "guildIdentifier")) {
    entry.guildIdentifier = value.guildIdentifier == null ? null : assertCleanString(value.guildIdentifier, `players[${index}].guildIdentifier`);
  }
  if (Object.prototype.hasOwnProperty.call(value, "guildName")) {
    entry.guildName = value.guildName == null ? null : assertCleanString(value.guildName, `players[${index}].guildName`);
  }
  if (Object.prototype.hasOwnProperty.call(value, "classId")) {
    entry.classId = validateSearchIndexClassId(value.classId, index);
  }
  return entry;
}

function validateSearchIndexGuildEntry(value: unknown, index: number): ScanArchiveSearchIndexGuildEntry {
  if (!isRecord(value)) throw validationError("search_payload_entry", `guilds[${index}] ist kein Objekt.`);
  return {
    identifier: assertCleanString(value.identifier, `guilds[${index}].identifier`),
    name: assertCleanString(value.name, `guilds[${index}].name`),
  };
}

function assertCleanString(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw validationError("search_payload_entry", `${label} ist kein gueltiger String.`);
  }
  return value;
}

function validateSearchIndexClassId(value: unknown, index: number) {
  if (value == null) return null;
  if (typeof value === "string") return assertCleanString(value, `players[${index}].classId`);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw validationError("search_payload_entry", `players[${index}].classId ist ungueltig.`);
}
