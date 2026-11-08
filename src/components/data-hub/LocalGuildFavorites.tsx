import React from "react";
import { Loader2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { LocalGuildPicker } from "./GuildPicker";
import { FavoriteStatusLine } from "./FavoritePlayerFreshness";
import { favoritePlayerDisplay } from "../../lib/data-hub/hubFavoriteDisplayUpdates";
import LocalPlayerFavoriteCard from "./LocalPlayerFavoriteCard";
import GuildCard from "../guilds/GuildCard";
import { prepareGuildCoa } from "../guilds/GuildEmblem";
import { useGuildFavoritesSelection } from "../../lib/data-hub/useGuildFavoritesSelection";
import { guildFavoriteAnchor } from "../../lib/data-hub/hubGuildFavoriteObservation";
import { localEntityPath, safeLocalReturn, DATA_HUB } from "../../lib/data-hub/routes";
import { playerFavoriteAnchor } from "../../lib/data-hub/hubFavoritesContract";
import { useGuildFavoritesEditor, useGuildFavoriteDrag, GuildFavoritesEditButton, GuildFavoriteOrderActions, RemoveGuildSelectionDialog } from "./GuildFavoritesEditor";
import styles from "./LocalGuildFavorites.module.css";
import FavoriteContextMenu, { type FavoriteMenuOrigin, type FavoriteMenuAction } from "./FavoriteContextMenu";
import type { FavoritePlayerAction, PageAction } from "./LocalFavoritesMenu";
import type { FavoriteProjection } from "../../lib/data-hub/hubFavoritesProjection";
import { resolveFavorite } from "../../lib/data-hub/hubFavoritesProjection";
import { loadIdentityResolutionSnapshot } from "../../lib/identities/identityResolution";
import { favoriteReference, referenceKey } from "../../lib/data-hub/hubFavoritesContract";
import { createHubToplistTarget } from "../../lib/data-hub/hubTargetResolver";

/** Committed metadata projection only. Viewing never selects or saves a guild. */
export default function LocalGuildFavorites({ onOpen, action, playerAction, manageable = false, active = true, overviewKind, description }: {
  onOpen?: () => void;
  manageable?: boolean;
  action?: PageAction;
  playerAction?: FavoritePlayerAction;
  active?: boolean;
  overviewKind?: "guild" | "player";
  description?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate(), location = useLocation();
  const favorites = useGuildFavoritesSelection(), projection = favorites.projection;
  const rows = projection.rows.filter(row => overviewKind ? row.favorite.kind === overviewKind : manageable || row.favorite.kind === "guild");
  const guildRows = rows.filter(row => row.favorite.kind === "guild");
  const reorder = React.useCallback((id: string, targetIndex: number) => { void favorites.reorderGuilds(id, targetIndex); }, [favorites.reorderGuilds]);
  const editor = useGuildFavoritesEditor(favorites.selectGuild, favorites.removeGuild);
  const editing = manageable && editor.isEditing;
  const [menu, setMenu] = React.useState<FavoriteMenuOrigin | null>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const live = React.useRef({ menu, projection, playerAction, editing, location, active, action });
  live.current = { menu, projection, playerAction, editing, location, active, action };
  const mounted = React.useRef(false);
  React.useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useLayoutEffect(() => { if (editing || !active) closeMenu(); }, [editing, active, closeMenu]);
  function context(event: React.MouseEvent | React.KeyboardEvent, row: FavoriteProjection) {
    if (!manageable || !active || overviewKind) return;
    if ("key" in event && event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault(); event.stopPropagation();
    if (editing) return;
    const region = event.currentTarget as HTMLElement;
    const trigger = region.querySelector<HTMLElement>("button:not(:disabled)") ?? region;
    const rect = region.getBoundingClientRect();
    setMenu({ id: row.favorite.id, x: "clientX" in event ? event.clientX : rect.left, y: "clientY" in event ? event.clientY : rect.bottom, trigger });
  }
  const validRow = (row: FavoriteProjection) => row.availability === "available" && projection.readyFor(row) && !!row.favorite.reference &&
    row.identity !== "conflict" && !row.favorite.referenceIssue && row.observation?.state !== "ambiguous" &&
    (!row.favorite.historicalAt || !!(row.favorite.kind === "guild" ? guildFavoriteAnchor(row.observation?.effective ?? row.favorite) : playerFavoriteAnchor(row.favorite)));
  const serverSelected = (server: string | undefined) => !!server && !!live.current.action?.toplistServers?.some(selected => selected.toLowerCase() === server.toLowerCase());
  async function runContext(row: FavoriteProjection, mode: FavoriteMenuAction) {
    const origin = menu, recipient = playerAction;
    const allowed = () => mounted.current && live.current.active && live.current.menu === origin && !live.current.editing && live.current.location === location &&
      live.current.projection.readyFor(row) && (mode !== "compare" || live.current.playerAction === recipient);
    if (!validRow(row) || !allowed()) return false;
    const saved = await projection.actionFavorite(row);
    const target = saved?.kind === "player" ? { ...saved, display: favoritePlayerDisplay(row).display } : saved;
    if (!target?.reference || !allowed()) return false;
    if (mode === "compare") {
      if (!recipient?.available || target.kind !== "player") return false;
      if (!await recipient.run(target, allowed)) return false;
      closeMenu(); onOpen?.(); return true;
    }
    let destination;
    if (mode === "toplist" || mode === "toplistAdd" || mode === "toplistReplace") {
      const identity = resolveFavorite(target, await loadIdentityResolutionSnapshot());
      if (identity.identity === "conflict" || !allowed()) return false;
      // The accepted local display selects a server only among proved references.
      const server = favoriteReference(target.kind, "1", target.display.server)?.serverNamespace;
      const refs = [target.reference, ...identity.aliases.map(id => favoriteReference(target.kind, id)).filter((ref): ref is NonNullable<typeof ref> => !!ref)];
      const choices = [...new Map(refs.filter(ref => ref.serverNamespace === (server ?? target.reference!.serverNamespace)).map(ref => [referenceKey(ref), ref])).values()];
      if (choices.length !== 1) return false;
      if (mode === "toplist" && location.pathname === "/data-hub/toplist" && !serverSelected(choices[0].serverNamespace)) return false;
      const selection = mode === "toplistAdd" ? "add" : mode === "toplistReplace" || location.pathname !== "/data-hub/toplist" ? "replace" : "highlight";
      destination = createHubToplistTarget(target.kind, target.display.name ?? "", choices[0].serverNamespace, [choices[0].identifier], null, selection);
    } else destination = { path: localEntityPath(target.kind, target.reference, target.kind === "guild" ? guildFavoriteAnchor(target) : playerFavoriteAnchor(target)), state: {} };
    if (!await projection.actionFavorite(row) || !allowed()) return false;
    const guildLoadingTarget = mode === "profile" ? target.guild : undefined;
    if (guildLoadingTarget) void prepareGuildCoa(guildLoadingTarget.coaString, guildLoadingTarget.name);
    const sameToplist = mode.startsWith("toplist") && location.pathname === destination.path;
    closeMenu(); onOpen?.();
    navigate(destination.path, { replace: sameToplist, state: { ...destination.state,
      returnTo: sameToplist ? safeLocalReturn(location.state?.returnTo) ?? DATA_HUB : location.pathname + location.search,
      profileReturnState: sameToplist ? location.state?.profileReturnState : location.state,
      guildReturnState: sameToplist ? location.state?.guildReturnState : location.state, guildLoadingTarget } });
    return true;
  }
  const drag = useGuildFavoriteDrag(guildRows.map(row => row.favorite.guild?.id ?? row.favorite.id), editing && !favorites.disabled, reorder);
  const addRef = React.useRef<HTMLLIElement>(null), editRef = React.useRef<HTMLDivElement>(null);
  const wasPickerOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasPickerOpen.current && !editor.pickerOpen) (addRef.current ?? editRef.current)?.querySelector<HTMLButtonElement>("button")?.focus();
    wasPickerOpen.current = editor.pickerOpen;
  }, [editor.pickerOpen]);
  const editButton = <GuildFavoritesEditButton showLabel editLabel={t("hubFavorites.manage")} className={styles.editButton} editing={editing} onClick={editor.toggleEditing} />;
  return <>
    {overviewKind && <div ref={editRef} className={styles.overviewDescription}><p>{description}</p>{manageable && editButton}</div>}
    <section aria-label={t(overviewKind ? `hubFavorites.${overviewKind}` : "hubNavigation.favoritesMenu")} data-local-guild-favorites data-local-favorites>
    {manageable && !overviewKind && <div ref={editRef} className={styles.toolbar}>{editButton}</div>}
    {favorites.status === "restoring" && <p role="status">{t("hubFavorites.restoring")}</p>}
    {favorites.status === "saving" && <p role="status">{t("hubFavorites.saving")}</p>}
    {(favorites.error || projection.error) && <p role="alert">{t("hubFavorites.error")} <button type="button" onClick={() => void editor.retry(async () => { const restored = await favorites.retry(); await projection.retry(); return restored; })}>{t("hubFavorites.retry")}</button></p>}
    {favorites.snapshot && !rows.length && <p>{t("hubFavorites.empty")}</p>}
    <fieldset disabled={(editing && favorites.disabled) || !!editor.pendingRemoval} className={styles.controls}>
    <ul className={styles.list}>{rows.map((row, index) => {
      const { favorite, identity, availability } = row;
      const effective = row.observation?.effective ?? favoritePlayerDisplay(row);
      const loading = !projection.readyFor(row) && !projection.error;
      const valid = availability === "available" && (!favorite.historicalAt || !!(favorite.kind === "guild" ? guildFavoriteAnchor(effective) : playerFavoriteAnchor(favorite))) && projection.readyFor(row) && !!effective.reference && identity !== "conflict" && !favorite.referenceIssue && row.observation?.state !== "ambiguous";
      const name = effective.display.name ?? t("hubFavorites.unnamed");
      const guildId = favorite.guild?.id ?? favorite.id;
      const guildIndex = guildRows.findIndex(row => row.favorite.id === favorite.id);
      const placement = drag.dropTarget?.id === guildId ? drag.dropTarget.placement : null;
      return <li key={favorite.id} className={`${styles.item} ${placement ? styles[placement] : ""}`} data-favorite-id={favorite.id}
        onDragOver={event => drag.handleDragOver(event, guildId)}
        onDragLeave={() => drag.setDropTarget(null)} onDrop={event => drag.handleDrop(event, guildId)} onDragEnd={drag.clearDragState}>
        <div className={styles.cardRegion} onContextMenu={event => context(event, row)} onKeyDown={event => context(event, row)}>
        <div className={styles.cardRegion} role="group" aria-label={name} aria-busy={loading} data-favorite-card-region>
        {favorite.kind === "player" ? <LocalPlayerFavoriteCard favorite={effective}
          disabled={!valid || (editing && favorites.disabled)}
          onRemove={editing && !favorites.disabled ? () => void favorites.mutate({ type: "remove", id: favorite.id }) : undefined}
          onClick={() => {
            if (editing || !valid || !favorite.reference) return;
            onOpen?.();
            navigate(localEntityPath("player", favorite.reference, playerFavoriteAnchor(favorite)), { state: { returnTo: location.pathname + location.search } });
          }} /> : <GuildCard name={name} server={effective.display.server ?? effective.reference?.serverNamespace ?? "—"}
          memberCount={effective.display.memberCount} coaString={effective.display.coaString}
          disabled={!valid || (editing && favorites.disabled)} draggable={editing && !favorites.disabled} dragging={drag.draggedGuildId === guildId}
          onDragStart={editing ? event => drag.handleDragStart(event, guildId) : undefined} onDragEnd={drag.clearDragState}
          onRemove={editing && favorite.guild && !favorites.disabled ? () => editor.requestRemoval(favorite.guild!) : undefined}
          removeLabel={t("hubFavorites.removeLabel", { name })}
          selectLabel={`${t("hubNavigation.openGuild")}: ${name}`}
          onClick={async () => {
            if (editing || !valid) return;
            const target = await projection.actionFavorite(row);
            if (!target?.reference) return;
            onOpen?.();
            const guildLoadingTarget = target.guild;
            if (guildLoadingTarget) void prepareGuildCoa(guildLoadingTarget.coaString, guildLoadingTarget.name);
            navigate(localEntityPath("guild", target.reference, guildFavoriteAnchor(target)), { state: { returnTo: location.pathname + location.search, guildLoadingTarget } });
          }} />}
          {loading && <span className={styles.loadingOverlay} data-favorite-loading role="status">
            <Loader2 size={24} className={styles.spinner} aria-hidden="true" />
            <span className={styles.srOnly}>{t("hubFavorites.identity.checking")}</span>
          </span>}
        </div>
        </div>
        <FavoriteStatusLine row={row} ready={projection.readyFor(row)} error={projection.error} />
        {favorite.kind === "guild" && (projection.error || row.observation?.state === "ambiguous") && <p className={styles.status} data-favorite-observation={loading ? "checking" : projection.error ? "error" : row.observation?.state ?? "stored"}>{t(`hubFavorites.observation.${loading ? "checking" : projection.error ? "error" : row.observation?.state ?? "stored"}`)}</p>}
        {!editing && action && action.showBelowCard !== false && effective.guild && <button type="button" disabled={!valid} data-local-favorite-page-action onClick={async () => { const target = await projection.actionFavorite(row); if (target) { onOpen?.(); await action.run(target); } }}>{action.label}</button>}
        {editing && favorite.kind === "player" && <div className={styles.actions}>
          <button type="button" disabled={favorites.disabled || index === 0} aria-label={t("hubFavorites.upLabel", { name })}
            onClick={() => void favorites.mutate({ type: "move", id: favorite.id, direction: -1, ...(overviewKind ? { withinKind: overviewKind } : {}) })}>{t("hubFavorites.up")}</button>
          <button type="button" disabled={favorites.disabled || index === rows.length - 1} aria-label={t("hubFavorites.downLabel", { name })}
            onClick={() => void favorites.mutate({ type: "move", id: favorite.id, direction: 1, ...(overviewKind ? { withinKind: overviewKind } : {}) })}>{t("hubFavorites.down")}</button>
        </div>}
        {editing && favorite.kind === "guild" && <div className={styles.actions}>
          <GuildFavoriteOrderActions name={name} index={guildIndex} count={guildRows.length} disabled={favorites.disabled}
            onReorder={targetIndex => reorder(guildId, targetIndex)} />
        </div>}
      </li>;
    })}
      {editing && !overviewKind && <li ref={addRef} className={styles.item}><GuildCard kind="add" disabled={favorites.disabled} active={editor.pickerOpen}
        label={t("hubNavigation.addGuild")} selectLabel={t("hubNavigation.addGuild")} onClick={editor.togglePicker} /></li>}
    </ul>
    </fieldset>
    {menu && !editing && active && (() => {
      const row = rows.find(row => row.favorite.id === menu.id);
      return row && <FavoriteContextMenu key={`${menu.id}:${menu.x}:${menu.y}`} origin={menu} valid={validRow(row)}
        canHighlight={location.pathname !== "/data-hub/toplist" || serverSelected(favoriteReference(row.favorite.kind, "1", (row.observation?.effective ?? favoritePlayerDisplay(row)).display.server)?.serverNamespace ?? row.favorite.reference?.serverNamespace)}
        compare={row.favorite.kind === "player" && !!playerAction?.available} run={mode => runContext(row, mode)} close={closeMenu} />;
    })()}
    {editing && !overviewKind && editor.pickerOpen && <LocalGuildPicker selectedGuildIds={new Set(guildRows.map(row => row.favorite.guild?.id ?? row.favorite.id))}
      disabled={favorites.disabled} onSelectGuild={editor.selectGuild} onClose={editor.closePicker} />}
    {editor.pendingRemoval && <RemoveGuildSelectionDialog guild={editor.pendingRemoval} returnFocus={editor.returnFocus.current}
      disabled={favorites.disabled} error={favorites.error} onRetry={() => void editor.retry(favorites.retry)}
      onCancel={editor.cancelRemoval} onConfirm={() => void editor.confirmRemoval()} />}
  </section></>;
}
