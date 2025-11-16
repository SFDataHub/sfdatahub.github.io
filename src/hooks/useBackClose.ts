import React from "react";

/**
 * Pushes a history entry when an overlay opens and closes it when the user taps
 * the browser/system back button. Handles React 18 StrictMode double-effects by
 * separating push and pop logic.
 */
export function useBackClose(isOpen: boolean, onClose: () => void) {
  const closeRequestedRef = React.useRef(false);
  const onCloseRef = React.useRef(onClose);
  const entryActiveRef = React.useRef(false);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return undefined;
    }

    entryActiveRef.current = true;
    window.history.pushState({ ghOverlay: true }, "");

    const handlePop = () => {
      closeRequestedRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    if (!isOpen && entryActiveRef.current) {
      entryActiveRef.current = false;
      if (!closeRequestedRef.current) {
        window.history.back();
      }
      closeRequestedRef.current = false;
    }
    return undefined;
  }, [isOpen]);
}
