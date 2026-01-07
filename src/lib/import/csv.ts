// src/lib/import/csv.ts
import {
  writeBatch,
  doc,
  serverTimestamp,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  getDocs,
} from "firebase/firestore";
import { deriveForPlayer } from "../../../tools/playerDerivedHelpers";
import { db } from "../firebase";

/** ---- Public types ---- */
export type ImportCsvKind = "players" | "guilds";

export type ImportProgress = {
  phase: "prepare" | "write" | "done";
  current: number;
  total: number;
  pass?: "scans" | "latest" | "history";
  created?: number;
  duplicate?: number;
  error?: number;
  kind?: ImportCsvKind;
};

export type ImportCsvOptions = {
  kind: ImportCsvKind;
  rows?: Record<string, any>[];
  raw?: string;
  onProgress?: (p: ImportProgress) => void;
};

export type ImportRecordStatus = "created" | "duplicate" | "error";

export type ImportResultItem = {
  key: string;
  status: ImportRecordStatus;
  message?: string;
};

export type ImportResultSummary = {
  playerResults: ImportResultItem[];
  guildResults: ImportResultItem[];
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
  playerResults?: ImportResultItem[];
  guildResults?: ImportResultItem[];
};

/** ---- utilities ---- */
type Row = Record<string, any>;
type RowMeta = { row: Row; ts: number };

export type ParsedPlayerCsvRow = {
  playerId: string;
  server: string;
  name: string | null;
  timestampSec: number;
  raw: Row;
  guildIdentifier?: string | null;
  guildName?: string | null;
  level?: number | null;
  classId?: number | null;
  className?: string | null;
};

export type ParsedGuildCsvRow = {
  guildIdentifier: string;
  server: string;
  name: string | null;
  timestampSec: number;
  raw: Row;
  memberCount?: number | null;
  hofRank?: number | null;
};

const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();
const CANON = (s: string) => s.toLowerCase().replace(/[\s_\u00a0]+/g, "");
const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const dateKeyFromSec = (sec: number | null | undefined): number => {
  const d = sec ? new Date(sec * 1000) : new Date();
  return Number(`${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`);
};

// diakritikfrei + lowercase (für Folds/Token/Ngram)
const toFold = (s: any) =>
  String(s ?? "")
    .normalize("NFD")
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// Tokenizer: Wort-Tokens (>=2 Zeichen), dedupliziert
const nameToTokens = (s: any): string[] => {
  const f = toFold(s);
  if (!f) return [];
  const parts = f.split(/[^a-z0-9]+/g).filter((t) => t && t.length >= 2);
  return Array.from(new Set(parts));
};

// Edge-Ngrams aus Tokens
const tokensToNgrams = (tokens: string[]): string[] => {
  const out = new Set<string>();
  for (const t of tokens) for (let i = 1; i <= t.length; i++) out.add(t.slice(0, i));
  return Array.from(out);
};

const isPermissionDuplicateError = (error: unknown): boolean => {
  const code = String((error as any)?.code ?? "").toLowerCase();
  return code.includes("permission") || code.includes("already") || code.includes("failed-precondition");
};

// Zahl locker parsen
const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseLevelValue = (v: any): number | null => {
  const n = toNumberLoose(v);
  return Number.isFinite(n ?? NaN) ? Math.trunc(n as number) : null;
};

const classIdFromName = (name: string): number | null => {
  const canon = CANON(name);
  for (const [id, label] of Object.entries(PLAYER_CLASS_NAMES)) {
    if (CANON(label) === canon) return Number(id);
  }
  return null;
};

const parseClassValue = (value: any): { classId: number | null; className: string | null } => {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return { classId: null, className: null };
  const asNumber = Number(raw);
  const isIntegerNumber = Number.isInteger(asNumber) && !Number.isNaN(asNumber);
  if (isIntegerNumber) {
    const classId = asNumber;
    return { classId, className: PLAYER_CLASS_NAMES[classId] ?? String(classId) };
  }
  const classId = classIdFromName(raw);
  return { classId, className: raw };
};

const COL = {
  PLAYERS: {
    IDENTIFIER: CANON("Identifier"),
    PID: CANON("ID"),
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    SERVER: CANON("Server"),
    NAME: CANON("Name"),
    TIMESTAMP: CANON("Timestamp"),
    LEVEL: CANON("Level"),
    CLASS: CANON("Class"),
    GUILD: CANON("Guild"),
  },
  GUILDS: {
    GUILD_IDENTIFIER: CANON("Guild Identifier"),
    SERVER: CANON("Server"),
    NAME: CANON("Name"),
    MEMBER_COUNT: CANON("Guild Member Count"),
    TIMESTAMP: CANON("Timestamp"),
    HOF: CANON("Hall of Fame Rank"),
    HOF_ALT: CANON("HoF"),
    RANK: CANON("Rank"),
    GUILD_RANK: CANON("Guild Rank"),
  },
} as const;

