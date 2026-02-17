// src/pages/players/PlayerProfileScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import HeroPanel from "../../components/player-profile/HeroPanel";
import {
  ChartsTab,
  ComparisonTab,
  HistoryTab,
  ProgressTab,
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
  fetchAvatarSnapshotByPlayer,
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
  traceGetDocs,
  type FirestoreTraceScope,
} from "../../lib/debug/firestoreReadTrace";
import { buildPlayerIdentifier, normalizeServerKeyFromInput, parsePlayerIdentifier } from "../../lib/players/identifier";
import "./player-profile.css";

const TABS = ["Statistiken", "Charts", "Fortschritt", "Vergleich", "Historie"] as const;
type TabKey = (typeof TABS)[number];

const PROFILE_CACHE_PREFIX = "sf_profile_player__";
const PROFILE_SERVER_INDEX_KEY = "sf_profile_player_server_index";
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
const CHARTS_CACHE_PREFIX = "playerProfile:charts:monthly3:";
const CHARTS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CHARTS_CACHE_VERSION = 3;
const CHARTS_RANGE_LABEL = "Last 3 months";
const CHARTS_CACHE_SOURCE = "history_monthly";

const HONOR_VALUE_KEYS = ["honor", "ehre", "honour", "honorpoints", "ehrepunkte"];

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

type ChartMetricValues = {
  level: number | null;
  totalStats: number | null;
  honor: number | null;
};

type MonthlyChartEntry = {
  monthId: string;
  lastTs: number | null;
  values: ChartMetricValues;
};

type ChartsCachePayload = {
  fetchedAt: number;
  version: number;
  source: string;
  months: MonthlyChartEntry[];
};

