import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ToolsSyncBarProps {
  isLoggedIn: boolean;
  hasUnsyncedChanges: boolean;
  lastSyncedAt: Date | string | null;
  cooldownUntil: number | string | Date | null;
  onSyncClick: () => void | Promise<void>;
  isSaving: boolean;
  syncError?: string | null;
}

const resolveTargetMs = (cooldownUntil: ToolsSyncBarProps["cooldownUntil"]): number | null => {
  if (!cooldownUntil) return null;
  if (cooldownUntil instanceof Date) return cooldownUntil.getTime();
  if (typeof cooldownUntil === "string") return new Date(cooldownUntil).getTime();
  if (typeof cooldownUntil === "number") return cooldownUntil;
  return null;
};

export default function ToolsSyncBar({
  isLoggedIn,
  hasUnsyncedChanges,
  lastSyncedAt,
  cooldownUntil,
  onSyncClick,
  isSaving,
  syncError,
}: ToolsSyncBarProps) {
  const { t } = useTranslation();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    const target = resolveTargetMs(cooldownUntil);
    if (!target) {
      setRemainingSeconds(null);
      return;
    }

    const update = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setRemainingSeconds(diff);
    };

    update();
    const id = window.setInterval(update, 1000);

    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const isInCooldown = remainingSeconds !== null && remainingSeconds > 0;
  const isSyncDisabled = !isLoggedIn || isSaving || !hasUnsyncedChanges || isInCooldown;

  const formattedCooldownTime = useMemo(() => {
    if (remainingSeconds === null || remainingSeconds <= 0) return null;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);

  const syncButtonLabel = isSaving
    ? t("tools.sync.saving")
    : formattedCooldownTime
      ? t("tools.sync.cooldownLabel", { time: formattedCooldownTime })
      : t("tools.sync.buttonSave");

  const syncStatusText = useMemo(() => {
    if (hasUnsyncedChanges) return t("tools.sync.statusUnsynced");
    if (lastSyncedAt) return t("tools.sync.statusSynced");
    return t("tools.sync.statusNever");
  }, [hasUnsyncedChanges, lastSyncedAt, t]);

  const syncStatusDetail = useMemo(() => {
    if (hasUnsyncedChanges) return null;
    if (lastSyncedAt) {
      const date = typeof lastSyncedAt === "string" ? new Date(lastSyncedAt) : lastSyncedAt;
      return `${t("tools.sync.lastSyncLabel")}: ${date.toLocaleTimeString()}`;
    }
    return t("tools.sync.noChanges");
  }, [hasUnsyncedChanges, lastSyncedAt, t]);

  const syncButtonClassName = [
    "rounded-xl border px-4 py-2 text-sm font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
    isSyncDisabled
      ? "cursor-not-allowed border-slate-700/70 bg-slate-800/70 text-slate-500"
      : "border-emerald-400/60 bg-emerald-500/10 text-emerald-50 hover:border-emerald-300 hover:bg-emerald-500/20",
  ].join(" ");

  return (
    <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <button
          type="button"
          disabled={isSyncDisabled}
          onClick={onSyncClick}
          className={syncButtonClassName}
        >
          {syncButtonLabel}
        </button>
        <div className="text-left">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {syncStatusText}
          </p>
          {syncStatusDetail && (
            <p className="text-sm text-slate-200">{syncStatusDetail}</p>
          )}
          {syncError && (
            <p className="text-sm text-rose-400">{syncError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
