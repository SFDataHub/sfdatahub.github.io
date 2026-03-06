// src/lib/import/importer.ts
// Schreibt NUR die Guild-Snapshots unter:
//   guilds/{gid}/snapshots/members_summary(+__YYYY-MM)
// Kein Eingriff in players/guilds Importpfade.

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { toNumber } from "../../../tools/playerDerivedHelpers";
import type { ImportScanWriteMode } from "./csv";
import { db } from "../firebase";
import { traceSetDoc } from "../debug/firestoreReadTrace";

export type CSVRow = Record<string, any>;
export type GuildDerivedAggregate = {
  guildId: string;
  server: string | null;
  name: string | null;
  memberCount: number | null;
  hofRank: number | null;
  honor: number;
  hydra: number;
  instructor: number;
  knights: number;
  knights15Plus: number;
  portalFloor: number;
  raids: number;
  treasury: number;
  lastScan: string | null;
  timestampSec: number;
  count: number;
  avgLevel: number | null;
  avgTreasury: number | null;
  avgMine: number | null;
  avgBaseMain: number | null;
  avgConBase: number | null;
  avgSumBaseTotal: number | null;
  avgAttrTotal: number | null;
  avgConTotal: number | null;
  avgTotalStats: number | null;
};

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
function pickAnyByCanon(row: CSVRow, keys: readonly string[]): any {
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
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]), MM = Number(m[2]) - 1, yyyy = Number(m[3]);
    const hh = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM, dd, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
}

const toDigitsOnlyNumber = (value: any): number => {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const pickByKey = (values: Record<string, any> | null | undefined, keys: readonly string[]) => {
  if (!values || typeof values !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return (values as any)[key];
  }
  return undefined;
};

const GUILD_LATEST_VALUE_KEYS = {
  honor: ["Guild Honor"],
  hydra: ["Guild Hydra"],
  instructor: ["Guild Instructor"],
  knights: ["Guild Knights"],
  knights15Plus: ["Guild Knights 15+"],
  memberCount: ["Guild Member Count"],
  portalFloor: ["Guild Portal Floor"],
  raids: ["Guild Raids"],
  treasury: ["Guild Treasure", "Guild Treasury"],
} as const;

const readGuildLatestMeta = (values: Record<string, any> | null | undefined) => ({
  honor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.honor)),
  hydra: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.hydra)),
  instructor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.instructor)),
  knights: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights)),
  knights15Plus: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights15Plus)),
  memberCount: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.memberCount)),
  portalFloor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.portalFloor)),
  raids: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.raids)),
  treasury: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.treasury)),
});

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

const G = {
  GUILD_IDENTIFIER: CANON("Guild Identifier"),
  SERVER: CANON("Server"),
  NAME: CANON("Name"),
  TIMESTAMP: CANON("Timestamp"),
  MEMBER_COUNT: CANON("Guild Member Count"),
  HOF: CANON("Hall of Fame Rank"),
  HOF_ALT: CANON("Hall of Fame"),
  RANK: CANON("Rank"),
  GUILD_RANK: CANON("Guild Rank"),
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
  main: number | null;           // alias of baseMain for charts
  con: number | null;            // alias of conBase for charts
  sum: number | null;            // alias of sumBaseTotal for charts
  mainTotal: number | null;      // alias of attrTotal for charts
  sumTotal: number | null;       // mainTotal + conTotal
  honor: number | null;
  scrapbook: number | null;
  album: number | null;

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
  xpProgress: number | null;
  xpTotal: number | null;
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

const toNumberOrNull = (value: any): number | null => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = toNumber(raw);
  return Number.isFinite(n) ? n : null;
};

const monthKeyFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

