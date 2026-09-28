import type {
  ScanArchiveCatalog,
  ScanArchiveCatalogEntry,
  ScanArchiveEntry,
  ScanArchiveManifest,
  ScanArchiveManifestScan,
} from "./types";

const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_FORMAT = "sftools.raw.v1";
const SERVER_PREFIX_PATTERN = /^[a-z0-9_]+$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isSafeRelativePath = (path: string) => {
  if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  return !path.split("/").some((segment) => !segment || segment === "." || segment === "..");
};

const assertFiniteNumber = (value: unknown, label: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} ist keine gueltige Zahl.`);
  }
  return value;
};

const assertNonNegativeInteger = (value: unknown, label: string) => {
  const parsed = assertFiniteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} ist keine nicht-negative Ganzzahl.`);
  }
  return parsed;
};

export function validateScanArchiveCatalog(value: unknown): ScanArchiveCatalog {
  if (!isRecord(value)) throw new Error("Archivkatalog ist kein Objekt.");
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error("Archivkatalog-Version wird nicht unterstuetzt.");
  }
  if (!Array.isArray(value.archives)) {
    throw new Error("Archivkatalog enthaelt keine Archive.");
  }

  const seenYears = new Set<number>();
  const archives = value.archives.map((entry, index): ScanArchiveCatalogEntry => {
    if (!isRecord(entry)) throw new Error(`Archivkatalog-Eintrag ${index + 1} ist ungueltig.`);
    const year = assertNonNegativeInteger(entry.year, "Archivjahr");
    if (seenYears.has(year)) throw new Error(`Archivjahr ${year} ist mehrfach im Katalog enthalten.`);
    seenYears.add(year);
    if (typeof entry.active !== "boolean") throw new Error(`Archivjahr ${year} hat keinen Aktivstatus.`);
    if (typeof entry.manifestUrl !== "string" || !entry.manifestUrl.trim()) {
      throw new Error(`Archivjahr ${year} hat keine Manifest-URL.`);
    }
    const manifestUrl = new URL(entry.manifestUrl);
    if (!["https:", "http:"].includes(manifestUrl.protocol)) {
      throw new Error(`Archivjahr ${year} verwendet keine HTTP(S)-Manifest-URL.`);
    }
    return { year, active: entry.active, manifestUrl: manifestUrl.toString() };
  });

  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, archives };
}

function validateManifestScan(value: unknown, archiveYear: number): ScanArchiveManifestScan {
  if (!isRecord(value)) throw new Error("Manifest-Scan ist kein Objekt.");
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const server = typeof value.server === "string" ? value.server.trim() : "";
  const path = typeof value.path === "string" ? value.path.trim() : "";
  const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
  const timestamp = assertFiniteNumber(value.timestamp, "Scan-Timestamp");
  const timestampDate = new Date(timestamp);

  if (!id) throw new Error("Manifest-Scan ohne ID.");
  if (!server || !SERVER_PREFIX_PATTERN.test(server)) throw new Error(`Ungueltiger Server-Prefix: ${server}`);
  if (!Number.isInteger(timestamp) || timestamp <= 0 || timestampDate.getUTCFullYear() !== archiveYear) {
    throw new Error(`Ungueltiger Scan-Timestamp fuer ${id}.`);
  }
  if (!isSafeRelativePath(path)) throw new Error(`Unsicherer Manifestpfad: ${path}`);
  if (value.format !== SUPPORTED_FORMAT) throw new Error(`Ungueltiges Archivformat fuer ${id}.`);
  if (value.compression !== "gzip") throw new Error(`Ungueltige Kompression fuer ${id}.`);
  if (!SHA256_PATTERN.test(sha256)) throw new Error(`Ungueltige SHA-256-Pruefsumme fuer ${id}.`);

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
  };
}

export function validateScanArchiveManifest(
  value: unknown,
  archiveYear: number,
): ScanArchiveManifest {
  if (!isRecord(value)) throw new Error("Archivmanifest ist kein Objekt.");
  if (value.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error("Archivmanifest-Version wird nicht unterstuetzt.");
  }
  if (value.archiveYear !== archiveYear) {
    throw new Error("Archivmanifest gehoert nicht zum erwarteten Jahr.");
  }
  if (!Array.isArray(value.scans)) throw new Error("Archivmanifest enthaelt keine Scans.");

  const revision = assertNonNegativeInteger(value.revision, "Manifest-Revision");
  const scans = value.scans.map((scan) => validateManifestScan(scan, archiveYear));
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const scan of scans) {
    if (ids.has(scan.id)) throw new Error(`Archivscan-ID ist mehrfach enthalten: ${scan.id}`);
    if (paths.has(scan.path)) throw new Error(`Archivpfad ist mehrfach enthalten: ${scan.path}`);
    ids.add(scan.id);
    paths.add(scan.path);
  }
  if (value.scanCount !== scans.length) throw new Error("Manifest scanCount stimmt nicht.");
  if (value.serverCount !== new Set(scans.map((scan) => scan.server)).size) {
    throw new Error("Manifest serverCount stimmt nicht.");
  }

  scans.sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));

  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    archiveYear,
    revision,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    scanCount: scans.length,
    serverCount: new Set(scans.map((scan) => scan.server)).size,
    scans,
  };
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
      if (row.prefix !== entry.server) throw new Error(`${kind}[${index}] gehoert nicht zu ${entry.server}.`);
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
