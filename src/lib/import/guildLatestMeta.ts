export type GuildLatestMeta = {
  honor: number;
  hydra: number;
  instructor: number;
  petLevel: number | null;
  knights: number;
  knights15Plus: number;
  memberCount: number;
  portalFloor: number;
  raids: number;
  treasury: number;
};

export const GUILD_LATEST_VALUE_KEYS = {
  honor: ["Guild Honor"],
  hydra: ["Guild Hydra"],
  instructor: ["Guild Instructor"],
  petLevel: ["Guild Pet Level"],
  knights: ["Guild Knights"],
  knights15Plus: ["Guild Knights 15+"],
  memberCount: ["Guild Member Count"],
  portalFloor: ["Guild Portal Floor"],
  raids: ["Guild Raids"],
  treasury: ["Guild Treasure", "Guild Treasury"],
} as const;

const toDigitsOnlyNumber = (value: any): number => {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toOptionalDigitsOnlyNumber = (value: any): number | null => {
  if (value == null || String(value).trim() === "") return null;
  const cleaned = String(value).replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const pickByKey = (values: Record<string, any> | null | undefined, keys: readonly string[]) => {
  if (!values || typeof values !== "object") return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return (values as any)[key];
  }
  return undefined;
};

export const readGuildLatestMeta = (values: Record<string, any> | null | undefined): GuildLatestMeta => ({
  honor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.honor)),
  hydra: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.hydra)),
  instructor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.instructor)),
  petLevel: toOptionalDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.petLevel)),
  knights: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights)),
  knights15Plus: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.knights15Plus)),
  memberCount: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.memberCount)),
  portalFloor: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.portalFloor)),
  raids: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.raids)),
  treasury: toDigitsOnlyNumber(pickByKey(values, GUILD_LATEST_VALUE_KEYS.treasury)),
});
