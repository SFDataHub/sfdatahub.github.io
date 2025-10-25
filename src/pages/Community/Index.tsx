import React from "react";
import { useSearchParams } from "react-router-dom";
import ContentShell from "../../components/ContentShell";
import CommunityHubDashboard from "../../components/community/CommunityHubDashboard";
import styles from "./styles.module.css";

import communityLogo from "../../assets/logo_communityhub.png";  {/* Der korrekte Logo-Pfad */}

import CommunityCreators from "./Creators";  
import CommunityScans from "./Scans";
import CommunityPredictions from "./Predictions";
import CommunityNews from "./News";
import CommunityFeedback from "./Feedback";

/** Tab-Key -> Component Mapping für Community */
const TAB_MAP: Record<string, React.ComponentType> = {
  creators: CommunityCreators,
  scans: CommunityScans,
  predictions: CommunityPredictions,
  news: CommunityNews,
  feedback: CommunityFeedback,
};

export default function CommunityIndex() {
  const [params] = useSearchParams();
  const tab = params.get("tab") || "";

  const ActivePage = TAB_MAP[tab];

  return (
    <ContentShell>
      <div className={styles.topWrap}>
        <CommunityHubDashboard
          logoSrc={communityLogo}
          titleI18nKey="community.index.title"
        />
      </div>
      <div className={styles.divider} />
      <div className={styles.contentArea}>
        {ActivePage ? (
          <ActivePage />
        ) : (
          <div className={styles.placeholder}>
            <h2 className={styles.placeholderTitle}>Community</h2>
            <p className={styles.placeholderText}>
              Wähle oben eine Kategorie, um die Inhalte hier anzuzeigen.
            </p>
          </div>
        )}
      </div>
    </ContentShell>
  );
}
