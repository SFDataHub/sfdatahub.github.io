import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RegionKey, ServerGroupsByRegion } from "./serverGroups";
import RankingIcon from "../../pages/Playground/RankingIcon";
import { isHiddenPickerServer, serverPickerPresentation } from "./serverPickerModel";
import styles from "./ServerSheet.module.css";

/** Layout-Modus */
type Mode = "sheet" | "modal";
const REGION_ORDER: RegionKey[] = ["EU", "US", "INT", "Fusion"];

type Props = {
  /** Sichtbarkeit wird ausschliesslich ueber Props gesteuert */
  open: boolean;
  onClose: () => void;

  /** Layout: "modal" (zentriert) oder "sheet" (Bottom-Sheet) */
  mode?: Mode;

  /** Bounds of the existing ContentShell, shared by both toplist consumers. */
  shellRef?: React.RefObject<HTMLElement>;

  /** Serverdaten: { EU: [...], US: [...], INT: [...], Fusion: [...] } */
  serversByRegion: ServerGroupsByRegion;

  /** aktuell ausgewaehlte Server */
  selected: string[];

  /** Toggle einzelner Server */
  onToggle: (server: string) => void;

  /** Alle Server einer Region selektieren */
  onSelectAllInRegion?: (region: RegionKey) => void;

  /** Alles abwaehlen */
  onClearAll: () => void;
};

const PALETTE = {
  tile: "#1A2F4A",
  line: "#2B4C73",
  chip: "#14273E",
  text: "#F5F9FF",
  text2: "#B0C4D9",
  backdrop: "rgba(0,0,0,.5)",
  input: "#0F2034",
  accent: "#5C8BC6",
};

