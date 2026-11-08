import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ToplistKind } from "../../lib/toplists/toplistColumns";

type Request = { font: string; letterSpacing: string; kind: ToplistKind; resolve: (widths: Record<string, number>) => void };
const eventName = "sfhub-toplist-measure";
export function requestToplistWidths(kind: ToplistKind, trigger: HTMLElement): Promise<Record<string, number>> {
  const style = getComputedStyle(trigger.closest("table") ?? trigger);
  return new Promise(resolve => document.dispatchEvent(new CustomEvent<Request>(eventName, { detail: { kind, resolve, font: style.font, letterSpacing: style.letterSpacing } })));
}

/** Mount the existing renderers only on an explicit request, including every loaded row.
 * Intrinsic table layout measures stacked content, images, badges and current fonts together.
 * No archive queries or virtualizer scrolling are involved.
 */
export function useToplistAutoSize(kind: ToplistKind, enabled: boolean, keys: readonly string[], render: () => ReactNode) {
  const [request, setRequest] = useState<Request | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    const receive = (event: Event) => { const next = (event as CustomEvent<Request>).detail; if (next.kind === kind) setRequest(next); };
    document.addEventListener(eventName, receive);
    return () => document.removeEventListener(eventName, receive);
  }, [kind, enabled]);
  useLayoutEffect(() => {
    if (!request || !root.current) return;
    const host = root.current;
    host.setAttribute("inert", "");
    host.style.font = request.font;
    host.style.letterSpacing = request.letterSpacing;
    // Measure inactive headers with the same glyph and CSS gap as active headers.
    host.querySelectorAll<HTMLButtonElement>('th[aria-sort="none"] > button.local-toplist-sort-header').forEach(button => {
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↓";
      button.append(arrow);
    });
    // Remove fixed table/column and truncation constraints only in the private measurement tree.
    host.querySelectorAll<HTMLElement>("table, col, th, td, th *, td *").forEach(node => {
      const style = getComputedStyle(node);
      node.style.maxWidth = "none";
      if (node.tagName === "TABLE") { node.style.width = "max-content"; node.style.tableLayout = "auto"; }
      else if (node.tagName === "COL") node.style.width = "auto";
      else if (node.tagName === "TH" || node.tagName === "TD") node.style.whiteSpace = "nowrap";
      else if (node.style.width === "100%" || style.display === "flex" || style.overflow === "hidden") node.style.width = "max-content";
    });
    const widths: Record<string, number> = {};
    host.querySelectorAll<HTMLTableRowElement>("tr").forEach(row => {
      if (row.cells.length !== keys.length || [...row.cells].some(cell => cell.colSpan !== 1)) return;
      [...row.cells].forEach((cell, i) => {
        widths[keys[i]] = Math.max(widths[keys[i]] ?? 40, Math.ceil(cell.getBoundingClientRect().width));
      });
    });
    request.resolve(widths);
    setRequest(null);
  }, [request, keys]);
  return request ? createPortal(<div ref={root} aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, visibility: "hidden", pointerEvents: "none", width: "max-content" }}>{render()}</div>, document.body) : null;
}
