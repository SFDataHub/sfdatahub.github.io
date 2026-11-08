import { useTranslation } from "react-i18next";
import { safeLocalReturn, GUILD_HUB } from "../../lib/data-hub/routes";
import { Link, useLocation } from "react-router-dom";
import Tooltip from "../ui/Tooltip/Tooltip";
import { guildIconByIdentifier } from "../../data/guilds";
import GuildEmblem from "./GuildEmblem";
import styles from "./GuildContextBar.module.css";
import type { useGuildHubSelection } from "../../pages/GuildHub/hooks/useGuildHubSelection";

import { useGuildFavoritesSelection } from "../../lib/data-hub/useGuildFavoritesSelection";
import type { HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import type { GuildHubSelectionGuild } from "../../lib/guilds/localScanLibrary";

function formatGuildTooltip(name: string, server: string) {
  return `${name} · ${server}`;
}

export default function GuildContextBar({ useImageFallback = true, selection, onSelectGuild }: {
  useImageFallback?: boolean;
  selection?: ReturnType<typeof useGuildHubSelection>;
  onSelectGuild?: (guild: GuildHubSelectionGuild, favorite?: HubFavorite) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const favorites = useGuildFavoritesSelection();
  const visibleGuilds = favorites.selectedGuilds;
  const activeGuildId = selection?.activeGuildId;
  const error = favorites.error;
  const retry = favorites.retry;
  const select = onSelectGuild ?? (selection ? (guild: GuildHubSelectionGuild) => selection.chooseGuild(guild) : undefined);

  return (
    <nav className={styles.contextBar} aria-label="Guild-Hub-Kontextnavigation">
      {visibleGuilds.length ? (
        <div className={styles.guildRail} role="list" aria-label="Gespeicherte Guild-Slots">
          {visibleGuilds.map((guild) => {
            const row = favorites.projection.rows.find(row => row.favorite.guild?.id === guild.id);
            const active = guild.id === activeGuildId;
            const emblemUrl = useImageFallback ? guildIconByIdentifier(guild.logoIdentifier, 96).thumb || undefined : undefined;
            const tooltip = formatGuildTooltip(guild.name, guild.server);

            return (
              <Tooltip key={guild.id} content={tooltip}>
                <button
                  disabled={!select || !favorites.projection.ready || row?.identity === "conflict" || row?.observation?.state === "ambiguous"}
                  type="button"
                  className={styles.guildButton}
                  aria-current={active ? "true" : undefined}
                  aria-label={select ? `${guild.name}, ${guild.server} auswählen` : `${guild.name}, ${guild.server}`}
                  aria-pressed={active}
                  onClick={async () => { const target = row && await favorites.projection.actionFavorite(row); if (target?.guild) select?.(target.guild, target); }}
                >
                  <GuildEmblem
                    active={active}
                    coaString={guild.coaString}
                    emblemUrl={emblemUrl}
                    fallbackLabel={guild.name.trim().charAt(0).toUpperCase() || "G"}
                    name={guild.name}
                    size="compact"
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <span className={styles.emptyState}>Keine Guild-Slots gespeichert.</span>
      )}

      {selection?.contextIssue && <span role="alert">{t(`pageContext.${selection.contextIssue}`)}</span>}
      {selection && selection.context.guild && <button type="button" onClick={() => selection.chooseGuild(null)}>{t("pageContext.clear")}</button>}
      {selection && !selection.context.guild && <span>{t("pageContext.choose")}</span>}
      {error && <span role="alert">{t("hubFavorites.error")} <button type="button" onClick={() => void retry()}>{t("hubFavorites.retry")}</button></span>}
      <Link to={safeLocalReturn(location.state?.returnTo) ?? GUILD_HUB} className={styles.backLink}>
        {t("localProfileRoute.back")}
      </Link>
    </nav>
  );
}
