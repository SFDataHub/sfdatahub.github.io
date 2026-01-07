import React, { useEffect, useRef, useState } from "react";
import styles from "./FeaturedPreviewRow.module.css";

type FeaturedPreviewRowProps = {
  children: React.ReactNode;
  className?: string;
};

const FeaturedPreviewRow: React.FC<FeaturedPreviewRowProps> = ({ children, className }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [stepSize, setStepSize] = useState(0);
  const itemsCount = React.Children.count(children);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      const items = track.children;
      if (!items.length) {
        setMaxIndex(0);
        setStepSize(0);
        setIndex(0);
        return;
      }
      const first = items[0] as HTMLElement;
      const itemWidth = first.getBoundingClientRect().width;
      const style = window.getComputedStyle(track);
      const gapValue = parseFloat(style.columnGap || style.gap || "0");
      const gap = Number.isNaN(gapValue) ? 0 : gapValue;
      const nextStepSize = itemWidth + gap;
      const viewportWidth = viewport.getBoundingClientRect().width;
      const visibleCount = nextStepSize > 0
        ? Math.max(1, Math.floor((viewportWidth + gap) / nextStepSize))
        : 1;
      const nextMaxIndex = Math.max(0, items.length - visibleCount);
      setStepSize(nextStepSize);
      setMaxIndex(nextMaxIndex);
      setIndex((prev) => Math.min(prev, nextMaxIndex));
    };

    measure();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => measure());
      if (viewportRef.current) resizeObserver.observe(viewportRef.current);
      if (trackRef.current) resizeObserver.observe(trackRef.current);
    }
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [itemsCount]);

  const canGoPrev = index > 0;
  const canGoNext = index < maxIndex;
  const offset = stepSize * index * -1;

  return (
    <div className={[styles.row, className].filter(Boolean).join(" ")}>
      <button
        className={`${styles.navBtn} ${styles.navPrev}`}
        onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
        disabled={!canGoPrev}
        aria-label="Previous"
      >
        {"<"}
      </button>
      <div className={styles.viewport} ref={viewportRef}>
        <div
          className={styles.track}
          ref={trackRef}
          style={{ transform: `translateX(${offset}px)` }}
        >
          {children}
        </div>
      </div>
      <button
        className={`${styles.navBtn} ${styles.navNext}`}
        onClick={() => setIndex((prev) => Math.min(maxIndex, prev + 1))}
        disabled={!canGoNext}
        aria-label="Next"
      >
        {">"}
      </button>
    </div>
  );
};

export default FeaturedPreviewRow;
