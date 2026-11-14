// Shared member-stat parsing.

import { buildStatsModelFromLatestValues } from "../parsing/latestValues";

export type CSVRow = Record<string, any>;

// ---------- Utils ----------
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");

function pickByCanon(row: CSVRow, canonKey: string): any {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
}

function toNumberLoose(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const asRecord = (value: unknown): Record<string, any> | null =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;

const getStatsSources = (row: Record<string, any>): Record<string, any>[] => {
  const values = asRecord(row.values);
  const valuesLatestValues = asRecord(values?.latestValues);
  const latest = asRecord(row.latest);
  const latestValues = asRecord(latest?.values);
  const directLatestValues = asRecord(row.latestValues);
  return [row, values, valuesLatestValues, latest, latestValues, directLatestValues].filter(
    (source): source is Record<string, any> => Boolean(source),
  );
};

const getLatestValuesStatsSource = (row: Record<string, any>): Record<string, any> => {
  const sources = getStatsSources(row);
  return Object.assign({}, ...[...sources].reverse());
};

function pickByCanonFromStatsSources(row: Record<string, any>, canonKey: string): any {
  for (const source of getStatsSources(row)) {
    const value = pickByCanon(source, canonKey);
    if (value != null && String(value) !== "") return value;
  }
  return undefined;
}

function pickAnyByCanonFromStatsSources(row: Record<string, any>, keys: readonly string[]): any {
  for (const kk of keys) {
    const value = pickByCanonFromStatsSources(row, kk);
    if (value != null && String(value) !== "") return value;
  }
  return undefined;
}

const sumKnownStats = (values: Array<number | null>, minKnownValues = 2) => {
  const knownValues = values.filter((value): value is number => value != null);
  if (knownValues.length < minKnownValues) return null;
  return knownValues.reduce((sum, value) => sum + value, 0);
};

// ---------- Felddefinitionen ----------
const P = {
  GUILD_IDENTIFIER: CANON("Guild Identifier"),
  SERVER: CANON("Server"),
  NAME: CANON("Name"),
  TIMESTAMP: CANON("Timestamp"),
  LEVEL: CANON("Level"),
  CLASS: CANON("Class"),
  GUILD: CANON("Guild"),

  // Role kann als "Role" oder "Guild Role" kommen
  GUILD_ROLE: [CANON("Role"), CANON("Guild Role")],

  TREASURY: [CANON("Treasury"), CANON("Fortress Treasury"), CANON("Treasury Level"), CANON("Festungsschatzkammer")],
  MINE:     [CANON("Mine"), CANON("Gem Mine"), CANON("Mine Level"), CANON("Festungsmine")],
  BASE_MAIN:[CANON("Base"), CANON("Base Attribute"), CANON("BaseMain"), CANON("Basis Attribut")],

  // Base Constitution explizit unterstützen
  CON_BASE: [CANON("Con Base"), CANON("Constitution Base"), CANON("Base Constitution"), CANON("Basis Konstitution"), CANON("conbase")],

  ATTR_TOT: [CANON("Attribute"), CANON("Attr Total"), CANON("Attribut"), CANON("Attribut Gesamt")],
  CON_TOT:  [CANON("Constitution"), CANON("Constitution Total"), CANON("Konstitution"), CANON("Konstitution Gesamt")],
  XP: [CANON("XP")],
  XP_TOTAL: [CANON("XP Total")],
  HONOR: [CANON("Honor"), CANON("Fortress Honor"), CANON("Honor Points")],
  SCRAPBOOK: [
    CANON("Scrapbook"),
    CANON("Scrapbook %"),
    CANON("ScrapbookPct"),
    CANON("ScrapbookPercent"),
    CANON("Album"),
    CANON("Album %"),
    CANON("AlbumPct"),
    CANON("AlbumPercent"),
    CANON("Album Percentage"),
    CANON("AlbumCompletion"),
    CANON("AlbumProgress"),
  ],
  LAST_ACTIVE: [CANON("Last Active"), CANON("LastActivity"), CANON("Letzte Aktivität")],

  // optional: Guild Joined (wie in deinem Screenshot)
  GUILD_JOINED: [CANON("Guild Joined"), CANON("Joined Guild"), CANON("Gildenbeitritt")],
} as const;

export type GuildAnalyticsMemberStats = {
  level: number | null;
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
};

export function readGuildAnalyticsMemberStats(row: Record<string, any>): GuildAnalyticsMemberStats {
  const level = toNumberLoose(pickByCanonFromStatsSources(row, P.LEVEL));
  const baseMain = toNumberLoose(pickAnyByCanonFromStatsSources(row, P.BASE_MAIN));
  const conBase = toNumberLoose(pickAnyByCanonFromStatsSources(row, P.CON_BASE));
  const attrTotal = toNumberLoose(pickAnyByCanonFromStatsSources(row, P.ATTR_TOT));
  const conTotal = toNumberLoose(pickAnyByCanonFromStatsSources(row, P.CON_TOT));
  const statsModel = buildStatsModelFromLatestValues(getLatestValuesStatsSource(row));
  const parsedBaseTotal = sumKnownStats(statsModel.attributeComposition.map((attribute) => attribute.base));
  const parsedTotalStats = sumKnownStats(statsModel.attributeComposition.map((attribute) => attribute.total));
  const sumBaseTotal =
    toNumberLoose(pickByCanonFromStatsSources(row, CANON("sumBaseTotal"))) ??
    (baseMain != null && conBase != null ? baseMain + conBase : null) ??
    parsedBaseTotal;
  const totalStats =
    toNumberLoose(pickByCanonFromStatsSources(row, CANON("totalStats"))) ??
    (attrTotal != null && conTotal != null ? attrTotal + conTotal : null) ??
    parsedTotalStats;

  return {
    level,
    baseMain,
    conBase,
    sumBaseTotal,
    attrTotal,
    conTotal,
    totalStats,
  };
}

