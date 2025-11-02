// src/components/Flipbook/FlipbookCurlViewer.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PageFlip, SizeType } from "page-flip";
import styles from "./curl.module.css";
// Optional, wenn du die Basis-CSS der Lib möchtest:
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
  initialPage?: number;                    // 1-basiert
  onReady?: () => void;
  onPageChange?: (page: number) => void;   // 1-basiert
  noSound?: boolean;
};

// --- Base-URL Helper ---------------------------------------------------------
// Vite setzt import.meta.env.BASE_URL passend ("/" lokal, "/test/" auf Pages).
const baseURL =
  (typeof import !== "undefined" &&
    (import.meta as any)?.env &&
    (import.meta as any).env.BASE_URL) ||
  "/";

// Präfixt relative Pfade mit baseURL, lässt absolute URLs/Root-absolute Pfade unverändert
const withBase = (p: string) => {
  if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
  return baseURL.replace(/\/$/, "") + "/" + p.replace(/^\.?\//, "");
};

const fetchManifest = async (slug: string): Promise<FlipbookManifest> => {
  const url = withBase(`flipbooks/${slug}/manifest.json`);
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

  const basePath = useMemo(() => withBase(`flipbooks/${slug}`), [slug]);

  const pickBestSrc = useCallback(
    (p: PageEntry): string => {
      if (p.srcset?.length) {
        const sorted = [...p.srcset].sort((a, b) => a.width - b.width);
        const target = sorted.find((s) => s.width >= 1600) ?? sorted[sorted.length - 1];
        return target.src.startsWith("/") ? target.src : `${basePath}/${target.src}`;
      }
      return p.src.startsWith("/") ? p.src : `${basePath}/${p.src}`;
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

    // Vorherige Instanz entsorgen
    if (pfRef.current) {
      try {
        pfRef.current.destroy();
      } catch {
        /* noop */
      }
      pfRef.current = null;
    }

    const opts = {
      width: manifest.pageWidth,
      height: manifest.pageHeight,
      size: "stretch" as SizeType, // passt sich dem Container an
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

    // Seiten vorbereiten & laden (KEIN Promise!)
    const imageUrls = manifest.pages.map(pickBestSrc);
    pf.loadFromImages(imageUrls);

    // Wenn der Flip fertig initialisiert ist:
    const onInit = () => {
      const p = clamp(initialPage, 1, manifest.pageCount);
      pf.turnToPage(p - 1, "hard");
      onReady?.();
    };
    pf.on("init", onInit);

    // Page-Change Event (1-basiert weitergeben)
    pf.on("flip", (e: any) => onPageChange?.(e.data + 1));

    // Resize-Handling
    const ro = new ResizeObserver(() => {
      try {
        pf.update();
      } catch {
        /* noop */
      }
    });
    ro.observe(wrap);

    // Key-Handler
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        pf.flipPrev();
      }
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        pf.flipNext();
      }
    };
    window.addEventListener("keydown", onKey, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      pf.off("init", onInit as any);
      try {
        pf.destroy();
      } catch {
        /* noop */
      }
      pfRef.current = null;
    };
  }, [manifest, initialPage, onReady, onPageChange, pickBestSrc]);

  const flipPrev = () => pfRef.current?.flipPrev();
  const flipNext = () => pfRef.current?.flipNext();

  const enterFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const anyEl: any = wrap;
    (anyEl.requestFullscreen ||
      anyEl.webkitRequestFullscreen ||
      anyEl.msRequestFullscreen)?.call(anyEl);
  };

  if (error) return <div className={styles.errorBox}>Flipbook konnte nicht geladen werden: {error}</div>;
  if (!manifest) return <div className={styles.errorBox}>Lade Flipbook…</div>;

  return (
    <div className={styles.viewerRoot} ref={wrapRef} aria-label={manifest.title}>
      <div className={styles.stage}>
        <div className={styles.host} ref={hostRef} />
        {/* Klick-Zonen wie bei Heyzine */}
        <button className={`${styles.edge} ${styles.left}`} onClick={flipPrev} aria-label="Vorherige Seite" />
        <button className={`${styles.edge} ${styles.right}`} onClick={flipNext} aria-label="Nächste Seite" />
      </div>

      <div className={styles.hud}>
        <button className={styles.hBtn} onClick={flipPrev} aria-label="Zurück">
          ‹
        </button>
        <div className={styles.hText}>
          <span className={styles.title}>{manifest.title}</span>
          <span className={styles.sep}>·</span>
          <span>{manifest.pageCount} Seiten</span>
        </div>
        <div className={styles.spacer} />
        {fsSupported && (
          <button className={styles.hBtn} onClick={enterFullscreen} aria-label="Fullscreen">
            ⤢
          </button>
        )}
        <button className={styles.hBtn} onClick={flipNext} aria-label="Weiter">
          ›
        </button>
      </div>
    </div>
  );
};

export default FlipbookCurlViewer;
