import HudLabel from "../../../ui/hud/HudLabel";
import type { PaletteColors } from "../GuildProfileInfo.types";

export default function FortressCard(_props: { colors: PaletteColors }) {
  return (
    <div style={{ background: "transparent" }}>
      <HudLabel text="Fortress" />
      <div style={{ height: 6 }} />
      <div className="text-sm" style={{ opacity: .8 }}>—</div>
    </div>
  );
}
