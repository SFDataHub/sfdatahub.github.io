import type { PlayerCardData, PlayerCardPotion } from "../../components/player-card/types";
import { resolvePotionAssetKey } from "../../components/potions/potionAssets";
import { getGuildClassAccent } from "../../components/guilds/classColors";
import { getClassMetaById, iconForClassName, type ClassMeta } from "../../data/classes";
import { guideAssetByKey } from "../../data/guidehub/assets";
import type { NormalizedGuildRole } from "../../lib/guilds/guildScanNormalizer";
import type { LocalPlayerIndexPlayer } from "../../lib/player-search/localPlayerIndex";
import type { PlayerCardDevelopmentSummary } from "../../lib/player-progress/playerCardDevelopment";
import { normalizeSfPlayerPotions } from "../../lib/parsing/normalizedConsumables";
import { normalizeSfPlayerCharacterCore } from "../../lib/parsing/normalizedPlayer";
import { readSfPlayerStats } from "../../lib/parsing/parseSfJson";
import { readSfPlayerSaveArray } from "../../lib/parsing/playerSaveLayout";
import { createPortraitOptionsFromSaveArray } from "../../lib/portraitFromSave";
import { toDriveThumbProxy } from "../../lib/urls";

type JsonRecord = Record<string, unknown>;

export type DashboardMemberView = "cards" | "list";
export type DashboardPlayerCardDevelopmentStatus = "loading" | "ready" | "unavailable" | "error";

export type DashboardPlayerCardMember = {
  key: string;
  name: string;
  classLabel: string | null;
  classMeta: ClassMeta | null;
  level: number | null;
  hofRank: number | null;
  guildRole?: NormalizedGuildRole;
  localRef?: {
    sourceScanId: string;
    sourcePlayerKey: string;
    identifier: string | null;
    playerId: string | null;
    server: string | null;
  };
};

export type DashboardPlayerCardItem<TMember extends DashboardPlayerCardMember = DashboardPlayerCardMember> = {
  member: TMember;
  card: PlayerCardData;
  indexedPlayer: LocalPlayerIndexPlayer | null;
  development: PlayerCardDevelopmentSummary | null;
  developmentStatus: DashboardPlayerCardDevelopmentStatus;
  developmentError: string | null;
};

const ROLE_LABELS: Record<Exclude<NormalizedGuildRole, null>, string> = {
  leader: "Leader",
  officer: "Officer",
  member: "Member",
};

export const DEFAULT_DASHBOARD_MEMBER_VIEW: DashboardMemberView = "cards";
export const DASHBOARD_MEMBER_GRID_DESKTOP_COLUMNS = 5;

export function sortDashboardMembers<T extends { guildRole?: NormalizedGuildRole; level: number | null; name: string }>(
  members: T[],
) {
  return [...members].sort((a, b) => {
    const byName = () => a.name.localeCompare(b.name, "de-DE", { sensitivity: "base" });
    const roleOrder: Record<Exclude<NormalizedGuildRole, null>, number> = { leader: 0, officer: 1, member: 2 };
    const aRole = a.guildRole ? roleOrder[a.guildRole] : 3;
    const bRole = b.guildRole ? roleOrder[b.guildRole] : 3;
    if (aRole !== bRole) return aRole - bRole;

    const aLevel = a.level;
    const bLevel = b.level;
    const aLevelMissing = aLevel == null;
    const bLevelMissing = bLevel == null;
    if (aLevelMissing || bLevelMissing) {
      if (aLevelMissing && bLevelMissing) return byName();
      return aLevelMissing ? 1 : -1;
    }

    return bLevel - aLevel || byName();
  });
}

