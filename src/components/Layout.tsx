// src/components/Layout.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import Footer from "./Footer";
import logoUrl from "../assets/logo-sfdatahub.png";

export default function Layout() {
  return (
    <>
      <div className="logo-dock">
        <img className="logo-img" src={logoUrl} alt="SF Data Hub" />
      </div>

      <Topbar />
      <Sidebar />

      {/* IMPORTANT: flex row with a fixed-width sizer so content never sits under the fixed sidebar */}
      <div className="layout-row">
        <div className="sidebar-sizer" aria-hidden />
        <main className="content" role="main">
          <div className="content-inner">
            <div className="content-body">
              <Outlet />
            </div>
            <Footer />
          </div>
        </main>
      </div>

      <div className="logo-fill" />
    </>
  );
}
