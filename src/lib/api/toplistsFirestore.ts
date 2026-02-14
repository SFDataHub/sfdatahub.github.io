// src/lib/api/toplistsFirestore.ts
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  beginReadScope,
  endReadScope,
  reportReadSummary,
  reportWriteSummary,
  startReadTraceSession,
  traceGetDoc,
} from "../debug/firestoreReadTrace";

const STATS_PUBLIC_ROOT = "stats_public";
const PLAYERS_COLLECTION = "toplists_players_v1";
const SNAPSHOT_CACHE_VERSION = "v1";
const SNAPSHOT_CACHE_PREFIX = `snapshot:${SNAPSHOT_CACHE_VERSION}`;

const bundleWarnedOnce = new Set<string>();

const warnBundleOnce = (key: string, message: string, meta?: Record<string, unknown>) => {
  if (bundleWarnedOnce.has(key)) return;
  bundleWarnedOnce.add(key);
  if (meta) {
    console.warn(message, meta);
  } else {
    console.warn(message);
  }
};

const errorBundleOnce = (key: string, message: string, meta?: Record<string, unknown>) => {
  if (bundleWarnedOnce.has(key)) return;
  bundleWarnedOnce.add(key);
  if (meta) {
    console.error(message, meta);
  } else {
    console.error(message);
  }
};

export type PlayerToplistKey = {
  group: string;
  timeRange: string;
  sort: string;
};

export type ToplistsMetaThresholds = {
  players?: {
    minChanges?: number;
    maxAgeDays?: number;
  };
  // guild thresholds can be added later
};

export type ScopeChangeEntry = {
  lastRebuildAtMs?: number;
  lastChangeAtMs?: number;
  changedSinceLastRebuild?: number;
};

export type ToplistsMeta = {
  thresholds?: ToplistsMetaThresholds;
  scopeChange?: Record<string, ScopeChangeEntry>;
  lastComputedAt?: number;
  nextUpdateAt?: number;
};

export type ToplistServersResult =
  | { ok: true; servers: string[] }
  | { ok: false; error: "not_found" | "decode_error" | "decode_failed" | "firestore_error"; detail?: string };

export async function loadToplistServersFromBundle(): Promise<ToplistServersResult> {
  try {
    const snap = await getDoc(doc(db, STATS_PUBLIC_ROOT, "toplists_bundle_v1"));
    if (!snap.exists()) {
      return { ok: false, error: "not_found" };
    }

    const data: any = snap.data() || {};
    const rawServers: unknown = data.servers;

    const parseServerStringFallback = (rawText: string) =>
      rawText
        .split(/[\n,;]+/g)
        .map((entry) => entry.replace(/^[\s\["']+|[\s\]"']+$/g, "").trim())
        .filter((entry) => !!entry);

    let parsedServers: unknown = null;
    let failureReason: string | null = null;
    let failureMeta: Record<string, unknown> | undefined;
    if (Array.isArray(rawServers)) {
      parsedServers = rawServers;
    } else if (typeof rawServers === "string") {
      const rawText = rawServers.trim();
      if (!rawText) {
        failureReason = "servers string empty";
      } else if (!rawText.startsWith("[")) {
        const fallback = parseServerStringFallback(rawText);
        if (fallback.length) {
          parsedServers = fallback;
        } else {
          failureReason = "servers string is not a JSON array";
          failureMeta = { preview: rawText.slice(0, 120) };
        }
      } else {
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed)) {
            parsedServers = parsed;
          } else {
            failureReason = "servers JSON parsed but not an array";
          }
        } catch (err: any) {
          const fallback = parseServerStringFallback(rawText);
          if (fallback.length) {
            parsedServers = fallback;
          } else {
            failureReason = "servers JSON parse failed";
            failureMeta = { message: err?.message };
          }
        }
      }
    } else if (rawServers == null) {
      failureReason = "servers field missing";
    } else {
      failureReason = `servers has unexpected type: ${typeof rawServers}`;
    }

    if (!Array.isArray(parsedServers)) {
      warnBundleOnce(
        "bundle_invalid",
        "[toplistsFirestore] Server bundle missing/invalid, falling back to static config",
        failureMeta ? { reason: failureReason ?? "unknown", ...failureMeta } : { reason: failureReason ?? "unknown" }
      );
      return {
        ok: false,
        error: "decode_failed",
        detail: failureReason ?? "servers missing or invalid",
      };
    }

    const servers: string[] = [];
    for (const entry of parsedServers) {
      if (typeof entry !== "string") {
        console.warn("[toplistsFirestore] Skipping non-string server entry", { entry });
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed) {
        servers.push(trimmed);
      }
    }

    return { ok: true, servers };
  } catch (err: any) {
    errorBundleOnce(
      "bundle_firestore_error",
      "[toplistsFirestore] Firestore error while loading toplist servers",
      { code: err?.code, message: err?.message }
    );
    return { ok: false, error: "firestore_error", detail: err?.message };
  }
}

export function buildPlayerListId(key: PlayerToplistKey): string {
  const norm = (v: string) => (v ?? "").toString().trim().toLowerCase();
  const group = norm(key.group) || "all";
  const timeRange = norm(key.timeRange) || "all";
  const sort = norm(key.sort) || "sum";
  return `${group}__${timeRange}__${sort}`;
}

export function buildPlayerScopeId(group: string, serverKey: string): string {
  const g = (group || "ALL").toUpperCase();
  const s = serverKey ? serverKey.toUpperCase() : "ALL";
  if (s === "ALL") return `${g}_all_sum`;
  return `${g}_${s}_sum`;
}

export async function loadToplistsMeta(): Promise<ToplistsMeta | null> {
  try {
    const snap = await getDoc(doc(db, STATS_PUBLIC_ROOT, "toplists_meta_v1"));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data || typeof data !== "object") return null;
    return data as ToplistsMeta;
  } catch (err) {
    console.error("[toplistsFirestore] meta decode failed", err);
    return null;
  }
}

