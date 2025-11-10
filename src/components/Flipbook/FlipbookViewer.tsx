// src/components/Flipbook/FlipbookViewer.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles.module.css";
import type { FlipbookManifest, FlipbookViewerProps, PageEntry } from "./types";
import FlipbookHUD from "./FlipbookHUD";
import { decideViewMode, calcLayoutDims, shouldUseCrossfade, clampPage } from "./FlipbookRenderer";

const prefersReducedMotion = typeof window !== "undefined"
  ? window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  : false;

const fetchManifest = async (slug: string): Promise<FlipbookManifest> => {
  const res = await fetch(`/flipbooks/${slug}/manifest.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Manifest not found for slug "${slug}"`);
  return res.json();
};

const supportsFullscreen = () => {
  const el = document.documentElement as any;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
};

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({
  slug,
  initialPage = 1,
  forceSinglePage = false,
  onPageChange,
  onReady
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);

  const [manifest, setManifest] = useState<FlipbookManifest | null>(null);
  const [page, setPage] = useState<number>(initialPage);
  const [zoom, setZoom] = useState<number>(1.0);
  const [viewMode, setViewMode] = useState<"single" | "spread">("spread");
  const [crossfade, setCrossfade] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fsSupported, setFsSupported] = useState<boolean>(false);

  // Basis-Pfad für alle Assets dieses Flipbooks
  const basePath = useMemo(() => `/flipbooks/${slug}`, [slug]);

  // Helper: Pfad mit Base prefixen (falls nicht bereits absolut)
  const withBase = useCallback((p: string) => {
    if (!p) return p;
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
    return `${basePath}/${p}`;
  }, [basePath]);

  useEffect(() => {
    let mounted = true;
    fetchManifest(slug)
      .then((m) => {
        if (!mounted) return;
        setManifest(m);
        setPage(clampPage(initialPage, m.pageCount));
        setFsSupported(supportsFullscreen());
        onReady?.();
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e.message || "Failed to load flipbook manifest.");
      });
    return () => { mounted = false; };
  }, [slug, initialPage, onReady]);

  useEffect(() => {
    if (!manifest) return;
    const handler = () => {
      const containerW = rootRef.current?.clientWidth ?? window.innerWidth;
      const vm = forceSinglePage ? "single" : decideViewMode(containerW, manifest.pageWidth);
      setViewMode(vm);
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [manifest, forceSinglePage]);

  useEffect(() => {
    const fpsEstimate = null;
    setCrossfade(shouldUseCrossfade(prefersReducedMotion, fpsEstimate));
  }, []);

  const canPrev = useMemo(() => page > 1, [page]);
  const canNext = useMemo(() => manifest ? page < manifest.pageCount : false, [page, manifest]);

  const goPrev = useCallback(() => setPage(p => Math.max(1, p - 1)), []);
  const goNext = useCallback(() => setPage(p => manifest ? Math.min(manifest.pageCount, p + 1) : p), [manifest]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      else if ((e.key === "+" || e.key === "=")) { e.preventDefault(); setZoom(z => Math.min(3, +(z + 0.1).toFixed(2))); }
      else if ((e.key === "-" || e.key === "_")) { e.preventDefault(); setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2))); }
      else if (e.key.toLowerCase() === "0") { e.preventDefault(); setZoom(1.0); }
    };
    window.addEventListener("keydown", onKey, { passive: false });
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  useEffect(() => {
    if (!manifest) return;
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    window.history.replaceState({}, "", url.toString());
    onPageChange?.(page);
  }, [page, manifest, onPageChange]);

  useEffect(() => {
    const el = bookRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(z => {
        const next = e.deltaY < 0 ? Math.min(3, z + 0.1) : Math.max(0.5, z - 0.1);
        return +next.toFixed(2);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const dims = useMemo(() => {
    const cw = rootRef.current?.clientWidth ?? 1200;
    const ch = rootRef.current?.clientHeight ?? 800;
    const pw = manifest?.pageWidth ?? 1200;
    const ph = manifest?.pageHeight ?? 1600;
    return calcLayoutDims(cw, ch, viewMode, pw, ph, zoom);
  }, [manifest, viewMode, zoom]);

  const currIndex = page - 1;
  const leftIndex = useMemo(() => {
    if (viewMode === "single") return currIndex;
    const isRight = page % 2 === 0;
    return isRight ? currIndex - 1 : currIndex;
  }, [currIndex, page, viewMode]);

  const rightIndex = useMemo(() => {
    if (viewMode === "single") return null;
    return leftIndex !== null ? leftIndex + 1 : null;
  }, [leftIndex, viewMode]);

  const pickBestSrc = (entry: PageEntry): string => {
    if (!entry.srcset || entry.srcset.length === 0) return withBase(entry.src);
    const sorted = [...entry.srcset].sort((a,b) => a.width - b.width);
    return withBase(sorted[0].src);
  };

  const buildSrcSet = (entry: PageEntry): string | undefined => {
    if (!entry.srcset || entry.srcset.length === 0) return undefined;
    return entry.srcset.map(s => `${withBase(s.src)} ${s.width}w`).join(", ");
  };

  const getImgProps = (entry: PageEntry | undefined) => {
    if (!entry) return undefined;
    const src = pickBestSrc(entry);
    const srcSet = buildSrcSet(entry);
    return { src, srcSet, sizes: "100vw" };
  };

  if (error) return <div className={styles.errorBox}>Flipbook konnte nicht geladen werden: {error}</div>;
  if (!manifest) return <div className={styles.errorBox}>Lade Flipbook…</div>;

  const leftPage = manifest.pages[leftIndex ?? currIndex];
  const rightPage = rightIndex !== null ? manifest.pages[rightIndex] : undefined;

  const pageStyle: React.CSSProperties = {
    width: viewMode === "spread" ? `${dims.bookW/2}px` : `${dims.bookW}px`,
    height: `${dims.bookH}px`,
  };

  const bookStyle: React.CSSProperties = {
    width: `${dims.bookW}px`,
    height: `${dims.bookH}px`,
  };

  const enterFullscreen = () => {
    const host = rootRef.current;
    if (!host) return;
    const anyHost: any = host;
    (anyHost.requestFullscreen || anyHost.webkitRequestFullscreen || anyHost.msRequestFullscreen)?.call(anyHost);
  };

  return (
    <div className={styles.viewerRoot} ref={rootRef} aria-label={manifest.title}>
      <div className={styles.stage}>
        <div className={styles.book} style={bookStyle} ref={bookRef}>

          <div className={styles.pageWrap}>
            <div className={styles.page} style={pageStyle}>
              {leftPage ? (
                <img
                  alt={`Page ${leftIndex !== null ? leftIndex + 1 : page}`}
                  loading="eager" decoding="async" fetchPriority="high"
                  {...getImgProps(leftPage)}
                />
              ) : null}
            </div>

            {viewMode === "spread" && (
              <div className={styles.page} style={pageStyle}>
                {rightPage ? (
                  <img
                    alt={`Page ${rightIndex! + 1}`}
                    loading="eager" decoding="async"
                    {...getImgProps(rightPage)}
                  />
                ) : null}
              </div>
            )}
          </div>

          {viewMode === "spread" && <div className={styles.gutter} />}

        </div>
      </div>

      <FlipbookHUD
        page={page} pageCount={manifest.pageCount} zoom={zoom}
        canPrev={canPrev} canNext={canNext}
        onPrev={goPrev} onNext={goNext}
        onZoomIn={() => setZoom(z => Math.min(3, +(z + 0.1).toFixed(2)))}
        onZoomOut={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}
        onResetZoom={() => setZoom(1.0)}
        onToggleFullscreen={enterFullscreen}
        fullscreenSupported={fsSupported}
      />
    </div>
  );
};

export default FlipbookViewer;
