import { resolveServer } from "../servers/serverResolver";
import {
  validateScanArchiveManifest,
  validateScanArchivePayload,
  validateScanArchiveSearchIndexPayload,
} from "./validation";
import type {
  ScanArchiveManifest,
  ScanArchiveManifestScan,
  ScanArchiveSearchIndexMetadata,
  ScanArchiveSearchIndexPayload,
  ScanArchiveToplistReference,
  ScanArchiveToplistsManifest,
} from "./types";

export type ScanArchiveJsonRecord = Record<string, unknown>;

export type ScanArchiveSelectionInput = {
  current?: Record<string, string>;
  monthly?: Record<string, Record<string, string>>;
};

export type ScanArchiveBuilderUsageMode = "monthly" | "archive-only";

export type ScanArchiveBuilderCoreOptions<TBytes = unknown> = {
  year: number;
  manifest: ScanArchiveManifest;
  inputContent?: string | null;
  inputBatches?: readonly ScanArchiveBatch[];
  usageMode?: ScanArchiveBuilderUsageMode;
  selection?: ScanArchiveSelectionInput;
  setImportedAsCurrent?: boolean;
  setImportedAsMonthly?: string | string[];
  replaceMonthly?: boolean;
  allowCurrentRollback?: boolean;
  updatedAt?: string;
  existingFiles?: ReadonlyMap<string, ScanArchiveExistingFileMetadata<TBytes>>;
  onProgress?: (progress: ScanArchiveBuilderCoreProgress) => void;
};

export type ScanArchiveBuilderCoreDependencies<TBytes> = {
  gzip: (content: string) => TBytes | Promise<TBytes>;
  sha256: (bytes: TBytes) => string | Promise<string>;
  byteLength: (bytes: TBytes) => number;
  utf8ByteLength: (content: string) => number;
  bytesEqual?: (left: TBytes, right: TBytes) => boolean | Promise<boolean>;
};

export type ScanArchiveBuilderCoreProgressPhase =
  | "validating"
  | "grouping"
  | "compressing"
  | "hashing"
  | "manifest-merge"
  | "ready";

export type ScanArchiveBuilderCoreProgress = {
  phase: ScanArchiveBuilderCoreProgressPhase;
  current?: number;
  total?: number;
  message: string;
};

export type ScanArchiveBuilderConflict = {
  code: string;
  message: string;
  scanId?: string;
  path?: string;
};

export type ScanArchiveBuilderWarning = {
  code: string;
  message: string;
  scanId?: string;
};

export type ScanArchiveBatch = {
  id: string;
  server: string;
  timestamp: number;
  timestampUtc: string;
  path: string;
  searchIndexPath: string;
  players: ScanArchiveJsonRecord[];
  groups: ScanArchiveJsonRecord[];
};

export type ScanArchiveExistingFileMetadata<TBytes = unknown> = {
  sha256?: string;
  compressedBytes?: number;
  bytes?: TBytes;
};

export type ScanArchivePlannedFile<TBytes> = {
  kind: "raw" | "searchIndex";
  scanId: string;
  relativePath: string;
  action: "write" | "skip-identical";
  compressedBytes: number;
  sha256: string;
  bytes?: TBytes;
};

export type ScanArchivePreparedScan<TBytes> = {
  entry: ScanArchiveManifestScan;
  rawPayload: { players: ScanArchiveJsonRecord[]; groups: ScanArchiveJsonRecord[] };
  rawJson: string;
  rawCompressed: TBytes;
  searchPayload: ScanArchiveSearchIndexPayload;
  searchJson: string;
  searchCompressed: TBytes;
};

export type ScanArchiveBuildPlanCore<TBytes> = {
  year: number;
  batches: ScanArchiveBatch[];
  manifestBefore: ScanArchiveManifest;
  manifestAfter: ScanArchiveManifest;
  files: ScanArchivePlannedFile<TBytes>[];
  conflicts: ScanArchiveBuilderConflict[];
  warnings: ScanArchiveBuilderWarning[];
  toplistChanges: {
    current: Array<{ server: string; from?: string; to: string }>;
    monthly: Array<{ month: string; server: string; from?: string; to: string }>;
  };
  summary: {
    newScans: number;
    filesToWrite: number;
    skippedIdenticalFiles: number;
  };
};

