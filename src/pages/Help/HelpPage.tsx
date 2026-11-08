import React from "react";
import ContentShell from "../../components/ContentShell";
import styles from "./help.module.css";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import LocalTitleNavigation from "../../components/ui/shared/LocalTitleNavigation";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import hubStyles from "../DataHub/Index.module.css";
import { QaContent, QaSidebar, useQaNavigation } from "./QaView";

import { helpView } from "../../lib/help/view";

const HelpPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const view = helpView(location.search, location.hash);
  const qa = useQaNavigation(view === "qa");
  const title = t(view === "overview" ? "nav.help" : `help.navigation.${view}`);
  const returnTo = safeLocalReturn(location.state?.returnTo);
  // Internal help entries retain the overview's own safe return context.
  const helpReturn = returnTo ? new URL(returnTo, "https://sfdatahub.invalid") : null;
  const internalReturn = helpReturn?.pathname === "/help";
  const overviewState = internalReturn ? location.state?.profileReturnState : location.state;
  const back = () => {
    const self = returnTo === location.pathname + location.search ||
      (internalReturn && helpView(helpReturn.search) === view);
    navigate(!self && returnTo ? returnTo : DATA_HUB, {
      replace: true,
      state: !self && returnTo ? location.state?.profileReturnState : undefined,
    });
  };
  const construction = <div className={hubStyles.constructionBanner}>
    <TriangleAlert aria-hidden="true" />
    <span>{t("help.navigation.underConstruction")}</span>
    <span className={hubStyles.constructionStripe} aria-hidden="true" />
  </div>;
  return (
    <div className={`${styles.shell} ${view === "overview" ? styles.overview : ""}`}>
    <ContentShell
      headerTransparent
      left={view === "qa" ? <QaSidebar model={qa} /> : undefined}
      leftWidth={view === "qa" ? 280 : 0}
      leftFullHeight={view === "qa"}
      headerContent={<LocalTitleNavigation title={<h1 className={hubStyles.title}>{title}</h1>} onBack={back}
        rightLabel={t(view === "overview" ? "help.navigation.home" : "nav.help")}
        rightTo={view === "overview" ? "/" : "/help"}
        rightState={view === "overview" ? undefined : overviewState} />}
      centerFramed
      padded
    >
      <div className={styles.root}>
        {view === "overview" ? <nav className={`${hubStyles.tileGrid} ${styles.navigation}`} aria-label={t("help.navigation.areas")}>
          <Link className={hubStyles.tile} to="/help?view=wiki" state={{ returnTo: location.pathname + location.search, profileReturnState: location.state }}>
            <h2 className={hubStyles.tileTitle}>{t("help.navigation.wiki")}</h2>
            {construction}
          </Link>
          <Link className={hubStyles.tile} to="/help?view=qa" state={{ returnTo: location.pathname + location.search, profileReturnState: location.state }}>
            <h2 className={hubStyles.tileTitle}>{t("help.navigation.qa")}</h2>
          </Link>
        </nav> : view === "wiki" ? <div className={styles.wiki}>
          {construction}
        </div> : <QaContent model={qa} />}
      </div>
    </ContentShell>
    </div>
  );
};

export default HelpPage;
