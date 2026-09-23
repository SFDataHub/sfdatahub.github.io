import React from "react";
import { CornerGlow, COLORS } from "./Decor";

type FrameProps = {
  rounded?: string;   // z. B. "rounded-3xl"
  padded?: boolean;   // Innenabstand
  children: React.ReactNode;
};

/**
 * HUD Frame:
 * - CornerGlow (oben, maskiert/abgeschwächt – kein Aufhellen in der Mitte)
 * - KEIN Pulse/Sheen-Band mehr
 */
export default function Frame({
  rounded = "rounded-3xl",
  padded = true,
  children,
}: FrameProps) {
  return (
    <section
      className={`relative w-full overflow-hidden border ${rounded}`}
      style={{
        borderColor: COLORS.border,
        background: "var(--nav, " + COLORS.nav + ")", // folgt deinem Token, mit Fallback
        boxShadow: "0 10px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
      }}
    >
      {/* Corner glow (oben links stark, unten rechts schwächer/weiter außen) */}
      <CornerGlow />

      {/* Inhalt */}
      <div className={`relative z-10 ${padded ? "p-4 md:p-6" : ""}`}>{children}</div>
    </section>
  );
}
