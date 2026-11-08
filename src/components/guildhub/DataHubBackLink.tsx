import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DATA_HUB, safeLocalReturn } from "../../lib/data-hub/routes";
import styles from "./GuildHubBackLink.module.css";

export default function DataHubBackLink({ returnTo, returnState }: { returnTo?: unknown; returnState?: unknown }) {
  const { t } = useTranslation();
  return <Link to={safeLocalReturn(returnTo) ?? DATA_HUB} state={returnState} className={styles.backLink} data-data-hub-back>{t("hubNavigation.back")}</Link>;
}
