// src/lib/import/importer.ts
// Schreibt NUR die Guild-Snapshots unter:
//   guilds/{gid}/snapshots/members_summary
// Kein Eingriff in players/guilds Importpfade.

import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
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

  // Role kann als "Role" oder "Guild Role" kommen
  GUILD_ROLE: [CANON("Role"), CANON("Guild Role")],

  TREASURY: [CANON("Treasury"), CANON("Fortress Treasury"), CANON("Treasury Level"), CANON("Festungsschatzkammer")],
  MINE:     [CANON("Mine"), CANON("Gem Mine"), CANON("Mine Level"), CANON("Festungsmine")],
  BASE_MAIN:[CANON("Base"), CANON("Base Attribute"), CANON("BaseMain"), CANON("Basis Attribut")],

  // Base Constitution explizit unterstützen
  CON_BASE: [CANON("Con Base"), CANON("Constitution Base"), CANON("Base Constitution"), CANON("Basis Konstitution"), CANON("conbase")],

  ATTR_TOT: [CANON("Attribute"), CANON("Attr Total"), CANON("Attribut"), CANON("Attribut Gesamt")],
  CON_TOT:  [CANON("Constitution"), CANON("Constitution Total"), CANON("Konstitution"), CANON("Konstitution Gesamt")],
  LAST_ACTIVE: [CANON("Last Active"), CANON("LastActivity"), CANON("Letzte Aktivität")],

  // optional: Guild Joined (wie in deinem Screenshot)
  GUILD_JOINED: [CANON("Guild Joined"), CANON("Joined Guild"), CANON("Gildenbeitritt")],
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

  baseMain: number | null;       // CSV "Base"
  conBase: number | null;        // CSV "Base Constitution"
  sumBaseTotal: number | null;   // exakt: baseMain + conBase | null

  attrTotal: number | null;
  conTotal: number | null;
  totalStats: number | null;

  // Zeitfelder
  lastScan: string | null;       // Rohanzeige
  lastActivity: string | null;   // Rohanzeige
  lastScanMs: number | null;
  lastActivityMs: number | null;

  // optional: Gildenbeitritt (für UI)
  guildJoined: string | null;
  guildJoinedMs: number | null;
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

  // optional: Guild Joined
  const joinedRaw = pickAnyByCanon(row, P.GUILD_JOINED);
  const joinedSec = toSecFlexible(joinedRaw);

  const level    = toNumberLoose(pickByCanon(row, P.LEVEL));
  const classStr = ((): string | null => {
    const v = pickByCanon(row, P.CLASS);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  })();

  // Role aus "Role" ODER "Guild Role"
  const roleStr  = ((): string | null => {
    const v = pickAnyByCanon(row, P.GUILD_ROLE);
    return v != null && String(v).trim() !== "" ? String(v) : null;
  })();

  const treasury = toNumberLoose(pickAnyByCanon(row, P.TREASURY));
  const mine     = toNumberLoose(pickAnyByCanon(row, P.MINE));
  const baseMain = toNumberLoose(pickAnyByCanon(row, P.BASE_MAIN));
  const conBase  = toNumberLoose(pickAnyByCanon(row, P.CON_BASE));
  const attrTot  = toNumberLoose(pickAnyByCanon(row, P.ATTR_TOT));
  const conTot   = toNumberLoose(pickAnyByCanon(row, P.CON_TOT));

  // Regeln:
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

    guildJoined: joinedRaw != null ? String(joinedRaw) : null,
    guildJoinedMs: joinedSec != null ? joinedSec * 1000 : null,
  };
}
function avgOf(m: MemberSummary[], key: keyof MemberSummary): number | null {
  const xs = m.map(v => v[key]).filter(v => typeof v === "number") as number[];
  if (!xs.length) return null;
  return xs.reduce((a,b)=>a+b,0) / xs.length;
}

