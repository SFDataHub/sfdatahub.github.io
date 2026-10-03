import React from "react";

const DEFAULT_FOCUS_DURATION_MS = 2600;

const escapeAttributeValue = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

type UseToplistRowFocusOptions = {
  focusIdentifier: string | null;
  focusNonce?: number | string | null;
  disabled?: boolean;
  rowIndexByIdentifier?: Map<string, number>;
  scrollToIndex?: (index: number) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  durationMs?: number;
};

export function useToplistRowFocus({
  focusIdentifier,
  focusNonce = null,
  disabled = false,
  rowIndexByIdentifier,
  scrollToIndex,
  scrollContainerRef,
  durationMs = DEFAULT_FOCUS_DURATION_MS,
}: UseToplistRowFocusOptions) {
  const [highlightedIdentifier, setHighlightedIdentifier] = React.useState<string | null>(null);
  const focusHandledRef = React.useRef<string | null>(null);
  const focusHighlightTimeoutRef = React.useRef<number | null>(null);

  const focusKey = focusIdentifier ? `${focusIdentifier}\u0000${String(focusNonce ?? "")}` : null;

  React.useEffect(() => {
    focusHandledRef.current = null;
    setHighlightedIdentifier(null);
    if (focusHighlightTimeoutRef.current != null) {
      window.clearTimeout(focusHighlightTimeoutRef.current);
      focusHighlightTimeoutRef.current = null;
    }
  }, [focusKey]);

  React.useEffect(() => {
    return () => {
      if (focusHighlightTimeoutRef.current != null) {
        window.clearTimeout(focusHighlightTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (disabled || !focusIdentifier || !focusKey) return;
    if (focusHandledRef.current === focusKey) return;

    if (scrollToIndex && rowIndexByIdentifier) {
      const targetIndex = rowIndexByIdentifier.get(focusIdentifier);
      if (targetIndex == null) return;
      focusHandledRef.current = focusKey;
      scrollToIndex(targetIndex);
    } else {
      const scrollContainer = scrollContainerRef?.current;
      if (!scrollContainer) return;
      const target = scrollContainer.querySelector<HTMLElement>(
        `[data-sfh-identifier="${escapeAttributeValue(focusIdentifier)}"]`,
      );
      if (!target) return;
      focusHandledRef.current = focusKey;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    setHighlightedIdentifier(focusIdentifier);
    if (focusHighlightTimeoutRef.current != null) {
      window.clearTimeout(focusHighlightTimeoutRef.current);
    }
    focusHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedIdentifier((prev) => (prev === focusIdentifier ? null : prev));
      focusHighlightTimeoutRef.current = null;
    }, durationMs);
  }, [
    disabled,
    durationMs,
    focusIdentifier,
    focusKey,
    rowIndexByIdentifier,
    scrollContainerRef,
    scrollToIndex,
  ]);

  return highlightedIdentifier;
}
