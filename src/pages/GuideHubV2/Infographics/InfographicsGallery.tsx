import React from "react";
import { useTranslation } from "react-i18next";
import { guideAssetByKey } from "../../../data/guidehub/assets";
import { INFOGRAPHICS_ITEMS } from "../../../data/guidehub/infographicsManifest";
import styles from "../GuideHubV2.module.css";

const ALL = "__all__";

export default function InfographicsGallery() {
  const { t } = useTranslation();

  const filterAValues = React.useMemo(() => {
    return Array.from(new Set(INFOGRAPHICS_ITEMS.map((item) => item.filterA))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, []);

  const filterBValuesByA = React.useMemo(() => {
    const map = new Map<string, string[]>();
    INFOGRAPHICS_ITEMS.forEach((item) => {
      const list = map.get(item.filterA) ?? [];
      if (!list.includes(item.filterB)) list.push(item.filterB);
      map.set(item.filterA, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        list.sort((a, b) => a.localeCompare(b))
      );
    });
    return map;
  }, []);

  const allFilterBValues = React.useMemo(() => {
    return Array.from(new Set(INFOGRAPHICS_ITEMS.map((item) => item.filterB))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, []);

  const [filterA, setFilterA] = React.useState<string>(ALL);
  const [filterB, setFilterB] = React.useState<string>(ALL);
  const [activeImage, setActiveImage] = React.useState<{
    key: string;
    src: string;
    fallback?: string;
    label: string;
  } | null>(null);

  const availableB = filterA === ALL ? allFilterBValues : filterBValuesByA.get(filterA) ?? [];

  React.useEffect(() => {
    if (filterB === ALL) return;
    if (!availableB.includes(filterB)) {
      setFilterB(ALL);
    }
  }, [availableB, filterB]);

  const filteredItems = React.useMemo(() => {
    return INFOGRAPHICS_ITEMS.filter((item) => {
      if (filterA !== ALL && item.filterA !== filterA) return false;
      if (filterB !== ALL && item.filterB !== filterB) return false;
      return true;
    });
  }, [filterA, filterB]);

  const allLabel = t("guides.v2.infographics.allLabel", { defaultValue: "All" });
  const filterALabel = t("guides.v2.infographics.filterA.label", { defaultValue: "Category" });
  const filterBLabel = t("guides.v2.infographics.filterB.label", { defaultValue: "Type" });
  const emptyLabel = t("guides.v2.infographics.empty", { defaultValue: "No images found." });
  const closeLabel = t("guides.v2.closeLabel", { defaultValue: "Close" });

  const buildActiveImage = React.useCallback(
    (item: (typeof INFOGRAPHICS_ITEMS)[number]) => {
      const overlayAsset = guideAssetByKey(item.assetKey, 1200);
      const thumbAsset = guideAssetByKey(item.assetKey, 640);
      const overlaySrc = overlayAsset.thumb ?? overlayAsset.url ?? null;
      const thumbSrc = thumbAsset.thumb ?? thumbAsset.url ?? null;
      const src = overlaySrc ?? thumbSrc;
      if (!src) return null;
      const label = t(`guides.v2.infographics.item.${item.key}`, {
        defaultValue: item.title,
      });
      return {
        key: item.key,
        src,
        fallback: src && thumbSrc && src !== thumbSrc ? thumbSrc : undefined,
        label,
      };
    },
    [t]
  );

  const activeIndex = React.useMemo(() => {
    if (!activeImage) return -1;
    return filteredItems.findIndex((item) => item.key === activeImage.key);
  }, [activeImage, filteredItems]);

  const canNavigate = filteredItems.length > 1 && activeIndex >= 0;

  const goPrev = React.useCallback(() => {
    if (!canNavigate) return;
    const nextIndex = (activeIndex - 1 + filteredItems.length) % filteredItems.length;
    const nextItem = filteredItems[nextIndex];
    const nextActive = buildActiveImage(nextItem);
    if (nextActive) setActiveImage(nextActive);
  }, [activeIndex, buildActiveImage, canNavigate, filteredItems]);

  const goNext = React.useCallback(() => {
    if (!canNavigate) return;
    const nextIndex = (activeIndex + 1) % filteredItems.length;
    const nextItem = filteredItems[nextIndex];
    const nextActive = buildActiveImage(nextItem);
    if (nextActive) setActiveImage(nextActive);
  }, [activeIndex, buildActiveImage, canNavigate, filteredItems]);

  React.useEffect(() => {
    if (!activeImage) return;
    const stillVisible = filteredItems.some((item) => item.key === activeImage.key);
    if (!stillVisible) setActiveImage(null);
  }, [activeImage, filteredItems]);

  React.useEffect(() => {
    if (!activeImage) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeImage]);

  return (
    <div className={styles.infoBlock}>
      <div className={styles.infoFilters}>
        <label className={styles.infoSelect}>
          <span className={styles.infoLabel}>{filterALabel}</span>
          <select
            className={styles.infoSelectField}
            value={filterA}
            onChange={(event) => setFilterA(event.target.value)}
          >
            <option value={ALL}>{allLabel}</option>
            {filterAValues.map((value) => (
              <option key={value} value={value}>
                {t(`guides.v2.infographics.filterA.${value}`, { defaultValue: value })}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.infoSelect}>
          <span className={styles.infoLabel}>{filterBLabel}</span>
          <select
            className={styles.infoSelectField}
            value={filterB}
            onChange={(event) => setFilterB(event.target.value)}
          >
            <option value={ALL}>{allLabel}</option>
            {availableB.map((value) => (
              <option key={value} value={value}>
                {t(`guides.v2.infographics.filterB.${value}`, { defaultValue: value })}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredItems.length === 0 ? (
        <div className={styles.infoEmpty}>{emptyLabel}</div>
      ) : (
        <div className={styles.infoGalleryGrid}>
          {filteredItems.map((item) => {
            const asset = guideAssetByKey(item.assetKey, 640);
            const imgSrc = asset.thumb ?? asset.url;
            const label = t(`guides.v2.infographics.item.${item.key}`, {
              defaultValue: item.title,
            });
            return (
              <button
                key={item.key}
                className={styles.infoCard}
                type="button"
                onClick={() => {
                  const nextActive = buildActiveImage(item);
                  if (nextActive) setActiveImage(nextActive);
                }}
              >
                {imgSrc ? (
                  <img className={styles.infoThumb} src={imgSrc} alt={label} />
                ) : (
                  <div className={styles.infoThumbFallback}>
                    {(label || "I").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className={styles.infoTitle}>{label}</div>
              </button>
            );
          })}
        </div>
      )}

      {activeImage && (
        <div className={styles.overlay} onClick={() => setActiveImage(null)}>
          <div className={styles.overlayPanel} onClick={(event) => event.stopPropagation()}>
            {canNavigate && (
              <>
                <button
                  className={`${styles.overlayNav} ${styles.overlayNavLeft}`}
                  type="button"
                  onClick={goPrev}
                  aria-label={t("guides.v2.galleryPrev", { defaultValue: "Previous image" })}
                >
                  &lt;
                </button>
                <button
                  className={`${styles.overlayNav} ${styles.overlayNavRight}`}
                  type="button"
                  onClick={goNext}
                  aria-label={t("guides.v2.galleryNext", { defaultValue: "Next image" })}
                >
                  &gt;
                </button>
              </>
            )}
            <button
              className={styles.overlayClose}
              onClick={() => setActiveImage(null)}
              type="button"
            >
              {closeLabel}
            </button>
            <img
              className={styles.overlayImage}
              src={activeImage.src}
              alt={activeImage.label}
              onError={() => {
                if (!activeImage.fallback || activeImage.fallback === activeImage.src) return;
                setActiveImage({
                  key: activeImage.key,
                  src: activeImage.fallback,
                  label: activeImage.label,
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
