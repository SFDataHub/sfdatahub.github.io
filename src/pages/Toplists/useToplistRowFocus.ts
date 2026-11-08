import React from "react";

const DEFAULT_FOCUS_DURATION_MS = 2600;
const escapeAttributeValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export type ToplistFocusRequest = {
  identifier: string;
  server?: string;
  targetGeneration: number;
  datasetKey: string;
  viewKey: string;
  attempt: string;
  completed?: boolean;
};
export type ToplistFocusResult = ToplistFocusRequest & { status: "visibleAck" | "unresolved" | "error" };

type UseToplistRowFocusOptions = {
  focusIdentifier: string | null;
  focusNonce?: number | string | null;
  focusRequest?: ToplistFocusRequest | null;
  onFocusResult?: (result: ToplistFocusResult) => void;
  disabled?: boolean;
  rowIndexByIdentifier?: Map<string, number>;
  scrollToIndex?: (index: number) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  durationMs?: number;
};

/** A mounted, marked row must intersect the viewport and every clipping ancestor. */
export function isToplistRowVisible(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const style = getComputedStyle(target);
  if (!target.isConnected || rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return false;
  let top = 0, left = 0, right = window.innerWidth, bottom = window.innerHeight;
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    if (css.visibility === "hidden" || css.display === "none" || css.opacity === "0") return false;
    const bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
  }
  return Math.min(rect.bottom, bottom) > Math.max(rect.top, top) && Math.min(rect.right, right) > Math.max(rect.left, left);
}

export function useToplistRowFocus(options: UseToplistRowFocusOptions) {
  const { focusIdentifier, focusNonce = null, focusRequest, disabled = false, durationMs = DEFAULT_FOCUS_DURATION_MS } = options;
  const latest = React.useRef(options);
  latest.current = options;
  const [highlightedIdentifier, setHighlightedIdentifier] = React.useState<string | null>(null);
  const focusKey = focusIdentifier ? JSON.stringify([focusIdentifier, focusNonce, focusRequest?.attempt]) : null;
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    setHighlightedIdentifier(null);
    if (!focusIdentifier) handled.current = null;
    if (!focusIdentifier || !focusKey || disabled || latest.current.focusRequest?.completed || handled.current === focusKey) return;
    let stopped = false, scrolledIndex = false, scrolledElement: HTMLElement | null = null;
    let frame: number | undefined, highlightTimer: ReturnType<typeof setTimeout> | undefined;
    const request = latest.current.focusRequest;
    const root = () => latest.current.scrollContainerRef?.current;
    const observer = new MutationObserver(schedule);
    const stopWatching = () => { observer.disconnect(); window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); if (frame != null) cancelAnimationFrame(frame); clearTimeout(deadline); };
    const finish = (status: ToplistFocusResult["status"]) => {
      if (stopped) return;
      stopped = true;
      handled.current = focusKey;
      stopWatching();
      if (status === "visibleAck") highlightTimer = setTimeout(() => setHighlightedIdentifier(current => current === focusIdentifier ? null : current), durationMs);
      else setHighlightedIdentifier(null);
      if (request) latest.current.onFocusResult?.({ ...request, status });
    };
    function schedule() { if (!stopped && frame == null) frame = requestAnimationFrame(check); }
    function check() {
      frame = undefined;
      if (stopped) return;
      try {
        const current = latest.current;
        if (!scrolledIndex && current.scrollToIndex && current.rowIndexByIdentifier) {
          const index = current.rowIndexByIdentifier.get(focusIdentifier!);
          if (index != null) { scrolledIndex = true; current.scrollToIndex(index); }
        }
        const container = root();
        // Legacy callers without a DOM ref retain scroll/highlight behavior;
        // an ACK always requires an actual element supplied by the renderer.
        const selector = `[data-sfh-identifier="${escapeAttributeValue(focusIdentifier!)}"]${request?.server ? `[data-sfh-server="${escapeAttributeValue(request.server)}"]` : ""}`;
        const target = container?.querySelector<HTMLElement>(selector);
        if (target) {
          if (scrolledElement !== target) { scrolledElement = target; target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); }
          setHighlightedIdentifier(current => current === focusIdentifier ? current : focusIdentifier);
          const marked = target.classList.contains("toplists-row--focused") || target.classList.contains("toplists-mobile-row--focused");
          if (marked && isToplistRowVisible(target)) { finish("visibleAck"); return; }
        } else if (!request && scrolledIndex) setHighlightedIdentifier(focusIdentifier);
        schedule();
      } catch { finish("error"); }
    }
    const deadline = setTimeout(() => finish("unresolved"), 1800);
    if (root()) observer.observe(root()!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => { stopped = true; stopWatching(); clearTimeout(highlightTimer); };
  }, [focusKey, disabled, durationMs, focusIdentifier]);

  return highlightedIdentifier;
}
