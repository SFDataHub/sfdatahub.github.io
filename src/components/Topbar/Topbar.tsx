import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AlertCircle, Bell, CheckCircle2, Globe, Loader2, Search, Star, StarOff, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./Topbar.module.css";
import AccountMenu from "./AccountMenu";
import { useLocalFavoritesMenu } from "../data-hub/LocalFavoritesMenu";

/** Upload-Center */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

/** Gemeinsame öffentliche DataHub-Suche */
import HubSearch from "../../pages/DataHub/HubSearch";
import { useNotifications } from "../../context/NotificationsContext";

import { useFeatureAccess } from "../../lib/featureAccessConfig";

const TOPBAR_ITEMS = [
  { to: "/", labelKey: "home", defaultLabel: "Home", featureId: "main.home" },
  { to: "/dashboard", labelKey: "dashboard", defaultLabel: "Dashboard", featureId: "main.dashboard" },
  { to: "/data-hub/guild-hub", labelKey: "guildHub", defaultLabel: "Guild Hub", featureId: "main.guildHub" },
  { to: "/community", labelKey: "community", defaultLabel: "Community", featureId: "main.community" },
  { to: "/tools", labelKey: "tools", defaultLabel: "Tools", featureId: "main.tools" },
];

// Persisted notification labels are translated at display time; names and source data stay intact.
const NOTIFICATION_LABEL_KEYS: Record<string, string> = {
  "Updating favorites...": "updating", "Favorites updated": "updated", "Favorites update failed": "failed",
  "Favorite added": "favoriteAdded", "Favorite removed": "favoriteRemoved",
  "SFtools-Import": "importTitle", "SFtools-Import abgeschlossen": "importCompleted",
  "SFtools-Import fehlgeschlagen": "importFailed", "SFtools-Import unterbrochen": "importInterrupted",
  "Scan-Slot wird erstellt": "slotCreating", "Scan-Slot erstellt": "slotCreated",
  "Scans werden zusammengeführt": "mergeRunning", "Scan-Bundle erstellt": "bundleCreated",
  "Scan-Zusammenführung fehlgeschlagen": "mergeFailed", "Scan-Zusammenführung unterbrochen": "mergeInterrupted",
};

