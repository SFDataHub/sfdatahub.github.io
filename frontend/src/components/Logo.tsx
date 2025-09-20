// src/components/Logo.tsx
import React from "react";
import logoUrl from "../assets/logo_sfdatahub.png"; // Pfad: src/assets/logo_sfdatahub.png

type LogoProps = {
  /** Höhe in px; Breite passt sich automatisch an */
  size?: number;
  /** alt-Text */
  alt?: string;
  /** zusätzliche CSS/Tailwind-Klassen */
  className?: string;
  /** optionaler Click-Handler */
  onClick?: () => void;
};

export default function Logo({
  size = 28,
  alt = "SFDataHub",
  className = "",
  onClick,
}: LogoProps) {
  // Basis-Look: leicht größer, nicht ziehbar, nicht selektierbar, Glow/Drop-Shadow
  const base =
    "select-none pointer-events-auto align-middle " +
    // hübscher Glow für dunklen Header
    "drop-shadow-[0_0_8px_rgba(0,0,0,0.65)] ";

  // Höhe über inline-Style, Breite automatisch
  const style: React.CSSProperties = { height: size, width: "auto" };

  return (
    <img
      src={logoUrl}
      alt={alt}
      style={style}
      className={`${base} ${className}`}
      draggable={false}
      onClick={onClick}
    />
  );
}
