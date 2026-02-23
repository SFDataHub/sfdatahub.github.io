import { doc, getDoc, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
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

export type AvatarSnapshotSource = "scanUpload" | "connectChar";

const toNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const hasPortraitValues = (raw: any) =>
  raw && typeof raw === "object" && Object.values(raw).some((v) => v !== undefined && v !== null);

const avatarCache = new Map<string, AvatarSnapshot | null>();
const AVATAR_CACHE_PREFIX = "avatar-cache:";
const AVATAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeAvatarSnapshotIdentifier = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.split("/").filter(Boolean).pop() || "";
};

const parsePlayerIdFromIdentifier = (identifier: string): number => {
  const match = identifier.match(/_p(\d+)$/i);
  if (!match) return 0;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseServerFromIdentifier = (identifier: string): string => {
  const match = identifier.match(/^(.+)_p\d+$/i);
  return match?.[1] ?? "";
};

const readAvatarCacheFromStorage = (identifier: string): AvatarSnapshot | null => {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`${AVATAR_CACHE_PREFIX}${identifier}`)
        : null;
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

const writeAvatarCacheToStorage = (identifier: string, snapshot: AvatarSnapshot) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${AVATAR_CACHE_PREFIX}${identifier}`,
      JSON.stringify({ data: snapshot, savedAt: Date.now() }),
    );
  } catch {
    // ignore cache write failures
  }
};

export const fetchAvatarSnapshotByIdentifier = async (
  identifier: string | undefined,
  traceScope?: FirestoreTraceScope | null,
): Promise<AvatarSnapshot | null> => {
  const identifierNormalized = normalizeAvatarSnapshotIdentifier(identifier);
  if (!identifierNormalized) return null;

  if (avatarCache.has(identifierNormalized)) {
    return avatarCache.get(identifierNormalized) ?? null;
  }

  const cached = readAvatarCacheFromStorage(identifierNormalized);
  if (cached) {
    avatarCache.set(identifierNormalized, cached);
    return cached;
  }

  const directDocRef = doc(db, "linked_players", "avatars", "avatars", identifierNormalized);
  const directDoc = await traceGetDoc(traceScope ?? null, directDocRef, () => getDoc(directDocRef));
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
    playerId: toNumber(data?.playerId, parsePlayerIdFromIdentifier(identifierNormalized)),
    server:
      typeof data?.server === "string" && data.server.trim()
        ? data.server
        : parseServerFromIdentifier(identifierNormalized),
    portrait,
    updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
    hasPortraitData,
  };

  avatarCache.set(identifierNormalized, snapshot);
  writeAvatarCacheToStorage(identifierNormalized, snapshot);
  return snapshot;
};

export const saveAvatarSnapshotForIdentifier = async (params: {
  userId: string;
  identifier: string;
  playerId: number;
  server: string;
  source?: AvatarSnapshotSource;
  portrait: AvatarSnapshotPortrait;
}): Promise<void> => {
  const identifierNormalized = normalizeAvatarSnapshotIdentifier(params.identifier);
  if (!identifierNormalized) {
    throw new Error("Missing avatar identifier");
  }

  const payload = {
    userId: String(params.userId ?? "").trim(),
    playerId: toNumber(params.playerId),
    server: String(params.server ?? "").trim(),
    source: params.source ?? "connectChar",
    portrait: params.portrait,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "linked_players", "avatars", "avatars", identifierNormalized), payload, {
    merge: true,
  });

  const snapshot: AvatarSnapshot = {
    playerId: payload.playerId,
    server: payload.server,
    portrait: { ...params.portrait },
    updatedAt: null,
    hasPortraitData: true,
  };
  avatarCache.set(identifierNormalized, snapshot);
  writeAvatarCacheToStorage(identifierNormalized, snapshot);
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
