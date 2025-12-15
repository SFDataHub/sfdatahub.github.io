// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";

import "./styles/index.css";
import "./i18n";

import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import RootLayout from "./layout/RootLayout";

import Home from "./pages/Home";
import LoginPage from "./pages/auth/LoginPage";

// Dashboard
import DashboardIndex from "./pages/Dashboard/Index";
import DashboardKPIs from "./pages/Dashboard/KPIs";
import DashboardActivity from "./pages/Dashboard/Activity";
import DashboardProgression from "./pages/Dashboard/Progression";

// Discover
import Discover from "./pages/Discover/Index";

// Flipbook SFM
import SFMagazineIndex from "./pages/SFMagazine";
// SF Magazin
import HistoryBookPage from "./pages/SFMagazine/HistoryBook";

import HelpPage from "./pages/Help/HelpPage";


// Toplists
import ToplistsIndex from "./pages/Toplists/index";

// Entity Hubs – Players
import PlayersIndex from "./pages/players/Index";
import PlayersRankings from "./pages/players/Rankings";
import PlayersStats from "./pages/players/Stats";
import PlayerProfile from "./pages/players/PlayerProfile";
import PlayersCompare from "./pages/players/comparePlayer";

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

// Public Profile
import PublicProfilePage from "./pages/PublicProfile/PublicProfilePage";

// Guide Hub
import GuidesIndex from "./pages/GuideHub/Index";
// SF Magazin
// Community
import CommunityIndex from "./pages/Community/Index";
import CommunityScans from "./pages/Community/Scans";
import CommunityPredictions from "./pages/Community/Predictions";
import CommunityCreators from "./pages/Community/Creators";
import CommunityFeedback from "./pages/Community/Feedback";
import CommunityNews from "./pages/Community/News";
import CommunityRecords from "./pages/Community/Records";

// Scans
import ScansIndex from "./pages/Scans/Index";
import ScansLatest from "./pages/Scans/Latest";
import ScansArchive from "./pages/Scans/Archive";

// GuildHub
import GuildHubIndex from "./pages/GuildHub/Index";
import GuildHubPlanner from "./pages/GuildHub/Planner";
import GuildHubFusionPlanner from "./pages/GuildHub/FusionPlanner/FusionPlanner";
import GuildHubCompareGuilds from "./pages/GuildHub/compareGuilds";
import GuildHubWaitlist from "./pages/GuildHub/Waitlist";
import GuildHubActivity from "./pages/GuildHub/Activity";
import GuildHubImports from "./pages/GuildHub/Imports";
import GuildHubAnnouncements from "./pages/GuildHub/Announcements";
import GuildHubEvents from "./pages/GuildHub/Events";
import GuildHubRoles from "./pages/GuildHub/Roles";
import GuildHubSettings from "./pages/GuildHub/Settings";

// Admin
import AdminIndex from "./pages/Admin/Index";
import AdminErrorLog from "./pages/Admin/ErrorLog";
import AdminScansUploaded from "./pages/Admin/ScansUploaded";
import AdminCreatorsAPI from "./pages/Admin/CreatorsAPI";
import AdminUsersAdminPage from "./pages/Admin/UsersAdminPage";

// Settings
import Settings from "./pages/Settings";
import AccountSettingsPage from "./pages/Settings/AccountSettingsPage";

