import type { LocalPlayerCurrentSeed } from "../../pages/GuildHub/localPlayerCurrentSeed";
import type { PortraitOptions } from "../player-profile/types";
import type { AttributeCompositionModel } from "../attribute-composition/attributeCompositionModel";

export type LocalHeroActionKey = "open-player" | "open-guild" | "share" | "copy-link";

export type LocalHeroMetric = {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning";
  gauge?: {
    progress: number;
    centerTop: string;
    centerBottom?: string;
    details?: string[];
  };
};

export type LocalHeroBadge = LocalHeroMetric & { icon?: string };

export type LocalBaseStatValues = {
  str: number;
  dex: number;
  int: number;
  con: number;
  lck: number;
};

export type LocalPotionSlot = {
  slot: 1 | 2 | 3;
  type: string | null;
  size: number | null;
};

export type LocalHeroPanelData = {
  metricValues?: { level: number | null; xp: number | null; xpNext: number | null; scrapbookRatio: number | null;
    scrapbookCount: number | null; scrapbookMaximum: number | null };
  playerInfo?: {
    level: number | null;
    hofRank: number | null;
    honor: number | null;
    guildRole: string | null;
    roleKey?: "leader" | "officer" | "member" | null;
  };
  fortressBuildings?: import("../../lib/parsing/normalizedFortress").NormalizedFortress["buildings"] | null;
  profileAttributeSums?: import("../../lib/players/profileAttributeSums").ProfileAttributeSums;
  playerName: string;
  className?: string | null;
  guild?: string | null;
  guildIdentifier?: string | null;
  server?: string | null;
  levelLabel?: string;
  lastScanLabel?: string;
  lastScanAtMs?: number | null;
  lastScanAtLabel?: string;
  lastScanDays?: number | null;
  metrics: LocalHeroMetric[];
  badges: LocalHeroBadge[];
  actions: Array<{
    key: LocalHeroActionKey;
    label: string;
    title?: string;
  }>;
  portrait?: Partial<PortraitOptions>;
  hasPortrait?: boolean;
  portraitFallbackUrl?: string;
  portraitFallbackLabel?: string;
  baseStats?: LocalBaseStatValues;
  totalStats?: LocalBaseStatValues;
  totalStatsValue?: number | null;
  mountRace?: string | null;
  mountPercentValue?: number | null;
  potionsSlots?: LocalPotionSlot[];
  attributeComposition?: AttributeCompositionModel;
};

export type LocalPlayerProfileModel = {
  currentSeed?: LocalPlayerCurrentSeed;
  sourceScanId: string;
  sourcePlayerKey: string;
  analytics: {
    playerName: string;
    server: string | null;
    memberRef: string | null;
    guildIdentifier: string | null;
    guildName: string | null;
    scannedAtMs: number;
  };
  hero: LocalHeroPanelData;
};