// ---- NEU (nur für dein gewünschtes Verhalten): helper zum Lesen ----
async function readGuildLatestTimeSecAndRaw(gid: string): Promise<{sec: number|null, raw: string|null}> {
  const ref = doc(db, `guilds/${gid}/latest/latest`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { sec: null, raw: null };
  const d: any = snap.data() || {};
  const raw: string | null = d.timestampRaw ?? d.values?.Timestamp ?? null;

  let sec: number | null = null;
  if (typeof d.timestamp === "number") {
    sec = d.timestamp > 9_999_999_999 ? Math.floor(d.timestamp / 1000) : d.timestamp;
  } else if (raw) {
    sec = toSecFlexible(raw);
  }
  return { sec, raw };
}

async function readPrevSnapshotSec(gid: string): Promise<number> {
  const ref = doc(db, `guilds/${gid}/snapshots/members_summary`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  const d: any = snap.data() || {};
  if (typeof d.updatedAtMs === "number") return Math.floor(d.updatedAtMs / 1000);
  if (typeof d.updatedAt === "string") {
    const s = toSecFlexible(d.updatedAt);
    if (s != null) return s;
  }
  return 0;
}

// ---------- Hauptfunktion ----------
/**
 * Schreibt pro Gilde genau EIN Dokument:
 *   guilds/{gid}/snapshots/members_summary
 * Basis: Spieler-CSV-Zeilen mit exakt dem Timestamp aus guilds/{gid}/latest/latest.
 * Überschreibt nur, wenn dieser Timestamp neuer ist als der bestehende Snapshot.
 * Fallback gid via (Server+Guild-Name) anhand Guilds-CSV.
 */
export async function writeGuildSnapshotsFromRows(playersRows: CSVRow[], guildsRows: CSVRow[]) {
  const guildNameMap = buildGuildNameMap(guildsRows || []);

  // Gildenmenge bestimmen (aus guildsRows + playersRows)
  const allGids = new Set<string>();
  for (const r of guildsRows || []) {
    const gid = String(pickByCanon(r, G.GUILD_IDENTIFIER) ?? "").trim();
    if (gid) allGids.add(gid);
  }
  for (const r of playersRows || []) {
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
    if (gid) allGids.add(gid);
  }

  let snapshotsWritten = 0;

  for (const gid of allGids) {
    // maßgeblichen Timestamp der Gilde aus latest holen
    const { sec: guildTsSec, raw: guildTsRaw } = await readGuildLatestTimeSecAndRaw(gid);
    if (guildTsSec == null) continue;

    // nur schreiben, wenn neuer als vorhandener Snapshot
    const prevSec = await readPrevSnapshotSec(gid);
    if (guildTsSec <= prevSec) continue;

    // Spielerzeilen mit exakt diesem Timestamp und passender Gilde einsammeln
    const byPid = new Map<string, CSVRow>();
    for (const r of playersRows || []) {
      const server = pickByCanon(r, P.SERVER);
      let rowGid = String(pickByCanon(r, P.GUILD_IDENTIFIER) ?? "").trim();
      if (!rowGid) {
        const guildName = pickByCanon(r, P.GUILD) ?? (r as any)["Guild"];
        if (guildName && server) {
          const key = `${up(server)}__${toFold(String(guildName))}`;
          const mapped = guildNameMap.get(key);
          if (mapped) rowGid = mapped;
        }
      }
      if (rowGid !== gid) continue;

      const tsSec = toSecFlexible(pickByCanon(r, P.TIMESTAMP));
      if (tsSec == null || tsSec !== guildTsSec) continue;

      const pid = String((r as any)?.["ID"] ?? (r as any)?.["Identifier"] ?? "").trim();
      if (!pid) continue;

      if (!byPid.has(pid)) byPid.set(pid, r);
    }

    const rows = Array.from(byPid.values());

    // MemberSummary + Averages berechnen
    const members: MemberSummary[] = [];
    for (const r of rows) members.push(toMemberSummary(r));

    members.sort((a,b) => {
      const ra = roleRank(a.role), rb = roleRank(b.role);
      if (ra !== rb) return ra - rb;
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });

    const avgLevel        = avgOf(members, "level");
    const avgTreasury     = avgOf(members, "treasury");
    const avgMine         = avgOf(members, "mine");
    const avgBaseMain     = avgOf(members, "baseMain");
    const avgConBase      = avgOf(members, "conBase");
    const avgSumBaseTotal = avgOf(members, "sumBaseTotal");
    const avgAttrTotal    = avgOf(members, "attrTotal");
    const avgConTotal     = avgOf(members, "conTotal");
    const avgTotalStats   = avgOf(members, "totalStats");

    const hashBasis = JSON.stringify({
      gid,
      tsSec: guildTsSec,
      members: members.map(m => ({
        id: m.id, name: m.name ?? "", class: m.class ?? "", role: m.role ?? "",
        level: m.level ?? null, treasury: m.treasury ?? null, mine: m.mine ?? null,
        baseMain: m.baseMain ?? null, conBase: m.conBase ?? null, sumBaseTotal: m.sumBaseTotal ?? null,
        attrTotal: m.attrTotal ?? null, conTotal: m.conTotal ?? null, totalStats: m.totalStats ?? null,
        guildJoinedMs: m.guildJoinedMs ?? null,
      })),
    });
    const hash = djb2HashString(hashBasis);

    const ref = doc(db, `guilds/${gid}/snapshots/members_summary`);
    await setDoc(ref, {
      guildId: gid,
      count: members.length,
      updatedAt: guildTsRaw ?? String(guildTsSec), // Rohanzeige aus latest oder Sek.-Fallback
      updatedAtMs: guildTsSec * 1000,              // intern als ms
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

    snapshotsWritten++;
  }

  return { guildsProcessed: allGids.size, snapshotsWritten };
}
