// src/lib/import/csv.ts
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/** ---- Public types ---- */
export type ImportCsvKind = "players" | "guilds";

export type ImportCsvOptions = {
  kind: ImportCsvKind;
  rows?: Record<string, any>[];
  raw?: string;
  onProgress?: (p: {
    phase: "prepare" | "write" | "done";
    current: number;
    total: number;
    pass?: "scans" | "latest" | "history";
  }) => void;
};

export type ImportReport = {
  detectedType: string | null;
  counts: {
    // players
    writtenScanPlayers?: number;
    writtenLatestPlayers?: number;
    writtenWeeklyPlayers?: number;
    writtenMonthlyPlayers?: number;
    // guilds
    writtenScanGuilds?: number;
    writtenLatestGuilds?: number;
    writtenWeeklyGuilds?: number;
    writtenMonthlyGuilds?: number;

    // skips
    skippedBadTs?: number;
    skippedMissingIdentifier?: number;
    skippedMissingGuildIdentifier?: number;
    skippedMissingServer?: number;
    skippedMissingName?: number;

    skippedBadTsGuild?: number;
    skippedMissingNameGuild?: number;
  };
  errors: string[];
  warnings: string[];
  durationMs: number;
};

/** ---- utilities ---- */
type Row = Record<string, any>;
type RowMeta = { row: Row; ts: number };

const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");

const COL = {
  PLAYERS: {
    IDENTIFIER: CANON("Identifier"),
    PID: CANON("ID"),
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    SERVER: CANON("Server"),
    NAME: CANON("Name"),
    TIMESTAMP: CANON("Timestamp"),
  },
  GUILDS: {
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    SERVER: CANON("Server"),
    NAME: CANON("Name"),
    MEMBER_COUNT: CANON("Guild Member Count"),
    TIMESTAMP: CANON("Timestamp"),
  },
} as const;

const MAX_CANON_KEYS = new Set<string>([
  CANON("Strength"),
  CANON("Dexterity"),
  CANON("Intelligence"),
  CANON("Constitution"),
  CANON("Luck"),
  CANON("Attribute"),
]);

const MAX_SUBSTRINGS = ["equipment"]; // „alles was equipment betrifft“

const isMaxField = (canonKey: string) =>
  MAX_CANON_KEYS.has(canonKey) || MAX_SUBSTRINGS.some((s) => canonKey.includes(s));

const pickByCanon = (row: Row, canonKey: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
};

function toSecFlexible(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (m) {
    const dd = Number(m[1]);
    const MM = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM, dd, hh, mm, ss);
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return Math.floor(t / 1000);
  return null;
}

function weekIdFromSec(sec: number): string {
  const d = new Date(sec * 1000);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  const y = date.getUTCFullYear();
  const w = weekNo.toString().padStart(2, "0");
  return `${y}-W${w}`;
}

function weekBoundsFromSec(sec: number): { start: number; end: number } {
  const d = new Date(sec * 1000);
  // Montag 00:00
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mo=0 .. So=6
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  const start = Math.floor(date.getTime() / 1000);
  const end = start + 7 * 86400 - 1;
  return { start, end };
}

function monthIdFromSec(sec: number): string {
  const d = new Date(sec * 1000);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

function monthBoundsFromSec(sec: number): { start: number; end: number } {
  const d = new Date(sec * 1000);
  const startDate = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start: Math.floor(startDate.getTime() / 1000),
    end: Math.floor(endDate.getTime() / 1000),
  };
}