// Row-Daten einer Spieler-Topliste - Keys 1:1 wie columnKeysPlayers
export type FirestoreToplistPlayerRow = {
  playerId?: string | null;
  flag: string | null;
  deltaRank: number | null;
  server: string;
  name: string;
  class: string;
  level: number | null;
  guild: string | null;
  main: number | null;
  con: number | null;
  sum: number | null;
  ratio: string | null;
  mainTotal: number | null;
  conTotal: number | null;
  sumTotal: number | null;
  xpProgress: number | null;
  xpTotal: number | null;
  mine: number | null;
  treasury: number | null;
  lastScan: string | null;
  deltaSum: number | null;
};

export type FirestoreToplistPlayerList = {
  id: string;
  entity: "players";
  group: string;
  server: string;
  metric: string;
  timeRange: string;
  limit: number;
  updatedAt: number | null;
  nextUpdateAt?: number | null;
  ttlSec?: number | null;
  rows: FirestoreToplistPlayerRow[];
};

export type FirestoreLatestToplistSnapshot = {
  server: string;
  updatedAt: number | null;
  players: FirestoreToplistPlayerRow[];
};

export type FirestoreToplistGuildRow = {
  guildId: string;
  server: string;
  name: string;
  memberCount: number | null;
  hofRank: number | null;
  lastScan: string | null;
  sumAvg: number | null;
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

export type FirestoreLatestGuildToplistSnapshot = {
  server: string;
  updatedAt: number | null;
  guilds: FirestoreToplistGuildRow[];
};

export type FirestoreToplistPlayerResult =
  | { ok: true; list: FirestoreToplistPlayerList }
  | { ok: false; error: "not_found" | "decode_error" | "firestore_error"; detail?: string };

export type FirestoreLatestToplistResult =
  | { ok: true; snapshot: FirestoreLatestToplistSnapshot }
  | { ok: false; error: "not_found" | "decode_error" | "firestore_error"; detail?: string };

export type FirestoreLatestGuildToplistResult =
  | { ok: true; snapshot: FirestoreLatestGuildToplistSnapshot }
  | { ok: false; error: "not_found" | "decode_error" | "firestore_error"; detail?: string };

const toNumber = (value: any): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (value && typeof value.toMillis === "function") {
    const n = value.toMillis();
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toStringOrNull = (value: any): string | null => (typeof value === "string" ? value : null);
const toIdStringOrNull = (value: any): string | null => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const mapRow = (raw: any): FirestoreToplistPlayerRow | null => {
  if (!raw || typeof raw !== "object") return null;

  const server = toStringOrNull(raw.server);
  const name = toStringOrNull(raw.name);
  const cls = toStringOrNull(raw.class);

  if (!server || !name || !cls) return null;

  return {
    playerId: toIdStringOrNull(raw.playerId ?? raw.id ?? raw.player_id),
    flag: toStringOrNull(raw.flag),
    deltaRank: toNumber(raw.deltaRank),
    server,
    name,
    class: cls,
    level: toNumber(raw.level),
    guild: toStringOrNull(raw.guild),
    main: toNumber(raw.main),
    con: toNumber(raw.con),
    sum: toNumber(raw.sum),
    ratio: toStringOrNull(raw.ratio),
    mainTotal: toNumber(raw.mainTotal),
    conTotal: toNumber(raw.conTotal),
    sumTotal: toNumber(raw.sumTotal),
    xpProgress: toNumber(raw.xpProgress),
    xpTotal: toNumber(raw.xpTotal),
    mine: toNumber(raw.mine),
    treasury: toNumber(raw.treasury),
    lastScan: toStringOrNull(raw.lastScan),
    deltaSum: toNumber(raw.deltaSum),
  };
};

const mapGuildRow = (raw: any): FirestoreToplistGuildRow | null => {
  if (!raw || typeof raw !== "object") return null;

  const server = toStringOrNull(raw.server);
  const name = toStringOrNull(raw.name) ?? toStringOrNull(raw.guildId);
  const guildId = toStringOrNull(raw.guildId) ?? name;

  if (!server || !name || !guildId) return null;

  const sumAvg = toNumber(raw.sumAvg ?? raw.avgSumBaseTotal ?? raw.sum);

  return {
    guildId,
    server,
    name,
    memberCount: toNumber(raw.memberCount),
    hofRank: toNumber(raw.hofRank),
    lastScan: toStringOrNull(raw.lastScan),
    sumAvg,
    avgLevel: toNumber(raw.avgLevel),
    avgTreasury: toNumber(raw.avgTreasury),
    avgMine: toNumber(raw.avgMine),
    avgBaseMain: toNumber(raw.avgBaseMain),
    avgConBase: toNumber(raw.avgConBase),
    avgSumBaseTotal: toNumber(raw.avgSumBaseTotal),
    avgAttrTotal: toNumber(raw.avgAttrTotal),
    avgConTotal: toNumber(raw.avgConTotal),
    avgTotalStats: toNumber(raw.avgTotalStats),
  };
};

export async function getLatestPlayerToplistSnapshot(serverCode: string): Promise<FirestoreLatestToplistResult> {
  const code = (serverCode || "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing server code" };
  }

  const sessionName = `ToplistsPlayers:${code}`;
  startReadTraceSession(sessionName);
  const scope = beginReadScope(sessionName);

  try {
    const ref = doc(
      db,
      STATS_PUBLIC_ROOT,
      PLAYERS_COLLECTION,
      "lists",
      "latest_toplists",
      "servers",
      code
    );
    const snap = await traceGetDoc(scope, ref, () => getDoc(ref), { label: "ToplistsPlayers" });
    if (!snap.exists()) {
      return { ok: false, error: "not_found" };
    }

    const data: any = snap.data() || {};
    const rawPlayers = Array.isArray(data.players) ? data.players : null;
    if (!rawPlayers) {
      return { ok: false, error: "decode_error", detail: "missing players array" };
    }

    const players: FirestoreToplistPlayerRow[] = [];
    for (const row of rawPlayers) {
      const mapped = mapRow(row);
      if (!mapped) {
        console.error("[toplistsFirestore] Latest snapshot row decode failed", row);
        return { ok: false, error: "decode_error", detail: "invalid player row" };
      }
      players.push(mapped);
    }

    return {
      ok: true,
      snapshot: {
        server: toStringOrNull(data.server) ?? code,
        updatedAt: toNumber(data.updatedAt),
        players,
      },
    };
  } catch (err: any) {
    console.error("[toplistsFirestore] Firestore error", err);
    return { ok: false, error: "firestore_error", detail: err?.message };
  } finally {
    endReadScope(scope);
    reportReadSummary(sessionName);
    reportWriteSummary(sessionName);
  }
}

async function getPlayerToplistSnapshotByDocId(docId: string): Promise<FirestoreLatestToplistResult> {
  const code = (docId || "").trim();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing doc id" };
  }

  const sessionName = `ToplistsPlayersCompare:${code}`;
  startReadTraceSession(sessionName);
  const scope = beginReadScope(sessionName);

  try {
    const ref = doc(
      db,
      STATS_PUBLIC_ROOT,
      PLAYERS_COLLECTION,
      "lists",
      "latest_toplists",
      "servers",
      code
    );
    const snap = await traceGetDoc(scope, ref, () => getDoc(ref), { label: `ToplistsPlayersCompare:${code}` });
    if (!snap.exists()) {
      return { ok: false, error: "not_found" };
    }

    const data: any = snap.data() || {};
    const rawPlayers = Array.isArray(data.players) ? data.players : null;
    if (!rawPlayers) {
      return { ok: false, error: "decode_error", detail: "missing players array" };
    }

    const players: FirestoreToplistPlayerRow[] = [];
    for (const row of rawPlayers) {
      const mapped = mapRow(row);
      if (!mapped) {
        console.error("[toplistsFirestore] Snapshot row decode failed", row);
        return { ok: false, error: "decode_error", detail: "invalid player row" };
      }
      players.push(mapped);
    }

    return {
      ok: true,
      snapshot: {
        server: toStringOrNull(data.server) ?? code,
        updatedAt: toNumber(data.updatedAt),
        players,
      },
    };
  } catch (err: any) {
    console.error("[toplistsFirestore] Firestore error", err);
    return { ok: false, error: "firestore_error", detail: err?.message };
  } finally {
    endReadScope(scope);
    reportReadSummary(sessionName);
    reportWriteSummary(sessionName);
  }
}