export default function Topbar({ user }: { user?: { name: string; role?: string } }) {
  const { open } = useUploadCenter();
  const { isVisibleInTopbar } = useFeatureAccess();
  const { open: isFavoritesOpen, toggle: toggleFavorites } = useLocalFavoritesMenu();
  const { t } = useTranslation();
  const location = useLocation();
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [isMobileSearchOpen, setIsMobileSearchOpen] = React.useState(false);
  const mobileSearchPanelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => { setIsMobileSearchOpen(false); }, [location.key, location.pathname, location.search, location.hash]);
  const navItems = React.useMemo(
    () => TOPBAR_ITEMS.filter((item) => !item.featureId || isVisibleInTopbar(item.featureId)),
    [isVisibleInTopbar],
  );
  const { jobs, activityEvents, hasUnread, hasRunning, markAllRead, cleanupExpired } = useNotifications();
  const notificationRootRef = React.useRef<HTMLDivElement | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const showNotificationBadge = hasUnread || hasRunning;
  const notificationJobs = React.useMemo(
    () => [...jobs].sort((left, right) => right.updatedAt - left.updatedAt),
    [jobs],
  );
  const sortedActivityEvents = React.useMemo(
    () => [...activityEvents].sort((left, right) => right.createdAtMs - left.createdAtMs),
    [activityEvents],
  );

  const onUploadClick = () => {
    open({ tab: "json" });
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    if (!isMobile) {
      setIsMobileSearchOpen(false);
    }
  }, [isMobile]);

  React.useEffect(() => {
    if (!isMobileSearchOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileSearchOpen]);

  React.useEffect(() => {
    if (!isMobileSearchOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileSearchOpen]);

  React.useEffect(() => {
    if (!isMobileSearchOpen) return;
    const focusInput = () => {
      const input = mobileSearchPanelRef.current?.querySelector("input");
      input?.focus();
    };
    const id = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(id);
  }, [isMobileSearchOpen]);

  React.useEffect(() => {
    if (!isNotificationsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationRootRef.current) return;
      const target = event.target as Node | null;
      if (target && !notificationRootRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationsOpen]);

  const toggleNotifications = React.useCallback(() => {
    setIsNotificationsOpen((prev) => {
      const next = !prev;
      if (next) {
        cleanupExpired();
        markAllRead();
      }
      return next;
    });
  }, [cleanupExpired, markAllRead]);

  const formatActivityAge = React.useCallback((createdAtMs: number) => {
    const diffMs = Date.now() - createdAtMs;
    if (diffMs < 60_000) return t("topbar.activity.justNow");
    const diffMinutes = Math.floor(diffMs / 60_000);
    return t("topbar.activity.minutesAgo", { count: diffMinutes });
  }, [t]);


  const notificationLabel = (label: string) => {
    const key = NOTIFICATION_LABEL_KEYS[label];
    return key ? t(`topbar.activity.${key}`) : label;
  };
  const openSearchLabel = t("search.open", { defaultValue: "Open search" });

  return (
    <>
      <header className={styles.topbar}>
        {/* LINKS */}
        <div className={styles.topbarLeft}>
          <div className={styles.notificationsRoot} ref={notificationRootRef}>
            <button
              className={styles.btnIco}
              type="button"
              aria-label={t("nav.notifications", { defaultValue: "Notifications" })}
              aria-haspopup="dialog"
              aria-expanded={isNotificationsOpen}
              onClick={toggleNotifications}
            >
              <Bell className={styles.ico} />
              {showNotificationBadge ? <span className={styles.notificationBadge} aria-hidden /> : null}
            </button>
            {isNotificationsOpen ? (
              <div
                className={styles.notificationsDropdown}
                role="dialog"
                aria-label={t("nav.notifications", { defaultValue: "Notifications" })}
              >
                <div className={styles.notificationsHeader}>
                  {t("nav.notifications", { defaultValue: "Notifications" })}
                </div>
                <div className={styles.notificationsSectionTitle}>{t("topbar.activity.system")}</div>
                <div className={styles.notificationsList}>
                  {notificationJobs.length === 0 ? (
                    <p className={styles.notificationsEmpty}>{t("topbar.activity.noJobs")}</p>
                  ) : (
                    notificationJobs.map((job) => (
                      <div key={job.id} className={styles.notificationItem}>
                        <span className={styles.notificationStatusIcon} aria-hidden>
                          {job.status === "running" ? (
                            <Loader2 className={`${styles.notificationStatusGlyph} ${styles.notificationStatusSpin}`} />
                          ) : job.status === "success" ? (
                            <CheckCircle2 className={`${styles.notificationStatusGlyph} ${styles.notificationStatusSuccess}`} />
                          ) : (
                            <AlertCircle className={`${styles.notificationStatusGlyph} ${styles.notificationStatusError}`} />
                          )}
                        </span>
                        <div className={styles.notificationBody}>
                          <p className={styles.notificationTitle}>{notificationLabel(job.title)}</p>
                          <p className={styles.notificationDetail}>
                            {job.detail ??
                              (job.status === "running"
                                ? t("topbar.activity.updating")
                                : job.status === "success"
                                  ? t("topbar.activity.updated")
                                  : t("topbar.activity.failed"))}
                          </p>
                        </div>
                        {job.progress ? (
                          <span className={styles.notificationProgress}>
                            {job.progress.current}/{job.progress.total}
                          </span>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                <div className={styles.notificationsSectionTitle}>{t("topbar.activity.title")}</div>
                <div className={styles.notificationsList}>
                  {sortedActivityEvents.length === 0 ? (
                    <p className={styles.notificationsEmpty}>{t("topbar.activity.empty")}</p>
                  ) : (
                    sortedActivityEvents.map((event) => (
                      <div key={event.id} className={styles.notificationItem}>
                        <span className={styles.notificationStatusIcon} aria-hidden>
                          {event.kind === "favorite_added" ? (
                            <Star className={`${styles.notificationStatusGlyph} ${styles.notificationStatusActivityAdd}`} />
                          ) : event.kind === "favorite_removed" ? (
                            <StarOff className={`${styles.notificationStatusGlyph} ${styles.notificationStatusActivityRemove}`} />
                          ) : event.kind === "data_job_completed" ? (
                            <CheckCircle2 className={`${styles.notificationStatusGlyph} ${styles.notificationStatusSuccess}`} />
                          ) : (
                            <AlertCircle className={`${styles.notificationStatusGlyph} ${styles.notificationStatusError}`} />
                          )}
                        </span>
                        <div className={styles.notificationBody}>
                          <p className={styles.notificationTitle}>{notificationLabel(event.title)}</p>
                          <p className={styles.notificationDetail}>{event.message}</p>
                        </div>
                        <span className={styles.notificationAge}>{formatActivityAge(event.createdAtMs)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            className={styles.btnIco}
            type="button"
            aria-label={t("nav.favorites", { defaultValue: "Favorites" })}
            aria-haspopup="dialog"
            aria-expanded={isFavoritesOpen}
            aria-controls="local-favorites-dialog"
            onClick={event => toggleFavorites(event.currentTarget)}
          >
            <Star className={styles.ico} />
          </button>
          <button
            className={`${styles.btnIco} ${styles.mobileSearchBtn}`}
            aria-label={openSearchLabel}
            onClick={() => setIsMobileSearchOpen(true)}
            type="button"
          >
            <Search className={styles.ico} />
          </button>
          {navItems.length > 0 ? (
            <nav className={styles.topbarNav} aria-label={t("topbar.quickAccess", { defaultValue: "Quick access" })}>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `${styles.pill} ${styles.topbarLink} ${isActive ? styles.pillActive : ""}`
                  }
                >
                  {t(`nav.${item.labelKey}`, { defaultValue: item.defaultLabel })}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>

        {/* MITTE: bestehender Suchslot */}
        <div className={styles.searchWrap}>
          <HubSearch variant="topbar" />
        </div>

        {/* RECHTS */}
        <div className={styles.topbarRight}>
          <a
            className={`${styles.pill} ${styles.gameLinkButton} ${styles.onlyExpanded}`}
            href="https://www.sfgame.net"
            target="_blank"
            rel="noreferrer"
            aria-label={t("topbar.officialGameSite", { defaultValue: "Visit the official game website" })}
          >
            <Globe className={styles.ico} />
            {t("topbar.officialGameSite", { defaultValue: "Visit the official game website" })}
          </a>

            <button
              className={styles.upload}
              aria-label={t("topbar.upload", { defaultValue: "Upload scan" })}
              onClick={onUploadClick}
              title={t("topbar.upload", { defaultValue: "Upload scan" })}
            >
              <Upload className={styles.ico} />
              <span className={styles.label}>{t("topbar.upload", { defaultValue: "Upload scan" })}</span>
            </button>

          <AccountMenu fallbackName={user?.name} />
        </div>
      </header>

      {isMobile && isMobileSearchOpen ? (
        <div
          className={styles.mobileSearchOverlay}
          role="presentation"
          onClick={() => setIsMobileSearchOpen(false)}
        >
          <div
            className={styles.mobileSearchPanel}
            onClick={(event) => event.stopPropagation()}
            ref={mobileSearchPanelRef}
          >
            <div className={styles.searchWrap}>
              <HubSearch variant="topbar" />
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}
