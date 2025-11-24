import { serverTimestamp } from "firebase/firestore";
import type { CsvRow, Mapping, MetaAppConfig } from "./types";

export function getTimestamp(row: CsvRow, header: string): number | null {
  const raw = row[header];
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

export function makeKeyFromTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function nowServerTimestamp(meta: MetaAppConfig): Record<string, unknown> {
  const field = meta.csvMapping?.ingest?.uploadTimestampField || "uploadedAt";
  return { [field]: serverTimestamp() };
}
