import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home, LayoutDashboard, Compass, MessagesSquare,
  Settings as SettingsIco, Shield, FolderSearch, BookOpen,
  ChevronRight, Pin, PinOff
} from "lucide-react";
import styles from "./Sidebar.module.css";
import SubmenuPortal from "./SubmenuPortal";

/* ---------------- Daten ---------------- */
type Item = { to: string; label: string; icon: React.ReactNode; end?: boolean };
type SubItem = { to: string; label: string };

const main: Item[] = [
  { to: "/",          label: "Home",      icon: <Home className="ico" />, end: true },
  { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="ico" /> },
];

const categories: Item[] = [
  { to: "/discover",  label: "Discover",  icon: <Compass className="ico" /> },
  { to: "/guides",    label: "Guides",    icon: <BookOpen className="ico" /> },
  { to: "/community", label: "Community", icon: <MessagesSquare className="ico" /> },
  { to: "/scans",     label: "Scans",     icon: <FolderSearch className="ico" /> },
  { to: "/settings",  label: "Settings",  icon: <SettingsIco className="ico" /> },
  { to: "/guild-hub", label: "Guild Hub", icon: <Shield className="ico" /> },
];

const SUBTABS: Record<string, SubItem[]> = {
  "/discover": [
    { to: "/players",            label: "Players" },
    { to: "/players/profile",    label: "Player Profile" },
    { to: "/guilds",             label: "Guilds" },
    { to: "/servers",            label: "Servers" },
    { to: "/scans",              label: "Scans" },
    { to: "/discover/favorites", label: "Favorites" },
  ],
  "/settings": [
    { to: "/settings/profile",    label: "Profile" },
    { to: "/settings/account",    label: "Account" },
    { to: "/settings/appearance", label: "Appearance" },
  ],
};

/* ---------------- Hover-Hilfe ---------------- */
const CLOSE_MENU_DELAY = 220;
function useDelayedHover(delay = CLOSE_MENU_DELAY) {
  const [open, setOpen] = React.useState(false);
  const t = React.useRef<number | null>(null);
  const clear = React.useCallback(() => {
    if (t.current) { window.clearTimeout(t.current); t.current = null; }
  }, []);
  const onEnter = React.useCallback(() => { clear(); setOpen(true); }, [clear]);
  const onLeave = React.useCallback(() => {
    clear(); t.current = window.setTimeout(() => setOpen(false), delay);
  }, [clear, delay]);
  React.useEffect(() => () => clear(), [clear]);
  return { open, onEnter, onLeave, setOpen };
}

/* ---------------- Ein Kategorie-Item mit Portal-Submenu ---------------- */
function CategoryItem({
  it, collapsed, allowSubmenus,
}: {
  it: Item;
  collapsed: boolean;
  allowSubmenus: boolean;
}) {
  const hasSub = (SUBTABS[it.to]?.length ?? 0) > 0;
  const { open, onEnter, onLeave, setOpen } = useDelayedHover();
  const rowRef = React.useRef<HTMLDivElement | null>(null);

  // Erste Phase: Sidebar expandiert → erst dann Submenu „armed“
  const handleEnter = React.useCallback(() => {
    if (!allowSubmenus || !hasSub) { setOpen(false); return; }
    onEnter();
  }, [allowSubmenus, hasSub, onEnter, setOpen]);

  const renderLink = React.useCallback(
    (s: { to: string; label: string }) => (
      <NavLink
        key={s.to}
        to={s.to}
        className={({ isActive }) =>
          // Submenu-Styles stammen aus Portal-CSS, nicht Sidebar.module.css
          `${"link"} ${isActive ? "linkActive" : ""}`
        }
      >
        {s.label}
      </NavLink>
    ),
    []
  );

  return (
    <div
      ref={rowRef}
      className={`${styles.navItemWrap} ${open ? styles.isOpen : ""}`}
      onMouseEnter={handleEnter}
      onMouseLeave={onLeave}
    >
      <NavLink
        to={it.to}
        end={!!it.end}
        className={({ isActive }) =>
          `${styles.navBtn} ${isActive ? styles.navBtnActive : ""}`
        }
      >
        {it.icon}
        <span className={styles.label}>{it.label}</span>
        {hasSub && !collapsed && (
          <span className={styles.trailing} aria-hidden="true">
            <ChevronRight className="ico" />
          </span>
        )}
      </NavLink>

      {/* Portal-Submenu (überlappt immer Content) */}
      {hasSub && (
        <SubmenuPortal
          anchorEl={rowRef.current}
          open={open}
          items={SUBTABS[it.to]}
          renderLink={(s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                `${"link"} ${isActive ? "linkActive" : ""}`
              }
            >
              {s.label}
            </NavLink>
          )}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        />
      )}
    </div>
  );
}

