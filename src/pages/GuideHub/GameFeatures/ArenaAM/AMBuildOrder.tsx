// FILE: src/pages/GuideHub/ArenaAM/AMBuildOrder.tsx
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import styles from "./AMBuildOrder.module.css";
import { guideAssetByKey } from "../../../../data/guidehub/assets";

export default function AMBuildOrder() {
  const { t } = useTranslation();
  const info = guideAssetByKey("ambuildorder"); // enthaelt id, url, thumb, fallback

  const arThumbUrl = useMemo(
    () => (info.id ? `https://drive.google.com/thumbnail?id=${info.id}&sz=w1024` : null),
    [info.id]
  );

  const viewUrl = useMemo(
    () => (info.id ? `https://drive.google.com/uc?export=view&id=${info.id}` : null),
    [info.id]
  );

  const fallbackUrl = info.thumb || null;
  const imgUrl = arThumbUrl || viewUrl || fallbackUrl;

  return (
    <div className={styles.wrap}>
      <div className={styles.headerBar}>
        <h2 className={styles.title}>{t("guidehub.arenaManager.buildOrder.title")}</h2>
        <span className={styles.meta}>
          {t("guidehub.arenaManager.buildOrder.updated", { date: "30.11.2024" })}
        </span>
      </div>

      <div className={styles.centerCol}>
        <div className={styles.text}>
          <p>{t("guidehub.arenaManager.buildOrder.body1")}</p>
          <p
            dangerouslySetInnerHTML={{
              __html: t("guidehub.arenaManager.buildOrder.body2", {
                mushrooms: "<strong>4300 Mushrooms</strong>",
              }),
            }}
          />
        </div>

        {imgUrl ? (
          <div className={styles.imageBox}>
            <img
              src={imgUrl}
              alt={t("guidehub.arenaManager.buildOrder.imageAlt")}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className={styles.imageFallback}>??</div>
        )}

        <p className={styles.credit}>
          {t("guidehub.arenaManager.buildOrder.credit", { discord: "SF Tavern Discord" })}
        </p>
      </div>
    </div>
  );
}