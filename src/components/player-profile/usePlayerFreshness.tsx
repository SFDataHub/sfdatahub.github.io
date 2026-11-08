import { profileNumber, profileDateTime } from "../../lib/i18n/profilePresentation";
import { useMemo } from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useScanAgeDays } from "../../lib/ui/useScanAgeDays";

type FreshnessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | "unknown";
type TranslateFn = (key: string, options?: any) => string;

const computeFreshness = (
  t: TranslateFn,
  lastScanDays?: number | null,
): { level: FreshnessLevel; label: string; hint: string } => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) {
    return {
      level: "unknown",
      label: t("playerProfile.heroPanel.states.freshness.unknown.label", { defaultValue: "Unknown" }),
      hint: t("playerProfile.heroPanel.states.freshness.unknown.hint", {
        defaultValue: "Scan history unavailable",
      }),
    };
  }
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) {
    return {
      level: 0,
      label: t("playerProfile.heroPanel.states.freshness.scannedToday.label", { defaultValue: "Scanned today" }),
      hint: t("playerProfile.heroPanel.states.freshness.scannedToday.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days === 1) {
    return {
      level: 1,
      label: t("playerProfile.heroPanel.states.freshness.veryFresh.label", { defaultValue: "Very fresh" }),
      hint: t("playerProfile.heroPanel.states.freshness.veryFresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 3) {
    return {
      level: 2,
      label: t("playerProfile.heroPanel.states.freshness.fresh.label", { defaultValue: "Fresh" }),
      hint: t("playerProfile.heroPanel.states.freshness.fresh.hint", { defaultValue: "No rescan needed" }),
    };
  }
  if (days <= 7) {
    return {
      level: 3,
      label: t("playerProfile.heroPanel.states.freshness.recent.label", { defaultValue: "Recent" }),
      hint: t("playerProfile.heroPanel.states.freshness.recent.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 14) {
    return {
      level: 4,
      label: t("playerProfile.heroPanel.states.freshness.aging.label", { defaultValue: "Aging" }),
      hint: t("playerProfile.heroPanel.states.freshness.aging.hint", { defaultValue: "Rescan recommended" }),
    };
  }
  if (days <= 30) {
    return {
      level: 5,
      label: t("playerProfile.heroPanel.states.freshness.outdated.label", { defaultValue: "Outdated" }),
      hint: t("playerProfile.heroPanel.states.freshness.outdated.hint", {
        defaultValue: "Rescan strongly recommended",
      }),
    };
  }
  return {
    level: 6,
    label: t("playerProfile.heroPanel.states.freshness.stale.label", { defaultValue: "Stale" }),
    hint: t("playerProfile.heroPanel.states.freshness.stale.hint", { defaultValue: "Rescan strongly recommended" }),
  };
};

const formatAgeLabel = (t: TranslateFn, lastScanDays?: number | null) => {
  if (lastScanDays == null || !Number.isFinite(lastScanDays)) return null;
  const days = Math.max(0, Math.floor(lastScanDays));
  if (days === 0) return t("playerProfile.heroPanel.tooltips.age.today", { defaultValue: "today" });
  if (days === 1) return t("playerProfile.heroPanel.tooltips.age.oneDayAgo", { defaultValue: "1 day ago" });
  return t("playerProfile.heroPanel.tooltips.age.daysAgo", { days: profileNumber(days), defaultValue: "{{days}} days ago" });
};

/** Shared profile presentation; callers supply an actual observation, never an age. */
export function usePlayerFreshness(scanAtMs: unknown, scanAtLabel?: string | null) {
  const { t } = useTranslation();
  const currentScanLabel = profileDateTime(scanAtMs);
  const scanLabel = currentScanLabel === "—" ? scanAtLabel : currentScanLabel;
  const lastScanDays = useScanAgeDays(scanAtMs);
  const freshness = useMemo(() => computeFreshness(t, lastScanDays), [lastScanDays, t]);
  const freshnessTooltip = useMemo(() => {
    const lines: string[] = [];
    if (scanLabel) {
      lines.push(
        t("playerProfile.heroPanel.tooltips.lastScanAt", {
          value: scanLabel,
          defaultValue: "Last scan: {{value}}",
        }),
      );
    }
    const ageLabel = formatAgeLabel(t, lastScanDays);
    if (ageLabel) {
      lines.push(
        t("playerProfile.heroPanel.tooltips.age.label", {
          value: ageLabel,
          defaultValue: "Age: {{value}}",
        }),
      );
    }
    if (freshness.hint) lines.push(freshness.hint);
    if (!lines.length) return null;
    return (
      <div className="player-profile__freshness-tooltip-lines">
        {lines.map((line, index) => (
          <div key={`${line}-${index}`}>{line}</div>
        ))}
      </div>
    );
  }, [scanLabel, lastScanDays, freshness.hint, t]);
  return { freshness, freshnessTooltip, ageLabel: formatAgeLabel(t, lastScanDays) };
}
