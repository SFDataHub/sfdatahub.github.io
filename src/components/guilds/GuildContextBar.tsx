import React from "react";
import { Link } from "react-router-dom";
import Tooltip from "../ui/Tooltip/Tooltip";
import { guildIconByIdentifier } from "../../data/guilds";
import {
  listGuildHubLocalGuildsForServerFromScanSummaries,
  listGuildHubScanSummaries,
  subscribeToSfDataHubLocalScanChanges,
  type GuildHubScanSummary,
} from "../../lib/guilds/localScanLibrary";
import GuildEmblem from "./GuildEmblem";
import styles from "./GuildContextBar.module.css";
import {
  mapLocalGuildIdentityToSelection,
  useGuildHubSelection,
  type GuildHubSelectedGuild,
} from "../../pages/GuildHub/hooks/useGuildHubSelection";

function formatGuildTooltip(name: string, server: string) {
  return `${name} · ${server}`;
}

export default function GuildContextBar({ useImageFallback = true }: { useImageFallback?: boolean }) {
  const { activeGuildId, selectedGuilds, setActiveGuildId } = useGuildHubSelection();
  const localScanSummaries = useLocalScanSummariesForCoa(useImageFallback);
  const visibleGuilds = React.useMemo(
    () =>
      useImageFallback ? selectedGuilds : enrichGuildsWithLocalCoa(selectedGuilds, localScanSummaries),
    [localScanSummaries, selectedGuilds, useImageFallback],
  );

  return (
    <nav className={styles.contextBar} aria-label="Guild-Hub-Kontextnavigation">
      {visibleGuilds.length ? (
        <div className={styles.guildRail} role="list" aria-label="Gespeicherte Guild-Slots">
          {visibleGuilds.map((guild) => {
            const active = guild.id === activeGuildId;
            const emblemUrl = useImageFallback ? guildIconByIdentifier(guild.logoIdentifier, 96).thumb || undefined : undefined;
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

      <Link to="/guild-hub" className={styles.backLink}>
        Zurück zum Guild Hub
      </Link>
    </nav>
  );
}

function useLocalScanSummariesForCoa(disabled: boolean) {
  const [summaries, setSummaries] = React.useState<GuildHubScanSummary[]>([]);

  React.useEffect(() => {
    if (disabled) {
      setSummaries([]);
      return undefined;
    }

    let cancelled = false;
    const load = () => {
      listGuildHubScanSummaries()
        .then((nextSummaries) => {
          if (!cancelled) setSummaries(nextSummaries);
        })
        .catch(() => {
          if (!cancelled) setSummaries([]);
        });
    };

    load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [disabled]);

  return summaries;
}

function enrichGuildsWithLocalCoa(
  selectedGuilds: GuildHubSelectedGuild[],
  summaries: GuildHubScanSummary[],
) {
  if (!selectedGuilds.length || !summaries.length) return selectedGuilds;

  const localGuildsById = new Map<string, GuildHubSelectedGuild>();
  const selectedServers = [...new Set(selectedGuilds.map((guild) => guild.server).filter(Boolean))];

  for (const server of selectedServers) {
    for (const option of listGuildHubLocalGuildsForServerFromScanSummaries(summaries, server)) {
      const guild = mapLocalGuildIdentityToSelection(option);
      if (guild) localGuildsById.set(guild.id, guild);
    }
  }

  return selectedGuilds.map((guild) => {
    const localGuild = localGuildsById.get(guild.id);
    if (!localGuild?.coaString || guild.coaString) return guild;
    return { ...guild, coaString: localGuild.coaString };
  });
}
