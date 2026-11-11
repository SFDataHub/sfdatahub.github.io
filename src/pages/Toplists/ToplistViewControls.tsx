import { menuKeys, positionCascade } from "../../components/ui/shared/cascadeMenu";
import { playerAttributeColumn, attributeColumnLabel, ATTRIBUTE_BONUSES } from "../../lib/toplists/playerAttributeColumns";
import { toplistColumnTree, fixedPlayerColumnKey } from "../../lib/toplists/toplistColumns";
import { requestToplistWidths } from "./useToplistAutoSize";
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { preferencesStore, type PreferencesSnapshot } from "../../lib/settings/preferences";
import { usePreferencesSnapshot } from "../../lib/settings/usePreferences";
import { resizeToplistColumn, editToplistWidths, insertToplistColumn, editToplistColumns, uniqueToplistViewName, newToplistView, normalizeColumnView, type ToplistColumnView, type ToplistKind } from "../../lib/toplists/toplistColumns";
import styles from "./ToplistViewControls.module.css";

type HeaderMenu = { kind: ToplistKind; column: string; x: number; y: number; trigger: HTMLElement; basis: PreferencesSnapshot };
type ResizeCommit = (key: string, width: number, rendered: Record<string, number>, rightKey?: string) => void;
const ResizeContext = createContext<((kind: ToplistKind) => ResizeCommit) | null>(null);
export const useToplistResizeCommit = () => useContext(ResizeContext);

const HeaderContext = createContext<((event: React.MouseEvent | React.KeyboardEvent, kind: ToplistKind, column: string) => void) | null>(null);
export const useToplistHeaderMenu = () => useContext(HeaderContext);

/** Shared saved-view owner; header actions persist directly to the active custom view. */
export function ToplistViewProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<HeaderMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { menu?.trigger.focus(); setMenu(null); };
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menu]);
  const value = menu?.basis.toplistViews[menu.kind];
  const index = menu && value ? value.columns.indexOf(menu.column) : -1;
  function edit(columns: string[]) {
    if (!menu || !value) return;
    const next = editToplistColumns(value, menu.kind, columns, t("localSettings.toplists.copyDefault"));
    save(next);
  }
  function save(next: ToplistColumnView) {
    if (!menu || !value || next === value) return;
    const result = preferencesStore.savePreferences({ toplistViews: { ...menu.basis.toplistViews, [menu.kind]: next } }, menu.basis);
    if (result.status === "saved" || result.status === "unchanged") { setError(null); close(); }
    else { setError(t(result.status === "conflict" ? "localSettings.conflict" : "localSettings.writeError")); if (result.status === "conflict") setMenu(null); }
  }
  async function autoSize(all: boolean) {
    if (!menu || !value) return;
    const measured = await requestToplistWidths(menu.kind, menu.trigger);
    const cells = menu.trigger.parentElement?.children;
    const changed = Object.fromEntries(Object.entries(measured).filter(([key, width]) => {
      const i = value.columns.indexOf(key);
      return (all || key === menu.column) && i >= 0 && Math.abs((cells?.[i]?.getBoundingClientRect().width ?? 0) - width) > 0.5;
    }));
    const widths = changed;
    const next = editToplistWidths(value, menu.kind, widths, t("localSettings.toplists.copyDefault"));
    if (next === value) { close(); return; }
    save(next);
  }
  return <ResizeContext.Provider value={kind => {
    const basis = preferencesStore.refresh();
    return (key, width, rendered, rightKey) => {
      const next = resizeToplistColumn(basis.toplistViews[kind], kind, key, width, rendered, t("localSettings.toplists.copyDefault"), rightKey);
      if (next === basis.toplistViews[kind]) return;
      const result = preferencesStore.savePreferences({ toplistViews: { ...basis.toplistViews, [kind]: next } }, basis);
      setError(result.status === "saved" || result.status === "unchanged" ? null : t("localSettings.applyError"));
    };
  }}><HeaderContext.Provider value={(event, kind, column) => {
    event.preventDefault(); event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const x = "clientX" in event ? event.clientX : rect.left;
    const y = "clientY" in event ? event.clientY : rect.bottom;
    setError(null);
    setMenu({ kind, column, x, y, trigger, basis: preferencesStore.refresh() });
  }}>
    {error && !menu && <div role="alert">{error}</div>}
    {children}
    {menu && value && createPortal(<HeaderCascade key={`${menu.kind}:${menu.column}:${menu.x}:${menu.y}`} menu={menu} value={value} index={index} panel={panel} close={close} edit={edit} autoSize={autoSize} error={error} />, document.body)}
  </HeaderContext.Provider></ResizeContext.Provider>;
}

