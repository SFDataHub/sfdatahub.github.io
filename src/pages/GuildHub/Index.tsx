// src/pages/GuildHub/Index.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import { guildFavorite } from "../../lib/data-hub/hubFavoritesContract";
import { localEntityPath } from "../../lib/data-hub/routes";
import { Link, useLocation } from "react-router-dom";
import { useAnalyticsConstructionAccess } from "../../lib/data-hub/constructionAccess";
import ContentShell from "../../components/ContentShell"; // <- korrigierter Pfad
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import GuildCard from "../../components/guilds/GuildCard";
import { guildIconByIdentifier } from "../../data/guilds";
import { useGuildHubSelection, type GuildHubSelectedGuild } from "./hooks/useGuildHubSelection";
import { useGuildHubLocalScanState, GuildPicker, type LocalScanState } from "../../components/data-hub/GuildPicker";
import { useGuildFavoritesEditor, useGuildFavoriteDrag, GuildFavoritesEditButton, GuildFavoriteOrderActions, RemoveGuildSelectionDialog } from "../../components/data-hub/GuildFavoritesEditor";
import { GUILD_HUB_NAV_ITEMS } from "../DataHub/localToplistPageModel";
import styles from "./Index.module.css";
import favoriteStyles from "../../components/data-hub/GuildFavoritesEditor.module.css";

export default function GuildHubIndex() {
  const localScanState = useGuildHubLocalScanState();
  const hasLocalGuildScans = localScanState.summaries.length > 0;
  const scanDependentDisabled = !localScanState.loading && !localScanState.error && !hasLocalGuildScans;
  const selection = useGuildHubSelection("guild-hub");

  return (
    <ContentShell centerFramed={false}>
      <div className={styles.startContent}>
        <SectionDividerHeader title="Guild Hub" />
        <GuildSelectionPanel
          localScanState={localScanState}
          scanDependentDisabled={scanDependentDisabled}
          selection={selection}
        />
        <GuildHubTileMenu scanDependentDisabled={scanDependentDisabled} />
      </div>
    </ContentShell>
  );
}

