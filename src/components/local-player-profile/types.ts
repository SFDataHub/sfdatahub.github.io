import type { PortraitOptions } from "../player-profile/types";

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
  playerName: string;
  className?: string | null;
  guild?: string | null;
  server?: string | null;
  levelLabel?: string;
  lastScanLabel?: string;
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
};

export type LocalPlayerProfileModel = {
  sourceScanId: string;
  sourcePlayerKey: string;
  hero: LocalHeroPanelData;
};
