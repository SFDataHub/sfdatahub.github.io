import { useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { HubFavorite } from "../../lib/data-hub/hubFavoritesContract";
import LocalGuildFavorites from "./LocalGuildFavorites";
import styles from "./LocalFavoritesMenu.module.css";

export type PageAction = { label: string; run: (favorite: HubFavorite) => void | Promise<void>; showBelowCard?: boolean; toplistServers?: readonly string[] };
export type FavoritePlayerAction = { label: string; available: boolean; run: (favorite: HubFavorite, allowed: () => boolean) => Promise<boolean> };
const MenuContext = React.createContext<{ open: boolean; toggle: (trigger: HTMLElement) => void }>({ open: false, toggle: () => {} });
export const useLocalFavoritesMenu = () => React.useContext(MenuContext);
const ActionsContext = React.createContext<(action: PageAction) => () => void>(() => () => {});
const PlayerActionsContext = React.createContext<(action: FavoritePlayerAction) => () => void>(() => () => {});

export function useLocalFavoritePlayerAction(action: FavoritePlayerAction | undefined) {
  const register = React.useContext(PlayerActionsContext);
  React.useLayoutEffect(() => action ? register(action) : undefined, [register, action]);
}

/** Action belongs to the mounted recipient page, never to a global selection. */
export function useLocalFavoritePageAction(label: string, run: PageAction["run"], options?: Pick<PageAction, "showBelowCard" | "toplistServers">) {
  const register = React.useContext(ActionsContext);
  React.useLayoutEffect(() => register({ label, run, showBelowCard: options?.showBelowCard, toplistServers: options?.toplistServers }), [register, label, run, options?.showBelowCard, options?.toplistServers]);
}

export default function LocalFavoritesMenu({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation(), location = useLocation();
  const [open, setOpen] = React.useState(false), [action, setAction] = React.useState<PageAction>();
  const [present, setPresent] = React.useState(false), [entered, setEntered] = React.useState(false);
  const [playerAction, setPlayerAction] = React.useState<FavoritePlayerAction>();
  const registerPlayer = React.useCallback((next: FavoritePlayerAction) => {
    setPlayerAction(next);
    return () => setPlayerAction(current => current === next ? undefined : current);
  }, []);
  useAnalyticsView(open ? "datahub/favorites/open" : null);
  const trigger = React.useRef<HTMLElement | null>(null), panel = React.useRef<HTMLDivElement>(null);
  const register = React.useCallback((next: PageAction) => {
    setAction(next);
    return () => setAction(current => current === next ? undefined : current);
  }, []);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback((element: HTMLElement) => { trigger.current = element; setOpen(value => !value); }, []);
  React.useEffect(close, [location.key, close]);
  React.useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      setPresent(true);
      if (reduced) { setEntered(true); return; }
      // Commit the offscreen end position before starting the transition.
      let second = 0;
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setEntered(true)); });
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    }
    setEntered(false);
    if (!present) return;
    if (reduced) { setPresent(false); return; }
    // transitionend normally releases the dialog; this covers interrupted CSS.
    const timer = window.setTimeout(() => setPresent(false), 240);
    return () => window.clearTimeout(timer);
  }, [open, present]);
  useFocusTrap(panel, present, { preventInitialScroll: true });
  React.useEffect(() => {
    if (!present) return;
    const unlockScroll = lockBodyScroll();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); close(); } };
    window.addEventListener("keydown", escape);
    return () => { unlockScroll(); window.removeEventListener("keydown", escape); trigger.current?.focus({ preventScroll: true }); };
  }, [present, close]);
  return <MenuContext.Provider value={{ open, toggle }}><ActionsContext.Provider value={register}><PlayerActionsContext.Provider value={registerPlayer}>
    {children}
    {present && createPortal(<div className={styles.backdrop} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={panel} id="local-favorites-dialog" className={`${styles.panel} ${open && entered ? styles.entered : ""}`} role="dialog" aria-modal="true" aria-labelledby="local-favorites-title"
        onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "transform" && !open) setPresent(false); }}>
        <header className={styles.header}><h2 id="local-favorites-title">{t("hubNavigation.favoritesMenu")}</h2>
          <button type="button" onClick={close}>{t("hubNavigation.close")}</button></header>
        <LocalGuildFavorites onOpen={close} action={action} playerAction={playerAction} active={open} manageable />
      </div>
    </div>, document.body)}
  </PlayerActionsContext.Provider></ActionsContext.Provider></MenuContext.Provider>;
}