export function buildDashboardPlayerCardItems<TMember extends DashboardPlayerCardMember>({
  members,
  players,
  currentSourceScanId,
  currentTimestampMs,
  baseItems,
  developmentStatus = "ready",
  developmentError = null,
}: {
  members: TMember[];
  players: LocalPlayerIndexPlayer[];
  currentSourceScanId: string;
  currentTimestampMs: number;
  baseItems?: DashboardPlayerCardItem<TMember>[];
  developmentStatus?: DashboardPlayerCardDevelopmentStatus;
  developmentError?: string | null;
}): DashboardPlayerCardItem<TMember>[] {
  const currentPlayersByKey = new Map<string, LocalPlayerIndexPlayer>();
  const baseByMemberKey = new Map((baseItems ?? []).map((item) => [item.member.key, item]));
  players.forEach((player) => {
    if (player.sourceScanId !== currentSourceScanId || player.scannedAtMs !== currentTimestampMs) return;
    currentPlayersByKey.set(player.key.toLowerCase(), player);
  });

  return members.map((member) => {
    const indexedPlayer = findIndexedPlayerForMember(member, currentPlayersByKey);
    const baseItem = baseByMemberKey.get(member.key) ?? null;
    const baseCard = baseItem?.card ?? buildFallbackPlayerCard(member);
    const development = indexedPlayer?.development ?? null;
    return {
      member,
      indexedPlayer,
      card: baseCard,
      development,
      developmentStatus: development ? "ready" : baseItem?.developmentStatus ?? developmentStatus,
      developmentError,
    };
  });
}

export function buildDashboardStaticPlayerCardItems<TMember extends DashboardPlayerCardMember>({
  members,
  playerLookup,
  developmentStatus = "loading",
  developmentError = null,
}: {
  members: TMember[];
  playerLookup: ReadonlyMap<string, JsonRecord>;
  developmentStatus?: DashboardPlayerCardDevelopmentStatus;
  developmentError?: string | null;
}): DashboardPlayerCardItem<TMember>[] {
  return members.map((member) => ({
    member,
    indexedPlayer: null,
    card: buildStaticPlayerCard(member, resolveRawPlayerForMember(member, playerLookup)),
    development: null,
    developmentStatus,
    developmentError,
  }));
}

export function findIndexedPlayerForMember(
  member: DashboardPlayerCardMember,
  playersByKey: ReadonlyMap<string, LocalPlayerIndexPlayer>,
) {
  for (const key of buildMemberIndexKeys(member)) {
    const player = playersByKey.get(key);
    if (player) return player;
  }
  return null;
}

function buildMemberIndexKeys(member: DashboardPlayerCardMember) {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const key = String(value ?? "").trim().toLowerCase();
    if (key) keys.add(key);
  };
  add(member.localRef?.identifier ? `identifier:${member.localRef.identifier}` : null);
  add(member.localRef?.sourcePlayerKey ? `identifier:${member.localRef.sourcePlayerKey}` : null);
  add(member.key ? `identifier:${member.key}` : null);
  if (member.localRef?.server && member.localRef.playerId) {
    add(`server-player-id:${member.localRef.server}:p${member.localRef.playerId}`);
  }
  if (member.localRef?.sourceScanId) {
    add(`scan-name:${member.localRef.sourceScanId}:${normalizeSearch(member.name)}`);
  }
  return [...keys];
}

function resolveRawPlayerForMember(member: DashboardPlayerCardMember, playerLookup: ReadonlyMap<string, JsonRecord>) {
  const sourceKey = member.localRef?.sourcePlayerKey;
  if (!sourceKey) return null;
  return playerLookup.get(sourceKey) ?? playerLookup.get(sourceKey.toLowerCase()) ?? null;
}