const SUPPORTED_FORMAT = "sftools.raw.v1";
const SERVER_PREFIX_PATTERN = /^[a-z0-9_]+$/i;

const isRecord = (value: unknown): value is ScanArchiveJsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const sortedObject = <T>(value: Record<string, T>) =>
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));

const groupBy = <T, K>(values: readonly T[], getKey: (value: T) => K) => {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
};

export const formatArchiveTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}_${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${pad(date.getUTCMilliseconds(), 3)}Z`;
};

export const monthKeyForScanArchiveTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const archivePathForScanArchiveBatch = (server: string, timestamp: number) => {
  const month = monthKeyForScanArchiveTimestamp(timestamp);
  return `${month}/${server}/${formatArchiveTimestamp(timestamp)}.json.gz`;
};

export const searchIndexPathForScanArchivePath = (rawPath: string) =>
  rawPath.replace(/\.json\.gz$/u, ".search.json.gz");

const readOptionalString = (record: ScanArchiveJsonRecord, keys: readonly string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
};

const readRequiredString = (
  record: ScanArchiveJsonRecord,
  keys: readonly string[],
  label: string,
  rowLabel: string,
) => {
  const value = readOptionalString(record, keys);
  if (!value || value.trim() !== value) throw new Error(`${rowLabel}: ${label} fehlt oder ist ungueltig.`);
  return value;
};

const resolveArchiveServer = (record: ScanArchiveJsonRecord, rowLabel: string) => {
  const server = readRequiredString(record, ["prefix", "server"], "Server/Prefix", rowLabel);
  if (!SERVER_PREFIX_PATTERN.test(server)) throw new Error(`${rowLabel}: ungueltiger Archivserver ${server}.`);
  if (!resolveServer(server)) throw new Error(`${rowLabel}: Server ${server} kann nicht mit dem bestehenden Resolver aufgeloest werden.`);
  return server;
};

const readTimestamp = (record: ScanArchiveJsonRecord, rowLabel: string, year: number) => {
  const value = record.timestamp;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${rowLabel}: timestamp fehlt oder ist keine positive Ganzzahl.`);
  }
  if (new Date(value).getUTCFullYear() !== year) {
    throw new Error(`${rowLabel}: timestamp ${value} gehoert nicht zum Archivjahr ${year}.`);
  }
  return value;
};

const parseCombinedInput = (content: string) => {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) throw new Error("SFtools-Eingabe ist kein Objekt.");
  if (!Array.isArray(parsed.players)) throw new Error("SFtools-Eingabe enthaelt kein players-Array.");
  if (!Array.isArray(parsed.groups)) throw new Error("SFtools-Eingabe enthaelt kein groups-Array.");
  return {
    players: parsed.players as unknown[],
    groups: parsed.groups as unknown[],
  };
};

