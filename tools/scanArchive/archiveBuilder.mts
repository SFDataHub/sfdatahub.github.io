import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  buildScanArchiveBatches as buildScanArchiveBatchesCore,
  createPreparedScan as createPreparedScanCore,
  formatArchiveTimestamp,
  searchIndexPayloadForScanArchiveEntry,
  type ScanArchiveBatch,
  type ScanArchiveBuilderConflict,
  type ScanArchiveBuilderWarning,
  type ScanArchiveJsonRecord as JsonRecord,
  type ScanArchivePlannedFile,
  type ScanArchiveSelectionInput,
} from "../../src/lib/scanArchive/archiveBuilderCore.ts";
import {
  validateScanArchiveManifest,
  validateScanArchivePayload,
  validateScanArchiveSearchIndexPayload,
} from "../../src/lib/scanArchive/validation.ts";
import type {
  ScanArchiveManifest,
  ScanArchiveManifestScan,
  ScanArchiveToplistsManifest,
} from "../../src/lib/scanArchive/types.ts";

export type ScanArchiveBuilderOptions = {
  inputPath?: string;
  inputContent?: string;
  archiveRoot: string;
  year: number;
  selection?: ScanArchiveSelectionInput;
  backfillSearchIndexes?: boolean;
  setImportedAsCurrent?: boolean;
  setImportedAsMonthly?: string;
  replaceMonthly?: boolean;
  allowCurrentRollback?: boolean;
  updatedAt?: string;
};

export type ScanArchiveBuildPlan = {
  archiveRoot: string;
  year: number;
  apply: false;
  batches: ScanArchiveBatch[];
  manifestBefore: ScanArchiveManifest;
  manifestAfter: ScanArchiveManifest;
  files: ScanArchivePlannedFile[];
  conflicts: ScanArchiveBuilderConflict[];
  warnings: ScanArchiveBuilderWarning[];
  toplistChanges: {
    current: Array<{ server: string; from?: string; to: string }>;
    monthly: Array<{ month: string; server: string; from?: string; to: string }>;
  };
  summary: {
    newScans: number;
    backfilledSearchIndexes: number;
    filesToWrite: number;
    skippedIdenticalFiles: number;
  };
};

const MANIFEST_NAME = "manifest.json";
const GZIP_LEVEL = 9;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const sha256Hex = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

const strictUtf8 = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

const gzipDeterministic = (content: string) => gzipSync(Buffer.from(content, "utf8"), { level: GZIP_LEVEL, mtime: 0 });

export const buildScanArchiveBatches = buildScanArchiveBatchesCore;
export { formatArchiveTimestamp };

const createPreparedScan = (batch: ScanArchiveBatch) =>
  createPreparedScanCore(batch, {
    gzip: gzipDeterministic,
    sha256: sha256Hex,
    byteLength: (bytes) => bytes.byteLength,
    utf8ByteLength: (content) => Buffer.byteLength(content, "utf8"),
  });

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

const normalizeRelativePath = (relativePath: string) => relativePath.replaceAll("\\", "/");

