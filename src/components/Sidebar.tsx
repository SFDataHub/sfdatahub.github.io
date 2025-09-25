import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home, LayoutDashboard, ListOrdered, Users, Settings as SettingsIco,
  User, Shield, Server, ScanLine, MessagesSquare, LogOut, ChevronRight
} from "lucide-react";

/** ---------------------------------------------------------------------------
 * Sidebar – gewünschtes Verhalten:
 * - Untermenü öffnet beim Hover über das **gesamte Item**; verzögertes Schließen
 * - **Pfeile ausblenden**, wenn die Sidebar **eingeklappt** ist
 * - Icons + Text **linksbündig nur wenn offen** (eingeklappt: Icons zentriert, Label versteckt)
 * - Untermenü **überlappt** den Inhalt (kein Clipping)
 * - Nav-Config bleibt inline
 * --------------------------------------------------------------------------*/

type Item = { to: string; label: string; icon: React.ReactNode; end?: boolean };

/* 1) Oben: Home & Dashboard */
const main: Item[] = [
  { to: "/",          label: "Home",      icon: <Home className="ico" />, end: true },
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="ico" /> },
];

/* 2) Unten: Alle Hauptkategorien IN EINEM BLOCK (inkl. Community) */
const categories: Item[] = [
  { to: "/players",   label: "Spieler",    icon: <User className="ico" /> },
  { to: "/guilds",    label: "Gilden",     icon: <Users className="ico" /> },
  { to: "/guild",     label: "Gilde",      icon: <Shield className="ico" /> },
  { to: "/servers",   label: "Server",     icon: <Server className="ico" /> },
  { to: "/toplists",  label: "Toplisten",  icon: <ListOrdered className="ico" /> },
  { to: "/scans",     label: "Scans",      icon: <ScanLine className="ico" /> },
  { to: "/community", label: "Community",  icon: <MessagesSquare className="ico" /> },
  { to: "/settings",  label: "Settings",   icon: <SettingsIco className="ico" /> },
];

/* 3) Unterseiten (aus deiner Meta-Logik) */
const SUBTABS: Record<string, { to: string; label: string }[]> = {
  "/guilds": [
    { to: "/guilds/planner", label: "Planner" },
    { to: "/guilds/fusion",  label: "Fusion" },
    { to: "/guilds/academy", label: "Academy" },
  ],
  "/toplists": [
    { to: "/toplists/players", label: "Players" },
    { to: "/toplists/guilds",  label: "Guilds"  },
    { to: "/toplists/servers", label: "Server"  },
  ],
  "/settings": [
    { to: "/settings/profile",     label: "Profile" },
    { to: "/settings/account",     label: "Account" },
    { to: "/settings/appearance",  label: "Appearance" },
  ],
  "/players": [
    { to: "/players/search",   label: "Suche" },
    { to: "/players/compare",  label: "Vergleich" },
    { to: "/players/profile",  label: "Profil" },
  ],
  "/servers": [
    { to: "/servers/list",  label: "Liste" },
    { to: "/servers/trend", label: "Trends" },
  ],
  "/scans": [
    { to: "/scans/upload",  label: "Upload" },
    { to: "/scans/history", label: "Historie" },
  ],
  // "/community": [] // später
};

/* Hover-Delay für komfortables Rüberfahren ins Panel */
const CLOSE_DELAY = 220;
function useDelayedHover(delay = CLOSE_DELAY) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  const clear = React.useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onEnter = React.useCallback(() => {
    clear();
    setOpen(true);
  }, [clear]);

  const onLeave = React.useCallback(() => {
    clear();
    timer.current = window.setTimeout(() => setOpen(false), delay);
  }, [clear, delay]);

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  return { open, onEnter, onLeave, toggle };
}

/* ------------------------------ UI-Bausteine ------------------------------ */

function SubmenuPanel({
  children,
  onEnter,
  onLeave,
}: {
  children: React.ReactNode;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      className="submenu-panel"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ zIndex: 4000 }} // über Content
    >
      {/* Hover-Bridge: verhindert Lücke zwischen Item & Panel */}
      <span className="hover-bridge" />
      <div className="submenu-col">{children}</div>
    </div>
  );
}

function CategoryItem({ it, hideArrow }: { it: Item; hideArrow: boolean }) {
  const hasSub = SUBTABS[it.to]?.length > 0;
  const { onEnter, onLeave, toggle } = useDelayedHover();

  return (
    <div className="nav-item-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <NavLink to={it.to} end={!!it.end} className="nav-btn">
        {it.icon}
        <span className="label">{it.label}</span>
      </NavLink>

      {hasSub && (
        <div className="arrow-wrap">
          {!hideArrow && (
            <button
              className="arrow-btn"
              aria-haspopup="true"
              aria-expanded={false}
              title="Unterseiten anzeigen"
              onClick={toggle} // Touch-Fallback
            >
              <ChevronRight className="ico" />
            </button>
          )}

          <SubmenuPanel onEnter={onEnter} onLeave={onLeave}>
            {SUBTABS[it.to].map((s) => (
              <NavLink key={s.to} to={s.to} className="submenu-link">
                <span className="label">{s.label}</span>
              </NavLink>
            ))}
          </SubmenuPanel>
        </div>
      )}
    </div>
  );
}

/* Standard-Block (Liste von Links), optional „boxed“ dargestellt */
function Block({
  title,
  items,
  boxed = false,
  withSubmenus = false,
  hideArrows = false,
}: {
  title?: string;
  items: Item[];
  boxed?: boolean;
  withSubmenus?: boolean;
  hideArrows?: boolean;
}) {
  const content = (
    <>
      {title && <div className="nav-title seg-title">{title}</div>}
      <div className="nav-col">
        {items.map((it) =>
          withSubmenus ? (
            <CategoryItem key={it.to} it={it} hideArrow={hideArrows} />
          ) : (
            <NavLink key={it.to} to={it.to} end={!!it.end} className="nav-btn">
              {it.icon}
              <span className="label">{it.label}</span>
            </NavLink>
          )
        )}
      </div>
    </>
  );

  return boxed ? <div className="seg-card">{content}</div> : content;
}

