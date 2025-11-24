import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import styles from "./styles.module.css";

// Google-Drive Asset (dein Key: goldxpcurve)
import { guideAssetUrlByKey } from "../../../../../data/guidehub/assets";

// === HIER STELLST DU DIE GELADENE BILDGRÖSSE EIN (px) ===
// Tipp: 1200–1600 ist meist ein gutes Maß für große Screens.
// Kleinere Zahl = kleinere Datei; größere Zahl = schärfer, aber mehr KB.
const CURVE_SIZE_PX = 1400;

export default function DungeonPauseIndex() {
  const curveImg = useMemo(() => guideAssetUrlByKey("goldxpcurve", CURVE_SIZE_PX), []);

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titles}>
          <h1 className={styles.h1}>Dungeon Pause</h1>
          <p className={styles.lead}>
            Überblick, Start-/Endpunkte, Vorgehen und typische Fehler. Nutze die beiden Tools unten
            für Berechnungen und den Exit-Pfad.
          </p>
        </div>
        <div className={styles.ctaRow}>
          <Link
            className={styles.cta}
            to="/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-open-xp-calculator"
            aria-label="Open XP Calculator öffnen"
          >
            Open XP Calculator
          </Link>
          <Link
            className={styles.cta}
            to="/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-exit"
            aria-label="Dungeon Pause Exit anzeigen"
          >
            Exit / Beenden
          </Link>
        </div>
      </header>

      {/* Kurze Einordnung */}
      <section className={styles.section}>
        <h2 className={styles.h2}>Worum geht’s?</h2>
        <p className={styles.p}>
          Die Dungeon Pause umgeht das schwache Level-Fenster um <strong>~470–500</strong>, in dem
          weder XP noch Gold besonders attraktiv sind. Als grobe Faustregel beginnt die Pause etwa
          bei <strong>Level 370</strong> und endet um <strong>Level 475</strong>. Die konkreten
          Werte hängen aber stark davon ab, wie viele Dungeons du bereits abgeschlossen hast
          (Shroomer beginnen i. d. R. früher).
        </p>
      </section>

      {/* Visual / Kurve */}
      <section className={styles.section}>
        <h3 className={styles.h3}>XP & Gold – Verlauf</h3>

        {/* figureNarrow steuert die ANZEIGEBREITE (CSS max-width).
           -> Zahl in styles.module.css anpassen (z. B. 720px, 960px, 1200px).
           -> figureNarrow weglassen = Bild nutzt volle Inhaltsbreite. */}
        <div className={`${styles.figure} ${styles.figureNarrow}`}>
          {curveImg ? (
            <img src={curveImg} alt="XP/Gold Verlaufskurve" className={styles.img} />
          ) : (
            <div className={styles.fallbackImg} aria-label="Kein Bild hinterlegt">📘</div>
          )}
          <div className={styles.figCaption}>
            Veranschaulicht das „Dip“-Fenster, das mit der Dungeon Pause übersprungen wird.
          </div>
        </div>
      </section>

      {/* Start/Ende & Twister/Worlds */}
      <section className={styles.sectionGrid}>
        <div className={styles.card}>
          <h3 className={styles.h3}>Start &amp; Ende</h3>
          <ul className={styles.ul}>
            <li>
              <strong>Start:</strong> grob um Level 370 (abhängig von bereits geclearten Dungeons).
            </li>
            <li>
              <strong>Ende:</strong> um Level 475; Zielbereich nach der Pause ca.{" "}
              <strong>505–510</strong> (danach Tagesdurst auf Gold drehen).
            </li>
            <li>
              <strong>Open XP vorausplanen:</strong> Vor Einstieg idealerweise{" "}
              <strong>30+</strong> Level an „Open XP“ verfügbar (typisch 33–39).
            </li>
          </ul>
        </div>

        <div className={styles.card}>
          <h3 className={styles.h3}>Twister &amp; Light/Shadow</h3>
          <ul className={styles.ul}>
            <li>
              <strong>Twister:</strong> bei ca. <strong>486</strong> aufhören (erster Blocker),
              etwas später für ein Level-Up ist okay.
            </li>
            <li>
              <strong>Shadow/Light:</strong> Shadow World kurz vor der Pause stoppen; Light World
              &amp; Loop of Idols ggf. länger für Scrapbook-Bilder.
            </li>
            <li>
              Während der Pause weiterhin <strong>13. Stock (Shadow)</strong> und{" "}
              <strong>City of Intrigue (Light)</strong> für <em>Devilsatt</em> &amp;{" "}
              <em>Tritosting</em> clearen.
            </li>
          </ul>
        </div>
      </section>

      {/* Vorgehen (Schritte) */}
      <section className={styles.section}>
        <h3 className={styles.h3}>Vorgehen</h3>
        <ol className={styles.ol}>
          <li>
            <strong>Open XP prüfen:</strong> Nutze den <em>Open XP Calculator</em> (Button oben).
          </li>
          <li>
            <strong>Ressourcen planen:</strong> Gold tendenziell in <em>Base Stats</em> statt in
            häufige Ausrüstungswechsel investieren.
          </li>
          <li>
            <strong>Scrapbook befüllen:</strong> Vor Eintritt ggf. noch fehlende Bilder in Light
            World / Loop of Idols mitnehmen.
          </li>
          <li>
            <strong>Während der Pause:</strong> Equipment möglichst stabil halten (Gildenabsprache),
            um Gold in Stats lenken zu können.
          </li>
          <li>
            <strong>Legendaries parken:</strong> Gegen Ende der Pause einige starke Legendary-Gems
            bereitlegen, um beim Exit nicht alle skippen zu müssen.
          </li>
          <li>
            <strong>Exit-Zeitpunkt:</strong> Idealerweise während eines{" "}
            <strong>Legendary Dungeon</strong> (parallel Witch-Event).
          </li>
          <li>
            <strong>Exit-Reihenfolge:</strong> Twister → Light World → Loop of Idols → Shadow World;
            dann Erst-Reequip (auch Companions).
          </li>
        </ol>
      </section>

      {/* Kompakter Übersichtsblock (Tabelle) */}
      <section className={styles.section}>
        <h3 className={styles.h3}>Kompaktübersicht</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Aspekt</th>
                <th>Empfehlung</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Start (Faustregel)</td>
                <td>~370 (abhängig von geclearten Dungeons / Spielstil)</td>
              </tr>
              <tr>
                <td>Ende (Faustregel)</td>
                <td>~475; Ziel: 505–510 und danach Tagesdurst auf Gold</td>
              </tr>
              <tr>
                <td>Open XP vor Eintritt</td>
                <td>30+ (typisch 33–39 Level verfügbar)</td>
              </tr>
              <tr>
                <td>Twister</td>
                <td>Stop bei ~486 (erster Blocker)</td>
              </tr>
              <tr>
                <td>Light/Shadow</td>
                <td>Shadow früher stoppen; Light &amp; LoI länger für Scrapbook</td>
              </tr>
              <tr>
                <td>Während der Pause</td>
                <td>Gold in Base Stats, wenig/kein Equip-Wechsel</td>
              </tr>
              <tr>
                <td>Pets</td>
                <td>13F Shadow &amp; City of Intrigue (Devilsatt, Tritosting)</td>
              </tr>
              <tr>
                <td>Optimaler Exit</td>
                <td>Legendary Dungeon (gleichzeitig Witch-Event)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer: Tools */}
      <footer className={styles.footer}>
        <div className={styles.tools}>
          <Link
            className={styles.toolBtn}
            to="/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-open-xp-calculator"
          >
            Open XP Calculator
          </Link>
          <Link
            className={styles.toolBtn}
            to="/guidehub?tab=progression&sub=mid&sub2=dungeon-pause-exit"
          >
            Exit / Beenden
          </Link>
        </div>
      </footer>
    </div>
  );
}
