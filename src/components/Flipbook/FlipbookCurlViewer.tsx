// src/components/Flipbook/FlipbookCurlViewer.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PageFlip, SizeType } from "page-flip";
import styles from "./curl.module.css";
// Optional: Grund-CSS der Lib
// import "page-flip/dist/page-flip.css";

type SrcSetEntry = { src: string; width: number };
type PageEntry = { src: string; thumb: string; srcset?: SrcSetEntry[] };
type FlipbookManifest = {
  title: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
  pages: PageEntry[];
};

type Props = {
  slug: string;
  initialPage?: number;                  // 1-basiert
  onReady?: () => void;
  onPageChange?: (page: number) => void; // 1-basiert
  noSound?: boolean;
};

// --- Helpers: BASE_URL-sicher auflösen ---------------------------------------
const BASE = (() => {
  const b = (import.meta as any)?.env?.BASE_URL || "/";
  return b.endsWith("/") ? b : b + "/";
})();

/** Baut einen Pfad relativ zur BASE_URL, lässt absolute URLs unangetastet. */
const joinBase = (p: string) => {
  if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
  const clean = p.replace(/^\.?\//, "");
  return `${BASE}${clean}`.replace(/\/{2,}/g, "/");
};

const fetchManifest = async (slug: string): Promise<FlipbookManifest> => {
  const url = joinBase(`flipbooks/${slug}/manifest.json`);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Manifest not found for slug "${slug}"`);
  return res.json();
};

const supportsFullscreen = () => {
  const el = document.documentElement as any;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const FlipbookCurlViewer: React.FC<Props> = ({
  slug,
  initialPage = 1,
  onReady,
  onPageChange,
  noSound = true,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pfRef = useRef<PageFlip | null>(null);

  const [manifest, setManifest] = useState<FlipbookManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fsSupported, setFsSupported] = useState(false);

  const basePath = useMemo(() => joinBase(`flipbooks/${slug}`), [slug]);

  const pickBestSrc = useCallback(
    (p: PageEntry): string => {
      if (p.srcset?.length) {
        const sorted = [...p.srcset].sort((a, b) => a.width - b.width);
        const target = sorted.find((s) => s.width >= 1600) ?? sorted[sorted.length - 1];
        return target.src.startsWith("/") || /^https?:\/\//i.test(target.src)
          ? target.src
          : `${basePath}/${target.src}`.replace(/\/{2,}/g, "/");
      }
      return p.src.startsWith("/") || /^https?:\/\//i.test(p.src)
        ? p.src
        : `${basePath}/${p.src}`.replace(/\/{2,}/g, "/");
    },
    [basePath]
  );

  // Manifest laden
  useEffect(() => {
    let live = true;
    setManifest(null);
    setError(null);
    fetchManifest(slug)
      .then((m) => {
        if (!live) return;
        setManifest(m);
        setFsSupported(supportsFullscreen());
      })
      .catch((e) => {
        if (live) setError(e.message || "Failed to load flipbook manifest.");
      });
    return () => {
      live = false;
    };
  }, [slug]);

  // PageFlip initialisieren
  useEffect(() => {
    const host = hostRef.current;
    const wrap = wrapRef.current;
    if (!manifest || !host || !wrap) return;

    if (pfRef.current) {
      try { pfRef.current.destroy(); } catch {}
      pfRef.current = null;
    }

    const opts = {
      width: manifest.pageWidth,
      height: manifest.pageHeight,
      size: "stretch" as SizeType,
      maxShadowOpacity: 0.25,
      showCover: false,
      mobileScrollSupport: true,
      usePortrait: false,
      disableFlipByClick: false,
      turnCorner: "bl",
      startZIndex: 10,
      swipeDistance: 30,
      showPageCorners: true,
      useMouseEvents: true,
    };

    const pf = new PageFlip(host, opts as any);
    pfRef.current = pf;

    // Seiten laden
    const imageUrls = manifest.pages.map(pickBestSrc);
    pf.loadFromImages(imageUrls);

    const onInit = () => {
      const p = clamp(initialPage, 1, manifest.pageCount);
      pf.turnToPage(p - 1, "hard");
      onReady?.();
    };
    pf.on("init", onInit);

    pf.on("flip", (e: any) => onPageChange?.(e.data + 1));

    const ro = new ResizeObserver(() => {
      try { pf.update(); } catch {}
    });
    ro.observe(wrap);

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft")  { ev.preventDefault(); pf.flipPrev(); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); pf.flipNext(); }
    };
    window.addEventListener("keydown", onKey, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      pf.off("init", onInit as any);
      try { pf.destroy(); } catch {}
      pfRef.current = null;
    };
  }, [manifest, initialPage, onReady, onPageChange, pickBestSrc]);

  const flipPrev = () => pfRef.current?.flipPrev();
  const flipNext = () => pfRef.current?.flipNext();

  const enterFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const anyEl: any = wrap;
    (anyEl.requestFullscreen || anyEl.webkitRequestFullscreen || anyEl.msRequestFullscreen)?.call(anyEl);
  };

  if (error) return <div className={styles.errorBox}>Flipbook konnte nicht geladen werden: {error}</div>;
  if (!manifest) return <div className={styles.errorBox}>Lade Flipbook…</div>;

  return (
    <div className={styles.viewerRoot} ref={wrapRef} aria-label={manifest.title}>
      <div className={styles.stage}>
        <div className={styles.host} ref={hostRef} />
        {/* Klick-Zonen */}
        <button className={`${styles.edge} ${styles.left}`}  onClick={flipPrev} aria-label="Vorherige Seite" />
        <button className={`${styles.edge} ${styles.right}`} onClick={flipNext} aria-label="Nächste Seite" />
      </div>

      <div className={styles.hud}>
        <button className={styles.hBtn} onClick={flipPrev} aria-label="Zurück">‹</button>
        <div className={styles.hText}>
          <span className={styles.title}>{manifest.title}</span>
          <span className={styles.sep}>·</span>
          <span>{manifest.pageCount} Seiten</span>
        </div>
        <div className={styles.spacer} />
        {fsSupported && (
          <button className={styles.hBtn} onClick={enterFullscreen} aria-label="Fullscreen">⤢</button>
        )}
        <button className={styles.hBtn} onClick={flipNext} aria-label="Weiter">›</button>
      </div>
    </div>
  );
};

export default FlipbookCurlViewer;