/** Fixed sibling panels keep scrolling local and pointer travel between levels uninterrupted. */
function HeaderCascade({ menu, value, index, panel, close, edit, autoSize, error }: {
  menu: HeaderMenu; value: ToplistColumnView; index: number;
  panel: React.RefObject<HTMLDivElement>; close: () => void; edit: (columns: string[]) => void; autoSize: (all: boolean) => void; error: string | null;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<"insert" | "replace" | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const levels = useRef<(HTMLDivElement | null)[]>([]);
  const focusLevel = useRef<number | null>(0);
  const tree = toplistColumnTree(menu.kind);
  const branches = [tree];
  for (const key of path) {
    const children = branches[branches.length - 1].find(n => n.key === key)?.children;
    if (!children?.length) break;
    branches.push(children);
  }
  function focusMenu(level: number) {
    levels.current[level]?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }
  useLayoutEffect(() => {
    function position() {
      positionCascade(levels.current, menu);
    }
    position();
    if (focusLevel.current !== null) { focusMenu(focusLevel.current); focusLevel.current = null; }
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [adding, path, menu]);
  function openAdd(mode: "insert" | "replace", focus = false) {
    if (mode !== adding) setPath([]);
    setAdding(mode);
    if (focus) { focusLevel.current = 1; if (mode === adding) { focusMenu(1); focusLevel.current = null; } }
  }
  function openBranch(level: number, key: string, focus = false) {
    const next = [...path.slice(0, level - 1), key];
    if (focus) focusLevel.current = level + 1;
    setPath(next);
  }
  function keys(event: React.KeyboardEvent) {
    event.stopPropagation();
    const node = event.target as HTMLElement;
    const level = levels.current.findIndex(el => el === node.closest('[role="menu"]'));
    if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); close(); return; }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (level === 0 && node.dataset.add) openAdd(node.dataset.add as "insert" | "replace", true);
      else if (node.dataset.branch) openBranch(level, node.dataset.branch, true);
      return;
    }
    if (event.key === "ArrowLeft" && level > 0) {
      event.preventDefault();
      levels.current[level - 1]?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus();
      if (level === 1) { setAdding(null); setPath([]); } else setPath(path.slice(0, level - 2));
      return;
    }
    menuKeys(event, close);
  }
  const clear = () => { setAdding(null); setPath([]); };
  const label = (node: (typeof tree)[number]) => {
    if (node.column) {
      const attribute = playerAttributeColumn(node.key);
      return attribute ? attributeColumnLabel(attribute, t, true) : t(`toplists.columns.${node.key === "name" && menu.kind === "players" ? "player" : node.key}`, node.label ?? node.key);
    }
    return ["rankings", "identity", "attributes", "progress", "fortress"].includes(node.key)
      ? t(`localSettings.toplists.categories.${node.key}`)
      : t(`toplists.attributeCatalog.groups.${node.key}`, ATTRIBUTE_BONUSES.find(b => b[0] === node.key)?.[1] ?? node.key);
  };
  const selected = value.columns.map(key => menu.kind === "players" ? fixedPlayerColumnKey(key, value.playerValueMode === "total" ? "total" : "base") : key);
  return <div ref={panel} onKeyDown={keys} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div ref={el => { levels.current[0] = el; }} role="menu" tabIndex={-1} aria-label={t("localSettings.toplists.headerMenu")} className={`${styles.menu} ${styles.cascade}`}>
      {error && <div role="alert">{error}</div>}
      <button data-add="insert" role="menuitem" aria-haspopup="menu" aria-expanded={adding === "insert"} onMouseEnter={() => openAdd("insert")} onClick={() => openAdd("insert", true)}>{t("localSettings.toplists.insertRight")} <span aria-hidden>›</span></button>
      <button data-add="replace" role="menuitem" disabled={menu.column === "name"} aria-haspopup="menu" aria-expanded={adding === "replace"} onMouseEnter={() => { if (menu.column !== "name") openAdd("replace"); }} onClick={() => openAdd("replace", true)}>{t("localSettings.toplists.replaceColumn")} <span aria-hidden>›</span></button>
      <button role="menuitem" onMouseEnter={clear} onFocus={clear} disabled={menu.column === "name"} onClick={() => edit(value.columns.filter(c => c !== menu.column))}>{t("localSettings.toplists.removeColumn")}</button>
      {([-1, 1] as const).map(offset => <button role="menuitem" key={offset} onMouseEnter={clear} onFocus={clear} disabled={index < 0 || index + offset < 0 || index + offset >= value.columns.length} onClick={() => { const next = [...value.columns]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; edit(next); }}>{t(offset < 0 ? "localSettings.toplists.moveLeft" : "localSettings.toplists.moveRight")}</button>)}
      {[false, true].map(all => <button key={String(all)} role="menuitem" onMouseEnter={clear} onFocus={clear} onClick={() => autoSize(all)}>{t(all ? "localSettings.toplists.autoSizeAll" : "localSettings.toplists.autoSizeColumn")}</button>)}
    </div>
    {adding && branches.map((nodes, i) => <div key={i} ref={el => { levels.current[i + 1] = el; }} role="menu" tabIndex={-1} aria-label={i === 0 ? t(adding === "replace" ? "localSettings.toplists.replaceColumn" : "localSettings.toplists.insertRight") : path[i - 1]} className={`${styles.menu} ${styles.cascade}`}>
      {nodes.map(node => node.children.length ? <button key={node.key} data-branch={node.key} role="menuitem" aria-haspopup="menu" aria-expanded={path[i] === node.key} onMouseEnter={() => openBranch(i + 1, node.key)} onFocus={() => { if (path[i] !== node.key) setPath(path.slice(0, i)); }} onClick={() => openBranch(i + 1, node.key, true)}>{label(node)} <span aria-hidden>›</span></button>
        : <button role="menuitem" key={node.key} disabled={selected.includes(node.key)} onMouseEnter={() => setPath(path.slice(0, i))} onClick={() => edit(insertToplistColumn(value.columns, menu.column, node.key, adding === "replace"))}>{label(node)}</button>)}
    </div>)}
  </div>;
}


