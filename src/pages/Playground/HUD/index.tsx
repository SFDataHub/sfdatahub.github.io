import React from "react";
import { NavLink } from "react-router-dom";

export default function HUDIndex() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Playground / HUD</h1>
      <div className="mt-4 grid gap-3">
        <NavLink to="/playground/hud/buttons" className="block rounded-lg border px-4 py-3 hover:bg-white/5">
          Game Buttons
        </NavLink>
        {/* später weitere HUD-Demos hier verlinken */}
      </div>
    </div>
  );
}
