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
  special2: number;
  portrait: number;
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
  special2: 25,
  portrait: 26,
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
  special2: 16,
  portrait: 17,
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

  if (save.length === 70) return "currentCompact";
  if (save.length >= 650) return "legacyOwn";
  if (save.length >= 256) return "legacyOther";

  return "legacyOwn";
};

const getPortraitIndexes = (layout: SfPlayerSaveLayout): PortraitIndexes => {
  if (layout === "currentCompact" || layout === "legacyOther") return COMPACT_PORTRAIT_INDEXES;
  return LEGACY_OWN_PORTRAIT_INDEXES;
};

const resolveGenderName = (
  genderByte: number,
): SfJsonPortrait["genderName"] => {
  if (genderByte === 1) return "male";
  if (genderByte === 2) return "female";
  return null;
};

const positiveModulo100 = (value: number) => Math.max(value % 100, 0);

const colorPrefix = (value: number) => Math.floor(value / 100);

const isDemon = (raceId: number) => raceId === 8;

const resolveHorn = (
  raceId: number,
  genderName: SfJsonPortrait["genderName"],
  special2Style: number,
  rendererHairColor: number,
): SfJsonPortrait["appearance"]["horn"] => {
  if (!isDemon(raceId) || (genderName !== "male" && genderName !== "female")) {
    return {
      supported: false,
      renderable: false,
      style: null,
      color: null,
      colorSource: null,
    };
  }

  const maxStyle = genderName === "female" ? 4 : 11;
  const renderable = special2Style > 0 && special2Style <= maxStyle;

  return {
    supported: true,
    renderable,
    style: renderable ? special2Style : null,
    color: renderable ? (genderName === "female" ? 1 : rendererHairColor) : null,
    colorSource: renderable
      ? genderName === "female"
        ? "fixedFemaleDemon"
        : "rendererDerivedHairColor"
      : null,
  };
};

export const extractPortraitFromSaveArrayWithLayout = (
  save: number[],
  source?: PortraitSaveLayoutSource,
): SfJsonPortrait => {
  const layout = resolvePortraitSaveLayout(save, source);
  const indexes = getPortraitIndexes(layout);
  const hairRaw = safeValue(save, indexes.hair);
  const browsRaw = safeValue(save, indexes.brows);
  const beardRaw = safeValue(save, indexes.beard);
  const special2Raw = safeValue(save, indexes.special2);
  const portraitRaw = safeValue(save, indexes.portrait);
  const genderByte = safeValue(save, indexes.gender) & 0xff;

  const hairColor = colorPrefix(hairRaw);
  const rendererHairColor = Math.max(hairColor, 1);
  const browsColor = colorPrefix(browsRaw);
  const beardColor = colorPrefix(beardRaw);
  const special2Style = positiveModulo100(special2Raw);
  const special2Color = colorPrefix(special2Raw);
  const beardStyle = positiveModulo100(beardRaw);
  const beardNone = beardStyle === 99;
  const genderName = resolveGenderName(genderByte);
  const raceId = safeValue(save, indexes.race) & 0xffff;
  const classId = safeValue(save, indexes.class) & 0xffff;
  const horn = resolveHorn(raceId, genderName, special2Style, rendererHairColor);
  const specialPortrait =
    portraitRaw < 0
      ? {
          active: true,
          id: Math.abs(portraitRaw),
          sourceValue: portraitRaw,
          status: "active" as const,
        }
      : portraitRaw > 0
        ? {
            active: false,
            id: null,
            sourceValue: portraitRaw,
            status: "unsupportedPositive" as const,
          }
        : {
            active: false,
            id: null,
            sourceValue: portraitRaw,
            status: "inactive" as const,
          };
  const frameId = indexes.frameId == null ? null : safeValue(save, indexes.frameId);
  const frameStatus = indexes.frameId == null ? "unsupported" : frameId == null ? "missing" : "available";

  return {
    status: layout === "unknown" ? "unsupported" : "available",
    layout,
    appearance: {
      classId,
      raceId,
      gender: genderName,
      mouth: safeValue(save, indexes.mouth),
      hair: { style: positiveModulo100(hairRaw), color: hairColor },
      brows: { style: positiveModulo100(browsRaw), color: browsColor },
      eyes: safeValue(save, indexes.eyes),
      beard: {
        style: beardNone ? null : beardStyle,
        color: beardColor,
        none: beardNone,
      },
      nose: safeValue(save, indexes.nose),
      ears: safeValue(save, indexes.ears),
      extra: safeValue(save, indexes.extra),
      special2: {
        raw: special2Raw,
        style: special2Style,
        color: special2Color,
      },
      horn,
      specialPortrait,
    },
    frame: {
      status: frameStatus,
      frameId,
    },
    metadata: {
      hairColorSource: "raw",
      browsColorSource: "raw",
      beardColorSource: "raw",
      hornColorSource: horn.colorSource == null ? "none" : "rendererDerived",
      compatibilityFrameIdFallback: 0,
    },
    genderName,
    classId,
    raceId,
    mouth: safeValue(save, indexes.mouth),
    hair: positiveModulo100(hairRaw),
    brows: positiveModulo100(browsRaw),
    eyes: safeValue(save, indexes.eyes),
    beard: beardNone ? 0 : beardStyle,
    beardColor,
    beardNone,
    nose: safeValue(save, indexes.nose),
    ears: safeValue(save, indexes.ears),
    extra: safeValue(save, indexes.extra),
    horn: horn.renderable ? horn.style ?? 0 : 0,
    special2: special2Raw,
    special: specialPortrait.active ? specialPortrait.sourceValue : 0,
    hairColor,
    browsColor,
    hornColor: horn.color ?? 1,
    frameId: frameId ?? 0,
  };
};
