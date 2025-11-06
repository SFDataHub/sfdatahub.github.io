// FILE: src/pages/SFMagazine/HistoryBook/index.tsx
import React, { useMemo, useRef, useState, useCallback } from "react";
import ContentShell from "../../../components/ContentShell";
import styles from "./styles.module.css";
import FlipbookCurlViewer from "../../../components/Flipbook/FlipbookCurlViewer";
import { hotspotsByPage, Hotspot } from "./hotspots";

type PageFlipLike = {
  flipNext: () => void;
  flipPrev: () => void;
  turnToPage: (index: number) => void; // 0-basiert
};

const HistoryBookPage: React.FC = () => {
  const slug = "sf-history-book";
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pfRef = useRef<PageFlipLike | null>(null);

  const pageHotspots: Hotspot[] = useMemo(
    () => hotspotsByPage[currentPage] ?? [],
    [currentPage]
  );

  const handleReady = useCallback((pf: any) => { pfRef.current = pf as PageFlipLike; }, []);
  const handlePageChange = useCallback((p0: number) => { setCurrentPage(p0 + 1); }, []);

  const handleGoto = useCallback((toPage1Based: number) => {
    const pf = pfRef.current;
    if (!pf) return;
    try { pf.turnToPage(Math.max(0, toPage1Based - 1)); } catch {}
  }, []);

  const flipPrev = useCallback(() => pfRef.current?.flipPrev(), []);
  const flipNext = useCallback(() => pfRef.current?.flipNext(), []);

  return (
    <ContentShell title="SF History Book" description="Echter Page-Curl Flipbook-Viewer (ohne Sound)." lastUpdated={undefined}>
      <div className={styles.pageWrap}>
        <div className={styles.infoLine}>
          Blättern: Ecke ziehen, Ränder klicken, oder ← / →. Kein Sound.
        </div>

        <div className={styles.viewerHost}>
          <FlipbookCurlViewer
            slug={slug}
            initialPage={1}
            onReady={handleReady}
            onPageChange={handlePageChange}
            noSound
          />

          <div className={styles.overlay} aria-hidden>
            <div className={styles.dragZoneLeft} onClick={flipPrev} />
            <div className={styles.dragZoneRight} onClick={flipNext} />
            {pageHotspots.map((hs, i) => {
              const styleVars = { ["--t" as any]: `${hs.t}%`, ["--l" as any]: `${hs.l}%`, ["--w" as any]: `${hs.w}%`, ["--h" as any]: `${hs.h}%` };
              return hs.kind === "goto" ? (
                <button key={i} className={styles.inbookLink} style={styleVars as React.CSSProperties} aria-label={hs.label} onClick={() => handleGoto(hs.toPage)} />
              ) : (
                <a key={i} className={styles.inbookLink} style={styleVars as React.CSSProperties} aria-label={hs.label} href={hs.href} target="_blank" rel="noopener noreferrer" />
              );
            })}
          </div>
        </div>
      </div>
    </ContentShell>
  );
};

export default HistoryBookPage;
