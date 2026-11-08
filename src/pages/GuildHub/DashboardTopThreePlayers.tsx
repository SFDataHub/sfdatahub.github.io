import { profileLocale, profileNumber, profileMonth } from "../../lib/i18n/profilePresentation";
import { useProfileAttributeSumMode } from "../../lib/settings/usePreferences";
import React from "react";
import { Info } from "lucide-react";
import chipStyles from "../../components/Filters/filters.module.css";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import LocalGuildStatsPlayerRow from "../../components/guilds/LocalGuildStatsPlayerRow";
import { dashboardArchiveMetric, type DashboardHudMembers, type DashboardHudCount, type DashboardArchiveRanks, type LocalGuildRankingComparison, type LocalGuildRankingRow } from "./localGuildRanking";
import playerStyles from "../../components/guilds/LocalGuildPlayerStats.module.css";
import styles from "./DashboardGuildCard.module.css";

export default function DashboardTopThreePlayers({ category, label, rows, status, archive, members, summary, fortress = false }: {
  category: string; label: string; rows: readonly LocalGuildRankingRow[];
  status: LocalGuildRankingComparison["status"]; archive: DashboardArchiveRanks; members: DashboardHudMembers;
  summary: React.ReactNode; fortress?: boolean;
}) {
  const { t } = useTranslation();
  const attributeSumMode = useProfileAttributeSumMode();
  const leaders = rows.filter(row => row.rank != null).slice(0, 3);
  const metric = dashboardArchiveMetric(category, attributeSumMode);
  const badge = (row: LocalGuildRankingRow, scope: "server" | "global") => {
    const player = members.byKey.get(row.key);
    const value = player && metric && player.statuses[metric] === "available" ? player.ranks[metric][scope] : null;
    const rank = value != null && Number.isInteger(value) && value > 0 ? value : null;
    const title = t("dashboardArchiveRanks.context", { scope: t("dashboardArchiveRanks." + scope), month: profileMonth(archive.month) || t("dashboardCompare.unavailable"), server: archive.server, metric: label, rank: rank == null ? t("dashboardCompare.unavailable") : profileNumber(rank) });
    return <span className={chipStyles.chip + " " + styles.archiveRank} title={title} aria-label={title} tabIndex={0} data-archive-rank={scope} data-archive-month={archive.month ?? undefined} data-archive-player={player?.identifier} data-archive-metric={metric} data-archive-value={rank ?? "unavailable"}>{rank == null ? "—" : "#" + rank.toLocaleString(profileLocale())}</span>;
  };
  const maxValue = Math.max(0, ...leaders.map(row => row.value ?? 0));
  const deltaLabel = status === "loading" || status === "idle" ? t("guildHub.ranking.loading")
    : status === "error" ? t("guildHub.ranking.failed") : t("guildHub.ranking.valueDelta");
  return <dd className={styles.topThreeRows} role="group" aria-label={t("profileI18n.topThree", { label })} data-guild-top-three={category}>
    <ol className={playerStyles.entries}>
      {leaders.map((row, index) => <li key={index} data-top-three-key={row.key} data-top-three-rank={row.rank} data-top-three-value={row.value}>
        <LocalGuildStatsPlayerRow entry={row} maxValue={maxValue} delta={row.valueDelta} deltaLabel={deltaLabel} compactRank={row} ranking animateChanges showRankNumber={false} showValueDelta={false} />
        {!fortress && <>{badge(row, "server")}{badge(row, "global")}</>}
      </li>)}
      {Array.from({ length: 3 - leaders.length }, (_, index) => <li key={"empty-" + index} className={styles.emptyRankingSlot} aria-hidden={leaders.length > 0 || index > 0}>
        {!leaders.length && index === 0 && <span role="status">{t("guildHub.ranking.emptyClass")}</span>}
      </li>)}
    </ol>
    {summary}
  </dd>;
}

export function DashboardHudCountValue({ count }: { count: DashboardHudCount }) {
  const { t } = useTranslation();
  return <>{count.hits == null ? t("dashboardHud.unavailable") : count.hits.toLocaleString(profileLocale())}{count.hits != null && count.partial && <span aria-label={t("dashboardHud.partial")}>*</span>}</>;
}

/** Same local outside/Escape/scroll closing contract as CompareDisplay. */
export function DashboardRankingControls({ category, label, limit, onChange, children }: {
  category: string; label: string; limit: number; onChange: (value: number) => void; children: React.ReactNode;
}) {
  const { t } = useTranslation(), id = React.useId();
  const [open, setOpen] = React.useState(false), [position, setPosition] = React.useState<React.CSSProperties>({});
  const root = React.useRef<HTMLDivElement>(null), trigger = React.useRef<HTMLButtonElement>(null), popup = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (!open || !root.current || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect(), origin = root.current.getBoundingClientRect();
    const bounds = trigger.current.closest("main")?.getBoundingClientRect();
    const left = Math.max(8, bounds?.left ?? 0) + 8, right = Math.min(innerWidth - 8, bounds?.right ?? innerWidth) - 8;
    const width = Math.max(0, Math.min(340, right - left));
    if (popup.current) popup.current.style.width = `${width}px`;
    const top = Math.max(8, bounds?.top ?? 0) + 8, bottom = Math.min(innerHeight - 8, bounds?.bottom ?? innerHeight) - 8;
    const below = Math.max(0, bottom - box.bottom - 6), above = Math.max(0, box.top - top - 6);
    const contentHeight = popup.current?.scrollHeight ?? 0;
    const upward = contentHeight > below && above > below;
    setPosition({ width, left: Math.max(left, Math.min(box.right - width, right - width)) - origin.left,
      top: (upward ? box.top - 6 - Math.min(contentHeight + 2, above) : box.bottom + 6) - origin.top,
      maxHeight: upward ? above : below });
  }, [open, label, limit]);
  React.useEffect(() => setOpen(false), [category]);
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); } };
    const close = (event: Event) => { if (event.target instanceof Node && root.current?.contains(event.target)) return; setOpen(false); };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  return <dd className={styles.rankingControls}>
    <div ref={root} className={styles.rankingControlRoot} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <select aria-label={t("dashboardHud.limitLabel", { metric: label })} value={limit} onChange={event => onChange(Number(event.target.value))} data-ranking-limit={category}>
        {[100, 500, 1000].map(value => <option key={value} value={value}>R{value}</option>)}
      </select>
      <button ref={trigger} type="button" aria-label={t("dashboardHud.infoLabel", { metric: label, limit })} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} data-ranking-info={category}><Info size={14} aria-hidden /></button>
      {open && <div ref={popup} id={id} className={styles.rankingInfo} role="region" aria-label={t("dashboardHud.infoLabel", { metric: label, limit })} style={position} data-ranking-info-popup>{children}</div>}
    </div>
  </dd>;
}
