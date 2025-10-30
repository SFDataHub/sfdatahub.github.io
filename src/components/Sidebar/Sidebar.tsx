import React from "react";
import { NavLink } from "react-router-dom";
import {
  Home, LayoutDashboard, Compass, MessagesSquare,
  Settings as SettingsIco, Shield, FolderSearch, BookOpen,
  ChevronRight, Pin, PinOff, Aperture, Trophy
} from "lucide-react";
import styles from "./Sidebar.module.css";
import SubmenuPortal from "./SubmenuPortal";

/* ---------------- Daten ---------------- */
/* ---------------- Daten ---------------- */
type SubItem = { to: string; label: string };

type Item = {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}; // 👈 sauber geschlossen, KEIN submenu hier nötig
// main
const main: Item[] = [
  { to: "/",           label: "Home",      icon: <Home className="ico" />, end: true },
  { to: "/dashboard",  label: "Dashboard", icon: <LayoutDashboard className="ico" /> },
  { to: "/guild-hub",  label: "Guild Hub", icon: <Shield className="ico" /> },
  { to: "/playground", label: "Playground", icon: <Aperture className="ico" /> }, // <- ohne "/"
];


const categories: Item[] = [
  { to: "/discover",  label: "Discover",  icon: <Compass className="ico" /> },
  { to: "/toplists",  label: "Toplists",  icon: <Trophy className="ico" /> },
  { to: "/guidehub",    label: "Guide Hub",    icon: <BookOpen className="ico" /> },
  { to: "/community", label: "Community", icon: <MessagesSquare className="ico" /> },
  { to: "/scans",     label: "Scans",     icon: <FolderSearch className="ico" /> },
  { to: "/settings",  label: "Settings",  icon: <SettingsIco className="ico" /> },
];

 const SUBTABS: Record<string, SubItem[]> = {
  "/discover": [
    { to: "/players",            label: "Players" },
    { to: "/sfmagazine",         label: "SFMagazine" },
    { to: "/sfmagazine/historybook",         label: "History Book" },
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
   "/playground": [
    { to: "/playground/list-views",       label: "List Views" },
    { to: "/playground/rescan-widget",    label: "Rescan Widget" },
    { to: "/playground/upload-sim",       label: "Upload Simulator" },
    { to: "/playground/hud/game-buttons", label: "HUD · Game Buttons" },
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

/* ---------------- Hilfs-Renderer: animiertes Label (Typewriter, ohne Cursor) ---------------- */
function AnimatedLabel({
  text,
  isOpen,
  duration = 1,  // per-char flip duration (ms)
  step = 45,     // typing speed between chars (ms)
}: {
  text: string;
  isOpen: boolean;
  duration?: number;
  step?: number;
}) {
  const chars = React.useMemo(() => Array.from(text), [text]);

  return (
    <span className={styles.label}>
      <span
        className={styles.labelText}
        data-open={isOpen ? "true" : "false"}
        aria-label={text}
        role="text"
        style={
          {
            "--duration": `${duration}ms`,
            "--step": `${step}ms`,
            "--count": chars.length,
          } as React.CSSProperties
        }
      >
        {chars.map((ch, i) => (
          <span
            key={`${text}-${i}`}
            className={styles.char}
            style={{ ["--i" as any]: i }}
            aria-hidden="true"
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </span>
    </span>
  );
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

  const handleEnter = React.useCallback(() => {
    if (!allowSubmenus || !hasSub) { setOpen(false); return; }
    onEnter();
  }, [allowSubmenus, hasSub, onEnter, setOpen]);

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
        <AnimatedLabel text={it.label} isOpen={!collapsed} />
        {hasSub && !collapsed && (
          <span className={styles.trailing} aria-hidden="true">
            <ChevronRight className="ico" />
          </span>
        )}
      </NavLink>

      {hasSub && (
        <SubmenuPortal
          anchorEl={rowRef.current}
          open={open}
          items={SUBTABS[it.to]}
          renderLink={(s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) => `${"link"} ${isActive ? "linkActive" : ""}`}
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
              <AnimatedLabel text={it.label} isOpen={!collapsed} />
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
    setSubmenuArmed(false);
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
          {/* Main */}
          <div className={`${styles.segCard} ${styles.mainNavCard}`}>
            <Block items={main} collapsed={collapsed} allowSubmenus={allowSubmenus} />
          </div>

          <div className={styles.segTitle}>Kategorien</div>

          {/* Kategorien */}
          <div className={`${styles.segCard} ${styles.mainNavCard}`}>
            <Block items={categories} collapsed={collapsed} allowSubmenus={allowSubmenus} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={`${styles.footer} ${styles.segCard} ${styles.mainNavCard}`}>
        <button className={styles.login} type="button">
          <Shield className="ico" />
          <AnimatedLabel text="Logout" isOpen={!collapsed} />
        </button>
        <div className={styles.legal}>
          © 2025 SFDataHub — Alle Marken- und Bildrechte bei den jeweiligen Inhabern.
        </div>
      </div>
    </aside>
  );
}
