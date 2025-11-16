import React from "react";
import ContentShell from "../../../components/ContentShell";
import PortraitPreview from "../../../components/avatar/PortraitPreview";
import type { PortraitOptions } from "../../../components/player-profile/types";

const demoConfig: Partial<PortraitOptions> = {
  genderName: "male" as const,
  class: 2,
  race: 1,
  mouth: 1,
  hair: 3,
  hairColor: 4,
  horn: 0,
  hornColor: 0,
  brows: 2,
  eyes: 3,
  beard: 0,
  nose: 2,
  ears: 1,
  extra: 0,
  special: 0,
  showBorder: true,
  background: "",
  frame: "",
  mirrorHorizontal: true,
};

export default function BlankTemplatePage() {
  return (
    <ContentShell
      title="Leere Template-Seite"
      subtitle="Noch kein Inhalt hinterlegt"
      centerFramed
    >
      <div className="flex w-full justify-center pt-10">
        <PortraitPreview config={demoConfig} label="Playground Avatar" />
      </div>
    </ContentShell>
  );
}
