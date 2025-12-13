import type { PortraitOptions } from "../components/player-profile/types";

const DEFAULT_PORTRAIT_OPTIONS: PortraitOptions = {
  genderName: "male",
  class: 1,
  race: 1,
  mouth: 1,
  hair: 1,
  hairColor: 1,
  horn: 0,
  hornColor: 1,
  brows: 1,
  eyes: 1,
  beard: 0,
  nose: 1,
  ears: 1,
  extra: 0,
  special: 0,
  showBorder: true,
  background: "gradient",
  frame: "",
  mirrorHorizontal: true,
};

const safeValue = (source: number[] | undefined, index: number, fallback = 0) => {
  if (!Array.isArray(source) || index < 0) return fallback;
  const raw = source[index];
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const mapFrameIdToName = (frameId: number): PortraitOptions["frame"] => {
  switch (frameId) {
    case 1:
      return "goldenFrame";
    case 2:
      return "twitchFrame";
    case 3:
      return "zenFrame";
    case 4:
      return "silverFrame";
    case 50:
      return "worldBossFrameGold";
    case 51:
      return "worldBossFrameSilver";
    case 52:
      return "worldBossFrameBronze";
    default:
      return "";
  }
};

export function createPortraitOptionsFromSaveArray(save: number[]): PortraitOptions {
  const hairRaw = safeValue(save, 18);
  const beardRaw = safeValue(save, 21);
  const hornRaw = safeValue(save, 25);
  const frameId = safeValue(save, 705);
  const genderByte = safeValue(save, 28) & 0xff;

  const hairColorBase = Math.floor(hairRaw / 100);
  const hairColor = Math.max(hairColorBase, 1);
  const hornColorBase = Math.floor(hairRaw / 100);

  const portrait: PortraitOptions = {
    ...DEFAULT_PORTRAIT_OPTIONS,
    genderName: genderByte === 1 ? "female" : "male",
    class: safeValue(save, 29) & 0xffff,
    race: safeValue(save, 27) & 0xffff,
    mouth: safeValue(save, 17),
    hair: Math.max(hairRaw % 100, 0),
    brows: Math.max(safeValue(save, 19) % 100, 0),
    eyes: safeValue(save, 20),
    beard: Math.max(beardRaw % 100, 0),
    nose: safeValue(save, 22),
    ears: safeValue(save, 23),
    extra: safeValue(save, 24),
    horn: Math.max(hornRaw % 100, 0),
    special: Math.min(safeValue(save, 26), 0),
    hairColor,
    hornColor: genderByte === 1 ? 1 : hornColorBase === 0 ? hairColor : hornColorBase,
    frame: mapFrameIdToName(frameId),
  };

  return portrait;
}

export function parseSaveStringToArray(saveString: string): number[] {
  if (typeof saveString !== "string" || !saveString.trim()) return [];
  return saveString.split("/").map((part) => {
    const num = Number(part.trim());
    return Number.isFinite(num) ? num : 0;
  });
}

export function createPortraitOptionsFromSaveString(saveString: string): PortraitOptions {
  const parsed = parseSaveStringToArray(saveString);
  return createPortraitOptionsFromSaveArray(parsed);
}