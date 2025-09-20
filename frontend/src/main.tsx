import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
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
          <Route path="/guilds" element={<Guilds />} />
          <Route path="/settings" element={<Settings />} />

          {/* Direkt */}
          <Route path="/players" element={<Players />} />
          <Route path="/player" element={<Player />} />
          <Route path="/guild" element={<Guild />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/community" element={<Community />} />

          {/* bestehende Bereiche */}
          <Route path="/latest-scan" element={<LatestScan />} />
          <Route path="/old-scans" element={<OldScans />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/notifications" element={<Notifications />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
