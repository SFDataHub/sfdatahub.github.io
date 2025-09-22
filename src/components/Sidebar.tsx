import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, LayoutDashboard, ListOrdered, Users, Settings as SettingsIco,
  User, Shield, Server, ScanLine, MessagesSquare, LogOut
} from "lucide-react";

type Item = { to: string; label: string; icon: React.ReactNode; end?: boolean };

/* 1) Oben: Home & Dashboard */
const main: Item[] = [
  { to: "/",          label: "Home",      icon: <Home className="ico" />, end: true },
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="ico" /> },
];

/* 3) Unten: Alle Hauptkategorien IN EINEM BLOCK (zusammengeführt, inkl. Community) */
const categories: Item[] = [
  { to: "/players",   label: "Spieler",    icon: <User className="ico" /> },
  { to: "/guilds",    label: "Gilden",     icon: <Users className="ico" /> },
  { to: "/guild",     label: "Gilde",      icon: <Shield className="ico" /> },
  { to: "/servers",   label: "Server",     icon: <Server className="ico" /> },
  { to: "/toplists",  label: "Toplisten",  icon: <ListOrdered className="ico" /> },
  { to: "/scans",     label: "Scans",      icon: <ScanLine className="ico" /> },
  { to: "/community", label: "Community",  icon: <MessagesSquare className="ico" /> }, // ✅ hinzugefügt
  { to: "/settings",  label: "Settings",   icon: <SettingsIco className="ico" /> },
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
        { to: "/players/search",   label: "Suche" },
        { to: "/players/compare",  label: "Vergleich" },
        { to: "/players/profile",  label: "Profil" }, // ✅ Profil-Unterpunkt bleibt
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
  if (p.startsWith("/community")) {
    return {
      title: "Community",
      icon: <MessagesSquare className="ico" />,
      subtabs: [], // aktuell keine Unterseiten – kann später erweitert werden
    };
  }
  return null;
}

/* Standard-Block (Liste von Links), optional „boxed“ dargestellt */
function Block({
  title,
  items,
  noActive = false,
  boxed = false,
}: {
  title?: string;
  items: Item[];
  noActive?: boolean;
  boxed?: boolean;
}) {
  const content = (
    <>
      {title && <div className="nav-title seg-title">{title}</div>}
      <div className="nav-col">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={!!it.end}
            className={({ isActive }) => "nav-btn" + (isActive && !noActive ? " active" : "")}
          >
            {it.icon}
            <span className="label">{it.label}</span>
          </NavLink>
        ))}
      </div>
    </>
  );

  return boxed ? <div className="seg-card">{content}</div> : content;
}

export default function Sidebar() {
  const active = useActiveMeta();

  return (
    <>
      <div className="logo-fill" />
      <aside className="sidebar">
        <div className="nav-scroll">
          <div className="pad">
            {/* 1) Home & Dashboard */}
            <Block items={main} boxed />

            {/* 2) Active tab */}
            {active && (
              <div className="active-block seg-card">
                <div className="nav-title seg-title">Active tab</div>
                <div className="active-head">
                  {active.icon}
                  <span className="label" style={{ fontWeight: 700 }}>{active.title}</span>
                </div>
                <div className="subcol">
                  {active.subtabs.map((s) => (
                    <NavLink
                      key={s.to}
                      to={s.to}
                      className={({ isActive }) => "nav-btn" + (isActive ? " active" : "")}
                    >
                      <span className="label">{s.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )}

            {/* 3) Alle Hauptkategorien (ein Block) */}
            <Block title="Kategorien" items={categories} noActive boxed />
          </div>
        </div>

        <div className="footer seg-card">
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

/* ---------- Inline-Ministyles für die Sektionen-Kästchen ----------
   Wenn deine base.css alles abdeckt, kannst du das hier entfernen oder anpassen. */
const styles = `
.sidebar .pad { padding: 12px; }

/* Sektionen-Karten */
.seg-card {
  background: #0e1b2c;
  border: 1px solid #1e3554;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
  box-shadow: 0 0 0 1px rgba(12,28,46,0.2) inset;
}

/* Titel in Sektionen */
.seg-title {
  color: #9ab2cc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 4px 6px 8px;
}

/* Active-head im "Active tab"-Block */
.active-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #11243a;
  color: #fff;
  margin-bottom: 6px;
}

/* Unterliste im Active-Block */
.subcol .nav-btn {
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  color: #9ab2cc;
  text-decoration: none;
}
.subcol .nav-btn:hover { background: #11243a; color: #fff; }
.subcol .nav-btn.active { background: #2d4e78; color: #fff; }

/* Fallbacks, falls nicht in base.css vorhanden */
.nav-col .nav-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  color: #b0c4d9; text-decoration: none;
}
.nav-col .nav-btn:hover { background: #11243a; color: #fff; }
.nav-col .nav-btn.active { background: #152a42; color: #fff; }

.sidebar .footer { margin: 10px; }
.btn.login {
  display: flex; align-items: center; gap: 8px;
  width: 100%; justify-content: center;
  background: #152a42; color: #fff; border: 1px solid #1e3554;
  padding: 10px; border-radius: 10px;
}
.btn.login:hover { background: #1a2f4a; }
.ico { width: 18px; height: 18px; }
`;
if (typeof document !== "undefined") {
  const id = "sidebar-sections-inline";
  if (!document.getElementById(id)) {
    const tag = document.createElement("style");
    tag.id = id;
    tag.innerHTML = styles;
    document.head.appendChild(tag);
  }
}
