// src/lib/import/importer.ts
// Schreibt NUR die Guild-Snapshots unter:
//   guilds/{gid}/snapshots/members_summary
// Kein Eingriff in players/guilds Importpfade.

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export type CSVRow = Record<string, any>;

// ---------- Utils ----------
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");
const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();
const toFold = (s: any) =>
  String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function pickByCanon(row: CSVRow, canonKey: string): any {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
}
function pickAnyByCanon(row: CSVRow, keys: string[]): any {
  for (const kk of keys) {
    const v = pickByCanon(row, kk);
    if (v != null && String(v) !== "") return v;
  }
  return undefined;
}
function toNumberLoose(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toSecFlexible(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const dd = Number(m[1]), MM = Number(m[2]) - 1, yyyy = Number(m[3]);
    const hh = Number(m[4]), mm = Number(m[5]), ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM, dd, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
}

// ---------- Felddefinitionen ----------
const P = {
  GUILD_IDENTIFIER: CANON("Guild Identifier"),
  SERVER: CANON("Server"),
  NAME: CANON("Name"),
  TIMESTAMP: CANON("Timestamp"),
  LEVEL: CANON("Level"),
  CLASS: CANON("Class"),
  GUILD: CANON("Guild"),
  GUILD_ROLE: CANON("Guild Role"),

  TREASURY: [CANON("Treasury"), CANON("Fortress Treasury"), CANON("Treasury Level"), CANON("Festungsschatzkammer")],
  MINE:     [CANON("Mine"), CANON("Fortress Mine"), CANON("Mine Level"), CANON("Festungsmine")],
  BASE_MAIN:[CANON("Base"), CANON("Base Attribute"), CANON("BaseMain"), CANON("Basis Attribut")],
  CON_BASE: [CANON("Con Base"), CANON("Constitution Base"), CANON("Basis Konstitution"), CANON("conbase")],
  ATTR_TOT: [CANON("Attribute"), CANON("Attr Total"), CANON("Attribut"), CANON("Attribut Gesamt")],
  CON_TOT:  [CANON("Constitution"), CANON("Constitution Total"), CANON("Konstitution"), CANON("Konstitution Gesamt")],
  LAST_ACTIVE: [CANON("Last Active"), CANON("LastActivity"), CANON("Letzte Aktivität")],
} as const;

const G = {
  GUILD_IDENTIFIER: CANON("Guild Identifier"),
  SERVER: CANON("Server"),
  NAME: CANON("Name"),
} as const;

// ---------- Typen ----------
type MemberSummary = {
  id: string;
  name: string | null;
  class: string | null;
  role: string | null;
  level: number | null;
  treasury: number | null;
  mine: number | null;
  baseMain: number | null;
  conBase: number | null;
  sumBaseTotal: number | null;
  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;
  lastScan: string | null;      // Rohanzeige
  lastActivity: string | null;  // Rohanzeige
  lastScanMs: number | null;
  lastActivityMs: number | null;
};

// ---------- Helpers ----------
function roleRank(v: any): number {
  const key = String(v || "").trim().toUpperCase();
  if (key === "LEADER" || key === "GUILD LEADER") return 0;
  if (key === "OFFICER" || key === "ADVISOR" || key === "ELDER") return 1;
  if (key === "MEMBER") return 2;
  return 3;
}
function djb2HashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}
function buildGuildNameMap(guildRows: CSVRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of guildRows) {
    const gid = String(pickByCanon(r, G.GUILD_IDENTIFIER) ?? "").trim();
    const server = pickByCanon(r, G.SERVER);
    const name = pickByCanon(r, G.NAME);
    if (!gid || !server || !name) continue;
    const key = `${up(server)}__${toFold(String(name))}`;
    map.set(key, gid);
  }
  return map;
}
function toMemberSummary(row: CSVRow): MemberSummary {
  const tsRaw = pickByCanon(row, P.TIMESTAMP);
  const tsSec = toSecFlexible(tsRaw);
  const lastActiveRaw = pickAnyByCanon(row, P.LAST_ACTIVE);
  const lastActiveSec = toSecFlexible(lastActiveRaw);

  const level    = toNumberLoose(pickByCanon(row, P.LEVEL));
  const classStr = ((): string | null => {
    const v = pickByCanon(row, P.CLASS);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  })();
  const roleStr  = ((): string | null => {
    const v = pickByCanon(row, P.GUILD_ROLE);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  })();

  const treasury = toNumberLoose(pickAnyByCanon(row, P.TREASURY));
  const mine     = toNumberLoose(pickAnyByCanon(row, P.MINE));
  const baseMain = toNumberLoose(pickAnyByCanon(row, P.BASE_MAIN));
  const conBase  = toNumberLoose(pickAnyByCanon(row, P.CON_BASE));
  const attrTot  = toNumberLoose(pickAnyByCanon(row, P.ATTR_TOT));
  const conTot   = toNumberLoose(pickAnyByCanon(row, P.CON_TOT));

  const sumBaseTotal = baseMain != null && conBase != null ? baseMain + conBase : null;
  const totalStats   = attrTot  != null && conTot  != null ? attrTot  + conTot  : null;

  const name = ((): string | null => {
    const v = pickByCanon(row, P.NAME);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  })();

  return {
    id: String((row as any)?.["ID"] ?? (row as any)?.["Identifier"] ?? ""),
    name,
    class: classStr,
    role: roleStr,
    level,
    treasury,
    mine,
    baseMain,
    conBase,
    sumBaseTotal,
    attrTotal: attrTot,
    conTotal: conTot,
    totalStats,
    lastScan: tsRaw != null ? String(tsRaw) : null,
    lastActivity: lastActiveRaw != null ? String(lastActiveRaw) : null,
    lastScanMs: tsSec != null ? tsSec * 1000 : null,
    lastActivityMs: lastActiveSec != null ? lastActiveSec * 1000 : null,
  };
}
function avgOf(m: MemberSummary[], key: keyof MemberSummary): number | null {
  const xs = m.map(v => v[key]).filter(v => typeof v === "number") as number[];
  if (!xs.length) return null;
  return xs.reduce((a,b)=>a+b,0) / xs.length;
}

