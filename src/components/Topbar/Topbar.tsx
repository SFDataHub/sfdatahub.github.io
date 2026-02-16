import React from "react";
import { NavLink } from "react-router-dom";
import { Bell, Star, Upload, Globe, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./Topbar.module.css";
import AccountMenu from "./AccountMenu";

/** Upload-Center */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

/** Neue Suche */
import UniversalSearch from "../search/UniversalSearch";

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

export default function Topbar({ user }: { user?: { name: string; role?: string } }) {
  const { open, canUse } = useUploadCenter();
  const { isVisibleInTopbar } = useFeatureAccess();
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

  const openSearchLabel = t("search.open", { defaultValue: "Open search" });

  return (
    <>
      <header className={styles.topbar}>
        {/* LINKS */}
        <div className={styles.topbarLeft}>
          <button className={styles.btnIco} aria-label={t("nav.notifications", { defaultValue: "Notifications" })}>
            <Bell className={styles.ico} />
          </button>
          <button className={styles.btnIco} aria-label={t("nav.favorites", { defaultValue: "Favorites" })}>
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
    </>
  );
}