export default function PlayerProfileScreen() {
  const params = useParams<Record<string, string>>();
  const location = useLocation();
  const routeParam = params.identifier || params.id || params.pid || params.playerId || params.player || "";
  const parsedIdentifier = parsePlayerIdentifier(routeParam);
  const serverFromQuery = normalizeServerKeyFromInput(
    new URLSearchParams(location.search).get("server") ?? "",
  );
  const resolvedPlayerId = (parsedIdentifier?.playerId ?? routeParam).trim();
  const resolvedServerKey = parsedIdentifier?.serverKey ?? serverFromQuery ?? null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>("Statistiken");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [avatarSnapshot, setAvatarSnapshot] = useState<AvatarSnapshot | null>(null);
  const [, setAvatarLoading] = useState(false);
  const [, setAvatarError] = useState<Error | null>(null);
  const [chartsSeries, setChartsSeries] = useState<TrendSeries[] | null>(null);
  const chartsLoadingRef = useRef(false);
  const chartsSourceRef = useRef<"monthly" | "cache" | "fallback" | null>(null);
  const chartsLoadedKeyRef = useRef<string | null>(null);
  const chartsSeriesRef = useRef<TrendSeries[] | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      const id = (resolvedPlayerId || "").trim();

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

      const cacheServerFromRoute = resolvedServerKey
        ? String(resolvedServerKey).trim().toLowerCase().replace(/[^a-z0-9]/g, "")
        : "";
      const cachedServer = cacheServerFromRoute || readServerIndex()[id];
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
        if (parsedIdentifier?.identifier) {
          const ref = doc(db, `players/${parsedIdentifier.identifier}/latest/latest`);
          const snap = await traceGetDoc(scope, ref, () => getDoc(ref));
          if (snap.exists()) {
            data = snap.data();
          }
        }

        if (!data && resolvedServerKey) {
          const cg = collectionGroup(db, "latest");
          const q = query(
            cg,
            where("playerId", "==", id),
            where("server", "==", resolvedServerKey),
            limit(1),
          );
          const snap = await traceGetDocs(
            scope,
            { path: "players/latest (collectionGroup)" },
            () => getDocs(q),
          );
          if (!snap.empty) {
            data = snap.docs[0]?.data() ?? null;
          }
        }

        if (!data) {
          const ref = doc(db, `players/${id}/latest/latest`);
          const snap = await traceGetDoc(scope, ref, () => getDoc(ref));
          if (!snap.exists()) throw new Error("Spieler nicht gefunden.");
          data = snap.data();
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
        const serverNormalized =
          typeof server === "string"
            ? server
                .trim()
                .toLowerCase()
                .replace(/\./g, "_")
            : "";
        const profileIdentifier =
          (typeof data.identifier === "string" && data.identifier.trim() ? data.identifier.trim() : null) ??
          (typeof values?.Identifier === "string" && values.Identifier.trim() ? values.Identifier.trim() : null) ??
          (typeof values?.identifier === "string" && values.identifier.trim() ? values.identifier.trim() : null) ??
          buildPlayerIdentifier(server, playerIdValue);
        const avatarIdentifier =
          data.avatarIdentifier ??
          data.identifier ??
          values?.avatarIdentifier ??
          values?.identifier ??
          (serverNormalized ? `${playerIdValue}__${serverNormalized}` : null);
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
  }, [resolvedPlayerId, resolvedServerKey, parsedIdentifier?.identifier]);

  useEffect(() => {
    setChartsSeries(null);
    chartsLoadingRef.current = false;
    chartsSourceRef.current = null;
    chartsLoadedKeyRef.current = null;
  }, [resolvedPlayerId, snapshot?.server]);

  useEffect(() => {
    chartsSeriesRef.current = chartsSeries;
  }, [chartsSeries]);

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
      const playerIdNum = toNum(snapshot.id);
      if (playerIdNum == null) {
        setAvatarSnapshot(null);
        setAvatarLoading(false);
        setAvatarError(null);
        endReadScope(avatarScope);
        return;
      }
      setAvatarLoading(true);
      setAvatarError(null);
      try {
        const snap = await fetchAvatarSnapshotByPlayer(
          playerIdNum,
          snapshot.server ?? "",
          snapshot.avatarIdentifier ?? undefined,
          avatarScope,
        );
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
  }, [snapshot?.id, snapshot?.server]);

  useEffect(() => {
    if (tab !== "Charts") return;
    if (!snapshot?.id) return;
    const currentKey = `${normalizeServerKey(snapshot.server)}:${snapshot.id}`;
    if (chartsLoadingRef.current) return;
    if (
      chartsLoadedKeyRef.current === currentKey &&
      chartsSourceRef.current &&
      chartsSeriesRef.current
    ) {
      return;
    }

    const cacheKey = buildChartsCacheKey(snapshot.id, snapshot.server);
    const cached = loadChartsCache(cacheKey);
    if (cached) {
      const nextSeries = buildSeriesFromMonthly(cached.months);
      setChartsSeries((prev) => {
        const same = trendSeriesEqual(prev, nextSeries);
        if (!same) {
          console.log(`[charts] load set from cache key=${currentKey} months=${cached.months.length}`);
        }
        return same ? prev : nextSeries;
      });
      chartsSeriesRef.current = buildSeriesFromMonthly(cached.months);
      chartsSourceRef.current = "cache";
      chartsLoadedKeyRef.current = currentKey;
      return;
    }

    let cancelled = false;
    chartsLoadingRef.current = true;
    console.log(`[charts] load start key=${currentKey} source=firestore`);
    const scope: FirestoreTraceScope = beginReadScope("PlayerProfile:charts");

    const loadMonthlyHistory = async () => {
      try {
        const colRef = collection(db, `players/${snapshot.id}/history_monthly`);
        const q = query(colRef, orderBy(documentId(), "desc"), limit(3));
        const snap = await traceGetDocs(scope, { path: colRef.path }, () => getDocs(q));
        const months = snap.docs
          .map((docSnap) => mapMonthlyDocToEntry(docSnap))
          .filter((m): m is MonthlyChartEntry => !!m);
        if (!months.length) {
          removeChartsCache(cacheKey);
          if (!cancelled) {
            const fallbackSeries = buildFallbackCharts(snapshot);
            chartsSeriesRef.current = fallbackSeries;
            chartsSourceRef.current = "fallback";
            chartsLoadedKeyRef.current = currentKey;
            setChartsSeries((prev) => (trendSeriesEqual(prev, fallbackSeries) ? prev : fallbackSeries));
            console.log(`[charts] load done key=${currentKey} months=0 (fallback)`);
          }
          return;
        }

        const series = buildSeriesFromMonthly(months);
        if (!cancelled) {
          chartsSeriesRef.current = series;
          chartsSourceRef.current = "monthly";
          chartsLoadedKeyRef.current = currentKey;
          setChartsSeries((prev) => (trendSeriesEqual(prev, series) ? prev : series));
          saveChartsCache(cacheKey, months);
          console.log(`[charts] load done key=${currentKey} months=${months.length}`);
        }
      } catch (error) {
        if (!cancelled) {
          const fallbackSeries = buildFallbackCharts(snapshot);
          chartsSeriesRef.current = fallbackSeries;
          chartsSourceRef.current = "fallback";
          chartsLoadedKeyRef.current = currentKey;
          setChartsSeries((prev) => (trendSeriesEqual(prev, fallbackSeries) ? prev : fallbackSeries));
          console.log(`[charts] load error key=${currentKey}`, error);
        }
      } finally {
        chartsLoadingRef.current = false;
        endReadScope(scope);
      }
    };

    loadMonthlyHistory();

    return () => {
      cancelled = true;
    };
  }, [tab, snapshot?.id, snapshot?.server]);

  const viewModel = useMemo<PlayerProfileViewModel | null>(
    () => (snapshot ? buildProfileView(snapshot, avatarSnapshot, chartsSeries) : null),
    [snapshot, avatarSnapshot, chartsSeries],
  );

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
          const link = `${window.location.origin}/players/profile/${encodeURIComponent(linkId)}`;
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
      if (action === "rescan") {
        showFeedback("Rescan-Queue folgt aktuell noch Platzhalter.");
        return;
      }
    },
    [navigate, showFeedback, snapshot],
  );

  const renderTabs = () => {
    if (!viewModel) return null;
    switch (tab) {
      case "Statistiken":
        return <StatsTab data={viewModel.stats} />;
      case "Charts":
        return <ChartsTab series={viewModel.charts} />;
      case "Fortschritt":
        return <ProgressTab items={viewModel.progress} />;
      case "Vergleich":
        return <ComparisonTab rows={viewModel.comparison} />;
      case "Historie":
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

      {viewModel && (
        <>
          <HeroPanel data={viewModel.hero} loading={loading} onAction={handleAction} />
          <ActionFeedback message={actionFeedback} />

          <div className="player-profile__tabs" role="tablist" aria-label="Spielerprofil Tabs">
            {TABS.map((entry) => {
              const active = tab === entry;
              return (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`player-profile__tab-button ${active ? "player-profile__tab-button--active" : ""}`}
                  onClick={() => handleTabChange(entry)}
                >
                  {entry}
                </button>
              );
            })}
          </div>

          {renderTabs()}
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

const normalizeServerKey = (server?: string | null) => {
  if (typeof server !== "string") return "unknown";
  const normalized = server.trim().toLowerCase().replace(/\./g, "_");
  return normalized || "unknown";
};

const buildChartsCacheKey = (playerId: string, server?: string | null) =>
  `${CHARTS_CACHE_PREFIX}${normalizeServerKey(server)}:${playerId}`;

const toChartNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const ensurePointCount = (points: number[], desired = 3) => {
  const normalized = points.map((p) => (Number.isFinite(p) ? p : 0));
  if (!normalized.length) normalized.push(0);
  while (normalized.length < desired) normalized.unshift(normalized[0] ?? 0);
  return normalized.slice(-desired);
};

const createChartsSeries = (levelPoints: number[], totalStatsPoints: number[], honorPoints: number[]): TrendSeries[] => [
  { label: "Level Verlauf", points: ensurePointCount(levelPoints), unit: "", subLabel: CHARTS_RANGE_LABEL },
  { label: "Total Stats", points: ensurePointCount(totalStatsPoints), unit: "", subLabel: CHARTS_RANGE_LABEL },
  { label: "Honor", points: ensurePointCount(honorPoints), unit: "", subLabel: CHARTS_RANGE_LABEL },
];

const extractChartMetrics = (values: Record<string, any>): ChartMetricValues => {
  const lookup = buildValueLookup(values || {});
  const level = lookup.number(["level"]);
  const honor = lookup.number(HONOR_VALUE_KEYS);
  const totalStatsDirect = lookup.number(["totalstats", "stats"]);
  let totalStats = totalStatsDirect;

  if (totalStats == null) {
    let sum = 0;
    let count = 0;
    BASE_STAT_CONFIG.forEach((entry) => {
      const val = lookup.number(entry.total) ?? lookup.number(entry.base);
      if (val != null) {
        sum += val;
        count++;
      }
    });
    totalStats = count ? sum : null;
  }

  return { level, totalStats, honor };
};

const buildSeriesFromMonthly = (months: MonthlyChartEntry[]): TrendSeries[] => {
  if (!months.length) return createChartsSeries([], [], []);
  const sorted = [...months].sort((a, b) => a.monthId.localeCompare(b.monthId));
  const levelPoints = sorted.map((m) => toChartNumber(m.values.level));
  const totalStatsPoints = sorted.map((m) => toChartNumber(m.values.totalStats));
  const honorPoints = sorted.map((m) => toChartNumber(m.values.honor));
  return createChartsSeries(levelPoints, totalStatsPoints, honorPoints);
};

const trendSeriesEqual = (a: TrendSeries[] | null, b: TrendSeries[] | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].unit !== b[i].unit || a[i].subLabel !== b[i].subLabel) return false;
    if (a[i].points.length !== b[i].points.length) return false;
    for (let j = 0; j < a[i].points.length; j++) {
      if (a[i].points[j] !== b[i].points[j]) return false;
    }
  }
  return true;
};

