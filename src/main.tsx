// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/index.css";
import "./i18n";

import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import RootLayout from "./layout/RootLayout";

import Home from "./pages/Home";

// Dashboard
import DashboardIndex from "./pages/Dashboard/Index";
import DashboardKPIs from "./pages/Dashboard/KPIs";
import DashboardActivity from "./pages/Dashboard/Activity";
import DashboardProgression from "./pages/Dashboard/Progression";

// Discover
import Discover from "./pages/Discover/Index";

// Toplists
import ToplistsIndex from "./pages/Toplists/index";

// Entity Hubs – Players
import PlayersIndex from "./pages/players/Index";
import PlayersRankings from "./pages/players/Rankings";
import PlayersStats from "./pages/players/Stats";
import PlayerProfile from "./pages/players/PlayerProfile";

// Entity Hubs – Guilds
import GuildsIndex from "./pages/guilds/Index";
import GuildsRankings from "./pages/guilds/Rankings";
import GuildsStats from "./pages/guilds/Stats";
import GuildProfile from "./pages/guilds/Profile"; // ✨ NEU

// Entity Hubs – Servers
import ServersIndex from "./pages/servers/Index";
import ServersRankings from "./pages/servers/Rankings";
import ServersStats from "./pages/servers/Stats";
import ServerProfilePage from "./pages/servers/Profile"; // ✨ NEU

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
import PlaygroundIndex from "./pages/Playground/index";
import HUDIndex from "./pages/Playground/HUD/index";
import GameButtonsPlayground from "./pages/Playground/HUD/GameButtonsPlayground";
import ThemeMaker from "./pages/Playground/ThemeMaker";
import ThemeMakerPro from "./pages/Playground/ThemeMakerPro";
import ListViews from "./pages/Playground/ListViews";
import RescanWidget from "./pages/Playground/RescanWidget";
import UploadSim from "./pages/Playground/UploadSim";

import HARImportPage from "./pages/Playground/Import/HARImportPage";
import JSONCSVImportPage from "./pages/Playground/Import/JSONCSVImportPage";
import IndexSchemaViewerPage from "./pages/Playground/Import/IndexSchemaViewerPage";

import PlayerProfileContainedPage from "./pages/Playground/Hubs/PlayerProfileContainedPage";
import GuildHubPage from "./pages/Playground/Hubs/GuildHubPage";
import ServerHubPage from "./pages/Playground/Hubs/ServerHubPage";

import RankingsViewsPage from "./pages/Playground/Rankings/RankingsViewsPage";
import KPIDashboardPage from "./pages/Playground/Analytics/KPIDashboardPage";
import ProgressionTrackerPage from "./pages/Playground/Analytics/ProgressionTrackerPage";
import LegendaryPetsPage from "./pages/Playground/Analytics/LegendaryPetsPage";

import CommunityScansPage from "./pages/Playground/Community/CommunityScansPage";
import CreatorHubPage from "./pages/Playground/Community/CreatorHubPage";

import FeedbackFormPage from "./pages/Playground/Feedback/FeedbackFormPage";
import FeedbackAdminPage from "./pages/Playground/Feedback/FeedbackAdminPage";

import TutorialsPage from "./pages/Playground/Help/TutorialsPage";
import WikiFAQPage from "./pages/Playground/Help/WikiFAQPage";

import SettingsPage from "./pages/Playground/Settings/SettingsPage";

import ToSPrivacyPage from "./pages/Playground/Legal/ToSPrivacyPage";
import TransparencyViewerPage from "./pages/Playground/Legal/TransparencyViewerPage";

import PWAUpdateFlowPage from "./pages/Playground/PWA/PWAUpdateFlowPage";
import PWAInstallPromptPage from "./pages/Playground/PWA/InstallPromptPage";

import ConnectManualPage from "./pages/Playground/Connect/ConnectManualPage";
import ConnectUserscriptPage from "./pages/Playground/Connect/ConnectUserscriptPage";

import ExportsPage from "./pages/Playground/Interop/ExportsPage";
import DeeplinksDemoPage from "./pages/Playground/Interop/DeeplinksDemoPage";