function GuildSelectionPanel({
  localScanState,
  scanDependentDisabled,
  selection,
}: {
  localScanState: LocalScanState;
  scanDependentDisabled: boolean;
  selection: ReturnType<typeof useGuildHubSelection>;
}) {
  const { t } = useTranslation();
  const { canAccess: canOpenAnalytics } = useAnalyticsConstructionAccess();
  const location = useLocation();
  const editor = useGuildFavoritesEditor(selection.selectGuild, selection.removeGuild);
  const { pickerOpen, isEditing: isEditingGuildSelection, pendingRemoval: guildPendingRemoval } = editor;
  return (
    <section className={styles.guildSelectionPanel}>
      <div className={styles.guildSelectionHeader}>
        <div className={styles.sectionKicker}>Gildenauswahl</div>
        <GuildFavoritesEditButton editing={isEditingGuildSelection} onClick={editor.toggleEditing} editLabel="Gildenauswahl bearbeiten" />
      </div>
      {selection.contextIssue && <p role="alert">{t(`pageContext.${selection.contextIssue}`)}</p>}
      {selection.context.guild && <button type="button" onClick={() => selection.chooseGuild(null)}>{t("pageContext.clear")}</button>}
      {selection.error && <p role="alert">Favoriten konnten nicht gespeichert oder geladen werden. <button type="button" onClick={() => void editor.retry(selection.retry)}>Erneut versuchen</button></p>}
      {selection.activeGuild && <div className={styles.guildSelectionHeader}>
        {guildFavorite(selection.activeGuild, 0, null, false).reference && <Link to={localEntityPath("guild", guildFavorite(selection.activeGuild, 0, null, false).reference!)} state={{ returnTo: "/data-hub/guild-hub", guildLoadingTarget: selection.activeGuild }}>{t("localProfileRoute.openGuild")}</Link>}
        {canOpenAnalytics ? <Link to="/data-hub/analytics" state={{ guildFeatureTarget: { feature: "guild-analytics", guild: selection.activeGuild }, guildFeatureTargetKey: `guild-analytics:${crypto.randomUUID()}`, returnTo: "/data-hub/guild-hub" }}>Analytics · {selection.activeGuild.name}</Link> : <a role="link" aria-disabled="true" tabIndex={0}>Analytics · {selection.activeGuild.name}</a>}
        <Link to="/data-hub/guild-hub/fight-tracking" state={{ guildFeatureTarget: { feature: "fight-tracking", guild: selection.activeGuild }, guildFeatureTargetKey: `fight-tracking:${crypto.randomUUID()}`, returnTo: location.pathname + location.search, profileReturnState: location.state }}>Fight Tracking · {selection.activeGuild.name}</Link>
      </div>}
      <fieldset disabled={selection.disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <GuildSlot
        activeGuildId={selection.activeGuildId}
        selectedGuilds={selection.selectedGuilds}
        isEditing={isEditingGuildSelection}
        pickerOpen={pickerOpen}
        localScanState={localScanState}
        scanDependentDisabled={scanDependentDisabled}
        onSelectActiveGuild={selection.selectContextGuild}
        onSelectGuild={editor.selectGuild}
        onReorderGuild={selection.reorderGuilds}
        onRequestRemoveGuild={editor.requestRemoval}
        onTogglePicker={editor.togglePicker}
        onClosePicker={editor.closePicker}
      />
      </fieldset>
      {guildPendingRemoval && !selection.disabled ? (
        <RemoveGuildSelectionDialog
          guild={guildPendingRemoval} returnFocus={editor.returnFocus.current}
          onCancel={editor.cancelRemoval}
          onConfirm={editor.confirmRemoval}
        />
      ) : null}
    </section>
  );
}

function GuildHubTileMenu({ scanDependentDisabled }: { scanDependentDisabled: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { canAccess: canOpenAnalytics } = useAnalyticsConstructionAccess();
  return (
    <section className={styles.tileGrid} aria-label="Guild-Hub-Bereiche">
      {GUILD_HUB_NAV_ITEMS.map((item) => (
        <Tile
          key={item.to}
          to={item.to}
          state={item.to === "/data-hub/guild-hub/fight-tracking"
            ? { returnTo: location.pathname + location.search, profileReturnState: location.state } : undefined}
          title={t(item.titleKey, item.titleFallback)}
          desc={t(item.descKey, item.descFallback)}
          disabled={item.requiresLocalScans && scanDependentDisabled}
          constructionBlocked={item.to === "/data-hub/analytics" && !canOpenAnalytics}
          nudge={item.to === "/data-hub/guild-hub/import" && scanDependentDisabled}
        />
      ))}
    </section>
  );
}

function GuildSlot({
  selectedGuilds,
  activeGuildId,
  isEditing,
  pickerOpen,
  localScanState,
  scanDependentDisabled,
  onSelectActiveGuild,
  onSelectGuild,
  onReorderGuild,
  onRequestRemoveGuild,
  onTogglePicker,
  onClosePicker,
}: {
  selectedGuilds: GuildHubSelectedGuild[];
  activeGuildId: string | null;
  isEditing: boolean;
  pickerOpen: boolean;
  localScanState: LocalScanState;
  scanDependentDisabled: boolean;
  onSelectActiveGuild: (id: string) => void;
  onSelectGuild: (guild: GuildHubSelectedGuild) => void;
  onReorderGuild: (sourceId: string, targetIndex: number) => void;
  onRequestRemoveGuild: (guild: GuildHubSelectedGuild) => void;
  onTogglePicker: () => void;
  onClosePicker: () => void;
}) {
  const { draggedGuildId, dropTarget, setDropTarget, clearDragState, handleDragStart, handleDragOver, handleDrop } =
    useGuildFavoriteDrag(selectedGuilds.map(guild => guild.id), isEditing, onReorderGuild);

  return (
    <div>
      <div className={favoriteStyles.guildCardGrid}>
        {selectedGuilds.map((guild) => {
          const dropPlacement = dropTarget?.id === guild.id ? dropTarget.placement : null;
          return (
            <div
              key={guild.id}
              className={[
                favoriteStyles.guildCardItem,
                isEditing ? favoriteStyles.guildCardItemEditing : "",
                draggedGuildId === guild.id ? favoriteStyles.guildCardItemDragging : "",
                dropPlacement === "before" ? favoriteStyles.guildCardDropBefore : "",
                dropPlacement === "after" ? favoriteStyles.guildCardDropAfter : "",
              ].filter(Boolean).join(" ")}
              onDragOver={(event) => handleDragOver(event, guild.id)}
              onDragLeave={() => setDropTarget((current) => (current?.id === guild.id ? null : current))}
              onDrop={(event) => handleDrop(event, guild.id)}
              onDragEnd={clearDragState}
            >
              <GuildCard
                name={guild.name}
                server={guild.server}
                memberCount={guild.memberCount}
                memberLimit={50}
                coaString={guild.coaString}
                emblemUrl={guildIconByIdentifier(guild.logoIdentifier, 128).thumb || undefined}
                fallbackLabel={guild.name.trim().charAt(0).toUpperCase() || "G"}
                active={guild.id === activeGuildId}
                draggable={isEditing}
                dragging={draggedGuildId === guild.id}
                onClick={isEditing ? undefined : () => onSelectActiveGuild(guild.id)}
                onDragStart={isEditing ? (event) => handleDragStart(event, guild.id) : undefined}
                onDragEnd={clearDragState}
                onRemove={isEditing ? () => onRequestRemoveGuild(guild) : undefined}
                removeLabel={`${guild.name} aus Guild Hub entfernen`}
              />
              {isEditing && <GuildFavoriteOrderActions name={guild.name} index={selectedGuilds.indexOf(guild)} count={selectedGuilds.length}
                onReorder={targetIndex => onReorderGuild(guild.id, targetIndex)} />}
            </div>
          );
        })}
        <GuildCard
          kind="add"
          active={pickerOpen}
          label="Gilde hinzufügen"
          selectLabel="Gilde hinzufügen"
          onClick={onTogglePicker}
        />
      </div>

      {pickerOpen ? (
        <GuildPicker
          selectedGuildIds={new Set(selectedGuilds.map((guild) => guild.id))}
          localScanState={localScanState}
          showImportHint={scanDependentDisabled}
          onSelectGuild={onSelectGuild}
          onClose={onClosePicker}
        />
      ) : null}
    </div>
  );
}

function Tile({
  to,
  state,
  title,
  desc,
  disabled = false,
  nudge = false,
  constructionBlocked = false,
}: {
  to: string;
  state?: unknown;
  title: string;
  desc?: string;
  disabled?: boolean;
  nudge?: boolean;
  constructionBlocked?: boolean;
}) {
  const className = `${styles.menuTile} ${disabled ? styles.disabledTile : ""} ${nudge ? styles.importNudge : ""}`;
  const content = (
    <>
      <div className={styles.menuTileTitle}>{title}</div>
      {desc ? <div className={styles.menuTileDesc}>{desc}</div> : null}
    </>
  );

  if (disabled) {
    return (
      <span role="link" aria-disabled="true" title="Import needed" className={className}>
        {content}
      </span>
    );
  }

  if (constructionBlocked) {
    return <span role="link" aria-disabled="true" tabIndex={0} className={className}>{content}</span>;
  }

  return (
    <Link to={to} state={state} className={className}>
      {content}
    </Link>
  );
}