/* ---------------- Block ---------------- */
function Block({
  title, items, collapsed, allowSubmenus,
}: {
  title?: string;
  items: Item[];
  collapsed: boolean;
  allowSubmenus: boolean;
}) {
  return (
    <>
      {title && <div className={`${styles.navTitle} ${styles.segTitle}`}>{title}</div>}
      <div className={styles.navCol}>
        {items.map((it) =>
          SUBTABS[it.to] ? (
            <CategoryItem key={it.to} it={it} collapsed={collapsed} allowSubmenus={allowSubmenus} />
          ) : (
            <NavLink
              key={it.to}
              to={it.to}
              end={!!it.end}
              className={({ isActive }) =>
                `${styles.navBtn} ${isActive ? styles.navBtnActive : ""}`
              }
            >
              {it.icon}
              <span className={styles.label}>{it.label}</span>
            </NavLink>
          )
        )}
      </div>
    </>
  );
}

/* ---------------- Sidebar (Hover-Expand + Pin) ---------------- */
const HOVER_OPEN_DELAY = 90;
const HOVER_CLOSE_DELAY = 180;

export default function Sidebar({
  expanded,
  setExpanded,
  pinned,
  setPinned,
  hoverToExpand = true,
}: {
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  pinned: boolean;
  setPinned: (v: boolean) => void;
  hoverToExpand?: boolean;
}) {
  const openTimer = React.useRef<number | null>(null);
  const closeTimer = React.useRef<number | null>(null);
  const [submenuArmed, setSubmenuArmed] = React.useState<boolean>(false);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current)  { window.clearTimeout(openTimer.current);  openTimer.current  = null; }
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);

  const handleEnter = React.useCallback(() => {
    if (!hoverToExpand || pinned) return;
    clearTimers();
    setSubmenuArmed(false); // erster Hover: nur Sidebar öffnen
    openTimer.current = window.setTimeout(() => setExpanded(true), HOVER_OPEN_DELAY);
  }, [hoverToExpand, pinned, clearTimers, setExpanded]);

  const handleLeave = React.useCallback(() => {
    if (!hoverToExpand || pinned) return;
    clearTimers();
    closeTimer.current = window.setTimeout(() => {
      setExpanded(false);
      setSubmenuArmed(false);
    }, HOVER_CLOSE_DELAY);
  }, [hoverToExpand, pinned, clearTimers, setExpanded]);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  React.useEffect(() => {
    if (pinned) setSubmenuArmed(true);
  }, [pinned]);

  const onTransitionEnd: React.TransitionEventHandler<HTMLElement> = (e) => {
    if (e.propertyName === "width") {
      if (expanded && !pinned) setSubmenuArmed(true);
    }
  };

  // Fallback, falls transitionend nicht feuert
  React.useEffect(() => {
    if (expanded && !pinned) {
      const id = window.setTimeout(() => setSubmenuArmed(true), 250);
      return () => window.clearTimeout(id);
    }
  }, [expanded, pinned]);

  const collapsed = !expanded;
  const allowSubmenus = pinned || (expanded && submenuArmed);

  return (
    <aside
      id="sidebar-root"
      className={`${styles.root} ${expanded ? styles.expanded : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onTransitionEnd={onTransitionEnd}
      aria-label="Navigation"
    >
      <div className={styles.headRow}>
        <div className={styles.headTitle}>
          <span className={styles.headDot} /> <span className={styles.headLabel}>Navigation</span>
        </div>
        <button
          className={styles.pinBtn}
          aria-pressed={pinned}
          title={pinned ? "Unpin" : "Pin"}
          onClick={() => setPinned(!pinned)}
          type="button"
        >
          {pinned ? <Pin className="ico" /> : <PinOff className="ico" />}
        </button>
      </div>

      <div className={styles.navScroll}>
        <div className={styles.pad}>
          <div className={styles.segCard}>
            <Block items={main} collapsed={collapsed} allowSubmenus={allowSubmenus} />
          </div>

          <div className={styles.segTitle}>Kategorien</div>
          <div className={styles.segCard}>
            <Block items={categories} collapsed={collapsed} allowSubmenus={allowSubmenus} />
          </div>
        </div>
      </div>

      <div className={`${styles.footer} ${styles.segCard}`}>
        <button className={styles.login} type="button">
          <Shield className="ico" />
          <span className={styles.label}>Logout</span>
        </button>
        <div className={styles.legal}>
          © 2025 SFDataHub — Alle Marken- und Bildrechte bei den jeweiligen Inhabern.
        </div>
      </div>
    </aside>
  );
}
