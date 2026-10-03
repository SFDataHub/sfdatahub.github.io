import HudLabel from "../../../ui/hud/HudLabel";
import type { GuildLike, MembersSnapshotLike, PaletteColors } from "../GuildProfileInfo.types";

export default function GeneralInfoCard(_props: { guild: GuildLike; snapshot: MembersSnapshotLike | null; colors: PaletteColors; }) {
  return (
    <div style={{ background: "transparent" }}>
      <HudLabel text="General Info" />
      <div style={{ height: 6 }} />
      <div className="text-sm" style={{ opacity: .8 }}>—</div>
    </div>
  );
}
