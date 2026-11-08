import { profileLocale, profileClassLabel } from "../../lib/i18n/profilePresentation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { iconForClassName, type ClassMeta } from "../../data/classes";
import { toDriveThumbProxy } from "../../lib/urls";
import type { NormalizedGuildRole } from "../../lib/guilds/guildScanNormalizer";
import type { LocalPlayerIndexProgress } from "../../lib/player-search/localPlayerIndexClient";
import { buildDashboardStaticPlayerCardItems, DEFAULT_DASHBOARD_MEMBER_VIEW, sortDashboardMembers, type DashboardMemberView, type DashboardPlayerCardItem } from "./dashboardPlayerCards";
import type { DashboardMemberMode, LocalGuildRankingComparison } from "./localGuildRanking";
import type { LocalGuildPlayerStats as LocalGuildPlayerStatsValues } from "./localGuildPlayerStats";
import DashboardMemberCard from "./DashboardMemberCard";
import styles from "./Dashboard.module.css";
import overlay from "./DashboardCompareOverlay.module.css";
const formatInteger = (value: number) => value.toLocaleString(profileLocale());
const ClassIcon = DashboardClassIcon;

export type LocalMember = {
  key: string;
  name: string;
  server?: string | null;
  classLabel: string | null;
  classMeta: ClassMeta | null;
  level: number | null;
  honor: number | null;
  hofRank: number | null;
  baseMain: number | null;
  totalStats: number | null;
  playerStats?: LocalGuildPlayerStatsValues;
  lastScanMs?: number | null;
  lastActivityMs?: number | null;
  guildRole?: NormalizedGuildRole;
  localRef?: {
    sourceScanId: string;
    sourcePlayerKey: string;
    identifier: string | null;
    playerId: string | null;
    server: string | null;
    matchedByNameFallback: boolean;
  };
};

export type DashboardPlayerCardsState = {
  items: DashboardPlayerCardItem<LocalMember>[];
  progress: LocalPlayerIndexProgress | null;
  loading: boolean;
  error: string | null;
};

export type DashboardCompareMembers = Pick<React.ComponentProps<typeof DashboardMembersPanel>, "members" | "playerCardsState" | "comparison" | "actions" | "onMemberClick">;

