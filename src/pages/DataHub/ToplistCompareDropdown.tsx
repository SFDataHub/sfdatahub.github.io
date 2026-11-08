import { useAnalyticsView } from "../../lib/analytics/localEvents";
import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CompareControls, { type CompareControlsProps } from "../../components/Filters/CompareControls";
import styles from "./Toplist.module.css";

export default function ToplistCompareDropdown(props: CompareControlsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  useAnalyticsView(open ? "datahub/toplist/compare" : null);
  const button = React.useRef<HTMLButtonElement>(null);
  const panel = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ left: 8, top: 8, maxHeight: 400 });
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const menu = panel.current;
      if (!anchor || !menu) return;
      const below = window.innerHeight - anchor.bottom - 16;
      const above = anchor.top - 16;
      const upwards = below < Math.min(menu.scrollHeight, 260) && above > below;
      const maxHeight = Math.max(1, upwards ? above : below);
      setPosition({ left: Math.max(8, Math.min(anchor.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)),
        top: upwards ? Math.max(8, anchor.top - 8 - Math.min(menu.scrollHeight, maxHeight)) : anchor.bottom + 8, maxHeight });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const escape = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus();
  };
  return <>
    <button ref={button} type="button" className={styles.tile} aria-expanded={open}
      aria-controls="local-toplist-compare" onClick={() => setOpen(value => !value)} onKeyDown={escape}>
      <span className={styles.tileTitle}>{t("toplists.compareButton", "Compare")}</span>
    </button>
    {open && createPortal(<div ref={panel} id="local-toplist-compare" role="region"
      aria-label={t("toplists.compareMode", "Compare Mode")} className={`${styles.compareDropdown} sfdatahub-scrollbar`}
      style={position} onKeyDown={escape}>
      <CompareControls {...props} localDropdown />
    </div>, document.body)}
  </>;
}
