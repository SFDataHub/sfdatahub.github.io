import React from "react";

// ACHTUNG: relativer Pfad, weil Seite unter src/pages/GuideHub/ liegt.
// Falls dein Seitenpfad anders ist, bitte nur die Anzahl der "../" anpassen.
import DungeonPauseOpenXPCalculator from "../../../components/calculators/DungeonPauseOpenXPCalculator";

export default function DungeonPauseOpenXPCalculatorPage() {
  return (
    <div style={{ padding: 12 }}>
      <DungeonPauseOpenXPCalculator />
    </div>
  );
}
