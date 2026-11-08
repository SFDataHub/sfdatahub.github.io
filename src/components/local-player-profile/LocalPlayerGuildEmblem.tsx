import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useGuildEmblemVisual } from "../guilds/GuildEmblem";
import { favoriteReference } from "../../lib/data-hub/hubFavoritesContract";
import { resolveLocalGuildReference } from "../../lib/data-hub/useAddressedGuild";
import { localEntityPath } from "../../lib/data-hub/routes";
import { subscribeToLocalDataDependencies } from "../../lib/local-data/localDataDependencies";
import cardStyles from "../../pages/GuildHub/DashboardGuildCard.module.css";
import type { LocalPlayerProfileModel } from "./types";

type LocalGuild = NonNullable<Awaited<ReturnType<typeof resolveLocalGuildReference>>>;

export function useLocalPlayerGuild(profile: LocalPlayerProfileModel) {
  const identifier = profile.hero.guildIdentifier ?? profile.analytics.guildIdentifier, server = profile.hero.server ?? profile.analytics.server;
  const key = JSON.stringify([identifier, server]);
  const [result, setResult] = useState<{ key: string; guild: LocalGuild | null }>();
  useEffect(() => {
    let stopped = false, generation = 0;
    const load = async () => {
      const attempt = ++generation;
      // Withdraw artwork while its source or confirmed identity is revalidated.
      setResult(undefined);
      const ref = favoriteReference("guild", identifier, server);
      try {
        const guild = ref ? await resolveLocalGuildReference(ref) : null;
        if (!stopped && generation === attempt) setResult({ key, guild });
      } catch {
        if (!stopped && generation === attempt) setResult({ key, guild: null });
      }
    };
    void load();
    const unsubscribe = subscribeToLocalDataDependencies({ allSources: true, allIdentities: true }, () => { void load(); });
    return () => { stopped = true; generation++; unsubscribe(); };
  }, [identifier, server, key]);
  const guild = result?.key === key ? result.guild : null;
  return guild;
}

export default function LocalPlayerGuildEmblem({ guild }: { guild: LocalGuild | null }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { visualEmblemUrl } = useGuildEmblemVisual({ coaString: guild?.coaString, name: guild?.name });
  const ref = guild && favoriteReference("guild", guild.logoIdentifier, guild.server);
  return <div className="local-player-guild-slot">
    {guild && ref && visualEmblemUrl ? <Link className="local-player-guild-emblem"
      to={localEntityPath("guild", ref)}
      state={{ returnTo: location.pathname + location.search, guildReturnState: location.state, guildLoadingTarget: guild }}
      aria-label={t("localProfileRoute.openPlayerGuild", { name: guild.name })}>
      <img className={cardStyles.coaImage} src={visualEmblemUrl} alt="" draggable={false} />
    </Link> : <span className={cardStyles.coaFallback}>
      {t("guildProfile.heroPanel.meta.emblemMissing", { defaultValue: "Guild crest unavailable" })}
    </span>}
  </div>;
}
