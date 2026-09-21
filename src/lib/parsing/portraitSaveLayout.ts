import {
  detectSfPlayerSaveLayout,
  type SfPlayerSaveLayout,
} from "./playerSaveLayout";
import type { SfJsonPortrait } from "./types";

export type PortraitSaveLayoutSource =
  | SfPlayerSaveLayout
  | {
      own?: unknown;
      save?: unknown;
      playerSave?: unknown;
      saveVersion?: unknown;
    };

type PortraitIndexes = {
  mouth: number;
  hair: number;
  brows: number;
  eyes: number;
  beard: number;
  nose: number;
  ears: number;
  extra: number;
  horn: number;
  special: number;
  race: number;
  gender: number;
  class: number;
  frameId: number | null;
};

const LEGACY_OWN_PORTRAIT_INDEXES: PortraitIndexes = {
  mouth: 17,
  hair: 18,
  brows: 19,
  eyes: 20,
  beard: 21,
  nose: 22,
  ears: 23,
  extra: 24,
  horn: 25,
  special: 26,
  race: 27,
  gender: 28,
  class: 29,
  frameId: 705,
};

const COMPACT_PORTRAIT_INDEXES: PortraitIndexes = {
  mouth: 8,
  hair: 9,
  brows: 10,
  eyes: 11,
  beard: 12,
  nose: 13,
  ears: 14,
  extra: 15,
  horn: 16,
  special: 17,
  race: 18,
  gender: 19,
  class: 20,
  frameId: null,
};

const isSaveLayout = (value: unknown): value is SfPlayerSaveLayout =>
  value === "currentCompact" || value === "legacyOwn" || value === "legacyOther" || value === "unknown";

const safeValue = (save: number[], index: number, fallback = 0) => {
  if (!Array.isArray(save) || index < 0) return fallback;
  const raw = save[index];
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? num : fallback;
};

export const resolvePortraitSaveLayout = (
  save: number[],
  source?: PortraitSaveLayoutSource,
): SfPlayerSaveLayout => {
  if (isSaveLayout(source)) return source;

  if (source && typeof source === "object") {
    const layout = detectSfPlayerSaveLayout({ ...source, save }, save);
    if (layout !== "unknown") return layout;
  }

  return "legacyOwn";
};

const getPortraitIndexes = (layout: SfPlayerSaveLayout): PortraitIndexes => {
  if (layout === "currentCompact" || layout === "legacyOther") return COMPACT_PORTRAIT_INDEXES;
  return LEGACY_OWN_PORTRAIT_INDEXES;
};

const resolveGenderName = (
  layout: SfPlayerSaveLayout,
  genderByte: number,
): SfJsonPortrait["genderName"] => {
  if (layout === "currentCompact") return genderByte === 2 ? "female" : "male";
  return genderByte === 1 || genderByte === 2 ? "female" : "male";
};

export const extractPortraitFromSaveArrayWithLayout = (
  save: number[],
  source?: PortraitSaveLayoutSource,
): SfJsonPortrait => {
  const layout = resolvePortraitSaveLayout(save, source);
  const indexes = getPortraitIndexes(layout);
  const hairRaw = safeValue(save, indexes.hair);
  const beardRaw = safeValue(save, indexes.beard);
  const hornRaw = safeValue(save, indexes.horn);
  const specialRaw = safeValue(save, indexes.special);
  const genderByte = safeValue(save, indexes.gender) & 0xff;

  const hairColorBase = Math.floor(hairRaw / 100);
  const hairColor = Math.max(hairColorBase, 1);
  const hornColorBase = Math.floor(hairRaw / 100);
  const genderName = resolveGenderName(layout, genderByte);

  return {
    genderName,
    classId: safeValue(save, indexes.class) & 0xffff,
    raceId: safeValue(save, indexes.race) & 0xffff,
    mouth: safeValue(save, indexes.mouth),
    hair: Math.max(hairRaw % 100, 0),
    brows: Math.max(safeValue(save, indexes.brows) % 100, 0),
    eyes: safeValue(save, indexes.eyes),
    beard: Math.max(beardRaw % 100, 0),
    nose: safeValue(save, indexes.nose),
    ears: safeValue(save, indexes.ears),
    extra: safeValue(save, indexes.extra),
    horn: Math.max(hornRaw % 100, 0),
    special: Math.min(specialRaw, 0),
    hairColor,
    hornColor: genderName === "female" ? 1 : hornColorBase === 0 ? hairColor : hornColorBase,
    frameId: indexes.frameId == null ? 0 : safeValue(save, indexes.frameId),
  };
};
