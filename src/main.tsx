// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/base.css'
import './i18n'
import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

// Seiten (neue Struktur mit Unterordnern)
import Home from './pages/home/Home'
import Dashboard from './pages/dashboard/Dashboard'

import TopLists from './pages/toplists/TopLists'

import Guilds from './pages/guilds/Guilds'
import Guild from './pages/guilds/Guild'

import Settings from './pages/settings/Settings'

import Players from './pages/players/Players'
import Player from './pages/players/Player'
import PlayerProfile from './pages/players/PlayerProfile'

import Servers from './pages/servers/Servers'

import Scans from './pages/scans/Scans'
import LatestScan from './pages/scans/LatestScan'
import OldScans from './pages/scans/OldScans'

import Community from './pages/community/Community'
import Favorites from './pages/favorites/Favorites'
import Notifications from './pages/notifications/Notifications'

// ---- sehr kleine Platzhalter für Unterseiten (kannst du später ersetzen) ----
const P = (t: string) => () => (
  <div style={{ padding: 16 }}>
    <h2 style={{ color: 'var(--title)' }}>{t}</h2>
  </div>
)
const GuildPlanner   = P('Guilds / Planner')
const GuildFusion    = P('Guilds / Fusion')
const GuildAcademy   = P('Guilds / Academy')

const TopPlayers     = P('Toplisten / Players')
const TopGuilds      = P('Toplisten / Guilds')
const TopServers     = P('Toplisten / Servers')

const SettingsProfile     = P('Settings / Profile')
const SettingsAccount     = P('Settings / Account')
const SettingsAppearance  = P('Settings / Appearance')

const PlayerSearch   = P('Spieler / Suche')
const PlayerCompare  = P('Spieler / Vergleich')

const ServerList     = P('Server / Liste')
const ServerTrend    = P('Server / Trends')

const ScansUpload    = P('Scans / Upload')
const ScansHistory   = P('Scans / Historie')
// -----------------------------------------------------------------------------

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

          {/* ---- Unterseiten (kein Redirect mehr auf "/") ---- */}
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
          <Route path="/players/search"   element={<PlayerSearch   />} />
          <Route path="/players/compare"  element={<PlayerCompare  />} />
          <Route path="/players/profile"  element={<PlayerProfile  />} />     {/* NEU: native, ohne iframe */}
          <Route path="/players/profile/:playerId" element={<PlayerProfile />} /> {/* optional mit ID */}

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
