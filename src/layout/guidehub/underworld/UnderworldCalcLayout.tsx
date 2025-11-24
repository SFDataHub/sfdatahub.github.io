// UnderworldCalcLayout – Struktur & A11y (KEINE Global-Styles).
// Auswahl als Dropdown im SFDataHub-Stil; GIF links, Tab-/Tabellenbereich rechts daneben.

import React, { useEffect, useMemo, useRef } from "react";

export type MediaSpec = {
  type: "mp4" | "webm" | "gif" | "png" | "jpg";
  src: string;
  alt?: string;
  poster?: string; // nur für mp4/webm
};

export type TabItem = { key: string; label: string };

export type UnderworldCalcLayoutProps = {
  title: string;
  media: MediaSpec;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (nextKey: string) => void;

  renderTab: (key: string) => React.ReactNode;
  renderResults?: (key: string) => React.ReactNode;

  infoToolbar?: React.ReactNode;
  className?: string;
  stickyTabs?: boolean; // beibehalten für API-Kompatibilität
};

const UnderworldCalcLayout: React.FC<UnderworldCalcLayoutProps> = ({
  title,
  media,
  tabs,
  activeTab,
  onTabChange,
  renderTab,
  renderResults,
  infoToolbar,
  className,
}) => {
  // activeTab absichern
  const safeActiveKey = useMemo(() => {
    const keys = tabs.map((t) => t.key);
    return keys.includes(activeTab) ? activeTab : (tabs[0]?.key ?? "");
  }, [tabs, activeTab]);

  // Videos offscreen pausieren
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (media.type !== "mp4" && media.type !== "webm") return;
    const node = videoRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) node.play().catch(() => void 0);
          else node.pause();
        });
      },
      { threshold: 0.2 }
    );

    io.observe(node);
    return () => io.disconnect();
  }, [media.type]);

  const selectId = "underworld-select";
  const panelId = `underworld-panel-${safeActiveKey}`;

  const rootClass = ["container", "gh-calc-wide", className].filter(Boolean).join(" ");

  return (
    <section className={rootClass}>
      <header>
        <h1>{title}</h1>
      </header>

      <div className="grid">
        {/* Content */}
        <div className="content">
          {infoToolbar ? <div className="toolbar">{infoToolbar}</div> : null}

          {/* Dropdown statt Tabs */}
          <div className="tabs" aria-label="Underworld calculator selection">
            <label htmlFor={selectId} className="tabSelectLabel">
              Select building
            </label>
            <select
              id={selectId}
              className="tabSelect"
              value={safeActiveKey}
              onChange={(e) => onTabChange(e.target.value)}
              aria-controls={panelId}
            >
              {tabs.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* GIF links | Tabelle/Panel rechts */}
          <div className="mediaRow" aria-label="Preview and panel row">
            <div className="media" aria-label="Preview">
              {media.type === "mp4" || media.type === "webm" ? (
                <video
                  ref={videoRef}
                  src={media.src}
                  poster={media.poster}
                  muted
                  loop
                  playsInline
                  controls={false}
                  aria-label={media.alt ?? "Preview video"}
                />
              ) : (
                <img
                  src={media.src}
                  alt={media.alt ?? "Preview"}
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>

            <div className="tabPanel" role="region" id={panelId} aria-live="polite">
              {renderTab(safeActiveKey)}
            </div>
          </div>
        </div>

        {/* Results (rechts) – optional */}
        {renderResults ? (
          <aside className="results" aria-label="Results">
            {renderResults(safeActiveKey)}
          </aside>
        ) : null}
      </div>
    </section>
  );
};

export default UnderworldCalcLayout;