// Playground
import PlaygroundIndex from "./pages/Playground/index";
import AMRuneBonusesDemos from "./pages/Playground/AMRuneBonusesDemos";
import HUDIndex from "./pages/Playground/HUD/index";
import GameButtonsPlayground from "./pages/Playground/HUD/GameButtonsPlayground";
import ThemeMaker from "./pages/Playground/ThemeMaker";
import ThemeMakerPro from "./pages/Playground/ThemeMakerPro";
import GamifiedTab from "./pages/Playground/GamifiedTab";
import GamifiedTab2 from "./pages/Playground/GamifiedTab2";
import GamifiedTab3 from "./pages/Playground/GamifiedTab3";
import ListViews from "./pages/Playground/ListViews";
import RescanWidget from "./pages/Playground/RescanWidget";
import UploadSim from "./pages/Playground/UploadSim";
import PortraitMakerDemoPage from "./pages/Playground/PortraitMakerDemo/Index";
import ContentShellTemplatePage from "./pages/Playground/Templates/ContentShellTemplatePage";
import BlankTemplatePage from "./pages/Playground/Templates/BlankTemplatePage";
import BlankTemplatePageAlt from "./pages/Playground/Templates/BlankTemplatePageAlt";
import BlankTemplatePageLayout2 from "./pages/Playground/Templates/BlankTemplatePageLayout2";
import BlankTemplatePageLayout3 from "./pages/Playground/Templates/BlankTemplatePageLayout3";
import BlankTemplatePageLayout4 from "./pages/Playground/Templates/BlankTemplatePageLayout4";

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

// Tools
import ToolsPage from "./pages/tools/ToolsPage";
import SearchResultsPage from "./pages/search/SearchResults";

/** Upload Center */
import { UploadCenterProvider } from "./components/UploadCenter/UploadCenterContext";
import UploadCenterModal from "./components/UploadCenter/UploadCenterModal";
import { UploadCenterSessionsProvider } from "./components/UploadCenter/UploadCenterSessionsContext";
import { AuthProvider } from "./context/AuthContext";
import FeatureGate from "./components/FeatureGate";
import { FeatureAccessProvider } from "./lib/featureAccessConfig";
import UploadCenterPage from "./pages/UploadCenter/Index";

const P = (t: string) => () => (
  <div style={{ padding: 16 }}>
    <h2 style={{ color: "var(--title)" }}>{t}</h2>
  </div>
);
const NotFoundOld = P("Diese Unterseite existiert in der neuen Struktur nicht mehr.");

