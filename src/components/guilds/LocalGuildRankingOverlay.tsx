import { profileNumber, profileDateTime } from "../../lib/i18n/profilePresentation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useBackClose } from "../../hooks/useBackClose";
import { type LocalGuildRankingRow, type LocalGuildRankingComparison } from "../../pages/GuildHub/localGuildRanking";
import LocalGuildStatsPlayerRow, { formatGuildStatDelta } from "./LocalGuildStatsPlayerRow";
import styles from "./LocalGuildRankingOverlay.module.css";

export default function LocalGuildRankingOverlay({ isOpen, title, rows, currentTimestamp, comparison, onClose, trigger }: {
  isOpen: boolean; title: string; rows: readonly LocalGuildRankingRow[]; currentTimestamp: number;
  comparison: LocalGuildRankingComparison; onClose: () => void; trigger: HTMLElement | null;
}) {
  const { t } = useTranslation();
  useAnalyticsView(isOpen ? "datahub/guild/ranking" : null);
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useBackClose(isOpen, onClose);
  useFocusTrap(panel, isOpen);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isOpen, onClose, trigger]);
  if (!isOpen || typeof document === "undefined") return null;
  const status = comparison.status === "loading" || comparison.status === "idle" ? t("guildHub.ranking.loading")
    : comparison.status === "error" ? t("guildHub.ranking.failed") : null;
  const maxValue = Math.max(0, ...rows.map(row => row.value ?? 0));
  return createPortal(<div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} data-guild-ranking-overlay>
      <div className={styles.header}><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label={t("guildHub.ranking.close")}><X size={20} aria-hidden /></button></div>
      <div className={styles.dates}>
        <span>{t("guildHub.ranking.current")}: {profileDateTime(currentTimestamp)}</span>
        <span>{t("guildHub.ranking.comparison")}: {comparison.timestamp == null ? "--" : profileDateTime(comparison.timestamp)}</span>
      </div>
      {!rows.length && <p className={styles.status} role="status">{t("guildHub.ranking.emptyClass")}</p>}
      {status ? <p className={styles.status} role="status">{status}</p> : null}
      <div className={styles.scroll} tabIndex={0} aria-label={t("guildHub.ranking.list")}>
        <ol className={styles.list}>
          {rows.map(row => <li key={row.key} className={styles.row} data-ranking-row>
            <div className={styles.rank} data-ranking-rank-area>
              <span data-ranking-rank-delta data-direction={row.rankDelta == null ? "missing" : row.rankDelta > 0 ? "positive" : row.rankDelta < 0 ? "negative" : "unchanged"} title={t("guildHub.ranking.rankDelta")}>{row.rankStatus === "new" ? t("guildHub.ranking.new") : row.rankDelta === 0 ? "-" : formatGuildStatDelta(row.rankDelta)}</span>
              <strong data-ranking-rank>{row.rank == null ? "--" : `#${profileNumber(row.rank)}`}</strong>
            </div>
            <LocalGuildStatsPlayerRow entry={row} maxValue={maxValue} delta={row.valueDelta} deltaLabel={t("guildHub.ranking.valueDelta")} ranking />
          </li>)}
        </ol>
      </div>
      {comparison.status === "empty" ? <div className={styles.coverage} role="status" data-ranking-comparison-coverage>
        {comparison.coverage ? <>
          <strong>{t("guildHub.ranking.excludedCandidate", { date: profileDateTime(comparison.coverage.timestamp) })}</strong>
          <p>{t(`guildHub.ranking.coverage.${comparison.coverage.reason ?? "values"}`, {
            found: comparison.coverage.foundMemberCount, declared: comparison.coverage.declaredMemberCount,
            xp: comparison.coverage.validXpTotalCount, base: comparison.coverage.validBaseStatsCount,
          })}</p>
        </> : <p>{t("guildHub.ranking.noComparison")}</p>}
      </div> : null}
    </div>
  </div>, document.body);
}
