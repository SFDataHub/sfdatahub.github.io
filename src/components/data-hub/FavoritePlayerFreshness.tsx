import { useTranslation } from "react-i18next";
import type { FavoriteProjection } from "../../lib/data-hub/hubFavoritesProjection";
import { useGuildFreshness, GUILD_FRESHNESS_DOT_COLORS } from "../guilds/useGuildFreshness";
import guildProfileInfoStyles from "../guilds/GuildProfileInfo/GuildProfileInfo.module.css";
import { usePlayerFreshness } from "../player-profile/usePlayerFreshness";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import Tooltip from "../ui/Tooltip/Tooltip";
import styles from "./LocalGuildFavorites.module.css";

export default function FavoritePlayerFreshness({ observedAtMs }: { observedAtMs?: number }) {
  const { freshness, freshnessTooltip } = usePlayerFreshness(observedAtMs, observedAtMs ? formatScanDateTimeLabel(observedAtMs) : null);
  return <FreshnessStatus observedAtMs={observedAtMs} freshness={freshness} freshnessTooltip={freshnessTooltip} />;
}

function FreshnessStatus({ observedAtMs, freshness, freshnessTooltip, color, guild = false }: {
  observedAtMs?: number; freshness: ReturnType<typeof usePlayerFreshness>["freshness"]; freshnessTooltip: ReturnType<typeof usePlayerFreshness>["freshnessTooltip"]; color?: string; guild?: boolean;
}) {
  return <Tooltip content={freshnessTooltip} contentClassName={guild ? guildProfileInfoStyles.freshnessTooltipCard : styles.freshnessTooltip}>
    <span className={styles.freshness} tabIndex={0} data-favorite-freshness={freshness.level} data-observed-at={observedAtMs}>
      <span aria-hidden className={styles.freshnessDot} data-level={freshness.level} style={color ? { background: color, boxShadow: "none" } : undefined} />
      <span>{freshness.label}</span><span aria-hidden className={styles.freshnessInfo}>ⓘ</span>
    </span>
  </Tooltip>;
}

export function FavoriteGuildFreshness({ observedAtMs }: { observedAtMs?: number }) {
  const { freshness, freshnessTooltip } = useGuildFreshness(observedAtMs, observedAtMs ? formatScanDateTimeLabel(observedAtMs) : null);
  return <FreshnessStatus observedAtMs={observedAtMs} freshness={freshness} freshnessTooltip={freshnessTooltip} color={GUILD_FRESHNESS_DOT_COLORS[freshness.level]} guild />;
}

export function FavoriteStatusLine({ row, ready, error }: { row: FavoriteProjection; ready: boolean; error: string | null }) {
  const { t } = useTranslation();
  const identityState = error ? "error" : !ready ? "checking"
    : row.identity === "conflict" || row.observation?.state === "ambiguous" ? "conflict" : row.matching ?? "unavailable";
  const iconOnly = identityState === "original" || identityState === "missing-history";
  const label = t(`hubFavorites.identity.${identityState}`);
  const checked = identityState === "resolved" || identityState === "original";
  const missingHistory = identityState === "missing-history";
  return (
        <div className={`${styles.status} ${styles.statusLine}`} data-favorite-status={identityState}>
          <Tooltip content={missingHistory ? label : undefined} contentClassName={styles.freshnessTooltip}>
          <span className={styles.identity} role={iconOnly ? "img" : undefined} aria-label={iconOnly ? label : undefined} tabIndex={missingHistory ? 0 : undefined}>
            {(checked || missingHistory || identityState === "unresolved" || identityState === "conflict") &&
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={checked ? "#34d399" : missingHistory ? "#f97316" : "#f87171"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={checked ? "m3 8 3 3 7-7" : missingHistory ? "M4 8h8" : "m4 4 8 8M12 4l-8 8"} />
              </svg>}
            {!iconOnly && label}
          </span>
          </Tooltip>
          <span aria-hidden>·</span>
          {row.favorite.kind === "player" ? <FavoritePlayerFreshness observedAtMs={ready ? row.playerScan?.observedAtMs : undefined} />
            : <FavoriteGuildFreshness observedAtMs={ready ? row.guildScan?.observedAtMs : undefined} />}
        </div>
  );
}
