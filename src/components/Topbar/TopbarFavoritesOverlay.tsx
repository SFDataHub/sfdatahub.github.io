import React from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getGuildClassAccent, getGuildMutedAccent } from "../guilds/classColors";
import { useBackClose } from "../../hooks/useBackClose";
import { getClassIconUrl } from "../ui/shared/classIcons";
import styles from "./Topbar.module.css";

export type TopbarFavoritePlayer = {
  identifier: string;
  name: string;
  className: string;
  server: string;
};

type TopbarFavoritesOverlayProps = {
  isOpen: boolean;
  favorites: TopbarFavoritePlayer[];
  removeBusyByIdentifier: Record<string, boolean>;
  onClose: () => void;
  onRemove: (favorite: TopbarFavoritePlayer) => Promise<void>;
};

const FAVORITE_ACCENT_PALETTE = [
  "#4da3ff",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
];

function hashFavoriteSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

const TopbarFavoritesOverlay: React.FC<TopbarFavoritesOverlayProps> = ({
  isOpen,
  favorites,
  removeBusyByIdentifier,
  onClose,
  onRemove,
}) => {
  const { t } = useTranslation();

  useBackClose(isOpen, onClose);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.favoritesOverlayBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.favorites", { defaultValue: "Favorites" })}
      onClick={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <div className={styles.favoritesOverlayPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.favoritesOverlayHeader}>
          <div>
            <h2 className={styles.favoritesOverlayTitle}>{t("nav.favorites", { defaultValue: "Favorites" })}</h2>
            <p className={styles.favoritesOverlaySubtitle}>
              {t("topbar.favoritesOverlay.subtitle", {
                defaultValue: "Your player favorites from the current session cache.",
              })}
            </p>
          </div>
          <button
            type="button"
            className={styles.favoritesOverlayClose}
            onClick={onClose}
            aria-label={t("topbar.favoritesOverlay.close", { defaultValue: "Close favorites" })}
            title={t("topbar.favoritesOverlay.close", { defaultValue: "Close favorites" })}
          >
            <X className={styles.ico} />
            <span className={styles.favoritesOverlayCloseLabel}>
              {t("topbar.favoritesOverlay.close", { defaultValue: "Close favorites" })}
            </span>
          </button>
        </div>

        {favorites.length === 0 ? (
          <p className={styles.favoritesOverlayEmpty}>
            {t("topbar.favoritesOverlay.empty", { defaultValue: "You have no player favorites yet." })}
          </p>
        ) : (
          <ul className={styles.favoritesOverlayList}>
            {favorites.map((favorite, index) => {
              const classIcon = getClassIconUrl(favorite.className, 256);
              const removeBusy = !!removeBusyByIdentifier[favorite.identifier];
              const seed = hashFavoriteSeed(favorite.identifier);
              const classAccent =
                getGuildClassAccent(favorite.className) ?? FAVORITE_ACCENT_PALETTE[seed % FAVORITE_ACCENT_PALETTE.length];
              const mutedLow =
                getGuildMutedAccent(favorite.className, 0.24) ?? getGuildMutedAccent(classAccent, 0.24) ?? "#2d4764";
              const mutedMid =
                getGuildMutedAccent(favorite.className, 0.36) ?? getGuildMutedAccent(classAccent, 0.36) ?? "#375777";
              const mutedHigh =
                getGuildMutedAccent(favorite.className, 0.48) ?? getGuildMutedAccent(classAccent, 0.48) ?? "#44698b";
              const listBase = favorites.length > 1 ? 1 - index / (favorites.length + 1) : 1;
              const rel = Math.max(0.26, Math.min(1, listBase * 0.72 + 0.28 + (seed % 9) / 100));
              return (
                <li key={favorite.identifier} className={styles.favoritesOverlayItem}>
                  <div
                    className={styles.favoritesOverlayHudFill}
                    style={{
                      width: `${Math.round(rel * 100)}%`,
                      background: `linear-gradient(90deg, ${mutedHigh}CC 0%, ${mutedMid}88 52%, ${mutedLow}00 100%)`,
                    }}
                  />
                  <div
                    className={styles.favoritesOverlayHudHover}
                    style={{ background: `linear-gradient(100deg, ${mutedLow}14 0%, ${mutedMid}1A 100%)` }}
                  />
                  <div className={styles.favoritesOverlayItemInner}>
                    <div className={styles.favoritesOverlayItemInfo}>
                      <div className="relative h-6 w-16 shrink-0 overflow-visible">
                        <span
                          className="absolute left-0 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center overflow-visible rounded-xl"
                          style={{
                            background: "transparent",
                            boxShadow: `0 0 0 1px ${mutedMid}B3 inset`,
                            color: "#eef5ff",
                          }}
                        >
                          {classIcon ? (
                            <img
                              src={classIcon}
                              alt={favorite.className || t("topbar.favoritesOverlay.classFallback", { defaultValue: "Class" })}
                              className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
                              loading="lazy"
                              draggable={false}
                            />
                          ) : (
                            <span className="text-[10px] font-semibold">{favorite.name.slice(0, 1).toUpperCase() || "?"}</span>
                          )}
                        </span>
                      </div>
                      <div className={styles.favoritesOverlayMeta}>
                        <div className={styles.favoritesOverlayNameRow}>
                          <span className={styles.favoritesOverlayName}>{favorite.name}</span>
                          <span className={styles.favoritesOverlayServer}>{favorite.server}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.favoritesOverlayRemove}
                      onClick={() => {
                        void onRemove(favorite);
                      }}
                      disabled={removeBusy}
                      aria-label={t("playerProfile.heroPanel.actions.favorite.remove", {
                        defaultValue: "Remove from favorites",
                      })}
                      title={t("playerProfile.heroPanel.actions.favorite.remove", {
                        defaultValue: "Remove from favorites",
                      })}
                    >
                      <Trash2 className={styles.ico} />
                      <span>
                        {removeBusy
                          ? t("topbar.favoritesOverlay.removing", { defaultValue: "Removing..." })
                          : t("topbar.favoritesOverlay.remove", { defaultValue: "Remove" })}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default TopbarFavoritesOverlay;
