// /src/lib/importer/preprocess.ts
import type {
  CsvRow, Mapping, ServerNormalizeCfg,
} from "./types";

function asArrayFromConfig(val?: string | string[]): string[] {
  if (!val) return [];
  return Array.isArray(val)
    ? val
    : String(val)
        .split(/\s+/g)
        .map(s => s.trim())
        .filter(Boolean);
}

export function splitHeadersList(raw?: string | string[]): string[] {
  return asArrayFromConfig(raw);
}

export function verifyHeaders(
  rows: CsvRow[],
  allowed?: string[],
  required?: string[],
  strict = false,
) {
  if (rows.length === 0) return { ok: true, missing: [] };
  const sample = Object.keys(rows[0]);

  // check missing required
  const missing = (required || []).filter(h => !sample.includes(h));

  if (missing.length) return { ok: false, missing };

  if (strict && allowed && allowed.length) {
    // reject if there are headers outside the whitelist
    const notAllowed = sample.filter(h => !allowed.includes(h));
    if (notAllowed.length) {
      console.warn("[Importer] Not allowed headers present:", notAllowed);
    }
  }
  return { ok: true, missing: [] };
}

export function normalizeServer(raw: string, cfg?: ServerNormalizeCfg): string {
  const s = (raw || "").trim();
  if (!cfg) return s;
  const named = cfg.namedMap?.[s];
  if (named) return named;

  const tryPattern = (pat?: string) => {
    if (!pat) return undefined;
    const [from, to] = pat.split("->").map(x => x.trim());
    try {
      const re = new RegExp(from);
      if (re.test(s)) return s.replace(re, to);
    } catch {}
    return undefined;
  };

  return (
    tryPattern(cfg.amPattern) ??
    tryPattern(cfg.euPattern) ??
    tryPattern(cfg.fusionpattern) ??
    s
  );
}

export function bestId(mapping: Mapping, row: CsvRow): string {
  const pref = mapping.idPreference || "pid>identifier";
  const pid  = mapping.pidHeader ? (row[mapping.pidHeader] || "").trim() : "";
  const ident = mapping.identifierHeader ? (row[mapping.identifierHeader] || "").trim() : "";
  if (pref.includes("pid") && pid) return pid;
  if (pref.includes("identifier") && ident) return ident;
  return pid || ident; // fallback
}

export function headerValue(row: CsvRow, header?: string) {
  return header ? (row[header] ?? "") : "";
}