type SnapshotCacheEntry<T> = {
  snapshot: T;
  fetchedAt: number;
  expiresAt: number;
};

const getSnapshotCacheKey = (type: "players" | "guilds", serverCode: string) =>
  `${SNAPSHOT_CACHE_PREFIX}:${type}:${serverCode}`;

const getCompareSnapshotCacheKey = (docId: string) => `toplists:compare:${docId}`;
const compareInFlight = new Map<string, Promise<FirestoreLatestToplistResult>>();

const nextFullHour = (nowMs: number) => {
  const d = new Date(nowMs);
  d.setMinutes(0, 0, 0);
  if (d.getTime() <= nowMs) {
    d.setHours(d.getHours() + 1);
  }
  return d.getTime();
};

const readSnapshotCache = <T,>(key: string): SnapshotCacheEntry<T> | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.expiresAt !== "number") return null;
    if (!("snapshot" in parsed)) return null;
    return parsed as SnapshotCacheEntry<T>;
  } catch {
    return null;
  }
};

const ratioLooksValid = (value: unknown) =>
  value == null || (typeof value === "string" && value.includes("/"));

const snapshotHasInvalidRatio = (snapshot: FirestoreLatestToplistSnapshot | null | undefined) => {
  const rows = snapshot?.players;
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => row && !ratioLooksValid((row as any).ratio));
};

