// src/components/Flipbook/FlipbookHUD.tsx
import React from "react";
import styles from "./styles.module.css";

type Props = {
  page: number;           // 1-basiert
  pageCount: number;
  zoom: number;           // 1.0 = fit
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleFullscreen: () => void;
  fullscreenSupported: boolean;
};

const FlipbookHUD: React.FC<Props> = ({
  page, pageCount, zoom,
  canPrev, canNext,
  onPrev, onNext,
  onZoomIn, onZoomOut, onResetZoom,
  onToggleFullscreen, fullscreenSupported
}) => {
  const zoomPct = Math.round(zoom * 100);
  return (
    <div className={styles.hud}>
      <div className={styles.hudLeft}>
        <button className={`${styles.btn} ${styles.iconBtn}`} onClick={onPrev} disabled={!canPrev} aria-label="Previous page">◀</button>
        <button className={`${styles.btn} ${styles.iconBtn}`} onClick={onNext} disabled={!canNext} aria-label="Next page">▶</button>
      </div>

      <div className={styles.hudCenter}>
        {page} / {pageCount}
      </div>

      <div className={styles.hudRight}>
        <button className={`${styles.btn} ${styles.iconBtn}`} onClick={onZoomOut} aria-label="Zoom out">−</button>
        <div className={styles.zoomInfo}>{zoomPct}%</div>
        <button className={`${styles.btn} ${styles.iconBtn}`} onClick={onZoomIn} aria-label="Zoom in">＋</button>
        <button className={styles.btn} onClick={onResetZoom} aria-label="Reset zoom">Reset</button>
        {fullscreenSupported && (
          <button className={styles.btn} onClick={onToggleFullscreen} aria-label="Toggle fullscreen">Fullscreen</button>
        )}
      </div>
    </div>
  );
};

export default FlipbookHUD;