export default function DashboardMembersPanel({
  className,
  guildId,
  widthPreference,
  members,
  playerCardsState,
  onMemberClick,
  mode, comparison, actions, selectedMemberKeys, onMemberSelect,
  selectedClasses,
  overlayLayout = false,
}: {
  overlayLayout?: boolean;
  className?: string;
  guildId: string;
  widthPreference: React.MutableRefObject<{ guildId: string; narrow: boolean } | null>;
  members: LocalMember[];
  playerCardsState: DashboardPlayerCardsState;
  onMemberClick: (member: LocalMember) => void;
  mode: DashboardMemberMode; comparison: LocalGuildRankingComparison;
  selectedMemberKeys: readonly string[]; onMemberSelect: (member: LocalMember) => void;
  selectedClasses: readonly string[];
  actions: (member: LocalMember) => { saved: boolean; disabled: boolean; onFavorite: () => void; onToplist: () => void };
}) {
  const { t } = useTranslation();
  const [view, setView] = React.useState<DashboardMemberView>(DEFAULT_DASHBOARD_MEMBER_VIEW);
  useAnalyticsView(view === "cards" ? "datahub/guild/members-cards" : "datahub/guild/members-list");
  const [narrow, setNarrow] = React.useState(() => widthPreference.current?.guildId === guildId && widthPreference.current.narrow);
  React.useEffect(() => {
    setNarrow(widthPreference.current?.guildId === guildId && widthPreference.current.narrow);
  }, [guildId, widthPreference]);
  const toggleWidth = () => {
    widthPreference.current = { guildId, narrow: !narrow };
    setNarrow(!narrow);
  };
  const entriesId = React.useId();
  const widthDescriptionId = React.useId();
  const widthAction = t(narrow ? "guildHub.membersPanel.widen" : "guildHub.membersPanel.narrow");
  const sorted = React.useMemo(() => sortDashboardMembers(members).filter(member =>
    selectedClasses.length === 0 || selectedClasses.includes(member.classLabel?.trim() ?? "")), [members, selectedClasses]);
  const visibleCardsState = React.useMemo(() => ({ ...playerCardsState,
    items: playerCardsState.items.filter(item => selectedClasses.length === 0 || selectedClasses.includes(item.member.classLabel?.trim() ?? "")),
  }), [playerCardsState, selectedClasses]);
  const panelRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    if (overlayLayout) return;
    const panel = panelRef.current;
    const scroll = panel?.querySelector<HTMLElement>("[data-member-scroll]");
    if (!panel || !scroll) return;
    const update = () => {
      const cards = [...panel.querySelectorAll<HTMLElement>("[data-member-card]")];
      if (!cards.length) { scroll.style.height = "auto"; return; }
      const first = cards[0].getBoundingClientRect();
      const tenth = cards[Math.min(9, cards.length - 1)].getBoundingClientRect();
      scroll.style.height = `${tenth.bottom - first.top}px`;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel); observer.observe(scroll);
    panel.querySelectorAll("[data-member-card]").forEach(card => observer.observe(card));
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [visibleCardsState, mode, narrow, view, overlayLayout]);
  return (
    <section ref={panelRef} className={[styles.panel, styles.memberPanel, overlayLayout && overlay.memberPanel, className].filter(Boolean).join(" ")} data-members-narrow={narrow} data-member-layout={overlayLayout ? "overlay" : "profile"}>
      <div className={[styles.panelHeader, overlayLayout && overlay.memberHeader].filter(Boolean).join(" ")}>
        <div>
          <p className={[styles.kicker, overlayLayout && overlay.memberKicker].filter(Boolean).join(" ")}>{t("profileI18n.currentMembers")}</p>
          <h2>
            {overlayLayout ? t("guildHub.membersPanel.title") : <><button type="button" className={styles.membersWidthToggle} aria-expanded={!narrow} aria-controls={entriesId}
              aria-describedby={widthDescriptionId} title={widthAction} onClick={toggleWidth}>
              {t("guildHub.membersPanel.title")}
            </button>
            <span className={styles.membersMobileHeading}>{t("guildHub.membersPanel.title")}</span></>}
          </h2>
          <span id={widthDescriptionId} className={styles.membersWidthDescription}>{widthAction}</span>
          {selectedClasses.length > 0 ? <p className={styles.compareLabel} role="status">{t("profileI18n.classFilter", { classes: selectedClasses.map(profileClassLabel).join(t("profileI18n.or")) })}</p> : null}
        </div>
        <div className={[styles.memberPanelActions, overlayLayout && overlay.memberActions].filter(Boolean).join(" ")}>
          <div className={styles.memberViewToggle} role="tablist" aria-label={t("guildHub.membersPanel.view")}>
            <button type="button" role="tab" aria-selected={view === "cards"} data-active={view === "cards"} onClick={() => setView("cards")}>
              {t("profileI18n.cards")}
            </button>
            <button type="button" role="tab" aria-selected={view === "list"} data-active={view === "list"} onClick={() => setView("list")}>
              {t("guildHub.membersPanel.list")}
            </button>
          </div>
          <span className={styles.countBadge}>{formatInteger(sorted.length)}</span>
        </div>
      </div>

      <div id={entriesId} className={[styles.memberEntriesScroll, overlayLayout && overlay.memberScroll].filter(Boolean).join(" ")} data-member-scroll>
        <div className={styles.cardView} data-active={view === "cards"} aria-hidden={view !== "cards"}>
          <DashboardPlayerCardGrid state={visibleCardsState} fallbackMembers={sorted} onMemberClick={onMemberClick} mode={mode} comparison={comparison} actions={actions} selectedMemberKeys={selectedMemberKeys} onMemberSelect={onMemberSelect} />
        </div>
        {view === "list" && <div className={styles.memberList}>
          {sorted.map(member => <MemberRow key={member.key} member={member} onClick={onMemberClick} selected={selectedMemberKeys.includes(member.key)} onSelect={() => onMemberSelect(member)} />)}
        </div>}
        {!sorted.length && <p className={styles.emptyText} role="status">{t("guildHub.ranking.emptyClass")}</p>}
      </div>
    </section>
  );
}

