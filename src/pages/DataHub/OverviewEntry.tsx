import { hubText } from "../../lib/i18n/dataHubPresentation";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ContentShell from "../../components/ContentShell";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import LocalGuildFavorites from "../../components/data-hub/LocalGuildFavorites";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import HubSearch from "./HubSearch";
import styles from "./Index.module.css";

export default function OverviewEntry({ kind }: { kind: "guild" | "player" }) {
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const returnTo = safeLocalReturn(location.state?.returnTo);
  const back = () => navigate(returnTo === location.pathname + location.search ? DATA_HUB : returnTo ?? DATA_HUB, { replace: true });
  return <ContentShell centerFramed={false}><div className={styles.content} data-overview-entry={kind}>
    <LocalTitleNavigation className={styles.overviewTitle} onBack={back} title={<h1 className={styles.title}>{kind === "guild" ? hubText("dataHubI18n.guildOverview") : hubText("dataHubI18n.playerOverview")}</h1>} />
    <LocalGuildFavorites key={kind} manageable overviewKind={kind} description={t(`hubNavigation.${kind}HintEntry`)} />
    <HubSearch entityKind={kind} variant={kind === "player" ? "player-overview" : "guild-overview"} />
  </div></ContentShell>;
}
