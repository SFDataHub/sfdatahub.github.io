// src/pages/players/PlayerProfileScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import HeroPanel from "../../components/player-profile/HeroPanel";
import {
  ChartsTab,
  ComparisonTab,
  HistoryTab,
  StatsTab,
} from "../../components/player-profile/TabPanels";
import type {
  BaseStatValues,
  HeroActionKey,
  PlayerProfileViewModel,
  PortraitOptions,
  TrendSeries,
} from "../../components/player-profile/types";
import { createPortraitOptionsFromSaveArray, parseSaveStringToArray } from "../../lib/portraitFromSave";
import {
  createPortraitOptionsFromAvatarSnapshot,
  fetchAvatarSnapshotByIdentifier,
  type AvatarSnapshot,
} from "../../lib/firebase/avatarSnapshots";
import { toDriveThumbProxy } from "../../lib/urls";
import { iconForClassName } from "../../data/classes";
import { db } from "../../lib/firebase";
import { readTtlCache, writeTtlCache } from "../../lib/cache/localStorageTtl";
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  type FirestoreTraceScope,
} from "../../lib/debug/firestoreReadTrace";
import { buildPlayerIdentifier } from "../../lib/players/identifier";
import { buildStatsModelFromLatestValues } from "../../lib/parsing/latestValues";
import { useAuth } from "../../context/AuthContext";
import {
  buildFallbackProgressSeries,
  usePlayerProgressSnapshots,
} from "../../lib/player-progress/usePlayerProgressSnapshots";
import "./player-profile.css";

const TAB_CONFIG = [
  { key: "statistics", labelKey: "playerProfile.tabs.statistics", defaultLabel: "Statistics" },
  { key: "progress", labelKey: "playerProfile.tabs.progress", defaultLabel: "Progress" },
  { key: "compare", labelKey: "playerProfile.tabs.compare", defaultLabel: "Compare" },
  { key: "history", labelKey: "playerProfile.tabs.history", defaultLabel: "History" },
] as const;
type TabKey = (typeof TAB_CONFIG)[number]["key"];
const TAB_ALIASES: Record<string, TabKey> = {
  statistics: "statistics",
  stats: "statistics",
  statistiken: "statistics",
  progress: "progress",
  charts: "progress",
  chart: "progress",
  fortschritt: "progress",
  compare: "compare",
  vergleich: "compare",
  history: "history",
  historie: "history",
};

const PROFILE_CACHE_PREFIX = "sf_profile_player__";
const PROFILE_SERVER_INDEX_KEY = "sf_profile_player_server_index";
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
// Update if the game increases scrapbook sticker capacity.
const ALBUM_ITEMS_TOTAL = 2396;

const HONOR_VALUE_KEYS = ["honor", "ehre", "honour", "honorpoints", "ehrepunkte"];

const resolveTabFromLocation = (): TabKey | null => {
  if (typeof window === "undefined") return null;
  const searchTab = new URLSearchParams(window.location.search).get("tab");
  const hash = window.location.hash ?? "";
  const hashQueryIndex = hash.indexOf("?");
  const hashTab = hashQueryIndex >= 0 ? new URLSearchParams(hash.slice(hashQueryIndex + 1)).get("tab") : null;
  const candidate = (searchTab ?? hashTab ?? "").trim().toLowerCase();
  if (!candidate) return null;
  return TAB_ALIASES[candidate] ?? null;
};

const BASE_STAT_CONFIG: { key: keyof BaseStatValues; label: string; base: string[]; total: string[] }[] = [
  { key: "str", label: "Stärke", base: ["Base Strength", "Stärke", "basestrength"], total: ["Strength"] },
  { key: "dex", label: "Geschick", base: ["Base Dexterity", "Geschick", "basedexterity"], total: ["Dexterity"] },
  { key: "int", label: "Intelligenz", base: ["Base Intelligence", "Intelligenz", "baseintelligence"], total: ["Intelligence"] },
  { key: "con", label: "Konstitution", base: ["Base Constitution", "Konstitution", "baseconstitution"], total: ["Constitution"] },
  { key: "lck", label: "Glück", base: ["Base Luck", "Glück", "baseluck"], total: ["Luck"] },
];

type PlayerSnapshot = {
  id: string;
  name: string;
  className: string | null;
  level: number | null;
  guild: string | null;
  guildIdentifier: string | null;
  guildJoined: string | null;
  server: string | null;
  identifier?: string | null;
  avatarIdentifier?: string | null;
  scrapbookPct?: number | null;
  totalStats?: number | null;
  base?: number | null;
  con?: number | null;
  conTotal?: number | null;
  attributeTotal?: number | null;
  lastScanDays?: number | null;
  values: Record<string, any>;
  portraitConfig?: Partial<PortraitOptions>;
  saveArray?: number[] | null;
  saveString?: string | null;
};

type PlayerProfileScreenProps = {
  heroOnly?: boolean;
};

