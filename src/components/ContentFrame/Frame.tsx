import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CarbonBG, CornerGlow, COLORS } from "./Decor";

type FrameProps = {
  rounded?: string;   // z. B. "rounded-3xl"
  padded?: boolean;   // Innenabstand
  children: React.ReactNode;
};

/**
 * HUD Frame mit globalem, dezentem Shine:
 * - CarbonBG (unten)
 * - ShineLayer (diagonaler Soft-Light-Shimmer über der ganzen Fläche)
 * - CornerGlow (oben, maskiert/abgeschwächt – kein Aufhellen in der Mitte)
 * - KEIN Pulse/Sheen-Band mehr
 */
export default function Frame({
  rounded = "rounded-3xl",
  padded = true,
  children,
}: FrameProps) {
  const prefersReduced = useReducedMotion();

  return (
    <section
      className={`relative w-full overflow-hidden border ${rounded}`}
      style={{
        borderColor: COLORS.border,
        background: "var(--nav, " + COLORS.nav + ")", // folgt deinem Token, mit Fallback
        boxShadow: "0 10px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
      }}
    >
      {/* Basis */}
      <CarbonBG />

      {/* === Globaler Shine (sehr subtil, diagonal, ohne harte Kante) === */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          mixBlendMode: "soft-light",
          // großer diagonaler Verlauf; bewegt sich horizontal → wirkt wie Schimmern
          backgroundImage:
            "linear-gradient(115deg," +
              "rgba(255,255,255,0.05) 0%," +
              "rgba(255,255,255,0.02) 35%," +
              "rgba(92,139,198,0.08) 50%," +
              "rgba(0,0,0,0.02) 65%," +
              "rgba(255,255,255,0.05) 100%)",
          backgroundSize: "200% 100%", // wir schieben den Verlauf über doppelte Breite
          opacity: 0.28,               // dezent halten
        }}
        initial={{ backgroundPositionX: "0%" }}
        animate={
          prefersReduced
            ? { backgroundPositionX: "0%" }
            : { backgroundPositionX: ["0%", "100%", "0%"] }
        }
        transition={
          prefersReduced
            ? undefined
            : { duration: 18, repeat: Infinity, ease: "linear" }
        }
      />

      {/* Corner glow (oben links stark, unten rechts schwächer/weiter außen) */}
      <CornerGlow />

      {/* Inhalt */}
      <div className={`relative z-10 ${padded ? "p-4 md:p-6" : ""}`}>{children}</div>
    </section>
  );
}
