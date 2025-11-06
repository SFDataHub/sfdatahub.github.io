// FILE: src/pages/GuideHub/Calculators/Index.tsx
import React from "react";
import { useSearchParams } from "react-router-dom";
import HudBox from "../../../components/ui/hud/box/HudBox";
import { tiles } from "./config";
import styles from "./Index.module.css";

export default function CalculatorsIndex() {
  const [params, setParams] = useSearchParams();

  const openSub = (slug: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", "calculators");
    next.set("sub", slug);
    next.delete("sub2"); // immer sauber halten
    setParams(next, { replace: false });
  };

  return (
    <div className={styles.wrap}>
      {/* Header (ohne 'last updated', kein Intro-Text) */}
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Calculators</h2>
      </div>

      {/* Grid der Kacheln */}
      <div className={styles.grid}>
        {tiles.map((t) => (
          <button
            key={t.slug}
            className={styles.tileBtn}
            onClick={() => openSub(t.slug)}
            aria-label={t.title}
          >
            <HudBox title={t.title} padding="md" hover />
          </button>
        ))}
      </div>
    </div>
  );
}