const detectInputYears = (input: { players: unknown[]; groups: unknown[] }) => {
  const years = new Set<number>();
  const collect = (rows: unknown[], kind: "players" | "groups") => {
    rows.forEach((row, index) => {
      if (!isRecord(row)) throw new Error(`${kind}[${index}] ist kein Objekt.`);
      const value = row.timestamp;
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${kind}[${index}]: timestamp fehlt oder ist keine positive Ganzzahl.`);
      }
      years.add(new Date(value).getUTCFullYear());
    });
  };
  collect(input.players, "players");
  collect(input.groups, "groups");
  return [...years].sort((left, right) => left - right);
};

const buildScanArchiveBatchesFromParsedInput = (
  input: { players: unknown[]; groups: unknown[] },
  year: number,
): ScanArchiveBatch[] => {
  const batches = new Map<string, ScanArchiveBatch>();

  const addRow = (kind: "players" | "groups", row: unknown, index: number) => {
    const rowLabel = `${kind}[${index}]`;
    if (!isRecord(row)) throw new Error(`${rowLabel} ist kein Objekt.`);
    const server = resolveArchiveServer(row, rowLabel);
    const timestamp = readTimestamp(row, rowLabel, year);
    const id = `${server}:${timestamp}`;
    let batch = batches.get(id);
    if (!batch) {
      const rawPath = archivePathForScanArchiveBatch(server, timestamp);
      batch = {
        id,
        server,
        timestamp,
        timestampUtc: new Date(timestamp).toISOString(),
        path: rawPath,
        searchIndexPath: searchIndexPathForScanArchivePath(rawPath),
        players: [],
        groups: [],
      };
      batches.set(id, batch);
    }
    batch[kind].push(row);
  };

  input.players.forEach((row, index) => addRow("players", row, index));
  input.groups.forEach((row, index) => addRow("groups", row, index));
  return [...batches.values()].sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));
};

export const buildScanArchiveBatches = (content: string, year: number): ScanArchiveBatch[] =>
  buildScanArchiveBatchesFromParsedInput(parseCombinedInput(content), year);

export const inspectScanArchiveInputContent = (content: string): { years: number[]; batches: ScanArchiveBatch[] } => {
  const input = parseCombinedInput(content);
  const years = detectInputYears(input);
  return {
    years,
    batches: years.length === 1 ? buildScanArchiveBatchesFromParsedInput(input, years[0]) : [],
  };
};

export const searchIndexPayloadForScanArchiveEntry = (
  entry: ScanArchiveManifestScan,
  payload: { players: ScanArchiveJsonRecord[]; groups: ScanArchiveJsonRecord[] },
): ScanArchiveSearchIndexPayload => {
  const players = payload.players.map((player, index) => {
    const rowLabel = `players[${index}]`;
    const result: ScanArchiveSearchIndexPayload["players"][number] = {
      identifier: readRequiredString(player, ["identifier"], "identifier", rowLabel),
      name: readRequiredString(player, ["name"], "name", rowLabel),
    };
    const guildIdentifier = readOptionalString(player, ["guildIdentifier", "group", "groupIdentifier", "guild"]);
    if (guildIdentifier != null) result.guildIdentifier = guildIdentifier || null;
    const guildName = readOptionalString(player, ["guildName", "groupname", "groupName"]);
    if (guildName != null) result.guildName = guildName || null;
    if (Object.prototype.hasOwnProperty.call(player, "class")) result.classId = player.class as string | number | null;
    if (Object.prototype.hasOwnProperty.call(player, "classId")) result.classId = player.classId as string | number | null;
    return result;
  });
  const guilds = payload.groups.map((guild, index) => ({
    identifier: readRequiredString(guild, ["identifier"], "identifier", `groups[${index}]`),
    name: readRequiredString(guild, ["name"], "name", `groups[${index}]`),
  }));
  return {
    schemaVersion: 1,
    archiveScanId: entry.id,
    sourceSha256: entry.sha256,
    server: entry.server,
    timestamp: entry.timestamp,
    players,
    guilds,
  };
};

export async function createPreparedScan<TBytes>(
  batch: ScanArchiveBatch,
  dependencies: ScanArchiveBuilderCoreDependencies<TBytes>,
): Promise<ScanArchivePreparedScan<TBytes>> {
  const rawPayload = { players: batch.players, groups: batch.groups };
  const rawJson = JSON.stringify(rawPayload);
  const rawCompressed = await dependencies.gzip(rawJson);
  const rawSha256 = await dependencies.sha256(rawCompressed);
  const entry: ScanArchiveManifestScan = {
    id: batch.id,
    server: batch.server,
    timestamp: batch.timestamp,
    timestampUtc: batch.timestampUtc,
    path: batch.path,
    format: SUPPORTED_FORMAT,
    compression: "gzip",
    sha256: rawSha256,
    compressedBytes: dependencies.byteLength(rawCompressed),
    uncompressedBytes: dependencies.utf8ByteLength(rawJson),
    playerCount: batch.players.length,
    groupCount: batch.groups.length,
  };
  validateScanArchivePayload(rawPayload, entry);

  const searchPayload = searchIndexPayloadForScanArchiveEntry(entry, rawPayload);
  validateScanArchiveSearchIndexPayload(searchPayload, entry);
  const searchJson = JSON.stringify(searchPayload);
  const searchCompressed = await dependencies.gzip(searchJson);
  const searchIndex: ScanArchiveSearchIndexMetadata = {
    schemaVersion: 1,
    path: batch.searchIndexPath,
    sha256: await dependencies.sha256(searchCompressed),
    compressedBytes: dependencies.byteLength(searchCompressed),
    uncompressedBytes: dependencies.utf8ByteLength(searchJson),
    playerCount: entry.playerCount,
    groupCount: entry.groupCount,
  };
  entry.searchIndex = searchIndex;
  validateScanArchiveSearchIndexPayload(searchPayload, entry);

  return { entry, rawPayload, rawJson, rawCompressed, searchPayload, searchJson, searchCompressed };
}

const sameScanMetadata = (left: ScanArchiveManifestScan, right: ScanArchiveManifestScan) =>
  JSON.stringify(left) === JSON.stringify(right);

const withSortedScans = (scans: ScanArchiveManifestScan[]) =>
  [...scans].sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));

export const preserveScanArchiveManifestMetadata = (raw: unknown, manifest: ScanArchiveManifest): ScanArchiveManifest => {
  const rawManifest = isRecord(raw) ? raw : {};
  const rawScans = Array.isArray(rawManifest.scans) ? rawManifest.scans : [];
  const rawScanById = new Map(
    rawScans
      .filter(isRecord)
      .map((scan) => [typeof scan.id === "string" ? scan.id.trim() : "", scan] as const)
      .filter(([id]) => id),
  );
  return {
    ...rawManifest,
    ...manifest,
    scans: manifest.scans.map((scan) => {
      const rawScan = rawScanById.get(scan.id);
      if (!rawScan) return scan;
      const preserved = { ...rawScan, ...scan } as ScanArchiveManifestScan;
      if (scan.searchIndex) {
        preserved.searchIndex = {
          ...(isRecord(rawScan.searchIndex) ? rawScan.searchIndex : {}),
          ...scan.searchIndex,
        };
      } else {
        delete preserved.searchIndex;
      }
      return preserved;
    }),
  } as ScanArchiveManifest;
};

const toplistReferenceScanIds = (reference: ScanArchiveToplistReference | undefined) =>
  typeof reference === "string" ? [reference] : reference?.scanIds ?? [];

const toplistReferenceLabel = (reference: ScanArchiveToplistReference | undefined) =>
  toplistReferenceScanIds(reference).join("+");

export const mergeScanArchiveToplists = (
  manifest: ScanArchiveManifest,
  options: Pick<
    ScanArchiveBuilderCoreOptions,
    "selection" | "setImportedAsCurrent" | "setImportedAsMonthly" | "replaceMonthly" | "allowCurrentRollback"
  >,
  importedScans: readonly ScanArchiveManifestScan[],
  conflicts: ScanArchiveBuilderConflict[],
) => {
  const before = manifest.toplists ?? { schemaVersion: 1 };
  const next: ScanArchiveToplistsManifest = {
    schemaVersion: 1,
    ...(before.current ? { current: { ...before.current } } : {}),
  ...(before.monthly ? { monthly: Object.fromEntries(Object.entries(before.monthly).map(([month, value]) => [month, { ...value }])) } : {}),
  };
  const changes = {
    current: [] as Array<{ server: string; from?: string; to: string }>,
    monthly: [] as Array<{ month: string; server: string; from?: string; to: string }>,
  };
  const scanById = new Map(manifest.scans.map((scan) => [scan.id, scan]));

  const assignCurrent = (server: string, scanId: string) => {
    const scan = scanById.get(scanId);
    if (!scan) {
      conflicts.push({ code: "toplist_unknown_scan", message: `current ${server} verweist auf unbekannten Scan ${scanId}.`, scanId });
      return;
    }
    const previousReference = next.current?.[server];
    const previousScans = toplistReferenceScanIds(previousReference).flatMap((previousId) => {
      const previousScan = scanById.get(previousId);
      return previousScan ? [previousScan] : [];
    });
    const previousTimestamp = previousScans.length ? Math.max(...previousScans.map((previous) => previous.timestamp)) : null;
    if (previousTimestamp != null && previousTimestamp > scan.timestamp && !options.allowCurrentRollback) {
      conflicts.push({
        code: "toplist_current_rollback",
        message: `current ${server} wuerde von neuerem Scan ${toplistReferenceLabel(previousReference)} auf aelteren Scan ${scanId} gesetzt.`,
        scanId,
      });
      return;
    }
    const previousLabel = toplistReferenceLabel(previousReference);
    if (previousLabel !== scanId) changes.current.push({ server, ...(previousLabel ? { from: previousLabel } : {}), to: scanId });
    next.current = { ...(next.current ?? {}), [server]: scanId };
  };

  const assignMonthly = (month: string, server: string, scanId: string) => {
    const existing = next.monthly?.[month]?.[server];
    const existingLabel = toplistReferenceLabel(existing);
    if (existing && existingLabel !== scanId && !options.replaceMonthly) {
      conflicts.push({
        code: "toplist_monthly_replace_required",
        message: `monthly ${month}/${server} ist bereits auf ${existingLabel} gesetzt.`,
        scanId,
      });
      return;
    }
    if (existingLabel !== scanId) changes.monthly.push({ month, server, ...(existingLabel ? { from: existingLabel } : {}), to: scanId });
    next.monthly = { ...(next.monthly ?? {}), [month]: { ...(next.monthly?.[month] ?? {}), [server]: scanId } };
  };

  if (options.setImportedAsCurrent) {
    const byServer = groupBy(importedScans, (scan) => scan.server);
    for (const [server, scans] of byServer) {
      const complete = scans.filter((scan) => scan.playerCount > 0 && scan.groupCount > 0);
      if (complete.length !== 1) {
        conflicts.push({ code: "toplist_ambiguous_current", message: `current ${server} hat ${complete.length} importierte Kandidaten.` });
        continue;
      }
      assignCurrent(server, complete[0].id);
    }
  }

  if (options.setImportedAsMonthly) {
    const months = Array.isArray(options.setImportedAsMonthly) ? options.setImportedAsMonthly : [options.setImportedAsMonthly];
    for (const month of months) {
      const byServer = groupBy(importedScans.filter((scan) => monthKeyForScanArchiveTimestamp(scan.timestamp) === month), (scan) => scan.server);
      for (const [server, scans] of byServer) {
        const complete = scans.filter((scan) => scan.playerCount > 0 && scan.groupCount > 0);
        if (complete.length !== 1) {
          conflicts.push({ code: "toplist_ambiguous_monthly", message: `monthly ${month}/${server} hat ${complete.length} importierte Kandidaten.` });
          continue;
        }
        assignMonthly(month, server, complete[0].id);
      }
    }
  }

  for (const [server, scanId] of Object.entries(options.selection?.current ?? {})) assignCurrent(server, scanId);
  for (const [month, selection] of Object.entries(options.selection?.monthly ?? {})) {
    for (const [server, scanId] of Object.entries(selection)) assignMonthly(month, server, scanId);
  }

  if (next.current) next.current = sortedObject(next.current);
  if (next.monthly) next.monthly = sortedObject(Object.fromEntries(Object.entries(next.monthly).map(([month, value]) => [month, sortedObject(value)])));
  return { toplists: next.current || next.monthly ? next : undefined, changes };
};

const emptyToplistChanges = () => ({
  current: [] as Array<{ server: string; from?: string; to: string }>,
  monthly: [] as Array<{ month: string; server: string; from?: string; to: string }>,
});

const resolveToplistMergeOptions = <TBytes>(
  options: ScanArchiveBuilderCoreOptions<TBytes>,
  importedEntries: readonly ScanArchiveManifestScan[],
): Pick<
  ScanArchiveBuilderCoreOptions,
  "selection" | "setImportedAsCurrent" | "setImportedAsMonthly" | "replaceMonthly" | "allowCurrentRollback"
> => {
  if (options.usageMode !== "monthly") return options;
  return {
    setImportedAsCurrent: true,
    setImportedAsMonthly: [...new Set(importedEntries.map((scan) => monthKeyForScanArchiveTimestamp(scan.timestamp)))],
    replaceMonthly: options.replaceMonthly ?? true,
    allowCurrentRollback: options.allowCurrentRollback,
  };
};

async function isExistingFileIdentical<TBytes>(
  existing: ScanArchiveExistingFileMetadata<TBytes>,
  bytes: TBytes,
  sha256: string,
  dependencies: ScanArchiveBuilderCoreDependencies<TBytes>,
) {
  if (existing.bytes && dependencies.bytesEqual) return dependencies.bytesEqual(existing.bytes, bytes);
  if (existing.sha256 && existing.sha256.toLowerCase() === sha256.toLowerCase()) {
    return existing.compressedBytes == null || existing.compressedBytes === dependencies.byteLength(bytes);
  }
  return false;
}

async function planFile<TBytes>(
  kind: "raw" | "searchIndex",
  scanId: string,
  relativePath: string,
  bytes: TBytes,
  dependencies: ScanArchiveBuilderCoreDependencies<TBytes>,
  conflicts: ScanArchiveBuilderConflict[],
  existingFiles?: ReadonlyMap<string, ScanArchiveExistingFileMetadata<TBytes>>,
): Promise<ScanArchivePlannedFile<TBytes>> {
  const sha256 = await dependencies.sha256(bytes);
  const compressedBytes = dependencies.byteLength(bytes);
  const existing = existingFiles?.get(relativePath);
  if (existing) {
    if (await isExistingFileIdentical(existing, bytes, sha256, dependencies)) {
      return { kind, scanId, relativePath, action: "skip-identical", compressedBytes, sha256 };
    }
    conflicts.push({
      code: "target_path_conflict",
      message: `Zielpfad existiert bereits mit anderem Inhalt: ${relativePath}`,
      scanId,
      path: relativePath,
    });
  }
  return { kind, scanId, relativePath, action: "write", compressedBytes, sha256, bytes };
}

export async function createScanArchiveBuildPlanCore<TBytes>(
  options: ScanArchiveBuilderCoreOptions<TBytes>,
  dependencies: ScanArchiveBuilderCoreDependencies<TBytes>,
): Promise<ScanArchiveBuildPlanCore<TBytes>> {
  const manifest = validateScanArchiveManifest(options.manifest, options.year);
  const manifestBefore = preserveScanArchiveManifestMetadata(options.manifest, manifest);
  const conflicts: ScanArchiveBuilderConflict[] = [];
  const warnings: ScanArchiveBuilderWarning[] = [];
  const files: ScanArchivePlannedFile<TBytes>[] = [];
  const existingById = new Map(manifest.scans.map((scan) => [scan.id, scan]));
  const existingByPath = new Map(manifest.scans.map((scan) => [scan.path, scan]));
  const nextById = new Map(manifestBefore.scans.map((scan) => [scan.id, scan]));
  const batches: ScanArchiveBatch[] = [];
  const importedEntries: ScanArchiveManifestScan[] = [];

  if (options.inputContent != null) {
    options.onProgress?.({ phase: "grouping", message: "Archiv-Batches werden gruppiert." });
    batches.push(...buildScanArchiveBatches(options.inputContent, options.year));
  } else if (options.inputBatches?.length) {
    options.onProgress?.({ phase: "grouping", message: "Archiv-Batches werden uebernommen." });
    batches.push(...options.inputBatches);
  }

  if (batches.length) {
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      options.onProgress?.({
        phase: "compressing",
        current: index,
        total: batches.length,
        message: "Archivdateien und Suchindex werden komprimiert.",
      });
      const prepared = await createPreparedScan(batch, dependencies);
      let shouldPlanGeneratedFiles = true;
      options.onProgress?.({
        phase: "hashing",
        current: index + 1,
        total: batches.length,
        message: "Checksummen werden berechnet.",
      });
      const existing = existingById.get(prepared.entry.id);
      if (existing) {
        if (!sameScanMetadata(existing, prepared.entry)) {
          conflicts.push({
            code: "scan_id_conflict",
            message: `Scan-ID ${prepared.entry.id} existiert bereits mit abweichenden Metadaten.`,
            scanId: prepared.entry.id,
          });
        } else {
          shouldPlanGeneratedFiles = false;
          files.push({
            kind: "raw",
            scanId: prepared.entry.id,
            relativePath: prepared.entry.path,
            action: "skip-identical",
            compressedBytes: prepared.entry.compressedBytes,
            sha256: prepared.entry.sha256,
          });
          files.push({
            kind: "searchIndex",
            scanId: prepared.entry.id,
            relativePath: prepared.entry.searchIndex!.path,
            action: "skip-identical",
            compressedBytes: prepared.entry.searchIndex!.compressedBytes,
            sha256: prepared.entry.searchIndex!.sha256,
          });
        }
      } else {
        const pathOwner = existingByPath.get(prepared.entry.path);
        if (pathOwner) {
          conflicts.push({
            code: "manifest_path_conflict",
            message: `Manifestpfad ${prepared.entry.path} gehoert bereits zu ${pathOwner.id}.`,
            scanId: prepared.entry.id,
            path: prepared.entry.path,
          });
        }
        nextById.set(prepared.entry.id, prepared.entry);
        importedEntries.push(prepared.entry);
      }
      if (shouldPlanGeneratedFiles) {
        files.push(await planFile<TBytes>("raw", prepared.entry.id, prepared.entry.path, prepared.rawCompressed, dependencies, conflicts, options.existingFiles));
        files.push(await planFile<TBytes>("searchIndex", prepared.entry.id, prepared.entry.searchIndex!.path, prepared.searchCompressed, dependencies, conflicts, options.existingFiles));
      }
    }
  }

  for (const scan of nextById.values()) {
    if (scan.playerCount === 0 || scan.groupCount === 0) {
      warnings.push({ code: "partial_scan", message: `Scan ${scan.id} ist partiell und wird nicht automatisch fuer Toplisten gewaehlt.`, scanId: scan.id });
    }
  }

  options.onProgress?.({ phase: "manifest-merge", message: "Manifest wird zusammengefuehrt." });
  const sortedScans = withSortedScans([...nextById.values()]);
  const draftManifest: ScanArchiveManifest = {
    schemaVersion: 1,
    archiveYear: options.year,
    revision: manifest.revision,
    updatedAt: manifest.updatedAt,
    scanCount: sortedScans.length,
    serverCount: new Set(sortedScans.map((scan) => scan.server)).size,
    scans: sortedScans,
    ...(manifest.toplists ? { toplists: manifest.toplists } : {}),
  };

  const { toplists, changes: toplistChanges } =
    options.usageMode === "archive-only"
      ? { toplists: draftManifest.toplists, changes: emptyToplistChanges() }
      : mergeScanArchiveToplists(draftManifest, resolveToplistMergeOptions(options, importedEntries), importedEntries, conflicts);
  const hasManifestChanges =
    importedEntries.length > 0 ||
    toplistChanges.current.length > 0 ||
    toplistChanges.monthly.length > 0;
  const manifestAfterInput: ScanArchiveManifest = {
    ...draftManifest,
    revision: manifest.revision + (hasManifestChanges ? 1 : 0),
    updatedAt: hasManifestChanges ? options.updatedAt ?? new Date().toISOString() : manifest.updatedAt,
    ...(toplists ? { toplists } : {}),
  };
  validateScanArchiveManifest(manifestAfterInput, options.year);

  options.onProgress?.({ phase: "ready", message: "Archivpaket ist vorbereitet." });
  return {
    year: options.year,
    batches,
    manifestBefore,
    manifestAfter: manifestAfterInput,
    files,
    conflicts,
    warnings,
    toplistChanges,
    summary: {
      newScans: importedEntries.length,
      filesToWrite: files.filter((file) => file.action === "write").length,
      skippedIdenticalFiles: files.filter((file) => file.action === "skip-identical").length,
    },
  };
}
