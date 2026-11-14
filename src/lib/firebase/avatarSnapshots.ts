import type { Timestamp } from "firebase/firestore";
import type { PortraitOptions } from "../../components/player-profile/types";
import { DEFAULT_PORTRAIT } from "../../components/player-profile/types";
import type { SfJsonPortrait } from "../parsing/types";

export type AvatarSnapshotPortrait = {
  genderName: "male" | "female" | null;
  classId: number;
  raceId: number;
  mouth: number;
  hair: number;
  hairColor: number;
  horn: number;
  hornColor: number;
  brows: number;
  eyes: number;
  beard: number;
  nose: number;
  ears: number;
  extra: number;
  special: number;
  frameId: number;
  frame?: PortraitOptions["frame"];
  background?: PortraitOptions["background"];
  showBorder?: boolean;
  mirrorHorizontal?: boolean;
};

export type AvatarSnapshot = {
  playerId: number;
  server: string;
  portrait: AvatarSnapshotPortrait;
  updatedAt: Timestamp | null;
  hasPortraitData: boolean;
};

const toNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const createAvatarSnapshotPortraitFromSfJsonPortrait = (
  portrait: SfJsonPortrait,
): AvatarSnapshotPortrait => ({
  genderName: portrait.genderName,
  classId: portrait.classId,
  raceId: portrait.raceId,
  mouth: portrait.mouth,
  hair: portrait.hair,
  hairColor: portrait.hairColor,
  horn: portrait.horn,
  hornColor: portrait.hornColor,
  brows: portrait.brows,
  eyes: portrait.eyes,
  beard: portrait.beard,
  nose: portrait.nose,
  ears: portrait.ears,
  extra: portrait.extra,
  special: portrait.special,
  frameId: portrait.frame.frameId ?? 0,
});

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

const validFrames: PortraitOptions["frame"][] = [
  "",
  "goldenFrame",
  "twitchFrame",
  "zenFrame",
  "silverFrame",
  "worldBossFrameGold",
  "worldBossFrameSilver",
  "worldBossFrameBronze",
  "polarisFrame",
];

const validBackgrounds: PortraitOptions["background"][] = [
  "",
  "white",
  "black",
  "gradient",
  "transparentGradient",
  "retroGradient",
  "stained",
  "hvGold",
  "hvSilver",
  "hvBronze",
];

export const createPortraitOptionsFromAvatarSnapshot = (
  snapshot: AvatarSnapshot,
  base?: PortraitOptions,
): PortraitOptions => {
  const portrait = snapshot?.portrait || {};
  const seed: PortraitOptions = { ...DEFAULT_PORTRAIT, ...(base || {}) };
  const frameById = mapFrameIdToName(toNumber(portrait.frameId, 0));
  const frameFromName =
    typeof portrait.frame === "string" && validFrames.includes(portrait.frame) ? portrait.frame : "";
  const backgroundFromSnapshot =
    typeof portrait.background === "string" && validBackgrounds.includes(portrait.background)
      ? portrait.background
      : seed.background;

  return {
    ...seed,
    genderName: portrait.genderName === "female" ? "female" : seed.genderName,
    class: toNumber(portrait.classId, seed.class),
    race: toNumber(portrait.raceId, seed.race),
    mouth: toNumber(portrait.mouth, seed.mouth),
    hair: toNumber(portrait.hair, seed.hair),
    hairColor: toNumber(portrait.hairColor, seed.hairColor),
    horn: toNumber(portrait.horn, seed.horn),
    hornColor: toNumber(portrait.hornColor, seed.hornColor),
    brows: toNumber(portrait.brows, seed.brows),
    eyes: toNumber(portrait.eyes, seed.eyes),
    beard: toNumber(portrait.beard, seed.beard),
    nose: toNumber(portrait.nose, seed.nose),
    ears: toNumber(portrait.ears, seed.ears),
    extra: toNumber(portrait.extra, seed.extra),
    special: toNumber(portrait.special, seed.special),
    frame: frameById || frameFromName || seed.frame || "",
    background: backgroundFromSnapshot,
    showBorder: typeof portrait.showBorder === "boolean" ? portrait.showBorder : seed.showBorder,
    mirrorHorizontal:
      typeof portrait.mirrorHorizontal === "boolean"
        ? portrait.mirrorHorizontal
        : seed.mirrorHorizontal,
  };
};
