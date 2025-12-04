import React from "react";
import { NavLink } from "react-router-dom";
import { Bell, Star, Upload, Globe } from "lucide-react";
import styles from "./Topbar.module.css";
import AccountMenu from "./AccountMenu";

/** Upload-Center */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

/** Neue Suche */
import UniversalSearch from "../search/UniversalSearch";

/** Klassen-Icons / Mapping */
import * as Classes from "../../data/classes";
import { useFeatureAccess } from "../../lib/featureAccessConfig";

const TOPBAR_ITEMS = [
  { to: "/", label: "Home", featureId: "main.home" },
  { to: "/dashboard", label: "Dashboard", featureId: "main.dashboard" },
  { to: "/guild-hub", label: "Guild Hub", featureId: "main.guildHub" },
  { to: "/community", label: "Community", featureId: "main.community" },
  { to: "/tools", label: "Tools", featureId: "main.tools" },
];

function getClassIcon(className?: string | null): string | undefined {
  if (!className) return undefined;
  const raw = String(className);
  const keyA = raw;
  const keyB = raw.toLowerCase();
  const keyC = raw.replace(/\s+/g, "");
  const keyD = keyB.replace(/\s+/g, "");

  // häufige Export-Varianten abdecken
  const pools: any[] = [
    (Classes as any).CLASS_ICON_BY_NAME,
    (Classes as any).CLASS_ICONS,
    (Classes as any).Icons,
    (Classes as any).icons,
    Classes as any,
  ];

  for (const p of pools) {
    if (!p) continue;
    const hit =
      p[keyA] ?? p[keyB] ?? p[keyC] ?? p[keyD];
    if (typeof hit === "string") return hit;
  }

  if (typeof (Classes as any).getClassIcon === "function") {
    try {
      const v = (Classes as any).getClassIcon(raw);
      if (typeof v === "string") return v;
    } catch {}
  }
  return undefined;
}

export default function Topbar({ user }: { user?: { name: string; role?: string } }) {
  const { open, canUse } = useUploadCenter();
  const { isVisibleInTopbar } = useFeatureAccess();
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
        <button className={styles.btnIco} aria-label="Benachrichtigungen">
          <Bell className={styles.ico} />
        </button>
        <button className={styles.btnIco} aria-label="Favoriten">
          <Star className={styles.ico} />
        </button>
        {navItems.length > 0 ? (
          <nav className={styles.topbarNav} aria-label="Schnellzugriff">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${styles.pill} ${styles.topbarLink} ${isActive ? styles.pillActive : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>

      {/* MITTE: PlayerSearch mit Klassen-Icon */}
      <div className={styles.searchWrap}>
        <UniversalSearch
          placeholder="Suchen (Spieler)…"
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
            aria-label="Scan hochladen"
            onClick={onUploadClick}
            title="Scan hochladen"
          >
            <Upload className={styles.ico} />
            <span className={styles.label}>Scan hochladen</span>
          </button>
        ) : null}

        <AccountMenu fallbackName={user?.name} />
      </div>
    </header>
  );
}
