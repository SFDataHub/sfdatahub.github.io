import React, { useMemo, useState } from "react";

type HeyzineFlipbookProps = {
  /** Vollständige Heyzine-URL ODER nur die ID (z. B. a646e8901f) */
  srcOrId: string;
  /**
   * CSS aspect-ratio (Breite/Höhe). Beispiele: 16/10, 4/3, 3/2.
   * Default: 16/10 (~0.625 Höhe relativ zur Breite).
   */
  aspectRatio?: number | string;
  /** Optional feste Höhe (setzt aspect-ratio außer Kraft, z. B. "800px" oder "70vh") */
  height?: string;
  /** Vollbild erlauben (Button im Viewer) */
  allowFullscreen?: boolean;
  /** Lazy-Loading für das iframe */
  lazy?: boolean;
  /** Zusätzliche CSS-Klasse */
  className?: string;

  /** Info-Icon oben rechts anzeigen */
  showInfo?: boolean;
  /** Text für das Info-Icon/Tooltip (kein i18n erstmal) */
  infoText?: string;

  /**
   * Lässt ContentShell-Hintergrund sichtbar, indem ein Innenabstand erzeugt wird.
   * 0 => kein Reveal (Standard). Erhöhe, wenn du bewusst „Luft“ rundherum willst.
   */
  edgeRevealPx?: number;

  /**
   * Versuche echte Transparenz im Viewer zu erzwingen, indem Query-Parameter
   * an die URL gehängt werden (wirkt nur, wenn der Viewer das unterstützt).
   */
  tryTransparentBg?: boolean;
};

function buildHeyzineUrl(srcOrId: string, tryTransparentBg?: boolean) {
  if (!srcOrId) return "";
  const base = /^https?:\/\//i.test(srcOrId)
    ? srcOrId
    : `https://heyzine.com/flip-book/${srcOrId}.html`;

  if (!tryTransparentBg) return base;

  // Params anhängen (ohne doppelte ?/&)
  const glue = base.includes("?") ? "&" : "?";
  return `${base}${glue}bg=transparent&background=transparent`;
}

const HeyzineFlipbook: React.FC<HeyzineFlipbookProps> = ({
  srcOrId,
  aspectRatio = "16/10",
  height,
  allowFullscreen = true,
  lazy = true,
  className,
  showInfo = false,
  infoText = "Dieses Flipbook wird von einem externen Dienst (heyzine.com) geladen.",
  edgeRevealPx = 0,          // <-- Voll-bleed als Standard
  tryTransparentBg = true,
}) => {
  const [infoOpen, setInfoOpen] = useState(false);
  const src = useMemo(() => buildHeyzineUrl(srcOrId, tryTransparentBg), [srcOrId, tryTransparentBg]);
  const loading = lazy ? "lazy" : "eager";

  // Außen-Wrapper: komplett transparent, ohne künstliche Abstände
  const outerStyle: React.CSSProperties = {
    width: "100%",
    position: "relative",
    background: "transparent",
    border: "none",
    margin: 0,
    padding: 0,
  };

  // Innen-Wrapper: edgeRevealPx standardmäßig 0 (kein Card-/Kachel-Look)
  const innerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    padding: edgeRevealPx ? `${edgeRevealPx}px` : 0,
    boxSizing: "border-box",
    background: "transparent",
  };

  // Viewport (der eigentliche Ratio-/Height-Container für das iframe)
  const viewportStyle: React.CSSProperties = height
    ? { position: "relative", width: "100%", height, overflow: "hidden", background: "transparent", borderRadius: 0 }
    : {
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "transparent",
        borderRadius: 0,
        aspectRatio: typeof aspectRatio === "number" ? aspectRatio : (aspectRatio as any),
      };

  // Minimaler, unauffälliger Info-Button (kein flächiger Hintergrund)
  const infoBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "1px solid rgba(214,228,247,0.45)",
    background: "transparent",
    color: "#D6E4F7",
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: "22px",
    textAlign: "center",
    userSelect: "none",
    zIndex: 2,
  };

  return (
    <div className={className} style={outerStyle}>
      <div style={innerStyle}>
        <div style={viewportStyle}>
          <iframe
            src={src}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, backgroundColor: "transparent" }}
            allowFullScreen={allowFullscreen}
            loading={loading as any}
            scrolling="no"
            title="Heyzine Flipbook"
          />

          {showInfo && (
            <>
              <button type="button" aria-label="Info" onClick={() => setInfoOpen((v) => !v)} style={infoBtnStyle} title="Info">
                i
              </button>

              {infoOpen && (
                <div
                  role="note"
                  style={{
                    position: "absolute",
                    top: 40,
                    right: 8,
                    maxWidth: 360,
                    padding: "8px 10px",
                    fontSize: 13,
                    lineHeight: 1.35,
                    border: "1px solid rgba(214,228,247,0.25)",
                    background: "rgba(12,28,46,0.85)", // sehr dezent; nur sichtbar, wenn geöffnet
                    color: "#B0C4D9",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                    borderRadius: 8,
                    zIndex: 2,
                  }}
                >
                  {infoText}{" "}
                  <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: "#5C8BC6", textDecoration: "underline" }}>
                    In neuem Tab öffnen
                  </a>
                  .
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeyzineFlipbook;
