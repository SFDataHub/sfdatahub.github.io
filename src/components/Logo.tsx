import React from "react";
import "./Logo.css";
import logoPng from "../assets/logo-sfdatahub.png"; // ← PNG mit .png Endung!

export default function Logo({
  src = logoPng,
  size = 72,
  alt = "Wappen",
}: {
  src?: string;
  size?: number;
  alt?: string;
}) {
  return (
    <div className="logo-only" style={{ ["--logo-size" as any]: `${size}px` }}>
      <img src={src} alt={alt} />
    </div>
  );
}