const readSnapshotUpdatedAtMs = (value: any): number | null => {
  if (!value || typeof value !== "object") return null;
  const direct = Number((value as any).updatedAtMs);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fallbackSec = toSecFlexible((value as any).updatedAt ?? (value as any).timestamp);
  if (fallbackSec == null) return null;
  return fallbackSec * 1000;
};

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
  const xpProgress = toNumberOrNull(pickAnyByCanon(row, P.XP));
  const xpTotal = toNumberOrNull(pickAnyByCanon(row, P.XP_TOTAL));
  const honor = toNumberOrNull(pickAnyByCanon(row, P.HONOR));
  const scrapbook = toNumberOrNull(pickAnyByCanon(row, P.SCRAPBOOK));
  const album = scrapbook != null ? scrapbook : null;

  // Regeln:
  const sumBaseTotal = baseMain != null && conBase != null ? baseMain + conBase : null;
  const totalStats   = attrTot  != null && conTot  != null ? attrTot  + conTot  : null;
  const sumTotal     = attrTot  != null && conTot  != null ? attrTot  + conTot  : null;

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
    main: baseMain,
    con: conBase,
    sum: sumBaseTotal,
    mainTotal: attrTot,
    sumTotal,
    honor,
    scrapbook,
    album,
    attrTotal: attrTot,
    conTotal: conTot,
    totalStats,

    lastScan: tsRaw != null ? String(tsRaw) : null,
    lastActivity: lastActiveRaw != null ? String(lastActiveRaw) : null,
    lastScanMs: tsSec != null ? tsSec * 1000 : null,
    lastActivityMs: lastActiveSec != null ? lastActiveSec * 1000 : null,

    guildJoined: joinedRaw != null ? String(joinedRaw) : null,
    guildJoinedMs: joinedSec != null ? joinedSec * 1000 : null,

    xpProgress,
    xpTotal,
  };
}
function avgOf(m: MemberSummary[], key: keyof MemberSummary): number | null {
  const xs = m.map(v => v[key]).filter(v => typeof v === "number") as number[];
  if (!xs.length) return null;
  return xs.reduce((a,b)=>a+b,0) / xs.length;
}

const isDuplicatePermissionError = (error: unknown): boolean => {
  const code = (error as any)?.code;
  if (!code) return false;
  const c = String(code).toLowerCase();
  return c === "permission-denied" || c === "already-exists" || c === "failed-precondition";
};



// ---------- Hauptfunktion ----------
/**
 * Schreibt pro Gilde deterministisch aus geparsten CSV-Zeilen:
 *   guilds/{gid}/snapshots/members_summary
 *   guilds/{gid}/snapshots/members_summary__YYYY-MM
 */
