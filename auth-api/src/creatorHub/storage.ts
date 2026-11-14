import { parseCatalog, type CreatorCatalog } from "./types";
import { digest, documentBytes, packBundles, SAFE_DOCUMENT_BYTES } from "../storage/bundles";
import { fragmentEntries, type FragmentPointer } from "../storage/fragments";

export const catalogPath = "creator_hub/catalog";
const partPath = (id: string) => `${catalogPath}/parts/${id}`;
type Part = { id: string; hash: string };
/** Preparation only. No cloud writes; small catalogs use one document. */
export function catalogDocuments(input: unknown): Map<string, Record<string, unknown>> {
  const catalog = parseCatalog(input), inline = { ...catalog };
  if (documentBytes(catalogPath, inline) <= SAFE_DOCUMENT_BYTES) return new Map([[catalogPath, inline]]);
  const basis = digest(catalog), entries = Object.fromEntries(catalog.creators.map(c => [digest(c.id), c]));
  const fragmented = fragmentEntries(entries, basis, partPath);
  const packed = packBundles(fragmented.entries, [""], partPath, b => ({ ...b, schemaVersion: 1, basis }));
  const documents = new Map<string, Record<string, unknown>>(), parts: Part[] = [];
  for (const [id, value] of [...fragmented.fragments, ...packed.documents]) {
    documents.set(partPath(id), value); parts.push({ id, hash: digest(value) });
  }
  const manifest = { schemaVersion: 1, basis, parts };
  if (documentBytes(catalogPath, manifest) > SAFE_DOCUMENT_BYTES) throw Error("Catalog manifest exceeds safe document size");
  documents.set(catalogPath, manifest); return documents;
}
export async function readCatalog(get: (path: string) => Promise<any>): Promise<CreatorCatalog> {
  const root = await get(catalogPath);
  if (root?.schemaVersion !== 1) throw Error("Catalog unavailable");
  if (Array.isArray(root.creators)) return parseCatalog(root);
  if (!Array.isArray(root.parts) || !root.parts.length || typeof root.basis !== "string") throw Error("Invalid catalog manifest");
  const documents = new Map<string, any>();
  await Promise.all(root.parts.map(async (part: Part) => {
    if (!part || !/^[bf]_[a-zA-Z0-9_]+$/.test(part.id) || documents.has(part.id)) throw Error("Invalid catalog part");
    const value = await get(partPath(part.id));
    if (!value || value.basis !== root.basis || digest(value) !== part.hash) throw Error("Incomplete catalog");
    documents.set(part.id, value);
  }));
  const creators = [...documents.values()].flatMap(d => Object.values(d.entries ?? {})).map((entry: any) => {
    if (!Array.isArray(entry.parts)) return entry;
    return JSON.parse((entry as FragmentPointer).parts.map(part => {
      const fragment = documents.get(part.id);
      if (!fragment || digest(fragment) !== part.hash || typeof fragment.data !== "string") throw Error("Incomplete creator");
      return fragment.data;
    }).join(""));
  });
  const catalog = parseCatalog({ schemaVersion: 1, creators });
  if (digest(catalog) !== root.basis) throw Error("Catalog changed during read");
  return catalog;
}
