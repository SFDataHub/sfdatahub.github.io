import { profileClassLabel, profileNumber } from "../../lib/i18n/profilePresentation";
import React from "react";
import { Minus, UserRound } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import PortraitPreview from "../avatar/PortraitPreview";
import { getClassIconUrl } from "../ui/shared/classIcons";
import { getClassMetaById } from "../../data/classes";
import { getGuildClassAccent } from "../guilds/classColors";
import { GUILD_ACCENT_FALLBACK } from "../../lib/ui/guildAccent";
import { parseHubSearchAppearance, searchClassId } from "../../lib/data-hub/hubSearchAppearance";
import type { HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import card from "../guilds/GuildCard.module.css";
import styles from "./LocalPlayerFavoriteCard.module.css";

/** Committed display evidence only; artwork never authorizes a local target. */
export default function LocalPlayerFavoriteCard({ favorite, disabled, onClick, onRemove }: {
  favorite: HubFavorite; disabled?: boolean; onClick: () => void; onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const canvasId = React.useId();
  const appearance = parseHubSearchAppearance(favorite.display.appearance);
  const meta = getClassMetaById(appearance?.classId ?? searchClassId(favorite.display.className));
  const icon = getClassIconUrl(meta?.label, 64);
  const [failedIcon, setFailedIcon] = React.useState<string>();
  const name = favorite.display.name || t("hubFavorites.unnamed");
  const guild = favorite.display.guildName || t("hubFavorites.unknown");
  const level = favorite.display.level != null ? profileNumber(favorite.display.level) : favorite.display.levelLabel?.replace(/^Level\s+/i, "") || t("hubFavorites.unknown");
  const server = favorite.display.server || favorite.reference?.serverNamespace || t("hubFavorites.unknown");
  const accent = getGuildClassAccent(meta?.key) ?? GUILD_ACCENT_FALLBACK;
  const style = { "--guild-card-accent": accent } as React.CSSProperties;
  const description = `${name}; ${t("hubFavorites.guildLabel")}: ${guild}; ${meta ? profileClassLabel(meta.key) : t("hubFavorites.unknown")}; ${t("hubFavorites.levelLabel")}: ${level}; ${server}`;
  return <span className={card.cardWrap} data-player-favorite-card data-player-class={meta?.id ?? "unknown"}>
    {onRemove && <button type="button" className={card.removeButton} aria-label={t("hubFavorites.removeLabel", { name })}
      onClick={event => { event.stopPropagation(); onRemove(); }}><Minus size={13} strokeWidth={3} aria-hidden /></button>}
    <button type="button" className={`${card.card} ${styles.playerCard}`} style={style} disabled={disabled}
      aria-label={`${t("localProfileRoute.open")}: ${description}`} title={description} onClick={onClick}>
      <span className={card.emblemZone}>
        <span className={card.emblemRing}>
          <span className={styles.portraitClip} data-player-portrait-clip>
            <PortraitPreview config={appearance?.portrait ?? undefined} label={name} showStatus={false}
              canvasId={`favorite-${canvasId}`} className={styles.portrait} shellClassName={styles.portraitShell}
              canvasClassName={styles.portraitCanvas}
              fallbackNode={<span className={styles.placeholder} data-player-portrait-fallback><UserRound size={34} aria-hidden /></span>} />
          </span>
        </span>
      </span>
      <span className={styles.identity}>
        <span className={card.name} data-favorite-name title={name}>{name}</span>
        <span className={styles.guild} title={guild}>{guild}</span>
      </span>
      <span className={styles.details}>
        <span className={styles.classLevel}>
          <span role="img" aria-label={meta ? profileClassLabel(meta.key) : t("hubFavorites.unknown")} title={meta ? profileClassLabel(meta.key) : t("hubFavorites.unknown")}>
            {icon && failedIcon !== icon ? <img className={styles.classIcon} src={icon} alt="" data-player-class-icon={meta?.id}
              loading="lazy" onError={() => setFailedIcon(icon)} /> : meta?.fallback ?? "?"}
          </span>
          <span>{t("hubFavorites.levelLabel")}: {level}</span>
        </span>
        <span className={styles.server}>{server}</span>
      </span>
    </button>
  </span>;
}