const writeSnapshotCache = <T,>(key: string, entry: SnapshotCacheEntry<T>) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // ignore cache write errors (quota, privacy mode, etc.)
  }
};

const clearSnapshotCache = (key: string) => {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

export async function getLatestPlayerToplistSnapshotCached(
  serverCode: string
): Promise<FirestoreLatestToplistResult> {
  const code = (serverCode || "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing server code" };
  }

  const key = getSnapshotCacheKey("players", code);
  const now = Date.now();
  const cached = readSnapshotCache<FirestoreLatestToplistSnapshot>(key);
  if (cached) {
    if (now < cached.expiresAt && !snapshotHasInvalidRatio(cached.snapshot)) {
      return { ok: true, snapshot: cached.snapshot };
    }
    clearSnapshotCache(key);
  }

  const result = await getLatestPlayerToplistSnapshot(code);
  if (result.ok) {
    writeSnapshotCache(key, {
      snapshot: result.snapshot,
      fetchedAt: now,
      expiresAt: nextFullHour(now),
    });
  }
  return result;
}

export async function getPlayerToplistSnapshotByDocIdCached(
  docId: string,
  ttlMs?: number
): Promise<FirestoreLatestToplistResult> {
  const code = (docId || "").trim();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing doc id" };
  }

  const key = getCompareSnapshotCacheKey(code);
  const now = Date.now();
  const cached = readSnapshotCache<FirestoreLatestToplistSnapshot>(key);
  if (cached) {
    if (now < cached.expiresAt && !snapshotHasInvalidRatio(cached.snapshot)) {
      return { ok: true, snapshot: cached.snapshot };
    }
    clearSnapshotCache(key);
  }

  const existing = compareInFlight.get(code);
  if (existing) return existing;

  const promise = (async () => {
    const result = await getPlayerToplistSnapshotByDocId(code);
    if (result.ok) {
      const expiresAt = typeof ttlMs === "number" && ttlMs > 0 ? now + ttlMs : nextFullHour(now);
      writeSnapshotCache(key, {
        snapshot: result.snapshot,
        fetchedAt: now,
        expiresAt,
      });
    }
    return result;
  })();

  compareInFlight.set(code, promise);
  try {
    return await promise;
  } finally {
    compareInFlight.delete(code);
  }
}

