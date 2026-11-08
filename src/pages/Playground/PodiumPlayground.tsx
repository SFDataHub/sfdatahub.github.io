import React from "react";
import PortraitPreview from "../../components/avatar/PortraitPreview";
import type { PortraitOptions } from "../../components/player-profile/types";
import { getGuildClassAccent } from "../../components/guilds/classColors";
import { getClassIconUrl } from "../../components/ui/shared/classIcons";
import styles from "./PodiumPlayground.module.css";

import previewData from "./podiumPlaygroundData.json";
import measurements from "./podiumPlaygroundMeasurements.json";
import RankingIcon from "./RankingIcon";

type PreviewPlayer = {
  key: string; name: string; rank: number; value: number;
  classLabel: string; portrait: PortraitOptions;
};
// Fixed, verified W-86 snapshots. Same players, ranks and portraits per metric
// in both variants. No scan-library, archive, worker or analytics subscription.
const DATA = previewData as { level: PreviewPlayer[]; base: PreviewPlayer[][]; total: PreviewPlayer[][] };
const PLAYERS = DATA.level;

const ASSETS = `${import.meta.env.BASE_URL}assets/playground/podiums/`;
const WIDTH = 1200;
const HEIGHT = 820;
// Keep the podium artwork at its W-87 scale. Extra height reserves the largest
// avatar envelope above it; values live in their own row below the artwork.
const ART_OFFSET = 100;
const AVATAR_AREA = 300;
const NORMAL_FRAME = 224;
// Keep W-88's full 256-unit special envelope and 88% image size. Only the
// visible frame moves to the unchanged image bounds (plus its regular border).
const SPECIAL_IMAGE = 256 * 0.88;
type Position = { x: number; surface: number; iconX: number; iconY: number };
const WOOD: Record<number, Position> = {
  2: { x: 230, surface: 375, iconX: 100, iconY: 445},
  1: { x: 630, surface: 280, iconX: 474, iconY: 384},
  3: { x: 1010, surface: 452, iconX: 882, iconY: 538},
};
const MODERN_SIZES: Record<number, { width: number; height: number }> = {
  1: { width: 816, height: 815 }, 2: { width: 1344, height: 628 }, 3: { width: 1348, height: 512 },
};
const modernPosition = (rank: number): Position => {
  const x = rank === 2 ? 200 : rank === 1 ? 600 : 1000;
  const surface = 704 - 400 * MODERN_SIZES[rank].height / MODERN_SIZES[rank].width;
  return { x, surface: surface + 8, iconX: x - 139, iconY: surface + (rank === 1 ? 89 : 58)};
};
const at = (x: number, y: number): React.CSSProperties => ({ left: `${x / WIDTH * 100}%`, top: `${(y + ART_OFFSET) / HEIGHT * 100}%` });