// ---------- Hauptfunktion ----------
/**
 * Schreibt pro Gilde genau EIN Dokument:
 *   guilds/{gid}/snapshots/members_summary
 * Basis: Players-CSV-Zeilen (gruppiert nach gid; jüngster Timestamp).
 * Fallback gid via (Server+Guild-Name) anhand Guilds-CSV.
 */
export async function writeGuildSnapshotsFromRows(playersRows: CSVRow[], guildsRows: CSVRow[]) {
  const guildNameMap = buildGuildNameMap(guildsRows || []);

  // Buckets (gid, tsSec)
  type Bucket = { gid: string; tsSec: number; rows: CSVRow[] };
  const byGuildTs = new Map<string, Bucket>();

  for (const r of playersRows || []) {
    const tsSec = toSecFlexible(pickByCanon(r, P.TIMESTAMP));
    if (tsSec == null) continue;

    const server = pickByCanon(r, P.SERVER);
    let gid = String(pickByCanon(r, P.GUILD_IDENTIFIER) ?? "").trim();

    if (!gid) {
      const guildName = pickByCanon(r, P.GUILD) ?? (r as any)["Guild"];
      if (guildName && server) {
        const key = `${up(server)}__${toFold(String(guildName))}`;
        const mapped = guildNameMap.get(key);
        if (mapped) gid = mapped;
      }
    }
    if (!gid) continue;

    const k = `${gid}__${tsSec}`;
    let b = byGuildTs.get(k);
    if (!b) { b = { gid, tsSec, rows: [] }; byGuildTs.set(k, b); }
    b.rows.push(r);
  }

  // pro Gilde jüngsten Bucket wählen
  const byGuildLatest = new Map<string, Bucket>();
  for (const b of byGuildTs.values()) {
    const cur = byGuildLatest.get(b.gid);
    if (!cur || b.tsSec > cur.tsSec) byGuildLatest.set(b.gid, b);
  }

  for (const { gid, tsSec, rows } of byGuildLatest.values()) {
    // pid -> row bei diesem ts
    const byPid = new Map<string, CSVRow>();
    for (const r of rows) {
      const pid = String((r as any)?.["ID"] ?? (r as any)?.["Identifier"] ?? "").trim();
      if (!pid) continue;
      byPid.set(pid, r);
    }

    const members: MemberSummary[] = [];
    for (const r of byPid.values()) members.push(toMemberSummary(r));

    // sort: role -> name
    members.sort((a,b) => {
      const ra = roleRank(a.role), rb = roleRank(b.role);
      if (ra !== rb) return ra - rb;
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });

    // averages
    const avgLevel        = avgOf(members, "level");
    const avgTreasury     = avgOf(members, "treasury");
    const avgMine         = avgOf(members, "mine");
    const avgBaseMain     = avgOf(members, "baseMain");
    const avgConBase      = avgOf(members, "conBase");
    const avgSumBaseTotal = avgOf(members, "sumBaseTotal");
    const avgAttrTotal    = avgOf(members, "attrTotal");
    const avgConTotal     = avgOf(members, "conTotal");
    const avgTotalStats   = avgOf(members, "totalStats");

    const any = rows[rows.length - 1] || rows[0];
    const updatedAtRaw = any ? String(pickByCanon(any, P.TIMESTAMP) ?? tsSec) : String(tsSec);

    const hashBasis = JSON.stringify({
      gid, tsSec,
      members: members.map(m => ({
        id: m.id, name: m.name ?? "", class: m.class ?? "", role: m.role ?? "",
        level: m.level ?? null, treasury: m.treasury ?? null, mine: m.mine ?? null,
        baseMain: m.baseMain ?? null, conBase: m.conBase ?? null, sumBaseTotal: m.sumBaseTotal ?? null,
        attrTotal: m.attrTotal ?? null, conTotal: m.conTotal ?? null, totalStats: m.totalStats ?? null,
      })),
    });
    const hash = djb2HashString(hashBasis);

    const ref = doc(db, `guilds/${gid}/snapshots/members_summary`);
    await setDoc(ref, {
      guildId: gid,
      count: members.length,
      updatedAt: updatedAtRaw,    // roh wie in CSV angezeigt
      updatedAtMs: tsSec * 1000,  // intern für Vergleiche
      hash,

      avgLevel,
      avgTreasury,
      avgMine,
      avgBaseMain,
      avgConBase,
      avgSumBaseTotal,
      avgAttrTotal,
      avgConTotal,
      avgTotalStats,

      members,
      updatedAtServer: serverTimestamp(),
    }, { merge: true });
  }

  return { guildsProcessed: byGuildLatest.size, snapshotsWritten: byGuildLatest.size };
}
