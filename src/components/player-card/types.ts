import type { PortraitOptions } from "../player-profile/types";
import type { LocalPlayerTrendPeriod } from "../../lib/player-progress/localPlayerTrend";

export type PlayerCardBadgeValue = string | number | null | undefined;

export type PlayerCardPotion = {
  slot: 1 | 2 | 3;
  type: string | null;
  size: number | null;
  assetKey: string | null;
  iconUrl: string | null;
  label: string;
};

export type PlayerCardData = {
  name: string;
  className?: string | null;
  classIconUrl?: string | null;
  classIconFallback?: string | null;
  classAccent?: string | null;
  level?: PlayerCardBadgeValue;
  guildRole?: PlayerCardBadgeValue;
  hofRank?: PlayerCardBadgeValue;
  portrait?: Partial<PortraitOptions>;
  hasPortrait?: boolean;
  portraitFallbackUrl?: string | null;
  portraitFallbackLabel?: string | null;
  potions?: PlayerCardPotion[];
  trends?: LocalPlayerTrendPeriod[];
};
