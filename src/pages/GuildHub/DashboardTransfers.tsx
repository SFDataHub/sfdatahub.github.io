import { profileNumber, profileClassLabel } from "../../lib/i18n/profilePresentation";
import { useAnalyticsView } from "../../lib/analytics/localEvents";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useBackClose } from "../../hooks/useBackClose";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import type { TransferGuildStatus } from "./dashboardTransferGuilds";
import styles from "./DashboardTransfers.module.css";
import dialog from "../../components/guilds/LocalGuildRankingOverlay.module.css";

type TransferMember = {
  key: string;
  name: string;
  server?: string | null;
  classLabel: string | null;
  level: number | null;
  transferGuild?: TransferGuildStatus;
  localRef?: { server: string | null };
};

export type DashboardTransfersHandle = { close: () => void };

const DashboardTransfers = forwardRef(function DashboardTransfers({ transfers, status, fromLabel, toLabel, onMemberClick }: {
  transfers: { joined: TransferMember[]; left: TransferMember[] } | null;
  status: "not-requested" | "loading" | "ready" | "empty" | "error";
  fromLabel: string | null;
  toLabel: string;
  onMemberClick?: (direction: "joined" | "left", memberKey: string) => void;
}, ref: React.ForwardedRef<DashboardTransfersHandle>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useAnalyticsView(open ? "datahub/guild/transfers" : null);
  const close = useCallback(() => setOpen(false), []);
  useImperativeHandle(ref, () => ({ close }), [close]);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const memberTrigger = useRef<HTMLButtonElement | null>(null);
  const bodyId = useId();
  const titleId = useId();
  const dialogTitleId = useId();
  const historyMarker = useRef<string>();
  const openRef = useRef(open);
  openRef.current = open;
  useBackClose(open, close);
  useFocusTrap(panel, open);
  useEffect(() => {
    if (!open) return;
    historyMarker.current = window.history.state?.ghOverlay;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      // Player routes above this dialog own Escape until they return to it.
      if (event.key === "Escape" && window.history.state?.ghOverlay === historyMarker.current) {
        event.preventDefault();
        close();
      }
    };
    let profileWasOpen = false;
    const profileObserver = new MutationObserver(() => {
      const profileOpen = !!document.querySelector(".profile-overlay--local");
      if (profileWasOpen && !profileOpen && window.history.state?.ghOverlay === historyMarker.current && memberTrigger.current?.isConnected) {
        memberTrigger.current.focus({ preventScroll: true });
      }
      profileWasOpen = profileOpen;
    });
    profileObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
      profileObserver.disconnect();
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [open, close]);
  const lifetime = useRef(0);
  useEffect(() => {
    const generation = ++lifetime.current;
    return () => {
      // The Dashboard keys this component by guild and comparison context.
      // Remove its history entry on a real unmount, including context changes.
      queueMicrotask(() => {
        if (lifetime.current === generation && openRef.current && historyMarker.current && window.history.state?.ghOverlay === historyMarker.current) window.history.back();
      });
    };
  }, []);
  const ready = status === "ready" && transfers !== null;
  const directions = ["joined", "left"] as const;
  const rows = (direction: "joined" | "left") => transfers?.[direction] ?? [];
  const label = (direction: "joined" | "left") => t(`guildProfile.heroPanel.transfers.${direction}`);
  const message = status === "loading" || status === "not-requested"
    ? t("guildHub.dashboardComparison.loading", "Historischer Vergleich wird geladen.")
    : status === "error"
      ? t("guildHub.dashboardComparison.failed", "Historischer Vergleich konnte nicht geladen werden.")
      : fromLabel
        ? t("guildHub.dashboardComparison.empty", "Keine Vergleichsmitglieder verfügbar.")
        : t("guildProfile.heroPanel.transfers.noMonthlyComparison", "No monthly comparison snapshot available");

  return (
    <section className={styles.panel} aria-labelledby={titleId} data-guild-transfers data-comparison-status={status}>
      <h2 className={styles.heading}>
        <span className={styles.headingLayout}>
          <span className={styles.headingText}>
            <span id={titleId} className={styles.title}>{t("guildProfile.heroPanel.transfers.title", "Transfers")}</span>
            {fromLabel ? <span className={styles.period}>{t("guildProfile.heroPanel.transfers.changesRange", {
              from: fromLabel, to: toLabel, defaultValue: "Changes: {{from}} → {{to}}",
            })}</span> : null}
            {ready ? <span className={styles.summary}>
              {directions.map(direction => <span className={styles.summaryCount} data-direction={direction} key={direction}>
                {label(direction)} <strong data-transfer-summary-count={direction}>{profileNumber(rows(direction).length)}</strong>
              </span>)}
            </span> : null}
          </span>
          <button ref={trigger} type="button" className={styles.detailButton} aria-label={t("guildChartDetails.open", { title: t("guildProfile.heroPanel.transfers.title") })} title={t("guildChartDetails.open", { title: t("guildProfile.heroPanel.transfers.title") })} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? bodyId : undefined} onClick={() => setOpen(true)}><Search size={16} aria-hidden /></button>
        </span>
      </h2>
      {open && createPortal(<div className={`${dialog.backdrop} ${styles.backdrop}`} onMouseDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); close(); } }}>
        <div id={bodyId} ref={panel} className={dialog.panel} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId} data-guild-transfers-overlay>
          <div className={dialog.header}><h2 id={dialogTitleId}>{t("guildProfile.heroPanel.transfers.title", "Transfers")}</h2><button type="button" aria-label={t("guildHub.ranking.close")} onClick={close}><X size={20} aria-hidden /></button></div>
          {fromLabel ? <div className={dialog.dates}>{t("guildProfile.heroPanel.transfers.changesRange", { from: fromLabel, to: toLabel, defaultValue: "Changes: {{from}} → {{to}}" })}</div> : null}
          <div className={dialog.scroll} tabIndex={0}>
        {ready ? (
          <>
          <div className={styles.grid}>
            {directions.map(direction => (
              <div className={styles.group} key={direction} data-transfer-direction={direction}>
                <div className={styles.header}>
                  <span className={styles.chip}><span aria-hidden className={styles.dot} />{label(direction)}</span>
                  <strong className={styles.count} data-transfer-count>{rows(direction).length}</strong>
                </div>
                <ul className={styles.entries}>
                  {rows(direction).length === 0 ? (
                    <li className={`${styles.entry} ${styles.empty}`}>{t("guildProfile.heroPanel.transfers.empty", "No changes")}</li>
                  ) : rows(direction).map((member, index) => {
                    const icon = getClassIconUrl(member.classLabel, 256);
                    const content = (
                      <>
                        <span className={styles.name} data-transfer-name>
                          {member.name}{(member.server ?? member.localRef?.server) ? <small className={styles.server} data-transfer-server>{member.server ?? member.localRef?.server}</small> : null}
                          <small className={styles.guild} data-transfer-guild data-guild-status={member.transferGuild?.kind ?? "unavailable"}>
                            {member.transferGuild?.kind === "guild" ? member.transferGuild.name
                              : member.transferGuild?.kind === "none" ? t("guildHub.transferGuild.none", "No guild")
                                : t("guildHub.transferGuild.unavailable", "Not available")}
                          </small>
                        </span>
                        {icon ? <span className={styles.icon}><img src={icon} alt={profileClassLabel(member.classLabel)} draggable={false} /></span> : <span className={styles.classLabel}>{profileClassLabel(member.classLabel).slice(0, 3)}</span>}
                        <span className={styles.level}>{t("guildProfile.heroPanel.transfers.levelShort", "Lv")} {member.level == null ? "--" : profileNumber(member.level)}</span>
                      </>
                    );
                    return (
                      <li key={`${member.key}:${index}`} data-transfer-member={member.key}>
                        {onMemberClick && /^.+_p[^_]+$/i.test(member.key) ? (
                          <button type="button" className={`${styles.entry} ${styles.row}`} onClick={event => { memberTrigger.current = event.currentTarget; onMemberClick(direction, member.key); }} aria-label={`${member.name} – ${t("hubSearch.openProfile")}`}>
                            {content}
                          </button>
                        ) : <div className={styles.entry}>{content}</div>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          </>
        ) : <p className={styles.state} role={status === "error" ? "alert" : "status"}>{message}</p>}
          </div>
        </div>
      </div>, document.body)}
      {!ready ? <p className={styles.collapsedState} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
    </section>
  );
});

export default DashboardTransfers;