export default function PlayerProfileScreen({ heroOnly = false }: PlayerProfileScreenProps) {
  const params = useParams<Record<string, string>>();
  const routeIdentifier = params.identifier ?? "";
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isFavoritePlayer, toggleFavoritePlayer } = useAuth();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>("statistics");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [avatarSnapshot, setAvatarSnapshot] = useState<AvatarSnapshot | null>(null);
  const [, setAvatarLoading] = useState(false);
  const [, setAvatarError] = useState<Error | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const resolvedTab = resolveTabFromLocation();
    if (resolvedTab) {
      setTab(resolvedTab);
    }
  }, [routeIdentifier]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      const id = routeIdentifier;

      if (!id) {
        setSnapshot(null);
        setErr("Kein Spieler ausgewählt.");
        setLoading(false);
        return;
      }

      const readServerIndex = (): Record<string, string> => {
        if (typeof window === "undefined") return {};
        try {
          const raw = window.localStorage.getItem(PROFILE_SERVER_INDEX_KEY);
          if (!raw) return {};
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
        } catch {
          return {};
        }
      };

      const cachedServer = readServerIndex()[id];
      const cacheKey = cachedServer ? `${PROFILE_CACHE_PREFIX}${cachedServer}__${id}` : null;
      if (cacheKey) {
        const cached = readTtlCache(cacheKey, PROFILE_CACHE_TTL_MS);
        if (cached && typeof cached === "object") {
          setSnapshot(cached as PlayerSnapshot);
          setLoading(false);
          return;
        }
      }
      let scope: FirestoreTraceScope = null;
      try {
        scope = beginReadScope("PlayerProfile:load");
        let data: any = null;
        const ref = doc(db, "players", id, "latest", "latest");
        const snap = await traceGetDoc(scope, ref, () => getDoc(ref));
        if (snap.exists()) {
          data = snap.data();
        }

        if (!data) {
          throw new Error("Spieler nicht gefunden.");
        }
        if (!data || typeof data !== "object") throw new Error("Spieler nicht gefunden.");

        const values =
          (typeof data.values === "object" && data.values ? data.values : {}) as Record<string, unknown>;
        if (data.timestampRaw != null && values.timestampRaw == null) {
          values.timestampRaw = data.timestampRaw;
        }
        const saveArray =
          (Array.isArray(data.save) && data.save) ||
          (Array.isArray(values?.save) && values.save) ||
          (Array.isArray(data.saveArray) && data.saveArray) ||
          (Array.isArray(values?.saveArray) && values.saveArray) ||
          undefined;
        const saveString =
          (typeof data.save === "string" && data.save) ||
          (typeof values?.save === "string" && values.save) ||
          (typeof data.saveString === "string" && data.saveString) ||
          (typeof values?.saveString === "string" && values.saveString) ||
          undefined;

        const playerIdValue = String((data as any)?.playerId ?? id).trim() || id;
        const level = toNum(data.level ?? values?.Level) ?? null;
        const className = (data.className ?? values?.Class ?? null) || null;
        const guildName = (data.guildName ?? values?.Guild ?? null) || null;
        const rawGuildIdentifier = values["Guild Identifier"];
        const guildIdentifier =
          typeof rawGuildIdentifier === "string" ? rawGuildIdentifier.trim() || null : null;
        const rawGuildJoined = values["Guild Joined"];
        const guildJoined = typeof rawGuildJoined === "string" ? rawGuildJoined.trim() || null : null;
        const name = data.name ?? values?.Name ?? playerIdValue;
        const server = data.server ?? values?.Server ?? null;
        const profileIdentifier = id || null;
        const avatarIdentifier =
          data.identifier ??
          values?.identifier ??
          profileIdentifier;
        const totalStats = toNum(data.totalStats ?? values?.["Total Stats"]) ?? null;
        const base = toNum(data.base ?? values?.Base ?? values?.base) ?? null;
        const con = toNum(data.con ?? values?.Con ?? values?.con) ?? null;
        const attributeTotal =
          toNum(data.attributeTotal ?? values?.["Attribute Total"] ?? values?.AttributeTotal) ?? null;
        const conTotal = toNum(data.conTotal ?? values?.["Con Total"] ?? values?.ConTotal) ?? null;
        const scrapbookRaw =
          data.scrapbookPct ??
          data.scrapbook ??
          values?.scrapbookPct ??
          values?.scrapbook ??
          values?.["Scrapbook %"] ??
          values?.["Scrapbook"] ??
          values?.["Album"] ??
          values?.["Album %"] ??
          values?.AlbumPct ??
          values?.AlbumPercent ??
          values?.AlbumPercentage ??
          values?.AlbumCompletion ??
          values?.AlbumProgress;
        const scrapbookPct = toNum(scrapbookRaw) ?? null;
        const timestampSeconds = toNum(data.timestamp) ?? toNum(values?.timestamp);
        const lastScanDays = daysSince(timestampSeconds);

        const portraitConfig =
          typeof data.portrait === "object"
            ? data.portrait
            : typeof data.portraitOptions === "object"
            ? data.portraitOptions
            : typeof values?.portraitOptions === "object"
            ? values.portraitOptions
            : undefined;

        const nextSnapshot: PlayerSnapshot = {
          id: playerIdValue,
          name,
          className,
          level,
          guild: guildName,
          guildIdentifier,
          guildJoined,
          server,
          identifier: profileIdentifier,
          avatarIdentifier,
          scrapbookPct,
          totalStats,
          base,
          con,
          conTotal,
          attributeTotal,
          lastScanDays,
          values,
          portraitConfig,
          saveArray,
          saveString,
        };

        if (typeof window !== "undefined") {
          try {
            const normalizedServer = String(nextSnapshot.server ?? "")
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");
            const cacheServer = normalizedServer || "unknown";
            const nextCacheKey = `${PROFILE_CACHE_PREFIX}${cacheServer}__${id}`;
            const index = readServerIndex();
            index[id] = cacheServer;
            writeTtlCache(nextCacheKey, nextSnapshot);
            window.localStorage.setItem(PROFILE_SERVER_INDEX_KEY, JSON.stringify(index));
          } catch {
            // ignore cache write failures
          }
        }

        if (!cancelled) setSnapshot(nextSnapshot);
      } catch (error: any) {
        if (!cancelled) {
          setSnapshot(null);
          setErr(error?.message || "Unbekannter Fehler beim Laden.");
        }
      } finally {
        endReadScope(scope);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routeIdentifier]);

  const handleTabChange = (next: TabKey) => {
    setTab(next);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAvatar = async () => {
      const avatarScope: FirestoreTraceScope = beginReadScope("PlayerProfile:avatar");
      if (!snapshot?.id) {
        setAvatarSnapshot(null);
        setAvatarLoading(false);
        setAvatarError(null);
        endReadScope(avatarScope);
        return;
      }
      setAvatarLoading(true);
      setAvatarError(null);
      try {
        const snap = await fetchAvatarSnapshotByIdentifier(snapshot.avatarIdentifier ?? undefined, avatarScope);
        if (!cancelled) setAvatarSnapshot(snap);
      } catch (error: any) {
        if (!cancelled) {
          setAvatarSnapshot(null);
          setAvatarError(error instanceof Error ? error : new Error("AvatarSnapshot failed"));
        }
      } finally {
        endReadScope(avatarScope);
        if (!cancelled) setAvatarLoading(false);
      }
    };

    loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [snapshot?.avatarIdentifier, snapshot?.id]);

  const currentHistoryIdentifier = useMemo(
    () =>
      snapshot
        ? (snapshot.identifier ?? buildPlayerIdentifier(snapshot.server ?? null, snapshot.id))?.trim().toLowerCase() ?? null
        : null,
    [snapshot],
  );
  const favoritePlayerIdentifiers = useMemo(
    () =>
      Object.keys(user?.favorites?.players ?? {})
        .map((identifier) => identifier.trim().toLowerCase())
        .filter((identifier) => !!identifier),
    [user?.favorites?.players],
  );
  const progressSnapshotIdentifiers = useMemo(
    () => (currentHistoryIdentifier ? [currentHistoryIdentifier] : []),
    [currentHistoryIdentifier],
  );
  const { byIdentifier: progressSnapshotsByIdentifier } = usePlayerProgressSnapshots({
    identifiers: progressSnapshotIdentifiers,
  });
  const chartsSeries = useMemo<TrendSeries[] | null>(() => {
    if (!snapshot) return null;
    if (!currentHistoryIdentifier) return buildFallbackProgressSeries();
    return progressSnapshotsByIdentifier[currentHistoryIdentifier]?.series ?? buildFallbackProgressSeries();
  }, [currentHistoryIdentifier, progressSnapshotsByIdentifier, snapshot]);

  const viewModel = useMemo<PlayerProfileViewModel | null>(
    () => (snapshot ? buildProfileView(snapshot, avatarSnapshot, chartsSeries) : null),
    [snapshot, avatarSnapshot, chartsSeries],
  );
  const favoriteIdentifier = currentHistoryIdentifier;
  const playerIsFavorite = isFavoritePlayer(favoriteIdentifier);
  const favoriteToggleLabel = playerIsFavorite
    ? t("playerProfile.heroPanel.actions.favorite.remove", { defaultValue: "Remove from favorites" })
    : t("playerProfile.heroPanel.actions.favorite.add", { defaultValue: "Add to favorites" });
  const heroViewData = useMemo(() => {
    if (!viewModel) return null;
    const metricLabelByRaw: Record<string, string> = {
      Mount: t("playerProfile.heroPanel.stats.mount", { defaultValue: "Mount" }),
      Level: t("playerProfile.heroPanel.stats.level", { defaultValue: "Level" }),
      Scrapbook: t("playerProfile.heroPanel.stats.scrapbook", { defaultValue: "Scrapbook" }),
      "Total Base Stats": t("playerProfile.heroPanel.stats.totalBaseStats", { defaultValue: "Total Base Stats" }),
    };
    const badgeLabelByRaw: Record<string, string> = {
      Mount: t("playerProfile.heroPanel.stats.mount", { defaultValue: "Mount" }),
      Honor: t("playerProfile.heroPanel.stats.honor", { defaultValue: "Honor" }),
      Gildenrolle: t("playerProfile.heroPanel.stats.guildRole", { defaultValue: "Guild role" }),
      HoF: t("playerProfile.heroPanel.stats.hof", { defaultValue: "HoF" }),
    };
    const actionLabelByKey: Record<string, string> = heroOnly
      ? {
          rescan: t("playerProfile.heroPanel.actions.openPlayerProfile", {
            defaultValue: "Open player profile",
          }),
          guild: t("playerProfile.heroPanel.actions.openGuild", { defaultValue: "Open guild" }),
          share: t("playerProfile.heroPanel.actions.share", { defaultValue: "Share" }),
          "copy-link": t("playerProfile.heroPanel.actions.copyLink", { defaultValue: "Copy link" }),
        }
      : {
          rescan: t("playerProfile.heroPanel.actions.showInTopList", {
            defaultValue: "Show in Top List",
          }),
          guild: t("playerProfile.heroPanel.actions.openGuild", { defaultValue: "Open guild" }),
          share: t("playerProfile.heroPanel.actions.share", { defaultValue: "Share" }),
          "copy-link": t("playerProfile.heroPanel.actions.copyLink", { defaultValue: "Copy link" }),
        };
    return {
      ...viewModel.hero,
      metrics: viewModel.hero.metrics.map((metric) => ({
        ...metric,
        label: metricLabelByRaw[metric.label] ?? metric.label,
      })),
      badges: viewModel.hero.badges.map((badge) => ({
        ...badge,
        label: badgeLabelByRaw[badge.label] ?? badge.label,
      })),
      actions: viewModel.hero.actions.map((action) => {
        const actionKey = String(action.key);
        const localized = actionLabelByKey[actionKey];
        if (!localized) return action;
        let localizedTitle = action.title;
        if (actionKey === "guild" && action.disabled) {
          localizedTitle = t("playerProfile.heroPanel.tooltips.noGuildLinked", {
            defaultValue: "No guild linked in latest scan.",
          });
        } else if (actionKey === "share") {
          localizedTitle = t("playerProfile.heroPanel.tooltips.shareSystemShareSheet", {
            defaultValue: "System Share Sheet",
          });
        } else if (heroOnly || actionKey === "rescan") {
          localizedTitle = localized;
        }
        return {
          ...action,
          label: localized,
          title: localizedTitle,
        };
      }),
    };
  }, [heroOnly, t, viewModel]);

  const showFeedback = useCallback((message: string) => {
    setActionFeedback(message);
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setActionFeedback(null), 3500);
  }, []);

  const handleAction = useCallback(
    async (action: HeroActionKey | string) => {
      if (!snapshot) return;

      if (action === "copy-link") {
        if (typeof window !== "undefined" && navigator?.clipboard) {
          const linkId =
            snapshot.identifier ??
            buildPlayerIdentifier(snapshot.server ?? null, snapshot.id) ??
            snapshot.id;
          const link = `${window.location.origin}/#/player/${encodeURIComponent(linkId)}`;
          try {
            await navigator.clipboard.writeText(link);
            showFeedback("Profil-Link wurde kopiert.");
          } catch {
            showFeedback("Konnte Link nicht kopieren.");
          }
        }
        return;
      }
      if (action === "share" && typeof window !== "undefined" && (navigator as any)?.share) {
        try {
          await (navigator as any).share({
            title: snapshot.name,
            text: `Shakes & Fidget Charakter ${snapshot.name}`,
            url: window.location.href,
          });
          showFeedback("Profil geteilt.");
        } catch {
          showFeedback("Teilen abgebrochen.");
        }
        return;
      }
      if (action === "guild") {
        if (snapshot.guildIdentifier) {
          navigate(`/guild/${snapshot.guildIdentifier}`);
        }
        return;
      }
      if (action === "favorite") {
        const identifier =
          (snapshot.identifier ?? buildPlayerIdentifier(snapshot.server ?? null, snapshot.id))?.trim().toLowerCase() ??
          null;
        if (!identifier) {
          showFeedback(t("profile.favorite.errorMissingIdentifier", { defaultValue: "Favorite identifier missing." }));
          return;
        }
        if (favoriteBusy) return;

        setFavoriteBusy(true);
        try {
          const result = await toggleFavoritePlayer(identifier);
          showFeedback(
            result.isFavorite
              ? t("profile.favorite.added", { defaultValue: "Added to favorites." })
              : t("profile.favorite.removed", { defaultValue: "Removed from favorites." }),
          );
        } catch (error: any) {
          if (error?.code === "FAVORITES_LIMIT") {
            showFeedback(t("profile.favorite.limit", { defaultValue: "Favorite limit reached." }));
          } else if (error?.code === "AUTH_REQUIRED") {
            showFeedback(t("profile.favorite.authRequired", { defaultValue: "Sign in to use favorites." }));
          } else {
            showFeedback(t("profile.favorite.error", { defaultValue: "Could not update favorite." }));
          }
        } finally {
          setFavoriteBusy(false);
        }
        return;
      }
      if (action === "rescan") {
        if (heroOnly) {
          const linkId =
            snapshot.identifier ??
            buildPlayerIdentifier(snapshot.server ?? null, snapshot.id) ??
            snapshot.id;
          navigate(`/player/${encodeURIComponent(linkId)}`);
          return;
        }
        const serverKey = typeof snapshot.server === "string" ? snapshot.server.trim() : "";
        const focusIdentifier =
          snapshot.identifier ??
          buildPlayerIdentifier(snapshot.server ?? null, snapshot.id) ??
          snapshot.id;
        if (!serverKey || !focusIdentifier) {
          showFeedback("Toplisten-Link konnte nicht erstellt werden.");
          return;
        }

        const params = new URLSearchParams();
        params.set("server", serverKey);
        params.set("focus", focusIdentifier);

        const hofRankKeys = [
          "hofrank",
          "halloffamerank",
          "hofposition",
          "halloffameposition",
          "hofplatz",
          "halloffame",
          "hof",
        ];
        const lookup = buildValueLookup(snapshot.values || {});
        const hofRankDirect = toNum(snapshot.values?.["Rank"]);
        const hofRank = hofRankDirect ?? lookup.number(hofRankKeys);
        if (typeof hofRank === "number" && Number.isFinite(hofRank)) {
          params.set("rank", String(Math.max(1, Math.trunc(hofRank))));
        }

        navigate({
          pathname: "/toplists",
          search: `?${params.toString()}`,
        });
        return;
      }
    },
    [favoriteBusy, heroOnly, navigate, showFeedback, snapshot, t, toggleFavoritePlayer],
  );

  const renderTabs = () => {
    if (!viewModel) return null;
    switch (tab) {
      case "statistics":
        return <StatsTab data={viewModel.stats} />;
      case "progress":
        return <ChartsTab series={viewModel.charts} />;
      case "compare":
        return (
          <ComparisonTab
            rows={viewModel.comparison}
            currentIdentifier={currentHistoryIdentifier}
            currentPlayerLabel={snapshot?.name ?? currentHistoryIdentifier ?? null}
            favoriteIdentifiers={favoritePlayerIdentifiers}
          />
        );
      case "history":
        return <HistoryTab entries={viewModel.history} />;
      default:
        return null;
    }
  };

  const renderNotFound = () => (
    <div className="player-profile__loading">
      <p>{err ?? "Spieler nicht gefunden."}</p>
      <button
        type="button"
        className="player-profile__hero-action"
        onClick={() => navigate("/")}
        style={{ marginTop: 12 }}
      >
        Zur Startseite
      </button>
    </div>
  );

  return (
    <div className="player-profile">
      {loading && !snapshot && <div className="player-profile__loading">Spielerprofil wird geladen …</div>}

      {!loading && (!snapshot || !viewModel) && renderNotFound()}

      {viewModel && heroViewData && (
        <>
          <HeroPanel
            data={heroViewData}
            loading={loading}
            onAction={handleAction}
            favoriteControl={
              favoriteIdentifier
                ? {
                    visible: true,
                    isFavorite: playerIsFavorite,
                    disabled: favoriteBusy,
                    ariaLabel: favoriteToggleLabel,
                    title: favoriteToggleLabel,
                    onToggle: () => {
                      void handleAction("favorite");
                    },
                  }
                : undefined
            }
          />
          <ActionFeedback message={actionFeedback} />
          {!heroOnly && (
            <>
              <div
                className="player-profile__tabs"
                role="tablist"
                aria-label={t("playerProfile.tabs.ariaLabel", { defaultValue: "Player profile tabs" })}
              >
                {TAB_CONFIG.map((entry) => {
                  const active = tab === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`player-profile__tab-button ${active ? "player-profile__tab-button--active" : ""}`}
                      onClick={() => handleTabChange(entry.key)}
                    >
                      {t(entry.labelKey, { defaultValue: entry.defaultLabel })}
                    </button>
                  );
                })}
              </div>

              {renderTabs()}
            </>
          )}
        </>
      )}
    </div>
  );
}