export async function writeGuildSnapshotsFromRows(
  playersRows: CSVRow[],
  guildsRows: CSVRow[],
  scanWriteMode?: ImportScanWriteMode,
  guildProgress?: boolean,
) {
  const guildNameMap = buildGuildNameMap(guildsRows || []);
  const aggregatesByGuildId = new Map<string, GuildDerivedAggregate>();

  const latestGuildRowById = new Map<string, { row: CSVRow; tsSec: number }>();
  for (const r of guildsRows || []) {
    const gid = String(pickByCanon(r, G.GUILD_IDENTIFIER) ?? "").trim();
    if (!gid) continue;
    const tsSec = toSecFlexible(pickByCanon(r, G.TIMESTAMP));
    if (tsSec == null) continue;
    const prev = latestGuildRowById.get(gid);
    if (!prev || tsSec > prev.tsSec) latestGuildRowById.set(gid, { row: r, tsSec });
  }

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
  let fatalError: unknown = null;

  for (const gid of allGids) {
    const latestGuildRow = latestGuildRowById.get(gid)?.row ?? null;
    const guildTsRawValue = latestGuildRow ? pickByCanon(latestGuildRow, G.TIMESTAMP) : null;
    const guildTsRaw = guildTsRawValue != null ? String(guildTsRawValue).trim() : null;
    const guildTsSecFromRow = toSecFlexible(guildTsRawValue);

    // Parsed CSV rows are the source of truth for members_summary.
    // Collect all rows for this guild from the current CSV session and de-dupe by player id.
    const matchedRows: CSVRow[] = [];
    for (const r of playersRows || []) {
      const rowGid = String(pickByCanon(r, P.GUILD_IDENTIFIER) ?? "").trim();
      if (rowGid === gid) matchedRows.push(r);
    }
    console.info("[ImportSelectionToDb] members_summary csv match", {
      guildId: gid,
      csvPlayerRows: playersRows.length,
      matchedMembers: matchedRows.length,
      scanWriteMode: scanWriteMode ?? null,
      guildProgress: guildProgress === true,
    });

    const byPid = new Map<string, { row: CSVRow; tsSec: number | null }>();
    for (const r of matchedRows) {
      const tsSec = toSecFlexible(pickByCanon(r, P.TIMESTAMP));
      const pid = String((r as any)?.["ID"] ?? (r as any)?.["Identifier"] ?? "").trim();
      if (!pid) continue;

      const prev = byPid.get(pid);
      if (!prev) {
        byPid.set(pid, { row: r, tsSec });
        continue;
      }
      const prevTs = prev.tsSec ?? Number.NEGATIVE_INFINITY;
      const nextTs = tsSec ?? Number.NEGATIVE_INFINITY;
      if (nextTs > prevTs) byPid.set(pid, { row: r, tsSec });
    }

    const rows = Array.from(byPid.values(), (entry) => entry.row);

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
    const allAveragesNull =
      avgLevel == null &&
      avgTreasury == null &&
      avgMine == null &&
      avgBaseMain == null &&
      avgConBase == null &&
      avgSumBaseTotal == null &&
      avgAttrTotal == null &&
      avgConTotal == null &&
      avgTotalStats == null;

    if (matchedRows.length === 0) {
      continue;
    }

    if (matchedRows.length > 0 && (members.length === 0 || allAveragesNull)) {
      console.warn("[ImportSelectionToDb] members_summary hard-guard skip (empty payload from non-empty csv match)", {
        guildId: gid,
        matchedMembers: matchedRows.length,
        dedupedMembers: members.length,
        allAveragesNull,
      });
      continue;
    }

    const memberScanMs = members
      .map((m) => m.lastScanMs)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const memberActivityMs = members
      .map((m) => m.lastActivityMs)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    let capturedAtMs =
      memberScanMs.length > 0
        ? Math.max(...memberScanMs)
        : memberActivityMs.length > 0
          ? Math.max(...memberActivityMs)
          : guildTsSecFromRow != null
            ? guildTsSecFromRow * 1000
            : Date.now();
    if (!Number.isFinite(capturedAtMs) || capturedAtMs <= 0) capturedAtMs = Date.now();
    const capturedAtSec = Math.floor(capturedAtMs / 1000);
    const monthKey = monthKeyFromMs(capturedAtMs);
    const updatedAt = guildTsRaw ?? new Date(capturedAtMs).toISOString();

    const hashBasis = JSON.stringify({
      gid,
      tsSec: capturedAtSec,
      members: members.map(m => ({
        id: m.id, name: m.name ?? "", class: m.class ?? "", role: m.role ?? "",
        level: m.level ?? null, treasury: m.treasury ?? null, mine: m.mine ?? null,
        baseMain: m.baseMain ?? null, conBase: m.conBase ?? null, sumBaseTotal: m.sumBaseTotal ?? null,
        main: m.main ?? null, con: m.con ?? null, sum: m.sum ?? null,
        mainTotal: m.mainTotal ?? null, sumTotal: m.sumTotal ?? null,
        honor: m.honor ?? null, scrapbook: m.scrapbook ?? null, album: m.album ?? null,
        attrTotal: m.attrTotal ?? null, conTotal: m.conTotal ?? null, totalStats: m.totalStats ?? null,
        xpProgress: m.xpProgress ?? null, xpTotal: m.xpTotal ?? null,
        guildJoinedMs: m.guildJoinedMs ?? null,
      })),
    });
    const hash = djb2HashString(hashBasis);

    const snapshotPayload = {
      guildId: gid,
      count: members.length,
      updatedAt,
      updatedAtMs: capturedAtMs,
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
    };
    const latestRef = doc(db, `guilds/${gid}/snapshots/members_summary`);
    if (guildProgress === true) {
      let shouldWriteLatest = true;
      let existingLatestTsMs: number | null = null;
      try {
        const latestSnap = await getDoc(latestRef);
        if (latestSnap.exists()) {
          existingLatestTsMs = readSnapshotUpdatedAtMs(latestSnap.data());
          if (existingLatestTsMs != null && capturedAtMs < existingLatestTsMs) {
            shouldWriteLatest = false;
            console.info("[ImportSelectionToDb] guildProgress skip stale latest members_summary", {
              guildId: gid,
              incomingUpdatedAtMs: capturedAtMs,
              existingUpdatedAtMs: existingLatestTsMs,
            });
          }
        }
      } catch (error) {
        shouldWriteLatest = false;
        console.warn("[ImportSelectionToDb] guildProgress latest read failed, skip latest write for safety", {
          guildId: gid,
          error,
        });
      }

      if (shouldWriteLatest) {
        try {
          await traceSetDoc(latestRef, () => setDoc(latestRef, snapshotPayload, { merge: true }), {
            label: "ImportGuildSnapshots:summary",
          });
        } catch (error) {
          if (isDuplicatePermissionError(error)) {
            console.warn("[ImportSelectionToDb] writeGuildSnapshotsFromRows latest duplicate/permission", { gid, error });
          } else {
            console.error("[ImportSelectionToDb] writeGuildSnapshotsFromRows latest fatal", { gid, error });
            fatalError = fatalError || error;
            continue;
          }
        }
      }

      try {
        const monthlyRef = doc(db, `guilds/${gid}/snapshots/members_summary__${monthKey}`);
        await traceSetDoc(monthlyRef, () => setDoc(monthlyRef, snapshotPayload, { merge: true }), {
          label: "ImportGuildSnapshots:summaryMonthly",
        });
        snapshotsWritten++;
      } catch (error) {
        if (isDuplicatePermissionError(error)) {
          console.warn("[ImportSelectionToDb] writeGuildSnapshotsFromRows monthly duplicate/permission", { gid, error });
          continue;
        }
        console.error("[ImportSelectionToDb] writeGuildSnapshotsFromRows monthly fatal", { gid, error });
        fatalError = fatalError || error;
        continue;
      }
    } else {
      try {
        await traceSetDoc(latestRef, () => setDoc(latestRef, snapshotPayload, { merge: true }), {
          label: "ImportGuildSnapshots:summary",
        });

        const monthlyRef = doc(db, `guilds/${gid}/snapshots/members_summary__${monthKey}`);
        await traceSetDoc(monthlyRef, () => setDoc(monthlyRef, snapshotPayload, { merge: true }), {
          label: "ImportGuildSnapshots:summaryMonthly",
        });

        snapshotsWritten++;
      } catch (error) {
        if (isDuplicatePermissionError(error)) {
          console.warn("[ImportSelectionToDb] writeGuildSnapshotsFromRows duplicate/permission", { gid, error });
          continue;
        }
        console.error("[ImportSelectionToDb] writeGuildSnapshotsFromRows fatal", { gid, error });
        fatalError = fatalError || error;
        continue;
      }
    }

    const metaRow = latestGuildRow;
    const latestMeta = readGuildLatestMeta(metaRow as Record<string, any> | null | undefined);
    const serverRaw = metaRow ? pickByCanon(metaRow, G.SERVER) : null;
    const nameRaw = metaRow ? pickByCanon(metaRow, G.NAME) : null;
    const memberCountRaw = metaRow ? pickByCanon(metaRow, G.MEMBER_COUNT) : null;
    const hofRankRaw = metaRow
      ? pickAnyByCanon(metaRow, [G.HOF, G.HOF_ALT, G.RANK, G.GUILD_RANK])
      : null;
    const lastScanRaw = metaRow ? pickByCanon(metaRow, G.TIMESTAMP) : updatedAt;
    const lastScan = lastScanRaw != null ? String(lastScanRaw).trim() : updatedAt;
    const memberCountFallback = toNumberLoose(memberCountRaw);
    const memberCount =
      latestMeta.memberCount > 0
        ? latestMeta.memberCount
        : memberCountFallback != null
          ? memberCountFallback
          : 0;

    aggregatesByGuildId.set(gid, {
      guildId: gid,
      server: serverRaw != null && String(serverRaw).trim() !== "" ? String(serverRaw).trim() : null,
      name: nameRaw != null && String(nameRaw).trim() !== "" ? String(nameRaw).trim() : null,
      memberCount,
      hofRank: toNumberLoose(hofRankRaw),
      honor: latestMeta.honor,
      hydra: latestMeta.hydra,
      instructor: latestMeta.instructor,
      knights: latestMeta.knights,
      knights15Plus: latestMeta.knights15Plus,
      portalFloor: latestMeta.portalFloor,
      raids: latestMeta.raids,
      treasury: latestMeta.treasury,
      lastScan: lastScan ? lastScan : null,
      timestampSec: capturedAtSec,
      count: members.length,
      avgLevel,
      avgTreasury,
      avgMine,
      avgBaseMain,
      avgConBase,
      avgSumBaseTotal,
      avgAttrTotal,
      avgConTotal,
      avgTotalStats,
    });
  }

  if (fatalError) {
    throw fatalError;
  }

  return { guildsProcessed: allGids.size, snapshotsWritten, aggregatesByGuildId };
}
