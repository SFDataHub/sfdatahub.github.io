// src/pages/Toplists/index.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PlayerToplists from "./playertoplists";
import GuildToplists from "./guildtoplists";
import { FilterProvider } from "../../components/Filters/FilterContext";

type TabKey = "players" | "guilds";

/* URL-Param <-> State */
function useTabSync(defaultTab: TabKey = "players") {
  const nav = useNavigate();
  const { search, pathname } = useLocation();
  const params = new URLSearchParams(search);
  const tab = (params.get("tab") as TabKey) || defaultTab;

  const setTab = (next: TabKey) => {
    const p = new URLSearchParams(search);
    p.set("tab", next);
    nav(`${pathname}?${p.toString()}`, { replace: false });
  };

  return [tab, setTab] as const;
}

export default function ToplistsIndex() {
  const [tab, setTab] = useTabSync("players");

  // Nur anzeigen. Alles andere (Topbar, Tabs, Filter, Shell) machen die Unterseiten.
  return (
    <FilterProvider>
      {tab === "players" ? (
        <PlayerToplists tab={tab} setTab={setTab} />
      ) : (
        <GuildToplists tab={tab} setTab={setTab} />
      )}
    </FilterProvider>
  );
}
