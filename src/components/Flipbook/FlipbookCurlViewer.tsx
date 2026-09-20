// FILE: src/components/Flipbook/FlipbookCurlViewer.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PageFlip } from "page-flip";
import styles from "./curl.module.css";

// ---- Typen -------------------------------------------------------------------
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
  slug?: string;
  htmlPages?: React.ReactNode[];
  htmlPagesKey?: string;
  title?: string;
  pageWidth?: number;
  pageHeight?: number;
  initialPage?: number;                         // 1-basiert
  onReady?: (pf: any) => void;             // PageFlip-Instanz herausgeben
  onPageChange?: (page0: number) => void;       // 0-basiert (Parent macht +1)
  minPageIndex?: number;                        // 0-basiert, sperrt Prev vor technische Seiten
  displayPageOffset?: number;                   // technische Seiten vor logischem Inhalt
  displayPageCount?: number;
  showHud?: boolean;
  showCover?: boolean;
  enableKeyboard?: boolean;
  visualMode?: "default" | "book";
  visualState?: "cover" | "opening" | "reading";
  flippingTime?: number;
  syncPageIndex?: number | null;
  toolbarBackAction?: {
    label: string;
    shortLabel?: string;
    onClick: () => void;
  };
  noSound?: boolean;
};

// ---- BASE_URL helper ---------------------------------------------------------
const BASE = (() => {
  const b = (import.meta as any)?.env?.BASE_URL || "/";
  return b.endsWith("/") ? b : b + "/";
})();

