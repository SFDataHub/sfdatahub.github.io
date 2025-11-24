import React from "react";
import HudLabel from "../../../ui/hud/HudLabel";
import type { PaletteColors } from "../GuildProfileInfo.types";

export default function RankingsCard({ colors }: { colors: PaletteColors }) {
  return (
    <div style={{ background: "transparent" }}>
      <HudLabel text="Rankings" />
      <div style={{ height: 6 }} />
      <div className="text-sm" style={{ opacity: .8 }}>—</div>
    </div>
  );
}
