import React, { useState, useMemo } from "react";
import { Outlet } from "react-router-dom";
import Topbar from "../components/Topbar/Topbar";
import Sidebar from "../components/Sidebar/Sidebar";
import LogoDock from "../components/LogoDock/LogoDock";

export default function RootLayout() {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const isOpen = pinned || expanded;

  // Eine Variable für ALLES links: Sidebar + Hintergrund + Content-Offset
  const leftVar = useMemo(
    () => (isOpen ? "var(--sidebar-expanded-w)" : "var(--sidebar-w)"),
    [isOpen]
  );

  return (
    <div id="app-shell" data-sidebar={isOpen ? "expanded" : "collapsed"} style={{ ["--left" as any]: leftVar }}>
      <LogoDock src="/logo.png" />
      <Topbar />

      {/* linker Hintergrundstreifen in Sidebar-Farbe */}
      <div className="logo-fill" />

      <Sidebar
        expanded={isOpen}
        setExpanded={setExpanded}
        pinned={pinned}
        setPinned={setPinned}
        hoverToExpand={!pinned}
      />

      {/* Content rechts neben der (eingeklappten/ausgeklappten) Sidebar */}
      <div className="content">
        <div className="content-inner">
          <div className="content-body">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