const ActionFeedback = React.memo(({ message }: { message?: string | null }) => {
  if (!message) return null;
  return (
    <p className="player-profile__hero-feedback" role="status" aria-live="polite">
      {message}
    </p>
  );
});

const toNum = (value: any): number | null => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^[+-]/, "").replace(/[\s%]/g, "");
  const lastComma = unsigned.lastIndexOf(",");
  const lastDot = unsigned.lastIndexOf(".");
  const decimalPos = Math.max(lastComma, lastDot);
  let normalized = "";

  if (decimalPos > -1) {
    const fractional = unsigned.slice(decimalPos + 1).replace(/[^0-9]/g, "");
    const integer = unsigned.slice(0, decimalPos).replace(/[^0-9]/g, "");
    if (fractional.length > 0 && fractional.length <= 2) {
      normalized = `${integer}.${fractional}`;
    } else {
      normalized = (integer + fractional).replace(/[^0-9]/g, "");
    }
  } else {
    normalized = unsigned.replace(/[^0-9]/g, "");
  }

  if (!normalized) return null;
  const num = Number(normalized) * sign;
  return Number.isFinite(num) ? num : null;
};

const daysSince = (timestamp?: number | null) => {
  if (!timestamp) return null;
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - timestamp);
  return Math.floor(diff / 86400);
};

const canonicalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

const buildValueLookup = (values: Record<string, any>) => {
  const map = new Map<string, any>();
  Object.entries(values || {}).forEach(([k, v]) => map.set(canonicalize(k), v));

  return {
    number(keys: string[], fallback: number | null = null) {
      for (const key of keys) {
        const candidate = toNum(map.get(canonicalize(key)));
        if (candidate != null) return candidate;
      }
      return fallback;
    },
    text(keys: string[], fallback: string | null = null) {
      for (const key of keys) {
        const raw = map.get(canonicalize(key));
        if (raw != null && String(raw).trim()) return String(raw).trim();
      }
      return fallback;
    },
  };
};

const createSeededRandom = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const formatNumber = (value?: number | null, fallback = "-") =>
  value == null ? fallback : value.toLocaleString("de-DE");

const formatPercent = (value?: number | null) => {
  if (value == null) return "-";
  const truncated = Math.floor(value * 100) / 100;
  const hasFraction = truncated % 1 !== 0;
  return `${truncated.toLocaleString("de-DE", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}%`;
};

const formatDaysAgo = (days?: number | null) => {
  if (days == null) return null;
  if (days === 0) return "heute";
  return `${days} Tag${days === 1 ? "" : "e"} her`;
};

const formatDateTimeFromSeconds = (timestamp?: number | null) => {
  if (timestamp == null) return null;
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
};