const joinBase = (p: string) => {
  if (/^https?:\/\//i.test(p) || p.startsWith("/")) return p;
  const clean = p.replace(/^\.?\//, "");
  return `${BASE}${clean}`.replace(/\/{2,}/g, "/");
};

const fetchManifest = async (slug: string): Promise<FlipbookManifest> => {
  const url = joinBase(`flipbooks/${slug}/manifest.json`);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("manifestNotFound");
  return res.json();
};

const supportsFullscreen = () => {
  const el = document.documentElement as any;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const isActivePageFlipState = (state: unknown) =>
  state === "flipping" || state === "fold_corner" || state === "user_fold";
const offPageFlipEvent = (pf: PageFlip | null | undefined, event: string) => {
  try { (pf as any)?.off?.(event); } catch {}
};
const getPageFlipCurrentIndex = (pf: PageFlip | null | undefined) =>
  (pf as any)?.getCurrentPageIndex?.();

/* ========================================================================== */
/*  Singleton (persistiert über React Mount/Unmount hinweg)                   */
/* ========================================================================== */
type FlipbookSingleton = {
  hostEl: HTMLDivElement | null;
  pf: PageFlip | null;
  key: string | null;
};
const singleton: FlipbookSingleton = {
  hostEl: null,
  pf: null,
  key: null,
};

/* ========================================================================== */
/*  Sanfter Preload-Manager (±2 = nächste Doppelseite, kein Eager-Decode)    */
/* ========================================================================== */
type PreloadState = {
  cache: Set<string>;
  inFlight: Set<string>;
  queue: string[];
  maxParallel: number;
};
const preloader: PreloadState = {
  cache: new Set(),
  inFlight: new Set(),
  queue: [],
  maxParallel: 1, // sanft
};

// `requestIdleCallback` Fallback
const ric: (cb: () => void) => void =
  (typeof (globalThis as any).requestIdleCallback === "function")
    ? (cb) => (globalThis as any).requestIdleCallback(cb)
    : (cb) => setTimeout(cb, 0);

function enqueuePreload(urls: string[]) {
  for (const u of urls) {
    if (!u) continue;
    if (preloader.cache.has(u)) continue;
    if (preloader.inFlight.has(u)) continue;
    if (preloader.queue.includes(u)) continue;
    preloader.queue.push(u);
  }
  pumpQueue();
}

function pumpQueue() {
  ric(() => {
    while (preloader.inFlight.size < preloader.maxParallel && preloader.queue.length > 0) {
      const url = preloader.queue.shift()!;
      preloader.inFlight.add(url);
      const img = new Image();
      // bewusst KEIN eager/async-decode → vermeidet sichtbare Hänger/Flicker
      img.onload = img.onerror = () => {
        preloader.inFlight.delete(url);
        preloader.cache.add(url);
        pumpQueue();
      };
      img.src = url;
    }
  });
}

/* ========================================================================== */
/*  Komponente                                                                */
/* ========================================================================== */
const FlipbookCurlViewerInner: React.FC<Props> = ({
  slug,
  htmlPages,
  htmlPagesKey,
  title,
  pageWidth = 900,
  pageHeight = 1200,
  initialPage = 1,
  onReady,
  onPageChange,
  minPageIndex = 0,
  displayPageOffset = 0,
  displayPageCount,
  showHud = true,
  showCover = false,
  enableKeyboard = true,
  visualMode = "default",
  visualState = "reading",
  flippingTime,
  syncPageIndex = null,
  toolbarBackAction,
  noSound = true,
}) => {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const htmlSourceRef = useRef<HTMLDivElement | null>(null);

  const [manifest, setManifest] = useState<FlipbookManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isHtmlMode = Boolean(htmlPages?.length);
  const pageCount = isHtmlMode ? htmlPages!.length : (manifest?.pageCount ?? 0);
  const visiblePageCount = displayPageCount ?? Math.max(0, pageCount - displayPageOffset);
  const bookTitle = isHtmlMode ? (title ?? "Flipbook") : (manifest?.title ?? "");
  const bookMode = visualMode === "book";
  const bookStateClass = bookMode
    ? visualState === "cover"
      ? styles.bookCoverState
      : visualState === "opening"
        ? styles.bookOpeningState
        : styles.bookReadingState
    : "";
  const [isFlipping, setIsFlipping] = useState(false);
  const bookFlippingClass = bookMode && isFlipping ? styles.bookFlippingState : "";
  const [currentPage0, setCurrentPage0] = useState(0);

  // Props via Refs – keine Re-Init bei Referenzwechsel
  const readyRef = useRef<Props["onReady"]>();
  const pageChangeRef = useRef<Props["onPageChange"]>();
  const initialPageRef = useRef<number>(initialPage);
  const minPageIndexRef = useRef<number>(minPageIndex);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => { pageChangeRef.current = onPageChange; }, [onPageChange]);
  useEffect(() => { initialPageRef.current = initialPage; }, [initialPage]);
  useEffect(() => { minPageIndexRef.current = minPageIndex; }, [minPageIndex]);

  const basePath = useMemo(() => (slug ? joinBase(`flipbooks/${slug}`) : ""), [slug]);

  const pickBestSrc = useCallback(
    (p: PageEntry): string => {
      if (p.srcset?.length) {
        const sorted = [...p.srcset].sort((a, b) => a.width - b.width);
        const target = sorted.find((s) => s.width >= 1600) ?? sorted[sorted.length - 1];
        return /^https?:\/\//i.test(target.src) || target.src.startsWith("/")
          ? target.src
          : `${basePath}/${target.src}`.replace(/\/{2,}/g, "/");
      }
      return /^https?:\/\//i.test(p.src) || p.src.startsWith("/")
        ? p.src
        : `${basePath}/${p.src}`.replace(/\/{2,}/g, "/");
    },
    [basePath]
  );

  // Manifest laden bei Slug-Wechsel
  useEffect(() => {
    if (isHtmlMode) {
      setError(null);
      setManifest(null);
      return;
    }
    if (!slug) {
      setError("missingSlug");
      setManifest(null);
      return;
    }
    let live = true;
    setError(null);
    fetchManifest(slug)
      .then((m) => { if (live) setManifest(m); })
      .catch((e) => {
        if (live) setError(e?.message === "manifestNotFound" ? "manifestNotFound" : "loadFailed");
      });
    return () => { live = false; };
  }, [isHtmlMode, slug]);

  // Host-Element erstellen/anhängen UND initialisieren – alles in EINEM Effekt
  useEffect(() => {
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    const htmlSource = htmlSourceRef.current;
    const activeManifest = isHtmlMode
      ? ({ title: title ?? "Flipbook", pageCount: htmlPages?.length ?? 0, pageWidth, pageHeight, pages: [] } as FlipbookManifest)
      : manifest;
    if (!stage || !wrap || !activeManifest) return;
    if (isHtmlMode && (!htmlSource || !htmlPages?.length)) return;

    // Host sicherstellen
    if (!singleton.hostEl) {
      singleton.hostEl = document.createElement("div");
      singleton.hostEl.className = styles.host;
    }
    // Host in aktuelle Stage hängen
    if (singleton.hostEl.parentElement !== stage) {
      stage.appendChild(singleton.hostEl);
    }
    if (!singleton.hostEl.isConnected) return;

    const bookKey = isHtmlMode
      ? `html:${htmlPagesKey ?? activeManifest.title}:${activeManifest.pageCount}:cover-${showCover}:flip-${flippingTime ?? "default"}`
      : `image:${slug}`;
    const needsNew = !singleton.pf || singleton.key !== bookKey;
    let pf = singleton.pf;
    let active = true;
    const timers: number[] = [];
    let initPage0 = clamp(initialPageRef.current, 1, activeManifest.pageCount) - 1;

    const isCurrentInstance = () => active && singleton.pf === pf;

    // Echte (Neu-)Initialisierung
    if (needsNew) {
      if (isHtmlMode) {
        const htmlNodes = Array.from(htmlSource!.children).filter(
          (node): node is HTMLElement => node instanceof HTMLElement
        );
        if (htmlNodes.length !== activeManifest.pageCount) return;
      }

      const previousPage = getPageFlipCurrentIndex(singleton.pf);
      if (singleton.pf) {
        try {
          offPageFlipEvent(singleton.pf, "init");
          offPageFlipEvent(singleton.pf, "flip");
          offPageFlipEvent(singleton.pf, "changeState");
          singleton.pf.destroy();
        } catch {}
      }
      singleton.pf = null;
      singleton.hostEl = null;

      if (!singleton.hostEl) {
        singleton.hostEl = document.createElement("div");
        singleton.hostEl.className = styles.host;
        stage.appendChild(singleton.hostEl);
      }

      const startPage = Number.isFinite(previousPage as number)
        ? clamp(previousPage as number, 0, Math.max(0, activeManifest.pageCount - 1))
        : clamp(initialPageRef.current, 1, activeManifest.pageCount) - 1;
      initPage0 = startPage;

      const opts = {
        width: activeManifest.pageWidth,
        height: activeManifest.pageHeight,
        startPage,
        size: "stretch" as any,
        maxShadowOpacity: 0.25,
        showCover,
        mobileScrollSupport: true,
        usePortrait: false,
        disableFlipByClick: false,
        turnCorner: "all" as const,     // Drag entlang kompletter Kante
        startZIndex: 10,
        swipeDistance: 30,
        showPageCorners: true,
        useMouseEvents: true,
        ...(flippingTime ? { flippingTime } : {}),
      };

      pf = new PageFlip(singleton.hostEl, opts as any);
      singleton.pf = pf;
      singleton.key = bookKey;

      try {
        if (isHtmlMode) {
          const htmlNodes = Array.from(htmlSource!.children).filter(
            (node): node is HTMLElement => node instanceof HTMLElement
          );
          if (htmlNodes.length !== activeManifest.pageCount) throw new Error("htmlPageCountMismatch");
          pf.loadFromHTML(htmlNodes);
        } else {
          const imageUrls = activeManifest.pages.map(pickBestSrc);
          pf.loadFromImages(imageUrls);
        }
        setError(null);
      } catch (loadError) {
        try {
          offPageFlipEvent(pf, "init");
          offPageFlipEvent(pf, "flip");
          offPageFlipEvent(pf, "changeState");
          pf.destroy();
        } catch {}
        if (singleton.pf === pf) {
          singleton.pf = null;
          singleton.key = null;
          singleton.hostEl = null;
        }
        setError("loadFailed");
        return;
      }
    } else {
      try { pf?.update(); } catch {}
    }

    if (!pf) return;

    // === Preload-Helper für "nächste Doppelseite" ============================
    const preloadNextSpread = (page0: number) => {
      if (isHtmlMode) return;
      const want: string[] = [];
      const i1 = page0 + 1;
      const i2 = page0 + 2;
      if (activeManifest.pages[i1]) want.push(pickBestSrc(activeManifest.pages[i1]));
      if (activeManifest.pages[i2]) want.push(pickBestSrc(activeManifest.pages[i2]));
      enqueuePreload(want);
    };

    const onInit = () => {
      if (!isCurrentInstance()) return;
      const p0 = initPage0;
      pf.turnToPage(p0, "hard");
      setIsFlipping(false);
      setCurrentPage0(p0);
      // Preload leicht verzögert starten (nach erster Darstellung)
      timers.push(window.setTimeout(() => {
        if (isCurrentInstance()) preloadNextSpread(p0);
      }, 220));
      readyRef.current?.(pf);
    };
    offPageFlipEvent(pf, "init");
    offPageFlipEvent(pf, "flip");
    offPageFlipEvent(pf, "changeState");
    pf.on("init", onInit);

    pf.on("flip", (e: any) => {
      if (!isCurrentInstance()) return;
      const p0 = e.data as number;    // 0-basiert
      if (p0 < minPageIndexRef.current) {
        pf.turnToPage(minPageIndexRef.current, "hard");
        setCurrentPage0(minPageIndexRef.current);
        pageChangeRef.current?.(minPageIndexRef.current);
        return;
      }
      setCurrentPage0(p0);
      pageChangeRef.current?.(p0);
      // Preload NACH der Flip-Animation starten, um Flicker zu vermeiden
      timers.push(window.setTimeout(() => {
        if (isCurrentInstance()) preloadNextSpread(p0);
      }, 220));
    });

    pf.on("changeState", (e: any) => {
      if (!isCurrentInstance()) return;
      const nextIsFlipping = isActivePageFlipState(e.data);
      setIsFlipping((previous) => previous === nextIsFlipping ? previous : nextIsFlipping);
    });

    // ResizeObserver auf den äußeren Wrapper (nicht auf hostEl, die wandert)
    const ro = new ResizeObserver(() => {
      if (!isCurrentInstance()) return;
      try { pf.update(); } catch {}
    });
    ro.observe(wrap);

    const onKey = (ev: KeyboardEvent) => {
      if (!isCurrentInstance()) return;
      if (!enableKeyboard) return;
      if (ev.key === "ArrowLeft")  {
        ev.preventDefault();
        if (getPageFlipCurrentIndex(pf) <= minPageIndexRef.current) {
          pf.turnToPage(minPageIndexRef.current, "hard");
        } else {
          pf.flipPrev();
        }
      }
      if (ev.key === "ArrowRight") { ev.preventDefault(); pf.flipNext(); }
    };
    window.addEventListener("keydown", onKey, { passive: false });

    return () => {
      // KEIN Destroy beim Unmount/Re-Render – nur Listener/Observer dieser Instanz lösen
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      offPageFlipEvent(pf, "init");
      offPageFlipEvent(pf, "flip");
      offPageFlipEvent(pf, "changeState");
    };
  }, [enableKeyboard, flippingTime, htmlPages, htmlPagesKey, isHtmlMode, manifest, pageHeight, pageWidth, pickBestSrc, showCover, slug, title]);

  useEffect(() => {
    if (syncPageIndex == null || !singleton.pf) return;
    try {
      singleton.pf.turnToPage(syncPageIndex, "hard");
      setIsFlipping(false);
      setCurrentPage0(syncPageIndex);
      pageChangeRef.current?.(syncPageIndex);
    } catch {}
  }, [syncPageIndex]);

  const flipPrev = () => {
    if ((singleton.pf as any)?.getCurrentPageIndex?.() <= minPageIndex) {
      singleton.pf?.turnToPage(minPageIndex, "hard");
      return;
    }
    singleton.pf?.flipPrev();
  };
  const flipNext = () => singleton.pf?.flipNext();
  const visiblePage = clamp(currentPage0 - displayPageOffset + 1, 1, Math.max(1, visiblePageCount));

  const enterFullscreen = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const anyEl: any = wrap;
    (anyEl.requestFullscreen || anyEl.webkitRequestFullscreen || anyEl.msRequestFullscreen)?.call(anyEl);
  };

  if (error) return <div className={styles.errorBox}>{t(`flipbook.errors.${error}`)}</div>;
  if (!isHtmlMode && !manifest) return <div className={styles.errorBox}>{t("flipbook.loading")}</div>;
  if (isHtmlMode && !htmlPages?.length) return <div className={styles.errorBox}>{t("flipbook.noPages")}</div>;

  return (
    <div
      className={`${styles.viewerRoot} ${bookMode ? styles.bookMode : ""} ${bookStateClass} ${bookFlippingClass}`}
      ref={wrapRef}
      aria-label={bookTitle}
    >
      <div className={styles.stage} ref={stageRef}>
        {/* Host wird hier per Effekt eingehängt */}
        {isHtmlMode && (
          <div className={styles.htmlSource} ref={htmlSourceRef} aria-hidden>
            {htmlPages}
          </div>
        )}
      </div>

      {showHud && <div className={`${styles.hud} ${toolbarBackAction ? styles.hudWithBackAction : ""}`}>
        {toolbarBackAction && (
          <button
            className={`${styles.hBtn} ${styles.backActionBtn}`}
            onClick={toolbarBackAction.onClick}
            aria-label={toolbarBackAction.label}
            title={toolbarBackAction.label}
          >
            <span className={styles.backActionLabel}>{toolbarBackAction.label}</span>
            <span className={styles.backActionShortLabel}>{toolbarBackAction.shortLabel ?? toolbarBackAction.label}</span>
          </button>
        )}
        <button className={styles.hBtn} onClick={flipPrev} aria-label={t("flipbook.previous")}>‹</button>
        <div className={styles.hText}>
          <span className={styles.title}>{bookTitle}</span>
          <span className={styles.sep}>·</span>
          <span>{t("flipbook.pageIndicator", { current: visiblePage, total: visiblePageCount })}</span>
        </div>
        <div className={styles.spacer} />
        {supportsFullscreen() && (
          <button className={styles.hBtn} onClick={enterFullscreen} aria-label={t("flipbook.fullscreen")}>⤢</button>
        )}
        <button className={styles.hBtn} onClick={flipNext} aria-label={t("flipbook.next")}>›</button>
      </div>}
    </div>
  );
};

// Remounts durch Eltern-Re-Render zusätzlich absichern
const FlipbookCurlViewer = React.memo(FlipbookCurlViewerInner);
export default FlipbookCurlViewer;
