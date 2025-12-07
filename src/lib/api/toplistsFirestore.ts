// src/lib/api/toplistsFirestore.ts
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

const STATS_PUBLIC_ROOT = "stats_public";
const PLAYERS_COLLECTION = "toplists_players_v1";

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

    let parsedServers: unknown = null;
    if (Array.isArray(rawServers)) {
      parsedServers = rawServers;
    } else if (typeof rawServers === "string") {
      try {
        const parsed = JSON.parse(rawServers);
        if (Array.isArray(parsed)) {
          parsedServers = parsed;
        } else {
          console.warn("[toplistsFirestore] Server bundle string is not an array after parse");
        }
      } catch (err) {
        console.warn("[toplistsFirestore] Failed to parse server bundle string", err);
      }
    }

    if (!Array.isArray(parsedServers)) {
      console.warn("[toplistsFirestore] Server bundle missing/invalid, falling back to static config");
      return { ok: false, error: "decode_failed", detail: "servers missing or invalid" };
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
    console.error("[toplistsFirestore] Firestore error while loading toplist servers", err);
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
  ratio: number | null;
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

export type FirestoreToplistPlayerResult =
  | { ok: true; list: FirestoreToplistPlayerList }
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

const mapRow = (raw: any): FirestoreToplistPlayerRow | null => {
  if (!raw || typeof raw !== "object") return null;

  const server = toStringOrNull(raw.server);
  const name = toStringOrNull(raw.name);
  const cls = toStringOrNull(raw.class);

  if (!server || !name || !cls) return null;

  return {
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
    ratio: toNumber(raw.ratio),
    mine: toNumber(raw.mine),
    treasury: toNumber(raw.treasury),
    lastScan: toStringOrNull(raw.lastScan),
    deltaSum: toNumber(raw.deltaSum),
  };
};

export async function getPlayerToplistById(listId: string): Promise<FirestoreToplistPlayerResult> {
  try {
    const snap = await getDoc(doc(db, STATS_PUBLIC_ROOT, PLAYERS_COLLECTION, "lists", listId));
    if (!snap.exists()) {
      return { ok: false, error: "not_found" };
    }

    const data: any = snap.data() || {};

    const entity = toStringOrNull(data.entity) || "players";
    const group = toStringOrNull(data.group);
    const server = toStringOrNull(data.server);
    const metric = toStringOrNull(data.metric);
    const timeRange = toStringOrNull(data.timeRange);
    const limit = toNumber(data.limit);
    const rowsRaw = Array.isArray(data.rows) ? data.rows : null;

    if (entity !== "players" || !group || !server || !metric || !timeRange || limit == null || !rowsRaw) {
      console.error("[toplistsFirestore] Decode failed", {
        entity,
        group,
        server,
        metric,
        timeRange,
        limit,
        hasRowsArray: Array.isArray(data.rows),
      });
      return { ok: false, error: "decode_error", detail: "missing required toplist fields" };
    }

    const rows: FirestoreToplistPlayerRow[] = [];
    for (const row of rowsRaw) {
      const mapped = mapRow(row);
      if (!mapped) {
        console.error("[toplistsFirestore] Row decode failed", row);
        return { ok: false, error: "decode_error", detail: "invalid row shape" };
      }
      rows.push(mapped);
    }

    const list: FirestoreToplistPlayerList = {
      id: listId,
      entity: "players",
      group,
      server,
      metric,
      timeRange,
      limit,
      updatedAt: toNumber(data.updatedAt),
      nextUpdateAt: data.nextUpdateAt !== undefined ? toNumber(data.nextUpdateAt) : undefined,
      ttlSec: data.ttlSec !== undefined ? toNumber(data.ttlSec) : undefined,
      rows,
    };

    return { ok: true, list };
  } catch (err: any) {
    console.error("[toplistsFirestore] Firestore error", err);
    return { ok: false, error: "firestore_error", detail: err?.message };
  }
}

export async function getPlayerToplistWithFallback(
  key: PlayerToplistKey
): Promise<FirestoreToplistPlayerResult> {
  const primaryId = buildPlayerListId(key);
  const primary = await getPlayerToplistById(primaryId);

  if (primary.ok && primary.list.rows && primary.list.rows.length > 0) {
    return primary;
  }

  const groupNorm = (key.group || "").toLowerCase();
  if (groupNorm === "all") {
    return primary;
  }

  const fallbackKey: PlayerToplistKey = {
    ...key,
    group: "all",
  };
  const fallbackId = buildPlayerListId(fallbackKey);
  const fallback = await getPlayerToplistById(fallbackId);

  if (fallback.ok) {
    return {
      ok: true,
      list: {
        ...fallback.list,
        group: key.group,
      },
    };
  }

  return primary;
}