function PodiumStage({ variant, players = PLAYERS, metric = "Level" }: {
  variant: "wood" | "modern"; players?: readonly PreviewPlayer[]; metric?: string;
}) {
  const id = React.useId();
  const title = variant === "wood" ? "Variante 1 – Holzpodest" : "Variante 2 – Klassenfarben";
  return <div className={styles.podiumGroup}><div className={styles.stage} data-podium-variant={variant} aria-label={`${title} · ${metric}`}>
      {variant === "wood" && <img className={styles.wood} src={`${ASSETS}wood.png`} alt="" draggable={false} />}
      {[2, 1, 3].map(rank => {
        const player = players.find(player => player.rank === rank)!;
        const position = variant === "wood" ? WOOD[rank] : modernPosition(rank);
        const accent = getGuildClassAccent(player.classLabel) ?? "#4F86C6";
        const metal = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
        const metalClass = rank === 1 ? styles.gold : rank === 2 ? styles.silver : styles.bronze;
        const art = MODERN_SIZES[rank];
        const frontTop = ({ 1: 112, 2: 131, 3: 121 }[rank] ?? 0) / art.height;
        const frontBottom = (art.height - 7) / art.height;
        const deckDepth = ({ 1: 40, 2: 59, 3: 55 }[rank] ?? 0);
        const engravingSize = art.width * 0.72;
        const engravingTop = (frontTop + frontBottom) / 2 * art.height - engravingSize / 2;
        // Source coordinates at the unchanged front edge. Only the part above
        // this cut can fold onto the deck; source transparency stays transparent.
        // A motif wholly below the edge contributes no deck layer, at any rank.
        const deckSlice = (frontTop * art.height - engravingTop) / engravingSize;
        const deckScaleY = deckSlice > 0 ? deckDepth / (128 * deckSlice) : 0;
        const value = player.value.toLocaleString("de-DE");
        const specialValue = Math.round(Number(player.portrait.special));
        const special = Number.isFinite(specialValue) && specialValue !== 0;
        return <div key={player.key} className={styles.player} role="group"
          aria-label={`Platz ${rank}: ${player.name}, ${player.classLabel}, ${metric} ${value}`}
          data-preview-player={player.key} data-preview-rank={rank} data-avatar-kind={special ? "special" : "normal"}>
          {variant === "modern" && <div className={styles.modernBody} style={{
            ...at(position.x - 200, 704 - 400 * MODERN_SIZES[rank].height / MODERN_SIZES[rank].width),
            aspectRatio: `${art.width} / ${art.height}`,
            maskImage: `url("${ASSETS}modern-${rank}-contour-mask.png")`,
            WebkitMaskImage: `url("${ASSETS}modern-${rank}-contour-mask.png")`,
          }}>
            <img src={`${ASSETS}modern-${rank}-surface.png`} alt="" draggable={false} />
            <span className={styles.bodyColor} data-body-color style={{
              background: `linear-gradient(90deg, ${accent} 0%, color-mix(in srgb, ${accent} 38%, white) 100%)`,
              maskImage: `url("${ASSETS}modern-${rank}-body-mask.png")`,
              WebkitMaskImage: `url("${ASSETS}modern-${rank}-body-mask.png")`,
            }} />
            <div className={styles.frontEngraving} style={{
              maskImage: `url("${ASSETS}modern-${rank}-front-mask.png")`,
              WebkitMaskImage: `url("${ASSETS}modern-${rank}-front-mask.png")`,
            }}>
            <svg className={styles.engraving} viewBox="0 0 128 128" role="img" aria-label={`${player.classLabel} · Gravur`}
              style={{ top: `${(frontTop + frontBottom) / 2 * 100}%` }} data-class-engraving>
              <defs><filter id={`${id}-engraving-${rank}`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
                <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2 -0.6 -0.2 1 0" result="detail" />
                <feGaussianBlur in="SourceAlpha" stdDeviation="0.45" result="soft" />
                <feOffset in="soft" dx="0.7" dy="1.1" result="down" />
                <feComposite in="SourceAlpha" in2="down" operator="out" result="innerTop" />
                <feOffset in="soft" dx="-0.7" dy="-1.1" result="up" />
                <feComposite in="SourceAlpha" in2="up" operator="out" result="innerBottom" />
                <feFlood floodColor="#102238" floodOpacity="0.12" /><feComposite in2="SourceAlpha" operator="in" result="recess" />
                <feFlood floodColor="#102238" floodOpacity="0.32" /><feComposite in2="detail" operator="in" result="etchedDetail" />
                <feFlood floodColor="#081523" floodOpacity="0.65" /><feComposite in2="innerTop" operator="in" result="shadow" />
                <feFlood floodColor="#ffffff" floodOpacity="0.65" /><feComposite in2="innerBottom" operator="in" result="light" />
                <feMerge><feMergeNode in="recess" /><feMergeNode in="etchedDetail" /><feMergeNode in="shadow" /><feMergeNode in="light" /></feMerge>
              </filter>
                <image id={`${id}-motif-${rank}`} href={getClassIconUrl(player.classLabel, 256)}
                  width="128" height="128" filter={`url(#${id}-engraving-${rank})`} />
              </defs>
              <use href={`#${id}-motif-${rank}`} />
            </svg>
            </div>
            {deckSlice > 0 && <svg className={styles.topEngraving} viewBox={`0 0 ${art.width} ${art.height}`}
              aria-hidden="true" data-top-engraving style={{
                maskImage: `url("${ASSETS}modern-${rank}-top-mask.png")`,
                WebkitMaskImage: `url("${ASSETS}modern-${rank}-top-mask.png")`,
              }}>
              <g transform={`matrix(${engravingSize / 128} 0 -0.8 ${deckScaleY} ${-art.width * 0.2 + 0.8 * 128 * deckSlice} 0)`}>
                <use href={`#${id}-motif-${rank}`} />
              </g>
            </svg>}
            <span className={`${styles.metalLayer} ${styles.metalRing} ${metalClass}`}
              data-metal-part="ring" data-metal={metal} aria-hidden="true"
              style={{ maskImage: `url("${ASSETS}modern-${rank}-ring-mask.png")`, WebkitMaskImage: `url("${ASSETS}modern-${rank}-ring-mask.png")` }}>
              <img src={`${ASSETS}modern-${rank}-surface.png`} alt="" draggable={false} />
            </span>
            <span className={`${styles.metalLayer} ${styles.metalNumeral} ${metalClass}`}
              data-metal-part="numeral" data-metal={metal} aria-hidden="true"
              style={{ maskImage: `url("${ASSETS}modern-${rank}-numeral-mask.png")`, WebkitMaskImage: `url("${ASSETS}modern-${rank}-numeral-mask.png")` }}>
              <img src={`${ASSETS}modern-${rank}-surface.png`} alt="" draggable={false} />
            </span>
          </div>}
          <div className={styles.avatarArea} style={at(position.x, position.surface)} data-avatar-area>
          <div className={`${styles.avatar} ${special ? styles.specialAvatar : styles.normalAvatar}`} data-preview-avatar>
            {special && <span className={styles.specialFrame} data-visible-avatar-frame aria-hidden="true" />}
            <PortraitPreview config={player.portrait} label={player.name} showStatus={false}
              canvasId={`podium-preview-${id}-${player.key}`} className={styles.portrait}
              shellClassName={styles.portraitShell} canvasClassName={styles.portraitCanvas} />
          </div></div>
          {variant === "wood" && <img className={styles.classIcon} src={getClassIconUrl(player.classLabel, 256)}
            style={at(position.iconX, position.iconY)} alt={player.classLabel} draggable={false} />}

        </div>;
      })}
    </div><div className={`${styles.values} ${variant === "wood" ? styles.woodValues : ""}`} data-values-row>
      {[2, 1, 3].map(rank => {
        const player = players.find(player => player.rank === rank)!;
        const position = variant === "wood" ? WOOD[rank] : modernPosition(rank);
        return <strong key={rank} className={styles.value} style={{ left: `${position.x / WIDTH * 100}%` }}
          data-value-rank={rank} data-preview-value>{player.value.toLocaleString("de-DE")}</strong>;
      })}
    </div></div>;
}

function PodiumVariant({ variant }: { variant: "wood" | "modern" }) {
  return <section className={styles.variant} aria-labelledby={`podium-${variant}-title`}>
    <h3 id={`podium-${variant}-title`} className={styles.variantTitle}>
      {variant === "wood" ? "Variante 1 – Holzpodest" : "Variante 2 – Klassenfarben"}
    </h3>
    <p className={styles.note}>Große Vergleichsansicht</p>
    <PodiumStage variant={variant} />
    <InstallSizes variant={variant} />
  </section>;
}

const px = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
function InstallSizes({ variant }: { variant: "wood" | "modern" }) {
  return <div className={styles.installSizes}>
    <h4>Reale Einbaugrößen · 1 CSS-Pixel = 1 Vorschaupixel</h4>
    <p className={styles.note}>Gemessen im bestehenden Dashboard mit ContentShell und Seitenmenü.
      Desktop: eingeklapptes Seitenmenü (200 px). Ab 1024 px: mobiles Menü ohne Seitenversatz.
      Größere Ansichten lassen sich horizontal scrollen.</p>
    {measurements.map(measurement => {
      const cases = measurement.viewport === 390 ? measurement.spans.slice(0, 1) : measurement.spans;
      return cases.map(size => {
        const mobile = measurement.viewport === 390;
        const available = measurement.modes.base.availableHeight;
        const needed = 3 * (32 + size.innerWidth * (HEIGHT / WIDTH + 0.012) + Math.max(12, size.innerWidth * 0.03) * 1.25) + 2 * 4;
        return <article className={styles.sizeCase} key={`${measurement.viewport}-${size.columns}`}
          data-install-size={`${measurement.viewport}-${mobile ? "mobile" : size.columns}`}>
          <h5>{measurement.viewport} px Bildschirm · {mobile ? "mobile Zielbreite" : `${size.columns} Rasterspalten`}</h5>
          <p className={styles.note}>Außen {px(size.outerWidth)} px · innen nutzbar {px(size.innerWidth)} px
            {mobile ? " · Desktopraster aufgelöst" : ` · ${size.columns - 1} × ${px(measurement.gap)} px Zwischenraum enthalten`}</p>
          <div className={styles.widthScroll} tabIndex={0} role="region" aria-label="Einbauvorschau in Originalbreite">
            <div className={styles.exactWidth} style={{ width: size.innerWidth }} data-exact-width={size.innerWidth}>
              <PodiumStage variant={variant} />
            </div>
          </div>
          <p className={styles.note}>Avatarbereich {px(size.innerWidth * AVATAR_AREA / WIDTH)} × {px(size.innerWidth * AVATAR_AREA / WIDTH)} px · Rahmen normal {px(size.innerWidth * NORMAL_FRAME / WIDTH)} px / Spezial {px(size.innerWidth * SPECIAL_IMAGE / WIDTH + 0.24)} px · Wertschrift {px(Math.max(12, size.innerWidth * 0.03))} px.
            {size.innerWidth < 300 ? " Nicht ausreichend lesbar: kleine Motivdetails; lange Werte können ihre Stufenspalte überschreiten." : " Einzelgruppe lesbar; drei Kennzahlen überschreiten jedoch die vorhandene Dashboardhöhe."}</p>
          <p className={styles.heightSummary}>
            Drei Kennzahlen untereinander: {px(needed)} px benötigt / {px(available)} px vorhandene Kennzahlhöhe
            · {needed > available ? `${px(needed - available)} px Überhöhe` : `${px(available - needed)} px Reserve`}.
            {mobile && " Mobil stehen die Kennzahlen produktiv derzeit nebeneinander; die Probe zeigt die angeforderte Stapelung."}
          </p>
          <div className={styles.heightGroups}>
            {(["base", "total"] as const).map(mode => <div key={mode}>
              <h6>{mode === "base" ? "Base" : "Total"} · drei Kennzahlen mit Podesten</h6>
              <p className={styles.note}>Höhenfenster {px(measurement.modes[mode].availableHeight)} px · orange Linie markiert die Vergleichsgrenze; vollständige Anordnung sichtbar</p>
              <div className={styles.widthScroll} tabIndex={0} role="region" aria-label={`${mode}: Originalbreite`}>
                <div className={styles.heightWindow} style={{ width: size.innerWidth, "--available-height": `${measurement.modes[mode].availableHeight}px` } as React.CSSProperties}
                  tabIndex={0} role="region" aria-label={`${mode}: vorhandene Höhe`} data-height-window={measurement.modes[mode].availableHeight}>
                  <div className={styles.metricStack} data-metric-stack>
                    {DATA[mode].map((players, index) => <div key={index} className={styles.metric}>
                      <div className={styles.metricHeader}>
                        <span>{index === 0 ? `${mode === "base" ? "Base" : "Total"} Stats` : index === 1 ? "Main" : "CON"}</span>
                        <RankingIcon variant="fusion" presentation="name-only" sphereOnly labelLines={["F28"]} size={32} />
                        <RankingIcon variant="global" presentation="name-only" sphereOnly size={32} />
                      </div>
                      <PodiumStage variant={variant} players={players} metric={`${mode} · ${index === 0 ? "Stats" : index === 1 ? "Main" : "CON"}`} />
                    </div>)}
                  </div>
                </div>
              </div>
            </div>)}
          </div>
        </article>;
      });
    })}
  </div>;
}

export default function PodiumPlayground() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <h2>Podeste</h2>
      <p>Level · Welten im Wandel · F28</p>
      <p>Dieselben drei Spieler in beiden Varianten. Reihenfolge: Platz 2 – Platz 1 – Platz 3.</p>
    </header>
    <PodiumVariant variant="wood" />
    <PodiumVariant variant="modern" />
    <ol className={styles.legend} aria-label="Gemeinsame Vergleichsgrundlage">
      {PLAYERS.map(player => <li key={player.key}>
        <strong>{player.rank}. {player.name}</strong>
        <span>{player.classLabel} · Level {player.value.toLocaleString("de-DE")}</span>
      </li>)}
    </ol>
  </div>;
}