const mapMonthlyDocToEntry = (docSnap: any): MonthlyChartEntry | null => {
  const data = (typeof docSnap.data === "function" ? docSnap.data() : {}) as any;
  const values = (data?.values && typeof data.values === "object" ? data.values : {}) as Record<string, any>;
  const monthId = typeof data?.monthId === "string" && data.monthId ? data.monthId : docSnap.id;
  if (!monthId) return null;
  return {
    monthId,
    lastTs: toNum(data?.lastTs ?? data?.lastTimestamp ?? data?.lastTimestampRaw) ?? null,
    values: extractChartMetrics(values),
  };
};

const removeChartsCache = (key: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const loadChartsCache = (key: string): ChartsCachePayload | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChartsCachePayload;
    const isValidSource = parsed?.source === CHARTS_CACHE_SOURCE;
    const hasFreshTimestamps = typeof parsed.fetchedAt === "number" && parsed.version === CHARTS_CACHE_VERSION;
    const isFresh = hasFreshTimestamps && Date.now() - parsed.fetchedAt <= CHARTS_CACHE_TTL_MS;
    const monthsRaw = Array.isArray(parsed.months) ? parsed.months : null;

    if (!isValidSource || !hasFreshTimestamps || !isFresh || !monthsRaw) {
      removeChartsCache(key);
      return null;
    }

    const months: MonthlyChartEntry[] = monthsRaw
      .map((m: any) => {
        if (!m || typeof m.monthId !== "string") return null;
        return {
          monthId: m.monthId,
          lastTs: typeof m.lastTs === "number" ? m.lastTs : null,
          values: {
            level: toNum(m.values?.level) ?? null,
            totalStats: toNum(m.values?.totalStats) ?? null,
            honor: toNum(m.values?.honor) ?? null,
          },
        };
      })
      .filter((m): m is MonthlyChartEntry => !!m);

    if (months.length < 1) {
      removeChartsCache(key);
      return null;
    }

    return { fetchedAt: parsed.fetchedAt, version: parsed.version, source: CHARTS_CACHE_SOURCE, months };
  } catch {
    removeChartsCache(key);
    return null;
  }
};

