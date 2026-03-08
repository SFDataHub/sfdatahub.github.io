import React from "react";
import { NavLink } from "react-router-dom";
import { AlertCircle, Bell, CheckCircle2, Globe, Loader2, Search, Star, StarOff, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./Topbar.module.css";
import AccountMenu from "./AccountMenu";
import TopbarFavoritesOverlay, { type TopbarFavoritePlayer } from "./TopbarFavoritesOverlay";

/** Upload-Center */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

/** Neue Suche */
import UniversalSearch from "../search/UniversalSearch";
import { useNotifications } from "../../context/NotificationsContext";
import { useAuth } from "../../context/AuthContext";

/** Klassen-Icons / Mapping */
import { getClassIconUrl } from "../ui/shared/classIcons";
import { useFeatureAccess } from "../../lib/featureAccessConfig";

const TOPBAR_ITEMS = [
  { to: "/", labelKey: "home", defaultLabel: "Home", featureId: "main.home" },
  { to: "/dashboard", labelKey: "dashboard", defaultLabel: "Dashboard", featureId: "main.dashboard" },
  { to: "/guild-hub", labelKey: "guildHub", defaultLabel: "Guild Hub", featureId: "main.guildHub" },
  { to: "/community", labelKey: "community", defaultLabel: "Community", featureId: "main.community" },
  { to: "/tools", labelKey: "tools", defaultLabel: "Tools", featureId: "main.tools" },
];

function getClassIcon(className?: string | null, size?: number): string | undefined {
  return getClassIconUrl(className, size);
}

function getServerFromFavoriteIdentifier(identifier: string): string {
  const splitIndex = identifier.indexOf("_p");
  if (splitIndex <= 0) return identifier;
  return identifier.slice(0, splitIndex);
}

export default function Topbar({ user }: { user?: { name: string; role?: string } }) {
  const { open, canUse } = useUploadCenter();
  const { isVisibleInTopbar } = useFeatureAccess();
  const { user: authUser, toggleFavoritePlayer } = useAuth();
  const { t } = useTranslation();
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const [isMobileSearchOpen, setIsMobileSearchOpen] = React.useState(false);
  const mobileSearchPanelRef = React.useRef<HTMLDivElement | null>(null);
  const navItems = React.useMemo(
    () => TOPBAR_ITEMS.filter((item) => !item.featureId || isVisibleInTopbar(item.featureId)),
    [isVisibleInTopbar],
  );
  const { jobs, activityEvents, hasUnread, hasRunning, markAllRead, cleanupExpired } = useNotifications();
  const notificationRootRef = React.useRef<HTMLDivElement | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = React.useState(false);
  const [favoriteRemoveBusyByIdentifier, setFavoriteRemoveBusyByIdentifier] = React.useState<Record<string, boolean>>(
    {},
  );
  const showNotificationBadge = hasUnread || hasRunning;
  const notificationJobs = React.useMemo(
    () => [...jobs].sort((left, right) => right.updatedAt - left.updatedAt),
    [jobs],
  );
  const sortedActivityEvents = React.useMemo(
    () => [...activityEvents].sort((left, right) => right.createdAtMs - left.createdAtMs),
    [activityEvents],
  );
  const favoritePlayers = React.useMemo<TopbarFavoritePlayer[]>(() => {
    const players = authUser?.favorites?.players ?? {};
    const rows = Object.entries(players)
      .map(([rawIdentifier, value]) => {
        const identifier = rawIdentifier.trim().toLowerCase();
        if (!identifier) return null;
        const rawMeta =
          value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
        const name = typeof rawMeta?.name === "string" && rawMeta.name.trim() ? rawMeta.name.trim() : identifier;
        const className = typeof rawMeta?.class === "string" ? rawMeta.class.trim() : "";
        return {
          identifier,
          name,
          className,
          server: getServerFromFavoriteIdentifier(identifier),
        };
      })
      .filter((entry): entry is TopbarFavoritePlayer => !!entry);
    return rows.sort((left, right) => left.name.localeCompare(right.name));
  }, [authUser?.favorites?.players]);

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

  React.useEffect(() => {
    if (authUser) return;
    setIsFavoritesOpen(false);
  }, [authUser]);

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
    if (diffMs < 60_000) return "just now";
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes === 1) return "1 min ago";
    return `${diffMinutes} min ago`;
  }, []);

  const openFavorites = React.useCallback(() => {
    if (!authUser) {
      const message = t("profile.favorite.authRequired", { defaultValue: "Sign in to use favorites." });
      if (typeof window !== "undefined") window.alert(message);
      return;
    }
    setIsFavoritesOpen(true);
  }, [authUser, t]);

  const closeFavorites = React.useCallback(() => {
    setIsFavoritesOpen(false);
  }, []);

  const handleRemoveFavorite = React.useCallback(
    async (favorite: TopbarFavoritePlayer) => {
      const identifier = favorite.identifier;
      const isStillFavorite = !!authUser?.favorites?.players?.[identifier];
      if (!isStillFavorite) return;
      setFavoriteRemoveBusyByIdentifier((prev) => ({ ...prev, [identifier]: true }));
      try {
        await toggleFavoritePlayer(identifier, {
          name: favorite.name,
          className: favorite.className || undefined,
        });
      } catch (error: any) {
        if (error?.code === "AUTH_REQUIRED") {
          const message = t("profile.favorite.authRequired", { defaultValue: "Sign in to use favorites." });
          if (typeof window !== "undefined") window.alert(message);
        } else {
          const message = t("profile.favorite.error", { defaultValue: "Could not update favorite." });
          if (typeof window !== "undefined") window.alert(message);
        }
      } finally {
        setFavoriteRemoveBusyByIdentifier((prev) => {
          const next = { ...prev };
          delete next[identifier];
          return next;
        });
      }
    },
    [authUser?.favorites?.players, t, toggleFavoritePlayer],
  );

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
                <div className={styles.notificationsSectionTitle}>System</div>
                <div className={styles.notificationsList}>
                  {notificationJobs.length === 0 ? (
                    <p className={styles.notificationsEmpty}>No system jobs.</p>
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
                          <p className={styles.notificationTitle}>{job.title}</p>
                          <p className={styles.notificationDetail}>
                            {job.status === "running"
                              ? "Updating favorites..."
                              : job.status === "success"
                              ? "Favorites updated"
                              : "Favorites update failed"}
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
                <div className={styles.notificationsSectionTitle}>Activity</div>
                <div className={styles.notificationsList}>
                  {sortedActivityEvents.length === 0 ? (
                    <p className={styles.notificationsEmpty}>No recent activity.</p>
                  ) : (
                    sortedActivityEvents.map((event) => (
                      <div key={event.id} className={styles.notificationItem}>
                        <span className={styles.notificationStatusIcon} aria-hidden>
                          {event.kind === "favorite_added" ? (
                            <Star className={`${styles.notificationStatusGlyph} ${styles.notificationStatusActivityAdd}`} />
                          ) : (
                            <StarOff className={`${styles.notificationStatusGlyph} ${styles.notificationStatusActivityRemove}`} />
                          )}
                        </span>
                        <div className={styles.notificationBody}>
                          <p className={styles.notificationTitle}>{event.title}</p>
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
            onClick={openFavorites}
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

        {/* MITTE: PlayerSearch mit Klassen-Icon */}
        <div className={styles.searchWrap}>
          <UniversalSearch
            placeholder={t("search.placeholder", { defaultValue: "Search players" })}
            getClassIcon={getClassIcon}
            maxPerSection={10}
          />
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

          {canUse ? (
            <button
              className={styles.upload}
              aria-label={t("topbar.upload", { defaultValue: "Upload scan" })}
              onClick={onUploadClick}
              title={t("topbar.upload", { defaultValue: "Upload scan" })}
            >
              <Upload className={styles.ico} />
              <span className={styles.label}>{t("topbar.upload", { defaultValue: "Upload scan" })}</span>
            </button>
          ) : null}

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
              <UniversalSearch
                placeholder={t("search.placeholder", { defaultValue: "Search players" })}
                getClassIcon={getClassIcon}
                maxPerSection={10}
              />
            </div>
          </div>
        </div>
      ) : null}
      <TopbarFavoritesOverlay
        isOpen={isFavoritesOpen}
        favorites={favoritePlayers}
        removeBusyByIdentifier={favoriteRemoveBusyByIdentifier}
        onClose={closeFavorites}
        onRemove={handleRemoveFavorite}
      />
    </>
  );
}