function detectDelimiter(headerLine: string) {
  const c = [",", ";", "\t", "|"];
  let best = ",",
    n = -1;
  for (const d of c) {
    const cnt = (headerLine.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (cnt > n) {
      best = d;
      n = cnt;
    }
  }
  return best;
}

function parseCsvCompat(text: string): { headers: string[]; rows: Row[] } {
  let t = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = t.split("\n");
  if (!lines.length) return { headers: [], rows: [] };
  const delim = detectDelimiter(lines[0] ?? "");
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (ch === delim && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headerCells = lines[0] ? parseLine(lines[0]).map(norm) : [];
  const headers = headerCells.map((h, i) => (h ? h : `col${i}`));
  const rows: Row[] = [];
  for (let li = 1; li < lines.length; li++) {
    if (!lines[li]) continue;
    const cells = parseLine(lines[li]);
    if (cells.every((c) => norm(c) === "")) continue;
    const row: Row = {};
    for (let ci = 0; ci < headers.length; ci++)
      row[headers[ci]] = cells[ci] != null ? norm(cells[ci]) : "";
    rows.push(row);
  }
  return { headers, rows };
}

/** ---- batching ---- */
const BATCH_SCANS = 120;   // viele, mittelgroß
const BATCH_LATEST = 40;   // groß (alle Felder) → kleine Batches
const BATCH_HISTORY = 120; // aggregiert, moderat

async function commitBatched(
  docs: Array<(b: ReturnType<typeof writeBatch>) => void>,
  limit: number,
  passName: "scans" | "latest" | "history",
  onProgress?: ImportCsvOptions["onProgress"]
) {
  onProgress?.({ phase: "prepare", current: 0, total: docs.length, pass: passName });
  for (let i = 0; i < docs.length; i += limit) {
    const batch = writeBatch(db);
    const slice = docs.slice(i, i + limit);
    for (const put of slice) put(batch);

    onProgress?.({
      phase: "write",
      current: Math.min(i + slice.length, docs.length),
      total: docs.length,
      pass: passName,
    });

    await batch.commit();
    await new Promise((r) => setTimeout(r, 12));
  }
  onProgress?.({ phase: "done", current: 1, total: 1, pass: passName });
}

/** ---- Aggregation nach Vorgabe ----
 *  - Für Attribute + Equipment: Maximum
 *  - Sonst: letzter (jüngster) Wert (nicht leer bevorzugt)
 */
function aggregateValues(
  rowsSortedAsc: RowMeta[],
  allHeaders: string[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const h of allHeaders) {
    const canon = CANON(h);

    if (isMaxField(canon)) {
      let bestNum: number | null = null;
      let bestRaw: any = undefined;
      for (const rm of rowsSortedAsc) {
        const v = rm.row[h];
        if (v == null || v === "") continue;
        const n = Number(String(v).replace(/[^0-9.-]/g, ""));
        if (!Number.isNaN(n)) {
          if (bestNum == null || n > bestNum) {
            bestNum = n;
            bestRaw = v;
          }
        }
      }
      out[h] = bestRaw ?? "";
    } else {
      // letzter nicht-leerer Wert
      let chosen: any = "";
      for (let i = rowsSortedAsc.length - 1; i >= 0; i--) {
        const v = rowsSortedAsc[i].row[h];
        if (v != null && String(v) !== "") {
          chosen = v;
          break;
        }
      }
      out[h] = chosen;
    }
  }
  return out;
}

/** ---- Hauptimport ---- */
export async function importCsvToDB(
  _rawOrNull: string | null,
  opts: ImportCsvOptions
): Promise<ImportReport> {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: ImportReport["counts"] = {
    writtenScanPlayers: 0,
    writtenLatestPlayers: 0,
    writtenWeeklyPlayers: 0,
    writtenMonthlyPlayers: 0,
    writtenScanGuilds: 0,
    writtenLatestGuilds: 0,
    writtenWeeklyGuilds: 0,
    writtenMonthlyGuilds: 0,
    skippedBadTs: 0,
    skippedMissingIdentifier: 0,
    skippedMissingGuildIdentifier: 0,
    skippedMissingServer: 0,
    skippedMissingName: 0,
    skippedBadTsGuild: 0,
    skippedMissingNameGuild: 0,
  };

  if (!opts || !opts.kind) throw new Error('CSV-Typ fehlt: { kind: "players" | "guilds" }.');

  // Quelle
  let rows: Row[] = [];
  if (opts.rows && Array.isArray(opts.rows)) rows = opts.rows;
  else if (opts.raw && typeof opts.raw === "string") rows = parseCsvCompat(opts.raw).rows;
  else throw new Error("Es wurden weder 'rows' noch 'raw' übergeben.");

  // Alle Header sammeln (über alle Zeilen), damit wir komplette Felder in latest & history haben
  const allHeadersSet = new Set<string>();
  for (const r of rows) Object.keys(r).forEach((k) => allHeadersSet.add(k));
  const ALL_HEADERS = Array.from(allHeadersSet);

  // ---------- PLAYERS ----------
  if (opts.kind === "players") {
    const putScans: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const putLatest: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const putHistory: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    // Gruppen: pid -> RowMeta[]
    const byPid = new Map<string, RowMeta[]>();

    for (const r of rows) {
      const pidRaw = pickByCanon(r, COL.PLAYERS.PID) ?? pickByCanon(r, COL.PLAYERS.IDENTIFIER);
      const pid = String(pidRaw ?? "").trim();
      if (!pid) {
        counts.skippedMissingIdentifier!++;
        continue;
      }
      const tsSec = toSecFlexible(pickByCanon(r, COL.PLAYERS.TIMESTAMP));
      if (tsSec == null) {
        counts.skippedBadTs!++;
        continue;
      }
      const server = ((): string | undefined => {
        const s = pickByCanon(r, COL.PLAYERS.SERVER);
        return s && String(s).trim() !== "" ? up(s) : undefined;
      })();
      if (!server) {
        counts.skippedMissingServer!++;
        continue;
      }

      // scans (volle Zeile)
      putScans.push((batch) => {
        const ref = doc(db, `players/${pid}/scans/${tsSec}`);
        batch.set(
          ref,
          {
            playerId: pid,
            server,
            timestamp: tsSec,
            timestampRaw: pickByCanon(r, COL.PLAYERS.TIMESTAMP),
            name: pickByCanon(r, COL.PLAYERS.NAME) || null,
            values: r, // komplette Zeile hier
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      counts.writtenScanPlayers!++;

      if (!byPid.has(pid)) byPid.set(pid, []);
      byPid.get(pid)!.push({ row: r, ts: tsSec });
    }

    // Für jede pid: latest & history aggregieren
    for (const [pid, metas] of byPid) {
      metas.sort((a, b) => a.ts - b.ts);
      const last = metas[metas.length - 1];
      const server = up(pickByCanon(last.row, COL.PLAYERS.SERVER) || "");
      const name = pickByCanon(last.row, COL.PLAYERS.NAME) || null;

      // latest (volle Zeile = letzte Zeile)
      putLatest.push((batch) => {
        const ref = doc(db, `players/${pid}/latest/latest`);
        batch.set(
          ref,
          {
            playerId: pid,
            server,
            timestamp: last.ts,
            timestampRaw: pickByCanon(last.row, COL.PLAYERS.TIMESTAMP),
            name,
            values: last.row, // alle Header
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      counts.writtenLatestPlayers!++;

      // weekly buckets
      const weekly = new Map<string, RowMeta[]>();
      // monthly buckets
      const monthly = new Map<string, RowMeta[]>();

      for (const m of metas) {
        const w = weekIdFromSec(m.ts);
        const ym = monthIdFromSec(m.ts);
        if (!weekly.has(w)) weekly.set(w, []);
        if (!monthly.has(ym)) monthly.set(ym, []);
        weekly.get(w)!.push(m);
        monthly.get(ym)!.push(m);
      }

      // write weekly
      for (const [wid, list] of weekly) {
        list.sort((a, b) => a.ts - b.ts);
        const aggr = aggregateValues(list, ALL_HEADERS);
        const bounds = weekBoundsFromSec(list[list.length - 1].ts);
        const lastM = list[list.length - 1];

        putHistory.push((batch) => {
          const ref = doc(db, `players/${pid}/history_weekly/${wid}`);
          batch.set(
            ref,
            {
              playerId: pid,
              weekId: wid,
              periodStartSec: bounds.start,
              periodEndSec: bounds.end,
              lastTs: lastM.ts,
              lastTimestampRaw: pickByCanon(lastM.row, COL.PLAYERS.TIMESTAMP),
              server: up(pickByCanon(lastM.row, COL.PLAYERS.SERVER) || ""),
              name: pickByCanon(lastM.row, COL.PLAYERS.NAME) || null,
              values: aggr, // alle Header aggregiert
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenWeeklyPlayers!++;
      }

      // write monthly
      for (const [ym, list] of monthly) {
        list.sort((a, b) => a.ts - b.ts);
        const aggr = aggregateValues(list, ALL_HEADERS);
        const bounds = monthBoundsFromSec(list[list.length - 1].ts);
        const lastM = list[list.length - 1];

        putHistory.push((batch) => {
          const ref = doc(db, `players/${pid}/history_monthly/${ym}`);
          batch.set(
            ref,
            {
              playerId: pid,
              monthId: ym,
              periodStartSec: bounds.start,
              periodEndSec: bounds.end,
              lastTs: lastM.ts,
              lastTimestampRaw: pickByCanon(lastM.row, COL.PLAYERS.TIMESTAMP),
              server: up(pickByCanon(lastM.row, COL.PLAYERS.SERVER) || ""),
              name: pickByCanon(lastM.row, COL.PLAYERS.NAME) || null,
              values: aggr, // alle Header aggregiert
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenMonthlyPlayers!++;
      }
    }

    await commitBatched(putScans,  BATCH_SCANS,  "scans",  opts.onProgress);
    await commitBatched(putLatest, BATCH_LATEST, "latest", opts.onProgress);
    await commitBatched(putHistory,BATCH_HISTORY,"history",opts.onProgress);
  }

  // ---------- GUILDS ----------
  if (opts.kind === "guilds") {
    const putScans: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const putLatest: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const putHistory: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    const byGid = new Map<string, RowMeta[]>();

    for (const r of rows) {
      const gid = String(pickByCanon(r, COL.GUILDS.GUILD_IDENTIFIER) ?? "").trim();
      if (!gid) {
        counts.skippedMissingGuildIdentifier!++;
        continue;
      }
      const tsSec = toSecFlexible(pickByCanon(r, COL.GUILDS.TIMESTAMP));
      if (tsSec == null) {
        counts.skippedBadTsGuild!++;
        continue;
      }
      const server = ((): string | undefined => {
        const s = pickByCanon(r, COL.GUILDS.SERVER);
        return s && String(s).trim() !== "" ? up(s) : undefined;
      })();
      if (!server) {
        counts.skippedMissingServer!++;
        continue;
      }

      // scans
      putScans.push((batch) => {
        const ref = doc(db, `guilds/${gid}/scans/${tsSec}`);
        batch.set(
          ref,
          {
            guildIdentifier: gid,
            server,
            timestamp: tsSec,
            timestampRaw: pickByCanon(r, COL.GUILDS.TIMESTAMP),
            name: pickByCanon(r, COL.GUILDS.NAME) || null,
            values: r, // volle Felder
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      counts.writtenScanGuilds!++;

      if (!byGid.has(gid)) byGid.set(gid, []);
      byGid.get(gid)!.push({ row: r, ts: tsSec });
    }

    for (const [gid, metas] of byGid) {
      metas.sort((a, b) => a.ts - b.ts);
      const last = metas[metas.length - 1];

      // latest
      putLatest.push((batch) => {
        const ref = doc(db, `guilds/${gid}/latest/latest`);
        batch.set(
          ref,
          {
            guildIdentifier: gid,
            server: up(pickByCanon(last.row, COL.GUILDS.SERVER) || ""),
            timestamp: last.ts,
            timestampRaw: pickByCanon(last.row, COL.GUILDS.TIMESTAMP),
            name: pickByCanon(last.row, COL.GUILDS.NAME) || null,
            values: last.row, // alle Felder
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      counts.writtenLatestGuilds!++;

      // buckets
      const weekly = new Map<string, RowMeta[]>();
      const monthly = new Map<string, RowMeta[]>();
      for (const m of metas) {
        const w = weekIdFromSec(m.ts);
        const ym = monthIdFromSec(m.ts);
        if (!weekly.has(w)) weekly.set(w, []);
        if (!monthly.has(ym)) monthly.set(ym, []);
        weekly.get(w)!.push(m);
        monthly.get(ym)!.push(m);
      }

      // weekly
      for (const [wid, list] of weekly) {
        list.sort((a, b) => a.ts - b.ts);
        const aggr = aggregateValues(list, ALL_HEADERS);
        const bounds = weekBoundsFromSec(list[list.length - 1].ts);
        const lastM = list[list.length - 1];

        putHistory.push((batch) => {
          const ref = doc(db, `guilds/${gid}/history_weekly/${wid}`);
          batch.set(
            ref,
            {
              guildIdentifier: gid,
              weekId: wid,
              periodStartSec: bounds.start,
              periodEndSec: bounds.end,
              lastTs: lastM.ts,
              lastTimestampRaw: pickByCanon(lastM.row, COL.GUILDS.TIMESTAMP),
              server: up(pickByCanon(lastM.row, COL.GUILDS.SERVER) || ""),
              name: pickByCanon(lastM.row, COL.GUILDS.NAME) || null,
              values: aggr, // alle Felder aggregiert
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenWeeklyGuilds!++;
      }

      // monthly
      for (const [ym, list] of monthly) {
        list.sort((a, b) => a.ts - b.ts);
        const aggr = aggregateValues(list, ALL_HEADERS);
        const bounds = monthBoundsFromSec(list[list.length - 1].ts);
        const lastM = list[list.length - 1];

        putHistory.push((batch) => {
          const ref = doc(db, `guilds/${gid}/history_monthly/${ym}`);
          batch.set(
            ref,
            {
              guildIdentifier: gid,
              monthId: ym,
              periodStartSec: bounds.start,
              periodEndSec: bounds.end,
              lastTs: lastM.ts,
              lastTimestampRaw: pickByCanon(lastM.row, COL.GUILDS.TIMESTAMP),
              server: up(pickByCanon(lastM.row, COL.GUILDS.SERVER) || ""),
              name: pickByCanon(lastM.row, COL.GUILDS.NAME) || null,
              values: aggr, // alle Felder aggregiert
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenMonthlyGuilds!++;
      }
    }

    await commitBatched(putScans,  BATCH_SCANS,  "scans",  opts.onProgress);
    await commitBatched(putLatest, BATCH_LATEST, "latest", opts.onProgress);
    await commitBatched(putHistory,BATCH_HISTORY,"history",opts.onProgress);
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    detectedType: opts.kind,
    counts,
    errors,
    warnings,
    durationMs: t1 - t0,
  };
}
