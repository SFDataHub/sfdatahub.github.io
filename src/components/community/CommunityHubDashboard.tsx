import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CommunityTab } from "../../pages/Community/selection";
import styles from "../../pages/GuideHubV2/GuideHubV2.module.css";

type Props = { logoSrc: string; activeTab: CommunityTab };

export default function CommunityHubDashboard({ logoSrc, activeTab }: Props) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const location = useLocation();
  const entries = [
    { key: "creators", label: t("nav.creatorHub") },
    { key: "records", label: t("communityRecords.records") },
  ] as const;

  return (
    <nav className={styles.nav} aria-label={t("nav.community")}>
      <div className={styles.navCard}>
        <div className={styles.navHeader}>
          <div className={styles.logoWrap}>
            <img src={logoSrc} alt={t("communityRecords.communityHub")} className={styles.logoImg} />
          </div>
          <div className={styles.divider} />
        </div>
        <div className={styles.navScroller}>
          {entries.map(({ key, label }) => {
            const next = new URLSearchParams(params);
            next.set("tab", key);
            next.delete("sub");
            next.delete("sub2");
            const active = activeTab === key;
            return (
              <div key={key} className={styles.navSection}>
                <Link
                  to={{ pathname: "/community", search: `?${next}`, hash: location.hash }}
                  className={`${styles.navRow} ${styles.categoryRow} ${active ? styles.navItemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  preventScrollReset
                  onClick={(event) => {
                    if (active && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) event.preventDefault();
                  }}
                >
                  <span className={styles.navRowLabel}>{label}</span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
