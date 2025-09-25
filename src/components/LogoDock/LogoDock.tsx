import React from "react";
import styles from "./LogoDock.module.css";

type Props = { src?: string; alt?: string; children?: React.ReactNode };

export default function LogoDock({ src, alt = "./assets/logo-sfdatahub.png", children }: Props) {
  return (
    <div className="logo-dock">
      {src ? <img className="logo-img" src={src} alt={alt} /> : children}
    </div>
  );
}
