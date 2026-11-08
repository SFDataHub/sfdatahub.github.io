import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import LocalFavoritesMenu from "../components/data-hub/LocalFavoritesMenu";
import Topbar from "../components/Topbar/Topbar";
import Sidebar from "../components/Sidebar/Sidebar";
import LogoDock from "../components/LogoDock/LogoDock";
import sidebarStyles from "../components/Sidebar/Sidebar.module.css";
import { useAuth } from "../context/AuthContext";
import { useNavigationMode } from "../lib/settings/usePreferences";
import LoginModalHost from "../components/auth/LoginModalHost";
import { lockBodyScroll } from "../lib/bodyScrollLock";
import Footer from "../components/Footer/Footer";
import { toAnalyticsPath, trackPageNavigation } from "../lib/analytics/pageViews";

const AUTH_NEXT_STORAGE_KEY = "sfh:authNext";
const SIDEBAR_MOBILE_MEDIA_QUERY = "(max-width: 1024px)";

const isSafeNextPath = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.toLowerCase().startsWith("/login")) return null;
  return trimmed;
};

export default function RootLayout() {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(SIDEBAR_MOBILE_MEDIA_QUERY).matches;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const navigationMode = useNavigationMode();
  const usesBurger = isMobile || navigationMode === "burger";
  const loginRequested = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isOpen = pinned || expanded;
  const { t } = useTranslation();
  const { status: authStatus, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authStatus !== "authenticated" || !user) return;

    const readStoredNext = () => {
      if (typeof window === "undefined" || !window.sessionStorage) return null;
      try {
        return window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
      } catch (error) {
        console.warn("[AuthNext] Failed to read auth next from sessionStorage", error);
        return null;
      }
    };

    const clearStoredNext = () => {
      if (typeof window === "undefined" || !window.sessionStorage) return;
      try {
        window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
      } catch (error) {
        console.warn("[AuthNext] Failed to clear auth next from sessionStorage", error);
      }
    };

    const nextPath = isSafeNextPath(readStoredNext());
    if (!nextPath) {
      clearStoredNext();
      return;
    }

    clearStoredNext();
    const currentPath = `${location.pathname}${location.search || ""}`;
    if (currentPath === nextPath) return;

    navigate(nextPath, { replace: true });
  }, [authStatus, user, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    trackPageNavigation(toAnalyticsPath(location.pathname, location.search, location.hash), location.key);
  }, [location.pathname, location.search, location.hash, location.key]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(SIDEBAR_MOBILE_MEDIA_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [usesBurger, navigationMode, isMobile]);

  useLayoutEffect(() => {
    if (!usesBurger || !isMobileNavOpen) return;
    if (!isMobile) {
      // Desktop navigation shares the page; let the original click finish first.
      const closeOutside = (event: MouseEvent) => {
        if (!(event.target instanceof Element) || event.target.closest(
          '#sidebar-root, button[aria-controls="sidebar-root"], [data-navigation-submenu]'
        )) return;
        setIsMobileNavOpen(false);
      };
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
        event.preventDefault();
        setIsMobileNavOpen(false);
        if ((document.activeElement as HTMLElement | null)?.closest('#sidebar-root, [data-navigation-submenu]')) {
          triggerRef.current?.focus({ preventScroll: true });
        }
      };
      document.addEventListener("click", closeOutside);
      window.addEventListener("keydown", closeOnEscape);
      return () => {
        document.removeEventListener("click", closeOutside);
        window.removeEventListener("keydown", closeOnEscape);
      };
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const unlockScroll = lockBodyScroll();
    // Include the toggle and portalled submenus in the navigation keyboard scope.
    const focusable = () => Array.from(document.querySelectorAll<HTMLElement>(
      'button[aria-controls="sidebar-root"], #sidebar-root a[href], #sidebar-root button, [data-navigation-submenu] a[href]'
    )).filter(element => !element.hasAttribute("disabled") && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
    const background = Array.from(document.querySelectorAll<HTMLElement>("#app-shell > .content, #app-shell > header, #app-shell > .logo-dock"));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    let focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setIsMobileNavOpen(false);
      } else if (event.key === "Tab") {
        const items = focusable();
        const index = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        if (items.length) items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true });
      }
    };
    const keepFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#sidebar-root, button[aria-controls="sidebar-root"]') && !target.closest("[data-navigation-submenu]")) focusable()[0]?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", keepFocus);
      unlockScroll();
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      const target = previousFocus?.isConnected && !previousFocus.closest("#sidebar-root")
        ? previousFocus : triggerRef.current ?? document.querySelector<HTMLElement>("#sidebar-root a[href]");
      if (!loginRequested.current) target?.focus({ preventScroll: true });
    };
  }, [usesBurger, isMobileNavOpen, isMobile]);

  useLayoutEffect(() => {
    const closeForLogin = () => {
      loginRequested.current = true;
      setIsMobileNavOpen(false);
    };
    window.addEventListener("sfh:openLoginModal", closeForLogin);
    return () => window.removeEventListener("sfh:openLoginModal", closeForLogin);
  }, []);

  // Eine Variable für ALLES links: Sidebar + Hintergrund + Content-Offset
  const leftVar = useMemo(
    () => (usesBurger ? (isMobileNavOpen && !isMobile ? "var(--sidebar-expanded-w)" : "0px") : (isOpen ? "var(--sidebar-expanded-w)" : "var(--sidebar-w)")),
    [usesBurger, isMobileNavOpen, isMobile, isOpen]
  );

  // Body portals (scan management) inherit the same effective outer shell offset.
  useLayoutEffect(() => {
    const previous = document.body.style.getPropertyValue("--app-shell-left");
    document.body.style.setProperty("--app-shell-left", leftVar);
    return () => {
      if (previous) document.body.style.setProperty("--app-shell-left", previous);
      else document.body.style.removeProperty("--app-shell-left");
    };
  }, [leftVar]);

  const openNavLabel = t("nav.open", { defaultValue: "Open navigation" });
  const sidebarState = (usesBurger ? isMobileNavOpen : isOpen) ? "expanded" : "collapsed";

  return (
    <LocalFavoritesMenu><div id="app-shell" data-navigation={usesBurger ? "burger" : "sidebar"} data-sidebar={sidebarState} style={{ ["--left" as any]: leftVar, ["--app-shell-left" as any]: leftVar }}>
      <LogoDock src="/logo.png" />
      <Topbar />

      {/* The existing sidebar is shared by both saved navigation modes. */}
      <div className="logo-fill" style={usesBurger ? { width: 0 } : undefined} />
      <Sidebar
        expanded={usesBurger || isOpen}
        setExpanded={setExpanded}
        pinned={pinned}
        setPinned={setPinned}
        hoverToExpand={!usesBurger && !pinned}
        variant={usesBurger ? "burger" : "default"}
        visible={!usesBurger || isMobileNavOpen}
        onNavigate={usesBurger ? () => setIsMobileNavOpen(false) : undefined}
      />
      {usesBurger && (
        <div className={`${sidebarStyles.headRow} ${sidebarStyles.mobileTrigger}`}>
          <button
            className={sidebarStyles.pinBtn}
            type="button"
            ref={triggerRef}
            aria-controls="sidebar-root"
            aria-label={openNavLabel}
            aria-expanded={isMobileNavOpen}
            onClick={() => {
              loginRequested.current = false;
              setIsMobileNavOpen(open => !open);
            }}
          >
            <Menu className="ico" />
          </button>
        </div>
      )}
      {isMobile && isMobileNavOpen && (
        <div className={sidebarStyles.navigationOutside} role="presentation"
          onClick={() => setIsMobileNavOpen(false)} />
      )}

      {/* Content rechts neben der (eingeklappten/ausgeklappten) Sidebar */}
      <div className="content">
        <div className="content-inner">
          <div className="content-body">
            <Outlet />
            <LoginModalHost />
            <Footer />
          </div>
        </div>
      </div>
    </div></LocalFavoritesMenu>
  );
}
