import React from "react";

const layers = new Set<string>();
export const hasBackCloseLayer = () => typeof window !== "undefined" && layers.has(window.history.state?.ghOverlay);

/**
 * Pushes a history entry when an overlay opens and closes it when the user taps
 * the browser/system back button. Handles React 18 StrictMode double-effects by
 * separating push and pop logic.
 */
export function useBackClose(isOpen: boolean, onClose: () => void) {
  const closeRequestedRef = React.useRef(false);
  const onCloseRef = React.useRef(onClose);
  const entryActiveRef = React.useRef(false);
  const marker = React.useRef<string>();

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return undefined;
    }

    if (!entryActiveRef.current) {
      entryActiveRef.current = true;
      marker.current = crypto.randomUUID();
      const state = window.history.state ?? {};
      window.history.pushState({ ...state, idx: (state.idx ?? 0) + 1, ghOverlay: marker.current }, "");
    }
    layers.add(marker.current!);

    const handlePop = (event: PopStateEvent) => {
      if (event.state?.ghOverlay === marker.current) return;
      closeRequestedRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
      layers.delete(marker.current!);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!isOpen && entryActiveRef.current) {
      entryActiveRef.current = false;
      if (!closeRequestedRef.current && window.history.state?.ghOverlay === marker.current) {
        window.history.back();
      }
      closeRequestedRef.current = false;
    }
    return undefined;
  }, [isOpen]);
}
