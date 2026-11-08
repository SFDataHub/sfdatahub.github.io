import { CLASSES, getClassMetaById, iconForClassName } from "../../data/classes";
import { readSfPlayerStats } from "../parsing/parseSfJson";
import type { NormalizedPlayer } from "../parsing/normalizedPlayer";
import { buildStatsModelFromLatestValues } from "../parsing/latestValues";

export type FocusedPlayerStats = {
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
};

const finite = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) ? value : null;
const pair = (main: number | null, con: number | null) => main != null && con != null ? main + con : null;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

// Focused display contract only. Unspecific stored sums and the five-attribute
// analytics fields retain their own contracts and are never substitutes here.
export function readFocusedPlayerStats(raw: unknown, core?: NormalizedPlayer | null): FocusedPlayerStats {
  const stats = readSfPlayerStats(raw);
  const label = stats.classId;
  const icon = iconForClassName(label).url;
  const meta = getClassMetaById(core?.identity.class ?? label) ?? CLASSES.find(item => icon && item.iconUrl === icon);
  const primary = meta ? core?.attributes[meta.primaryAttribute] : null;
  const con = core?.attributes.constitution;
  // CSV/latest-values rows may expose named attributes without a Save or a
  // generic "Base"/"Attribute" field. Reuse their existing component parser.
  const row = record(raw), values = record(row?.values), latest = record(row?.latest);
  const sources = [row, values, record(values?.latestValues), latest, record(latest?.values), record(row?.latestValues)].filter(Boolean);
  const components = meta ? buildStatsModelFromLatestValues({ ...Object.assign({}, ...sources.reverse()), Class: meta.label }).attributeComposition : [];
  const code = meta ? { strength: "str", dexterity: "dex", intelligence: "int" }[meta.primaryAttribute] : null;
  const namedMain = components.find(attribute => attribute.code === code);
  const namedCon = components.find(attribute => attribute.code === "con");
  const baseMain = meta ? finite(primary?.base) ?? finite(stats.baseMain) ?? finite(namedMain?.base) : null;
  const attrTotal = meta ? finite(primary?.total) ?? finite(stats.attrTotal) ?? finite(namedMain?.total) : null;
  const conBase = finite(con?.base) ?? finite(stats.conBase) ?? finite(namedCon?.base);
  const conTotal = finite(con?.total) ?? finite(stats.conTotal) ?? finite(namedCon?.total);
  return { baseMain, conBase, sumBaseTotal: pair(baseMain, conBase), attrTotal, conTotal, totalStats: pair(attrTotal, conTotal) };
}
