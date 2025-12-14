// src/pages/players/PlayerProfile.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
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
import {
  beginReadScope,
  endReadScope,
  traceGetDoc,
  type FirestoreTraceScope,
} from "../../lib/debug/firestoreReadTrace";
import "./player-profile.css";

const TABS = ["Statistiken", "Charts", "Fortschritt", "Vergleich", "Historie"] as const;
type TabKey = (typeof TABS)[number];

const PROFILE_CACHE_PREFIX = "player-profile-cache:";
const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;

type PlayerSnapshot = {
  id: string;
  name: string;
  className: string | null;
  level: number | null;
  guild: string | null;
  server: string | null;
  avatarIdentifier?: string | null;
  scrapbookPct?: number | null;
  totalStats?: number | null;
  lastScanDays?: number | null;
  values: Record<string, any>;
  portraitConfig?: Partial<PortraitOptions>;
  saveArray?: number[] | null;
  saveString?: string | null;
};

export default function PlayerProfile() {
  const params = useParams<Record<string, string>>();
  const playerId = params.id || params.pid || params.playerId || params.player || "";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [tab, setTab] = useState<TabKey>("Statistiken");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [avatarSnapshot, setAvatarSnapshot] = useState<AvatarSnapshot | null>(null);
  const [, setAvatarLoading] = useState(false);
  const [, setAvatarError] = useState<Error | null>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const getScrollContainer = () => profileRef.current?.parentElement;

  useEffect(() => {
    let cancelled = false;
    const scope: FirestoreTraceScope = beginReadScope("PlayerProfile:load");

    async function load() {
      setLoading(true);
      setErr(null);
      const cacheKey = `${PROFILE_CACHE_PREFIX}${playerId}`;

      const loadFromCache = () => {
        try {
          const raw = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed?.data || typeof parsed.timestamp !== "number") return null;
          const isFresh = Date.now() - parsed.timestamp < PROFILE_CACHE_TTL_MS;
          if (!isFresh) return null;
          return {
            data: parsed.data as PlayerSnapshot,
            timestamp: parsed.timestamp as number,
            version: typeof parsed.version === "number" ? parsed.version : null,
          };
        } catch {
          return null;
        }
      };

      const cached = loadFromCache();
      if (cached) {
        setSnapshot(cached.data);
        endReadScope(scope);
        setLoading(false);
        return;
      }
      try {
        const id = (playerId || "").trim();
        if (!id) throw new Error("Kein Spieler gewählt.");

        const ref = doc(db, `players/${id}/latest/latest`);
        const snap = await traceGetDoc(scope, ref, () => getDoc(ref));
        if (!snap.exists()) throw new Error("Spieler nicht gefunden.");
        const data = snap.data() as any;

        const values = typeof data.values === "object" && data.values ? data.values : {};
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

        const level = toNum(data.level ?? values?.Level) ?? null;
        const className = (data.className ?? values?.Class ?? null) || null;
        const guildName = (data.guildName ?? values?.Guild ?? null) || null;
        const name = data.name ?? values?.Name ?? id;
        const server = data.server ?? values?.Server ?? null;
        const serverNormalized =
          typeof server === "string"
            ? server
                .trim()
                .toLowerCase()
                .replace(/\./g, "_")
            : "";
        const avatarIdentifier =
          data.avatarIdentifier ??
          data.identifier ??
          values?.avatarIdentifier ??
          values?.identifier ??
          (serverNormalized ? `${id}__${serverNormalized}` : null);
        const totalStats = toNum(data.totalStats ?? values?.["Total Stats"]) ?? null;
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
          id,
          name,
          className,
          level,
          guild: guildName,
          server,
          avatarIdentifier,
          scrapbookPct,
          totalStats,
          lastScanDays,
          values,
          portraitConfig,
          saveArray,
          saveString,
        };

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify({
                data: nextSnapshot,
                timestamp: Date.now(),
                version: timestampSeconds ?? null,
              }),
            );
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
  }, [playerId]);

  const handleTabChange = (next: TabKey) => {
    const scroller = getScrollContainer();
    const currentTop = scroller?.scrollTop ?? null;
    setTab(next);
    if (scroller && currentTop != null) {
      requestAnimationFrame(() => {
        scroller.scrollTo({ top: currentTop });
      });
    }
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

  const viewModel = useMemo<PlayerProfileViewModel | null>(
    () => (snapshot ? buildProfileView(snapshot, avatarSnapshot) : null),
    [snapshot, avatarSnapshot]
  );

  const showFeedback = (message: string) => {
    setActionFeedback(message);
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleAction = async (action: HeroActionKey | string) => {
    if (!snapshot) return;

    if (action === "copy-link") {
      if (typeof window !== "undefined" && navigator?.clipboard) {
        const link = `${window.location.origin}/players/profile/${snapshot.id}`;
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
    if (action === "guild" && snapshot.guild) {
      navigate(`/guilds?search=${encodeURIComponent(snapshot.guild)}`);
      return;
    }
    if (action === "rescan") {
      showFeedback("Rescan-Queue folgt – aktuell noch Platzhalter.");
      return;
    }
  };

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
    <ContentShell title="Spielerprofil" subtitle="Charakter, KPIs & Verlauf" centerFramed={false} padded>
      <div className="player-profile" ref={profileRef}>
        {loading && !snapshot && <div className="player-profile__loading">Spielerprofil wird geladen …</div>}

        {!loading && (!snapshot || !viewModel) && renderNotFound()}

        {viewModel && (
          <>
            <HeroPanel
              data={viewModel.hero}
              loading={loading}
              actionFeedback={actionFeedback}
              onAction={handleAction}
            />

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
    </ContentShell>
  );
}

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

const formatNumber = (value?: number | null, fallback = "—") =>
  value == null ? fallback : value.toLocaleString("de-DE");

const formatPercent = (value?: number | null) => {
  if (value == null) return "—";
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

const buildProfileView = (snapshot: PlayerSnapshot, avatarSnapshot?: AvatarSnapshot | null): PlayerProfileViewModel => {
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
  const honorKeys = ["honor", "ehre", "honour", "honorpoints", "ehrepunkte"];
  const hofKeys = ["hofrank", "halloffamerank", "hofposition", "halloffameposition", "hofplatz", "halloffame", "hof"];
  const mountKeys = ["mount", "reittier", "mountname"];
  const mountPercentKeys = ["mountpct", "mountpercent", "mountpercentage", "mountspeed", "mountbonus", "mountvalue"];
  const guildRoleKeys = ["guildrole", "role", "guildrank", "gildenrolle"];

  const level = snapshot.level ?? lookup.number(["level"]);
  const scrapbook = snapshot.scrapbookPct ?? lookup.number(scrapbookKeys);
  const honor = lookup.number(honorKeys);
  const totalStats = snapshot.totalStats ?? lookup.number(["totalstats", "stats"]);

  const baseStatConfig: { key: keyof BaseStatValues; label: string; base: string[]; total: string[] }[] = [
    { key: "str", label: "St??rke", base: ["Base Strength", "St??rke", "basestrength"], total: ["Strength"] },
    { key: "dex", label: "Geschick", base: ["Base Dexterity", "Geschick", "basedexterity"], total: ["Dexterity"] },
    {
      key: "int",
      label: "Intelligenz",
      base: ["Base Intelligence", "Intelligenz", "baseintelligence"],
      total: ["Intelligence"],
    },
    {
      key: "con",
      label: "Konstitution",
      base: ["Base Constitution", "Konstitution", "baseconstitution"],
      total: ["Constitution"],
    },
    { key: "lck", label: "Gl??ck", base: ["Base Luck", "Gl??ck", "baseluck"], total: ["Luck"] },
  ];

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
  let mountLabel = "—";
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

  const heroMetrics = [
    { label: "Last Scan", value: lastScanDisplay },
    { label: "Level", value: level != null ? `Lvl ${formatNumber(level)}` : "-" },
    { label: "Scrapbook", value: formatPercent(scrapbookProgress) },
    { label: "Total Base Stats", value: totalBaseStats != null ? formatNumber(totalBaseStats) : "-" },
  ];
  const heroBadges = [
    { label: "Mount", value: mountLabel ?? "—", tone: "neutral" as const },
    { label: "Honor", value: formatNumber(honor), tone: "success" as const },
    { label: "Gildenrolle", value: guildRole ?? "—", tone: "warning" as const },
    { label: "HoF", value: hofRank != null ? `#${formatNumber(hofRank)}` : "—", tone: "neutral" as const },
  ];

  const heroBaseStats = hasBaseStats ? baseStats : undefined;

  const hero = {
    playerName: snapshot.name,
    className: snapshot.className,
    guild: snapshot.guild,
    server: snapshot.server,
    levelLabel: level ? `Level ${formatNumber(level)}` : undefined,
    lastScanLabel: formatDaysAgo(snapshot.lastScanDays) ?? undefined,
    status: (snapshot.lastScanDays != null && snapshot.lastScanDays <= 2 ? "online" : "offline") as ("online"|"offline"),
    metrics: heroMetrics,
    badges: heroBadges,
    actions: [
      { key: "rescan", label: "Rescan anfordern" },
      { key: "guild", label: "Gilde öffnen", disabled: !snapshot.guild },
      { key: "share", label: "Teilen", title: "System Share Sheet" },
      { key: "copy-link", label: "Link kopieren" },
    ],
    portrait: portrait.hasData ? portrait.config : undefined,
    hasPortrait: portrait.hasData,
    portraitFallbackUrl,
    portraitFallbackLabel,
    baseStats: heroBaseStats,
    totalStats: hasTotalStats ? totalStatsDetail : undefined,
  };

  const statsTab = {
    summary: [
      { label: "Power Score", value: formatNumber(powerScore), hint: "Level * SumBase" },
      { label: "Honor", value: formatNumber(honor) },
      { label: "HoF Platz", value: hofRank ? `#${formatNumber(hofRank)}` : "—" },
      { label: "Letzter Scan", value: formatDaysAgo(snapshot.lastScanDays) ?? "—" },
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
      description: "Gebäudeausbau",
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

  const buildTrend = (base: number | null | undefined, swing = 0.12) => {
    const start = base ?? Math.round(rand() * 100);
    const trend: number[] = [];
    let current = start * 0.85;
    for (let i = 0; i < 8; i++) {
      current += current * (rand() * swing - swing / 2);
      trend.push(Math.max(0, Math.round(current)));
    }
    trend[trend.length - 1] = start;
    return trend;
  };

  const charts = [
    { label: "Level Verlauf", points: buildTrend(level ?? 0, 0.06), unit: "", subLabel: "7 Tage" },
    { label: "Total Stats", points: buildTrend(totalStats ?? 0, 0.18), unit: "", subLabel: "Summe Attribute" },
    { label: "Honor", points: buildTrend(honor ?? 0, 0.25), unit: "", subLabel: "Hall of Fame" },
  ];

  const comparisonRows: import("../../components/player-profile/types").ComparisonRow[] = [
    {
      label: "Level",
      playerValue: level ? `Lvl ${formatNumber(level)}` : "—",
      benchmark: level ? `Lvl ${formatNumber(Math.round(level * 0.92))}` : "—",
      diffLabel: level ? `+${Math.round(level * 0.08)}` : "—",
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
      diffLabel: scrapbookProgress != null ? `+${Math.round(scrapbookProgress - 60)}%` : "—",
      trend: (scrapbookProgress != null && scrapbookProgress >= 80 ? "up" : "neutral"),
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
      trend: "neutral" as ("up"|"down"|"neutral"),
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
