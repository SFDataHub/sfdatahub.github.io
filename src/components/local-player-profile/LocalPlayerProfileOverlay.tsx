import React, { useEffect } from "react";
import LocalHeroPanel from "./LocalHeroPanel";
import type { LocalPlayerProfileModel } from "./types";
import "../../styles/Toplist.css";

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
      className="profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Local player profile: ${playerName}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="profile-overlay__close profile-overlay__close--overlay"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close local player profile overlay"
        title={playerName || "Close local player profile"}
      >
        Close
      </button>
      <div className="profile-overlay__panel" onClick={(event) => event.stopPropagation()}>
        <div className="profile-overlay__content">
          <div className="player-profile">
            <LocalHeroPanel data={profile.hero} />
          </div>
        </div>
      </div>
    </div>
  );
}
