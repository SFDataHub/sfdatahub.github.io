import React, { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import GuildProfile from "../../pages/guilds/Profile";

type GuildProfileOverlayProps = {
  isOpen: boolean;
  guildId: string | null;
  guildName?: string | null;
  onClose: () => void;
};

export default function GuildProfileOverlay({
  isOpen,
  guildId,
  guildName,
  onClose,
}: GuildProfileOverlayProps) {
  const location = useLocation();

  useEffect(() => {
    if (!isOpen || !guildId) return;
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      console.debug("[GuildProfileOverlay] open", {
        guildId,
        guildName: guildName ?? null,
      });
    }
  }, [isOpen, guildId, guildName]);

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

  if (!isOpen || !guildId) return null;

  const basePath = location.pathname.replace(/\/+$/, "") || "/";
  const overlayPath = `${basePath}/_overlay-guild/${encodeURIComponent(guildId)}`;

  return (
    <div
      className="profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={guildName ? `Guild profile: ${guildName}` : "Guild profile"}
      onClick={onClose}
    >
      <button
        type="button"
        className="profile-overlay__close profile-overlay__close--overlay"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close guild profile overlay"
        title={guildName || "Close guild profile"}
      >
        Close
      </button>
      <div
        className="profile-overlay__panel"
        style={{ width: "min(1400px, 96vw)", maxHeight: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="profile-overlay__content">
          <Routes key={guildId} location={overlayPath}>
            <Route path="_overlay-guild/:guildId" element={<GuildProfile heroOnly />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
