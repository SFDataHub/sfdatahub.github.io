import { z } from "zod";

export const PlayersPayload = z.object({
  type: z.literal("players"),
  server: z.string(),
  players: z.array(z.record(z.string(), z.any())),
});
export type PlayersPayloadT = z.infer<typeof PlayersPayload>;

export const GuildsPayload = z.object({
  type: z.literal("guilds"),
  server: z.string(),
  guilds: z.array(z.record(z.string(), z.any())),
});
export type GuildsPayloadT = z.infer<typeof GuildsPayload>;

export const ScanPayload = z.object({
  type: z.literal("scan"),
  server: z.string(),
  data: z.record(z.string(), z.any()).optional(),
});
export type ScanPayloadT = z.infer<typeof ScanPayload>;
