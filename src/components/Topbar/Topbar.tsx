import React from "react";
import { Bell, Star, Search, Upload, Globe } from "lucide-react";
import styles from "./Topbar.module.css";

export default function Topbar({ user }: { user?: { name: string } }) {
  return (
    <header className={styles.topbar}>
      {/* Links: Icon-Buttons */}
      <button className={styles.btnIco} aria-label="Benachrichtigungen">
        <Bell className={styles.ico} />
      </button>
      <button className={styles.btnIco} aria-label="Favoriten">
        <Star className={styles.ico} />
      </button>

      {/* Mitte: Suche */}
      <div className={styles.searchWrap}>
        <Search className={`${styles.ico} ${styles.searchIco}`} />
        <input className={styles.search} placeholder="Suchen (Spieler, Gilde, Server)…" />
      </div>

      {/* Rechts: Block, damit es rechts klebt */}
      <div className={styles.topbarRight}>
        <a
          className={`${styles.pill} ${styles.onlyExpanded}`}
          href="https://www.sfgame.net"
          target="_blank"
          rel="noreferrer"
        >
          <Globe className={styles.ico} /> www.sfgame.net
        </a>

        <button className={styles.upload} aria-label="Scan hochladen">
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
