import React from "react";
import Frame from "../ContentFrame/Frame";

type CSS = React.CSSProperties;

type Props = {
  hex?: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  subheader?: React.ReactNode;

  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;  // CENTER (Liste)

  rounded?: string;
  padded?: boolean;
  centerFramed?: boolean;           // zusätzlicher Rahmen um Center
  leftWidth?: number | string;      // 0 = keine linke Spalte
  rightWidth?: number | string;     // 0 = keine rechte Spalte
  stickyRails?: boolean;

  mode?: "page" | "card";
  outerPadding?: string;
  leftPlacement?: "inside" | "bleed";

  // Sticky-Verhalten innerhalb der Shell
  stickyTopbar?: boolean;           // default: true
  stickySubheader?: boolean;        // default: true
  // Höhe der globalen Topbar, die abgezogen wird (via CSS-Variable)
  shellViewportOffset?: string;     // default: 'var(--app-topbar-h,72px)'
  // Effektive Shell-Topbar-Höhe (für Subheader-Offset)
  topbarHeight?: number;            // default: 56
};

const SURFACE: CSS = { borderColor: "#2B4C73", background: "#1A2F4A" };
const RAIL: CSS    = { borderColor: "#2B4C73", background: "#152A42" };

export default function ContentShell({
  hex,
  title,
  subtitle,
  actions,
  subheader,
  left,
  right,
  children,

  rounded = "rounded-3xl",
  padded = true,
  centerFramed = false,
  leftWidth = 0,
  rightWidth = 0,
  stickyRails = true,

  mode = "card",
  outerPadding = "px-4 py-3",
  leftPlacement = "inside",

  stickyTopbar = true,
  stickySubheader = true,
  shellViewportOffset = "var(--app-topbar-h,72px)",
  topbarHeight = 56,
}: Props) {
  // Grid-Variablen
  const cssVars: CSS = {
    // @ts-ignore
    "--left": typeof leftWidth === "number" ? `${leftWidth}px` : leftWidth,
    // @ts-ignore
    "--right": typeof rightWidth === "number" ? `${rightWidth}px` : rightWidth,
  };

  // Shell-Viewport: volle Höhe abzüglich globaler Topbar
  const shellHeight = `calc(100vh - ${shellViewportOffset})`;

  // ---------- Top (fix/sticky) ----------
  const TopArea = (
    <>
      {hex && (
        <div className="mb-3 rounded-2xl border px-4 py-2" style={SURFACE}>
          {hex}
        </div>
      )}

      {(title || subtitle || actions) && (
        <div
          className={[
            stickyTopbar ? "sticky top-0 z-30" : "",
            "mb-3 flex items-center justify-between rounded-2xl border px-5 py-3",
          ].join(" ")}
          style={SURFACE}
        >
          <div className="min-w-0">
            {title && <div className="truncate text-sm font-semibold" style={{ color: "#F5F9FF" }}>{title}</div>}
            {subtitle && <div className="truncate text-[11px]" style={{ color: "#B0C4D9" }}>{subtitle}</div>}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}

      {subheader && (
        <div
          className={[
            stickySubheader ? "sticky z-20" : "",
            "mb-3 rounded-2xl border px-4 py-3",
          ].join(" ")}
          style={{
            ...(stickySubheader ? { top: stickyTopbar ? `${topbarHeight}px` : 0 } : {}),
            ...SURFACE,
          }}
        >
          {subheader}
        </div>
      )}
    </>
  );

  // Wrapper (Card/Page)
  const Wrap: React.FC<{ children: React.ReactNode }> =
    mode === "card"
      ? ({ children }) => <Frame rounded={rounded} padded={padded}>{children}</Frame>
      : ({ children }) => <div className={`w-full ${outerPadding}`}>{children}</div>;

  // ---------- Body: NUR CENTER scrollt ----------
  const Body = (
    <div className="relative min-h-0 h-full" style={cssVars}>
      <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[var(--left)_minmax(0,1fr)_var(--right)]">
        {/* LEFT – statisch */}
        {left ? (
          <aside
            className="rounded-2xl border p-3 md:p-4"
            style={{
              ...RAIL,
              position: stickyRails ? ("sticky" as const) : "static",
              top: stickyRails ? "1rem" : undefined,
              alignSelf: "start",
              height: "fit-content",
            }}
          >
            {left}
          </aside>
        ) : (
          (leftWidth ? <div /> : <div className="hidden md:block" />)
        )}

        {/* CENTER – EINZIGER Scrollbereich (unsichtbarer Scrollbar) */}
        {centerFramed ? (
          <main
            className="rounded-2xl border p-3 md:p-4 min-w-0 h-full overflow-y-auto no-scrollbar"
            style={RAIL}
          >
            {children}
          </main>
        ) : (
          <main className="min-w-0 h-full overflow-y-auto no-scrollbar">
            {children}
          </main>
        )}

        {/* RIGHT – statisch */}
        {right ? (
          <aside
            className="rounded-2xl border p-3 md:p-4"
            style={{
              ...RAIL,
              position: stickyRails ? ("sticky" as const) : "static",
              top: stickyRails ? "1rem" : undefined,
              alignSelf: "start",
              height: "fit-content",
            }}
          >
            {right}
          </aside>
        ) : (
          (rightWidth ? <div /> : <div className="hidden md:block" />)
        )}
      </div>
    </div>
  );

  // ---------- Render: Top fix, darunter nur Body (Center) scrollt ----------
  if (leftPlacement === "bleed" && mode === "card") {
    // Left außerhalb, Center+Right im Card
    return (
      <div className={`w-full ${outerPadding}`}>
        <div className="flex flex-col h-[calc(100vh_-_var(--app-topbar-h,72px))] min-h-0">
          {TopArea}
          <div className="flex-1 min-h-0" style={cssVars}>
            <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[var(--left)_minmax(0,1fr)]">
              {/* Left */}
              {left ? (
                <aside
                  className="rounded-2xl border p-3 md:p-4"
                  style={{
                    ...RAIL,
                    position: stickyRails ? ("sticky" as const) : "static",
                    top: stickyRails ? "1rem" : undefined,
                    alignSelf: "start",
                    height: "fit-content",
                  }}
                >
                  {left}
                </aside>
              ) : (leftWidth ? <div /> : <div className="hidden md:block" />)}

              {/* Rechts: Card mit Body */}
              <Frame rounded={rounded} padded={padded}>
                <div className="flex-1 min-h-0 h-full">
                  {Body}
                </div>
              </Frame>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard (page/card, left inside)
  return (
    <Wrap>
      <div
        className="flex flex-col min-h-0"
        style={{ height: `calc(100vh - ${shellViewportOffset})` }}
      >
        {TopArea}
        <div className="flex-1 min-h-0">
          {Body}
        </div>
      </div>
    </Wrap>
  );
}
