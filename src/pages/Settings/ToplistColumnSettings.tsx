import { playerAttributeColumn, attributeColumnLabel, ATTRIBUTE_BONUSES } from "../../lib/toplists/playerAttributeColumns";
import { toplistColumnTree, type ToplistCatalogNode } from "../../lib/toplists/toplistColumns";
import { useTranslation } from "react-i18next";
import { toplistColumns, normalizeColumnViewDraft, newToplistView, uniqueToplistViewName, type ToplistKind, type ToplistColumnView } from "../../lib/toplists/toplistColumns";
import styles from "./LocalSettings.module.css";

export default function ToplistColumnSettings({ kind, value, onChange }: { kind: ToplistKind; value: ToplistColumnView; onChange: (value: ToplistColumnView) => void }) {
  const { t } = useTranslation();
  const catalog = toplistColumns(kind);
  const label = (key: string) => playerAttributeColumn(key) ? attributeColumnLabel(playerAttributeColumn(key)!, t) : t(`toplists.columns.${key === "name" && kind === "players" ? "player" : key}`, catalog.find(c => c.key === key)?.label ?? key);
  const active = value.views.find(v => v.id === value.activeId);
  function updateColumns(columns: string[]) {
    onChange(normalizeColumnViewDraft({ ...value, views: value.views.map(v => v.id === value.activeId ? { ...v, columns } : v) }, kind));
  }
  function create(copy: boolean) {
    const currentName = value.views.find(v => v.id === value.activeId)?.name ?? t("localSettings.toplists.default");
    const name = uniqueToplistViewName(value, copy ? t("localSettings.toplists.copyOf", { name: currentName }) : t("localSettings.toplists.custom"));
    onChange(newToplistView(value, kind, name, copy));
  }
  function move(index: number, offset: number) {
    const columns = [...value.columns];
    [columns[index], columns[index + offset]] = [columns[index + offset], columns[index]];
    updateColumns(columns);
  }
  function renderNodes(nodes: ToplistCatalogNode[]) {
    return nodes.map(node => node.column ? <label key={node.key} className={styles.columnChoice}>
      <input type="checkbox" checked={value.columns.includes(node.key)} disabled={node.key === "name"} onChange={e => updateColumns(e.target.checked ? [...value.columns, node.key] : value.columns.filter(k => k !== node.key))} />{playerAttributeColumn(node.key) ? attributeColumnLabel(playerAttributeColumn(node.key)!, t, true) : label(node.key)}
    </label> : <details key={node.key}>
      <summary>{["rankings", "identity", "attributes", "progress", "fortress"].includes(node.key) ? t(`localSettings.toplists.categories.${node.key}`) : t(`toplists.attributeCatalog.groups.${node.key}`, ATTRIBUTE_BONUSES.find(b => b[0] === node.key)?.[1] ?? node.key)}</summary>
      {renderNodes(node.children)}
    </details>);
  }
  return <fieldset className={styles.columnSettings}>
    <legend>{t(`localSettings.toplists.${kind}`)}</legend>
    <label>{t("localSettings.toplists.view")} <select value={value.activeId} onChange={e => onChange(normalizeColumnViewDraft({ ...value, activeId: e.target.value }, kind))}>
      <option value="default">{t("localSettings.toplists.default")}</option>
      {value.views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select></label>
    <button type="button" onClick={() => create(false)}>{t("localSettings.toplists.addView")}</button>
    <button type="button" onClick={() => create(true)}>{t("localSettings.toplists.copyView")}</button>
    {active && <>
      <label>{t("localSettings.toplists.viewName")} <input value={active.name} required aria-invalid={!active.name.trim()} aria-describedby={!active.name.trim() ? `${kind}-view-name-error` : undefined} onChange={e => onChange({ ...value, views: value.views.map(v => v.id === active.id ? { ...v, name: e.target.value } : v) })} /></label>
      {!active.name.trim() && <p id={`${kind}-view-name-error`}>{t("localSettings.toplists.nameRequired")}</p>}
      <button type="button" onClick={() => onChange(normalizeColumnViewDraft({ ...value, views: value.views.filter(v => v.id !== active.id) }, kind))}>{t("localSettings.toplists.deleteView")}</button>
    </>}
    {value.mode === "custom" && <div className={styles.columnPicker}>
      <div><h3>{t("localSettings.toplists.available")}</h3>
        {renderNodes(toplistColumnTree(kind))}
      </div>
      <div><h3>{t("localSettings.toplists.selected")}</h3><ol className={styles.selectedColumns}>
        {value.columns.map((key, index) => <li key={key}><span>{label(key)}</span>
          <button type="button" disabled={index === 0} aria-label={t("localSettings.toplists.up", { column: label(key) })} onClick={() => move(index, -1)}>↑</button>
          <button type="button" disabled={index === value.columns.length - 1} aria-label={t("localSettings.toplists.down", { column: label(key) })} onClick={() => move(index, 1)}>↓</button>
          <button type="button" disabled={key === "name"} aria-label={t("localSettings.toplists.remove", { column: label(key) })} onClick={() => updateColumns(value.columns.filter(k => k !== key))}>×</button>
        </li>)}
      </ol></div>
    </div>}
  </fieldset>;
}
