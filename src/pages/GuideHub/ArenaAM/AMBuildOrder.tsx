// FILE: src/pages/GuideHub/ArenaAM/AMBuildOrder.tsx
import React, { useMemo } from "react";
import styles from "./AMBuildOrder.module.css";
import { guideAssetByKey } from "../../../data/guidehub/assets";

export default function AMBuildOrder() {
  const info = guideAssetByKey("ambuildorder"); // enthält id, url, thumb, fallback

  // 1) Bevorzugt: seitenverhältnis-erhaltendes Drive-Thumbnail (nicht quadratisch!)
  //    Doku/Pattern: https://drive.google.com/thumbnail?id=<FILE_ID>&sz=w<WIDTH>
  const arThumbUrl = useMemo(
    () => (info.id ? `https://drive.google.com/thumbnail?id=${info.id}&sz=w1024` : null),
    [info.id]
  );

  // 2) Zweiter Versuch (falls 1 nicht geht): Direct View (liefert Original, kann aber geblockt sein)
  const viewUrl = useMemo(
    () => (info.id ? `https://drive.google.com/uc?export=view&id=${info.id}` : null),
    [info.id]
  );

  // 3) Letzter Fallback: unser bisheriger Thumb (kann quadratisch sein)
  const fallbackUrl = info.thumb || null;

  // Wähle die beste verfügbare Quelle
  const imgUrl = arThumbUrl || viewUrl || fallbackUrl;

  return (
    <div className={styles.wrap}>
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Arena Manager — Build Order</h2>
        <span className={styles.meta}>Last updated: 30.11.2024</span>
      </div>

      <div className={styles.centerCol}>
        <div className={styles.text}>
          <p>Build your Attractions according to the picture below for maximum efficiency.</p>
          <p>
            Upgrading to full Platinum on all Attractions will cost you <strong>4300 Mushrooms</strong>.
          </p>
        </div>

        {imgUrl ? (
          <div className={styles.imageBox}>
            <img
              src={imgUrl}
              alt="Arena Manager build order"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className={styles.imageFallback}>📘</div>
        )}

        <p className={styles.credit}>
          Credit to <em>SF Tavern Discord</em>.
        </p>
      </div>
    </div>
  );
}
