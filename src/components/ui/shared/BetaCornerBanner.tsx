import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./BetaCornerBanner.module.css";

export default function BetaCornerBanner() {
  const { t } = useTranslation();

  return (
    <span className={styles.corner} role="img" aria-label={t("betaCornerBanner.description")}>
      <span className={styles.band}>
        <FlaskConical aria-hidden="true" />
        {t("betaCornerBanner.label")}
      </span>
    </span>
  );
}
