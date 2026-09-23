import { getClassMetaById } from "../../data/classes";
import {
  normalizeSfPlayerCharacterCore,
  type NormalizedPlayer,
} from "../../lib/parsing/normalizedPlayer";
import {
  detectSfPlayerSaveLayout,
  readSfPlayerSaveArray,
  readSfSaveLowerShort,
} from "../../lib/parsing/playerSaveLayout";
import type { SfJsonPortrait } from "../../lib/parsing/types";

export type AvatarImportPlayerEntry = {
  key: string;
  rawIndex: number;
  rawPlayer: Record<string, unknown>;
  identifier: string;
  playerId: number | null;
  name: string | null;
  server: string | null;
  level: number | null;
  classId: number | null;
  classLabel: string | null;
  guildName: string | null;
  own: boolean;
  layout: NormalizedPlayer["metadata"]["layout"];
  searchKey: string;
};

export const AVATAR_SEARCH_RESULT_LIMIT = 100;

const IMPORTABLE_PORTRAIT_STATUSES = new Set(["available", "partial"]);

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const readString = (obj: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readNumber = (obj: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = obj[key];
    const num = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const parsePlayerIdFromIdentifierLoose = (identifier: string | null): number | null => {
  const match = String(identifier ?? "").trim().match(/_p(\d+)$/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const readPlayerLevelFromSave = (
  saveArray: unknown[] | null,
  layout: AvatarImportPlayerEntry["layout"],
): number | null => {
  const indexByLayout: Record<Exclude<AvatarImportPlayerEntry["layout"], "unknown">, number> = {
    currentCompact: 3,
    legacyOwn: 7,
    legacyOther: 2,
  };
  if (layout === "unknown") return null;
  return readSfSaveLowerShort(saveArray, indexByLayout[layout]);
};

const readPlayerClassFromSave = (
  saveArray: unknown[] | null,
  layout: AvatarImportPlayerEntry["layout"],
): number | null => {
  const indexByLayout: Record<Exclude<AvatarImportPlayerEntry["layout"], "unknown">, number> = {
    currentCompact: 20,
    legacyOwn: 29,
    legacyOther: 20,
  };
  if (layout === "unknown") return null;
  return readSfSaveLowerShort(saveArray, indexByLayout[layout]);
};

const getRawPlayers = (rawJson: unknown): Record<string, unknown>[] => {
  const root = asObject(rawJson);
  const rawPlayers = root && Array.isArray(root.players) ? root.players : [];
  return rawPlayers.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const buildAvatarSearchKey = (parts: Array<string | number | null | undefined>) =>
  parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

export const buildAvatarImportPlayerEntries = (rawJson: unknown): AvatarImportPlayerEntry[] =>
  getRawPlayers(rawJson).flatMap((rawPlayer, rawIndex) => {
    const saveArray = readSfPlayerSaveArray(rawPlayer);
    const layout = detectSfPlayerSaveLayout(rawPlayer, saveArray);
    if (layout === "unknown" || !saveArray?.length) return [];

    const identifier = readString(rawPlayer, ["identifier"]) ?? "";
    if (!identifier) return [];

    const playerId =
      readNumber(rawPlayer, ["playerId", "id"]) ?? parsePlayerIdFromIdentifierLoose(identifier);
    const server = readString(rawPlayer, ["prefix", "server"]);
    const name = readString(rawPlayer, ["name"]);
    const guildName = readString(rawPlayer, ["guildName", "groupname", "groupName", "guild", "group"]);
    const own = readNumber(rawPlayer, ["own"]) === 1;
    const level = readNumber(rawPlayer, ["level"]) ?? readPlayerLevelFromSave(saveArray, layout);
    const classId = readNumber(rawPlayer, ["class"]) ?? readPlayerClassFromSave(saveArray, layout);
    const classLabel = getClassMetaById(classId)?.label ?? (classId == null ? null : `Class ${classId}`);
    const key = `${identifier}::${rawIndex}`;
    const searchKey = buildAvatarSearchKey([
      name,
      identifier,
      server,
      guildName,
      classLabel,
      classId,
      own ? "own" : "other",
      layout,
    ]);

    return [
      {
        key,
        rawIndex,
        rawPlayer,
        identifier,
        playerId,
        name,
        server,
        level,
        classId,
        classLabel,
        guildName,
        own,
        layout,
        searchKey,
      },
    ];
  });

export const filterAvatarImportPlayerEntries = (
  entries: AvatarImportPlayerEntry[],
  query: string,
): AvatarImportPlayerEntry[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return entries;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return entries.filter((entry) => terms.every((term) => entry.searchKey.includes(term)));
};

export const normalizeAvatarEntry = (entry: AvatarImportPlayerEntry | null): NormalizedPlayer | null => {
  if (!entry) return null;
  try {
    return normalizeSfPlayerCharacterCore(entry.rawPlayer);
  } catch (error) {
    console.warn("[UploadCenterV2][Avatar Import] Could not normalize selected player", error);
    return null;
  }
};

export const getImportablePortrait = (normalized: NormalizedPlayer | null): SfJsonPortrait | null => {
  const portrait = normalized?.portrait;
  if (!portrait || !("appearance" in portrait) || !portrait.appearance) return null;
  return IMPORTABLE_PORTRAIT_STATUSES.has(portrait.status) ? (portrait as SfJsonPortrait) : null;
};

export const getPortraitStatusLabel = (normalized: NormalizedPlayer | null) =>
  normalized?.portrait?.status ?? "missing";
