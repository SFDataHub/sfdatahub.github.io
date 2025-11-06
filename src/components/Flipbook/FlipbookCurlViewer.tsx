// FILE: src/components/Flipbook/FlipbookCurlViewer.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PageFlip, SizeType } from "page-flip";
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
  slug: string;
  initialPage?: number;                         // 1-basiert
  onReady?: (pf: PageFlip) => void;             // PageFlip-Instanz herausgeben
  onPageChange?: (page0: number) => void;       // 0-basiert (Parent macht +1)
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
  if (!res.ok) throw new Error(`Manifest not found for slug "${slug}"`);
  return res.json();
};

const supportsFullscreen = () => {
  const el = document.documentElement as any;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ========================================================================== */
/*  Singleton (persistiert über React Mount/Unmount hinweg)                   */
/* ========================================================================== */
type FlipbookSingleton = {
  hostEl: HTMLDivElement | null;
  pf: PageFlip | null;
  slug: string | null;
};
const singleton: FlipbookSingleton = {
  hostEl: null,
  pf: null,
  slug: null,
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
  initialPage = 1,
  onReady,
  onPageChange,
  noSound = true,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [manifest, setManifest] = useState<FlipbookManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Props via Refs – keine Re-Init bei Referenzwechsel
  const readyRef = useRef<Props["onReady"]>();
  const pageChangeRef = useRef<Props["onPageChange"]>();
  const initialPageRef = useRef<number>(initialPage);
  useEffect(() => { readyRef.current = onReady; }, [onReady]);
  useEffect(() => { pageChangeRef.current = onPageChange; }, [onPageChange]);
  useEffect(() => { initialPageRef.current = initialPage; }, [initialPage]);

  const basePath = useMemo(() => joinBase(`flipbooks/${slug}`), [slug]);

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
    let live = true;
    setError(null);
    fetchManifest(slug)
      .then((m) => { if (live) setManifest(m); })
      .catch((e) => { if (live) setError(e.message || "Failed to load flipbook manifest."); });
    return () => { live = false; };
  }, [slug]);

  // Host-Element erstellen/anhängen UND initialisieren – alles in EINEM Effekt
  useEffect(() => {
    const stage = stageRef.current;
    const wrap = wrapRef.current;
    if (!stage || !wrap || !manifest) return;

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

    const needsNew = !singleton.pf || singleton.slug !== slug;

    if (!needsNew) {
      try { singleton.pf!.update(); } catch {}
      return;
    }

    // Echte (Neu-)Initialisierung
    if (singleton.pf) {
      try { singleton.pf.destroy(); } catch {}
      singleton.pf = null;
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
      turnCorner: "all" as const,     // Drag entlang kompletter Kante
      startZIndex: 10,
      swipeDistance: 30,
      showPageCorners: true,
      useMouseEvents: true,
    };

    const pf = new PageFlip(singleton.hostEl, opts as any);
    singleton.pf = pf;
    singleton.slug = slug;

    const imageUrls = manifest.pages.map(pickBestSrc);
    pf.loadFromImages(imageUrls);

    // === Preload-Helper für "nächste Doppelseite" ============================
    const preloadNextSpread = (page0: number) => {
      const want: string[] = [];
      const i1 = page0 + 1;
      const i2 = page0 + 2;
      if (manifest.pages[i1]) want.push(pickBestSrc(manifest.pages[i1]));
      if (manifest.pages[i2]) want.push(pickBestSrc(manifest.pages[i2]));
      enqueuePreload(want);
    };

    const onInit = () => {
      const p0 = clamp(initialPageRef.current, 1, manifest.pageCount) - 1;
      pf.turnToPage(p0, "hard");
      // Preload leicht verzögert starten (nach erster Darstellung)
      setTimeout(() => preloadNextSpread(p0), 220);
      readyRef.current?.(pf);
    };
    pf.on("init", onInit);

    pf.on("flip", (e: any) => {
      const p0 = e.data as number;    // 0-basiert
      pageChangeRef.current?.(p0);
      // Preload NACH der Flip-Animation starten, um Flicker zu vermeiden
      setTimeout(() => preloadNextSpread(p0), 220);
    });

    // ResizeObserver auf den äußeren Wrapper (nicht auf hostEl, die wandert)
    const ro = new ResizeObserver(() => {
      try { singleton.pf?.update(); } catch {}
    });
    ro.observe(wrap);

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft")  { ev.preventDefault(); singleton.pf?.flipPrev(); }
      if (ev.key === "ArrowRight") { ev.preventDefault(); singleton.pf?.flipNext(); }
    };
    window.addEventListener("keydown", onKey, { passive: false });

    return () => {
      // KEIN Destroy beim Unmount/Re-Render – nur Listener/Observer dieser Instanz lösen
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
    };
  }, [manifest, pickBestSrc, slug]);

  const flipPrev = () => singleton.pf?.flipPrev();
  const flipNext = () => singleton.pf?.flipNext();

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
      <div className={styles.stage} ref={stageRef}>
        {/* Host wird hier per Effekt eingehängt */}
      </div>

      <div className={styles.hud}>
        <button className={styles.hBtn} onClick={flipPrev} aria-label="Zurück">‹</button>
        <div className={styles.hText}>
          <span className={styles.title}>{manifest.title}</span>
          <span className={styles.sep}>·</span>
          <span>{manifest.pageCount} Seiten</span>
        </div>
        <div className={styles.spacer} />
        {supportsFullscreen() && (
          <button className={styles.hBtn} onClick={enterFullscreen} aria-label="Fullscreen">⤢</button>
        )}
        <button className={styles.hBtn} onClick={flipNext} aria-label="Weiter">›</button>
      </div>
    </div>
  );
};

// Remounts durch Eltern-Re-Render zusätzlich absichern
const FlipbookCurlViewer = React.memo(FlipbookCurlViewerInner);
export default FlipbookCurlViewer;