/* -------------------------------- Sidebar --------------------------------- */

export default function Sidebar() {
  const asideRef = React.useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  // Erkenne "eingeklappt" automatisch über Breite → setzt data-collapsed
  React.useLayoutEffect(() => {
    const el = asideRef.current;
    if (!el) return;

    const THRESHOLD = 72; // px – passend zu deiner collapsed-Breite (~64px)
    const update = () => {
      const isCollapsed = el.clientWidth <= THRESHOLD;
      el.dataset.collapsed = isCollapsed ? "true" : "false";
      setCollapsed(isCollapsed);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div className="logo-fill" />
      <aside
        ref={asideRef as any}
        className="sidebar"
        // kein Clipping; Panel soll Content überlappen
        style={{ position: "relative", overflow: "visible", zIndex: 30 }}
      >
        <div className="nav-scroll" style={{ overflow: "visible" }}>
          <div className="pad">
            {/* 1) Home & Dashboard */}
            <Block items={main} boxed />

            {/* 2) KEIN Active-Tab-Block mehr */}

            {/* 3) Hauptkategorien mit Hover-Untermenüs */}
            <Block
              title="Kategorien"
              items={categories}
              boxed
              withSubmenus
              hideArrows={collapsed} // Pfeile ausblenden, wenn eingeklappt
            />
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

/* ---------- Inline-Ministyles (auf deine Sektionen abgestimmt) ---------- */
const styles = `
/* Sidebar/Container dürfen Popouts NICHT beschneiden */
.sidebar { overflow: visible; }
.nav-scroll, .seg-card, .nav-col { overflow: visible; }

/* Sektionen-Karten */
.seg-card {
  background: #0e1b2c;
  border: 1px solid #1e3554;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 10px;
  box-shadow: 0 0 0 1px rgba(12,28,46,0.2) inset;
}

/* Titel */
.seg-title {
  color: #9ab2cc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 4px 6px 8px;
}

/* Hauptliste */
.nav-col { display: flex; flex-direction: column; gap: 6px; }

/* Item-Wrapper (für Hover-Zone + Arrow) */
.nav-item-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Hauptlink – Basis */
.nav-col .nav-btn {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-radius: 12px;
  color: #b0c4d9; text-decoration: none;
  transition: background .16s ease, color .16s ease, justify-content .16s;
}
.nav-col .nav-btn:hover { background: #1a2f4a; color: #fff; }

/* Links-/Zentrier-Ausrichtung je nach Sidebar-Zustand */
.sidebar[data-collapsed="false"] .nav-col .nav-btn { justify-content: flex-start; }
.sidebar[data-collapsed="true"]  .nav-col .nav-btn { justify-content: center;  }
.sidebar[data-collapsed="true"]  .nav-col .nav-btn .label { display: none; }

/* Icons */
.ico { width: 18px; height: 18px; }

/* Arrow-Bereich + Button */
.arrow-wrap { position: relative; margin-left: auto; }
.arrow-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border-radius: 8px; border: 1px solid #1e3554;
  background: #0e1b2c; color: #9ab2cc;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.arrow-btn:hover { background:#1a2f4a; color:#fff; border-color:#2b4c73; }

/* >>> Pfeile ausblenden, wenn eingeklappt */
.sidebar[data-collapsed="true"] .arrow-wrap { display: none; }

/* Submenü-Panel (überlappt Content) */
.submenu-panel {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 8px;
  width: 224px;
  padding: 8px;
  background: #0a1728;
  border: 1px solid #2c4a73;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0,0,0,.35);
  z-index: 4000; /* über allem */
  opacity: 0; visibility: hidden;
  transform: translateY(2px);
  transition: opacity .15s ease, visibility .15s ease, transform .15s ease;
}
/* Sichtbar, wenn der Wrapper gehovert wird (Delay handled per JS) */
.nav-item-wrap:hover > .arrow-wrap > .submenu-panel {
  opacity: 1; visibility: visible; transform: translateY(0);
}

/* Hover-Bridge zwischen Item und Panel */
.hover-bridge { position: absolute; left: -8px; top: 0; width: 8px; height: 100%; }

/* Submenu-Inhalt + Hover-Style wie Hauptsektion */
.submenu-col { display: flex; flex-direction: column; gap: 6px; }
.submenu-link {
  display: block; padding: 9px 10px; border-radius: 12px;
  color: #b0c4d9; text-decoration: none;
  transition: background .16s ease, color .16s ease;
}
.submenu-link:hover  { background: #1a2f4a; color: #fff; }
.submenu-link.active { background: #25456b; color: #fff; font-weight: 600; }

/* Footer */
.sidebar .footer { margin: 10px; }
.btn.login {
  display: flex; align-items: center; gap: 8px;
  width: 100%; justify-content: center;
  background: #152a42; color: #fff; border: 1px solid #1e3554;
  padding: 10px; border-radius: 10px;
  transition: background .16s ease;
}
.btn.login:hover { background: #1a2f4a; }
`;

// einmalig injizieren (falls du keine separate CSS-Datei nutzt)
if (typeof document !== "undefined") {
  const id = "sidebar-inline-styles";
  if (!document.getElementById(id)) {
    const tag = document.createElement("style");
    tag.id = id;
    tag.innerHTML = styles;
    document.head.appendChild(tag);
  }
}
