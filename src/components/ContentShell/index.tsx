import React from "react";
import Frame from "../ContentFrame/Frame";

type Props = {
  /** optionaler Bereich ÜBER der Top-Bar (z. B. Hex-Nav) */
  hex?: React.ReactNode;

  /** Top-Bar */
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;

  /** 3-Spalten-Layout */
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;     // Center

  /** Layout-Optionen */
  rounded?: string;              // z. B. "rounded-3xl"
  padded?: boolean;              // Innenabstand im Frame

  centerFramed?: boolean;        // Mitte als eigene Kachel (Border + BG)
  leftWidth?: number | string;   // default 240
  rightWidth?: number | string;  // default 260
  stickyRails?: boolean;         // Sidebars sticky
};

/**
 * ContentShell – schlanker Wrapper um den Frame.
 * Keine externen Regions-Imports nötig; alles hier gerendert.
 * -> Verwendet CSS-Variablen --left / --right für die Grid-Spalten.
 */
export default function ContentShell({
  hex,
  title,
  subtitle,
  actions,
  left,
  right,
  children,
  rounded = "rounded-3xl",
  padded = true,
  centerFramed = true,
  leftWidth = 240,
  rightWidth = 260,
  stickyRails = true,
}: Props) {
  const cssVars: React.CSSProperties = {
    // @ts-ignore: Custom CSS Vars ok
    "--left": typeof leftWidth === "number" ? `${leftWidth}px` : leftWidth,
    // @ts-ignore
    "--right": typeof rightWidth === "number" ? `${rightWidth}px` : rightWidth,
  };

  return (
    <Frame rounded={rounded} padded={padded}>
      {/* Hex-Bar (oberhalb der Top-Bar) */}
      {hex ? (
        <div
          className="mb-3 rounded-2xl border px-4 py-2"
          style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
        >
          {hex}
        </div>
      ) : null}

      {/* Top-Bar */}
      {(title || subtitle || actions) && (
        <div
          className="mb-3 flex items-center justify-between rounded-2xl border px-5 py-3"
          style={{ borderColor: "#2B4C73", background: "#1A2F4A" }}
        >
          <div className="min-w-0">
            {title ? (
              <div className="truncate text-sm font-semibold" style={{ color: "#F5F9FF" }}>
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div className="truncate text-[11px]" style={{ color: "#B0C4D9" }}>
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}

      {/* 3-Spalten-Grid */}
      <div className="relative" style={cssVars}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[var(--left)_minmax(0,1fr)_var(--right)]">
          {/* Left-Rail */}
          {left ? (
            <aside
              className="rounded-2xl border p-3 md:p-4"
              style={{
                borderColor: "#2B4C73",
                background: "#152A42",
                position: stickyRails ? ("sticky" as const) : "static",
                top: stickyRails ? "1rem" : undefined,
                alignSelf: "start",
              }}
            >
              {left}
            </aside>
          ) : (
            <div className="hidden md:block" />
          )}

          {/* Center */}
          {centerFramed ? (
            <main
              className="rounded-2xl border p-3 md:p-4"
              style={{ borderColor: "#2B4C73", background: "#152A42" }}
            >
              {children}
            </main>
          ) : (
            <main className="min-w-0">{children}</main>
          )}

          {/* Right-Rail */}
          {right ? (
            <aside
              className="rounded-2xl border p-3 md:p-4"
              style={{
                borderColor: "#2B4C73",
                background: "#152A42",
                position: stickyRails ? ("sticky" as const) : "static",
                top: stickyRails ? "1rem" : undefined,
                alignSelf: "start",
              }}
            >
              {right}
            </aside>
          ) : (
            <div className="hidden md:block" />
          )}
        </div>
      </div>
    </Frame>
  );
}
