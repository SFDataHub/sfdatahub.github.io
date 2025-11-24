// src/lib/import/parsers.ts
import { z } from "zod";
import {
  PlayersPayload,
  GuildsPayload,
  ScanPayload,
  type PlayersPayloadT,
  type GuildsPayloadT,
  type ScanPayloadT,
} from "./schemas";
import type { DetectedPayload } from "./types";

// ---------- Utils ----------
type Obj = Record<string, any>;
const isObj = (v: any): v is Obj => v && typeof v === "object" && !Array.isArray(v);
const norm = (s: any) => String(s ?? "").trim();
const up = (s: any) => norm(s).toUpperCase();

function safeParse<T>(schema: z.ZodTypeAny, data: any): { ok: boolean; data?: T } {
  const res = schema.safeParse(data);
  return res.success ? { ok: true, data: res.data as T } : { ok: false };
}

function guessServer(o: Obj): string | undefined {
  const fromGroup =
    typeof o.group === "string" ? o.group.split("_").slice(0, 2).join("_") : undefined;
  const fromGroupName =
    typeof o.groupname === "string" ? o.groupname.split(" ")[0] : undefined;

  const s =
    o.server ??
    o.prefix ??
    o.world ??
    o.realm ??
    o.srv ??
    fromGroup ??
    fromGroupName ??
    o.shard;

  return s ? up(s) : undefined;
}
function pickFirst(o: Obj, keys: string[]) {
  for (const k of keys) {
    if (o[k] != null && String(o[k]).length) return o[k];
    const lower = k.toLowerCase();
    const upper = k.toUpperCase();
    if (o[lower] != null && String(o[lower]).length) return o[lower];
    if (o[upper] != null && String(o[upper]).length) return o[upper];
    const spaced = k.replace(/_/g, " ");
    if (o[spaced] != null && String(o[spaced]).length) return o[spaced];
  }
  return undefined;
}

