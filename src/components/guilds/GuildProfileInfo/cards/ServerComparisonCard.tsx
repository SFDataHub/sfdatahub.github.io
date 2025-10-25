import React from "react";
import HudLabel from "../../../ui/hud/HudLabel";
import type { PaletteColors } from "../GuildProfileInfo.types";

export default function ServerComparisonCard({ colors }: { colors: PaletteColors }) {
  return (
    <div style={{ background: "transparent" }}>
      <HudLabel text="Serververgleich" />
      <div style={{ height: 6 }} />
      <div className="text-sm" style={{ opacity: .8 }}>—</div>
    </div>
  );
}
