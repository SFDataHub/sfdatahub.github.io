import React from "react";
import ContentShell from "../../components/ContentShell";
import PlayerProfileScreen from "./PlayerProfileScreen";

export default function PlayerProfile() {
  return (
    <ContentShell title="Spielerprofil" subtitle="Charakter, KPIs & Verlauf" centerFramed={false} padded>
      <PlayerProfileScreen />
    </ContentShell>
  );
}