const PLAYER_CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Mage",
  3: "Scout",
  4: "Assassin",
  5: "Battle Mage",
  6: "Berserker",
  7: "Demon Hunter",
  8: "Bard",
};

const PLAYER_LEVEL_KEYS = [COL.PLAYERS.LEVEL, CANON("Level"), CANON("Lvl"), CANON("Stufe")];
const PLAYER_CLASS_KEYS = [
  COL.PLAYERS.CLASS,
  CANON("Class"),
  CANON("ClassID"),
  CANON("Class ID"),
  CANON("CharClass"),
  CANON("Klasse"),
];

type HeaderLookup = Map<string, string>;

const buildHeaderLookup = (headers: string[]): HeaderLookup => {
  const lookup = new Map<string, string>();
  headers.forEach((h) => {
    const canon = CANON(h);
    if (!lookup.has(canon)) lookup.set(canon, h);
  });
  return lookup;
};

const inferHeadersFromRows = (rows: Row[]): string[] => {
  const set = new Set<string>();
  for (const row of rows) Object.keys(row).forEach((k) => set.add(k));
  return Array.from(set);
};

const pickWithLookup = (row: Row, lookup: HeaderLookup, canonKey: string): any => {
  const header = lookup.get(canonKey);
  if (header && Object.prototype.hasOwnProperty.call(row, header)) return row[header];
  return pickByCanon(row, canonKey);
};

const pickAnyWithLookup = (row: Row, lookup: HeaderLookup, keys: string[]): any =>
  keys.map((k) => pickWithLookup(row, lookup, k)).find((v) => v != null && String(v) !== "");

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

const pickAnyByCanon = (row: Row, keys: string[]): any =>
  keys.map((k) => pickByCanon(row, k)).find((v) => v != null && String(v) !== "");