function buildStaticPlayerCard(
  member: DashboardPlayerCardMember,
  rawPlayer: JsonRecord | null,
): PlayerCardData {
  if (!rawPlayer) return buildFallbackPlayerCard(member);
  const normalized = safeNormalizePlayer(rawPlayer);
  const stats = readSfPlayerStats(rawPlayer);
  const classId = normalized?.identity.class ?? stats.classId ?? member.classLabel;
  const classMeta = getClassMetaById(classId) ?? member.classMeta;
  const className = classMeta?.label ?? member.classLabel;
  const icon = iconForClassName(className);
  const iconUrl = icon.url ? toDriveThumbProxy(icon.url, 96) : undefined;
  const saveArray = toNumberArray(readSfPlayerSaveArray(rawPlayer));
  const portrait = saveArray
    ? createPortraitOptionsFromSaveArray(saveArray, { own: rawPlayer.own, saveVersion: rawPlayer.saveVersion, save: saveArray })
    : undefined;

  return {
    name: normalized?.identity.name ?? readString(rawPlayer, ["name", "Name", "playerName", "Player Name"]) ?? member.name,
    className,
    classIconUrl: iconUrl,
    classIconFallback: icon.fallback ?? classMeta?.fallback ?? "?",
    classAccent: getGuildClassAccent(classMeta?.key ?? className) ?? null,
    level: normalized?.progression.level ?? stats.level ?? member.level,
    guildRole: member.guildRole ? ROLE_LABELS[member.guildRole] : "-",
    hofRank: normalized?.progression.rank ?? readNumber(rawPlayer, ["hallOfFameRank", "Hall of Fame Rank", "hofRank", "HoF", "rank", "Rank"]) ?? member.hofRank,
    potions: buildPlayerCardPotions(rawPlayer, saveArray),
    portrait,
    hasPortrait: Boolean(portrait),
    portraitFallbackUrl: null,
    portraitFallbackLabel: "Portrait nicht verfügbar",
  };
}

function buildFallbackPlayerCard(member: DashboardPlayerCardMember): PlayerCardData {
  const icon = iconForClassName(member.classLabel);
  const rawClassIconUrl = member.classMeta?.iconUrl ?? icon.url;
  const classIconUrl = rawClassIconUrl ? toDriveThumbProxy(rawClassIconUrl, 96) : undefined;
  return {
    name: member.name,
    className: member.classLabel,
    classIconUrl,
    classIconFallback: icon.fallback ?? member.classMeta?.fallback ?? "?",
    classAccent: getGuildClassAccent(member.classMeta?.key ?? member.classLabel) ?? null,
    level: member.level,
    guildRole: member.guildRole ? ROLE_LABELS[member.guildRole] : "-",
    hofRank: member.hofRank,
    hasPortrait: false,
    portraitFallbackUrl: null,
    portraitFallbackLabel: "Portrait nicht verfügbar",
    potions: [],
  };
}

function buildPlayerCardPotions(player: JsonRecord, saveArray: number[] | null): PlayerCardPotion[] {
  const normalized = normalizeSfPlayerPotions(player, { saveArray });
  return (
    normalized?.slots
      .map((slot): PlayerCardPotion | null => {
        if (!slot.attribute) return null;
        const assetKey = resolvePotionAssetKey(slot.attribute, slot.size);
        const asset = assetKey ? guideAssetByKey(assetKey, 128) : null;
        const label = formatPotionLabel(slot.attribute, slot.size);
        return {
          slot: (slot.slot + 1) as 1 | 2 | 3,
          type: slot.attribute,
          size: slot.size,
          assetKey,
          iconUrl: asset?.thumb ?? null,
          label,
        };
      })
      .filter((potion): potion is PlayerCardPotion => Boolean(potion)) ?? []
  );
}

function formatPotionLabel(type: string, size: number | null) {
  const typeLabel =
    {
      strength: "Strength",
      dexterity: "Dexterity",
      intelligence: "Intelligence",
      constitution: "Constitution",
      luck: "Luck",
      life: "Life",
    }[type] ?? "Potion";
  return size != null && type !== "life" ? `${typeLabel} potion ${size}%` : `${typeLabel} potion`;
}

function safeNormalizePlayer(player: JsonRecord) {
  try {
    return normalizeSfPlayerCharacterCore(player);
  } catch {
    return null;
  }
}

function toNumberArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry)) : null;
}

function readString(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function readNumber(record: JsonRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  if (value == null || value === "") return null;
  const parsed = Number(String(value).trim().replace(/\s+/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirst(record: JsonRecord, keys: string[]) {
  const lookup = new Map<string, string>();
  Object.keys(record).forEach((key) => {
    const canonical = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (canonical && !lookup.has(canonical)) lookup.set(canonical, key);
  });
  for (const key of keys) {
    const direct = record[key];
    if (direct != null && String(direct).trim()) return direct;
    const resolved = lookup.get(key.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    const value = resolved ? record[resolved] : undefined;
    if (value != null && String(value).trim()) return value;
  }
  return undefined;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}
