import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/base.css'
import './i18n'
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import TopLists from './pages/TopLists'
import Guilds from './pages/Guilds'
import Settings from './pages/Settings'
import Players from './pages/Players'
import Player from './pages/Player'
import Guild from './pages/Guild'
import Servers from './pages/Servers'
import Scans from './pages/Scans'
import Community from './pages/Community'
import LatestScan from './pages/LatestScan'
import OldScans from './pages/OldScans'
import Favorites from './pages/Favorites'
import Notifications from './pages/Notifications'

/** ---- sehr kleine Platzhalter für Unterseiten ---- **/
const P = (t:string)=>()=><div style={{padding:16}}><h2 style={{color:'var(--title)'}}>{t}</h2></div>;
const GuildPlanner   = P('Guilds / Planner');
const GuildFusion    = P('Guilds / Fusion');
const GuildAcademy   = P('Guilds / Academy');

const TopPlayers     = P('Toplisten / Players');
const TopGuilds      = P('Toplisten / Guilds');
const TopServers     = P('Toplisten / Servers');

const SettingsProfile     = P('Settings / Profile');
const SettingsAccount     = P('Settings / Account');
const SettingsAppearance  = P('Settings / Appearance');

const PlayerSearch   = P('Spieler / Suche');
const PlayerCompare  = P('Spieler / Vergleich');

const ServerList     = P('Server / Liste');
const ServerTrend    = P('Server / Trends');

const ScansUpload    = P('Scans / Upload');
const ScansHistory   = P('Scans / Historie');
/** -------------------------------------------------- **/

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Haupt */}
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Hauptsektionen */}
          <Route path="/toplists" element={<TopLists />} />
          <Route path="/guilds"   element={<Guilds   />} />
          <Route path="/settings" element={<Settings />} />

          {/* Direkt */}
          <Route path="/players" element={<Players />} />
          <Route path="/player"  element={<Player  />} />
          <Route path="/guild"   element={<Guild   />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/scans"   element={<Scans   />} />
          <Route path="/community" element={<Community />} />

          {/* Bestehend */}
          <Route path="/latest-scan" element={<LatestScan />} />
          <Route path="/old-scans"  element={<OldScans  />} />
          <Route path="/favorites"  element={<Favorites />} />
          <Route path="/notifications" element={<Notifications />} />

          {/* ---- Unterseiten damit kein Redirect auf "/" mehr passiert ---- */}
          {/* Guilds */}
          <Route path="/guilds/planner" element={<GuildPlanner />} />
          <Route path="/guilds/fusion"  element={<GuildFusion  />} />
          <Route path="/guilds/academy" element={<GuildAcademy />} />

          {/* Toplists */}
          <Route path="/toplists/players" element={<TopPlayers />} />
          <Route path="/toplists/guilds"  element={<TopGuilds  />} />
          <Route path="/toplists/servers" element={<TopServers />} />

          {/* Settings */}
          <Route path="/settings/profile"    element={<SettingsProfile    />} />
          <Route path="/settings/account"    element={<SettingsAccount    />} />
          <Route path="/settings/appearance" element={<SettingsAppearance />} />

          {/* Players */}
          <Route path="/players/search"  element={<PlayerSearch  />} />
          <Route path="/players/compare" element={<PlayerCompare />} />

          {/* Servers */}
          <Route path="/servers/list"   element={<ServerList  />} />
          <Route path="/servers/trend"  element={<ServerTrend />} />

          {/* Scans */}
          <Route path="/scans/upload"  element={<ScansUpload  />} />
          <Route path="/scans/history" element={<ScansHistory />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
