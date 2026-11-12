import { digest, documentBytes, SAFE_DOCUMENT_BYTES } from "./bundles";

export type FragmentPointer = { parts: Array<{ id: string; hash: string }> };
/** Ordinary rows stay compact. Only an individually oversized row is encoded
 * losslessly into stable, hash-verified fragments before bundle allocation.
 */
export function fragmentEntries(entries: Record<string, unknown>, basis: string, path: (id: string) => string) {
  const rows: Record<string, unknown> = {}, fragments = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(entries)) {
    if (documentBytes(path("b_" + "0".repeat(256)), { schemaVersion: 4, basis, entries: { [key]: value } }) <= SAFE_DOCUMENT_BYTES) {
      rows[key] = value; continue;
    }
    const text = JSON.stringify(value), parts: FragmentPointer["parts"] = [];
    for (let offset = 0, part = 0; offset < text.length; part++) {
      let end = Math.min(text.length, offset + 65536);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      const id = `f_${key}_${part}`, fragment = { schemaVersion: 4, basis, data: text.slice(offset, end) };
      if (documentBytes(path(id), fragment) > SAFE_DOCUMENT_BYTES) throw Error("Fragment exceeds safe document size");
      parts.push({ id, hash: digest(fragment) }); fragments.set(id, fragment); offset = end;
    }
    rows[key] = { parts };
  }
  return { entries: rows, fragments };
}
