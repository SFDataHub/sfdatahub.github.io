import React from "react";
import { NavLink } from "react-router-dom";
import { Bell, Star, Upload, Globe } from "lucide-react";
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
  const navItems = React.useMemo(
    () => TOPBAR_ITEMS.filter((item) => !item.featureId || isVisibleInTopbar(item.featureId)),
    [isVisibleInTopbar],
  );

  const onUploadClick = () => {
    open({ tab: "json" });
  };

  return (
    <header className={styles.topbar}>
      {/* LINKS */}
      <div className={styles.topbarLeft}>
        <button className={styles.btnIco} aria-label={t("nav.notifications", { defaultValue: "Notifications" })}>
          <Bell className={styles.ico} />
        </button>
        <button className={styles.btnIco} aria-label={t("nav.favorites", { defaultValue: "Favorites" })}>
          <Star className={styles.ico} />
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
          className={`${styles.pill} ${styles.onlyExpanded}`}
          href="https://www.sfgame.net"
          target="_blank"
          rel="noreferrer"
        >
          <Globe className={styles.ico} />
          www.sfgame.net
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
  );
}
