import React from "react";
import { Bell, Star, Search, Upload, Globe } from "lucide-react";
import styles from "./Topbar.module.css";

/** NEU: Upload-Center-Context einbinden */
import { useUploadCenter } from "../UploadCenter/UploadCenterContext";

export default function Topbar({ user }: { user?: { name: string; role?: string } }) {
  const { open, canUse } = useUploadCenter(); // <- liefert open()

  const onUploadClick = () => {
    // optional: direkt mit Tab "json" starten
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

      {/* MITTE: Suche */}
      <div className={styles.searchWrap}>
        <Search className={`${styles.ico} ${styles.searchIco}`} aria-hidden />
        <input
          className={styles.search}
          placeholder="Suchen (Spieler, Gilde, Server)…"
          aria-label="Suchen"
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

        {/* Upload öffnet das Upload Center */}
        <button
          className={styles.upload}
          aria-label="Scan hochladen"
          onClick={onUploadClick}
          disabled={!canUse} /* falls Rolle keinen Zugriff hat */
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