const safeJoin = (root: string, relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    throw new Error(`Unsicherer Archivpfad: ${relativePath}`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsicherer Archivpfad: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, ...segments);
  if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Archivpfad verlaesst archive-root: ${relativePath}`);
  }
  return absolute;
};

const assertNoSymlinkPath = async (root: string, relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  let current = path.resolve(root);
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Archivpfad fuehrt ueber Symlink: ${relativePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
};

const monthKeyForTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const searchIndexPathFor = (rawPath: string) => rawPath.replace(/\.json\.gz$/u, ".search.json.gz");

const readJsonFileStrict = async (filePath: string) => JSON.parse(strictUtf8(await fs.readFile(filePath))) as unknown;

const readManifest = async (archiveRoot: string, year: number) => {
  const manifestPath = path.join(archiveRoot, MANIFEST_NAME);
  const raw = await readJsonFileStrict(manifestPath);
  return {
    manifestPath,
    raw,
    manifest: validateScanArchiveManifest(raw, year),
  };
};

const preserveScanMetadata = (rawScan: unknown, scan: ScanArchiveManifestScan): ScanArchiveManifestScan => {
  if (!isRecord(rawScan)) return scan;
  const preserved = {
    ...rawScan,
    ...scan,
  } as ScanArchiveManifestScan;
  if (scan.searchIndex) {
    preserved.searchIndex = {
      ...(isRecord(rawScan.searchIndex) ? rawScan.searchIndex : {}),
      ...scan.searchIndex,
    };
  } else {
    delete preserved.searchIndex;
  }
  return preserved;
};

const preserveManifestMetadata = (raw: unknown, manifest: ScanArchiveManifest): ScanArchiveManifest => {
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
    scans: manifest.scans.map((scan) => preserveScanMetadata(rawScanById.get(scan.id), scan)),
  } as ScanArchiveManifest;
};

const verifyArchiveRoot = async (archiveRoot: string, year: number) => {
  const stat = await fs.stat(archiveRoot);
  if (!stat.isDirectory()) throw new Error(`archive-root ist kein Verzeichnis: ${archiveRoot}`);
  if (path.basename(path.resolve(archiveRoot)) !== `scan-archive-${year}`) {
    throw new Error(`archive-root muss das konkrete Jahresrepo scan-archive-${year} sein.`);
  }
  const manifestPath = path.join(archiveRoot, MANIFEST_NAME);
  await fs.access(manifestPath);
};

const planFile = async (
  archiveRoot: string,
  kind: "raw" | "searchIndex",
  scanId: string,
  relativePath: string,
  bytes: Buffer,
  conflicts: ScanArchiveBuilderConflict[],
): Promise<ScanArchivePlannedFile> => {
  const absolute = safeJoin(archiveRoot, relativePath);
  try {
    const existing = await fs.readFile(absolute);
    if (Buffer.compare(existing, bytes) === 0) {
      return { kind, scanId, relativePath, action: "skip-identical", compressedBytes: bytes.byteLength, sha256: sha256Hex(bytes) };
    }
    conflicts.push({
      code: "target_path_conflict",
      message: `Zielpfad existiert bereits mit anderem Inhalt: ${relativePath}`,
      scanId,
      path: relativePath,
    });
    return { kind, scanId, relativePath, action: "write", compressedBytes: bytes.byteLength, sha256: sha256Hex(bytes), bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { kind, scanId, relativePath, action: "write", compressedBytes: bytes.byteLength, sha256: sha256Hex(bytes), bytes };
  }
};

const sameScanMetadata = (left: ScanArchiveManifestScan, right: ScanArchiveManifestScan) =>
  JSON.stringify(left) === JSON.stringify(right);

const withSortedScans = (scans: ScanArchiveManifestScan[]) =>
  [...scans].sort((left, right) => left.timestamp - right.timestamp || left.server.localeCompare(right.server));

const mergeToplists = (
  manifest: ScanArchiveManifest,
  options: ScanArchiveBuilderOptions,
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
    const previousId = next.current?.[server];
    const previous = previousId ? scanById.get(previousId) : null;
    if (previous && previous.timestamp > scan.timestamp && !options.allowCurrentRollback) {
      conflicts.push({
        code: "toplist_current_rollback",
        message: `current ${server} wuerde von neuerem Scan ${previousId} auf aelteren Scan ${scanId} gesetzt.`,
        scanId,
      });
      return;
    }
    if (previousId !== scanId) changes.current.push({ server, ...(previousId ? { from: previousId } : {}), to: scanId });
    next.current = { ...(next.current ?? {}), [server]: scanId };
  };

  const assignMonthly = (month: string, server: string, scanId: string) => {
    const existing = next.monthly?.[month]?.[server];
    if (existing && existing !== scanId && !options.replaceMonthly) {
      conflicts.push({
        code: "toplist_monthly_replace_required",
        message: `monthly ${month}/${server} ist bereits auf ${existing} gesetzt.`,
        scanId,
      });
      return;
    }
    if (existing !== scanId) changes.monthly.push({ month, server, ...(existing ? { from: existing } : {}), to: scanId });
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
    const month = options.setImportedAsMonthly;
    const byServer = groupBy(importedScans.filter((scan) => monthKeyForTimestamp(scan.timestamp) === month), (scan) => scan.server);
    for (const [server, scans] of byServer) {
      const complete = scans.filter((scan) => scan.playerCount > 0 && scan.groupCount > 0);
      if (complete.length !== 1) {
        conflicts.push({ code: "toplist_ambiguous_monthly", message: `monthly ${month}/${server} hat ${complete.length} importierte Kandidaten.` });
        continue;
      }
      assignMonthly(month, server, complete[0].id);
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

const backfillPreparedSearchIndexes = async (
  archiveRoot: string,
  manifest: ScanArchiveManifest,
  conflicts: ScanArchiveBuilderConflict[],
) => {
  const result: Array<{ entry: ScanArchiveManifestScan; bytes: Buffer }> = [];
  for (const scan of manifest.scans) {
    if (scan.searchIndex) continue;
    const compressed = await fs.readFile(safeJoin(archiveRoot, scan.path));
    if (compressed.byteLength !== scan.compressedBytes || sha256Hex(compressed) !== scan.sha256) {
      conflicts.push({
        code: "backfill_raw_mismatch",
        message: `Raw-Datei ${scan.path} passt nicht zu den Manifestmetadaten.`,
        scanId: scan.id,
        path: scan.path,
      });
      continue;
    }
    const rawJson = strictUtf8(gunzipSync(compressed));
    const payload = validateScanArchivePayload(JSON.parse(rawJson), scan) as { players: JsonRecord[]; groups: JsonRecord[] };
    const searchPayload = searchIndexPayloadForScanArchiveEntry(scan, payload);
    validateScanArchiveSearchIndexPayload(searchPayload, scan);
    const searchJson = JSON.stringify(searchPayload);
    const bytes = gzipDeterministic(searchJson);
    const entry = {
      ...scan,
      searchIndex: {
        schemaVersion: 1,
        path: searchIndexPathFor(scan.path),
        sha256: sha256Hex(bytes),
        compressedBytes: bytes.byteLength,
        uncompressedBytes: Buffer.byteLength(searchJson, "utf8"),
        playerCount: scan.playerCount,
        groupCount: scan.groupCount,
      },
    };
    validateScanArchiveSearchIndexPayload(JSON.parse(strictUtf8(gunzipSync(bytes))), entry);
    result.push({ entry, bytes });
  }
  return result;
};

export const createScanArchiveBuildPlan = async (options: ScanArchiveBuilderOptions): Promise<ScanArchiveBuildPlan> => {
  await verifyArchiveRoot(options.archiveRoot, options.year);
  const { manifest, raw } = await readManifest(options.archiveRoot, options.year);
  const manifestBefore = preserveManifestMetadata(raw, manifest);
  const conflicts: ScanArchiveBuilderConflict[] = [];
  const warnings: ScanArchiveBuilderWarning[] = [];
  const files: ScanArchivePlannedFile[] = [];
  const existingById = new Map(manifest.scans.map((scan) => [scan.id, scan]));
  const existingByPath = new Map(manifest.scans.map((scan) => [scan.path, scan]));
  const nextById = new Map(manifestBefore.scans.map((scan) => [scan.id, scan]));
  const batches: ScanArchiveBatch[] = [];
  const importedEntries: ScanArchiveManifestScan[] = [];

  const inputContent =
    options.inputContent ??
    (options.inputPath ? strictUtf8(await fs.readFile(options.inputPath)) : null);

  if (inputContent != null) {
    batches.push(...buildScanArchiveBatches(inputContent, options.year));
    for (const batch of batches) {
      const prepared = await createPreparedScan(batch);
      const existing = existingById.get(prepared.entry.id);
      if (existing) {
        if (!sameScanMetadata(existing, prepared.entry)) {
          conflicts.push({
            code: "scan_id_conflict",
            message: `Scan-ID ${prepared.entry.id} existiert bereits mit abweichenden Metadaten.`,
            scanId: prepared.entry.id,
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
      files.push(await planFile(options.archiveRoot, "raw", prepared.entry.id, prepared.entry.path, prepared.rawCompressed, conflicts));
      files.push(await planFile(options.archiveRoot, "searchIndex", prepared.entry.id, prepared.entry.searchIndex!.path, prepared.searchCompressed, conflicts));
    }
  }

  let backfilled = 0;
  if (options.backfillSearchIndexes) {
    const backfills = await backfillPreparedSearchIndexes(options.archiveRoot, manifest, conflicts);
    for (const backfill of backfills) {
      const planned = await planFile(options.archiveRoot, "searchIndex", backfill.entry.id, backfill.entry.searchIndex!.path, backfill.bytes, conflicts);
      files.push(planned);
      nextById.set(backfill.entry.id, backfill.entry);
      backfilled += 1;
    }
  }

  for (const scan of nextById.values()) {
    if (scan.playerCount === 0 || scan.groupCount === 0) {
      warnings.push({ code: "partial_scan", message: `Scan ${scan.id} ist partiell und wird nicht automatisch fuer Toplisten gewaehlt.`, scanId: scan.id });
    }
  }

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

  const { toplists, changes: toplistChanges } = mergeToplists(draftManifest, options, importedEntries, conflicts);
  const hasManifestChanges =
    importedEntries.length > 0 ||
    backfilled > 0 ||
    toplistChanges.current.length > 0 ||
    toplistChanges.monthly.length > 0;
  const manifestAfterInput: ScanArchiveManifest = {
    ...draftManifest,
    revision: manifest.revision + (hasManifestChanges ? 1 : 0),
    updatedAt: hasManifestChanges ? options.updatedAt ?? new Date().toISOString() : manifest.updatedAt,
    ...(toplists ? { toplists } : {}),
  };
  validateScanArchiveManifest(manifestAfterInput, options.year);
  const manifestAfter = manifestAfterInput;

  return {
    archiveRoot: options.archiveRoot,
    year: options.year,
    apply: false,
    batches,
    manifestBefore,
    manifestAfter,
    files,
    conflicts,
    warnings,
    toplistChanges,
    summary: {
      newScans: importedEntries.length,
      backfilledSearchIndexes: backfilled,
      filesToWrite: files.filter((file) => file.action === "write").length,
      skippedIdenticalFiles: files.filter((file) => file.action === "skip-identical").length,
    },
  };
};

export const applyScanArchiveBuildPlan = async (plan: ScanArchiveBuildPlan) => {
  if (plan.conflicts.length) {
    throw new Error(`Apply abgebrochen: ${plan.conflicts.length} Konflikt(e) im Plan.`);
  }
  await verifyArchiveRoot(plan.archiveRoot, plan.year);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfh-scan-archive-"));
  try {
    const writableFiles = plan.files.filter((file) => file.action === "write");
    for (const file of writableFiles) {
      if (!file.bytes) throw new Error(`Interner Fehler: fehlende Bytes fuer ${file.relativePath}`);
      const tempFile = path.join(tempDir, `${sha256Hex(file.relativePath)}.gz`);
      await fs.writeFile(tempFile, file.bytes);
      if (sha256Hex(await fs.readFile(tempFile)) !== file.sha256) throw new Error(`Temp-Datei-Pruefsumme fehlgeschlagen: ${file.relativePath}`);
    }

    for (const file of writableFiles) {
      if (!file.bytes) throw new Error(`Interner Fehler: fehlende Bytes fuer ${file.relativePath}`);
      const target = safeJoin(plan.archiveRoot, file.relativePath);
      await assertNoSymlinkPath(plan.archiveRoot, file.relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      try {
        const existing = await fs.readFile(target);
        if (Buffer.compare(existing, file.bytes) === 0) continue;
        throw new Error(`Zielpfad existiert bereits mit anderem Inhalt: ${file.relativePath}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await fs.writeFile(target, file.bytes, { flag: "wx" });
    }

    if (JSON.stringify(plan.manifestBefore) !== JSON.stringify(plan.manifestAfter)) {
      const manifestPath = path.join(plan.archiveRoot, MANIFEST_NAME);
      const manifestTemp = path.join(plan.archiveRoot, `${MANIFEST_NAME}.tmp-${process.pid}-${Date.now()}`);
      const manifestContent = `${JSON.stringify(plan.manifestAfter, null, 2)}\n`;
      validateScanArchiveManifest(JSON.parse(manifestContent), plan.year);
      await fs.writeFile(manifestTemp, manifestContent, { flag: "wx" });
      await fs.rename(manifestTemp, manifestPath);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

export const readSelectionFile = async (filePath: string): Promise<ScanArchiveSelectionInput> => {
  const value = await readJsonFileStrict(filePath);
  if (!isRecord(value)) throw new Error("Selection-Datei ist kein Objekt.");
  const selection: ScanArchiveSelectionInput = {};
  if (Object.prototype.hasOwnProperty.call(value, "current")) {
    if (!isRecord(value.current)) throw new Error("selection.current ist kein Objekt.");
    selection.current = Object.fromEntries(
      Object.entries(value.current).map(([server, scanId]) => {
        if (typeof scanId !== "string") throw new Error(`selection.current.${server} ist keine Scan-ID.`);
        return [server, scanId];
      }),
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, "monthly")) {
    if (!isRecord(value.monthly)) throw new Error("selection.monthly ist kein Objekt.");
    selection.monthly = {};
    for (const [month, byServer] of Object.entries(value.monthly)) {
      if (!isRecord(byServer)) throw new Error(`selection.monthly.${month} ist kein Objekt.`);
      selection.monthly[month] = Object.fromEntries(
        Object.entries(byServer).map(([server, scanId]) => {
          if (typeof scanId !== "string") throw new Error(`selection.monthly.${month}.${server} ist keine Scan-ID.`);
          return [server, scanId];
        }),
      );
    }
  }
  return selection;
};