// WICHTIG: identisch zu deiner Implementierung
function toSecFlexible(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mo=0..So=6
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

type PlayerParseStats = {
  missingIdentifier: number;
  badTimestamp: number;
  missingServer: number;
};

type GuildParseStats = {
  missingIdentifier: number;
  badTimestamp: number;
  missingServer: number;
};

type PlayerParseResult = { rows: ParsedPlayerCsvRow[]; stats: PlayerParseStats; headers: string[] };
type GuildParseResult = { rows: ParsedGuildCsvRow[]; stats: GuildParseStats; headers: string[] };

type PlayerHeaderMap = {
  levelIndex?: number;
  classIndex?: number;
};

function buildPlayerHeaderMap(headers: string[]): PlayerHeaderMap {
  const map: PlayerHeaderMap = {};

  for (let i = 0; i < headers.length; i++) {
    const canon = CANON(headers[i]);
    if (PLAYER_LEVEL_KEYS.includes(canon) && map.levelIndex == null) map.levelIndex = i;
    if (PLAYER_CLASS_KEYS.includes(canon) && map.classIndex == null) map.classIndex = i;
  }

  if (map.levelIndex == null) {
    const idx = headers.findIndex((h) => h.trim() === "Level");
    if (idx >= 0) map.levelIndex = idx;
  }
  if (map.classIndex == null) {
    const idx = headers.findIndex((h) => h.trim() === "Class");
    if (idx >= 0) map.classIndex = idx;
  }

  return map;
}

function parsePlayersFromRows(rows: Row[], headers?: string[]): PlayerParseResult {
  const headersResolved = headers && headers.length ? headers : inferHeadersFromRows(rows);
  const lookup = buildHeaderLookup(headersResolved);
  const stats: PlayerParseStats = { missingIdentifier: 0, badTimestamp: 0, missingServer: 0 };
  const parsed: ParsedPlayerCsvRow[] = [];

  const headerMap = buildPlayerHeaderMap(headersResolved);
  for (const row of rows) {
    const pidRaw = pickWithLookup(row, lookup, COL.PLAYERS.PID) ?? pickWithLookup(row, lookup, COL.PLAYERS.IDENTIFIER);
    const playerId = norm(pidRaw);
    if (!playerId) {
      stats.missingIdentifier++;
      continue;
    }

    const tsSec = toSecFlexible(pickWithLookup(row, lookup, COL.PLAYERS.TIMESTAMP));
    if (tsSec == null) {
      stats.badTimestamp++;
      continue;
    }

    const serverRaw = pickWithLookup(row, lookup, COL.PLAYERS.SERVER);
    const server = serverRaw && norm(serverRaw) !== "" ? up(serverRaw) : undefined;
    if (!server) {
      stats.missingServer++;
      continue;
    }

    const nameVal = pickWithLookup(row, lookup, COL.PLAYERS.NAME);
    const name = nameVal != null && norm(nameVal) !== "" ? String(nameVal) : null;

    const guildIdentifierVal = pickWithLookup(row, lookup, COL.PLAYERS.GUILD_IDENTIFIER);
    const guildIdentifier =
      guildIdentifierVal != null && norm(guildIdentifierVal) !== "" ? String(guildIdentifierVal) : null;

    const guildNameVal = pickWithLookup(row, lookup, COL.PLAYERS.GUILD);
    const guildName = guildNameVal != null && norm(guildNameVal) !== "" ? String(guildNameVal) : null;

    const level =
      headerMap.levelIndex != null
        ? parseLevelValue(row[headersResolved[headerMap.levelIndex]])
        : parseLevelValue(pickAnyWithLookup(row, lookup, PLAYER_LEVEL_KEYS));
    const classInfo =
      headerMap.classIndex != null
        ? parseClassValue(row[headersResolved[headerMap.classIndex]])
        : parseClassValue(pickAnyWithLookup(row, lookup, PLAYER_CLASS_KEYS));

    parsed.push({
      playerId,
      server,
      name,
      timestampSec: tsSec,
      guildIdentifier,
      guildName,
      level,
      classId: classInfo.classId,
      className: classInfo.className,
      raw: row,
    });
  }

  return { rows: parsed, stats, headers: headersResolved };
}

function parseGuildsFromRows(rows: Row[], headers?: string[]): GuildParseResult {
  const headersResolved = headers && headers.length ? headers : inferHeadersFromRows(rows);
  const lookup = buildHeaderLookup(headersResolved);
  const stats: GuildParseStats = { missingIdentifier: 0, badTimestamp: 0, missingServer: 0 };
  const parsed: ParsedGuildCsvRow[] = [];

  for (const row of rows) {
    const gidRaw = pickWithLookup(row, lookup, COL.GUILDS.GUILD_IDENTIFIER);
    const guildIdentifier = norm(gidRaw);
    if (!guildIdentifier) {
      stats.missingIdentifier++;
      continue;
    }

    const tsSec = toSecFlexible(pickWithLookup(row, lookup, COL.GUILDS.TIMESTAMP));
    if (tsSec == null) {
      stats.badTimestamp++;
      continue;
    }

    const serverRaw = pickWithLookup(row, lookup, COL.GUILDS.SERVER);
    const server = serverRaw && norm(serverRaw) !== "" ? up(serverRaw) : undefined;
    if (!server) {
      stats.missingServer++;
      continue;
    }

    const nameVal = pickWithLookup(row, lookup, COL.GUILDS.NAME);
    const name = nameVal != null && norm(nameVal) !== "" ? String(nameVal) : null;

    const memberCount = toNumberLoose(pickWithLookup(row, lookup, COL.GUILDS.MEMBER_COUNT));
    const hofRank = toNumberLoose(
      pickAnyWithLookup(row, lookup, [COL.GUILDS.HOF, COL.GUILDS.HOF_ALT, COL.GUILDS.RANK, COL.GUILDS.GUILD_RANK])
    );

    parsed.push({
      guildIdentifier,
      server,
      name,
      timestampSec: tsSec,
      memberCount,
      hofRank,
      raw: row,
    });
  }

  return { rows: parsed, stats, headers: headersResolved };
}

export function parsePlayersCsvText(text: string): ParsedPlayerCsvRow[] {
  const parsed = parseCsvCompat(text);
  return parsePlayersFromRows(parsed.rows, parsed.headers).rows;
}

export function parseGuildsCsvText(text: string): ParsedGuildCsvRow[] {
  const parsed = parseCsvCompat(text);
  return parseGuildsFromRows(parsed.rows, parsed.headers).rows;
}

/** ---- batching ---- */
const PLAYER_DERIVED_COL = "stats_cache_player_derived";
const PLAYERS_INDEX_COL = "stats_index_players_daily_compact";
const BATCH_SCANS = 120;   // viele, mittelgross
const BATCH_LATEST = 40;   // gross (alle Felder) -> kleine Batches
const BATCH_HISTORY = 120; // aggregiert, moderat
const PLAYER_DERIVED_SNAPSHOT_LIMIT = 500;

type PlayerDerivedSnapshotEntry = {
  playerId: string;
  server: string;
  name: string;
  class: string;
  guild: string | null;
  lastScan: string | null;
  level: number | null;
  con: number | null;
  main: number | null;
  mine: number | null;
  ratio: number | null;
  sum: number | null;
  treasury: number | null;
  deltaRank: number | null;
  deltaSum: number | null;
};

type LatestCacheEntry = { prevSec: number; exists: boolean };

const toFiniteNumberOrNull = (value: any): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toSnapshotDocId = (serverKey: string) => `snapshot_${serverKey}_player_derived`;

const normalizeServerHost = (value: any) => String(value ?? "").trim().toLowerCase();

async function loadServerHostMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const snap = await getDocs(collection(db, "servers"));
    snap.forEach((docSnap) => {
      const data: any = docSnap.data();
      const host = normalizeServerHost(data?.host);
      if (host) map.set(host, docSnap.id);
    });
  } catch (error) {
    console.warn("[ImportCsv] Failed to load server host map", { error });
  }
  return map;
}

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

type ScanDoc = { ref: ReturnType<typeof doc>; data: any; key: string };

