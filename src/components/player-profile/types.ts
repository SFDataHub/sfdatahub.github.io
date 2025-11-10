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
    | "worldBossFrameGold"
    | "worldBossFrameSilver"
    | "worldBossFrameBronze"
    | "polarisFrame";
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
  portrait: Partial<PortraitOptions>;
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
