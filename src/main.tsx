// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

// Globale Styles (neu gesplittet)
import "./styles/index.css";

// i18n (wie gehabt, falls vorhanden)
import "./i18n";

// Router
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";

// Shell
import RootLayout from "./layout/RootLayout";

// Seiten (neue Struktur)
import Home from "./pages/Home";

// Dashboard
import DashboardIndex from "./pages/Dashboard/Index";
import DashboardKPIs from "./pages/Dashboard/KPIs";
import DashboardActivity from "./pages/Dashboard/Activity";
import DashboardProgression from "./pages/Dashboard/Progression";

// Discover
import Discover from "./pages/Discover/Index";

// Entity Hubs
import PlayersIndex from "./pages/players/Index";
import PlayersRankings from "./pages/players/Rankings";
import PlayersStats from "./pages/players/Stats";
import PlayerProfile from "./pages/players/PlayerProfile"; // ← dein altes Profil, neu eingebunden

import GuildsIndex from "./pages/guilds/Index";
import GuildsRankings from "./pages/guilds/Rankings";
import GuildsStats from "./pages/guilds/Stats";

import ServersIndex from "./pages/servers/Index";
import ServersRankings from "./pages/servers/Rankings";
import ServersStats from "./pages/servers/Stats";

// Guides
import GuidesIndex from "./pages/Guides/Index";
import GuideFortress from "./pages/Guides/Fortress";
import GuideUnderworld from "./pages/Guides/Underworld";
import GuideArenaAM from "./pages/Guides/ArenaAM";
import GuideDungeons from "./pages/Guides/Dungeons";
import GuideHellevator from "./pages/Guides/Hellevator";
import GuideLegendaryDungeon from "./pages/Guides/LegendaryDungeon";
import GuideEvents from "./pages/Guides/Events";
import GuideCalculators from "./pages/Guides/Calculators";
import GuideInfographics from "./pages/Guides/Infographics";

// Community
import CommunityIndex from "./pages/Community/Index";
import CommunityScans from "./pages/Community/Scans";
import CommunityPredictions from "./pages/Community/Predictions";
import CommunityCreators from "./pages/Community/Creators";
import CommunityFeedback from "./pages/Community/Feedback";
import CommunityNews from "./pages/Community/News";

// Scans
import ScansIndex from "./pages/Scans/Index";
import ScansLatest from "./pages/Scans/Latest";
import ScansArchive from "./pages/Scans/Archive";

// GuildHub
import GuildHubIndex from "./pages/GuildHub/Index";
import GuildHubPlanner from "./pages/GuildHub/Planner";
import GuildHubFusion from "./pages/GuildHub/Fusion";
import GuildHubWaitlist from "./pages/GuildHub/Waitlist";
import GuildHubActivity from "./pages/GuildHub/Activity";
import GuildHubImports from "./pages/GuildHub/Imports";
import GuildHubAnnouncements from "./pages/GuildHub/Announcements";
import GuildHubEvents from "./pages/GuildHub/Events";
import GuildHubRoles from "./pages/GuildHub/Roles";
import GuildHubSettings from "./pages/GuildHub/Settings";

// Settings
import Settings from "./pages/Settings";

// Playground
import PlaygroundIndex from "./pages/Playground/Index";
import HUDIndex from "./pages/Playground/HUD/index";
import GameButtonsPlayground from "./pages/Playground/HUD/GameButtonsPlayground";
import ThemeMaker from "./pages/Playground/ThemeMaker";
import ListViews from "./pages/Playground/ListViews";
import RescanWidget from "./pages/Playground/RescanWidget";
import UploadSim from "./pages/Playground/UploadSim";
import ThemeMakerPro from "./pages/Playground/ThemeMakerPro";

// ---- kleine Platzhalter (falls alte Deep-Links auftauchen) ----
const P = (t: string) => () => (
  <div style={{ padding: 16 }}>
    <h2 style={{ color: "var(--title)" }}>{t}</h2>
  </div>
);
const NotFoundOld = P("Diese Unterseite existiert in der neuen Struktur nicht mehr.");

