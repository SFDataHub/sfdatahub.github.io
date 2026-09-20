import React from "react";
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut } from "lucide-react";
import { guideAssetByKey } from "../../../data/guidehub/assets";
import { INFOGRAPHICS_ITEMS } from "../../../data/guidehub/infographicsManifest";
import styles from "../GuideHubV2.module.css";

const ALL = "__all__";
const DEFAULT_ZOOM = 2;
const MAX_ZOOM = 4;

type Point = {
  x: number;
  y: number;
};

const clampValue = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const getDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const getCenter = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

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
  const imageViewportRef = React.useRef<HTMLDivElement | null>(null);
  const activePointersRef = React.useRef(new Map<number, Point>());
  const dragStartRef = React.useRef<{
    pointerId: number;
    point: Point;
    pan: Point;
  } | null>(null);
  const pinchStartRef = React.useRef<{
    distance: number;
    center: Point;
    zoom: number;
    pan: Point;
  } | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState<Point>({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = React.useState(false);

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
  const isZoomed = zoom > 1.01;

  const clampPan = React.useCallback((nextPan: Point, nextZoom = zoom): Point => {
    const viewport = imageViewportRef.current;
    if (!viewport || nextZoom <= 1) return { x: 0, y: 0 };

    const { width, height } = viewport.getBoundingClientRect();
    const maxX = Math.max(0, (width * nextZoom - width) / 2);
    const maxY = Math.max(0, (height * nextZoom - height) / 2);

    return {
      x: clampValue(nextPan.x, -maxX, maxX),
      y: clampValue(nextPan.y, -maxY, maxY),
    };
  }, [zoom]);

  const resetZoom = React.useCallback(() => {
    activePointersRef.current.clear();
    dragStartRef.current = null;
    pinchStartRef.current = null;
    setIsDraggingImage(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const toggleZoom = React.useCallback(() => {
    if (isZoomed) {
      resetZoom();
      return;
    }
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 0, y: 0 });
  }, [isZoomed, resetZoom]);

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
      if (event.key === "Escape") {
        resetZoom();
        setActiveImage(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeImage, resetZoom]);

  React.useEffect(() => {
    resetZoom();
  }, [activeImage?.key, resetZoom]);

  React.useEffect(() => {
    const onResize = () => setPan((currentPan) => clampPan(currentPan));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPan]);

  const finishPointerInteraction = React.useCallback((pointerId: number) => {
    activePointersRef.current.delete(pointerId);
    if (dragStartRef.current?.pointerId === pointerId) {
      dragStartRef.current = null;
      setIsDraggingImage(false);
    }
    if (activePointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }
  }, []);

  const handleImagePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);

      const pointers = Array.from(activePointersRef.current.values());
      if (pointers.length === 2) {
        event.preventDefault();
        pinchStartRef.current = {
          distance: Math.max(1, getDistance(pointers[0], pointers[1])),
          center: getCenter(pointers[0], pointers[1]),
          zoom,
          pan,
        };
        dragStartRef.current = null;
        setIsDraggingImage(false);
        return;
      }

      if (!isZoomed) return;

      event.preventDefault();
      dragStartRef.current = {
        pointerId: event.pointerId,
        point: { x: event.clientX, y: event.clientY },
        pan,
      };
      setIsDraggingImage(true);
    },
    [isZoomed, pan, zoom]
  );

  const handleImagePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(event.pointerId)) return;
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      const pointers = Array.from(activePointersRef.current.values());
      if (pointers.length >= 2 && pinchStartRef.current) {
        event.preventDefault();
        const [first, second] = pointers;
        const nextDistance = getDistance(first, second);
        const nextCenter = getCenter(first, second);
        const start = pinchStartRef.current;
        const nextZoom = clampValue(start.zoom * (nextDistance / start.distance), 1, MAX_ZOOM);
        const centerDelta = {
          x: nextCenter.x - start.center.x,
          y: nextCenter.y - start.center.y,
        };
        setZoom(nextZoom);
        setPan(
          clampPan(
            {
              x: start.pan.x + centerDelta.x,
              y: start.pan.y + centerDelta.y,
            },
            nextZoom
          )
        );
        return;
      }

      const dragStart = dragStartRef.current;
      if (!dragStart || dragStart.pointerId !== event.pointerId || !isZoomed) return;

      event.preventDefault();
      setPan(
        clampPan({
          x: dragStart.pan.x + event.clientX - dragStart.point.x,
          y: dragStart.pan.y + event.clientY - dragStart.point.y,
        })
      );
    },
    [clampPan, isZoomed]
  );

  const handleImagePointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      finishPointerInteraction(event.pointerId);
    },
    [finishPointerInteraction]
  );

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
        <div
          className={styles.overlay}
          onClick={() => {
            resetZoom();
            setActiveImage(null);
          }}
        >
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
              onClick={() => {
                resetZoom();
                setActiveImage(null);
              }}
              type="button"
            >
              {closeLabel}
            </button>
            <div
              ref={imageViewportRef}
              className={`${styles.overlayImageViewport} ${
                isZoomed ? styles.overlayImageViewportZoomed : ""
              } ${isDraggingImage ? styles.overlayImageViewportDragging : ""}`}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
              onLostPointerCapture={handleImagePointerUp}
            >
              <button
                className={styles.overlayZoomToggle}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleZoom();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={
                  isZoomed
                    ? t("guides.v2.infographics.zoomOut", { defaultValue: "Reset zoom" })
                    : t("guides.v2.infographics.zoomIn", { defaultValue: "Zoom in" })
                }
              >
                {isZoomed ? (
                  <ZoomOut size={26} strokeWidth={2.4} />
                ) : (
                  <ZoomIn size={26} strokeWidth={2.4} />
                )}
              </button>
              <img
                className={styles.overlayImage}
                src={activeImage.src}
                alt={activeImage.label}
                style={{
                  transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                }}
                draggable={false}
                onLoad={() => setPan((currentPan) => clampPan(currentPan))}
                onError={() => {
                  if (!activeImage.fallback || activeImage.fallback === activeImage.src) return;
                  resetZoom();
                  setActiveImage({
                    key: activeImage.key,
                    src: activeImage.fallback,
                    label: activeImage.label,
                  });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
