import React from "react";
import { Bell, Star, Upload, Globe } from "lucide-react";
import styles from "./Topbar.module.css";

/** Upload-Center */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

/** Neue Suche */
import UniversalSearch from "../search/UniversalSearch";

/** Klassen-Icons / Mapping */
import * as Classes from "../../data/classes";

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
      </div>

      {/* MITTE: PlayerSearch mit Klassen-Icon */}
      <div className={styles.searchWrap}>
        <UniversalSearch
          placeholder="Suchen (Spieler)…"
          getClassIcon={getClassIcon}
          maxResults={10}
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

        <button
          className={styles.upload}
          aria-label="Scan hochladen"
          onClick={onUploadClick}
          disabled={!canUse}
          title={!canUse ? "Kein Zugriff (Rolle benötigt)" : "Scan hochladen"}
        >
          <Upload className={styles.ico} />
          <span className={styles.label}>Scan hochladen</span>
        </button>

        <button className={styles.avatarBtn} aria-label={user?.name ?? "Gast"}>
          <img className={styles.avatar} src="https://i.pravatar.cc/72" alt="" />
        </button>
      </div>
    </header>
  );
}
