import { hubText, hubMessage } from "../../lib/i18n/dataHubPresentation";
import React from "react";
import { Loader2, Search, X } from "lucide-react";
import { useProfileTranslation as useTranslation } from "../../lib/i18n/useProfileTranslation";
import { guildIconByIdentifier } from "../../data/guilds";
import { SERVER_BY_ID } from "../../data/servers";
import {
  listGuildHubLocalGuildsForServerFromScanSummaries, listGuildHubLocalServersFromScanSummaries,
  listGuildHubScanSummaries, subscribeToSfDataHubLocalScanChanges, type GuildHubScanSummary, type GuildHubSelectionGuild as GuildHubSelectedGuild,
} from "../../lib/guilds/localScanLibrary";
import { profileDate } from "../../lib/i18n/profilePresentation";
import { mapLocalGuildIdentityToSelection } from "../../lib/data-hub/useGuildFavoritesSelection";
import { normalizeText } from "../../lib/guilds/guildSelectionIdentity";

export type LocalScanState = { summaries: GuildHubScanSummary[]; loading: boolean; error: string | null };

/** Mount only when the user explicitly requests the existing local picker. */
export function LocalGuildPicker(props: Omit<React.ComponentProps<typeof GuildPicker>, "localScanState" | "showImportHint">) {
  const localScanState = useGuildHubLocalScanState();
  return <GuildPicker {...props} localScanState={localScanState}
    showImportHint={!localScanState.loading && !localScanState.error && !localScanState.summaries.length} />;
}

export function useGuildHubLocalScanState(): LocalScanState {
  const [state, setState] = React.useState<LocalScanState>({
    summaries: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    const load = () => {
      listGuildHubScanSummaries()
        .then((summaries) => {
          if (cancelled) return;
          setState({ summaries, loading: false, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("[GuildHub] failed to load local scans", err);
          setState({ summaries: [], loading: false, error: hubText("dataHubI18n.localScansCouldNotBeLoaded") });
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

export function GuildPicker({
  selectedGuildIds,
  localScanState,
  showImportHint,
  onSelectGuild,
  onClose,
  disabled = false,
}: {
  selectedGuildIds: Set<string>;
  disabled?: boolean;
  localScanState: LocalScanState;
  showImportHint: boolean;
  onSelectGuild: (guild: GuildHubSelectedGuild) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [server, setServer] = React.useState("");
  const [query, setQuery] = React.useState("");
  const { summaries, loading, error } = localScanState;
  React.useEffect(() => { if (server) pickerRef.current?.scrollIntoView({ block: "nearest" }); }, [server]);

  const serverOptions = React.useMemo(() => listGuildHubLocalServersFromScanSummaries(summaries), [summaries]);
  React.useEffect(() => {
    if (!loading && !error && serverOptions.length) { const select = pickerRef.current?.querySelector<HTMLSelectElement>("select"); select?.focus(); pickerRef.current?.scrollIntoView({ block: "nearest" }); }
  }, [loading, error, serverOptions.length]);
  const guildOptions = React.useMemo(
    () => listGuildHubLocalGuildsForServerFromScanSummaries(summaries, server),
    [summaries, server],
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
      ref={pickerRef} data-guild-picker role="region" aria-label={t("hubNavigation.chooseGuild")}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}
      className="mt-3 rounded-xl border p-3"
      style={{ borderColor: "#2B4C73", background: "#102238", color: "#F5F9FF" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-xs font-semibold text-[#F5F9FF]">{t("hubNavigation.chooseGuild")}</div>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-lg border hover:bg-white/5"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
          aria-label={t("hubNavigation.closePicker")}
          title={t("hubNavigation.closePicker")}
          onClick={onClose}
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <label className="mb-2 block text-[11px]" style={{ color: "#B0C4D9" }}>
        {hubText("dataHubI18n.server")}
        <select
          className="mt-1 w-full rounded-lg border px-2 py-2 text-xs outline-none"
          style={{ borderColor: "#2B4C73", background: "#152A42", color: "#F5F9FF" }}
          value={server}
          onChange={handleServerChange}
          disabled={loading || Boolean(error) || serverOptions.length === 0}
        >
          <option value="">{t("hubNavigation.chooseServer")}</option>
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
          {t("hubNavigation.loadingScans")}
        </div>
      ) : error ? (
        <div
          className="mb-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#5D3650", color: "#F6B8CA" }}
        >
          {hubMessage(error)}
        </div>
      ) : showImportHint ? (
        <div
          className="mb-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
        >
          {t("hubNavigation.noScans")}
        </div>
      ) : null}

      {server ? (
        <label className="mb-3 block text-[11px]" style={{ color: "#B0C4D9" }}>
          {t("hubNavigation.search")}
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
              placeholder={t("hubNavigation.guildQuery")}
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
                  disabled={disabled}
                  onClick={() => onSelectGuild(guild)}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border"
                    style={{ borderColor: "#2B4C73", background: "#0F2135" }}
                  >
                    {emblemUrl ? (
                      <img
                        src={emblemUrl}
                        alt={hubText("dataHubI18n.guildLogo", { v1: guild.name })}
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
                      {t("hubNavigation.alreadySaved")}
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
              {t("hubNavigation.noGuildMatch")}
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
  const label = scannedAt ? profileDate(scannedAt, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  return label && label !== "—" ? hubText("dataHubI18n.scanDateLabel", { v1: label }) : hubText("dataHubI18n.scanTimeUnknown");
}

