import { gzipSync, strToU8, zipSync, type Zippable } from "fflate";
import {
  createScanArchiveBuildPlanCore,
  inspectScanArchiveInputContent,
  monthKeyForScanArchiveTimestamp,
  type ScanArchiveBatch,
  type ScanArchiveBuildPlanCore,
} from "../lib/scanArchive/archiveBuilderCore";
import type {
  ScanArchiveBuilderBlocker,
  ScanArchiveBuilderProgress,
  ScanArchiveBuilderRequest,
  ScanArchiveBuilderResponse,
} from "../lib/scanArchive/scanArchiveBuilderTypes";
import { mapCoreBuilderPhase } from "../lib/scanArchive/scanArchiveBuilderTypes";
import { scanArchiveBuilderBlockerFromError } from "../lib/scanArchive/scanArchiveBuilderErrors";
import type { ScanArchiveManifest } from "../lib/scanArchive/types";
import { createScanArchiveBuilderMonthlyLoader } from "../lib/scanArchive/scanArchiveBuilderAcquisition";
import { scanArchiveBuilderTargets } from "../lib/scanArchive/scanArchiveBuilderMonthly";

const textEncoder = new TextEncoder();
let activeRequestId: string | null = null;
let activeAbort: AbortController | null = null;
let requestQueue = Promise.resolve();
const discardedRequests = new Set<string>();
const inspections = new Map<string, { batches: ScanArchiveBatch[] }>();
const workerScope = self as unknown as {
  postMessage(message: ScanArchiveBuilderResponse, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<ScanArchiveBuilderRequest>) => void): void;
};

const postResponse = (message: ScanArchiveBuilderResponse, transfer?: Transferable[]) => {
  workerScope.postMessage(message, transfer ?? []);
};

