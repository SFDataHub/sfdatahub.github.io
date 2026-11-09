import { useAnalyticsView } from "../../lib/analytics/localEvents";
import HubSearch from "./HubSearch";
import { Link, useLocation } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useAnalyticsConstructionAccess } from "../../lib/data-hub/constructionAccess";
import { useTranslation } from "react-i18next";
import { useEffect, useId, useRef, useState } from "react";
import ScanInventoryInfo from "./ScanInventoryInfo";
import ContentShell from "../../components/ContentShell";
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import BetaCornerBanner from "../../components/ui/shared/BetaCornerBanner";
import styles from "./Index.module.css";
import DataHubSetup from "./DataHubSetup";

export default function DataHubIndex() {
  const { t } = useTranslation();
  const location = useLocation();
  const returnState = { returnTo: location.pathname + location.search, profileReturnState: location.state };
  const { active: analyticsUnderConstruction, canAccess: canOpenAnalytics } = useAnalyticsConstructionAccess();
  const analyticsContent = <>
    <h2 className={styles.tileTitle}>{t("nav.analytics")}</h2>
    <p className={styles.description}>{t("hubNavigation.analyticsHint")}</p>
    {analyticsUnderConstruction && <div className={styles.constructionBanner}>
      <TriangleAlert aria-hidden="true" />
      <span>{t("hubNavigation.underConstruction")}</span>
      <span className={styles.constructionStripe} aria-hidden="true" />
    </div>}
  </>;
  const [inventoryOpen, setInventoryOpen] = useState(false);
  useAnalyticsView(inventoryOpen ? "datahub/dashboard/scan-inventory" : null);
  const inventoryId = useId();
  const infoButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!inventoryOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setInventoryOpen(false);
      infoButton.current?.focus();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [inventoryOpen]);
  return (
    <ContentShell centerFramed={false}>
      <div className={styles.content}>
        <SectionDividerHeader title={<h1 className={styles.title}>{t("nav.dataHub")}</h1>} />

        <div className={styles.searchRow}>
          <HubSearch variant="dashboard" />
          <button
            ref={infoButton}
            type="button"
            className={styles.infoButton}
            aria-label={t(inventoryOpen ? "dataHubInventory.hide" : "dataHubInventory.show")}
            aria-expanded={inventoryOpen}
            aria-controls={inventoryId}
            data-inventory-toggle
            onClick={() => setInventoryOpen(open => !open)}
          >
            <span aria-hidden="true">ⓘ</span>
          </button>
        </div>
        {inventoryOpen && <ScanInventoryInfo id={inventoryId} />}
        <DataHubSetup />

        <section className={styles.tileGrid} aria-label={t("hubNavigation.areas")}>
          <Link className={styles.tile} to="/data-hub/toplist">
            <h2 className={styles.tileTitle}>{t("hubNavigation.localToplist")}</h2>
            <p className={styles.description}>
              {t("hubNavigation.toplistHint")}
            </p>
          </Link>

          {canOpenAnalytics ? <Link className={styles.tile} to="/data-hub/analytics">
            {analyticsContent}
          </Link> : <a className={styles.tile} role="link" aria-disabled="true" tabIndex={0}>
            {analyticsContent}
          </a>}

          <section className={styles.areaCard} aria-labelledby="players-area" data-hub-area="players">
            <SectionDividerHeader title={<h2 id="players-area" className={styles.title}>{t("nav.players")}</h2>} />
            <Link className={styles.tile} to="/data-hub/player-hub">
              <h3 className={styles.tileTitle}>{t("hubNavigation.playerOverview")}</h3>
              <p className={styles.description}>{t("hubNavigation.playerHint")}</p>
            </Link>
          </section>
          <section className={styles.areaCard} aria-labelledby="guilds-area" data-hub-area="guilds">
            <SectionDividerHeader title={<h2 id="guilds-area" className={styles.title}>{t("nav.guilds")}</h2>} />
            <Link className={styles.tile} to="/data-hub/guild-hub/dashboard">
              <h3 className={styles.tileTitle}>{t("hubNavigation.guildOverview")}</h3>
              <p className={styles.description}>{t("hubNavigation.guildHint")}</p>
            </Link>
            <Link className={`${styles.tile} ${styles.betaTile}`} to="/data-hub/guild-hub/fight-tracking" state={returnState}>
              <h3 className={styles.tileTitle}>{t("hubNavigation.fightTracking")}</h3>
              <p className={styles.description}>{t("hubNavigation.fightHint")}</p>
              <BetaCornerBanner />
            </Link>
          </section>
          <Link className={styles.tile} to="/data-hub/scan-management">
            <h2 className={styles.tileTitle}>{t("hubNavigation.scanManagement")}</h2>
            <p className={styles.description}>{t("hubNavigation.scanManagementHint")}</p>
          </Link>
          <Link className={styles.tile} to="/data-hub/identity-matching" state={returnState}>
            <h2 className={styles.tileTitle}>{t("hubNavigation.identityMatching")}</h2>
            <p className={styles.description}>{t("hubNavigation.identityMatchingHint")}</p>
          </Link>
        </section>
      </div>
    </ContentShell>
  );
}
