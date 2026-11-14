import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import ContentShell from "../../components/ContentShell";
import CommunityHubDashboard from "../../components/community/CommunityHubDashboard";
import { useAuth } from "../../context/AuthContext";
import { getAppRoleFromUserRoles } from "../../lib/featureAccessConfig";
import communityLogo from "../../assets/logo_communityhub.png";
import CommunityCreators from "./CreatorHub";
import CommunityRecords from "./Records";
import { communityTab, type CommunityTab } from "./selection";
import guideStyles from "../GuideHubV2/GuideHubV2.module.css";
import constructionStyles from "../DataHub/Index.module.css";
import styles from "./styles.module.css";

function CreatorHubContent() {
  const { status, user } = useAuth();
  const { t } = useTranslation();
  // Same confirmed-session gate as HomeYouTube: never mount the reader while roles resolve.
  const canAccess = status === "authenticated" && getAppRoleFromUserRoles(user?.roles) === "admin";
  return canAccess ? <CommunityCreators /> : (
    <section className={guideStyles.viewerCard}>
      <h1 className={guideStyles.viewerTitle}>{t("nav.creatorHub")}</h1>
      <div className={`${constructionStyles.constructionBanner} ${styles.construction}`}>
        <TriangleAlert aria-hidden="true" />
        <span>{t("hubNavigation.underConstruction")}</span>
        <span className={constructionStyles.constructionStripe} aria-hidden="true" />
      </div>
    </section>
  );
}

/** Keep old direct links inside the hub and preserve their remaining URL/context. */
export function CommunityLegacyRedirect({ tab }: { tab: CommunityTab }) {
  const location = useLocation();
  const next = new URLSearchParams(location.search);
  next.set("tab", tab);
  return <Navigate replace to={{ pathname: "/community", search: `?${next}`, hash: location.hash }} state={location.state} />;
}

export default function CommunityIndex() {
  const [params] = useSearchParams();
  const tab = communityTab(params.toString());
  return (
    <ContentShell left={<CommunityHubDashboard logoSrc={communityLogo} activeTab={tab} />} leftWidth={280} leftFullHeight>
      <div className={guideStyles.viewerWrap}>
        {tab === "records" ? <CommunityRecords /> : <CreatorHubContent />}
      </div>
    </ContentShell>
  );
}
