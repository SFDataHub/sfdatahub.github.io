import React from "react";

/** Farbpalette (Demo-Look) */
export const COLORS = {
  bg: "#0C1C2E",     // Außen / Stage
  nav: "#0A1728",    // Frame-Grund (wird bei dir via CSS-Var überschrieben)
  tile: "#152A42",   // Kachel/Panels
  kachel: "#1A2F4A", // TopBar/Hex-Bar
  title: "#F5F9FF",
  textDim: "#B0C4D9",
  border: "#2B4C73",
  icon: "#5C8BC6",
};

/** Dezentes Carbon/Brushed-Pattern (wie in der Demo) */
export function CarbonBG() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundColor: "var(--hud-bg, " + COLORS.bg + ")",
        backgroundImage: `
          radial-gradient(ellipse at top left, rgba(255,255,255,0.045), transparent 45%),
          radial-gradient(ellipse at bottom right, rgba(255,255,255,0.03), transparent 55%),
          repeating-linear-gradient(45deg, rgba(255,255,255,0.018) 0 2px, rgba(0,0,0,0.018) 2px 4px)
        `,
      }}
    />
  );
}

/** Corner-Glow oben links + unten rechts (angepasst, damit Mitte dunkel bleibt) */
export function CornerGlow() {
  return (
    <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
      <defs>
        <radialGradient id="glowTL" cx="0" cy="0" r="1">
          <stop offset="0%"  stopColor={COLORS.icon} stopOpacity="0.42" />
          <stop offset="70%" stopColor={COLORS.icon} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowBR" cx="1" cy="1" r="1">
          <stop offset="0%"  stopColor={COLORS.icon} stopOpacity="0.20" />
          <stop offset="70%" stopColor={COLORS.icon} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* oben links — darf sichtbar bleiben */}
      <rect x="-20" y="-20" width="42%" height="42%" fill="url(#glowTL)" />
      {/* unten rechts — kleiner & weiter außen, damit Mitte nicht aufhellt */}
      <rect x="68%" y="68%" width="34%" height="34%" fill="url(#glowBR)" />
    </svg>
  );
}
