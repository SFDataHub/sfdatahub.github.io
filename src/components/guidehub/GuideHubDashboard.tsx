import React, { useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "./styles.module.css";
import ArcNav from "./ArcNav";
import { Category, SubCategory } from "./config";

type Props = {
  logoSrc: string;
  categories: Category[];
  titleI18nKey?: string;
};

const GuideHubDashboard: React.FC<Props> = ({ logoSrc, categories }) => {
  const [params] = useSearchParams();
  const tab  = params.get("tab")  || null;
  const sub  = params.get("sub")  || null;
  const sub2 = params.get("sub2") || null;

  // Aktive Knoten bestimmen
  const activeCat   = useMemo(() => categories.find(c => c.key === tab) || null, [categories, tab]);
  const subList     = activeCat?.sub || [];
  const activeSub   = useMemo<SubCategory | null>(() => subList.find(s => s.key === sub) || null, [subList, sub]);
  const sub2List    = activeSub?.sub2 || [];

  // *** einzige Änderung: defensiver Fallback, falls side fehlt/leer ist ***
  const safeAnchorSide: "left" | "right" | null = (activeCat?.side === "left" || activeCat?.side === "right")
    ? activeCat.side
    : "right";

  // === Offsets stabil & vor dem ersten Paint messen ===
  const logoRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [arcOffset, setArcOffset]     = useState<number>(220);
  const [outerOffset, setOuterOffset] = useState<number>(440);
  const [superOffset, setSuperOffset] = useState<number>(660);

  useLayoutEffect(() => {
    const measure = () => {
      const w = logoRef.current?.getBoundingClientRect().width ?? 380;
      const half = w / 2;
      const gap  = 60;
      const main = Math.round(half + gap);
      const out  = Math.round(main + 220);
      const sup  = Math.round(out + 220);
      setArcOffset(main);
      setOuterOffset(out);
      setSuperOffset(sup);
      setReady(true);
    };
    measure();
  }, []);

  useEffect(() => {
    let raf = 0;
    let t: number | null = null;
    let last = { main: arcOffset, out: outerOffset, sup: superOffset };

    const onResize = () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        raf = requestAnimationFrame(() => {
          const w = logoRef.current?.getBoundingClientRect().width ?? 380;
          const half = w / 2;
          const gap  = 60;
          const main = Math.round(half + gap);
          const out  = Math.round(main + 220);
          const sup  = Math.round(out + 220);

          const dMain = Math.abs(main - last.main);
          const dOut  = Math.abs(out  - last.out);
          const dSup  = Math.abs(sup  - last.sup);

          if (dMain > 1) setArcOffset(main);
          if (dOut  > 1) setOuterOffset(out);
          if (dSup  > 1) setSuperOffset(sup);

          last = { main, out, sup };
        });
      }, 120);
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (t != null) window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [arcOffset, outerOffset, superOffset]);

  return (
    <div className={styles.wrap}>
      {/* Logo -> zurück auf Default (/guidehub ohne Query) */}
      <div className={styles.centerLogoWrap}>
        <Link to="/guidehub" className={styles.centerLogoLink} aria-label="Guide Hub Home">
          <img ref={logoRef} src={logoSrc} alt="Guide Hub" className={styles.centerLogo} />
        </Link>
      </div>

      {/* Bis Offsets gemessen sind, NICHT rendern → verhindert Erstframe-Sprung */}
      {ready && (
        <>
          {/* Haupt-Halbkreise */}
          <ArcNav
            items={(categories.filter(c => c.side === "left")).map(c => ({ key: c.key, to: c.to, label: c.label, icon: c.icon }))}
            side="left"
            variant="main"
            arcOffset={arcOffset}
          />
          <ArcNav
            items={(categories.filter(c => c.side === "right")).map(c => ({ key: c.key, to: c.to, label: c.label, icon: c.icon }))}
            side="right"
            variant="main"
            arcOffset={arcOffset}
          />

          {/* Sub-Halbkreis */}
          {safeAnchorSide && subList.length > 0 && (
            <ArcNav
              items={subList.map(s => ({ key: s.key, to: s.to, label: s.label, icon: s.icon }))}
              side="sub"
              anchorSide={safeAnchorSide}
              variant="sub"
              outerOffset={outerOffset}
              compact
            />
          )}

          {/* Sub-Sub-Halbkreis */}
          {safeAnchorSide && sub2List.length > 0 && (
            <ArcNav
              items={sub2List.map(s2 => ({ key: s2.key, to: s2.to, label: s2.label, icon: s2.icon }))}
              side="sub2"
              anchorSide={safeAnchorSide}
              variant="sub2"
              superOffset={superOffset}
              compact
            />
          )}
        </>
      )}
    </div>
  );
};

export default GuideHubDashboard;
