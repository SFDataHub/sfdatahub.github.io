import React from "react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { useRenderedCoaUrl } from "../../components/guilds/GuildEmblem";
import { serverPickerPresentation } from "../../components/Filters/serverPickerModel";
import { DataHubLoadingState } from "../../components/ui/shared/DataHubLoadingState";
import { resolveServer } from "../../lib/servers/serverResolver";
import type { GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import RankingIcon from "../Playground/RankingIcon";
import styles from "./GuildDashboardLoadingState.module.css";

// The modern podium (variant 2) etches luminance detail into a neutral recess,
// with an inner dark upper edge and a light lower edge. No colored card/ring.
const GuildLoadingMotifs = React.memo(function GuildLoadingMotifs({ guild, coaString }: {
  guild: GuildHubSelectedGuild | null; coaString?: string | null;
}) {
  const id = `guild-loading-${React.useId().replace(/:/g, "")}`;
  const { url } = useRenderedCoaUrl(coaString, guild?.name);
  const server = guild && resolveServer(guild.server);
  const presentation = server && serverPickerPresentation(guild!.server);
  return <>
    <svg className={styles.filter} aria-hidden="true" focusable="false">
      <defs><filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2 -0.6 -0.2 1 0" result="detail" />
        <feGaussianBlur in="detail" stdDeviation="0.35" result="softDetail" />
        <feOffset in="softDetail" dx="0.9" dy="1.4" result="detailDown" />
        <feOffset in="softDetail" dx="-0.9" dy="-1.4" result="detailUp" />
        <feComposite in="detail" in2="detailDown" operator="arithmetic" k2="1" k3="-1" result="detailTop" />
        <feComposite in="detail" in2="detailUp" operator="arithmetic" k2="1" k3="-1" result="detailBottom" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="soft" />
        <feOffset in="soft" dx="0.9" dy="1.4" result="down" />
        <feComposite in="SourceAlpha" in2="down" operator="out" result="innerTop" />
        <feOffset in="soft" dx="-0.9" dy="-1.4" result="up" />
        <feComposite in="SourceAlpha" in2="up" operator="out" result="innerBottom" />
        <feFlood floodColor="#081523" floodOpacity="0.2" /><feComposite in2="SourceAlpha" operator="in" result="recess" />
        <feFlood floodColor="#081523" floodOpacity="0.65" /><feComposite in2="detail" operator="in" result="etchedDetail" />
        <feFlood floodColor="#030b14" floodOpacity="0.85" /><feComposite in2="innerTop" operator="in" result="shadow" />
        <feFlood floodColor="#a7c4df" floodOpacity="0.28" /><feComposite in2="innerBottom" operator="in" result="light" />
        <feFlood floodColor="#020912" floodOpacity="0.95" /><feComposite in2="detailTop" operator="in" result="detailShadow" />
        <feFlood floodColor="#aac6de" floodOpacity="0.8" /><feComposite in2="detailBottom" operator="in" result="detailLight" />
        <feMerge><feMergeNode in="recess" /><feMergeNode in="etchedDetail" /><feMergeNode in="shadow" /><feMergeNode in="light" /><feMergeNode in="detailShadow" /><feMergeNode in="detailLight" /></feMerge>
      </filter></defs>
    </svg>
    <div className={styles.guildMotif} aria-hidden="true" data-loading-coa>
      <svg viewBox="0 0 240 240" focusable="false">
        {url && <image href={url} width="240" height="240" filter={`url(#${id})`} />}
      </svg>
    </div>
    <div className={styles.serverMotif} aria-hidden="true" data-loading-server={server?.code}>
      <svg viewBox="0 0 240 240" focusable="false">
        {presentation && <g filter={`url(#${id})`}>
          <RankingIcon variant={presentation.fusion ? "fusion" : "server"} size={240} presentation="name-only" sphereOnly labelLines={[presentation.short]} labelFontSize={presentation.fontSize} />
        </g>}
      </svg>
    </div>
  </>;
});

export default function GuildDashboardLoadingState({ guild, coaString }: {
  guild: GuildHubSelectedGuild | null; coaString?: string | null;
}) {
  const { t } = useTranslation();
  return <section className={styles.surface} data-guild-dashboard-loading>
    <GuildLoadingMotifs guild={guild} coaString={coaString} />
    <DataHubLoadingState className={styles.status} variant="page" title={t("guildDashboardState.loading")} message={t("guildDashboardState.resolving")} />
  </section>;
}
