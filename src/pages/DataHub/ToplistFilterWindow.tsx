import { useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styles from "./ToplistFilterWindow.module.css";

type Position = { x: number; y: number };
const STORAGE_KEY = "sfdatahub.localToplist.filterWindow.v1";
const filterButton = () => document.querySelector<HTMLButtonElement>('[aria-controls="guild-hub-local-toplists-filters"]');

function topBoundary() {
  const height = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
  return Math.min(Math.max(8, height + 8), Math.max(8, window.innerHeight - 64));
}

function leftBoundary() {
  const shell = document.getElementById("app-shell");
  const sidebar = shell?.dataset.navigation === "sidebar" ? document.getElementById("sidebar-root") : null;
  return Math.max(8, Math.min((sidebar?.getBoundingClientRect().right ?? 0) + 8, window.innerWidth - 64));
}

function readSaved(): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    // Read legacy geometry as well as the position-only format; ignore pin and size.
    const position = value?.position ?? value?.geometry;
    if (![position?.x, position?.y].every(v => typeof v === "number" && Number.isFinite(v))) return null;
    return { x: position.x, y: position.y };
  } catch { return null; }
}

export default function ToplistFilterWindow({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const preferred = React.useRef<Position | null>(null);
  const [position, setPosition] = React.useState<Position>({ x: 8, y: 8 });
  useAnalyticsView(open ? "datahub/toplist/filters" : null);
  const displayed = React.useRef(position);
  const [limits, setLimits] = React.useState({ maxWidth: window.innerWidth - 16, maxHeight: window.innerHeight - 16 });
  const gesture = React.useRef<{ pointer: number; x: number; y: number; position: Position; moved: boolean } | null>(null);
  const root = React.useRef<HTMLElement>(null);

  const place = React.useCallback((value: Position) => {
    const top = topBoundary(), left = leftBoundary();
    const maxWidth = Math.max(1, window.innerWidth - left - 8);
    const maxHeight = Math.max(1, window.innerHeight - top - 8);
    setLimits(current => current.maxWidth === maxWidth && current.maxHeight === maxHeight ? current : { maxWidth, maxHeight });
    const rect = root.current?.getBoundingClientRect();
    const width = Math.min(rect?.width ?? 380, maxWidth);
    const height = Math.min(rect?.height ?? 0, maxHeight);
    const next = { x: Math.max(left, Math.min(value.x, window.innerWidth - width - 8)),
      y: Math.max(top, Math.min(value.y, window.innerHeight - height - 8)) };
    displayed.current = next;
    setPosition(current => current.x === next.x && current.y === next.y ? current : next);
    return next;
  }, []);

  React.useLayoutEffect(() => {
    if (!open) { gesture.current = null; return; }
    preferred.current ??= readSaved();
    const anchor = filterButton()?.getBoundingClientRect();
    const initial = { x: anchor?.left ?? leftBoundary(), y: anchor ? anchor.bottom + 8 : topBoundary() };
    const resize = () => { place(preferred.current ?? initial); };
    resize();
    const observer = new ResizeObserver(resize);
    for (const element of [root.current, document.getElementById("sidebar-root"), document.querySelector("header")]) {
      if (element) observer.observe(element);
    }
    const shell = document.getElementById("app-shell");
    const shellObserver = new MutationObserver(resize);
    if (shell) shellObserver.observe(shell, { attributes: true, attributeFilter: ["data-navigation", "data-sidebar", "style"] });
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); observer.disconnect(); shellObserver.disconnect(); };
  }, [open, place]);

  const start = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, position: displayed.current, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const next = place({ x: drag.position.x + event.clientX - drag.x, y: drag.position.y + event.clientY - drag.y });
    if (next.x !== drag.position.x || next.y !== drag.position.y) drag.moved = true;
    preferred.current = next;
  };
  const stop = (event: React.PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    gesture.current = null;
    if (event.type !== "pointerup" || !drag.moved) return;
    preferred.current = displayed.current;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ position: displayed.current })); } catch { /* Storage is optional. */ }
  };
  const close = () => {
    if (root.current?.contains(document.activeElement)) filterButton()?.focus();
    onClose();
  };

  return createPortal(
    <section ref={root} id="guild-hub-local-toplists-filters" hidden={!open}
      className={styles.window} aria-labelledby="local-toplist-filter-title"
      style={{ left: position.x, top: position.y, ...limits }}
      onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
      <div className={styles.titlebar} onPointerDown={start}>
        <h2 id="local-toplist-filter-title">{t("toplists.filters.windowTitle")}</h2>
        <button type="button" aria-label={t("toplists.filters.closeWindow")} onClick={close}>×</button>
      </div>
      <div className={`${styles.content} sfdatahub-scrollbar`}>{children}</div>
    </section>, document.body,
  );
}
