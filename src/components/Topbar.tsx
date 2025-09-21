import React from "react";
import { Bell, Star, Search, Upload, Globe } from "lucide-react";

export default function Topbar({ user }: { user?: { name: string } }) {
  return (
    <header className="topbar">
      {/* Links: Icon-Buttons */}
      <button className="btn-ico" aria-label="Benachrichtigungen">
        <Bell className="ico" />
      </button>
      <button className="btn-ico" aria-label="Favoriten">
        <Star className="ico" />
      </button>

      {/* Mitte: Suche */}
      <div className="search-wrap">
        <Search className="search-ico ico" />
        <input className="search" placeholder="Suchen (Spieler, Gilde, Server)…" />
      </div>

      {/* Rechts: alles in einen Block, damit es rechts klebt */}
      <div className="topbar-right">
        <a className="pill only-expanded" href="https://www.sfgame.net" target="_blank" rel="noreferrer">
          <Globe className="ico" /> www.sfgame.net
        </a>

        <button className="upload btn">
          <Upload className="ico" />
          <span className="label">Scan hochladen</span>
        </button>

        <button className="avatar-btn" aria-label={user?.name ?? "Gast"}>
          <img className="avatar" src="https://i.pravatar.cc/72" alt="" />
        </button>
      </div>
    </header>
  );
}
