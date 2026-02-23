import type { SfJsonPortrait } from "./types";

const safeValue = (save: number[], index: number, fallback = 0) => {
  if (!Array.isArray(save) || index < 0) return fallback;
  const raw = save[index];
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

export const parseSaveStringToArray = (saveString: string): number[] => {
  if (typeof saveString !== "string" || !saveString.trim()) return [];
  return saveString.split("/").map((part) => {
    const num = Number.parseInt(part.trim(), 10);
    return Number.isFinite(num) ? num : 0;
  });
};

export const extractPortraitFromSaveArray = (save: number[]): SfJsonPortrait => {
  const hairRaw = safeValue(save, 18);
  const hornRaw = safeValue(save, 25);
  const specialRaw = safeValue(save, 26);
  const genderByte = safeValue(save, 28) & 0xff;

  const hairColorBase = Math.floor(hairRaw / 100);
  const hairColor = Math.max(hairColorBase, 1);
  const hornColorBase = Math.floor(hairRaw / 100);

  const genderName: SfJsonPortrait["genderName"] = genderByte === 2 ? "female" : "male";

  return {
    genderName,
    classId: safeValue(save, 29) & 0xffff,
    raceId: safeValue(save, 27) & 0xffff,
    mouth: safeValue(save, 17),
    hair: Math.max(hairRaw % 100, 0),
    brows: Math.max(safeValue(save, 19) % 100, 0),
    eyes: safeValue(save, 20),
    beard: Math.max(safeValue(save, 21) % 100, 0),
    nose: safeValue(save, 22),
    ears: safeValue(save, 23),
    extra: safeValue(save, 24),
    horn: Math.max(hornRaw % 100, 0),
    special: Math.min(specialRaw, 0),
    hairColor,
    hornColor: genderName === "female" ? 1 : hornColorBase === 0 ? hairColor : hornColorBase,
    frameId: safeValue(save, 705),
  };
};
