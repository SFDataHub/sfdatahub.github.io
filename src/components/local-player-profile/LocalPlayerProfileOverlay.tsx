import React, { useEffect } from "react";
import LocalPlayerAnalytics from "./LocalPlayerAnalytics";
import LocalHeroPanel from "./LocalHeroPanel";
import type { LocalPlayerProfileModel } from "./types";
import "../../styles/Toplist.css";
import "./LocalPlayerProfileOverlay.css";

type LocalPlayerProfileOverlayProps = {
  isOpen: boolean;
  profile: LocalPlayerProfileModel | null;
  onClose: () => void;
};

export default function LocalPlayerProfileOverlay({
  isOpen,
  profile,
  onClose,
}: LocalPlayerProfileOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !profile) return null;

  const playerName = profile.hero.playerName;

  return (
    <div
      className="profile-overlay profile-overlay--local"
      role="dialog"
      aria-modal="true"
      aria-label={`Local player profile: ${playerName}`}
      onClick={onClose}
    >
      <div className="profile-overlay__panel profile-overlay__panel--local" onClick={(event) => event.stopPropagation()}>
        <div className="profile-overlay__local-header">
          <div className="profile-overlay__local-title" aria-hidden="true">
            <span />
            <strong>PLAYER OVERVIEW</strong>
            <span />
          </div>
          <button
            type="button"
            className="profile-overlay__close profile-overlay__close--overlay profile-overlay__close--local"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Close player overview"
            title="Close player overview"
          >
            X
          </button>
        </div>
        <div className="profile-overlay__content profile-overlay__content--local sfdatahub-scrollbar">
          <div className="player-profile profile-overlay__local-grid">
            <LocalHeroPanel data={profile.hero} />
            <LocalPlayerAnalytics profile={profile} />
          </div>
        </div>
      </div>
    </div>
  );
}