const saveChartsCache = (key: string, months: MonthlyChartEntry[]) => {
  if (typeof window === "undefined" || months.length < 1) return;
  const payload: ChartsCachePayload = {
    fetchedAt: Date.now(),
    version: CHARTS_CACHE_VERSION,
    source: CHARTS_CACHE_SOURCE,
    months: months.map((m) => ({
      monthId: m.monthId,
      lastTs: m.lastTs,
      values: {
        level: m.values.level ?? null,
        totalStats: m.values.totalStats ?? null,
        honor: m.values.honor ?? null,
      },
    })),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore cache write errors
  }
};

const buildFallbackCharts = (snapshot: PlayerSnapshot): TrendSeries[] => {
  const metrics = extractChartMetrics(snapshot.values || {});
  const values: ChartMetricValues = {
    level: metrics.level ?? snapshot.level ?? null,
    totalStats: metrics.totalStats ?? snapshot.totalStats ?? null,
    honor: metrics.honor ?? null,
  };
  return createChartsSeries(
    [toChartNumber(values.level)],
    [toChartNumber(values.totalStats)],
    [toChartNumber(values.honor)],
  );
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
  const totalBaseStats = hasBaseStats ? Object.values(baseStats).reduce((sum, val) => sum + val, 0) : null;
  const classKey = canonicalize(snapshot.className ?? "");
  const mainAttrKey =
    classKey === "warrior" || classKey === "krieger" || classKey === "berserker" || classKey === "paladin"
      ? "str"
      : classKey === "mage" || classKey === "magier" || classKey === "battlemage" || classKey === "battlemage"
        || classKey === "necromancer" || classKey === "nekromant" || classKey === "druid" || classKey === "druide"
        || classKey === "bard" || classKey === "barde"
        ? "int"
        : classKey === "scout" || classKey === "jaeger" || classKey === "jäger" || classKey === "assassin"
          || classKey === "meuchelmoerder" || classKey === "meuchelmorder"
          || classKey === "demonhunter" || classKey === "daemonenjaeger" || classKey === "dämonenjäger"
          ? "dex"
          : null;
  const baseValue = snapshot.base ?? (mainAttrKey ? baseStats[mainAttrKey] : 0);
  const conValue = snapshot.con ?? baseStats.con ?? 0;
  const calculatedTotalBaseStats = baseValue + conValue;
  const calculatedTotalStats = (snapshot.attributeTotal ?? 0) + (snapshot.conTotal ?? 0);
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
    values?.["Mount %"] ??
    values?.["mount %"] ??
    values?.MountPct ??
    values?.mountPct ??
    values?.MountBonus ??
    values?.mountBonus;
  const mountPercent = toNum(mountPercentRaw) ?? lookup.number(mountPercentKeys);
  const mountPercentFromName = mountName ? toNum((mountName.match(/(\d+)\s*%/) || [])[1]) : null;
  const mountPercentResolved = mountPercent ?? mountPercentFromName;
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

  const heroMetrics = [
    { label: "Last Scan", value: lastScanDisplay },
    { label: "Level", value: level != null ? `Lvl ${formatNumber(level)}` : "-" },
    { label: "Scrapbook", value: formatPercent(scrapbookProgress) },
    { label: "Total Base Stats", value: calculatedTotalBaseStats != null ? formatNumber(calculatedTotalBaseStats) : "-" },
  ];
  const heroBadges = [
    { label: "Mount", value: mountLabel ?? "-", tone: "neutral" as const },
    { label: "Honor", value: formatNumber(honor), tone: "success" as const },
    { label: "Gildenrolle", value: guildRole ?? "-", tone: "warning" as const },
    { label: "HoF", value: hofRank != null ? `#${formatNumber(hofRank)}` : "-", tone: "neutral" as const },
  ];

  const heroBaseStats = hasBaseStats ? baseStats : undefined;

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
  };

  const statsTab = {
    summary: [
      { label: "Power Score", value: formatNumber(powerScore), hint: "Level * SumBase" },
      { label: "Honor", value: formatNumber(honor) },
      { label: "HoF Platz", value: hofRank ? `#${formatNumber(hofRank)}` : "-" },
      { label: "Letzter Scan", value: formatDaysAgo(scanAgeDays) ?? "-" },
    ],
    attributes: baseStatConfig.map((a) => ({
      label: a.label,
      baseLabel: formatNumber(lookup.number(a.base)),
      totalLabel: lookup.number(a.total) != null ? `Gesamt ${formatNumber(lookup.number(a.total))}` : undefined,
    })),
    resistances: [
      { label: "Feuer", value: `${Math.round(rand() * 40 + 40)}%` },
      { label: "Schatten", value: `${Math.round(rand() * 40 + 35)}%` },
      { label: "Frost", value: `${Math.round(rand() * 30 + 30)}%` },
      { label: "Licht", value: `${Math.round(rand() * 20 + 30)}%` },
    ],
    resources: [
      { label: "Gold/h", value: `${formatNumber(Math.round((level ?? 1) * (rand() * 8 + 3)))}k` },
      { label: "XP/h", value: `${formatNumber(Math.round((level ?? 1) * (rand() * 5 + 2)))}k` },
      { label: "Mount Bonus", value: mountLabel },
      { label: "Quest Slots", value: `${Math.round(rand() * 2) + 3}` },
    ],
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

  const charts =
    chartsOverride ??
    createChartsSeries(
      [toChartNumber(level)],
      [toChartNumber(totalStats)],
      [toChartNumber(honor)],
    );

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
