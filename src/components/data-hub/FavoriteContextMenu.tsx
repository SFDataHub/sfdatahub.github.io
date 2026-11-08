import React from "react";
import { useTranslation } from "react-i18next";
import { menuKeys, positionCascade } from "../ui/shared/cascadeMenu";
import styles from "../../pages/Toplists/ToplistViewControls.module.css";

export type FavoriteMenuOrigin = { id: string; x: number; y: number; trigger: HTMLElement };
export type FavoriteMenuAction = "profile" | "toplist" | "toplistAdd" | "toplistReplace" | "compare";

/** Rendered inside the favorites dialog so its focus trap includes both levels. */
export default function FavoriteContextMenu({ origin, valid, compare, canHighlight, run, close }: {
  origin: FavoriteMenuOrigin; valid: boolean; compare: boolean; canHighlight: boolean;
  run: (action: FavoriteMenuAction) => Promise<boolean>;
  close: () => void;
}) {
  const { t } = useTranslation();
  const panel = React.useRef<HTMLDivElement>(null), levels = React.useRef<(HTMLDivElement | null)[]>([]);
  const [opened, setOpened] = React.useState<"profile" | "toplist" | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(false);
  const focusChild = React.useRef(false);
  const dismiss = React.useCallback(() => { origin.trigger.focus(); close(); }, [origin, close]);
  React.useLayoutEffect(() => {
    const position = () => positionCascade(levels.current, origin);
    position();
    if (focusChild.current) { levels.current[1]?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); focusChild.current = false; }
    window.addEventListener("resize", position);
    // Scrolling the dialog must not leave a menu attached to another card.
    const scroll = (event: Event) => { if (!panel.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", position); document.removeEventListener("scroll", scroll, true); };
  }, [origin, opened, busy, error, dismiss]);
  React.useLayoutEffect(() => { levels.current[0]?.querySelector<HTMLButtonElement>("button")?.focus(); }, []);
  React.useEffect(() => {
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) close(); };
    // A pending action disables its button and the browser can move focus to
    // body. Escape still belongs to this menu before the surrounding dialog.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [close, dismiss]);
  const open = (level: "profile" | "toplist", focus = false) => {
    if (focus && opened === level) levels.current[1]?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    else { focusChild.current = focus; setOpened(level); }
  };
  async function execute(action: FavoriteMenuAction) {
    if (busy) return;
    setBusy(true); setError(false);
    try { if (!await run(action)) { setError(true); setBusy(false); } }
    catch { setError(true); setBusy(false); }
  }
  function keys(event: React.KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); dismiss(); return; }
    const level = (event.target as HTMLElement).dataset.favoriteMenuLevel;
    if (event.key === "ArrowRight" && (level === "profile" || level === "toplist")) { event.preventDefault(); open(level, true); return; }
    if (event.key === "ArrowLeft" && levels.current[1]?.contains(event.target as Node)) {
      event.preventDefault(); levels.current[0]?.querySelector<HTMLButtonElement>(`[data-favorite-menu-level="${opened}"]`)?.focus(); setOpened(null); return;
    }
    menuKeys(event, dismiss);
  }
  return <div ref={panel} data-favorite-context-menu onKeyDown={keys} onClick={event => event.stopPropagation()}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div ref={el => { levels.current[0] = el; }} role="menu" aria-label={t("hubFavorites.context.label")} className={`${styles.menu} ${styles.cascade}`} aria-busy={busy}>
      {(["profile", "toplist"] as const).map(level => <button key={level} type="button" role="menuitem" data-favorite-menu-level={level}
        aria-haspopup="menu" aria-expanded={opened === level} onMouseEnter={() => open(level)} onFocus={() => { if (opened) open(level); }}
        onClick={() => open(level, true)}>{t(`hubFavorites.context.${level}`)} <span aria-hidden>›</span></button>)}
      {error && <div role="alert">{t("hubFavorites.context.failed")}</div>}
    </div>
    {opened && <div ref={el => { levels.current[1] = el; }} role="menu" aria-label={t(`hubFavorites.context.${opened}`)} className={`${styles.menu} ${styles.cascade}`}>
      {opened === "profile" ? <>
        <button type="button" role="menuitem" disabled={!valid || busy} onClick={() => void execute("profile")}>{t("hubFavorites.context.showProfile")}</button>
        {compare && <button type="button" role="menuitem" disabled={!valid || busy} onClick={() => void execute("compare")}>{t("hubFavorites.context.compare")}</button>}
      </> : <>
        <button type="button" role="menuitem" disabled={!valid || !canHighlight || busy} onClick={() => void execute("toplist")}>{t("hubFavorites.context.showToplist")}</button>
        <button type="button" role="menuitem" disabled={!valid || busy} onClick={() => void execute("toplistAdd")}>{t("hubFavorites.context.addServer")}</button>
        <button type="button" role="menuitem" disabled={!valid || busy} onClick={() => void execute("toplistReplace")}>{t("hubFavorites.context.onlyServer")}</button>
      </>}
    </div>}
  </div>;
}