const withFeatureGate = (
  featureId: string,
  route: string,
  element: React.ReactNode,
  fallback: React.ReactNode = <Navigate to="/" replace />,
) => (
  <FeatureGate featureId={featureId} route={route} fallback={fallback}>
    {element}
  </FeatureGate>
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <FeatureAccessProvider>
        <UploadCenterProvider>
          <UploadCenterSessionsProvider>
            <HashRouter>
              <Routes>
                <Route element={<RootLayout />}>
                {/* Home */}
                <Route
                  path="/"
                  element={withFeatureGate("main.home", "/", <Home />, <Navigate to="/login" replace />)}
                />
                <Route path="/login" element={<LoginPage />} />

                {/* Dashboard */}
                <Route
                  path="/dashboard"
                  element={withFeatureGate("main.dashboard", "/dashboard", <DashboardIndex />)}
                />
                <Route
                  path="/dashboard/kpis"
                  element={withFeatureGate("main.dashboard", "/dashboard", <DashboardKPIs />)}
                />
                <Route
                  path="/dashboard/activity"
                  element={withFeatureGate("main.dashboard", "/dashboard", <DashboardActivity />)}
                />
                <Route
                  path="/dashboard/progression"
                  element={withFeatureGate("main.dashboard", "/dashboard", <DashboardProgression />)}
                />

                {/* Discover */}
                <Route
                  path="/discover"
                  element={withFeatureGate("main.discover", "/discover", <Discover />)}
                />

                {/* Toplists */}
                <Route
                  path="/toplists"
                  element={withFeatureGate("main.toplists", "/toplists", <ToplistsIndex />)}
                />

                {/* SF Magazine */}
                <Route path="/sfmagazine" element={<SFMagazineIndex />} />
                <Route path="/sfmagazine/historybook" element={<HistoryBookPage />} />

                {/* Help (public) */}
                <Route path="/help" element={<HelpPage />} />
                <Route path="/search" element={<SearchResultsPage />} />

                {/* Players */}
                <Route path="/players" element={<PlayersIndex />} />
                <Route path="/players/rankings" element={<PlayersRankings />} />
                <Route path="/players/stats" element={<PlayersStats />} />
                <Route path="/players/profile" element={<PlayerProfile />} />
                <Route path="/players/profile/:playerId" element={<PlayerProfile />} />
                <Route path="/players/compare" element={<PlayersCompare />} />
                {/* kurze Route f?r Suche */}
                <Route path="/player/:playerId" element={<PlayerProfile />} />

                {/* Guilds */}
                <Route path="/guilds" element={<GuildsIndex />} />
                <Route path="/guilds/rankings" element={<GuildsRankings />} />
                <Route path="/guilds/stats" element={<GuildsStats />} />
                {/* ?o? Gildenprofil */}
                <Route path="/guilds/profile" element={<GuildProfile />} />
                <Route path="/guilds/profile/:guildId" element={<GuildProfile />} />
                {/* kurze Route f?r Suche */}
                <Route path="/guild/:guildId" element={<GuildProfile />} />

                {/* Servers */}
                <Route path="/servers" element={<ServersIndex />} />
                <Route path="/servers/rankings" element={<ServersRankings />} />
                <Route path="/servers/stats" element={<ServersStats />} />
                <Route path="/servers/profile" element={<ServerProfilePage />} />
                <Route path="/servers/profile/:serverId" element={<ServerProfilePage />} />
                <Route path="/server/:serverId" element={<ServerProfilePage />} />

                {/* Public Profiles */}
                <Route path="/u/:profileId" element={<PublicProfilePage />} />

                {/* Guides */}
                <Route
                  path="/guidehub/*"
                  element={withFeatureGate("main.guidehub", "/guidehub", <GuidesIndex />)}
                />

                {/* Tools */}
                <Route
                  path="/tools"
                  element={withFeatureGate("main.tools", "/tools", <ToolsPage />)}
                />

                {/* Upload Center */}
                <Route
                  path="/upload-center"
                  element={withFeatureGate("main.uploadCenter", "/upload-center", <UploadCenterPage />, <Navigate to="/login" replace />)}
                />
                <Route path="/UploadCenter" element={<Navigate to="/upload-center" replace />} />

                {/* Community */}
                <Route
                  path="/community"
                  element={withFeatureGate("main.community", "/community", <CommunityIndex />)}
                />
                <Route
                  path="/community/scans"
                  element={withFeatureGate("main.community", "/community", <CommunityScans />)}
                />
                <Route
                  path="/community/predictions"
                  element={withFeatureGate("main.community", "/community", <CommunityPredictions />)}
                />
                <Route
                  path="/community/creators"
                  element={withFeatureGate("main.community", "/community", <CommunityCreators />)}
                />
                <Route
                  path="/community/feedback"
                  element={withFeatureGate("main.community", "/community", <CommunityFeedback />)}
                />
                <Route
                  path="/community/news"
                  element={withFeatureGate("main.community", "/community", <CommunityNews />)}
                />
                <Route
                  path="/community/records"
                  element={withFeatureGate("main.community", "/community", <CommunityRecords />)}
                />

                {/* Scans */}
                <Route
                  path="/scans"
                  element={withFeatureGate("main.scans", "/scans", <ScansIndex />)}
                />
                <Route
                  path="/scans/latest"
                  element={withFeatureGate("main.scans", "/scans", <ScansLatest />)}
                />
                <Route
                  path="/scans/archive"
                  element={withFeatureGate("main.scans", "/scans", <ScansArchive />)}
                />

                {/* Guild Hub */}
                <Route
                  path="/guild-hub"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubIndex />)}
                />
                <Route
                  path="/guild-hub/planner"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubPlanner />)}
                />
                <Route
                  path="/guild-hub/fusion-planner"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubFusionPlanner />)}
                />
                <Route
                  path="/guild-hub/compare-guilds"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubCompareGuilds />)}
                />
                <Route
                  path="/guild-hub/waitlist"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubWaitlist />)}
                />
                <Route
                  path="/guild-hub/activity"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubActivity />)}
                />
                <Route
                  path="/guild-hub/imports"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubImports />)}
                />
                <Route
                  path="/guild-hub/announcements"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubAnnouncements />)}
                />
                <Route
                  path="/guild-hub/events"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubEvents />)}
                />
                <Route
                  path="/guild-hub/roles"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubRoles />)}
                />
                <Route
                  path="/guild-hub/settings"
                  element={withFeatureGate("main.guildHub", "/guild-hub", <GuildHubSettings />)}
                />

                {/* Admin */}
                <Route
                  path="/admin"
                  element={withFeatureGate("main.admin", "/admin", <AdminIndex />)}
                />
                <Route
                  path="/admin/errors"
                  element={withFeatureGate("main.admin", "/admin", <AdminErrorLog />)}
                />
                <Route
                  path="/admin/scans-uploaded"
                  element={withFeatureGate("main.admin", "/admin", <AdminScansUploaded />)}
                />
                <Route
                  path="/admin/creators-api"
                  element={withFeatureGate("main.admin", "/admin", <AdminCreatorsAPI />)}
                />
                <Route
                  path="/admin/users"
                  element={withFeatureGate("main.admin", "/admin", <AdminUsersAdminPage />)}
                />

                {/* Settings */}
                <Route
                  path="/settings"
                  element={withFeatureGate("main.settings", "/settings", <Settings />)}
                />
                <Route
                  path="/settings/account"
                  element={withFeatureGate("main.settings", "/settings", <AccountSettingsPage />)}
                />

                {/* Playground */}
                <Route
                  path="/playground"
                  element={withFeatureGate("main.playground", "/playground", <PlaygroundIndex />)}
                >
                  <Route index element={<div style={{ color: "#B0C4D9" }}>Choose an item on the left.</div>} />
                  <Route path="list-views" element={<ListViews />} />
                  <Route path="rescan-widget" element={<RescanWidget />} />
                  <Route path="upload-sim" element={<UploadSim />} />
                  <Route path="theme-maker" element={<ThemeMaker />} />
                  <Route path="theme-maker-pro" element={<ThemeMakerPro />} />
                  <Route path="gamified" element={<GamifiedTab />} />
                  <Route path="gamified-2" element={<GamifiedTab2 />} />
                  <Route path="gamified-3" element={<GamifiedTab3 />} />
                  <Route path="am-rune-bonuses-demos" element={<AMRuneBonusesDemos />} />
                  <Route path="templates/content-shell" element={<ContentShellTemplatePage />} />
                  <Route path="templates/blank" element={<BlankTemplatePage />} />
                  <Route path="templates/blank-alt" element={<BlankTemplatePageAlt />} />
                  <Route path="templates/blank-layout-2" element={<BlankTemplatePageLayout2 />} />
                  <Route path="templates/blank-layout-3" element={<BlankTemplatePageLayout3 />} />
                  <Route path="templates/blank-layout-4" element={<BlankTemplatePageLayout4 />} />
                  <Route path="portrait-maker" element={<PortraitMakerDemoPage />} />

                  {/* HUD */}
                  <Route path="hud" element={<HUDIndex />} />
                  <Route path="hud/game-buttons" element={<GameButtonsPlayground />} />
                  {/* Core UI ??" Alternativpfade */}
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

                {/* Alte, nicht mehr existierende Deep-Links ??? Hinweis */}
                <Route path="/favorites" element={NotFoundOld()} />
                <Route path="/notifications" element={NotFoundOld()} />
                <Route path="/guilds/planner" element={NotFoundOld()} />
                <Route path="/guilds/fusion" element={NotFoundOld()} />
                <Route path="/guilds/academy" element={NotFoundOld()} />
                <Route path="/toplists/players" element={NotFoundOld()} />
                <Route path="/toplists/guilds" element={NotFoundOld()} />
                <Route path="/toplists/servers" element={NotFoundOld()} />
                <Route path="/settings/profile" element={NotFoundOld()} />
                <Route path="/settings/appearance" element={NotFoundOld()} />
                <Route path="/players/search" element={NotFoundOld()} />
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
        </UploadCenterSessionsProvider>
      </UploadCenterProvider>
    </FeatureAccessProvider>
    </AuthProvider>
  </React.StrictMode>
);