import ServersEditorPage from "./pages/Playground/Admin/ServersEditorPage";
import JobsQueuesPage from "./pages/Playground/Admin/JobsQueuesPage";
import FeatureFlagsPage from "./pages/Playground/Admin/FeatureFlagsPage";

import TablePerformanceLabPage from "./pages/Playground/Performance/TablePerformanceLabPage";
import MobileBottomSheetFiltersPage from "./pages/Playground/Mobile/MobileBottomSheetFiltersPage";
import A11yPassPage from "./pages/Playground/QA/A11yPassPage";

/** Upload Center */
import { UploadCenterProvider } from "./components/UploadCenter/UploadCenterContext";
import UploadCenterModal from "./components/UploadCenter/UploadCenterModal";

const P = (t: string) => () => (
  <div style={{ padding: 16 }}>
    <h2 style={{ color: "var(--title)" }}>{t}</h2>
  </div>
);
const NotFoundOld = P("Diese Unterseite existiert in der neuen Struktur nicht mehr.");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <UploadCenterProvider role="admin">
      <HashRouter>
        <Routes>
          <Route element={<RootLayout />}>
            {/* Home */}
            <Route path="/" element={<Home />} />

            {/* Dashboard */}
            <Route path="/dashboard" element={<DashboardIndex />} />
            <Route path="/dashboard/kpis" element={<DashboardKPIs />} />
            <Route path="/dashboard/activity" element={<DashboardActivity />} />
            <Route path="/dashboard/progression" element={<DashboardProgression />} />

            {/* Discover */}
            <Route path="/discover" element={<Discover />} />

            {/* Toplists */}
            <Route path="/toplists" element={<ToplistsIndex />} />

            {/* Players */}
            <Route path="/players" element={<PlayersIndex />} />
            <Route path="/players/rankings" element={<PlayersRankings />} />
            <Route path="/players/stats" element={<PlayersStats />} />
            <Route path="/players/profile" element={<PlayerProfile />} />
            <Route path="/players/profile/:playerId" element={<PlayerProfile />} />
            {/* kurze Route für Suche */}
            <Route path="/player/:playerId" element={<PlayerProfile />} />

            {/* Guilds */}
            <Route path="/guilds" element={<GuildsIndex />} />
            <Route path="/guilds/rankings" element={<GuildsRankings />} />
            <Route path="/guilds/stats" element={<GuildsStats />} />
            {/* ✨ Gildenprofil */}
            <Route path="/guilds/profile" element={<GuildProfile />} />
            <Route path="/guilds/profile/:guildId" element={<GuildProfile />} />
            {/* kurze Route für Suche */}
            <Route path="/guild/:guildId" element={<GuildProfile />} />

            {/* Servers */}
            <Route path="/servers" element={<ServersIndex />} />
            <Route path="/servers/rankings" element={<ServersRankings />} />
            <Route path="/servers/stats" element={<ServersStats />} />
            <Route path="/servers/profile" element={<ServerProfilePage />} />               {/* ✨ */}
            <Route path="/servers/profile/:serverId" element={<ServerProfilePage />} />     {/* ✨ */}
            <Route path="/server/:serverId" element={<ServerProfilePage />} />              {/* ✨ Kurzlink */}

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

            {/* Guild Hub */}
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
              <Route index element={<div style={{ color: "#B0C4D9" }}>Choose an item on the left.</div>} />
              <Route path="list-views" element={<ListViews />} />
              <Route path="rescan-widget" element={<RescanWidget />} />
              <Route path="upload-sim" element={<UploadSim />} />
              <Route path="theme-maker" element={<ThemeMaker />} />
              <Route path="theme-maker-pro" element={<ThemeMakerPro />} />
              {/* HUD */}
              <Route path="hud" element={<HUDIndex />} />
              <Route path="hud/game-buttons" element={<GameButtonsPlayground />} />
              {/* Core UI – Alternativpfade */}
              <Route path="core-ui/theme-maker" element={<ThemeMaker />} />
              <Route path="core-ui/theme-maker-pro" element={<ThemeMakerPro />} />
              <Route path="core-ui/list-views" element={<ListViews />} />
              {/* Sync & Upload */}
              <Route path="sync/rescan" element={<RescanWidget />} />
              <Route path="upload/sim" element={<UploadSim />} />
              {/* Data Import & Schema */}
              <Route path="import/har" element={<HARImportPage />} />
              <Route path="import/json-csv" element={<JSONCSVImportPage />} />
              <Route path="import/schema" element={<IndexSchemaViewerPage />} />
              {/* Hubs & Profile */}
              <Route path="hubs/player-contained" element={<PlayerProfileContainedPage />} />
              <Route path="hubs/guilds" element={<GuildHubPage />} />
              <Route path="hubs/servers" element={<ServerHubPage />} />
              {/* Rankings & KPIs */}
              <Route path="rankings/views" element={<RankingsViewsPage />} />
              <Route path="analytics/kpi" element={<KPIDashboardPage />} />
              <Route path="analytics/progression" element={<ProgressionTrackerPage />} />
              <Route path="analytics/legendary-pets" element={<LegendaryPetsPage />} />
              {/* Community & Feedback */}
              <Route path="community/scans" element={<CommunityScansPage />} />
              <Route path="community/creators" element={<CreatorHubPage />} />
              <Route path="feedback/form" element={<FeedbackFormPage />} />
              <Route path="feedback/admin" element={<FeedbackAdminPage />} />
              {/* Help, Settings & Legal */}
              <Route path="help/tutorials" element={<TutorialsPage />} />
              <Route path="help/wiki" element={<WikiFAQPage />} />
              <Route path="legal/tos" element={<ToSPrivacyPage />} />
              <Route path="legal/transparency" element={<TransparencyViewerPage />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* PWA, Connect & Export */}
              <Route path="pwa/update" element={<PWAUpdateFlowPage />} />
              <Route path="pwa/install" element={<PWAInstallPromptPage />} />
              <Route path="connect/manual" element={<ConnectManualPage />} />
              <Route path="connect/userscript" element={<ConnectUserscriptPage />} />
              <Route path="interop/exports" element={<ExportsPage />} />
              <Route path="interop/deeplinks" element={<DeeplinksDemoPage />} />
              {/* Admin, Performance & Mobile */}
              <Route path="admin/servers" element={<ServersEditorPage />} />
              <Route path="admin/jobs" element={<JobsQueuesPage />} />
              <Route path="admin/flags" element={<FeatureFlagsPage />} />
              <Route path="perf/table-lab" element={<TablePerformanceLabPage />} />
              <Route path="mobile/filters" element={<MobileBottomSheetFiltersPage />} />
              <Route path="qa/a11y" element={<A11yPassPage />} />
            </Route>

            {/* Redirects alte Routen */}
            <Route path="/latest-scan" element={<Navigate to="/scans/latest" replace />} />
            <Route path="/old-scans" element={<Navigate to="/scans/archive" replace />} />

            {/* Alte, nicht mehr existierende Deep-Links → Hinweis */}
            <Route path="/favorites" element={NotFoundOld()} />
            <Route path="/notifications" element={NotFoundOld()} />
            <Route path="/guilds/planner" element={NotFoundOld()} />
            <Route path="/guilds/fusion" element={NotFoundOld()} />
            <Route path="/guilds/academy" element={NotFoundOld()} />
            <Route path="/toplists/players" element={NotFoundOld()} />
            <Route path="/toplists/guilds" element={NotFoundOld()} />
            <Route path="/toplists/servers" element={NotFoundOld()} />
            <Route path="/settings/profile" element={NotFoundOld()} />
            <Route path="/settings/account" element={NotFoundOld()} />
            <Route path="/settings/appearance" element={NotFoundOld()} />
            <Route path="/players/search" element={NotFoundOld()} />
            <Route path="/players/compare" element={NotFoundOld()} />
            <Route path="/servers/list" element={NotFoundOld()} />
            <Route path="/servers/trend" element={NotFoundOld()} />
            <Route path="/scans/upload" element={NotFoundOld()} />
            <Route path="/scans/history" element={NotFoundOld()} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>

      {/* Modal am Root */}
      <UploadCenterModal />
    </UploadCenterProvider>
  </React.StrictMode>
);
