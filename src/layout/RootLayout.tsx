import React, { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "lucide-react";
import Topbar from "../components/Topbar/Topbar";
import Sidebar from "../components/Sidebar/Sidebar";
import LogoDock from "../components/LogoDock/LogoDock";
import sidebarStyles from "../components/Sidebar/Sidebar.module.css";
import { useAuth } from "../context/AuthContext";
import LoginModalHost from "../components/auth/LoginModalHost";

const SURFACE_STYLE = { borderColor: "#2B4C73", background: "#1A2F4A" };
const AUTH_NEXT_STORAGE_KEY = "sfh:authNext";

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
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileNavOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobileNavOpen || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (!isMobileNavOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  // Eine Variable für ALLES links: Sidebar + Hintergrund + Content-Offset
  const leftVar = useMemo(
    () => (isMobile ? "0px" : (isOpen ? "var(--sidebar-expanded-w)" : "var(--sidebar-w)")),
    [isMobile, isOpen]
  );

  const aboutParagraphs = t("footer.about.body").split("\n\n");
  const visibleLegalLinks: Array<{ key: string; to: string; label: string }> = [];
  const openNavLabel = t("nav.open", { defaultValue: "Open navigation" });
  const sidebarState = isMobile ? "collapsed" : (isOpen ? "expanded" : "collapsed");

  return (
    <div id="app-shell" data-sidebar={sidebarState} style={{ ["--left" as any]: leftVar }}>
      <LogoDock src="/logo.png" />
      <Topbar />

      {/* linker Hintergrundstreifen in Sidebar-Farbe */}
      <div className="logo-fill" />

      {!isMobile ? (
        <Sidebar
          expanded={isOpen}
          setExpanded={setExpanded}
          pinned={pinned}
          setPinned={setPinned}
          hoverToExpand={!pinned}
        />
      ) : (
        !isMobileNavOpen && (
          <div className={`${sidebarStyles.headRow} ${sidebarStyles.mobileTrigger}`}>
            <button
              className={sidebarStyles.pinBtn}
              type="button"
              aria-label={openNavLabel}
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen(true)}
            >
              <Menu className="ico" />
            </button>
          </div>
        )
      )}

      {isMobile && isMobileNavOpen ? (
        <div
          className={sidebarStyles.mobileOverlay}
          role="presentation"
          onClick={() => setIsMobileNavOpen(false)}
        >
          <div className={sidebarStyles.mobileDrawer} onClick={(event) => event.stopPropagation()}>
            <Sidebar
              expanded={true}
              setExpanded={setExpanded}
              pinned={pinned}
              setPinned={setPinned}
              hoverToExpand={false}
              variant="drawer"
              onNavigate={() => setIsMobileNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Content rechts neben der (eingeklappten/ausgeklappten) Sidebar */}
      <div className="content">
        <div className="content-inner">
          <div className="content-body">
            <Outlet />
            <LoginModalHost />
            <div className="mt-4 px-4 md:px-6">
              <div className="rounded-2xl border px-4 py-4" style={SURFACE_STYLE}>
                <div className="text-sm font-semibold" style={{ color: "#F5F9FF" }}>
                  {t("footer.about.title")}
                </div>
                <div className="mt-2 space-y-2 text-[13px]" style={{ color: "#B0C4D9" }}>
                  {aboutParagraphs.map((paragraph, idx) => (
                    <p key={`footer-about-${idx}`} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
                <div className="mt-4 space-y-2 text-[12px]" style={{ color: "#B0C4D9" }}>
                  <div>{t("footer.copyright", { defaultValue: "© 2025 SFDataHub – community project around Shakes & Fidget." })}</div>
                  <div>{t("footer.shortDisclaimer", { defaultValue: "SFDataHub is an unofficial, non-commercial fan project. All trademarks and images belong to their respective owners." })}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[13px]" style={{ color: "#9EC7FF" }}>
                  {visibleLegalLinks.map((link) => (
                    <Link key={link.key} to={link.to} className="underline hover:no-underline">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
