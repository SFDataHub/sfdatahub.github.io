// CSV parsing helpers. Firestore CSV ingestion has been removed.

/** ---- utilities ---- */
type Row = Record<string, any>;

export type ParsedPlayerCsvRow = {
  playerId: string;
  identifier: string;
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

const CANON = (s: string) =>
  String(s ?? "")
    .trim()
    .replace(/:+$/, "")
    .toLowerCase()
    .replace(/[\s_\u00a0]+/g, "");

// Zahl locker parsen
const toNumberLoose = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseMemberCountValue = (value: any): number | null => {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[\s,\.]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const MEMBER_COUNT_MIN = 1;

const MEMBER_COUNT_MAX = 200;

const validateMemberCountValue = (value: number | null): "ok" | "non_numeric" | "out_of_range" => {
  if (value == null) return "non_numeric";
  if (value < MEMBER_COUNT_MIN || value > MEMBER_COUNT_MAX) return "out_of_range";
  return "ok";
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
  if (canon === CANON("plague-doctor") || canon === CANON("Pestdoktor")) return 12;
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
  2: "Scout",
  3: "Mage",
  4: "Assassin",
  5: "Battle Mage",
  6: "Berserker",
  7: "Demon Hunter",
  8: "Druid",
  9: "Bard",
  10: "Necromancer",
  11: "Paladin",
  12: "Plague Doctor",
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

const normalizeHeaderLabel = (value: any) => {
  const raw = String(value ?? "").replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  const trimmed = raw.replace(/:+$/, "").toLowerCase();
  const underscored = trimmed.replace(/[\s-]+/g, "_");
  return underscored.replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
};

const buildHeaderIndex = (headers: string[]) => {
  const map = new Map<string, string[]>();
  headers.forEach((header) => {
    const key = normalizeHeaderLabel(header);
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(header);
    map.set(key, list);
  });
  return map;
};

const MEMBER_COUNT_ALIASES = [
  "guild_member_count",
  "guild_membercount",
  "guildmembercount",
  "member_count",
  "membercount",
  "guild_members",
];

const resolveMemberCountHeaderCandidates = (headers: string[]) => {
  const map = buildHeaderIndex(headers);
  const candidates: string[] = [];
  for (const alias of MEMBER_COUNT_ALIASES) {
    const matches = map.get(alias);
    if (!matches) continue;
    for (const header of matches) if (!candidates.includes(header)) candidates.push(header);
  }
  return candidates;
};

const resolveMemberCountHeader = (headers: string[], candidates?: string[]) => {
  const list = candidates ?? resolveMemberCountHeaderCandidates(headers);
  if (!list.length) return null;
  const canonical = normalizeHeaderLabel("Guild Member Count");
  const exact = list.find((header) => normalizeHeaderLabel(header) === canonical);
  if (exact) return exact;
  if (list.length === 1) return list[0];
  return list[0];
};

const pickByCanon = (row: Row, canonKey: string): any => {
  for (const k of Object.keys(row)) if (CANON(k) === canonKey) return row[k];
  return undefined;
};

const SERVER_CODE_PATTERN = /^[a-z]{1,4}\d+$/i;

const SERVER_CODE_SUFFIX_PATTERN = /^([a-z]{1,4}\d+)[_.-]?(net|eu)$/i;

const SERVER_HOST_PATTERN = /^([a-z]{1,4}\d+)\.sfgame\.(net|eu)$/i;

const normalizeServerCodeAlias = (value: string): string => {
  const cleaned = String(value ?? "").trim().toUpperCase();
  if (!cleaned) return cleaned;
  const match = cleaned.match(/^S(\d+)$/);
  if (match) return `EU${match[1]}`;
  return cleaned;
};

const normalizeServerCodeFromKey = (value: string): string | null => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (SERVER_CODE_PATTERN.test(lowered)) return normalizeServerCodeAlias(lowered);
  const suffixMatch = lowered.match(SERVER_CODE_SUFFIX_PATTERN);
  if (suffixMatch) return normalizeServerCodeAlias(suffixMatch[1]);
  const hostMatch = lowered.match(SERVER_HOST_PATTERN);
  if (hostMatch) return normalizeServerCodeAlias(hostMatch[1]);
  return trimmed;
};

export const parseServerKeyFromIdentifier = (identifier: any): string | null => {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(.+)_p(\d+)$/);
  if (!match) return null;
  const serverKey = match[1]?.trim();
  if (!serverKey) return null;
  return normalizeServerCodeFromKey(serverKey);
};

const parsePlayerIdFromIdentifier = (identifier: any): string | null => {
  const raw = String(identifier ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(.+)_p(\d+)$/);
  if (!match) return null;
  return match[2] ?? null;
};

type MemberCountResolutionSource = "primary" | "alias" | "lookup" | "none";

type MemberCountResolution = {
  header: string | null;
  headerIndex: number;
  rawValue: any;
  parsedValue: number | null;
  validationResult: "ok" | "non_numeric" | "out_of_range";
  isValid: boolean;
  fallbackUsed: boolean;
  source: MemberCountResolutionSource;
};

const resolveMemberCountForRow = (
  row: Row,
  lookup: HeaderLookup,
  headers: string[],
  primaryHeader: string | null,
  candidateHeaders: string[],
): MemberCountResolution => {
  const buildResolution = (
    header: string | null,
    rawValue: any,
    source: MemberCountResolutionSource,
    fallbackUsed: boolean,
  ): MemberCountResolution => {
    const parsedValue = parseMemberCountValue(rawValue);
    const validationResult = validateMemberCountValue(parsedValue);
    return {
      header,
      headerIndex: header ? headers.indexOf(header) : -1,
      rawValue,
      parsedValue,
      validationResult,
      isValid: validationResult === "ok",
      fallbackUsed,
      source,
    };
  };

  if (primaryHeader) {
    const primary = buildResolution(primaryHeader, row[primaryHeader], "primary", false);
    if (primary.isValid) return primary;
  }

  for (const header of candidateHeaders) {
    if (header === primaryHeader) continue;
    const candidate = buildResolution(header, row[header], "alias", true);
    if (candidate.isValid) return candidate;
  }

  const lookupHeader = lookup.get(COL.GUILDS.MEMBER_COUNT) ?? null;
  const fallbackRaw = lookupHeader ? row[lookupHeader] : pickByCanon(row, COL.GUILDS.MEMBER_COUNT);
  const fallback = buildResolution(lookupHeader, fallbackRaw, lookupHeader ? "lookup" : "none", true);
  return fallback;
};

// WICHTIG: identisch zu deiner Implementierung
function toSecFlexible(v: any): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  if (/^\d{10}$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const MM = Number(m[2]) - 1;
    const yyyy = Number(m[3]);
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

type CsvParseMeta = {
  headerCount: number;
  rowTokenCounts: number[];
  paddedRowCount: number;
  truncatedRowCount: number;
};

const GUILD_CSV_DEBUG_KEY = "sf_debug_guild_csv_parse";

const isGuildCsvParseDebugEnabled = () => {
  if (typeof window === "undefined" || !window?.localStorage) return false;
  return window.localStorage.getItem(GUILD_CSV_DEBUG_KEY) === "1";
};

const truncateDebugValue = (value: string, max = 260) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
};

const buildDelimiterStats = (line: string) => {
  const stats: Record<string, number> = {};
  const delims = [",", ";", "\t", "|"];
  for (const delim of delims) {
    let count = 0;
    for (let i = 0; i < line.length; i++) if (line[i] === delim) count++;
    stats[delim === "\t" ? "\\t" : delim] = count;
  }
  return stats;
};

const debugGuildCsvParse = (
  text: string,
  parsed: { headers: string[]; rows: Row[]; meta?: CsvParseMeta },
  result: GuildParseResult,
) => {
  if (!isGuildCsvParseDebugEnabled()) return;
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const headerLine = normalizedText.split("\n")[0] ?? "";
  const headerLineNoBom = headerLine.replace(/^\uFEFF/, "");
  const hasBom = headerLine.startsWith("\uFEFF");
  const hasNbsp = headerLine.includes("\u00A0");
  const delimiter = detectDelimiter(headerLineNoBom);
  const delimiterCounts = buildDelimiterStats(headerLineNoBom);
  const normalizedHeaders = parsed.headers.map(normalizeHeaderLabel);
  const headerIndexMap: Record<string, number[]> = {};
  parsed.headers.forEach((header, idx) => {
    const key = normalizeHeaderLabel(header);
    if (!key) return;
    const list = headerIndexMap[key] ?? [];
    list.push(idx);
    headerIndexMap[key] = list;
  });

  const guildIdHeader = parsed.headers.find(
    (header) => normalizeHeaderLabel(header) === normalizeHeaderLabel("Guild Identifier"),
  );
  const guildIdHeaderIndex = guildIdHeader ? parsed.headers.indexOf(guildIdHeader) : -1;
  const memberCountCandidates = resolveMemberCountHeaderCandidates(parsed.headers);
  const memberCountHeader = resolveMemberCountHeader(parsed.headers, memberCountCandidates);
  const memberCountHeaderIndex = memberCountHeader ? parsed.headers.indexOf(memberCountHeader) : -1;

  const lookup = buildHeaderLookup(parsed.headers);
  const sampleRow = parsed.rows[0];
  const sampleGuildIdentifier = sampleRow ? pickWithLookup(sampleRow, lookup, COL.GUILDS.GUILD_IDENTIFIER) : null;
  const memberCountResolution = sampleRow
    ? resolveMemberCountForRow(sampleRow, lookup, parsed.headers, memberCountHeader, memberCountCandidates)
    : null;
  const sampleMemberCountRaw = memberCountResolution?.rawValue ?? null;
  const sampleMemberCount = memberCountResolution?.parsedValue ?? null;
  const headerCount = parsed.meta?.headerCount ?? parsed.headers.length;
  const sampleRowTokenCount = parsed.meta?.rowTokenCounts?.[0] ?? null;
  const sampleRowPadded =
    sampleRowTokenCount != null && headerCount > 0 ? sampleRowTokenCount < headerCount : null;
  const paddedRowCount = parsed.meta?.paddedRowCount ?? 0;
  const truncatedRowCount = parsed.meta?.truncatedRowCount ?? 0;

  const reasons: string[] = [];
  if (!headerLine) reasons.push("missing header line");
  if (!parsed.headers.length) reasons.push("no headers parsed");
  if (parsed.rows.length === 0) reasons.push("no data rows after parse");
  if (!guildIdHeader) reasons.push("missing guild identifier header");
  if (!memberCountHeader) reasons.push("missing guild member count header");
  if (parsed.rows.length > 0 && result.rows.length === 0) {
    reasons.push(
      `all rows filtered (missingIdentifier=${result.stats.missingIdentifier}, badTimestamp=${result.stats.badTimestamp}, missingServer=${result.stats.missingServer})`,
    );
  }
  if (!reasons.length && result.rows.length === 0) reasons.push("no parsed guild rows");

  // eslint-disable-next-line no-console
  console.groupCollapsed("[GuildCsvParse] Debug");
  // eslint-disable-next-line no-console
  console.log("headerLine", {
    length: headerLine.length,
    hasBom,
    hasNbsp,
    delimiter,
    delimiterCounts,
    sample: truncateDebugValue(headerLine),
  });
  // eslint-disable-next-line no-console
  console.log("headers", {
    raw: parsed.headers,
    normalized: normalizedHeaders,
    headerIndexMap,
  });
  // eslint-disable-next-line no-console
  console.log("requiredHeaders", {
    guildIdentifier: guildIdHeader,
    guildIdentifierIndex: guildIdHeaderIndex,
    memberCount: memberCountHeader,
    memberCountIndex: memberCountHeaderIndex,
    memberCountCandidates,
  });
  // eslint-disable-next-line no-console
  console.log("rowAlignment", {
    headerCount,
    sampleRowTokenCount,
    sampleRowPadded,
    paddedRowCount,
    truncatedRowCount,
  });
  // eslint-disable-next-line no-console
  console.log("rows", {
    parsedRows: parsed.rows.length,
    guildRows: result.rows.length,
    stats: result.stats,
  });
  // eslint-disable-next-line no-console
  console.log("sample", {
    guildIdentifier: sampleGuildIdentifier == null ? null : truncateDebugValue(String(sampleGuildIdentifier)),
    memberCountRaw: sampleMemberCountRaw == null ? null : truncateDebugValue(String(sampleMemberCountRaw)),
    memberCount: sampleMemberCount,
  });
  if (memberCountResolution) {
    // eslint-disable-next-line no-console
    console.log("memberCountResolution", {
      primaryHeader: memberCountHeader,
      primaryIndex: memberCountHeaderIndex,
      resolvedHeader: memberCountResolution.header,
      resolvedIndex: memberCountResolution.headerIndex,
      rawValueAtIndex:
        memberCountResolution.rawValue == null ? null : truncateDebugValue(String(memberCountResolution.rawValue)),
      parsedMemberCount: memberCountResolution.parsedValue,
      validationResult: memberCountResolution.validationResult,
      fallbackUsed: memberCountResolution.fallbackUsed,
      source: memberCountResolution.source,
    });
  }
  if (reasons.length) {
    // eslint-disable-next-line no-console
    console.warn("[GuildCsvParse] Issues", reasons);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
};

function parseCsvCompat(text: string): { headers: string[]; rows: Row[]; meta: CsvParseMeta } {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!t) {
    return { headers: [], rows: [], meta: { headerCount: 0, rowTokenCounts: [], paddedRowCount: 0, truncatedRowCount: 0 } };
  }

  const firstNl = t.indexOf("\n");
  const headerLine = firstNl >= 0 ? t.slice(0, firstNl) : t;
  const delim = detectDelimiter(headerLine);
  const parseSingleLine = (line: string) => {
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

  const headerCells = parseSingleLine(headerLine).map(norm);
  const seenHeaders = new Map<string, number>();
  const headers = headerCells.map((h, i) => {
    const base = h ? h : `col${i}`;
    const count = (seenHeaders.get(base) ?? 0) + 1;
    seenHeaders.set(base, count);
    return count === 1 ? base : `${base}__dup${count}`;
  });
  const headerCount = headers.length;

  const rows: Row[] = [];
  const rowTokenCounts: number[] = [];
  let paddedRowCount = 0;
  let truncatedRowCount = 0;

  const body = firstNl >= 0 ? t.slice(firstNl + 1) : "";
  if (!body) {
    return { headers, rows, meta: { headerCount, rowTokenCounts, paddedRowCount, truncatedRowCount } };
  }

  let currentCells: string[] = [];
  let cur = "";
  let q = false;

  const pushRow = () => {
    if (currentCells.length === 0 && norm(cur) === "") {
      cur = "";
      return;
    }
    currentCells.push(cur);
    cur = "";
    if (currentCells.every((c) => norm(c) === "")) {
      currentCells = [];
      return;
    }

    const tokenCount = currentCells.length;
    if (tokenCount < headerCount) {
      currentCells.push(...Array(headerCount - tokenCount).fill(""));
      paddedRowCount++;
    } else if (tokenCount > headerCount) {
      truncatedRowCount++;
    }
    rowTokenCounts.push(tokenCount);

    const row: Row = {};
    for (let ci = 0; ci < headerCount; ci++) row[headers[ci]] = currentCells[ci] != null ? norm(currentCells[ci]) : "";
    rows.push(row);
    currentCells = [];
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      if (!q) {
        q = true;
        continue;
      }
      const next = body[i + 1];
      if (next === '"') {
        const afterNext = body[i + 2];
        if (afterNext === delim || afterNext === "\n" || afterNext == null) {
          cur += '"';
          q = false;
          i++;
          continue;
        }
        cur += '"';
        i++;
        continue;
      }
      if (next == null) {
        q = false;
        continue;
      }
      if (next === delim) {
        q = false;
        continue;
      }
      if (next === "\n") {
        if (currentCells.length >= Math.max(0, headerCount - 1)) {
          q = false;
          continue;
        }
        cur += '"';
        continue;
      }
      cur += '"';
      continue;
    }
    if (ch === delim && !q) {
      currentCells.push(cur);
      cur = "";
      continue;
    }
    if (ch === "\n" && !q) {
      pushRow();
      continue;
    }
    cur += ch;
  }
  pushRow();

  return { headers, rows, meta: { headerCount, rowTokenCounts, paddedRowCount, truncatedRowCount } };
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
    const identifierRaw = pickWithLookup(row, lookup, COL.PLAYERS.IDENTIFIER);
    const identifier = norm(identifierRaw);
    if (!identifier) {
      stats.missingIdentifier++;
      continue;
    }

    const pidRaw = pickWithLookup(row, lookup, COL.PLAYERS.PID);
    const playerId = norm(pidRaw || parsePlayerIdFromIdentifier(identifier));
    if (!playerId) {
      stats.missingIdentifier++;
      continue;
    }

    const tsSec = toSecFlexible(pickWithLookup(row, lookup, COL.PLAYERS.TIMESTAMP));
    if (tsSec == null) {
      stats.badTimestamp++;
      continue;
    }

    const serverFromIdentifier = parseServerKeyFromIdentifier(identifier);
    const serverRaw = pickWithLookup(row, lookup, COL.PLAYERS.SERVER);
    const serverFallback = serverRaw && norm(serverRaw) !== "" ? up(serverRaw) : undefined;
    const server = serverFromIdentifier ?? serverFallback;
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
      identifier,
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
  const memberCountCandidates = resolveMemberCountHeaderCandidates(headersResolved);
  const memberCountHeader = resolveMemberCountHeader(headersResolved, memberCountCandidates);
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

    const memberCountResolution = resolveMemberCountForRow(
      row,
      lookup,
      headersResolved,
      memberCountHeader,
      memberCountCandidates,
    );
    const memberCount = memberCountResolution.isValid ? memberCountResolution.parsedValue : null;
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
  const result = parseGuildsFromRows(parsed.rows, parsed.headers);
  debugGuildCsvParse(text, parsed, result);
  return result.rows;
}
