// src/lib/import/schemas.ts
import { z } from "zod";

/**
 * Beispiel 1: Spieler-Liste (generisch)
 * {
 *   "type": "players",
 *   "server": "EU1",
 *   "players": [{ id, name, className, level, scrapbookPct, guildId }]
 * }
 */
export const PlayersPayload = z.object({
  type: z.literal("players"),
  server: z.string(),
  players: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string(),
    className: z.string().optional(),
    level: z.number().optional(),
    scrapbookPct: z.number().optional(),
    guildId: z.string().nullable().optional(),
  })),
});

/**
 * Beispiel 2: Gilden-Liste (generisch)
 * {
 *   "type": "guilds",
 *   "server": "EU1",
 *   "guilds": [{ id, name, memberCount }]
 * }
 */
export const GuildsPayload = z.object({
  type: z.literal("guilds"),
  server: z.string(),
  guilds: z.array(z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string(),
    memberCount: z.number().optional(),
  })),
});

/**
 * Beispiel 3: HAR-ähnlicher Scan
 * {
 *   "type": "scan",
 *   "server": "EU1",
 *   "player": { id, name, ... } | null,
 *   "guild": { id, name, ... } | null,
 *   "raw": {...} // original payload (optional)
 * }
 */
export const ScanPayload = z.object({
  type: z.literal("scan"),
  server: z.string(),
  player: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string(),
    className: z.string().optional(),
    level: z.number().optional(),
    scrapbookPct: z.number().optional(),
    guildId: z.string().nullable().optional(),
  }).nullable().optional(),
  guild: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string(),
    memberCount: z.number().optional(),
  }).nullable().optional(),
  raw: z.unknown().optional(),
});

export type PlayersPayloadT = z.infer<typeof PlayersPayload>;
export type GuildsPayloadT = z.infer<typeof GuildsPayload>;
export type ScanPayloadT = z.infer<typeof ScanPayload>;