const emitProgress = (requestId: string, progress: ScanArchiveBuilderProgress) => {
  if (activeRequestId !== requestId) return;
  postResponse({ type: "progress", requestId, progress });
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = bytes.buffer;
  if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength && buffer instanceof ArrayBuffer) return buffer;
  return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const sha256Hex = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const bytesEqual = (left: Uint8Array, right: Uint8Array) => {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const assertActive = (requestId: string) => {
  if (activeRequestId !== requestId) throw new Error("scan_archive_builder_cancelled");
};

const blockerFromConflict = (conflict: ScanArchiveBuildPlanCore<Uint8Array>["conflicts"][number]): ScanArchiveBuilderBlocker => ({
  code: conflict.code,
  cause: conflict.message,
  remedy:
    conflict.code.startsWith("add_")
      ? "Pruefe das Monatsziel und alle genannten Set-Mitglieder. Fuer einen neuen Monatsstand Create monthly scan verwenden."
      : conflict.code === "scan_id_conflict" || conflict.code.includes("path_conflict")
        ? "Bestehende Archivdateien sind unveraenderlich. Einen echten Nachscan mit anderem Timestamp importieren; vorhandene Bytes nicht ueberschreiben."
        : "Pruefe Manifest, Eingabedatei und Zielpfade, bevor du das Archivpaket exportierst.",
});

const createInspectionId = () => `inspection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const inspectInput = async (requestId: string, inputFile: File) => {
  activeRequestId = requestId;
  inspections.clear();
  emitProgress(requestId, { phase: "parsing", message: "SFtools-JSON wird gelesen." });
  const content = await inputFile.text();
  assertActive(requestId);
  emitProgress(requestId, { phase: "validating", message: "Archivjahr und Rohdaten werden geprueft." });
  const { years, batches } = inspectScanArchiveInputContent(content);
  const blockers: ScanArchiveBuilderBlocker[] = [];
  if (years.length !== 1) {
    blockers.push({
      code: years.length === 0 ? "input_without_timestamps" : "input_multi_year",
      cause: years.length === 0 ? "Die Eingabe enthaelt keine verwertbaren Millisekunden-Timestamps." : `Die Eingabe enthaelt mehrere Archivjahre: ${years.join(", ")}.`,
      remedy: "Exportiere pro Archivjahr eine eigene SFtools-Datei und lade hier genau ein Jahr.",
    });
  }
  const inspectionId = createInspectionId();
  if (!blockers.length) inspections.set(inspectionId, { batches });
  assertActive(requestId);
  postResponse({
    type: "inspected",
    requestId,
    inspection: {
      inspectionId,
      years,
      months: [...new Set(batches.map((batch) => monthKeyForScanArchiveTimestamp(batch.timestamp)))],
      servers: [...new Set(batches.map((batch) => batch.server))].sort((left, right) => left.localeCompare(right)),
      batchCount: batches.length,
      targets: scanArchiveBuilderTargets(batches).map(({ server, month }) => ({ server, month })),
      blockers,
    },
  });
};

const buildExistingFiles = (manifest: ScanArchiveManifest) => {
  const existing = new Map<string, { sha256?: string; compressedBytes?: number }>();
  for (const scan of manifest.scans) {
    existing.set(scan.path, { sha256: scan.sha256, compressedBytes: scan.compressedBytes });
    if (scan.searchIndex) {
      existing.set(scan.searchIndex.path, {
        sha256: scan.searchIndex.sha256,
        compressedBytes: scan.searchIndex.compressedBytes,
      });
    }
  }
  return existing;
};

const buildZip = (plan: ScanArchiveBuildPlanCore<Uint8Array>) => {
  // ZIP's DOS date starts at 1980; Unix epoch 0 is only valid for gzip.
  const mtime = new Date(1980, 0, 1);
  const zipContent: Zippable = {
    "manifest.json": [strToU8(`${JSON.stringify(plan.manifestAfter, null, 2)}\n`), { level: 9, mtime }],
  };
  for (const file of plan.files) {
    if (file.action !== "write" || !file.bytes) continue;
    zipContent[file.relativePath] = [file.bytes, { level: 9, mtime }];
  }
  return zipSync(zipContent, { level: 9, mtime });
};

const buildArchive = async (requestId: string, request: Extract<ScanArchiveBuilderRequest, { type: "build" }>) => {
  activeRequestId = requestId;
  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;
  const inspected = inspections.get(request.inspectionId);
  if (!["create-monthly", "add-monthly", "archive-only"].includes(request.usageMode)) {
    throw new Error("Waehle Create monthly scan, Add to monthly scan oder Archive as DataHub scan only.");
  }
  if (!inspected) {
    throw new Error("Die Worker-Inspection ist nicht mehr verfuegbar. Bitte lade die Eingabedatei erneut.");
  }
  emitProgress(requestId, { phase: "validating", message: "Manifest und Eingabedatei werden geprueft." });
  const plan = await createScanArchiveBuildPlanCore(
    {
      year: request.manifest.archiveYear,
      manifest: request.manifest,
      inputBatches: inspected.batches,
      usageMode: request.usageMode,
      loadMonthlyRawScan: request.usageMode === "add-monthly" ? createScanArchiveBuilderMonthlyLoader({
        manifest: request.manifest, source: request.manifestSource, catalogUrl: request.catalogUrl, signal: abort.signal,
      }) : undefined,
      allowCurrentRollback: request.allowCurrentRollback,
      preserveNewerCurrent: true,
      existingFiles: buildExistingFiles(request.manifest),
      onProgress: (progress) => {
        emitProgress(requestId, { ...progress, phase: mapCoreBuilderPhase(progress.phase) });
        assertActive(requestId);
      },
    },
    {
      gzip: (content) => gzipSync(textEncoder.encode(content), { level: 9, mtime: 0 }),
      sha256: sha256Hex,
      byteLength: (bytes) => bytes.byteLength,
      utf8ByteLength: (content) => textEncoder.encode(content).byteLength,
      bytesEqual,
    },
  );
  assertActive(requestId);

  const blockers = plan.conflicts.map(blockerFromConflict);
  const filesToWrite = plan.files.filter((file) => file.action === "write").length;
  if (!plan.conflicts.length && filesToWrite === 0 && JSON.stringify(plan.manifestBefore) === JSON.stringify(plan.manifestAfter)) {
    blockers.push({
      code: "nothing_to_export",
      cause: "Die Eingabe ist bereits im Manifest enthalten und erzeugt keine neuen Archivdateien.",
      remedy: "Nutze eine neue Scan-Datei oder ein aelteres Manifest, das diesen Scan noch nicht enthaelt.",
    });
  }

  emitProgress(requestId, { phase: "zip-building", message: "ZIP-Paket wird gebaut." });
  const zipBytes = blockers.length ? new Uint8Array() : buildZip(plan);
  assertActive(requestId);
  emitProgress(requestId, { phase: "ready", message: "Archivpaket ist bereit." });
  const zipBuffer = toArrayBuffer(zipBytes);
  postResponse(
    {
      type: "complete",
      requestId,
      result: {
        year: plan.year,
        usageMode: request.usageMode,
        monthlyTargets: plan.monthlyTargets,
        manifestSource: request.manifestSource,
        manifestBefore: plan.manifestBefore,
        manifestAfter: plan.manifestAfter,
        batchCount: plan.batches.length,
        files: plan.files.map(({ bytes: _bytes, ...file }) => file),
        conflicts: plan.conflicts,
        warnings: plan.warnings,
        toplistChanges: plan.toplistChanges,
        summary: {
          ...plan.summary,
          zipBytes: zipBytes.byteLength,
        },
        zipBytes: zipBuffer,
        zipFilename: `scan-archive-${plan.year}-builder-export.zip`,
        blockers,
      },
    },
    [zipBuffer],
  );
  if (activeAbort === abort) activeAbort = null;
};

workerScope.addEventListener("message", (event: MessageEvent<ScanArchiveBuilderRequest>) => {
  const request = event.data;
  if (request.type === "cancel" || request.type === "discard-build") {
    discardedRequests.add(request.requestId);
    if (activeRequestId === request.requestId) {
      activeRequestId = null;
      activeAbort?.abort();
      if (request.type === "cancel") inspections.clear();
      postResponse({ type: "cancelled", requestId: request.requestId });
    }
    return;
  }

  requestQueue = requestQueue.then(async () => {
    try {
      if (discardedRequests.has(request.requestId)) {
        postResponse({ type: "cancelled", requestId: request.requestId });
        return;
      }
      if (request.type === "inspect") {
        await inspectInput(request.requestId, request.inputFile);
      } else {
        await buildArchive(request.requestId, request);
      }
      if (activeRequestId === request.requestId) activeRequestId = null;
    } catch (error) {
      if (error instanceof Error && error.message === "scan_archive_builder_cancelled") {
        postResponse({ type: "cancelled", requestId: request.requestId });
        return;
      }
      const blocker = scanArchiveBuilderBlockerFromError(error, request.type === "inspect" ? "input" : "build");
      postResponse({
        type: "error",
        requestId: request.requestId,
        phase: "error",
        message: `${blocker.cause} Remedy: ${blocker.remedy}`,
        blocker,
      });
    } finally {
      discardedRequests.delete(request.requestId);
      if (activeRequestId === request.requestId) {
        activeRequestId = null;
        activeAbort?.abort();
        activeAbort = null;
      }
    }
  });
});
