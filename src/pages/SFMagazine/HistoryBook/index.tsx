// src/pages/SFMagazine/HistoryBook/index.tsx
import React from "react";
import ContentShell from "../../../components/ContentShell";
import styles from "./styles.module.css";

// NEU: Page-Curl Viewer
import FlipbookCurlViewer from "../../../components/Flipbook/FlipbookCurlViewer";

const HistoryBookPage: React.FC = () => {
  const slug = "sf-history-book";
  return (
    <ContentShell
      title="SF History Book"
      description="Echter Page-Curl Flipbook-Viewer (ohne Sound)."
      lastUpdated={undefined}
    >
      <div className={styles.pageWrap}>
        <div className={styles.infoLine}>
          Blättern: Ecke ziehen, Ränder klicken, oder ← / →. Kein Sound.
        </div>
        <div className={styles.viewerHost}>
          <FlipbookCurlViewer slug={slug} initialPage={1} />
        </div>
      </div>
    </ContentShell>
  );
};

export default HistoryBookPage;
