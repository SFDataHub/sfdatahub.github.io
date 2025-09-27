import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const sx: Record<string, React.CSSProperties> = {
  wrap: { padding: 16, maxWidth: 1200, margin: "0 auto", color: "#FFFFFF" },
  grid: { display: "grid", gridTemplateColumns: "250px 1fr", gap: 16 },
  tile: {
    background: "#152A42",
    border: "1px solid #2C4A73",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 20px rgba(0,0,0,.25)",
  },
  link: {
    display: "block",
    padding: "10px 12px",
    borderRadius: 12,
    background: "#1A2F4A",
    border: "1px solid rgba(255,255,255,.06)",
    marginBottom: 8,
  },
  active: { outline: "2px solid #1F3B5D" },
  note: { color: "#B0C4D9", fontSize: 12 },
};

export default function PlaygroundIndex() {
  return (
    <div style={sx.wrap}>
      <div style={sx.grid}>
        <aside style={sx.tile}>
          <h2 style={{ marginTop: 0, color: "#F5F9FF" }}>Playground</h2>
          <p style={sx.note}>Kleine Spielwiese für UI/Flows. Links wählen, rechts live ansehen.</p>

          <nav>
            <NavLink to="list-views" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
              List-View Switcher
            </NavLink>

            <NavLink to="rescan-widget" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
              Rescan Widget (auto)
            </NavLink>

            <NavLink to="upload-sim" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
              Upload Simulator
            </NavLink>

            <NavLink to="hud/game-buttons" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
              HUD · Game Buttons
            </NavLink>
<NavLink to="theme-maker" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
  Theme / Template Maker
</NavLink>
<NavLink to="theme-maker-pro" style={({isActive}) => ({...sx.link, ...(isActive ? sx.active : {})})}>
  Theme / Template Maker · Pro
</NavLink>
          </nav>
        </aside>

        <section style={sx.tile}>
          <Outlet />
        </section>
      </div>
    </div>
  );
}
