import React from "react";
import ReactDOM from "react-dom";
import styles from "./SubmenuPortal.module.css";

type SubItem = { to: string; label: string };
type Pos = { left: number; top: number };

function computePosition(anchor: HTMLElement, gap = 8): Pos {
  const r = anchor.getBoundingClientRect();
  return { left: Math.round(r.right + gap), top: Math.round(r.top) };
}

export default function SubmenuPortal({
  anchorEl,
  open,
  items,
  renderLink,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  items: SubItem[];
  renderLink: (it: SubItem) => React.ReactNode;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const [pos, setPos] = React.useState<Pos>({ left: 0, top: 0 });

  // Position neu berechnen bei open/scroll/resize
  React.useEffect(() => {
    if (!open || !anchorEl) return;
    const update = () => setPos(computePosition(anchorEl));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.documentElement);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorEl]);

  if (typeof document === "undefined") return null;

  /* DEBUG: zeigt in der Browser-Konsole, welche Labels im Submenu ankommen
     Erwarte hier u. a.: "History Book"
  */
  if (open && items?.length) {
    // eslint-disable-next-line no-console
    console.log("submenu items:", items.map((i) => i.label));
  }

  return ReactDOM.createPortal(
    <div
      className={`${styles.panel} ${open ? styles.open : ""}`}
      style={{
        left: pos.left,
        top: pos.top,
        // TEMP: Overflow-Fix, damit nichts abgeschnitten wird
        maxHeight: "70vh",
        overflow: "auto",
        zIndex: 3000,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
    >
      <div className={styles.col}>
        {items.map((it) => renderLink(it))}
      </div>
    </div>,
    document.body
  );
}
