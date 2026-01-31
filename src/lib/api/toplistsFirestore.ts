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
