import type { ScanArchiveEntry, ScanArchiveSearchIndexPayload } from "./types";
import { validateScanArchiveSearchIndexPayload } from "./validation";

export const sha256Hex = async (bytes: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const gunzipArrayBuffer = async (bytes: ArrayBuffer) => {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("gzip-Entpackung wird von dieser Runtime nicht unterstuetzt.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
};

export function getScanArchiveSearchIndexUrl(entry: ScanArchiveEntry) {
  if (!entry.searchIndex) throw new Error(`Archivscan ${entry.id} hat keinen Suchindex.`);
  return new URL(entry.searchIndex.path, entry.manifestUrl).toString();
}

export async function validateDownloadedScanArchiveSearchIndex(
  entry: ScanArchiveEntry,
  compressed: ArrayBuffer,
): Promise<ScanArchiveSearchIndexPayload> {
  if (!entry.searchIndex) throw new Error(`Archivscan ${entry.id} hat keinen Suchindex.`);

  if (compressed.byteLength !== entry.searchIndex.compressedBytes) {
    throw new Error("Suchindex-Downloadgroesse stimmt nicht mit dem Manifest ueberein.");
  }

  const digest = await sha256Hex(compressed);
  if (digest !== entry.searchIndex.sha256.toLowerCase()) {
    throw new Error("Suchindex-SHA-256-Pruefsumme stimmt nicht mit dem Manifest ueberein.");
  }

  const rawBytes = await gunzipArrayBuffer(compressed);
  if (rawBytes.byteLength !== entry.searchIndex.uncompressedBytes) {
    throw new Error("Suchindex entpackte Groesse stimmt nicht mit dem Manifest ueberein.");
  }

  const content = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  return validateScanArchiveSearchIndexPayload(JSON.parse(content) as unknown, entry);
}
