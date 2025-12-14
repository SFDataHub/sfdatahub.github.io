import { doc, getDoc, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { PortraitOptions } from "../../components/player-profile/types";
import { DEFAULT_PORTRAIT } from "../../components/player-profile/types";
import { traceGetDoc, type FirestoreTraceScope } from "../debug/firestoreReadTrace";

export type AvatarSnapshotPortrait = {
  genderName: "male" | "female";
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

const hasPortraitValues = (raw: any) =>
  raw && typeof raw === "object" && Object.values(raw).some((v) => v !== undefined && v !== null);

const normalizeServerCandidates = (value: unknown): string[] => {
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  const normalized = raw
    .toLowerCase()
    .replace(/sfgame/g, "")
    .replace(/\./g, "_")
    .replace(/__+/g, "_")
    .replace(/^_|_$/g, "");
  return normalized ? [normalized] : [];
};

const avatarCache = new Map<string, AvatarSnapshot | null>();
const AVATAR_CACHE_PREFIX = "avatar-cache:";
const AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const fetchAvatarSnapshotByPlayer = async (
  playerId: number,
  server: string,
  identifier?: string,
  traceScope?: FirestoreTraceScope | null,
): Promise<AvatarSnapshot | null> => {
  const pidNum = Number(playerId);
  const pidStr = String(playerId ?? "").trim();
  const primaryServer = normalizeServerCandidates(server)[0] ?? "";
  const explicitIdentifier = typeof identifier === "string" && identifier.trim() ? identifier.trim() : "";

  const normalizeIdentifier = (value: string) => {
    if (!value) return "";
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return "";
    const fromPath = trimmed.split("/").filter(Boolean).pop() || trimmed;
    const [pidPart, ...rawServerParts] = fromPath.split("__");
    const rawServerPart = rawServerParts.join("__");
    if (pidPart && rawServerPart) {
      const normalizedServer = normalizeServerCandidates(rawServerPart)[0];
      if (normalizedServer) return `${pidPart}__${normalizedServer}`;
    }
    if (pidStr && primaryServer) return `${pidStr}__${primaryServer}`;
    return fromPath
      .replace(/sfgame/g, "")
      .replace(/\./g, "_")
      .replace(/__+/g, "_")
      .replace(/^_|_$/g, "");
  };

  const identifierNormalized =
    normalizeIdentifier(explicitIdentifier) || (pidStr && primaryServer ? `${pidStr}__${primaryServer}` : "");

  if (!identifierNormalized) return null;

  const loadCached = () => {
    if (avatarCache.has(identifierNormalized)) {
      return avatarCache.get(identifierNormalized) ?? null;
    }
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(`${AVATAR_CACHE_PREFIX}${identifierNormalized}`) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || typeof parsed.savedAt !== "number") return null;
      const isFresh = Date.now() - parsed.savedAt < AVATAR_CACHE_TTL_MS;
      if (!isFresh) return null;
      return parsed.data as AvatarSnapshot;
    } catch {
      return null;
    }
  };

  const cached = loadCached();
  if (cached) {
    avatarCache.set(identifierNormalized, cached);
    return cached;
  }

  const directDoc = await traceGetDoc(
    traceScope ?? null,
    doc(db, "linked_players", "avatars", "avatars", identifierNormalized),
    () => getDoc(doc(db, "linked_players", "avatars", "avatars", identifierNormalized)),
  );
  if (!directDoc.exists()) {
    avatarCache.set(identifierNormalized, null);
    return null;
  }

  const data = directDoc.data() as any;
  const portraitRaw = data?.portrait || {};
  const hasPortraitData = hasPortraitValues(portraitRaw);

  const portrait: AvatarSnapshotPortrait = {
    genderName: portraitRaw?.genderName === "female" ? "female" : "male",
    classId: toNumber(portraitRaw?.classId),
    raceId: toNumber(portraitRaw?.raceId),
    mouth: toNumber(portraitRaw?.mouth),
    hair: toNumber(portraitRaw?.hair),
    hairColor: toNumber(portraitRaw?.hairColor),
    horn: toNumber(portraitRaw?.horn),
    hornColor: toNumber(portraitRaw?.hornColor),
    brows: toNumber(portraitRaw?.brows),
    eyes: toNumber(portraitRaw?.eyes),
    beard: toNumber(portraitRaw?.beard),
    nose: toNumber(portraitRaw?.nose),
    ears: toNumber(portraitRaw?.ears),
    extra: toNumber(portraitRaw?.extra),
    special: toNumber(portraitRaw?.special),
    frameId: toNumber(portraitRaw?.frameId),
    frame: typeof portraitRaw?.frame === "string" ? portraitRaw.frame : undefined,
    background: typeof portraitRaw?.background === "string" ? portraitRaw.background : undefined,
    showBorder: typeof portraitRaw?.showBorder === "boolean" ? portraitRaw.showBorder : undefined,
    mirrorHorizontal:
      typeof portraitRaw?.mirrorHorizontal === "boolean" ? portraitRaw.mirrorHorizontal : undefined,
  };

  const snapshot: AvatarSnapshot = {
    playerId: toNumber(data?.playerId, pidNum),
    server: typeof data?.server === "string" ? data.server : server,
    portrait,
    updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
    hasPortraitData,
  };

  avatarCache.set(identifierNormalized, snapshot);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        `${AVATAR_CACHE_PREFIX}${identifierNormalized}`,
        JSON.stringify({ data: snapshot, savedAt: Date.now() }),
      );
    } catch {
      // ignore cache write failures
    }
  }
  return snapshot;
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
