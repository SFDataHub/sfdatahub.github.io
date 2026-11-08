import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { toplistBoundaryWidths, type ToplistKind } from "../../lib/toplists/toplistColumns";
import { requestToplistWidths } from "./useToplistAutoSize";
import { useToplistResizeCommit } from "./ToplistViewControls";

/** A private DOM preview avoids rendering data consumers or publishing preferences per pixel. */
export function useLocalColumnResize(kind: ToplistKind, key: string) {
  const begin = useToplistResizeCommit();
  const cancel = useRef<(() => void) | null>(null);
  const draggedUntil = useRef(0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; cancel.current?.(); }, []);
  const autoSize = begin ? async (event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault(); event.stopPropagation();
    if (Date.now() < draggedUntil.current) return;
    cancel.current?.();
    const token = ++generation.current;
    const grip = event.currentTarget;
    const header = grip.closest("th")!;
    const cells = [...header.parentElement!.querySelectorAll<HTMLElement>("th")];
    const widths = Object.fromEntries(cells.map(cell => [cell.dataset.columnKey!, cell.getBoundingClientRect().width]));
    const rightKey = cells[cells.indexOf(header) + 1]?.dataset.columnKey;
    const commit = begin(kind);
    const measured = await requestToplistWidths(kind, grip);
    if (token === generation.current && grip.isConnected) commit(key, measured[key], widths, rightKey);
  } : null;
  const resize = begin ? (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation();
    cancel.current?.();
    generation.current++;
    const grip = event.currentTarget;
    const header = grip.closest("th")!;
    const viewport = header.closest<HTMLElement>(".toplists-table-viewport");
    if (!viewport) return;
    const cells = [...header.parentElement!.querySelectorAll<HTMLElement>("th")];
    const widths = Object.fromEntries(cells.map(cell => [cell.dataset.columnKey!, cell.getBoundingClientRect().width]));
    const rightKey = cells[cells.indexOf(header) + 1]?.dataset.columnKey;
    const start = widths[key], x = event.clientX, pointer = event.pointerId;
    if (!Number.isFinite(start) || start <= 0) return;
    const commit = begin(kind);
    const originals = new Map<HTMLElement, string | null>();
    const remember = (node: HTMLElement) => { if (!originals.has(node)) originals.set(node, node.getAttribute("style")); };
    const tables = [...viewport.querySelectorAll<HTMLTableElement>("table.toplists-table")];
    const containers = [...viewport.querySelectorAll<HTMLElement>(".toplists-table-header, .toplists-table-scroll")];
    const total = Object.values(widths).reduce((sum, width) => sum + width, 0);
    const extra = containers.map(node => Math.max(0, node.getBoundingClientRect().width - total));
    [viewport, document.documentElement, ...tables, ...containers].forEach(remember);
    tables.forEach(table => table.querySelectorAll<HTMLElement>("col").forEach(remember));
    let end = start, moved = false, finished = false;
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const changed = toplistBoundaryWidths(key, start + e.clientX - x, widths, rightKey);
      end = changed[key] ?? start;
      moved ||= Math.abs(e.clientX - x) > 3 && Math.abs(end - start) > 0.5;
      if (!moved) return;
      document.documentElement.style.userSelect = "none";
      document.documentElement.style.cursor = "col-resize";
      const nextTotal = rightKey === undefined ? total + end - start : total;
      viewport.style.overflowX = "auto";
      tables.forEach(table => {
        table.style.width = `${nextTotal}px`;
        table.querySelectorAll<HTMLElement>("col").forEach((col, i) => { col.style.width = `${changed[cells[i].dataset.columnKey!] ?? widths[cells[i].dataset.columnKey!]}px`; });
      });
      containers.forEach((node, i) => { node.style.minWidth = `${nextTotal + extra[i]}px`; });
    };
    const suppress = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", update, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", abort, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
      grip.removeEventListener("lostpointercapture", abort);
      window.removeEventListener("contextmenu", suppress, true);
      window.removeEventListener("selectstart", suppress, true);
      if (grip.hasPointerCapture(pointer)) grip.releasePointerCapture(pointer);
      originals.forEach((style, node) => { if (style === null) node.removeAttribute("style"); else node.setAttribute("style", style); });
      cancel.current = null;
      // The following compatibility click may target the header after capture is released.
      if (moved) {
        draggedUntil.current = Date.now() + 500;
        window.addEventListener("click", suppress, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", suppress, true), 0);
      }
      if (save && moved && Math.abs(end - start) > 0.5) {
        // Freeze percentage Default geometry once; Custom edits touch only the boundary pair.
        commit(key, end, widths, rightKey);
      }
    };
    const up = (e: PointerEvent) => { if (e.pointerId === pointer) { update(e); finish(true); } };
    const abort = (e: PointerEvent) => { if (e.pointerId === pointer) finish(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { suppress(e); finish(false); } };
    const blur = () => finish(false);
    cancel.current = () => finish(false);
    window.addEventListener("pointermove", update, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", abort, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    window.addEventListener("contextmenu", suppress, true);
    window.addEventListener("selectstart", suppress, true);
    grip.addEventListener("lostpointercapture", abort);
    grip.setPointerCapture(pointer);
  } : null;
  return resize ? { resize, autoSize: autoSize! } : null;
}
