import { profileNumber, profileDateTime } from "../../lib/i18n/profilePresentation";
import { useMemo } from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useScanAgeDays } from "../../lib/ui/useScanAgeDays";
import guildProfileInfoStyles from "./GuildProfileInfo/GuildProfileInfo.module.css";

export type GuildHeroFreshnessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "unknown";
type TranslateFn = (key: string, options?: any) => string;

export const GUILD_FRESHNESS_DOT_COLORS: Record<GuildHeroFreshnessLevel, string> = {
  0: "#22c55e",
  1: "#84cc16",
  2: "#a3e635",
  3: "#f59e0b",
  4: "#fb923c",
  5: "#f97316",
  6: "#ef4444",
  unknown: "#94a3b8",
};

export const computeGuildHeroFreshness = (
  t: TranslateFn,
  lastScanDays?: number | null,
): { level: GuildHeroFreshnessLevel; label: string; hint: string } => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) {
    return {
      level: "unknown",
      label: t("guildProfile.heroPanel.states.freshness.unknown.label", { defaultValue: "Unknown" }),
      hint: t("guildProfile.heroPanel.states.freshness.unknown.hint", {
        defaultValue: "Scan history unavailable",
      }),
    };
  }
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) {
    return {
      level: 0,
      label: t("guildProfile.heroPanel.states.freshness.scannedToday.label", { defaultValue: "Scanned today" }),
      hint: t("guildProfile.heroPanel.states.freshness.scannedToday.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days === 1) {
    return {
      level: 1,
      label: t("guildProfile.heroPanel.states.freshness.veryFresh.label", { defaultValue: "Very fresh" }),
      hint: t("guildProfile.heroPanel.states.freshness.veryFresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 3) {
    return {
      level: 2,
      label: t("guildProfile.heroPanel.states.freshness.fresh.label", { defaultValue: "Fresh" }),
      hint: t("guildProfile.heroPanel.states.freshness.fresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 7) {
    return {
      level: 3,
      label: t("guildProfile.heroPanel.states.freshness.recent.label", { defaultValue: "Recent" }),
      hint: t("guildProfile.heroPanel.states.freshness.recent.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 14) {
    return {
      level: 4,
      label: t("guildProfile.heroPanel.states.freshness.aging.label", { defaultValue: "Aging" }),
      hint: t("guildProfile.heroPanel.states.freshness.aging.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 30) {
    return {
      level: 5,
      label: t("guildProfile.heroPanel.states.freshness.outdated.label", { defaultValue: "Outdated" }),
      hint: t("guildProfile.heroPanel.states.freshness.outdated.hint", {
        defaultValue: "Rescan strongly recommended",
      }),
    };
  }
  return {
    level: 6,
    label: t("guildProfile.heroPanel.states.freshness.stale.label", { defaultValue: "Stale" }),
    hint: t("guildProfile.heroPanel.states.freshness.stale.hint", { defaultValue: "Rescan strongly recommended" }),
  };
};

export const formatGuildHeroAgeLabel = (t: TranslateFn, lastScanDays?: number | null) => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) return null;
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return t("guildProfile.heroPanel.tooltips.age.today", { defaultValue: "today" });
  if (days === 1) return t("guildProfile.heroPanel.tooltips.age.oneDayAgo", { defaultValue: "1 day ago" });
  return t("guildProfile.heroPanel.tooltips.age.daysAgo", { days: profileNumber(days), defaultValue: "{{days}} days ago" });
};

export function useGuildFreshness(scanAtMs: unknown, scanAtLabel?: string | null) {
  const { t } = useTranslation();
  const currentScanLabel = profileDateTime(scanAtMs);
  const scanLabel = currentScanLabel === "—" ? scanAtLabel : currentScanLabel;
  const lastScanDays = useScanAgeDays(scanAtMs);
  const freshness = useMemo(
    () => computeGuildHeroFreshness(t, lastScanDays),
    [lastScanDays, t],
  );
  const freshnessTooltip = useMemo(() => {
    const lines: string[] = [];
    if (scanLabel) {
      lines.push(
        t("guildProfile.heroPanel.tooltips.lastScanAt", {
          value: scanLabel,
          defaultValue: "Last scan: {{value}}",
        }),
      );
    }
    const ageLabel = formatGuildHeroAgeLabel(t, lastScanDays);
    if (ageLabel) {
      lines.push(
        t("guildProfile.heroPanel.tooltips.age.label", {
          value: ageLabel,
          defaultValue: "Age: {{value}}",
        }),
      );
    }
    if (freshness.hint) lines.push(freshness.hint);
    if (!lines.length) return null;
    return (
      <div className={guildProfileInfoStyles.freshnessTooltipLines}>
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    );
  }, [scanLabel, lastScanDays, freshness.hint, t]);

  const localizedLastScanLabel = formatGuildHeroAgeLabel(t, lastScanDays);
  return { freshness, freshnessTooltip, ageLabel: localizedLastScanLabel };
}
