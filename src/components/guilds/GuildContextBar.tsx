import React from "react";
import { Link } from "react-router-dom";
import Tooltip from "../ui/Tooltip/Tooltip";
import { guildIconByIdentifier } from "../../data/guilds";
import GuildEmblem from "./GuildEmblem";
import styles from "./GuildContextBar.module.css";
import { useGuildHubSelection } from "../../pages/GuildHub/hooks/useGuildHubSelection";

function formatGuildTooltip(name: string, server: string) {
  return `${name} · ${server}`;
}

export default function GuildContextBar() {
  const { activeGuildId, selectedGuilds, setActiveGuildId } = useGuildHubSelection();

  return (
    <nav className={styles.contextBar} aria-label="Guild-Hub-Kontextnavigation">
      {selectedGuilds.length ? (
        <div className={styles.guildRail} role="list" aria-label="Gespeicherte Guild-Slots">
          {selectedGuilds.map((guild) => {
            const active = guild.id === activeGuildId;
            const emblem = guildIconByIdentifier(guild.logoIdentifier, 96);
            const tooltip = formatGuildTooltip(guild.name, guild.server);

            return (
              <Tooltip key={guild.id} content={tooltip}>
                <button
                  type="button"
                  className={styles.guildButton}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${guild.name}, ${guild.server} auswählen`}
                  aria-pressed={active}
                  onClick={() => setActiveGuildId(guild.id)}
                >
                  <GuildEmblem
                    active={active}
                    coaString={guild.coaString}
                    emblemUrl={emblem.thumb || undefined}
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

      <Link to="/guild-hub" className={styles.backLink}>
        Zurück zum Guild Hub
      </Link>
    </nav>
  );
}
