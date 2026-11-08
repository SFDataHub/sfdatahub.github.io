type PlayerFavoriteStarProps = {
  isFavorite: boolean;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  onToggle: () => void;
};

export default function PlayerFavoriteStar({ isFavorite, disabled, ariaLabel, title, onToggle }: PlayerFavoriteStarProps) {
  return (
    <button
      type="button"
      className="player-profile__favorite-star-button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={isFavorite}
      title={title ?? ariaLabel}
      style={{
        background: "transparent",
        border: "none",
        boxShadow: "none",
        padding: 4,
        margin: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        color: isFavorite ? "#facc15" : "rgba(226, 232, 240, 0.92)",
        opacity: disabled ? 0.55 : 1,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 28,
          lineHeight: 1,
          filter: isFavorite ? "drop-shadow(0 0 6px rgba(250, 204, 21, 0.35))" : "none",
        }}
      >
        {isFavorite ? "\u2605" : "\u2606"}
      </span>
    </button>
  );
}
