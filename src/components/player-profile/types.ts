export type PortraitOptions = {
  genderName: "male" | "female";
  class: number;
  race: number;
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
  showBorder: boolean;
  background:
    | ""
    | "white"
    | "black"
    | "gradient"
    | "transparentGradient"
    | "retroGradient"
    | "stained"
    | "hvGold"
    | "hvSilver"
    | "hvBronze";
  frame:
    | ""
    | "goldenFrame"
    | "twitchFrame"
    | "zenFrame"
    | "silverFrame"
    | "worldBossFrameGold"
    | "worldBossFrameSilver"
    | "worldBossFrameBronze"
    | "polarisFrame";
  mirrorHorizontal?: boolean;
};

export const DEFAULT_PORTRAIT: PortraitOptions = {
  genderName: "male",
  class: 2,
  race: 1,
  mouth: 1,
  hair: 3,
  hairColor: 4,
  horn: 0,
  hornColor: 0,
  brows: 2,
  eyes: 3,
  beard: 0,
  nose: 2,
  ears: 1,
  extra: 0,
  special: 0,
  showBorder: true,
  background: "gradient",
  frame: "",
  mirrorHorizontal: true,
};

export type HeroMetric = {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "success" | "warning";
};

export type HeroBadge = HeroMetric & { icon?: string };

export type HeroActionKey = "rescan" | "share" | "copy-link" | "guild";

export type HeroAction = {
  key: HeroActionKey | string;
  label: string;
  title?: string;
  disabled?: boolean;
};

export type BaseStatValues = {
  str: number;
  dex: number;
  int: number;
  con: number;
  lck: number;
};

export type BaseStatBenchmarks = {
  serverAvg?: Partial<BaseStatValues>;
  guildAvg?: Partial<BaseStatValues>;
  scaleMax?: Partial<BaseStatValues>;
};

export type HeroPanelData = {
  playerName: string;
  className?: string | null;
  guild?: string | null;
  server?: string | null;
  levelLabel?: string;
  lastScanLabel?: string;
  status?: "online" | "offline" | "unknown";
  metrics: HeroMetric[];
  badges: HeroBadge[];
  actions: HeroAction[];
  portrait?: Partial<PortraitOptions>;
  hasPortrait?: boolean;
  portraitFallbackUrl?: string;
  portraitFallbackLabel?: string;
  baseStats?: BaseStatValues;
  baseStatBenchmarks?: BaseStatBenchmarks;
  totalStats?: BaseStatValues;
};

export type AttributeStat = {
  label: string;
  baseLabel: string;
  totalLabel?: string;
};

export type StatsTabModel = {
  summary: HeroMetric[];
  attributes: AttributeStat[];
  resistances: HeroMetric[];
  resources: HeroMetric[];
};

export type ProgressTrack = {
  label: string;
  description: string;
  progress: number; // 0..1
  targetLabel: string;
  meta?: string;
  icon?: string;
  emphasis?: boolean;
};

export type TrendSeries = {
  label: string;
  unit?: string;
  points: number[];
  subLabel?: string;
};

export type ComparisonRow = {
  label: string;
  playerValue: string;
  benchmark: string;
  diffLabel: string;
  trend: "up" | "down" | "neutral";
};

export type TimelineEntry = {
  dateLabel: string;
  title: string;
  description: string;
  tag: string;
};

export type PlayerProfileViewModel = {
  hero: HeroPanelData;
  stats: StatsTabModel;
  progress: ProgressTrack[];
  charts: TrendSeries[];
  comparison: ComparisonRow[];
  history: TimelineEntry[];
};
