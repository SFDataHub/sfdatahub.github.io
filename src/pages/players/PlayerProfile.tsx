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
  HeroActionKey,
  PlayerProfileViewModel,
  PortraitOptions,
} from "../../components/player-profile/types";
import { db } from "../../lib/firebase";
import "./player-profile.css";

const TABS = ["Statistiken", "Charts", "Fortschritt", "Vergleich", "Historie"] as const;
type TabKey = (typeof TABS)[number];

type PlayerSnapshot = {
  id: string;
  name: string;
  className: string | null;
  level: number | null;
  guild: string | null;
  server: string | null;
  scrapbookPct?: number | null;
  totalStats?: number | null;
  lastScanDays?: number | null;
  values: Record<string, any>;
  portraitConfig?: Partial<PortraitOptions>;
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
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const id = (playerId || "").trim();
        if (!id) throw new Error("Kein Spieler gewählt.");

        const ref = doc(db, `players/${id}/latest/latest`);
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new Error("Spieler nicht gefunden.");
        const data = snap.data() as any;

        const values = typeof data.values === "object" && data.values ? data.values : {};

        const level = toNum(data.level ?? values?.Level) ?? null;
        const className = (data.className ?? values?.Class ?? null) || null;
        const guildName = (data.guildName ?? values?.Guild ?? null) || null;
        const name = data.name ?? values?.Name ?? id;
        const server = data.server ?? values?.Server ?? null;
        const totalStats = toNum(data.totalStats ?? values?.["Total Stats"]) ?? null;
        const scrapbookPct = toNum(values?.["Album"] ?? values?.["Album %"] ?? values?.AlbumPct) ?? null;
        const lastScanDays = daysSince(toNum(data.timestamp));

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
          scrapbookPct,
          totalStats,
          lastScanDays,
          values,
          portraitConfig,
        };

        if (!cancelled) setSnapshot(nextSnapshot);
      } catch (error: any) {
        if (!cancelled) {
          setSnapshot(null);
          setErr(error?.message || "Unbekannter Fehler beim Laden.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    };
  }, []);

  const viewModel = useMemo<PlayerProfileViewModel | null>(
    () => (snapshot ? buildProfileView(snapshot) : null),
    [snapshot]
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
      <div className="player-profile">
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
                    onClick={() => setTab(entry)}
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
  const normalized = String(value).replace(/[^0-9.-]/g, "");
  const num = Number(normalized);
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

const formatPercent = (value?: number | null) =>
  value == null ? "—" : `${Math.round(value)}%`;

const formatDaysAgo = (days?: number | null) => {
  if (days == null) return null;
  if (days === 0) return "heute";
  return `${days} Tag${days === 1 ? "" : "e"} her`;
};

const classToPortraitIndex: Record<string, number> = {
  warrior: 1,
  berserker: 1,
  paladin: 1,
  scout: 5,
  assassin: 5,
  "demon hunter": 6,
  bard: 6,
  mage: 8,
  "battle mage": 8,
  necromancer: 9,
  druid: 9,
};

const buildPortraitConfig = (snapshot: PlayerSnapshot): Partial<PortraitOptions> => {
  if (snapshot.portraitConfig) return snapshot.portraitConfig;
  const seed = createSeededRandom(snapshot.id || snapshot.name);
  const classIndex = classToPortraitIndex[snapshot.className?.toLowerCase() || ""] || Math.floor(seed() * 10) + 1;
  return {
    genderName: seed() > 0.5 ? "female" : "male",
    class: classIndex,
    race: Math.floor(seed() * 8) + 1,
    hair: Math.floor(seed() * 40) + 1,
    hairColor: Math.floor(seed() * 10) + 1,
    mouth: Math.floor(seed() * 20) + 1,
    eyes: Math.floor(seed() * 20) + 1,
    brows: Math.floor(seed() * 10) + 1,
    beard: Math.floor(seed() * 10),
    nose: Math.floor(seed() * 10) + 1,
    ears: Math.floor(seed() * 10) + 1,
    extra: Math.floor(seed() * 10),
    background: seed() > 0.5 ? "gradient" : "retroGradient",
    frame: seed() > 0.8 ? "goldenFrame" : "",
  };
};

const buildProfileView = (snapshot: PlayerSnapshot): PlayerProfileViewModel => {
  const values = snapshot.values || {};
  const lookup = buildValueLookup(values);
  const rand = createSeededRandom(snapshot.id);

  const level = snapshot.level ?? lookup.number(["level"]);
  const scrapbook = snapshot.scrapbookPct ?? lookup.number(["album", "scrapbook", "albumpct"]);
  const honor = lookup.number(["honor", "ehre"]);
  const totalStats = snapshot.totalStats ?? lookup.number(["totalstats", "stats"]);

  const baseStatsKeys = [
    ["Base Strength", "Stärke", "basestrength"],
    ["Base Dexterity", "Geschick", "basedexterity"],
    ["Base Intelligence", "Intelligenz", "baseintelligence"],
    ["Base Constitution", "Konstitution", "baseconstitution"],
    ["Base Luck", "Glück", "baseluck"],
  ];

  const baseStats = baseStatsKeys.map((keys) => lookup.number(keys, 0) ?? 0);
  const sumBase = baseStats.reduce((sum, val) => sum + (val ?? 0), 0);
  const scrapbookProgress = scrapbook ?? Math.round(rand() * 80 + 10);
  const fortress = lookup.number(["fortresslevel", "fortress"]) ?? Math.round(rand() * 20) + 30;
  const underworld = lookup.number(["underworld", "underworldlevel"]) ?? Math.round(rand() * 10) + 20;
  const tower = lookup.number(["tower", "towerfloor"]) ?? Math.round(rand() * 90) + 10;
  const petProgress = lookup.number(["pets", "petprogress"]) ?? Math.round(rand() * 50) + 25;

  const powerScore = (level ?? 0) * 1200 + sumBase + Math.round((scrapbook ?? 0) * 3200);
  const mountLabel = lookup.text(["mount", "reittier"]) ?? "Greifendrachen (280%)";
  const guildRole = lookup.text(["guildrole", "role"]) ?? "Member";
  const hofRank = lookup.number(["hofrank", "halloffamerank", "hofposition"]);

  const heroMetrics = [
    { label: "Level", value: level ? `Lvl ${formatNumber(level)}` : "—" },
    { label: "Power Score", value: formatNumber(powerScore) },
    { label: "Scrapbook", value: formatPercent(scrapbookProgress) },
    { label: "Total Stats", value: formatNumber(totalStats) },
  ];

  const heroBadges = [
    { label: "Mount", value: mountLabel, tone: "neutral" as const },
    { label: "Honor", value: formatNumber(honor), tone: "success" as const },
    { label: "Gildenrolle", value: guildRole, tone: "warning" as const },
    { label: "HoF", value: hofRank ? `#${formatNumber(hofRank)}` : "—", tone: "neutral" as const },
  ];

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
    portrait: buildPortraitConfig(snapshot),
  };

  const attributeLabels = [
    { label: "Stärke", base: ["Base Strength"], total: ["Strength"] },
    { label: "Geschick", base: ["Base Dexterity"], total: ["Dexterity"] },
    { label: "Intelligenz", base: ["Base Intelligence"], total: ["Intelligence"] },
    { label: "Konstitution", base: ["Base Constitution"], total: ["Constitution"] },
    { label: "Glück", base: ["Base Luck"], total: ["Luck"] },
  ];

  const statsTab = {
    summary: [
      { label: "Power Score", value: formatNumber(powerScore), hint: "Level * SumBase" },
      { label: "Honor", value: formatNumber(honor) },
      { label: "HoF Platz", value: hofRank ? `#${formatNumber(hofRank)}` : "—" },
      { label: "Letzter Scan", value: formatDaysAgo(snapshot.lastScanDays) ?? "—" },
    ],
    attributes: attributeLabels.map((a) => ({
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





