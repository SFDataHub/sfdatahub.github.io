import { useLocalColumnResize } from "./useLocalColumnResize";
import styles from "./ToplistViewControls.module.css";
import { useToplistHeaderMenu } from "./ToplistViewControls";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toplistColumnLabel, playerColumnSortMatches, toplistColumnDefinition, type ToplistKind, type LocalTableColumnsProps } from "../../lib/toplists/toplistColumns";

export default function LocalSortHeader({ kind, columnKey, localSort, onLocalSort, localValueMode = "base", style, children }: LocalTableColumnsProps & { kind: ToplistKind; columnKey: string; style: CSSProperties; children: ReactNode }) {
  const availableMenu = useToplistHeaderMenu();
  const headerMenu = localSort ? availableMenu : null;
  const resize = useLocalColumnResize(kind, columnKey);
  const { t } = useTranslation();
  const metric = toplistColumnDefinition(kind, columnKey)?.metric;
  const active = metric && localSort && (kind === "players" ? playerColumnSortMatches(metric, localSort.metricKey, localValueMode) : localSort.metricKey === metric);
  return <th data-column-key={columnKey} className={[localSort ? styles.localHeader : "", resize && onLocalSort ? styles.resizableHeader : ""].filter(Boolean).join(" ") || undefined} style={style} tabIndex={headerMenu ? 0 : undefined} onContextMenu={headerMenu ? event => headerMenu(event, kind, columnKey) : undefined} onKeyDown={headerMenu ? event => { if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") headerMenu(event, kind, columnKey); } : undefined} aria-sort={metric && onLocalSort ? active ? localSort?.direction === "asc" ? "ascending" : "descending" : "none" : undefined}>
    {metric && onLocalSort ? <button type="button" className="local-toplist-sort-header" onClick={event => { event.stopPropagation(); onLocalSort(metric); }} aria-label={t("localSettings.toplists.sortColumn", { column: toplistColumnLabel(kind, columnKey, t) })}>
      {children}{active && <span aria-hidden="true">{localSort?.direction === "asc" ? "↑" : "↓"}</span>}
    </button> : children}
    {resize && onLocalSort && <span className={styles.resizeHandle} aria-hidden="true" onPointerDown={resize.resize} onDoubleClick={resize.autoSize} onClick={event => { event.preventDefault(); event.stopPropagation(); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} />}
  </th>;
}