export default function ToplistViewPicker({ kind }: { kind: ToplistKind }) {
  const { t } = useTranslation();
  const stored = usePreferencesSnapshot();
  const value = stored.toplistViews[kind];
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string; basis: PreferencesSnapshot } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); setActions(null); setRename(null); setError(null); }, [kind]);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setRename(null); } };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  function save(next: ToplistColumnView, basis = stored) {
    const result = preferencesStore.savePreferences({ toplistViews: { ...basis.toplistViews, [kind]: next } }, basis);
    if (result.status === "saved" || result.status === "unchanged") { setError(null); setRename(null); setOpen(false); trigger.current?.focus(); }
    else setError(t(result.status === "conflict" ? "localSettings.conflict" : "localSettings.writeError"));
  }
  function create(copy: boolean) {
    const basis = preferencesStore.refresh();
    const current = basis.toplistViews[kind];
    const currentName = current.views.find(v => v.id === current.activeId)?.name ?? t("localSettings.toplists.default");
    const name = uniqueToplistViewName(current, copy ? t("localSettings.toplists.copyOf", { name: currentName }) : t("localSettings.toplists.custom"));
    save(newToplistView(current, kind, name, copy), basis);
  }
  const close = () => { setRename(null); setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className={styles.picker}>
    <span>{t("localSettings.toplists.display")}</span>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => { setRename(null); setOpen(!open); }}>{value.views.find(v => v.id === value.activeId)?.name ?? t("localSettings.toplists.default")} <span aria-hidden>▾</span></button>
    {open && <div ref={menu} className={styles.menu} role="menu" onKeyDown={event => { if ((event.target as HTMLElement).closest("form")) return; menuKeys(event, close); }}>
      <button role="menuitemradio" aria-checked={value.activeId === "default"} onClick={() => save(normalizeColumnView({ ...value, activeId: "default" }, kind))}>{t("localSettings.toplists.default")}</button>
      {value.views.map(v => <div key={v.id} className={styles.viewRow}>
        <button role="menuitemradio" aria-checked={value.activeId === v.id} onClick={() => save(normalizeColumnView({ ...value, activeId: v.id }, kind))}>{v.name}</button>
        <button role="menuitem" aria-haspopup="menu" aria-expanded={actions === v.id} aria-label={t("localSettings.toplists.viewActions", { name: v.name })} onClick={() => { setRename(null); setActions(actions === v.id ? null : v.id); }}>›</button>
        {actions === v.id && <div className={styles.sideMenu} role="menu">
          {rename?.id === v.id ? <form className={styles.renameForm} onSubmit={event => {
            event.preventDefault();
            if (!rename.name.trim()) return;
            const basisValue = rename.basis.toplistViews[kind];
            save(normalizeColumnView({ ...basisValue, views: basisValue.views.map(view => view.id === v.id ? { ...view, name: rename.name.trim() } : view) }, kind), rename.basis);
          }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); setRename(null); } }}>
            <label>{t("localSettings.toplists.viewName")}<input autoFocus value={rename.name} aria-invalid={!rename.name.trim()} onChange={event => setRename({ ...rename, name: event.target.value })} /></label>
            {!rename.name.trim() && <span role="alert">{t("localSettings.toplists.nameRequired")}</span>}
            <button type="submit" disabled={!rename.name.trim()}>{t("localSettings.save")}</button>
            <button type="button" onClick={() => { setRename(null); setError(null); }}>{t("localSettings.toplists.cancel")}</button>
          </form> : <button role="menuitem" onClick={() => { setError(null); setRename({ id: v.id, name: v.name, basis: stored }); }}>{t("localSettings.toplists.renameView")}</button>}
          <button role="menuitem" onClick={() => save(normalizeColumnView({ ...value, views: value.views.filter(view => view.id !== v.id) }, kind))}>{t("localSettings.toplists.deleteView")}</button>
        </div>}
      </div>)}
      <button role="menuitem" onClick={() => create(false)}>{t("localSettings.toplists.addView")}</button>
      <button role="menuitem" onClick={() => create(true)}>{t("localSettings.toplists.copyView")}</button>
    </div>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