export default function ServerSheet({
  open,
  onClose,
  mode = "modal",
  shellRef,
  serversByRegion,
  selected,
  onToggle,
  onSelectAllInRegion,
  onClearAll,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [shellBounds, setShellBounds] = useState<{ left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open || !shellRef?.current) return;
    const shell = shellRef.current;
    const measure = () => {
      const rect = shell.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      setShellBounds({ left, width: Math.max(0, Math.min(rect.right, window.innerWidth) - left) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [open, shellRef]);

  // ESC schliesst
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus-Trap rudimentaer
  useEffect(() => {
    if (open && rootRef.current) {
      const el = rootRef.current.querySelector<HTMLInputElement>("#sheet-serversearch");
      el?.focus();
    }
  }, [open]);


  const filterMatches = (name: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return serverPickerPresentation(name).searchTerms.some(term => term.includes(q));
  };

  if (!open) return null;

  // Named worlds keep their original values/region action contract, but render
  // only on the right. Any other INT worlds remain reachable on the left.
  const groups = REGION_ORDER.map(region => ({ region, servers: (serversByRegion[region] ?? []).filter(s => !isHiddenPickerServer(s)) }));
  const renderGroup = (region: RegionKey, named: boolean) => {
    const all = (serversByRegion[region] ?? []).filter(s => !isHiddenPickerServer(s) && serverPickerPresentation(s).named === named);
    if (!all.length) return null;
    const list = all.filter(filterMatches);
    const id = named ? `named-${region}` : `region-${region}`;
    const completeRegion = all.length === groups.find(group => group.region === region)?.servers.length;
    return (
      <section key={id} aria-labelledby={id} data-picker-group={named ? "named" : region}>
        <div style={regionHeader}>
          <h3 id={id} style={h3Style}>{named ? t("toplists.serverPicker.named") : region === "US" ? "AM" : region}</h3>
          <button type="button" style={ghostBtn} onClick={() => {
            if (onSelectAllInRegion && completeRegion) onSelectAllInRegion(region);
            else all.filter(server => !selected.includes(server)).forEach(onToggle);
          }}>{t("toplists.serverPicker.selectAll")}</button>
        </div>
        <div className={`${styles.icons} ${named ? styles.names : region === "EU" || region === "Fusion" ? styles.numbered : ""}`}>
          {list.map(srv => {
            const active = selected.includes(srv);
            const presentation = serverPickerPresentation(srv);
            return (
              <button key={srv} type="button" onClick={() => onToggle(srv)} aria-pressed={active} title={presentation.fullName} aria-label={presentation.fullName} data-server-value={srv} className={`${styles.icon} ${presentation.named ? styles.named : ""}`}>
                <span className={presentation.named ? styles.desktop : undefined}>
                  <RankingIcon variant={presentation.fusion ? "fusion" : "server"} size={presentation.named ? 128 : 64} presentation="name-only" sphereOnly labelLines={presentation.lines} labelFontSize={presentation.fontSize} />
                </span>
                {presentation.named && <span className={styles.compact}>
                  <RankingIcon variant="fusion" size={48} presentation="name-only" sphereOnly labelLines={[presentation.short]} labelFontSize={29} />
                </span>}
                {active && <span className={styles.check} aria-hidden="true">✓</span>}
              </button>
            );
          })}
          {!list.length && <div style={{ color: PALETTE.text2, fontSize: 13 }}>{t("toplists.serverPicker.empty")}</div>}
        </div>
      </section>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-dialog-title"
      style={backdropStyle}
      onClick={(e) => {
        // Klick auf Backdrop schliesst
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={rootRef}
        style={{ ...(mode === "modal" ? modalStyle : sheetStyle), ...(shellBounds ? { width: shellBounds.width, marginLeft: shellBounds.left } : {}) }}
        className={`sf-server-sheet ${styles.panel}`}
      >
        {/* Header */}
        <div style={headerRow}>
          <h2 id="server-dialog-title" style={h2Style}>{t("toplists.serverPicker.title")}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClearAll} style={ghostBtn}>{t("toplists.serverPicker.clear")}</button>
            <button type="button" onClick={onClose} style={primaryBtn}>{t("toplists.serverPicker.done")}</button>
          </div>
        </div>

        {/* Suche */}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <label htmlFor="sheet-serversearch" className="sr-only">{t("toplists.serverPicker.search")}</label>
          <input
            id="sheet-serversearch"
            name="sheet-serversearch"
            type="text"
            placeholder={t("toplists.serverPicker.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("toplists.serverPicker.search")}
            autoComplete="off"
            style={searchInput}
          />
        </div>

        <div className={`${styles.list} sfdatahub-scrollbar`}>
          <div className={styles.columns} data-picker-columns>
            <div className={styles.left} data-picker-left>
              {(["EU", "US", "INT"] as RegionKey[]).map(region => renderGroup(region, false))}
            </div>
            <div className={styles.right} data-picker-right>
              {renderGroup("Fusion", false)}
              {REGION_ORDER.map(region => renderGroup(region, true))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shared panel and action styles ---------- */
const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: "var(--app-overlay-inset, var(--topbar-h, 0px) 0 0 0)",
  background: PALETTE.backdrop,
  zIndex: 50,
  display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "16px 0",
  boxSizing: "border-box",
};

const modalStyle: React.CSSProperties = {
  width: "calc(100% - 32px)",
  marginLeft: 16,
  background: PALETTE.tile,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 16,
  boxShadow: "0 10px 40px rgba(0,0,0,.4)",
  padding: 16,
  color: PALETTE.text,
};

const sheetStyle: React.CSSProperties = {
  ...modalStyle,
  marginTop: "auto",
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
};

const headerRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
};
const h2Style: React.CSSProperties = { fontSize: 18, margin: 0 };
const h3Style: React.CSSProperties = { fontSize: 14, margin: 0, color: PALETTE.text2 };

const searchInput: React.CSSProperties = {
  width: "100%", background: PALETTE.input, color: PALETTE.text,
  border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: "10px 12px",
};

const regionHeader: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between", marginBottom: 8,
};

const primaryBtn: React.CSSProperties = {
  background: "#25456B",
  color: PALETTE.text,
  border: `1px solid ${PALETTE.accent}`,
  borderRadius: 10,
  padding: "8px 12px",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: PALETTE.text,
  border: `1px solid ${PALETTE.line}`,
  borderRadius: 10,
  padding: "8px 12px",
};

/** Visually hidden helper (falls du keine globale .sr-only Klasse hast) */
const srOnlyStyle = `
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
`.trim();

/* Optional: registriere die .sr-only Klasse einmalig */
if (typeof document !== "undefined") {
  const id = "sf-sr-only-style";
  if (!document.getElementById(id)) {
    const tag = document.createElement("style");
    tag.id = id;
    tag.textContent = srOnlyStyle;
    document.head.appendChild(tag);
  }
}
