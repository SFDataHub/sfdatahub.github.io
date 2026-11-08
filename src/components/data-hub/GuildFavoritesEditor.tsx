import React from "react";
import { Check, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { GuildHubSelectionGuild as GuildHubSelectedGuild } from "../../lib/guilds/localScanLibrary";
import styles from "./GuildFavoritesEditor.module.css";

/** Shared editor state; late commits never reopen a cancelled picker. */
export function useGuildFavoritesEditor(save: (guild: GuildHubSelectedGuild) => Promise<boolean>, remove: (id: string) => Promise<boolean>) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [pendingRemoval, setPendingRemoval] = React.useState<GuildHubSelectedGuild | null>(null);
  const generation = React.useRef(0);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const requestRemoval = React.useCallback((guild: GuildHubSelectedGuild) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setPendingRemoval(guild);
  }, []);
  React.useEffect(() => () => { generation.current++; }, []);
  const closePicker = React.useCallback(() => { generation.current++; setPickerOpen(false); }, []);
  const togglePicker = React.useCallback(() => { generation.current++; setPickerOpen(open => !open); }, []);
  const toggleEditing = React.useCallback(() => {
    generation.current++; setPickerOpen(false); setPendingRemoval(null); setIsEditing(editing => !editing);
  }, []);
  const selectGuild = React.useCallback(async (guild: GuildHubSelectedGuild) => {
    const attempt = generation.current;
    if (await save(guild) && attempt === generation.current) setPickerOpen(false);
  }, [save]);
  const confirmRemoval = React.useCallback(async () => {
    if (!pendingRemoval) return;
    const attempt = generation.current;
    if (await remove(pendingRemoval.id) && attempt === generation.current) setPendingRemoval(null);
  }, [pendingRemoval, remove]);
  const cancelRemoval = React.useCallback(() => { generation.current++; setPendingRemoval(null); }, []);
  const retry = React.useCallback(async (operation: () => Promise<boolean>) => {
    const attempt = generation.current;
    if (await operation() && attempt === generation.current) { setPendingRemoval(null); setPickerOpen(false); }
  }, []);
  return { retry, pickerOpen, isEditing, pendingRemoval, closePicker, togglePicker, toggleEditing,
    selectGuild, returnFocus, requestRemoval, confirmRemoval, cancelRemoval };
}

export function GuildFavoritesEditButton({ editing, onClick, editLabel, showLabel = false, className }: { editing: boolean; onClick: () => void; editLabel?: string; showLabel?: boolean; className?: string }) {
  const { t } = useTranslation();
  const label = editing ? t("hubNavigation.finishEditing") : editLabel ?? t("hubNavigation.manage");
  return <button type="button" className={`${styles.guildSelectionEditButton} ${className ?? ""}`} data-guild-favorites-edit
    aria-pressed={editing} aria-label={label} title={label} onClick={onClick}>
    {editing ? <Check size={14} aria-hidden /> : <Pencil size={13} aria-hidden />} {showLabel && label}
  </button>;
}

export function GuildFavoriteOrderActions({ name, index, count, disabled = false, onReorder }: {
  name: string; index: number; count: number; disabled?: boolean; onReorder: (targetIndex: number) => void;
}) {
  const { t } = useTranslation();
  return <div>
    <button type="button" className={styles.guildSelectionEditButton} disabled={disabled || index === 0}
      aria-label={t("hubFavorites.upLabel", { name })} onClick={() => onReorder(index - 1)}>↑</button>
    <button type="button" className={styles.guildSelectionEditButton} disabled={disabled || index === count - 1}
      aria-label={t("hubFavorites.downLabel", { name })} onClick={() => onReorder(index + 2)}>↓</button>
  </div>;
}

export function useGuildFavoriteDrag(guildIds: string[], isEditing: boolean, onReorderGuild: (id: string, targetIndex: number) => void) {
  const [draggedGuildId, setDraggedGuildId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; placement: "before" | "after" } | null>(null);

  const clearDragState = React.useCallback(() => {
    setDraggedGuildId(null);
    setDropTarget(null);
  }, []);

  const handleDragStart = React.useCallback((event: React.DragEvent<HTMLButtonElement>, guildId: string) => {
    if (!isEditing) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", guildId);
    setDraggedGuildId(guildId);
  }, [isEditing]);

  const handleDragOver = React.useCallback((event: React.DragEvent<HTMLElement>, targetGuildId: string) => {
    if (!isEditing || !draggedGuildId || draggedGuildId === targetGuildId) {
      setDropTarget(null);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropTarget({ id: targetGuildId, placement });
  }, [draggedGuildId, isEditing]);

  const handleDrop = React.useCallback((event: React.DragEvent<HTMLElement>, targetGuildId: string) => {
    if (!isEditing) return;
    event.preventDefault();

    const sourceId = draggedGuildId ?? event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetGuildId) {
      clearDragState();
      return;
    }

    const targetIndex = guildIds.indexOf(targetGuildId);
    if (targetIndex < 0) {
      clearDragState();
      return;
    }

    const placement = dropTarget?.id === targetGuildId ? dropTarget.placement : "before";
    onReorderGuild(sourceId, targetIndex + (placement === "after" ? 1 : 0));
    clearDragState();
  }, [clearDragState, draggedGuildId, dropTarget, isEditing, onReorderGuild, guildIds]);

  React.useEffect(() => { if (!isEditing) clearDragState(); }, [isEditing, clearDragState]);
  return { draggedGuildId, dropTarget, setDropTarget, clearDragState, handleDragStart, handleDragOver, handleDrop };
}

export function RemoveGuildSelectionDialog({
  guild,
  onCancel,
  onConfirm,
  disabled = false,
  error,
  onRetry,
  returnFocus,
}: {
  guild: GuildHubSelectedGuild;
  onCancel: () => void;
  onConfirm: () => void;
  disabled?: boolean;
  error?: string | null;
  onRetry?: () => void;
  returnFocus?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap(ref, true);
  React.useLayoutEffect(() => {
    const stopTab = (event: KeyboardEvent) => { if (event.key === "Tab") event.stopPropagation(); };
    const node = ref.current;
    node?.addEventListener("keydown", stopTab);
    const previous = returnFocus ?? document.activeElement as HTMLElement | null;
    const fallback = document.querySelector<HTMLElement>("#local-favorites-dialog [data-guild-favorites-edit], [data-guild-favorites-edit]");
    return () => {
      node?.removeEventListener("keydown", stopTab);
      queueMicrotask(() => { if (!node?.isConnected) (previous?.isConnected ? previous : fallback?.isConnected ? fallback : null)?.focus(); });
    };
  }, [returnFocus]);
  return (
    <div className={styles.confirmOverlay} role="presentation">
      <div ref={ref}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } }}
        className={styles.confirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div>
          <h2 id={titleId} className={styles.confirmTitle}>
            {t("hubNavigation.removeGuildTitle")}
          </h2>
          <p className={styles.confirmGuildName}>{guild.name}</p>
          <p className={styles.confirmText}>
            {t("hubNavigation.removeGuildHint")}
          </p>
        </div>
        {error && <p role="alert">{t("hubFavorites.error")} {onRetry && <button type="button" onClick={onRetry}>{t("hubFavorites.retry")}</button>}</p>}
        <div className={styles.confirmActions}>
          <button type="button" className={styles.confirmCancelButton} onClick={onCancel}>
            {t("hubNavigation.cancel")}
          </button>
          <button type="button" className={styles.confirmRemoveButton} disabled={disabled} onClick={onConfirm}>
            {t("hubFavorites.remove")}
          </button>
        </div>
      </div>
    </div>
  );
}

