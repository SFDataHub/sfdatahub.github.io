import { guideAssetByKey } from "../../data/guidehub/assets";

export type PotionAssetType =
  | "strength"
  | "dexterity"
  | "intelligence"
  | "constitution"
  | "luck"
  | "life";

export type PotionAssetSize = 10 | 15 | 25;

export const resolvePotionAssetKey = (
  typeRaw: string | null | undefined,
  sizeRaw: number | null | undefined,
) => {
  const sizeVal = typeof sizeRaw === "number" && Number.isFinite(sizeRaw) ? Math.round(sizeRaw) : null;
  const tier = sizeVal === 10 ? "small" : sizeVal === 15 ? "medium" : sizeVal === 25 ? "big" : null;
  const type = (typeRaw || "").toLowerCase().trim();
  if (!type) return null;
  if (type === "life") return "eternalpotion";
  const baseMap: Record<string, string> = {
    strength: "strength",
    dexterity: "dexterity",
    intelligence: "int",
    constitution: "con",
    luck: "luckpot",
  };
  const base = baseMap[type];
  if (!base || !tier) return null;
  if (base === "luckpot") {
    const preferred = `luckpot${tier}`;
    const legacy = `luck${tier}`;
    const hasPreferred = !!guideAssetByKey(preferred, 128).id;
    return hasPreferred ? preferred : legacy;
  }
  return `${base}${tier}`;
};

export const resolvePotionAsset = (
  type: PotionAssetType,
  size: PotionAssetSize | null,
  thumbSize = 256,
) => {
  const key = resolvePotionAssetKey(type, size);
  return key ? { key, asset: guideAssetByKey(key, thumbSize) } : null;
};