function DashboardPlayerCardGrid({
  state,
  fallbackMembers,
  onMemberClick,
  mode, comparison, actions, selectedMemberKeys, onMemberSelect,
}: {
  state: DashboardPlayerCardsState;
  fallbackMembers: LocalMember[];
  onMemberClick: (member: LocalMember) => void;
  mode: DashboardMemberMode; comparison: LocalGuildRankingComparison;
  selectedMemberKeys: readonly string[]; onMemberSelect: (member: LocalMember) => void;
  actions: (member: LocalMember) => { saved: boolean; disabled: boolean; onFavorite: () => void; onToplist: () => void };
}) {
  const { t } = useTranslation();
  const items = state.items.length
    ? state.items
    : buildDashboardStaticPlayerCardItems({ members: fallbackMembers, playerLookup: new Map(), developmentStatus: "unavailable" });

  return (
    <div className={styles.memberCardsArea}>
      {state.error ? <p className={styles.memberCardsError}>{t("guildDashboardState.loadFailed")}</p> : null}
      {items.length ? (
        <div className={styles.memberCardGrid}>
          {items.map((item) => (
            <DashboardMemberCard key={item.member.key} item={item} mode={mode} comparison={comparison} actions={actions(item.member)} selected={selectedMemberKeys.includes(item.member.key)} onSelect={() => onMemberSelect(item.member)} onProfile={() => onMemberClick(item.member)} />
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>{t("profileI18n.noAssignedMembers")}</p>
      )}
    </div>
  );
}

function MemberRow({ member, onClick, selected, onSelect }: { member: LocalMember; onClick: (member: LocalMember) => void; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const secondary = [
    profileClassLabel(member.classLabel),
    typeof member.level === "number" ? t("profileI18n.levelValue", { value: formatInteger(member.level) }) : null,
  ].filter(Boolean);
  const score =
    typeof member.honor === "number"
      ? formatInteger(member.honor)
      : typeof member.hofRank === "number"
        ? `#${formatInteger(member.hofRank)}`
        : null;

  return (
    <div className={styles.memberRow} data-selected={selected} data-member-row={member.key}>
      <button type="button" className={styles.memberRowSelect} aria-pressed={selected} onClick={onSelect} aria-label={t("guildHub.memberValues.selectRanking", { name: member.name })}>{selected ? "☑" : "☐"}</button>
      <button type="button" className={styles.memberRowProfile} onClick={() => onClick(member)} aria-label={t("guildHub.membersPanel.profile", { name: member.name })}>
      <ClassIcon classLabel={member.classLabel} classMeta={member.classMeta} fallbackText={member.name} />
      <div className={styles.memberIdentity}>
        <span className={styles.memberName}>{member.name}</span>
        <span className={styles.memberSubline}>{secondary.join(" · ") || t("profileI18n.noDetails")}</span>
      </div>
      <div className={styles.memberScore}>
        <span>{score ?? "-"}</span>
        <small>{t("profileI18n.honorHof")}</small>
      </div>
      </button>
    </div>
  );
}

export function DashboardClassIcon({
  classLabel,
  classMeta,
  fallbackText,
  compact = false,
}: {
  classLabel: string | null;
  classMeta?: ClassMeta | null;
  fallbackText: string;
  compact?: boolean;
}) {
  const icon = iconForClassName(classLabel);
  const iconUrl = toDriveThumbProxy(classMeta?.iconUrl ?? icon.url, compact ? 28 : 36);
  const fallback = classMeta?.fallback ?? getInitials(fallbackText);

  return (
    <span className={`${styles.classIcon} ${compact ? styles.classIconCompact : ""}`} aria-hidden="true">
      {iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : <span>{fallback}</span>}
    </span>
  );
}

function getInitials(value: string) {
  const initials = value
    .split(/[\s_-]+/g)
    .map((part) => part.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "-";
}
