// /src/lib/importer/schemas.ts
import type { Mapping, MetaAppConfig } from "./types";
import { splitHeadersList, verifyHeaders } from "./preprocess";

export function extractMapping(kind: "players" | "guilds", meta: MetaAppConfig): Mapping {
  const m = (meta.csvMapping as any)[kind] as Mapping;
  // Normalize lists (strings -> arrays)
  (m as any).allowedHeaders  = splitHeadersList((m as any).allowedHeaders);
  (m as any).requiredHeaders = splitHeadersList((m as any).requiredHeaders);
  return m;
}

export function ensureHeaders(kind: "players" | "guilds", rows: Record<string,string>[], mapping: Mapping, meta: MetaAppConfig) {
  const strict = !!meta.requireAllHeaders || !!meta.rejectOnMissingHeaders;
  const v = verifyHeaders(rows, (mapping as any).allowedHeaders, (mapping as any).requiredHeaders, strict);
  if (!v.ok) {
    throw new Error(`Missing required headers for ${kind}: ${v.missing.join(", ")}`);
  }
}
