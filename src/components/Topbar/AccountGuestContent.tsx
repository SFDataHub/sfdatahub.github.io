import { useTranslation } from "react-i18next";
import styles from "./Topbar.module.css";

/** The existing guest prompt, without dropdown-only actions. */
export default function AccountGuestContent({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.accountGuestContent}>
          <div className={`${styles.accountHeader} ${styles.accountGuestHeader}`}>
            <p className={styles.accountName}>{t("account.menu.guestTitle")}</p>
            <p className={styles.accountSub}>
              {t("account.menu.guestSubtitle")}
            </p>
          </div>
          <button type="button" className={`${styles.accountPrimary} ${styles.accountGuestPrimary}`} onClick={onSignIn}>
            {t("account.menu.signInCta")}
          </button>
  </div>;
}