export async function getLatestGuildToplistSnapshot(
  serverCode: string
): Promise<FirestoreLatestGuildToplistResult> {
  const code = (serverCode || "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing server code" };
  }

  const sessionName = `ToplistsGuilds:${code}`;
  startReadTraceSession(sessionName);
  const scope = beginReadScope(sessionName);

  try {
    const ref = doc(
      db,
      STATS_PUBLIC_ROOT,
      "toplists_guilds_v1",
      "lists",
      "latest_toplists",
      "servers",
      code
    );
    const snap = await traceGetDoc(scope, ref, () => getDoc(ref), { label: "ToplistsGuilds" });
    if (!snap.exists()) {
      return { ok: false, error: "not_found" };
    }

    const data: any = snap.data() || {};
    const rawGuilds = Array.isArray(data.guilds) ? data.guilds : null;
    if (!rawGuilds) {
      return { ok: false, error: "decode_error", detail: "missing guilds array" };
    }

    const guilds: FirestoreToplistGuildRow[] = [];
    for (const row of rawGuilds) {
      const mapped = mapGuildRow(row);
      if (!mapped) {
        console.error("[toplistsFirestore] Latest guild snapshot row decode failed", row);
        return { ok: false, error: "decode_error", detail: "invalid guild row" };
      }
      guilds.push(mapped);
    }

    return {
      ok: true,
      snapshot: {
        server: toStringOrNull(data.server) ?? code,
        updatedAt: toNumber(data.updatedAt),
        guilds,
      },
    };
  } catch (err: any) {
    console.error("[toplistsFirestore] Firestore error", err);
    return { ok: false, error: "firestore_error", detail: err?.message };
  } finally {
    endReadScope(scope);
    reportReadSummary(sessionName);
    reportWriteSummary(sessionName);
  }
}

export async function getLatestGuildToplistSnapshotCached(
  serverCode: string
): Promise<FirestoreLatestGuildToplistResult> {
  const code = (serverCode || "").trim().toUpperCase();
  if (!code) {
    return { ok: false, error: "decode_error", detail: "missing server code" };
  }

  const key = getSnapshotCacheKey("guilds", code);
  const now = Date.now();
  const cached = readSnapshotCache<FirestoreLatestGuildToplistSnapshot>(key);
  if (cached) {
    if (now < cached.expiresAt) {
      return { ok: true, snapshot: cached.snapshot };
    }
    clearSnapshotCache(key);
  }

  const result = await getLatestGuildToplistSnapshot(code);
  if (result.ok) {
    writeSnapshotCache(key, {
      snapshot: result.snapshot,
      fetchedAt: now,
      expiresAt: nextFullHour(now),
    });
  }
  return result;
}