function toNumMaybe(v: any) {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

// ---------- Synonyme (aus deinen SFTools-Headern) ----------
const PLAYER_NAME_KEYS = ["name", "player", "player_name", "nickname", "nick", "Character Name"];
const PLAYER_ID_KEYS = ["id", "identifier", "link identifier", "player_id", "pid", "playerid", "ID", "Identifier"];
const PLAYER_CLASS_KEYS = ["class", "classname", "class_name", "cls", "Role", "Class"];
const PLAYER_LEVEL_KEYS = ["level", "lvl", "lv", "Level"];
const PLAYER_GUILDID = ["guildid", "guild_id", "guild", "Guild", "Guild ID"];

// ---------- Normalisierung auf ein schlankes Player-Objekt ----------
/**
 * Schneidet einen fetten SFTools-Player auf die Felder zusammen, die unser Schema sicher versteht.
 * Alles andere (save, pets, items, ...) wird absichtlich weggelassen.
 */
function slimPlayer(o: Obj) {
  const id = pickFirst(o, PLAYER_ID_KEYS);
  const name = pickFirst(o, PLAYER_NAME_KEYS);
  const cls = pickFirst(o, PLAYER_CLASS_KEYS);
  const lvl = pickFirst(o, PLAYER_LEVEL_KEYS);
  const guildId = pickFirst(o, PLAYER_GUILDID);
  const server = guessServer(o);
  const base: Obj = {};
  if (id != null) base.id = String(id);
  if (name != null) base.name = String(name);
  // viele Exporte haben "class" numerisch – das ist ok; wenn "Class" string ist, trotzdem durchreichen
  if (cls != null) base.class = typeof cls === "number" ? cls : String(cls);
  if (lvl != null) base.level = toNumMaybe(lvl);
  if (guildId != null) base.guildId = String(guildId);
  if (server != null) base.server = server;
  return base;
}

// ---------- Tiefensuche ----------
type Found = { kind: "players" | "guilds"; server?: string; arr: Obj[] };

function deepFindArrays(root: any, limit = 20000): Found | null {
  let seen = 0;
  const stack = [root];
  while (stack.length && seen < limit) {
    const cur = stack.pop();
    seen++;
    if (Array.isArray(cur) && cur.length && isObj(cur[0])) {
      const arr = cur as Obj[];
      // heuristik: Players wenn id/name/class vorkommt
      const looksLikePlayer =
        arr.some((o) => o && (o.name != null || o.identifier != null || o.id != null || o.class != null));
      if (looksLikePlayer) return { kind: "players", server: guessServer(arr[0]), arr };
      // andernfalls als Guilds versuchen
      return { kind: "guilds", server: guessServer(arr[0]), arr };
    } else if (isObj(cur)) {
      for (const v of Object.values(cur)) stack.push(v);
    }
  }
  return null;
}

// ---------- Parser-Registry ----------
export type Parser = {
  name: string;
  detect: (json: any) => boolean;
  parse: (json: any) => Promise<DetectedPayload>;
};

export const parsers: Parser[] = [
  // NEU: SFTools-Players-Export: { players: [...] } (ohne type/server)
  {
    name: "sftools-players-bare",
    detect: (json) => isObj(json) && Array.isArray(json.players),
    parse: async (json): Promise<DetectedPayload<PlayersPayloadT>> => {
      const arr: Obj[] = json.players;
      const server =
        up(guessServer(arr[0]) ?? guessServer(json) ?? "UNKNOWN"); // prefix, group, etc.
      const playersSlim = arr.map(slimPlayer);
      const wrapped = { type: "players", server, players: playersSlim };
      const r = safeParse<PlayersPayloadT>(PlayersPayload, wrapped);
      if (!r.ok) throw new Error("Invalid SFTools players payload (post-slim)");
      return { type: "players", raw: r.data! };
    },
  },

  // bestehende explizite Typen
  {
    name: "players-list",
    detect: (json) => isObj(json) && json.type === "players" && Array.isArray(json.players),
    parse: async (json): Promise<DetectedPayload<PlayersPayloadT>> => {
      const r = safeParse<PlayersPayloadT>(PlayersPayload, json);
      if (!r.ok) throw new Error("Invalid players payload");
      return { type: "players", raw: r.data! };
    },
  },
  {
    name: "guilds-list",
    detect: (json) => isObj(json) && json.type === "guilds" && Array.isArray(json.guilds),
    parse: async (json): Promise<DetectedPayload<GuildsPayloadT>> => {
      const r = safeParse<GuildsPayloadT>(GuildsPayload, json);
      if (!r.ok) throw new Error("Invalid guilds payload");
      return { type: "guilds", raw: r.data! };
    },
  },
  {
    name: "scan",
    detect: (json) => isObj(json) && json.type === "scan" && typeof json.server === "string",
    parse: async (json): Promise<DetectedPayload<ScanPayloadT>> => {
      const r = safeParse<ScanPayloadT>(ScanPayload, json);
      if (!r.ok) throw new Error("Invalid scan payload");
      return { type: "scan", raw: r.data! };
    },
  },

  // Deep-Fallback: verschachtelte Arrays erkennen
  {
    name: "deep-fallback",
    detect: (json) => isObj(json),
    parse: async (json): Promise<DetectedPayload> => {
      const found = deepFindArrays(json);
      if (!found) throw new Error("no deep array found");

      if (found.kind === "players") {
        const server = up(guessServer(found.arr[0]) ?? "UNKNOWN");
        const playersSlim = found.arr.map(slimPlayer);
        const wrapped = { type: "players", server, players: playersSlim };
        const r = safeParse<PlayersPayloadT>(PlayersPayload, wrapped);
        if (r.ok) return { type: "players", raw: r.data! };
        throw new Error("deep players mapping failed");
      } else {
        // Guilds-Teil lassen wir vorerst wie gehabt.
        const server = up(guessServer(found.arr[0]) ?? "UNKNOWN");
        const wrapped = { type: "guilds", server, guilds: found.arr };
        const r = safeParse<GuildsPayloadT>(GuildsPayload, wrapped);
        if (r.ok) return { type: "guilds", raw: r.data! };
        throw new Error("deep guilds mapping failed");
      }
    },
  },
];

// ---------- detect (async) ----------
export async function detectPayloadAsync(json: any): Promise<DetectedPayload | null> {
  for (const p of parsers) {
    try {
      if (p.detect(json)) {
        const out = await p.parse(json);
        if (out) return out;
      }
    } catch {
      // nächste Strategie probieren
    }
  }
  return null;
}
