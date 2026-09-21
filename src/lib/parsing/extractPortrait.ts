import type { SfJsonPortrait } from "./types";
import {
  extractPortraitFromSaveArrayWithLayout,
  type PortraitSaveLayoutSource,
} from "./portraitSaveLayout";
import { parseSaveStringToArray } from "./saveString";

export { parseSaveStringToArray };

export const extractPortraitFromSaveArray = (
  save: number[],
  source?: PortraitSaveLayoutSource,
): SfJsonPortrait => extractPortraitFromSaveArrayWithLayout(save, source);
