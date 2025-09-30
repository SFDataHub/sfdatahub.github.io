import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFilters } from "./FilterContext";
import { CLASSES } from "../../data/classes";
import styles from "./filters.module.css";
import { ClassIconButton } from "./atoms";

/**
 * BottomFilterSheet
 * - 1:1 HUD-Leiste (mit ClassIconButton / Google-Drive Icons)
 * - Content-breit (endet an der Sidebar)
 * - Animiert: weiches Einblenden (zweistufig), schnelles Ausblenden
 * - Shortcuts: Enter => Apply&Close, Escape => Close
 */

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Timings */
const ENTER_DELAY_PANEL = 60;          // ms, Panel startet kurz nach Backdrop
const ENTER_DURATION = 360;            // ms, weicheres Einblenden
const EXIT_DURATION  = 220;            // ms, flinkes Ausblenden

/** Easings */
const EASE_ENTER = "cubic-bezier(0.22, 1, 0.36, 1)"; // soft ease-out
const EASE_EXIT  = "cubic-bezier(0.4, 0, 0.2, 1)";   // standard material-ish

const UI = { backdrop: "rgba(0,0,0,.5)" };

function findContentAnchor(): HTMLElement | null {
  const selectors = [
    "[data-content-root]",
    "[data-center]",
    ".content-center",
    ".content-shell [data-center]",
    ".content-shell .center",
    "#content",
    "main .container",
    "main [class*=container]",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

export default function BottomFilterSheet({ open, onClose }: Props) {
  const {
    servers,
    classes, setClasses,
    range, setRange,
    sortBy, setSortBy,
    quickFav, setQuickFav,
    quickActive, setQuickActive,
    setServerSheetOpen,
  } = useFilters();

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Mount & Visibility States
  const [mounted, setMounted]       = useState(false); // im DOM?
  const [bgVisible, setBgVisible]   = useState(false); // Backdrop sichtbar?
  const [uiVisible, setUiVisible]   = useState(false); // Panel sichtbar?

  // Mount/Unmount + zweistufiges Ein-/Ausblenden
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Frame 1: Backdrop sichtbarer machen
      const t1 = requestAnimationFrame(() => setBgVisible(true));
      // Panel etwas später starten
      const t2 = setTimeout(() => setUiVisible(true), ENTER_DELAY_PANEL);
      return () => {
        cancelAnimationFrame(t1);
        clearTimeout(t2);
      };
    } else {
      // Exit: Panel zuerst aus, dann Backdrop
      setUiVisible(false);
      const t = setTimeout(() => {
        setBgVisible(false);
        // Nach kompletter Exit-Phase unmounten
        const t2 = setTimeout(() => setMounted(false), EXIT_DURATION);
        return () => clearTimeout(t2);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ESC/Enter + Body-Scroll-Lock
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Content-breite Positionierung
  const layoutToContent = () => {
    if (!panelRef.current) return;
    const anchor = findContentAnchor();
    if (!anchor) {
      const maxW = Math.min(1200, window.innerWidth);
      const left = Math.round((window.innerWidth - maxW) / 2);
      Object.assign(panelRef.current.style, { left: `${left}px`, width: `${maxW}px` });
      return;
    }
    const r = anchor.getBoundingClientRect();
    Object.assign(panelRef.current.style, {
      left: `${Math.max(0, r.left)}px`,
      width: `${Math.min(window.innerWidth - r.left, r.width)}px`,
    });
  };

  useLayoutEffect(() => {
    if (!mounted) return;
    layoutToContent();
    const onResize = () => layoutToContent();
    const onScroll = () => layoutToContent();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [mounted]);

  if (!mounted) return null;

  // Handlers respektieren Exit-Timing
  const handleClose = () => {
    setUiVisible(false);
    setTimeout(() => {
      setBgVisible(false);
      setTimeout(() => onClose(), EXIT_DURATION - 20);
    }, 0);
  };
  const handleApply = () => handleClose();
  const handleBackdropClick = () => handleClose();

  return (
    <div
      role="dialog"
      aria-modal
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: UI.backdrop,
        zIndex: 9998,
        // Backdrop animiert sanft ein/aus
        transition: `opacity ${bgVisible ? ENTER_DURATION : EXIT_DURATION}ms ${bgVisible ? EASE_ENTER : EASE_EXIT}`,
        opacity: bgVisible ? 1 : 0,
        // Verhindert Klicks durch, wenn unsichtbar
        pointerEvents: bgVisible ? "auto" : "none",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          bottom: 0,
          right: "auto",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: "85vh",
          overflow: "auto",
          background: "transparent",
          // Weiches Einblenden: größerer Offset + längere Dauer + smoother easing
          transform: uiVisible ? "translateY(0px)" : "translateY(44px)",
          opacity: uiVisible ? 1 : 0.92,
          transition: [
            `transform ${uiVisible ? ENTER_DURATION : EXIT_DURATION}ms ${uiVisible ? EASE_ENTER : EASE_EXIT}`,
            `opacity ${uiVisible ? ENTER_DURATION : EXIT_DURATION}ms ${uiVisible ? EASE_ENTER : EASE_EXIT}`,
          ].join(", "),
          willChange: "transform, opacity",
        }}
      >
        {/* HUD-Leiste (identisch) */}
        <div className={styles.hudWrap} style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          {/* Servers → separater Server-Picker */}
          <button
            type="button"
            className={styles.hudBtn}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setServerSheetOpen(true);
            }}
            aria-haspopup="dialog"
            aria-label={`Select servers${servers.length ? ` (${servers.length} selected)` : ""}`}
            title="Open Server Picker"
          >
            🌐 Servers {servers.length ? `(${servers.length})` : ""}
          </button>

          {/* Klassen-Icons */}
          <div className={styles.iconRow}>
            {CLASSES.map((c) => (
              <ClassIconButton
                key={c.key}
                active={classes.includes(c.key)}
                title={c.label}
                iconUrl={c.iconUrl}
                emoji={c.fallback ?? "★"}
                onClick={() =>
                  setClasses((prev) =>
                    prev.includes(c.key) ? prev.filter((x) => x !== c.key) : [...prev, c.key]
                  )
                }
              />
            ))}
            <button type="button" className={styles.hudSubBtn} onClick={() => setClasses(CLASSES.map((c) => c.key))}>
              All
            </button>
            <button type="button" className={styles.hudSubBtn} onClick={() => setClasses([])}>
              None
            </button>
          </div>

          {/* Range */}
          <div className={styles.segmented} role="group" aria-label="Range">
            {(["3d","7d","14d","30d","90d","all"] as const).map((k) => (
              <button type="button" key={k} aria-pressed={k === range} onClick={() => setRange(k)}>
                {k}
              </button>
            ))}
          </div>

          {/* Sort */}
          <label className={styles.sortLabel}>
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={styles.sortSelect}
            >
              <option value="level">Level</option>
              <option value="scrapbook">Scrapbook</option>
              <option value="activity">Activity</option>
              <option value="lastScan">Last scan</option>
            </select>
          </label>

          {/* Chips */}
          <button
            type="button"
            className={`${styles.chip} ${quickFav ? styles.isActive : ""}`}
            onClick={() => setQuickFav((v) => !v)}
          >
            ⭐ Favorites
          </button>
          <button
            type="button"
            className={`${styles.chip} ${quickActive ? styles.isActive : ""}`}
            onClick={() => setQuickActive((v) => !v)}
          >
            ⚡ Active
          </button>

          {/* Rechts: Clear/Apply */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={styles.hudSubBtn}
              onClick={() => { setClasses([]); }}
              title="Clear classes"
            >
              Clear
            </button>
            <button type="button" className={styles.hudBtn} onClick={handleApply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
