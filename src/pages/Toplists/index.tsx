// src/pages/Toplists/index.tsx
import React from "react";
import PlayerToplists from "./playertoplists";
import { FilterProvider } from "../../components/Filters/FilterContext";

export default function ToplistsIndex() {
  // Nur anzeigen. Alles andere (Topbar, Tabs, Filter, Shell) machen die Unterseiten.
  return (
    <FilterProvider>
      <PlayerToplists />
    </FilterProvider>
  );
}
