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

export function createPortraitOptionsFromSaveArray(
  save: number[],
  source?: PortraitSaveLayoutSource,
): PortraitOptions {
  const decoded = extractPortraitFromSaveArray(save, source);
  const portrait: PortraitOptions = {
    ...DEFAULT_PORTRAIT_OPTIONS,
    genderName: decoded.genderName,
    class: decoded.classId,
    race: decoded.raceId,
    mouth: decoded.mouth,
    hair: decoded.hair,
    brows: decoded.brows,
    eyes: decoded.eyes,
    beard: decoded.beard,
    nose: decoded.nose,
    ears: decoded.ears,
    extra: decoded.extra,
    horn: decoded.horn,
    special: decoded.special,
    hairColor: decoded.hairColor,
    hornColor: decoded.hornColor,
    frame: mapFrameIdToName(decoded.frameId),
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
