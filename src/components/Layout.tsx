// src/components/Layout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import Footer from "./Footer";

// Logo direkt aus src/assets importieren (sicherste Variante mit Vite)
import logoUrl from "../assets/logo-sfdatahub.png"; // <--- Pfad ggf. anpassen

export default function Layout() {
  return (
    <>
      {/* Fester Logo-Dock links oben (Größe wird in base.css gesteuert) */}
      <div className="logo-dock">
        <img className="logo-img" src={logoUrl} alt="SF Data Hub" />
      </div>

      {/* Topbar + Sidebar */}
      <Topbar />
      <Sidebar />

      {/* Hauptbereich + Footer */}
      <main className="content">
        <div className="content-inner">
          <div className="content-body">
            <Outlet />
          </div>
          <Footer />
        </div>
      </main>

      {/* Hintergrundfläche für die Sidebar */}
      <div className="logo-fill" />
    </>
  );
}
