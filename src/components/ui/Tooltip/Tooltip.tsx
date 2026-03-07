import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./Tooltip.module.css";

type TooltipProps = {
  content?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  placement?: "top" | "bottom";
};

type ResolvedPlacement = "top" | "bottom";

type TooltipPosition = {
  top: number;
  left: number;
  tailLeft: number;
  placement: ResolvedPlacement;
};

const EDGE_PADDING = 8;
const TOOLTIP_OFFSET = 12;
const TAIL_PADDING = 12;

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  contentClassName,
  placement = "top",
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!wrapperRef.current || !bubbleRef.current) return;

    const triggerRect = wrapperRef.current.getBoundingClientRect();
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const bubbleWidth = bubbleRect.width;
    const bubbleHeight = bubbleRect.height;
    if (!bubbleWidth || !bubbleHeight) return;

    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    let resolvedPlacement: ResolvedPlacement = placement;
    let top =
      resolvedPlacement === "bottom"
        ? triggerRect.bottom + TOOLTIP_OFFSET
        : triggerRect.top - bubbleHeight - TOOLTIP_OFFSET;

    if (resolvedPlacement === "top" && top < EDGE_PADDING) {
      resolvedPlacement = "bottom";
      top = triggerRect.bottom + TOOLTIP_OFFSET;
    } else if (resolvedPlacement === "bottom" && top + bubbleHeight > window.innerHeight - EDGE_PADDING) {
      resolvedPlacement = "top";
      top = triggerRect.top - bubbleHeight - TOOLTIP_OFFSET;
    }

    top = Math.max(EDGE_PADDING, Math.min(top, window.innerHeight - bubbleHeight - EDGE_PADDING));

    let left = triggerCenterX - bubbleWidth / 2;
    left = Math.max(EDGE_PADDING, Math.min(left, window.innerWidth - bubbleWidth - EDGE_PADDING));

    const tailLeft = Math.max(TAIL_PADDING, Math.min(triggerCenterX - left, bubbleWidth - TAIL_PADDING));

    setPosition({ top, left, tailLeft, placement: resolvedPlacement });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    if (typeof window === "undefined") return;

    const handleReposition = () => updatePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePosition]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
    }
  }, [open]);

  if (!content) {
    return <>{children}</>;
  }

  const bubbleStyle = {
    "--tooltip-top": `${position?.top ?? -9999}px`,
    "--tooltip-left": `${position?.left ?? -9999}px`,
    "--tooltip-tail-left": `${position?.tailLeft ?? 0}px`,
  } as React.CSSProperties;

  const bubbleClassName = `${styles.bubble}${position ? ` ${styles.open}` : ""}${
    position?.placement === "bottom" ? ` ${styles.bottom}` : ""
  }`;

  return (
    <div
      ref={wrapperRef}
      className={`${styles.tooltipWrapper}${
        className ? ` ${className}` : ""
      }`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (!nextFocused || !event.currentTarget.contains(nextFocused)) {
          setOpen(false);
        }
      }}
    >
      <div className={styles.trigger}>{children}</div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={bubbleRef}
              className={bubbleClassName}
              role="tooltip"
              style={bubbleStyle}
            >
              <div className={`${styles.card}${contentClassName ? ` ${contentClassName}` : ""}`}>{content}</div>
              <div className={styles.tail} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default Tooltip;
