import type { PortraitOptions } from "../components/player-profile/types";
import {
  extractPortraitFromSaveArray,
  parseSaveStringToArray,
} from "./parsing/extractPortrait";
import type { PortraitSaveLayoutSource } from "./parsing/portraitSaveLayout";

export { parseSaveStringToArray };

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

const mapFrameIdToName = (frameId: number | null | undefined): PortraitOptions["frame"] => {
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

export function createPortraitOptionsFromSaveArray(
  save: number[],
  source?: PortraitSaveLayoutSource,
): PortraitOptions {
  const decoded = extractPortraitFromSaveArray(save, source);
  const appearance = decoded.appearance;
  const rendererHairColor = appearance.hair.color > 0 ? appearance.hair.color : DEFAULT_PORTRAIT_OPTIONS.hairColor;
  const rendererHornColor = appearance.horn.color ?? (appearance.gender === "female" ? 1 : rendererHairColor);
  const portrait: PortraitOptions = {
    ...DEFAULT_PORTRAIT_OPTIONS,
    genderName: appearance.gender ?? DEFAULT_PORTRAIT_OPTIONS.genderName,
    class: appearance.classId,
    race: appearance.raceId,
    mouth: appearance.mouth,
    hair: appearance.hair.style,
    brows: appearance.brows.style,
    eyes: appearance.eyes,
    beard: appearance.beard.none ? 0 : appearance.beard.style ?? 0,
    nose: appearance.nose,
    ears: appearance.ears,
    extra: appearance.extra,
    horn: appearance.horn.renderable ? appearance.horn.style ?? 0 : 0,
    special: appearance.specialPortrait.active ? appearance.specialPortrait.sourceValue : 0,
    hairColor: rendererHairColor,
    hornColor: rendererHornColor,
    frame: mapFrameIdToName(decoded.frame.frameId),
  };

  return portrait;
}

export function createPortraitOptionsFromSaveString(
  saveString: string,
  source?: PortraitSaveLayoutSource,
): PortraitOptions {
  const parsed = parseSaveStringToArray(saveString);
  return createPortraitOptionsFromSaveArray(parsed, source);
}
