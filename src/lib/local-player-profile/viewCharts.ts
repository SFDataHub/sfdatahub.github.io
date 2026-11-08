import type { AttributeSumMode } from "../settings/preferences";

export type PlayerContentView = "general" | "progress" | "base" | "total" | "fortress";
export type PlayerChartMetric = "hof" | "xp" | "baseSum" | "baseMain" | "baseCon" | "totalSum" | "totalMain" | "totalCon" | "mine" | "treasury";
export type PlayerChartArea = `charts:${PlayerContentView}:${AttributeSumMode}`;
export const PLAYER_VIEW_CHARTS: Record<PlayerContentView, readonly PlayerChartMetric[]> = {
  general: ["hof"], progress: ["xp"], base: ["baseSum", "baseMain", "baseCon"],
  total: ["totalSum", "totalMain", "totalCon"], fortress: ["mine", "treasury"],
};

/** Explicit bounds belong to the open profile, never the comparison target. */
export type PlayerChartRange = { min: number; max: number };
export type LocalProfileComparison = number | null | PlayerChartRange;
