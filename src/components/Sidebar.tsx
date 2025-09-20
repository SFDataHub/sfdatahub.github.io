import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, LayoutDashboard, ListOrdered, Users, Settings as SettingsIco,
  User, Shield, Server, ScanLine, MessagesSquare, LogOut
} from "lucide-react";

type Item = { to: string; label: string; icon: React.ReactNode; end?: boolean };

const main: Item[] = [
  { to: "/",          label: "Home",      icon: <Home className="ico" />, end: true },
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="ico" /> },
];

const primary: Item[] = [
  { to: "/toplists", label: "Toplisten", icon: <ListOrdered className="ico" /> },
  { to: "/guilds",   label: "Gilden",    icon: <Users className="ico" /> },
  { to: "/settings", label: "Settings",  icon: <SettingsIco className="ico" /> },
];

const direct: Item[] = [
  { to: "/players",  label: "Spieler",  icon: <User className="ico" /> },
  { to: "/guild",    label: "Gilde",    icon: <Shield className="ico" /> },
  { to: "/servers",  label: "Server",   icon: <Server className="ico" /> },
  { to: "/toplists", label: "Toplisten",icon: <ListOrdered className="ico" /> },
  { to: "/scans",    label: "Scans",    icon: <ScanLine className="ico" /> },
];

type ActiveMeta = {
  title: string;
  icon: React.ReactNode;
  subtabs: { to: string; label: string }[];
};

function useActiveMeta(): ActiveMeta | null {
  const { pathname, hash } = useLocation();
  const p = (hash?.startsWith("#") ? hash.slice(1) : pathname) || "/";

  if (p.startsWith("/guilds") || p.startsWith("/guild")) {
    return {
      title: "Guilds",
      icon: <Shield className="ico" />,
      subtabs: [
        { to: "/guilds/planner", label: "Planner" },
        { to: "/guilds/fusion",  label: "Fusion" },
        { to: "/guilds/academy", label: "Academy" },
      ],
    };
  }
  if (p.startsWith("/toplists")) {
    return {
      title: "Toplisten",
      icon: <ListOrdered className="ico" />,
      subtabs: [
        { to: "/toplists/players", label: "Players" },
        { to: "/toplists/guilds",  label: "Guilds"  },
        { to: "/toplists/servers", label: "Server"  },
      ],
    };
  }
  if (p.startsWith("/settings")) {
    return {
      title: "Settings",
      icon: <SettingsIco className="ico" />,
      subtabs: [
        { to: "/settings/profile",     label: "Profile" },
        { to: "/settings/account",     label: "Account" },
        { to: "/settings/appearance",  label: "Appearance" },
      ],
    };
  }
  if (p.startsWith("/players")) {
    return {
      title: "Spieler",
      icon: <User className="ico" />,
      subtabs: [
        { to: "/players/search",  label: "Suche" },
        { to: "/players/compare", label: "Vergleich" },
      ],
    };
  }
  if (p.startsWith("/servers")) {
    return {
      title: "Server",
      icon: <Server className="ico" />,
      subtabs: [
        { to: "/servers/list",  label: "Liste" },
        { to: "/servers/trend", label: "Trends" },
      ],
    };
  }
  if (p.startsWith("/scans")) {
    return {
      title: "Scans",
      icon: <ScanLine className="ico" />,
      subtabs: [
        { to: "/scans/upload",  label: "Upload" },
        { to: "/scans/history", label: "Historie" },
      ],
    };
  }
  return null;
}

function Block({ title, items, noActive = false }: { title?: string; items: Item[]; noActive?: boolean }) {
  return (
    <>
      {title && <div className="nav-title">{title}</div>}
      <div className="nav-col">
        {items.map(it => (
          <NavLink
            key={it.to}
            to={it.to}
            end={!!it.end}
            className={({ isActive }) =>
              "nav-btn" + (isActive && !noActive ? " active" : "")
            }
          >
            {it.icon}
            <span className="label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </>
  );
}

export default function Sidebar() {
  const active = useActiveMeta();

  return (
    <>
      <div className="logo-fill" />
      <aside className="sidebar">
        <div className="nav-scroll">
          <div className="pad">
            {/* Sektion 1: Home & Dashboard */}
            <Block items={main} />

            {/* Sektion 2: Active tab */}
            {active && (
              <div className="active-block">
                <div className="nav-title">active tab</div>
                <div className="active-head">
                  {active.icon}
                  <span className="label" style={{ fontWeight: 700 }}>{active.title}</span>
                </div>
                <div className="subcol">
                  {active.subtabs.map(s => (
                    <NavLink key={s.to} to={s.to} className="nav-btn">
                      <span className="label">{s.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )}

            {/* Sektion 3: Hauptsektionen (ohne aktives Highlight unten) */}
            <Block title="Hauptsektionen" items={primary} noActive />

            {/* Sektion 4: Direkt (ohne aktives Highlight unten) */}
            <Block title="Direkt" items={direct} noActive />
          </div>
        </div>

        <div className="footer">
          <button className="btn login">
            <LogOut className="ico" />
            <span className="label">Logout</span>
          </button>
          <div className="legal muted only-expanded">
            © 2025 SFDataHub — Alle Marken- und Bildrechte bei den jeweiligen Inhabern.
          </div>
        </div>
      </aside>
    </>
  );
}