async function writeScansWithResults(
  scans: ScanDoc[],
  onProgress?: ImportCsvOptions["onProgress"],
  kind?: ImportCsvKind
): Promise<ImportResultItem[]> {
  const results: ImportResultItem[] = [];
  if (!scans.length) return results;

  let processed = 0;
  let created = 0;
  let duplicate = 0;
  let errorCount = 0;

  const emit = (phase: "prepare" | "write" | "done") => {
    onProgress?.({
      phase,
      current: phase === "done" ? scans.length : processed,
      total: scans.length,
      pass: "scans",
      created,
      duplicate,
      error: errorCount,
      kind,
    });
  };

  emit("prepare");

  const bulkWriterFactory = (db as any).bulkWriter;
  if (typeof bulkWriterFactory === "function") {
    const writer = bulkWriterFactory.call(db, { throttling: true });
    const tick = () => {
      processed++;
      emit("write");
    };

    for (const { ref, data, key } of scans) {
      writer
        .create(ref, data)
        .then(() => {
          created++;
          results.push({ key, status: "created" });
          tick();
        })
        .catch((error: any) => {
          const code = String(error?.code ?? "").toLowerCase();
          if (code.includes("already") && code.includes("exist")) {
            duplicate++;
            results.push({ key, status: "duplicate" });
          } else {
            errorCount++;
            results.push({ key, status: "error", message: String(error?.message ?? error) });
          }
          tick();
        });
    }

    try {
      await writer.close();
    } catch (error) {
      console.warn("[ImportCsv] bulkWriter close with errors", { error });
    }
    emit("done");
    return results;
  }

  // Fallback: no bulkWriter available, behave like previous set/merge (statuses all "created")
  // Use per-doc set to avoid whole-batch failures; permission-denied on existing scans is treated as duplicate.
  for (const { ref, data, key } of scans) {
    try {
      await setDoc(ref, data);
      created++;
      results.push({ key, status: "created" });
    } catch (error: any) {
      const code = String(error?.code ?? "").toLowerCase();
      if (code.includes("permission") || code.includes("already")) {
        duplicate++;
        results.push({ key, status: "duplicate", message: String(error?.message ?? error) });
      } else {
        errorCount++;
        results.push({ key, status: "error", message: String(error?.message ?? error) });
      }
    }
    processed++;
    emit("write");
  }
  emit("done");
  return results;
}

async function writeLatestAndDerived(
  latestDocs: Array<{ ref: ReturnType<typeof doc>; data: any }>,
  indexDocs: Array<{ ref: ReturnType<typeof doc>; data: any }>,
  onProgress?: ImportCsvOptions["onProgress"]
) {
  if (!latestDocs.length && !indexDocs.length) return;

  const total = latestDocs.length + indexDocs.length;
  const bulkWriterFactory = (db as any).bulkWriter;

  if (typeof bulkWriterFactory === "function") {
    const writer = bulkWriterFactory.call(db, { throttling: true });
    onProgress?.({ phase: "prepare", current: 0, total, pass: "latest" });

    for (const { ref, data } of latestDocs) writer.set(ref, data, { merge: true });
    for (const { ref, data } of indexDocs) writer.set(ref, data, { merge: true });

    onProgress?.({ phase: "write", current: total, total, pass: "latest" });
    await writer.close();
    onProgress?.({ phase: "done", current: 1, total: 1, pass: "latest" });
    return;
  }

  const latestBatchers = latestDocs.map(({ ref, data }) => (b: ReturnType<typeof writeBatch>) =>
    b.set(ref, data, { merge: true })
  );
  const indexBatchers = indexDocs.map(({ ref, data }) => (b: ReturnType<typeof writeBatch>) =>
    b.set(ref, data, { merge: true })
  );

  await commitBatched(latestBatchers, BATCH_LATEST, "latest", onProgress);
  await commitBatched(indexBatchers, BATCH_LATEST, "latest", onProgress);
}

