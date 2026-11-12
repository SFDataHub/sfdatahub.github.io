import { createHash } from "crypto";

// Firestore storage-size rules: UTF-8 + terminator for names/strings, 8-byte
// numbers, 1-byte booleans/null, recursive maps/arrays, document name + 32.
// JSON-only payloads deliberately exclude SDK-specific value types.
export const SAFE_DOCUMENT_BYTES = 512 * 1024;
export const digest = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => JSON.stringify(key) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
const stringBytes = (value: string) => Buffer.byteLength(value, "utf8") + 1;
function valueBytes(value: unknown): number {
  if (value === null || typeof value === "boolean") return 1;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw Error("Non-finite storage value"); return 8; }
  if (typeof value === "string") return stringBytes(value);
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + valueBytes(item), 0);
  if (typeof value === "object") return Object.entries(value!).reduce((sum, [key, item]) => sum + stringBytes(key) + valueBytes(item), 32);
  throw Error("Unsupported storage value");
}
export function documentBytes(path: string, value: Record<string, unknown>): number {
  return path.split("/").reduce((sum, part) => sum + stringBytes(part), 16) + valueBytes(value);
}
export type Bundle = { entries: Record<string, unknown> };
export type Layout = string[]; // disjoint SHA-256 prefixes; empty prefix is root
export const bundleId = (prefix: string) => "b_" + (prefix || "root");

/** Persistent hash trie: split only the overflowing leaf, never merge/repack.
 * Empty leaves remain addressable. An old split parent is left untouched.
 */
export function packBundles(entries: Record<string, unknown>, previous: Layout = [""], path: (id: string) => string, wrap: (bundle: Bundle) => Record<string, unknown> = value => value, limit = SAFE_DOCUMENT_BYTES) {
  const documents = new Map<string, Record<string, unknown>>(), leaves: Layout = [];
  function pack(prefix: string, subset: Record<string, unknown>) {
    const value = wrap({ entries: subset }), id = bundleId(prefix);
    if (documentBytes(path(id), value) <= limit) {
      documents.set(id, value); leaves.push(prefix); return;
    }
    if (prefix.length >= 256) throw Error("Storage entry exceeds safe document size");
    // Binary splits avoid creating sixteen small documents at a threshold.
    // Hex hashes are represented as bits for stable routing in both readers.
    for (const bit of ["0", "1"]) pack(prefix + bit, Object.fromEntries(Object.entries(subset).filter(([key]) => hashBits(key).startsWith(prefix + bit))));
  }
  for (const prefix of previous) pack(prefix, Object.fromEntries(Object.entries(entries).filter(([key]) => hashBits(key).startsWith(prefix))));
  return { documents, leaves };
}
export const hashBits = (hash: string) => [...hash].map(char => parseInt(char, 16).toString(2).padStart(4, "0")).join("");
export function assertAtomicSize(writes: Array<{ path: string; value: Record<string, unknown> }>) {
  let bytes = 0;
  for (const write of writes) {
    const size = documentBytes(write.path, write.value);
    if (size > SAFE_DOCUMENT_BYTES) throw Error("Document exceeds safe size; previous snapshot retained");
    bytes += Math.max(size, Buffer.byteLength(JSON.stringify(write.value))) + 1024;
  }
  if (bytes > 8 * 1024 * 1024 || writes.length > 450) throw Error("Atomic publication exceeds safe size; previous snapshot retained");
}
