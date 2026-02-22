import React, { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import PlayerProfileScreen from "../../pages/players/PlayerProfileScreen";

type ProfileOverlayProps = {
  isOpen: boolean;
  playerIdentifier: string | null;
  playerName?: string | null;
  onClose: () => void;
};

export default function ProfileOverlay({
  isOpen,
  playerIdentifier,
  playerName,
  onClose,
}: ProfileOverlayProps) {
  const location = useLocation();

  useEffect(() => {
    if (!isOpen || !playerIdentifier) return;
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      console.debug("[ProfileOverlay] open", {
        identifier: playerIdentifier,
        playerName: playerName ?? null,
      });
    }
  }, [isOpen, playerIdentifier, playerName]);

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

  if (!isOpen || !playerIdentifier) return null;

  const basePath = location.pathname.replace(/\/+$/, "") || "/";
  const overlayPath = `${basePath}/_overlay-player/${encodeURIComponent(playerIdentifier)}`;

  return (
    <div
      className="profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={playerName ? `Player profile: ${playerName}` : "Player profile"}
      onClick={onClose}
    >
      <button
        type="button"
        className="profile-overlay__close profile-overlay__close--overlay"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close player profile overlay"
        title={playerName || "Close player profile"}
      >
        Close
      </button>
      <div
        className="profile-overlay__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="profile-overlay__content">
          <Routes
            key={playerIdentifier}
            location={overlayPath}
          >
            <Route path="_overlay-player/:identifier" element={<PlayerProfileScreen heroOnly />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
