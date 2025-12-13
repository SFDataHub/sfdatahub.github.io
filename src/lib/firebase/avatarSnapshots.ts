import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { PortraitOptions } from "../../components/player-profile/types";
import { DEFAULT_PORTRAIT } from "../../components/player-profile/types";

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

export const fetchAvatarSnapshotByPlayer = async (
  playerId: number,
  server: string,
  identifier?: string,
): Promise<AvatarSnapshot | null> => {
  const pidNum = Number(playerId);
  const pidStr = String(playerId ?? "").trim();
  const serverCandidates = normalizeServerCandidates(server);
  const primaryServer = serverCandidates[0];
  const explicitIdentifier = typeof identifier === "string" && identifier.trim() ? identifier.trim() : "";
  const normalizeIdentifierCandidate = (value: string) => {
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
  const generatedIdentifier =
    primaryServer && pidStr ? `${pidStr}__${primaryServer}` : "";
  const identifierCandidates = [explicitIdentifier, generatedIdentifier]
    .map(normalizeIdentifierCandidate)
    .filter(Boolean)
    .reduce<string[]>((acc, val) => {
      if (!acc.includes(val)) acc.push(val);
      return acc;
    }, []);
  const cg = collectionGroup(db, "avatars");

  if (identifierCandidates.length) {
    console.debug("[avatars] identifier candidates", identifierCandidates);
  } else {
    console.debug("[avatars] no identifier candidates for", { playerId, server });
  }

  for (const ident of identifierCandidates) {
    const docPath = `linked_players/avatars/avatars/${ident}`;
    console.debug("[avatars] lookup direct doc", docPath);
    const directByIdentifier = await getDoc(doc(db, "linked_players", "avatars", "avatars", ident));
    if (directByIdentifier.exists()) {
      const data = directByIdentifier.data() as any;
      const portraitRaw = data?.portrait || {};
      const hasPortraitData = hasPortraitValues(portraitRaw);
      return {
        playerId: toNumber(data?.playerId, pidNum),
        server: typeof data?.server === "string" ? data.server : server,
        portrait: {
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
        },
        updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
        hasPortraitData,
      };
    }
  }

  const tryQuery = async (pid: string | number, srv?: string | null) => {
    const filters = [where("playerId", "==", pid)];
    if (srv) filters.push(where("server", "==", srv));
    const q = query(cg, ...filters, limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0];
  };

  let docSnap: any = null;

  if (Number.isFinite(pidNum)) {
    for (const srv of serverCandidates) {
      docSnap = await tryQuery(pidNum, srv);
      if (docSnap) break;
    }
  }

  if (!docSnap && pidStr) {
    for (const srv of serverCandidates) {
      docSnap = await tryQuery(pidStr, srv);
      if (docSnap) break;
    }
  }

  // Fallback: try without server filter (any server) if still nothing
  if (!docSnap) {
    if (Number.isFinite(pidNum)) {
      console.debug("[avatars] fallback: any server numeric pid", pidNum);
      docSnap = await tryQuery(pidNum, null);
    }
    if (!docSnap && pidStr) {
      console.debug("[avatars] fallback: any server string pid", pidStr);
      docSnap = await tryQuery(pidStr, null);
    }
  }

  // Fallback: direct doc under linked_players/avatars/{server__playerId} or variants
  if (!docSnap && pidStr && serverCandidates.length > 0) {
    for (const srv of serverCandidates) {
      const compositeIds = [
        `${pidStr}__${srv}`,
        `${srv}__${pidStr}`,
        `${srv}_${pidStr}`,
        `${pidStr}_${srv}`,
      ];
      for (const candidate of compositeIds) {
        console.debug("[avatars] fallback direct doc", candidate);
        const direct = await getDoc(doc(db, "linked_players", "avatars", "avatars", candidate));
        if (direct.exists()) {
          docSnap = direct as any;
          break;
        }
      }
      if (docSnap) break;
    }
  }

  if (!docSnap) return null;

  const data = docSnap.data() as any;
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

  return {
    playerId: toNumber(data?.playerId, playerId),
    server: typeof data?.server === "string" ? data.server : server,
    portrait,
    updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
    hasPortraitData,
  };
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
