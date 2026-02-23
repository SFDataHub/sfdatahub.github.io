import { extractPortraitFromSaveArray, parseSaveStringToArray } from "./extractPortrait";
import type { SfJsonOwnPlayer, SfJsonParseResult } from "./types";

const parsePlayerIdFromIdentifier = (identifier: string): number | null => {
  const match = String(identifier ?? "").trim().match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const toOwnPlayer = (player: unknown): SfJsonOwnPlayer | null => {
  if (!player || typeof player !== "object") return null;
  const raw = player as Record<string, unknown>;
  if (raw.own !== 1) return null;

  const identifier = toTrimmedString(raw.identifier);
  const server = toTrimmedString(raw.prefix);
  if (!identifier || !server) return null;

  const playerId = parsePlayerIdFromIdentifier(identifier);
  if (playerId == null) return null;

  const saveField = raw.save ?? raw.playerSave;
  const saveArray = Array.isArray(saveField) ? (saveField as number[]) : undefined;
  const saveString =
    typeof saveField === "string"
      ? saveField
      : typeof raw.saveString === "string"
        ? raw.saveString
        : undefined;
  const name = toTrimmedString(raw.name);
  const guildName =
    toTrimmedString(raw.guildName) ?? (typeof raw.group === "string" ? raw.group : undefined);

  let portrait = null;
  if (saveArray && saveArray.length > 0) {
    portrait = extractPortraitFromSaveArray(saveArray);
  } else if (saveString) {
    const parsedSave = parseSaveStringToArray(saveString);
    if (parsedSave.length > 0) {
      portrait = extractPortraitFromSaveArray(parsedSave);
    }
  }

  return {
    identifier,
    playerId,
    server,
    portrait,
    saveArray,
    saveString,
    name,
    guildName,
  };
};

export const parseSfJson = (input: string | unknown): SfJsonParseResult => {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  const players = Array.isArray((parsed as any)?.players)
    ? (((parsed as any).players as unknown[]) ?? [])
    : [];
  const ownPlayers = players.map(toOwnPlayer).filter((entry): entry is SfJsonOwnPlayer => Boolean(entry));

  return {
    ownPlayers,
    ownPlayer: ownPlayers[0] ?? null,
    playersCount: players.length,
  };
};