// -----------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<RootLayout />}>
          {/* Home */}
          <Route path="/" element={<Home />} />

          {/* Dashboard (Hauptpunkt unter Home; später via Auth-Guard zeigen) */}
          <Route path="/dashboard" element={<DashboardIndex />} />
          <Route path="/dashboard/kpis" element={<DashboardKPIs />} />
          <Route path="/dashboard/activity" element={<DashboardActivity />} />
          <Route path="/dashboard/progression" element={<DashboardProgression />} />

          {/* Discover */}
          <Route path="/discover" element={<Discover />} />

          {/* Players */}
          <Route path="/players" element={<PlayersIndex />} />
          <Route path="/players/rankings" element={<PlayersRankings />} />
          <Route path="/players/stats" element={<PlayersStats />} />
          <Route path="/players/profile" element={<PlayerProfile />} />
          <Route path="/players/profile/:playerId" element={<PlayerProfile />} />

          {/* Guilds */}
          <Route path="/guilds" element={<GuildsIndex />} />
          <Route path="/guilds/rankings" element={<GuildsRankings />} />
          <Route path="/guilds/stats" element={<GuildsStats />} />

          {/* Servers */}
          <Route path="/servers" element={<ServersIndex />} />
          <Route path="/servers/rankings" element={<ServersRankings />} />
          <Route path="/servers/stats" element={<ServersStats />} />

          {/* Guides */}
          <Route path="/guides" element={<GuidesIndex />} />
          <Route path="/guides/fortress" element={<GuideFortress />} />
          <Route path="/guides/underworld" element={<GuideUnderworld />} />
          <Route path="/guides/arena-am" element={<GuideArenaAM />} />
          <Route path="/guides/dungeons" element={<GuideDungeons />} />
          <Route path="/guides/hellevator" element={<GuideHellevator />} />
          <Route path="/guides/legendary-dungeon" element={<GuideLegendaryDungeon />} />
          <Route path="/guides/events" element={<GuideEvents />} />
          <Route path="/guides/calculators" element={<GuideCalculators />} />
          <Route path="/guides/infographics" element={<GuideInfographics />} />

          {/* Community */}
          <Route path="/community" element={<CommunityIndex />} />
          <Route path="/community/scans" element={<CommunityScans />} />
          <Route path="/community/predictions" element={<CommunityPredictions />} />
          <Route path="/community/creators" element={<CommunityCreators />} />
          <Route path="/community/feedback" element={<CommunityFeedback />} />
          <Route path="/community/news" element={<CommunityNews />} />

          {/* Scans */}
          <Route path="/scans" element={<ScansIndex />} />
          <Route path="/scans/latest" element={<ScansLatest />} />
          <Route path="/scans/archive" element={<ScansArchive />} />

          {/* Guild Hub (nur sichtbar, wenn eingeloggt und in Gilde – später guarden) */}
          <Route path="/guild-hub" element={<GuildHubIndex />} />
          <Route path="/guild-hub/planner" element={<GuildHubPlanner />} />
          <Route path="/guild-hub/fusion" element={<GuildHubFusion />} />
          <Route path="/guild-hub/waitlist" element={<GuildHubWaitlist />} />
          <Route path="/guild-hub/activity" element={<GuildHubActivity />} />
          <Route path="/guild-hub/imports" element={<GuildHubImports />} />
          <Route path="/guild-hub/announcements" element={<GuildHubAnnouncements />} />
          <Route path="/guild-hub/events" element={<GuildHubEvents />} />
          <Route path="/guild-hub/roles" element={<GuildHubRoles />} />
          <Route path="/guild-hub/settings" element={<GuildHubSettings />} />

          {/* Settings */}
          <Route path="/settings" element={<Settings />} />
	
{/* Playground */}
<Route path="/playground" element={<PlaygroundIndex />}>
  <Route index element={<div style={{color:'#B0C4D9'}}>Choose an item on the left.</div>} />
  <Route path="list-views" element={<ListViews />} />
  <Route path="rescan-widget" element={<RescanWidget />} />
  <Route path="upload-sim" element={<UploadSim />} />
  {/* NEU: HUD */}
  <Route path="hud" element={<HUDIndex />} />
  <Route path="hud/game-buttons" element={<GameButtonsPlayground />} />
<Route path="theme-maker" element={<ThemeMaker />} />
<Route path="theme-maker-pro" element={<ThemeMakerPro />} />
</Route>
	  {/* --- Redirects von alten Routen --- */}
          <Route path="/toplists" element={<Navigate to="/discover" replace />} />
          <Route path="/latest-scan" element={<Navigate to="/scans/latest" replace />} />
          <Route path="/old-scans" element={<Navigate to="/scans/archive" replace />} />

          {/* Alte, nicht mehr existierende Deep-Links → Hinweis */}
          <Route path="/favorites" element={<NotFoundOld />} />
          <Route path="/notifications" element={<NotFoundOld />} />
          <Route path="/guilds/planner" element={<NotFoundOld />} />
          <Route path="/guilds/fusion" element={<NotFoundOld />} />
          <Route path="/guilds/academy" element={<NotFoundOld />} />
          <Route path="/toplists/players" element={<NotFoundOld />} />
          <Route path="/toplists/guilds" element={<NotFoundOld />} />
          <Route path="/toplists/servers" element={<NotFoundOld />} />
          <Route path="/settings/profile" element={<NotFoundOld />} />
          <Route path="/settings/account" element={<NotFoundOld />} />
          <Route path="/settings/appearance" element={<NotFoundOld />} />
          <Route path="/players/search" element={<NotFoundOld />} />
          <Route path="/players/compare" element={<NotFoundOld />} />
          <Route path="/servers/list" element={<NotFoundOld />} />
          <Route path="/servers/trend" element={<NotFoundOld />} />
          <Route path="/scans/upload" element={<NotFoundOld />} />
          <Route path="/scans/history" element={<NotFoundOld />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
