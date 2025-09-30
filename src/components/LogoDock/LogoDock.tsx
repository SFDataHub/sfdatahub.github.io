import React from "react";
import { NavLink } from "react-router-dom";
import styles from "./LogoDock.module.css";
import defaultLogo from "../../assets/logo-sfdatahub.png";

type Props = {
  src?: string;
  alt?: string;
  children?: React.ReactNode;
  /** Zielroute beim Klick (SPA-intern) */
  to?: string;
  /** Bild-Ladepriorität: "eager" (sofort) oder "lazy" (später) */
  loading?: "eager" | "lazy";
  /** Bild-Decoding: "async" (empfohlen) | "sync" | "auto" */
  decoding?: "async" | "sync" | "auto";
};

export default function LogoDock({
  src,
  alt = "",            // leer => kein sichtbarer Text, falls Bild 404
  children,
  to = "/",             // klick führt zur Startseite
  loading = "eager",    // Header-Logo: direkt laden
  decoding = "async",   // Dekodierung nicht blockierend
}: Props) {
  const imgSrc = src ?? defaultLogo;

  return (
    <div className="logo-dock">
      <NavLink to={to} aria-label="Go to home">
        <img
          className="logo-img"
          src={imgSrc}
          alt={alt}
          loading={loading}
          decoding={decoding}
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            if (img.src !== defaultLogo) img.src = defaultLogo;
          }}
        />
      </NavLink>
      {children}
    </div>
  );
}
