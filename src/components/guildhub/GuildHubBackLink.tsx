import { Link, useLocation } from "react-router-dom";
import { safeLocalReturn, GUILD_HUB } from "../../lib/data-hub/routes";
import { useTranslation } from "react-i18next";
import styles from "./GuildHubBackLink.module.css";

export default function GuildHubBackLink() {
  const location = useLocation();
  const { t } = useTranslation();
  return (
    <Link to={safeLocalReturn(location.state?.returnTo) ?? GUILD_HUB} className={styles.backLink}>
      {t("localProfileRoute.back")}
    </Link>
  );
}
