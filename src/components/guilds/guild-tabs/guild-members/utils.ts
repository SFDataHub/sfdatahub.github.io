// src/components/guilds/guild-tabs/guild-members/utils.ts

export const THEME = {
  bg: "#0C1C2E",
  tile: "#1A2F4A",
  tileHover: "#25456B",
  border: "#2B4C73",
  text: "#FFFFFF",
  sub: "#B0C4D9",
  title: "#F5F9FF",
  icon: "#5C8BC6",
  header: "#1E3657",
  tableBg: "#14273E",
  line: "#2C4A73",
  glow: "rgba(92,139,198,0.45)",
};

export const mergeTheme = (a: any, b?: any) => ({ ...(a || {}), ...(b || {}) });

export const fmtDate = (d?: Date | string) => {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

export const timeAgo = (d?: Date | string | number | null) => {
  if (d == null || d === "") return "—";
  const date = d instanceof Date ? d : new Date(d);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

export const sumBaseStats = (base?: Record<string, number>) =>
  Object.values(base || {}).reduce((a, b) => a + (b || 0), 0);

/* ------------------------------------------------------------------ */
/*  NEU: Einheitliche Sum-Base-Ermittlung für ALLE Views/Sortierungen  */
/*  – bildet exakt das ab, was die Top-Details anzeigen.               */
/* ------------------------------------------------------------------ */

const toNum = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * strictSumBase
 * Quelle in dieser Reihenfolge:
 *  1) m.sumBaseTotal
 *  2) m.baseMain + m.conBase
 *  3) m.baseStats.sumBaseTotal ODER (m.baseStats.main + m.baseStats.con)
 *  4) m.values.SumBaseTotal ODER (m.values.Main + m.values.Con)
 * Liefert number oder null (keine Formatierung).
 */
export function strictSumBase(m: any): number | null {
  // 1) direktes Feld
  const d1 = toNum(m?.sumBaseTotal);
  if (d1 != null) return d1;

  // 2) main + con
  const bm = toNum(m?.baseMain);
  const bc = toNum(m?.conBase);
  if (bm != null && bc != null) return bm + bc;

  // 3) aus baseStats
  const bs = m?.baseStats || {};
  const d3 = toNum(bs?.sumBaseTotal);
  if (d3 != null) return d3;
  const bsm = toNum(bs?.main);
  const bsc = toNum(bs?.con);
  if (bsm != null && bsc != null) return bsm + bsc;

  // 4) aus values (verschiedene Schreibweisen)
  const v = m?.values || {};
  const d4 =
    toNum(v?.SumBaseTotal) ??
    toNum(v?.sumBaseTotal) ??
    toNum(v?.["Sum Base Total"]);
  if (d4 != null) return d4;

  const vm =
    toNum(v?.Main) ??
    toNum(v?.main) ??
    toNum(v?.BaseMain) ??
    toNum(v?.baseMain);
  const vc =
    toNum(v?.Con) ??
    toNum(v?.con) ??
    toNum(v?.ConBase) ??
    toNum(v?.conBase);
  if (vm != null && vc != null) return vm + vc;

  return null;
}
