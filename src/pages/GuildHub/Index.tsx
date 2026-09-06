// src/pages/GuildHub/Index.tsx
import React from "react";
import { Check, Loader2, Minus, Pencil, Plus, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import ContentShell from "../../components/ContentShell"; // <- korrigierter Pfad
import SectionDividerHeader from "../../components/ui/shared/SectionDividerHeader";
import { guildIconByIdentifier } from "../../data/guilds";
import { SERVER_BY_ID } from "../../data/servers";
import {
  listGuildHubLocalGuildsForServerFromScans,
  listGuildHubLocalScans,
  listGuildHubLocalServersFromScans,
  subscribeToSfDataHubLocalScanChanges,
  type GuildHubLocalScan,
} from "../../lib/guilds/localScanLibrary";
import { formatScanDateTimeLabel } from "../../lib/ui/formatScanDateTimeLabel";
import {
  mapLocalGuildIdentityToSelection,
  normalizeText,
  useGuildHubSelection,
  type GuildHubSelectedGuild,
} from "./hooks/useGuildHubSelection";
import styles from "./Index.module.css";

type LocalScanState = {
  scans: GuildHubLocalScan[];
  loading: boolean;
  error: string | null;
};

export default function GuildHubIndex() {
  const localScanState = useGuildHubLocalScanState();
  const hasLocalGuildScans = localScanState.scans.length > 0;
  const scanDependentDisabled = !localScanState.loading && !localScanState.error && !hasLocalGuildScans;
  const selection = useGuildHubSelection();

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
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [isEditingGuildSelection, setIsEditingGuildSelection] = React.useState(false);
  const [guildPendingRemoval, setGuildPendingRemoval] = React.useState<GuildHubSelectedGuild | null>(null);

  const handleSelectGuild = React.useCallback((guild: GuildHubSelectedGuild) => {
    selection.selectGuild(guild);
    setPickerOpen(false);
  }, [selection]);

  const handleToggleEditing = React.useCallback(() => {
    setIsEditingGuildSelection((editing) => !editing);
  }, []);

  const handleRequestRemoveGuild = React.useCallback((guild: GuildHubSelectedGuild) => {
    setGuildPendingRemoval(guild);
  }, []);

  const handleCancelRemoveGuild = React.useCallback(() => {
    setGuildPendingRemoval(null);
  }, []);

  const handleConfirmRemoveGuild = React.useCallback(() => {
    if (!guildPendingRemoval) return;
    selection.removeGuild(guildPendingRemoval.id);
    setGuildPendingRemoval(null);
  }, [guildPendingRemoval, selection]);

  return (
    <section className={styles.guildSelectionPanel}>
      <div className={styles.guildSelectionHeader}>
        <div className={styles.sectionKicker}>Gildenauswahl</div>
        <button
          type="button"
          className={styles.guildSelectionEditButton}
          aria-pressed={isEditingGuildSelection}
          aria-label={isEditingGuildSelection ? "Bearbeitung beenden" : "Gildenauswahl bearbeiten"}
          title={isEditingGuildSelection ? "Bearbeitung beenden" : "Gildenauswahl bearbeiten"}
          onClick={handleToggleEditing}
        >
          {isEditingGuildSelection ? <Check size={14} aria-hidden /> : <Pencil size={13} aria-hidden />}
        </button>
      </div>
      <GuildSlot
        activeGuildId={selection.activeGuildId}
        selectedGuilds={selection.selectedGuilds}
        isEditing={isEditingGuildSelection}
        pickerOpen={pickerOpen}
        localScanState={localScanState}
        scanDependentDisabled={scanDependentDisabled}
        onSelectActiveGuild={selection.setActiveGuildId}
        onSelectGuild={handleSelectGuild}
        onRequestRemoveGuild={handleRequestRemoveGuild}
        onTogglePicker={() => setPickerOpen((open) => !open)}
        onClosePicker={() => setPickerOpen(false)}
      />
      {guildPendingRemoval ? (
        <RemoveGuildSelectionDialog
          guild={guildPendingRemoval}
          onCancel={handleCancelRemoveGuild}
          onConfirm={handleConfirmRemoveGuild}
        />
      ) : null}
    </section>
  );
}

function GuildHubTileMenu({ scanDependentDisabled }: { scanDependentDisabled: boolean }) {
  return (
    <section className={styles.tileGrid} aria-label="Guild-Hub-Bereiche">
      <Tile
        to="/guild-hub/dashboard"
        title="Dashboard"
        desc="Ueberblick & Einstieg"
        disabled={scanDependentDisabled}
      />
      <Tile
        to="/guild-hub/planner"
        title="Planner"
        desc="Raids, Events, Aufgaben"
        disabled={scanDependentDisabled}
      />
      <Tile
        to="/guild-hub/fusion-planner"
        title="Fusion Planner"
        desc="Setups & Szenarien"
        disabled={scanDependentDisabled}
      />
      <Tile to="/guild-hub/fight-tracking" title="Fight Tracking" desc="Angriffe & Fehlquoten" />
      <Tile
        to="/guild-hub/compare-guilds"
        title="Gildenvergleich"
        desc="Kennzahlen nebeneinander legen"
        disabled={scanDependentDisabled}
      />
      <Tile to="/guild-hub/waitlist" title="Waitlist" desc="Bewerber & Slots" />
      <Tile
        to="/guild-hub/import"
        title="Import"
        desc="SF-Tools JSONs lokal hinzufuegen"
        nudge={scanDependentDisabled}
      />
      <Tile to="/guild-hub/settings" title="Einstellungen" desc="Guild-Hub konfigurieren" />
    </section>
  );
}

function useGuildHubLocalScanState(): LocalScanState {
  const [state, setState] = React.useState<LocalScanState>({
    scans: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    const load = () => {
      listGuildHubLocalScans()
        .then((scans) => {
          if (cancelled) return;
          setState({ scans, loading: false, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("[GuildHub] failed to load local scans", err);
          setState({ scans: [], loading: false, error: "Lokale Scans konnten nicht geladen werden." });
        });
    };

    load();
    const unsubscribe = subscribeToSfDataHubLocalScanChanges(load);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
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
  onRequestRemoveGuild: (guild: GuildHubSelectedGuild) => void;
  onTogglePicker: () => void;
  onClosePicker: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedGuilds.map((guild) => (
          <GuildLogoButton
            key={guild.id}
            guild={guild}
            active={guild.id === activeGuildId}
            onClick={() => onSelectActiveGuild(guild.id)}
            isEditing={isEditing}
            onRequestRemove={() => onRequestRemoveGuild(guild)}
          />
        ))}
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-xl border transition hover:bg-white/5"
          style={{
            borderColor: pickerOpen ? "#2B6DE0" : "#2B4C73",
            background: pickerOpen ? "#1C3554" : "#152A42",
            color: "#F5F9FF",
            boxShadow: pickerOpen ? "0 0 0 1px rgba(43, 109, 224, 0.4)" : undefined,
          }}
          aria-label="Gilde hinzufuegen"
          title="Gilde hinzufuegen"
          onClick={onTogglePicker}
        >
          <Plus size={18} strokeWidth={2.2} aria-hidden />
        </button>
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

function GuildLogoButton({
  guild,
  active,
  isEditing,
  onClick,
  onRequestRemove,
}: {
  guild: GuildHubSelectedGuild;
  active: boolean;
  isEditing: boolean;
  onClick: () => void;
  onRequestRemove: () => void;
}) {
  const emblem = guildIconByIdentifier(guild.logoIdentifier, 96);
  const emblemUrl = emblem.thumb || undefined;
  const fallback = guild.name.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className={styles.guildLogoEditWrap}>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl border transition hover:bg-white/5"
        style={{
          borderColor: active ? "#2B6DE0" : "#2B4C73",
          background: active ? "#1C3554" : "#0F2135",
          color: "#F5F9FF",
          boxShadow: active ? "0 0 0 2px rgba(43, 109, 224, 0.45)" : undefined,
        }}
        aria-pressed={active}
        aria-label={`${guild.name} aktivieren`}
        title={`${guild.name} (${guild.server})`}
        onClick={onClick}
      >
        {emblemUrl ? (
          <img
            src={emblemUrl}
            alt={`${guild.name} Logo`}
            className="h-9 w-9 object-contain drop-shadow"
            loading="lazy"
          />
        ) : (
          <span className="text-sm font-semibold">{fallback}</span>
        )}
      </button>
      {isEditing ? (
        <button
          type="button"
          className={styles.guildRemoveButton}
          aria-label={`${guild.name} aus Guild Hub entfernen`}
          title="Aus Guild Hub entfernen"
          onClick={(event) => {
            event.stopPropagation();
            onRequestRemove();
          }}
        >
          <Minus size={12} strokeWidth={3} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function RemoveGuildSelectionDialog({
  guild,
  onCancel,
  onConfirm,
}: {
  guild: GuildHubSelectedGuild;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.confirmOverlay} role="presentation">
      <div
        className={styles.confirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-guild-selection-title"
      >
        <div>
          <h2 id="remove-guild-selection-title" className={styles.confirmTitle}>
            Gilde aus Guild Hub entfernen?
          </h2>
          <p className={styles.confirmGuildName}>{guild.name}</p>
          <p className={styles.confirmText}>
            Die Gilde wird nur aus deiner Guild-Hub-Auswahl entfernt. Importierte Scans und gespeicherte
            Guild-Hub-Daten werden nicht geloescht.
          </p>
        </div>
        <div className={styles.confirmActions}>
          <button type="button" className={styles.confirmCancelButton} onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className={styles.confirmRemoveButton} onClick={onConfirm}>
            Entfernen
          </button>
        </div>
      </div>
    </div>
  );
}

function GuildPicker({
  selectedGuildIds,
  localScanState,
  showImportHint,
  onSelectGuild,
  onClose,
}: {
  selectedGuildIds: Set<string>;
  localScanState: LocalScanState;
  showImportHint: boolean;
  onSelectGuild: (guild: GuildHubSelectedGuild) => void;
  onClose: () => void;
}) {
  const [server, setServer] = React.useState("");
  const [query, setQuery] = React.useState("");
  const { scans, loading, error } = localScanState;

  const serverOptions = React.useMemo(() => listGuildHubLocalServersFromScans(scans), [scans]);
  const guildOptions = React.useMemo(
    () => listGuildHubLocalGuildsForServerFromScans(scans, server),
    [scans, server],
  );

  const filteredGuilds = React.useMemo(() => {
    const q = normalizeText(query);
    const matches = q
      ? guildOptions.filter((guild) => {
          const haystack = `${guild.name} ${guild.guildId} ${guild.guildIdentifier ?? ""} ${guild.server}`.toLowerCase();
          return haystack.includes(q);
        })
      : guildOptions;
    return matches;
  }, [guildOptions, query]);

  const handleServerChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setServer(event.target.value);
    setQuery("");
  };

  return (
    <div
      className="mt-3 rounded-xl border p-3"
      style={{ borderColor: "#2B4C73", background: "#102238", color: "#F5F9FF" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs font-semibold text-[#F5F9FF]">Gilde auswaehlen</div>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-lg border hover:bg-white/5"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
          aria-label="Auswahl schliessen"
          title="Schliessen"
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <label className="mb-2 block text-[11px]" style={{ color: "#B0C4D9" }}>
        Server
        <select
          className="mt-1 w-full rounded-lg border px-2 py-2 text-xs outline-none"
          style={{ borderColor: "#2B4C73", background: "#152A42", color: "#F5F9FF" }}
          value={server}
          onChange={handleServerChange}
          disabled={loading || Boolean(error) || serverOptions.length === 0}
        >
          <option value="">Server auswaehlen</option>
          {serverOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {formatLocalServerLabel(option.id)}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
        >
          <Loader2 size={14} className="animate-spin" aria-hidden />
          Lokale Scans werden geladen
        </div>
      ) : error ? (
        <div
          className="mb-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#5D3650", color: "#F6B8CA" }}
        >
          {error}
        </div>
      ) : showImportHint ? (
        <div
          className="mb-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
        >
          Noch keine lokalen Guild-Scans vorhanden. Importiere zuerst SF-Tools JSONs.
        </div>
      ) : null}

      {server ? (
        <label className="mb-3 block text-[11px]" style={{ color: "#B0C4D9" }}>
          Suche
          <span className="relative mt-1 block">
            <Search
              size={14}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
              color="#B0C4D9"
              aria-hidden
            />
            <input
              type="search"
              className="w-full rounded-lg border py-2 pl-8 pr-2 text-xs outline-none"
              style={{ borderColor: "#2B4C73", background: "#152A42", color: "#F5F9FF" }}
              value={query}
              placeholder="Name oder ID"
              onChange={(event) => setQuery(event.target.value)}
            />
          </span>
        </label>
      ) : null}

      {server ? (
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {filteredGuilds.length ? (
            filteredGuilds.map((option) => {
              const guild = mapLocalGuildIdentityToSelection(option);
              if (!guild) return null;
              const selected = selectedGuildIds.has(guild.id);
              const emblem = guildIconByIdentifier(guild.logoIdentifier, 64);
              const emblemUrl = emblem.thumb || undefined;
              const fallback = guild.name.trim().charAt(0).toUpperCase() || "G";
              return (
                <button
                  key={guild.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition hover:bg-white/5"
                  style={{
                    borderColor: selected ? "#2B6DE0" : "#2B4C73",
                    background: selected ? "#1C3554" : "#152A42",
                    color: "#F5F9FF",
                  }}
                  onClick={() => onSelectGuild(guild)}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border"
                    style={{ borderColor: "#2B4C73", background: "#0F2135" }}
                  >
                    {emblemUrl ? (
                      <img
                        src={emblemUrl}
                        alt={`${guild.name} Logo`}
                        className="h-7 w-7 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold">{fallback}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{guild.name}</span>
	                    <span className="block truncate text-[11px]" style={{ color: "#B0C4D9" }}>
	                      {formatLocalServerLabel(guild.server)}
	                      {typeof guild.hofRank === "number" ? ` - HoF #${guild.hofRank}` : ""}
	                    </span>
	                    <span className="block truncate text-[11px]" style={{ color: "#8FA8C2" }}>
	                      {formatGuildSourceScanLabel(option.sourceScannedAt)}
	                    </span>
	                  </span>
                  {selected ? (
                    <span
                      className="shrink-0 rounded-md border px-2 py-1 text-[10px]"
                      style={{ borderColor: "#2B6DE0", color: "#B7D4FF" }}
                    >
                      Aktiv
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
            >
              Keine passende lokale Gilde gefunden.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatLocalServerLabel(server: string) {
  return SERVER_BY_ID[server.trim().toLowerCase()]?.label ?? server;
}

function formatGuildSourceScanLabel(scannedAt: string | null | undefined) {
  const label = scannedAt ? formatScanDateTimeLabel(scannedAt).split(" ")[0] : "";
  return label && label !== "—" ? `Scan ${label}` : "Scanzeit unbekannt";
}

function Tile({
  to,
  title,
  desc,
  disabled = false,
  nudge = false,
}: {
  to: string;
  title: string;
  desc?: string;
  disabled?: boolean;
  nudge?: boolean;
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

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
}
