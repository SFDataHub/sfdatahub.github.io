import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../../lib/i18n/useProfileTranslation";
import { DATA_HUB } from "../../../lib/data-hub/routes";
import cardStyles from "../../../pages/GuildHub/DashboardGuildCard.module.css";
import styles from "./LocalTitleNavigation.module.css";

/** The player profile's equal title wings, shared by local detail destinations. */
export default function LocalTitleNavigation({ title, onBack, className, profile = false, rightLabel, rightTo = DATA_HUB, rightState }: {
  title: ReactNode; onBack: () => void; className?: string; profile?: boolean;
  rightLabel?: string; rightTo?: string; rightState?: unknown;
}) {
  const { t } = useTranslation(), navigate = useNavigate();
  const side = profile ? "local-profile-title-side" : styles.side;
  const button = `${cardStyles.averageHud} ${cardStyles.sectionHud} ${profile ? "local-profile-title-nav" : styles.button}`;
  return <div className={`${profile ? "profile-overlay__local-title" : styles.root}${className ? ` ${className}` : ""}`} data-local-title-navigation>
    <div className={side}>
      <button type="button" className={button} onClick={onBack}>{t("localProfileRoute.back")}</button>
      <span aria-hidden="true" data-title-stripe />
    </div>
    <strong>{title}</strong>
    <div className={side}>
      <span aria-hidden="true" data-title-stripe />
      <button type="button" className={button} onClick={() => navigate(rightTo, { state: rightState })}>{rightLabel ?? t("localProfileRoute.dataHub")}</button>
    </div>
  </div>;
}
