// src/lib/import/csv.ts
import Papa from "papaparse";
import { upsertPlayers, upsertGuilds } from "./upsert";
import type { ImportReport } from "./types";

// Unterstützte Kopfzeilen (case-insensitive matching)
const PLAYER_HEADERS = [
  // Mindestanforderungen: id, name, server
  ["id", "name", "server"],
  // Varianten
  ["player_id", "player", "server"],
  ["id", "name", "region", "server"],
];
const GUILD_HEADERS = [
  // Mindestanforderungen: id, name, server
  ["id", "name", "server"],
  ["guild_id", "guild_name", "server"],
];

type Row = Record<string, string | number | null | undefined>;

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function looksLike(headers: string[], templates: string[][]) {
  const set = new Set(headers.map(normHeader));
  return templates.some(t => t.every(col => set.has(col)));
}

function get<T extends string>(row: Row, ...keys: T[]) {
  for (const k of keys) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).length > 0) return String(v);
  }
  return undefined;
}

function toNumberMaybe(v?: string) {
  if (v == null) return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export type CsvOptions = {
  // Wenn nicht in jeder Zeile vorhanden: globaler Server (z. B. "EU1")
  defaultServer?: string;
  // Optional: forcieren, ob players/guilds
  forceType?: "players" | "guilds";
};

export async function importCsvToDB(csvText: string, opts: CsvOptions = {}): Promise<ImportReport> {
  const t0 = performance.now();
  const report: ImportReport = {
    detectedType: null,
    counts: {},
    errors: [],
    warnings: [],
    durationMs: 0,
  };

  // Parsen
  const parsed = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normHeader,
  });

  if (parsed.errors?.length) {
    report.errors.push(...parsed.errors.map(e => `CSV parse error (row ${e.row}): ${e.message}`));
  }
  const rows = (parsed.data || []).filter(Boolean);
  const headers = parsed.meta.fields?.map(normHeader) ?? [];

  if (!rows.length) {
    report.errors.push("Keine Datenzeilen gefunden.");
    report.durationMs = performance.now() - t0;
    return report;
  }

  // Typ erkennen (sofern nicht vorgegeben)
  let detected: "players" | "guilds" | null = null;
  if (opts.forceType) {
    detected = opts.forceType;
  } else {
    if (looksLike(headers, PLAYER_HEADERS)) detected = "players";
    else if (looksLike(headers, GUILD_HEADERS)) detected = "guilds";
  }

  if (!detected) {
    report.errors.push("Konnte CSV-Typ nicht erkennen (erwarte players- oder guilds-Kopfzeilen).");
    report.durationMs = performance.now() - t0;
    return report;
  }
  report.detectedType = detected;

  try {
    if (detected === "players") {
      // erwartete Felder (best-effort)
      // id, name, server (mindestens) + optionale Felder
      const players = rows.map((r) => {
        const id = get(r, "id", "player_id");
        const name = get(r, "name", "player");
        const server = get(r, "server") ?? opts.defaultServer;
        const className = get(r, "class", "classname");
        const level = toNumberMaybe(get(r, "level", "lvl"));
        const scrapbookPct = toNumberMaybe(get(r, "scrapbookpct", "scrapbook", "album"));
        const guildId = get(r, "guildid", "guild_id", "guild");

        return { id, name, server, className, level, scrapbookPct, guildId };
      }).filter(p => p.id && p.name && p.server) as Array<{
        id: string; name: string; server: string;
        className?: string; level?: number; scrapbookPct?: number; guildId?: string;
      }>;

      const missing = rows.length - players.length;
      if (missing > 0) report.warnings.push(`${missing} Zeilen ohne Mindestfelder (id/name/server) wurden übersprungen.`);

      // gruppiert nach server → upsert per server
      const byServer = new Map<string, typeof players>();
      for (const p of players) {
        const arr = byServer.get(p.server) ?? [];
        arr.push(p);
        byServer.set(p.server, arr);
      }

      let total = 0;
      for (const [server, arr] of byServer) {
        total += await upsertPlayers({ type: "players", server, players: arr.map(({server: _s, ...rest}) => rest) });
      }
      report.counts.players = total;
    } else if (detected === "guilds") {
      // erwartete Felder: id, name, server (+optional memberCount)
      const guilds = rows.map((r) => {
        const id = get(r, "id", "guild_id");
        const name = get(r, "name", "guild_name");
        const server = get(r, "server") ?? opts.defaultServer;
        const memberCount = toNumberMaybe(get(r, "membercount", "members", "member_count"));
        return { id, name, server, memberCount };
      }).filter(g => g.id && g.name && g.server) as Array<{
        id: string; name: string; server: string; memberCount?: number;
      }>;

      const missing = rows.length - guilds.length;
      if (missing > 0) report.warnings.push(`${missing} Zeilen ohne Mindestfelder (id/name/server) wurden übersprungen.`);

      const byServer = new Map<string, typeof guilds>();
      for (const g of guilds) {
        const arr = byServer.get(g.server) ?? [];
        arr.push(g);
        byServer.set(g.server, arr);
      }

      let total = 0;
      for (const [server, arr] of byServer) {
        total += await upsertGuilds({ type: "guilds", server, guilds: arr.map(({server: _s, ...rest}) => rest) });
      }
      report.counts.guilds = total;
    }
  } catch (e: any) {
    report.errors.push(String(e?.message ?? e));
  } finally {
    report.durationMs = performance.now() - t0;
  }

  return report;
}
