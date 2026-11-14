import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import VisitorMetricsSettings from "./VisitorMetricsSettings";
import styles from "./VisitorSettingsOverlay.module.css";

// The authorized dashboard mounts this component only while an admin opens it.
export default function VisitorSettingsOverlay({ onClose, trigger }: {
  onClose: () => void; trigger: HTMLElement | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const title = useId();
  useFocusTrap(panel, true, { preventInitialScroll: true });
  useEffect(() => {
    const unlock = lockBodyScroll();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    const focusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) {
        panel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
      }
    };
    // During config loading/saving, disabled inputs must not become trap ends.
    const trapEnabled = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]") ?? [])]
        .filter(node => !node.matches(":disabled, [tabindex='-1']") && node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault(); event.stopPropagation();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    const node = panel.current;
    node?.addEventListener("keydown", trapEnabled, true);
    window.addEventListener("keydown", close);
    document.addEventListener("focusin", focusInside);
    return () => {
      unlock();
      window.removeEventListener("keydown", close);
      document.removeEventListener("focusin", focusInside);
      node?.removeEventListener("keydown", trapEnabled, true);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [onClose, trigger]);
  return createPortal(<div className={styles.backdrop} onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className={styles.panel} ref={panel} role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
      <div className={styles.header}>
        <h2 id={title}>Statistikeinstellungen</h2>
        <button type="button" aria-label="Einstellungen schließen" onClick={onClose}><X size={20} aria-hidden /></button>
      </div>
      <div className={styles.scroll}><VisitorMetricsSettings /></div>
    </div>
  </div>, document.body);
}