async function upsertPlayerDerivedServerSnapshot(
  serverKey: string,
  entries: PlayerDerivedSnapshotEntry[]
) {
  if (!entries.length) return;

  const snapshotKey = String(serverKey || "all").trim() || "all";
  const snapshotRef = doc(db, `${PLAYER_DERIVED_COL}/${toSnapshotDocId(snapshotKey)}`);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(snapshotRef);
    const existing = snap.exists() ? snap.data()?.players : null;
    const byId = new Map<string, PlayerDerivedSnapshotEntry>();

    if (Array.isArray(existing)) {
      for (const raw of existing) {
        if (!raw || typeof raw !== "object") continue;
        const pid = String((raw as any).playerId ?? "");
        if (!pid) continue;
        byId.set(pid, raw as PlayerDerivedSnapshotEntry);
      }
    }

    const findLowest = () => {
      let minId: string | null = null;
      let minSum = Number.POSITIVE_INFINITY;
      for (const [pid, entry] of byId.entries()) {
        const sum = toFiniteNumberOrNull(entry.sum) ?? 0;
        if (sum < minSum) {
          minSum = sum;
          minId = pid;
        }
      }
      return { minId, minSum };
    };

    for (const entry of entries) {
      const pid = String(entry.playerId ?? "");
      if (!pid) continue;

      if (byId.has(pid)) {
        byId.set(pid, entry);
        continue;
      }

      if (byId.size < PLAYER_DERIVED_SNAPSHOT_LIMIT) {
        byId.set(pid, entry);
        continue;
      }

      const entrySum = toFiniteNumberOrNull(entry.sum) ?? 0;
      const { minId, minSum } = findLowest();
      if (minId && entrySum > minSum) {
        byId.delete(minId);
        byId.set(pid, entry);
      }
    }

    const players = Array.from(byId.values());
    players.sort((a, b) => {
      const diff = (toFiniteNumberOrNull(b.sum) ?? 0) - (toFiniteNumberOrNull(a.sum) ?? 0);
      if (diff !== 0) return diff;
      return String(a.playerId ?? "").localeCompare(String(b.playerId ?? ""));
    });
    if (players.length > PLAYER_DERIVED_SNAPSHOT_LIMIT) {
      players.length = PLAYER_DERIVED_SNAPSHOT_LIMIT;
    }

    tx.set(
      snapshotRef,
      { server: snapshotKey, updatedAt: serverTimestamp(), players },
      { merge: true }
    );
  });
}

