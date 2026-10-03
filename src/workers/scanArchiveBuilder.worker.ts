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
import type { ScanArchiveManifest } from "../lib/scanArchive/types";

const textEncoder = new TextEncoder();
let activeRequestId: string | null = null;
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

const blockerFromError = (error: unknown): ScanArchiveBuilderBlocker => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "input_validation_failed",
    cause: message || "Die Eingabedatei konnte nicht als Scan-Archiv verarbeitet werden.",
    remedy: "Nutze ein rohes SFtools-JSON mit top-level players[] und groups[] fuer genau ein Archivjahr.",
  };
};

const blockerFromConflict = (conflict: ScanArchiveBuildPlanCore<Uint8Array>["conflicts"][number]): ScanArchiveBuilderBlocker => ({
  code: conflict.code,
  cause: conflict.message,
  remedy:
    conflict.code === "toplist_monthly_replace_required"
      ? "Aktiviere das Ersetzen der monatlichen Auswahl oder waehle eine Manifest-Version ohne diese Belegung."
      : "Pruefe Manifest, Eingabedatei und Zielpfade, bevor du das Archivpaket exportierst.",
});

const createInspectionId = () => `inspection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const inspectInput = async (requestId: string, inputFile: File) => {
  activeRequestId = requestId;
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
  const zipContent: Zippable = {
    "manifest.json": [strToU8(`${JSON.stringify(plan.manifestAfter, null, 2)}\n`), { level: 9, mtime: 0 }],
  };
  for (const file of plan.files) {
    if (file.action !== "write" || !file.bytes) continue;
    zipContent[file.relativePath] = [file.bytes, { level: 9, mtime: 0 }];
  }
  return zipSync(zipContent, { level: 9, mtime: 0 });
};

const buildArchive = async (requestId: string, request: Extract<ScanArchiveBuilderRequest, { type: "build" }>) => {
  activeRequestId = requestId;
  const inspected = inspections.get(request.inspectionId);
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
      replaceMonthly: request.replaceMonthly,
      allowCurrentRollback: request.allowCurrentRollback,
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
  inspections.delete(request.inspectionId);
};

workerScope.addEventListener("message", (event: MessageEvent<ScanArchiveBuilderRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeRequestId === request.requestId) {
      activeRequestId = null;
      inspections.clear();
      postResponse({ type: "cancelled", requestId: request.requestId });
    }
    return;
  }

  void (async () => {
    try {
      if (request.type === "inspect") {
        await inspectInput(request.requestId, request.inputFile);
      } else {
        await buildArchive(request.requestId, request);
      }
      if (activeRequestId === request.requestId) activeRequestId = null;
    } catch (error) {
      if (error instanceof Error && error.message === "scan_archive_builder_cancelled") {
        inspections.clear();
        postResponse({ type: "cancelled", requestId: request.requestId });
        return;
      }
      inspections.clear();
      const blocker = blockerFromError(error);
      postResponse({
        type: "error",
        requestId: request.requestId,
        phase: "error",
        message: `${blocker.cause} Remedy: ${blocker.remedy}`,
      });
    }
  })();
});
