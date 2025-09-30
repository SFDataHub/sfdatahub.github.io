// src/lib/import/upsert.ts
import { getDB } from "../db";
import type { PlayersPayloadT, GuildsPayloadT, ScanPayloadT } from "./schemas";

function hashString(s: string) {
  // simpler Hash (für Dedupe). Für Produktion besser: xxhash/sha-256.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return String(h >>> 0);
}

export async function upsertPlayers(payload: PlayersPayloadT) {
  const db = await getDB();
  const tx = (await db).transaction(["players"], "readwrite");
  const store = tx.objectStore("players");

  const now = Date.now();
  let count = 0;
  const rows: any[] = [];

  // 🔑 Wichtig: KEINE Filterung nach "own". Jede Zeile mit ID wird gezählt.
  // Außerdem de-dupen wir über server+id, falls dieselbe ID mehrfach im File steht.
  const seen = new Set<string>();

  for (const p of payload.players ?? []) {
    if (!p) continue;
    // SFTools nutzt "identifier" → der Parser mappt bereits auf p.id
    const rawId = (p as any).id ?? (p as any).identifier;
    if (rawId == null || String(rawId).trim() === "") continue;

    const id = `${String(payload.server).toLowerCase()}:${String(rawId)}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const row = {
      id,
      server: String(payload.server),
      name: (p as any).name ?? "",
      className:
        (p as any).className ??
        (typeof (p as any).class === "number" ? String((p as any).class) : (p as any).class ?? ""),
      level: (p as any).level ?? undefined,
      scrapbookPct: (p as any).scrapbookPct ?? undefined,
      guildId: (p as any).guildId ?? "",
      updatedAt: now,
    };

    await store.put(row);
    rows.push(row);
    count++;
  }

  await tx.done;
  return { count, rows };
}
export async function upsertGuilds(payload: GuildsPayloadT) {
  const db = await getDB();
  const tx = db.transaction(["guilds"], "readwrite");
  const store = tx.objectStore("guilds");
  let count = 0;
  const now = Date.now();

  for (const g of payload.guilds) {
    const id = `${payload.server.toLowerCase()}:g-${g.id}`;
    const prev = await store.get(id);
    const rec = {
      id,
      name: g.name,
      server: payload.server,
      memberCount: g.memberCount,
      updatedAt: now,
    };
    await store.put(prev ? { ...prev, ...rec, updatedAt: now } : rec);
    count++;
  }
  await tx.done;
  return count;
}

export async function upsertScan(payload: ScanPayloadT) {
  const db = await getDB();
  const now = Date.now();
  const hash = hashString(JSON.stringify(payload.raw ?? payload));

  // Dedupe über Hash
  {
    const txCheck = db.transaction(["scans"], "readonly");
    const idx = txCheck.objectStore("scans").index("by_hash");
    const existing = await idx.get(hash);
    await txCheck.done;
    if (existing) return { scans: 0, players: 0, guilds: 0, deduped: true };
  }

  let pCount = 0, gCount = 0;

  // optional player upsert
  if (payload.player) {
    pCount += await upsertPlayers({
      type: "players",
      server: payload.server,
      players: [payload.player],
    });
  }

  // optional guild upsert
  if (payload.guild) {
    gCount += await upsertGuilds({
      type: "guilds",
      server: payload.server,
      guilds: [payload.guild],
    });
  }

  // scan speichern
  {
    const tx = db.transaction(["scans"], "readwrite");
    const id = `${payload.server.toLowerCase()}:scan:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
    await tx.objectStore("scans").put({
      id,
      server: payload.server,
      playerId: payload.player ? `${payload.server.toLowerCase()}:${payload.player.id}` : undefined,
      guildId: payload.guild ? `${payload.server.toLowerCase()}:g-${payload.guild.id}` : undefined,
      payloadHash: hash,
      createdAt: now,
    });
    await tx.done;
  }

  return { scans: 1, players: pCount, guilds: gCount, deduped: false };
}