/** ---- Aggregation ---- */
function aggregateValues(rowsSortedAsc: RowMeta[], allHeaders: string[]): Record<string, any> {
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

/** ---- Helper: vorhandenen latest-Zeitpunkt robust lesen (Sekunden) ---- */
async function readPrevLatestSec(
  latestRef: ReturnType<typeof doc>,
  cache?: Map<string, LatestCacheEntry>
): Promise<number> {
  const cacheKey = latestRef.path;
  const cached = cache?.get(cacheKey);
  if (cached) return cached.prevSec;

  const snap = await getDoc(latestRef);
  if (!snap.exists()) {
    cache?.set(cacheKey, { prevSec: 0, exists: false });
    return 0;
  }
  const d: any = snap.data();
  let prevSec: number | null = null;

  // bevorzugt: CSV-String in values.Timestamp
  if (d?.values?.Timestamp != null) {
    const s = toSecFlexible(d.values.Timestamp);
    if (s != null) prevSec = s;
  }

  // optional: timestampRaw (falls vorhanden)
  if (prevSec == null && d?.timestampRaw != null) {
    const s = toSecFlexible(d.timestampRaw);
    if (s != null) prevSec = s;
  }

  // Fallbacks: ts / timestamp
  if (prevSec == null && typeof d?.ts === "number") prevSec = d.ts;

  const v = d?.timestamp;
  if (prevSec == null && typeof v === "number") {
    prevSec = v > 9_999_999_999 ? Math.floor(v / 1000) : v;
  }
  if (prevSec == null && typeof v === "string") {
    const p = Date.parse(v);
    if (Number.isFinite(p)) prevSec = Math.floor(p / 1000);
  }

  const resolvedPrevSec = prevSec ?? 0;
  cache?.set(cacheKey, { prevSec: resolvedPrevSec, exists: true });
  return resolvedPrevSec;
}

/** ---- Hauptimport ---- */
// Hier kommt der One-Pass-Import hin: Upload Center liefert pro Typ ein fertiges Batch.
// Input heute:
//   - guilds: opts.rows = guildsRows[] mit Guild Identifier + Guild Member Count + Timestamp (+ Server/Name)
//   - players: opts.rows = playersRows[] mit Identifier + Guild Identifier + Timestamp + Server (+ Name/Own/...)
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
  const playerResults: ImportResultItem[] = [];
  const guildResults: ImportResultItem[] = [];

  if (!opts || !opts.kind) throw new Error('CSV-Typ fehlt: { kind: "players" | "guilds" }.');

  const emitProgress = opts.onProgress
    ? ((p: Parameters<NonNullable<ImportCsvOptions["onProgress"]>>[0]) =>
        opts.onProgress?.({ ...p, kind: opts.kind }))
    : undefined;
  const latestCacheByPath = new Map<string, LatestCacheEntry>();

  // ---------- PLAYERS ----------
  if (opts.kind === "players") {
    const playerScanDocs: ScanDoc[] = [];
    const latestDocs: Array<{ ref: ReturnType<typeof doc>; data: any }> = [];
    const indexByScope = new Map<
      string,
      { dateKey: number; scopeId: string; group: string; serverKey: string; ids: string[]; vals: number[] }
    >();
    const putHistory: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const pendingDerivedByServer = new Map<string, PlayerDerivedSnapshotEntry[]>();

    let sourceRows: Row[] = [];
    let sourceHeaders: string[] = [];
    if (opts.rows && Array.isArray(opts.rows)) {
      sourceRows = opts.rows;
      sourceHeaders = inferHeadersFromRows(sourceRows);
    } else if (opts.raw && typeof opts.raw === "string") {
      const parsedRaw = parseCsvCompat(opts.raw);
      sourceRows = parsedRaw.rows;
      sourceHeaders = parsedRaw.headers;
    } else {
      throw new Error("Es wurden weder 'rows' noch 'raw' übergeben.");
    }

    const {
      rows: parsedPlayers,
      stats: playerParseStats,
      headers: playerHeaders,
    } = parsePlayersFromRows(sourceRows, sourceHeaders);
    counts.skippedMissingIdentifier! += playerParseStats.missingIdentifier;
    counts.skippedBadTs! += playerParseStats.badTimestamp;
    counts.skippedMissingServer! += playerParseStats.missingServer;
    const ALL_HEADERS = playerHeaders.length ? playerHeaders : inferHeadersFromRows(sourceRows);

    type PlayerRowMeta = { row: Row; ts: number; parsed: ParsedPlayerCsvRow };
    const byPid = new Map<string, PlayerRowMeta[]>();

    for (const parsed of parsedPlayers) {
      const scanKey = `${parsed.playerId}__${parsed.server}__${parsed.timestampSec}`;
      playerScanDocs.push({
        key: scanKey,
        ref: doc(db, `players/${parsed.playerId}/scans/${parsed.timestampSec}`),
        data: {
          playerId: parsed.playerId,
          server: parsed.server,
          timestamp: parsed.timestampSec,
          timestampRaw: pickByCanon(parsed.raw, COL.PLAYERS.TIMESTAMP),
          name: parsed.name,
          values: parsed.raw,
          createdAt: serverTimestamp(),
        },
      });

      if (!byPid.has(parsed.playerId)) byPid.set(parsed.playerId, []);
      byPid.get(parsed.playerId)!.push({ row: parsed.raw, ts: parsed.timestampSec, parsed });
    }

    const scanResults = await writeScansWithResults(playerScanDocs, emitProgress, "players");
    playerResults.push(...scanResults);
    counts.writtenScanPlayers = scanResults.filter((r) => r.status === "created").length;

    const serverCodeByHost = await loadServerHostMap();
    if (!serverCodeByHost.size) {
      console.warn("[ImportCsv] Server host map empty; derived snapshots will be skipped.");
    }

    for (const [pid, metas] of byPid) {
      metas.sort((a, b) => a.ts - b.ts);
      const last = metas[metas.length - 1];
      const parsed = last.parsed;
      const server = parsed.server;
      const name = parsed.name;
      const level = parsed.level ?? null;
      const className = parsed.className ?? null;
      const guildName = parsed.guildName ?? null;
      const guildIdentifier = parsed.guildIdentifier;

      const nameForSearch = name ?? "";
      const tokens = nameToTokens(nameForSearch);
      const ngrams = tokensToNgrams(tokens);

      // *** NEU: latest nur schreiben, wenn neuer als vorhandener latest ***
      const latestRef = doc(db, `players/${pid}/latest/latest`);
      const prevSec = await readPrevLatestSec(latestRef, latestCacheByPath);
      if (last.ts > prevSec) {
        const latestUpdatedAt = serverTimestamp();

        latestDocs.push({
          ref: latestRef,
          data: {
            playerId: pid,
            server,
            timestamp: last.ts,
            timestampRaw: pickByCanon(last.row, COL.PLAYERS.TIMESTAMP),
            name,
            values: last.row,
            updatedAt: latestUpdatedAt,

            // Suchfelder
            nameFold: toFold(nameForSearch),
            nameTokens: tokens,
            nameNgrams: ngrams,

            // Dropdown-Felder
            level,
            className,
            guildName,
            guildNameFold: guildName ? toFold(guildName) : null,
          },
        });

        const derivedInput = {
          playerId: pid,
          name,
          className,
          level,
          server,
          guildIdentifier: guildIdentifier || undefined,
          guildName: guildName || undefined,
          values: last.row,
          timestamp: last.ts,
          updatedAt: latestUpdatedAt,
        };
        const derived = deriveForPlayer(derivedInput, serverTimestamp);
        const snapshotServerKey =
          serverCodeByHost.size > 0 ? serverCodeByHost.get(normalizeServerHost(server)) ?? null : null;
        if (!snapshotServerKey && serverCodeByHost.size > 0) {
          console.warn("[ImportCsv] Derived snapshot skipped (server host not mapped)", {
            playerId: pid,
            server,
          });
        }
        if (snapshotServerKey) {
          const lastScanRaw = pickByCanon(last.row, COL.PLAYERS.TIMESTAMP);
          const lastScanValue = lastScanRaw != null ? String(lastScanRaw).trim() : "";
          const lastScan = (lastScanValue || String(last.ts ?? "")).trim();
          const snapshotEntry: PlayerDerivedSnapshotEntry = {
            playerId: String(pid),
            server: snapshotServerKey,
            name: String(name ?? ""),
            class: String(derived.class ?? className ?? ""),
            guild: guildName ? String(guildName) : null,
            lastScan: lastScan ? lastScan : null,
            level: toFiniteNumberOrNull(level ?? derived.level),
            con: toFiniteNumberOrNull(derived.con),
            main: toFiniteNumberOrNull(derived.main),
            mine: toFiniteNumberOrNull(derived.mine),
            ratio: toFiniteNumberOrNull(derived.ratio),
            sum: toFiniteNumberOrNull(derived.sum),
            treasury: toFiniteNumberOrNull(derived.treasury),
            deltaRank: null,
            deltaSum: null,
          };
          if (!pendingDerivedByServer.has(snapshotServerKey)) {
            pendingDerivedByServer.set(snapshotServerKey, []);
          }
          pendingDerivedByServer.get(snapshotServerKey)!.push(snapshotEntry);
        }

        const dateKey = dateKeyFromSec(last.ts);
        const scopes = [
          { scopeId: "all_all_sum", group: "ALL", serverKey: "all" },
          { scopeId: `${derived.group || "ALL"}_all_sum`, group: derived.group || "ALL", serverKey: "all" },
        ];
        if (derived.serverKey && derived.serverKey !== "all") {
          scopes.push({
            scopeId: `${derived.group || "ALL"}_${derived.serverKey}_sum`,
            group: derived.group || "ALL",
            serverKey: derived.serverKey,
          });
        }

        for (const s of scopes) {
          const key = `${dateKey}__${s.scopeId}`;
          if (!indexByScope.has(key)) {
            indexByScope.set(key, { dateKey, scopeId: s.scopeId, group: s.group, serverKey: s.serverKey, ids: [], vals: [] });
          }
          const bucket = indexByScope.get(key)!;
          bucket.ids.push(pid);
          bucket.vals.push(Number(derived.sum ?? 0));
        }
        counts.writtenLatestPlayers!++;
      }

      // buckets
      const weekly = new Map<string, PlayerRowMeta[]>();
      const monthly = new Map<string, PlayerRowMeta[]>();

      for (const m of metas) {
        const w = weekIdFromSec(m.ts);
        const ym = monthIdFromSec(m.ts);
        if (!weekly.has(w)) weekly.set(w, []);
        if (!monthly.has(ym)) monthly.set(ym, []);
        weekly.get(w)!.push(m);
        monthly.get(ym)!.push(m);
      }

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
              server: lastM.parsed.server,
              name: lastM.parsed.name,
              values: aggr,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenWeeklyPlayers!++;
      }

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
              server: lastM.parsed.server,
              name: lastM.parsed.name,
              values: aggr,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenMonthlyPlayers!++;
      }
    }

    // Tages-Indizes aus dem Batch berechnen
    const indexDocs: Array<{ ref: ReturnType<typeof doc>; data: any }> = [];
    for (const { dateKey, scopeId, group, serverKey, ids, vals } of indexByScope.values()) {
      const entries = ids.map((id, i) => ({ id, val: vals[i] ?? 0 }));
      entries.sort((a, b) => b.val - a.val);
      const sortedIds = entries.map((e) => e.id);
      const sortedVals = entries.map((e) => e.val);
      const ranks = entries.map((_, i) => i + 1);

      indexDocs.push({
        ref: doc(db, `${PLAYERS_INDEX_COL}/${dateKey}__${scopeId}`),
        data: {
          n: entries.length,
          ids: sortedIds,
          vals: sortedVals,
          ranks,
          generatedAt: Date.now(),
          group,
          serverKey,
          metric: "sum",
          dateKey,
        },
      });
    }

    await writeLatestAndDerived(latestDocs, indexDocs, emitProgress);
    const pendingSnapshotKeys = Array.from(pendingDerivedByServer.keys());
    if (pendingSnapshotKeys.length) {
      console.log("[ImportCsv] Derived snapshot flush pending", {
        count: pendingSnapshotKeys.length,
        servers: pendingSnapshotKeys,
      });
    }
    const flushedDocIds: string[] = [];
    for (const [serverKey, entries] of pendingDerivedByServer.entries()) {
      try {
        await upsertPlayerDerivedServerSnapshot(serverKey, entries);
        flushedDocIds.push(toSnapshotDocId(serverKey));
      } catch (error) {
        console.warn("[ImportCsv] Derived snapshot upsert failed", { serverKey, error });
      }
    }
    if (pendingSnapshotKeys.length) {
      console.log("[ImportCsv] Derived snapshot flush done", {
        count: flushedDocIds.length,
        docs: flushedDocIds,
      });
    }
    await commitBatched(putHistory, BATCH_HISTORY, "history", emitProgress);
  }

  // ---------- GUILDS ----------
  if (opts.kind === "guilds") {
    const guildScanDocs: ScanDoc[] = [];
    const putLatest: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const putHistory: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    let sourceRows: Row[] = [];
    let sourceHeaders: string[] = [];
    if (opts.rows && Array.isArray(opts.rows)) {
      sourceRows = opts.rows;
      sourceHeaders = inferHeadersFromRows(sourceRows);
    } else if (opts.raw && typeof opts.raw === "string") {
      const parsedRaw = parseCsvCompat(opts.raw);
      sourceRows = parsedRaw.rows;
      sourceHeaders = parsedRaw.headers;
    } else {
      throw new Error("Es wurden weder 'rows' noch 'raw' übergeben.");
    }

    const {
      rows: parsedGuilds,
      stats: guildParseStats,
      headers: guildHeaders,
    } = parseGuildsFromRows(sourceRows, sourceHeaders);
    counts.skippedMissingGuildIdentifier! += guildParseStats.missingIdentifier;
    counts.skippedBadTsGuild! += guildParseStats.badTimestamp;
    counts.skippedMissingServer! += guildParseStats.missingServer;
    const ALL_HEADERS = guildHeaders.length ? guildHeaders : inferHeadersFromRows(sourceRows);

    type GuildRowMeta = { row: Row; ts: number; parsed: ParsedGuildCsvRow };
    const byGid = new Map<string, GuildRowMeta[]>();

    for (const parsed of parsedGuilds) {
      const scanKey = `${parsed.guildIdentifier}__${parsed.server}__${parsed.timestampSec}`;
      guildScanDocs.push({
        key: scanKey,
        ref: doc(db, `guilds/${parsed.guildIdentifier}/scans/${parsed.timestampSec}`),
        data: {
          guildIdentifier: parsed.guildIdentifier,
          server: parsed.server,
          timestamp: parsed.timestampSec,
          timestampRaw: pickByCanon(parsed.raw, COL.GUILDS.TIMESTAMP),
          name: parsed.name,
          values: parsed.raw,
          createdAt: serverTimestamp(),
        },
      });

      if (!byGid.has(parsed.guildIdentifier)) byGid.set(parsed.guildIdentifier, []);
      byGid.get(parsed.guildIdentifier)!.push({ row: parsed.raw, ts: parsed.timestampSec, parsed });
    }

    const scanResults = await writeScansWithResults(guildScanDocs, emitProgress, "guilds");
    guildResults.push(...scanResults);
    counts.writtenScanGuilds = scanResults.filter((r) => r.status === "created").length;

    for (const [gid, metas] of byGid) {
      metas.sort((a, b) => a.ts - b.ts);
      const last = metas[metas.length - 1];
      const parsed = last.parsed;

      const nameForSearch = parsed.name ?? "";
      const tokens = nameToTokens(nameForSearch);
      const ngrams = tokensToNgrams(tokens);

      const memberCount = parsed.memberCount ?? null;
      const hofRank = parsed.hofRank ?? null;

      // *** NEU: latest nur schreiben, wenn neuer als vorhandener latest ***
      const latestRef = doc(db, `guilds/${gid}/latest/latest`);
      const prevSec = await readPrevLatestSec(latestRef, latestCacheByPath);
      if (last.ts > prevSec) {
        putLatest.push((batch) => {
          batch.set(
            latestRef,
            {
              guildIdentifier: gid,
              server: parsed.server,
              timestamp: last.ts,
              timestampRaw: pickByCanon(last.row, COL.GUILDS.TIMESTAMP),
              name: parsed.name,
              values: last.row,
              updatedAt: serverTimestamp(),

              // Suchfelder
              nameFold: toFold(nameForSearch),
              nameTokens: tokens,
              nameNgrams: ngrams,

              // Dropdown-Felder
              memberCount,
              hofRank,
            },
            { merge: true }
          );
        });
        counts.writtenLatestGuilds!++;
      }

      // buckets
      const weekly = new Map<string, GuildRowMeta[]>();
      const monthly = new Map<string, GuildRowMeta[]>();
      for (const m of metas) {
        const w = weekIdFromSec(m.ts);
        const ym = monthIdFromSec(m.ts);
        if (!weekly.has(w)) weekly.set(w, []);
        if (!monthly.has(ym)) monthly.set(ym, []);
        weekly.get(w)!.push(m);
        monthly.get(ym)!.push(m);
      }

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
              server: lastM.parsed.server,
              name: lastM.parsed.name,
              values: aggr,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenWeeklyGuilds!++;
      }

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
              server: lastM.parsed.server,
              name: lastM.parsed.name,
              values: aggr,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        });
        counts.writtenMonthlyGuilds!++;
      }
    }

    try {
      await commitBatched(putLatest, BATCH_LATEST, "latest", emitProgress);
    } catch (error) {
      if (isPermissionDuplicateError(error)) {
        console.warn("[ImportCsv] guild latest write skipped (duplicate/permission)", { error });
      } else {
        throw error;
      }
    }
    try {
      await commitBatched(putHistory, BATCH_HISTORY, "history", emitProgress);
    } catch (error) {
      if (isPermissionDuplicateError(error)) {
        console.warn("[ImportCsv] guild history write skipped (duplicate/permission)", { error });
      } else {
        throw error;
      }
    }
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    detectedType: opts.kind,
    counts,
    errors,
    warnings,
    durationMs: t1 - t0,
    playerResults,
    guildResults,
  };
}
