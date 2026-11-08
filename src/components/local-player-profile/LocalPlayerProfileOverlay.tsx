import { useEffect } from "react";
import type { LocalProfileOpeningContext } from "../../lib/data-hub/profileNavigation";
import type { LocalPlayerProfileModel } from "./types";
import { LocalPlayerProfileContent } from "./LocalPlayerProfileContent";
import { hasBackCloseLayer } from "../../hooks/useBackClose";
import "./LocalPlayerProfileOverlay.css";

type LocalPlayerProfileOverlayProps = {
  isOpen: boolean; profile: LocalPlayerProfileModel | null; onClose: () => void; onCopyLink?: () => void; openingContext?: LocalProfileOpeningContext; onGoToProfile?: () => void;
};
export default function LocalPlayerProfileOverlay({ isOpen, profile, onClose, onCopyLink, openingContext, onGoToProfile }: LocalPlayerProfileOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const focus = document.activeElement;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !hasBackCloseLayer()) onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
    };
  }, [isOpen, onClose]);
  if (!isOpen || !profile) return null;
  return <div className="profile-overlay profile-overlay--local" role="dialog" aria-modal="true"
    aria-label={`Local player profile: ${profile.hero.playerName}`} onClick={onClose}>
    <div className="profile-overlay__panel profile-overlay__panel--local" onClick={event => event.stopPropagation()}>
      <LocalPlayerProfileContent profile={profile} onClose={onClose} onCopyLink={onCopyLink} variant="overlay" openingContext={openingContext} onGoToProfile={onGoToProfile} />
    </div>
  </div>;
}