const buildPortraitConfig = (
  snapshot: PlayerSnapshot,
  avatarSnapshot?: AvatarSnapshot | null,
): { config?: Partial<PortraitOptions>; hasData: boolean } => {
  let base: PortraitOptions | undefined;
  const hasInlinePortrait =
    snapshot.portraitConfig && Object.keys(snapshot.portraitConfig).length > 0;

  if (Array.isArray(snapshot.saveArray) && snapshot.saveArray.length > 0) {
    base = createPortraitOptionsFromSaveArray(snapshot.saveArray);
  } else if (snapshot.saveString) {
    const parsed = parseSaveStringToArray(snapshot.saveString);
    base = parsed.length > 0 ? createPortraitOptionsFromSaveArray(parsed) : undefined;
  } else if (hasInlinePortrait) {
    base = { ...snapshot.portraitConfig } as PortraitOptions;
  }

  if (avatarSnapshot?.hasPortraitData) {
    return {
      config: createPortraitOptionsFromAvatarSnapshot(avatarSnapshot, base),
      hasData: true,
    };
  }

  if (base) {
    return { config: base, hasData: true };
  }

  return { config: undefined, hasData: false };
};

const buildProfileView = (
  snapshot: PlayerSnapshot,
  avatarSnapshot?: AvatarSnapshot | null,
  chartsOverride?: TrendSeries[] | null,
): PlayerProfileViewModel => {
  const values = snapshot.values || {};
  const lookup = buildValueLookup(values);
  const rand = createSeededRandom(snapshot.id);
  const portrait = buildPortraitConfig(snapshot, avatarSnapshot);
  const classIcon = iconForClassName(snapshot.className ?? undefined);
  const portraitFallbackUrl = toDriveThumbProxy(classIcon.url, 420) || "/assets/demo-avatar-special.png";
  const portraitFallbackLabel = snapshot.className ? `Klassenbild ${snapshot.className}` : "Portrait-Platzhalter";

  const scrapbookKeys = [
    "album",
    "album%",
    "albumpct",
    "albumpercent",
    "albumpercentage",
    "albumcompletion",
    "albumprogress",
    "scrapbook",
    "scrapbook%",
    "scrapbookpct",
    "scrapbookpercent",
  ];
  const honorKeys = HONOR_VALUE_KEYS;
  const hofKeys = ["hofrank", "halloffamerank", "hofposition", "halloffameposition", "hofplatz", "halloffame", "hof"];
  const mountKeys = ["mount", "reittier", "mountname"];
  const mountPercentKeys = ["mountpct", "mountpercent", "mountpercentage", "mountspeed", "mountbonus", "mountvalue"];
  const guildRoleKeys = ["guildrole", "role", "guildrank", "gildenrolle"];

  const level = snapshot.level ?? lookup.number(["level"]);
  const scrapbook = snapshot.scrapbookPct ?? lookup.number(scrapbookKeys);
  const honor = lookup.number(honorKeys);
  const totalStats = snapshot.totalStats ?? lookup.number(["totalstats", "stats"]);

  const baseStatConfig = BASE_STAT_CONFIG;

  const baseStats: BaseStatValues = { str: 0, dex: 0, int: 0, con: 0, lck: 0 };
  const totalStatsDetail: BaseStatValues = { str: 0, dex: 0, int: 0, con: 0, lck: 0 };
  let hasBaseStats = false;
  let hasTotalStats = false;
  baseStatConfig.forEach((entry) => {
    const baseValue = lookup.number(entry.base);
    if (baseValue != null) {
      baseStats[entry.key] = baseValue;
      hasBaseStats = true;
    }
    const totalValue = lookup.number(entry.total);
    if (totalValue != null) {
      totalStatsDetail[entry.key] = totalValue;
      hasTotalStats = true;
    }
  });
  const v = snapshot.values || {};
  const parseStat = (val: any) => {
    const cleaned = String(val ?? "0").replace(/[.\\s]/g, "");
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const baseValue = parseStat((v as any)["Base"]);
  const baseConValue = parseStat((v as any)["Base Constitution"]);
  const attrValue = parseStat((v as any)["Attribute"]);
  const conValue = parseStat((v as any)["Constitution"]);
  const totalBaseStats = hasBaseStats ? Object.values(baseStats).reduce((sum, val) => sum + val, 0) : null;
  const calculatedTotalBaseStats = baseValue + baseConValue;
  const calculatedTotalStats = attrValue + conValue;
  const scrapbookProgress = scrapbook ?? null;
  const fortress = lookup.number(["fortresslevel", "fortress"]) ?? Math.round(rand() * 20) + 30;
  const underworld = lookup.number(["underworld", "underworldlevel"]) ?? Math.round(rand() * 10) + 20;
  const tower = lookup.number(["tower", "towerfloor"]) ?? Math.round(rand() * 90) + 10;
  const petProgress = lookup.number(["pets", "petprogress"]) ?? Math.round(rand() * 50) + 25;

  const powerScore = (level ?? 0) * 1200 + (totalBaseStats ?? 0) + Math.round((scrapbook ?? 0) * 3200);
  const mountNameRaw = lookup.text(mountKeys);
  const mountName =
    mountNameRaw && /[a-zA-Z]/.test(mountNameRaw)
      ? mountNameRaw
      : mountNameRaw && /%/.test(mountNameRaw)
      ? mountNameRaw
      : null;
  const mountPercentRaw =
    values?.Mount ??
    values?.mount ??
    values?.["Mount %"] ??
    values?.["mount %"] ??
    values?.MountPct ??
    values?.mountPct ??
    values?.MountBonus ??
    values?.mountBonus;
  const mountPercent = toNum(mountPercentRaw) ?? lookup.number(mountPercentKeys);
  const mountPercentFromName = mountName ? toNum((mountName.match(/(\d+)\s*%/) || [])[1]) : null;
  const mountPercentResolved = mountPercent ?? mountPercentFromName;
  const mountRace = typeof values?.Race === "string" ? values.Race : null;
  let mountLabel = "-";
  if (mountName) {
    mountLabel = mountPercentResolved != null && !/%/.test(mountName)
      ? `${mountName} (${Math.round(mountPercentResolved)}%)`
      : mountName;
  } else if (mountPercentResolved != null) {
    mountLabel = `${Math.round(mountPercentResolved)}%`;
  }
  const guildRole = lookup.text(guildRoleKeys);
  const hofRankDirect = toNum(values?.["Rank"]);
  const hofRank = hofRankDirect ?? lookup.number(hofKeys);
  const lastScanRaw = lookup.text(["timestampraw"]);
  const timestampSeconds = lookup.number(["timestamp"]);
  const lastScanDisplay =
    lastScanRaw && /^\s*\d+\s*$/.test(lastScanRaw)
      ? formatDateTimeFromSeconds(toNum(lastScanRaw)) ?? lastScanRaw
      : lastScanRaw ?? formatDateTimeFromSeconds(timestampSeconds) ?? "-";
  const scanAgeDays = snapshot.lastScanDays ?? (timestampSeconds != null ? daysSince(timestampSeconds) : null);

  const xpValue = lookup.number(["xp"]) ?? toNum(values?.XP);
  const xpRequiredValue = lookup.number(["xprequired", "xpnext", "xptonextlevel"]) ?? toNum(values?.["XP Required"]);
  const levelXpRemaining =
    xpValue != null && xpRequiredValue != null ? Math.max(0, xpRequiredValue - xpValue) : null;
  const levelGaugeProgress =
    xpValue != null && xpRequiredValue != null && xpRequiredValue > 0 ? Math.min(1, Math.max(0, xpValue / xpRequiredValue)) : 0;
  const albumItemsValue =
    lookup.number(["albumitems", "albumstickers", "stickercount", "scrapbookitems"]) ??
    toNum(values?.["Album Items"]);
  const scrapbookGaugeProgress =
    albumItemsValue != null ? Math.min(1, Math.max(0, albumItemsValue / ALBUM_ITEMS_TOTAL)) : 0;
  const scrapbookGaugePercent = `${(scrapbookGaugeProgress * 100).toFixed(2)}%`;
  const heroMetrics = [
    { label: "Mount", value: mountLabel ?? "-" },
    {
      label: "Level",
      value: level != null ? `Lvl ${formatNumber(level)}` : "Lvl -",
      gauge: {
        progress: levelGaugeProgress,
        centerTop: level != null ? `Lvl ${formatNumber(level)}` : "Lvl -",
        centerBottom: `${Math.round(levelGaugeProgress * 100)}%`,
        details: [
          `XP: ${formatNumber(xpValue)}`,
          `XP Required: ${formatNumber(xpRequiredValue)}`,
          ...(levelXpRemaining != null ? [`XP Remaining: ${formatNumber(levelXpRemaining)}`] : []),
        ],
      },
    },
    {
      label: "Scrapbook",
      value: scrapbookGaugePercent,
      gauge: {
        progress: scrapbookGaugeProgress,
        centerTop: scrapbookGaugePercent,
        centerBottom: `${formatNumber(albumItemsValue)} / ${ALBUM_ITEMS_TOTAL}`,
        details: [`${formatNumber(albumItemsValue)} / ${ALBUM_ITEMS_TOTAL}`],
      },
    },
    { label: "Total Base Stats", value: calculatedTotalBaseStats != null ? formatNumber(calculatedTotalBaseStats) : "-" },
  ];
  const heroBadges = [
    { label: "Honor", value: formatNumber(honor), tone: "success" as const },
    { label: "Gildenrolle", value: guildRole ?? "-", tone: "warning" as const },
    { label: "HoF", value: hofRank != null ? `#${formatNumber(hofRank)}` : "-", tone: "neutral" as const },
  ];

  const heroBaseStats = hasBaseStats ? baseStats : undefined;

  const statsTab = buildStatsModelFromLatestValues(values);
  const hero = {
    playerName: snapshot.name,
    className: snapshot.className,
    guild: snapshot.guild,
    server: snapshot.server,
    guildIdentifier: snapshot.guildIdentifier,
    guildJoined: snapshot.guildJoined,
    levelLabel: level ? `Level ${formatNumber(level)}` : undefined,
    lastScanLabel: formatDaysAgo(scanAgeDays) ?? undefined,
    lastScanAtLabel: lastScanDisplay !== "-" ? lastScanDisplay : undefined,
    lastScanDays: scanAgeDays,
    status: (scanAgeDays != null && scanAgeDays <= 2 ? "online" : "offline") as ("online"|"offline"),
    metrics: heroMetrics,
    badges: heroBadges,
    actions: [
      { key: "rescan", label: "Rescan anfordern" },
      {
        key: "guild",
        label: "Gilde öffnen",
        disabled: !snapshot.guildIdentifier,
        title: !snapshot.guildIdentifier ? "No guild linked in latest scan." : undefined,
      },
      { key: "share", label: "Teilen", title: "System Share Sheet" },
      { key: "copy-link", label: "Link kopieren" },
    ],
    portrait: portrait.hasData ? portrait.config : undefined,
    hasPortrait: portrait.hasData,
    portraitFallbackUrl,
    portraitFallbackLabel,
    baseStats: heroBaseStats,
    totalStats: hasTotalStats ? totalStatsDetail : undefined,
    totalStatsValue: calculatedTotalStats,
    mountRace: mountRace ?? null,
    mountPercentValue: mountPercentResolved ?? null,
    potionsSlots: statsTab.potions.slots,
  };

  const progressTab = [
    {
      label: "Scrapbook",
      description: "Stickers & Sammlungen",
      progress: Math.min(1, (scrapbookProgress ?? 0) / 100),
      targetLabel: `${formatPercent(scrapbookProgress)} / 100%`,
      meta: "Ziel: 100% für Bonus",
      emphasis: scrapbookProgress != null && scrapbookProgress >= 90,
    },
    {
      label: "Dungeons",
      description: "Tower & Loop of Idols",
      progress: Math.min(1, tower / 100),
      targetLabel: `Ebene ${Math.round(tower)}/100`,
      meta: "Tower Floors abgeschlossen",
    },
    {
      label: "Festung",
      description: "Gebäudebau",
      progress: Math.min(1, fortress / 25),
      targetLabel: `Lvl ${Math.round(fortress)}`,
      meta: "Mine, Akademie, Schatzkammer",
    },
    {
      label: "Unterwelt",
      description: "Seelen/Kerker",
      progress: Math.min(1, underworld / 30),
      targetLabel: `Lvl ${Math.round(underworld)}`,
      meta: "Hydra, Gladiator",
    },
    {
      label: "Pets",
      description: "Habitate & Elemente",
      progress: Math.min(1, petProgress / 100),
      targetLabel: `${Math.round(petProgress)} / 100`,
      meta: "Habitate offen",
    },
  ];

  const charts = chartsOverride ?? buildFallbackProgressSeries();

  const comparisonRows: import("../../components/player-profile/types").ComparisonRow[] = [
    {
      label: "Level",
      playerValue: level ? `Lvl ${formatNumber(level)}` : "-",
      benchmark: level ? `Lvl ${formatNumber(Math.round(level * 0.92))}` : "-",
      diffLabel: level ? `+${Math.round(level * 0.08)}` : "-",
      trend: "up",
    },
    {
      label: "Power Score",
      playerValue: formatNumber(powerScore),
      benchmark: formatNumber(Math.round(powerScore * 0.9)),
      diffLabel: `+${formatNumber(Math.round(powerScore * 0.1))}`,
      trend: "up",
    },
    {
      label: "Scrapbook",
      playerValue: formatPercent(scrapbookProgress),
      benchmark: `${Math.min(100, Math.round((scrapbookProgress ?? 60) - 8))}%`,
      diffLabel: scrapbookProgress != null ? `+${Math.round(scrapbookProgress - 60)}%` : "-",
      trend: scrapbookProgress != null && scrapbookProgress >= 80 ? "up" : "neutral",
    },
    {
      label: "Festung",
      playerValue: `Lvl ${Math.round(fortress)}`,
      benchmark: `Lvl ${Math.round(fortress - 3)}`,
      diffLabel: "+3",
      trend: "up",
    },
    {
      label: "Unterwelt",
      playerValue: `Lvl ${Math.round(underworld)}`,
      benchmark: `Lvl ${Math.round(underworld - 2)}`,
      diffLabel: "+2",
      trend: "neutral",
    },
  ];

  const historyEntries = buildHistory(snapshot, lookup, rand);

  return {
    hero,
    stats: statsTab,
    progress: progressTab,
    charts,
    comparison: comparisonRows,
    history: historyEntries,
  };
};

const buildHistory = (
  snapshot: PlayerSnapshot,
  lookup: ReturnType<typeof buildValueLookup>,
  rand: () => number
) => {
  const entries: PlayerProfileViewModel["history"] = [];
  const joinDate = lookup.text(["guildjoined", "joinedguild", "gildenbeitritt"]);
  if (joinDate) {
    entries.push({
      dateLabel: joinDate,
      title: "Gildenbeitritt",
      description: snapshot.guild ? `Joined ${snapshot.guild}` : "Neuer Gildenplatz",
      tag: "Gilde",
    });
  }

  const lastDungeon = lookup.text(["lastdungeon", "lastfight"]);
  if (lastDungeon) {
    entries.push({
      dateLabel: formatHistoricDate(Math.round(rand() * 15) + 5),
      title: "Dungeon Clear",
      description: lastDungeon,
      tag: "Dungeon",
    });
  }

  entries.push({
    dateLabel: formatHistoricDate(2),
    title: "Level-Up",
    description: `Erreichte Level ${formatNumber(snapshot.level)}`,
    tag: "Level",
  });

  entries.push({
    dateLabel: formatHistoricDate(10),
    title: "Scrapbook Meilenstein",
    description: `${formatPercent(snapshot.scrapbookPct ?? Math.round(rand() * 50 + 40))} komplett`,
    tag: "Album",
  });

  entries.push({
    dateLabel: formatHistoricDate(18),
    title: "Festung",
    description: `Fortress Level ${Math.round(
      lookup.number(["fortress"], Math.round(rand() * 20 + 15)) ?? 0
    )}`,
    tag: "Festung",
  });

  return entries;
};

const formatHistoricDate = (daysAgo: number) => {
  const date = new Date(Date.now() - daysAgo * 86400000);
  return date.toLocaleDateString("de-DE");
};

